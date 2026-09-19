/**
 * X-236 — the Accounts page, drawn from the SAME accounts the Engines panel
 * fixture carries: the page is the Engines page's section on a page of its own,
 * so a fixture of its own would be a second truth about one set of cards.
 *
 * Three arities, smallest first: none sealed, one, and the many the Engines
 * fixture holds (two engines, a standing one, a walled one).
 */
const engines = require('./enginespanel.js');
const { ENGINE_LABELS } = require('../../out/core/engines.js');

const pageData = (d, over = {}) => ({
    now: d.now,
    accounts: d.accounts,
    accountEngines: d.accountEngines,
    autoRefresh: d.autoRefresh,
    engineLabels: ENGINE_LABELS,
    ...over
});

const data = () => pageData(engines.data());
const oneData = () => pageData(engines.oneSlotData());
const noneData = () => pageData(engines.data(), { accounts: [] });

module.exports = {
    script: 'accounts.js',
    data,
    oneData,
    noneData,
    variants: () => [
        { id: 'accountsnone', label: 'Accounts page — nothing sealed yet', data: noneData() },
        { id: 'accountsone', label: 'Accounts page — a single captured account', data: oneData() },
        { id: 'accounts', label: 'Accounts page — five sign-ins on two engines', data: data() }
    ]
};
