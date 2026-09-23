// N-10 — A NOTICE THAT BECOMES A WORK ITEM CARRIES THE NOTICE WITH IT.
//
// Two doors convert (the Notices page: convert / answer a question; the bridge
// op queue.fromNotice) and both build their input in core/noticeToQueue.ts, so
// what is asserted here is that one contract end to end: the store keeps the
// notice's agent, type, words, sections, report and project; the answer to a
// question goes back to the agent that asked it — but never to a name that
// takes no work; an agent can find its own answers with ONE filter; and the
// queue page draws the whole notice, while a legacy title-only item still draws.
const path = require('path');
const fs = require('fs');
const os = require('os');
const out = (m) => require(path.join(__dirname, '..', 'out', 'core', m));
const { queueInputFromNotice, coerceNoticeSource } = out('noticeToQueue.js');
const { makeWorkItem, filterItems, WorkQueueStore, registerQueueOps } = out('workqueue.js');
const { NoticesStore } = out('notices.js');
const { BridgeRegistry } = out('bridge.js');
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));
const fixture = require(path.join(__dirname, 'fixtures', 'queue.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const NOTICE = {
    title: 'Silinsin mi?', agentName: 'developer', type: 'question', body: 'uzun **metin**',
    sections: [{ title: 'Risk', body: 'yok' }], reportPath: 'D:\\r\\a.md', projectId: 'prj_aaa'
};
const isAgent = (n) => ['developer', 'manager'].includes(n.toLowerCase());

(async () => {
    // ---------- the pure contract ----------
    const inp = queueInputFromNotice('n1', 'evet', NOTICE, isAgent);
    ok('input carries the whole notice',
        inp.sourceNoticeId === 'n1' && inp.sourceNoticeTitle === 'Silinsin mi?' && inp.sourceNoticeAgent === 'developer'
        && inp.sourceNoticeType === 'question' && inp.sourceNoticeBody === 'uzun **metin**'
        && inp.sourceNoticeSections.length === 1 && inp.sourceNoticeReportPath === 'D:\\r\\a.md'
        && inp.projectId === 'prj_aaa' && inp.author === 'user' && inp.text === 'evet');
    ok('an answered question goes back to the agent that asked it', inp.target === 'developer');
    const sys = queueInputFromNotice('n2', 'tamam', { ...NOTICE, agentName: 'Agent Farm' }, isAgent);
    ok('a notice from a name that takes no work is NOT routed, but its author is kept',
        sys.target === undefined && sys.sourceNoticeAgent === 'Agent Farm');
    ok('no predicate = no target', queueInputFromNotice('n3', 'x', NOTICE).target === undefined);
    const gone = queueInputFromNotice('n4', 'x', undefined, isAgent);
    ok('a notice already gone yields the bare link', gone.sourceNoticeId === 'n4' && !gone.sourceNoticeTitle && !gone.target);
    ok('sections are copied, not shared', inp.sourceNoticeSections[0] !== NOTICE.sections[0]);

    // ---------- makeWorkItem: validated, capped, only with a source ----------
    const it = makeWorkItem(inp);
    ok('the item keeps every source field', it.sourceNoticeAgent === 'developer' && it.sourceNoticeType === 'question'
        && it.sourceNoticeBody === 'uzun **metin**' && it.sourceNoticeSections[0].title === 'Risk'
        && it.sourceNoticeReportPath === 'D:\\r\\a.md' && it.projectId === 'prj_aaa' && it.target === 'developer');
    const big = makeWorkItem({
        text: 't', sourceNoticeId: 'n5', sourceNoticeBody: 'x'.repeat(20000),
        sourceNoticeSections: Array.from({ length: 30 }, (_, i) => ({ title: 'T' + i, body: 'b'.repeat(9000) })).concat([{ title: '', body: '' }]),
        sourceNoticeType: 'QUESTION'
    });
    ok('body capped', big.sourceNoticeBody.length === 8000);
    ok('sections capped in count and length', big.sourceNoticeSections.length === 20 && big.sourceNoticeSections[0].body.length === 4000);
    ok('type normalised', big.sourceNoticeType === 'question');
    const stray = makeWorkItem({ text: 't', sourceNoticeAgent: 'developer', sourceNoticeBody: 'b' });
    ok('source fields without a source id are dropped', !stray.sourceNoticeAgent && !stray.sourceNoticeBody);
    ok('coerce drops empty sections', coerceNoticeSource({ sourceNoticeSections: [{ title: '', body: '' }] }).sourceNoticeSections === undefined);

    // ---------- the filter an agent uses to find its own answers ----------
    const list = [it, makeWorkItem({ text: 'u' }), makeWorkItem(queueInputFromNotice('n6', 'y', { ...NOTICE, agentName: 'manager' }, isAgent))];
    const mine = filterItems(list, { sourceNoticeAgent: 'Developer' });
    ok('sourceNoticeAgent filter, case-insensitive', mine.length === 1 && mine[0].id === it.id);

    // ---------- the store's snapshot ----------
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-n10-'));
    const ns = new NoticesStore(path.join(dir, 'notices.json')); ns.load();
    const n = ns.add({ title: 'Soru', type: 'question', level: 3, agentName: 'developer', body: 'gövde', sections: [{ title: 'h', body: 'b' }], reportPath: 'D:\\r\\b.md', projectId: 'prj_bbb' });
    const snap = ns.snapshotOf(n.id);
    ok('snapshotOf returns the notice fields', snap.title === 'Soru' && snap.agentName === 'developer' && snap.type === 'question'
        && snap.body === 'gövde' && snap.sections[0].body === 'b' && snap.reportPath === 'D:\\r\\b.md' && snap.projectId === 'prj_bbb');
    snap.sections[0].body = 'mutated';
    ok('snapshotOf is a copy', ns.snapshotOf(n.id).sections[0].body === 'b');
    ok('snapshotOf of a missing id is undefined', ns.snapshotOf('nope') === undefined);

    // ---------- the bridge door, wired like the host wires it ----------
    const store = new WorkQueueStore(path.join(dir, 'work-queue.json')); store.load();
    const reg = new BridgeRegistry();
    registerQueueOps(reg, {
        store,
        notices: {
            titleOf: (id) => ns.titleOf(id), snapshotOf: (id) => ns.snapshotOf(id), isAgent,
            addSpawnedItem: (id, ref) => ns.addSpawnedItem(id, ref), dismiss: (id) => ns.dismiss(id)
        }
    });
    const r = await reg.dispatch('queue.fromNotice', { noticeId: n.id, text: 'evet, sil', deleteNotice: false });
    const got = store.get(r.result.id);
    ok('queue.fromNotice carries the notice', r.ok && got.sourceNoticeAgent === 'developer' && got.sourceNoticeBody === 'gövde'
        && got.sourceNoticeSections.length === 1 && got.sourceNoticeReportPath === 'D:\\r\\b.md' && got.projectId === 'prj_bbb' && got.target === 'developer');
    const l = await reg.dispatch('queue.list', { sourceNoticeAgent: 'developer' });
    ok('queue.list finds it by sourceNoticeAgent', l.ok && l.result.length === 1 && l.result[0].id === got.id);
    const l2 = await reg.dispatch('queue.list', { sourceNoticeAgent: 'psikolog' });
    ok('…and not for another agent', l2.ok && l2.result.length === 0);
    const reg2 = new BridgeRegistry();
    const store2 = new WorkQueueStore(path.join(dir, 'wq2.json')); store2.load();
    registerQueueOps(reg2, { store: store2, notices: { titleOf: () => 'eski başlık', addSpawnedItem: () => true, dismiss: () => true } });
    const r2 = await reg2.dispatch('queue.fromNotice', { noticeId: 'old', text: 'x' });
    const g2 = store2.get(r2.result.id);
    ok('a port with titleOf only still snapshots the title', g2.sourceNoticeTitle === 'eski başlık' && !g2.sourceNoticeAgent && !g2.target);
    ok('describe names the carried fields', /sourceNoticeAgent\?/.test(JSON.stringify(reg.catalog())));

    // ---------- the page ----------
    const scene = fixture.variants().find(v => v.id === 'fromnotice');
    const page = runPage('queue.js', scene.data);
    scene.act(page);
    const html = page.html();
    ok('the question badge names its kind, title and agent', /❓ Question: <a [^>]*class="q-openNotice"[^>]*>Test paketinin/.test(html) && /from <strong>developer<\/strong>/.test(html));
    ok('the original notice is drawn in full', /class="q-srcfull"/.test(html) && /<strong>haiku<\/strong>/.test(html)
        && /q-srcsec-h">Ne silinecek/.test(html) && /data-act="srcreport" data-id="q7"/.test(html));
    ok('the legacy item draws its title with the plain badge', /🔔 Notice: <a [^>]*data-id="mtyhiafd61hud"[^>]*>U-146/.test(html));
    ok('the legacy item offers no Original toggle', !/data-act="srcfull" data-id="q8"/.test(html));
    const p2 = runPage('queue.js', scene.data);
    scene.act(p2);
    const rep = p2.query('[data-act="srcreport"][data-id="q7"]')[0];
    if (rep) { rep.click(); }
    ok('the report button asks the host for the NOTICE report', p2.posted.some(m => m.type === 'openFile' && m.kind === 'noticeReport' && m.id === 'q7'));
    const tog = p2.query('[data-act="srcfull"][data-id="q7"]')[0];
    if (tog) { tog.click(); }
    ok('Original folds back', !/class="q-srcfull"/.test(p2.html()));

    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
