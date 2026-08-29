// A-20 — SAYING WHICH AGENT, when a tone can only say that something happened
// (compiled core/speech.js + turnAlerts.speakAnnouncement).
//
// Twenty voices answer "what KIND of news is this?" and nothing else. With
// eight lanes running, the question from the next room is WHICH ONE, and no
// palette can carry a name.
//
// What is defended here:
//   - the text NEVER enters a command string. It is written by the user, in a
//     settings box, with an agent's NAME substituted into it.
//   - every backend BLOCKS until it has finished speaking. The alert queue
//     measures its gap from the end of a player's process; a backend that
//     returned as soon as it started talking would let the next lane's chime
//     land in the middle of this one's sentence.
//   - the substitution is deliberately dumb: a mistyped placeholder is HEARD,
//     because one that vanishes is a bug with no symptom.
//   - it ships OFF, and announces only `question` — the one event where an
//     agent is STOPPED.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, a, b) => ok(n + ` (got ${JSON.stringify(a)})`,
    JSON.stringify(a) === JSON.stringify(b));

const S = require(path.join(__dirname, '..', 'out', 'core', 'speech.js'));
const T = require(path.join(__dirname, '..', 'out', 'core', 'turnAlerts.js'));

// ---------------------------------------------------------------- the config
{
    const d = S.speakConfig({});
    ok('‼️ it ships OFF — a machine that talks unbidden is one people switch'
        + ' off entirely, taking the tones with it',
        d.on === false);
    eq('…and announces only the event where an agent is STOPPED',
        d.events, ['question']);
    ok('every default is the documented one',
        d.template === S.SPEAK_DEFAULT.template && d.rate === 0 && d.volume === 100);

    ok('rubbish does not throw, it answers with something that works',
        S.speakConfig(null).on === false && S.speakConfig(undefined).template.length > 0
        && S.speakConfig({ rate: 'x', volume: {} }).rate === 0);
    ok('the rate is clamped to SAPI’s own scale',
        S.speakConfig({ rate: 99 }).rate === 10 && S.speakConfig({ rate: -99 }).rate === -10);
    ok('…and the volume to 0–100',
        S.speakConfig({ volume: 500 }).volume === 100
        && S.speakConfig({ volume: -5 }).volume === 0);
    eq('an event nobody knows is dropped rather than stored',
        S.speakConfig({ events: ['question', 'nonsense', 'ended'] }).events,
        ['question', 'ended']);
    eq('…and the same event twice is once', S.speakConfig({ events: ['ended', 'ended'] }).events,
        ['ended']);
    // ‼️ AN EMPTY LIST IS A REAL STATE. "On, with nothing selected" is
    // something the page has to be able to SHOW; silently correcting it to
    // "everything" would announce five events nobody asked for.
    eq('an empty list stays empty rather than becoming everything',
        S.speakConfig({ events: [] }).events, []);
    ok('an empty template falls back rather than announcing nothing',
        S.speakConfig({ template: '   ' }).template === S.SPEAK_DEFAULT.template);
    // ‼️ A CEILING, because every announcement holds the whole fleet's alerts
    // for as long as it runs.
    ok('a template that grew a paragraph is cut',
        S.speakConfig({ template: 'x'.repeat(900) }).template.length === S.SPEAK_MAX);
}

// ------------------------------------------------------------ what it says
{
    const cfg = S.speakConfig({ template: '{agent}, {event}' });
    ok('the agent and the event are substituted',
        S.announcement(cfg, { event: 'question', agent: 'developer' })
        === 'developer, asking you');
    ok('‼️ an unknown placeholder is spoken as typed — one that vanished would'
        + ' be a bug with no symptom at all',
        /agnet/.test(S.announcement(S.speakConfig({ template: '{agnet} here' }), { event: 'ended' })));
    ok('a session with no agent name still says something',
        S.announcement(cfg, { event: 'question' }).indexOf('an agent') === 0);
    ok('an empty {session} does not leave a stray comma behind',
        S.announcement(S.speakConfig({ template: '{agent}, {session}, {event}' }),
            { event: 'ended', agent: 'basit' }) === 'basit, session ended');
    ok('the sentence is capped at the same ceiling the template is',
        S.announcement(S.speakConfig({ template: '{agent}' }),
            { event: 'ended', agent: 'x'.repeat(400) }).length === S.SPEAK_MAX);

    ok('speaks() is false while the switch is off, whatever is selected',
        !S.speaks(S.speakConfig({ on: false, events: ['question'] }), 'question'));
    ok('…and false for an event that was not selected',
        !S.speaks(S.speakConfig({ on: true, events: ['question'] }), 'ended'));
    ok('…and true for the one that was',
        S.speaks(S.speakConfig({ on: true, events: ['question'] }), 'question'));
}

