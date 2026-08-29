// U-66 — YOUR TURN alerts: the session is the identity, the sound reports what
// it did, and one turn is one alert.
//
// ‼️ WHAT THIS SUITE EXISTS TO CATCH. The shipped behaviour was: three
// concurrent sessions of one agent shared a single agent-keyed setting (so a
// click on one row changed three), and the sound was a `cp.exec` shell string
// with no callback — when it failed, nothing anywhere said so. Both are
// measurable, and everything below is the measurement.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`,
    JSON.stringify(got) === JSON.stringify(want));

const T = require(path.join(__dirname, '..', 'out', 'core', 'turnAlerts.js'));
const { BridgeRegistry } = require(path.join(__dirname, '..', 'out', 'core', 'bridge.js'));

// ---------------------------------------------------------------- allowlist
{
    ok('known action accepted', T.isTurnAlertAction('sound'));
    ok('unknown action refused', !T.isTurnAlertAction('vibrate'));
    eq('normalize drops junk and de-duplicates',
        T.normalizeActions(['toast', 'sound', 'sound', 'nope', 7, null]), ['sound', 'toast']);
    eq('normalize always uses the row order',
        T.normalizeActions(['toast', 'modal', 'focus', 'sound']),
        ['sound', 'focus', 'modal', 'toast']);
    eq('a non-array is nothing', T.normalizeActions('sound'), []);
}

// ------------------------------------------------------------------- store
/** A globalState stand-in that records the ORDER writes landed in. */
function fakeState(seed) {
    return {
        map: seed ? JSON.parse(JSON.stringify(seed)) : {},
        migration: 0,
        writes: [],
        deps(now) {
            return {
                read: () => this.map,
                write: (m) => {
                    this.map = JSON.parse(JSON.stringify(m));
                    this.writes.push(Object.keys(m).sort().join(','));
                    return Promise.resolve();
                },
                readMigration: () => this.migration,
                writeMigration: (v) => { this.migration = v; },
                now
            };
        }
    };
}

// ‼️ THE HEADLINE: three concurrent sessions of ONE agent, three settings.
{
    const st = fakeState();
    const s = new T.TurnAlertStore(st.deps());
    s.set('S1', 'sound', true);
    s.set('S2', 'focus', true);
    s.set('S2', 'modal', true);
    s.set('S3', 'toast', true);
    eq('session 1 alerts on sound only', s.actionsFor('S1'), ['sound']);
    eq('session 2 alerts on focus+modal', s.actionsFor('S2'), ['focus', 'modal']);
    eq('session 3 alerts on toast only', s.actionsFor('S3'), ['toast']);
    // Turning one off touches nothing else — the whole reported bug, inverted.
    s.set('S2', 'focus', false);
    eq('turning one off leaves the others alone',
        [s.actionsFor('S1'), s.actionsFor('S2'), s.actionsFor('S3')],
        [['sound'], ['modal'], ['toast']]);
    ok('a session nobody armed alerts on nothing — no agent fallback',
        s.actionsFor('S4').length === 0);
}

// Refusals, and an empty selection that is an absence rather than a record.
{
    const st = fakeState();
    const s = new T.TurnAlertStore(st.deps());
    const bad = s.set('S1', 'vibrate', true);
    ok('unknown action refused by name', !bad.ok && /vibrate/.test(bad.error));
    ok('empty sessionId refused', !s.set('', 'sound', true).ok);
    ok('replace refuses a non-array', !s.replace('S1', 'sound').ok);
    ok('replace refuses an unknown member', !s.replace('S1', ['sound', 'buzz']).ok);
    s.replace('S1', ['sound', 'toast']);
    eq('replace sets the whole selection', s.actionsFor('S1'), ['sound', 'toast']);
    s.replace('S1', []);
    eq('an empty selection clears the record', Object.keys(s.all()), []);
}

