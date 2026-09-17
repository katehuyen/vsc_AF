/**
 * ‼️ S-64 — THE CONTEXT DISCIPLINE SIGNAL: telling a RUNNING agent that its
 * window is at the converge line (35%) or the handover line (40%).
 *
 * WHY THIS EXISTS. The handover rule (`_REF/handover.md`) binds a run to two
 * triggers, whichever fires first: the 5-hour quota at 90%, or the context
 * window at 40% (converge at 35%). The agent can probe the quota itself — it is
 * a file on disk. It CANNOT see its own context fill: nothing in a Claude Code
 * session tells the model how full its window is, so the second trigger was a
 * rule with no feedback, which by the constitution's first principle is not a
 * rule. On an unlimited or enterprise plan it would be the ONLY brake.
 *
 * WHAT THIS IS NOT. The measurement is not rewritten here: the last model
 * call's context (`contextAfter`) and the model's window are already read by
 * the Console host (stream), the session index (transcript) and the Codex
 * rollout. This module takes a `read` callback and decides only WHEN to say
 * WHAT, ONCE.
 *
 * THE CHANNEL. Every account's Claude settings carry Agent Farm's live hook
 * (`hooksInstaller.ts`): each tool call POSTs to the listener and prints the
 * answer to stdout. Claude Code reads that stdout as the hook's own output —
 * and a `PostToolUse` (or `UserPromptSubmit`) answer of
 * `{ hookSpecificOutput: { hookEventName, additionalContext } }` puts that text
 * INTO THE MODEL'S CONTEXT before its next step. So the listener that used to
 * answer `{}` to everything can answer with the signal, to exactly the
 * session whose window crossed the line, at the next tool call it makes. No
 * new process, no new file, no polling.
 *
 * ‼️ AN ENGINE WITH NO SUCH CHANNEL IS SAID, NOT FAKED. Codex's hooks carry no
 * `additionalContext`; a crossing on such a session is recorded as
 * `undelivered` with the reason, and the card says the signal did not reach —
 * which is what the rule asks for ("kanalı olmayan motorun kartı sinyalin
 * ulaşmadığını açıkça söyler").
 */
import * as fs from 'fs';
import * as path from 'path';
import { ContextSample, contextPercent } from './consoleproto';
import { parseHandoverName, shortSessionId } from './sessionDiagnosis';

/** The two words the law waits for — `_REF/handover.md` names exactly these. */
export const CONTEXT_CONVERGE_WORD = 'CONTEXT CONVERGE';
export const CONTEXT_HANDOVER_WORD = 'CONTEXT HANDOVER';

export type ContextLevel = 'converge' | 'handover';

export interface ContextThresholds {
    /** start nothing new — 0 = off */
    convergePct: number;
    /** stop and hand over — 0 = off */
    handoverPct: number;
}

/** The law's own figures (`_REF/handover.md`): converge ≥ 35%, hand over ≥ 40%. */
export const DEFAULT_CONTEXT_THRESHOLDS: ContextThresholds = { convergePct: 35, handoverPct: 40 };

/**
 * Both figures clamped to 0..100 and read as integers; a converge line ABOVE
 * the handover line is folded down onto it, because "start nothing new" after
 * "stop" is an order that cannot be followed.
 */
export function normalizeThresholds(t: Partial<ContextThresholds> | undefined): ContextThresholds {
    const n = (v: unknown, dflt: number): number => {
        const x = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : dflt;
        return Math.max(0, Math.min(100, x));
    };
    const handoverPct = n(t?.handoverPct, DEFAULT_CONTEXT_THRESHOLDS.handoverPct);
    let convergePct = n(t?.convergePct, DEFAULT_CONTEXT_THRESHOLDS.convergePct);
    if (handoverPct > 0 && convergePct > handoverPct) { convergePct = handoverPct; }
    return { convergePct, handoverPct };
}

