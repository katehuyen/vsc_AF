/**
 * The project session protocol — what an agent is told before the user types.
 *
 * Picking a project has to DO something, or it is a label. This module builds
 * the text that goes to the CLI as an appended system prompt, so a session
 * started under a project already knows which project, where its documents
 * live, and what state it is in — with the user writing nothing.
 *
 * ‼️ THE CHANNEL IS A FILE, AND THAT IS A MEASUREMENT, NOT A PREFERENCE.
 * `test/smoke_project_context.mjs` drives the real CLI. What it found:
 *
 *  - All three of Agent Farm's spawn paths run with `shell: true`. Inline
 *    multi-line text does not survive any of them — as an argv entry the args
 *    are concatenated unquoted (`error: unknown option '---'`), and inside a
 *    command string the newlines break the line.
 *  - `--append-system-prompt-file` exists (it is missing from `--help`'s flag
 *    list, which is why the design had recorded it as unavailable) and carries
 *    the text intact through every path.
 *  - The path must be quoted BY US. Unquoted, a path through "John Doe" is cut
 *    at the space.
 *  - The context is LOST on `--resume`. It has to be passed again on every
 *    spawn — see `hostArgs`, which is the single place that does it.
 *
 * Everything here is pure: text in, text out. The file writing lives with the
 * caller that has a filesystem to write to.
 */

/**
 * How much of the brief is allowed into the system prompt.
 *
 * A cap is not tidiness. The brief grows every time the project is worked on,
 * and an uncapped system prompt would grow with it — on every turn of every
 * session, forever. What is cut is replaced by the path to the whole thing,
 * which the agent can open when it needs the rest.
 *
 * MEASURED (test/smoke_project_cost.mjs, haiku, a real project with a skeleton
 * and three worklog entries): a 1632-character context is **538 input tokens**
 * — 3.03 chars per token, not the 4 the English rule of thumb assumes. It lands
 * in cache-creation, so every turn after the first re-reads it at ×0.1. At this
 * cap the ceiling is roughly 1000 tokens once, then a tenth of that per turn.
 */
export const PROJECT_BRIEF_MAX = 2500;

export interface ProjectContextInput {
    name: string;
    id: string;
    /** documents folder — absolute, already detokenised. '' if none is set */
    folder?: string;
    /** code roots — absolute, already detokenised */
    repos?: string[];
    /** the generated brief; '' when the project has no folder to hold one */
    brief?: string;
    /** where the full brief lives, quoted in the text when the brief is cut */
    briefPath?: string;
    /** when the brief was generated, for the header line */
    generatedAt?: number;
    /** `agentFarm.projectContextExtra` — this installation's own line */
    extra?: string;
    /** overridable for tests */
    briefMax?: number;
}

const MARK_START = '=== AGENT FARM PROJECT CONTEXT ===';
const MARK_END = '=== END AGENT FARM PROJECT CONTEXT ===';
const BRIEF_END = '--- END PROJECT BRIEF ---';

/** YYYY-MM-DD HH:MM in local time — a stamp the reader can place. */
function stamp(ms: number): string {
    const d = new Date(ms);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Cut the brief to the cap without slicing a line in half.
 *
 * A brief that ends mid-sentence reads like corrupted input; ending on a whole
 * line reads like a summary that stops. Returns the text and whether anything
 * was dropped, because the caller has to say so.
 */
export function trimBrief(brief: string, max = PROJECT_BRIEF_MAX): { text: string; cut: boolean } {
    const text = String(brief ?? '').trim();
    if (text.length <= max) { return { text, cut: false }; }
    const head = text.slice(0, max);
    const lastBreak = head.lastIndexOf('\n');
    // only prefer the line break if it does not throw most of the budget away
    const kept = lastBreak > max * 0.5 ? head.slice(0, lastBreak) : head;
    return { text: kept.trimEnd(), cut: true };
}

/**
 * The whole text handed to the CLI.
 *
 * English, always: it is hard-coded, and hard-coded strings are English no
 * matter what language the project's own documents are written in. The brief
 * embedded inside it is the user's text, in the user's language, untouched.
 *
 * The brief is INLINED rather than pointed at, because a pointer is a tool call
 * the agent may skip, while a system prompt is read by definition and costs no
 * extra turn.
 */
export function buildProjectContext(o: ProjectContextInput): string {
    const lines: string[] = [MARK_START];
    lines.push(`This session belongs to the project "${o.name}" (id: ${o.id}).`);
    if (o.folder) { lines.push(`Docs folder: ${o.folder}`); }
    const repos = (o.repos ?? []).filter(r => !!r && r.trim());
    if (repos.length) { lines.push(`Code repos:  ${repos.join(' · ')}`); }
    lines.push('');
    lines.push('Work on this project unless the user says otherwise. The brief below is its');
    lines.push('current state. Open files in the docs folder when you need more depth, and');
    lines.push('record what you did in the project worklog before you finish.');

    const extra = String(o.extra ?? '').trim();
    if (extra) { lines.push('', extra); }

    const brief = String(o.brief ?? '').trim();
    if (brief) {
        const { text, cut } = trimBrief(brief, o.briefMax ?? PROJECT_BRIEF_MAX);
        lines.push('');
        lines.push(`--- PROJECT BRIEF (generated ${stamp(o.generatedAt ?? Date.now())}) ---`);
        lines.push(text);
        if (cut) {
            lines.push('');
            lines.push(o.briefPath
                ? `[cut to fit — the full brief is at ${o.briefPath}]`
                : '[cut to fit — open the docs folder for the rest]');
        }
        lines.push(BRIEF_END);
    }
    lines.push(MARK_END);
    return lines.join('\n');
}

/**
 * The context file's name for a project.
 *
 * Keyed by the project's immutable id, so renaming a project never orphans a
 * file, and one file per project means a second window starting a session for
 * the same project rewrites the same path instead of littering.
 */
export function contextFileName(projectId: string): string {
    return `${String(projectId ?? '').replace(/[^A-Za-z0-9_-]/g, '')}.txt`;
}

/**
 * Wrap a path for a command line that will be read by a shell.
 *
 * Every spawn path uses `shell: true`, so an unquoted path is split on its
 * spaces — measured: "…/John Doe/…" arrives as "…/John". Double quotes are the
 * one form cmd.exe, PowerShell and POSIX shells all understand. A path
 * containing a double quote is not quotable this way and is refused by the
 * caller rather than mangled here.
 */
export function quoteContextPath(file: string): string {
    return `"${String(file ?? '')}"`;
}

/** A path we cannot safely put on a command line. Windows forbids `"` in file
 *  names anyway, so this is a guard against a caller passing junk, not a case
 *  a user can reach. */
export function isQuotableContextPath(file: string): boolean {
    const s = String(file ?? '');
    return !!s.trim() && !s.includes('"');
}

/** Pull the context back out of a system prompt, for the transparency chip —
 *  the UI shows the user the exact text that was sent, not a description of it. */
export function extractProjectContext(text: string): string {
    const s = String(text ?? '');
    const a = s.indexOf(MARK_START);
    if (a < 0) { return ''; }
    const b = s.indexOf(MARK_END, a);
    return b < 0 ? s.slice(a) : s.slice(a, b + MARK_END.length);
}
