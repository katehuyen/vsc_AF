// A-18 — WHICH SOUND PLAYS, AND WHY (compiled core/alertVoices.js).
//
// The farm could make exactly one noise, on the one edge where a turn finished.
// Away from the screen, "your turn" and "it is asking you something" were the
// same beep — so the only way to tell them apart was to walk back and look,
// which is the whole thing the sound was for.
//
// What is defended here:
//   - an EVENT and a VOICE are two dimensions and never one. Collapse them and
//     "a different sound for this session" and "a different sound for questions"
//     silently overwrite each other.
//   - ONE PLACE ANSWERS "which sound". The moment two do, "I set it and it
//     played the old one" is a bug nobody can locate.
//   - a voice whose file is gone FALLS THROUGH rather than silencing the alert.
//     Silence is indistinguishable from an alert that never fired.
//   - what plays is read off the BACKEND TABLE, so a page cannot promise an
//     `.mp3` that the player cannot open.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const V = require(path.join(__dirname, '..', 'out', 'core', 'alertVoices.js'));
const T = require(path.join(__dirname, '..', 'out', 'core', 'turnAlerts.js'));

const SOUNDS = 'D:/x/media/sounds';
/** The backend table for one platform, exactly as the player is built from it. */
const backendsFor = (p) => T.soundCandidates(p, 'x').map(c => ({ backend: c.backend, formats: c.formats }));
const win = backendsFor('win32');
const linux = backendsFor('linux');

const base = (over) => Object.assign({
    soundsDir: SOUNDS, backends: win, exists: () => true
}, over || {});

// ---------------------------------------------------------------------------
// the ten, and the one that already shipped
// ---------------------------------------------------------------------------
{
    const list = V.builtinVoices(SOUNDS);
    ok('there are ten built-in voices, which is the number the item asked for',
        list.length === 10);
    ok('…each with an id, a label a person can read, and a file',
        list.every(v => v.id && v.label && v.file && v.builtin === true));
    ok('…and no two share an id', new Set(list.map(v => v.id)).size === 10);

    // ‼️ `chime-soft` IS `turn-ready.wav`. Renaming the asset would have changed
    // the alert of every current install; a "nicer" replacement would have done
    // it silently.
    const soft = list.find(v => v.id === 'chime-soft');
    ok('‼️ chime-soft is the sound that ALREADY SHIPS — turn-ready.wav, not a'
        + ' file named after the new id',
        soft && /turn-ready\.wav$/.test(soft.file));
    ok('…and every other voice is named after its id',
        list.filter(v => v.id !== 'chime-soft')
            .every(v => v.file === SOUNDS + '/' + v.id + '.wav'));

    // The assets are real: the generator wrote them and they are committed.
    const dir = path.join(__dirname, '..', 'media', 'sounds');
    ok('‼️ every built-in voice has a file on disk — a picker offering a sound'
        + ' that is not there is a control that does nothing',
        V.builtinVoices(dir).every(v => fs.existsSync(v.file)));
}

// ---------------------------------------------------------------------------
// ‼️ THE TWO THAT MATTER SOUND DIFFERENT WITHOUT ANYBODY CONFIGURING ANYTHING
// ---------------------------------------------------------------------------
{
    ok('there is a default for every event', V.ALERT_EVENTS.every(e => !!V.DEFAULT_VOICE[e]));
    ok('‼️ "your turn" and "it is asking you" are DIFFERENT sounds out of the'
        + ' box — hearing that difference from another room without configuring'
        + ' anything was the item’s own condition',
        V.DEFAULT_VOICE['turn-ready'] !== V.DEFAULT_VOICE.question);
    ok('…and every default names a voice that really exists',
        V.ALERT_EVENTS.every(e => V.BUILTIN_IDS.indexOf(V.DEFAULT_VOICE[e]) >= 0));
    ok('the five events are the ones the design named',
        V.ALERT_EVENTS.join(',') === 'turn-ready,question,stalled,ended,error');
}