/** Which line a reading has crossed — the higher one wins. */
export function contextLevelFor(pct: number | undefined, t: ContextThresholds): ContextLevel | undefined {
    if (typeof pct !== 'number' || !Number.isFinite(pct)) { return undefined; }
    if (t.handoverPct > 0 && pct >= t.handoverPct) { return 'handover'; }
    if (t.convergePct > 0 && pct >= t.convergePct) { return 'converge'; }
    return undefined;
}

/**
 * The sentence, short and fixed. The first two words are the law's; the rest
 * says what the reader owes and where the procedure is, because a bare
 * `CONTEXT HANDOVER` would send an agent that never read the law nowhere.
 */
export function contextSignalText(level: ContextLevel, pct: number): string {
    return level === 'handover'
        ? `${CONTEXT_HANDOVER_WORD} ${pct}% — your context window is ${pct}% full (handover line reached). `
            + 'Stop here: finish nothing further, commit the clean progress, write the handover note '
            + 'and end the run — the next run continues from the note (_REF/handover.md).'
        : `${CONTEXT_CONVERGE_WORD} ${pct}% — your context window is ${pct}% full (converge line reached). `
            + 'Start nothing new — no new sub-task, no broad reads — finish the atomic step in flight, '
            + 'then hand over (_REF/handover.md).';
}

/** Through what the signal reached the session. */
export type ContextChannel = 'claude-hook' | 'none';

export interface ContextDelivery {
    ts: number;
    pct: number;
    tokens: number;
    window: number;
    channel: ContextChannel;
    /** which hook carried it (`PostToolUse` / `UserPromptSubmit`) */
    via?: string;
}

export interface ContextSignalRecord {
    sessionId: string;
    engine?: string;
    converge?: ContextDelivery;
    handover?: ContextDelivery;
    /** the last reading the guard saw for this session */
    lastPct?: number;
    lastTs?: number;
    lastSource?: string;
    /** a crossing on a session with no channel — said, not delivered */
    undelivered?: { level: ContextLevel; ts: number; pct: number; why: string };
    /** the run handed over after the signal (a handover note names it) */
    handedOver?: { ts: number; note: string };
}

/** What the hook is answered with, for a session that is due a signal. */
export interface ContextSignal {
    level: ContextLevel;
    pct: number;
    text: string;
}

/**
 * Hooks whose stdout Claude Code reads as `additionalContext`. `PreToolUse`
 * and the rest carry other fields; answering them with this shape would be
 * ignored at best and refused at worst, so the guard speaks only on these.
 */
export const CONTEXT_SIGNAL_HOOKS = ['PostToolUse', 'UserPromptSubmit'] as const;

/**
 * The listener's answer to a hook POST. `{}` is what it always answered, and
 * still is for every event and every session that is not due a signal — a
 * body Claude Code parses as "nothing to add". The signal rides in the shape
 * the CLI documents for the two hooks that accept it.
 */
export function hookResponseBody(eventName: string | undefined, signal: ContextSignal | undefined): string {
    if (!signal || !eventName || !(CONTEXT_SIGNAL_HOOKS as readonly string[]).includes(eventName)) { return '{}'; }
    return JSON.stringify({
        hookSpecificOutput: { hookEventName: eventName, additionalContext: signal.text }
    });
}

export interface ContextReadHint {
    engine?: string;
    transcriptPath?: string;
    cwd?: string;
}

export interface ContextGuardDeps {
    thresholds: () => ContextThresholds;
    /** The session's window reading NOW, from whichever source has one (the
     *  live stream, the transcript's last call, the index). Undefined = no
     *  measurement — and no measurement is never a percentage. */
    read: (sessionId: string, hint: ContextReadHint) => ContextSample | undefined;
    /** Which channel this engine's hooks give the guard. Claude's carry
     *  `additionalContext`; a name with none gets `none` and a reason. */
    channelFor: (engine: string | undefined) => { channel: ContextChannel; why?: string };
    /** Records survive a reload here (JSON). Optional so a test stays in memory. */
    storeFile?: string;
    now?: () => number;
}

