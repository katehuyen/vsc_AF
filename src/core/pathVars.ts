/**
 * X-188 — A PATH THE USER WRITES, AND A RESOLVER THAT REFUSES TO GUESS.
 *
 * Agent Farm shipped a fallback that read
 * `D:\zone\know\note\obsidian\00_AGENT_AREA\00_OUTPUT\01_CEVAPLAR` — one
 * person's Obsidian vault, compiled into an extension meant to run on any
 * machine. X-179 removed the same disease from `prompts.ts`; this is that fix
 * generalised, so the next hard-coded folder has somewhere to go instead of
 * being invented again.
 *
 * ‼️ THE ONE LAW: AN UNRESOLVED VARIABLE CANCELS THE PATH.
 *
 * It never becomes an empty string. `${vault}/01_CEVAPLAR` on a machine with no
 * vault must SKIP that source — not look in `/01_CEVAPLAR`, find nothing and
 * report "no handover note", which is a false measurement about a folder that
 * was never the question. It is the same law `sessionDiagnosis` states for
 * facts: not measured is not the same thing as measured and empty.
 *
 * ‼️ AND THE SYNTAX IS `${name}`, NOT `{name}`.
 *
 * A path template is typed into a settings box beside real paths, and the box
 * next to it in `settings.json` already speaks `${workspaceFolder}` — so the
 * user knows this shape before we teach it. Prompt templates (`sentryPrompt`)
 * keep their `{name}`: two different subjects, neither borrowing the other's
 * punctuation, so a prompt pasted into a path setting fails loudly rather than
 * half-expanding.
 *
 * Pure: no `fs`, no `vscode`, no `path`. Whoever calls it owns the disk.
 */

/** What a caller knows about the machine it is resolving for. Everything is
 *  optional because a caller that cannot answer must leave it out — an empty
 *  string here is a refusal, not a value. */
export interface PathVarContext {
    home?: string;
    /** the system's temporary folder (os.tmpdir) */
    temp?: string;
    workspace?: string;
    repo?: string;
    vault?: string;
    /** the project's NAME, for a folder named after it */
    project?: string;
    /** the project folder itself */
    projectFolder?: string;
    /** where that project keeps its notes */
    projectNotes?: string;
    /** the agent's own folder */
    agentDir?: string;
    /** the session a path is being resolved FOR, when there is one */
    sessionId?: string;
    /** overridable so a test is not a clock */
    now?: number;
}

export interface ResolvedPath {
    /** false = this path could not be built and MUST NOT be used */
    ok: boolean;
    /** the built path; '' when `ok` is false, deliberately unusable */
    value: string;
    /** every name that could not be filled, in the order they appeared */
    missing: string[];
    /** one sentence a person can act on — '' when nothing went wrong */
    why: string;
}

/** ‼️ THE DICTIONARY LIVES HERE AND NOWHERE ELSE. A settings page draws this
 *  list rather than repeating it, so a variable added below turns up in the UI
 *  without the UI being touched. */
export const PATH_VARS: { name: string; describe: string }[] = [
    { name: 'home', describe: 'your user folder — the same thing VS Code calls ${userHome}' },
    { name: 'temp', describe: 'the system temporary folder — %TEMP% on Windows, $TMPDIR or /tmp elsewhere' },
    { name: 'workspace', describe: 'the open workspace folder — VS Code calls it ${workspaceFolder}' },
    { name: 'repo', describe: 'the repository the work is happening in' },
    { name: 'vault', describe: 'your notes vault, when one is configured; absent on a machine without one' },
    { name: 'project', describe: 'the project\'s name, for a folder named after it' },
    { name: 'projectFolder', describe: 'the project folder itself' },
    { name: 'projectNotes', describe: 'that project\'s notes folder' },
    { name: 'agentDir', describe: 'the folder of the agent this is being resolved for' },
    { name: 'sessionId', describe: 'the whole session id' },
    { name: 'sessionId8', describe: 'the first eight characters of it — how a handover note is named' },
    { name: 'today', describe: 'the local calendar day as YYYY-MM-DD' },
    { name: 'yesterday', describe: 'the day before that, same shape' },
    { name: 'date:FORMAT', describe: 'any of YYYY YY MM DD HH mm ss, e.g. ${date:YYMMDD}' }
];

/** Names the user may also know from VS Code's own settings. Same value, and
 *  the alias is not a second entry in the dictionary — one subject, one row. */
const ALIASES: Record<string, string> = {
    userHome: 'home',
    workspaceFolder: 'workspace'
};

const pad = (n: number, w = 2): string => String(n).padStart(w, '0');

const stamp = (d: Date, fmt: string): string => fmt
    .replace(/YYYY/g, String(d.getFullYear()))
    .replace(/YY/g, pad(d.getFullYear() % 100))
    .replace(/MM/g, pad(d.getMonth() + 1))
    .replace(/DD/g, pad(d.getDate()))
    .replace(/HH/g, pad(d.getHours()))
    .replace(/mm/g, pad(d.getMinutes()))
    .replace(/ss/g, pad(d.getSeconds()));

const day = (t: number, offsetDays = 0): string => {
    const d = new Date(t);
    d.setDate(d.getDate() + offsetDays);
    return stamp(d, 'YYYY-MM-DD');
};

/** A value counts only if it has something in it — whitespace is a refusal. */
const val = (v: unknown): string | undefined => {
    const s = typeof v === 'string' ? v.trim() : '';
    return s ? String(v) : undefined;
};

