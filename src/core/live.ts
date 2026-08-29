import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import * as vscode from 'vscode';
import { FIRST_PROMPT_MAX } from './sessions';
import { truncate } from './util';
import type { AlertEvent } from './alertVoices';

export type LiveStatus =
    | 'working'            // processing a prompt
    | 'tool'               // executing a tool right now
    | 'waiting-permission' // blocked on a permission dialog
    | 'waiting-input'      // turn done, waiting for the user
    | 'stalled'            // was working, but no events for too long
    | 'idle'
    | 'ended';

export interface LiveSession {
    sessionId: string;
    transcriptPath?: string;
    cwd?: string;
    agentId?: string;
    agentName?: string;
    /** External CLI id (gemini/codex/…), derived from the `cli:<id>:` session_id namespace. */
    source?: string;
    status: LiveStatus;
    currentTool?: string;
    firstPrompt?: string;
    /**
     * The last prompt CUT TO A ROW (90 chars) — what a card or a strip draws,
     * where the line is the whole space there is.
     */
    lastPrompt?: string;
    /**
     * ‼️ The same prompt WHOLE — what a hover panel carries.
     *
     * A card cuts the line and hands the rest to an AFTip; an AFTip handed the
     * same 90 characters is a panel that answers nothing, which is the whole
     * reason the panel is there. Capped at FIRST_PROMPT_MAX like the opening
     * prompt beside it, so both ends of a conversation are readable to the
     * same depth and neither can grow without bound.
     */
    lastPromptFull?: string;
    startedAt: number;
    lastEventTs: number;
    prompts: number;
    toolCalls: number;
    errors: number;
    compactions: number;
    subagentStops: number;
    notifiedStuck: boolean;
    /**
     * ‼️ S-43 — HELD BACK: this looks like the daemon's pre-warmed spare worker
     * and it has never done a thing.
     *
     * Claude Code keeps an idle worker ready so a `claude` you type starts
     * instantly, and that worker fires SessionStart exactly like a person's
     * session does. Tracked, never drawn: `sessions()` leaves it out, so no
     * card appears, nothing is written to the lane, and "End session" is not
     * offered for a process that would simply be bred again. It is not a
     * verdict taken once — see `settleSpares`; a session that submits a prompt
     * is released and never held again, because that is the daemon handing its
     * spare over to a real conversation.
     */
    spare?: boolean;
    /** Which Agent Farm builds watched this session, oldest first — see `af` on
     *  LiveEvent. Usually one; more than one means the extension was updated (or
     *  rolled back) while the session was still running, which is exactly the
     *  case a version comparison must not average over. */
    afVersions?: string[];
}

export type LiveEventKind =
    | 'start' | 'prompt' | 'toolStart' | 'toolEnd' | 'permission'
    // ‼️ U-78 — `say` is HALF THE CONVERSATION, and it was the missing half.
    // Every other kind here is something that HAPPENED to a session; this is
    // the agent answering, which is what a reader hovering a turn came for.
    // Without it the Live Timeline could show what was asked and never what
    // was said back — a transcript with one speaker in it.
    | 'say'
    | 'notify' | 'stop' | 'subagent' | 'compact' | 'end';

export interface LiveEvent {
    ts: number;
    sessionId: string;
    agentId?: string;
    agentName?: string;
    kind: LiveEventKind;
    tool?: string;
    detail?: string;
    transcriptPath?: string;
    /**
     * ‼️ WHICH AGENT FARM BUILD SAW THIS EVENT.
     *
     * The store is the only durable record of what the watcher itself was doing,
     * and it did not say which watcher. So "capture got worse in 3.58" could
     * only ever be argued from the INSTALL TIMESTAMPS of extension folders —
     * indirect evidence about a claim that is directly measurable. Now it is on
     * the line: any two ranges of this file can be compared per version without
     * reconstructing anything.
     *
     * A stamp per event and not per file, because a file is appended to across
     * upgrades — and it is the boundary inside a day that the comparison needs.
     * Absent on lines written before this existed; that absence is honest and is
     * never filled in with a guess.
     */
    af?: string;
    /**
     * ‼️ WHICH ENGINE, WHEN THE ID CANNOT SAY (X-35).
     *
     * `cliSourceOf` reads the engine out of a `cli:<engine>:…` id, which works
     * for a session opened in a TERMINAL because Agent Farm minted that id. A
     * session hosted in the Console is named by the ENGINE — Codex hands back a
     * plain UUID thread id, Antigravity a conversation id — so the namespace
     * trick has nothing to read, and every hosted Codex and Antigravity lane on
     * this page was drawn as though it were Claude. Written on the event so a
     * window reload restores it (`rebuildSessions` has only the store to read).
     */
    engine?: string;
}

export type ListenerState = 'listening' | 'disabled' | 'port-in-use' | 'error';

interface HookPayload {
    session_id?: string;
    transcript_path?: string;
    cwd?: string;
    hook_event_name?: string;
    tool_name?: string;
    tool_input?: Record<string, unknown>;
    tool_response?: unknown;
    prompt?: string;
    message?: string;
    trigger?: string;
    source?: string;
    reason?: string;
    /**
     * ‼️ NOT `source` — see LiveEvent.engine. Claude's own hook payloads carry
     * `source` with a completely different meaning (`startup` / `resume` /
     * `clear`), so the engine gets a field of its own that only Agent Farm's own
     * mirrors ever set. A real hook from a real CLI never fills it in.
     */
    engine?: string;
}

