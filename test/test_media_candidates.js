// A-27 — parallel-cheap: a media step makes N candidates at once and its vision check picks one (src/core/mediaCandidates.ts).
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
const C = require(path.join(ROOT, 'out/core/mediaCandidates.js'));
const B = require(path.join(ROOT, 'out/core/mediaStepResult.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, a, b) => { const s = JSON.stringify(a) === JSON.stringify(b); ok(n, s); if (!s) { console.log('    got', JSON.stringify(a), 'want', JSON.stringify(b)); } };

/* ---------- the pure rules ---------- */
eq('a step\'s own number 1-4; nothing, or a number the point refuses = the built-in 1', [undefined, '', 3, 4, 9, 0, 'x'].map(C.candidatesOf), [1, 1, 3, 4, 1, 1, 1]);
eq('refused by name unless a whole number 1-4', [C.candidatesRefusal(3), C.candidatesRefusal(''), !!C.candidatesRefusal(5), !!C.candidatesRefusal(2.5), !!C.candidatesRefusal('iki')], ['', '', true, true, true]);
const merged = C.mergeCandidates([{ ok: true, assetUrls: ['u1', 'u1b'], response: { a: 1 } }, { ok: false, error: 'kota', assetUrls: [] }, { ok: true, assetUrls: ['u3'], response: { a: 3 } }]);
eq('N answers as one: each good one\'s first asset, their answers side by side', merged, { ok: true, assetUrls: ['u1', 'u3'], response: { candidates: [{ a: 1 }, { a: 3 }], candidateUrls: ['u1', 'u3'] } });
ok('none good: the step fails saying so', /2 candidate\(s\), none made anything — kota/.test(C.mergeCandidates([{ ok: false, error: 'kota', assetUrls: [] }, { ok: false, assetUrls: [] }]).error));
eq('a candidate whose download failed drops out of the answers too', C.alignCandidates(merged.response, ['u3']), { candidates: [{ a: 3 }], candidateUrls: ['u3'] });
eq('a plain answer passes through', C.alignCandidates({ x: 1 }, ['u']), { x: 1 });
eq('the picked one hands on its own answer and file, as if alone', C.pickedBody({ candidates: [{ a: 1 }, { a: 3 }], outputs: ['f1', 'f3'] }, 1, 2), { a: 3, outputs: ['f3'], picked: { candidate: 2, of: 2 } });
const arch = '# T\n\n- Media model: m\n\n---\n\n{"old":1}\n\n---\nFinished: now · OK\n\nVision verify: x\n';
eq('the archive body is swapped, header and footer kept', C.withArchiveBody(arch, '{"new":1}'), '# T\n\n- Media model: m\n\n---\n\n{"new":1}\n\n---\nFinished: now · OK\n\nVision verify: x\n');

/* ---------- the runtime ---------- */
(async () => {
    const rules = [{ match: 'cheap-img', usd: 0.01, per: 'request' }];
    ok('‼️ N candidates are N calls: billed once each', Math.abs(await B.billMedia('fal-ai/cheap-img', { candidates: [{}, {}, {}], candidateUrls: ['a', 'b', 'c'] }, rules, [], async () => undefined) - 0.03) < 1e-9);

    const oneShot = require(path.join(ROOT, 'out/core/oneShot.js'));
    let verdicts = [];
    const judged = [];
    oneShot.execOneShot = async (o) => { judged.push(o.prompt.match(/["']([^"']+)["'] dosyas/)?.[1]); return { out: verdicts.shift() || 'PASS', error: '' }; };
    const { TaskManager } = require(path.join(ROOT, 'out/core/tasks.js'));
    let base = '', n = 0;
    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', c => body += c).on('end', () => {
            const send = (code, v) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(v)); };
            if (req.method === 'POST' && req.url.startsWith('/fal-ai/')) {
                const id = 'rq' + (++n);
                return send(200, { request_id: id, status_url: `${base}/q/${id}/status`, response_url: `${base}/q/${id}` });
            }
            const m = /^\/q\/(rq\d+)(\/status)?$/.exec(req.url);
            if (m && m[2]) { return send(200, { status: 'COMPLETED' }); }
            if (m) { return send(200, { images: [{ url: `${base}/img-${m[1]}.png` }], seed: m[1] }); }
            if (/^\/img-rq\d+\.png$/.test(req.url)) { res.setHeader('Content-Type', 'image/png'); return res.end('PNG' + req.url); }
            send(404, {});
        });
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    base = 'http://127.0.0.1:' + server.address().port;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-mcand-'));
    const mgr = new TaskManager(path.join(tmp, 'c.json'), () => [], () => false, () => '', {
        quotaCheck: () => 'hold', mediaAuth: () => 'Key K', mediaBaseUrl: () => base, mediaPollMs: () => 5, mediaPricing: () => rules
    });
    const settled = async (runId) => {
        let t;
        for (let i = 0; i < 300; i++) {
            await new Promise(r => setTimeout(r, 10));
            t = mgr.tasks.find(x => x.workflowRunId === runId);
            if (t && t.verified) { break; }
        }
        await new Promise(r => setTimeout(r, 30));
        return t;
    };
    try {
        const step = (candidates, retries) => [{ id: 'img', agentId: '', agentName: 'media', title: 'Kapak', prompt: '', mode: 'headless',
            media: { model: 'fal-ai/cheap-img', input: '{"prompt":"kapak"}', candidates }, verify: { criteria: 'Yazı okunur olsun', retries } }];
        const w = mgr.addWorkflow('Üç aday', step(3, 0));
        verdicts = ['FAIL bulanık', 'PASS net ve okunur'];
        const r1 = mgr.runWorkflow(w);
        const t1 = await settled(r1);
        const meta = JSON.parse(fs.readFileSync(path.join(mgr.outputsDir, t1.id + '.media.json'), 'utf8'));
        const body = JSON.parse(fs.readFileSync(t1.outputFile, 'utf8').split('\n---\n\n')[1].split('\n\n---\nFinished')[0]);
        ok('‼️ three made at once in ONE row, billed three times', mgr.tasks.filter(x => x.workflowRunId === r1).length === 1 && n === 3 && Math.abs(t1.mediaCost - 0.03) < 1e-9);
        ok('‼️ judged in order until the first PASS: two looks, the second picked', judged.length === 2 && t1.verified === 'pass' && t1.status === 'done');
        ok('the archive now hands on the picked one alone', body.picked.candidate === 2 && body.picked.of === 3 && body.outputs.length === 1 && body.outputs[0] === meta.assetFiles[0] && !body.candidates);
        ok('…whose file leads the gallery record', meta.assetFiles.length === 3 && path.basename(meta.assetFiles[0]) === path.basename(judged[1]));
        ok('the row and the run say what was picked', /Picked candidate 2 of 3: PASS net ve okunur/.test(fs.readFileSync(t1.outputFile, 'utf8'))
            && t1.judgeDecisions.some(d => d.kind === 'picked') && mgr.workflowRunState(r1).economy.picked === 1);

        judged.length = 0;
        verdicts = ['FAIL bulanık', 'FAIL yazı yok', 'FAIL renk yanlış'];
        const r2 = mgr.runWorkflow(mgr.addWorkflow('Hepsi kötü', step(3, 0)));
        const t2 = await settled(r2);
        ok('none passes: the step fails naming every candidate', judged.length === 3 && t2.verified === 'fail'
            && /candidate 1: FAIL bulanık \| candidate 2: FAIL yazı yok \| candidate 3: FAIL renk yanlış/.test(fs.readFileSync(t2.outputFile, 'utf8')));

        judged.length = 0; n = 0;
        verdicts = ['FAIL ne olursa'];
        const r3 = mgr.runWorkflow(mgr.addWorkflow('Tek', step(undefined, 0)));
        const t3 = await settled(r3);
        ok('one candidate (the built-in): one call, one look, as before', n === 1 && judged.length === 1 && t3.verified === 'fail');
    } finally {
        mgr.dispose();
        server.close();
        fs.rmSync(tmp, { recursive: true, force: true });
    }
    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