/**
 * What one name resolves to, or `undefined` when it cannot.
 *
 * The two ways it can fail are told apart by the caller, not here: a name that
 * is not in the dictionary at all is a typo the user can fix, while a name this
 * machine simply has nothing behind is not their mistake.
 */
function valueOf(rawName: string, ctx: PathVarContext): string | undefined {
    const now = ctx.now ?? Date.now();
    const name = ALIASES[rawName] ?? rawName;
    if (name.startsWith('date:')) {
        const fmt = name.slice(5);
        return fmt ? stamp(new Date(now), fmt) : undefined;
    }
    switch (name) {
        case 'today': return day(now);
        case 'yesterday': return day(now, -1);
        case 'sessionId': return val(ctx.sessionId);
        case 'sessionId8': {
            const id = val(ctx.sessionId);
            return id ? id.slice(0, 8) : undefined;
        }
        case 'home': return val(ctx.home);
        case 'temp': return val(ctx.temp);
        case 'workspace': return val(ctx.workspace);
        case 'repo': return val(ctx.repo);
        case 'vault': return val(ctx.vault);
        case 'project': return val(ctx.project);
        case 'projectFolder': return val(ctx.projectFolder);
        case 'projectNotes': return val(ctx.projectNotes);
        case 'agentDir': return val(ctx.agentDir);
        default: return undefined;
    }
}

/** Is this a name the resolver claims to know at all? `date:` is a family. */
function known(rawName: string): boolean {
    const name = ALIASES[rawName] ?? rawName;
    if (name.startsWith('date:')) { return name.length > 5; }
    return PATH_VARS.some(v => v.name === name);
}

const VAR_RE = /\$\{([^{}]*)\}/g;

/**
 * Build one path template, or refuse it.
 *
 * ‼️ The replacement is done in ONE pass over the original string, so a value
 * that happens to contain `${…}` is left exactly as it is. A folder literally
 * called `${home}` cannot make this loop, and no value a user types can reach a
 * variable they did not write.
 */
export function resolvePathVars(template: string, ctx: PathVarContext = {}): ResolvedPath {
    const src = String(template ?? '');
    const missing: string[] = [];
    const unknownNames: string[] = [];
    const out = src.replace(VAR_RE, (_m, rawName: string) => {
        const name = String(rawName).trim();
        const v = valueOf(name, ctx);
        if (v !== undefined) { return v; }
        missing.push(name);
        if (!known(name)) { unknownNames.push(name); }
        return '';
    });
    if (!missing.length) { return { ok: true, value: out, missing: [], why: '' }; }
    // ‼️ `value` is emptied on purpose. A half-built path is the dangerous
    // answer: it looks usable and points somewhere nobody meant.
    const why = unknownNames.length
        ? `${unknownNames.map(n => '${' + n + '}').join(', ')} is not a variable this resolver knows`
        + (unknownNames.length === missing.length ? '.' : `, and ${missing.filter(n => !unknownNames.includes(n)).map(n => '${' + n + '}').join(', ')} has nothing behind it on this machine.`)
        : `${missing.map(n => '${' + n + '}').join(', ')} has nothing behind it on this machine.`;
    return { ok: false, value: '', missing, why };
}

export interface ResolvedList {
    /** the templates that could be built, in the order they were given */
    paths: string[];
    /** the ones that could not, each with the sentence saying why */
    skipped: { template: string; why: string }[];
}

/**
 * A whole ordered source list at once — which is how every caller actually uses
 * this: try these places, in this order.
 *
 * An EMPTY entry is nothing rather than a fault; a user who clears a row in a
 * settings list means "not this one", and reporting it as a broken path would
 * teach them to ignore the report.
 */
/** One entry of a path list, beside what it actually resolves to. */
export interface PreviewedPath {
    /** the entry exactly as the user typed it */
    template: string;
    /** the real path it builds — '' when it builds none */
    path: string;
    /** false = this row must not be used */
    ok: boolean;
    /** one sentence a person can act on — '' when there is nothing to say */
    why: string;
}

/**
 * ‼️ ROW-ALIGNED, WHICH `resolvePathList` DELIBERATELY IS NOT.
 *
 * A settings page draws one row per entry and each row has to say what THAT
 * entry resolves to (X-193, DENSITY: a fact the reader can see must not cost a
 * click). `resolvePathList` answers the caller's question — "which of these can
 * I use, and what went wrong with the rest" — by returning two arrays, so a page
 * pairing them back up would have to re-derive which row was which. One entry
 * in, one answer out, in the same order, empty ones included.
 *
 * An EMPTY row is neither resolved nor a fault: a cleared row is a row somebody
 * is about to type in, and shouting at it would teach them to ignore the column.
 */
export function previewPathList(
    templates: string[] | undefined, ctx: PathVarContext = {}
): PreviewedPath[] {
    return (templates ?? []).map(t => {
        const template = String(t ?? '');
        if (!template.trim()) { return { template, path: '', ok: false, why: '' }; }
        // `value` is already '' on a refusal — deliberately unusable, and pinned
        // where that promise is made. Re-blanking it here would be a second
        // opinion about the same rule.
        const r = resolvePathVars(template, ctx);
        return { template, path: r.value, ok: r.ok, why: r.why };
    });
}

export function resolvePathList(templates: string[], ctx: PathVarContext = {}): ResolvedList {
    const paths: string[] = [];
    const skipped: { template: string; why: string }[] = [];
    for (const t of templates ?? []) {
        if (!String(t ?? '').trim()) { continue; }
        const r = resolvePathVars(t, ctx);
        if (r.ok) { paths.push(r.value); } else { skipped.push({ template: t, why: r.why }); }
    }
    return { paths, skipped };
}
