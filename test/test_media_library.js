// X-417 — the media library of the local Airtable: <root>\media_<base>\<type>\<stage>\ (src/core/mediaLibrary.ts).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const L = require(path.join(ROOT, 'out/core/mediaLibrary.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, a, b) => { const s = JSON.stringify(a) === JSON.stringify(b); ok(n, s); if (!s) { console.log('    got', JSON.stringify(a), 'want', JSON.stringify(b)); } };

/* ---------- the user's words, as data ---------- */
eq('five stages, in the user\'s order', L.LIBRARY_STAGES, ['source', 'raw', 'semi', 'final', 'asset']);
ok('every stage says what it means', L.LIBRARY_STAGES.every(s => L.STAGE_MEANING[s] && L.STAGE_MEANING[s].length > 6));
eq('‼️ the default mapping the user chose', L.DEFAULT_STAGE,
    { input: 'source', candidate: 'semi', intermediate: 'semi', failed: 'raw', rejected: 'raw', final: 'final', unknown: 'raw' });
ok('‼️ no role reaches asset by default — that is a promotion', !Object.values(L.DEFAULT_STAGE).includes('asset'));
ok('‼️ no role reaches the waiting area', !Object.values(L.DEFAULT_STAGE).includes('all_in'));

/* ---------- type and stage ---------- */
eq('type from the extension', ['a.PNG', 'b.mov', 'c.m4a', 'd.webp', 'e.mkv', 'f.opus'].map(L.libraryType), ['image', 'video', 'audio', 'image', 'video', 'audio']);
eq('a document or an unknown has no place', [L.libraryType('x.pdf'), L.libraryType('x.zip'), L.libraryType('noext')], [undefined, undefined, undefined]);
ok('‼️ all_in is refused by name, with the reason', /the user's waiting area/.test(L.stageRefusal('all_in')) && /waiting area/.test(L.stageRefusal('ALL_IN')));
ok('an unknown stage names the real ones', /no stage "done" — source \| raw \| semi \| final \| asset/.test(L.stageRefusal('done')));
eq('a stage asked by name wins over the role', L.stageFor('failed', 'asset'), { stage: 'asset', from: 'asked by name' });
eq('no stage asked: the role\'s default, said', L.stageFor('failed'), { stage: 'raw', from: 'the default for a failed file' });
eq('no role either: unknown → raw (kept, never the waiting area)', L.stageFor(undefined).stage, 'raw');
ok('an unknown role names the real ones', /no role "winner"/.test(L.stageFor('winner').error));
ok('a base is a folder name', L.baseRefusal('stem') === '' && /not a base name/.test(L.baseRefusal('a\\b')) && /no base/.test(L.baseRefusal('  ')));

/* ---------- paths, pure ---------- */
const R1 = path.join('D:', 'zome', 'media'), R2 = path.join('E:', 'media');
const has = set => p => set.has(path.resolve(p).toLowerCase());
const S = (...ps) => new Set(ps.map(p => path.resolve(p).toLowerCase()));
eq('the root that already holds the base wins', L.libraryRoot([R2, R1], 'stem', has(S(path.join(R1, 'media_stem')))), R1);
eq('else the first root', L.libraryRoot([R2, R1], 'new', has(S())), R2);
eq('no root at all', L.libraryRoot([' ', ''], 'stem', has(S())), undefined);
const dir = L.libraryDir(R1, 'stem', 'video', 'semi');
eq('the layout', dir, path.join(R1, 'media_stem', 'video', 'semi'));
eq('its own name when free', L.libraryTarget(dir, path.join('C:', 'w', 'klip.mp4'), has(S())), path.join(dir, 'klip.mp4'));
eq('‼️ a taken name gets -2, then -3 — never overwritten',
    L.libraryTarget(dir, path.join('C:', 'w', 'klip.mp4'), has(S(path.join(dir, 'klip.mp4'), path.join(dir, 'klip-2.mp4')))), path.join(dir, 'klip-3.mp4'));
eq('a file already in its place stays itself', L.libraryTarget(dir, path.join(dir, 'klip.mp4'), has(S(path.join(dir, 'klip.mp4')))), path.join(dir, 'klip.mp4'));

let p = L.planLibrary({ roots: [R1], base: 'stem', file: path.join('C:', 'w', 'part_001.mp4'), role: 'intermediate', exists: has(S()) });
eq('a plan: base, type, stage, target', [p.base, p.type, p.stage, p.target], ['stem', 'video', 'semi', path.join(R1, 'media_stem', 'video', 'semi', 'part_001.mp4')]);
ok('…and why, one line per decision', p.why.length === 4 && /from the extension/.test(p.why[1]) && /the default for a intermediate file/.test(p.why[2]) && /its own name/.test(p.why[3]));
ok('a plan refuses the waiting area', /waiting area/.test(L.planLibrary({ roots: [R1], base: 'stem', file: 'C:\\a.png', stage: 'all_in', exists: has(S()) }).error));
ok('a plan refuses a non-media file', /not image, video or audio/.test(L.planLibrary({ roots: [R1], base: 'stem', file: 'C:\\a.pdf', exists: has(S()) }).error));
ok('a plan refuses no base', /no base/.test(L.planLibrary({ roots: [R1], base: '', file: 'C:\\a.png', exists: has(S()) }).error));
ok('a plan refuses no root', /no media root/.test(L.planLibrary({ roots: [], base: 'stem', file: 'C:\\a.png', exists: has(S()) }).error));

/* ---------- the move, on a real disk ---------- */
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'af-medialib-'));
try {
    const root = path.join(T, 'media');
    fs.mkdirSync(path.join(root, 'media_stem', 'image', 'raw'), { recursive: true });
    const work = path.join(T, 'work');
    fs.mkdirSync(work);
    const src = path.join(work, 'shot.png');
    fs.writeFileSync(src, 'one');
    const real = x => fs.existsSync(x);
    p = L.planLibrary({ roots: [root], base: 'stem', file: src, role: 'failed', exists: real });
    const now = L.fileInto(src, p);
    ok('the file moved into its stage folder', now === path.join(root, 'media_stem', 'image', 'raw', 'shot.png') && fs.existsSync(now) && !fs.existsSync(src));
    fs.writeFileSync(src, 'two');
    p = L.planLibrary({ roots: [root], base: 'stem', file: src, role: 'failed', exists: real });
    const second = L.fileInto(src, p);
    ok('‼️ a second file of the same name lands beside it; the first is untouched',
        path.basename(second) === 'shot-2.png' && fs.readFileSync(now, 'utf8') === 'one' && fs.readFileSync(second, 'utf8') === 'two');
    p = L.planLibrary({ roots: [root], base: 'stem', file: now, stage: 'raw', exists: real });
    ok('filing a file already in place moves nothing', p.inPlace && L.fileInto(now, p) === now && fs.existsSync(now));
    const src3 = path.join(work, 'clip.mp4');
    fs.writeFileSync(src3, 'v');
    p = L.planLibrary({ roots: [root], base: 'stem', file: src3, stage: 'final', exists: real });
    fs.mkdirSync(p.dir, { recursive: true });
    fs.writeFileSync(p.target, 'someone else');
    let threw = '';
    try { L.fileInto(src3, p); } catch (e) { threw = e.message; }
    ok('‼️ a target that appeared after the plan is never overwritten', /appeared meanwhile/.test(threw) && fs.readFileSync(p.target, 'utf8') === 'someone else' && fs.existsSync(src3));
    const info = L.libraryInfo([root, path.join(T, 'nope')], 'stem', d => fs.readdirSync(d));
    ok('the overview finds the base folders and survives a missing root', info.bases.length === 1 && info.bases[0].base === 'stem' && info.recordField === 'workflow.stage');
} finally {
    fs.rmSync(T, { recursive: true, force: true });
}

/* ---------- on the bridge ---------- */
const ext = fs.readFileSync(path.join(ROOT, 'src/extension.ts'), 'utf8');
const block = op => { const i = ext.indexOf("op: '" + op + "'"); return i < 0 ? '' : ext.slice(i, ext.indexOf('\n        },', i)); };
ok('‼️ media.library / .plan / .file are on the bridge, over the one core', /libraryInfo\(/.test(block('media.library')) && /planLibrary\(/.test(block('media.library.plan'))
    && /planLibrary\(/.test(block('media.library.file')) && /fileInto\(/.test(block('media.library.file')));
ok('…reading the module\'s own roots and default base', /mediaRoots\.map\(expandRoot\)/.test(block('media.library.plan')) && /defaultInstance/.test(block('media.library.file')));
ok('…and .file says it does not write the record', /does NOT write the Airtable record/.test(block('media.library.file')));

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
