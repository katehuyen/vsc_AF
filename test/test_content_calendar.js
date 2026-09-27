// M-51 — the content calendar: one vault note per publish in Full Calendar's frontmatter
// (src/core/contentCalendar.ts), and a webhook step's JSON body filled inside its values.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const Module = require('module');
const ROOT = path.resolve(__dirname, '..');
const fakeVscode = {
    EventEmitter: class { constructor() { this.c = []; } get event() { return cb => { this.c.push(cb); return { dispose() { } }; }; } fire(v) { this.c.forEach(cb => cb(v)); } dispose() { } },
    window: { showInformationMessage: () => Promise.resolve(), showWarningMessage: () => Promise.resolve(), createTerminal: () => ({ show() { }, sendText() { }, dispose() { } }), onDidCloseTerminal: () => ({ dispose() { } }) }
};
const origLoad = Module._load;
Module._load = function (r, p, m) { return r === 'vscode' ? fakeVscode : origLoad.call(this, r, p, m); };
const K = require(path.join(ROOT, 'out/core/contentCalendar.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, a, b) => { const s = JSON.stringify(a) === JSON.stringify(b); ok(n, s); if (!s) { console.log('    got', JSON.stringify(a), 'want', JSON.stringify(b)); } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-cal-'));
const dir = path.join(tmp, 'CONTENT');

/* ---------- the frontmatter, touched only where it is ours ---------- */
const note = '---\r\ntitle: Ders Hazırlık (Hücresel Solunum)\r\nstartTime: 09:00\r\ndate: 2026-06-04\r\ncompleted: false\r\ntags: [a, b]\r\n---\r\nnmm\r\n\r\n- [ ] 📅 Derse hazırlık 🆔 ders\r\n';
eq('the user\'s own Full Calendar note reads as it is', K.readFrontmatter(note).data, { title: 'Ders Hazırlık (Hücresel Solunum)', startTime: '09:00', date: '2026-06-04', completed: 'false', tags: '[a, b]' });
const patched = K.patchFrontmatter(note, { status: 'published', url: 'https://youtu.be/x', completed: 'true' });
ok('a patch replaces its keys in place, adds the rest before ---, and keeps every other byte and the CRLF', patched === '---\r\ntitle: Ders Hazırlık (Hücresel Solunum)\r\nstartTime: 09:00\r\ndate: 2026-06-04\r\ncompleted: true\r\ntags: [a, b]\r\nstatus: published\r\nurl: https://youtu.be/x\r\n---\r\nnmm\r\n\r\n- [ ] 📅 Derse hazırlık 🆔 ders\r\n');
eq('a value YAML would misread is quoted; the ones Full Calendar writes bare stay bare', K.readFrontmatter(K.patchFrontmatter('', { title: 'Soru: neden?', startTime: '18:00', t2: '#etiket' })).data, { title: 'Soru: neden?', startTime: '18:00', t2: '#etiket' });
ok('…and the quote is really there', /title: "Soru: neden\?"/.test(K.patchFrontmatter('', { title: 'Soru: neden?' })));
eq('status words: the five, the Turkish ones, anything else is planned', ['ready', 'Yayınlandı', 'iptal', 'x', undefined].map(K.statusOf), ['ready', 'published', 'cancelled', 'planned', 'planned']);

