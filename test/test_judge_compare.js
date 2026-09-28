// M-62 — an edit's judge sees the source too: which source, staged where, asked what.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const J = require(path.join(ROOT, 'out/core/judgeCompare.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-jc-'));
const f = (name, body = 'x') => { const p = path.join(tmp, name); fs.writeFileSync(p, body); return p; };
const card = f('card.mp4', 'SOURCE');
const prev = f('prev.png', 'PREV');
const out = f('out.mp4', 'RESULT');
const notes = f('notes.txt');

{
    const metas = [
        { taskId: 'p1', assetFiles: [prev], assetUrls: ['https://cdn/x/prev.png'] },
        { taskId: 'self', assetFiles: [out], assetUrls: ['https://cdn/x/out.mp4'] },
        { taskId: 'p2', assetFiles: [path.join(tmp, 'gone.mp4')], assetUrls: ['https://cdn/x/gone.mp4'] }
    ];
    const input = JSON.stringify({ video_url: 'https://fal.media/up/card.mp4', image_url: 'https://cdn/x/prev.png', ref: 'https://cdn/x/out.mp4 https://cdn/x/gone.mp4' });
    const s = J.judgeSources(input, [{ path: card }, { path: notes }], metas, 'self');
    ok('‼️ an uploaded local input is the source', s[0] === card);
    ok('…and an earlier step\'s asset the input names by URL', s.includes(prev));
    ok('…never the step\'s own output, a missing file, or something a judge cannot look at', !s.includes(out) && s.length === 2);
    ok('no source found = nothing to compare (the result is judged alone, as before)', J.judgeSources('{"prompt":"a cat"}', undefined, metas, 'self').length === 0);
    ok('at most two sources ride along', J.judgeSources(input, [{ path: card }, { path: f('b.png') }, { path: f('c.png') }], metas, 'self').length === 2);
}

{
    const st = J.stageComparison(out, [card]);
    ok('‼️ the judge folder holds the result as after and the source as before, copied, not moved',
        fs.readFileSync(path.join(st.dir, 'after.mp4'), 'utf8') === 'RESULT' && st.before[0] === 'before.mp4'
        && fs.readFileSync(path.join(st.dir, 'before.mp4'), 'utf8') === 'SOURCE' && fs.existsSync(card) && fs.existsSync(out));
    ok('…outside the user\'s folders', st.dir.startsWith(os.tmpdir()) && path.basename(st.dir).startsWith('af-judge-'));
    st.cleanup();
    ok('…and gone after the verdict', !fs.existsSync(st.dir));
    const two = J.stageComparison(out, [card, prev]);
    ok('two sources are numbered', two.before.join(',') === 'before-1.mp4,before-2.png');
    two.cleanup();
}

{
    const p = J.compareJudgePrompt('after.mp4', ['before.mp4'], 'only the sky is purple', true);
    ok('the question names both files and the criteria', p.includes('"before.mp4" (ÖNCE)') && p.includes('"after.mp4" (SONRA)') && p.includes('ÖLÇÜT: only the sky is purple'));
    ok('‼️ what was already in the source is not a change', /Kaynakta zaten bulunan/.test(p));
    ok('the verdict line is the same contract as the lone judge', /PASS, FAIL ya da FAIL-METHOD/.test(p));
    ok('Read is named only for an engine that opens files with it', !J.compareJudgePrompt('a', ['b'], 'c', false).includes('Read aracıyla'));
    ok('compare is auto unless set to never', J.normalizeJudgeCompare(undefined) === 'auto' && J.normalizeJudgeCompare('x') === 'auto' && J.normalizeJudgeCompare('never') === 'never');
}

{
    const src = fs.readFileSync(path.join(ROOT, 'src/core/tasks.ts'), 'utf8');
    ok('the media verify hands the sources to the vision judge (both the lone and the candidate path)',
        (src.match(/this\.runVisionJudge\(.*, sj, sources\)/g) || []).length === 2);
    ok('…and never when judge.compare is never', /normalizeJudgeCompare\(this\.opts\.judgeCompare\?\.\(\)\) === 'never' \? \[\]/.test(src));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
