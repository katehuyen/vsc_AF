// X-426 — the one-time sidecar backfill into the media library (src/core/mediaBackfill.ts, studio.library.backfill)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const B = require(path.join(ROOT, 'out/core/mediaBackfill.js'));
const { readMediaMetas } = require(path.join(ROOT, 'out/core/media.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-backfill-'));
const out = path.join(tmp, 'outputs');
const lib = path.join(tmp, 'lib');
const inLib = path.join(lib, 'media_TEST', 'image', 'final', 'f.png');
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(path.dirname(inLib), { recursive: true });
const o = n => path.join(out, n);
for (const n of ['a.png', 'b.png', 'c.png', 'd.mp4', 'g.png', 'h.png', 'e.txt']) { fs.writeFileSync(o(n), n); }
fs.writeFileSync(inLib, 'f');
const meta = (taskId, files, extra) => fs.writeFileSync(o(taskId + '.media.json'), JSON.stringify(Object.assign({ taskId, title: 'T ' + taskId, model: 'fal-ai/flux', input: '{"prompt":"a cat"}', assetFiles: files, estCost: 0.2, ts: 1 }, extra)));
meta('t1', [o('a.png'), o('b.png'), o('c.png')], { assetUrls: ['u/a', 'u/b', 'u/c'], rejectedUrls: ['u/b'], selectedUrls: ['u/c'] });
meta('t2', [o('d.mp4')], { source: 'external:watch', input: '' });
meta('t3', [o('gone.png'), o('e.txt'), inLib, o('g.png'), o('h.png')], {});

const records = [{ id: 'r1', media: { file_path: o('g.png') } }, { id: 'r2', fingerprint: 'sha256:H' }];
const calls = { record: [], decide: [] };
let down = '';
const deps = () => ({
    outputsDir: out, roots: [lib], metas: readMediaMetas(out), exists: p => fs.existsSync(p),
    list: async () => (down ? { down } : records),
    hash: async f => (path.basename(f) === 'h.png' ? 'sha256:H' : 'sha256:' + path.basename(f)),
    record: async r => {
        calls.record.push(r);
        let to = r.file;
        if (!r.inPlace) {
            const type = /\.mp4$/.test(r.file) ? 'video' : 'image';
            to = path.join(lib, 'media_TEST', type, r.stage, path.basename(r.file));
            fs.mkdirSync(path.dirname(to), { recursive: true });
            fs.renameSync(r.file, to);
        }
        const id = 'new_' + path.basename(r.file);
        records.push({ id, media: { file_path: to } });
        return { file: to, stage: r.stage, base: r.base, id };
    },
    decide: async (id, kind) => { calls.decide.push([id, kind]); }
});
const by = (r, n) => r.items.find(i => path.basename(i.file) === n);

