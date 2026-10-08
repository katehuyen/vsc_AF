/**
 * U-228 — Farm Settings as an accordion, on the real model (every agentFarm.* setting of the manifest, as
 * allsettings builds it). Each scene hands the page the state it remembers: the first open with every section
 * closed, one section open with its basic rows, the same with "Show more", a link from another page to a row
 * that waits behind "more", and a section closed with an edit not yet applied.
 */
const all = require('./allsettings.js');

const withData = (extra) => Object.assign(all.data(), extra || {});
const refused = () => {
    const d = withData();
    const cost = d.categories.find(c => c.id === 'cost');
    if (cost && cost.items[0]) { cost.items[0] = Object.assign({}, cost.items[0], { refusal: 'expected a number, found "lots"' }); }
    return d;
};

const variants = () => ([
    {
        id: 'closed',
        label: 'Settings — the first open: every section closed, the changed count, a refused value (⚠) and the setting sets last',
        data: refused(),
        state: {}
    },
    {
        id: 'open',
        label: 'Settings — Reports open: its basic rows, then "Show n more settings"',
        data: withData(),
        state: { open: ['reports'] }
    },
    {
        id: 'more',
        label: 'Settings — Reports open with "Show more": every row of it, then "Show fewer"',
        data: withData(),
        state: { open: ['reports'], more: ['reports'] }
    },
    {
        id: 'deeplink',
        label: 'Settings — a link from another page to a row behind "more": its section and "more" open, the row lit',
        data: withData({ focus: 'agentFarm.projectContextExtra' }),
        state: {}
    },
    {
        id: 'unsaved',
        label: 'Settings — a row added to a table in Projects and the section closed: the edit waits, the header says so',
        data: withData(),
        state: { open: ['projects'], more: ['projects'] },
        act: r => {
            const add = r.query('[data-radd]').find(b => b.dataset.radd === 'agentFarm.projectTemplates');
            if (add) { add.click(); }
            const head = r.query('[data-fold]').find(b => b.dataset.fold === 'projects');
            if (head) { head.click(); }
        }
    }
]);

module.exports = { script: 'settings.js', data: () => withData(), variants };
