// X-419 — a record's meaning filled by a model that looked at the file
// (src/core/mediaEnrich.ts · enrichSpec.ts · mediaEnricher.ts · runEnrich.ts).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const X = require(path.join(ROOT, 'out/core/mediaEnrich.js'));
const S = require(path.join(ROOT, 'out/core/enrichSpec.js'));
const { MediaEnricher } = require(path.join(ROOT, 'out/core/mediaEnricher.js'));
const { RunEnrich } = require(path.join(ROOT, 'out/core/runEnrich.js'));
const engine = require('./lib_fake_engine');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, a, b) => { const s = JSON.stringify(a) === JSON.stringify(b); ok(n, s); if (!s) { console.log('    got', JSON.stringify(a), 'want', JSON.stringify(b)); } };
const rec = (over) => Object.assign({
    id: 'm1', lang: 'TR', name: 'kedi.png', topic: '', subtopic: '', content: '', description: '', domain: '', discipline: '', field: '', branch: '',
    usage_context: '', content_role: '', style: '', level: '', tone: { audience: '', emotion: '', energy: '', formality: '' },
    marketing: { clickbait_score: 0, credibility_score: 0, shock_factor: 0, virality_score: 0 },
    failure: { is_failed: false, reason: '', salvage_notes: '', salvageable: false }, tags: [], completed_sections: {},
    media: { type: 'image', file_path: 'D:/lib/image/final/kedi.png', width: 1024, height: 1024 }, provenance: { generation_prompt: 'bir kedi' }
}, over || {});

/* ---------- the sections: what is asked, and of whom ---------- */
{
    const r = rec();
    ok('the file\'s own name standing in for a name is blank; a real name is not', X.isBlank(r, 'name') && !X.isBlank(rec({ name: 'Mavi gözlü kedi' }), 'name'));
    ok('‼️ …and in content too, where the recorder also puts it (measured live)', X.isBlank(rec({ content: 'kedi.png' }), 'content') && !X.isBlank(rec({ content: 'Bir kedi portresi' }), 'content'));
    ok('‼️ salvage is asked only of a failed file', !X.sectionsFor(r).some(s => s.id === 'salvage') && X.sectionsFor(rec({ failure: { is_failed: true, reason: 'eller eridi' } })).some(s => s.id === 'salvage'));
    ok('a section a person filled whole is not asked again', !X.sectionsFor(rec({ domain: 'a', discipline: 'b', field: 'c', branch: 'd' })).some(s => s.id === 'taxonomy'));
    eq('only the wanted sections', X.sectionsFor(r, ['tags', 'seo']).map(s => s.id), ['seo', 'tags']);
    eq('an image goes to claude, a video to agy, audio to nobody — said', [X.enrichModality('a.png').engine, X.enrichModality('a.mp4').engine, X.enrichModality('a.mp3').engine, /cannot|can hear/.test(X.enrichModality('a.mp3').why)], ['claude', 'agy', undefined, true]);
    const p = X.enrichPrompt(r, 'D:/lib/kedi.png', X.sectionsFor(r, ['function', 'tone']), { lang: 'TR', prompt: 'bir kedi' }, 'claude');
    ok('‼️ the prompt carries the form\'s own option values, the language and the Read tool', /primary_content \| supporting_visual/.test(p) && /language TR/.test(p) && /Read tool/.test(p) && /generation prompt: bir kedi/.test(p));
}

/* ---------- the answer: checked field by field ---------- */
{
    const r = rec();
    const secs = X.sectionsFor(r, ['function', 'marketing', 'tags', 'education']);
    const out = 'Here: ```json\n' + JSON.stringify({
        fill: {
            function: { usage_context: 'education', content_role: 'hero_shot', style: 'youtube', level: 'secondary' },
            marketing: { 'marketing.clickbait_score': 1.7, 'marketing.credibility_score': '0.456', 'marketing.shock_factor': 0.1, 'marketing.virality_score': 0.3 },
            tags: { tags: 'kedi, mavi göz , portre' }
        },
        missing: [{ section: 'education', why: 'eğitsel içerik değil' }]
    }) + '\n```';
    const P = X.parseEnrich(out, r, secs);
    ok('‼️ an option the form does not have is refused, and the section stays open', !P.filled.includes('content_role') && P.dropped.some(d => /content_role: hero_shot/.test(d)) && P.missing.some(m => m.section === 'function'));
    eq('a score is clamped to 0..1 and rounded; a list is split', [P.patch.marketing.clickbait_score, P.patch.marketing.credibility_score, P.patch.tags], [1, 0.46, ['kedi', 'mavi göz', 'portre']]);
    ok('a full section is complete and marked so', P.complete.includes('marketing') && P.patch.completed_sections.marketing === true && !P.complete.includes('function'));
    ok('‼️ a section the model could not fill honestly keeps its reason', P.missing.some(m => m.section === 'education' && m.why === 'eğitsel içerik değil'));
    const toneSecs = X.sectionsFor(r, ['tone', 'marketing']);
    const N = X.parseEnrich(JSON.stringify({ fill: { tone: { tone: { audience: 'adult', emotion: 'serious' }, energy: 'low', 'tone.formality': 'neutral' }, marketing: { marketing: { clickbait_score: 0.1, credibility_score: 0.8, shock_factor: 0.2, virality_score: 0.3 } } } }), r, toneSecs);
    ok('‼️ a dotted field written nested, as a bare leaf or verbatim is read all three ways (measured: haiku nests)', N.complete.includes('tone') && N.complete.includes('marketing') && N.patch.tone.audience === 'adult' && N.patch.tone.energy === 'low' && N.patch.tone.formality === 'neutral');
    ok('prose that is not the JSON asked for is an error, every section missing', /not the JSON/.test(X.parseEnrich('olmadı', r, secs).error) && X.parseEnrich('olmadı', r, secs).missing.length === secs.length);
    const now = rec({ tags: ['elle'] });
    const put = X.applyEnrich(now, P, { at: 'T', by: 'agent-farm', model: 'claude/sonnet', costUsd: 0.01 });
    ok('‼️ a field a person filled meanwhile is kept — never overwritten', JSON.stringify(now.tags) === '["elle"]' && !put.includes('tags') && put.includes('usage_context'));
    ok('one history line says what was filled and what is missing', now.pipeline_history.length === 1 && now.pipeline_history[0].action === 'enriched' && /missing: .*education \(eğitsel içerik değil\)/.test(now.pipeline_history[0].note));
}

