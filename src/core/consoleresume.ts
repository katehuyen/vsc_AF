/**
 * Which past sessions the Console offers to resume — and which of them a
 * filter lets through.
 *
 * The list used to be a fixed sentence: your shelf, plus the fifteen newest
 * transcripts. That answers "carry on with what I was just doing" and nothing
 * else — the session from last Tuesday existed, was indexed, and was simply
 * unreachable from the panel unless fourteen newer ones had not happened.
 *
 * So the panel asks a QUESTION instead, and this module answers it. It is the
 * same vocabulary the Sessions tables filter with (text · agent · who started
 * it · the shelf · a date window · how many), deliberately not a second
 * filtering language — just the miniature subset that fits a 250px column.
 *
 * Pure: no io, no vscode, no index. The panel maps its own rows in and out.
 */

/** What the panel asks for. Every field is optional; an empty query is the
 *  default list, unchanged — a filter you did not set never narrows anything. */
export interface ResumeQuery {
    /** matched against the session's name, its agent and its labels */
    text?: string;
    /** exactly one agent's sessions; '' = every agent */
    agent?: string;
    /** '' = any time · '1' | '7' | '30' | '90' = that many days back · 'custom' = from/to */
    when?: string;
    /** ISO dates (YYYY-MM-DD), used when `when` is 'custom'; `to` is inclusive */
    from?: string;
    to?: string;
    /** only the sessions on your shelf */
    pinnedOnly?: boolean;
    /** only the ones a person started — hides schedule / trigger / task runs */
    userOnly?: boolean;
    /** how many rows to list, not counting the shelf (see RESUME_DEFAULT_N) */
    limit?: number;
}

/** A row this module can decide about. The panel's own session rows satisfy it. */
export interface ResumeCandidate {
    title?: string;
    agentName?: string;
    tags?: string[];
    pinned?: boolean;
    /** when the session was last touched */
    ts: number;
    origin?: 'user' | 'auto';
}

/** The list's default length — what it showed before it could be asked anything. */
export const RESUME_DEFAULT_N = 15;
/**
 * The most rows the panel will ever send, whatever the query says.
 *
 * The Console re-sends its whole state on every event of every hosted session
 * — several times a second while a turn streams — so this list is not a page
 * that is rendered once. "Show all" on a farm with three thousand transcripts
 * would put all of them on that wire, ten times a second, to fill a column
 * nobody can read. The footer says when the cap is what you are looking at.
 */
export const RESUME_MAX = 200;

const DAY = 24 * 3600 * 1000;

/**
 * The time window a query means, as [from, to) in epoch ms.
 *
 * `to` is exclusive and a custom end date includes its whole day: picking
 * 5 August and getting nothing that happened on 5 August is the kind of
 * off-by-one that makes a filter untrustworthy.
 */
export function resumeRange(q: ResumeQuery, now: number): { from: number; to: number } {
    const when = String(q.when ?? '');
    if (when === 'custom') {
        const from = Date.parse(String(q.from ?? ''));
        const to = Date.parse(String(q.to ?? ''));
        return {
            from: isNaN(from) ? 0 : from,
            to: isNaN(to) ? Number.MAX_SAFE_INTEGER : to + DAY
        };
    }
    const days = Number(when);
    if (!days || !isFinite(days) || days <= 0) { return { from: 0, to: Number.MAX_SAFE_INTEGER }; }
    return { from: now - days * DAY, to: Number.MAX_SAFE_INTEGER };
}

/** Does this query ask for anything at all? A `false` here must leave the list
 *  exactly as it was before filtering existed. */
export function isResumeFiltered(q: ResumeQuery): boolean {
    return !!(String(q.text ?? '').trim() || String(q.agent ?? '') || String(q.when ?? '')
        || q.pinnedOnly || q.userOnly);
}

/**
 * Answer the query.
 *
 * Order: the shelf first (pinned sessions are the ones you said you would come
 * back to), then the most recent. **Pinned rows are exempt from `limit`**, the
 * same rule the Sessions tables' star column follows — a shelf that a row count
 * can hide is not a shelf.
 *
 * `total` is how many sessions MATCHED, before the limit, so the panel can say
 * "20 of 1240" rather than pretending the list is everything.
 */
export function filterResumable<T extends ResumeCandidate>(
    rows: T[], q: ResumeQuery, now: number
): { rows: T[]; total: number } {
    const text = String(q.text ?? '').trim().toLowerCase();
    const agent = String(q.agent ?? '');
    const { from, to } = resumeRange(q, now);
    const hits = rows.filter(r => {
        if (q.pinnedOnly && !r.pinned) { return false; }
        if (q.userOnly && r.origin === 'auto') { return false; }
        if (agent && (r.agentName ?? '') !== agent) { return false; }
        if (r.ts < from || r.ts >= to) { return false; }
        if (text) {
            const hay = `${r.title ?? ''} ${r.agentName ?? ''} ${(r.tags ?? []).join(' ')}`.toLowerCase();
            if (hay.indexOf(text) < 0) { return false; }
        }
        return true;
    });
    hits.sort((a, b) => (a.pinned === b.pinned ? b.ts - a.ts : (a.pinned ? -1 : 1)));
    const n = Number(q.limit);
    const limit = isFinite(n) && n > 0 ? Math.floor(n) : RESUME_DEFAULT_N;
    const out: T[] = [];
    let free = limit;
    for (const r of hits) {
        if (out.length >= RESUME_MAX) { break; }
        if (r.pinned) { out.push(r); continue; }   // the shelf is never cut
        if (free <= 0) { continue; }
        free--;
        out.push(r);
    }
    return { rows: out, total: hits.length };
}
