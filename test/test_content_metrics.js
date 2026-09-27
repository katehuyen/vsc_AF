// M-52 — analytics feedback: a metrics step sends the calendar's published notes to a
// connection (a mock n8n webhook), files the numbers onto the media records and the
// performance snapshot, and the "how similar published content performed" block reaches
// a step's {performance} and the supervisor's brief (src/core/contentMetrics.ts).
// The acceptance: a mock metrics flow writes to the record and shows in the brief.
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
const M = require(path.join(ROOT, 'out/core/contentMetrics.js'));
const K = require(path.join(ROOT, 'out/core/contentCalendar.js'));
const B = require(path.join(ROOT, 'out/core/supervisorBrief.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, a, b) => { const s = JSON.stringify(a) === JSON.stringify(b); ok(n, s); if (!s) { console.log('    got', JSON.stringify(a), 'want', JSON.stringify(b)); } };

/* ---------- the pure rules ---------- */
eq('refused by name', [M.metricsRefusal({ url: 'u' }), !!M.metricsRefusal({}), !!M.metricsRefusal({ url: 'u', days: 0 }), !!M.metricsRefusal({ url: 'u', fields: ['views', 'likez'] })], ['', true, true, true]);
eq('fields: built-in, Farm Settings, the step\'s own wins; 30 days unless said', [M.planMetrics({}).fields, M.planMetrics({}, ['likes']).fields, M.planMetrics({ fields: ['saves'] }, ['likes']).fields, M.planMetrics({ days: 7 }).days],
    [['views', 'watchSeconds', 'engagement'], ['likes'], ['saves'], 7]);
const NOW = Date.parse('2026-09-27T12:00:00Z');
const e = (name, o) => ({ file: name, name, title: name, date: '2026-09-20', platform: 'youtube', status: 'published', url: 'https://y/' + name, ...o });
eq('targets: published, with a URL, on the platform, inside the window', M.metricsTargets([e('a'), e('b', { status: 'planned' }), e('c', { url: undefined }), e('d', { platform: 'tiktok' }),
    e('f', { publishedAt: '2026-01-01T00:00:00Z' })], 'YouTube', 30, NOW).map(x => x.name), ['a']);
eq('the answer read fail-soft: aliases, a nested metrics object, a percent rate, engagement worked out; text is no rows', [
    M.readMetrics('[{"url":"U","view_count":1000,"likes":30,"comments":10,"completion_rate":45}]'), M.readMetrics('{"items":[{"record":"r","metrics":{"viewCount":"50","engagementRate":0.2}}]}'), M.readMetrics('ok')],
    [[{ ref: { url: 'U' }, metrics: { views: 1000, completion: 0.45, likes: 30, comments: 10, engagement: 0.04 } }], [{ ref: { record: 'r' }, metrics: { views: 50, engagement: 0.2 } }], []]);
const item = { analytics: { save_count: 3 }, marketing: { virality_score: 7 } };
M.applyMetrics(item, { views: 10, watchSeconds: 5, engagement: 0.123456 });
eq('the record: analytics.* and marketing.engagement_rate, beside its other fields', item, { analytics: { save_count: 3, view_count: 10, avg_view_duration_seconds: 5 }, marketing: { virality_score: 7, engagement_rate: 0.1235 } });
eq('words fold case and Turkish letters', [...M.wordsOf('KAHVE İstanbul ısı ile')], ['kahve', 'istanbul', 'isi']);
const rows = [{ key: '1', title: 'Kahve: 3 hata', platform: 'youtube', metrics: { views: 12400, engagement: 0.05 }, pulledAt: 'x' },
    { key: '2', title: 'Çay demleme', platform: 'tiktok', topic: 'çay', metrics: { views: 900 }, pulledAt: 'x' }];
const sim = M.performanceSummary(rows, 'bir kahve videosu', ['views', 'engagement']);
ok('the summary: the similar one first with its numbers, the averages beside', /How similar published content performed \(1 of 2/.test(sim) && /"Kahve: 3 hata" \(youtube\): 12,400 views · 5\.0% engagement/.test(sim)
    && /Average of everything measured: 6,650 views/.test(sim) && !/Çay/.test(sim));
ok('…nothing similar = the best performers; no rows = nothing', /the best performers \(2 measured\)/.test(M.performanceSummary(rows, 'bisiklet', ['views'])) && M.performanceSummary([], 'x', ['views']) === '');
const brief = B.buildBrief({ workflow: 'W', costUSD: 0, stepIds: ['a'], limits: { allowed: ['proceed'], maxRetriesPerStep: 1, maxInsert: 1, insertKinds: ['agent'], minConfidence: 0.5 }, performance: sim });
ok('the supervisor\'s brief carries the block after the inputs, before the steps', brief.indexOf('How similar published content') > 0 && brief.indexOf('How similar published content') < brief.indexOf('## Steps so far'));

/* ---------- the runtime: a mock n8n end to end ---------- */
(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-metrics-'));
    const cal = path.join(tmp, 'CONTENT');
    const recent = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const n1 = K.addEntry(cal, { title: 'Kahve: 3 hata', date: '2026-09-20', platform: 'youtube', status: 'published', record: 'rec1' });
    K.updateEntry(n1.file, { url: 'https://youtu.be/k1', publishedAt: recent });
    const n2 = K.addEntry(cal, { title: 'Çay demleme sırrı', date: '2026-09-21', platform: 'tiktok', status: 'published', record: 'rec2' });
    K.updateEntry(n2.file, { url: 'https://tiktok.com/c2', publishedAt: recent });
    K.addEntry(cal, { title: 'Planlı video', date: '2026-10-05', platform: 'youtube' });
    const got = [], hooks = [];
    let answer = JSON.stringify([{ url: 'https://youtu.be/k1', views: 12400, avg_view_duration_seconds: 38, likes: 500, comments: 40, shares: 60 },
        { record: 'rec2', metrics: { viewCount: 900, engagementRate: 2.5 } }, { url: 'https://elsewhere/x', views: 1 }]);
    const server = http.createServer((req, res) => {
        let b = '';
        req.on('data', c => b += c).on('end', () => {
            res.setHeader('Content-Type', 'application/json');
            if (req.url === '/metrics') { got.push(JSON.parse(b)); res.end(answer); } else { hooks.push(JSON.parse(b)); res.end('{}'); }
        });
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + server.address().port;
    const snap = path.join(tmp, 'content-performance.json');
    const recorded = [], prompts = [];
    const { TaskManager } = require(path.join(ROOT, 'out/core/tasks.js'));
    const mgr = new TaskManager(path.join(tmp, 'c.json'), () => [], () => false, () => '', {
        contentCalendarDir: () => cal, metricsFields: () => [], performanceFile: () => snap,
        recordMetrics: async (id, m) => { recorded.push({ id, m }); return { line: `Record ${id}: analytics updated`, topic: id === 'rec1' ? 'espresso' : undefined }; },
        performance: q => M.performanceSummary(M.loadRows(snap), q, ['views', 'watchSeconds', 'engagement']),
        quotaCheck: () => 'hold', superviseTurn: async p => { prompts.push(p); return { out: JSON.stringify({ decision: 'proceed', confidence: 0.9, why: 'ok' }) }; }
    });
    const settle = async (runId, n = 1) => {
        let ts = [];
        for (let i = 0; i < 400; i++) {
            await new Promise(r => setTimeout(r, 10));
            ts = mgr.tasks.filter(x => x.workflowRunId === runId);
            if (ts.length >= n && ts.every(t => t.status !== 'running' && t.status !== 'queued')) { break; }
        }
        return ts;
    };
    const step = (id, o) => ({ id, agentId: '', agentName: id, title: id, prompt: '', mode: 'headless', ...o });
    try {
        const w1 = mgr.addWorkflow('Kahve videosu', [step('m', { metrics: { url: base + '/metrics' } }), step('c', { agentName: 'checkpoint', checkpoint: { message: 'devam mı?' } })]);
        const [t1] = await settle(mgr.runWorkflow(w1, { inputs: {} }), 1);
        for (let i = 0; i < 200 && !prompts.length; i++) { await new Promise(r => setTimeout(r, 10)); }
        const sent = got[0] || { items: [] };
        ok('‼️ the mock n8n got the published notes only — the planned one stays out — with the fields to read', got.length === 1 && sent.items.length === 2
            && sent.items.every(x => x.url && x.record) && JSON.stringify(sent.fields) === '["views","watchSeconds","engagement"]');
        const r1 = recorded.find(r => r.id === 'rec1'), r2 = recorded.find(r => r.id === 'rec2');
        ok('‼️ each answer row landed on its media record — by url and by record — engagement worked out or read as a percent', t1.status === 'done' && recorded.length === 2
            && r1.m.views === 12400 && Math.abs(r1.m.engagement - 600 / 12400) < 1e-9 && r2.m.views === 900 && r2.m.engagement === 0.025);
        const archive = fs.readFileSync(t1.outputFile, 'utf8');
        ok('the archive says what happened: the stray row skipped, the snapshot, 2 of 2', /names nothing that was asked \(https:\/\/elsewhere\/x\)/.test(archive) && /Performance snapshot: 2 updated/.test(archive) && /2 of 2 measured/.test(archive));
        ok('the snapshot keeps the record\'s topic', M.loadRows(snap).length === 2 && M.loadRows(snap).find(r => r.record === 'rec1').topic === 'espresso');
        ok('‼️ the supervisor\'s brief shows how similar published content performed', prompts.length >= 1 && /How similar published content performed/.test(prompts[0])
            && /"Kahve: 3 hata" \(youtube, [\d-]+\): 12,400 views · 38s average watched · 4\.8% engagement/.test(prompts[0]));

        const w2 = mgr.addWorkflow('Fikir', [step('h', { webhook: { url: base + '/hook', body: '{"brief": "Fikir ver. {performance}"}' } })], [{ name: 'topic', type: 'text' }]);
        await settle(mgr.runWorkflow(w2, { inputs: { topic: 'espresso' } }), 1);
        ok('‼️ a step\'s {performance} is filled for its query (the topic matched the record\'s), quotes kept valid JSON', hooks.length === 1
            && /How similar published content performed \(1 of 2/.test(hooks[0].brief) && /"Kahve: 3 hata"/.test(hooks[0].brief) && !/Çay/.test(hooks[0].brief));

        answer = 'nonsense';
        const w3 = mgr.addWorkflow('Bozuk', [step('m', { metrics: { url: base + '/metrics', platform: 'tiktok' } })]);
        const [t3] = await settle(mgr.runWorkflow(w3, { inputs: {} }), 1);
        ok('an answer with no numbers fails the step; the platform narrows what is sent; the snapshot is untouched', t3.status === 'failed' && got[1].items.length === 1
            && got[1].items[0].platform === 'tiktok' && M.loadRows(snap).length === 2);
    } finally {
        mgr.dispose();
        server.closeAllConnections();
        await new Promise(r => server.close(r));
        fs.rmSync(tmp, { recursive: true, force: true });
    }

    /* ---------- the surfaces ---------- */
    const page = fs.readFileSync(path.join(ROOT, 'media/tasksPage.js'), 'utf8');
    const baseTs = fs.readFileSync(path.join(ROOT, 'src/panels/base.ts'), 'utf8');
    const ext = fs.readFileSync(path.join(ROOT, 'src/extension.ts'), 'utf8');
    const recipes = fs.readFileSync(path.join(ROOT, 'src/core/contentRecipes.ts'), 'utf8');
    ok('the step card offers metrics and draws, reads, checks and wires its row', /id: 'metrics', icon:/.test(page) && /window\.AFMetrics\.row\(s, C, DATA\)/.test(page)
        && /window\.AFMetrics\.read\(s, g\)/.test(page) && /window\.AFMetrics\.error\(s\)/.test(page) && /window\.AFMetrics\.wire\(byId, readStep\)/.test(page) && /afMetrics\.js/.test(baseTs));
    ok('workflows.add refuses a bad metrics step and says what steps[].metrics takes; performance.summary is a bridge op', /metricsRefusal\(raw\.metrics\)/.test(ext)
        && /steps\[\]\.metrics \{url/.test(ext) && /op: 'performance\.summary'/.test(ext));
    ok('the content recipe\'s idea and script steps ask for {performance}', (recipes.match(/\\n\\n\{performance\}\\n\\n/g) || []).length === 2);
    console.log(`test_content_metrics: ${pass} passed, ${fail} failed`);
    // an exit() here trips a libuv assertion on Windows while fetch's sockets close; the natural end does not
    process.exitCode = fail ? 1 : 0;
})();