/* ---------- the plan: flex points, refused by name ---------- */
{
    const d = S.resolveEnrich(undefined, {});
    eq('‼️ the built-in is the user\'s decision: at the end, final + failed, sonnet low, gemini flash for video, all sections, no cap',
        [d.plan.when, d.plan.scope, d.plan.model, d.plan.effort, d.plan.videoModel, d.plan.sections, d.plan.capUsd], ['end', 'final-failed', 'sonnet', 'low', 'gemini-3.8-flash-low', [], 0]);
    const w = S.resolveEnrich({ scope: 'all', sections: 'seo, tags' }, { scope: 'final', when: 'record', cap: 0.2 }, 'kısa klip');
    eq('workflow over the Farm setting over the built-in', [w.plan.when, w.plan.scope, w.plan.sections, w.plan.capUsd, w.plan.brief], ['record', 'all', ['seo', 'tags'], 0.2, 'kısa klip']);
    ok('…each value says where it came from', w.why.some(l => /^enrich\.scope: all — from this workflow/.test(l)) && w.why.some(l => /^enrich\.when: record — from Farm Settings/.test(l)));
    ok('refused by name: a timing, a section, a cap', /when is end \| record \| never/.test(S.enrichRefusal({ when: 'sometimes' })) && /has no colour/.test(S.enrichRefusal({ sections: 'seo,colour' })) && /cap is dollars/.test(S.enrichRefusal({ cap: 90 })));
    eq('the form round-trips', S.enrichFromDraft(S.enrichSeed({ when: 'never', cap: 0.5 })), { when: 'never', cap: '0.5' });
    const e = (stage, role, id = 'x') => ({ stage, role, id });
    eq('in scope: final-failed takes final, asset, failed and left-out; never a pending file', [S.inScope('final-failed', e('final')), S.inScope('final-failed', e('asset')), S.inScope('final-failed', e('raw', 'failed')), S.inScope('final-failed', e('raw', 'rejected')), S.inScope('final-failed', e('semi', 'intermediate')), S.inScope('all', e('semi', 'intermediate', null))], [true, true, true, true, false, false]);
}

