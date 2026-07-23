// Notices — agent→user board (compiled core/notices.js, pure): the store's
// lifecycle (post/read/pin/star/answer/decline/resolve/dismiss/clear/cap), the
// type+level+question model, and the §19.C bridge ops through a real registry.
const path = require('path');
const fs = require('fs');
const os = require('os');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const {
    NoticesStore, makeNotice, filterNotices, capNotices, coerceType, coerceLevel,
    coerceSections, coerceStars, unreadCount, openQuestionCount, registerNoticesOps,
    noticeMarkdown, buildNoticesMarkdown, NOTICE_TYPES, reportFileStem
} = require(path.join(__dirname, '..', 'out', 'core', 'notices.js'));
const { BridgeRegistry } = require(path.join(__dirname, '..', 'out', 'core', 'bridge.js'));

// ---------- makeNotice / coercion ----------
{
    const n = makeNotice({
        title: '  Hi  ', body: '  b  ', agentName: ' manager ', type: 'REPORT', level: 3,
        tags: 'a, b', sections: [{ title: ' S1 ', body: ' c1 ' }, { heading: 'S2', content: 'c2' }, { title: '', body: '' }]
    });
    ok('title/body/agent trimmed', n.title === 'Hi' && n.body === 'b' && n.agentName === 'manager');
    ok('type lowercased + validated', n.type === 'report');
    ok('level kept (3)', n.level === 3);
    ok('unknown type → update', coerceType('nope') === 'update');
    ok('rich type set', ['update', 'report', 'result', 'reminder', 'suggestion', 'warning', 'question'].every(t => NOTICE_TYPES.includes(t)));
    ok('new types coerce', coerceType('warning') === 'warning' && coerceType('result') === 'result' && coerceType('suggestion') === 'suggestion');
    ok('bad level → 1', coerceLevel(9) === 1 && coerceLevel('x') === 1 && coerceLevel(2) === 2);
    ok('stars clamp 0..3', coerceStars(5) === 0 && coerceStars(2) === 2 && coerceStars(-1) === 0);
    ok('sections parsed (title/heading/body/content)', n.sections.length === 2 && n.sections[0].title === 'S1' && n.sections[1].title === 'S2' && n.sections[1].body === 'c2');
    ok('empty sections dropped', coerceSections([{ title: '', body: '' }]) === undefined);
    ok('question gets open status', makeNotice({ title: 'q', type: 'question' }).status === 'open');
    ok('non-question has no status', makeNotice({ title: 'u' }).status === undefined);
    ok('reportPath linked when given', makeNotice({ title: 'r', reportPath: '  C:/x/y.md ' }).reportPath === 'C:/x/y.md');
    ok('no reportPath when absent', makeNotice({ title: 'r' }).reportPath === undefined);
    let threw = false; try { makeNotice({ title: '  ' }); } catch { threw = true; }
    ok('empty title throws', threw);
}

// ---------- report file naming (second leg, §7) ----------
{
    const d = new Date(2026, 6, 23);   // 2026-07-23 (month is 0-based)
    ok('auto name splices poster agent between date and title',
        reportFileStem({ title: 'Notices Sayaç Raporu', agentName: 'developer', date: d })
            === '2026-07-23_developer_Notices Sayaç Raporu');
    ok('reportName is the topic part — the poster agent is spliced in (constitution §7)',
        reportFileStem({ title: 'ignored', name: 'custom-name', agentName: 'developer', date: d })
            === '2026-07-23_developer_custom-name');
    ok('a date the caller put into reportName anyway is stripped — no double date',
        reportFileStem({ title: 'x', name: '2026-07-20_custom-name', agentName: 'developer', date: d })
            === '2026-07-23_developer_custom-name');
    ok('an agent prefix the caller put into reportName anyway is not doubled',
        reportFileStem({ title: 'x', name: 'developer_custom-name', agentName: 'developer', date: d })
            === '2026-07-23_developer_custom-name');
    ok('reportName without a known agent stays date_name',
        reportFileStem({ title: 'x', name: 'custom-name', date: d }) === '2026-07-23_custom-name');
    ok('no agent → falls back to date_title',
        reportFileStem({ title: 'Solo', date: d }) === '2026-07-23_Solo');
    ok('empty title with no name → rapor',
        reportFileStem({ title: '   ', date: d }) === '2026-07-23_rapor');
    ok('filename-illegal chars stripped, Turkish letters kept',
        reportFileStem({ title: 'a/b:c "çğ"', agentName: 'dev', date: d }) === '2026-07-23_dev_a b c çğ');
}

