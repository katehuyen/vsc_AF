// M-49 — the recipes run for real: a 34 s clip split into 10 s parts, joined
// back, and its original sound laid under the joined picture. The duration and
// the audio/video alignment must survive the trip. Needs ffmpeg; without it the
// test says so and passes nothing off as checked.
'use strict';
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const T = require(path.join(ROOT, 'out/core/toolRun.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const near = (a, b, tol) => typeof a === 'number' && Math.abs(a - b) <= tol;

(async () => {
    if (cp.spawnSync('ffmpeg', ['-version']).error) {
        console.log('  SKIP no ffmpeg on this machine — the round trip was NOT checked');
        console.log('0 passed, 0 failed');
        return;
    }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-tool-'));
    const clip = path.join(tmp, 'klip.mp4');
    cp.spawnSync('ffmpeg', ['-hide_banner', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=25:duration=34',
        '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=34', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', clip]);
    ok('the 34 s clip is made', near(await T.mediaDuration(clip), 34, 0.1));

    const out = path.join(tmp, 'out');
    const split = await T.runRecipe({ recipe: 'split', input: clip, params: { segmentSec: 10 }, outDir: out });
    ok('‼️ split: four parts', split.ok && split.outputs.length === 4 && split.runs === 4);
    const lens = [];
    for (const f of split.outputs) { lens.push(await T.mediaDuration(f)); }
    ok('…of 10 · 10 · 10 · 4 s', near(lens[0], 10, 0.1) && near(lens[1], 10, 0.1) && near(lens[2], 10, 0.1) && near(lens[3], 4, 0.1));

    const joined = await T.runRecipe({ recipe: 'concat', params: { files: split.outputs, name: 'joined.mp4' }, outDir: out });
    ok('‼️ concat: the parts join back to 34 s', joined.ok && near(await T.mediaDuration(joined.outputs[0]), 34, 0.15));

    const audio = await T.runRecipe({ recipe: 'extractAudio', input: clip, params: { format: 'm4a' }, outDir: out });
    ok('extractAudio: the original sound, 34 s', audio.ok && near(await T.mediaDuration(audio.outputs[0]), 34, 0.1));
    const muxed = await T.runRecipe({ recipe: 'muxAudio', input: joined.outputs[0], params: { audio: audio.outputs[0] }, outDir: out });
    ok('muxAudio: the joined picture with the original sound', muxed.ok && near(await T.mediaDuration(muxed.outputs[0]), 34, 0.15));
    // alignment: each stream on its own is as long as the whole, from the same start
    const v = await T.runRecipe({ recipe: 'transcode', input: muxed.outputs[0], params: { codec: 'h264', preset: 'ultrafast' }, outDir: path.join(tmp, 'v') });
    const a2 = await T.runRecipe({ recipe: 'extractAudio', input: muxed.outputs[0], params: { format: 'm4a' }, outDir: path.join(tmp, 'a') });
    const vd = await T.mediaDuration(v.outputs[0]), ad = await T.mediaDuration(a2.outputs[0]);
    ok('‼️ sync kept: sound and picture both 34 s after the trip', near(vd, 34, 0.15) && near(ad, 34, 0.15) && near(vd, ad, 0.1));

    const again = await T.runRecipe({ recipe: 'concat', params: { files: split.outputs, name: 'joined.mp4' }, outDir: out });
    ok('the overwrite policy holds on a real run ("never")', !again.ok && /already there/.test(again.error));
    const missing = await T.runRecipe({ recipe: 'loudnorm', input: clip, outDir: out }, { ffmpeg: path.join(tmp, 'no-such-ffmpeg.exe') });
    ok('‼️ no ffmpeg: the step fails with a sentence that says so', !missing.ok && missing.error === T.NO_FFMPEG);

    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw', e && e.stack); process.exit(1); });
