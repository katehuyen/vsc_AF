// Notices — the agent→user notice board (compiled core/notices.js, pure):
// the store's lifecycle (post/read/pin/dismiss/clear/cap) and the §19.C bridge
// ops (notices.post/list/read/dismiss) dispatched through a real registry,
// proving the channel every agent uses is catalogued and behaves.
const path = require('path');
const fs = require('fs');
const os = require('os');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const {
    NoticesStore, makeNotice, filterNotices, sortNotices, capNotices,
    coerceLevel, coerceTags, unreadCount, registerNoticesOps
} = require(path.join(__dirname, '..', 'out', 'core', 'notices.js'));
const { BridgeRegistry } = require(path.join(__dirname, '..', 'out', 'core', 'bridge.js'));

// ---------- makeNotice / coercion ----------
{
    const n = makeNotice({ title: '  Hello  ', body: '  world  ', agentName: ' manager ', level: 'WARNING', tags: 'a, b ,,c' });
    ok('title/body/agent trimmed', n.title === 'Hello' && n.body === 'world' && n.agentName === 'manager');
    ok('level lowercased + validated', n.level === 'warning');
    ok('tags parsed from csv', Array.isArray(n.tags) && n.tags.join(',') === 'a,b,c');
    ok('unknown level falls back to info', coerceLevel('nope') === 'info');
    ok('empty tags → undefined', coerceTags('  ,, ') === undefined);
    ok('agent defaults to system', makeNotice({ title: 'x' }).agentName === 'system');
    let threw = false;
    try { makeNotice({ title: '   ' }); } catch { threw = true; }
    ok('empty title throws', threw);
}

// ---------- sort / filter / cap ----------
{
    const base = Date.now();
    const list = [
        { id: 'a', ts: base + 1, agentName: 'dev', level: 'info', title: 'A', read: true },
        { id: 'b', ts: base + 2, agentName: 'manager', level: 'alert', title: 'B' },
        { id: 'c', ts: base + 3, agentName: 'dev', level: 'info', title: 'C', pinned: true },
        { id: 'd', ts: base + 4, agentName: 'manager', level: 'warning', title: 'D', tags: ['ai'] }
    ];
    const sorted = sortNotices(list);
    ok('pinned first, then newest', sorted[0].id === 'c' && sorted[1].id === 'd');
    ok('unreadCount ignores read', unreadCount(list) === 3);
    ok('filter unread drops read', filterNotices(list, { unread: true }).every(n => !n.read));
    ok('filter by agent', filterNotices(list, { agent: 'manager' }).length === 2);
    ok('filter by level', filterNotices(list, { level: 'alert' }).map(n => n.id).join() === 'b');
    ok('filter by tag', filterNotices(list, { tag: 'ai' }).map(n => n.id).join() === 'd');
    ok('limit caps result', filterNotices(list, { limit: 2 }).length === 2);

    // cap never drops pinned or unread; trims oldest read first
    const many = [];
    for (let i = 0; i < 10; i++) { many.push({ id: 'r' + i, ts: base + i, level: 'info', title: 'r', agentName: 'x', read: true }); }
    many.push({ id: 'p', ts: base, level: 'info', title: 'p', agentName: 'x', pinned: true, read: true });
    many.push({ id: 'u', ts: base, level: 'info', title: 'u', agentName: 'x' });
    const capped = capNotices(many, 5);
    ok('cap keeps pinned + unread', capped.some(n => n.id === 'p') && capped.some(n => n.id === 'u'));
    ok('cap trims down to max', capped.length <= 5 || capped.filter(n => !n.pinned && n.read).length <= 3);
}

// ---------- NoticesStore lifecycle ----------
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-notices-'));
    const file = path.join(dir, 'notices.json');
    const store = new NoticesStore(file);
    store.load();
    ok('fresh store is empty', store.notices.length === 0 && store.unread() === 0);

    const a = store.add({ title: 'first', agentName: 'manager' });
    const b = store.add({ title: 'second', body: 'details', level: 'reminder' });
    ok('add prepends (newest first)', store.notices[0].id === b.id);
    ok('unread counts both', store.unread() === 2);
    ok('persisted to disk', JSON.parse(fs.readFileSync(file, 'utf8')).notices.length === 2);

    ok('markRead flips one', store.markRead(a.id) && store.unread() === 1);
    ok('markRead unknown id → false', store.markRead('nope') === false);
    ok('pin sorts to top', store.pin(a.id, true) && store.list()[0].id === a.id);

    // reload from disk keeps state
    const store2 = new NoticesStore(file);
    store2.load();
    ok('reload restores notices + read/pin state',
        store2.notices.length === 2 && store2.list()[0].id === a.id && store2.unread() === 1);

    ok('markAllRead clears unread', store2.markAllRead() === 1 && store2.unread() === 0);
    ok('dismiss removes', store2.dismiss(b.id) && store2.notices.length === 1);
    ok('clearRead keeps pinned', store2.clearRead() >= 0 && store2.notices.some(n => n.id === a.id));

    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

// ---------- §19.C: bridge ops catalogued + dispatched ----------
(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-notices-bridge-'));
    const store = new NoticesStore(path.join(dir, 'notices.json'));
    store.load();
    let changes = 0, posted = null;
    const reg = new BridgeRegistry();
    registerNoticesOps(reg, { store, onChange: () => changes++, onPost: n => { posted = n; } });

    const cat = reg.catalog().map(c => c.op);
    ok('all four notices ops catalogued',
        ['notices.post', 'notices.list', 'notices.read', 'notices.dismiss'].every(op => cat.includes(op)));

    const post = await reg.dispatch('notices.post', { title: 'AI digest', body: '# heading', agent: 'manager', level: 'reminder', tags: ['ai-daily'] });
    ok('notices.post returns id + unread', post.ok && typeof post.result.id === 'string' && post.result.unread === 1);
    ok('onPost + onChange fired', posted && posted.title === 'AI digest' && changes >= 1);

    const empty = await reg.dispatch('notices.post', { body: 'no title' });
    ok('notices.post refuses missing title', !empty.ok && /title/i.test(empty.error));

    const list = await reg.dispatch('notices.list', { tag: 'ai-daily' });
    ok('notices.list filters by tag', list.ok && list.result.length === 1 && list.result[0].title === 'AI digest');

    const id = post.result.id;
    const read = await reg.dispatch('notices.read', { id });
    ok('notices.read marks read', read.ok && read.result.unread === 0);
    const readBad = await reg.dispatch('notices.read', { id: 'nope' });
    ok('notices.read unknown id errors', !readBad.ok && /not found/i.test(readBad.error));

    await reg.dispatch('notices.post', { title: 'temp', level: 'info' });
    const clear = await reg.dispatch('notices.dismiss', { clearRead: true });
    ok('notices.dismiss clearRead removes read ones', clear.ok && clear.result.removed === 1);
    const dis = await reg.dispatch('notices.dismiss', { id: store.notices[0].id });
    ok('notices.dismiss by id removes', dis.ok && dis.result.ok === true);

    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
