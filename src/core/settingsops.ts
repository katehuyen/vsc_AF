/**
 * Farm Settings — pure model behind the rich settings page.
 *
 * The page is SCHEMA-DRIVEN: it renders whatever `package.json` contributes
 * under `agentFarm.*` (type, enum, default, description). Where each key is
 * filed and what a person reads about it is the catalog's
 * (src/core/settingsCatalog/); a key without a record is still drawn, in its
 * section's More group, and fails the catalog test by name.
 */
import { PreviewedPath } from './pathVars';
import { SchemaNode, SettingShape, shapeOf } from './settingShape';
import { groupIntoSections } from './settingsCatalog/model';
import type { CatalogFields } from './settingsCatalog/types';
export { groupIntoSections } from './settingsCatalog/model';
export type { SchemaNode, SettingShape, ShapeField, ShapeKind } from './settingShape';
export { exampleText, shapeOf } from './settingShape';

/**
 * ‼️ MEASURED — VS CODE CAN DROP ONE KEY ITS OWN MANIFEST DECLARES.
 *
 * Exactly one of the 124 settings this build contributes,
 * `agentFarm.budgetsUnlimited`, is missing from the running window's
 * configuration registry: `getConfiguration().get()` hands back `undefined`
 * instead of the declared default `false`, and `update()` refuses it with
 * "is not a registered configuration". The manifest is not at fault — the key
 * occurs exactly once, with a valid boolean schema, in the installed folder's
 * `package.json`, and the keys either side of it in the same object both work.
 * Whatever the registry did, no extension can argue with it from inside.
 *
 * A setting that vanishes is not a setting, so the READER stops trusting the
 * registry alone: when it hands back nothing, the user's own `settings.json` is
 * read for that key and the figure they typed is honoured. The WRITE side has
 * the same fallback and it is surgical — `core/jsoncPatch.ts` replaces the one
 * member's span and leaves every comment, blank line and indent alone, because
 * rewriting a user's settings file to set a switch is the cure being worse.
 *
 * `settings.json` is JSONC: comments and trailing commas are legal there, and a
 * `//` inside a string — every Windows path, every URL in that file — has to
 * survive the stripping.
 */
export function stripJsonc(text: string): string {
    let out = '';
    const commas: number[] = [];
    let inStr = false, esc = false, inLine = false, inBlock = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i], n = text[i + 1];
        if (inLine) { if (c === '\n') { inLine = false; out += c; } continue; }
        if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++; } continue; }
        if (inStr) {
            out += c;
            if (esc) { esc = false; } else if (c === '\\') { esc = true; } else if (c === '"') { inStr = false; }
            continue;
        }
        if (c === '"') { inStr = true; out += c; continue; }
        if (c === '/' && n === '/') { inLine = true; i++; continue; }
        if (c === '/' && n === '*') { inBlock = true; i++; continue; }
        if (c === ',') { commas.push(out.length); }
        out += c;
    }
    // Trailing commas, resolved against the comma positions this pass already
    // knows are outside a string — a regex over the whole text would eat the
    // comma in `"one, two"` whenever a `}` happened to follow it.
    const chars = out.split('');
    for (const at of commas) {
        let j = at + 1;
        while (j < chars.length && /\s/.test(chars[j])) { j++; }
        if (chars[j] === '}' || chars[j] === ']') { chars[at] = ' '; }
    }
    return chars.join('');
}

/** One key out of a JSONC settings file: flat `a.b` first, then the nested
 *  spelling VS Code also accepts. `found` distinguishes "set to false" from
 *  "not there", which is the whole point of reading the file at all. */
export function lookupSetting(obj: unknown, key: string): { found: boolean; value?: unknown } {
    if (!obj || typeof obj !== 'object') { return { found: false }; }
    const flat = obj as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(flat, key)) { return { found: true, value: flat[key] }; }
    let cur: unknown = obj;
    for (const part of key.split('.')) {
        if (!cur || typeof cur !== 'object'
            || !Object.prototype.hasOwnProperty.call(cur as object, part)) { return { found: false }; }
        cur = (cur as Record<string, unknown>)[part];
    }
    return { found: true, value: cur };
}

