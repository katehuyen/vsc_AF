/**
 * ‼️ U-89 — WHAT ACTUALLY GOES IN THAT BOX.
 *
 * Twenty-seven of Agent Farm's settings are an array or an object, and the
 * settings page drew every one of them as a bare JSON textarea with a one-line
 * description above it. Measured on this manifest: 129 settings, 27 of them a
 * JSON box — and for twelve of those the manifest ALREADY declares every field
 * of an entry, with a sentence about each one. The page threw all of it away.
 * So the user was asked to hand-write JSON whose shape was documented six feet
 * away in the same file, and the honest report on that page was the one they
 * gave: "a field you cannot use".
 *
 * This module is the missing read. It is DERIVED FROM THE SCHEMA, never a list
 * of keys: a setting added tomorrow explains itself on the page without anybody
 * editing the page, which is the same rule the Browse button follows
 * (`x-af-browse`) and for the same reason — a hand-written list goes stale the
 * first time somebody forgets it.
 *
 * Two things come out of a schema:
 *
 *   · the SHAPE — what an entry is, which fields it has, what type each one is,
 *     which of them are required, what values are allowed, and the sentence the
 *     manifest already wrote about each.
 *   · an EXAMPLE — one entry with every field filled in, built from the same
 *     schema, so "insert an example" produces something that VALIDATES rather
 *     than something a reader has to correct first.
 *
 * Pure: no vscode, no fs. It is handed the raw manifest property and nothing
 * else, so a test can ask it about the real package.json.
 */

/** The subset of JSON Schema this manifest actually uses. */
export interface SchemaNode {
    type?: unknown;
    enum?: unknown;
    items?: SchemaNode;
    properties?: Record<string, SchemaNode>;
    required?: unknown;
    default?: unknown;
    description?: string;
    markdownDescription?: string;
    minimum?: unknown;
    maximum?: unknown;
}

/** One field of an entry, as the page draws it. */
export interface ShapeField {
    name: string;
    /** `string`, `number`, `boolean`, `string[]`, `object`… — already readable. */
    type: string;
    required: boolean;
    /** The sentence the manifest wrote about it, or ''. */
    description: string;
    /** The values it will accept, when the schema names them. */
    allowed?: string[];
}

/**
 * What kind of box this is — which decides what the page can offer beyond a
 * textarea, and is the thing the JSON view was hiding.
 *
 *   `list`    — an array of plain values (a list of paths, of hosts, of ids).
 *               There is no JSON to write here at all; it is a list.
 *   `rows`    — an array of objects with declared fields: a table.
 *   `form`    — one object with declared fields: a form.
 *   `map`     — a free-form object, key → value, whose keys the user invents.
 *   `free`    — the schema says array or object and nothing more. The JSON box
 *               is the honest answer, and saying so is better than pretending.
 */
export type ShapeKind = 'list' | 'rows' | 'form' | 'map' | 'free';