(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-enrich-'));
    try {
        /* ---------- one record, against a fake engine and a fake model turn ---------- */
        const png = path.join(tmp, 'kedi.png'), mp3 = path.join(tmp, 'ses.mp3');
        fs.writeFileSync(png, 'PNG'); fs.writeFileSync(mp3, 'MP3');
        const E = engine();
        E.items.set('m1', { item: rec({ media: { type: 'image', file_path: png.replace(/\\/g, '/'), width: 1, height: 1 } }), version: 1 });
        E.items.set('m2', { item: rec({ id: 'm2', media: { type: 'audio', file_path: mp3.replace(/\\/g, '/') } }), version: 1 });
        const seen = [];
        let answer = { tags: { tags: ['kedi'] } };
        const exec = async w => { seen.push(w); return { out: JSON.stringify({ type: 'result', result: JSON.stringify({ fill: answer, missing: [] }), total_cost_usd: 0.0123, is_error: false }), stderr: '' }; };
        const en = new MediaEnricher({ ready: async () => E, exec, now: () => 0 });
        const plan = S.resolveEnrich({ sections: 'tags', cap: 0.3 }).plan;
        const o = await en.enrich({ base: 'TEST', lang: 'TR', file: png, plan });
        ok('‼️ found by its file, looked at by claude in the file\'s folder, json + effort + the cap as the engine\'s own stop', o.id === 'm1' && seen[0].engine === 'claude' && seen[0].model === 'sonnet' && seen[0].json === true && seen[0].effort === 'low' && seen[0].args === '--max-budget-usd 0.3' && seen[0].cwd === tmp);
        eq('filled, completed, costed, written with a version check', [o.filled, o.complete, o.costUsd, E.items.get('m1').version, E.items.get('m1').item.tags, E.items.get('m1').item.completed_sections.tags], [['tags'], ['tags'], 0.0123, 2, ['kedi'], true]);
        const again = await en.enrich({ base: 'TEST', lang: 'TR', id: 'm1', plan });
        ok('a record with nothing blank left is not asked twice', again.skipped === 'nothing left blank to fill' && seen.length === 1);
        ok('‼️ an audio file is skipped with the reason — no turn spent', /hear/.test((await en.enrich({ base: 'TEST', id: 'm2', plan })).skipped) && seen.length === 1);
        ok('an engine that is down is said', /not answering/.test((await new MediaEnricher({ ready: async () => ({ down: 'port 3000 closed' }), exec }).enrich({ base: 'TEST', id: 'm1', plan })).error));
        // a person edits the record while the model is looking
        E.items.get('m1').item.seo = { title: '', description: '', keywords: [], slug: '' };
        answer = { seo: { 'seo.title': 'Kedi', 'seo.description': 'Mavi gözlü bir kedi.', 'seo.keywords': ['kedi'], 'seo.slug': 'kedi' } };
        const race = new MediaEnricher({
            ready: async () => E, now: () => 0,
            exec: async w => { const x = E.items.get('m1'); x.item.seo.title = 'Elle yazıldı'; x.version++; return exec(w); }
        });
        const r2 = await race.enrich({ base: 'TEST', id: 'm1', plan: S.resolveEnrich({ sections: 'seo' }).plan });
        ok('‼️ a version conflict re-reads and keeps the person\'s title', E.items.get('m1').item.seo.title === 'Elle yazıldı' && E.items.get('m1').item.seo.slug === 'kedi' && !r2.filled.includes('seo.title') && !r2.error);

        /* ---------- the run's timing ---------- */
        const asked = [];
        const hook = { enricher: { enrich: async r => { asked.push(r.id); return { filled: ['tags'], complete: ['tags'], missing: [], why: [] }; } }, settings: () => ({}) };
        const RE = new RunEnrich(hook, () => undefined, () => 1);
        const pEnd = RE.plan({ library: {} });
        const L = [
            { file: 'a', stage: 'final', role: 'candidate', id: 'f1', en: pEnd }, { file: 'b', stage: 'raw', role: 'failed', id: 'f2', en: pEnd },
            { file: 'c', stage: 'semi', role: 'intermediate', id: 'f3', en: pEnd }, { file: 'd', stage: 'final', role: 'final', en: pEnd }
        ];
        L.forEach(e => RE.touched(e));
        ok('at the end timing, nothing is filled while the run is going', asked.length === 0);
        const lines = await RE.ended(L);
        eq('‼️ the end fills the final and the failed file — not a part, not a record still pending', asked, ['f1', 'f2']);
        ok('…marks them, and says so in a line each', L[0].enriched.filled === 1 && lines.length === 2 && /1 field\(s\), complete tags/.test(lines[0]));
        await RE.ended(L);
        ok('an enriched record is never asked twice', asked.length === 2);
        asked.length = 0;
        const pRec = RE.plan({ library: { enrich: { when: 'record' } } });
        const f = { file: 'e', stage: 'semi', role: 'candidate', id: 'r1', en: pRec };
        RE.touched(f);
        f.role = 'failed'; f.stage = 'raw';
        RE.touched(f);
        await RE.ended([]);
        eq('‼️ at record timing a file is filled the moment it is in scope (here: its FAIL)', asked, ['r1']);
        ok('never stamps no plan at all', RE.plan({ library: { enrich: { when: 'never' } } }) === undefined);

        /* ---------- the wiring ---------- */
        const src = n => fs.readFileSync(path.join(ROOT, n), 'utf8');
        const lib = src('src/core/runLibrary.ts'), ext = src('src/extension.ts');
        ok('‼️ the run stamps the plan on every entry and touches it when it is filed, failed or left out', (lib.match(/this\.en\?\.touched\(/g) || []).length >= 4 && /en: enPlan/.test(lib));
        ok('‼️ the run\'s end enriches whatever its status', /if \(this\.en\) \{ lines\.push\(\.\.\.await this\.en\.ended\(ledger\)\); \}/.test(lib) && /status === 'done' \? await this\.promote\(ledger\)/.test(lib));
        const block = op => { const i = ext.indexOf("op: '" + op + "'"); return i < 0 ? '' : ext.slice(i, ext.indexOf('\n        },', i)); };
        ok('‼️ media.enrich is on the bridge over the one enricher, the Farm settings as its fleet level', /mediaEnricher\.enrich\(/.test(block('media.enrich')) && /enrichSettings\(\)/.test(block('media.enrich')) && /enrich: \{ enricher: mediaEnricher, settings: enrichSettings \}/.test(ext));
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw', e && e.stack); process.exit(1); });