/* ---------- add, read, find, update ---------- */
const a = K.addEntry(dir, { title: 'Kahve: 3 hata', date: '2026-10-01', startTime: '18:00', platform: 'YouTube', record: 'rec1', body: 'Kısa video.' });
ok('a planned publish is a note named by date, platform and title', path.basename(a.file) === '2026-10-01 youtube - Kahve 3 hata.md' && a.status === 'planned' && a.platform === 'youtube' && a.record === 'rec1');
const text = fs.readFileSync(a.file, 'utf8');
ok('…in Full Calendar\'s own shape, so Obsidian\'s calendar shows it', /date: 2026-10-01/.test(text) && /startTime: 18:00/.test(text) && /allDay: false/.test(text) && /type: single/.test(text) && /completed: false/.test(text) && /Kısa video\./.test(text));
ok('it never replaces a note that is there', (() => { try { K.addEntry(dir, { title: 'Kahve: 3 hata', date: '2026-10-01', platform: 'youtube' }); return false; } catch (e) { return /already in the calendar/.test(e.message); } })());
eq('refusals by name', ['', 'x', '2026-1-1'].map(d => K.newEntryRefusal({ title: 't', date: d, platform: 'p' })).map(Boolean), [true, true, true]);
K.addEntry(dir, { title: 'Eski', date: '2026-09-01', platform: 'instagram' });
K.addEntry(dir, { title: 'Bitti', date: '2026-09-02', platform: 'tiktok', status: 'published' });
K.addEntry(dir, { title: 'Uzak', date: '2026-12-01', platform: 'youtube' });
fs.writeFileSync(path.join(dir, 'not a publish.md'), 'no frontmatter here', 'utf8');
const all = K.readCalendar(dir);
eq('the calendar is every dated note, earliest first; a note without a date is not one', all.map(e => e.title), ['Eski', 'Bitti', 'Kahve: 3 hata', 'Uzak']);
const now = new Date(2026, 8, 28, 12, 0).getTime();
const v = K.calendarView(all, now, 7);
eq('overdue = past due and still open; upcoming = the next 7 days, still open', [v.overdue.map(e => e.title), v.upcoming.map(e => e.title)], [['Eski'], ['Kahve: 3 hata']]);
ok('found by note name, path or title', K.findEntry(all, '2026-10-01 youtube - Kahve 3 hata') === K.findEntry(all, 'Kahve: 3 hata') && !!K.findEntry(all, a.file) && !K.findEntry(all, 'yok'));
const u = K.updateEntry(a.file, { status: 'published', url: 'https://youtu.be/abc', publishedAt: '2026-10-01T18:02:00Z' });
ok('published: status, url, the time, and Full Calendar\'s completed ticked; the body kept', u.status === 'published' && u.url === 'https://youtu.be/abc'
    && /completed: true/.test(fs.readFileSync(a.file, 'utf8')) && /Kısa video\./.test(fs.readFileSync(a.file, 'utf8')));
ok('a missing folder is an empty calendar', K.readCalendar(path.join(tmp, 'nope')).length === 0);

/* ---------- the webhook body is JSON-filled ---------- */
(async () => {
    const { TaskManager } = require(path.join(ROOT, 'out/core/tasks.js'));
    let got = '';
    const server = http.createServer((req, res) => { let b = ''; req.on('data', c => b += c).on('end', () => { got = b; res.setHeader('Content-Type', 'application/json'); res.end('{"ok":true}'); }); });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const url = 'http://127.0.0.1:' + server.address().port + '/hook';
    const mgr = new TaskManager(path.join(tmp, 'c.json'), () => [], () => false, () => '', {});
    try {
        const w = mgr.addWorkflow('Kanca', [{ id: 'h', agentId: '', agentName: 'webhook', title: 'Gönder', prompt: '', mode: 'headless',
            webhook: { url, method: 'POST', body: '{"title": "{input.t}", "file": "{input.f}"}' } }], [{ name: 't', type: 'text' }, { name: 'f', type: 'text' }]);
        const runId = mgr.runWorkflow(w, { inputs: { t: 'Onun "en iyi" anı', f: 'C:\\Users\\rotam\\v.mp4' } });
        for (let i = 0; i < 200 && !got; i++) { await new Promise(r => setTimeout(r, 10)); }
        let parsed;
        try { parsed = JSON.parse(got); } catch { parsed = undefined; }
        eq('‼️ a quote and a Windows path in a value keep the webhook body valid JSON', parsed, { title: 'Onun "en iyi" anı', file: 'C:\\Users\\rotam\\v.mp4' });
        void runId;
    } finally {
        mgr.dispose();
        server.close();
        fs.rmSync(tmp, { recursive: true, force: true });
    }
    const ext = fs.readFileSync(path.join(ROOT, 'src/extension.ts'), 'utf8');
    ok('the bridge has calendar.list, calendar.add and calendar.set', ['calendar.list', 'calendar.add', 'calendar.set'].every(op => ext.includes(`op: '${op}'`)));
    console.log(`test_content_calendar: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
