import type { FlexDeps } from '../core/flexActions';

/**
 * X-456 — WHAT THE SETTINGS PAGE WILL NOT DO FOR A PHONE.
 *
 * The phone app reaches the farm through these two settings, so a phone that
 * changed either would cut its own connection mid-write — the same reason the
 * Toolbox draws the reach but disables it there. Every write path the page has
 * (a row, its reset, a setting set, the Flow & Content card, a preset) asks here.
 */
export const PHONE_LOCKED_SETTINGS: readonly string[] = ['agentFarm.remote.listen', 'agentFarm.remote.port'];

export const phoneLocked = (key: string): boolean => PHONE_LOCKED_SETTINGS.includes(key);

/** The sentence a refused write is answered with, naming every key it left alone. */
export function lockedNote(keys: readonly string[]): string {
    return `${[...new Set(keys)].join(', ')}: changed on the PC only — a new reach or port would cut this phone off.`;
}

/**
 * The Flow & Content card's writes from a phone. A locked key is skipped and
 * recorded rather than thrown, so a preset that carries one still applies the
 * rest of its values instead of stopping halfway through them.
 */
export function phoneFlex(flex: FlexDeps, skipped: string[]): FlexDeps {
    return {
        readSetting: key => flex.readSetting(key),
        writeSetting: async (key, value) => {
            if (phoneLocked(key)) { skipped.push(key); return; }
            await flex.writeSetting(key, value);
        }
    };
}
