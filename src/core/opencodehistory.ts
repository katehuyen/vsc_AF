/**
 * S-33 — OPENCODE'S HISTORY, READ THROUGH THE TWO SURFACES IT PUBLISHES.
 *
 * Every other engine in this codebase leaves a file behind: a Claude JSONL, a
 * Codex rollout, a Gemini chat document. OpenCode leaves SQLite
 * (`~/.local/share/opencode/opencode.db`) and two commands that read it —
 * `session list` and `export`. A-16 forbade reading that database directly and
 * the reason is not squeamishness: the schema is private, it has no version on
 * disk, and a wrong read of it would look exactly like an empty history.
 *
 * ‼️ EVERY SHAPE BELOW WAS MEASURED, 2026-08-15, opencode 1.18.18, against this
 * machine's own six sessions. Three of them contradict what the table-parsing
 * reader A-16 shipped assumed, and each would have failed quietly:
 *
 *   1. **`session list` HAS A `--format json`** — and it carries `created`,
 *      `updated` (epoch ms), `projectId` and `directory`. The drawn table gives
 *      a LOCAL CLOCK TIME WITH NO DATE, which is why A-16 forbade deriving a
 *      date from it. With the JSON form the prohibition is moot: the real
 *      stamps are on the wire, so nothing here guesses at a date.
 *   2. **`Exporting session: ses_…` goes to STDERR, not stdout.** A-16 recorded
 *      it as the first line of stdout and wrote a reader that skips to the first
 *      `{`. That reader is still right — a build that moves the line back would
 *      not break it — but the fact was wrong and is corrected here.
 *   3. **The list is cwd-SCOPED.** Run in the repo it returns six sessions; run
 *      one directory away it returns nothing at all. So a scan of the active
 *      folder is not a history, it is a history of one project, and the
 *      harvester walks the agents' own roots (`opencodeharvest.ts`).
 *
 * Pure: parsers and one planner. No spawning, no fs, no vscode.
 */

import { OpencodeSpend, opencodeTotal } from './opencode';

// ---------------------------------------------------------------------------
// `opencode session list --format json`
// ---------------------------------------------------------------------------

/**
 * One row of the JSON listing. Measured:
 * `{ id, title, updated, created, projectId, directory }` — and note the key is
 * `projectId` here where the EXPORT calls the same value `projectID`. One
 * capital letter between the two surfaces of one program; both are read.
 */
export interface OpencodeListRow {
    id: string;
    title: string;
    /** epoch ms — the engine's own clock, not a rendered local time */
    updated: number;
    created: number;
    projectId: string;
    /** the real folder, which is what attributes the session to an agent */
    directory: string;
}

function obj(v: unknown): Record<string, unknown> {
    return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
}

function num(v: unknown): number { return typeof v === 'number' && Number.isFinite(v) ? v : 0; }

function str(v: unknown): string { return typeof v === 'string' ? v : ''; }

/**
 * Read the listing. FAIL-SOFT: an empty folder prints nothing at all (measured,
 * not `[]`), a plugin can print a warning line first, and a killed process
 * leaves half a document — none of those are an error, they are no rows.
 *
 * The skip-to-first-`[` is the same tolerance `opencodeExportJson` applies for
 * the same reason: this binary is happy to print a sentence beside its JSON.
 */
export function opencodeListJson(stdout: string): OpencodeListRow[] {
    const text = String(stdout ?? '');
    const start = text.indexOf('[');
    if (start < 0) { return []; }
    let raw: unknown;
    try { raw = JSON.parse(text.slice(start)); } catch { return []; }
    if (!Array.isArray(raw)) { return []; }
    const out: OpencodeListRow[] = [];
    for (const item of raw) {
        const o = obj(item);
        const id = str(o.id).trim();
        if (!id) { continue; }
        const created = num(o.created);
        out.push({
            id,
            title: str(o.title).trim(),
            // A session that was made and never spoken to carries `updated ===
            // created`; a row with neither is not dropped, it sorts at the end.
            updated: num(o.updated) || created,
            created,
            projectId: str(o.projectId) || str(o.projectID),
            directory: str(o.directory)
        });
    }
    return out;
}

/**
 * The same conversation reached from two roots is ONE conversation.
 *
 * The store is machine-wide and the listing is cwd-scoped, so two agent folders
 * inside one project answer with the same ids. Merging on `id` — newest
 * `updated` wins — is what stops the Sessions table showing a session once per
 * folder that can see it.
 */
export function opencodeMergeRows(lists: OpencodeListRow[][]): OpencodeListRow[] {
    const byId = new Map<string, OpencodeListRow>();
    for (const list of lists) {
        for (const row of list) {
            const seen = byId.get(row.id);
            if (!seen || row.updated > seen.updated) { byId.set(row.id, row); }
        }
    }
    return [...byId.values()].sort((a, b) => b.updated - a.updated);
}

