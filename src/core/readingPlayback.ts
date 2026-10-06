/**
 * U-198 — ONE READING, PLAYED: the two engines behind `DialogueSpeaker`.
 *
 * - `persistentPlayback` (Windows): one long-lived SAPI player per reading
 *   (`READING_PLAYER_SCRIPT`) — pauses mid-sentence, says the word it is on.
 * - `stepwisePlayback` (macOS, Linux, and Windows when the player cannot
 *   start): each paragraph is one run of the platform's one-shot player.
 *   Pause and rate restart the paragraph; the position is the paragraph only
 *   (`live: false`).
 *
 * Both answer the same `Playback`, so the channel, the bridge and the commands
 * never ask which one is running. Processes are injected: a test never speaks.
 */
import type { SpeakConfig } from './speech';
import type { SoundResult } from './turnAlerts';
import {
    clampRate, parsePlayerLine, PLAYER_SEP, PlayState, READING_PLAYER_SCRIPT, ReadingAction, stepTarget
} from './readingPlayer';

/** `early`: the player never got as far as speaking — the caller tries the one-shot path instead. */
export type PlaybackResult = SoundResult & { early?: boolean };

export interface Playback {
    readonly done: Promise<PlaybackResult>;
    state(): PlayState;
    act(action: ReadingAction): boolean;
    setRate(rate: unknown): boolean;
    kill(): void;
}

/** A spawned child as the player needs it — node's ChildProcess, or a test's stand-in. */
export interface PlayerChild {
    stdin?: { write(s: string): unknown } | null;
    stdout?: { on(ev: 'data', f: (d: unknown) => void): unknown } | null;
    stderr?: { on(ev: 'data', f: (d: unknown) => void): unknown } | null;
    on(ev: 'exit' | 'error', f: (x: never) => void): unknown;
    kill(): unknown;
}
export type SpawnFn = (file: string, args: string[], opts: {
    env: NodeJS.ProcessEnv; windowsHide: boolean; stdio: ['pipe', 'pipe', 'pipe'];
}) => PlayerChild;

interface Common {
    now: () => number;
    base: (backend: string) => SoundResult;
    /** A change a surface draws: started, paused, resumed, another paragraph, another rate — never every word. */
    onChange?: () => void;
}

const PLAYER_CODES: Record<number, string> = {
    4: 'there was nothing to say',
    5: 'no installed voice matched that name — `alerts.speak` lists what this machine has'
};
/** No word for this long while not paused is a hung player, not a slow voice (the slowest measured rate says a word a second). */
export const STALL_MS = 60_000;
/** ⏮ on the paragraph-by-paragraph path: past this, restart the paragraph rather than go back one. */
const PREV_RESTARTS_AFTER_MS = 3_000;