/** The largest number of sessions the store keeps — a machine that has run
 *  thousands does not need every one of them said again. */
const STORE_CAP = 400;

export class ContextGuard {
    private records = new Map<string, ContextSignalRecord>();
    private saveTimer: NodeJS.Timeout | undefined;

    constructor(private readonly deps: ContextGuardDeps) {
        this.load();
    }

    private now(): number { return this.deps.now ? this.deps.now() : Date.now(); }

    /**
     * ‼️ THE ONE DECISION: at a hook event of THIS session, is a signal due?
     *
     * Once per level per window: the converge sentence goes out the first time
     * the reading is at or above the converge line, the handover sentence the
     * first time it is at or above the handover line — and a reading that has
     * crossed both at once gets the handover sentence alone (the stronger
     * order contains the weaker). A reading that falls back UNDER the converge
     * line afterwards — a compaction, a cleared window — re-arms both, because
     * that is a new window and the rule starts again in it.
     *
     * A session with no channel is recorded (`undelivered`) and answered with
     * nothing: faking a delivery is the one thing worse than none.
     */
    check(sessionId: string, opts: { event?: string; engine?: string; transcriptPath?: string; cwd?: string }): ContextSignal | undefined {
        const id = String(sessionId ?? '').trim();
        if (!id) { return undefined; }
        const t = normalizeThresholds(this.deps.thresholds());
        if (t.convergePct <= 0 && t.handoverPct <= 0) { return undefined; }
        const sample = this.deps.read(id, { engine: opts.engine, transcriptPath: opts.transcriptPath, cwd: opts.cwd });
        const pct = contextPercent(sample);
        if (pct === undefined || !sample) { return undefined; }
        const rec = this.recordFor(id, opts.engine);
        const ts = this.now();
        rec.lastPct = pct; rec.lastTs = ts; rec.lastSource = sample.source;
        // Re-arm: the window emptied (compaction) — a new window, the rule again.
        const floor = t.convergePct > 0 ? t.convergePct : t.handoverPct;
        if ((rec.converge || rec.handover || rec.undelivered) && pct < floor) {
            delete rec.converge; delete rec.handover; delete rec.undelivered; delete rec.handedOver;
        }
        const level = contextLevelFor(pct, t);
        if (!level) { this.save(); return undefined; }
        if (rec[level]) { this.save(); return undefined; }
        const ch = this.deps.channelFor(opts.engine);
        if (ch.channel === 'none') {
            if (!rec.undelivered || rec.undelivered.level !== level) {
                rec.undelivered = { level, ts, pct, why: ch.why ?? 'this engine’s hooks carry no additionalContext' };
            }
            this.save();
            return undefined;
        }
        // The hook must be one the CLI reads additionalContext from; on any
        // other event the crossing waits for the next tool call.
        if (!opts.event || !(CONTEXT_SIGNAL_HOOKS as readonly string[]).includes(opts.event)) { this.save(); return undefined; }
        const delivery: ContextDelivery = {
            ts, pct, tokens: sample.tokens, window: sample.window ?? 0, channel: ch.channel, via: opts.event
        };
        rec[level] = delivery;
        // handover contains converge: a run told to stop was told to start nothing.
        if (level === 'handover' && !rec.converge) { rec.converge = { ...delivery }; }
        this.save();
        return { level, pct, text: contextSignalText(level, pct) };
    }

    /**
     * A handover note that names this session — the loop closed.
     *
     * ‼️ RECORDED EVEN FOR A SESSION THIS GUARD NEVER SPOKE TO. The law has two
     * triggers and only one of them is the window: a run that handed over on
     * the 5-hour quota crossed no line here and would otherwise have no record
     * at all. The fact being kept is "this conversation is closed and its work
     * continues elsewhere", and that is true however it ended — it is what
     * stops a smart retry resuming the conversation the note replaced.
     */
    markHandedOver(sessionId: string, note: string): boolean {
        const id = String(sessionId ?? '').trim();
        if (!id) { return false; }
        const rec = this.recordFor(id, undefined);
        if (rec.handedOver?.note === note) { return true; }
        rec.handedOver = { ts: this.now(), note };
        this.save();
        return true;
    }

