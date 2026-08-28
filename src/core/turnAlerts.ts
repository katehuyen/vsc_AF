/**
 * ‼️ WHOSE TURN IT IS — AND WHICH CONVERSATION SAID SO (U-66).
 *
 * The Live Timeline draws one swim lane per SESSION: three concurrent runs of
 * the `developer` agent are `developer #1/#2/#3`, three rows, three ids. The
 * four alert controls in each row's gutter, however, used to key off the AGENT
 * name — so all three rows showed one setting and clicking any of them changed
 * all three. A page whose entire subject is "several sessions at once" was
 * unable to say anything about one of them.
 *
 * Everything here follows from one decision: **the session is the only
 * identity.** Not the agent name, not the `#2` the label happens to carry
 * today, not the working directory — those are all views of a session, and two
 * of them change while it runs. A preference is `SessionAlertPrefs`, keyed by
 * the canonical `sessionId`, and there is no second layer under it to fall back
 * to.
 *
 * The file also owns the two things the old implementation left unmeasured:
 *
 * - **The sound.** It was `cp.exec('powershell … [console]::beep(…)')` — a
 *   shell string, no callback, no exit code, no timeout, and a `try/catch` that
 *   cannot see an async spawn failure. When it did not play, nothing anywhere
 *   said so. Here every attempt returns a `SoundResult` and the caller can show
 *   it. `exitCode === 0` means THE PLAYER ACCEPTED THE FILE; it is not a claim
 *   that a human heard anything, and nothing in this file pretends otherwise.
 * - **The turn.** "One alert per turn" was a 3-second cooldown, which both
 *   swallows a real second turn that lands quickly and says nothing about the
 *   `Notification`+`Stop` pair that is one turn. A turn KEY is monotonic per
 *   session, so the same turn is one alert however many events announce it.
 */

export const TURN_ALERT_ACTIONS = ['sound', 'focus', 'modal', 'toast'] as const;
export type TurnAlertAction = (typeof TURN_ALERT_ACTIONS)[number];

/** The allowlist, as a question. Anything else the page or an agent sends is
 *  refused by name rather than stored and drawn as a control nobody wrote. */
export function isTurnAlertAction(v: unknown): v is TurnAlertAction {
    return typeof v === 'string' && (TURN_ALERT_ACTIONS as readonly string[]).includes(v);
}

/**
 * The canonical form of a selection: only known actions, each at most once,
 * always in the order the row draws them. Two selections of the same set are
 * therefore the same array, which is what makes "did this change?" answerable.
 */
export function normalizeActions(v: unknown): TurnAlertAction[] {
    const want = new Set<string>();
    if (Array.isArray(v)) {
        for (const a of v) { if (isTurnAlertAction(a)) { want.add(a); } }
    }
    return TURN_ALERT_ACTIONS.filter(a => want.has(a));
}

/**
 * What one session wants when it reaches YOUR TURN.
 *
 * `lastSeenAt` is when the live monitor last had this session on its list —
 * the only honest input to "may this be forgotten?". The old code deleted an
 * override eight seconds after a reload if the session had not reappeared yet,
 * which is a race against the rebuild, not a policy.
 */
export interface SessionAlertPrefs {
    sessionId: string;
    actions: TurnAlertAction[];
    updatedAt: number;
    lastSeenAt: number;
}

export interface TurnAlertStoreDeps {
    /** Raw persisted map (globalState) — anything shaped wrong is dropped. */
    read: () => Record<string, unknown>;
    /** Persist. Calls are serialized and awaited in order by the store. */
    write: (map: Record<string, SessionAlertPrefs>) => Thenable<void> | Promise<void> | void;
    /** Migration marker; 0 = never run. */
    readMigration: () => number;
    writeMigration: (v: number) => Thenable<void> | Promise<void> | void;
    now?: () => number;
}

/** Bump this only when a NEW one-time copy has to happen. */
export const TURN_ALERT_MIGRATION = 1;
/** A preference nobody's session has been seen for this long is stale. */
export const TURN_ALERT_TTL_MS = 30 * 24 * 3600 * 1000;
/** Hard ceiling, newest-seen kept — a map that only ever grows is a leak. */
export const TURN_ALERT_MAX = 300;

