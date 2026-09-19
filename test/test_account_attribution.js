// X-333 — WHICH SIGN-IN REALLY RAN THIS, when the launch record cannot say.
//
// The complaint that opened it: a card reading `last used 3d ago`, or `today —
// nothing ran here`, for an account used an hour ago and three times that day.
// X-251 made the LaunchManifest the only reader on purpose — the alternative
// then was guessing the machine's current sign-in onto an unplaced run, which
// puts one account's dollars on another's card. That refusal is still right.
// What was wrong is that a manifest was treated as the only RECORD there is.
//
// What this suite pins is that the extra layers are records and not guesses,
// and above all the one trap that makes the richest of them dangerous:
// `.claude.json` is copied when a slot is CAPTURED, so its history belongs to
// the account it was copied from. Measured on this machine 2026-09-20 — five
// session ids identical under all four Claude slots. A value that is not
// unique across slots proves nothing and must be DROPPED, never shared out.
'use strict';
const path = require('path');
const A = require(path.join(__dirname, '..', 'out', 'core', 'accountAttribution.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// ---------- the copy guard ----------
{
    // The measured shape: one session id written under four slots because the
    // capture copied the file, and one that only ever appeared under its own.
    const records = [
        { slot: 'claude-a', sessionId: 'copied' },
        { slot: 'claude-b', sessionId: 'copied' },
        { slot: 'claude-c', sessionId: 'copied' },
        { slot: 'claude-d', sessionId: 'copied' },
        { slot: 'claude-b', sessionId: 'real' }
    ];
    const kept = A.uniqueSlotRecords(records);
    ok('‼️ A SESSION ID UNDER MORE THAN ONE SLOT IS A COPY AND IS DROPPED',
        kept.length === 1 && kept[0].sessionId === 'real' && kept[0].slot === 'claude-b');
    ok('…and it is dropped rather than given to the first slot alphabetically',
        !kept.some(r => r.sessionId === 'copied'));
    // Two slots is already enough to be a copy; it does not take four.
    ok('two slots naming one session is already a copy',
        A.uniqueSlotRecords([
            { slot: 'a', sessionId: 's' }, { slot: 'b', sessionId: 's' }
        ]).length === 0);
    // One slot can name a session under two working directories — that is one
    // account saying the same true thing twice, not a conflict.
    ok('one slot naming a session twice is ONE claim, not a conflict',
        A.uniqueSlotRecords([
            { slot: 'a', sessionId: 's', at: 5 }, { slot: 'a', sessionId: 's', at: 9 }
        ]).length === 1);
    ok('a record missing either half is not a record',
        A.uniqueSlotRecords([{ slot: '', sessionId: 's' }, { slot: 'a', sessionId: '' }]).length === 0);
}

// ---------- the order of the layers ----------
{
    const ev = {
        manifest: { s1: 'claude-a' },
        registry: [{ slot: 'claude-b', sessionId: 's1' }, { slot: 'claude-b', sessionId: 's2' }],
        slotRecords: [{ slot: 'claude-c', sessionId: 's2' }, { slot: 'claude-c', sessionId: 's3' }]
    };
    const got = A.attributeSessions(ev);
    // ‼️ A manifest is a DECISION this farm made; a file is an inference from
    // one. However good the file, the decision outranks it.
    ok('‼️ THE MANIFEST WINS — a decision outranks an inference from a file',
        got.get('s1').slot === 'claude-a' && got.get('s1').why === 'manifest');
    ok('the live registry answers where no manifest did',
        got.get('s2').slot === 'claude-b' && got.get('s2').why === 'registry');
    ok('the slot record answers last, and only for what is left',
        got.get('s3').slot === 'claude-c' && got.get('s3').why === 'slot-record');
    ok('‼️ A SESSION NO RECORD NAMES STAYS ABSENT — the unattributed row keeps its meaning',
        got.get('s9') === undefined && got.size === 3);
    ok('the layer that answered travels with the answer',
        [...got.values()].every(v => typeof v.why === 'string' && v.why));
}
{
    // A blank in the manifest is not an attribution — it is the absence the
    // whole family of items exists to keep honest.
    const got = A.attributeSessions({ manifest: { s1: '  ', s2: 'claude-a' } });
    ok('a blank manifest entry places nothing', !got.has('s1') && got.has('s2'));
}

// ---------- what a card may say about "last used" ----------
{
    const ts = { s1: 1000, s2: 5000 };
    const ev = {
        manifest: { s1: 'claude-a' },
        registry: [{ slot: 'claude-a', sessionId: 's2' }]
    };
    const act = A.slotActivity(ev, id => ts[id]);
    ok('the latest run a sign-in carried is the one reported',
        act.get('claude-a').at === 5000 && act.get('claude-a').sessionId === 's2');
}
{
    // The failure the item is named after: nothing names a run, so the card
    // said "nothing ran here" for a sign-in that had been used an hour ago.
    const act = A.slotActivity({ touches: [{ slot: 'claude-a', at: 4000 }] }, () => undefined);
    ok('‼️ A TOUCH IS AN ANSWER WHERE "NOTHING RAN HERE" WAS A WRONG ONE',
        act.get('claude-a').at === 4000 && act.get('claude-a').why === 'slot-touch');
    ok('…and it names no session, so nothing can draw a title beside it',
        act.get('claude-a').sessionId === undefined);
}
{
    // A slot's files all change the moment it is CAPTURED. Reading that as a
    // run would make every sign-in look used the day it was made.
    const act = A.slotActivity({
        touches: [{ slot: 'claude-a', at: 4000, capturedAt: 4000 },
                  { slot: 'claude-b', at: 4001, capturedAt: 4000 }]
    }, () => undefined);
    ok('‼️ A TOUCH AT OR BEFORE THE CAPTURE IS THE CAPTURE, NOT A RUN',
        act.get('claude-a') === undefined && act.get('claude-b').at === 4001);
}
{
    // A real run always outranks a touch: the touch is the weakest thing we
    // know and must never hide a time we can actually explain.
    const act = A.slotActivity(
        { manifest: { s1: 'claude-a' }, touches: [{ slot: 'claude-a', at: 100 }] },
        () => 9000);
    ok('a named run beats an older touch', act.get('claude-a').why === 'manifest');
    const newer = A.slotActivity(
        { manifest: { s1: 'claude-a' }, touches: [{ slot: 'claude-a', at: 99000 }] },
        () => 9000);
    ok('…and a NEWER touch is still the later fact, so it is the one reported',
        newer.get('claude-a').at === 99000 && newer.get('claude-a').why === 'slot-touch');
}
{
    // A `lastStartTime` is when a run BEGAN. Using it as "last used" would date
    // a four-hour conversation to its first minute, so it is a floor for a
    // session the index cannot date at all — never a replacement for one it can.
    const act = A.slotActivity(
        { slotRecords: [{ slot: 'claude-a', sessionId: 'known', at: 100 }] },
        id => (id === 'known' ? 9000 : undefined));
    ok('‼️ A START TIME NEVER OVERWRITES A SESSION THE INDEX CAN DATE',
        act.get('claude-a').at === 9000);
    const unknown = A.slotActivity(
        { slotRecords: [{ slot: 'claude-a', sessionId: 'never-scanned', at: 100 }] },
        () => undefined);
    ok('…but a transcript nobody scanned still proves the slot was on',
        unknown.get('claude-a').at === 100 && unknown.get('claude-a').why === 'slot-record');
    // And a copied record must not leak in through this door either.
    const copied = A.slotActivity({
        slotRecords: [{ slot: 'a', sessionId: 'c', at: 700 }, { slot: 'b', sessionId: 'c', at: 700 }]
    }, () => undefined);
    ok('‼️ THE COPY GUARD HOLDS ON THE ACTIVITY PATH TOO', copied.size === 0);
}
{
    const act = A.slotActivity({ touches: [{ slot: 'claude-a', at: 0 }, { slot: '', at: 5 }] }, () => undefined);
    ok('a time of zero and a slot with no name are not facts', act.size === 0);
}

// ---------- what each layer is allowed to fund ----------
{
    ok('‼️ A TOUCH FUNDS NOTHING — it names no session, so there is nothing to add up',
        A.COUNTS_AS_SPEND['slot-touch'] === false);
    ok('every layer that names a run counts',
        A.COUNTS_AS_SPEND.manifest && A.COUNTS_AS_SPEND.registry
        && A.COUNTS_AS_SPEND['slot-record']);
    // The policy is a table rather than an `if` on a page, so a fifth layer
    // cannot arrive with no answer to this question.
    const layers = ['manifest', 'registry', 'slot-record', 'slot-touch'];
    ok('every layer has a spend policy and a sentence a hover can carry',
        layers.every(l => typeof A.COUNTS_AS_SPEND[l] === 'boolean'
            && typeof A.WHY_SAID[l] === 'string' && A.WHY_SAID[l].length > 10));
}

console.log(`test_account_attribution: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
