// X-466 — the Work Queue as a phone's view draws it: __AFUI__.remote is set, so the
// source notice, a report or answer file, a project's page and the terminal hand-off
// are not offered. Same lanes and items as `queue`, plus one scene with everything a
// hand can open at once: the capture box, every row, an edit and an answer, and a
// finished item that carries its answer and report files.
//   node test/shoot_page.js queue_phone --phone
const base = require('./queue');
const D = 'D:\\zone\\know\\note\\obsidian\\00_AGENT_AREA\\00_OUTPUT\\';

function openAll() {
    const d = base.data();
    d.items = d.items.map(n => n.status === 'done'
        ? Object.assign({}, n, { answerPath: D + '01_CEVAPLAR\\2026-08-19_turns-motorlar.md', reportPath: D + '10_REPORT\\2026-08-19_developer_turns-motorlar.md' })
        : n);
    return {
        id: 'phone-open', label: 'Work Queue on a phone — the capture box, every row, an edit and an answer open',
        data: d,
        act: (r) => {
            const add = r.query('[data-add="open"]')[0];
            if (add) { add.click(); }
            const agents = r.query('[data-cat-toggle="agent"]')[0];
            if (agents) { agents.click(); }
            // The row menu's verbs, not row clicks: a click toggles, and a blocked item starts open.
            for (const n of d.items) { r.send({ type: 'afctx', act: 'qOpen', ctx: { item: n.id } }); }
            r.send({ type: 'afctx', act: 'qEdit', ctx: { item: 'q1' } });
            r.send({ type: 'afctx', act: 'qAnswer', ctx: { item: 'q5' } });
        }
    };
}

// X-551 — opened from a session row's "Add to Queue": the capture box is up with the session's draft.
function composed() {
    return {
        id: 'phone-compose', label: 'Work Queue on a phone — opened from a session row, the capture box holds its draft',
        data: Object.assign(base.data(), { compose: 'developer — Uzun bir oturum başlığı, kuyruğa alınacak: ' })
    };
}

module.exports = Object.assign({}, base, {
    window: Object.assign({}, base.window, { __AFUI__: { remote: true } }),
    variants: () => base.variants().concat([openAll(), composed()])
});
