/**
 * Settings rows → sections → groups, by the catalog (U-226). Every row gets its catalog fields (section, group,
 * tier, label, summary, unit, terms, place) here, once, so the page, the bridge and the command palette read one
 * answer. A key the catalog has no record for is never hidden: it lands in its section's More group.
 */
import type { SettingItem, SettingsCategory } from '../settingsops';
import { settingName } from '../settingSearch';
import { CatalogGroup, catalogEntry, SECTIONS, sectionForUnfiled } from './index';

export const MORE_GROUP: CatalogGroup = {
    id: 'more',
    label: 'More',
    about: 'Settings the catalog does not file yet — shown here so nothing is hidden.'
};

export function groupIntoSections(items: SettingItem[]): SettingsCategory[] {
    const bySection = new Map<string, { item: SettingItem; rank: number; order: number }[]>();
    const valueOf = new Map(items.map(i => [i.key.replace(/^agentFarm\./, ''), i.value]));
    for (const it of items) {
        const short = it.key.replace(/^agentFarm\./, '');
        const e = catalogEntry(short);
        // U-229 — a model or effort picker lists one engine's values: its own, or the one its sibling setting names now
        const engine = e?.engineFrom ? String(valueOf.get(e.engineFrom) ?? '').trim() || 'claude' : e?.engine;
        const sec = e ? SECTIONS.find(s => s.id === e.section)! : sectionForUnfiled(short);
        const known = e ? sec.groups.find(g => g.id === e.group) : undefined;
        const grp = known ?? MORE_GROUP;
        const terms = [e?.terms, grp.terms].filter(Boolean).join(' ');
        const row: SettingItem = {
            ...it,
            section: sec.id,
            group: grp.id,
            tier: e?.tier ?? 'advanced',
            label: e?.label ?? settingName(it.key),
            ...(e?.summary ? { summary: e.summary } : {}),
            ...(e?.unit ? { unit: e.unit } : {}),
            ...(e?.zeroMeans ? { zeroMeans: e.zeroMeans } : {}),
            ...(e?.control ? { control: e.control } : {}),
            ...(e?.from ? { from: e.from } : {}),
            ...(engine ? { engine } : {}),
            ...(e?.options ? { options: e.options } : {}),
            ...(terms ? { terms } : {}),
            place: `${sec.label} › ${grp.label}`
        };
        const list = bySection.get(sec.id) ?? [];
        list.push({ item: row, rank: known ? sec.groups.indexOf(known) : sec.groups.length, order: e?.order ?? 0 });
        bySection.set(sec.id, list);
    }
    const out: SettingsCategory[] = [];
    for (const sec of SECTIONS) {
        const rows = bySection.get(sec.id);
        if (!rows?.length) { continue; }
        rows.sort((a, b) => a.rank - b.rank || a.order - b.order || a.item.key.localeCompare(b.item.key));
        const groups = [...sec.groups, MORE_GROUP]
            .filter(g => rows.some(r => r.item.group === g.id))
            .map(g => ({ id: g.id, label: g.label, about: g.about }));
        out.push({ id: sec.id, label: sec.label, about: sec.about, groups, items: rows.map(r => r.item) });
    }
    return out;
}
