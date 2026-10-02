/**
 * B-30 — THE AGENTS' SCRATCH FOLDER, AS A SETTING THE SYSTEM HOLDS.
 *
 * Agents needed somewhere to put drafts, fixtures and logs, nobody gave them a
 * place, and once one folder was named in one session every later session found
 * it on its own and kept using it. So the folder is a setting
 * (`agentFarm.workArea`), and three channels carry it, none of them an agent's
 * memory:
 *   - TOLD: the SessionStart hook answers with the line `workAreaStartText`
 *     builds, on a fresh start AND on a resume, so a changed folder reaches a
 *     conversation that was opened before the change;
 *   - CARRIED: `AGENT_FARM_WORKAREA` is in every spawned process and terminal;
 *   - HELD: a write into a folder the setting moved away from is REFUSED by the
 *     PreToolUse hook (`workAreaVerdict`). A habit that outlives the change is
 *     stopped at the call, which is the only place it can be stopped.
 *
 * Pure: no `fs`, no `vscode`, no `path`. The caller resolves templates and owns the disk.
 */

export const WORK_AREA_SETTING = 'agentFarm.workArea';
export const WORK_AREA_ENV = 'AGENT_FARM_WORKAREA';
export const WORK_AREA_DEFAULT = '${temp}/agent_farm';
export const WORK_AREA_ESCAPE = 'af:allow-workarea';
/** Earlier folders still refused; a habit fades long before this many changes. */
export const WORK_AREA_RETIRED_CAP = 8;

export interface WorkAreaResolution {
    /** the folder, absolute; '' only when even the built-in template cannot be built */
    path: string;
    /** the template that produced it */
    template: string;
    source: 'setting' | 'default';
    /** why the setting was not used — '' when it was, or when nothing was set */
    why: string;
}

export interface RetiredWorkArea { path: string; since: number }
export interface WorkAreaState { last?: string; retired: RetiredWorkArea[] }

/**
 * The folder in force. A setting that cannot be built, or that builds a
 * relative path, falls back to the built-in template and SAYS so — a scratch
 * folder resolved against whatever directory a process happens to start in is
 * a different folder for every agent.
 */
export function resolveWorkArea(
    configured: string,
    build: (template: string) => { ok: boolean; value: string; why: string },
    isAbsolute: (p: string) => boolean
): WorkAreaResolution {
    const set = String(configured ?? '').trim();
    const fallback = (why: string): WorkAreaResolution => {
        const d = build(WORK_AREA_DEFAULT);
        const ok = d.ok && !!d.value.trim();
        return {
            path: ok ? d.value.trim() : '', template: WORK_AREA_DEFAULT, source: 'default',
            why: [why, ok ? '' : d.why].filter(Boolean).join(' ')
        };
    };
    if (!set || set === WORK_AREA_DEFAULT) { return fallback(''); }
    const r = build(set);
    const value = r.ok ? r.value.trim() : '';
    if (value && isAbsolute(value)) { return { path: value, template: set, source: 'setting', why: '' }; }
    return fallback(`${WORK_AREA_SETTING} "${set}" was not used: ${r.ok ? 'it is not an absolute folder' : r.why}`);
}

/** One spelling per folder: slashes, a Git Bash drive (`/d/…`) and, on Windows, case. */
export function normDir(p: string, win: boolean): string {
    let s = String(p ?? '').trim().replace(/\\/g, '/');
    if (win) {
        const gb = /^\/([a-zA-Z])(\/|$)/.exec(s);
        if (gb) { s = gb[1] + ':' + s.slice(2); }
    }
    s = s.replace(/\/{2,}/g, '/').replace(/\/+$/, '');
    return win ? s.toLowerCase() : s;
}

export function sameDir(a: string, b: string, win: boolean): boolean {
    return !!a && !!b && normDir(a, win) === normDir(b, win);
}

/** `child` is `dir` itself or somewhere below it. */
export function isWithin(child: string, dir: string, win: boolean): boolean {
    const c = normDir(child, win);
    const d = normDir(dir, win);
    return !!c && !!d && (c === d || c.startsWith(d + '/'));
}

/**
 * The bookkeeping after a resolution: the folder in force last time is retired
 * the moment it stops being the one in force, and a folder the setting comes
 * back to is no longer refused. Idempotent, so every window may run it.
 */
export function nextWorkAreaState(prev: WorkAreaState | undefined, current: string, now: number, win: boolean): WorkAreaState {
    let retired = (prev?.retired ?? []).filter(r => r && typeof r.path === 'string' && r.path);
    const last = prev?.last;
    if (last && current && !sameDir(last, current, win)) {
        retired = [...retired.filter(r => !sameDir(r.path, last, win)), { path: last, since: now }];
    }
    retired = retired.filter(r => !sameDir(r.path, current, win)).slice(-WORK_AREA_RETIRED_CAP);
    return { last: last && sameDir(last, current, win) ? last : (current || last), retired };
}

/**
 * A folder used by habit that the setting never held is retired by hand. The
 * folder in force, or one inside it, cannot be: writes under the folder in
 * force are always allowed, so retiring it would be a rule that never fires.
 */