export interface SettingShape {
    kind: ShapeKind;
    /** One line naming what the value IS, in the page's own voice. */
    summary: string;
    /** For `list`: the type of one entry. For `rows`/`form`: the fields. */
    itemType?: string;
    /**
     * ‼️ U-108 — for a `list` of paths: the picker one ROW gets.
     *
     * Declared on the schema's `items` (`x-af-browse`), exactly as a scalar
     * path setting declares it on itself — so which lists offer Browse is a
     * fact of the manifest and not a list of keys somebody has to remember
     * to extend. Typing a Windows path by hand is where the typo that
     * makes a feature look broken comes from, and a list of roots is the
     * place a user types the most of them.
     */
    itemBrowse?: 'file' | 'folder';
    /**
     * ‼️ U-108 — for a `list` whose entries are a closed set: the values.
     * A row is then a PICKER rather than a text box, which is the whole
     * difference between "which categories can I delegate?" being
     * answerable on the page and being answerable only in the guide.
     */
    itemAllowed?: string[];
    /**
     * ‼️ U-110 — for a `map`: what ONE VALUE is, read off `additionalProperties`.
     *
     * The three maps this manifest ships are not the same shape at all —
     * `budgets` is name → number, `superpowersDefaults` is name → boolean, and
     * `agentEngineDefaults` is name → a nested object. The schema says so on
     * each of them, and the page drew the same empty JSON textarea over all
     * three. With this, a map gets a NUMBER box or a yes/no picker the day it
     * declares one, and a map that declares nothing keeps its JSON honestly.
     */
    valueType?: string;
    /** For a `map` whose values are a closed set: the values. */
    valueAllowed?: string[];
    /**
     * ‼️ U-110 — for a `map`: WHERE THE NAMES COME FROM (`x-af-keys`).
     *
     * The keys are the user's, so nothing can list them — but the page knows
     * the fleet, and typing an agent's name by hand is where the silent
     * mismatch comes from: a budget under a misspelled name is a budget that
     * never applies and never says why. Which list a map draws on is a fact of
     * the MANIFEST, because the three differ: `budgets` is keyed by agent name
     * and `*` means the whole fleet, `superpowersDefaults` is keyed by name
     * with no wildcard at all (it is an exact match, see superpowersDefaultsKey)
     * and `agentEngineDefaults` is keyed by an agent's FOLDER. A page that
     * guessed one list for all three would offer `*` where it does nothing.
     */
    keySource?: string;
    fields: ShapeField[];
    /** A complete, valid value with one entry in it. `undefined` when the
     *  schema says too little to build one honestly — see `free`. */
    example?: unknown;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v);

/** The schema's `type`, as one word. VS Code allows an array of types. */
function typeOf(node: SchemaNode | undefined): string {
    if (!node) { return ''; }
    const t = node.type;
    return Array.isArray(t) ? String(t[0] ?? '') : String(t ?? '');
}

/** A type a person can read: `string`, `number[]`, `object`… */
function readableType(node: SchemaNode | undefined): string {
    const t = typeOf(node);
    if (t === 'array') {
        const inner = readableType(node?.items);
        return inner ? `${inner}[]` : 'list';
    }
    if (!t && node?.properties) { return 'object'; }
    return t || 'any';
}

function describe(node: SchemaNode | undefined): string {
    return (node?.description ?? node?.markdownDescription ?? '').trim();
}

function fieldsOf(node: SchemaNode | undefined): ShapeField[] {
    const props = node?.properties;
    if (!props) { return []; }
    const required = new Set(Array.isArray(node?.required) ? node!.required.map(String) : []);
    return Object.entries(props).map(([name, sub]) => ({
        name,
        type: readableType(sub),
        required: required.has(name),
        description: describe(sub),
        ...(Array.isArray(sub.enum) ? { allowed: sub.enum.map(String) } : {})
    }));
}

/**
 * A value that would pass the schema, for ONE entry.
 *
 * ‼️ THE SCHEMA'S OWN DEFAULT WINS wherever there is one. An example that
 * contradicts the shipped default is an example that teaches the wrong thing,
 * and for a field like `when: "limit"` the default IS the answer most people
 * want. Only where the schema says nothing does this invent a placeholder, and
 * the placeholder says what it is rather than pretending to be data.
 */
function exampleOf(node: SchemaNode | undefined, name = ''): unknown {
    if (!node) { return ''; }
    if (node.default !== undefined && typeOf(node) !== 'array' && typeOf(node) !== 'object') {
        return node.default;
    }
    if (Array.isArray(node.enum) && node.enum.length) { return node.enum[0]; }
    const t = typeOf(node);
    if (t === 'boolean') { return false; }
    if (t === 'number' || t === 'integer') {
        const min = Number(node.minimum);
        return Number.isFinite(min) ? min : 0;
    }
    if (t === 'array') { return [exampleOf(node.items, name)]; }
    if (t === 'object' || node.properties) {
        const out: Record<string, unknown> = {};
        for (const [k, sub] of Object.entries(node.properties ?? {})) { out[k] = exampleOf(sub, k); }
        return out;
    }
    // A string, and the field's own name is the most useful placeholder there
    // is: `<name>` reads as "put the name here" in a way "string" never does.
    return name ? `<${name}>` : '<value>';
}

