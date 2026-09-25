/**
 * S-103 — THE LEGS MENU: one picker behind the card's ⑂⊣ right-click, the ⑂
 * status-bar item and "Agent Farm: Chain Legs…". Its title is where the chain
 * stands; each row says the ceiling it moves to. The write is applyChainLegs,
 * the same body as baton.setLegs.
 */
import * as vscode from 'vscode';
import { Baton, isLive } from './core/baton';
import { SetLegsResult, chainLegs, legsChoices, legsTitle, parseLegs } from './core/batonLegs';
import { LegsDeps } from './core/batonLegsOp';

export interface LegsUiDeps extends LegsDeps {
    alive: (sessionId: string) => boolean;
    lastLeg: (sessionId: string, on: boolean) => { ok: true; sentence: string } | { ok: false; why: string };
    openLeg: (sessionId: string) => void;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Chains still running, newest first: a live baton, or a started leg whose session is alive. */
function runningChains(list: readonly Baton[], alive: (sid: string) => boolean): Baton[] {
    const top = new Map<string, Baton>();
    for (const b of list) {
        const t = top.get(b.chainId);
        if (!t || b.hop > t.hop || (b.hop === t.hop && b.updatedAt > t.updatedAt)) { top.set(b.chainId, b); }
    }
    return [...top.values()]
        .filter(b => isLive(b) || (b.state === 'started' && !!b.toSessionId && alive(b.toSessionId)))
        .sort((a, b) => b.updatedAt - a.updatedAt);
}

const say = (r: { ok: true; sentence: string } | { ok: false; why: string }): void => {
    if (r.ok) { void vscode.window.showInformationMessage(`Agent Farm: ${r.sentence}`); }
    else { void vscode.window.showWarningMessage(`Agent Farm: ${r.why}`); }
};

/**
 * `arg`: the ⑂⊣ right-click's context (afChainId), the status bar's { chainId },
 * or nothing (the palette). `apply` is baton.setLegs's own body (applyChainLegs).
 */
export async function pickChainLegs(d: LegsUiDeps, arg: unknown, apply: (chainId: string, maxLegs: unknown) => SetLegsResult): Promise<void> {
    const a = arg && typeof arg === 'object' ? arg as Record<string, unknown> : {};
    let chainId = str(a.afChainId) || str(a.chainId);
    if (!chainId) {
        const running = runningChains(d.store.all(), d.alive);
        if (!running.length) { void vscode.window.showInformationMessage('Agent Farm: no baton relay is running.'); return; }
        if (running.length === 1) { chainId = running[0].chainId; }
        else {
            const p = await vscode.window.showQuickPick(running.map(b => ({ label: `⑂ ${b.hop + 1}  ${b.chainId}`, description: b.state, id: b.chainId })),
                { title: 'Agent Farm — which chain?' });
            if (!p) { return; }
            chainId = p.id;
        }
    }
    const at = chainLegs(d.store.all(), chainId, d.fallback());
    if (!at.ok) { void vscode.window.showWarningMessage(`Agent Farm: ${at.why}`); return; }
    const l = at.legs;
    const rows: (vscode.QuickPickItem & { run: () => Promise<void> | void })[] = legsChoices(l).map(c => ({
        label: c.label, detail: c.detail,
        run: async () => {
            if (c.act === 'lastLeg' || c.act === 'release') { say(d.lastLeg(l.sessionId!, c.act === 'lastLeg')); return; }
            let n: unknown = c.n;
            if (c.act === 'type') {
                n = await vscode.window.showInputBox({
                    title: legsTitle(l), value: String(l.max || l.leg + 1),
                    prompt: `How many legs may chain ${l.chainId} run? ${l.min} or more — 0 for no ceiling.`,
                    validateInput: v => { const p = parseLegs(v, l.min); return p.ok ? undefined : p.why; }
                });
                if (n === undefined) { return; }
            }
            say(apply(l.chainId, n));
        }
    }));
    if (l.sessionId) {
        const sid = l.sessionId;
        rows.push({ label: '$(link-external) Open the running leg', detail: `session ${sid.slice(0, 8)}`, run: () => d.openLeg(sid) });
    }
    const pick = await vscode.window.showQuickPick(rows, { title: legsTitle(l), placeHolder: 'The next pass reads the new ceiling — nothing else changes' });
    if (pick) { await pick.run(); }
}
