import { HandoverNote, parseHandoverName, shortSessionId } from './sessionDiagnosis';

/**
 * X-189 — THE HANDOVER NOTE IS LOOKED FOR WHERE IT WAS ACTUALLY WRITTEN.
 *
 * What shipped: one hard-coded folder (`cevapDir()`), one millimetric name
 * pattern (`NAME_RE`), and every part of both mandatory. An agent that wrote
 * its note somewhere else — or called it something else — was invisible, and
 * the sentry then diagnosed `hit-the-wall` about a session that had handed over
 * perfectly well. That is not a missing measurement, it is a FALSE one: it
 * sends the next round after the wrong thing, and the user finds out in the
 * morning.
 *
 * The user's instruction was about the shape of the program, not this folder:
 * "hiç bugünün klasörüne göre program yazılır mı" — a program is written
 * open-ended, elastic, adaptable. So:
 *
 * ‼️ FOUR SOURCES, IN ORDER, AND THE ORDER IS THE ARGUMENT.
 *
 *   1. `transcript`   — the files the finished session ITSELF wrote. The most
 *                       truthful source there is, because where the agent
 *                       actually wrote beats where a setting says it should.
 *   2. `configured`   — the user's own path list (X-188 variables).
 *   3. `projectNotes` — the project's own notes folder.
 *   4. `fallback`     — the legacy vault folder. Last, and only there: "en
 *                       fazla olsa olsa bu şimdiki klasörler fallback olarak
 *                       sisteme girebilir".
 *
 * ‼️ SCORING REPLACES THE ALL-OR-NOTHING PATTERN — NOT THE IDENTITY CHECK.
 *
 * The pattern was the defect; identity never was. `handoverFor` was right to
 * find a note "by the id it names rather than by position in the folder", and
 * relaxing THAT would be a far worse bug than the one being fixed: adopting
 * another session's handover note sends the next round after somebody else's
 * work with full confidence. `devir` + today's date + a canonical name
 * describes every note in the folder.
 *
 * So identity is the floor and the score is the ranking:
 *
 *   identity  +3  proven EITHER by the id in the name OR by the session having
 *                 written the file (`authored`) — one component, two proofs,
 *                 never added twice, because they establish the same fact
 *   word      +2  `devir` / `handover` in the name
 *   recent    +1  a date in the name near today, or failing that a fresh mtime
 *   canonical +2  the full `YYYY-MM-DD_devir_##_<sid8>_<topic>.md` pattern —
 *                 still PREFERRED, just no longer required
 *
 * ‼️ AND NOT LISTED IS NOT EMPTY. X-174's law, unchanged: a source that could
 * not be read goes on `unknown`, a source that was read and had nothing in it
 * is evidence. Blurring them is how "no handover note" gets said about a folder
 * nobody opened.
 *
 * Pure: no `fs`, no `path`, no `vscode`. The host lists the folders and hands
 * the listings in; this module only decides.
 */

/** Where a candidate came from. The array below is the order they are tried. */
export type HandoverSource = 'transcript' | 'configured' | 'projectNotes' | 'fallback';

/** ‼️ THE ORDER LIVES HERE AND NOWHERE ELSE, so a settings page draws this list
 *  rather than repeating it and drifting from it. */
export const HANDOVER_SOURCES: HandoverSource[] = [
    'transcript', 'configured', 'projectNotes', 'fallback'
];

export const HANDOVER_SOURCE_NOTES: { source: HandoverSource; describe: string }[] = [
    {
        source: 'transcript',
        describe: 'files the finished session itself wrote — the most truthful source, '
            + 'because where the agent actually wrote beats where a setting says it should have'
    },
    { source: 'configured', describe: 'the folders you list yourself, which may carry ${vault}, ${projectNotes}, ${today} …' },
    { source: 'projectNotes', describe: 'the notes folder of the project the campaign is running' },
    { source: 'fallback', describe: 'the folder this extension shipped with — last resort, and never reached once the others answer' }
];

/** The score at which a candidate is adopted. Identity alone reaches it; every
 *  further point is corroboration a campaign may choose to demand. */
export const DEFAULT_HANDOVER_THRESHOLD = 3;

/** How near "near today" is, in days. Yesterday counts: a night run hands over
 *  across midnight and its note carries the day it started. */
export const DEFAULT_HANDOVER_RECENT_DAYS = 1;

/** One file, as the host found it. */
export interface HandoverCandidate {
    /** the file NAME, not the path — the folder is the listing's business */
    file: string;
    source: HandoverSource;
    /** the folder it was found in, when the host knew it */
    dir?: string;
    /** ‼️ the finished session itself wrote this file. Proof of identity. */
    authored?: boolean;
    /** when it was last written, when the host measured it */
    mtimeMs?: number;
}

export interface HandoverScore {
    score: number;
    /** the components that scored, by name: id · authored · word · recent · canonical */
    parts: string[];
    /** does this file belong to THIS session at all — the floor, not the score */
    identified: boolean;
    /** the canonical fields, when the name carried them */
    note?: HandoverNote;
    /** one sentence about why it was refused; '' when it was not */
    why: string;
}