// --------------------------------------------------------- the backend table
{
    // ‼️ THE TEXT IS WRITTEN BY THE USER AND CARRIES AN AGENT'S NAME. An agent
    // called `"; calc.exe &` must be a strange name and nothing else.
    const evil = 'developer"; calc.exe & echo $(whoami), asking you';
    const cfg = S.speakConfig({ voice: 'Microsoft Zira Desktop', rate: 3, volume: 80 });

    const win = S.speakCandidates('win32', evil, cfg);
    eq('windows speaks through System.Speech, which every install has had for'
        + ' twenty years', win.map(c => c.backend), ['powershell:SpeechSynthesizer']);
    ok('‼️ the text is NOT interpolated into the command — it travels as an'
        + ' environment variable',
        win[0].args.every(a => a.indexOf(evil) < 0) && win[0].env.AF_SPEAK_TEXT === evil);
    ok('…and so do the voice, the rate and the volume',
        win[0].env.AF_SPEAK_VOICE === 'Microsoft Zira Desktop'
        && win[0].env.AF_SPEAK_RATE === '3' && win[0].env.AF_SPEAK_VOLUME === '80');
    // ‼️ SYNCHRONOUS ON PURPOSE. `SpeakAsync` would return while the sentence
    // is still being spoken, and the queue's gap is measured from the END of
    // the process — the next lane's chime would land mid-sentence.
    ok('‼️ it uses the BLOCKING call, which is what the alert queue depends on',
        /\$s\.Speak\(/.test(win[0].args.join(' '))
        && !/SpeakAsync/.test(win[0].args.join(' ')));
    ok('…and an empty text leaves as a named exit code rather than silence',
        /exit 4/.test(win[0].args.join(' ')) && /nothing to say/.test(win[0].codes[4]));

    const mac = S.speakCandidates('darwin', evil, cfg);
    ok('macOS hands the text to `say` as an ARGUMENT of its own',
        mac[0].file === 'say' && mac[0].args[mac[0].args.length - 1] === evil
        && mac[0].args.slice(0, -1).every(a => a.indexOf(evil) < 0));
    // `say` counts words per minute and SAPI counts −10…10; the user should
    // not have to know there are two scales.
    ok('…and the rate is mapped onto its words-per-minute, not passed raw',
        mac[0].args.indexOf('-r') >= 0
        && Number(mac[0].args[mac[0].args.indexOf('-r') + 1]) > 100);
    ok('…and a chosen voice is named', mac[0].args.indexOf('-v') >= 0);
    ok('a voice left empty is not passed as an empty flag',
        S.speakCandidates('darwin', 'x', S.speakConfig({})).find(c => c.args.indexOf('-v') >= 0)
        === undefined);

    const lin = S.speakCandidates('linux', evil, cfg);
    eq('linux tries speech-dispatcher, then espeak',
        lin.map(c => c.backend), ['spd-say', 'espeak']);
    ok('‼️ …and BOTH wait until the sentence has been spoken',
        lin[0].args.indexOf('-w') >= 0);
    ok('…with the text after `--`, so a sentence starting with a dash is text'
        + ' and not a flag',
        lin.every(c => c.args[c.args.length - 2] === '--'
            && c.args[c.args.length - 1] === evil));
}

// ------------------------------------------------------------- speaking it
{
    const calls = [];
    const execScript = steps => {
        const fn = (file, args, opts, cb) => {
            calls.push({ file, args, opts });
            const step = steps.shift() || {};
            setTimeout(() => cb(step.err || null, step.stdout || '', step.stderr || ''), 0);
        };
        return fn;
    };
    (async () => {
        const cfg = S.speakConfig({ on: true });
        const r = await T.speakAnnouncement('developer, asking you', cfg,
            { platform: 'win32', execFile: execScript([{}]) });
        ok('a clean run reports ok and says WHAT it said',
            r.ok && r.spoke === 'developer, asking you');
        ok('the child is hidden and bounded by a timeout',
            calls[0].opts.windowsHide === true && calls[0].opts.timeout > 0);

        // ‼️ NOTHING TO SAY IS NOT A BROKEN SYNTHESISER. Reported as a failure
        // it raises the broken-backend warning and teaches the user to ignore
        // the one message that matters.
        const empty = await T.speakAnnouncement('   ', cfg,
            { platform: 'win32', execFile: execScript([{}]) });
        ok('‼️ an empty sentence is `skipped` with a reason, never `failed`',
            !empty.ok && !empty.error && /nothing to say/.test(empty.skipped));

        const err = Object.assign(new Error('spawn spd-say ENOENT'), { code: 'ENOENT' });
        const gone = await T.speakAnnouncement('x', cfg,
            { platform: 'linux', execFile: execScript([{ err }, { err }]) });
        ok('a machine with no synthesiser says so rather than pretending',
            !gone.ok && gone.missing === true);

        // An unnamed platform gets the Unix players — the same answer
        // `soundCandidates` gives, so there is ONE mental model rather than
        // two, and a BSD is far likelier to have `espeak` than to have nothing.
        const other = await T.speakAnnouncement('x', cfg,
            { platform: 'sunos', execFile: execScript([{}]) });
        ok('an unnamed platform is given the unix players, as the tones are',
            other.ok && other.backend === 'spd-say');

        // ‼️ THE VOICE LIST IS ASKED OF THE MACHINE. A Turkish sentence read by
        // `Microsoft David` is the commonest way this feature disappoints, and
        // the fix is a free language pack the user has to be told about.
        const list = await T.installedSpeechVoices({
            platform: 'win32',
            execFile: execScript([{ stdout: 'Microsoft David Desktop\ten-US\nMicrosoft Zira Desktop\ten-US\n' }])
        });
        ok('the installed voices are read from the machine, with their cultures',
            list.ok && list.voices.length === 2 && list.voices[1].culture === 'en-US');
        const nope = await T.installedSpeechVoices({ platform: 'linux', execFile: execScript([{}]) });
        ok('…and where they cannot be listed, THAT is said rather than "none"',
            !nope.ok && nope.voices.length === 0 && /Windows-only/.test(nope.error));

        console.log(`${pass} passed, ${fail} failed`);
        process.exit(fail ? 1 : 0);
    })();
}
