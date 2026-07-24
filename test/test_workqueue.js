// Work Queue — user→agent async channel (compiled core/workqueue.js, pure):
// the item model + coercion, filtering, the cap that never drops LIVE items,
// the store lifecycle (add/edit/urgency/group/delegate/stamp/archive/remove),
// the un-deletable-until-handled rule, and the §19.C bridge ops (incl. the
// cevap second leg and the notice→queue cross-link) through a real registry.
const path = require('path');
const fs = require('fs');
const os = require('os');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const {
    WorkQueueStore, makeWorkItem, filterItems, capItems, coerceStatus, coerceUrgency,
    blockedCount, activeCount, isTerminal, registerQueueOps, QUEUE_STATUSES, TERMINAL_STATUSES
} = require(path.join(__dirname, '..', 'out', 'core', 'workqueue.js'));
const { BridgeRegistry } = require(path.join(__dirname, '..', 'out', 'core', 'bridge.js'));

// ---------- makeWorkItem / coercion ----------
{
    const n = makeWorkItem({
        text: '  fix ZEN pad  ', author: ' user ', target: ' ZEN ', urgency: 'URGENT',
        tags: 'a, b', sourceNoticeId: ' n1 ', sourceNoticeTitle: ' uyku reminder '
    });
    ok('text trimmed', n.text === 'fix ZEN pad');
    ok('author trimmed', n.author === 'user');
    ok('default status captured', n.status === 'captured');
    ok('urgency lowercased+validated', n.urgency === 'urgent');
    ok('bad urgency → normal', coerceUrgency('nope') === 'normal' && coerceUrgency('soon') === 'soon');
    ok('unknown status → fallback', coerceStatus('nope') === 'captured' && coerceStatus('done') === 'done');
    ok('target trimmed', n.target === 'ZEN');
    ok('tags parsed', n.tags.join(',') === 'a,b');
    ok('source notice linked + title snapshot', n.sourceNoticeId === 'n1' && n.sourceNoticeTitle === 'uyku reminder');
    ok('author defaults to user', makeWorkItem({ text: 'x' }).author === 'user');
    ok('urgency defaults normal', makeWorkItem({ text: 'x' }).urgency === 'normal');
    ok('terminal set', TERMINAL_STATUSES.join() === 'done,dropped');
    ok('all statuses present', ['captured', 'grouped', 'delegated', 'done', 'blocked', 'dropped'].every(s => QUEUE_STATUSES.includes(s)));
    let threw = false; try { makeWorkItem({ text: '   ' }); } catch { threw = true; }
    ok('empty text throws', threw);
}

// ---------- filter ----------
{
    const base = Date.now();
    const list = [
        { id: 'a', ts: base + 1, author: 'user', text: 't', status: 'captured', urgency: 'normal', target: 'ZEN' },
        { id: 'b', ts: base + 2, author: 'developer', text: 't', status: 'done', urgency: 'normal', tags: ['ui'] },
        { id: 'c', ts: base + 3, author: 'user', text: 't', status: 'blocked', urgency: 'urgent', pinned: true, groupId: 'g1' },
        { id: 'd', ts: base + 4, author: 'user', text: 't', status: 'delegated', urgency: 'soon', sourceNoticeId: 'n9' }
    ];
    ok('pinned floats first', filterItems(list, {})[0].id === 'c');
    ok('filter by status', filterItems(list, { status: 'captured' }).map(n => n.id).join() === 'a');
    ok('filter active (non-terminal)', filterItems(list, { active: true }).map(n => n.id).sort().join() === 'a,c,d');
    ok('filter by author', filterItems(list, { author: 'user' }).length === 3);
    ok('filter by target', filterItems(list, { target: 'ZEN' }).map(n => n.id).join() === 'a');
    ok('filter by urgency', filterItems(list, { urgency: 'urgent' }).map(n => n.id).join() === 'c');
    ok('filter by groupId', filterItems(list, { groupId: 'g1' }).map(n => n.id).join() === 'c');
    ok('filter by sourceNoticeId', filterItems(list, { sourceNoticeId: 'n9' }).map(n => n.id).join() === 'd');
    ok('filter by tag', filterItems(list, { tag: 'ui' }).map(n => n.id).join() === 'b');
    ok('counts: blocked=1 active=3', blockedCount(list) === 1 && activeCount(list) === 3);
    ok('isTerminal', isTerminal(list[1]) && !isTerminal(list[0]));
    ok('limit', filterItems(list, { limit: 2 }).length === 2);
}