/** A candidate that cleared the identity floor, with everything a surface or a
 *  condition needs to talk about it. */
export interface HandoverHit extends HandoverScore {
    file: string;
    source: HandoverSource;
    dir?: string;
    /** dir + file, when the source knew its folder */
    path?: string;
    /** carried through from the candidate, so the newest file can break a tie */
    mtimeMs?: number;
    /** the canonical fields, flattened — a caller reading `.file` still works */
    date?: string;
    seq?: number;
    session?: string;
    topic?: string;
}

/** One folder the host either listed or could not. */
export interface HandoverListing {
    source: HandoverSource;
    dir?: string;
    /** ‼️ `undefined` = NOT LISTED. `[]` = listed and empty. Never the same thing. */
    files?: string[];
    /** which of `files` this session wrote itself */
    authored?: string[];
    /** file name → mtime, for the ones the host measured */
    mtimes?: Record<string, number>;
    /** why it could not be listed — the caller's own sentence, passed through */
    skipped?: string;
}

export interface HandoverDiscoveryOptions {
    sessionId: string;
    /** YYYY-MM-DD; the day "recent" is measured against */
    today?: string;
    /** overridable so a test is not a clock */
    now?: number;
    threshold?: number;
    recentDays?: number;
}

export interface HandoverDiscovery {
    /** the note that was adopted, if any */
    hit?: HandoverHit;
    /** every identified candidate, best first — the runners-up are not thrown away */
    considered: HandoverHit[];
    /** ‼️ was ANY source actually read. false = say nothing about whether a note exists */
    measured: boolean;
    /** one sentence per source that could not be read */
    unknown: string[];
    /** what was seen, including what was rejected and why */
    evidence: string[];
    /** one line a person reads */
    why: string;
}

const MD_RE = /\.md$/i;
const DATE_RE = /(\d{4})-(\d{2})-(\d{2})/;
const WORD_RE = /(^|[^a-z0-9])(devir|handover|hand-over)([^a-z0-9]|$)/i;
const DAY_MS = 86400000;

/** Days between two `YYYY-MM-DD` strings, read as calendar days rather than as
 *  local instants — a note written at 23:50 is not "yesterday" because of a
 *  timezone. */
function daysApart(a: string, b: string): number | undefined {
    const pa = /^(\d{4})-(\d{2})-(\d{2})$/.exec(a), pb = /^(\d{4})-(\d{2})-(\d{2})$/.exec(b);
    if (!pa || !pb) { return undefined; }
    const ms = (p: RegExpExecArray) => Date.UTC(Number(p[1]), Number(p[2]) - 1, Number(p[3]));
    return Math.abs(ms(pa) - ms(pb)) / DAY_MS;
}

/**
 * Score one candidate against one session.
 *
 * The two ways identity can be proven are folded into ONE component on purpose.
 * A file that both names the session and was written by it has not become twice
 * as likely to be the note — it has established the same fact twice — and
 * paying for it twice would let an authored scratch file outrank the real
 * handover note sitting in the configured folder.
 */
export function scoreHandover(
    c: HandoverCandidate, o: HandoverDiscoveryOptions
): HandoverScore {
    const file = String(c?.file ?? '').trim();
    const short = shortSessionId(o.sessionId ?? '');
    const parts: string[] = [];
    let score = 0;

    if (!MD_RE.test(file)) {
        return { score: 0, parts, identified: false, why: `${file} is not a markdown file.` };
    }
    if (short.length < 8) {
        return {
            score: 0, parts, identified: false,
            why: 'the finished session has no id, so there is nothing to look for.'
        };
    }

    const lower = file.toLowerCase();
    const note = parseHandoverName(file);
    const byName = lower.includes(short);
    const byAuthor = !!c.authored;

    // ‼️ A canonical name that spells out SOMEBODY ELSE'S session is not a near
    // miss to be rescued by its other points — it is a different session's note,
    // and adopting it is the worst outcome this module has.
    if (note && note.session !== short && !byAuthor) {
        return {
            score: 0, parts, identified: false, note,
            why: `${file} is the handover note of session ${note.session}, not ${short}.`
        };
    }

    if (byName) { parts.push('id'); }
    if (byAuthor) { parts.push('authored'); }
    if (byName || byAuthor) { score += 3; }

    if (WORD_RE.test(lower)) { parts.push('word'); score += 2; }

    const within = Math.max(0, o.recentDays ?? DEFAULT_HANDOVER_RECENT_DAYS);
    const inName = DATE_RE.exec(file);
    const today = String(o.today ?? '').trim();
    let recent = false;
    if (inName && today) {
        const d = daysApart(inName[0], today);
        recent = d !== undefined && d <= within;
    } else if (typeof c.mtimeMs === 'number' && typeof o.now === 'number') {
        const age = o.now - c.mtimeMs;
        recent = age <= (within + 1) * DAY_MS && age >= -DAY_MS;
    }
    if (recent) { parts.push('recent'); score += 1; }

    if (note) { parts.push('canonical'); score += 2; }

    const identified = byName || byAuthor;
    return {
        score, parts, identified,
        ...(note ? { note } : {}),
        why: identified ? '' : `${file} says nothing about session ${short}.`
    };
}