export interface LiveConfig {
    enabled: boolean;
    port: number;
    stuckThresholdMs: number;
    notifyPermission: boolean;
    notifyStuck: boolean;
    notifyTurnEnd: boolean;
    /** B4: forward notifications to an external webhook (n8n → Telegram etc.). */
    forward?: (type: string, message: string) => void;
    /**
     * Fires once when a session crosses INTO 'waiting-input' (turn done / YOUR
     * TURN). The host decides which per-agent actions (sound/focus/modal/toast)
     * to run — see the swim-lane toggles in the timeline panel.
     *
     * ‼️ A-18 — THE NARROW VIEW OF `onAttention`, and there is only ONE emit
     * site behind both. Kept because "the turn ended" is a different question
     * from "the session wants you", and a subscriber that only cares about the
     * first should not have to filter. **Wire one or the other, never both:**
     * the extension listens on `onAttention`, and a host that arms this as well
     * would alert twice on the same edge.
     */
    onTurnReady?: (s: LiveSession) => void;
    /**
     * ‼️ A-18 — EVERY EDGE THAT WANTS THE USER, WITH WHICH KIND OF WANTING.
     *
     * The farm could only say "your turn". Away from the screen that is the
     * wrong half of the news: the session that stopped to ASK you something is
     * the one worth walking back for, and it made the same noise as one that
     * simply finished. The event travels with the edge so the host can choose a
     * different sound per kind (`alertVoices.resolveVoice`) rather than
     * rediscovering what happened from a status it was handed too late.
     *
     * Once per edge, exactly as `onTurnReady` has always been — a session
     * PARKED in a state must not keep ringing.
     *
     * ‼️ A-26 — `said` IS WHAT THE TURN ENDED WITH, and it rides here rather
     * than on a second callback ON PURPOSE. Reading a turn out loud needs the
     * same edge the alert needs; arming `onTurnReady` for it would have put two
     * subscribers on one emit site, which is exactly what the note above
     * forbids. It carries only on the edges that HAVE a last word
     * (`turn-ready`, `ended`) and is already cut to `SAID` at its source —
     * a length `DIALOGUE_MAX` is deliberately equal to, so the reader never
     * cuts a second time. Undefined means the edge said nothing, not silence.
     */
    onAttention?: (s: LiveSession, event: AlertEvent, said?: string) => void;
    /**
     * ‼️ A-18 — IS THIS SESSION'S TURN PARKED ON A QUESTION? `waiting-input`
     * means two different things: a turn that ended, and a turn still open that
     * is waiting for an answer. Only the host knows which — a hosted
     * conversation's `pendingAsk` lives in the console, not here — so it is
     * injected exactly like `spareOf`, and this module keeps its promise never
     * to reach outside itself. Absent means "turn ended", which is the old
     * behaviour precisely.
     */
    pendingAskOf?: (sessionId: string) => boolean;
    /**
     * ‼️ S-43 — what the CLI's own session registry says about an id: `true` a
     * daemon spare / background worker, `false` somebody's session, `undefined`
     * it has not written the file yet.
     *
     * Injected rather than read here: this module never touches a disk, so a
     * test drives the filter by handing it a function. Absent (any other engine,
     * any test that does not care) means nothing is ever held — which is the
     * old behaviour exactly, so Codex, Gemini and Antigravity cannot regress.
     */
    spareOf?: (sessionId: string) => boolean | undefined;
}

// Detail views (≤8h) render from memory; longer ranges are bucketed from the
// on-disk store, so memory only needs to cover the largest detail window.
const MEMORY_WINDOW_MS = 24 * 3600 * 1000;
const MEMORY_MAX_EVENTS = 30_000;
// The JSONL store keeps a month of history for the density views.
const STORE_RETENTION_MS = 31 * 24 * 3600 * 1000;
const STORE_MAX_BYTES = 64 * 1024 * 1024;
const SESSION_TTL_MS = 3 * 3600 * 1000;

/** Per-lane density counts for long timeline ranges: [tools, prompts, alerts, other]. */
export interface DensityLane {
    name: string;
    buckets: [number, number, number, number][];
}

export interface DensityData {
    from: number;
    to: number;
    bucketMs: number;
    lanes: DensityLane[];
    totalEvents: number;
}

/** What one Agent Farm build saw — see `versionSpans`. */
export interface VersionSpan {
    /** Empty for lines written before the stamp existed. */
    version: string;
    from: number;
    to: number;
    events: number;
    sessions: number;
    /** Time inside gaps short enough to count as one working stretch — the
     *  denominator that makes two versions comparable. */
    activeMs: number;
    kinds: Record<string, number>;
}

/** Two events further apart than this were not the same stretch of work, so the
 *  gap between them is not time this version was watching anything. Ten minutes:
 *  long enough to cover a slow tool call, short enough that an overnight pause
 *  cannot be counted as activity. */
const ACTIVE_GAP_MS = 10 * 60 * 1000;

/**
 * E2a: sessions opened via "Start Session With…" use namespaced ids
 * (`cli:<cliId>:<agentId>:<ts>`) so they can never collide with claude's UUID
 * session ids. The CLI id is derived from the namespace — claude payloads carry
 * `source` with a different meaning (startup/resume/clear), so it is not used.
 */
export function cliSourceOf(sessionId: string): string | undefined {
    return sessionId.startsWith('cli:') ? (sessionId.split(':')[1] || undefined) : undefined;
}

function toolDetail(input: Record<string, unknown> | undefined): string {
    if (!input) { return ''; }
    const cand = input['file_path'] ?? input['command'] ?? input['description'] ??
        input['pattern'] ?? input['query'] ?? input['url'] ?? input['prompt'] ?? '';
    return truncate(String(cand), SAID);
}

/**
 * ‼️ U-67 — HOW MUCH OF WHAT WAS SAID IS KEPT.
 *
 * Ninety characters is a ROW's worth: enough to tell two events apart in a
 * table and not enough to read. The Live Timeline's points are hovered to find
 * out what actually happened at that moment — the prompt that was sent, the
 * command that ran, what it answered — and a panel that can scroll has no use
 * for a sentence cut mid-word. The store is one line of JSON per event and is
 * already capped and pruned by count, so the cost of this is a few hundred
 * bytes on the events a person actually reads.
 *
 * The session's OWN `lastPrompt` stays short: it is drawn on cards and in
 * strips, where the row is the whole space there is.
 */
const SAID = 1200;

/**
 * What a tool ANSWERED, in one readable line or two.
 *
 * A tool response is whatever the engine put in it — a string, a file, an
 * object with a flag — so this asks the fields that actually carry the answer
 * in the order they mean something, and falls back to the shape itself rather
 * than to silence. A failure says so first: "it ran" and "it worked" are
 * different facts and the point on the chart only ever showed the first.
 */
function toolResult(resp: unknown): string {
    if (resp === undefined || resp === null || resp === '') { return ''; }
    if (typeof resp === 'string') { return truncate(resp, SAID); }
    if (typeof resp !== 'object') { return truncate(String(resp), SAID); }
    const r = resp as Record<string, unknown>;
    const err = r['error'] ?? r['stderr'] ?? (r['success'] === false ? 'the tool reported failure' : '');
    const body = r['stdout'] ?? r['output'] ?? r['content'] ?? r['result'] ??
        r['message'] ?? r['filePath'] ?? r['file_path'] ?? '';
    const say = (v: unknown): string =>
        typeof v === 'string' ? v : (v === undefined || v === null || v === '' ? '' : JSON.stringify(v));
    const parts = [err ? 'error: ' + say(err) : '', say(body)].filter(Boolean);
    if (parts.length) { return truncate(parts.join(' · '), SAID); }
    try { return truncate(JSON.stringify(r), SAID); } catch { return ''; }
}