export interface AlertSetResult {
    ok: boolean;
    error?: string;
    prefs?: SessionAlertPrefs;
}

export interface AlertRekeyResult {
    ok: boolean;
    /** `conflict` = the target already had its own preference; nothing merged. */
    reason?: 'absent' | 'conflict' | 'same' | 'invalid';
}

/**
 * The in-memory authority. Reads never touch storage; writes are queued so two
 * clicks in the same tick cannot land out of order, and `flush()` is what a
 * test (or a shutdown) awaits.
 */
export class TurnAlertStore {
    private map = new Map<string, SessionAlertPrefs>();
    private queue: Promise<void> = Promise.resolve();
    private readonly now: () => number;

    constructor(private deps: TurnAlertStoreDeps) {
        this.now = deps.now ?? (() => Date.now());
        const raw = deps.read() ?? {};
        for (const [id, v] of Object.entries(raw)) {
            const p = this.sanitize(id, v);
            if (p) { this.map.set(p.sessionId, p); }
        }
    }

    /** One stored record, or nothing. Unknown shapes are not repaired — a
     *  preference we cannot read is a preference we must not act on. */
    private sanitize(id: string, v: unknown): SessionAlertPrefs | undefined {
        const sessionId = String(id ?? '').trim();
        if (!sessionId || !v || typeof v !== 'object') { return undefined; }
        const o = v as Partial<SessionAlertPrefs>;
        const actions = normalizeActions(o.actions);
        if (!actions.length) { return undefined; }
        const t = this.now();
        return {
            sessionId,
            actions,
            updatedAt: typeof o.updatedAt === 'number' && o.updatedAt > 0 ? o.updatedAt : t,
            lastSeenAt: typeof o.lastSeenAt === 'number' && o.lastSeenAt > 0 ? o.lastSeenAt : t
        };
    }

    /** Everything, as a plain object — what the page and the bridge are given. */
    all(): Record<string, SessionAlertPrefs> {
        const out: Record<string, SessionAlertPrefs> = {};
        for (const [id, p] of this.map) { out[id] = { ...p, actions: [...p.actions] }; }
        return out;
    }

    /** ‼️ NO FALLBACK. A session with no record alerts on nothing — that is the
     *  whole point of the change, and a "helpful" default here would put the
     *  agent-wide leak straight back. */
    actionsFor(sessionId: string): TurnAlertAction[] {
        return [...(this.map.get(String(sessionId ?? '').trim())?.actions ?? [])];
    }

    /** Toggle ONE action on ONE session — the message the gutter sends. */
    set(sessionId: string, action: unknown, enabled: boolean): AlertSetResult {
        const id = String(sessionId ?? '').trim();
        if (!id) { return { ok: false, error: 'sessionId is required' }; }
        if (!isTurnAlertAction(action)) {
            return {
                ok: false,
                error: `unknown action ${JSON.stringify(action)} — one of ${TURN_ALERT_ACTIONS.join('|')}`
            };
        }
        const cur = new Set(this.actionsFor(id));
        if (enabled) { cur.add(action); } else { cur.delete(action); }
        return this.replace(id, [...cur]);
    }

    /** Set the whole selection at once (the bridge's `actions` argument). */
    replace(sessionId: string, actions: unknown): AlertSetResult {
        const id = String(sessionId ?? '').trim();
        if (!id) { return { ok: false, error: 'sessionId is required' }; }
        if (actions !== undefined && !Array.isArray(actions)) {
            return { ok: false, error: 'actions must be an array' };
        }
        if (Array.isArray(actions)) {
            const bad = actions.filter(a => !isTurnAlertAction(a));
            if (bad.length) {
                return {
                    ok: false,
                    error: `unknown action(s) ${JSON.stringify(bad)} — one of ${TURN_ALERT_ACTIONS.join('|')}`
                };
            }
        }
        const next = normalizeActions(actions);
        const t = this.now();
        if (!next.length) {
            // An empty selection carries no information now that there is
            // nothing to be silent ABOUT — so it is the absence of a record,
            // not a record saying "muted".
            this.map.delete(id);
            this.persist();
            return { ok: true, prefs: { sessionId: id, actions: [], updatedAt: t, lastSeenAt: t } };
        }
        const prev = this.map.get(id);
        const prefs: SessionAlertPrefs = {
            sessionId: id,
            actions: next,
            updatedAt: t,
            lastSeenAt: prev?.lastSeenAt ?? t
        };
        this.map.set(id, prefs);
        this.persist();
        return { ok: true, prefs: { ...prefs, actions: [...prefs.actions] } };
    }