/** Join a folder and a file without `path`, keeping whichever separator the
 *  caller's folder already speaks. */
function join(dir: string | undefined, file: string): string | undefined {
    const d = String(dir ?? '').trim();
    if (!d) { return undefined; }
    const sep = d.includes('\\') && !d.includes('/') ? '\\' : '/';
    return /[\\/]$/.test(d) ? d + file : d + sep + file;
}

const rank = (s: HandoverSource): number => {
    const i = HANDOVER_SOURCES.indexOf(s);
    return i < 0 ? HANDOVER_SOURCES.length : i;
};

/**
 * Look through everywhere the host managed to list, and decide.
 *
 * Ranking, in order: the score, then the SOURCE (an earlier source is the more
 * truthful one — that is the whole argument for having an order), then the
 * daily counter (a long session may hand over twice and the last one is the
 * live instruction — X-174's law, kept), then the newest file.
 */
export function discoverHandover(
    listings: HandoverListing[] | undefined, o: HandoverDiscoveryOptions
): HandoverDiscovery {
    const unknown: string[] = [];
    const evidence: string[] = [];
    const considered: HandoverHit[] = [];
    const threshold = typeof o.threshold === 'number' ? o.threshold : DEFAULT_HANDOVER_THRESHOLD;
    const short = shortSessionId(o.sessionId ?? '');

    if (short.length < 8) {
        return {
            considered, measured: false,
            unknown: ['the finished session has no id, so a handover note cannot be looked for'],
            evidence,
            why: 'no session id — nothing to look for.'
        };
    }

    const rows = Array.isArray(listings) ? listings : [];
    let measured = false;

    for (const l of rows) {
        if (!l || !l.files) {
            const why = String(l?.skipped ?? '').trim();
            unknown.push(why
                ? `the ${l?.source ?? 'unnamed'} handover source could not be read — ${why}`
                : `the ${l?.source ?? 'unnamed'} handover source was not read, so a note there cannot be ruled out`);
            continue;
        }
        measured = true;
        const authored = new Set((l.authored ?? []).map(f => String(f)));
        for (const f of l.files) {
            const file = String(f ?? '');
            const c: HandoverCandidate = {
                file, source: l.source,
                ...(l.dir ? { dir: l.dir } : {}),
                ...(authored.has(file) ? { authored: true } : {}),
                ...(l.mtimes && typeof l.mtimes[file] === 'number' ? { mtimeMs: l.mtimes[file] } : {})
            };
            const s = scoreHandover(c, o);
            if (!s.identified) {
                // Only a file that LOOKS like a handover note is worth reporting
                // as rejected — listing every unrelated file in the folder is
                // noise. A near miss is exactly what a person wants to see when
                // they are wondering why their note was not picked up.
                if (s.note || s.parts.includes('word')) { evidence.push(s.why); }
                continue;
            }
            considered.push({
                ...s, file, source: l.source,
                ...(l.dir ? { dir: l.dir } : {}),
                ...(join(l.dir, file) ? { path: join(l.dir, file) as string } : {}),
                ...(typeof c.mtimeMs === 'number' ? { mtimeMs: c.mtimeMs } : {}),
                ...(s.note ? { date: s.note.date, seq: s.note.seq, session: s.note.session, topic: s.note.topic } : {})
            });
        }
    }

    if (!measured && !rows.length) {
        unknown.push('no handover source was listed, so a note cannot be ruled out');
    }

    considered.sort((a, b) =>
        (b.score - a.score)
        || (rank(a.source) - rank(b.source))
        || ((b.seq ?? 0) - (a.seq ?? 0))
        || ((b.mtimeMs ?? 0) - (a.mtimeMs ?? 0))
        || (a.file < b.file ? 1 : a.file > b.file ? -1 : 0));

    const hit = considered.find(c => c.score >= threshold);
    if (hit) {
        evidence.push(`handover note: ${hit.path ?? hit.file} (${hit.source}, score ${hit.score})`);
    } else if (measured) {
        evidence.push(considered.length
            ? `no handover note reached the threshold of ${threshold}; the best was ${considered[0].file} at ${considered[0].score}`
            : 'no handover note names this session');
    }

    return {
        ...(hit ? { hit } : {}),
        considered, measured, unknown, evidence,
        why: hit
            ? `${hit.file} was found in ${hit.source} and scored ${hit.score} (${hit.parts.join(' · ')}).`
            : measured
                ? `nothing in ${rows.filter(r => r.files).length} listed source(s) named session ${short}.`
                : 'no handover source could be read.'
    };
}
