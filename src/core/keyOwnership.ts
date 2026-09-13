import { KeyOwnership, KeyPolicy } from './engineAccounts';

/**
 * Key-level ownership inside one file a slot holds (X-274), and the RETURN LEG
 * that makes it two-way (X-291).
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
 *
 * ‼️ X-291 — …AND A PERMISSION LIST IS NOT A SETTING, IT IS AN ANSWER THE USER
 * ALREADY GAVE. Under `fleet` a tool the user approved inside a slot session was
 * deleted at the next gate and the fleet never heard of it, so the same prompt
 * came back on the next account. `merge` makes that key a THREE-WAY merge and
 * the gate carries the slot's answer back to the fleet.
 *
 * ‼️ AND A UNION WITHOUT A BASE IS NOT A MERGE, IT IS AN ACCUMULATOR THAT CAN
 * NEVER FORGET. `fleet ∪ slot` alone would resurrect every permission the user
 * had just revoked in the main directory, silently, at the very next gate — the
 * fleet's deletion and a slot's approval look identical from two sides. So each
 * merge key carries a BASE: the value both sides converged on at the previous
 * gate. Present in the base and gone from the fleet = a revocation, and it is
 * removed from the slot rather than promoted back. Absent from the base and
 * present in the slot = the user's new approval, and it goes to the fleet.
 */

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const idOf = (v: unknown): string => JSON.stringify(v) ?? 'undefined';
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const policyOf = (o: KeyOwnership, key: string): KeyPolicy => o.keys[key] ?? o.default;
const sub = (o: KeyOwnership): Set<string> =>
    new Set([...Object.keys(o.nested ?? {}), ...Object.keys(o.entries ?? {})]);

/**
 * The keys THIS scope decides for itself — its own sub-objects are walked
 * separately, and a scope whose `default` is `ignore` decides only what it
 * names. ‼️ `default` is not decoration: `ignore` is what keeps 21 telemetry
 * fields per project entry out of every comparison (the 3.469.1 fault), and
 * anything else makes the scope answer for keys nobody listed — which is what
 * lets `permissions` carry the fleet's `defaultMode` without naming it.
 */
const plainKeys = (o: KeyOwnership, ...sides: Obj[]): string[] => {
    const nested = sub(o);
    const named = Object.keys(o.keys).filter(k => !nested.has(k));
    if (o.default === 'ignore') { return named; }
    const all = new Set(named);
    for (const s of sides) { for (const k of Object.keys(s)) { if (!nested.has(k)) { all.add(k); } } }
    return [...all];
};

const asObj = (v: unknown): Obj => isObj(v) ? v : {};

/**
 * ‼️ X-291 — WHAT A MERGE KEY SHOULD SAY ON BOTH SIDES: the union of the two
 * lists, minus whatever the fleet has dropped since the base.
 *
 * Two values that are not both lists are the FLEET'S — the user's rule, and the
 * only one that can be honoured without a clock: there is no timestamp on a
 * `model` or a `defaultMode`, so "last writer wins" cannot be measured and a
 * slot silently changing a fleet setting is the fault this whole family exists
 * to end. A fleet that has no value at all is an absence, not a decision, and
 * the slot's own is left alone unless the BASE says the fleet once had one.
 */
export function mergeValues(fleetV: unknown, slotV: unknown, baseV: unknown): unknown {
    if (fleetV === undefined && slotV === undefined) { return undefined; }
    if (fleetV === undefined) { return baseV === undefined ? slotV : undefined; }
    if (slotV === undefined) { return fleetV; }
    if (!Array.isArray(fleetV) || !Array.isArray(slotV)) { return fleetV; }
    const base = new Set((Array.isArray(baseV) ? baseV : []).map(idOf));
    const held = new Set(fleetV.map(idOf));
    const out = [...fleetV];
    for (const v of slotV) {
        const id = idOf(v);
        if (held.has(id) || base.has(id)) { continue; }
        held.add(id);
        out.push(v);
    }
    return out;
}

/** The items of a merge key the SLOT holds and the fleet has never been told about. */
function newInSlot(fleetV: unknown, slotV: unknown, baseV: unknown): unknown[] {
    if (!Array.isArray(slotV)) { return []; }
    const held = new Set((Array.isArray(fleetV) ? fleetV : []).map(idOf));
    const base = new Set((Array.isArray(baseV) ? baseV : []).map(idOf));
    const out: unknown[] = [];
    for (const v of slotV) {
        const id = idOf(v);
        if (held.has(id) || base.has(id)) { continue; }
        held.add(id);
        out.push(v);
    }
    return out;
}

/**
 * The TOP-LEVEL keys of a file this ownership decides — what another clause
 * over the same file must therefore neither read as its own drift nor write
 * over (`carry:settings.json` and `permissions`).
 */
export function ownedTopKeys(own: KeyOwnership): string[] {
    return [...new Set([
        ...Object.keys(own.keys).filter(k => own.keys[k] !== 'ignore'),
        ...Object.keys(own.nested ?? {}),
        ...Object.keys(own.entries ?? {})
    ])];
}

