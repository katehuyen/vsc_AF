import * as path from 'path';
import { adapterFor, canIsolateAccounts, EngineAccountSlot } from './engineAccounts';

/**
 * X-530 / X-531 — AN ACCOUNT'S LIFE, as four states and the doors between them.
 *
 *   awake ──Disable──▶ asleep ──Enable──▶ awake (health read from disk; a dead grant goes to 🔑)
 *   awake ──Sign out─▶ awake, no grant (needs signing in; 🔑 puts one back into THIS slot)
 *   any   ──Delete───▶ gone (drained into the pool first, folder removed — `accounts.forget`)
 *
 * ‼️ ASLEEP IS NOT GONE. The row, the folder, the tokens, the junctions and the merge base all
 * stay; what stops is everything that USES the account: the quota beat never reads it (zero
 * requests), no picker or pool offers it, no policy or relay places a run on it, and a launch
 * that names it outright is refused by name (`asleepRefusal`). A standing choice that names it
 * — the machine's "use this next" or an agent's own — is stepped over to the layer below, and
 * the resolution says so (`accountResolution`). Everything that only KNOWS an account — labels,
 * history, attribution, the CLI registry, capture's same-address check, every write of the list —
 * still reads the whole list, so an asleep row is never dropped by a save.
 *
 * A run already on the account when it is put to sleep keeps going (an account is fixed for a
 * session); Sign out is refused while one is, because removing the grant under it breaks it.
 */

export function usableSlots(list: EngineAccountSlot[]): EngineAccountSlot[] {
    return list.filter(s => !s.disabled);
}

/** `id` names a stored slot that is asleep. */
export function asleepIn(list: EngineAccountSlot[]): (id: string) => boolean {
    const ids = new Set(list.filter(s => s.disabled).map(s => s.id));
    return id => ids.has(String(id || '').trim());
}

export function asleepRefusal(label: string): string {
    return `"${label}" is disabled — it is asleep on purpose, so nothing starts on it. `
        + 'Enable it on its card (accounts.enable), or pick another sign-in.';
}

/** The list with one slot put to sleep or woken; an unknown id leaves it as it was. */
export function setAsleep(list: EngineAccountSlot[], id: string, asleep: boolean, now: number): EngineAccountSlot[] {
    const want = String(id || '').trim();
    return list.map(s => {
        if (s.id !== want) { return s; }
        if (asleep) { return { ...s, disabled: true, disabledAt: s.disabled && s.disabledAt ? s.disabledAt : now }; }
        const awake = { ...s };
        delete awake.disabled;
        delete awake.disabledAt;
        return awake;
    });
}

export interface SignOutPlan {
    refusal: string;
    /** absolute paths of the grant files to remove */
    files: string[];
}

/** X-531 — which files signing this slot out removes: the grant, never the slot, its identity file or its settings. */
export function planSignOut(slot: EngineAccountSlot | undefined): SignOutPlan {
    if (!slot) { return { refusal: 'No such account is stored on this machine.', files: [] }; }
    const grant = adapterFor(slot.engine).grantFiles ?? [];
    if (!canIsolateAccounts(slot.engine) || !grant.length) {
        return {
            refusal: `${slot.engine} keeps no sign-in of its own in an account folder here, so there is nothing to sign out of.`,
            files: []
        };
    }
    return { refusal: '', files: grant.map(f => path.join(slot.dir, f)) };
}

/** Local removal is not revocation — said wherever a grant is deleted. */
export const SIGN_OUT_NOTE = 'Signing out removes the tokens from this folder only; the provider still '
    + 'honours them until they expire or you revoke them there.';