/* ------------------------------------------------------------------
   ‼️ U-78 — WHAT THE AGENT SAID, FOR THE ONE ENGINE THAT DOES NOT SAY IT.

   A hosted conversation is Agent Farm's own, so its replies are mirrored in
   as they arrive (`AssistantMessage`, see `handle`). Claude fires its own
   hooks instead, and no Claude hook carries the assistant's text — `Stop`
   says only that a turn ended. So the one place the answer exists is the
   transcript the hook already names, and a turn boundary is exactly when it
   has just been written.

   The read is a TAIL, not a file: a long session is tens of megabytes and
   this runs at every turn end, on every session. A quarter of a megabyte is
   comfortably more than the last few lines of any turn while staying a cost
   nobody notices; if the answer is not in there, nothing is claimed.

   Two things it must not do, and both are what makes a reply the SESSION's:
   a sidechain line is a subagent talking to itself, and a `text` block that
   comes before the last real user prompt belongs to a previous turn.
   ------------------------------------------------------------------ */
const TAIL_BYTES = 256 * 1024;

/** The last thing the agent actually said in this transcript, or nothing. */
export function lastSaid(file: string, read: (f: string, bytes: number) => string | undefined): string {
    let tail: string | undefined;
    try { tail = read(file, TAIL_BYTES); } catch { return ''; }
    if (!tail) { return ''; }
    const lines = tail.split('\n');
    // The first line of a tail is normally cut in half; it is never the one.
    for (let i = lines.length - 1; i > 0; i--) {
        const raw = lines[i].trim();
        if (!raw || raw[0] !== '{') { continue; }
        let o: Record<string, unknown>;
        try { o = JSON.parse(raw) as Record<string, unknown>; } catch { continue; }
        if (o['isSidechain'] === true) { continue; }
        const msg = o['message'] as { role?: string; content?: unknown } | undefined;
        if (o['type'] === 'user') {
            // A tool result is also a `user` line; a real prompt ends the turn
            // we are looking back through.
            const c = msg?.content;
            const isToolResult = Array.isArray(c)
                && c.some(b => (b as { type?: string })?.type === 'tool_result');
            if (!isToolResult) { return ''; }
            continue;
        }
        if (o['type'] !== 'assistant' || !msg) { continue; }
        const c = msg.content;
        const text = typeof c === 'string'
            ? c
            : (Array.isArray(c)
                ? c.filter(b => (b as { type?: string })?.type === 'text')
                    .map(b => String((b as { text?: string }).text ?? ''))
                    .join('\n').trim()
                : '');
        if (text) { return truncate(text, SAID); }
    }
    return '';
}

/** The tail reader used in production — the same shape `readTail` has
 *  everywhere else, kept injectable so the tests never touch a disk. */
function readTailSync(file: string, bytes: number): string | undefined {
    let fd: number | undefined;
    try {
        const size = fs.statSync(file).size;
        const start = Math.max(0, size - bytes);
        const len = size - start;
        if (len <= 0) { return ''; }
        fd = fs.openSync(file, 'r');
        const buf = Buffer.alloc(len);
        fs.readSync(fd, buf, 0, len, start);
        return buf.toString('utf8');
    } catch { return undefined; }
    finally { if (fd !== undefined) { try { fs.closeSync(fd); } catch { /* already gone */ } } }
}

export class LiveMonitor implements vscode.Disposable {
    private server?: http.Server;
    private sessionsMap = new Map<string, LiveSession>();
    private eventLog: LiveEvent[] = [];
    private stuckTimer: NodeJS.Timeout;
    private readonly onDidUpdateEmitter = new vscode.EventEmitter<void>();
    readonly onDidUpdate = this.onDidUpdateEmitter.event;
    /**
     * A session was CLEARED off the page on purpose (`dismiss(…, purge)`), or
     * re-keyed onto its real id (`adopt`). Anything that keeps its own record
     * per session — the YOUR TURN alert preferences (U-66) — follows this
     * rather than guessing from the session list, which is the race the 8-second
     * prune sweep used to lose.
     */
    private readonly onDidRekeyEmitter =
        new vscode.EventEmitter<{ kind: 'cleared' | 'adopted'; sessionId: string; to?: string }>();
    readonly onDidRekey = this.onDidRekeyEmitter.event;
    private readonly onEventEmitter = new vscode.EventEmitter<LiveEvent>();
    /** Fires for every individual live event (used by hook triggers). */
    readonly onEvent = this.onEventEmitter.event;
    listenerState: ListenerState = 'disabled';
    activePort = 0;

    constructor(
        private getConfig: () => LiveConfig,
        private resolveAgent: (cwd: string | undefined) => { agentId?: string; agentName?: string },
        /** B3 inbound: /trigger/<token> requests land here; return true if a trigger accepted it. */
        private onTrigger?: (token: string, payload: unknown) => boolean,
        /** JSONL file persisting events across reloads (timeline history). */
        private storeFile?: string,
        /** X-7: the running extension's version, stamped on every event and
         *  carried on the session. Optional so a test can leave it out; when it
         *  is absent nothing is written rather than a placeholder. */
        private afVersion?: string,
        /** U-78: how the last few lines of a transcript are read at a turn end.
         *  Injected so a test never touches a disk; production uses `fs`. */
        private readTail: (file: string, bytes: number) => string | undefined = readTailSync
    ) {
        this.stuckTimer = setInterval(() => this.checkStuck(), 30_000);
        this.loadCleared();
        this.loadStore();
    }

    // ---------- Cleared sessions ----------

    /**
     * Sessions the user took off the Live Timeline with Clear (id → cleared at).
     *
     * Clearing is not "this session ended" — it is "I do not want to see this on
     * this page any more", so it has to take the card AND the lane row with it.
     * The lane is drawn from events, so hiding the card alone left an empty row
     * behind: everything the timeline reads is filtered through this set.
     *
     * The JSONL store is never rewritten — it is the raw log — so the ids are
     * kept in a small sidecar file next to it, which is also what makes a Clear
     * survive a window reload. A new event from a cleared session lifts its
     * clear: a session that comes back is tracked again from that moment.
     */
    private cleared = new Map<string, number>();

    private clearedFile(): string | undefined {
        return this.storeFile
            ? path.join(path.dirname(this.storeFile), 'live-cleared.json')
            : undefined;
    }

    private loadCleared(): void {
        const file = this.clearedFile();
        if (!file || !fs.existsSync(file)) { return; }
        try {
            const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, number>;
            const keepFrom = Date.now() - STORE_RETENTION_MS;
            for (const [id, ts] of Object.entries(raw)) {
                // Past retention there is nothing left in the store to hide.
                if (typeof ts === 'number' && ts >= keepFrom) { this.cleared.set(id, ts); }
            }
        } catch { /* unreadable — nothing stays hidden */ }
    }

    private saveCleared(): void {
        const file = this.clearedFile();
        if (!file) { return; }
        try {
            fs.writeFileSync(file, JSON.stringify(Object.fromEntries(this.cleared)), 'utf8');
        } catch { /* best effort — the in-memory set still holds for this window */ }
    }

    // ---------- Persistent event store ----------

    private pendingWrites: string[] = [];
    private flushTimer?: NodeJS.Timeout;

