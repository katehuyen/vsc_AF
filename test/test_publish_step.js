// M-51 — the publish step: gate, connection (a mock n8n webhook), then the calendar note and
// the media record told (src/core/publishStep.ts). The acceptance: a mock publish end to end,
// the calendar note updated.
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
const P = require(path.join(ROOT, 'out/core/publishStep.js'));
const K = require(path.join(ROOT, 'out/core/contentCalendar.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, a, b) => { const s = JSON.stringify(a) === JSON.stringify(b); ok(n, s); if (!s) { console.log('    got', JSON.stringify(a), 'want', JSON.stringify(b)); } };

/* ---------- the pure rules ---------- */
eq('refused by name', [P.publishRefusal({ platform: 'youtube', url: 'u' }), !!P.publishRefusal({ url: 'u' }), !!P.publishRefusal({ platform: 'y' }),
    !!P.publishRefusal({ platform: 'y', url: 'u', approval: 'maybe' }), !!P.publishRefusal({ platform: 'y', url: 'u', connection: 'ftp' })], ['', true, true, true, true]);
eq('approval: built-in ask, Farm Settings, the step\'s own wins; schedule now unless planned', [
    P.planPublish({ platform: 'y', url: 'u' }).approval, P.planPublish({ platform: 'y', url: 'u' }, 'never').approval,
    P.planPublish({ platform: 'y', url: 'u', approval: 'auto' }, 'never').approval, P.planPublish({ platform: 'y', url: 'u', schedule: 'planned' }).schedule], ['ask', 'never', 'auto', 'planned']);
const entry = { file: 'f', name: '2026-10-01 youtube - Kahve', title: 'Kahve', date: '2026-10-01', startTime: '18:00', platform: 'youtube', status: 'planned', record: 'rec1' };
const pay = P.buildPublishPayload({ platform: 'YouTube', stepTitle: 'Yayınla', schedule: 'planned', entry, metadata: { description: 'd' }, prevJson: { outputs: ['C:\\v.mp4'] }, prevText: 'metin', runId: 'r1', workflowTitle: 'W' });
ok('the payload: platform, the note\'s title and time, the files handed on, the text, the note and its record, the metadata', pay.platform === 'youtube' && pay.title === 'Kahve'
    && pay.publishAt === new Date(2026, 9, 1, 18, 0).toISOString() && pay.files[0] === 'C:\\v.mp4' && pay.text === 'metin' && pay.calendar === entry.name && pay.record === 'rec1' && pay.metadata.description === 'd');
ok('…a metadata title wins, and no publishAt when it goes now', P.buildPublishPayload({ platform: 'y', stepTitle: 's', schedule: 'now', entry, metadata: { title: 'M' }, runId: 'r', workflowTitle: 'W' }).title === 'M'
    && !('publishAt' in P.buildPublishPayload({ platform: 'y', stepTitle: 's', schedule: 'now', entry, runId: 'r', workflowTitle: 'W' })));
eq('the answer read fail-soft: url · id · when · scheduled; text is no result', [P.readPublishResult('{"url":"U","videoId":"V","published_at":"T"}'), P.readPublishResult('[{"link":"L","scheduled":true}]'), P.readPublishResult('ok')],
    [{ url: 'U', id: 'V', publishedAt: 'T' }, { url: 'L', scheduled: true }, {}]);
eq('the note: published with the url and time, or ready when the flow only scheduled it', [P.calendarPatchOf({ url: 'U' }, 'now', 'AT'), P.calendarPatchOf({}, 'planned', 'AT'), P.calendarPatchOf({ url: 'U', scheduled: true }, 'now', 'AT')],
    [{ status: 'published', url: 'U', publishedAt: 'AT' }, { status: 'ready' }, { status: 'ready', url: 'U' }]);
const item = { publishing: { pub_tags: 'x', status: '' } };
P.applyPublished(item, { platform: 'youtube', status: 'published', url: 'U', at: 'AT' });
eq('the record: publishing.{status, platform, pub_url, status_date} kept beside its other fields, published_at once out', item, { publishing: { pub_tags: 'x', status: 'published', platform: 'youtube', pub_url: 'U', status_date: 'AT' }, published_at: 'AT' });

/* ---------- the runtime: a mock n8n end to end ---------- */
(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-pub-'));
    const cal = path.join(tmp, 'CONTENT');
    const note = K.addEntry(cal, { title: 'Kahve: 3 hata', date: '2026-10-01', startTime: '18:00', platform: 'youtube', record: 'rec1', body: 'Notum.' });
    const got = [];
    let answer = '{"url":"https://youtu.be/xyz","id":"xyz"}';
    const server = http.createServer((req, res) => { let b = ''; req.on('data', c => b += c).on('end', () => { got.push(JSON.parse(b)); res.setHeader('Content-Type', 'application/json'); res.end(answer); }); });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const url = 'http://127.0.0.1:' + server.address().port + '/webhook/publish';
    const recorded = [];
    let yes = true;
    const { TaskManager } = require(path.join(ROOT, 'out/core/tasks.js'));
    const mgr = new TaskManager(path.join(tmp, 'c.json'), () => [], () => false, () => '', {
        contentCalendarDir: () => cal, publishApproval: () => 'ask', confirmApproval: async () => yes,
        recordPublished: async r => { recorded.push(r); return `Record ${r.id}: publishing.status ${r.status}`; }
    });
    const settle = async runId => {
        let t;
        for (let i = 0; i < 300; i++) { await new Promise(r => setTimeout(r, 10)); t = mgr.tasks.find(x => x.workflowRunId === runId); if (t && t.status !== 'running') { break; } }
        return t;
    };
    const flow = (publish, title) => mgr.addWorkflow(title, [{ id: 'p', agentId: '', agentName: 'publish', title: 'Yayınla', prompt: '', mode: 'headless', publish }],
        [{ name: 'note', type: 'text' }, { name: 'desc', type: 'text' }]);
    try {
        const t1 = await settle(mgr.runWorkflow(flow({ platform: 'youtube', url, entry: '{input.note}', body: '{"description": "{input.desc}"}', approval: 'auto' }, 'Yayın'),
            { inputs: { note: 'Kahve: 3 hata', desc: 'Onun "en iyi" üç hatası' } }));
        const sent = got[0] || {};
        ok('‼️ the mock n8n got one JSON publish: platform, the note, its record, the metadata filled inside its values', got.length === 1 && sent.platform === 'youtube'
            && sent.calendar === note.name && sent.record === 'rec1' && sent.metadata.description === 'Onun "en iyi" üç hatası');
        const after = K.readCalendar(cal)[0];
        const text = fs.readFileSync(note.file, 'utf8');
        ok('‼️ the calendar note is now published with the URL, completed ticked, the user\'s text kept', t1.status === 'done' && after.status === 'published'
            && after.url === 'https://youtu.be/xyz' && !!after.publishedAt && /completed: true/.test(text) && /Notum\./.test(text));
        ok('the media record was told, and the archive says so', recorded.length === 1 && recorded[0].id === 'rec1' && recorded[0].status === 'published' && recorded[0].url === 'https://youtu.be/xyz'
            && /Record rec1: publishing\.status published/.test(fs.readFileSync(t1.outputFile, 'utf8')));

        const t2 = await settle(mgr.runWorkflow(flow({ platform: 'instagram', url, approval: 'never' }, 'Prova'), { inputs: {} }));
        ok('approval never = a rehearsal: done, the payload recorded, nothing sent', t2.status === 'done' && got.length === 1 && /"rehearsal": true/.test(fs.readFileSync(t2.outputFile, 'utf8')));

        yes = false;
        const t3 = await settle(mgr.runWorkflow(flow({ platform: 'tiktok', url }, 'Sor'), { inputs: {} }));
        ok('ask (Farm Settings) and a no: failed, nothing sent', t3.status === 'failed' && got.length === 1 && /Not approved/.test(fs.readFileSync(t3.outputFile, 'utf8')));
        yes = true;

        K.addEntry(cal, { title: 'Planlı', date: '2026-10-05', startTime: '09:30', platform: 'youtube' });
        answer = '{"scheduled":true}';
        const t4 = await settle(mgr.runWorkflow(flow({ platform: 'youtube', url, entry: 'Planlı', schedule: 'planned', approval: 'auto' }, 'Planlı'), { inputs: {} }));
        ok('planned: publishAt from the note, and a scheduled answer leaves the note ready', t4.status === 'done' && got[1].publishAt === new Date(2026, 9, 5, 9, 30).toISOString()
            && K.findEntry(K.readCalendar(cal), 'Planlı').status === 'ready');

        const t5 = await settle(mgr.runWorkflow(flow({ platform: 'youtube', url, entry: 'yok', approval: 'auto' }, 'Yok'), { inputs: {} }));
        ok('a note that is not in the calendar fails the step before anything is sent', t5.status === 'failed' && got.length === 2);
    } finally {
        mgr.dispose();
        server.close();
        fs.rmSync(tmp, { recursive: true, force: true });
    }

    /* ---------- the surfaces ---------- */
    const page = fs.readFileSync(path.join(ROOT, 'media/tasksPage.js'), 'utf8');
    const base = fs.readFileSync(path.join(ROOT, 'src/panels/base.ts'), 'utf8');
    const ext = fs.readFileSync(path.join(ROOT, 'src/extension.ts'), 'utf8');
    ok('the step card offers publish and draws, reads, checks and wires its row', /id: 'publish', icon:/.test(page) && /window\.AFPublish\.row\(s, C, DATA\)/.test(page)
        && /window\.AFPublish\.read\(s, g\)/.test(page) && /window\.AFPublish\.error\(s\)/.test(page) && /window\.AFPublish\.wire\(byId, readStep\)/.test(page) && /afPublish\.js/.test(base));
    ok('workflows.add refuses a bad publish and says what steps[].publish takes', /publishRefusal\(raw\.publish\)/.test(ext) && /steps\[\]\.publish \{platform, url/.test(ext));
    console.log(`test_publish_step: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
