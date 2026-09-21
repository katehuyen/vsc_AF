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
    noticeMarkdown, buildNoticesMarkdown, NOTICE_TYPES, reportFileStem,
    staleReminderKeys, IDLE_REMINDER_PREFIX, NO_ACCOUNT
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
    // ‼️ X-309 — `NoticeInput.type` is a loose string and an unknown word becomes
    // `update` without a sound: the sentry's two warnings were posted as 'alert'
    // and reached the user as routine updates (measured on the fire drill). So
    // every literal type the host posts is read out of the source and checked.
    {
        const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
        const posted = [];
        const re = /noticesStore\.add\(\{[\s\S]{0,400}?\btype:\s*'([a-z-]+)'/g;
        for (let m; (m = re.exec(src));) { posted.push(m[1]); }
        const wrong = posted.filter(t => !NOTICE_TYPES.includes(t));
        ok('the host posts notices with literal types at all (the reading found some)', posted.length >= 2);
        ok('‼️ every notice type the host posts is a real one — none silently becomes update: '
            + (wrong.join(', ') || 'none'), wrong.length === 0);
    }
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

// ---------- a reminder is withdrawn when what it reminds you of ends ----------
//
// "developer is waiting for you" is a statement about a live state, and the act
// that makes it obsolete (answering that session) is the act of dealing with
// it. Leaving it on the board is what teaches the user the board is stale — so
// the farm takes its own line back, and the user tidies nothing.
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-notices-source-'));
    const store = new NoticesStore(path.join(dir, 'notices.json')); store.load();
    const idle = store.add({ title: 'developer is waiting for you', type: 'reminder', sourceKey: 'idle:s1' });
    const other = store.add({ title: 'manager is waiting for you', type: 'reminder', sourceKey: 'idle:s2' });
    const plain = store.add({ title: 'an agent said something', type: 'update' });

    ok('the source of a host-posted notice is remembered', idle.sourceKey === 'idle:s1');
    ok('…and an agent\'s own notice carries none', plain.sourceKey === undefined);
    ok('a source key longer than the field is cut, not rejected',
        makeNotice({ title: 'x', sourceKey: 'k'.repeat(400) }).sourceKey.length === 200);
    ok('an empty source key is simply absent', makeNotice({ title: 'x', sourceKey: '   ' }).sourceKey === undefined);

    const removed = store.dismissBySource('idle:s1');
    ok('the condition ending takes its own notice back', removed.length === 1 && removed[0] === idle.id);
    ok('…and touches nothing else', store.notices.length === 2 &&
        store.notices.some(n => n.id === other.id) && store.notices.some(n => n.id === plain.id));
    ok('an unknown source removes nothing', store.dismissBySource('idle:nope').length === 0);
    ok('an empty key is not a wildcard', store.dismissBySource('').length === 0 && store.notices.length === 2);

    // ‼️ The user's own mark outranks the automatism: pinning or starring a line
    // is a decision to keep it, and nothing automatic may undo a decision.
    store.pin(other.id, true);
    ok('a PINNED reminder survives its condition ending', store.dismissBySource('idle:s2').length === 0);
    store.pin(other.id, false); store.setStars(other.id, 2);
    ok('…and so does a STARRED one', store.dismissBySource('idle:s2').length === 0);
    store.setStars(other.id, 0);
    ok('unmarked again, it goes', store.dismissBySource('idle:s2').length === 1);

    // The verdict itself: which posted keys have stopped being true. Answered,
    // closed, resumed, gone from the fleet — one test covers all of them.
    const posted = ['idle:s1', 'idle:s2', 'idle:s3', 'parked:t9', 'budget:2026-08-01:dev'];
    const stale = staleReminderKeys(posted, ['s2']);
    ok('a session still waiting on you keeps its reminder', stale.indexOf('idle:s2') < 0);
    ok('every other session\'s reminder is stale — answered, closed or gone',
        stale.indexOf('idle:s1') >= 0 && stale.indexOf('idle:s3') >= 0);
    ok('news of other kinds is left alone — each owns its own liveness test',
        !stale.some(k => k.indexOf('idle:') !== 0) && stale.length === 2);
    ok('nothing waiting means nothing is still true', staleReminderKeys(posted, []).length === 3);
    ok('no reminders posted, nothing to withdraw', staleReminderKeys(['parked:t1'], []).length === 0);
    ok('the prefix is shared with the host, not retyped', IDLE_REMINDER_PREFIX === 'idle:');

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
        if (a.name === 'THROW') { throw new Error('no room on device'); }
        const file = path.join(reportDir, `2026-07-22_${(a.name || a.title).replace(/[\\/:*?"<>|]+/g, ' ').trim()}.md`);
        fs.writeFileSync(file, a.body, 'utf8');
        return file;
    };
    // The registry the host injects. Both a name and an id resolve; anything
    // else comes back undefined, which is what makes "no project matches" a
    // real answer instead of a silent filing under nothing.
    const PROJECTS = { prj_aaa: 'Agent Farm', prj_bbb: 'TalkScribe' };
    const resolveProject = (key) => {
        const k = String(key || '').trim();
        if (PROJECTS[k]) { return k; }
        const hit = Object.keys(PROJECTS).find(id => PROJECTS[id].toLowerCase() === k.toLowerCase());
        return hit;
    };
    // N-1: what the HOST knows about where an agent is working right now. The
    // real one reads hosted sessions, the live monitor and the projects that
    // declare an agent; here it is a lookup, because what is being pinned is
    // the OP's rule about when it asks and when it does not.
    const RUNNING = { 'proje-ajani': 'prj_aaa' };
    const exportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-notices-export-'));
    registerNoticesOps(reg, {
        store, writeReport, resolveProject,
        defaultReportDir: () => exportDir,
        inferProject: (agent) => RUNNING[String(agent || '')],
        onChange: () => changes++, onPost: n => { posted = n; }
    });

    const cat = reg.catalog().map(c => c.op);
    ok('all six notices ops catalogued',
        ['notices.post', 'notices.list', 'notices.read', 'notices.resolve', 'notices.dismiss',
            'notices.project'].every(op => cat.includes(op)));
    // B-20 — the four the board could do and the bridge could not.
    ok('…and the four management ops beside them',
        ['notices.edit', 'notices.pin', 'notices.stars', 'notices.undo'].every(op => cat.includes(op)));

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
    ok('a delivered report says nothing about an error', rep.ok && rep.result.reportError === undefined);
    // ‼️ the second leg never fails quietly: a report asked for and not written
    // used to answer `ok: true` with no word about it (measured 2026-08-10 — a
    // 14 KB guide the user never received).
    const bad = await reg.dispatch('notices.post', { title: 'rapor kayboldu', report: { value: 'x', Length: 1 } });
    ok('unusable report is reported back', bad.ok && /not a usable string/.test(bad.result.reportError));
    ok('unusable report still posts the notice', bad.ok && store.notices.some(n => n.id === bad.result.id));
    ok('unusable report leaves no reportPath', bad.ok && bad.result.reportPath === undefined);
    const boom = await reg.dispatch('notices.post', {
        title: 'disk dolu', report: '# x', reportName: 'THROW'
    });
    ok('a failing report write is reported back', boom.ok && /could not be written: no room/.test(boom.result.reportError));
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

    // ---- Faz 5: which project a notice is about ----
    {
        const byName = await reg.dispatch('notices.post', { title: 'filed by name', project: 'Agent Farm' });
        ok('a project NAME files the notice', byName.ok && byName.result.projectId === 'prj_aaa');
        const byId = await reg.dispatch('notices.post', { title: 'filed by id', project: 'prj_bbb' });
        ok('…and so does its id', byId.ok && byId.result.projectId === 'prj_bbb');

        // ‼️ The one that matters. A misspelt project used to be indistinguishable
        // from no project at all, so an agent could believe for a month that its
        // reports were reaching a page they had never touched.
        const bad = await reg.dispatch('notices.post', { title: 'nearly named it', project: 'Agent Farmm' });
        ok('‼️ an unknown project is REPORTED, and the notice posts unfiled rather than guessed at',
            bad.ok && !bad.result.projectId && /no project matches/i.test(bad.result.projectError || ''));
        ok('…and the notice itself still exists — losing the message too would help nobody',
            store.notices.some(n => n.title === 'nearly named it'));

        const mine = await reg.dispatch('notices.list', { project: 'Agent Farm' });
        ok('list filters by project', mine.ok && mine.result.length === 1
            && mine.result[0].title === 'filed by name');
        const none = await reg.dispatch('notices.list', { project: '(none)' });
        ok('"(none)" is a real question, and it finds the unfiled ones',
            none.ok && none.result.length > 0 && none.result.every(n => !n.projectId));
        // ‼️ A filter that silently stops filtering hands back the whole board
        // and looks like an answer.
        const ghost = await reg.dispatch('notices.list', { project: 'no such thing' });
        ok('‼️ an unmatched project filter returns NOTHING rather than everything',
            ghost.ok && ghost.result.length === 0);

        const moved = await reg.dispatch('notices.project', {
            id: byName.result.id, project: 'TalkScribe'
        });
        ok('a stamp can be changed', moved.ok && moved.result.projectId === 'prj_bbb'
            && store.notices.find(n => n.id === byName.result.id).projectId === 'prj_bbb');
        const cleared = await reg.dispatch('notices.project', { id: byName.result.id });
        ok('‼️ …and taken off entirely — a mark you cannot remove is a mark nobody trusts',
            cleared.ok && cleared.result.projectId === null
            && !store.notices.find(n => n.id === byName.result.id).projectId);
        const bulk = await reg.dispatch('notices.project', {
            ids: [byId.result.id, bad.result.id], project: 'prj_aaa'
        });
        ok('and it works in bulk', bulk.ok && bulk.result.changed === 2);
        const refuse = await reg.dispatch('notices.project', { id: byId.result.id, project: 'ghost' });
        ok('setting an unknown project is refused, not silently ignored',
            !refuse.ok && /no project matches/i.test(refuse.error));

        // A project the user deleted leaves stamps behind, and they are invisible.
        store.setProject([byId.result.id], 'prj_gone');
        const pruned = store.pruneProjects(['prj_aaa', 'prj_bbb']);
        ok('‼️ a stamp pointing at a deleted project is pruned — a filter matching nothing for ever is worse than none',
            pruned === 1 && !store.notices.find(n => n.id === byId.result.id).projectId);
    }

    // ---- N-1: the stamp the poster did not have to type ----
    //
    // The board filled up with "No Project" because `project` was an argument
    // nobody remembered to pass, and filing them fell to the user for work they
    // had themselves asked for under a project.
    {
        const auto = await reg.dispatch('notices.post', {
            title: 'backlog kalemleri tamamlandı', agent: 'proje-ajani'
        });
        ok('‼️ a notice from an agent working in a project is filed under it without being asked',
            auto.ok && auto.result.projectId === 'prj_aaa');
        ok('…and the answer SAYS the host decided it, so the poster can correct it',
            auto.ok && typeof auto.result.projectFrom === 'string');

        const elsewhere = await reg.dispatch('notices.post', {
            title: 'about the other one', agent: 'proje-ajani', project: 'TalkScribe'
        });
        ok('an explicit project still wins over what the host inferred',
            elsewhere.ok && elsewhere.result.projectId === 'prj_bbb'
            && elsewhere.result.projectFrom === undefined);

        const none = await reg.dispatch('notices.post', {
            title: 'about the fleet itself', agent: 'proje-ajani', project: '(none)'
        });
        ok('‼️ "(none)" is how a poster says UNFILED out loud, and it is honoured',
            none.ok && none.result.projectId === undefined && none.result.projectError === undefined);

        const unknown = await reg.dispatch('notices.post', {
            title: 'from nobody in particular', agent: 'psikolog'
        });
        ok('an agent the host cannot place is still posted, unfiled and without complaint',
            unknown.ok && unknown.result.projectId === undefined
            && unknown.result.projectError === undefined);
    }

    const read = await reg.dispatch('notices.read', { id: post.result.id });
    ok('read marks read', read.ok);

    // ==================================================== B-20: manage a notice
    //
    // Everything below was a thing the BOARD could do and the bridge could not,
    // which meant an agent could post a notice and then had no way to correct
    // it, keep it visible, rate it, or take back a removal it got wrong.
    {
        const t = await reg.dispatch('notices.post', { title: 'draft title', type: 'update', level: 1 });
        const id = t.result.id;
        const find = () => store.notices.find(n => n.id === id);

        // ---- edit
        const ed = await reg.dispatch('notices.edit',
            { id, title: 'the corrected title', level: 4, tags: 'a, b' });
        ok('edit changes what it was told to', ed.ok
            && find().title === 'the corrected title' && find().level === 4);
        // ‼️ The first edit snapshots the original: a notice carries what it
        // said before somebody rewrote it, so this is a correction on the
        // record rather than a quiet substitution.
        ok('…and the original is kept for the diff',
            find().edited === true && find().original.title === 'draft title');
        ok('…and what was NOT passed is untouched', find().type === 'update');
        const noop = await reg.dispatch('notices.edit', { id });
        ok('an edit that changes nothing is refused, not silently stamped',
            !noop.ok && /at least one/i.test(noop.error));
        const ghost = await reg.dispatch('notices.edit', { id: 'nope', title: 'x' });
        ok('…and an unknown id says so', !ghost.ok && /not found/i.test(ghost.error));

        // ---- pin
        const pin = await reg.dispatch('notices.pin', { id });
        ok('pin defaults to pinning', pin.ok && find().pinned === true);
        const unpin = await reg.dispatch('notices.pin', { id, pinned: false });
        ok('…and false lets it go', unpin.ok && find().pinned === false);

        // ---- stars
        const st = await reg.dispatch('notices.stars', { id, stars: 3 });
        ok('stars rates it', st.ok && find().stars === 3);
        // ‼️ MEASURED, NOT ASSUMED: the scale is 0-3 and `coerceStars` sends
        // anything outside it to ZERO — it does not clamp. A "5" from a caller
        // who assumed five stars therefore CLEARS the rating, and the op's
        // description has to say so or an agent will keep un-rating things it
        // meant to rate highest.
        await reg.dispatch('notices.stars', { id, stars: 99 });
        ok('…and out of range falls to zero rather than clamping', find().stars === 0);
        await reg.dispatch('notices.stars', { id, stars: 2 });
        await reg.dispatch('notices.stars', { id, stars: 0 });
        ok('…and zero clears it', !find().stars);
        const nostars = await reg.dispatch('notices.stars', { id });
        ok('stars without a rating is a caller error', !nostars.ok && /required/i.test(nostars.error));
    }

    // ==================================================== B-20: undo a removal
    //
    // ‼️ A dismiss over the bridge used to be FINAL — a wrong id destroyed a
    // notice nobody could recover, and the board's own Undo could not help
    // because it remembered the removal on the PANEL. One memory now, on the
    // store, so the button and the op take back the same thing.
    {
        const nothing = await reg.dispatch('notices.undo', {});
        ok('nothing removed yet means nothing to undo',
            !nothing.ok && /nothing to undo/i.test(nothing.error));

        const a = await reg.dispatch('notices.post', { title: 'first' });
        const b = await reg.dispatch('notices.post', { title: 'second' });
        const has = (id) => store.notices.some(n => n.id === id);

        await reg.dispatch('notices.dismiss', { id: a.result.id });
        ok('a dismissed notice is gone', !has(a.result.id));
        const back = await reg.dispatch('notices.undo', {});
        ok('…and undo brings it back', back.ok && back.result.restored === 1 && has(a.result.id));

        // One deep, deliberately: undo answers "that was a mistake", not
        // "walk back through the day". The memory is spent by the undo.
        const twice = await reg.dispatch('notices.undo', {});
        ok('undo does not repeat itself', !twice.ok);

        // The bulk sweep is the removal that most needs taking back.
        store.dismissMany([a.result.id, b.result.id]);
        ok('a bulk dismiss removes both', !has(a.result.id) && !has(b.result.id));
        const bulk = await reg.dispatch('notices.undo', {});
        ok('…and undo restores the whole batch',
            bulk.ok && bulk.result.restored === 2 && has(a.result.id) && has(b.result.id));

        // …and the newest removal is the one that is remembered.
        store.dismissMany([a.result.id]);
        store.dismissMany([b.result.id]);
        await reg.dispatch('notices.undo', {});
        ok('the LAST removal is what comes back, not the one before it',
            has(b.result.id) && !has(a.result.id));
    }

    const dis = await reg.dispatch('notices.dismiss', { id: post.result.id });
    ok('dismiss by id', dis.ok && dis.result.ok === true);
    ok('…and says the removal can be taken back', dis.result.undoable === 1);

    // ---------- X-257: WHICH SIGN-IN THIS HAPPENED TO, AS DATA ----------
    // X-178 announces a slot whose token fell over, and it says which one in
    // PROSE. So the same account's repeated failures cannot be grouped, the
    // board cannot be filtered by sign-in, and an agent cannot ask "is there an
    // open warning about this account". On a farm whose scarce resource IS
    // account quota, that is the axis the board was missing.
    {
        const a1 = makeNotice({ title: 'signed out', account: '  claude-work ' });
        ok('a notice carries the account it is about', a1.account === 'claude-work');
        ok('…and a notice about no particular account carries none',
            makeNotice({ title: 'x' }).account === undefined);

        const list = [
            makeNotice({ title: 'a', account: 'slot-a' }),
            makeNotice({ title: 'b', account: 'slot-b' }),
            makeNotice({ title: 'c' })
        ];
        ok('the board can be filtered by sign-in',
            filterNotices(list, { account: 'slot-a' }).length === 1);
        ok('…case-insensitively, the way the agent filter is',
            filterNotices(list, { account: 'SLOT-B' }).length === 1);
        ok('‼️ …and "nobody filed one" is a different question from no filter at all',
            filterNotices(list, { account: NO_ACCOUNT }).length === 1
            && filterNotices(list, {}).length === 3);

        const posted = await reg.dispatch('notices.post',
            { title: 'slot down', account: 'claude-night' });
        ok('the bridge posts the account as data', posted.ok && posted.result.account === 'claude-night');
        const found = await reg.dispatch('notices.list', { account: 'claude-night' });
        ok('…and lists by it', found.ok && found.result.length === 1
            && found.result[0].title === 'slot down');
    }

    // ‼️ The same notice posted twice — measured 2026-09-13. An agent piped its
    // own post answer through head -8, could not see the id it had been given,
    // and re-ran the identical command to read the fields; the user got the
    // same question on the board twice. A write op is not an inspection.
    {
        const args = {
            title: 'aynı mesaj iki kez', level: 3, type: 'question', agent: 'developer',
            body: 'the body that makes it the same message',
            sections: [{ title: 'one', body: 'first' }]
        };
        const before = store.notices.length;
        const first = await reg.dispatch('notices.post', args);
        ok('a first post goes through', first.ok && first.result.posted !== false
            && store.notices.length === before + 1);

        posted = null;
        const again = await reg.dispatch('notices.post', args);
        ok('‼️ the identical post is REFUSED, not obeyed',
            again.ok && again.result.posted === false && again.result.duplicateOf === first.result.id
            && store.notices.length === before + 1);
        ok('…and it hands back the notice the caller could not read',
            again.result.id === first.result.id && again.result.title === args.title
            && /never re-run notices\.post/i.test(again.result.note));
        ok('…and the board is not told anything happened', posted === null);

        // The second leg must not run either: a re-run used to rewrite the
        // report file under the notice the user is already reading.
        const rArgs = { title: 'rapor tekrarı', agent: 'developer', body: 'summary', report: 'ORIGINAL' };
        const r1 = await reg.dispatch('notices.post', rArgs);
        const r2 = await reg.dispatch('notices.post', { ...rArgs, report: 'OVERWRITTEN' });
        ok('‼️ a re-run cannot rewrite the report file under it',
            r2.result.posted === false && fs.readFileSync(r1.result.reportPath, 'utf8') === 'ORIGINAL');

        // It is a guard, not a wall: different words are different news, and a
        // caller that really means to repeat itself says so.
        const changedBody = await reg.dispatch('notices.post', { ...args, body: 'different words' });
        ok('a different body is different news and posts', changedBody.result.posted !== false);
        const onPurpose = await reg.dispatch('notices.post', { ...args, allowDuplicate: true });
        ok('…and allowDuplicate:true says it twice on purpose',
            onPurpose.result.posted !== false && onPurpose.result.id !== first.result.id);

        // ‼️ Resolving a duplicate is what the agent DID, and it is not a
        // retraction: the user kept seeing two. dismiss is the op.
        await reg.dispatch('notices.resolve', { id: onPurpose.result.id });
        ok('‼️ resolve does NOT take it off the board',
            !!store.notices.find(n => n.id === onPurpose.result.id));
        await reg.dispatch('notices.dismiss', { id: onPurpose.result.id });
        ok('…dismiss does', !store.notices.find(n => n.id === onPurpose.result.id));
        // And the window is a window: an old copy is news again.
        const aged = store.notices.find(n => n.id === first.result.id);
        aged.ts -= 11 * 60 * 1000;
        const later = await reg.dispatch('notices.post', args);
        ok('the same sentence long afterwards is news again', later.result.posted !== false);
    }

    // ---------- B-21 — the board as a document ----------
    {
        ok('notices.export is catalogued', reg.catalog().map(c => c.op).includes('notices.export'));

        const board = await reg.dispatch('notices.export', {});
        ok('export returns the content and files nothing by default',
            board.ok && board.result.file === null && /# Agent Farm — Notices export/.test(board.result.content));
        ok('…and it is the SAME document the page writes',
            board.ok && board.result.content === buildNoticesMarkdown(
                store.list({ limit: 0 }), store.list({ limit: 0 }).map(n => n.id), new Set(),
                { view: false, foldedTitles: false }));
        ok('…counting what it wrote', board.ok && board.result.notices === store.list({ limit: 0 }).length);

        // ‼️ An export that silently stopped at the list's page size is the
        // mistake this op exists to avoid: the two defaults are different
        // questions (a screenful · the whole board).
        const listed = await reg.dispatch('notices.list', {});
        ok('list still pages at 30 while export takes everything',
            listed.ok && listed.result.length <= 30 && board.result.notices >= listed.result.length);

        await reg.dispatch('notices.post', { title: 'tagged for export', tags: ['export-probe'] });
        const tagged = await reg.dispatch('notices.export', { tag: 'export-probe' });
        ok('export selects exactly like list',
            tagged.ok && tagged.result.notices === 1 && /tagged for export/.test(tagged.result.content));

        const one = await reg.dispatch('notices.export', { id: store.list({ limit: 0 })[0].id });
        ok('a single notice exports on its own',
            one.ok && one.result.notices === 1 && /^# Agent Farm — Notice\n/.test(one.result.content));
        const ghost = await reg.dispatch('notices.export', { id: 'no-such-notice' });
        ok('an unknown id is refused, never exported as an empty file', !ghost.ok && /not found/i.test(ghost.error));
        const nothing = await reg.dispatch('notices.export', { tag: 'nobody-tagged-this' });
        ok('a selection matching nothing is refused rather than filed blank',
            !nothing.ok && /No notice matches/.test(nothing.error));

        const target = path.join(exportDir, 'board.md');
        const written = await reg.dispatch('notices.export', { file: target });
        ok('`file` writes it and names the path back',
            written.ok && written.result.file === path.resolve(target) && fs.existsSync(target));
        ok('…with the bytes it says it wrote',
            written.ok && fs.readFileSync(target, 'utf8').length > 0
            && written.result.bytes === Buffer.byteLength(fs.readFileSync(target, 'utf8'), 'utf8'));
        const saved = await reg.dispatch('notices.export', { save: true });
        ok('`save:true` lands in the report folder and says where',
            saved.ok && path.dirname(saved.result.file) === exportDir
            && saved.result.chosenForYou === true && fs.existsSync(saved.result.file));
    }

    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(reportDir, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(exportDir, { recursive: true, force: true }); } catch {}

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