// ---------- filter ----------
{
    const base = Date.now();
    const list = [
        { id: 'a', ts: base + 1, agentName: 'dev', type: 'update', level: 1, read: true },
        { id: 'b', ts: base + 2, agentName: 'manager', type: 'question', level: 4, status: 'open' },
        { id: 'c', ts: base + 3, agentName: 'dev', type: 'update', level: 3, pinned: true, stars: 2, tags: ['ai'] },
        { id: 'd', ts: base + 4, agentName: 'manager', type: 'question', level: 2, status: 'answered', handled: false }
    ];
    ok('pinned floats first', filterNotices(list, {})[0].id === 'c');
    ok('filter by type', filterNotices(list, { type: 'question' }).length === 2);
    ok('filter by exact level', filterNotices(list, { level: 4 }).map(n => n.id).join() === 'b');
    ok('filter by minLevel', filterNotices(list, { minLevel: 3 }).map(n => n.id).sort().join() === 'b,c');
    ok('filter by agent', filterNotices(list, { agent: 'manager' }).length === 2);
    ok('filter by status', filterNotices(list, { status: 'answered' }).map(n => n.id).join() === 'd');
    ok('filter by handled=false', filterNotices(list, { type: 'question', handled: false }).length === 2);
    ok('filter by minStars', filterNotices(list, { minStars: 1 }).map(n => n.id).join() === 'c');
    ok('filter by tag', filterNotices(list, { tag: 'ai' }).map(n => n.id).join() === 'c');
    ok('unread + counts', unreadCount(list) === 3 && openQuestionCount(list) === 1);
    ok('limit', filterNotices(list, { limit: 2 }).length === 2);
}

// ---------- cap keeps sticky ----------
{
    const base = Date.now(); const many = [];
    for (let i = 0; i < 12; i++) { many.push({ id: 'r' + i, ts: base + i, type: 'update', level: 1, read: true }); }
    many.push({ id: 'pin', ts: base, type: 'update', level: 1, read: true, pinned: true });
    many.push({ id: 'q', ts: base, type: 'question', level: 2, status: 'open', read: true });
    many.push({ id: 'star', ts: base, type: 'update', level: 1, read: true, stars: 1 });
    const capped = capNotices(many, 6);
    ok('cap keeps pinned/open-question/starred', ['pin', 'q', 'star'].every(id => capped.some(n => n.id === id)));
}