    /**
     * "These sessions are on the live list right now." Cheap enough to call on
     * every refresh, and it is the only thing that keeps a preference alive.
     */
    seen(sessionIds: Iterable<string>): void {
        const t = this.now();
        let touched = false;
        for (const raw of sessionIds) {
            const p = this.map.get(String(raw ?? '').trim());
            if (p) { p.lastSeenAt = t; touched = true; }
        }
        if (touched) { this.persist(); }
    }

    /**
     * ‼️ THE SAME CONVERSATION UNDER ITS REAL NAME (see LiveMonitor.adopt).
     *
     * A terminal lane starts life as `cli:codex:developer:<ms>` and is re-keyed
     * the moment the transcript reveals the engine's own id. The preference has
     * to travel in that same step or the user's selection belongs to an id that
     * no longer exists. A target that already has its own record is a CONFLICT
     * and is left alone: merging two people's choices on a guess is worse than
     * saying so.
     */
    rekey(from: string, to: string): AlertRekeyResult {
        const a = String(from ?? '').trim();
        const b = String(to ?? '').trim();
        if (!a || !b) { return { ok: false, reason: 'invalid' }; }
        if (a === b) { return { ok: false, reason: 'same' }; }
        const p = this.map.get(a);
        if (!p) { return { ok: false, reason: 'absent' }; }
        if (this.map.has(b)) { return { ok: false, reason: 'conflict' }; }
        this.map.delete(a);
        this.map.set(b, { ...p, sessionId: b, lastSeenAt: this.now() });
        this.persist();
        return { ok: true };
    }

    /** Explicit Clear on the Timeline — the row is gone, so is its preference. */
    forget(sessionId: string): boolean {
        const id = String(sessionId ?? '').trim();
        if (!this.map.has(id)) { return false; }
        this.map.delete(id);
        this.persist();
        return true;
    }

    /**
     * ‼️ THE ONE-TIME COPY FROM THE AGENT-KEYED MAP.
     *
     * Versioned and idempotent: the marker is written whatever the outcome, and
     * the legacy map is never read again at runtime — not as a fallback, not
     * "just in case". Every session of that agent which is live at the moment
     * of the upgrade starts from the agent's old selection, and from the next
     * click onwards the three rows are independent, which is the whole request.
     *
     * A session that already has a record of its own is not overwritten.
     */
    migrateFromAgentDefaults(
        legacy: Record<string, unknown> | undefined,
        liveSessions: { sessionId: string; agentName?: string }[]
    ): { migrated: boolean; copied: number } {
        if ((this.deps.readMigration() ?? 0) >= TURN_ALERT_MIGRATION) {
            return { migrated: false, copied: 0 };
        }
        let copied = 0;
        const t = this.now();
        for (const s of liveSessions ?? []) {
            const id = String(s?.sessionId ?? '').trim();
            if (!id || this.map.has(id)) { continue; }
            // The legacy map was keyed by the agent name, with the raw 8-char
            // session prefix standing in when no agent could be resolved —
            // exactly as the old page wrote it.
            const key = s.agentName || id.slice(0, 8);
            const actions = normalizeActions((legacy ?? {})[key]);
            if (!actions.length) { continue; }
            this.map.set(id, { sessionId: id, actions, updatedAt: t, lastSeenAt: t });
            copied++;
        }
        this.persist();
        void this.deps.writeMigration(TURN_ALERT_MIGRATION);
        return { migrated: true, copied };
    }

    /** Everything queued has hit storage. */
    flush(): Promise<void> {
        return this.queue;
    }

