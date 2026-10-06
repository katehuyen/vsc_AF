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
                + ' is noise in the shape of data — ‼️ in DATA rows: the header is not a row (U-204)',
                say('Results:\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |\n\nDone.'),
                'Results: a table of 2 rows. Done.');

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

        // U-204 — WHAT WAS STILL SPELLED OUT (measured): indented code, JSON in a
        // sentence, ids and hashes, stack traces, log runs, file:line. Each is said
        // as its size, its name or "an id".
        {
            const say = t => S.sanitizeForSpeech(t);
            eq('indented code is said like a fenced block, by its size',
                say('Run this:\n\n    npm install\n    npm test\n    node x.js --flag 1\n\nDone.'),
                'Run this: a 3-line code block. Done.');
            eq('…but the indented body of a list item is the item\'s own words',
                say('- first step\n\n    keep this paragraph\n\nDone.'),
                'first step. keep this paragraph. Done.');
            eq('a one-key JSON is a phrase; more is data, said by its keys',
                say('Send `{ "op": "farm.ops" }` and it returns {"ok":true,"result":{"x":1}} now.'),
                'Send op: farm.ops and it returns a JSON object with 2 keys now.');
            eq('…a list of objects by its length', say('Rows: [{"a":1},{"a":2},{"a":3}].'), 'Rows: a JSON list of 3 items.');
            eq('…a pretty-printed block like the code block it is',
                say('Result:\n{\n  "ok": true,\n  "n": 2\n}\nThat is all.'), 'Result: a 4-line code block. That is all.');
            eq('…and a brace in prose, or JSON that does not parse, is left alone',
                say('Use {name} or [1, 2] or { a: 1 } here.'), 'Use name or 1, 2 or a: 1 here.');
            eq('ids and hashes are "an id" — a UUID, a commit, an Agent Farm id',
                say('Session 3f2a9c1e-1aa5-41f1-a9cb-76b125781147, commit b408c739 and chain chn_muqmf6q7001io2 ended.'),
                'Session an id, commit an id and chain an id ended.');
            eq('…but a number, a word and a short hex are not',
                say('In 2026 the deadbeef build 1234567 used #ff00aa.'), 'In 2026 the deadbeef build 1234567 used ff00aa.');
            eq('a file:line reference is a file and a line, a column dropped, a range said as one',
                say('See extension.ts:2703, src/core/speech.ts:509:12 and `a.js:10-20`.'),
                'See extension.ts, line 2703, speech.ts, line 509 and a.js, lines 10 to 20.');
            eq('…and a host with its port is not a file', say('It listens on api.example.com:443 now.'), 'It listens on api.example.com:443 now.');
            eq('a stack trace is said as its length; the error itself is still read',
                say('Error: boom\n    at foo (/x/a.js:1:2)\n    at bar (/x/b.js:3:4)\n\nThen it stopped.'),
                'Error: boom. an error trace of 2 lines. Then it stopped.');
            eq('…a Python traceback too, keeping its last line',
                say('Traceback (most recent call last):\n  File "x.py", line 3, in <module>\n    foo()\nNameError: name foo is not defined'),
                'an error trace of 3 lines. NameError: name foo is not defined.');
            eq('…but an indented prose line beginning with "at" is not a trace',
                say('Meet me\n    at the corner (by the shop)\nlater.'), 'Meet me at the corner (by the shop) later.');
            eq('a run of log lines is said as its length',
                say('2026-10-04 06:40:12 [INFO] start\n2026-10-04 06:40:13 [ERROR] failed\n\nThat is the log.'),
                'a log of 2 lines. That is the log.');
            eq('a header with no data is an empty table; a table with no header counts every row',
                say('| a | b |\n| --- | --- |\n\nand\n\n| 1 | 2 |\n| 3 | 4 |'), 'an empty table. and. a table of 2 rows.');
            eq('‼️ snake_case names keep their words — an underscore inside a word is not emphasis',
                say('The keys last_launch_record and read_now_flag are set, and _this_ is emphasis.'),
                'The keys last launch record and read now flag are set, and this is emphasis.');
        }

        // ------------------------------------------------------------------
        // A-26 (2/4) — THE READING IS INTERRUPTIBLE, AND IT IS ITS OWN CHANNEL.
        //
        // ‼️ WHY IT IS NOT ON THE ARBITER. A-22's contract is that the gap
        // between alerts is measured from the END of a sound; a ninety-second
        // reading submitted to that queue would hold every chime in the farm
        // behind it, and the alert that mattered would arrive after the reading
        // of the turn BEFORE it.
        {
            /** A spawner that never makes a noise and can be killed. */
            const fakeSpawn = () => {
                const spawned = [];
                const execFile = (file, args, opts, cb) => {
                    const child = {
                        killed: false,
                        kill() {
                            this.killed = true;
                            cb(Object.assign(new Error('killed'), { killed: true }), '', '');
                            return true;
                        },
                        finish() { cb(null, '', ''); }
                    };
                    spawned.push(child);
                    return child;
                };
                return { execFile, spawned };
            };
            // U-198 - the long-lived player is not this test: it cannot start, so the one-shot path below is what reads
            const noPlayer = () => { throw Object.assign(new Error('spawn powershell ENOENT'), { code: 'ENOENT' }); };
            const cfg = S.speakConfig({ voice: '' });

            {
                const f = fakeSpawn();
                const sp = new T.DialogueSpeaker();
                const first = sp.speak('The first answer.', cfg,
                    { platform: 'win32', execFile: f.execFile, spawn: noPlayer });
                ok('a reading holds the PROCESS while it runs — a pid can be'
                    + ' recycled between reading it and killing it', sp.speaking === true);
                // ‼️ THE NEWEST TURN WINS. A reading is about what is on the
                // screen NOW; queueing would put the farm minutes behind the
                // conversation, and nobody wants that version.
                const second = sp.speak('The second answer.', cfg,
                    { platform: 'win32', execFile: f.execFile, spawn: noPlayer });
                ok('a new turn KILLS the reading it replaced rather than queueing it',
                    f.spawned[0].killed === true);
                f.spawned[1].finish();
                return Promise.all([first, second]).then(([a, b]) => {
                    // ‼️ INTERRUPTED IS NOT FAILED. A killed player exits
                    // non-zero; saying so keeps "I stopped it" out of the error
                    // the user reads when they heard nothing.
                    ok('…and the cut reading says it was replaced, not that it failed',
                        a.ok === false && /newer turn/.test(a.skipped || ''));
                    ok('the newest reading is the one that reports success', b.ok === true);
                    ok('…and nothing is left holding a process afterwards', sp.speaking === false);
                    return tail();
                });
            }
        }

        function tail() {
            const T2 = T;
            const sp = new T2.DialogueSpeaker();
            ok('stopping when nothing is being read answers false rather than throwing',
                sp.stop() === false);
            return sp.speak('', S.speakConfig({}), { platform: 'win32', execFile: () => ({}) })
                .then(r => {
                    // A turn whose whole content was one code block sanitizes to
                    // a sentence; a turn that sanitizes to NOTHING must not be
                    // handed to a synthesiser as an empty string.
                    ok('a turn with nothing speakable in it is skipped BY NAME,'
                        + ' not spoken as silence',
                        r.ok === false && /nothing to read/.test(r.skipped || ''));
                    // A minute-long reading needs its own clock: 20 s is right
                    // for a sentence and would truncate every long answer.
                    ok('the reading has a ceiling of its own, well past the'
                        + ' announcement\'s', T2.DIALOGUE_TIMEOUT_MS >= 60_000);
                    console.log(`${pass} passed, ${fail} failed`);
                    process.exit(fail ? 1 : 0);
                });
        }
    })();
}
