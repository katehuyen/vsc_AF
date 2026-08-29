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
    // ‼️ WINDOWS KEEPS ITS VOICES IN TWO REGISTRIES AND `System.Speech` SEES
    // ONE. Every language pack a user installs from Settings lands in
    // `Speech_OneCore`, which `SelectVoice` can neither list nor choose —
    // measured on the machine this was written on, SAPI 5 had two en-US voices
    // while OneCore had four, one of them Turkish, installed and unreachable.
    // The COM server underneath reaches both, by token id.
    eq('windows leads with the COM voice, which can reach BOTH registries',
        win.map(c => c.backend), ['sapi:SpVoice', 'powershell:SpeechSynthesizer']);
    ok('‼️ …and it really does look in both, so an installed language pack is'
        + ' selectable rather than merely present',
        win[0].args.join(' ').indexOf('Speech_OneCore\\Voices\\Tokens') >= 0
        && win[0].args.join(' ').indexOf('Microsoft\\Speech\\Voices\\Tokens') >= 0);
    ok('…by loading the token by ID, which is the only call that sees OneCore',
        /SetId/.test(win[0].args.join(' ')));
    for (const c of win) {
        ok(`‼️ ${c.backend}: the text is NOT interpolated into the command`,
            c.args.every(a => a.indexOf(evil) < 0) && c.env.AF_SPEAK_TEXT === evil);
        ok(`…and ${c.backend} gets the voice, rate and volume the same way`,
            c.env.AF_SPEAK_VOICE === 'Microsoft Zira Desktop'
            && c.env.AF_SPEAK_RATE === '3' && c.env.AF_SPEAK_VOLUME === '80');
        // ‼️ SYNCHRONOUS ON PURPOSE. An async call returns while the sentence
        // is still being spoken, and the queue's gap is measured from the END
        // of the process — the next lane's chime would land mid-sentence.
        ok(`…and ${c.backend} uses the BLOCKING call the alert queue depends on`,
            /\.Speak\(/.test(c.args.join(' ')) && !/SpeakAsync/.test(c.args.join(' ')));
        ok(`…and ${c.backend} reports an empty text as a named code, not silence`,
            /exit 4/.test(c.args.join(' ')) && /nothing to say/.test(c.codes[4]));
        // ‼️ A WRONG VOICE IS NOT A SMALLER FAILURE THAN NO VOICE — it is a
        // harder one to diagnose. The first version caught the error and fell
        // back to the system default, so a user who asked for Turkish got
        // English and was told it worked.
        ok(`‼️ ${c.backend}: a name nothing answers FAILS rather than quietly`
            + ' using the default voice',
            /exit 5/.test(c.args.join(' ')) && /matched that name/.test(c.codes[5]));
    }

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
        const rows = [
            'HKEY_LOCAL_MACHINE\\...\\Speech\\Voices\\Tokens\\ZIRA\tMicrosoft Zira Desktop\ten-US\tsapi5',
            'HKEY_LOCAL_MACHINE\\...\\Speech_OneCore\\Voices\\Tokens\\Tolga\tMicrosoft Tolga\ttr-TR\tonecore',
            'HKEY_LOCAL_MACHINE\\...\\Speech_OneCore\\Voices\\Tokens\\Odd\tSomebody Else\t\tonecore'
        ].join('\n') + '\n';
        const list = await T.installedSpeechVoices({
            platform: 'win32', execFile: execScript([{ stdout: rows }])
        });
        ok('every voice on the machine is listed, from BOTH registries, with the'
            + ' culture and the engine it came from',
            list.ok && list.voices.length === 3
            && list.voices.find(v => v.name === 'Microsoft Tolga').engine === 'onecore'
            && list.voices.find(v => v.name === 'Microsoft Tolga').culture === 'tr-TR');
        ok('…and each carries the token id, which is what selects it unambiguously',
            list.voices.every(v => v.id.indexOf('HKEY_') === 0));
        // The question a reader brings to this list is "is there one that speaks
        // MY language", and registry order answers a different one.
        eq('…sorted by culture, with the ones that name no language last',
            list.voices.map(v => v.culture), ['en-US', 'tr-TR', '']);
        const nope = await T.installedSpeechVoices({ platform: 'linux', execFile: execScript([{}]) });
        ok('…and where they cannot be listed, THAT is said rather than "none"',
            !nope.ok && nope.voices.length === 0 && /Windows-only/.test(nope.error));

        // ------------------------------------------- this conversation's voice
        // ‼️ ONE VOICE FOR EIGHT LANES IS THE WRONG SHAPE the moment two of
        // them are worth telling apart BY EAR. Same chain as the tones: the
        // session answers first, and having no opinion falls through to the
        // fleet rather than to silence.
        const store = new T.TurnAlertStore({
            read: () => ({}), write: () => { }, readMigration: () => 1, writeMigration: () => { }
        });
        store.setVoice('s1', 'question', 'af_zen_chime');
        store.set('s1', 'sound', true);
        store.setMuted('s1', true);
        store.setSpeechVoice('s1', 'Microsoft Tolga');
        ok('a session can be announced in a voice of its own',
            store.speechVoiceFor('s1') === 'Microsoft Tolga');
        // ‼️ EACH SETTER ANSWERS ONE QUESTION AND LEAVES THE OTHERS ALONE.
        // Three separate spread expressions in three setters is a rule that
        // holds only until somebody adds a fourth field and updates two.
        ok('…and adding it did not quietly undo the tone, the box or the mute',
            store.voicesFor('s1').question === 'af_zen_chime'
            && store.actionsFor('s1').indexOf('sound') >= 0
            && store.mutedFor('s1') === true
            && store.speechVoiceFor('s1') === 'Microsoft Tolga');
        store.setMuted('s1', false);
        store.replace('s1', []);
        ok('‼️ …and clearing the boxes and the mute STILL leaves the voice alone',
            store.speechVoiceFor('s1') === 'Microsoft Tolga');
        store.setSpeechVoice('s1', '');
        ok('clearing hands the answer back to the fleet, which is not silence',
            store.speechVoiceFor('s1') === '');
        // ‼️ AND CLEARING IT DID NOT DROP THE TONE EITHER — the record is still
        // here because the session still has one, which is the same rule read
        // from the other side.
        ok('…while the tone this session chose is still its own',
            store.voicesFor('s1').question === 'af_zen_chime');
        store.setVoice('s1', 'question', '');
        ok('…and only when NOTHING is left is the record gone, rather than kept'
            + ' as a row that says "nothing"',
            !store.all()['s1']);

        // ------------------------------------------------------------- A-25
        // ‼️ ONE EVENT AT A TIME, AND THE ORDER IS THE DECLARED ONE. The rule
        // lives in the core because two surfaces tick these boxes and a copy
        // in each would be free to disagree about duplicates and order — a
        // settings file that reads backwards from the card that wrote it.
        {
            const off = S.speakConfig({});
            eq('A-25 — arming an event ADDS it to the list',
                S.speakEvents(off, 'error', true), ['question', 'error']);
            eq('…and the order is the events\' own, never the click order',
                S.speakEvents(S.speakConfig({ events: ['error'] }), 'question', true),
                ['question', 'error']);
            eq('…arming what is already armed changes nothing (it is a SET)',
                S.speakEvents(off, 'question', true), ['question']);
            eq('…and disarming the last one leaves an EMPTY list, which is a'
                + ' switch that is on with nothing selected — not "announce'
                + ' everything" and not an error',
                S.speakEvents(off, 'question', false), []);
        }
        // ‼️ WHICH VOICE THE SETTING ACTUALLY REACHES. `voice` is a loose
        // fragment on purpose, so nobody has to paste a registry path — and the
        // cost is that the SETTING stops saying what will be heard.
        {
            const list = S.parseVoiceList([
                'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Speech_OneCore\\Voices\\Tokens\\Tolga'
                    + '\tMicrosoft Tolga - Turkish (Turkey)\ttr-TR\tonecore',
                'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Speech_OneCore\\Voices\\Tokens\\David'
                    + '\tMicrosoft David - English (United States)\ten-US\tonecore',
                'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Speech\\Voices\\Tokens\\David'
                    + '\tMicrosoft David Desktop\ten-US\tsapi5'
            ].join('\n'));
            ok('A-25 — a fragment finds the voice, the way the engine does',
                (S.matchVoice(list, 'Tolga') || {}).name === 'Microsoft Tolga - Turkish (Turkey)');
            ok('…case does not matter, because a name typed by hand never matches case',
                (S.matchVoice(list, 'tolga') || {}).name === 'Microsoft Tolga - Turkish (Turkey)');
            ok('‼️ …OneCore is searched BEFORE SAPI 5, exactly as the engine'
                + ' walks them — otherwise the strip would name one voice and'
                + ' another would speak',
                (S.matchVoice(list, 'David') || {}).engine === 'onecore');
            ok('…a full token id is taken as an id and not as a fragment',
                (S.matchVoice(list,
                    'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Speech\\Voices\\Tokens\\David')
                || {}).name === 'Microsoft David Desktop');
            ok('‼️ …and a name NOBODY answers to is null, never the nearest'
                + ' thing: the engine\'s own reply is `exit 5`, because a wrong'
                + ' voice is not a smaller failure than no voice, it is a'
                + ' harder one to diagnose',
                S.matchVoice(list, 'Ayşe') === null);
            ok('…an empty setting is not a search — it is the system default',
                S.matchVoice(list, '') === null && S.matchVoice(list, '  ') === null);
            ok('‼️ a picker names a voice by its LANGUAGE as well, because that'
                + ' is what the choice is made on — an en-US voice reading'
                + ' Turkish is not accented, it is unintelligible',
                S.voiceLabel(S.matchVoice(list, 'Tolga')).indexOf('tr-TR') > 0
                && S.voiceLabel(S.matchVoice(list, 'Tolga')).indexOf('onecore') > 0);
            eq('…and a voice with no declared language says so rather than'
                + ' showing a blank the reader has to interpret',
                S.voiceLabel({ id: 'x', name: 'Nameless', culture: '', engine: 'sapi5' }),
                'Nameless · no language declared · sapi5');
        }

        // ------------------------------------------------------------------
        // A-26 — READING A TURN ALOUD: what markdown SOUNDS like.
        //
        // ‼️ THIS IS THE HALF OF THE FEATURE NOBODY WOULD EVER DEBUG BY EAR.
        // An announcement is a sentence somebody wrote for a voice; a turn is
        // markdown written for a SCREEN. Handed to a synthesiser unchanged, a
        // three-line shell snippet is read character by character for half a
        // minute and the sentence after it is lost behind the noise — so the
        // reading is a SPOKEN PARAPHRASE, not the text minus some markup.
        {
            const say = t => S.sanitizeForSpeech(t);

            eq('a fenced block becomes its SIZE — the one thing an ear can use,'
                + ' because the code itself is on the screen to be looked at',
                say('Fixed it.\n\n```js\nconst a = 1;\nconst b = 2;\n```\n\nTests pass.'),
                'Fixed it. a 2-line code block. Tests pass.');
            eq('…one line is said as one line, not as "1"',
                say('```\nnpm test\n```'), 'a one-line code block.');
            // ‼️ MEASURED WRONG ONCE: with `m`, `$` matches at every LINE end,
            // so a lazy body plus `(?:closing|$)` closed the block after its
            // FIRST line and read the rest of the code out as prose. Closed
            // blocks and the unclosed tail are two passes for that reason.
            eq('‼️ a fence that is never closed — a half-streamed turn — takes'
                + ' the rest of the text with it rather than being read out',
                say('Here:\n\n```sh\nnpm test\nnpm run package'),
                'Here: a 2-line code block.');

            eq('a table becomes its size; read cell by cell with no columns it'
                + ' is noise in the shape of data',
                say('Results:\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |\n\nDone.'),
                'Results: a table of 3 rows. Done.');

            // ‼️ THE SYMBOL IS KEPT AND THE PATH IN FRONT OF IT IS NOT. A
            // camel-cased name is a phrase a voice says perfectly well and it
            // is usually the SUBJECT of the sentence; the directories are
            // separators read out one by one and nobody says them aloud.
            eq('inline code keeps its content, and a path keeps its file name',
                say('I changed `alertGateStrip` in `media/settings.js` and it works.'),
                'I changed alertGateStrip in settings.js and it works.');
            eq('…and a path in plain prose is treated the same way',
                say('Look at src/core/speech.ts for the rule.'),
                'Look at speech.ts for the rule.');

            eq('a link becomes its label, and a bare URL becomes the word — no'
                + ' one has ever needed a URL spelled at them',
                say('See [the guide](https://example.com/a/b) and https://x.io/y now.'),
                'See the guide and a link now.');

            // ‼️ A BULLET IS A SENTENCE. The marker is what separated two items
            // on a screen; take it away without a stop in its place and the two
            // are heard as one clause.
            eq('headings and list items each end as their own sentence',
                say('## What changed\n\n- one thing\n- another thing\n\n1. first\n2. second'),
                'What changed. one thing. another thing. first. second.');

            eq('symbol runs become a pause, not a word each',
                say('Done ‼️ → the gate · the strip --- **bold** _it_ ~~no~~'),
                'Done the gate the strip bold it no.');

            eq('nothing to read is an empty answer, not a noise', say('   \n\n  '), '');
            eq('…and so is a turn that was only a code block',
                say('```\n```'), 'a one-line code block.');

            // ‼️ THE CUT SAYS SO. A reading that simply stops is
            // indistinguishable from an answer that really was that short.
            const long = 'Sentence one is here. '.repeat(90);
            const cut = say(long);
            ok('a long answer is cut at the ceiling and SAYS there is more',
                cut.length <= S.DIALOGUE_MAX + S.DIALOGUE_MORE.length + 2
                && cut.endsWith(S.DIALOGUE_MORE));
            ok('…at a sentence end, because stopping mid-clause sounds like a crash',
                /\. There is more\.$/.test(cut));
            eq('a short answer is not touched at all',
                say('All done.'), 'All done.');
            ok('the ceiling can be lifted for a caller that wants everything',
                S.sanitizeForSpeech(long, 0).length > S.DIALOGUE_MAX);
            // A ceiling with no sentence end in reach still lands on a word.
            const oneLong = 'x'.repeat(40) + ' ' + 'y'.repeat(40);
            ok('…and with no sentence end in reach it lands on a word boundary',
                !/\sy*$/.test(S.cutForSpeech(oneLong, 50).replace(' ' + S.DIALOGUE_MORE, '')));
        }

        console.log(`${pass} passed, ${fail} failed`);
        process.exit(fail ? 1 : 0);
    })();
}
