// X-456 — the Notices board as a phone's view draws it: __AFUI__.remote is set, so
// what opens a report, an export dialog, a terminal, a browser or another PC page
// is not drawn. The report notice is open, with a link and a queue item it spawned.
//   node test/shoot_page.js notices_phone --phone
const base = require('./notices');

const open = () => base.data({
    focusId: 'n2',
    notices: base.data().notices.map(n => n.id !== 'n2' ? n : Object.assign({}, n, {
        reportPath: 'D:\\zone\\know\\note\\obsidian\\00_AGENT_AREA\\10_REPORT\\2026-08-11_oturum-tablosu.md',
        body: n.body + ' Ayrıntı: https://example.com/run/42',
        spawnedItems: [{ itemId: 'q_1', text: 'Proje sayfasının oturum sekmesini de kontrol et' }]
    }))
});

module.exports = Object.assign({}, base, {
    window: { __AFUI__: { remote: true } },
    data: open,
    variants: () => [
        { id: 'board', label: 'Notices on a phone — toolbar and cards, a report open', data: open() },
        // The open body at the top of the screen: the search narrows the board to it.
        { id: 'report', label: 'Notices on a phone — the open report, its link and its queue item', data: open(), state: { query: 'Oturum tablosu' } },
        { id: 'closed', label: 'Notices on a phone — every row folded', data: base.data() }
    ]
});
