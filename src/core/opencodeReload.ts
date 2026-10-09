/**
 * X-519 — WHEN THE SHARED OPENCODE PROCESS IS RELOADED, AND WHAT EACH CARD GETS BACK.
 * Pure: the runtime (opencodeacp.ts) asks these and acts on the answer.
 *
 * ‼️ A RUNNING TURN OR AN OPEN PERMISSION QUESTION IS NEVER CUT. A route change
 * seen while the process is busy only marks it due; it is looked at again when a
 * request settles or a question is answered.
 */
import type { OpencodeConfigOption } from './opencode';

/** The one line a card reads after a restart the route settings asked for. */
export const PLANNED_RESTART = 'OpenCode restarted with the new route settings';

/**
 * No process → nothing (the next spawn reads the routes afresh) · the print it
 * started with → nothing · busy → due · otherwise restart now.
 */
export type RefreshVerdict = 'none' | 'same' | 'due' | 'restart';

export function refreshVerdict(s: { running: boolean; started: string; now: string; busy: boolean }): RefreshVerdict {
    if (!s.running) { return 'none'; }
    if (s.now === s.started) { return 'same'; }
    return s.busy ? 'due' : 'restart';
}

export interface ConfigPick { configId: string; value: string }

/**
 * A card's choices against what its reloaded session reports: `apply` the ones it
 * lost but is still offered, name the ones it is no longer offered (`lost`) —
 * never a quiet fall back to the engine's default.
 */
export function reapplyPlan(options: OpencodeConfigOption[], wanted: Record<string, string>): { apply: ConfigPick[]; lost: ConfigPick[] } {
    const apply: ConfigPick[] = [];
    const lost: ConfigPick[] = [];
    for (const [configId, value] of Object.entries(wanted)) {
        const group = options.find(o => o.id === configId);
        if (!group || group.currentValue === value) { continue; }
        (group.options.some(o => o.value === value) ? apply : lost).push({ configId, value });
    }
    return { apply, lost };
}

/** The sentence a card gets for a choice its reloaded session no longer offers. */
export function lostPickNote(p: ConfigPick, current: string): string {
    return `OpenCode no longer offers "${p.value}" as this card's ${p.configId} after the restart `
        + `(its route may have been removed), so it is on "${current || 'the engine\'s default'}" now — pick again to change it.`;
}

/**
 * Put a reloaded card's choices back through `set`; a lost one leaves `wanted`
 * and is said through `note`. Returns the session's options as they end up.
 */
export async function reapplyWanted(
    loaded: OpencodeConfigOption[], wanted: Record<string, string>,
    set: (configId: string, value: string) => Promise<OpencodeConfigOption[]>, note: (text: string) => void
): Promise<OpencodeConfigOption[]> {
    let options = loaded;
    const plan = reapplyPlan(loaded, wanted);
    for (const p of plan.apply) {
        try { options = await set(p.configId, p.value); } catch (e) {
            note(`${p.configId} "${p.value}" could not be set again after the restart: ${String((e as Error).message ?? e)}`);
        }
    }
    for (const p of plan.lost) {
        delete wanted[p.configId];
        note(lostPickNote(p, options.find(o => o.id === p.configId)?.currentValue ?? ''));
    }
    return options;
}

/**
 * Open while the cards are put back on a new process: a new card waits on
 * `done` rather than racing the reload; a card still `awaits` has its messages
 * held until it is back.
 */
export class ReloadGate {
    private gate?: { done: Promise<void>; open(): void; waiting: Set<string> };
    get active(): boolean { return !!this.gate; }
    get done(): Promise<void> | undefined { return this.gate?.done; }
    awaits(sessionId: string): boolean { return !!this.gate?.waiting.has(sessionId); }
    begin(sessionIds: Iterable<string>): void {
        if (this.gate) { return; }
        let open = (): void => { /* set by the promise below */ };
        const done = new Promise<void>(r => { open = r; });
        this.gate = { done, open, waiting: new Set(sessionIds) };
    }
    back(sessionId: string): void { this.gate?.waiting.delete(sessionId); }
    end(): void {
        const g = this.gate;
        this.gate = undefined;
        g?.open();
    }
}
