/**
 * The settings ranker, from the host's side (U-224). The page and `settings.list q` ask ONE
 * ranker, and it lives in `media/afSettingSearch.js` — loaded here the way query.ts loads
 * afQuery.js, so the two can never answer the same query differently.
 */
import * as path from 'path';

/** A setting as the ranker reads it. `place` is where it sits on the page (its section). */
export interface SearchableSetting {
    key: string;
    label?: string;
    summary?: string;
    description?: string;
    enum?: unknown[];
    enumLabels?: string[];
    place?: string;
    terms?: string;
}

export interface RankedSetting<T extends SearchableSetting> {
    item: T;
    score: number;
    /** At least one hit is a whole word; a row with only partial hits comes after every row with one. */
    start: boolean;
    index: number;
}

interface SettingSearchModule {
    rank<T extends SearchableSetting>(items: T[], q: string): RankedSetting<T>[] & { error?: string };
    match(q: string): (item: SearchableSetting) => boolean;
    termsOf(key: string): string;
    humanize(key: string): string;
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const impl: SettingSearchModule = require(path.join(__dirname, '..', '..', 'media', 'afSettingSearch.js'));

/** Best first; an empty query keeps every item in order; a query that does not parse keeps none (`error` says why). */
export function rankSettings<T extends SearchableSetting>(items: T[], q: string): RankedSetting<T>[] & { error?: string } {
    return impl.rank(items, q);
}

/** The name a key implies: 'agentFarm.alerts.stuckThresholdSeconds' → 'Stuck threshold seconds'. */
export function settingName(key: string): string {
    return impl.humanize(key);
}