// ---------------------------------------------------------------------------
// the resolution chain — one place, one answer, and it says WHICH STEP
// ---------------------------------------------------------------------------
{
    const r = V.resolveVoice('question', base());
    ok('with nothing set, the built-in default answers',
        r.voice === V.DEFAULT_VOICE.question && r.origin === 'default' && r.playable);

    const withSettings = base({ settings: () => ({ question: 'bell-far' }) });
    ok('the user’s general choice beats the default',
        V.resolveVoice('question', withSettings).origin === 'settings'
        && V.resolveVoice('question', withSettings).voice === 'bell-far');

    const withAgent = base({
        settings: () => ({ question: 'bell-far' }),
        agent: () => ({ question: 'tick-dry' })
    });
    ok('an agent’s choice beats the user’s general one',
        V.resolveVoice('question', withAgent, { agentName: 'developer' }).voice === 'tick-dry');

    const full = base({
        settings: () => ({ question: 'bell-far' }),
        agent: () => ({ question: 'tick-dry' }),
        session: () => ({ question: 'alarm-urgent' })
    });
    const top = V.resolveVoice('question', full, { sessionId: 's1', agentName: 'developer' });
    ok('‼️ and this conversation’s own choice beats them all — four steps, in'
        + ' order, in one function',
        top.voice === 'alarm-urgent' && top.origin === 'session');

    ok('…a step that is set for ANOTHER event does not answer this one',
        V.resolveVoice('ended', full, { sessionId: 's1' }).origin === 'default');
    ok('‼️ …and the answer says WHICH STEP gave it, because "why did it play'
        + ' that?" has to be answerable on the page',
        ['session', 'agent', 'settings', 'default'].indexOf(top.origin) >= 0);
    ok('…an empty string at a step is not an answer, it falls through',
        V.resolveVoice('question', base({ settings: () => ({ question: '  ' }) })).origin === 'default');
}

// ---------------------------------------------------------------------------
// ‼️ A MISSING FILE FALLS THROUGH. IT DOES NOT SILENCE.
// ---------------------------------------------------------------------------
{
    const gone = SOUNDS + '/bell-far.wav';
    const deps = base({
        exists: (f) => f !== gone,
        settings: () => ({ question: 'bell-far' })
    });
    const r = V.resolveVoice('question', deps);
    ok('‼️ a voice whose file the user deleted drops to the next step rather'
        + ' than making no sound — a wrong sound is heard and fixed, and silence'
        + ' is indistinguishable from an alert that never fired',
        r.origin === 'default' && r.voice === V.DEFAULT_VOICE.question && r.playable);
    ok('…and the step it passed over is REPORTED, with the reason and the path —'
        + ' a silent skip looks exactly like a step nobody set',
        r.skipped.length === 1 && r.skipped[0].origin === 'settings'
        && r.skipped[0].voice === 'bell-far' && /bell-far\.wav/.test(r.skipped[0].why));

    const ghost = V.resolveVoice('question', base({ settings: () => ({ question: 'u-deleted' }) }));
    ok('a voice the user has since removed falls through too, and says so',
        ghost.origin === 'default' && /no sound with that name/.test(ghost.skipped[0].why));

    // ‼️ EVEN THE DEFAULT CAN BE GONE — a broken install, a half-finished
    // update. Saying "playable" there would be a promise of a noise nobody hears.
    const broken = V.resolveVoice('question', base({ exists: () => false }));
    ok('‼️ with even the built-in asset missing it reports NOT playable rather'
        + ' than looking fine and making no sound',
        broken.playable === false && broken.voice === V.DEFAULT_VOICE.question);
}

// ---------------------------------------------------------------------------
// ‼️ WHAT PLAYS COMES FROM THE BACKEND TABLE, not from a list kept here
// ---------------------------------------------------------------------------
{
    ok('every platform can open a .wav, which is what the built-ins are',
        V.playableOn({ backends: win }, 'a.wav').ok
        && V.playableOn({ backends: linux }, 'a.wav').ok
        && V.playableOn({ backends: backendsFor('darwin') }, 'a.wav').ok);
    ok('‼️ …and windows can open an .mp3 only because a backend SAYS it can —'
        + ' the answer names that backend',
        V.playableOn({ backends: win }, 'a.mp3').backend === 'powershell:MediaPlayer');
    ok('a format nothing offers is refused rather than accepted and silent',
        !V.playableOn({ backends: win }, 'a.flac').ok
        && !V.playableOn({ backends: win }, 'noextension').ok);
    ok('…and the wav-only backend cannot be the one that claims an mp3',
        win.find(b => b.backend === 'powershell:SoundPlayer').formats.indexOf('mp3') < 0);
    ok('the question is asked of the extension, whatever the case',
        V.extensionOf('A:/X/Sound.MP3') === 'mp3' && V.extensionOf('x') === '');

    // The consistency this whole arrangement exists for.
    const deps = base({ settings: () => ({ question: 'x' }) });
    const withMp3 = Object.assign({}, deps, {
        custom: [{ id: 'u-mine', label: 'Mine', file: 'D:/s/mine.mp3', addedAt: 1 }],
        settings: () => ({ question: 'u-mine' })
    });
    ok('‼️ a user’s .mp3 resolves on windows, where a backend opens it…',
        V.resolveVoice('question', withMp3).voice === 'u-mine');
    ok('‼️ …and falls through on a machine whose only player is wav-only,'
        + ' rather than promising a sound that will never come out',
        V.resolveVoice('question', Object.assign({}, withMp3, {
            backends: [{ backend: 'aplay', formats: ['wav'] }]
        })).origin === 'default');
}

