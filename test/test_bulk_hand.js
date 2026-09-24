// N-11 — THE BULK HAND on the A2A pages and the Work Queue: a box at the head
// of each row, a ✕ at its tail, one bar UNDER the filters, day headers — and
// the store/bridge half that makes a delete on those pages mean something.
//
// ‼️ Two rules are pinned here because they are the ones a "delete" button
// could quietly break: a task an agent holds live is never deleted from under
// it, and a queue item is never deleted before it is handled.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runPage } = require('./lib_page_dom');
const { BridgeRegistry } = require('../out/core/bridge');
const { A2ATasksStore } = require('../out/core/a2aTasks');
const { WorkQueueStore, registerQueueOps } = require('../out/core/workqueue');
const { removeMany, clearHandled } = require('../out/core/queueHygiene');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-bulk-'));

(async () => {
    // ---------------------------------------------------------------- stores
    {
        const now = Date.now();
        const s = new A2ATasksStore(path.join(dir, 'tasks.json'));
        const mk = (title, patch) => { const t = s.add({ fromAgent: 'manager', title }, now); return Object.assign(t, patch); };
        const live = mk('live');
        const done = mk('done');
        const q = mk('queued');
        // hand-shape the states on disk the way claim/finish would leave them
        const file = path.join(dir, 'tasks.json');
        const env = JSON.parse(fs.readFileSync(file, 'utf8'));
        env.items.forEach(t => {
            if (t.id === live.id) { t.state = 'running'; t.claimedBy = { agent: 'developer', leaseExpiresAt: now + 600000, progress: '' }; }
            if (t.id === done.id) { t.state = 'done'; }
        });
        fs.writeFileSync(file, JSON.stringify(env));
        const r = s.remove([live.id, q.id], now);
        ok('a2a tasks: remove deletes what nobody holds…', r.deleted === 1 && !s.tasks.some(t => t.id === q.id));
        ok('…and SPARES a task held under a live lease, naming it', r.held.length === 1 && r.held[0] === live.id
            && s.tasks.some(t => t.id === live.id));
        ok('a2a tasks: clear takes the closed ones only by default', s.clear({}, now) === 1
            && s.tasks.length === 1 && s.tasks[0].id === live.id);
    }
    {
        const s = new WorkQueueStore(path.join(dir, 'queue.json'));
        const a = s.add({ text: 'live one', author: 'user' });
        const b = s.add({ text: 'handled', author: 'user' });
        const c = s.add({ text: 'handled but pinned', author: 'user' });
        const d = s.add({ text: 'handled and archived', author: 'user' });
        [b, c, d].forEach(n => s.stamp(n.id, { stamp: 'DONE', status: 'done' }));
        s.pin(c.id, true);
        s.archive(d.id, true);
        const r = removeMany(s, [a.id, b.id, 'q-nope']);
        ok('queue: removeMany deletes the handled item…', r.deleted === 1 && !s.get(b.id));
        ok('…spares the LIVE one (the un-deletable rule) and names it', r.live.length === 1 && r.live[0] === a.id && !!s.get(a.id));
        ok('…and names the id it never had', r.missing.length === 1 && r.missing[0] === 'q-nope');
        const e = s.add({ text: 'another handled', author: 'user' });
        s.stamp(e.id, { stamp: '-DROPPED-', status: 'dropped' });
        ok('queue: clearHandled deletes handled items…', clearHandled(s) === 1 && !s.get(e.id));
        ok('…keeping the pinned, the archived and the live', !!s.get(c.id) && !!s.get(d.id) && !!s.get(a.id));

        // ------------------------------------------------------------ bridge
        const reg = new BridgeRegistry();
        let changes = 0;
        registerQueueOps(reg, { store: s, onChange: () => changes++ });
        const ops = reg.catalog().map(x => x.op);
        ok('queue.removeMany and queue.clearHandled are on the bridge', ops.includes('queue.removeMany') && ops.includes('queue.clearHandled'));
        const none = await reg.dispatch('queue.removeMany', { ids: [] });
        ok('queue.removeMany with no ids is refused rather than clearing the queue', !none.ok);
        const one = await reg.dispatch('queue.removeMany', { ids: a.id });
        ok('queue.removeMany over a live item deletes nothing and says so', one.ok && one.result.deleted === 0 && one.result.live[0] === a.id);
    }

    // ----------------------------------------------------------------- pages
    const tasksFx = require('./fixtures/a2atasks');
    const notesFx = require('./fixtures/a2anotes');
    const queueFx = require('./fixtures/queue');
    const ui = { notices: { unread: 0 }, queue: { blocked: 0 }, a2a: { notes: 0, tasks: 0 } };
    {
        const r = runPage('a2aTasks.js', tasksFx.data(), { __AFUI__: ui });
        const h = r.html();
        ok('tasks page: every row starts with a box', /data-cb="t-mu9q0"/.test(h));
        ok('…the bar sits AFTER the reset, on its own line (afb-break), not among the filters',
            /id="at-reset"[^]*afb-break[^]*id="at-selall"/.test(h));
        const held = r.query('[data-row-delete]').find(e => e.dataset.rowDelete === 't-mu9q1');
        ok('…a task held live has its ✕ disabled, saying who holds it', held && /disabled/.test(h.match(/data-row-delete="t-mu9q1"[^>]*>/)[0])
            && /developer holds it live/.test(h));
        r.query('[data-row-delete]').find(e => e.dataset.rowDelete === 't-mu9q0').click();
        ok('…a free task\'s ✕ posts delete for that one task', r.posted.some(m => m.type === 'delete' && m.id === 't-mu9q0'));
        r.query('[data-hact]').find(e => e.dataset.hact === 'clearClosed').click();
        ok('…● Clear closed posts clear closedOnly', r.posted.some(m => m.type === 'clear' && m.closedOnly === true));
        const box = r.query('[data-cb]').find(e => e.dataset.cb === 't-mu9q0');
        box.checked = true; box.click();
        r.query('[data-hact]').find(e => e.dataset.hact === 'bulkDelete').click();
        ok('…🗑 Delete aims at the SELECTED rows', r.posted.some(m => m.type === 'deleteMany' && m.ids.length === 1 && m.ids[0] === 't-mu9q0'));
        ok('…and the rows sit under a day header', /class="afb-day"/.test(h));
    }
    {
        const r = runPage('a2aNotes.js', notesFx.data(), { __AFUI__: ui });
        const h = r.html();
        ok('notes page: the bar left the filter row — after the reset, on its own line',
            /id="an-reset"[^]*afb-break[^]*id="an-selall"/.test(h) && !/id="an-selall"[^]*id="an-reset"/.test(h));
        const x = r.query('[data-row-delete]')[0];
        x.click();
        ok('…every row ends with a ✕ that posts delete', !!x && r.posted.some(m => m.type === 'delete' && m.id === x.dataset.rowDelete));
    }
    {
        const r = runPage('queue.js', queueFx.data(), { __AFUI__: ui });
        const h = r.html();
        ok('queue page: rows carry a box and the bar sits after the reset',
            /data-cb="q2"/.test(h) && /id="q-reset"[^]*afb-break[^]*id="q-selall"/.test(h));
        ok('…the row shows an AGE, not a bare date', /class="afb-age">[^<]*ago</.test(h));
        r.query('[data-row-delete]').find(e => e.dataset.rowDelete === 'q2').click();
        ok('…✕ on a LIVE item drops it (never deletes it)', r.posted.some(m => m.type === 'drop' && m.id === 'q2')
            && !r.posted.some(m => m.type === 'remove' && m.id === 'q2'));
        r.query('[data-hact]').find(e => e.dataset.hact === 'clearHandled').click();
        ok('…● Clear handled posts clearHandled', r.posted.some(m => m.type === 'clearHandled'));
        const i1 = h.indexOf('data-id="q1"'), i2 = h.indexOf('data-id="q2"');
        ok('…in a lane the pinned row stays on top, the day header comes under it',
            i1 > 0 && i1 < i2 && h.slice(i1, i2).includes('class="afb-day"'));
    }

    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); fs.rmSync(dir, { recursive: true, force: true }); process.exit(1); });
