// X-418 — every file a run makes is filed into the library and recorded in the local Airtable
// (src/core/mediaRecorder.ts · mediaRecordFields.ts · mediaPending.ts · mediaProbe.ts).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { MediaRecorder } = require(path.join(ROOT, 'out/core/mediaRecorder.js'));
const F = require(path.join(ROOT, 'out/core/mediaRecordFields.js'));
const P = require(path.join(ROOT, 'out/core/mediaProbe.js'));
const Q = require(path.join(ROOT, 'out/core/mediaPending.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, a, b) => { const s = JSON.stringify(a) === JSON.stringify(b); ok(n, s); if (!s) { console.log('    got', JSON.stringify(a), 'want', JSON.stringify(b)); } };

/* ---------- ffmpeg's report, parsed ---------- */
const VID = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'x.mp4':
  Duration: 00:00:34.02, start: 0.000000, bitrate: 2345 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709, progressive), 1080x1920 [SAR 1:1 DAR 9:16], 2210 kb/s, 30 fps, 30 tbr, 15360 tbn (default)
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, stereo, fltp, 128 kb/s (default)`;
const PNG = `Input #0, png_pipe, from 'a.png':
  Duration: N/A, bitrate: N/A
  Stream #0:0: Video: png, rgba(pc, gbr/unknown/unknown), 1376x768, 25 tbr, 25 tbn`;
const MP3 = `Input #0, mp3, from 'v.mp3':
  Duration: 00:00:05.04, start: 0.025057, bitrate: 128 kb/s
  Stream #0:0: Audio: mp3 (mp3float), 44100 Hz, mono, fltp, 128 kb/s`;
const v = P.parseReport(VID);
eq('a video: duration, bitrate, both streams', [v.durationSec, v.bitrateKbps, v.video.codec, v.video.width, v.video.height, v.video.fps, v.video.dar, v.audio.sampleRate, v.audio.channels],
    [34.02, 2345, 'h264', 1080, 1920, 30, '9:16', 44100, 'stereo']);
eq('…onto the form: Medya Dosyası + Teknik Kalite', P.probeFields(v, 'video'), {
    media: { width: 1080, height: 1920, aspect_ratio: '9:16', duration_seconds: 34.02, frame_rate: 30 },
    technical_quality: { resolution_quality: '1080p', bitrate: 2345, codec: 'h264', sample_rate: 44100, channels: 'stereo' }
});
eq('‼️ an image: no duration, no fps, its alpha seen, the ratio from its pixels', P.probeFields(P.parseReport(PNG), 'image'),
    { media: { width: 1376, height: 768, aspect_ratio: '43:24', has_transparency: true }, technical_quality: { resolution_quality: '720p', codec: 'png' } });
eq('an audio file: the audio codec is the codec', P.probeFields(P.parseReport(MP3), 'audio'),
    { media: { duration_seconds: 5.04 }, technical_quality: { bitrate: 128, codec: 'mp3', sample_rate: 44100, channels: 'mono' } });
eq('no ffmpeg → no fields, nothing invented', P.probeFields(undefined, 'video'), {});
eq('resolution by the short side', ['4K', '1080p', '480p'], [P.resolutionQuality(3840, 2160), P.resolutionQuality(1080, 1920), P.resolutionQuality(854, 480)]);

/* ---------- the mechanical fields ---------- */
const RUN = { id: 'run-1', name: '34 sn dilim', startedAt: Date.parse('2026-09-26T10:00:00Z'), stepIndex: 3, steps: 9, stepTitle: 'Omni Flash edit', taskId: 't-9', attempt: 1 };
const f = F.producedFields({ stage: 'semi', role: 'candidate', origin: 'AI_generated', productionType: 'fal', model: 'fal-ai/omni', prompt: 'a cat', seed: 7, costUsd: 0.12, run: RUN, sequence: 2, fingerprint: 'sha256:ab' }, {}, Date.parse('2026-09-26T10:05:00Z'));
eq('Provenans: origin, model, prompt and its hash, seed', [f.provenance.origin, f.provenance.model, f.provenance.generation_prompt, f.provenance.prompt_hash.length, f.provenance.seed], ['AI_generated', 'fal-ai/omni', 'a cat', 16, 7]);
ok('Orijinal Bağlam says where in which run, and the cost', /34 sn dilim · step 4\/9 "Omni Flash edit" · attempt 2 · run run-1 · \$0\.120/.test(f.provenance.original_context));
eq('the run is the batch', f.extra.batch, { batch_id: 'run-1', batch_name: '34 sn dilim', batch_source: 'agent-farm', batch_created: '2026-09-26T10:00:00.000Z', sort_a: 4, batch_size: 9, batch_sequence: 2 });
eq('‼️ the stage is in workflow.stage', [f.extra.workflow.stage, f.extra.workflow.iteration_count], ['semi', 2]);
ok('one history line, with the cost', f.extra.pipeline_history.length === 1 && f.extra.pipeline_history[0].cost_usd === 0.12 && f.extra.pipeline_history[0].stage === 'semi');
eq('the fingerprint is the record\'s own field', f.extra.fingerprint, 'sha256:ab');
ok('no failure on a candidate', f.failure === undefined && f.extra.completed_sections.failure === undefined);
const ff = F.producedFields({ stage: 'raw', role: 'failed', origin: 'AI_generated', failure: { reason: 'judge FAIL: hands melted' } });
eq('‼️ a failed file keeps its Başarı Statüsü — salvageable unless said otherwise', ff.failure, { is_failed: true, reason: 'judge FAIL: hands melted', salvageable: true, salvage_notes: '' });
const item = { media: { file_path: 'x' }, workflow: { stage: 'semi' }, pipeline_history: [{ a: 1 }] };
F.applyRestage(item, { file: 'D:\\m\\raw\\a.png', stage: 'raw', reason: 'not selected', failure: { reason: 'not selected' } });
eq('a restage edits the current record in place', [item.media.file_path, item.workflow.stage, item.failure.is_failed, item.workflow.rejection_count, item.pipeline_history.length, item.pipeline_history[1].from],
    ['D:/m/raw/a.png', 'raw', true, 1, 2, 'semi']);
const r0 = {};
ok('a causal link is added once', F.addCausal(r0, 'effects', ['m1']) && !F.addCausal(r0, 'effects', ['m1']) && r0.relations.causal.effects.length === 1);

/* ---------- on the bridge ---------- */
const ext = fs.readFileSync(path.join(ROOT, 'src/extension.ts'), 'utf8');
const block = op => { const i = ext.indexOf("op: '" + op + "'"); return i < 0 ? '' : ext.slice(i, ext.indexOf('\n        },', i)); };
ok('‼️ media.record / .restage / .pending / .pending.flush are on the bridge, over the one recorder', /mediaRecorder\.record\(/.test(block('media.record'))
    && /mediaRecorder\.restage\(/.test(block('media.restage')) && /mediaRecorder\.pending\(/.test(block('media.pending')) && /mediaRecorder\.flush\(/.test(block('media.pending.flush')));
ok('…a flush starts no engine unless told to', /\|\| 'never'/.test(block('media.pending.flush')));
ok('‼️ an engine started from the bridge or the page writes what waited for it', /mediaRecorder\.flush\(r\.instance\)/.test(block('airtable.start')) && /afterStart: flushAfterStart/.test(ext)
    && /this\.deps\.afterStart\?\.\(r\.instance\)/.test(fs.readFileSync(path.join(ROOT, 'src/panels/airtablePanel.ts'), 'utf8')));

/* ---------- the recorder, against a fake engine ---------- */
const engine = require('./lib_fake_engine');

(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-rec-'));
    const media = path.join(tmp, 'media');
    const out = path.join(tmp, 'outputs');
    const store = path.join(tmp, 'store');
    fs.mkdirSync(out, { recursive: true });
    const put = (name, body) => { const p = path.join(out, name); fs.writeFileSync(p, body); return p; };
    const E = engine();
    const st = { up: true, starts: 0, asks: 0, startOk: true, answer: false };
    const mk = () => new MediaRecorder({
        storageDir: store,
        store: () => ({ databaseRoots: [], mediaRoots: [media], defaultInstance: 'TEST', defaultLang: 'TR', requestTimeoutMs: 1000 }),
        connect: async () => st.up ? E : { down: 'TEST is not running (port 3000)' },
        start: async () => { st.starts++; if (st.startOk) { st.up = true; } return st.startOk ? { ok: true } : { ok: false, error: 'no node_modules' }; },
        confirm: async () => { st.asks++; return st.answer; },
        probe: async p => p.endsWith('.mp4') ? P.parseReport(VID) : P.parseReport(PNG)
    });
    try {
        const rec = mk();
        const produced = { role: 'candidate', origin: 'AI_generated', productionType: 'fal', model: 'fal-ai/flux', prompt: 'a cat', run: RUN };
        const a = await rec.record({ file: put('t-1-1.png', 'PNG-A'), produced });
        const semi = path.join(media, 'media_TEST', 'image', 'semi', 't-1-1.png');
        eq('‼️ a candidate is filed into media_<base>\\image\\semi and recorded', [a.file, a.stage, !!a.id, a.duplicate], [semi, 'semi', true, undefined]);
        ok('…and nothing is left in the outputs folder', !fs.existsSync(path.join(out, 't-1-1.png')) && fs.existsSync(semi));
        const ra = E.items.get(a.id).item;
        eq('the record: file, stage, fingerprint, provenance, probe', [ra.media.file_path, ra.workflow.stage, /^sha256:[0-9a-f]{64}$/.test(ra.fingerprint), ra.provenance.model, ra.media.width, ra.technical_quality.codec, ra.status],
            [semi.replace(/\\/g, '/'), 'semi', true, 'fal-ai/flux', 1376, 'png', 'draft']);
        ok('no Image-Semi template exists → none applied', a.template === undefined && ra.style === '');

        const src = await rec.record({ file: put('clip.mp4', 'VIDEO-SRC'), produced: { role: 'input', origin: 'user_submission', productionType: 'input' } });
        eq('a run input → source, its template Video-Source applied, the stage still ours', [src.stage, src.template, E.items.get(src.id).item.style, E.items.get(src.id).item.workflow.stage], ['source', 'Video-Source', 'tpl-Video-Source', 'source']);
        const part = await rec.record({ file: put('clip-part1.mp4', 'VIDEO-P1'), produced: { role: 'intermediate', origin: 'manual_extraction', productionType: 'tool:split' }, causeFiles: [src.file] });
        eq('‼️ a part names what it was cut from, and the source names the part', [E.items.get(part.id).item.relations.causal.causes, E.items.get(src.id).item.relations.causal.effects], [[src.id], [part.id]]);

        const dupe = await rec.record({ file: put('again.png', 'PNG-A'), produced });
        eq('‼️ the same bytes again: no second record, the first one answers', [dupe.duplicate, dupe.id], [true, a.id]);
        eq('…records in the engine', E.items.size, 3);

        const bad = await rec.record({ file: put('x.png', 'X'), stage: 'all_in', produced });
        ok('all_in is refused, the file stays where it was', /waiting area/.test(bad.error) && fs.existsSync(path.join(out, 'x.png')));

        const moved = await rec.restage({ file: a.file, stage: 'raw', reason: 'judge FAIL', failure: { reason: 'judge FAIL: blurry' } });
        const raw = path.join(media, 'media_TEST', 'image', 'raw', 't-1-1.png');
        const rm = E.items.get(a.id).item;
        eq('‼️ FAIL → raw: the file moves and the record follows in one call', [moved.file, moved.id, rm.media.file_path, rm.workflow.stage, rm.failure.is_failed, rm.failure.reason, rm.pipeline_history.length],
            [raw, a.id, raw.replace(/\\/g, '/'), 'raw', true, 'judge FAIL: blurry', 2]);

        /* ---------- the engine is down ---------- */
        st.up = false;
        const r2 = mk();
        const p1 = await r2.record({ file: put('t-2-1.png', 'PNG-B'), produced, autoStart: 'never' });
        const semi2 = path.join(media, 'media_TEST', 'image', 'semi', 't-2-1.png');
        ok('‼️ down, never start: the file is still filed, the record waits', p1.file === semi2 && fs.existsSync(semi2) && /^pnd-/.test(p1.pending) && st.starts === 0);
        const w = Q.loadPending(store);
        eq('…the pending entry carries the full fields', [w.length, w[0].kind, w[0].create.fields.extra.workflow.stage, !!w[0].create.fields.extra.fingerprint, /not running/.test(w[0].lastError)], [1, 'create', 'semi', true, true]);
        const p2 = await r2.restage({ file: p1.file, stage: 'raw', reason: 'not selected', failure: { reason: 'not selected' } });
        const w2 = Q.loadPending(store);
        eq('‼️ a move while waiting folds into the waiting create — one write later', [w2.length, w2[0].file, w2[0].create.fields.extra.workflow.stage, w2[0].create.fields.failure.reason, p2.pending === w2[0].key],
            [1, path.join(media, 'media_TEST', 'image', 'raw', 't-2-1.png'), 'raw', 'not selected', true]);
        st.up = true;
        const fl = await r2.flush();
        const created = [...E.items.values()].map(x => x.item).find(i => /t-2-1\.png$/.test(i.media.file_path));
        eq('‼️ the engine answers: the flush writes it where it is NOW, as raw, failed', [fl[0].done, fl[0].failed, !!created, created && created.workflow.stage, created && created.failure.is_failed, Q.loadPending(store).length],
            [1, 0, true, 'raw', true, 0]);

        /* ---------- auto-start (X-416) ---------- */
        st.up = false; st.starts = 0;
        const r3 = mk();
        const s1 = await r3.record({ file: put('t-3-1.png', 'PNG-C'), produced });
        ok('‼️ auto (the default): the engine is started and the record written', st.starts === 1 && !!s1.id && !s1.pending);
        st.up = false; st.startOk = false;
        const r4 = mk();
        const s2 = await r4.record({ file: put('t-4-1.png', 'PNG-D'), produced });
        ok('a start that fails: pending, and the reason says so', /^pnd-/.test(s2.pending) && /could not be started — no node_modules/.test(Q.loadPending(store)[0].lastError));
        const s3 = await r4.record({ file: put('t-4-2.png', 'PNG-E'), produced });
        ok('…and the next file does not try again for a while', st.starts === 2 && /^pnd-/.test(s3.pending));
        st.asks = 0; st.starts = 0; st.answer = false;
        const r5 = mk();
        const s4 = await r5.record({ file: put('t-5-1.png', 'PNG-F'), produced, autoStart: 'ask' });
        const s5 = await r5.record({ file: put('t-5-2.png', 'PNG-G'), produced, autoStart: 'ask' });
        ok('ask, answered no: nothing started, asked once, both wait', st.asks === 1 && st.starts === 0 && !!s4.pending && !!s5.pending);
        st.up = true;
        const fl2 = await mk().flush();
        ok('all of them land at the next flush', fl2[0].done === 4 && Q.loadPending(store).length === 0);

        /* ---------- a known record moved while down, no id given ---------- */
        const k = await mk().record({ file: put('t-6-1.png', 'PNG-H'), produced });
        st.up = false;
        const r6 = mk();
        const mv = await r6.restage({ file: k.file, stage: 'final', reason: 'the run\'s last output', autoStart: 'never' });
        eq('an update waits with the path it came from', [!!mv.pending, Q.loadPending(store)[0].kind, !!Q.loadPending(store)[0].update.fromFile], [true, 'update', true]);
        st.up = true;
        await r6.flush();
        eq('…and finds its record by that path at the flush', [E.items.get(k.id).item.workflow.stage, /final/.test(E.items.get(k.id).item.media.file_path)], ['final', true]);

        st.up = false; st.starts = 0; st.startOk = true;
        const r7 = mk();
        await Promise.all([r7.ready('TEST', 'auto'), r7.ready('TEST', 'auto')]);
        ok('‼️ two calls at once start the engine once', st.starts === 1);
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw', e && e.stack); process.exit(1); });
