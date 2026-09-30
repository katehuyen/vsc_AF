/**
 * Remote feature ids and the `can()` answer behind them.
 *
 * The ids are the contract's own list, so the host and the phone cannot
 * disagree on a name. Until licensing lands (X-450) every KNOWN feature is
 * answered open; an unknown id is refused, so a typo never unlocks anything.
 */
import { FEATURES } from './contract';

export type FeatureId = typeof FEATURES[number];

export interface FeatureAnswer {
    allowed: boolean;
    /** Why it is refused, in words a user can read; absent when allowed. */
    reason?: string;
}

export type FeatureGate = (feature: string) => FeatureAnswer;

export function isFeature(id: string): boolean {
    return FEATURES.includes(id);
}

/** The gate used before X-450: every declared feature is open, anything else fails closed. */
export const allOpen: FeatureGate = feature =>
    isFeature(feature) ? { allowed: true } : { allowed: false, reason: `unknown feature ${feature}` };

/** The welcome frame's `features` map: one answer per declared feature. */
export function featureMap(gate: FeatureGate): Record<string, FeatureAnswer> {
    const out: Record<string, FeatureAnswer> = {};
    for (const f of FEATURES) {
        const a = gate(f);
        out[f] = a.allowed ? { allowed: true } : { allowed: false, reason: a.reason };
    }
    return out;
}
