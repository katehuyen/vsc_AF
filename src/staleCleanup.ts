/**
 * S-101 — THE CLEANUP OF WHAT IS STUCK: one body behind the status-bar chip,
 * the review picker, the daily notice's "Clean now" and the bridge's
 * farm.cleanup. Nothing is deleted: rows are cancelled, batons stopped, cards
 * closed (a closed card's conversation can be resumed).
 */
import * as vscode from 'vscode';
import { CleanResult, StaleDeps, StaleKind, cleanStale, fmtAge, shouldNotify, staleLines, staleNotice, staleNow } from './core/staleScan';
import { BridgeRegistry } from './core/bridge';
import { registerStaleOp } from './core/staleOp';

const ICON: Record<StaleKind, string> = { queued: '$(watch)', running: '$(debug-pause)', baton: '$(git-merge)', card: '$(comment-discussion)', chain: '$(debug-disconnect)', 'route-ref': '$(plug)' };

const said = (r: CleanResult): string => `Cleaned ${r.cleaned.length}${r.failed.length ? `, ${r.failed.length} failed (${r.failed[0].why})` : ''}.`;

/** The review screen: every stuck item ticked, untick what should stay. */
export async function reviewStale(d: StaleDeps): Promise<CleanResult | undefined> {
    const items = staleNow(d);
    if (!items.length) { void vscode.window.showInformationMessage('Agent Farm: nothing has been waiting 24h or more — all clean.'); return undefined; }
    const picks = await vscode.window.showQuickPick(items.map(x => ({
        label: `${ICON[x.kind]} ${x.title}`, description: `${fmtAge(x.ageMs)} · ${x.kind}`, detail: x.why, picked: true, item: x
    })), { canPickMany: true, title: `Agent Farm — ${items.length} stuck (waiting 24h+): untick what should stay, Enter cleans the rest`, ignoreFocusOut: true });
    if (!picks || !picks.length) { return undefined; }
    const r = cleanStale(d, picks.map(p => p.item.id));
    // X-525 — what no single route serves needs a person's word; leaving it is harmless (a launch on it is refused)
    const refs = r.failed.filter(f => f.item.kind === 'route-ref');
    if (refs.length) {
        const pick = await vscode.window.showWarningMessage(
            `Agent Farm: ${refs.map(f => f.item.title).join(' · ')}. No single live route serves what they name.`,
            { modal: true, detail: 'Leaving them is harmless: a launch naming a route that is gone is refused.' },
            'Clear the route', 'Delete the launch profiles, clear the rest');
        if (pick) {
            const again = cleanStale(d, refs.map(f => f.item.id), 'the user', pick === 'Clear the route' ? 'clear' : 'delete');
            r.failed = r.failed.filter(f => f.item.kind !== 'route-ref').concat(again.failed);
            r.cleaned.push(...again.cleaned);
        }
    }
    void vscode.window.showInformationMessage(`Agent Farm: ${said(r)}`);
    return r;
}

export interface StaleWiring { refresh(): void; check(): void; review(): Promise<unknown>; summary(): { count: number; lines: string[] } }

/**
 * The chip (visible only while something is stuck), the daily check (a notice
 * plus a notification with "Clean now" — at most once in 24 hours, however many
 * things are open) and the bridge op.
 */
export function wireStale(context: vscode.ExtensionContext, bridge: BridgeRegistry, d: StaleDeps,
    post: (title: string, body: string) => void): StaleWiring {
    const LAST = 'agentfarm.staleNoticeAt';
    const bar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 86);
    bar.command = 'agentfarm.cleanupStuck';
    context.subscriptions.push(bar);
    const refresh = () => {
        const items = staleNow(d);
        if (!items.length) { bar.hide(); return; }
        bar.text = `$(clear-all) ${items.length}`;
        bar.tooltip = new vscode.MarkdownString(`**${items.length} stuck — waiting 24h or more**\n\n${staleLines(items).map(l => `- ${l}`).join('\n')}\n\nClick: review and clean (nothing is deleted).`);
        bar.show();
    };
    const review = async () => { const r = await reviewStale(d); refresh(); return r; };
    const check = () => {
        // X-525 — a broken route binding has its own question on Notices; the daily "waiting 24h+" notice counts what ages
        const items = staleNow(d).filter(x => x.kind !== 'route-ref');
        refresh();
        const now = (d.now ?? Date.now)();
        if (!shouldNotify(items.length, context.globalState.get<number>(LAST), now)) { return; }
        void context.globalState.update(LAST, now);
        const n = staleNotice(items);
        post(n.title, n.body);
        void vscode.window.showWarningMessage(`Agent Farm: ${n.title}. ${staleLines(items).join(' · ')}`, 'Clean now', 'Review…').then(choice => {
            if (choice === 'Clean now') { const r = cleanStale(d, items.map(x => x.id), 'the user (notification)'); refresh(); void vscode.window.showInformationMessage(`Agent Farm: ${said(r)}`); }
            else if (choice === 'Review…') { void review(); }
        });
    };
    const first = setTimeout(check, 3 * 60 * 1000);
    const every = setInterval(check, 30 * 60 * 1000);
    context.subscriptions.push({ dispose: () => { clearTimeout(first); clearInterval(every); } });
    registerStaleOp(bridge, d, refresh);
    // the first count waits: the Console and the task board are still being built while this is wired
    const paint = setTimeout(refresh, 10_000);
    context.subscriptions.push({ dispose: () => clearTimeout(paint) });
    const summary = () => { const items = staleNow(d); return { count: items.length, lines: staleLines(items) }; };
    return { refresh, check, review, summary };
}
