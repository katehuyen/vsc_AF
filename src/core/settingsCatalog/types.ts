/**
 * The settings catalog's shapes (U-226). Everything a person reads about a setting — which
 * section and group it sits in, how prominent it is, its name, its one-line summary, its unit,
 * the words people search for it by — lives in one record per key, here and nowhere else.
 * `package.json` keeps the schema and the long description; the page and the bridge read both.
 * Pure: no VS Code import, so the fast tests reach it.
 */

/** Basic rows show when a section opens; advanced ones wait behind "Show n more". */
export type Tier = 'basic' | 'advanced';

export const UNITS = ['s', 'min', 'h', 'days', '%', '$', 'MB', 'tokens', 'chars', 'ms'] as const;
export type Unit = typeof UNITS[number];

/** Where a control's values come from, when they are not the schema's own enum. */
export const CONTROLS = ['agent', 'engine', 'model', 'effort', 'account', 'secret', 'weekday', 'hour', 'time', 'chips', 'orderedChips', 'airtableBase', 'token'] as const;
export type Control = typeof CONTROLS[number];

/** U-229 — where a chips or ordered-chips control's choices come from (core/settingSources.ts, or the engine's models). */
export const CHOICES = ['stage', 'enrichSection', 'model'] as const;
export type Choices = typeof CHOICES[number];

/** One key's record. The row's place in its section is its place in the file. */
export interface CatalogRow {
    group: string;
    /** default: advanced */
    tier?: Tier;
    /** default: the name the key implies */
    label?: string;
    summary?: string;
    unit?: Unit;
    zeroMeans?: 'off';
    control?: Control;
    /** a chips or ordered-chips control's choices */
    from?: Choices;
    /** a model or effort picker's engine, fixed… */
    engine?: string;
    /** …or the short key of the setting that names it (empty there = claude) */
    engineFrom?: string;
    /** U-230 — a pick-one's values as a person reads them (≤ 3 words); a value not named is shown as itself */
    options?: Record<string, string>;
    /** words people type looking for this key that its key and text do not say */
    terms?: string;
}

/** What groupIntoSections writes onto a settings row from its catalog record. */
export interface CatalogFields {
    section?: string;
    group?: string;
    tier?: Tier;
    label?: string;
    summary?: string;
    unit?: string;
    zeroMeans?: 'off';
    control?: string;
    from?: string;
    /** U-229 — the engine a model or effort picker lists, `engineFrom` already read */
    engine?: string;
    options?: Record<string, string>;
    terms?: string;
    /** 'Section › Group', the line a search result names its home with */
    place?: string;
}

export interface CatalogGroup {
    id: string;
    label: string;
    about: string;
    /** words that find every key of the group */
    terms?: string;
}

export interface CatalogSection {
    id: string;
    label: string;
    about: string;
    groups: CatalogGroup[];
    /** short key (no `agentFarm.` prefix) → record, in the order the section lists them */
    rows: Record<string, CatalogRow>;
}

/** A row as the model reads it: its section, its tier and its place resolved. */
export interface CatalogEntry extends CatalogRow {
    key: string;
    section: string;
    tier: Tier;
    order: number;
}
