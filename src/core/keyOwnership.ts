import { KeyOwnership, KeyPolicy } from './engineAccounts';

/**
 * Key-level ownership inside one file a slot holds (X-274).
 *
 * ‼️ THE UNIT IS THE KEY, NOT THE FILE. `.claude.json` is the slot's identity
 * AND the user's folder trusts AND a page of telemetry, so neither "copy it
 * once" (`ownFiles`) nor "render it over" (`carryFiles`) is right for the whole
 * of it. The adapter names, key by key, whose each one is; this module reads
 * the drift on the fleet's keys and projects them into the slot's object,
 * touching nothing else.
 *
 * Compared by VALUE (`JSON.stringify`), never by text — the file is whatever
 * Claude Code last serialised, and a byte comparison would rewrite every slot
 * on every gate over telemetry that changes each session (the 3.469.1 fault).
 * Absence counts: a key the fleet has deleted (a trust the user revoked) is a
 * key the slot must lose, exactly as `carriedDrift` treats a deleted setting.
 */

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const policyOf = (o: { default: KeyPolicy; keys: Record<string, KeyPolicy> }, key: string): KeyPolicy =>
    o.keys[key] ?? o.default;

/** Every key the fleet owns, as a path a card can print: `mcpServers`, `projects[<entry>].allowedTools`. */
export function fleetKeyPaths(own: KeyOwnership): string[] {
    const out = Object.keys(own.keys).filter(k => own.keys[k] === 'fleet');
    for (const [name, sub] of Object.entries(own.entries ?? {})) {
        out.push(...Object.keys(sub.keys).filter(k => sub.keys[k] === 'fleet').map(k => `${name}[*].${k}`));
    }
    return out;
}

/**
 * The fleet-owned keys on which the slot no longer says what the fleet says.
 *
 * Entry-level keys are read in every entry THE FLEET HAS: an entry only the
 * slot has (a folder a slot session trusted that the main directory never saw)
 * is the slot's and is not drift. An entry the fleet has and the slot lacks is
 * drift on every fleet key the fleet's entry carries.
 */
export function ownedDrift(own: KeyOwnership, fleet: Obj, slot: Obj): string[] {
    const out: string[] = [];
    for (const key of Object.keys(own.keys)) {
        if (policyOf(own, key) !== 'fleet') { continue; }
        if (!sameValue(fleet[key], slot[key])) { out.push(key); }
    }
    for (const [name, sub] of Object.entries(own.entries ?? {})) {
        const fleetMap = isObj(fleet[name]) ? fleet[name] as Obj : {};
        const slotMap = isObj(slot[name]) ? slot[name] as Obj : {};
        for (const entry of Object.keys(fleetMap)) {
            const fe = isObj(fleetMap[entry]) ? fleetMap[entry] as Obj : {};
            const se = isObj(slotMap[entry]) ? slotMap[entry] as Obj : {};
            for (const key of Object.keys(sub.keys)) {
                if (policyOf(sub, key) !== 'fleet') { continue; }
                if (!sameValue(fe[key], se[key])) { out.push(`${name}[${entry}].${key}`); }
            }
        }
    }
    return out.sort();
}

/**
 * The slot's object with the fleet's keys projected into it. A new object;
 * `slot` is not mutated. Keys of every other policy, and every key nobody
 * named, come through untouched — so the sign-in stays the slot's and the
 * telemetry stays whatever Claude Code wrote.
 */
export function projectOwned(own: KeyOwnership, fleet: Obj, slot: Obj): Obj {
    const out: Obj = { ...slot };
    const project = (o: { default: KeyPolicy; keys: Record<string, KeyPolicy> }, from: Obj, into: Obj): void => {
        for (const key of Object.keys(o.keys)) {
            if (policyOf(o, key) !== 'fleet') { continue; }
            if (from[key] === undefined) { delete into[key]; }
            else { into[key] = JSON.parse(JSON.stringify(from[key])) as unknown; }
        }
    };
    project(own, fleet, out);
    for (const [name, sub] of Object.entries(own.entries ?? {})) {
        const fleetMap = isObj(fleet[name]) ? fleet[name] as Obj : {};
        const entries = Object.keys(fleetMap);
        if (!entries.length) { continue; }
        const slotMap: Obj = isObj(out[name]) ? { ...out[name] as Obj } : {};
        for (const entry of entries) {
            const fe = isObj(fleetMap[entry]) ? fleetMap[entry] as Obj : {};
            const se: Obj = isObj(slotMap[entry]) ? { ...slotMap[entry] as Obj } : {};
            project(sub, fe, se);
            slotMap[entry] = se;
        }
        out[name] = slotMap;
    }
    return out;
}

/** Parse a JSON object file's text; anything that is not an object reads as empty. */
export function parseOwnedFile(text: string | undefined): Obj {
    if (!text || !text.trim()) { return {}; }
    try {
        const v = JSON.parse(text) as unknown;
        return isObj(v) ? v : {};
    } catch { return {}; }
}

/** True only for text that parses to a JSON object — what a projection may be written back into. */
export function isJsonObject(text: string | undefined): boolean {
    if (!text || !text.trim()) { return false; }
    try { return isObj(JSON.parse(text) as unknown); } catch { return false; }
}