export function retireWorkArea(
    state: WorkAreaState, folder: string, current: string, now: number, win: boolean
): { state: WorkAreaState; refusal?: string } {
    const f = String(folder ?? '').trim();
    if (!f) { return { state, refusal: 'name the folder to retire' }; }
    if (isWithin(f, current, win)) { return { state, refusal: `"${f}" is the work area in force (or inside it)` }; }
    const retired = [...state.retired.filter(r => !sameDir(r.path, f, win)), { path: f, since: now }]
        .slice(-WORK_AREA_RETIRED_CAP);
    return { state: { ...state, retired } };
}

export function forgetWorkArea(state: WorkAreaState, folder: string, win: boolean): WorkAreaState {
    return { ...state, retired: state.retired.filter(r => !sameDir(r.path, folder, win)) };
}

const WRITE_FIELD: Record<string, string> = {
    Write: 'file_path', Edit: 'file_path', MultiEdit: 'file_path', NotebookEdit: 'notebook_path'
};
const SHELL_TOOLS = ['Bash', 'PowerShell'];

export interface WorkAreaVerdict {
    id: 'write' | 'shell';
    retired: string;
    reason: string;
}

export interface WorkAreaCatch extends WorkAreaVerdict { ts: number; sessionId: string }

/** A command's text in `normDir`'s spelling, Git Bash drives included wherever a path starts. */
function normCommand(cmd: string, win: boolean): string {
    let s = cmd.replace(/\\/g, '/');
    if (win) { s = s.replace(/(^|[\s"'=(])\/([a-zA-Z])\//g, '$1$2:/'); }
    s = s.replace(/\/{2,}/g, '/');
    return win ? s.toLowerCase() : s;
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The refusal, or `undefined` to let the call run. A file tool writing under a
 * retired folder is refused outright; a shell command NAMING one is refused
 * unless it carries the escape, because a command cannot be read for intent and
 * a read of an old file is the one honest reason to name it. Anything under the
 * folder in force always runs, even when it sits inside a retired one.
 */
export function workAreaVerdict(ask: {
    tool?: string; input?: Record<string, unknown>; current: string; retired: RetiredWorkArea[]; win: boolean;
}): WorkAreaVerdict | undefined {
    if (!ask.retired.length || !ask.current) { return undefined; }
    const tool = String(ask.tool ?? '');
    const field = WRITE_FIELD[tool];
    if (field) {
        const target = String(ask.input?.[field] ?? '');
        if (!target || isWithin(target, ask.current, ask.win)) { return undefined; }
        const hit = ask.retired.find(r => isWithin(target, r.path, ask.win));
        return hit ? { id: 'write', retired: hit.path, reason: refusalText(hit.path, ask.current, false) } : undefined;
    }
    if (!SHELL_TOOLS.includes(tool)) { return undefined; }
    const cmd = String(ask.input?.command ?? '');
    if (!cmd || cmd.includes(WORK_AREA_ESCAPE)) { return undefined; }
    const cur = normDir(ask.current, ask.win);
    const text = normCommand(cmd, ask.win).split(cur).join(' ');
    const hit = ask.retired.find(r => {
        const d = normDir(r.path, ask.win);
        return !!d && new RegExp(escapeRe(d) + '(?![\\w.-])').test(text);
    });
    return hit ? { id: 'shell', retired: hit.path, reason: refusalText(hit.path, ask.current, true) } : undefined;
}

function refusalText(retired: string, current: string, shell: boolean): string {
    return `Agent Farm work area: "${retired}" is a retired scratch folder — the setting ${WORK_AREA_SETTING} `
        + `moved away from it. Put scratch files under "${current}" (the variable ${WORK_AREA_ENV} holds it).`
        + (shell ? ` Only reading an old file from the retired folder? Put ${WORK_AREA_ESCAPE} in the command and it runs.` : '');
}

/** What a session is told when it starts or resumes. */
export function workAreaStartText(current: string): string {
    return `Agent Farm work area: ${current} — the folder for scratch files (drafts, test fixtures, logs, `
        + `temporary scripts and payload files). Write such files only there. It is the setting ${WORK_AREA_SETTING}, `
        + `and the variable ${WORK_AREA_ENV} holds it in every process Agent Farm starts. A scratch folder remembered `
        + 'from an earlier session is not this one unless the path is the same.';
}

/** The SessionStart answer that puts the line into the model's context — `undefined` on any other event. */
export function startContextBody(eventName: string | undefined, text: string): string | undefined {
    if (eventName !== 'SessionStart' || !text) { return undefined; }
    return JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text } });
}

/** The settings row's "in force" note: the folder that is used, and what it refuses. */
export function workAreaInForceNote(r: WorkAreaResolution, retired: RetiredWorkArea[]): string {
    const parts = [r.path ? `In force: ${r.path}` : 'No work area could be built'];
    if (r.why) { parts.push(r.why); }
    if (retired.length) { parts.push(`Writes refused in: ${retired.map(x => x.path).join(' · ')}`); }
    return parts.join(' — ');
}