(async () => {
    console.log('== the dry run ==');
    let r = await B.backfillLibrary('TEST', 'TR', false, deps());
    ok('every file counted by what would happen to it', JSON.stringify(r.counts) === JSON.stringify({ recorded: 2, file: 4, record: 1, missing: 1, skipped: 1 }));
    ok('‼️ nothing moved, nothing written', calls.record.length === 0 && fs.existsSync(o('a.png')) && r.dryRun === true && /^Dry run/.test(r.lines[0]));
    ok('a generation → semi, a drop → raw, a keep → semi, an external file → source',
        by(r, 'a.png').stage === 'semi' && by(r, 'b.png').stage === 'raw' && by(r, 'b.png').decision === 'dropped'
        && by(r, 'c.png').stage === 'semi' && by(r, 'c.png').decision === 'kept' && by(r, 'd.mp4').stage === 'source');
    ok('the target is named in the library', by(r, 'a.png').target === path.join(lib, 'media_TEST', 'image', 'semi', 'a.png'));
    ok('‼️ a file the base has — by path or by the same bytes — stays where it is', by(r, 'g.png').action === 'recorded' && by(r, 'g.png').id === 'r1' && by(r, 'h.png').id === 'r2');
    ok('one already in a stage folder with no record is recorded where it is', by(r, 'f.png').action === 'record' && by(r, 'f.png').stage === 'final');
    ok('a missing file and a non-media file are said, not failed', by(r, 'gone.png').action === 'missing' && by(r, 'e.txt').action === 'skipped');

    console.log('== apply ==');
    r = await B.backfillLibrary('TEST', 'TR', true, deps());
    ok('five files filed or recorded, never re-asking the engine to start', calls.record.length === 5 && calls.record.every(c => c.autoStart === 'never'));
    ok('the move is real, and the in-place one is not moved', !fs.existsSync(o('a.png')) && fs.existsSync(path.join(lib, 'media_TEST', 'image', 'semi', 'a.png'))
        && calls.record.find(c => c.file === inLib).inPlace === true);
    const t1 = JSON.parse(fs.readFileSync(o('t1.media.json'), 'utf8'));
    ok('‼️ the sidecar follows its file to the new path', t1.assetFiles[0] === path.join(lib, 'media_TEST', 'image', 'semi', 'a.png'));
    ok('the Studio decisions are written by the wall\'s writer', JSON.stringify(calls.decide) === JSON.stringify([['new_b.png', 'reject'], ['new_c.png', 'select']]));
    const ra = calls.record.find(c => /a\.png$/.test(c.file)).produced;
    ok('provenance: fal, the prompt out of its input, the cost shared, the task as its run',
        ra.origin === 'AI_generated' && ra.productionType === 'fal' && ra.prompt === 'a cat' && Math.abs(ra.costUsd - 0.2 / 3) < 1e-9 && ra.run.taskId === 't1' && ra.sequence === 1);
    ok('an external file is external, with no prompt', calls.record.find(c => /d\.mp4$/.test(c.file)).produced.origin === 'external');

    console.log('== the second run ==');
    r = await B.backfillLibrary('TEST', 'TR', true, deps());
    ok('‼️ finds nothing to do', r.counts.file === 0 && r.counts.record === 0 && calls.record.length === 5 && r.lines.some(l => /Nothing to do/.test(l)));

    console.log('== engine down ==');
    down = 'TEST is not running';
    r = await B.backfillLibrary('TEST', 'TR', true, deps());
    ok('nothing done, and why', r.down === down && r.items.length === 0 && calls.record.length === 5 && /not answering/.test(r.lines[0]));
    down = '';

    console.log('== where a file lies ==');
    ok('a stage folder of this base', B.stageInLibrary([lib], 'TEST', inLib) === 'final');
    ok('another base, the wrong type folder, or outside: none', B.stageInLibrary([lib], 'OTHER', inLib) === undefined
        && B.stageInLibrary([lib], 'TEST', path.join(lib, 'media_TEST', 'video', 'final', 'x.png')) === undefined && B.stageInLibrary([lib], 'TEST', o('x.png')) === undefined);

    console.log('== the bridge door ==');
    const { BridgeRegistry } = require(path.join(ROOT, 'out/core/bridge.js'));
    const { registerStudioLibraryOps } = require(path.join(ROOT, 'out/core/studioLibraryOps.js'));
    const reg = new BridgeRegistry();
    const seen = [];
    registerStudioLibraryOps(reg, { outputsDir: () => '', read: async () => ({}), edit: async () => ({}), backfill: async a => { seen.push(a); return { counts: {} }; } });
    const d0 = await reg.dispatch('studio.library.backfill', {});
    ok('‼️ a dry run unless apply is said', d0.ok && seen[0].apply === false && seen[0].start === false);
    await reg.dispatch('studio.library.backfill', { base: 'TEST', apply: true, autoStart: true });
    ok('base, apply and the start flag are handed on', seen[1].base === 'TEST' && seen[1].apply === true && seen[1].start === true);
    const d2 = await reg.dispatch('studio.library.backfill', { base: 'a/b' });
    ok('a base that is not a plain name is refused before it', !d2.ok && seen.length === 2);
    ok('the op is in the catalog', reg.catalog().some(x => x.op === 'studio.library.backfill'));

    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`\ntest_media_backfill: ${pass} passed, ${fail} failed`);
    process.exitCode = fail ? 1 : 0;
})();
