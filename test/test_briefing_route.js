// U-216 — the daily briefing is said one of two ways: with a fal.ai model chosen
// (agentFarm.digestTtsModel) an audio file from fal, as before; with none, this
// computer reads it aloud through the one reading channel — free, the text's own
// language, the player's pause and skip. The choice is pure: ‼️ NOTHING HERE EVER
// REACHES FAL — every way out is a stand-in.
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const ROOT = path.join(__dirname, '..');
const { briefingRoute, speakBriefing } = require(path.join(ROOT, 'out', 'core', 'briefing.js'));

ok('no model, or only spaces: read here', briefingRoute('') === 'local' && briefingRoute('   ') === 'local' && briefingRoute(undefined) === 'local');
ok('a model: fal', briefingRoute('fal-ai/elevenlabs/tts') === 'fal');

/** A briefing with stand-ins that record which way it went. */
function run(model, readAloud) {
    const calls = [];
    const p = speakBriefing({
        model: () => model,
        text: () => 'Today: 3 sessions, 1 error.',
        toFile: async (text, m) => { calls.push(['file', text, m]); return { ok: true, file: 'D:/x/AgentFarm-Briefing.mp3' }; },
        readAloud: readAloud || (async text => { calls.push(['read', text]); return { reading: true }; })
    });
    return p.then(r => ({ r, calls }));
}

(async () => {
    {
        const { r, calls } = await run('');
        ok('‼️ no model: the digest text is read aloud here and fal is never asked',
            calls.length === 1 && calls[0][0] === 'read' && calls[0][1] === 'Today: 3 sessions, 1 error.');
        ok('…a success with no file, marked local', r.ok === true && r.route === 'local' && r.file === undefined);
    }
    {
        const { r, calls } = await run('fal-ai/elevenlabs/tts');
        ok('a model: the text goes to the file way with that model, and nothing is read here',
            calls.length === 1 && calls[0][0] === 'file' && calls[0][2] === 'fal-ai/elevenlabs/tts');
        ok('…its answer as it was, marked fal', r.ok === true && r.file === 'D:/x/AgentFarm-Briefing.mp3' && r.route === 'fal');
    }
    {
        const { r } = await run('', async () => { throw new Error('nothing in it can be spoken'); });
        ok('a reading refused here is a failure that says why', r.ok === false && r.route === 'local' && /nothing in it can be spoken/.test(r.error));
    }

    // ---- the wiring, read off the source: the command, the bridge and the scheduled digest all go through it ----
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    const at = ext.indexOf('const speakDigestNow = ');
    const body = at < 0 ? '' : ext.slice(at, ext.indexOf('\n    });', at));
    ok('speakDigestNow is speakBriefing: the setting, the digest text, the one reading channel as "briefing"',
        /speakBriefing\(\{/.test(body) && /model: \(\) => cfg\(\)\.get<string>\('digestTtsModel', ''\)/.test(body)
        && /text: buildDigestText/.test(body) && /readAloud: text => readNow\(readerDeps, \{ text \}, 'briefing'\)/.test(body));
    ok('…and fal (speakText) is reached only from its file way', /toFile: \(text, model\) => \{[\s\S]*speakText\(text, model/.test(body)
        && ext.split('speakText(').length === 2);
    ok('the command says "saved" only for a file — a reading here shows in the player',
        /const result = await speakDigestNow\(\);[\s\S]{0,300}if \(!result\.file\) \{ return; \}/.test(ext));
    ok('the bridge\'s digest.daily speak:true reaches the same function', /speakDigest: \(\) => \{ void speakDigestNow\(\); \}/.test(ext));
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const d = pkg.contributes.configuration.properties
        ? pkg.contributes.configuration.properties['agentFarm.digestTtsModel']
        : [].concat(pkg.contributes.configuration).map(c => c.properties && c.properties['agentFarm.digestTtsModel']).find(Boolean);
    ok('the setting says what empty means now', !!d && /Empty: this computer reads the briefing aloud/.test(d.description) && !/Empty disables/.test(d.description));

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