export function persistentPlayback(
    paras: readonly string[], cfg: SpeakConfig,
    deps: Common & { spawn: SpawnFn; stallMs?: number; tickMs?: number }
): Playback | null {
    let child: PlayerChild;
    try {
        child = deps.spawn('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', READING_PLAYER_SCRIPT], {
            env: {
                ...process.env, AF_SPEAK_TEXT: paras.join(PLAYER_SEP), AF_SPEAK_VOICE: cfg.voice,
                AF_SPEAK_RATE: String(cfg.rate), AF_SPEAK_VOLUME: String(cfg.volume)
            },
            windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']
        });
    } catch { return null; }
    const changed = () => { try { deps.onChange?.(); } catch { /* a surface never stops a reading */ } };
    const st: PlayState = { paragraph: 0, paragraphs: paras.length, sentence: 0, word: 0, wordLen: 0, paused: false, rate: cfg.rate, live: true };
    let ready = false, ended = false, cut = false, stalled = false, stderr = '', buf = '';
    let heard = deps.now();
    const send = (line: string): boolean => {
        if (ended) { return false; }
        try { child.stdin?.write(line + '\n'); return true; } catch { return false; }
    };
    child.stdout?.on('data', d => {
        buf += String(d);
        for (let i = buf.indexOf('\n'); i >= 0; i = buf.indexOf('\n')) {
            const e = parsePlayerLine(buf.slice(0, i));
            buf = buf.slice(i + 1);
            if (!e) { continue; }
            if (e.kind === 'ready') { ready = true; heard = deps.now(); changed(); }
            if (e.kind === 'at') {
                heard = deps.now();
                const moved = e.paragraph !== st.paragraph;
                Object.assign(st, { paragraph: e.paragraph, sentence: e.sentence, word: e.word, wordLen: e.wordLen });
                if (moved) { changed(); }
            }
            if (e.kind === 'paused' || e.kind === 'resumed') { st.paused = e.kind === 'paused'; heard = deps.now(); changed(); }
            if (e.kind === 'rate') { st.rate = e.rate; changed(); }
        }
    });
    child.stderr?.on('data', d => { stderr = (stderr + String(d)).slice(-500); });
    const tick = setInterval(() => {
        if (!st.paused && deps.now() - heard > (deps.stallMs ?? STALL_MS)) { stalled = true; try { child.kill(); } catch { /* gone */ } }
    }, deps.tickMs ?? 1000);
    (tick as { unref?: () => void }).unref?.();
    const done = new Promise<PlaybackResult>(resolve => {
        const finish = (code: number | null, err?: Error & { code?: string }) => {
            if (ended) { return; }
            ended = true;
            clearInterval(tick);
            const r: PlaybackResult = { ...deps.base('sapi:player'), exitCode: code, stderr: stderr.trim() };
            if (cut) { r.skipped = 'stopped'; } else if (stalled) {
                r.timedOut = true; r.error = `the player said nothing for ${deps.stallMs ?? STALL_MS} ms and was ended`;
            } else if (code === 0 && !err) { r.ok = true; } else {
                r.error = err ? String(err.message) : (code !== null && PLAYER_CODES[code]) || `the player exited with code ${code}`;
                r.early = !ready && code !== 4 && code !== 5;
                if (err?.code === 'ENOENT') { r.missing = true; }
            }
            resolve(r);
        };
        child.on('exit', ((code: number | null) => finish(code)) as (x: never) => void);
        child.on('error', ((e: Error & { code?: string }) => finish(null, e)) as (x: never) => void);
    });
    return {
        done,
        state: () => ({ ...st }),
        act: action => {
            if (ended) { return false; }
            const a = action === 'toggle' ? (st.paused ? 'resume' : 'pause') : action;
            if (a === 'pause' || a === 'resume') {
                st.paused = a === 'pause';
                heard = deps.now();
                return send(a);
            }
            const to = stepTarget(st, a);
            if (to === null) { return false; }
            Object.assign(st, { paragraph: to, sentence: 0, word: 0, wordLen: 0 });
            changed();
            return send(`goto ${to} 0`);
        },
        setRate: rate => {
            const r = clampRate(rate);
            return r !== null && send(`rate ${r}`);
        },
        kill: () => { cut = true; try { child.kill(); } catch { /* gone */ } }
    };
}

export function stepwisePlayback(
    paras: readonly string[], cfg: SpeakConfig,
    deps: Common & {
        /** One paragraph through the platform's one-shot players; `onSpawn` hands over the process. */
        oneShot: (text: string, cfg: SpeakConfig, onSpawn: (c: unknown) => void) => Promise<SoundResult>;
        kill: (c: unknown) => void;
    }
): Playback {
    const changed = () => { try { deps.onChange?.(); } catch { /* a surface never stops a reading */ } };
    const st: PlayState = { paragraph: 0, paragraphs: paras.length, sentence: 0, word: 0, wordLen: 0, paused: false, rate: cfg.rate, live: false };
    let child: unknown = null, cut = false, stopped = false, ended = false, since = deps.now();
    let wake: (() => void) | null = null;
    const interrupt = () => { cut = true; const c = child; child = null; if (c) { deps.kill(c); } };
    const done = (async (): Promise<PlaybackResult> => {
        let last: SoundResult = deps.base('none');
        try {
            while (st.paragraph < paras.length && !stopped) {
                if (st.paused) { await new Promise<void>(r => { wake = r; }); continue; }
                cut = false;
                since = deps.now();
                const i = st.paragraph;
                last = await deps.oneShot(paras[i], { ...cfg, rate: st.rate }, c => {
                    if (cut || stopped) { deps.kill(c); } else { child = c; }
                });
                child = null;
                if (stopped || cut) { continue; }
                if (!last.ok) { return last; }
                st.paragraph = i + 1;
                if (st.paragraph < paras.length) { changed(); }
            }
            return stopped ? { ...last, ok: false, skipped: 'stopped' } : { ...last, ok: true };
        } finally { ended = true; }
    })();
    return {
        done,
        state: () => ({ ...st }),
        act: action => {
            if (ended || stopped) { return false; }
            const a = action === 'toggle' ? (st.paused ? 'resume' : 'pause') : action;
            if (a === 'pause') { if (!st.paused) { st.paused = true; interrupt(); changed(); } return true; }
            if (a === 'resume') { if (st.paused) { st.paused = false; changed(); wake?.(); } return true; }
            const to = stepTarget({ ...st, sentence: deps.now() - since > PREV_RESTARTS_AFTER_MS ? 1 : 0 }, a);
            if (to === null) { return false; }
            st.paragraph = to;
            interrupt();
            changed();
            return true;
        },
        setRate: rate => {
            const r = clampRate(rate);
            if (r === null || ended || stopped) { return false; }
            st.rate = r;
            if (!st.paused) { interrupt(); }
            changed();
            return true;
        },
        kill: () => { stopped = true; interrupt(); wake?.(); }
    };
}
