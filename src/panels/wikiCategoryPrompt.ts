import * as vscode from 'vscode';
import { WikiCategory } from '../core/wiki';
import { CategoryRenamed } from '../core/wikiCategory';
import { desktopAsk, type PanelAsk } from './panelAsk';

export interface CategoryChoice { name: string; pages: number; marks: number }

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The same union the page's topic filter offers: folders on disk and topics in the pool. */
export function categoryChoices(folders: WikiCategory[], topics: { topic: string; total: number }[]): CategoryChoice[] {
    const out: CategoryChoice[] = folders.map(f => ({ name: f.name, pages: f.pages, marks: 0 }));
    for (const t of topics) {
        const hit = out.find(c => same(c.name, t.topic));
        if (hit) { hit.marks += t.total; } else { out.push({ name: t.topic, pages: 0, marks: t.total }); }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
}

const count = (c: CategoryChoice) => `${c.pages} page(s) · ${c.marks} mark(s)`;

/**
 * A webview cannot prompt, so the page's button asks the host and the host
 * asks here. A name that already exists is a MERGE, and it is said twice on
 * purpose — in the box as you type it, and in a modal before anything moves —
 * because a merge is the one outcome renaming back cannot undo.
 */
export async function askCategoryRename(choices: CategoryChoice[], preset: string, ask: PanelAsk = desktopAsk()):
    Promise<{ from: string; to: string } | undefined> {
    if (!choices.length) {
        void ask.info('Agent Farm: the wiki has no category yet — nothing to rename.');
        return undefined;
    }
    const first = choices.find(c => preset && same(c.name, preset));
    const ordered = first ? [first, ...choices.filter(c => c !== first)] : choices;
    const pick = await ask.pick(
        ordered.map(c => ({ label: c.name, description: count(c) })),
        { title: 'Rename or merge a wiki category', placeHolder: 'Which category?' });
    if (!pick) { return undefined; }
    const from = pick.label;
    const target = (v: string) => choices.find(c => same(c.name, v.trim()) && !same(c.name, from));
    const refusal = (v: string) => !v.trim() ? 'A category needs a name.' : v.trim() === from ? 'That is its name already.' : '';
    const to = await ask.input({
        title: `Rename "${from}"`,
        value: from,
        prompt: 'The new name. The name of a category that already exists merges this one into it.',
        validateInput: v => {
            if (refusal(v)) { return refusal(v); }
            const hit = target(v);
            return hit ? {
                message: `"${hit.name}" exists (${count(hit)}) — this MERGES "${from}" into it.`,
                severity: vscode.InputBoxValidationSeverity.Warning
            } : null;
        }
    });
    if (to === undefined) { return undefined; }
    // a phone's box does not run validateInput, so its answer is held to the same refusals here
    if (refusal(to)) { void ask.warn('Agent Farm: ' + refusal(to)); return undefined; }
    const hit = target(to);
    if (hit) {
        const go = await ask.warn(`Merge "${from}" into "${hit.name}"?`, {
            modal: true,
            detail: `Every page of "${from}" moves into "${hit.name}", the two index.md sections become one, `
                + `and every mark filed under "${from}" is filed under "${hit.name}". A page name present in both `
                + 'stops the merge before anything moves.'
        }, 'Merge');
        if (go !== 'Merge') { return undefined; }
    }
    return { from, to };
}

export function renameNews(r: CategoryRenamed): string {
    const issues = r.lint.orphans.length + r.lint.unindexed.length + r.lint.brokenLinks.length + r.lint.misplaced.length;
    return `Agent Farm: "${r.from}" ${r.merged ? 'merged into' : 'is now'} "${r.to}"`
        + ` — ${r.folder === 'merged' ? `${r.moved.length} entr(ies) moved` : r.folder === 'renamed' ? 'folder renamed' : 'no folder'}`
        + `, index ${r.index}, ${r.marks} mark(s) re-filed.`
        + (issues ? ` The shape check found ${issues} thing(s) — press 🩺 Lint.` : '');
}
