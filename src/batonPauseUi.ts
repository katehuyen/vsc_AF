/**
 * S-141 — THE PAUSE MENU behind a right-click on the Console card's ⑂→ Pass now
 * and ✕⑂ Stop chain and on the Chains page's ⑂⊣: the rows chainPauseMenu.ts
 * derives, written by chains.pause / chains.resume's own bodies. Asked on the
 * surface that pressed, so a phone's view answers it on the phone.
 */
import { openerOf } from './core/baton';
import { leftBy } from './core/batonLastLeg';
import { boardNow } from './core/chainBoardOps';
import { pauseChoices, pauseTitle } from './core/chainPauseMenu';
import { ChainPauseDeps, pauseChain, resumeChain } from './core/chainPauseOps';
import { desktopAsk, type PanelAsk } from './panels/panelAsk';

export async function pickChainPause(d: ChainPauseDeps, q: { chainId?: string; sessionId?: string }, by: string, ask: PanelAsk = desktopAsk()): Promise<void> {
    const list = d.store.all();
    const sid = String(q.sessionId ?? '').trim();
    const chainId = String(q.chainId ?? '').trim() || (sid ? (openerOf(list, sid) ?? leftBy(list, sid))?.chainId ?? '' : '');
    const row = chainId ? boardNow(d.board).find(r => r.chainId === chainId) : undefined;
    if (!row) { void ask.info('Agent Farm: this session runs no leg of a relay chain.'); return; }
    const choices = pauseChoices(row, !!(row.sessionId && d.handoverOf?.(row.sessionId)));
    if (!choices.length) { void ask.info(`Agent Farm: chain ${row.chainId} is ${row.state} — there is nothing to pause or continue.`); return; }
    const pick = await ask.pick(choices.map(c => ({ label: c.label, detail: c.detail, act: c.act })),
        { title: pauseTitle(row), placeHolder: 'Pause the chain, or continue it — nothing else changes' });
    if (!pick) { return; }
    const r = pick.act === 'resume'
        ? resumeChain(d, { chain: row.chainId, by })
        : pauseChain(d, { chain: row.chainId, mode: pick.act, by, tell: true });
    const unsaid = r.ok && 'told' in r && r.told && r.told !== 'said' ? r.told : '';
    if (unsaid) { void ask.warn(`Agent Farm: ${r.ok ? r.sentence : ''} The order could not be said into the leg (${unsaid}) — tell it yourself.`); return; }
    void (r.ok ? ask.info(`Agent Farm: ${r.sentence}`) : ask.warn(`Agent Farm: ${r.why}`));
}
