// X-425 — the Studio writes to the library (src/core/studioLibraryWrite.ts, studio.library.edit)
'use strict';
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const W = require(path.join(ROOT, 'out/core/studioLibraryWrite.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const AT = Date.parse('2026-09-27T10:00:00Z');
const rec = () => ({ id: 'm1', tags: ['a'], workflow: { stage: 'raw', rejection_count: 0, approval_chain: [] }, failure: { is_failed: false, reason: '' }, technical_quality: { human_quality_score: 0 }, completed_sections: {}, pipeline_history: [] });

(async () => {
    console.log('== what each decision writes ==');
    const r = W.applyStudioEdit(rec(), { kind: 'reject' }, AT);
    ok('reject: failed, "rejected in Studio", salvageable, counted, in the chain and the history',
        r.failure.is_failed === true && r.failure.reason === 'rejected in Studio' && r.failure.salvageable === true && r.workflow.rejection_count === 1
        && r.workflow.approval_chain[0].decision === 'rejected' && r.completed_sections.failure === true && r.pipeline_history[0].action === 'rejected');
    const s = W.applyStudioEdit(r, { kind: 'select' }, AT + 1);
    ok('select takes back a Studio rejection and joins the chain', s.failure.is_failed === false && s.workflow.approval_chain.length === 2 && s.workflow.approval_chain[1].decision === 'selected');
    const judged = W.applyStudioEdit(Object.assign(rec(), { failure: { is_failed: true, reason: 'judge FAIL: blurry' } }), { kind: 'select' }, AT);
    ok('‼️ select never clears a failure the Studio did not write (a judge FAIL stays)', judged.failure.is_failed === true && judged.failure.reason === 'judge FAIL: blurry');
    ok('tags replace, trimmed and once each', JSON.stringify(W.applyStudioEdit(rec(), { kind: 'tags', value: ' kedi, köpek ,kedi,' }, AT).tags) === JSON.stringify(['kedi', 'köpek']));
    ok('score lands on the human score, 0–1', W.applyStudioEdit(rec(), { kind: 'score', value: '85%' }, AT).technical_quality.human_quality_score === 0.85);
    const n = W.applyStudioEdit(rec(), { kind: 'note', value: 'renk soluk' }, AT);
    ok('‼️ a note is the review note, never the file\'s description', n.moderation.notes === 'renk soluk' && n.moderation.reviewed_by === W.STUDIO_BY && n.content === undefined);
    const r2 = W.applyStudioEdit(rec(), { kind: 'reject', reason: 'eller eridi' }, AT);
    ok('every write stamps the last action, a reason once', W.applyStudioEdit(rec(), { kind: 'reject' }, AT).workflow.last_action === 'rejected in Studio'
        && r2.workflow.last_action === 'rejected in Studio — eller eridi' && r2.failure.reason === 'eller eridi' && r2.workflow.last_modified === new Date(AT).toISOString());

    console.log('== what is refused ==');
    ok('scores: 0–1, or a percent', W.scoreOf(0.7) === 0.7 && W.scoreOf('70') === 0.7 && W.scoreOf('0,7') === 0.7 && W.scoreOf(-1) === undefined && W.scoreOf(101) === undefined && W.scoreOf('') === undefined);
    ok('an unknown edit, a missing id, a bad score are refused by name',
        /select \| reject/.test(W.editRefusal({ kind: 'delete', id: 'm1' })) && /id/.test(W.editRefusal({ kind: 'tags' })) && /0–1/.test(W.editRefusal({ kind: 'score', id: 'm1', value: 'x' })));
    ok('promotion: raw → asset, semi → final, nothing else', W.promotionOf('raw') === 'asset' && W.promotionOf('semi') === 'final' && W.promotionOf('final') === undefined);

    console.log('== ‼️ the engine\'s version wins ==');
    const engine = (version, fail) => {
        const writes = [];
        return { writes, c: {
            getRecord: async () => ({ item: rec(), version }),
            updateRecord: async (col, id, p) => { if (fail) { throw new Error(fail); } writes.push(p); return { version: version + 1 }; }
        } };
    };
    const D = { base: 'TEST', lang: 'TR' };
    let e = engine(3);
    let o = await W.writeStudioEdit(async () => e.c, { id: 'm1', kind: 'tags', value: 'x', version: 3 }, D, AT);
    ok('written onto the version the card showed, with that version expected', o.written && o.version === 4 && e.writes[0].expectedVersion === 3 && e.writes[0].backup === true);
    e = engine(4);
    o = await W.writeStudioEdit(async () => e.c, { id: 'm1', kind: 'note', value: 'x', version: 3 }, D, AT);
    ok('‼️ a record changed in the panel since the card was read is NOT written, and it says so',
        !o.written && e.writes.length === 0 && o.conflict.seen === 3 && o.conflict.now === 4 && /changed since the wall read it/.test(o.why));
    e = engine(3, 'version_conflict: expected 3, found 4');
    o = await W.writeStudioEdit(async () => e.c, { id: 'm1', kind: 'select', version: 3 }, D, AT);
    ok('a race lost at the engine is the same conflict', !o.written && !!o.conflict);
    o = await W.writeStudioEdit(async () => ({ down: 'not running' }), { id: 'm1', kind: 'select' }, D, AT);
    ok('an engine that is down: nothing written, and why', !o.written && /not answering \(not running\)/.test(o.why) && o.base === 'TEST');
    o = await W.writeStudioEdit(async () => { throw new Error('never asked'); }, { id: 'm1', kind: 'score', value: 'x' }, D, AT);
    ok('a refused edit never reaches the engine', !o.written && /0–1/.test(o.error));

    console.log('== the bridge door ==');
    const { BridgeRegistry } = require(path.join(ROOT, 'out/core/bridge.js'));
    const { registerStudioLibraryOps } = require(path.join(ROOT, 'out/core/studioLibraryOps.js'));
    const reg = new BridgeRegistry();
    const seen = [];
    registerStudioLibraryOps(reg, { outputsDir: () => '', read: async () => ({ cards: [] }), edit: async (req, start) => { seen.push([req, start]); return { written: true }; } });
    const d1 = await reg.dispatch('studio.library.edit', { id: 'm1', action: 'score', value: 0.5, version: 2, base: 'TEST', autoStart: true });
    ok('studio.library.edit hands the page\'s own writer the edit and the start flag',
        d1.ok && seen[0][0].kind === 'score' && seen[0][0].version === 2 && seen[0][0].base === 'TEST' && seen[0][1] === true);
    const d2 = await reg.dispatch('studio.library.edit', { id: 'm1', action: 'erase' });
    ok('…and refuses an unknown action before it', !d2.ok && seen.length === 1);
    ok('the op is in the catalog', reg.catalog().some(o => o.op === 'studio.library.edit'));

    console.log(`\ntest_studio_library_write: ${pass} passed, ${fail} failed`);
    process.exitCode = fail ? 1 : 0;
})();
