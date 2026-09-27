// M-49 — the media recipes: pure ffmpeg argument lists (src/core/mediaRecipes.ts).
'use strict';
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const R = require(path.join(ROOT, 'out/core/mediaRecipes.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, a, b) => { const s = JSON.stringify(a) === JSON.stringify(b); ok(n, s); if (!s) { console.log('    got', JSON.stringify(a), 'want', JSON.stringify(b)); } };
const O = path.join('D:', 'out');
const IN = path.join('D:', 'clips', 'klip.mp4');
const plan = (recipe, params, extra) => R.planRecipe(Object.assign({ recipe, input: IN, params, outDir: O }, extra || {}), { durationSec: 34 });

eq('ten recipes', R.RECIPES.map(r => r.id), ['split', 'concat', 'extractAudio', 'muxAudio', 'reframe', 'burnSubtitles', 'short', 'keyframes', 'loudnorm', 'transcode']);
ok('every parameter says what it is for', R.RECIPES.every(r => r.params.every(p => p.describe && p.describe.length > 8)));
ok('the presets name real recipes and real parameters', R.RECIPE_PRESETS.every(p => R.recipe(p.recipe) && !('error' in R.recipeParams(R.recipe(p.recipe), p.params))));

/* ---------- split ---------- */
let p = plan('split', { segmentSec: 10 });
eq('‼️ 34 s in 10 s parts = 10 · 10 · 10 · 4', p.runs.map(a => [a[a.indexOf('-ss') + 1], a[a.indexOf('-t') + 1]]), [['0.000', '10.000'], ['10.000', '10.000'], ['20.000', '10.000'], ['30.000', '4.000']]);
eq('numbered outputs beside each other', p.outputs.map(f => path.basename(f)), ['klip_part001.mp4', 'klip_part002.mp4', 'klip_part003.mp4', 'klip_part004.mp4']);
ok('seek before the input, re-encoded so each part starts on its own frame', p.runs[1].indexOf('-ss') < p.runs[1].indexOf('-i') && p.runs[1].includes('libx264'));
p = plan('split', { segmentSec: 10, overlapSec: 2 });
eq('an overlap steps by the part less the overlap', p.runs.map(a => a[a.indexOf('-ss') + 1]), ['0.000', '8.000', '16.000', '24.000']);
ok('an overlap as long as a part is refused', /must be shorter/.test(plan('split', { segmentSec: 5, overlapSec: 5 }).error));
ok('no duration, no split — said', /needs the input's duration/.test(R.planRecipe({ recipe: 'split', input: IN, outDir: O }, {}).error));

/* ---------- concat · audio ---------- */
p = R.planRecipe({ recipe: 'concat', params: { files: ["C:\\a\\p1.mp4", "C:\\a\\it's.mp4"] }, outDir: O });
eq('concat writes its list, forward slashes, quotes escaped', p.files[0].text, "file 'C:/a/p1.mp4'\nfile 'C:/a/it'\\''s.mp4'\n");
ok('…and joins by stream copy from it', p.runs[0].join(' ').includes('-f concat -safe 0 -i ' + p.files[0].path + ' -c copy'));
ok('concat needs its files', /needs "files"/.test(R.planRecipe({ recipe: 'concat', outDir: O }).error));
p = plan('extractAudio', { format: 'wav' });
ok('extract: no video, the codec of the format', p.runs[0].includes('-vn') && p.runs[0].includes('pcm_s16le') && /klip\.wav$/.test(p.outputs[0]));
p = plan('muxAudio', { audio: 'D:\\a.m4a', offsetSec: 0.25 });
const m = p.runs[0];
ok('‼️ mux: picture from the input, sound from the file, shifted for sync', m.includes('-itsoffset') && m[m.indexOf('-itsoffset') + 1] === '0.250' && m.indexOf('-itsoffset') < m.lastIndexOf('-i') && m.includes('0:v:0') && m.includes('1:a:0') && m.includes('-shortest'));

/* ---------- picture ---------- */
p = plan('reframe', { aspect: '9:16', mode: 'crop' });
ok('crop to 9:16 from the centre, even sizes, commas escaped for the filter graph', /^crop=trunc\(min\(iw\\,ih\*0\.562500\)\/2\)\*2:trunc\(min\(ih\\,iw\/0\.562500\)\/2\)\*2$/.test(p.runs[0][p.runs[0].indexOf('-vf') + 1]));
p = plan('reframe', { aspect: '16:9', mode: 'pad', height: 1080 });
ok('pad to 1920×1080 with bars', /scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080/.test(p.runs[0][p.runs[0].indexOf('-vf') + 1]));
p = plan('burnSubtitles', { subtitles: 'C:\\subs\\a.srt' });
eq('a Windows path inside a filter: slashes, the drive colon escaped', p.runs[0][p.runs[0].indexOf('-vf') + 1], "subtitles='C\\:/subs/a.srt'");
p = plan('short', { start: 12.5, end: 40, srt: '1\r\n00:00:00,500 --> 00:00:02,000\r\nMerhaba\r\n' });
const sr = p.runs && p.runs[0];
ok('‼️ short: ONE re-encode — seek before the input, the length after it', p.runs.length === 1 && sr[sr.indexOf('-ss') + 1] === '12.500' && sr.indexOf('-ss') < sr.indexOf('-i') && sr[sr.indexOf('-t') + 1] === '27.500' && sr.includes('libx264'));
ok('short: reframed to 9:16 and its subtitles drawn in the same filter chain', /^crop=trunc\(min\(iw\\,ih\*0\.562500\).*,subtitles='D\\:\/out\/klip_short_12\.5-40\.srt'$/.test(sr[sr.indexOf('-vf') + 1]));
eq('short: the SRT text is written beside the clip, line ends made plain', [path.basename(p.files[0].path), p.files[0].text], ['klip_short_12.5-40.srt', '1\n00:00:00,500 --> 00:00:02,000\nMerhaba\n']);
eq('short: the moment is in the file name, so two cuts of one input never collide', path.basename(p.outputs[0]), 'klip_short_12.5-40.mp4');
p = plan('short', { start: 3, end: 9 });
ok('short: no SRT, no subtitle filter and no helper file', !p.runs[0][p.runs[0].indexOf('-vf') + 1].includes('subtitles') && p.files.length === 0);
ok('short: an end before its start is refused in words', /end \(4s\) must be after its start \(9s\)/.test(plan('short', { start: 9, end: 4 }).error));
ok('short: a start past the input is refused', /past the end of the input \(34\.0s\)/.test(plan('short', { start: 40, end: 50 }).error));
ok('short: the end is required', /needs "end"/.test(plan('short', { start: 1 }).error));
p = plan('keyframes', { mode: 'count', count: 8 });
ok('8 key frames evenly over 34 s', p.runs[0].includes('fps=8/34.000') && p.runs[0].includes('8'));
p = plan('keyframes', { mode: 'scene', threshold: 0.4 });
ok('scene frames at each cut', p.runs[0].includes('select=gt(scene\\,0.4)'));
p = plan('loudnorm', {});
ok('loudness to -16 LUFS, the picture copied', p.runs[0].includes('loudnorm=I=-16:TP=-1.5:LRA=11') && p.runs[0].includes('copy'));
p = plan('transcode', { codec: 'vp9', crf: 30 });
ok('vp9 → webm, constant quality', /\.webm$/.test(p.outputs[0]) && p.runs[0].includes('libvpx-vp9') && p.runs[0].includes('-b:v'));

/* ---------- refused in words ---------- */
ok('an unknown recipe names the real ones', /no recipe "blur" — split, concat/.test(plan('blur', {}).error));
ok('an unknown parameter names the real ones', /no parameter "fps" \(it takes aspect, mode, height\)/.test(plan('reframe', { fps: 30 }).error));
ok('a number out of range', /crf is 0–51, not 99/.test(plan('transcode', { crf: 99 }).error));
ok('an option that is not one', /aspect is one of 16:9, 9:16, 1:1, not "4:3"/.test(plan('reframe', { aspect: '4:3' }).error));
ok('an input it needs', /needs an input file/.test(R.planRecipe({ recipe: 'loudnorm', outDir: O }).error));

/* ---------- the overwrite policy ---------- */
const there = f => /klip_loud\.mp4$/.test(f);
ok('never: an output already there refuses the call', /already there, and the overwrite policy is "never"/.test(R.planRecipe({ recipe: 'loudnorm', input: IN, outDir: O }, { exists: there }).error));
p = R.planRecipe({ recipe: 'loudnorm', input: IN, outDir: O, overwrite: 'suffix' }, { exists: there });
ok('suffix: a new name', /klip_loud-2\.mp4$/.test(p.outputs[0]) && p.runs[0].includes('-n'));
p = R.planRecipe({ recipe: 'loudnorm', input: IN, outDir: O, overwrite: 'always' }, { exists: there });
ok('always: -y', p.runs[0].includes('-y'));
ok('‼️ an argument list, never a shell line', p.runs.every(a => Array.isArray(a) && a.every(x => typeof x === 'string')));

/* ---------- one call off loose arguments (tools.run, a tool step) ---------- */
const C = require(path.join(ROOT, 'out/core/toolCall.js'));
const D0 = { outDir: '', overwrite: 'never' };
let c = C.toolCall({ recipe: 'loudnorm', input: IN }, D0);
eq('no folder named: an af-tool folder beside the input', [c.outDir, c.overwrite], [path.join(path.dirname(IN), 'af-tool'), 'never']);
c = C.toolCall({ recipe: 'loudnorm', input: IN }, { outDir: 'E:\\media', overwrite: 'suffix' });
eq('the flex defaults when the call names none', [c.outDir, c.overwrite], ['E:\\media', 'suffix']);
c = C.toolCall({ preset: 'omni flash parts', input: IN, params: { overlapSec: 1 } }, D0);
eq('‼️ a preset names the recipe and its parameters; the given ones beat it', [c.recipe, c.params], ['split', { segmentSec: 10, overlapSec: 1 }]);
ok('an unknown preset names the real ones', /no recipe preset "x" — "Omni Flash parts"/.test(C.toolCall({ preset: 'x' }, D0).error));
ok('a preset for another recipe is refused', /is for split, not loudnorm/.test(C.toolCall({ preset: 'Omni Flash parts', recipe: 'loudnorm' }, D0).error));
ok('a policy that is not one', /overwrite is never \| always \| suffix/.test(C.toolCall({ recipe: 'loudnorm', input: IN, overwrite: 'maybe' }, D0).error));
c = C.toolCall({ recipe: 'concat', params: { files: ['D:\\p\\a.mp4', 'D:\\p\\b.mp4'] } }, D0);
eq('concat has no input: beside its first file', c.outDir, path.join('D:\\p', 'af-tool'));
const fsx = require('fs');
const ext = fsx.readFileSync(path.join(ROOT, 'src/extension.ts'), 'utf8');
const block = op => { const i = ext.indexOf("op: '" + op + "'"); return i < 0 ? '' : ext.slice(i, ext.indexOf('\n        },', i)); };
ok('‼️ tools.recipes and tools.run are on the bridge, run by the one runner', /RECIPES/.test(block('tools.recipes')) && /runRecipe\(/.test(block('tools.run')) && /toolCall\(args/.test(block('tools.run')));
ok('…with the output folder and the policy resolved as flex points', /resolveFlex\('tool\.outDir'/.test(block('tools.run')) && /resolveFlex\('tool\.overwrite'/.test(block('tools.run')));

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