    /** Seed memory with the last day of persisted events; prune the store file. */
    private loadStore(): void {
        if (!this.storeFile || !fs.existsSync(this.storeFile)) { return; }
        try {
            const st = fs.statSync(this.storeFile);
            const raw = fs.readFileSync(this.storeFile, 'utf8');
            const cutoff = Date.now() - MEMORY_WINDOW_MS;
            const keepFrom = Date.now() - STORE_RETENTION_MS;
            const keptLines: string[] = [];
            for (const line of raw.split('\n')) {
                if (!line.trim()) { continue; }
                let e: LiveEvent;
                try { e = JSON.parse(line) as LiveEvent; } catch { continue; }
                if (typeof e.ts !== 'number' || !e.kind) { continue; }
                if (e.ts >= keepFrom) { keptLines.push(line); }
                // A cleared session stays out of memory — that is what makes it
                // stay off the page across a reload.
                if (e.ts >= cutoff && !this.cleared.has(e.sessionId)) { this.eventLog.push(e); }
            }
            this.eventLog.sort((a, b) => a.ts - b.ts);
            this.capMemory();
            this.rebuildSessions();
            // Rewrite when the file outgrew retention or size budget.
            if (st.size > STORE_MAX_BYTES || keptLines.length * 1.5 < raw.split('\n').length) {
                fs.writeFileSync(this.storeFile, keptLines.join('\n') + (keptLines.length ? '\n' : ''), 'utf8');
            }
        } catch { /* unreadable store — start fresh */ }
    }

    /**
     * Rebuild the session cards from persisted events so a reload doesn't blank
     * the "Live sessions" list while the lanes still show recent activity.
     * Mirrors handle()'s status transitions; only sessions within the normal
     * TTL are revived, ended ones stay gone, and stale mid-work sessions are
     * marked stalled quietly (no reload-noise notification).
     */
    private rebuildSessions(): void {
        const now = Date.now();
        const cutoff = now - SESSION_TTL_MS;
        for (const e of this.eventLog) {
            if (e.ts < cutoff) { continue; }
            let s = this.sessionsMap.get(e.sessionId);
            if (!s) {
                s = {
                    sessionId: e.sessionId,
                    transcriptPath: e.transcriptPath,
                    agentId: e.agentId,
                    agentName: e.agentName,
                    // Same order as `session()`: the id, then what the event
                    // recorded — see LiveEvent.engine. Without the second half a
                    // reload turned every hosted Codex lane back into a Claude
                    // one, because only the store survives the reload.
                    source: cliSourceOf(e.sessionId) ?? (e.engine?.trim() || undefined),
                    status: 'idle',
                    startedAt: e.ts,
                    lastEventTs: e.ts,
                    prompts: 0,
                    toolCalls: 0,
                    errors: 0,
                    compactions: 0,
                    subagentStops: 0,
                    notifiedStuck: false
                };
                this.sessionsMap.set(e.sessionId, s);
            }
            s.lastEventTs = e.ts;
            if (e.transcriptPath) { s.transcriptPath = e.transcriptPath; }
            if (!s.source && e.engine?.trim()) { s.source = e.engine.trim(); }
            // Read back out of the store rather than assumed to be this build:
            // after a reload the session's earlier events may well have been
            // watched by the version that was installed before the update.
            if (e.af) {
                s.afVersions = s.afVersions ?? [];
                if (s.afVersions[s.afVersions.length - 1] !== e.af) { s.afVersions.push(e.af); }
            }
            switch (e.kind) {
                case 'start': s.status = 'idle'; s.startedAt = e.ts; break;
                case 'prompt':
                    s.status = 'working';
                    s.prompts++;
                    if (!s.firstPrompt && e.detail?.trim()) { s.firstPrompt = e.detail.trim(); }
                    s.lastPrompt = e.detail ? truncate(e.detail, 90) : undefined;
                    s.lastPromptFull = e.detail ? truncate(e.detail.trim(), FIRST_PROMPT_MAX) : undefined;
                    break;
                case 'toolStart': s.status = 'tool'; s.currentTool = e.tool; s.toolCalls++; break;
                case 'toolEnd': s.status = 'working'; s.currentTool = undefined; break;
                case 'permission': s.status = 'waiting-permission'; break;
                case 'stop': s.status = 'waiting-input'; s.currentTool = undefined; break;
                case 'subagent': s.subagentStops++; break;
                case 'compact': s.compactions++; break;
                case 'notify':
                    if (/waiting|input|idle/i.test(e.detail ?? '')) { s.status = 'waiting-input'; }
                    break;
                case 'end': s.status = 'ended'; break;
            }
        }
        const cfg = this.getConfig();
        for (const [id, s] of this.sessionsMap) {
            if (s.status === 'ended') { this.sessionsMap.delete(id); continue; }
            // Mid-work before the reload: either the next hook event refreshes it,
            // or it is long gone — mark it stalled without notifying.
            if ((s.status === 'working' || s.status === 'tool') && now - s.lastEventTs > cfg.stuckThresholdMs) {
                s.status = 'stalled';
                s.notifiedStuck = true;
            }
        }
    }

    private persist(event: LiveEvent): void {
        if (!this.storeFile) { return; }
        this.pendingWrites.push(JSON.stringify(event));
        if (this.flushTimer) { return; }
        this.flushTimer = setTimeout(() => {
            this.flushTimer = undefined;
            const chunk = this.pendingWrites.join('\n') + '\n';
            this.pendingWrites = [];
            fs.appendFile(this.storeFile as string, chunk, () => { /* best effort */ });
        }, 2000);
    }

    private capMemory(): void {
        const cutoff = Date.now() - MEMORY_WINDOW_MS;
        let drop = 0;
        while (drop < this.eventLog.length && this.eventLog[drop].ts < cutoff) { drop++; }
        const over = (this.eventLog.length - drop) - MEMORY_MAX_EVENTS;
        if (over > 0) { drop += over; }
        if (drop > 0) { this.eventLog = this.eventLog.slice(drop); }
    }

