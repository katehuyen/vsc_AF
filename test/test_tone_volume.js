// U-212 — THE TONES' OWN LEVEL (agentFarm.alerts.toneVolume): each player told it in its own words,
// 100 leaving everything exactly as it always played, and the Sound page's slider + Hear it.
//
//   node test/test_tone_volume.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const V = require(path.join(ROOT, 'out', 'core', 'toneVolume.js'));
const T = require(path.join(ROOT, 'out', 'core', 'turnAlerts.js'));
const { handleAlertMessage } = require(path.join(ROOT, 'out', 'panels', 'alertMessages.js'));
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));
const fx = require(path.join(__dirname, 'fixtures', 'sound.js'));
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, a, b) => ok(n + ` (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b));
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const fire = (el, type) => (el && el._listeners && el._listeners[type] || []).forEach(fn => fn({ stopPropagation() { }, preventDefault() { } }));

// --- the stored level ---
eq('unset, null, empty and garbage are today\'s 100', [undefined, null, '', 'x'].map(V.toneVolumeOf), [100, 100, 100, 100]);
eq('clamped to 0–100 in whole steps', [150, -5, 42.6, '60'].map(V.toneVolumeOf), [100, 0, 43, 60]);
ok('a typed level that is not a number is refused by name',
    ['abc', '', null, true].every(v => !V.parseToneVolume(v).ok) && /0 to 100/.test(V.parseToneVolume('abc').error));
eq('a number is taken, clamped', ['70', 55, 200].map(v => V.parseToneVolume(v).value), [70, 55, 100]);

// --- ‼️ 100 is today, exactly ---
for (const p of ['win32', 'darwin', 'linux']) {
    const c = T.soundCandidates(p, 'C:\\s\\bell.wav');
    ok(`${p}: at 100 (and unset) the players come back untouched`, V.withToneVolume(c, 100, 'x.wav') === c && V.withToneVolume(c, undefined, 'x.wav') === c);
}

// --- each player, its own words ---
const at = (p, asset, v) => V.withToneVolume(T.soundCandidates(p, asset), v, asset);
const wav = 'C:\\s\\bell.wav', mp3 = 'C:\\s\\bell.mp3';
const w = at('win32', wav, 50);
eq('Windows .wav below 100: MediaPlayer first (SoundPlayer has no level), SoundPlayer kept as the last resort',
    w.map(c => c.backend), ['powershell:MediaPlayer', 'ffplay', 'powershell:SoundPlayer']);
ok('…MediaPlayer gets the level per mille, from SoundPlayer\'s full scale (50 → 0.5), the path untouched',
    w[0].env.AF_TURN_VOLUME === '500' && w[0].env.AF_TURN_SOUND === wav);
ok('‼️ an .mp3 is scaled from MediaPlayer\'s own 0.5 (50 → 0.25), so neither kind jumps against the other',
    at('win32', mp3, 50)[0].env.AF_TURN_VOLUME === '250');
ok('ffplay gets -volume', JSON.stringify(w[1].args.slice(-3)) === JSON.stringify(['-volume', '50', wav]));
eq('macOS: afplay -v as a factor', at('darwin', '/s/b.wav', 50)[0].args, ['-v', '0.5', '/s/b.wav']);
const l = at('linux', '/s/b.wav', 50);
eq('Linux order: the leveled players first, aplay last', l.map(c => c.backend), ['paplay', 'pw-play', 'ffplay', 'aplay']);
ok('‼️ paplay is handed the cube root (pa_volume_t is cubic): 50 → ' + Math.round(Math.cbrt(0.5) * 65536),
    l[0].args[0] === `--volume=${Math.round(Math.cbrt(0.5) * 65536)}`);
ok('pw-play gets a linear factor; aplay is left as it was', l[1].args[0] === '--volume=0.5' && JSON.stringify(l[3].args) === JSON.stringify(['-q', '/s/b.wav']));
for (const p of ['win32', 'darwin', 'linux']) {
    const evil = p === 'win32' ? 'C:\\a b;c\'d\\x.wav' : "/a b;c'd/x.wav";
    ok(`${p}: the path stays its own last argument at any level`,
        at(p, evil, 30).every(c => c.args.every(a => a === evil || a.indexOf(evil) < 0) && (c.file === 'powershell' || c.args[c.args.length - 1] === evil)));
}
ok('0 is silence asked of MediaPlayer, not "unset"', at('win32', wav, 0)[0].env.AF_TURN_VOLUME === '0');

// --- the Windows script ---
{
    const script = T.soundCandidates('win32', wav).find(c => c.backend === 'powershell:MediaPlayer').args.join(' ');
    ok('MediaPlayer takes the level only when it is given', /if \(\$env:AF_TURN_VOLUME\) \{ \$p\.Volume = \[int\]\$env:AF_TURN_VOLUME \/ 1000 \};/.test(script));
    ok('…before it plays, and no quote enters the script', script.indexOf('$p.Volume') < script.indexOf('$p.Play()') && !/['"]/.test(script));
}

// --- the player run carries it ---
(async () => {
    const run = async volume => {
        const calls = [];
        await T.playTurnSound(wav, {
            platform: 'win32', exists: () => true, volume,
            execFile: (file, args, opts, cb) => { calls.push({ args, env: opts.env || {} }); cb(null, '', ''); }
        });
        return calls[0];
    };
    const plain = await run(undefined), low = await run(30);
    ok('unset: a .wav still plays through SoundPlayer first, as it always did', /SoundPlayer/.test(plain.args.join(' ')) && !plain.env.AF_TURN_VOLUME);
    ok('at 30: MediaPlayer plays it at 0.3', /MediaPlayer/.test(low.args.join(' ')) && low.env.AF_TURN_VOLUME === '300');

    // --- the host wiring ---
    const ext = src('src/extension.ts');
    eq('‼️ every tone goes through playTone — the one direct call is inside it', (ext.match(/playTurnSound\(/g) || []).length, 1);
    ok('the event, reminder and ▶ paths all use it', (ext.match(/playTone\(/g) || []).length >= 3);
    ok('alerts.volume is on the bridge and alerts.play takes a trial level', /op: 'alerts\.volume'/.test(ext) && /alertsPlayVoice\(argStr\(args, 'voice'\)\.trim\(\), \(args as \{ volume\?: unknown \}\)\.volume\)/.test(ext));
    ok('alerts.status carries the level', /toneVolume: toneVolume\(\),/.test(ext));
    const pkg = JSON.parse(src('package.json')).contributes.configuration;
    const node = (Array.isArray(pkg) ? pkg : [pkg]).map(c => c.properties['agentFarm.alerts.toneVolume']).find(Boolean);
    ok('the setting: 0–100, default 100', node && node.default === 100 && node.minimum === 0 && node.maximum === 100);
    ok('…in the Sound group', require('../out/core/settingsCatalog/index.js').catalogEntry('alerts.toneVolume').group === 'sound');

    const seen = [];
    const deps = { alertsSetToneVolume: async v => { seen.push(['set', v]); }, alertsPlayVoice: async (id, v) => { seen.push(['play', id, v]); } };
    let redrawn = 0;
    const surface = { error: e => seen.push(['error', e]), refresh: () => { redrawn++; } };
    await handleAlertMessage({ type: 'alertToneVolume', volume: 40 }, deps, surface);
    await handleAlertMessage({ type: 'alertPlay', voice: 'bell', volume: '25' }, deps, surface);
    await handleAlertMessage({ type: 'alertPlay', voice: 'bell' }, deps, surface);
    eq('the slider writes through the host act and redraws; Hear it passes its level, ▶ none',
        [seen, redrawn], [[['set', 40], ['play', 'bell', 25], ['play', 'bell', undefined]], 1]);

    // --- the Sound page ---
    const d = fx.inUse();
    d.alerts.toneVolume = 60;
    const r = runPage('sound.js', d);
    const html = r.html();
    const slider = r.query('#alerttonevol')[0];
    ok('a slider under the events, at the stored level', slider && /id="alerttonevol"[^>]*value="60"/.test(html) && /id="alerttonevolval">60</.test(html)
        && html.indexOf('id="alerttonevol"') > html.indexOf('alerttbl') && html.indexOf('id="alerttonevol"') < html.indexOf('sndchans"'));
    ok('‼️ MIRROR — its hover opens on the level', /Tone volume: 60 of 100/.test(html));
    slider.value = '35';
    fire(slider, 'change');
    ok('releasing it writes the level', r.last() && r.last().type === 'alertToneVolume' && r.last().volume === 35);
    const turn = d.alerts.events.find(e => e.event === 'turn-ready').voice;
    r.query('#alerttonehear')[0].click();
    ok('Hear it plays Turn finished\'s tone at the slider\'s level, unsaved', r.last().type === 'alertPlay' && r.last().voice === turn && r.last().volume === 35);
    const tr = runPage('sound.js', d, { __AFUI__: { lang: 'tr', locale: 'tr' } }).html();
    ok('in Turkish', />Ton düzeyi</.test(tr) && /Dinle/.test(tr) && /Ton düzeyi: 100 üzerinden 60/.test(tr));
    const sum = lv => r.sandbox.window.AFSoundCard.summary(Object.assign({}, d.alerts, { toneVolume: lv }));
    ok('the Settings summary names a lowered level, and says nothing at 100', /tones at 60 of 100/.test(sum(60)) && !/tones at/.test(sum(100)));

    console.log(`test_tone_volume: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