// ---------------------------------------------------------------------------
// the user's own sounds
// ---------------------------------------------------------------------------
{
    const deps = { backends: win, exists: () => true };
    const a = V.addCustomVoice([], { label: 'Gece zili', file: 'D:/s/a.mp3' }, deps, 100);
    ok('a sound of your own is added with a label and a file', a.ok && a.list.length === 1);
    ok('‼️ …under a `u-` id, so it can never collide with a built-in — today’s'
        + ' or one added in a later version',
        a.voice.id === 'u-gece-zili' && V.BUILTIN_IDS.indexOf(a.voice.id) < 0);
    ok('…and the file is NOT copied: "wherever they like" was the ask, and a'
        + ' copy means the sound they edit tomorrow is not the one that plays',
        a.voice.file === 'D:/s/a.mp3');

    const b = V.addCustomVoice(a.list, { label: 'Gece zili', file: 'D:/s/b.mp3' }, deps, 101);
    ok('the same label twice still gets its own id', b.ok && b.voice.id === 'u-gece-zili-2');
    ok('…but the same FILE twice is refused — it would be the same sound listed'
        + ' under two names',
        V.addCustomVoice(a.list, { label: 'Başka', file: 'D:/s/a.mp3' }, deps).ok === false);

    ok('a sound with no name is refused, because the name is what a picker shows',
        V.addCustomVoice([], { label: '  ', file: 'D:/s/a.wav' }, deps).ok === false);
    const missing = V.addCustomVoice([], { label: 'Yok', file: 'D:/s/no.wav' },
        { backends: win, exists: () => false });
    ok('‼️ a file that is not there is refused AT THE DOOR, naming the path —'
        + ' rather than accepted and silent when the alert fires',
        !missing.ok && /D:\/s\/no\.wav/.test(missing.error));
    const bad = V.addCustomVoice([], { label: 'Flac', file: 'D:/s/x.flac' }, deps);
    ok('‼️ …and so is a format nothing on this machine plays, with the list of'
        + ' what it does play in the refusal',
        !bad.ok && /\.mp3/.test(bad.error) && /\.wav/.test(bad.error));

    let list = [];
    for (let i = 0; i < V.CUSTOM_LIMIT; i++) {
        const r = V.addCustomVoice(list, { label: 'S' + i, file: `D:/s/${i}.wav` }, deps);
        list = r.list;
    }
    const over = V.addCustomVoice(list, { label: 'One more', file: 'D:/s/z.wav' }, deps);
    ok(`the limit is ${V.CUSTOM_LIMIT} and it is refused in words, not silently`,
        list.length === V.CUSTOM_LIMIT && !over.ok && /remove one/.test(over.error));

    ok('one of your own can be removed', V.removeCustomVoice(list, list[0].id).ok);
    ok('‼️ a BUILT-IN cannot — removing it would leave a default pointing at'
        + ' nothing, and the refusal names it',
        V.removeCustomVoice(list, 'chime-soft').ok === false);
    ok('…and removing something that is not there says so rather than passing',
        V.removeCustomVoice(list, 'u-nope').ok === false);

    // ----------------------------------------------------------------- A-21
    // Renaming. The one thing this must not do is move the id.
    const named = V.addCustomVoice([], { label: 'Kapı zili', file: 'D:/s/k.mp3' }, deps, 200);
    const ren = V.renameCustomVoice(named.list, named.voice.id, 'Ön kapı');
    ok('one of your own can be renamed', ren.ok && ren.voice.label === 'Ön kapı');
    ok('‼️ THE ID DOES NOT MOVE — it is written into the settings and into any'
        + ' session that picked it, so regenerating it would silently unpick the'
        + ' sound everywhere it was chosen',
        ren.ok && ren.voice.id === named.voice.id && ren.list.length === 1);
    ok('…and the file it points at is untouched',
        ren.ok && ren.voice.file === 'D:/s/k.mp3');
    ok('a built-in cannot be renamed either',
        V.renameCustomVoice(named.list, 'chime-soft', 'Mine now').ok === false);
    ok('renaming something that is not there says so',
        V.renameCustomVoice(named.list, 'u-nope', 'X').ok === false);
    ok('an empty name is refused — it is what every picker shows',
        V.renameCustomVoice(named.list, named.voice.id, '   ').ok === false);
    ok('the list it was handed is not mutated',
        named.list[0].label === 'Kapı zili');
}