    /**
     * X-7: WHAT EACH AGENT FARM BUILD ACTUALLY SAW.
     *
     * ‼️ THE POINT IS NOT THE STAMP, IT IS THE COMPARISON. "Capture went deaf in
     * version N" is a claim about RATE — events per running hour — and until now
     * closing it meant matching install timestamps against a JSONL by hand,
     * which is why one such claim ran for days. With the stamp on the line this
     * is a single pass over the store: per version, when it was running, how
     * many sessions it watched, how many events of each kind, and the rate.
     *
     * ‼️ THE RATE IS PER RUNNING HOUR, NOT PER CALENDAR HOUR. A version installed
     * over a weekend looks silent by the clock and is not; what is comparable is
     * activity while sessions were actually live, so the denominator counts only
     * the time inside gaps short enough to be one working stretch.
     *
     * Lines with no `af` are the ones written before the stamp existed. They are
     * reported under an empty version rather than being attributed to whatever
     * was installed at the time — that guess is the thing being replaced.
     */
    versionSpans(): VersionSpan[] {
        const out = new Map<string, VersionSpan>();
        const sessions = new Map<string, Set<string>>();
        let last = new Map<string, number>();
        const each = (e: LiveEvent): void => {
            if (typeof e.ts !== 'number' || !e.kind) { return; }
            const v = e.af ?? '';
            let row = out.get(v);
            if (!row) {
                row = { version: v, from: e.ts, to: e.ts, events: 0, sessions: 0, activeMs: 0, kinds: {} };
                out.set(v, row);
                sessions.set(v, new Set());
            }
            row.from = Math.min(row.from, e.ts);
            row.to = Math.max(row.to, e.ts);
            row.events++;
            row.kinds[e.kind] = (row.kinds[e.kind] ?? 0) + 1;
            (sessions.get(v) as Set<string>).add(e.sessionId);
            const prev = last.get(v);
            if (prev !== undefined && e.ts > prev && e.ts - prev <= ACTIVE_GAP_MS) { row.activeMs += e.ts - prev; }
            last.set(v, e.ts);
        };

        // The store when there is one (a month of history), memory otherwise.
        let read = false;
        if (this.storeFile && fs.existsSync(this.storeFile)) {
            try {
                for (const line of fs.readFileSync(this.storeFile, 'utf8').split('\n')) {
                    if (!line.trim()) { continue; }
                    try { each(JSON.parse(line) as LiveEvent); } catch { /* a torn line proves nothing */ }
                }
                read = true;
            } catch { /* unreadable — fall through to memory */ }
        }
        if (!read) { last = new Map(); for (const e of this.eventLog) { each(e); } }

        for (const [v, row] of out) { row.sessions = (sessions.get(v) as Set<string>).size; }
        return [...out.values()].sort((a, b) => a.from - b.from);
    }

    /**
     * Long-range density: bucketed per-lane counts read from the persistent
     * store (memory only holds the last day). [tools, prompts, alerts, other].
     */
    density(windowMs: number, bucketCount = 168): DensityData {
        const to = Date.now();
        const from = to - windowMs;
        const bucketMs = windowMs / bucketCount;
        const lanes = new Map<string, [number, number, number, number][]>();
        const laneOf = (name: string) => {
            let l = lanes.get(name);
            if (!l) {
                l = Array.from({ length: bucketCount }, () => [0, 0, 0, 0] as [number, number, number, number]);
                lanes.set(name, l);
            }
            return l;
        };
        let total = 0;
        const add = (e: LiveEvent) => {
            if (e.ts < from || e.ts > to) { return; }
            if (this.cleared.has(e.sessionId)) { return; } // cleared off the page, in every range
            const bucket = Math.min(bucketCount - 1, Math.floor((e.ts - from) / bucketMs));
            const lane = laneOf(e.agentName ?? e.sessionId.slice(0, 8));
            const slot = e.kind === 'toolStart' || e.kind === 'toolEnd' ? 0
                : e.kind === 'prompt' ? 1
                : e.kind === 'permission' ? 2
                : 3;
            lane[bucket][slot]++;
            total++;
        };
        if (this.storeFile && windowMs > MEMORY_WINDOW_MS && fs.existsSync(this.storeFile)) {
            try {
                const memFrom = this.eventLog.length ? this.eventLog[0].ts : to;
                for (const line of fs.readFileSync(this.storeFile, 'utf8').split('\n')) {
                    if (!line.trim()) { continue; }
                    try {
                        const e = JSON.parse(line) as LiveEvent;
                        // The store also holds what memory holds — avoid double counting.
                        if (typeof e.ts === 'number' && e.ts < memFrom) { add(e); }
                    } catch { /* skip bad line */ }
                }
            } catch { /* unreadable store */ }
        }
        for (const e of this.eventLog) { add(e); }
        return {
            from, to, bucketMs,
            lanes: [...lanes.entries()].map(([name, buckets]) => ({ name, buckets })),
            totalEvents: total
        };
    }

    // ---------- HTTP listener ----------

    start(): void {
        this.stop();
        const cfg = this.getConfig();
        if (!cfg.enabled) {
            this.listenerState = 'disabled';
            this.onDidUpdateEmitter.fire();
            return;
        }
        const server = http.createServer((req, res) => {
            const url = req.url ?? '';
            const isEvent = req.method === 'POST' && url.startsWith('/event');
            const triggerMatch = req.method === 'POST' ? /^\/trigger\/([\w-]+)$/.exec(url.split('?')[0]) : null;
            if (!isEvent && !triggerMatch) {
                res.statusCode = 404;
                res.end();
                return;
            }
            let body = '';
            req.on('data', chunk => {
                body += chunk;
                if (body.length > 1_000_000) { req.destroy(); }
            });
            req.on('end', () => {
                res.setHeader('Content-Type', 'application/json');
                if (triggerMatch) {
                    let payload: unknown;
                    try { payload = body ? JSON.parse(body) : undefined; } catch { payload = body; }
                    const accepted = this.onTrigger?.(triggerMatch[1], payload) ?? false;
                    res.statusCode = accepted ? 200 : 404;
                    res.end(JSON.stringify({ ok: accepted }));
                    return;
                }
                res.statusCode = 200;
                res.end('{}');
                try { this.handle(JSON.parse(body) as HookPayload); } catch { /* malformed hook payload */ }
            });
        });
        server.on('error', (err: NodeJS.ErrnoException) => {
            this.listenerState = err.code === 'EADDRINUSE' ? 'port-in-use' : 'error';
            this.onDidUpdateEmitter.fire();
        });
        server.listen(cfg.port, '127.0.0.1', () => {
            this.listenerState = 'listening';
            this.activePort = cfg.port;
            this.onDidUpdateEmitter.fire();
        });
        this.server = server;
    }

    stop(): void {
        this.server?.close();
        this.server = undefined;
        if (this.listenerState === 'listening') { this.listenerState = 'disabled'; }
    }

    // ---------- Event handling ----------

    /**
     * Display label for a session: the agent name, plus a "#k" ordinal when the
     * same agent has more than one tracked session (ordered by start time), so
     * concurrent sessions of one agent stay distinguishable in notifications,
     * session cards and the needs queue.
     */
    labelOf(s: LiveSession): string {
        const name = s.agentName ?? s.sessionId.slice(0, 8);
        const key = s.agentId ?? s.agentName;
        if (!key) { return name; }
        const siblings = [...this.sessionsMap.values()]
            .filter(o => (o.agentId ?? o.agentName) === key)
            .sort((a, b) => a.startedAt - b.startedAt || a.sessionId.localeCompare(b.sessionId));
        if (siblings.length < 2) { return name; }
        const idx = siblings.findIndex(o => o.sessionId === s.sessionId);
        return idx >= 0 ? `${name} #${idx + 1}` : name;
    }