    /** TTL + newest-seen ceiling, applied on the way to storage. */
    private prune(): void {
        const t = this.now();
        for (const [id, p] of [...this.map]) {
            if (t - p.lastSeenAt > TURN_ALERT_TTL_MS) { this.map.delete(id); }
        }
        if (this.map.size <= TURN_ALERT_MAX) { return; }
        const byAge = [...this.map.values()].sort((a, b) => b.lastSeenAt - a.lastSeenAt);
        for (const p of byAge.slice(TURN_ALERT_MAX)) { this.map.delete(p.sessionId); }
    }

    private persist(): void {
        this.prune();
        const snapshot = this.all();
        this.queue = this.queue.then(() => this.deps.write(snapshot)).then(
            () => undefined,
            () => undefined   // a storage failure must not wedge the next write
        );
    }
}

/**
 * ‼️ ONE TURN = ONE ALERT, AND A NEW TURN IS A NEW ALERT.
 *
 * The turn key is `sessionId` + whatever the caller can prove is monotonic for
 * that session (the prompt counter). Both events that announce the end of a
 * turn — the "waiting" `Notification` and the `Stop` right behind it — carry
 * the same key, so the second one is silent. A genuinely new turn one second
 * later has a new key and rings, which the old 3-second cooldown ate.
 */
export class TurnKeyDedupe {
    private seen = new Map<string, { key: string; at: number }>();

    constructor(private max = 500, private now: () => number = () => Date.now()) { }

    /** True when this is a turn we have not announced for this session. */
    shouldFire(sessionId: string, turnKey: string): boolean {
        const id = String(sessionId ?? '').trim();
        if (!id) { return false; }
        const key = String(turnKey ?? '');
        const prev = this.seen.get(id);
        if (prev && prev.key === key) { return false; }
        this.seen.set(id, { key, at: this.now() });
        if (this.seen.size > this.max) {
            const oldest = [...this.seen.entries()].sort((a, b) => a[1].at - b[1].at);
            for (const [k] of oldest.slice(0, this.seen.size - this.max)) { this.seen.delete(k); }
        }
        return true;
    }

    /** Travels with the preference when a lane learns its real id. */
    rekey(from: string, to: string): void {
        const p = this.seen.get(from);
        if (!p) { return; }
        this.seen.delete(from);
        if (!this.seen.has(to)) { this.seen.set(to, p); }
    }

    forget(sessionId: string): void {
        this.seen.delete(sessionId);
    }
}

// ---------------------------------------------------------------- the sound

export interface SoundResult {
    /** Which player ran — `none` when there was nothing to try. */
    backend: string;
    ok: boolean;
    startedAt: number;
    durationMs: number;
    exitCode: number | null;
    stderr: string;
    error?: string;
    timedOut?: boolean;
    /** The file that was handed to the player. */
    asset?: string;
}

export interface SoundCandidate {
    backend: string;
    file: string;
    args: string[];
    /** Passed to the child as env rather than pasted into a command string. */
    env?: Record<string, string>;
    /**
     * ‼️ A-18 — WHAT THIS BACKEND CAN ACTUALLY OPEN, declared beside it.
     *
     * The user may point an alert at a file of their own, and the trap is a
     * page that accepts an `.mp3` over a player that only knows `.wav`: the
     * row says playable, the alert is silence, and nothing anywhere reports an
     * error. `alertVoices.playableOn` answers that question from THIS list, so
     * the promise and the player can never disagree — change one and the other
     * follows.
     */
    formats: readonly string[];
}

/**
 * ‼️ NO SHELL, NO INTERPOLATION, ANYWHERE.
 *
 * The path never enters a command string: on Windows it reaches PowerShell as
 * an environment variable, everywhere else as an `execFile` argument. A folder
 * with a quote, a space or a `;` in its name is therefore not a code-injection
 * question at all, which a `cp.exec` string can never claim.
 */
