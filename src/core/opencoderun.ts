/**
 * M-14 — WHAT AN UNATTENDED `opencode run --format json` ACTUALLY SAYS.
 *
 * Every production surface in this codebase — a task, a schedule, a trigger, a
 * workflow step, a delegated mission, a retry — reaches the same place: a child
 * process whose stdout is archived to a file. For this engine that stdout is
 * JSONL, and it carries three things nothing else can supply: the real
 * conversation id (so the run can be resumed and its history found), the per-step
 * spend (so the row is not a blank in the cost column), and what the model
 * actually did. So there is ONE reader, here, and every surface uses it — which
 * is the rule M-14 states by name.
 *
 * ‼️ EVERY SHAPE BELOW IS A CAPTURE, not a reading of a documentation page.
 * `dist/measure/opencode-run.json` (one plain turn) and
 * `dist/measure/opencode-run-tools.json` (a turn with a tool call), opencode
 * 1.18.18, 2026-08-15. Four of them are traps:
 *
 *   1. **THE LINE'S `type` AND THE PART'S `type` DISAGREE ON PUNCTUATION.** The
 *      line says `step_start` / `step_finish` with UNDERSCORES; the part inside
 *      it says `step-start` / `step-finish` with HYPHENS. One reader keyed on
 *      the wrong one sees no events at all and reports a successful run as
 *      empty.
 *   2. **`tool_use` ARRIVES ONCE, ALREADY FINISHED.** Over ACP the same call is
 *      a lifecycle — `pending → in_progress → completed` — and K-25's reducer is
 *      built on it. Here there is a single line carrying the completed `state`,
 *      input and output together. A reader that waited for a `completed` update
 *      would draw nothing.
 *   3. **THE STEPS ARE SUMMED, NOT DIFFERENCED.** Measured on a two-step turn:
 *      step 1 `{ total: 8167, input: 40, cache.read: 8064 }`, step 2
 *      `{ total: 25318, input: 17248, cache.read: 8064 }`. The same 8 064 cached
 *      tokens are in both because both were real model calls that really read
 *      them, and the second step's input is LARGER than the first's — a running
 *      total that a delta could be taken against cannot behave like that. Codex's
 *      correct subtraction, applied here, reports the expensive step as free.
 *   4. **`reason` IS NOT A STATUS.** An intermediate step finishes with
 *      `tool-calls` and only the last one with `stop`; reading the first as an
 *      ending would cut every turn that used a tool.
 *
 * Pure: text in, figures out. No spawning, no fs, no vscode.
 */

import { OpencodeSpend, opencodeRunEvent, opencodeTotal } from './opencode';

/** One model call inside a turn — a `step_finish` line, with what it cost. */
export interface OpencodeRunStep {
    /** `stop` on the last one, `tool-calls` on a step that handed off to a tool */
    reason: string;
    spend: OpencodeSpend;
    cost: number;
    ts: number;
}

/** One tool call, as the archive and the task row need it. */
export interface OpencodeRunTool {
    name: string;
    callId: string;
    status: string;
    input: unknown;
    output: string;
    isError: boolean;
    ts: number;
}

export interface OpencodeRunOutcome {
    /** ‼️ THE REAL CONVERSATION ID, off the FIRST line — this is what a task row
     *  needs to be resumable and what binds the run to its history. Empty means
     *  the run never got as far as opening a conversation, which is a different
     *  failure from "it ran and said nothing". */
    sessionId: string;
    /** what the model wrote — the answer, in order, with the steps joined */
    text: string;
    steps: OpencodeRunStep[];
    tools: OpencodeRunTool[];
    /** the whole turn's spend: the SUM of the steps (see trap 3) */
    spend: OpencodeSpend;
    /** the engine's own dollars, summed. 0 on a free model is a REAL zero. */
    cost: number;
    /** the last step's `reason`, which is how the turn ended */
    finish: string;
    firstTs: number;
    lastTs: number;
    /** lines that were not JSON events — a banner, a plugin warning, a half
     *  line at the end of a killed process. Kept as a count, because a run that
     *  produced nothing BUT these is a different story from a clean one. */
    unparsed: number;
}

function obj(v: unknown): Record<string, unknown> {
    return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
}

function num(v: unknown): number { return typeof v === 'number' && Number.isFinite(v) ? v : 0; }

function str(v: unknown): string { return typeof v === 'string' ? v : ''; }

function spendOf(value: unknown): OpencodeSpend {
    const t = obj(value);
    const cache = obj(t.cache);
    const spend: OpencodeSpend = {
        input: num(t.input), output: num(t.output), reasoning: num(t.reasoning),
        cacheRead: num(cache.read), cacheWrite: num(cache.write), total: num(t.total)
    };
    if (!spend.total) { spend.total = opencodeTotal(spend); }
    return spend;
}

function addSpend(into: OpencodeSpend, from: OpencodeSpend): void {
    into.input += from.input;
    into.output += from.output;
    into.reasoning += from.reasoning;
    into.cacheRead += from.cacheRead;
    into.cacheWrite += from.cacheWrite;
    into.total += from.total;
}