    private session(payload: HookPayload): LiveSession {
        const id = payload.session_id ?? 'unknown';
        // A cleared session that speaks again is back — Clear takes it off the
        // page, it does not blacklist it.
        if (this.cleared.delete(id)) { this.saveCleared(); }
        let s = this.sessionsMap.get(id);
        if (!s) {
            const { agentId, agentName } = this.resolveAgent(payload.cwd);
            s = {
                sessionId: id,
                transcriptPath: payload.transcript_path,
                cwd: payload.cwd,
                agentId,
                agentName,
                // The id first (a `cli:` lane names its own engine), then what
                // the caller stated — see HookPayload.engine.
                source: cliSourceOf(id) ?? (payload.engine?.trim() || undefined),
                status: 'idle',
                startedAt: Date.now(),
                lastEventTs: Date.now(),
                prompts: 0,
                toolCalls: 0,
                errors: 0,
                compactions: 0,
                subagentStops: 0,
                notifiedStuck: false
            };
            this.sessionsMap.set(id, s);
        }
        if (payload.cwd && !s.cwd) {
            s.cwd = payload.cwd;
            const { agentId, agentName } = this.resolveAgent(payload.cwd);
            s.agentId = agentId;
            s.agentName = agentName;
        }
        if (payload.transcript_path) { s.transcriptPath = payload.transcript_path; }
        // A hosted session learns its engine on the SAME event that names it, so
        // a session revived from the store before the mirror spoke gets its
        // badge as soon as one arrives rather than staying unlabelled for life.
        if (!s.source && payload.engine?.trim()) { s.source = payload.engine.trim(); }
        return s;
    }

    private push(s: LiveSession, kind: LiveEventKind, tool?: string, detail?: string): void {
        // The build doing the watching, on the event and on the session. A
        // session that spans an upgrade collects both, in the order they ran —
        // averaged together they would hide the very change being looked for.
        const af = this.afVersion;
        if (af) {
            s.afVersions = s.afVersions ?? [];
            if (s.afVersions[s.afVersions.length - 1] !== af) { s.afVersions.push(af); }
        }
        const event: LiveEvent = {
            ts: Date.now(),
            sessionId: s.sessionId,
            agentId: s.agentId,
            agentName: s.agentName,
            kind,
            tool,
            detail,
            transcriptPath: s.transcriptPath,
            ...(af ? { af } : {}),
            // …and which engine watched it, so a reload restores the badge.
            ...(s.source ? { engine: s.source } : {})
        };
        this.eventLog.push(event);
        this.capMemory();
        this.persist(event);
        this.onEventEmitter.fire(event);
    }

    handle(payload: HookPayload): void {
        const cfg = this.getConfig();
        const s = this.session(payload);
        const now = Date.now();
        s.lastEventTs = now;
        s.notifiedStuck = false;
        const prevStatus = s.status;

        // ‼️ A-26 — THE TURN'S LAST WORD, carried out of the switch to the emit
        // site below. It is computed once, where it is already computed for the
        // timeline, so the reader and the lane can never quote the same turn
        // differently.
        let lastWord = '';

        switch (payload.hook_event_name) {
            case 'SessionStart':
                s.status = 'idle';
                s.startedAt = now;
                // ‼️ S-43 — A DAEMON'S SPARE FIRES THIS HOOK TOO, and it was
                // being drawn as a live session that nobody had started: End
                // Session killed the leaf worker, the daemon bred another under
                // a new id, and the card came back for ever. Held rather than
                // dropped — the session is still tracked, so the moment it says
                // anything real it appears with its whole history intact.
                if (s.prompts === 0 && cfg.spareOf?.(s.sessionId) === true) {
                    s.spare = true;
                    break;
                }
                s.spare = false;
                this.push(s, 'start', undefined, payload.source);
                break;
            case 'UserPromptSubmit': {
                // A prompt is the end of every doubt: a spare that is handed to
                // a real conversation stops being a spare here, whatever the
                // registry still says about it.
                s.spare = false;
                s.status = 'working';
                s.prompts++;
                const rawPrompt = (payload.prompt ?? '').trim();
                if (!s.firstPrompt && rawPrompt) {
                    s.firstPrompt = truncate(rawPrompt, 4000);
                }
                s.lastPrompt = truncate(rawPrompt, 90);
                s.lastPromptFull = truncate(rawPrompt, FIRST_PROMPT_MAX);
                this.push(s, 'prompt', undefined, truncate(rawPrompt, SAID));
                break;
            }
            case 'PreToolUse':
                s.status = 'tool';
                s.currentTool = payload.tool_name;
                s.toolCalls++;
                this.push(s, 'toolStart', payload.tool_name, toolDetail(payload.tool_input));
                break;
            case 'PostToolUse':
                s.status = 'working';
                s.currentTool = undefined;
                this.push(s, 'toolEnd', payload.tool_name, toolResult(payload.tool_response));
                break;
            case 'Notification': {
                const msg = payload.message ?? '';
                if (/permission|approv|allow/i.test(msg)) {
                    s.status = 'waiting-permission';
                    this.push(s, 'permission', undefined, truncate(msg, SAID));
                    cfg.forward?.('permission', `${this.labelOf(s)}: ${truncate(msg, 120)}`);
                    if (cfg.notifyPermission) {
                        this.notify('warn', `${this.labelOf(s)} is waiting for permission`, msg);
                    }
                } else if (/waiting|input|idle/i.test(msg)) {
                    s.status = 'waiting-input';
                    this.push(s, 'notify', undefined, truncate(msg, SAID));
                } else {
                    this.push(s, 'notify', undefined, truncate(msg, SAID));
                }
                break;
            }
            // ‼️ U-78 — THE OTHER HALF OF THE CONVERSATION. Not a Claude hook:
            // a hosted conversation is Agent Farm's own, so its replies are
            // mirrored in as they arrive (mirrorConsoleToLive). Empty is
            // dropped rather than drawn — a point with nothing to say is worse
            // than no point.
            case 'AssistantMessage': {
                const said = truncate((payload.message ?? '').trim(), SAID);
                if (said) { this.push(s, 'say', undefined, said); }
                // ‼️ A-18 — THE AGENT IS SPEAKING, SO IT IS NOT WAITING FOR YOU.
                // A hosted turn parks on a question mid-turn and resumes when
                // the answer lands; without this the lane stayed on the parked
                // status until the next TOOL, so the turn's real ending was no
                // edge at all and rang nothing. Safe by construction: this event
                // is only ever Agent Farm's own mirror (see above), never a
                // Claude hook, so no CLI lane can be moved by it.
                if (s.status === 'waiting-permission' || s.status === 'waiting-input') {
                    s.status = 'working';
                }
                break;
            }
            case 'Stop': {
                s.status = 'waiting-input';
                s.currentTool = undefined;
                // What the turn ENDED with. The mirror hands it over; Claude's
                // own hook does not carry it, so it is read from the transcript
                // the hook already names (lastSaid).
                const ended = truncate((payload.message ?? '').trim(), SAID)
                    || (s.transcriptPath ? lastSaid(s.transcriptPath, this.readTail) : '');
                lastWord = ended;
                this.push(s, 'stop', undefined, ended || undefined);
                if (cfg.notifyTurnEnd) {
                    this.notify('info', `${this.labelOf(s)} finished its turn`, s.lastPrompt ?? '');
                }
                break;
            }
            case 'SubagentStop':
                s.subagentStops++;
                this.push(s, 'subagent');
                break;
            case 'PreCompact':
                s.compactions++;
                this.push(s, 'compact', undefined, payload.trigger);
                break;
            case 'SessionEnd':
                s.status = 'ended';
                s.currentTool = undefined;
                this.push(s, 'end', undefined, payload.reason);
                break;
            default:
                this.push(s, 'notify', undefined, payload.hook_event_name);
        }

        // ‼️ A-18 — THE EDGES THAT WANT THE USER. One emit per TRANSITION, never
        // per event: the "waiting" Notification and the Stop right behind it are
        // one crossing into waiting-input, and a session parked in a state must
        // not keep ringing. `turn-ready` covers both of today's paths exactly as
        // it always has.
        if (s.status !== prevStatus) {
            if (s.status === 'waiting-permission') {
                // A tool is asking to run. From another room this is the same
                // news as a question, and it is the one A-18 exists for: the
                // session stopped, and it stopped ON you.
                this.emitAttention(cfg, s, 'question');
            } else if (s.status === 'waiting-input') {
                // ‼️ TWO DIFFERENT ENDINGS ON ONE STATUS. A turn that finished
                // hands control back; a turn parked on an `AskUserQuestion` is
                // still open and wants an ANSWER. Same status, different sound.
                this.emitAttention(cfg, s,
                    this.askPending(cfg, s) ? 'question' : 'turn-ready',
                    lastWord);
            } else if (s.status === 'ended') {
                this.emitAttention(cfg, s, 'ended', lastWord);
            }
        }

        this.prune(now);
        this.onDidUpdateEmitter.fire();
    }