    record(sessionId: string): ContextSignalRecord | undefined {
        return this.records.get(String(sessionId ?? '').trim());
    }

    all(): ContextSignalRecord[] {
        return [...this.records.values()].sort((a, b) => (b.lastTs ?? 0) - (a.lastTs ?? 0));
    }

    /** The current thresholds, normalised — what the bridge reports. */
    thresholds(): ContextThresholds { return normalizeThresholds(this.deps.thresholds()); }

    private recordFor(id: string, engine: string | undefined): ContextSignalRecord {
        let rec = this.records.get(id);
        if (!rec) { rec = { sessionId: id }; this.records.set(id, rec); }
        if (engine && !rec.engine) { rec.engine = engine; }
        return rec;
    }

    private load(): void {
        const f = this.deps.storeFile;
        if (!f || !fs.existsSync(f)) { return; }
        try {
            const raw = JSON.parse(fs.readFileSync(f, 'utf8')) as { records?: ContextSignalRecord[] };
            for (const r of raw.records ?? []) {
                if (r && typeof r.sessionId === 'string' && r.sessionId) { this.records.set(r.sessionId, r); }
            }
        } catch { /* a torn store is an empty one */ }
    }

    private save(): void {
        const f = this.deps.storeFile;
        if (!f) { return; }
        if (this.saveTimer) { return; }
        this.saveTimer = setTimeout(() => {
            this.saveTimer = undefined;
            try {
                const records = this.all().slice(0, STORE_CAP);
                fs.mkdirSync(path.dirname(f), { recursive: true });
                fs.writeFileSync(f, JSON.stringify({ records }, null, 1), 'utf8');
            } catch { /* the next event writes again */ }
        }, 250);
        // A test that never yields must not hold the process open.
        if (typeof this.saveTimer.unref === 'function') { this.saveTimer.unref(); }
    }

    /** Write now, for a host that is shutting down. */
    flush(): void {
        if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = undefined; }
        const f = this.deps.storeFile;
        if (!f) { return; }
        try {
            fs.mkdirSync(path.dirname(f), { recursive: true });
            fs.writeFileSync(f, JSON.stringify({ records: this.all().slice(0, STORE_CAP) }, null, 1), 'utf8');
        } catch { /* nothing to do */ }
    }
}

export type ContextSignalState = 'quiet' | 'delivered' | 'undelivered';

/** What a surface says about the signal — the words, derived once. */
export interface ContextSignalView {
    state: ContextSignalState;
    level?: ContextLevel;
    /** SHORTHAND for a dense strip; '' while no line has been crossed. */
    chip: string;
    /** The whole reading, one fact per line (AFTip). */
    lines: string[];
    /** A handover note has named this session. */
    handedOver: boolean;
}

const CHANNEL_LABEL: Record<ContextChannel, string> = {
    'claude-hook': 'Claude live hook',
    none: 'no channel'
};

/**
 * ‼️ S-64 (2/n) — THE SENTENCE A SURFACE SHOWS, BUILT IN ONE PLACE.
 *
 * The Console card and a session's own page answer the same question — "was
 * this run told, and did it obey?" — and a second copy of the answer is a
 * second version of it. The record is data; this is what a reader gets, so
 * the host derives it and every page renders the same words.
 *
 * ‼️ AND AN ENGINE WITH NO CHANNEL SAYS SO IN THE SAME BREATH. A card that
 * draws a percentage past the line and stays silent reads as "told and
 * ignored"; `undelivered` is the one state that must never look like the
 * quiet one.
 *
 * `ago` is the page's own relative-time formatter, passed in so a line carries
 * the page's phrasing rather than a second time format; without it the lines
 * simply carry no "when".
 */