// ---------------------------------------------------------------------------
// ‼️ A-23 — THE `session` STEP OF THE SOUND CHAIN, WHICH NOTHING WROTE.
//
// `alertVoices.resolveVoice` has read this step since A-18 and its hook was
// never bound, so "this conversation in this tone" fell through on every
// resolution. It lives in THIS store rather than one of its own because the
// rekey, the TTL, the ceiling and the forget a session preference needs are
// already here, and a second copy of them would drift on the first change.
// ---------------------------------------------------------------------------
{
    const st = fakeState();
    const s = new T.TurnAlertStore(st.deps());
    eq('a session with no opinion answers with nothing', s.voicesFor('S1'), {});
    ok('an unknown event is refused BY NAME',
        !s.setVoice('S1', 'turn-finished', 'bell-far').ok
        && /turn-finished/.test(s.setVoice('S1', 'turn-finished', 'x').error));
    ok('an empty sessionId is refused', !s.setVoice('', 'question', 'bell-far').ok);
    s.setVoice('S1', 'question', 'bell-far');
    eq('a pick is kept per EVENT, not per session',
        s.voicesFor('S1'), { question: 'bell-far' });
    s.setVoice('S1', 'turn-ready', 'chime-bright');
    eq('two events, two tones, one session',
        s.voicesFor('S1'), { 'turn-ready': 'chime-bright', question: 'bell-far' });
    eq('and nobody else caught it', s.voicesFor('S2'), {});

    // ‼️ THE TWO QUESTIONS ARE SEPARATE. "Alert me about this one" and "in this
    // voice" are different, and clearing the boxes must not silently unpick a
    // tone chosen from another surface entirely.
    s.set('S1', 'sound', true);
    s.replace('S1', []);
    eq('clearing the four boxes leaves the tone alone',
        s.voicesFor('S1'), { 'turn-ready': 'chime-bright', question: 'bell-far' });
    eq('…and the record survives to carry it', Object.keys(s.all()), ['S1']);

    // ‼️ CLEARING IS NOT MUTING. An empty voice hands the answer back to the
    // step below; there is no "this session is silent" in the chain.
    s.setVoice('S1', 'turn-ready', '');
    eq('an empty voice clears that step only', s.voicesFor('S1'), { question: 'bell-far' });
    s.setVoice('S1', 'question', '');
    eq('with nothing left to say, the record goes', Object.keys(s.all()), []);

    // The value is NOT checked here on purpose: whether a tone still exists,
    // still has a file and can still be played is asked at RESOLUTION time, by
    // the one function that can answer it. A second opinion stored here would
    // go stale the moment the user deletes the file.
    ok('an id nothing answers is still stored — the chain skips it later',
        s.setVoice('S9', 'error', 'u-deleted-yesterday').ok
        && s.voicesFor('S9').error === 'u-deleted-yesterday');
}

// A tone travels with its session through the rename and back off disk.
(async () => {
    const st = fakeState();
    const s = new T.TurnAlertStore(st.deps());
    s.setVoice('cli:codex:dev:1', 'question', 'ask-rise');
    s.rekey('cli:codex:dev:1', '019ff43f-real');
    eq('‼️ the tone follows the session under its real name',
        s.voicesFor('019ff43f-real'), { question: 'ask-rise' });
    eq('nothing is left under the synthetic id', s.voicesFor('cli:codex:dev:1'), {});
    await s.flush();
    const again = new T.TurnAlertStore(st.deps());
    eq('and it survives a reload', again.voicesFor('019ff43f-real'), { question: 'ask-rise' });
})();

// Garbage in the voices field is dropped without taking the record with it.
{
    const st = fakeState({
        A: { sessionId: 'A', actions: ['sound'], voices: { question: 'ask-rise', nonsense: 'x', ended: 7 }, updatedAt: 1, lastSeenAt: 1 },
        B: { sessionId: 'B', actions: [], voices: { ended: 'close-fall' }, updatedAt: 1, lastSeenAt: 1 },
        C: { sessionId: 'C', actions: [], voices: { nope: 'x' }, updatedAt: 1, lastSeenAt: 1 }
    });
    const s = new T.TurnAlertStore(st.deps());
    eq('an unknown event key is dropped, the good one kept',
        s.voicesFor('A'), { question: 'ask-rise' });
    eq('a non-string tone is dropped too', s.voicesFor('A').ended, undefined);
    eq('‼️ a record with only a TONE survives — it used to need actions',
        s.voicesFor('B'), { ended: 'close-fall' });
    eq('a record left with nothing readable at all is dropped',
        Object.keys(s.all()).sort(), ['A', 'B']);
}

