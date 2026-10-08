/**
 * The settings catalog (U-226): sixteen sections in the order the page draws them, each with its groups and one
 * record per key. A key added to `package.json` without a record here fails test/test_settings_catalog.js by name;
 * until it has one it is still drawn, in its section's More group (model.ts).
 */
import { CatalogEntry, CatalogSection } from './types';
import { general } from './general';
import { projects } from './projects';
import { agents } from './agents';
import { engines } from './engines';
import { sessions } from './sessions';
import { notify } from './notify';
import { cost } from './cost';
import { handover } from './handover';
import { tasks } from './tasks';
import { monitor } from './monitor';
import { reports } from './reports';
import { knowledge } from './knowledge';
import { media } from './media';
import { sentry } from './sentry';
import { gatekeeper } from './gatekeeper';
import { remote } from './remote';

export * from './types';

export const SECTIONS: readonly CatalogSection[] = [
    general, projects, agents, engines, sessions, notify, cost, handover,
    tasks, monitor, reports, knowledge, media, sentry, gatekeeper, remote
];

/**
 * The bridge's `category` ids from before the catalog → the section most of their keys moved to, so a call
 * written against the old map still lands somewhere sensible. Ids that are section ids too are not listed.
 */
export const LEGACY_SECTION: Readonly<Record<string, string>> = {
    core: 'agents', display: 'general', prompts: 'general', live: 'monitor', discipline: 'handover',
    kapici: 'gatekeeper', flow: 'sessions', search: 'knowledge', cli: 'engines', health: 'monitor',
    wiki: 'knowledge', superpowers: 'agents', queue: 'tasks', access: 'remote'
};

const ENTRIES = new Map<string, CatalogEntry>();
for (const s of SECTIONS) {
    Object.entries(s.rows).forEach(([key, row], order) => {
        ENTRIES.set(key, { ...row, key, section: s.id, tier: row.tier ?? 'advanced', order });
    });
}

/** A key's record (short key, no `agentFarm.` prefix), or undefined when the catalog has none. */
export function catalogEntry(shortKey: string): CatalogEntry | undefined {
    return ENTRIES.get(shortKey);
}

export function catalogKeys(): string[] {
    return [...ENTRIES.keys()];
}

/**
 * Where a key with no record is drawn: beside a sibling that shares its dotted prefix (a new `telegram.x` beside
 * the other Telegram keys), else under General.
 */
export function sectionForUnfiled(shortKey: string): CatalogSection {
    const dot = shortKey.lastIndexOf('.');
    const prefix = dot > 0 ? shortKey.slice(0, dot + 1) : '';
    const sibling = prefix ? [...ENTRIES.values()].find(e => e.key.startsWith(prefix)) : undefined;
    return SECTIONS.find(s => s.id === sibling?.section) ?? SECTIONS[0];
}

/** A section id from the bridge — a section id, an old category id, or a section's name. */
export function resolveSectionId(asked: string): string | undefined {
    const a = asked.trim().toLowerCase();
    if (!a) { return undefined; }
    return SECTIONS.find(s => s.id.toLowerCase() === a || s.label.toLowerCase() === a)?.id ?? LEGACY_SECTION[a];
}
