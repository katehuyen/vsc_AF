/**
 * S-143 — THE ACCOUNT PICKER behind the Chains page's Next cell: the rules and
 * stored accounts of the chain's engine (the launcher's own rows), written by
 * chains.setAccount's own body. Asked on the surface that pressed.
 */
import { chainAccountOf, setChainAccount } from './core/chainAccount';
import { ChainAccountDeps, setAccountOfChain } from './core/chainAccountOps';
import { desktopAsk, type PanelAsk } from './panels/panelAsk';

export async function pickChainAccount(d: ChainAccountDeps, chainId: string, by: string, ask: PanelAsk = desktopAsk()): Promise<void> {
    const list = d.store.all();
    const now = chainAccountOf(list, chainId);
    if (!now) { void ask.info(`Agent Farm: no chain ${chainId} on record.`); return; }
    if (!now.settable) {
        // the core's own refusal: parked on its row, or ended
        const r = setChainAccount(list, { chainId, account: now.account, by, refusal: () => '', now: d.now() });
        void ask.info(`Agent Farm: ${r.ok ? '' : r.why}`);
        return;
    }
    const rows = d.choices(now.engine);
    const pick = await ask.pick(rows.map(r => ({ label: r.label, ...(r.id === now.account ? { description: 'now' } : {}), detail: r.detail, id: r.id })), {
        title: `Chain ${chainId} — its next legs open on ${now.account}`,
        placeHolder: 'A rule moves between accounts; a single account holds every later leg to it'
    });
    if (!pick) { return; }
    const r = setAccountOfChain(d, { chain: chainId, account: pick.id, by });
    void (r.ok ? ask.info(`Agent Farm: ${r.sentence}`) : ask.warn(`Agent Farm: ${r.why}`));
}