// Persistence across a reload, and writes that land in order.
(async () => {
    const st = fakeState();
    const s = new T.TurnAlertStore(st.deps());
    s.set('S1', 'sound', true);
    s.set('S1', 'toast', true);
    s.set('S2', 'modal', true);
    await s.flush();
    eq('writes landed in the order they were made',
        st.writes, ['S1', 'S1', 'S1,S2']);
    const again = new T.TurnAlertStore(st.deps());
    eq('preferences survive a reload', again.actionsFor('S1'), ['sound', 'toast']);
    eq('and so does the other session', again.actionsFor('S2'), ['modal']);

    // Garbage in storage is dropped, not repaired into something we then act on.
    const dirty = fakeState({
        good: { sessionId: 'good', actions: ['sound'], updatedAt: 1, lastSeenAt: 1 },
        empty: { sessionId: 'empty', actions: [], updatedAt: 1, lastSeenAt: 1 },
        junk: 'sound',
        weird: { sessionId: 'weird', actions: ['sound', 'vibrate'] }
    });
    const loaded = new T.TurnAlertStore(dirty.deps());
    eq('unreadable records dropped, readable ones kept',
        Object.keys(loaded.all()).sort(), ['good', 'weird']);
    eq('an unknown action inside a good record is dropped',
        loaded.actionsFor('weird'), ['sound']);

    // ---------------------------------------------------------------- re-key
    {
        const k = fakeState();
        const s2 = new T.TurnAlertStore(k.deps());
        s2.set('cli:codex:developer:1786000000000', 'sound', true);
        const r = s2.rekey('cli:codex:developer:1786000000000', '019ff43f-real');
        ok('adoption moves the preference to the real id', r.ok);
        eq('and the choice is intact', s2.actionsFor('019ff43f-real'), ['sound']);
        eq('nothing is left under the synthetic id',
            s2.actionsFor('cli:codex:developer:1786000000000'), []);
        // ‼️ A target that already has its own record is a CONFLICT, not a merge.
        s2.set('cli:x', 'toast', true);
        s2.set('real2', 'modal', true);
        const c = s2.rekey('cli:x', 'real2');
        ok('a re-key onto an occupied id is refused', !c.ok && c.reason === 'conflict');
        eq('and the occupant is untouched', s2.actionsFor('real2'), ['modal']);
        eq('as is the source', s2.actionsFor('cli:x'), ['toast']);
        ok('re-keying an id with no record says so', s2.rekey('nope', 'x').reason === 'absent');
        ok('same-id re-key refused', s2.rekey('a', 'a').reason === 'same');
    }

    // ------------------------------------------------------------ TTL / LRU
    {
        let t = 1_000_000;
        const k = fakeState();
        const s3 = new T.TurnAlertStore(k.deps(() => t));
        s3.set('old', 'sound', true);
        s3.set('new', 'sound', true);
        s3.seen(['new']);
        t += T.TURN_ALERT_TTL_MS + 1;
        s3.seen(['new']);            // touches `new`, which also prunes `old`
        eq('a session unseen past the TTL is forgotten',
            Object.keys(s3.all()), ['new']);

        const k2 = fakeState();
        let t2 = 1;
        const s4 = new T.TurnAlertStore(k2.deps(() => t2++));
        for (let i = 0; i < T.TURN_ALERT_MAX + 25; i++) { s4.set('S' + i, 'sound', true); }
        ok('the map is bounded', Object.keys(s4.all()).length === T.TURN_ALERT_MAX);
        ok('and it is the newest-seen that stayed', !!s4.all()['S' + (T.TURN_ALERT_MAX + 24)]);
    }

    // ---------------------------------------------------------- migration
    {
        const k = fakeState();
        const s5 = new T.TurnAlertStore(k.deps());
        s5.set('S3', 'toast', true);          // already has its own choice
        const legacy = { developer: ['sound', 'modal'], '3f8a1c2b': ['focus'] };
        const liveSessions = [
            { sessionId: 'S1', agentName: 'developer' },
            { sessionId: 'S2', agentName: 'developer' },
            { sessionId: 'S3', agentName: 'developer' },
            { sessionId: '3f8a1c2b-9d21-4e70-8c33-77e0a1b2c3d4' },   // unresolved agent
            { sessionId: 'S9', agentName: 'psikolog' }               // nothing legacy
        ];
        const r = s5.migrateFromAgentDefaults(legacy, liveSessions);
        ok('the one-time copy ran', r.migrated && r.copied === 3);
        eq('every live session of that agent starts from the old selection',
            s5.actionsFor('S1'), ['sound', 'modal']);
        eq('…and so does the second one', s5.actionsFor('S2'), ['sound', 'modal']);
        eq('a session that already chose is not overwritten', s5.actionsFor('S3'), ['toast']);
        eq('the 8-char fallback key the old page used is honoured',
            s5.actionsFor('3f8a1c2b-9d21-4e70-8c33-77e0a1b2c3d4'), ['focus']);
        eq('an agent with no legacy entry gets nothing', s5.actionsFor('S9'), []);
        // ‼️ AND FROM HERE THEY ARE INDEPENDENT — the point of the whole item.
        s5.set('S1', 'sound', false);
        eq('a later change on one does not reach the other',
            [s5.actionsFor('S1'), s5.actionsFor('S2')], [['modal'], ['sound', 'modal']]);
        // Idempotent: a second activation copies nothing, even with more sessions.
        const again2 = s5.migrateFromAgentDefaults(legacy, liveSessions);
        ok('the migration never runs twice', !again2.migrated && again2.copied === 0);
        const reloaded = new T.TurnAlertStore(k.deps());
        ok('and the marker survives a reload',
            !reloaded.migrateFromAgentDefaults(legacy, liveSessions).migrated);
    }

    // ------------------------------------------------ A-26 (3/4) read aloud
    //
    // A per-session switch, and the thing that breaks a per-session switch is
    // never the setter — it is the OTHER setters, and the reload. Each is one
    // list in the store (`keep` and `sanitize`), and a field added to one and
    // not the other fails silently. That is what these defend.
    {
        const k = fakeState();
        const s6 = new T.TurnAlertStore(k.deps());

        ok('a session nobody asked for is not read', !s6.readAloudFor('R1'));
        ok('turning it off on a session with no record is not an error',
            s6.setReadAloud('R1', false).ok);
        eq('and it wrote no record to say "not reading"', Object.keys(s6.all()), []);

        s6.setReadAloud('R1', true);
        ok('the switch answers where the turn-ended edge reads it',
            s6.readAloudFor('R1'));
        ok('a second click the same way is done, not an error',
            s6.setReadAloud('R1', true).ok);

        // ‼️ THE ONLY PREFERENCE THIS SESSION HAS. Dropped by `sanitize` it
        // would survive exactly until the next window reload — the reading
        // would stop by itself and nothing would say why.
        await s6.flush();
        const back = new T.TurnAlertStore(k.deps());
        ok('a session whose ONLY preference is the reading survives a reload',
            back.readAloudFor('R1'));

        // ‼️ EVERY OTHER SETTER MUST CARRY IT — that is what `keep` is for.
        s6.set('R1', 'sound', true);
        ok('arming a box does not stop the reading', s6.readAloudFor('R1'));
        s6.setMuted('R1', true);
        ok('muting the session does not stop the reading either',
            s6.readAloudFor('R1'));
        s6.setVoice('R1', 'question', 'chime');
        ok('picking a tone does not stop the reading', s6.readAloudFor('R1'));
        s6.setSpeechVoice('R1', 'Tolga');
        ok('choosing the announcing voice does not stop the reading',
            s6.readAloudFor('R1'));

        // …and it takes nothing away on its way out.
        s6.setReadAloud('R1', false);
        eq('turning the reading off leaves the boxes alone',
            s6.actionsFor('R1'), ['sound']);
        ok('…and the mute', s6.mutedFor('R1'));
        eq('…and the tone', s6.voicesFor('R1').question, 'chime');
        eq('…and the voice', s6.speechVoiceFor('R1'), 'Tolga');

        // A session with nothing else to say leaves no record behind — absence,
        // not a record that says "not reading".
        const k2 = fakeState();
        const s7 = new T.TurnAlertStore(k2.deps());
        s7.setReadAloud('R2', true);
        s7.setReadAloud('R2', false);
        eq('a session with nothing else left is forgotten, not recorded as off',
            Object.keys(s7.all()), []);

        // ‼️ A-20'S OWN FIELD, FIXED HERE. `speechVoice` was written by its
        // setter, carried by `keep` and asked for by `speechVoiceFor` — and
        // never read back by `sanitize`, so a chosen voice was lost on every
        // window reload, and a session that had only chosen a voice was dropped
        // whole. Found while adding the field beside it.
        const k3 = fakeState();
        const s8 = new T.TurnAlertStore(k3.deps());
        s8.setSpeechVoice('V1', 'Microsoft Tolga - Turkish (Turkey)');
        await s8.flush();
        const back2 = new T.TurnAlertStore(k3.deps());
        eq('the announcing voice survives a reload',
            back2.speechVoiceFor('V1'), 'Microsoft Tolga - Turkish (Turkey)');
        ok('…and a session whose only choice was that voice is still there',
            !!back2.all()['V1']);
    }

    // ------------------------------------------------------------- dedupe
    {
        const d = new T.TurnKeyDedupe();
        ok('the first turn fires', d.shouldFire('S1', '3'));
        ok('the SAME turn announced twice fires once — Notification then Stop',
            !d.shouldFire('S1', '3'));
        ok('a new turn fires again however fast it lands', d.shouldFire('S1', '4'));
        ok('another session is independent', d.shouldFire('S2', '3'));
        ok('and stays independent', !d.shouldFire('S2', '3'));
        d.rekey('S2', 'S2-real');
        ok('the dedupe record travels with the adoption', !d.shouldFire('S2-real', '3'));
        d.forget('S1');
        ok('a cleared session starts over', d.shouldFire('S1', '4'));
        const small = new T.TurnKeyDedupe(3);
        for (let i = 0; i < 20; i++) { small.shouldFire('X' + i, '1'); }
        ok('the dedupe map is bounded', small.shouldFire('X0', '1'));
    }

    // -------------------------------------------------------------- sound
    {
        // ‼️ NO SHELL STRING ANYWHERE. The asset path must never appear inside a
        // command argument on Windows — it travels as an environment variable,
        // so a folder called `C:\my "stuff"; rm` is not a code question at all.
        const evil = 'C:\\a b\\"; calc.exe & \\turn.wav';
        const win = T.soundCandidates('win32', evil);
        // ‼️ A-20 — THE ORDER FOLLOWS THE FORMAT, and on a `.wav` the cheap
        // player leads. `SoundPlayer` is in `System.dll`, already loaded;
        // `MediaPlayer` pulls in PresentationCore first — 0.6 s of overhead
        // against 1.2 s, measured. `.wav` is what every built-in voice is, so
        // this is the path the alert takes almost every time. It is still the
        // FALLBACK for everything else, because it opens nothing else.
        eq('windows leads with SoundPlayer on a .wav',
            win.map(c => c.backend),
            ['powershell:SoundPlayer', 'powershell:MediaPlayer', 'ffplay']);
        eq('…and with MediaPlayer on anything SoundPlayer cannot open',
            T.soundCandidates('win32', 'C:\\x.mp3').map(c => c.backend),
            ['powershell:MediaPlayer', 'powershell:SoundPlayer', 'ffplay']);
        // ‼️ AND THE EXTENSION-LESS PROBE GETS THE WHOLE TABLE AS DECLARED.
        // `alertVoices.playableOn` calls it that way to ask "can anything here
        // open that file?"; a reordered or filtered answer would make an
        // unplayable format look like a platform with no players at all.
        eq('…while an extension-less probe gets the table as declared',
            T.soundCandidates('win32', '').map(c => c.backend),
            ['powershell:MediaPlayer', 'powershell:SoundPlayer', 'ffplay']);

        // ‼️ NO SHELL STRING ANYWHERE. The path may be an `execFile` argument
        // OF ITS OWN — that is the safe form — but it must never appear glued
        // inside a longer argument, which is what a command string is.
        for (const p of ['win32', 'darwin', 'linux']) {
            ok(`${p} never glues the path into a longer argument`,
                T.soundCandidates(p, evil).every(c =>
                    c.args.every(a => a === evil || a.indexOf(evil) < 0)));
        }
        ok('…and both windows shells hand it over as an environment variable',
            win.filter(c => c.file === 'powershell')
                .every(c => c.env.AF_TURN_SOUND === evil));
        ok('and the players are real ones, not Console.Beep',
            win.every(c => !/beep/i.test(c.args.join(' '))));

        const mp = win.find(c => c.backend === 'powershell:MediaPlayer');
        const mpScript = mp.args.join(' ');
        // ‼️ A-20 — THE WINDOWS PLAYER ASKS THE FILE HOW LONG IT IS.
        // `MediaPlayer` is a WPF DispatcherObject and `MediaEnded` is raised on
        // a Dispatcher that `powershell -Command` never runs: measured, the
        // event NEVER arrived, the process sat in its poll loop for 17.7 s, was
        // killed by the outer timeout, and every Windows alert was really
        // played by the fallback eight seconds after the turn it announced.
        // `NaturalDuration` is filled in by the media engine and needs no
        // dispatcher — which is also how a refused file becomes an exit code
        // instead of the silent success the event version returned.
        ok('‼️ it waits on the file’s own duration, not on an event that never fires',
            /NaturalDuration/.test(mpScript)
            && !/MediaEnded|Register-ObjectEvent/.test(mpScript));
        ok('…and a file no codec can open leaves as exit 3, with a sentence for it',
            /exit 3/.test(mpScript) && /codec/.test(mp.codes[3]));
        // The script travels through execFile argument escaping before
        // PowerShell parses it, and a quoted diagnostic is the kind of thing
        // that survives on one Node version and breaks on the next. The exit
        // CODE carries the meaning; the sentence lives in `codes`, in
        // TypeScript, where this test can read it.
        ok('…and not one quote enters either windows script',
            win.filter(c => c.file === 'powershell')
                .every(c => c.args.every(a => a.indexOf('"') < 0 && a.indexOf("'") < 0)));

        ok('macOS uses afplay with the path as an ARGUMENT',
            T.soundCandidates('darwin', evil)[0].args[0] === evil);
        eq('linux tries pulse, pipewire, ffmpeg, then alsa',
            T.soundCandidates('linux', 'x').map(c => c.backend),
            ['paplay', 'pw-play', 'ffplay', 'aplay']);

        // ‼️ EVERY BACKEND DECLARES WHAT IT CAN OPEN, beside itself. The trap is
        // a page that accepts an `.mp3` over a player that only knows `.wav`:
        // the row says playable and the alert is silence. `alertVoices.playableOn`
        // answers from THIS list, so the promise and the player cannot disagree.
        for (const p of ['win32', 'darwin', 'linux']) {
            ok(`${p} declares the formats of every backend it offers`,
                T.soundCandidates(p, 'x').every(c =>
                    Array.isArray(c.formats) && c.formats.length && c.formats.indexOf('wav') >= 0));
        }
        const backend = (p, b) => T.soundCandidates(p, 'x').find(c => c.backend === b);
        ok('…and the wav-only backend says so, rather than claiming everything',
            backend('win32', 'powershell:SoundPlayer').formats.join(',') === 'wav');

        // ‼️ A-20 — VORBIS IS NOT PROMISED BY ANY BUILT-IN PLAYER, because it is
        // in none of them. Windows carries Media Foundation handlers for
        // flac/mp3/m4a/wma and — read out of the registry, not assumed — NONE
        // for `.ogg`: the Web Media Extensions that carry it are a Store
        // package present on some installs and not others. CoreAudio has never
        // read it either. Declaring it would be the exact trap this table
        // exists to prevent — the row says playable, the alert is silence, and
        // nothing anywhere reports an error.
        ok('‼️ ogg is NOT claimed by the built-in windows or macOS players',
            backend('win32', 'powershell:MediaPlayer').formats.indexOf('ogg') < 0
            && backend('darwin', 'afplay').formats.indexOf('ogg') < 0);
        ok('…but it has a real, named route on every platform through ffmpeg',
            ['win32', 'darwin', 'linux'].every(p =>
                backend(p, 'ffplay').formats.indexOf('ogg') >= 0));
        ok('…and FLAC, which Windows and CoreAudio both do read, IS claimed',
            backend('win32', 'powershell:MediaPlayer').formats.indexOf('flac') >= 0
            && backend('darwin', 'afplay').formats.indexOf('flac') >= 0
            && backend('linux', 'paplay').formats.indexOf('flac') >= 0);
    }

    /** An execFile stand-in driven by a script of outcomes, one per call. */
    function execScript(steps) {
        const calls = [];
        const fn = (file, args, opts, cb) => {
            calls.push({ file, args, opts });
            const step = steps.shift() || { };
            // A spawn that blows up does so on the CALL, which is the case the
            // old `try/catch` around a fire-and-forget `cp.exec` could not see.
            if (step.throw) { throw step.throw; }
            setTimeout(() => cb(step.err || null, '', step.stderr || ''), 0);
        };
        fn.calls = calls;
        return fn;
    }
    const exists = () => true;

    {
        const r = await T.playTurnSound('', { platform: 'win32', exists, execFile: execScript([]) });
        ok('a missing asset is reported, not swallowed',
            !r.ok && r.backend === 'none' && /missing/.test(r.error));
        const r2 = await T.playTurnSound('C:\\x.wav',
            { platform: 'win32', exists: () => false, execFile: execScript([]) });
        ok('a path that is not there is named in the error', !r2.ok && /x\.wav/.test(r2.error));
    }
    {
        const ex = execScript([{}]);
        const r = await T.playTurnSound('C:\\turn.wav',
            { platform: 'win32', exists, execFile: ex });
        ok('a clean run reports ok with exit 0',
            r.ok && r.exitCode === 0 && r.backend === 'powershell:SoundPlayer');
        ok('the child is hidden and bounded by a timeout',
            ex.calls[0].opts.windowsHide === true && ex.calls[0].opts.timeout > 0);
        ok('the asset is in the child environment',
            ex.calls[0].opts.env.AF_TURN_SOUND === 'C:\\turn.wav');
    }
    {
        const err = Object.assign(new Error('exited'), { code: 3 });
        const r = await T.playTurnSound('C:\\turn.wav', {
            platform: 'win32', exists,
            // ‼️ BOTH windows backends have to fail here, or the fallback
            // rescues the run — which is exactly what having one is for, and
            // not what this assertion is about.
            execFile: execScript([
                { err, stderr: 'no audio device' }, { err, stderr: 'no audio device' },
                { err, stderr: 'no audio device' }
            ])
        });
        ok('a non-zero exit is a failure with its code',
            !r.ok && r.exitCode === 3 && /no audio device/.test(r.stderr));
    }
    {
        const err = Object.assign(new Error('killed'), { killed: true });
        const r = await T.playTurnSound('C:\\turn.wav',
            {
                platform: 'win32', exists, timeoutMs: 1234,
                execFile: execScript([{ err }, { err }, { err }])
            });
        ok('a timeout is reported as one', !r.ok && r.timedOut && /1234/.test(r.error));
    }
    {
        // A player that is not installed is a reason to try the next one, not a
        // failure of the alert.
        const enoent = Object.assign(new Error('spawn paplay ENOENT'), { code: 'ENOENT' });
        const ex = execScript([{ err: enoent }, {}]);
        const r = await T.playTurnSound('/tmp/turn.wav',
            { platform: 'linux', exists, execFile: ex });
        ok('linux falls through to the second backend', r.ok && r.backend === 'pw-play');
        ok('both were really tried', ex.calls.length === 2);
    }
    {
        const boom = execScript([{ throw: new Error('spawn exploded') },
            { throw: new Error('again') }, { throw: new Error('and again') },
            { throw: new Error('and once more') }]);
        const r = await T.playTurnSound('/tmp/turn.wav',
            { platform: 'linux', exists, execFile: boom });
        ok('a synchronous spawn failure is caught and reported',
            !r.ok && /exploded|again/.test(r.error));
    }
    {
        // ‼️ A-20 — THE FORMAT PICKS THE PLAYERS, BEFORE ANYTHING IS SPAWNED.
        // Walking the whole table regardless of format spawns a process that is
        // certain to fail and then, because the last attempt was what came back,
        // overwrote the real story with its own: an `.mp3` used to end carrying
        // SoundPlayer's "wav only" complaint, while what MediaPlayer said had
        // already been thrown away.
        const ex = execScript([{}]);
        const r = await T.playTurnSound('C:\\x.mp3', { platform: 'win32', exists, execFile: ex });
        ok('an .mp3 goes straight to the player that can open it',
            r.ok && r.backend === 'powershell:MediaPlayer' && ex.calls.length === 1);
        const ex2 = execScript([{}]);
        const r2 = await T.playTurnSound('C:\\x.ogg', { platform: 'win32', exists, execFile: ex2 });
        ok('…and an .ogg reaches ffmpeg without wasting a spawn on the two that cannot',
            r2.ok && r2.backend === 'ffplay' && ex2.calls.length === 1);
        const ex3 = execScript([{}]);
        const r3 = await T.playTurnSound('C:\\x.mid', { platform: 'win32', exists, execFile: ex3 });
        ok('‼️ a format nothing here can open spawns NOTHING, and says what does play',
            !r3.ok && ex3.calls.length === 0
            && /\.mid/.test(r3.error) && /wav/.test(r3.error) && /flac/.test(r3.error));
    }
    {
        // ‼️ A-20 — WHEN THEY ALL FAILED, THE ONE THAT EXPLAINS IT IS REPORTED.
        // The chain ENDS on `ffplay`, which most machines do not have, so "the
        // last attempt is the answer" would reply to every silent alert with
        // `spawn ffplay ENOENT` and bury the sentence produced two backends
        // earlier. A player that is absent is not why the alert was silent.
        const enoent = Object.assign(new Error('spawn ffplay ENOENT'), { code: 'ENOENT' });
        const refused = Object.assign(new Error('Command failed: powershell -NoProfile'), { code: 3 });
        const r = await T.playTurnSound('C:\\turn.wav', {
            platform: 'win32', exists,
            execFile: execScript([{ err: enoent }, { err: refused }, { err: enoent }])
        });
        ok('‼️ the codec’s refusal is reported, not the missing player after it',
            !r.ok && r.backend === 'powershell:MediaPlayer'
            && /codec/.test(r.error) && !/ENOENT/.test(r.error));
        const allGone = await T.playTurnSound('C:\\turn.wav', {
            platform: 'win32', exists,
            execFile: execScript([{ err: enoent }, { err: enoent }, { err: enoent }])
        });
        ok('…and when every player is absent, that is what it says',
            !allGone.ok && allGone.missing === true && /ENOENT/.test(allGone.error));
    }

    // ------------------------------------------------------------ dispatch
    {
        const seen = [];
        const runners = {
            sound: () => Promise.resolve({ backend: 'test', ok: true, exitCode: 0, stderr: '', startedAt: 0, durationMs: 3 }),
            focus: () => { seen.push('focus'); },
            modal: () => { seen.push('modal'); },
            toast: () => { seen.push('toast'); }
        };
        const all = await T.runTurnAlerts(['sound', 'focus', 'modal', 'toast'], runners);
        eq('all four branches report ok', all.map(b => b.status),
            ['ok', 'ok', 'ok', 'ok']);
        ok('the sound branch refuses to claim it was HEARD',
            /human ear/.test(all[0].detail));
        eq('the other three really ran', seen, ['focus', 'modal', 'toast']);

        const partial = await T.runTurnAlerts(['focus'], runners);
        eq('unselected branches are reported as skipped, not hidden',
            partial.map(b => b.action + ':' + b.status),
            ['sound:skipped', 'focus:ok', 'modal:skipped', 'toast:skipped']);

        // ‼️ ONE BRANCH FAILING MUST NOT CUT THE OTHERS — the reported symptom
        // was "the sound is dead", and the answer is that the rest still ran.
        const broken = await T.runTurnAlerts(['sound', 'focus', 'modal', 'toast'], {
            sound: () => Promise.resolve({
                backend: 'powershell:SoundPlayer', ok: false, exitCode: 1,
                stderr: 'no device', startedAt: 0, durationMs: 9, error: 'exited 1'
            }),
            focus: () => { throw new Error('no editor group'); },
            modal: () => { seen.push('modal2'); },
            toast: () => Promise.reject(new Error('notifications off'))
        });
        eq('each branch stands or falls alone',
            broken.map(b => b.action + ':' + b.status),
            ['sound:failed', 'focus:failed', 'modal:ok', 'toast:failed']);
        ok('the sound failure carries its own words', /exited 1/.test(broken[0].detail));
        ok('a thrown branch carries its message', /no editor group/.test(broken[1].detail));
        ok('a rejected promise is caught too', /notifications off/.test(broken[3].detail));
    }
    {
        let t = 0;
        const rl = new T.RateLimit(1000, () => t);
        ok('the first complaint is allowed', rl.allow());
        t = 500;
        ok('the second inside the window is not', !rl.allow());
        t = 1600;
        ok('and it opens again later', rl.allow());
    }

    // ------------------------------------------------- bridge op contracts
    //
    // The three ops are registered in extension.ts (the parity gate proves
    // that). What is worth a test here is the CONTRACT they promise: an
    // unknown action refused by name, an unknown session refused rather than
    // stored, an 8-char prefix accepted, and a test that reports four branches
    // through the same core the page uses.
    {
        const st2 = fakeState();
        const store = new T.TurnAlertStore(st2.deps());
        const sessions = [
            { sessionId: '407c78cb-2f1a-4d55-9e10-1b2c3d4e5f60', agentName: 'developer' },
            { sessionId: '019ff43f-ff3d-7790-9431-63799a45b1b2', agentName: 'developer' }
        ];
        const find = (raw) => sessions.find(s => s.sessionId === raw || s.sessionId.startsWith(raw));
        const reg = new BridgeRegistry();
        reg.register([
            {
                op: 'live.alerts.get',
                describe: 'read',
                handler: () => ({
                    actions: [...T.TURN_ALERT_ACTIONS],
                    sessions: sessions.map(s => ({
                        sessionId: s.sessionId, live: true, actions: store.actionsFor(s.sessionId)
                    }))
                })
            },
            {
                op: 'live.alerts.set',
                describe: 'write',
                handler: (args) => {
                    const s = find(String(args.sessionId || ''));
                    if (!s) { throw new Error(`no live session matches "${args.sessionId}"`); }
                    const r = args.actions !== undefined
                        ? store.replace(s.sessionId, args.actions)
                        : store.set(s.sessionId, args.action, args.enabled === undefined ? true : !!args.enabled);
                    if (!r.ok) { throw new Error(r.error); }
                    return { sessionId: s.sessionId, actions: store.actionsFor(s.sessionId) };
                }
            },
            {
                op: 'live.alerts.test',
                describe: 'test',
                handler: async (args) => {
                    const s = find(String(args.sessionId || ''));
                    if (!s) { throw new Error(`no live session matches "${args.sessionId}"`); }
                    const actions = store.actionsFor(s.sessionId);
                    if (!actions.length) { throw new Error('nothing selected'); }
                    const branches = await T.runTurnAlerts(actions, {
                        // ‼️ TEST DOUBLES: no real sound, no real modal.
                        sound: () => Promise.resolve({
                            backend: 'double', ok: true, exitCode: 0, stderr: '',
                            startedAt: 0, durationMs: 1
                        }),
                        focus: () => { }, modal: () => { }, toast: () => { }
                    });
                    return { ok: true, sessionId: s.sessionId, actions, branches };
                }
            }
        ]);
        const call = (op, args) => reg.dispatch(op, args || {});

        ok('every op is in the catalogue with a describe',
            ['live.alerts.get', 'live.alerts.set', 'live.alerts.test']
                .every(o => reg.catalog().some(e => e.op === o && e.describe)));

        let r = await call('live.alerts.set', { sessionId: '407c78cb', action: 'sound' });
        ok('an 8-char prefix reaches the right session',
            r.ok && r.result.sessionId === sessions[0].sessionId);
        eq('and the action landed', r.result.actions, ['sound']);

        r = await call('live.alerts.set', { sessionId: '407c78cb', action: 'vibrate' });
        ok('an unknown action is refused by name', !r.ok && /vibrate/.test(r.error));

        r = await call('live.alerts.set', { sessionId: 'nobody', action: 'sound' });
        ok('an unwatched session is refused', !r.ok && /no live session/.test(r.error));

        r = await call('live.alerts.set', { sessionId: '019ff43f', actions: ['focus', 'modal'] });
        eq('the second session takes its own selection', r.result.actions, ['focus', 'modal']);
        r = await call('live.alerts.get');
        eq('…and the two never share one', r.result.sessions.map(s => s.actions),
            [['sound'], ['focus', 'modal']]);

        r = await call('live.alerts.test', { sessionId: '019ff43f' });
        ok('the test runs through the shared dispatcher', r.ok && r.result.branches.length === 4);
        eq('and reports each branch on its own',
            r.result.branches.map(b => b.action + ':' + b.status),
            ['sound:skipped', 'focus:ok', 'modal:ok', 'toast:skipped']);

        await call('live.alerts.set', { sessionId: '019ff43f', actions: [] });
        r = await call('live.alerts.test', { sessionId: '019ff43f' });
        ok('a session with nothing selected refuses the test',
            !r.ok && /nothing selected/.test(r.error));
    }

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