export function readFlatSetting(text: string, key: string): { found: boolean; value?: unknown } {
    let obj: unknown;
    try { obj = JSON.parse(stripJsonc(text)); } catch { return { found: false }; }
    return lookupSetting(obj, key);
}

export interface SettingSpec {
    key: string;                      // full key, e.g. "agentFarm.livePort"
    type: string;                     // schema type: string|number|boolean|array|object
    enum?: string[];
    default: unknown;
    description: string;
    markdownDescription?: string;
    /**
     * ‼️ A PATH SETTING GETS A BROWSE BUTTON, AND THE SCHEMA IS WHERE IT SAYS
     * SO. The settings page is schema-driven on purpose — a setting added
     * tomorrow appears without anybody editing the page — so "this one is a
     * path" has to travel the same way, or the page grows a hand-written list
     * of keys that goes stale the first time somebody forgets it. Declare
     * `"x-af-browse": "file"` (or `"folder"`) in package.json and the text box
     * gets a picker beside it. Anything else is just a text box.
     *
     * ‼️ THE KEY IS `x-af-browse` AND NOT `format`, WHICH COST A RELEASE. VS
     * Code validates every configuration property it is offered, and `format`
     * is a JSON-Schema keyword it knows: given a value it does not recognise it
     * REFUSES THE WHOLE PROPERTY. The setting then has no registered default,
     * so `getConfiguration().get()` returns nothing and the page — which builds
     * its rows from the raw manifest, not from the registry — draws the row
     * with an empty box. It looks exactly like a setting nobody has filled in.
     * An `x-` prefixed key is outside the vocabulary VS Code checks and rides
     * through untouched.
     */
    browse?: 'file' | 'folder';
    /**
     * ‼️ U-84 — A SETTING WHOSE ANSWER IS A NAME THAT HAS TO EXIST.
     *
     * `telegram.defaultAgent` is a string, so the page drew a text box, so the
     * one way to get it wrong — type a name no agent has — was the easiest thing
     * to do and produced no error anywhere: a chat then binds to nobody and the
     * bridge looks broken. The values are not a schema `enum` because they are
     * not a fact of the manifest at all; they are whatever agents this machine
     * has TODAY.
     *
     * So the schema names a SOURCE (`"x-af-values": "agent"`) and the host fills
     * it in on every draw. Same reason as `x-af-browse` one field up, and the
     * same `x-` prefix for the same hard-won reason: a key VS Code recognises
     * and cannot validate makes it refuse the whole property.
     */
    values?: string;
    /** S-82 — the schema's own `editPresentation: multilineText`: a text box, not a one-line field */
    multiline?: true;
    /** U-227 — a number's bounds as the schema states them; the box carries them and sanitizeValue holds them */
    minimum?: number;
    maximum?: number;
    /** U-227 — one sentence per `enum` member, in its order (the schema's enumDescriptions) */
    enumDescriptions?: string[];
}

/** U-226 — the catalog's fields for this key (section, group, tier, label, …) are filled in by groupIntoSections. */
export interface SettingItem extends SettingSpec, CatalogFields {
    /**
     * ‼️ U-89 — WHAT ACTUALLY GOES IN THE BOX, derived from this key's own
     * schema rather than written down anywhere. Only ever set for an array or
     * an object, which are the only settings the page draws as raw JSON. See
     * core/settingShape.ts for why it is derived and not listed.
     */
    shape?: SettingShape;
    value: unknown;                   // effective value right now
    modified: boolean;                // differs from default
    /** ‼️ X-84 — set when a value WAS found in a settings file and refused for
     *  not being the shape the manifest declares. The page says so on the row:
     *  a refusal nobody can see is a second opinion held in private. */
    refusal?: string;
    /** X-470 — what the box ACTS at right now when another setting bounds it (the stay line above the
     *  Account ceiling acts at the ceiling). Said on the row, so the value written is never mistaken for the one in force. */
    inForce?: string;
    /** U-227 — a change takes a window reload (needsReload), said on the row and in its panel */
    reloadRequired?: boolean;
}