export function soundCandidates(platform: string, asset: string): SoundCandidate[] {
    if (platform === 'win32') {
        return [
            /**
             * ‼️ A-18 — MediaPlayer FIRST, because SoundPlayer PLAYS ONLY WAV.
             *
             * `SoundPlayer.PlaySync()` was the right answer while there was one
             * asset and it was a `.wav`. It is the wrong one the moment the
             * user points an alert at a file of their own: an `.mp3` handed to
             * it throws, and the alert is silence. `MediaPlayer` is the same
             * Windows install, opens mp3/m4a/wma/wav, and is asynchronous — so
             * this waits on its own `Opened`/`Failed` events rather than
             * blocking, which is what keeps a long sound off the event loop.
             *
             * SoundPlayer stays BEHIND it. `MediaPlayer` lives in
             * PresentationCore, and a stripped or server Windows without WPF
             * would otherwise lose the alert it has today — the fallback costs
             * a failed process and keeps `.wav` working everywhere.
             */
            {
                backend: 'powershell:MediaPlayer',
                file: 'powershell',
                args: [
                    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
                    '-Command',
                    'Add-Type -AssemblyName PresentationCore;'
                    + '$p = New-Object System.Windows.Media.MediaPlayer;'
                    + '$done = $false;'
                    + 'Register-ObjectEvent $p MediaEnded -Action { $global:done = $true } | Out-Null;'
                    + 'Register-ObjectEvent $p MediaFailed -Action { $global:done = $true } | Out-Null;'
                    + '$p.Open([Uri]$env:AF_TURN_SOUND); $p.Play();'
                    + '$t = 0; while (-not $global:done -and $t -lt 100) { Start-Sleep -m 100; $t++ };'
                    + '$p.Close()'
                ],
                env: { AF_TURN_SOUND: asset },
                formats: ['wav', 'mp3', 'm4a', 'wma']
            },
            {
                backend: 'powershell:SoundPlayer',
                file: 'powershell',
                args: [
                    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
                    '-Command', '(New-Object System.Media.SoundPlayer $env:AF_TURN_SOUND).PlaySync()'
                ],
                env: { AF_TURN_SOUND: asset },
                formats: ['wav']
            }
        ];
    }
    if (platform === 'darwin') {
        return [{ backend: 'afplay', file: 'afplay', args: [asset], formats: ['wav', 'mp3', 'm4a', 'aiff', 'aif'] }];
    }
    return [
        { backend: 'paplay', file: 'paplay', args: [asset], formats: ['wav', 'ogg', 'flac'] },
        { backend: 'ffplay', file: 'ffplay', args: ['-nodisp', '-autoexit', '-loglevel', 'quiet', asset], formats: ['wav', 'mp3', 'm4a', 'ogg', 'flac'] },
        { backend: 'aplay', file: 'aplay', args: ['-q', asset], formats: ['wav'] }
    ];
}

export interface PlaySoundDeps {
    platform?: string;
    exists?: (p: string) => boolean;
    /** node's `child_process.execFile`, injectable so a test never makes noise. */
    execFile?: (
        file: string,
        args: string[],
        opts: { timeout: number; windowsHide: boolean; env?: NodeJS.ProcessEnv },
        cb: (err: (Error & { code?: number | string; killed?: boolean }) | null,
             stdout: string, stderr: string) => void
    ) => unknown;
    now?: () => number;
    timeoutMs?: number;
}

/**
 * Play the alert once and SAY WHAT HAPPENED.
 *
 * Candidates are tried in order and the first one that exits 0 wins; a player
 * that is not installed (`ENOENT`) is not a failure of the alert, it is the
 * reason to try the next one. What comes back is the last attempt's whole
 * story — backend, exit code, stderr, whether it was killed on the timeout —
 * because the only bug this file was written for was one that reported nothing.
 */
