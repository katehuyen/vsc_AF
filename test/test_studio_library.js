// X-424 — the Studio wall's card, read from a library record (src/core/studioLibrary.ts)
'use strict';
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { libraryCard } = require(path.join(ROOT, 'out/core/studioLibrary.js'));
const A = require(path.join(ROOT, 'out/core/airtableInput.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, a, b) => { const s = JSON.stringify(a) === JSON.stringify(b); ok(n, s); if (!s) { console.log('    got', JSON.stringify(a), 'want', JSON.stringify(b)); } };

const rec = {
    id: 'media_mp4_1', name: '', status: 'draft', tags: ['kedi'], version: 3, created_at: '2026-09-26T10:00:00Z',
    media: { type: 'video', file_path: 'D:/zome/media/media_TEST/video/final/a.mp4' },
    workflow: { stage: 'final' }, failure: { is_failed: true, reason: 'eller eridi' },
    technical_quality: { human_quality_score: 0, auto_quality_score: 7 },
    completed_sections: { media_core: true, provenance: true, workflow: true, seo: false },
    relations: { causal: { causes: ['media_gif_1'], effects: [] } }
};
const c = libraryCard(rec);
eq('the summary fields come through', [c.id, c.stage, c.type, c.status, c.failed, c.name], ['media_mp4_1', 'final', 'video', 'draft', true, 'a.mp4']);
eq('‼️ the auto score when no person gave one, and says so', [c.score, c.scoreBy], [7, 'auto']);
eq('‼️ a person\'s score beats the machine\'s', [libraryCard({ ...rec, technical_quality: { human_quality_score: 9, auto_quality_score: 7 } }).score, libraryCard({ ...rec, technical_quality: { human_quality_score: 9 } }).scoreBy], [9, 'human']);
eq('form fill = the true sections of all of them', c.fill, 75);
eq('why it failed, its chain, its version', [c.reason, c.causes, c.effects, c.version], ['eller eridi', ['media_gif_1'], [], 3]);
eq('a bare record: zeros and blanks, never a throw', (({ score, scoreBy, fill, reason, causes, version }) => [score, scoreBy, fill, reason, causes, version])(libraryCard({ id: 'x' })), [0, '', 0, '', [], 0]);

const q = A.resolveQuery({ stages: 'final,raw', limit: 5 });
const items = [rec, { ...rec, id: 'r2', workflow: { stage: 'raw' }, created_at: '2026-09-27T10:00:00Z' }, { ...rec, id: 'r3', workflow: { stage: 'semi' } }];
eq('‼️ matchRecords gives the whole records, newest first, filtered as findRecords is', A.matchRecords(items, q).map(r => r.id), ['r2', 'media_mp4_1']);
eq('…and findRecords is exactly its summaries', A.findRecords(items, q).map(r => r.id), A.matchRecords(items, q).map(r => r.id));

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