/** Every key the fleet owns, as a path a card can print: `mcpServers`, `projects[*].allowedTools`. */
export function fleetKeyPaths(own: KeyOwnership, prefix = ''): string[] {
    const out = Object.keys(own.keys)
        .filter(k => own.keys[k] === 'fleet' || own.keys[k] === 'merge')
        .map(k => prefix + k);
    for (const [name, nested] of Object.entries(own.nested ?? {})) {
        out.push(...fleetKeyPaths(nested, `${prefix}${name}.`));
    }
    for (const [name, entry] of Object.entries(own.entries ?? {})) {
        out.push(...fleetKeyPaths(entry, `${prefix}${name}[*].`));
    }
    return out;
}

/** Every key the fleet and the slot MERGE rather than one of them winning. */
export function mergeKeyPaths(own: KeyOwnership, prefix = ''): string[] {
    const out = Object.keys(own.keys).filter(k => own.keys[k] === 'merge').map(k => prefix + k);
    for (const [name, nested] of Object.entries(own.nested ?? {})) {
        out.push(...mergeKeyPaths(nested, `${prefix}${name}.`));
    }
    for (const [name, entry] of Object.entries(own.entries ?? {})) {
        out.push(...mergeKeyPaths(entry, `${prefix}${name}[*].`));
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
 *
 * A `merge` key reads as drift only when the slot does not already hold the
 * merge — the slot having MORE than the fleet is the return leg's business
 * (`promotable`), never a gap in the slot.
 */
export function ownedDrift(own: KeyOwnership, fleet: Obj, slot: Obj, base: Obj = {}, prefix = ''): string[] {
    const out: string[] = [];
    for (const key of plainKeys(own, fleet, slot)) {
        const policy = policyOf(own, key);
        if (policy === 'fleet') {
            if (!sameValue(fleet[key], slot[key])) { out.push(prefix + key); }
        } else if (policy === 'merge') {
            if (!sameValue(mergeValues(fleet[key], slot[key], base[key]), slot[key])) { out.push(prefix + key); }
        }
    }
    for (const [name, nested] of Object.entries(own.nested ?? {})) {
        if (fleet[name] === undefined && slot[name] === undefined) { continue; }
        out.push(...ownedDrift(nested, asObj(fleet[name]), asObj(slot[name]), asObj(base[name]), `${prefix}${name}.`));
    }
    for (const [name, entry] of Object.entries(own.entries ?? {})) {
        const fleetMap = asObj(fleet[name]);
        const slotMap = asObj(slot[name]);
        const baseMap = asObj(base[name]);
        for (const key of Object.keys(fleetMap)) {
            out.push(...ownedDrift(entry, asObj(fleetMap[key]), asObj(slotMap[key]), asObj(baseMap[key]),
                `${prefix}${name}[${key}].`));
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
export function projectOwned(own: KeyOwnership, fleet: Obj, slot: Obj, base: Obj = {}): Obj {
    const out: Obj = { ...slot };
    for (const key of plainKeys(own, fleet, slot)) {
        const policy = policyOf(own, key);
        if (policy !== 'fleet' && policy !== 'merge') { continue; }
        const next = policy === 'fleet' ? fleet[key] : mergeValues(fleet[key], slot[key], base[key]);
        if (next === undefined) { delete out[key]; } else { out[key] = clone(next); }
    }
    for (const [name, nested] of Object.entries(own.nested ?? {})) {
        if (fleet[name] === undefined && slot[name] === undefined) { continue; }
        const next = projectOwned(nested, asObj(fleet[name]), asObj(slot[name]), asObj(base[name]));
        // ‼️ A SUB-OBJECT THE FLEET NO LONGER HAS AND THAT EMPTIED OUT IS GONE,
        // not left behind as `{}` for every future comparison to read as drift.
        if (fleet[name] === undefined && !Object.keys(next).length) { delete out[name]; }
        else { out[name] = next; }
    }
    for (const [name, entry] of Object.entries(own.entries ?? {})) {
        const fleetMap = asObj(fleet[name]);
        const entries = Object.keys(fleetMap);
        if (!entries.length) { continue; }
        const slotMap: Obj = { ...asObj(out[name]) };
        const baseMap = asObj(base[name]);
        for (const key of entries) {
            slotMap[key] = projectOwned(entry, asObj(fleetMap[key]), asObj(slotMap[key]), asObj(baseMap[key]));
        }
        out[name] = slotMap;
    }
    return out;
}

/** One list a slot session added to and the fleet has not been told about. */
export interface Promotion {
    /** the key path a card and the journal print: `projects[D:\repo].allowedTools` */
    path: string;
    /** what the slot holds and the fleet does not, in the words the engine wrote */
    added: string[];
}

/**
 * ‼️ X-291 — THE RETURN LEG. What a slot session approved that the fleet has
 * never held: every `merge` key, every item the slot has, the fleet lacks and
 * the base did not record as something the fleet once had.
 *
 * ‼️ ONLY INSIDE AN ENTRY THE FLEET ALREADY HAS. An entry only the slot knows
 * is a FOLDER TRUST the main directory has never granted, and creating one
 * would carry `hasTrustDialogAccepted` — a `fleet` key — into the user's own
 * file off the back of a permission list. The user's decision was that
 * permission LISTS promote; a new trust record is a different question and is
 * left for it. A folder first opened under a slot therefore still asks once in
 * the main directory, and that is a stated limit, not an oversight.
 */
export function promotable(own: KeyOwnership, fleet: Obj, slot: Obj, base: Obj = {}, prefix = ''): Promotion[] {
    const out: Promotion[] = [];
    for (const key of plainKeys(own, fleet, slot)) {
        if (policyOf(own, key) !== 'merge') { continue; }
        const added = newInSlot(fleet[key], slot[key], base[key]);
        if (added.length) { out.push({ path: prefix + key, added: added.map(v => typeof v === 'string' ? v : idOf(v)) }); }
    }
    for (const [name, nested] of Object.entries(own.nested ?? {})) {
        if (slot[name] === undefined) { continue; }
        out.push(...promotable(nested, asObj(fleet[name]), asObj(slot[name]), asObj(base[name]), `${prefix}${name}.`));
    }
    for (const [name, entry] of Object.entries(own.entries ?? {})) {
        const fleetMap = asObj(fleet[name]);
        const slotMap = asObj(slot[name]);
        const baseMap = asObj(base[name]);
        for (const key of Object.keys(fleetMap)) {
            if (slotMap[key] === undefined) { continue; }
            out.push(...promotable(entry, asObj(fleetMap[key]), asObj(slotMap[key]), asObj(baseMap[key]),
                `${prefix}${name}[${key}].`));
        }
    }
    return out.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * The FLEET's object with the slot's new approvals merged in. A new object;
 * `fleet` is not mutated. Nothing but `merge` keys is ever touched — a scalar,
 * an MCP server definition and the sign-in stay exactly where they were.
 *
 * Converges by construction: `fleet ∪ (slot \ base)` is the same set as
 * `(fleet ∪ slot) \ (base \ fleet)`, which is what `projectOwned` writes into
 * the slot, so after one gate both sides say the same thing and that is the
 * next base.
 */
export function promoteOwned(own: KeyOwnership, fleet: Obj, slot: Obj, base: Obj = {}): Obj {
    const out: Obj = { ...fleet };
    for (const key of plainKeys(own, fleet, slot)) {
        if (policyOf(own, key) !== 'merge') { continue; }
        const added = newInSlot(fleet[key], slot[key], base[key]);
        if (!added.length) { continue; }
        out[key] = [...(Array.isArray(fleet[key]) ? fleet[key] as unknown[] : []), ...clone(added)];
    }
    for (const [name, nested] of Object.entries(own.nested ?? {})) {
        if (slot[name] === undefined) { continue; }
        const next = promoteOwned(nested, asObj(fleet[name]), asObj(slot[name]), asObj(base[name]));
        if (Object.keys(next).length || fleet[name] !== undefined) { out[name] = next; }
    }
    for (const [name, entry] of Object.entries(own.entries ?? {})) {
        const fleetMap = asObj(fleet[name]);
        const slotMap = asObj(slot[name]);
        const baseMap = asObj(base[name]);
        const entries = Object.keys(fleetMap);
        if (!entries.length) { continue; }
        const nextMap: Obj = { ...fleetMap };
        for (const key of entries) {
            if (slotMap[key] === undefined) { continue; }
            nextMap[key] = promoteOwned(entry, asObj(fleetMap[key]), asObj(slotMap[key]), asObj(baseMap[key]));
        }
        out[name] = nextMap;
    }
    return out;
}

/**
 * ‼️ X-291 — THE NEXT BASE: only the merge keys, only where both sides now
 * agree. Deliberately not the whole file — a base that copied `.claude.json`
 * would be a second identity store on disk (X-270), and everything outside a
 * merge key is decided by one side alone and needs no memory.
 */
export function mergeBase(own: KeyOwnership, converged: Obj): Obj {
    const out: Obj = {};
    for (const key of plainKeys(own, converged)) {
        if (policyOf(own, key) !== 'merge') { continue; }
        if (converged[key] !== undefined) { out[key] = clone(converged[key]); }
    }
    for (const [name, nested] of Object.entries(own.nested ?? {})) {
        const next = mergeBase(nested, asObj(converged[name]));
        if (Object.keys(next).length) { out[name] = next; }
    }
    for (const [name, entry] of Object.entries(own.entries ?? {})) {
        const map = asObj(converged[name]);
        const nextMap: Obj = {};
        for (const key of Object.keys(map)) {
            const next = mergeBase(entry, asObj(map[key]));
            if (Object.keys(next).length) { nextMap[key] = next; }
        }
        if (Object.keys(nextMap).length) { out[name] = nextMap; }
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
