// A-24 — "SOUND ON FINISH" on a task, a schedule and a trigger.
//
// ‼️ WHY THIS FILE EXISTS. The item was held back for three releases by one
// honest objection: the third option, "Silent", could not be built, because the
// two authorities over a sound ADD and neither may subtract (A-20 step 3). A-22
// answered it with the session MUTE, and that is the shape this suite pins —
// three answers reaching three different mechanisms, none of them a new step in
// the resolution chain:
//
//   nothing  → the fleet's chain decides, exactly as before the field existed
//   a tone   → the run's OWN session step (A-23), AND its ♪ armed, or the pick
//              would be stored, drawn and silent whenever the fleet switch is off
//   silent   → the session mute (A-22), the only thing that can take a sound away
//
// The traps measured here: a word that could collide with a real tone id, a
// list that drops an unplayable tone (which would draw the first option and
// report a decision nobody made), and a pick that is applied to a run that has
// already ended.
'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');

// `core/tasks.js` reaches for vscode at load time; `runExtras` is a pure
// function inside it, so the module is given just enough to exist.
class FakeEmitter {
    constructor() { this._cbs = []; }
    get event() { return cb => { this._cbs.push(cb); return { dispose() { } }; }; }
    fire(v) { for (const cb of this._cbs) { cb(v); } }
    dispose() { }
}
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') {
        return {
            EventEmitter: FakeEmitter,
            Disposable: { from: () => ({ dispose() { } }) },
            window: {
                showInformationMessage: () => Promise.resolve(undefined),
                showWarningMessage: () => Promise.resolve(undefined),
                createTerminal: () => ({ show() { }, sendText() { }, dispose() { } }),
                onDidCloseTerminal: () => ({ dispose() { } })
            }
        };
    }
    return origLoad.call(this, request, parent, isMain);
};

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`,
    JSON.stringify(got) === JSON.stringify(want));
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const V = require(path.join(ROOT, 'out', 'core', 'alertVoices.js'));
const B = require(path.join(ROOT, 'out', 'core', 'bridge.js'));
const T = require(path.join(ROOT, 'out', 'core', 'turnAlerts.js'));

const pageJs = read('media', 'tasksPage.js');
const panelTs = read('src', 'panels', 'tasksPanel.ts');
const extTs = read('src', 'extension.ts');
const tasksTs = read('src', 'core', 'tasks.ts');

// ---------- the reserved word, and why it can never be a tone ----------
{
    ok('quiet is a word, not a tone', V.FINISH_SOUND_SILENT === 'silent');
    // ‼️ THE RESERVATION IS A PROPERTY OF THIS FILE, not a hope. Every built-in
    // id is spelled out in it, and every one of the user's own is `u-…` by
    // construction — so the word cannot be shadowed by a sound somebody adds.
    ok('no built-in sound is called that',
        !V.builtinVoices('/sounds').some(v => v.id === V.FINISH_SOUND_SILENT));
    ok('…and a user sound can never be, whatever they name it',
        ['Silent', 'silent', 'SILENT', '  silent  ']
            .every(l => V.customId(l, []) !== V.FINISH_SOUND_SILENT));
}

// ---------- the shape check: what could never be an id is refused ----------
{
    eq('a tone id passes', V.normalizeFinishSound('tick-dry'), 'tick-dry');
    eq('one of the user\'s own passes', V.normalizeFinishSound('u-my-gong'), 'u-my-gong');
    eq('the reserved word passes', V.normalizeFinishSound('silent'), 'silent');
    eq('surrounding space is not a different answer',
        V.normalizeFinishSound('  chime-soft  '), 'chime-soft');
    eq('nothing stays nothing', V.normalizeFinishSound(''), '');
    eq('…and so does an absent field', V.normalizeFinishSound(undefined), '');
    for (const junk of ['two words', 'a/b', '../etc', '-leading', 42, null, {}, ['tick-dry']]) {
        eq('junk is not a sound: ' + JSON.stringify(junk), V.normalizeFinishSound(junk), '');
    }
    ok('an absurdly long value is refused rather than stored',
        V.normalizeFinishSound('a'.repeat(200)) === '');
}

// ---------- the bridge: an agent can say it, and is refused by name ----------
{
    const dims = args => B.bridgeRunDimensions(args);
    const refused = args => {
        try { dims(args); return ''; } catch (e) { return String(e.message); }
    };
    eq('a stated tone rides through', dims({ finishSound: 'bell-far' }).finishSound, 'bell-far');
    eq('and so does the reserved word', dims({ finishSound: 'silent' }).finishSound, 'silent');
    ok('an unstated field is left out entirely, not written as empty',
        !('finishSound' in dims({})) && !('finishSound' in dims({ finishSound: '' })));
    // ‼️ REFUSED WHERE IT IS WRITTEN DOWN. A schedule is a run that has not
    // happened yet; a value stored happily tonight is a sound that does not
    // play at 03:00, with nobody there to notice it did not.
    const why = refused({ finishSound: 'no such thing!' });
    ok('a value nothing could be called is refused by name',
        /finishSound/.test(why) && /silent/.test(why) && /alerts\.voices/.test(why));
    // ‼️ AND IT IS NOT GATED ON THE MODE, unlike the interactive pair beside it:
    // a headless run has no window, but it does end, and it is the one nobody
    // is watching.
    eq('a headless run may state it', dims({ finishSound: 'tick-dry' }).finishSound, 'tick-dry');
}

// ---------- reading one back: null is a different answer from "silent" ----------
{
    const out = o => B.bridgeDimsOut(o);
    eq('a run that says nothing about it reads back as null',
        out({}).finishSound, null);
    eq('a tone reads back as itself', out({ finishSound: 'zen' }).finishSound, 'zen');
    eq('and quiet reads back as the word, not as null',
        out({ finishSound: 'silent' }).finishSound, 'silent');
}

// ---------- the dimension travels with the automation ----------
{
    const R = require(path.join(ROOT, 'out', 'core', 'tasks.js'));
    eq('runExtras carries a clean pick',
        R.runExtras({ finishSound: 'chime-bright' }).finishSound, 'chime-bright');
    ok('…and drops one that could never be an id',
        !('finishSound' in R.runExtras({ finishSound: 'no way' })));
    ok('…and says nothing when nothing was said',
        !('finishSound' in R.runExtras({})));
    ok('every object that runs carries the field',
        /finishSound\?: string;/.test(tasksTs));
    // ‼️ A RETRY SOUNDS THE WAY THE ORIGINAL SOUNDED. The engine and the model
    // had this exact defect once: the rerun of the work you asked to hear
    // finishing is precisely the run you are not watching.
    ok('a retry inherits the original\'s tone',
        /copy\.finishSound = over\?\.finishSound \?\? task\.finishSound;/.test(tasksTs));
    ok('…and both doors take it explicitly rather than by accident',
        (tasksTs.match(/\| 'interactiveTarget' \| 'interactiveClose' \| 'finishSound'/g) || []).length === 2);
}

// ---------- the three answers, against the real store ----------
function fakeState() {
    return {
        map: {}, migration: 0,
        deps() {
            return {
                read: () => this.map,
                write: m => { this.map = JSON.parse(JSON.stringify(m)); },
                readMigration: () => this.migration,
                writeMigration: v => { this.migration = v; }
            };
        }
    };
}
{
    const st = fakeState();
    const s = new T.TurnAlertStore(st.deps());
    // A TONE — the session's own step, plus the ♪ it needs to be heard at all.
    s.setVoice('S1', 'ended', 'bell-far');
    s.set('S1', 'sound', true);
    eq('a tone lands on the run\'s own session step', s.voicesFor('S1'), { ended: 'bell-far' });
    eq('…and arms the sound, or the pick would be silent behind the fleet switch',
        s.actionsFor('S1'), ['sound']);
    ok('…without muting anything', !s.mutedFor('S1'));
    // QUIET — a different mechanism, and it leaves every other choice alone.
    s.setVoice('S2', 'ended', 'tick-dry');
    s.set('S2', 'sound', true);
    s.setMuted('S2', true);
    ok('quiet is the session mute', s.mutedFor('S2'));
    eq('…and it takes nothing away underneath, so unmuting restores the setup',
        [s.voicesFor('S2'), s.actionsFor('S2')], [{ ended: 'tick-dry' }, ['sound']]);
    // NOTHING — no record at all, which is what lets the chain answer as before.
    ok('a run that said nothing leaves no preference behind',
        !s.all().S3 && s.actionsFor('S3').length === 0);
    // ‼️ THE ID IS NOT SECOND-GUESSED (A-23's rule). A tone whose file has gone
    // is stored, skipped by the chain WITH THE REASON, and the step below is
    // heard — a validation copy kept here would go stale the day it is deleted.
    ok('a tone nothing answers is still stored rather than dropped',
        s.setVoice('S4', 'ended', 'u-deleted-gong').ok
        && s.voicesFor('S4').ended === 'u-deleted-gong');
}

// ---------- the form: one row, three answers, and an honest list ----------
{
    ok('the row is drawn for anything that runs',
        /choiceSel\('finishSound', 'Sound on finish', L\.finishSounds, c\.finishSound,/.test(pageJs));
    ok('a new composer opens on "say nothing", not on a tone nobody picked',
        /finishSound: '',/.test(pageJs));
    ok('the half-written draft keeps it across a repaint',
        /v\('finishSound', 'finishSound'\);/.test(pageJs));
    // ‼️ M-26's defect, on a field three days old: `readComposer` reads the box
    // and NOTHING called it when the box changed, so the repaint drew the
    // default back over a choice that had been made.
    ok('…and changing it actually tells the draft',
        /'interactiveTarget', 'interactiveClose', 'finishSound',/.test(pageJs));
    // ‼️ AN UNPLAYABLE TONE IS SHOWN AND DISABLED, NEVER DROPPED (A-25's rule).
    ok('a choice can be drawn and refused at once',
        /\$\{c\.off \? ' disabled' : ''\}/.test(pageJs));
    ok('the list is built with "say nothing" first and quiet last',
        /finishSounds: \[[\s\S]{0,200}id: '', label: 'Default[\s\S]{0,400}FINISH_SOUND_SILENT/.test(panelTs));
    ok('…and an unplayable sound keeps its name and loses its click',
        /label: v\.playable \? v\.label : `\$\{v\.label\} — no player here`,\s*\n\s*off: !v\.playable/
            .test(panelTs));
    // ‼️ SHORTHAND — the box is one cell wide and cuts its own text mid-word.
    // "Default" is the word its three neighbours already use; the sentence
    // behind it lives in the row's tooltip, which has room for it.
    ok('the first option is one word, like the boxes beside it',
        /\{ id: '', label: 'Default' \}/.test(panelTs));
    // Reopening any of the three forms shows what the object actually says.
    ok('all three editors read the saved pick back',
        (panelTs.match(/finishSound: (t|s|dims)\.finishSound \?\? '',/g) || []).length === 3);
    // ‼️ NOT GATED ON THE MODE — see the bridge section above.
    ok('a headless automation may state it',
        /finishSound: normalizeFinishSound\(str\('finishSound'\)\) \|\| undefined,/.test(panelTs));
}

// ---------- the hop that is the whole feature ----------
{
    ok('the pick is written onto the session the run turned out to be',
        /turnAlerts\.setVoice\(sid, 'ended', want\)/.test(extTs));
    ok('quiet goes to the mute instead',
        /want === FINISH_SOUND_SILENT\s*\n\s*\? turnAlerts\.setMuted\(sid, true\)/.test(extTs));
    ok('a tone arms the session\'s sound in the same breath',
        /if \(want !== FINISH_SOUND_SILENT\) \{ turnAlerts\.set\(sid, 'sound', true\); \}/.test(extTs));
    // A declared id (the Console owns its own; a resume was TOLD one) is known
    // at the spawn; the ordinary headless id is deduced from the transcript.
    // Both doors, or the field works on one shape of run and not the other.
    ok('a declared id is preferred over a deduced one',
        /t\.consoleSessionId \|\| t\.resumeSessionId \|\| t\.runSessionId \|\| ''/.test(extTs));
    // ‼️ `\s*` AND NOT `\n` — the checkout decides the line ending, not the
    // author. This read `…();\n` and passed for as long as the file happened to
    // be sitting in the working tree with LF endings; the first time git wrote
    // it back with CRLF the assertion reported a missing behaviour for a source
    // file nobody had edited.
    ok('…and both the task change and the binding pass apply it',
        /taskManager\.onDidChange\(\(\) => applyFinishSounds\(\)\)/.test(extTs)
        && /applyFinishSounds\(\);\s*\};\s*context\.subscriptions\.push\(index\.onDidUpdate/.test(extTs));
    // ‼️ ONCE, AND ONLY WHILE THE RUN IS STILL GOING. A reload must not
    // re-stamp a preference over a finished task the user has since edited by
    // hand, and writing into a conversation that is over announces nothing.
    ok('a finished run is left alone',
        /if \(t\.status !== 'running'\) \{ continue; \}/.test(extTs));
    ok('…and no run is stamped twice',
        /finishSoundDone\.has\(key\)/.test(extTs) && /finishSoundDone\.add\(key\)/.test(extTs));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