// ---------- cap never drops a LIVE item ----------
{
    const base = Date.now(); const many = [];
    for (let i = 0; i < 12; i++) { many.push({ id: 'done' + i, ts: base + i, author: 'user', text: 't', status: 'done', urgency: 'normal' }); }
    for (let i = 0; i < 5; i++) { many.push({ id: 'live' + i, ts: base + i, author: 'user', text: 't', status: 'captured', urgency: 'normal' }); }
    many.push({ id: 'pinnedDone', ts: base, author: 'user', text: 't', status: 'done', urgency: 'normal', pinned: true });
    const capped = capItems(many, 8);
    ok('cap keeps every live + pinned item', ['live0', 'live1', 'live2', 'live3', 'live4', 'pinnedDone'].every(id => capped.some(n => n.id === id)));
    ok('cap trims only terminal overflow', capped.length <= Math.max(8, 6));
}

// ---------- store lifecycle + un-deletable rule ----------
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-queue-'));
    const file = path.join(dir, 'work-queue.json');
    const store = new WorkQueueStore(file); store.load();
    ok('fresh store empty', store.items.length === 0 && store.active() === 0);

    const a = store.add({ text: 'fix A', author: 'user', target: 'ZEN' });
    const b = store.add({ text: 'fix B', author: 'user', target: 'ZEN' });
    const c = store.add({ text: 'fix C', author: 'developer' });
    ok('add prepends', store.items[0].id === c.id);
    ok('active counts all three', store.active() === 3);

    ok('edit updates fields', store.edit(a.id, { text: 'fix A v2', target: 'ZEP', urgency: 'soon' }) && (() => {
        const n = store.get(a.id); return n.text === 'fix A v2' && n.target === 'ZEP' && n.urgency === 'soon' && n.edited === true;
    })());
    ok('setUrgency', store.setUrgency(b.id, 'urgent') && store.get(b.id).urgency === 'urgent');
    ok('pin floats', store.pin(c.id, true) && store.list()[0].id === c.id);

    // group captured → grouped
    const g = store.group([a.id, b.id]);
    ok('group returns id+count', g.count === 2 && typeof g.groupId === 'string');
    ok('group moves captured→grouped', store.get(a.id).status === 'grouped' && store.get(b.id).status === 'grouped' && store.get(a.id).groupId === g.groupId);

    // delegate
    ok('delegate links + status', store.delegate(a.id, { missionId: 'm123', taskId: 't456' }) && (() => {
        const n = store.get(a.id); return n.status === 'delegated' && n.missionId === 'm123' && n.taskId === 't456' && n.delegatedAt;
    })());

    // un-deletable rule: a live item cannot be removed
    const rmLive = store.remove(a.id);
    ok('remove refuses a live item', rmLive.ok === false && rmLive.reason === 'not-handled');
    ok('archive refuses a live item', store.archive(a.id) === false);

    // stamp handles it (with a cevap) → terminal → removable
    ok('stamp writes outcome + status done', store.stamp(a.id, { stamp: '-DONE- fixed', resolution: 'ZEN pad düzeltildi', answerPath: 'D:/CEVAPLAR/x.md', status: 'done' }) && (() => {
        const n = store.get(a.id); return n.status === 'done' && n.stamp === '-DONE- fixed' && n.resolution === 'ZEN pad düzeltildi' && n.answerPath === 'D:/CEVAPLAR/x.md' && n.handledAt;
    })());
    ok('remove now allowed (terminal)', store.remove(a.id).ok === true && !store.items.some(n => n.id === a.id));

    // drop (void) then remove
    ok('stamp dropped voids', store.stamp(b.id, { stamp: '-DROPPED-', status: 'dropped' }) && store.get(b.id).status === 'dropped');
    ok('dropped is removable', store.remove(b.id).ok === true);

    // blocked count feeds the bell
    store.stamp(c.id, { stamp: '-SORU- hangi dil?', status: 'blocked' });
    ok('blocked count = 1', store.blocked() === 1);

    const store2 = new WorkQueueStore(file); store2.load();
    ok('reload restores state', store2.items.length === 1 && store2.get(c.id).status === 'blocked');

    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

