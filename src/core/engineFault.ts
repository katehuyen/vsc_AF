/**
 * X-427 — WHAT KIND OF ENGINE FAULT FAILED A TURN.
 *
 * A Console turn that fails on the engine's side leaves its session alive and
 * idle — nothing that waits for a session END ever hears of it, so a relay
 * leg stalled there in silence. This names the fault from the engine's own
 * words, because each kind wants the opposite answer:
 *   flagged — the conversation itself is refused; nothing said in THIS session
 *             will be answered again, so the work moves to a new one;
 *   outage  — the remote service is down, overloaded, unreachable or rate
 *             limited; a new session would fail the same way, so the same one
 *             waits and is asked again;
 *   auth    — the sign-in is refused; waiting helps once a person signs in.
 * Pure: text in, verdict out.
 */
export type EngineFaultKind = 'flagged' | 'outage' | 'auth' | 'none';

export interface EngineFault {
    kind: EngineFaultKind;
    /** the engine's own words, one line, cut to fit a row */
    said: string;
}

const FLAGGED: readonly RegExp[] = [
    /safeguards? (have )?flagged/i,
    /flagged (this|your|the) (message|request|prompt|content|conversation)/i,
    /violat\w* (our |the )?(usage|acceptable use|content) polic/i,
    /anthropic\.com\/legal\/aup/i,
    /content[_ ]policy[_ ]violation/i,
    /blocked (due to|for|by) (the )?(safety|content)/i,
    /finish_?reason\W{0,4}safety/i,
    /can'?t respond to this message/i
];

const AUTH: readonly RegExp[] = [
    /(api error|error|status|http)\W{0,12}40[13]\b/i,
    /unauthori[sz]ed/i,
    /invalid (api[ -]?key|x-api-key|bearer|token|credentials)/i,
    /authentication[_ ](error|failed)/i,
    /oauth token (has )?(expired|been revoked)/i,
    /please run \/login/i,
    /not logged in/i,
    /credit balance is too low/i
];

const OUTAGE: readonly RegExp[] = [
    /(api error|error|status|http)\W{0,12}(5\d\d|429)\b/i,
    /overloaded/i,
    /internal server error/i,
    /service (is )?(temporarily )?unavailable/i,
    /bad gateway/i,
    /gateway time-?out/i,
    /\b(ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EPIPE)\b/,
    /socket hang up/i,
    /fetch failed/i,
    /network (error|is unreachable)/i,
    /connection (error|refused|reset|closed)/i,
    /request timed? ?out/i,
    /rate[_ ]limit/i,
    /too many requests/i,
    /usage limit reached/i,
    /try again later/i
];

const ROW = 200;

function oneLine(text: string): string {
    const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
    return flat.length > ROW ? flat.slice(0, ROW - 1) + '…' : flat;
}

/** Flagged first (its message also says "API Error"), then auth, then outage. */
export function classifyEngineFault(text: string): EngineFault {
    const t = String(text ?? '');
    if (!t.trim()) { return { kind: 'none', said: '' }; }
    const kind: EngineFaultKind = FLAGGED.some(r => r.test(t)) ? 'flagged'
        : AUTH.some(r => r.test(t)) ? 'auth'
            : OUTAGE.some(r => r.test(t)) ? 'outage' : 'none';
    return { kind, said: kind === 'none' ? '' : oneLine(t) };
}

/** The little of a Console message this reads. */
export interface FaultMessage {
    role: string;
    text?: string;
    isError?: boolean;
}

/**
 * The words to classify for the turn that just ended: its closing error, and
 * any engine error said in the talk since the last user message (an engine
 * that prints "API Error: …" as the reply and closes with a bare subtype).
 * Only error text — an agent's own prose about "an overloaded queue" is never read.
 */
export function faultText(messages: readonly FaultMessage[]): string {
    let start = 0;
    for (let i = messages.length - 1; i >= 0; i--) { if (messages[i].role === 'user') { start = i + 1; break; } }
    const out: string[] = [];
    for (const m of messages.slice(start)) {
        const text = String(m.text ?? '').trim();
        if (!text) { continue; }
        if ((m.role === 'result' && m.isError) || m.role === 'error' || (m.role === 'agent' && /^api error\b/i.test(text))) {
            out.push(text);
        }
    }
    return out.join('\n');
}