/** The host's per-row notes, by name: the same notes reach the page and the bridge. */
export interface SettingRowNotes {
    refusalOf?: (key: string) => string | undefined;
    inForceOf?: (key: string) => string | undefined;
}

/** A catalog section: its groups in order, and its rows ordered by group, then by the catalog. */
export interface SettingsCategory {
    id: string;
    label: string;
    about?: string;
    groups?: { id: string; label: string; about: string }[];
    items: SettingItem[];
}

/**
 * ‼️ X-193 — WHAT A PATH SETTING ACTUALLY OPENS, beside the row that holds it.
 *
 * DENSITY: a box holding `${vault}/00_AGENT_AREA/00_OUTPUT/01_CEVAPLAR` tells
 * the reader nothing about the folder it opens, and the one question they have
 * — *where is that, on THIS machine* — used to cost them a Browse dialog or a
 * campaign that quietly looked in the wrong place.
 *
 * ‼️ WHICH settings get it is DERIVED FROM THEIR OWN SCHEMA, never listed here.
 * A hand-written list of keys goes stale the first time somebody adds a path
 * setting and forgets, which is the disease `x-af-browse` was introduced to
 * cure; so the rule is simply "the schema says what to browse for". A setting
 * holding nothing is not asked about — an empty box has nothing to resolve, and
 * a row of reasons under an empty list is noise the reader learns to skip.
 *
 * The resolver is handed ALL of one setting's templates at once, so a list of
 * twelve folders is one call rather than twelve.
 */
export function pathPreviews(
    categories: SettingsCategory[],
    resolve: (templates: string[]) => PreviewedPath[]
): Record<string, PreviewedPath[]> {
    const out: Record<string, PreviewedPath[]> = {};
    for (const cat of categories ?? []) {
        for (const it of cat.items ?? []) {
            const takesPaths = !!it.browse || !!it.shape?.itemBrowse;
            if (!takesPaths) { continue; }
            const templates = Array.isArray(it.value)
                ? it.value.map(v => String(v ?? ''))
                : (typeof it.value === 'string' && it.value.trim() ? [it.value] : []);
            if (!templates.length) { continue; }
            out[it.key] = resolve(templates);
        }
    }
    return out;
}

/**
 * Does this setting need a window reload? Derived from the setting's OWN
 * description rather than a hand-kept list — a list of keys goes stale the
 * first time somebody adds a setting and forgets it, and the description is
 * where the fact already lives.
 *
 * ‼️ U-227 — ONLY A SENTENCE THAT SAYS SO. The word alone was read as the fact, and all three
 * descriptions it caught used it for something else ("survives a restart", "does not restart it",
 * "parked before a window reload") — the row's Reload chip and settings.set would have told the
 * reader a change needs a reload when none does.
 */
const RELOAD_SAID = [
    /\b(restart|reload)\s+(is\s+)?required\b/i,
    /\b(requires?|needs?|takes?)\s+(a\s+|the\s+)?(window\s+)?(restart|reload)\b/i,
    /\b(restart|reload)\s+the\s+(window|extension|editor|vs\s*code)\b/i,
    /\btakes?\s+effect\s+(only\s+)?(after|on)\s+(a\s+|the\s+|next\s+)*(window\s+)?(restart|reload)\b/i
];
export function needsReload(description: string): boolean {
    const d = description ?? '';
    return RELOAD_SAID.some(re => re.test(d));
}