    /**
     * ‼️ A-18 — THE ONE EMIT SITE. Both callbacks are fed from here, so
     * `onTurnReady` can never disagree with `onAttention` about whether an edge
     * happened; each is guarded on its own, because a subscriber that throws
     * must not swallow the other one or break event handling.
     */
    private emitAttention(cfg: LiveConfig, s: LiveSession, event: AlertEvent, said?: string): void {
        try { cfg.onAttention?.(s, event, said || undefined); } catch { /* best effort */ }
        if (event === 'turn-ready') {
            try { cfg.onTurnReady?.(s); } catch { /* best effort */ }
        }
    }

    /** Injected, and a host that throws is simply "no question pending" —
     *  never a broken timeline. */
    private askPending(cfg: LiveConfig, s: LiveSession): boolean {
        try { return cfg.pendingAskOf?.(s.sessionId) === true; } catch { return false; }
    }

    private prune(now: number): void {
        for (const [id, s] of this.sessionsMap) {
            const dead = s.status === 'ended' && now - s.lastEventTs > 10 * 60_000;
            const expired = now - s.lastEventTs > SESSION_TTL_MS;
            if (dead || expired) { this.sessionsMap.delete(id); }
        }
    }

    /**
     * Drop a tracked session, in one of two meanings.
     *
     * `purge: false` — the session ENDED (End session): it stops being live and
     * gets the `end` event that never arrived, so its unfinished tool bar closes
     * where the session really stopped instead of running on to "now". What it
     * did stays on the page as history — that is the honest record of a run.
     *
     * `purge: true` — the user CLEARED it: take it off this page whole. The card
     * and the lane row go together (an emptied row with no card is an orphan),
     * in every range, and it stays gone across a reload. The session itself is
     * untouched — the transcript is on disk and a new event brings it back.
     * Because a row outlives its card, this works on an untracked session too,
     * as long as the page is still drawing its events.
     *
     * Returns false when there was nothing to drop under that id.
     */
    dismiss(sessionId: string, reason = 'cleared in Agent Farm', purge = false): boolean {
        const s = this.sessionsMap.get(sessionId);
        const drawn = purge && this.eventLog.some(e => e.sessionId === sessionId);
        if (!s && !drawn) { return false; }
        if (s) {
            s.status = 'ended';
            s.currentTool = undefined;
            if (!purge) { this.push(s, 'end', undefined, reason); }
            this.sessionsMap.delete(sessionId);
        }
        if (purge) {
            this.cleared.set(sessionId, Date.now());
            this.saveCleared();
            this.eventLog = this.eventLog.filter(e => e.sessionId !== sessionId);
            this.onDidRekeyEmitter.fire({ kind: 'cleared', sessionId });
        }
        this.onDidUpdateEmitter.fire();
        return true;
    }

    /**
     * ‼️ THE SAME CONVERSATION, UNDER THE NAME IT TURNED OUT TO HAVE (X-35).
     *
     * A terminal launched on Codex, Gemini or Antigravity produces a live lane
     * the moment the window opens — that is the only way those engines reach
     * this page at all, since none of them fires hooks. But at that moment
     * NOBODY knows the conversation's id: the CLI mints it, and it appears
     * seconds later inside a transcript the index then parses. Two bad answers
     * were available: leave the lane under a made-up `cli:` id for ever (so the
     * card, the transcript, the cost and the project stamp all belong to four
     * different keys), or wait for the real id and draw nothing until it comes
     * (which is what "the Live Timeline never shows Codex" meant).
     *
     * So the lane is opened under a synthetic id and RE-KEYED when the real one
     * is found — in one step, keeping the counters, the start time and the whole
     * event history. Nothing is drawn twice and nothing is lost; the row simply
     * learns its name.
     *
     * Refuses to overwrite a lane that already exists under the real id: that
     * would be two live sessions merged into one on the strength of a guess.
     */
    adopt(fromSessionId: string, toSessionId: string): boolean {
        const from = String(fromSessionId ?? '').trim();
        const to = String(toSessionId ?? '').trim();
        if (!from || !to || from === to) { return false; }
        const s = this.sessionsMap.get(from);
        if (!s || this.sessionsMap.has(to)) { return false; }
        this.sessionsMap.delete(from);
        s.sessionId = to;
        this.sessionsMap.set(to, s);
        for (const e of this.eventLog) {
            if (e.sessionId === from) { e.sessionId = to; }
        }
        // ‼️ Everything else keyed by this id moves in the SAME step — the alert
        // preference and the turn the user has already been told about. A lane
        // that learns its name must not lose the choice made on it.
        this.onDidRekeyEmitter.fire({ kind: 'adopted', sessionId: from, to });
        this.onDidUpdateEmitter.fire();
        return true;
    }