function toolOf(part: Record<string, unknown>, ts: number): OpencodeRunTool {
    // The same shape the export's `tool` part carries — name on the part,
    // everything else one level down in `state` (S-33 measured it there too).
    const state = obj(part.state);
    const status = str(state.status);
    const out = state.output !== undefined ? state.output : state.error;
    return {
        name: str(part.tool) || 'tool',
        callId: str(part.callID) || str(part.callId),
        status,
        input: state.input,
        output: typeof out === 'string' ? out
            : out === undefined ? ''
                : (() => { try { return JSON.stringify(out); } catch { return ''; } })(),
        isError: status === 'error',
        ts: num(obj(state.time).start) || ts
    };
}

/**
 * The whole run, from whatever its stdout turned out to be.
 *
 * FAIL-SOFT THROUGHOUT, because this reads a file that may have been written by
 * a process somebody killed: a truncated last line, a plugin's banner and a
 * completely empty output all produce an outcome rather than an exception. What
 * they do NOT produce is a fabricated figure — an unread run has an empty
 * `sessionId` and zeros, and the caller can tell that from a real zero because
 * `steps` is empty too.
 */
export function readOpencodeRun(stdout: string): OpencodeRunOutcome {
    const out: OpencodeRunOutcome = {
        sessionId: '', text: '', steps: [], tools: [],
        spend: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        cost: 0, finish: '', firstTs: 0, lastTs: 0, unparsed: 0
    };
    const texts: string[] = [];
    for (const line of String(stdout ?? '').split(/\r?\n/)) {
        if (!line.trim()) { continue; }
        const event = opencodeRunEvent(line);
        if (!event) { out.unparsed++; continue; }
        // The id is on EVERY line; the first one that has it is the binding, and
        // it is never overwritten — one `run` is one conversation.
        if (!out.sessionId && event.sessionID) { out.sessionId = event.sessionID; }
        let raw: Record<string, unknown> = {};
        try { raw = obj(JSON.parse(line)); } catch { /* opencodeRunEvent already parsed it */ }
        const ts = num(raw.timestamp);
        if (ts) {
            if (!out.firstTs) { out.firstTs = ts; }
            out.lastTs = Math.max(out.lastTs, ts);
        }
        // ‼️ THE LINE SAYS `step_finish`, THE PART SAYS `step-finish`. Keyed on
        // the line's word, which is the one that names the event.
        switch (event.type) {
            case 'text': {
                const text = str(event.part.text);
                if (text.trim()) { texts.push(text); }
                break;
            }
            case 'reasoning': {
                // Not part of the answer — the archive shows what was said, and
                // the model's private thinking is neither the answer nor a tool.
                break;
            }
            case 'tool_use': {
                out.tools.push(toolOf(event.part, ts));
                break;
            }
            case 'step_finish': {
                const spend = spendOf(event.part.tokens);
                const cost = num(event.part.cost);
                out.steps.push({ reason: str(event.part.reason), spend, cost, ts });
                // SUMMED. See trap 3 in this file's header — the cached read is
                // genuinely paid by every call that makes it.
                addSpend(out.spend, spend);
                out.cost += cost;
                break;
            }
            default: break;   // step_start, and whatever a later build adds
        }
    }
    out.text = texts.join('\n').trim();
    // ‼️ The turn ends with the LAST step's reason. An intermediate `tool-calls`
    // is a hand-off, not an ending.
    out.finish = out.steps.length ? out.steps[out.steps.length - 1].reason : '';
    return out;
}

/**
 * The conversation id, as early as it can possibly be known.
 *
 * A task binds its run to a session so the row can be resumed, the history found
 * and the cost attributed — and waiting for the process to CLOSE to learn the id
 * means a run that is killed, or that the window outlives, was never bound at
 * all. The id is on the first line this engine prints, so the binding can be
 * made while the run is still going.
 */
export function opencodeRunSessionId(chunk: string): string {
    for (const line of String(chunk ?? '').split(/\r?\n/)) {
        const event = opencodeRunEvent(line);
        if (event?.sessionID) { return event.sessionID; }
    }
    return '';
}

/**
 * What the archived output IS, for the run's own header.
 *
 * ‼️ NOT AN ENVELOPE. Antigravity and Gemini each print one JSON object with the
 * answer, the cost and the id inside it; this engine prints a STREAM, and a
 * reader told to look for an envelope finds none and calls the run empty. The
 * permission sentence is deliberately NOT repeated here — `opencodeModeNote()`
 * is the one place that says what a mode means on this engine, and it already
 * covers the unattended case.
 */
export const OPENCODE_RUN_OUTPUT_NOTE =
    'a JSONL event stream from `opencode run --format json`, not one envelope — '
    + '`sessionID` on every line is what resumes it, `text` lines are the answer, '
    + '`tool_use` carries each call already completed, and each `step_finish` is one '
    + 'model call\'s own tokens and cost (they are summed, never differenced)';