// ---------- markdown export ----------
{
    const n = makeNotice({ title: 'Daily AI', type: 'update', level: 3, tags: 'ai-daily', sections: [{ title: 'Model X', body: 'Full summary.' }] });
    const md = noticeMarkdown(n, 2);
    ok('noticeMarkdown has title + section + meta', /## Daily AI/.test(md) && /### Model X/.test(md) && /Level 3/.test(md) && /#ai-daily/.test(md));
    const q = makeNotice({ title: 'ask', type: 'question' });
    ok('question markdown notes awaiting answer', /awaiting your answer/i.test(noticeMarkdown(q)));
    ok('report path shown in markdown', /Full report:.*rep\.md/.test(noticeMarkdown(makeNotice({ title: 'x', reportPath: 'D:/r/rep.md' }))));

    const all = [n, q];
    const full = buildNoticesMarkdown(all, [n.id, q.id], new Set([n.id]), { view: true, foldedTitles: true });
    ok('page export: open in full, folded as title', /### Model X/.test(full) && /## ask/.test(full) && /folded/.test(full));
    const allFull = buildNoticesMarkdown(all, [n.id, q.id], new Set(), { view: false, foldedTitles: false });
    ok('page export view=false dumps all in full', /### Model X/.test(allFull) && /awaiting your answer/i.test(allFull));
}

// ---------- store lifecycle ----------
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-notices-'));
    const file = path.join(dir, 'notices.json');
    const store = new NoticesStore(file); store.load();
    ok('fresh store empty', store.notices.length === 0 && store.unread() === 0);

    const a = store.add({ title: 'digest', type: 'update', level: 2, sections: [{ title: 'h1', body: 'full summary 1' }] });
    const q = store.add({ title: 'may I ask', type: 'question', level: 3, agentName: 'developer' });
    ok('add prepends', store.notices[0].id === q.id);
    ok('openQuestions counts the question', store.openQuestions() === 1);
    ok('sections persisted', JSON.parse(fs.readFileSync(file, 'utf8')).notices.find(n => n.id === a.id).sections.length === 1);

    ok('setStars', store.setStars(a.id, 3) && store.notices.find(n => n.id === a.id).stars === 3);
    ok('setStars clamps', store.setStars(a.id, 9) && store.notices.find(n => n.id === a.id).stars === 0);
    ok('pin', store.pin(a.id, true) && store.list()[0].id === a.id);

    // edit snapshots the original then updates
    ok('edit updates + snapshots original', store.edit(a.id, { title: 'digest v2', tags: 'ai,news', body: 'new body' }) && (() => {
        const n = store.notices.find(x => x.id === a.id);
        return n.edited === true && n.title === 'digest v2' && n.body === 'new body' &&
            n.tags.join(',') === 'ai,news' && n.original && n.original.title === 'digest';
    })());
    ok('second edit keeps first original', store.edit(a.id, { title: 'digest v3' }) &&
        store.notices.find(x => x.id === a.id).original.title === 'digest');

    ok('answer sets status+answered', store.answer(q.id, '  yes go ahead ') && (() => { const n = store.notices.find(x => x.id === q.id); return n.status === 'answered' && n.answer === 'yes go ahead' && n.read; })());
    ok('answer refuses non-question', store.answer(a.id, 'x') === false);
    ok('resolve marks handled', store.resolve(q.id) && store.notices.find(n => n.id === q.id).handled === true);
    ok('openQuestions now zero', store.openQuestions() === 0);

    const q2 = store.add({ title: 'ignored?', type: 'question' });
    ok('decline sets declined', store.decline(q2.id) && store.notices.find(n => n.id === q2.id).status === 'declined');
    ok('decline refuses non-question', store.decline(a.id) === false);

    const store2 = new NoticesStore(file); store2.load();
    ok('reload restores state', store2.notices.length === 3 && store2.list()[0].id === a.id);
    ok('markAllRead', store2.markAllRead() >= 0 && store2.unread() === 0);
    ok('dismiss removes', store2.dismiss(a.id) === true && !store2.notices.some(n => n.id === a.id));

    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

// ---------- bulk ops · question-safe clearRead · undo restore ----------
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-notices-bulk-'));
    const store = new NoticesStore(path.join(dir, 'notices.json')); store.load();
    const a = store.add({ title: 'a', type: 'update' });
    const b = store.add({ title: 'b', type: 'update' });
    const c = store.add({ title: 'c', type: 'update' });
    const qOpen = store.add({ title: 'q-open', type: 'question' });
    const qAns = store.add({ title: 'q-ans', type: 'question' });
    store.answer(qAns.id, 'reply');   // sets read=true, status=answered

    ok('markReadMany marks the set', store.markReadMany([a.id, b.id], true) === 2 &&
        store.notices.find(n => n.id === a.id).read && store.notices.find(n => n.id === b.id).read);
    ok('markReadMany unread flips back', store.markReadMany([a.id], false) === 1 && !store.notices.find(n => n.id === a.id).read);

    store.markReadMany([a.id, b.id, c.id], true);          // a,b,c read
    const removed = store.clearRead();
    ok('clearRead removes only plain read notices', removed.map(n => n.id).sort().join() === [a.id, b.id, c.id].sort().join());
    ok('clearRead keeps unhandled questions (answered OR open)', store.notices.some(n => n.id === qOpen.id) && store.notices.some(n => n.id === qAns.id));

    store.resolve(qAns.id);                                 // agent handled it
    ok('handled+read question is now clearable', store.clearRead().some(n => n.id === qAns.id));

    ok('restore re-adds removed (undo)', store.restore(removed) === 3 && [a.id, b.id, c.id].every(id => store.notices.some(n => n.id === id)));
    ok('restore skips ids still present', store.restore([{ id: a.id, ts: Date.now(), agentName: 'x', type: 'update', level: 1, title: 'dup' }]) === 0);

    const gone = store.dismissMany([a.id, b.id]);
    ok('dismissMany removes + returns them', gone.length === 2 && !store.notices.some(n => n.id === a.id) && !store.notices.some(n => n.id === b.id));
    ok('dismissMany is undoable via restore', store.restore(gone) === 2 && store.notices.some(n => n.id === a.id));

    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

// ---------- §19.C bridge ops ----------
(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-notices-bridge-'));
    const store = new NoticesStore(path.join(dir, 'notices.json')); store.load();
    let changes = 0, posted = null;
    const reg = new BridgeRegistry();
    const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-notices-report-'));
    const writeReport = (a) => {
        const file = path.join(reportDir, `2026-07-22_${(a.name || a.title).replace(/[\\/:*?"<>|]+/g, ' ').trim()}.md`);
        fs.writeFileSync(file, a.body, 'utf8');
        return file;
    };
    registerNoticesOps(reg, { store, writeReport, onChange: () => changes++, onPost: n => { posted = n; } });

    const cat = reg.catalog().map(c => c.op);
    ok('all five notices ops catalogued',
        ['notices.post', 'notices.list', 'notices.read', 'notices.resolve', 'notices.dismiss'].every(op => cat.includes(op)));

    const post = await reg.dispatch('notices.post', {
        title: 'AI digest', type: 'update', level: 2, tags: ['ai-daily'],
        sections: [{ title: 'Model X released', body: 'Full summary with everything you need.' }]
    });
    ok('post returns id/type/level/unread', post.ok && post.result.type === 'update' && post.result.level === 2 && post.result.unread === 1);
    ok('onPost + onChange fired', posted && posted.title === 'AI digest' && changes >= 1);

    const q = await reg.dispatch('notices.post', { title: 'need a decision', type: 'question', level: 3, agent: 'developer' });
    ok('question posted with open status', q.ok && store.notices.find(n => n.id === q.result.id).status === 'open');

    const empty = await reg.dispatch('notices.post', { body: 'x' });
    ok('post refuses missing title', !empty.ok && /title/i.test(empty.error));

    // second leg: `report` content is written to a file and linked
    const rep = await reg.dispatch('notices.post', {
        title: 'Günlük AI özeti', type: 'report', level: 2,
        body: 'Kısa özet — detay raporda.', reportName: 'AI-Ozet',
        report: '# Günlük AI raporu\n\nDolu dolu içerik.\n\nKaynak: https://example.com'
    });
    ok('report leg returns a reportPath', rep.ok && typeof rep.result.reportPath === 'string' && /AI-Ozet\.md$/.test(rep.result.reportPath));
    ok('report file actually written with full body', rep.ok && fs.existsSync(rep.result.reportPath) && /Dolu dolu/.test(fs.readFileSync(rep.result.reportPath, 'utf8')));
    ok('notice stores reportPath', store.notices.find(n => n.id === rep.result.id).reportPath === rep.result.reportPath);
    // pre-written file: reportPath links as-is (no writeReport call)
    const rep2 = await reg.dispatch('notices.post', { title: 'linked', reportPath: 'D:/known/report.md' });
    ok('reportPath passthrough', rep2.ok && store.notices.find(n => n.id === rep2.result.id).reportPath === 'D:/known/report.md');

    const byTag = await reg.dispatch('notices.list', { tag: 'ai-daily' });
    ok('list filters by tag', byTag.ok && byTag.result.length === 1);
    const openQ = await reg.dispatch('notices.list', { type: 'question', handled: false });
    ok('list finds unhandled questions', openQ.ok && openQ.result.length === 1 && openQ.result[0].title === 'need a decision');

    // user answers in UI (store), agent resolves via bridge
    store.answer(q.result.id, 'do option B');
    const res = await reg.dispatch('notices.resolve', { id: q.result.id });
    ok('resolve marks handled', res.ok && store.notices.find(n => n.id === q.result.id).handled === true);
    const resBad = await reg.dispatch('notices.resolve', { id: 'nope' });
    ok('resolve unknown id errors', !resBad.ok && /not found/i.test(resBad.error));

    const read = await reg.dispatch('notices.read', { id: post.result.id });
    ok('read marks read', read.ok);
    const dis = await reg.dispatch('notices.dismiss', { id: post.result.id });
    ok('dismiss by id', dis.ok && dis.result.ok === true);

    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(reportDir, { recursive: true, force: true }); } catch {}

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