/**
 * ‼️ WHICH SESSIONS ARE WORTH SPENDING A PROCESS ON — the whole cost control.
 *
 * `export` is a spawn, and this machine is an i7-2600K: exporting every session
 * on every pass would put a process storm behind a panel that repaints several
 * times a second. Two rules keep it to almost nothing:
 *
 *   · **Our own write time is later than the engine's update time**, because we
 *     write the cache immediately after listing. Both are epoch ms on one
 *     machine, so `row.updated > cachedAt` means and can only mean "it has
 *     moved since we read it". An unchanged session is never exported twice.
 *   · **A first run is capped.** A history of three hundred conversations is
 *     harvested a slice at a time, newest first, across successive passes —
 *     which is the order somebody looking for a session actually wants.
 */
export function opencodeExportsToRefresh(
    rows: OpencodeListRow[], cachedAt: Map<string, number>, limit: number
): string[] {
    const out: string[] = [];
    for (const row of [...rows].sort((a, b) => b.updated - a.updated)) {
        const at = cachedAt.get(row.id);
        if (at !== undefined && at >= row.updated) { continue; }
        out.push(row.id);
        if (out.length >= limit) { break; }
    }
    return out;
}

// ---------------------------------------------------------------------------
// `opencode export <id>` — the document
// ---------------------------------------------------------------------------

/**
 * A part of one message, in the vocabulary the rest of this codebase draws.
 *
 * Measured part types: `text`, `reasoning`, `tool`, `step-start`, `step-finish`.
 * `file` (an attachment) and anything a later build adds are carried through as
 * `other` WITH THEIR OWN NAME rather than dropped — a viewer that silently
 * loses a kind of message is the failure this whole family keeps finding.
 */
export interface OpencodePart {
    kind: 'text' | 'reasoning' | 'tool' | 'step-start' | 'step-finish' | 'file' | 'other';
    /** the engine's own word for the type, kept for `other` and for diagnosis */
    type: string;
    text?: string;
    /** `tool` — its name, its arguments and its result */
    tool?: string;
    callId?: string;
    status?: string;
    input?: unknown;
    output?: string;
    isError?: boolean;
    /** `file` — an attachment, by whatever name it travels under */
    filename?: string;
    mime?: string;
    ts?: number;
    endTs?: number;
    /** `step-finish` — what that model call cost */
    tokens?: OpencodeSpend;
    cost?: number;
}

export interface OpencodeExportMessage {
    role: 'user' | 'assistant';
    id: string;
    ts: number;
    endTs?: number;
    model?: string;
    /**
     * ‼️ X-108 — THE PROVIDER THE ENGINE ITSELF NAMED FOR THIS MESSAGE.
     *
     * The export states the two halves side by side (`{ providerID, modelID }`
     * on a user message, flat `providerID` / `modelID` on an assistant one) and
     * only the model half was read. Dropping the provider is not a cosmetic
     * loss: OpenCode publishes its models as `provider/model`, so a bare
     * `big-pickle` has to be completed by guessing against the engine's option
     * list later (K-28) — and a model two providers both offer cannot be
     * completed at all. It is also the only evidence that a run changed
     * provider at a turn boundary, which on this engine is legitimate
     * (`session/set_config_option`) rather than a fault.
     */
    providerId?: string;
    agent?: string;
    /** assistant only — the TURN's spend, on the message that produced it */
    tokens?: OpencodeSpend;
    cost?: number;
    /** why it stopped — `stop`, or the word the engine used for a cut turn */
    finish?: string;
    parts: OpencodePart[];
}

export interface OpencodeExport {
    id: string;
    title: string;
    directory: string;
    projectId: string;
    model: string;
    /** X-108 — the session's own `info.model.providerID`, kept beside the id it
     *  belongs to. '' when the export names none. */
    providerId: string;
    agent: string;
    /** the opencode build that wrote it — a drift signal, never a gate */
    version: string;
    created: number;
    updated: number;
    /** ‼️ the CONVERSATION's cumulative spend (verified: 6196+36 = 6232 input) */
    tokens: OpencodeSpend;
    cost: number;
    messages: OpencodeExportMessage[];
}

function spendFromExport(value: unknown): OpencodeSpend | undefined {
    const t = obj(value);
    if (!('input' in t) && !('output' in t) && !('total' in t)) { return undefined; }
    const cache = obj(t.cache);
    const spend: OpencodeSpend = {
        input: num(t.input),
        output: num(t.output),
        reasoning: num(t.reasoning),
        cacheRead: num(cache.read),
        cacheWrite: num(cache.write),
        total: num(t.total)
    };
    if (!spend.total) { spend.total = opencodeTotal(spend); }
    return spend;
}

