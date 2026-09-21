/**
 * X-236 — the Accounts page, drawn from the SAME accounts the Engines panel
 * fixture carries: the page is the Engines page's section on a page of its own,
 * so a fixture of its own would be a second truth about one set of cards.
 *
 * Three arities, smallest first: none sealed, one, and the many the Engines
 * fixture holds (two engines, a standing one, a walled one) — and under them
 * the rules (X-305), from the Engines fixture's own rule scenes: none of the
 * user's own, then four, then the form open, the way the Engines page draws
 * them. The section is the one the Engines page draws; a fixture with rules
 * of its own would be a second truth about which sign-in a rule picks.
 */
const engines = require('./enginespanel.js');
const { ENGINE_LABELS } = require('../../out/core/engines.js');

const pageData = (d, over = {}) => ({
    now: d.now,
    accounts: d.accounts,
    accountEngines: d.accountEngines,
    autoRefresh: d.autoRefresh,
    policies: d.policies,
    engineLabels: ENGINE_LABELS,
    ...over
});

const data = () => pageData(engines.data());
/**
 * ‼️ U-144 — THE ONE WINDOW STATE THAT IS NOT A PERCENTAGE. A window whose
 * turnover is already behind us carries a figure belonging to the OLD window
 * (audit B-04.1), and the row now says that in colour rather than in a clause
 * at the tail of a sentence. It is a state of its own and draws differently
 * from every other row, so it gets a scene rather than a claim.
 */
const staleData = () => {
    const d = JSON.parse(JSON.stringify(engines.data()));
    const a = d.accounts[0];
    a.bars[0].resetsAt = d.now - 4 * 60_000;
    a.resetsAt = a.bars[0].resetsAt;
    return pageData(d);
};
const oneData = () => pageData(engines.oneSlotData());
const noneData = () => pageData(engines.data(), { accounts: [] });
const rulesData = () => pageData(engines.rulesData());

module.exports = {
    script: 'accounts.js',
    data,
    oneData,
    noneData,
    rulesData,
    staleData,
    variants: () => [
        { id: 'accountsnone', label: 'Accounts page — nothing sealed yet', data: noneData() },
        { id: 'accountsone', label: 'Accounts page — a single captured account', data: oneData() },
        { id: 'accounts', label: 'Accounts page — five sign-ins on two engines', data: data() },
        { id: 'accountsstale', label: 'Accounts page - U-144: the five-hour window has ALREADY turned over, so its row says the figure beside it is old', data: staleData() },
        { id: 'accountsrules', label: 'Accounts page — the four rules of the user\'s own under the sign-ins (X-305)', data: rulesData() },
        {
            id: 'accountsruleform', label: 'Accounts page — the rule form open on @Gece_Nobeti, a step open in the nested editor',
            data: rulesData(),
            act: (r) => {
                r.query('[data-poledit="Gece_Nobeti"]')[0].click();
                r.query('[data-afl="edit"]')[2].click();
            }
        }
    ]
};