export async function playTurnSound(asset: string, deps: PlaySoundDeps = {}): Promise<SoundResult> {
    const platform = deps.platform ?? process.platform;
    const now = deps.now ?? (() => Date.now());
    const timeout = deps.timeoutMs ?? 8000;
    const startedAt = now();
    const exists = deps.exists ?? ((p: string) => {
        try { return require('fs').existsSync(p); } catch { return false; }
    });
    const base = (backend: string): SoundResult => ({
        backend, ok: false, startedAt, durationMs: now() - startedAt,
        exitCode: null, stderr: '', asset
    });
    if (!asset || !exists(asset)) {
        return { ...base('none'), error: `alert sound asset is missing: ${asset || '(unset)'}` };
    }
    const execFile = deps.execFile
        ?? (require('child_process') as typeof import('child_process')).execFile;
    const candidates = soundCandidates(platform, asset);
    if (!candidates.length) {
        return { ...base('none'), error: `no sound backend known for platform ${platform}` };
    }
    let last: SoundResult = base('none');
    for (const c of candidates) {
        last = await new Promise<SoundResult>(resolve => {
            let settled = false;
            const done = (r: SoundResult): void => {
                if (settled) { return; }
                settled = true;
                resolve(r);
            };
            try {
                execFile(
                    c.file, c.args,
                    {
                        timeout, windowsHide: true,
                        env: c.env ? { ...process.env, ...c.env } : undefined
                    },
                    (err, _stdout, stderr) => {
                        const r = base(c.backend);
                        r.durationMs = now() - startedAt;
                        r.stderr = String(stderr ?? '').trim().slice(0, 500);
                        if (!err) {
                            r.ok = true;
                            r.exitCode = 0;
                            return done(r);
                        }
                        r.exitCode = typeof err.code === 'number' ? err.code : null;
                        r.error = String(err.message ?? err).slice(0, 500);
                        // node reports a timeout kill as `killed`, with no code.
                        if (err.killed) { r.timedOut = true; r.error = `timed out after ${timeout} ms`; }
                        done(r);
                    }
                );
            } catch (e) {
                const r = base(c.backend);
                r.durationMs = now() - startedAt;
                r.error = String((e as Error)?.message ?? e).slice(0, 500);
                done(r);
            }
        });
        if (last.ok) { return last; }
    }
    return last;
}

// ------------------------------------------------------------- the dispatch

export interface TurnAlertBranch {
    action: TurnAlertAction;
    status: 'ok' | 'failed' | 'skipped';
    ms: number;
    detail?: string;
    sound?: SoundResult;
}

export interface TurnAlertRunners {
    sound: () => Promise<SoundResult>;
    focus: () => void | Promise<void>;
    modal: () => void | Promise<void>;
    toast: () => void | Promise<void>;
}

/**
 * ‼️ FOUR INDEPENDENT BRANCHES. One throwing must not cancel the next — the
 * whole reported symptom was "the sound is dead", and the answer to that is
 * that focus, modal and toast still ran, plus a result that names which branch
 * failed and why. Selected actions are attempted; the rest are reported as
 * `skipped` rather than omitted, so the test surface shows all four.
 */
export async function runTurnAlerts(
    actions: TurnAlertAction[],
    runners: TurnAlertRunners,
    now: () => number = () => Date.now()
): Promise<TurnAlertBranch[]> {
    const want = new Set(normalizeActions(actions));
    const one = async (action: TurnAlertAction): Promise<TurnAlertBranch> => {
        const t0 = now();
        if (!want.has(action)) { return { action, status: 'skipped', ms: 0 }; }
        try {
            if (action === 'sound') {
                const sound = await runners.sound();
                return {
                    action, sound, ms: now() - t0,
                    status: sound.ok ? 'ok' : 'failed',
                    detail: sound.ok
                        // ‼️ Exactly as much as an exit code proves, and no more.
                        ? `${sound.backend} accepted the file (exit 0) — audible playback still needs a human ear`
                        : (sound.error || `${sound.backend} exited ${sound.exitCode}`)
                };
            }
            await runners[action]();
            return { action, status: 'ok', ms: now() - t0 };
        } catch (e) {
            return {
                action, status: 'failed', ms: now() - t0,
                detail: String((e as Error)?.message ?? e).slice(0, 300)
            };
        }
    };
    const settled = await Promise.all(TURN_ALERT_ACTIONS.map(one));
    return settled;
}

/**
 * A once-per-interval gate for the failure toast: a sound backend that is
 * broken is broken on every turn, and four agents finishing together must not
 * produce four identical complaints.
 */
export class RateLimit {
    /** Never fired yet — not "fired at epoch zero", which would eat the first. */
    private last: number | undefined;
    constructor(private everyMs = 10 * 60_000, private now: () => number = () => Date.now()) { }
    allow(): boolean {
        const t = this.now();
        if (this.last !== undefined && t - this.last < this.everyMs) { return false; }
        this.last = t;
        return true;
    }
}