/** The result of a tool call, as text a row can preview. */
function toolOutput(state: Record<string, unknown>): string {
    const out = state.output;
    if (typeof out === 'string') { return out; }
    const err = state.error;
    if (typeof err === 'string') { return err; }
    if (out === undefined && err === undefined) { return ''; }
    try { return JSON.stringify(out ?? err); } catch { return ''; }
}

function readPart(raw: unknown): OpencodePart | undefined {
    const p = obj(raw);
    const type = str(p.type);
    if (!type) { return undefined; }
    const time = obj(p.time);
    const base = {
        type,
        ...(num(time.start) ? { ts: num(time.start) } : {}),
        ...(num(time.end) ? { endTs: num(time.end) } : {})
    };
    if (type === 'text' || type === 'reasoning') {
        const text = str(p.text);
        if (!text.trim()) { return undefined; }
        return { kind: type, ...base, text };
    }
    if (type === 'tool') {
        // ‼️ THE STATE IS WHERE EVERYTHING IS. `{ tool, callID, state: { status,
        // input, output, metadata, title, time } }` — the name is on the part,
        // the arguments and the result are one level down, and a call that never
        // completed has a `status` and no `output` rather than no `state`.
        const state = obj(p.state);
        const stime = obj(state.time);
        const status = str(state.status);
        const output = toolOutput(state);
        return {
            kind: 'tool',
            type,
            tool: str(p.tool) || 'tool',
            callId: str(p.callID) || str(p.callId),
            status,
            ...(state.input !== undefined ? { input: state.input } : {}),
            ...(output ? { output } : {}),
            // The engine names a failed call `error`; nothing here sniffs the
            // text for the word, which is how the Codex reader mislabels a tool
            // that merely printed the word "error" in its output.
            ...(status === 'error' ? { isError: true } : {}),
            ...(num(stime.start) ? { ts: num(stime.start) } : base.ts !== undefined ? { ts: base.ts } : {}),
            ...(num(stime.end) ? { endTs: num(stime.end) } : {})
        };
    }
    if (type === 'step-finish') {
        const tokens = spendFromExport(p.tokens);
        return {
            kind: 'step-finish', ...base,
            ...(tokens ? { tokens } : {}),
            ...(typeof p.cost === 'number' ? { cost: num(p.cost) } : {})
        };
    }
    if (type === 'step-start') { return { kind: 'step-start', ...base }; }
    if (type === 'file') {
        // ‼️ NOT MEASURED — no attachment was sent in the A-16/K-25 runs. The
        // field names come from the protocol rather than from a frame on this
        // machine, so every one of them is optional and a part that matches none
        // of them still arrives as a row with its type on it.
        return {
            kind: 'file', ...base,
            ...(str(p.filename) || str(p.name) ? { filename: str(p.filename) || str(p.name) } : {}),
            ...(str(p.mime) || str(p.mimeType) ? { mime: str(p.mime) || str(p.mimeType) } : {}),
            ...(str(p.url) ? { text: str(p.url) } : {})
        };
    }
    return { kind: 'other', ...base, ...(str(p.text) ? { text: str(p.text) } : {}) };
}

/**
 * The export document, or `undefined` for anything that is not one.
 *
 * ‼️ IT MUST IDENTIFY ITSELF POSITIVELY. This parser sits in a chain with the
 * Codex, Gemini and Console readers over the same folders of `.json` files; a
 * reader that accepts "has an `info` key" would steal documents that belong to
 * one of the others. The marker is the id: `ses_…` is this engine's, on every
 * event of every transport, and nothing else in this codebase writes it.
 */