    private checkStuck(): void {
        const cfg = this.getConfig();
        const now = Date.now();
        let changed = false;
        for (const s of this.sessionsMap.values()) {
            if ((s.status === 'working' || s.status === 'tool') &&
                now - s.lastEventTs > cfg.stuckThresholdMs) {
                s.status = 'stalled';
                changed = true;
                if (!s.notifiedStuck) {
                    s.notifiedStuck = true;
                    // ‼️ A-18 — the crossing INTO stalled, once. The status is
                    // rewritten on every sweep while it stays stuck, so the edge
                    // is this flag and not the assignment above.
                    this.emitAttention(cfg, s, 'stalled');
                    cfg.forward?.('stalled',
                        `${this.labelOf(s)} looks stalled` +
                        (s.currentTool ? ` (last tool: ${s.currentTool})` : ''));
                    if (cfg.notifyStuck) {
                        this.notify(
                            'warn',
                            `${this.labelOf(s)} looks stalled`,
                            `No hook events for ${Math.round((now - s.lastEventTs) / 60000)} min` +
                            (s.currentTool ? ` (last tool: ${s.currentTool})` : '')
                        );
                    }
                }
            }
        }
        // The TTL sweep belongs here too. prune() used to be reachable only
        // from handle(), so a session whose events simply STOPPED (the terminal
        // was closed, the CLI died) sat on the page as a live card — and its
        // unfinished tool call as a lane that never ended — until some OTHER
        // session happened to report an event.
        const before = this.sessionsMap.size;
        this.prune(now);
        if (changed || this.sessionsMap.size !== before) { this.onDidUpdateEmitter.fire(); }
    }

    private notify(level: 'info' | 'warn', title: string, detail: string): void {
        const show = level === 'warn'
            ? vscode.window.showWarningMessage.bind(vscode.window)
            : vscode.window.showInformationMessage.bind(vscode.window);
        void show(`Agent Farm: ${title}${detail ? ` — ${truncate(detail, 80)}` : ''}`, 'Open Timeline')
            .then(choice => {
                if (choice === 'Open Timeline') {
                    void vscode.commands.executeCommand('agentfarm.openTimeline');
                }
            });
    }

    // ---------- Queries ----------

    sessions(): LiveSession[] {
        this.settleSpares();
        return [...this.sessionsMap.values()]
            .filter(s => !s.spare)
            .sort((a, b) => b.lastEventTs - a.lastEventTs);
    }

    /**
     * ‼️ S-43 — THE VERDICT IS RE-TAKEN, IN BOTH DIRECTIONS, ON EVERY READ.
     *
     * The hook arrives the instant the worker is born and the CLI may not have
     * written that pid's registry file yet, so the answer at SessionStart can
     * honestly be "I do not know". Deciding it there once is what makes a
     * filter that passes its test and leaks in real life: read "I do not know"
     * as *real* and the spare slips through on its first event; read it as
     * *spare* and a session that has only just started is hidden for good.
     *
     * So it is not decided there. Nothing is held on a shrug — the old
     * behaviour — and the question is simply asked again whenever the list is
     * read, by which time the file exists. That makes the leak self-healing
     * (the card is gone by the next refresh) without ever hiding a session the
     * registry knows is real, and it costs one directory read per refresh.
     *
     * A session that has ever submitted a prompt is released and never held
     * again: the daemon hands its spare to a real conversation, and a rule that
     * kept looking at `spare:true` would hide the conversation with it.
     */
    private settleSpares(): void {
        const spareOf = this.getConfig().spareOf;
        if (!spareOf) { return; }
        for (const s of this.sessionsMap.values()) {
            if (s.prompts > 0 || s.status === 'ended') { s.spare = false; continue; }
            const verdict = spareOf(s.sessionId);
            if (verdict !== undefined) { s.spare = verdict; }
        }
    }

    events(windowMs: number): LiveEvent[] {
        const cutoff = Date.now() - windowMs;
        return this.eventLog.filter(e => e.ts >= cutoff);
    }

    hasRecentEvents(windowMs = 30 * 60_000): boolean {
        const last = this.eventLog[this.eventLog.length - 1];
        return !!last && Date.now() - last.ts < windowMs;
    }

    /** Aggregated live status for one agent (highest urgency wins); `sessions` = how many are tracked. */
    agentStatus(agentId: string): { status: LiveStatus; tool?: string; sessions: number } | undefined {
        const rank: Record<LiveStatus, number> = {
            'waiting-permission': 0, stalled: 1, tool: 2, working: 3,
            'waiting-input': 4, idle: 5, ended: 6
        };
        let best: LiveSession | undefined;
        let count = 0;
        this.settleSpares();
        for (const s of this.sessionsMap.values()) {
            // A held spare is not one of this agent's sessions — it is the
            // CLI's own idle worker, and counting it lit an agent up as busy
            // in the fleet views for work nobody had asked for (S-43).
            if (s.agentId !== agentId || s.spare) { continue; }
            count++;
            if (!best || rank[s.status] < rank[best.status]) { best = s; }
        }
        return best ? { status: best.status, tool: best.currentTool, sessions: count } : undefined;
    }

    waitingCount(): number {
        let n = 0;
        for (const s of this.sessionsMap.values()) {
            if (s.status === 'waiting-permission' || s.status === 'stalled') { n++; }
        }
        return n;
    }

    /**
     * How many sessions are mid-turn RIGHT NOW — a prompt being worked on or a
     * tool running. Waiting-for-you, stalled and idle sessions do not count:
     * an open session that has finished its turn is spending nothing, which is
     * the whole distinction the plan-usage beat switches on. Unlike
     * `workingAgentIds()` this counts sessions, including ones whose folder
     * matches no registered agent — they burn the same quota.
     */
    activeTurns(): number {
        let n = 0;
        for (const s of this.sessionsMap.values()) {
            if (s.status === 'working' || s.status === 'tool') { n++; }
        }
        return n;
    }

    workingAgentIds(): Set<string> {
        const ids = new Set<string>();
        for (const s of this.sessionsMap.values()) {
            if (s.agentId && (s.status === 'working' || s.status === 'tool')) {
                ids.add(s.agentId);
            }
        }
        return ids;
    }

    dispose(): void {
        this.stop();
        clearInterval(this.stuckTimer);
        if (this.flushTimer) { clearTimeout(this.flushTimer); }
        if (this.storeFile && this.pendingWrites.length) {
            try { fs.appendFileSync(this.storeFile, this.pendingWrites.join('\n') + '\n'); } catch { /* best effort */ }
            this.pendingWrites = [];
        }
        this.onDidUpdateEmitter.dispose();
        this.onDidRekeyEmitter.dispose();
        this.onEventEmitter.dispose();
    }
}
