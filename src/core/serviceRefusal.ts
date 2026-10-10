/**
 * X-532 — WHAT THE SERVICE BEHIND A MODEL SAID WHEN IT TURNED THE TURN DOWN.
 *
 * A route's test turn reaches a third party, and a third party has limits and
 * keys of its own. Measured: OpenRouter's daily free limit (HTTP 429) was
 * reported as "this sign-in's five-hour limit" and as "the engine was never
 * asked" — neither true: the address and the key had been accepted, and the
 * limit was the service's. Read here from the engine's own output, in the two
 * shapes measured against the real CLIs:
 *
 *   OpenCode  {"type":"error",…"error":{"name":"APIError","data":{"message":"…","statusCode":429,…
 *   Claude    API Error: Request rejected (429) · …     /    API Error: 401 …
 *
 * Pure. Nothing is guessed from a model name or a word like "limit": without an
 * HTTP status in the engine's own error there is no answer here.
 */

export interface ServiceRefusal {
    status: number;
    /** `limit` — the service's own quota (429). `auth` — it did not accept the key (401, 403). */
    kind: 'limit' | 'auth';
    /** The service's own sentence. */
    message: string;
    /** When its limit reopens (epoch ms), where the output carried `X-RateLimit-Reset`. */
    resetAt?: number;
}

const KIND: Record<number, ServiceRefusal['kind']> = { 429: 'limit', 401: 'auth', 403: 'auth' };

function statusOf(line: string): number {
    const m = /"statusCode"\s*:\s*(\d{3})\b/.exec(line)
        ?? /API Error:[^\n]*?\((\d{3})\)/.exec(line)
        ?? /API Error:\s*(\d{3})\b/.exec(line);
    return m ? Number(m[1]) : 0;
}

function messageOf(line: string): string {
    const said = /API Error:\s*(?:[^\n]*?\(\d{3}\)\s*·\s*|\d{3}\s+)([^\n]*)/.exec(line);
    if (said && said[1].trim() && !said[1].trim().startsWith('{')) { return said[1].trim(); }
    for (const m of line.matchAll(/"message"\s*:\s*"([^"]+)"/g)) {
        if (!/^\d{3}\s*\{?$/.test(m[1].trim())) { return m[1].trim(); }
    }
    return '';
}

export function serviceRefusal(output: string): ServiceRefusal | undefined {
    // The body is quoted inside the event, sometimes twice: one level of text is enough to read it.
    const text = String(output ?? '').replace(/\\+"/g, '"');
    for (const line of text.split('\n')) {
        const status = statusOf(line);
        const kind = KIND[status];
        if (!kind) { continue; }
        const reset = /x-ratelimit-reset"?\s*:\s*"?(\d{10,13})\b/i.exec(text);
        const at = reset ? Number(reset[1]) * (reset[1].length <= 10 ? 1000 : 1) : 0;
        return { status, kind, message: messageOf(line).slice(0, 300), ...(at ? { resetAt: at } : {}) };
    }
    return undefined;
}

/** `2026-10-11 00:00 UTC` — a moment, never a span: the verdict is stored and read hours later. */
export function reopensAt(resetAt: number | undefined): string {
    return resetAt ? `${new Date(resetAt).toISOString().slice(0, 16).replace('T', ' ')} UTC` : '';
}

/**
 * The verdict a test turn gets for it. A LIMIT is the held state: the turn went
 * out, the address and the key were accepted, and nothing about the route was
 * disproved — `reached` says the service was asked, so no surface claims that
 * nothing was called. A refused KEY is a real failure of the route.
 */
export function serviceVerdict(r: ServiceRefusal): { refused?: true; reached: true; detail: string; error?: string; resetAt?: number } {
    if (r.kind === 'auth') {
        return {
            reached: true,
            detail: `The service answered HTTP ${r.status} — it did not accept the key it was sent. The address was reached; `
                + 'check the key stored for this route.',
            ...(r.message ? { error: r.message } : {})
        };
    }
    const when = reopensAt(r.resetAt);
    return {
        refused: true, reached: true,
        detail: `Not proved: the service that serves this model answered HTTP ${r.status} — a limit of its own is spent, `
            + `not this sign-in's plan window.${when ? ` It reopens at ${when}.` : ''} The address and the key were `
            + 'accepted, so nothing here is a verdict on the route.',
        ...(r.message ? { error: r.message } : {}),
        ...(r.resetAt ? { resetAt: r.resetAt } : {})
    };
}