// ---------- §19.C bridge ops (+ cevap second leg + fromNotice cross-link) ----------
(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-queue-bridge-'));
    const store = new WorkQueueStore(path.join(dir, 'work-queue.json')); store.load();
    const cevapDir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-cevap-'));
    let changes = 0, posted = null;

    // mock notices port for fromNotice cross-linking
    const spawned = [];
    let dismissed = null;
    const notices = {
        titleOf: (id) => id === 'noticeX' ? 'uyku bilgisi girmedin' : undefined,
        addSpawnedItem: (id, ref) => { spawned.push({ id, ref }); return true; },
        dismiss: (id) => { dismissed = id; return true; }
    };
    const writeAnswer = (a) => {
        const file = path.join(cevapDir, `${(a.name || a.title).replace(/[\\/:*?"<>|]+/g, ' ').trim()}.md`);
        fs.writeFileSync(file, a.body, 'utf8');
        return file;
    };

    const reg = new BridgeRegistry();
    registerQueueOps(reg, { store, notices, writeAnswer, onChange: () => changes++, onPost: n => { posted = n; } });

    const cat = reg.catalog().map(c => c.op);
    ok('queue ops catalogued', ['queue.add', 'queue.list', 'queue.get', 'queue.group', 'queue.delegate', 'queue.stamp', 'queue.remove', 'queue.fromNotice'].every(op => cat.includes(op)));

    const add = await reg.dispatch('queue.add', { text: 'ZEN pad ikinci ekranda açılmıyor', target: 'ZEN', urgency: 'soon', author: 'user' });
    ok('add returns id/status/active', add.ok && add.result.status === 'captured' && add.result.active === 1);
    ok('onPost + onChange fired', posted && posted.text === 'ZEN pad ikinci ekranda açılmıyor' && changes >= 1);

    const noText = await reg.dispatch('queue.add', { target: 'ZEN' });
    ok('add refuses missing text', !noText.ok && /text/i.test(noText.error));

    const add2 = await reg.dispatch('queue.add', { text: 'ZEP crash on launch', target: 'ZEP' });
    const grp = await reg.dispatch('queue.group', { ids: [add.result.id, add2.result.id] });
    ok('group via bridge', grp.ok && grp.result.count === 2);

    const del = await reg.dispatch('queue.delegate', { id: add.result.id, missionId: 'mABC' });
    ok('delegate via bridge', del.ok && del.result.delegated === 1 && store.get(add.result.id).status === 'delegated');

    // stamp with a cevap (answer) → written to CEVAPLAR (not a report), linked
    const st = await reg.dispatch('queue.stamp', { id: add.result.id, stamp: '-DONE-', resolution: 'kısa cevap', answer: '# Cevap\n\nDolu dolu açıklama.', answerName: 'zen-pad-fix', status: 'done' });
    ok('stamp returns answerPath', st.ok && typeof st.result.answerPath === 'string' && /zen-pad-fix\.md$/.test(st.result.answerPath));
    ok('cevap file written to CEVAPLAR', st.ok && fs.existsSync(st.result.answerPath) && /Dolu dolu/.test(fs.readFileSync(st.result.answerPath, 'utf8')));
    ok('item stores answerPath + resolution', store.get(add.result.id).answerPath === st.result.answerPath && store.get(add.result.id).resolution === 'kısa cevap');

    // remove guards through the bridge
    const rmLive = await reg.dispatch('queue.remove', { id: add2.result.id });
    ok('bridge remove refuses live item', !rmLive.ok && /unhandled/i.test(rmLive.error));
    const rmDone = await reg.dispatch('queue.remove', { id: add.result.id });
    ok('bridge remove allows terminal item', rmDone.ok);

    // fromNotice — delete path
    const fn1 = await reg.dispatch('queue.fromNotice', { noticeId: 'noticeX', text: 'evet girmedim, 01:00-08:30' });
    ok('fromNotice creates item w/ source snapshot', fn1.ok && store.get(fn1.result.id).sourceNoticeId === 'noticeX' && store.get(fn1.result.id).sourceNoticeTitle === 'uyku bilgisi girmedin');
    ok('fromNotice default-deletes the notice', fn1.result.noticeDeleted === true && dismissed === 'noticeX');

    // fromNotice — keep path (records spawned ref on the notice)
    const fn2 = await reg.dispatch('queue.fromNotice', { noticeId: 'noticeX', text: 'ikinci item', deleteNotice: false });
    ok('fromNotice keep records spawned ref', fn2.result.noticeDeleted === false && spawned.some(s => s.id === 'noticeX' && s.ref.itemId === fn2.result.id));

    const listActive = await reg.dispatch('queue.list', { active: true });
    ok('list active excludes terminal', listActive.ok && listActive.result.every(n => n.status !== 'done' && n.status !== 'dropped'));

    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(cevapDir, { recursive: true, force: true }); } catch {}

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
