/**
 * S-103 — THE LEGS MENU: one picker behind the card's ⑂⊣ right-click, the ⑂
 * status-bar item and "Agent Farm: Chain Legs…". Its title is where the chain
 * stands; each row says the ceiling it moves to. The write is applyChainLegs,
 * the same body as baton.setLegs.
 */
import * as vscode from 'vscode';
import { SetLegsResult, chainLegs, legsChoices, legsTitle, parseLegs } from './core/batonLegs';
import { LegsDeps } from './core/batonLegsOp';
import { runningChains } from './core/batonView';
import { desktopAsk, type PanelAsk } from './panels/panelAsk';

export interface LegsUiDeps extends LegsDeps {
    alive: (sessionId: string) => boolean;
    lastLeg: (sessionId: string, on: boolean) => { ok: true; sentence: string } | { ok: false; why: string };
    openLeg: (sessionId: string) => void;
}

/** S-125 — who is asked: a page's host (a phone's view answers on the phone); absent = the VS Code window. */
export interface LegsUiSurface { ask: PanelAsk; remote: boolean }

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

const say = (ask: PanelAsk, r: { ok: true; sentence: string } | { ok: false; why: string }): void => {
    if (r.ok) { void ask.info(`Agent Farm: ${r.sentence}`); }
    else { void ask.warn(`Agent Farm: ${r.why}`); }
};

/**
 * `arg`: { chainId } from a right-click on the card's ⑂⊣ or from the status bar,
 * or nothing (the palette). `apply` is baton.setLegs's own body (applyChainLegs).
 */
export async function pickChainLegs(d: LegsUiDeps, arg: unknown, apply: (chainId: string, maxLegs: unknown) => SetLegsResult, on?: LegsUiSurface): Promise<void> {
    const ask = on?.ask ?? desktopAsk();
    const a = arg && typeof arg === 'object' ? arg as Record<string, unknown> : {};
    let chainId = str(a.chainId);
    if (!chainId) {
        const running = runningChains(d.store.all(), d.alive);
        if (!running.length) { void ask.info('Agent Farm: no baton relay is running.'); return; }
        if (running.length === 1) { chainId = running[0].chainId; }
        else {
            const p = await ask.pick(running.map(b => ({ label: `⑂ ${b.hop + 1}  ${b.chainId}`, description: b.state, id: b.chainId })),
                { title: 'Agent Farm — which chain?' });
            if (!p) { return; }
            chainId = p.id;
        }
    }
    const at = chainLegs(d.store.all(), chainId, d.fallback());
    if (!at.ok) { void ask.warn(`Agent Farm: ${at.why}`); return; }
    const l = at.legs;
    const rows: (vscode.QuickPickItem & { run: () => Promise<void> | void })[] = legsChoices(l).map(c => ({
        label: c.label, detail: c.detail,
        run: async () => {
            if (c.act === 'lastLeg' || c.act === 'release') { say(ask, d.lastLeg(l.sessionId!, c.act === 'lastLeg')); return; }
            let n: unknown = c.n;
            if (c.act === 'type') {
                n = await ask.input({
                    title: legsTitle(l), value: String(l.max || l.leg + 1),
                    prompt: `How many legs may chain ${l.chainId} run? ${l.min} or more — 0 for no ceiling.`,
                    validateInput: v => { const p = parseLegs(v, l.min); return p.ok ? undefined : p.why; }
                });
                if (n === undefined) { return; }
            }
            say(ask, apply(l.chainId, n));
        }
    }));
    // opening the leg is a tab on the PC; a phone opens it from the page's own ↗
    if (l.sessionId && !on?.remote) {
        const sid = l.sessionId;
        rows.push({ label: '$(link-external) Open the running leg', detail: `session ${sid.slice(0, 8)}`, run: () => d.openLeg(sid) });
    }
    const pick = await ask.pick(rows, { title: legsTitle(l), placeHolder: 'The next pass reads the new ceiling — nothing else changes' });
    if (pick) { await pick.run(); }
}
