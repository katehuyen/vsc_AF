/**
 * M-39 — A WORKFLOW RUN REMEMBERS EVERY STEP, NOT ONLY THE LAST ONE.
 *
 * A step used to see exactly one thing: the step right before it ({prev_*}),
 * its text cut at 1500 characters. The run's board keeps every finished step
 * under a STABLE id (not its position — steps get inserted and jumped to), so
 * any later step can read `{steps.<id>.text}`, `{steps.<id>.json.a.b}`,
 * `{steps.<id>.file}`, `{steps.<id>.verdict}`, plus `{run.cost}` and
 * `{run.note}`. The board is kept on the run record, so it survives a reload.
 * Pure: no vscode, no fs.
 */

export interface BoardStep {
    id: string;
    index: number;
    title: string;
    status: string;
    text?: string;
    json?: unknown;
    file?: string;
    /** the quality check's verdict: pass · fail · unjudged */
    verdict?: string;
    costUSD?: number;
    at: number;
}

export interface RunBoard {
    steps: Record<string, BoardStep>;
    /** notes written onto the run (a supervisor's, later) */
    notes?: string[];
}

/** A board keeps this much of each step's text — {prev_text} has its own, smaller cut. */
export const BOARD_TEXT_CHARS = 20000;
export const STEP_ID = /^[A-Za-z][\w-]{0,31}$/;

/** A step's key on the board: its own id, else its 1-based place (a workflow saved before ids). */
export const stepKey = (step: { id?: string } | undefined, index: number): string =>
    step?.id && STEP_ID.test(step.id) ? step.id : `s${index + 1}`;

/**
 * Every step gets an id that stays when steps move: a missing, malformed or
 * repeated one (a copied step) is replaced by the first free `s<n>`. Returns
 * whether anything changed, so a caller knows to save.
 */
export function ensureStepIds(steps: { id?: string }[]): boolean {
    const taken = new Set<string>();
    let changed = false;
    const fresh = (i: number): string => {
        let n = i + 1;
        while (taken.has(`s${n}`) || steps.some((s, j) => j > i && s.id === `s${n}`)) { n++; }
        return `s${n}`;
    };
    steps.forEach((s, i) => {
        if (!s.id || !STEP_ID.test(s.id) || taken.has(s.id)) { s.id = fresh(i); changed = true; }
        taken.add(s.id);
    });
    return changed;
}

/** The board with one finished step written in; text is kept to BOARD_TEXT_CHARS. */
export function boardWrite(board: RunBoard | undefined, entry: BoardStep): RunBoard {
    const next: RunBoard = { steps: { ...(board?.steps ?? {}) }, ...(board?.notes ? { notes: board.notes } : {}) };
    // a JSON too big to keep is dropped rather than cut — a cut JSON is not JSON; its text stays
    const bigJson = entry.json !== undefined && (JSON.stringify(entry.json) ?? '').length > BOARD_TEXT_CHARS * 2;
    const { json, ...rest } = entry;
    next.steps[entry.id] = {
        ...rest,
        ...(json !== undefined && !bigJson ? { json } : {}),
        ...(entry.text !== undefined ? { text: entry.text.slice(0, BOARD_TEXT_CHARS) } : {})
    };
    return next;
}

export const boardCost = (board: RunBoard | undefined): number =>
    Object.values(board?.steps ?? {}).reduce((sum, s) => sum + (s.costUSD ?? 0), 0);

const show = (v: unknown): string =>
    v === undefined || v === null ? '' : typeof v === 'string' ? v : JSON.stringify(v);

function pick(obj: unknown, dotted: string): unknown {
    let cur = obj;
    for (const k of dotted.split('.')) {
        if (cur && typeof cur === 'object' && k in (cur as Record<string, unknown>)) { cur = (cur as Record<string, unknown>)[k]; }
        else { return undefined; }
    }
    return cur;
}

const REF = /\{steps\.([A-Za-z][\w-]*)\.(text|file|verdict|status|json(?:\.[\w.]+)?)\}|\{run\.(cost|note)\}/g;

/** `{steps.<id>.…}` and `{run.…}` filled from the board; a step not on it yet reads as empty. */
export function fillBoard(text: string, board: RunBoard | undefined): string {
    if (!text || (text.indexOf('{steps.') < 0 && text.indexOf('{run.') < 0)) { return text; }
    return text.replace(REF, (_m, id: string | undefined, field: string | undefined, run: string | undefined) => {
        if (run === 'cost') { return boardCost(board).toFixed(2); }
        if (run === 'note') { return (board?.notes ?? []).join('\n'); }
        const s = board?.steps[id as string];
        if (!s) { return ''; }
        if (field === 'json') { return show(s.json); }
        if (field?.startsWith('json.')) { return show(pick(s.json, field.slice(5))); }
        return show((s as unknown as Record<string, unknown>)[field as string]);
    });
}

/** Every `{steps.<id>…}` naming a step the workflow does not have — refused at save. */
export function unknownStepRefs(texts: readonly unknown[], ids: readonly string[]): string[] {
    const have = new Set(ids);
    const out = new Set<string>();
    const walk = (v: unknown): void => {
        if (typeof v === 'string') { for (const m of v.matchAll(REF)) { if (m[1] && !have.has(m[1])) { out.add(m[1]); } } }
        else if (Array.isArray(v)) { v.forEach(walk); }
        else if (v && typeof v === 'object') { Object.values(v as Record<string, unknown>).forEach(walk); }
    };
    texts.forEach(walk);
    return [...out];
}