export function opencodeExport(stdout: string): OpencodeExport | undefined {
    const text = String(stdout ?? '');
    const start = text.indexOf('{');
    if (start < 0) { return undefined; }
    let raw: unknown;
    try { raw = JSON.parse(text.slice(start)); } catch { return undefined; }
    const doc = obj(raw);
    const info = obj(doc.info);
    const id = str(info.id).trim();
    if (!/^ses_[0-9a-zA-Z]+$/.test(id)) { return undefined; }
    const model = obj(info.model);
    const time = obj(info.time);
    const messages: OpencodeExportMessage[] = [];
    for (const rawMsg of Array.isArray(doc.messages) ? doc.messages : []) {
        const m = obj(rawMsg);
        const mi = obj(m.info);
        const role = str(mi.role);
        if (role !== 'user' && role !== 'assistant') { continue; }
        const mt = obj(mi.time);
        const mm = obj(mi.model);
        const tokens = spendFromExport(mi.tokens);
        const parts: OpencodePart[] = [];
        // ‼️ A MESSAGE WITH NO PARTS IS A REAL MESSAGE (measured: one assistant
        // row of a cancelled turn had an empty `parts`). Dropping it would make
        // a cut turn look like a turn that never opened.
        for (const rawPart of Array.isArray(m.parts) ? m.parts : []) {
            const part = readPart(rawPart);
            if (part) { parts.push(part); }
        }
        messages.push({
            role,
            id: str(mi.id),
            ts: num(mt.created),
            ...(num(mt.completed) ? { endTs: num(mt.completed) } : {}),
            // the user message carries `model: { providerID, modelID }`, the
            // assistant one carries the two as flat `providerID`/`modelID`
            ...(str(mm.modelID) || str(mi.modelID)
                ? { model: str(mm.modelID) || str(mi.modelID) } : {}),
            // X-108 — read from the same two spellings, and dropped no longer.
            ...(str(mm.providerID) || str(mi.providerID)
                ? { providerId: str(mm.providerID) || str(mi.providerID) } : {}),
            ...(str(mi.agent) ? { agent: str(mi.agent) } : {}),
            ...(tokens ? { tokens } : {}),
            ...(typeof mi.cost === 'number' ? { cost: num(mi.cost) } : {}),
            ...(str(mi.finish) ? { finish: str(mi.finish) } : {}),
            parts
        });
    }
    return {
        id,
        title: str(info.title).trim(),
        directory: str(info.directory),
        projectId: str(info.projectID) || str(info.projectId),
        model: str(model.id) || str(model.modelID),
        providerId: str(model.providerID),
        agent: str(info.agent),
        version: str(info.version),
        created: num(time.created),
        updated: num(time.updated) || num(time.created),
        tokens: spendFromExport(info.tokens) ?? {
            input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, total: 0
        },
        cost: num(info.cost),
        messages
    };
}

/**
 * A session the engine made and nobody ever spoke to.
 *
 * `opencode` opens a conversation the moment a client connects, so a probe run,
 * a cancelled start and a mis-clicked New all leave one behind — measured: three
 * of this machine's six sessions had zero messages and a title of the form
 * `New session - <ISO>`. They are real rows in the engine's store and this does
 * NOT delete them; it lets a surface say "empty" instead of showing a
 * conversation that is not there.
 */
export function opencodeSessionIsEmpty(doc: OpencodeExport): boolean {
    return !doc.messages.some(m => m.parts.some(p => p.kind === 'text' || p.kind === 'tool'));
}

/**
 * The title a row should wear. The engine derives one from the first real
 * prompt; until it has, it writes `New session - <ISO>`, which is a placeholder
 * and not a name — a table full of them tells the reader nothing, so the first
 * prompt is used when there is one and the placeholder only when there is not.
 */
export function opencodeTitle(doc: OpencodeExport, fallback: (text: string) => string): string {
    const engineTitle = doc.title.trim();
    if (engineTitle && !/^New session - /.test(engineTitle)) { return engineTitle; }
    const firstPrompt = doc.messages
        .find(m => m.role === 'user' && m.parts.some(p => p.kind === 'text' && p.text?.trim()));
    const text = firstPrompt?.parts.find(p => p.kind === 'text' && p.text?.trim())?.text ?? '';
    return text.trim() ? fallback(text) : (engineTitle || 'OpenCode session');
}

// ---------------------------------------------------------------------------
// One writer at a time
// ---------------------------------------------------------------------------

/**
 * ‼️ WHO ELSE IS WRITING TO THIS CONVERSATION — and the honest limit of the
 * answer.
 *
 * Two writers on one `ses_` id is the failure mode this engine invites: the
 * store is machine-wide, the id is public, and `opencode -s <id>` in a terminal
 * is one keystroke. Agent Farm knows about the sessions IT owns — a hosted
 * Console card, a running task — and knows NOTHING about the TUI the user has
 * open in another window. So this refuses on what it can see and never guesses
 * at what it cannot: an unknown owner is reported as unknown, not as free.
 *
 * The Console's own duplicate is already handled a layer up (`ConsoleHost.start`
 * hands back the live seat rather than opening a second one). This is for the
 * routes that have no seat: a task, a schedule, a bridge call.
 */
export interface OpencodeWriter {
    /** what holds it — 'console' | 'task', in the words a sentence can use */
    kind: string;
    /** the card or task it is, so the refusal can point at something */
    label: string;
}

export function opencodeWriterRefusal(sessionId: string, owner: OpencodeWriter | undefined): string {
    if (!owner) { return ''; }
    return `That OpenCode conversation (${sessionId}) is already open in ${owner.kind === 'console'
        ? 'a Console card' : 'a running task'} — ${owner.label}. Two writers on one session interleave `
        + 'their turns into the same history, so this one is not started. Go to the one that has it, '
        + 'wait for it to finish, or fork the conversation to carry on separately.';
}