// ---------------------------------------------------------------------------
// A-18 step 3 — WHO ARMS AN EDGE: the session's own selection, and the global
// switch, and they ADD rather than gate.
// ---------------------------------------------------------------------------
{
    const plan = (event, actions, on) => T.alertPlan(event, actions, on);

    ok('‼️ NOTHING IS ARMED OUT OF THE BOX — an install that was never'
        + ' configured makes no new noise on any of the five',
        V.ALERT_EVENTS.every(e => plan(e, [], {}).actions.length === 0));

    // ‼️ THE REGRESSION THIS SHAPE EXISTS TO PREVENT. `alerts.on` ships all-off;
    // had it been a GATE, every install that has been playing turn-ready for
    // months would have gone silent on upgrade with nothing saying why.
    ok('an all-off setting cannot silence a session that armed itself',
        JSON.stringify(plan('turn-ready', ['sound', 'toast'], {}).actions) === '["sound","toast"]');
    ok('…and an absent setting object is the same as an empty one',
        JSON.stringify(plan('turn-ready', ['sound'], undefined).actions) === '["sound"]');

    ok('the item\'s OTHER event is armed by the same control',
        JSON.stringify(plan('question', ['sound', 'modal'], {}).actions) === '["sound","modal"]');

    // ‼️ AND ONLY THOSE TWO. A control whose whole text is about turns must not
    // start beeping when a session ENDS.
    ok('a swim-lane selection does not arm ended / stalled / error',
        ['stalled', 'ended', 'error'].every(e => plan(e, ['sound', 'modal'], {}).actions.length === 0));
    ok('…and the two it does arm are named, not guessed',
        JSON.stringify([...T.SESSION_ALERT_EVENTS]) === '["turn-ready","question"]');

    // The global switch is how the other three are ever heard.
    ok('the global switch arms an event no session control reaches',
        JSON.stringify(plan('ended', [], { ended: true }).actions) === '["sound"]');
    ok('‼️ …and it arms the SOUND ONLY — turning on a setting called "alert'
        + ' sounds" must not open modal dialogs across the whole fleet',
        JSON.stringify(plan('stalled', ['modal', 'focus'], { stalled: true }).actions) === '["sound"]');

    // Union, not override: neither authority can take away what the other set.
    const both = plan('turn-ready', ['toast'], { 'turn-ready': true });
    ok('the two authorities add up', JSON.stringify(both.actions) === '["sound","toast"]');
    ok('…and each says it was there, so the page can answer "why did that ring?"',
        both.fromSession === true && both.fromSettings === true);
    ok('a session that armed nothing is not reported as an authority',
        plan('turn-ready', [], { 'turn-ready': true }).fromSession === false);

    ok('the same action from both sides is still one action',
        JSON.stringify(plan('question', ['sound'], { question: true }).actions) === '["sound"]');
    ok('a setting that is off is not a setting that is on',
        plan('ended', [], { ended: false }).actions.length === 0);
    ok('…and neither is anything else somebody wrote in that box',
        plan('ended', [], { ended: 'yes' }).actions.length === 0);
    ok('rubbish in the session selection is dropped rather than run',
        JSON.stringify(plan('turn-ready', ['sound', 'explode'], {}).actions) === '["sound"]');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