export function contextSignalView(
    rec: ContextSignalRecord | undefined,
    thresholds: ContextThresholds,
    ago?: (ts: number) => string
): ContextSignalView {
    const t = normalizeThresholds(thresholds);
    const when = (ts: number): string => (ago ? ` — ${ago(ts)}` : '');
    const law = `Lines: converge ${t.convergePct > 0 ? t.convergePct + '%' : 'off'} · hand over `
        + `${t.handoverPct > 0 ? t.handoverPct + '%' : 'off'} (agentFarm.contextConvergePct / contextHandoverPct).`;
    const word = (l: ContextLevel): string => (l === 'handover' ? CONTEXT_HANDOVER_WORD : CONTEXT_CONVERGE_WORD);
    // SHORTHAND — the chip sits beside a figure already labelled `ctx`, so the
    // word "CONTEXT" in front of it is a repeat; the panel opens with the law's
    // full wording.
    const chipWord = (l: ContextLevel): string => word(l).replace('CONTEXT ', '');
    const handedOver = !!rec?.handedOver;
    const handedLine = rec?.handedOver
        ? `Handed over: yes${when(rec.handedOver.ts)} — ${rec.handedOver.note}`
        : 'Handed over: not yet — the note that closes this run names it here.';

    const delivery = rec?.handover ?? rec?.converge;
    if (rec && delivery) {
        const level: ContextLevel = rec.handover ? 'handover' : 'converge';
        const lines = [
            `Discipline signal: ${word(level)} ${delivery.pct}% delivered${when(delivery.ts)}, `
                + `through the ${CHANNEL_LABEL[delivery.channel]}${delivery.via ? ` (${delivery.via})` : ''}.`
        ];
        if (level === 'handover' && rec.converge && rec.converge.ts !== rec.handover?.ts) {
            lines.push(`${CONTEXT_CONVERGE_WORD} ${rec.converge.pct}% had gone out earlier${when(rec.converge.ts)}.`);
        }
        if (level === 'converge') {
            lines.push(t.handoverPct > 0
                ? `${CONTEXT_HANDOVER_WORD} ${t.handoverPct}%: not reached — the run may still work, but starts nothing new.`
                : `${CONTEXT_HANDOVER_WORD}: switched off, so nothing will stop this run.`);
        }
        lines.push(handedLine, law);
        return { state: 'delivered', level, chip: chipWord(level), lines, handedOver };
    }

    if (rec?.undelivered) {
        const u = rec.undelivered;
        return {
            state: 'undelivered',
            level: u.level,
            chip: `${chipWord(u.level)} ✕`,
            lines: [
                `Discipline signal: ${word(u.level)} ${u.pct}% — ‼️ NEVER REACHED THIS RUN${when(u.ts)}.`,
                u.why,
                'The reading is here and the sentence is not: this run was not told, so its '
                    + 'silence is not obedience. Watch it yourself, or hand it over by hand.',
                law
            ],
            handedOver
        };
    }

    return {
        state: 'quiet',
        chip: '',
        // A run can hand over on the OTHER trigger — the 5-hour quota — without
        // this line ever being crossed. Saying "nothing sent" and stopping there
        // would read as a run that never handed over at all.
        lines: handedOver
            ? ['Discipline signal: nothing sent — this window never crossed a line.', handedLine, law]
            : ['Discipline signal: nothing sent — no line crossed yet.', law],
        handedOver
    };
}

/**
 * ‼️ THE FRESHEST READING A CLAUDE HOOK CAN GIVE: the transcript the payload
 * itself names. The last assistant line that really went to the model carries
 * the usage of the last call, and `contextAfter` is the one reader of it.
 * Read from the tail — a transcript can be tens of megabytes and the answer
 * is in its last few kilobytes. Returns tokens and the model; the window is
 * the caller's to attach (it knows the model catalogue and the user's
 * override).
 */