/** Deep-enough equality for setting values (JSON-shaped data only). */
export function sameValue(a: unknown, b: unknown): boolean {
    if (a === b) { return true; }
    try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

/** Build the section → group → row model from the live schema + current values, filed by the catalog. */
export function buildSettingsModel(
    properties: Record<string, SchemaNode & { 'x-af-browse'?: unknown; 'x-af-values'?: unknown; editPresentation?: unknown; enumDescriptions?: unknown; markdownEnumDescriptions?: unknown }>,
    valueOf: (key: string) => unknown,
    notes: SettingRowNotes = {}
): SettingsCategory[] {
    const { refusalOf, inForceOf } = notes;
    const items: SettingItem[] = [];
    for (const [key, p] of Object.entries(properties)) {
        const value = valueOf(key);
        const item: SettingItem = {
            key,
            type: Array.isArray(p.type) ? String(p.type[0]) : String(p.type ?? 'string'),
            enum: Array.isArray(p.enum) ? p.enum.map(String) : undefined,
            default: p.default,
            description: p.description ?? p.markdownDescription ?? '',
            markdownDescription: p.markdownDescription,
            ...(p['x-af-browse'] === 'file' ? { browse: 'file' as const } : {}),
            ...(p['x-af-browse'] === 'folder' ? { browse: 'folder' as const } : {}),
            ...(p.editPresentation === 'multilineText' ? { multiline: true as const } : {}),
            ...(typeof p.minimum === 'number' ? { minimum: p.minimum } : {}),
            ...(typeof p.maximum === 'number' ? { maximum: p.maximum } : {}),
            ...(() => {
                const d = p.enumDescriptions ?? p.markdownEnumDescriptions;
                return Array.isArray(d) ? { enumDescriptions: d.map(x => String(x ?? '')) } : {};
            })(),
            // U-84 — a picker whose options only the host knows. Read here for
            // the reason the shape below is: asked for on the page, it would be
            // a thing the NEXT surface that lists settings does without.
            ...(typeof p['x-af-values'] === 'string' && p['x-af-values']
                ? { values: p['x-af-values'] as string } : {}),
            // ‼️ U-89 — read here, once, for every key. A shape asked for on the
            // page would be a shape the NEXT surface that lists settings does
            // without.
            ...(() => { const s = shapeOf(p); return s ? { shape: s } : {}; })(),
            value,
            modified: !sameValue(value, p.default),
            ...(needsReload(p.description ?? p.markdownDescription ?? '') ? { reloadRequired: true } : {}),
            ...(refusalOf?.(key) ? { refusal: refusalOf(key) } : {}),
            ...(inForceOf?.(key) ? { inForce: inForceOf(key) } : {})
        };
        items.push(item);
    }
    return groupIntoSections(items);
}

/** Parse + validate a raw string from the page into a typed setting value. */
export function sanitizeValue(
    spec: { type: string; enum?: string[]; minimum?: number; maximum?: number },
    raw: unknown
): { ok: true; value: unknown } | { ok: false; error: string } {
    switch (spec.type) {
        case 'boolean':
            return { ok: true, value: raw === true || raw === 'true' };
        case 'number': {
            const n = Number(raw);
            if (!isFinite(n)) { return { ok: false, error: 'not a number' }; }
            // U-227 — the schema's bounds; VS Code would only flag the file, the page and the bridge refuse
            if (typeof spec.minimum === 'number' && n < spec.minimum) { return { ok: false, error: `must be at least ${spec.minimum}` }; }
            if (typeof spec.maximum === 'number' && n > spec.maximum) { return { ok: false, error: `must be at most ${spec.maximum}` }; }
            return { ok: true, value: n };
        }
        case 'array':
        case 'object': {
            if (typeof raw !== 'string') {
                // already structured (profile apply) — accept as-is
                return { ok: true, value: raw };
            }
            const text = raw.trim();
            if (!text) { return { ok: true, value: spec.type === 'array' ? [] : {} }; }
            try {
                const v = JSON.parse(text);
                if (spec.type === 'array' && !Array.isArray(v)) { return { ok: false, error: 'expected a JSON array' }; }
                if (spec.type === 'object' && (typeof v !== 'object' || v === null || Array.isArray(v))) {
                    return { ok: false, error: 'expected a JSON object' };
                }
                return { ok: true, value: v };
            } catch (e) {
                return { ok: false, error: 'invalid JSON: ' + String((e as Error).message).slice(0, 80) };
            }
        }
        default: {
            const s = String(raw ?? '');
            if (spec.enum && spec.enum.length && !spec.enum.includes(s)) {
                return { ok: false, error: `must be one of: ${spec.enum.join(', ')}` };
            }
            return { ok: true, value: s };
        }
    }
}

export interface SettingsProfile {
    name: string;
    savedAt: number;
    /** only values that differ from the schema default — small and portable. */
    values: Record<string, unknown>;
}

/** Snapshot the current non-default values as a named profile. */
export function snapshotProfile(name: string, categories: SettingsCategory[]): SettingsProfile {
    const values: Record<string, unknown> = {};
    for (const cat of categories) {
        for (const it of cat.items) {
            if (it.modified) { values[it.key] = it.value; }
        }
    }
    return { name: name.trim().slice(0, 60) || 'unnamed', savedAt: Date.now(), values };
}

/** What applying a profile will change: set every profile value, and reset to
 *  default every currently-modified key the profile doesn't mention — so a
 *  profile is a complete state, not an overlay. */
export function profileApplyPlan(
    profile: SettingsProfile,
    categories: SettingsCategory[]
): { key: string; value: unknown }[] {
    const plan: { key: string; value: unknown }[] = [];
    const known = new Set<string>();
    for (const cat of categories) { for (const it of cat.items) { known.add(it.key); } }
    for (const [key, value] of Object.entries(profile.values ?? {})) {
        if (known.has(key)) { plan.push({ key, value }); } // unknown keys are stale — skip
    }
    const mentioned = new Set(Object.keys(profile.values ?? {}));
    for (const cat of categories) {
        for (const it of cat.items) {
            if (it.modified && !mentioned.has(it.key)) {
                plan.push({ key: it.key, value: undefined }); // reset to default
            }
        }
    }
    return plan;
}

/** Validate an imported profiles JSON (from file) — fail-soft, keep the sane ones. */
export function parseImportedProfiles(text: string): SettingsProfile[] {
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { return []; }
    const list = Array.isArray(parsed) ? parsed : [parsed];
    const out: SettingsProfile[] = [];
    for (const p of list) {
        if (!p || typeof p !== 'object') { continue; }
        const o = p as Partial<SettingsProfile>;
        if (typeof o.name !== 'string' || !o.values || typeof o.values !== 'object') { continue; }
        out.push({
            name: o.name.slice(0, 60),
            savedAt: typeof o.savedAt === 'number' ? o.savedAt : Date.now(),
            values: o.values as Record<string, unknown>
        });
    }
    return out;
}

/**
 * ‼️ X-84 — THE FALLBACK READ IS NOT A SECOND SETTINGS ENGINE.
 *
 * `readFlatSetting` exists because VS Code can hand back `undefined` for a key
 * its own manifest declares. Reading the file back is the only honest answer
 * left — but a read that guesses WHICH file, and trusts whatever shape it finds
 * there, is a second settings engine with its own opinions, and the two
 * disagree the first time the user is on a named profile or typed `"false"`
 * with the quotes on. So the fallback owes the registry three things:
 *
 *  1. the SAME FILES the running window actually writes — a named profile,
 *     Insiders, portable and remote user-data all move `settings.json`, and the
 *     path is derived from a location the host handed us, never assembled from
 *     a platform guess;
 *  2. the SAME PRECEDENCE — folder over workspace over user;
 *  3. the SAME SCHEMA — a value whose type the manifest does not declare is
 *     REFUSED, not cast. `"false"` is a five-character string, and a brake that
 *     reads it as "on" lifts every ceiling in the fleet.
 *
 * Everything here is pure: paths arrive as strings, file text arrives through a
 * reader. What touches the disk stays in `extension.ts`.
 */

/** One place a settings value can legally live. */
export interface SettingsScope {
    file: string;
    /** A `.code-workspace` keeps its settings under one key. */
    nested?: string;
}

/**
 * The running window's `User` folder, recovered from a path the host already
 * gave us inside it. `context.globalStorageUri` is
 * `<user-data>/User/globalStorage/<ext>` on the default profile and
 * `<user-data>/User/profiles/<id>/globalStorage/<ext>` on a named one — so the
 * profile, the Insiders build, the portable folder and the remote user-data
 * root are all already in that string and none of them has to be guessed.
 */
export function userFolderFromGlobalStorage(globalStorage: string): string | undefined {
    if (!globalStorage) { return undefined; }
    const sep = globalStorage.indexOf('\\') >= 0 ? '\\' : '/';
    const parts = globalStorage.split(/[\\/]/);
    while (parts.length && parts[parts.length - 1] === '') { parts.pop(); }
    const i = parts.lastIndexOf('globalStorage');
    if (i < 1) { return undefined; }
    return parts.slice(0, i).join(sep);
}

/** First scope carrying the key wins — the order of `chain` IS the precedence,
 *  so the caller builds it folder → workspace → user, the way VS Code does. */
export function readSettingScoped(
    chain: SettingsScope[],
    readText: (file: string) => string,
    key: string
): { found: boolean; value?: unknown; file?: string } {
    for (const scope of chain) {
        const text = readText(scope.file);
        if (!text) { continue; }
        let root: unknown;
        try { root = JSON.parse(stripJsonc(text)); } catch { continue; }
        // A `.code-workspace` holds the settings object one level down, and the
        // keys INSIDE it are flat again — descending first is not the same as
        // asking for `settings.agentFarm.x`, which is a spelling nobody writes.
        if (scope.nested) {
            const inner = lookupSetting(root, scope.nested);
            if (!inner.found) { continue; }
            root = inner.value;
        }
        const hit = lookupSetting(root, key);
        if (hit.found) { return { found: true, value: hit.value, file: scope.file }; }
    }
    return { found: false };
}

/**
 * A value read outside the registry is trusted only if it is the shape the
 * manifest declares. No coercion: VS Code itself falls back to the default when
 * a settings.json entry is the wrong type, and quietly disagreeing with it is
 * the exact split this door exists to close.
 */
export function schemaCheck(
    spec: { type?: string | string[]; enum?: unknown[] } | undefined,
    raw: unknown
): { ok: true; value: unknown } | { ok: false; reason: string } {
    if (raw === null || raw === undefined) { return { ok: false, reason: 'null' }; }
    // Nothing declared for this key — no contract to break.
    if (!spec || spec.type === undefined) { return { ok: true, value: raw }; }
    const types = Array.isArray(spec.type) ? spec.type : [spec.type];
    const actual = Array.isArray(raw) ? 'array'
        : typeof raw === 'object' ? 'object'
            : typeof raw === 'number' ? (Number.isInteger(raw) ? 'integer' : 'number')
                : typeof raw;
    const fits = types.some(t => t === actual
        || (t === 'number' && (actual === 'integer' || actual === 'number')));
    if (!fits) { return { ok: false, reason: 'expected ' + types.join('|') + ', got ' + actual }; }
    if ((actual === 'number' || actual === 'integer') && !isFinite(raw as number)) {
        return { ok: false, reason: 'not finite' };
    }
    if (spec.enum && spec.enum.length && !spec.enum.includes(raw)) {
        return { ok: false, reason: 'not one of: ' + spec.enum.map(String).join(', ') };
    }
    return { ok: true, value: raw };
}