/**
 * Read a manifest property and say what goes in it.
 *
 * Returns `undefined` for anything that is not a JSON box — a string, a number,
 * a boolean, an enum. Those already have a control that shows their value and
 * accepts nothing else, and a shape panel over the top of one would be an
 * explanation of a box that needs none.
 */
export function shapeOf(node: SchemaNode | undefined): SettingShape | undefined {
    const t = typeOf(node);
    if (!node || (t !== 'array' && t !== 'object')) { return undefined; }

    if (t === 'array') {
        const items = node.items;
        const itemType = typeOf(items);
        if (items?.properties) {
            const fields = fieldsOf(items);
            return {
                kind: 'rows',
                summary: `A list of entries. Each entry is an object with ${fields.length} field(s)`
                    + `${fields.some(f => f.required) ? ', of which the required ones are marked' : ''}.`,
                itemType: 'object',
                fields,
                example: [exampleOf(items)]
            };
        }
        if (itemType && itemType !== 'object') {
            // ‼️ U-108 — READ OFF THE ITEMS, so the page can stop being a JSON
            // box for these. Both are schema facts and neither is a key list:
            // a setting that declares a path item gets Browse on every row, and
            // one that declares an enum gets a picker, the day it is added.
            const browse = (items as { 'x-af-browse'?: unknown } | undefined)?.['x-af-browse'];
            return {
                kind: 'list',
                summary: `A plain list of ${itemType}s — one per entry. There is no structure to `
                    + 'get right here; it is the list itself.',
                itemType,
                ...(browse === 'file' || browse === 'folder' ? { itemBrowse: browse } : {}),
                ...(Array.isArray(items?.enum) && items.enum.length
                    ? { itemAllowed: items.enum.map(String) } : {}),
                fields: [],
                example: [exampleOf(items)]
            };
        }
        return {
            kind: 'free',
            summary: 'A list whose entries this setting does not describe further — write the JSON '
                + 'the feature that reads it expects.',
            ...(itemType ? { itemType } : {}),
            fields: []
        };
    }

    if (node.properties) {
        const fields = fieldsOf(node);
        return {
            kind: 'form',
            summary: `One object with ${fields.length} field(s). Leave a field out and its own `
                + 'default stays in charge — an object with nothing in it is a real answer.',
            fields,
            example: exampleOf(node)
        };
    }

    // A free-form map: the KEYS are the user's (an agent name, an engine id),
    // so nothing can list them — but the default usually shows one, and one
    // real pair says more about the shape than any sentence.
    const def = isObj(node.default) ? node.default : undefined;
    const firstKey = def ? Object.keys(def)[0] : undefined;
    // ‼️ U-110 — READ OFF `additionalProperties` AND `x-af-keys`, so a map can
    // stop being a JSON box too. Both are schema facts and neither is a key
    // list: a map that declares its value type gets the right box, and one that
    // declares where its names come from gets them offered, the day it is added.
    const vals = (node as { additionalProperties?: SchemaNode }).additionalProperties;
    const valueType = isObj(vals) ? readableType(vals) : '';
    const keySource = (node as { 'x-af-keys'?: unknown })['x-af-keys'];
    return {
        kind: 'map',
        summary: `A set of name → ${valueType || 'value'} pairs. The names are yours (an agent, `
            + 'an engine, a label); a name that is not listed simply uses the ordinary default.',
        fields: [],
        ...(valueType ? { valueType } : {}),
        ...(isObj(vals) && Array.isArray(vals.enum) && vals.enum.length
            ? { valueAllowed: vals.enum.map(String) } : {}),
        ...(typeof keySource === 'string' && keySource ? { keySource } : {}),
        ...(firstKey !== undefined
            ? { example: { [firstKey]: def![firstKey] } }
            : { example: {} })
    };
}

/**
 * The example as text, formatted the way the box formats its value — so
 * "insert an example" and "what is in there now" are read in the same shape.
 */
export function exampleText(shape: SettingShape | undefined): string {
    if (!shape || shape.example === undefined) { return ''; }
    try { return JSON.stringify(shape.example, null, 2); } catch { return ''; }
}
