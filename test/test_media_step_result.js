// M-55 — a per-second media model is billed on what it made: a price rule for Gemini Omni Flash, and a measured length when the answer names none.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const M = require(path.join(ROOT, 'out/core/media.js'));
const B = require(path.join(ROOT, 'out/core/mediaStepResult.js'));

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL: ' + name); } };
const near = (a, b) => Math.abs(a - b) < 1e-9;

(async () => {
    const rules = M.DEFAULT_MEDIA_PRICING;
    const omni = 'google/gemini-omni-flash/v1.1/edit';

    ok('Gemini Omni Flash has a per-second price rule', M.priceRuleFor(omni, rules)?.per === 'second');
    ok('its image-to-video endpoint is not caught by the gemini image rule', M.priceRuleFor('google/gemini-omni-flash/v1.1/image-to-video', rules)?.match === 'gemini-omni');
    ok('nano-banana still bills per image', M.priceRuleFor('fal-ai/nano-banana/edit', rules)?.per === 'image');

    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const shipped = [].concat(pkg.contributes.configuration).flatMap(c => Object.entries(c.properties || {}))
        .find(([k]) => k === 'agentFarm.mediaPricing')?.[1]?.default;
    ok('the setting default is the code default, rule for rule', JSON.stringify(shipped) === JSON.stringify(rules));

    const measured = {};
    const lens = { 'a.mp4': 10, 'b.mp4': 4.2, 'c.png': 99 };
    const len = async f => { measured[f] = (measured[f] || 0) + 1; return lens[f]; };

    ok('‼️ an answer with only a file is billed on the measured length (10 s = $1.30), never a guessed 5 s',
        near(await B.billMedia(omni, { video: { url: 'u' } }, rules, ['a.mp4'], len), 1.3));
    ok('several produced clips are summed', near(await B.billMedia(omni, { video: { url: 'u' } }, rules, ['a.mp4', 'b.mp4'], len), 0.13 * 14.2));
    ok('a still image among them is not measured', !measured['c.png'] && near(await B.billMedia(omni, {}, rules, ['c.png', 'a.mp4'], len), 1.3) && !measured['c.png']);

    const before = measured['a.mp4'];
    ok('a duration in the answer wins and nothing is measured',
        near(await B.billMedia(omni, { video: { url: 'u', duration: 8 } }, rules, ['a.mp4'], len), 0.13 * 8) && measured['a.mp4'] === before);
    ok('an image model is never measured', near(await B.billMedia('fal-ai/flux/dev', { images: [1, 2] }, rules, ['a.mp4'], len), 0.05) && measured['a.mp4'] === before);
    ok('an unpriced model costs 0 and is never measured', (await B.billMedia('fal-ai/unknown', {}, rules, ['a.mp4'], len)) === 0 && measured['a.mp4'] === before);
    ok('nothing measurable falls back to the 5 s estimate', near(await B.billMedia(omni, {}, rules, ['a.mp4'], async () => undefined), 0.65));
    ok('a measurer that throws falls back too', near(await B.billMedia(omni, {}, rules, ['a.mp4'], async () => { throw new Error('no ffmpeg'); }), 0.65));
    ok('estimateMediaCost alone keeps its old answer', near(M.estimateMediaCost('fal-ai/kling-video', {}, rules), 0.5));

    const src = fs.readFileSync(path.join(ROOT, 'src/core/tasks.ts'), 'utf8');
    ok('the media step bills through billMedia with the files it downloaded', /billMedia\(info\.model, result\.response,[\s\S]{0,120}assets, f => mediaDuration\(f\)\)/.test(src));

    /* ---------- what a media step hands on, and a files box reading a for-each ---------- */
    const out = B.withOutputs({ video: { url: 'u' } }, ['D:\\o\\a.mp4']);
    ok('the answer keeps its own keys and gains the local files as outputs', out.video.url === 'u' && out.outputs[0] === 'D:\\o\\a.mp4');
    ok('an answer that is not an object is kept beside them', JSON.stringify(B.withOutputs([1], ['f'])) === '{"response":[1],"outputs":["f"]}');
    const T = require(path.join(ROOT, 'out/core/toolCall.js'));
    const fill = files => T.fillTool({ recipe: 'concat', params: { files } }, s => s).params.files;
    const fanIn = JSON.stringify([{ index: 0, status: 'done', json: { outputs: ['D:\\e\\1.mp4'] } }, { index: 1, status: 'done', json: { outputs: ['D:\\e\\2.mp4'] } }]);
    ok('‼️ a for-each fan-in in a files box is each branch\'s file, in order', JSON.stringify(fill(fanIn)) === JSON.stringify(['D:\\e\\1.mp4', 'D:\\e\\2.mp4']));
    ok('a list of paths stays a list of paths', JSON.stringify(fill('["a.mp4","b.mp4"]')) === '["a.mp4","b.mp4"]');
    const D0 = { outDir: 'D:\\o', overwrite: 'never' };
    const holed = JSON.stringify([{ index: 0, status: 'done', json: { outputs: ['a.mp4'] } }, { index: 1, status: 'failed', reason: 'judge: FAIL' }]);
    const e1 = T.toolCall({ recipe: 'concat', params: { files: fill(holed) } }, D0);
    ok('‼️ a failed branch is a hole: the join is refused by name, never closed short', /files: part 2 failed \(judge: FAIL\) — joining the rest would leave a gap/.test(e1.error || ''));
    ok('a branch with no file is refused too', /part 1 produced no file/.test(T.toolCall({ recipe: 'concat', params: { files: fill('[{"index":0,"status":"done","json":{}}]') } }, D0).error || ''));

    /* ---------- the real chain: split → for-each media edit → join, through the task manager ---------- */
    const os = require('os'), http = require('http'), Module = require('module');
    const fakeVscode = {
        EventEmitter: class { constructor() { this.c = []; } get event() { return cb => { this.c.push(cb); return { dispose() { } }; }; } fire(v) { this.c.forEach(cb => cb(v)); } dispose() { } },
        window: { showInformationMessage: () => Promise.resolve(), showWarningMessage: () => Promise.resolve(), createTerminal: () => ({ show() { }, sendText() { }, dispose() { } }), onDidCloseTerminal: () => ({ dispose() { } }) }
    };
    const origLoad = Module._load;
    Module._load = function (r, p, m) { return r === 'vscode' ? fakeVscode : origLoad.call(this, r, p, m); };
    const { TaskManager } = require(path.join(ROOT, 'out/core/tasks.js'));
    let base = '', n = 0;
    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', c => body += c).on('end', () => {
            const send = (code, v) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(v)); };
            if (req.method === 'POST' && req.url.startsWith('/fal-ai/')) {
                const id = 'rq' + (++n) + (body.includes('p2') ? 'b' : 'a');
                return send(200, { request_id: id, status_url: `${base}/q/${id}/status`, response_url: `${base}/q/${id}` });
            }
            const m = /^\/q\/(rq\d+([ab]))(\/status)?$/.exec(req.url);
            if (m && m[3]) { return send(200, { status: 'COMPLETED' }); }
            if (m) { return send(200, { video: { url: `${base}/v-${m[2]}.mp4` } }); }
            if (/^\/v-[ab]\.mp4$/.test(req.url)) { res.setHeader('Content-Type', 'video/mp4'); return res.end('EDITED-' + req.url); }
            send(404, {});
        });
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    base = 'http://127.0.0.1:' + server.address().port;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-mstep-'));
    const calls = [];
    const mgr = new TaskManager(path.join(tmp, 'c.json'), () => [], () => false, () => '', {
        quotaCheck: () => 'hold', mediaAuth: () => 'Key K', mediaBaseUrl: () => base, mediaPollMs: () => 5,
        mediaPricing: () => [{ match: 'edit-test', usd: 0.5, per: 'request' }],
        toolSettings: () => ({ outDir: path.join(tmp, 'o'), overwrite: 'suffix' }),
        runTool: async c => {
            calls.push(c);
            if (c.recipe === 'split') { return { ok: true, recipe: 'split', outputs: [`${base}/p1.mp4`, `${base}/p2.mp4`], runs: 2, ms: 1 }; }
            return { ok: true, recipe: c.recipe, outputs: [path.join(tmp, 'joined.mp4')], runs: 1, ms: 1 };
        }
    });
    try {
        const w = mgr.addWorkflow('34 sn dilim', [
            { id: 'split', agentId: '', agentName: 'tool', title: 'Böl', prompt: '', mode: 'headless', tool: { recipe: 'split', input: '{input.clip}' } },
            { id: 'edit', agentId: '', agentName: 'media', title: 'Düzenle', prompt: '', mode: 'headless', forEach: { list: '{steps.split.json.outputs}', concurrency: 2 }, media: { model: 'fal-ai/edit-test', input: '{"video_url":"{item}"}' } },
            { id: 'join', agentId: '', agentName: 'tool', title: 'Birleştir', prompt: '', mode: 'headless', tool: { recipe: 'concat', params: { files: '{steps.edit.json.items}' } } }
        ]);
        w.inputs = [{ name: 'clip', type: 'file' }];
        const runId = mgr.runWorkflow(w, { inputs: { clip: path.join(tmp, 'clip.mp4') } });
        for (let i = 0; i < 200 && calls.length < 2; i++) { await new Promise(r => setTimeout(r, 10)); }
        const join = calls.find(c => c.recipe === 'concat');
        const files = join ? join.params.files : [];
        ok('‼️ the join was handed the two EDITED files on this computer, in part order', files.length === 2 && files.every(f => fs.existsSync(f))
            && fs.readFileSync(files[0], 'utf8') === 'EDITED-/v-a.mp4' && fs.readFileSync(files[1], 'utf8') === 'EDITED-/v-b.mp4');
        await new Promise(r => setTimeout(r, 50));
        const st = mgr.workflowRunState(runId);
        ok('‼️ the media spend reaches the run: the run total and the board ({run.cost}) count both parts', Math.abs((st && st.costUSD) - 1) < 1e-9
            && Math.abs(mgr.runRecords.get(runId).board.steps.edit.costUSD - 1) < 1e-9);

        calls.length = 0;
        w.steps[1].forEach.budgetUSD = 0.4;
        const run2 = mgr.runWorkflow(w, { inputs: { clip: path.join(tmp, 'clip.mp4') } });
        let joinTask;
        for (let i = 0; i < 200 && !(joinTask && joinTask.status !== 'running' && joinTask.status !== 'queued'); i++) {
            await new Promise(r => setTimeout(r, 10));
            joinTask = mgr.tasks.find(t => t.workflowRunId === run2 && t.stepIndex === 2);
        }
        const said = joinTask && joinTask.outputFile && fs.existsSync(joinTask.outputFile) ? fs.readFileSync(joinTask.outputFile, 'utf8') : '';
        ok('‼️ a part over its budget fails on its MEDIA spend, and the join refuses the hole by name', !calls.some(c => c.recipe === 'concat')
            && /part 1 failed \(spent \$0\.50 of its \$0\.40 budget\)/.test(said));
    } finally {
        mgr.dispose();
        server.closeAllConnections();
        await new Promise(r => server.close(r));
        await new Promise(r => setTimeout(r, 50));
        fs.rmSync(tmp, { recursive: true, force: true });
    }

    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