export function lastCallFromTranscriptTail(
    tail: string | undefined,
    contextAfter: (usage: unknown) => number
): { tokens: number; model: string } | undefined {
    if (!tail) { return undefined; }
    const lines = tail.split('\n');
    // The first line of a tail read from an offset is almost always torn.
    for (let i = lines.length - 1; i >= 1; i--) {
        const line = lines[i].trim();
        if (!line) { continue; }
        try {
            const row = JSON.parse(line) as { type?: string; message?: { usage?: unknown; model?: string } };
            if (row.type !== 'assistant' || !row.message) { continue; }
            const tokens = contextAfter(row.message.usage);
            if (tokens > 0) { return { tokens, model: String(row.message.model ?? '') }; }
        } catch { /* torn or foreign line */ }
    }
    return undefined;
}

/* ============ THE RUN THAT CONTINUES A HANDED-OVER ONE =================== */

/**
 * ‼️ S-64 (5/n) — A HANDOVER NOTE IS SEEN THE MOMENT IT IS WRITTEN.
 *
 * The guard learns that a run obeyed from the note it wrote, and until now
 * the note was only looked for AFTER the run — by the sentry, at the end of
 * a round. A Console session that handed over by hand (the 5-hour quota, the
 * other trigger) sat on the card as "not yet" for as long as nobody searched.
 * The live hook already sees every Write and Edit the session makes, so the
 * write of a file under the canonical name, by the session that name
 * belongs to, IS the fact — no folder listing needed.
 *
 * Narrow on purpose: only a PostToolUse, only a file tool, only the canonical
 * name, and only when the eight characters in it are THIS session's. A note
 * an agent writes for another session is that session's fact, not this one's.
 */
export function handoverNoteWrittenBy(p: {
    sessionId?: string; event?: string; tool?: string; filePath?: string;
}): string | undefined {
    if (p.event !== 'PostToolUse') { return undefined; }
    const tool = String(p.tool ?? '').trim();
    if (tool !== 'Write' && tool !== 'Edit' && tool !== 'MultiEdit') { return undefined; }
    const file = path.basename(String(p.filePath ?? '').replace(/\\/g, '/'));
    const note = parseHandoverName(file);
    if (!note) { return undefined; }
    const short = shortSessionId(String(p.sessionId ?? ''));
    if (short.length < 8 || note.session !== short) { return undefined; }
    return file;
}

/**
 * ‼️ S-64 (5/n) — THE FIRST MESSAGE OF THE FRESH RUN, WRITTEN BY THE HOST.
 *
 * The law's next step after a handover is a NEW session that starts from the
 * note — and starting it by hand means finding the note's path, recalling the
 * card's setup and typing the same paragraph again. The card knows all three.
 * This is the paragraph; it lands in the composer, not in a spawned process,
 * because the run that hands over on the QUOTA trigger is exactly the one
 * whose account the user may want to change before pressing Send.
 *
 * `note` is the path when the host found it and the bare name when only the
 * live hook saw it; without either, the fresh run is pointed at the transcript
 * through the bridge, as a task's next round is.
 */
export function handoverContinuePrompt(o: { sessionId: string; note?: string; pct?: number }): string {
    const sid = String(o.sessionId ?? '').trim();
    const note = String(o.note ?? '').trim();
    const closed = typeof o.pct === 'number' && o.pct > 0
        ? `reached the context handover line at ${o.pct}% and was closed`
        : 'was handed over and closed';
    const from = note
        ? `Its handover note is ${note} — read it first and continue from where it stops.`
        : `No handover note has been found for it — read what it did with \`af.js sessions.read id=${sid}\` before you start.`;
    return `The session before you (${sid}) ${closed}, so this is a fresh session that continues its work.\n`
        + `${from}\n`
        + 'Follow the handover protocol yourself: work at full capacity below the thresholds, '
        + 'and when a trigger fires, finish the atomic step, commit, write the next note and stop.';
}
