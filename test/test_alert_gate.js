// A-22 — WHETHER A SOUND IS HEARD AT ALL (compiled core/alertGate.js).
//
// A-18 answered "which sound". Nothing answered "should anything sound right
// now", so a farm that alerts correctly at 03:00 alerts correctly at 03:00 and
// the only remedy was to walk back to the machine and untick five boxes.
//
// What is defended here:
//   - the quiet window WRAPS MIDNIGHT. 23:00→08:00 read as `from <= now < to`
//     is quiet for exactly no minutes of the day, which is the one shape
//     anybody actually configures.
//   - a window that does not parse is NAMED, never assumed. Silently-on and
//     silently-off are both wrong answers to a typo and only one of them can
//     ever be noticed.
//   - the gate says WHO closed it, and says ALL of them: unmuting at 03:00 and
//     still hearing nothing is a half-truth the user cannot debug.
//   - muting a session touches nothing else it chose, so unmuting restores the
//     setup rather than the default.
//   - a gated sound is `skipped`, never `failed` — a failure raises the broken
//     player warning and teaches the user to ignore it.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const G = require(path.join(__dirname, '..', 'out', 'core', 'alertGate.js'));
const T = require(path.join(__dirname, '..', 'out', 'core', 'turnAlerts.js'));

const AT = 1756000000000; // any instant; every quiet test passes its own minutes
const hm = (h, m) => h * 60 + (m || 0);

// ------------------------------------------------------------- parseClock
{
    ok('HH:MM is minutes since midnight', G.parseClock('23:00') === 1380);
    ok('…and a leading zero changes nothing', G.parseClock('08:00') === 480);
    ok('…and midnight is 0, not falsy-by-accident', G.parseClock('00:00') === 0);
    ok('a dot is accepted — half the world writes 23.00', G.parseClock('23.30') === 1410);
    ok('surrounding space is trimmed rather than rejected', G.parseClock('  7:05 ') === 425);
    ok('24:00 is not a time of day', G.parseClock('24:00') === null);
    ok('…nor is 12:60', G.parseClock('12:60') === null);
    ok('…nor is a word', G.parseClock('night') === null);
    ok('…nor is a number', G.parseClock(2300) === null);
    ok('…nor is nothing at all', G.parseClock(undefined) === null && G.parseClock('') === null);
    ok('fmtClock pads both halves', G.fmtClock(425) === '07:05' && G.fmtClock(0) === '00:00');
}

// ------------------------------------------------------------- quiet hours
{
    const cfg = { on: true, from: '23:00', to: '08:00' };
    const at = (h, m) => G.quietHours(AT, cfg, hm(h, m));

    // ‼️ The whole point: the window that crosses midnight.
    ok('‼️ 23:00–08:00 is quiet at 23:30 — the wrap is the case people set',
        at(23, 30).inside === true);
    ok('…and at 03:00, on the other side of midnight', at(3, 0).inside === true);
    ok('…and at 00:00 exactly', at(0, 0).inside === true);
    ok('…and NOT at 12:00', at(12, 0).inside === false);
    ok('the start is inclusive', at(23, 0).inside === true);
    ok('the end is exclusive — 08:00 is when it is over, not one more quiet minute',
        at(8, 0).inside === false);
    ok('one minute before the end is still quiet', at(7, 59).inside === true);

    // A window inside one day still works.
    const day = { on: true, from: '09:00', to: '17:00' };
    ok('a same-day window is a plain range', G.quietHours(AT, day, hm(12)).inside === true);
    ok('…and outside it is outside', G.quietHours(AT, day, hm(8, 59)).inside === false);
    ok('…including after it', G.quietHours(AT, day, hm(23)).inside === false);

    // The switch.
    ok('off means off however the window reads',
        G.quietHours(AT, { on: false, from: '23:00', to: '08:00' }, hm(3)).inside === false);
    ok('…and an unconfigured fleet is off, not quiet from 00:00 to 00:00',
        G.quietHours(AT, {}, hm(3)).inside === false);
    ok('…and undefined is off', G.quietHours(AT, undefined, hm(3)).inside === false);
    ok('the default window is still REPORTED when it is off, so the page can show it',
        G.quietHours(AT, {}, hm(3)).from === '23:00' && G.quietHours(AT, {}, hm(3)).to === '08:00');

    // ‼️ A typo is named.
    const bad = G.quietHours(AT, { on: true, from: 'midnight', to: '08:00' }, hm(3));
    ok('‼️ a window that does not parse does not silence the farm', bad.inside === false);
    ok('…and it says so, by name', /not a time of day/.test(bad.error || ''));
    ok('…naming the value that was wrong', /midnight/.test(bad.error || ''));
    const badTo = G.quietHours(AT, { on: true, from: '23:00', to: '8pm' }, hm(3));
    ok('…and it checks the end as well as the start', /8pm/.test(badTo.error || ''));

    const same = G.quietHours(AT, { on: true, from: '23:00', to: '23:00' }, hm(23, 30));
    ok('‼️ start == end is an EMPTY window, not a farm muted around the clock',
        same.inside === false);
    ok('…and it says which reading it took', /empty/.test(same.error || ''));

    // When does this change — the "silent until 08:00" a tooltip prints.
    const inside = at(3, 0);
    ok('inside, the next boundary is the END', inside.inMinutes === 5 * 60);
    ok('…as an instant, not just a duration',
        inside.nextChangeAt === AT + 5 * 60 * 60000);
    const outside = at(20, 0);
    ok('outside, the next boundary is the START', outside.inMinutes === 3 * 60);
    ok('off has no next boundary, because nothing is going to change',
        G.quietHours(AT, {}, hm(3)).nextChangeAt === 0);

    ok('the line leads with what it is doing right now (MIRROR)',
        /silent until 08:00/.test(G.quietLine(at(3, 0))));
    ok('…and when it is not doing it, when it will',
        /next in 3 h/.test(G.quietLine(at(20, 0))));
    ok('…and an off window reads as off', /off/.test(G.quietLine(G.quietHours(AT, {}, hm(3)))));
    ok('fmtGap is read at a glance', G.fmtGap(45) === '45 min'
        && G.fmtGap(120) === '2 h' && G.fmtGap(185) === '3 h 5 min');
}

// ------------------------------------------------------------------- gate
{
    const quiet = G.quietHours(AT, { on: true, from: '23:00', to: '08:00' }, hm(3));
    const awake = G.quietHours(AT, { on: true, from: '23:00', to: '08:00' }, hm(12));

    ok('nothing set, nothing silenced', G.silence({}).silent === false);
    ok('…and it names no reason it cannot support', (G.silence({}).reasons || []).length === 0);

    const fleet = G.silence({ muted: true, quiet: awake });
    ok('the status bar mute silences', fleet.silent === true && fleet.reason === 'fleet');
    ok('…and says so in words a branch detail can carry',
        /status bar/.test(fleet.detail || ''));

    const one = G.silence({ sessionMuted: true, quiet: awake });
    ok('a session can be quiet while the fleet is not',
        one.silent === true && one.reason === 'session');

    const night = G.silence({ quiet });
    ok('quiet hours silence with nobody touching anything',
        night.silent === true && night.reason === 'quiet-hours');
    ok('…and the sentence carries the window and when it ends',
        /23:00/.test(night.detail || '') && /until 08:00/.test(night.detail || ''));

    // ‼️ Two at once — the half-truth this exists to prevent.
    const both = G.silence({ muted: true, quiet });
    ok('‼️ two authorities are BOTH reported', both.reasons.length === 2);
    ok('…in a fixed order, so the one-line answer is stable',
        both.reason === 'fleet' && both.reasons[1] === 'quiet-hours');
    ok('…and the detail names both, or unmuting at 03:00 looks broken',
        /muted/.test(both.detail) && /quiet hours/.test(both.detail));

    ok('only `true` mutes — a string somebody put in the setting does not',
        G.silence({ muted: 'yes' }).silent === false);
    ok('a quiet window that is off does not silence',
        G.silence({ quiet: G.quietHours(AT, {}, hm(3)) }).silent === false);
}

// ------------------------------------------ the session store's own mute
const storeTests = async () => {
    const mk = () => {
        let saved = {};
        const store = new T.TurnAlertStore({
            read: () => saved,
            write: m => { saved = JSON.parse(JSON.stringify(m)); },
            readMigration: () => T.TURN_ALERT_MIGRATION,
            writeMigration: () => undefined
        });
        return { store, dump: () => saved };
    };

    const { store, dump } = mk();
    ok('a session nobody muted is not muted', store.mutedFor('s1') === false);
    ok('…and neither is one that does not exist', store.mutedFor('nope') === false);

    ok('muting reports done', store.setMuted('s1', true).ok === true);
    ok('…and it took', store.mutedFor('s1') === true);
    await store.flush();
    ok('…and it survives a reload', !!dump()['s1'] && dump()['s1'].muted === true);

    ok('muting twice is not an error', store.setMuted('s1', true).ok === true);
    ok('unmuting a session that said nothing else leaves NO record',
        store.setMuted('s1', false).ok === true);
    await store.flush();
    ok('…in storage either', dump()['s1'] === undefined);

    // ‼️ Mute is orthogonal to everything else the session chose.
    store.set('s2', 'modal', true);
    store.setVoice('s2', 'question', 'bell-far');
    store.setMuted('s2', true);
    ok('‼️ muting keeps the boxes', JSON.stringify(store.actionsFor('s2')) === '["modal"]');
    ok('…and keeps the chosen tone', store.voicesFor('s2').question === 'bell-far');
    store.setMuted('s2', false);
    ok('…so unmuting restores the setup rather than the default',
        JSON.stringify(store.actionsFor('s2')) === '["modal"]'
        && store.voicesFor('s2').question === 'bell-far');

    // …and nothing else may quietly unmute.
    store.setMuted('s3', true);
    store.setVoice('s3', 'turn-ready', 'tick-dry');
    ok('picking a tone does not unmute', store.mutedFor('s3') === true);
    store.set('s3', 'sound', true);
    ok('ticking a box does not unmute', store.mutedFor('s3') === true);
    store.replace('s3', []);
    ok('‼️ clearing every box does not unmute — and does not lose the record',
        store.mutedFor('s3') === true);

    await store.flush();
    ok('a muted session is in `all()` with its flag', dump()['s3'].muted === true
        && store.all()['s3'].muted === true);
    ok('…and rekey carries it to the session\'s real id',
        store.rekey('s3', 's3-real').ok === true && store.mutedFor('s3-real') === true);
    ok('…and forget still forgets it', store.forget('s3-real') === true
        && store.mutedFor('s3-real') === false);
    ok('a mute needs a session to be about',
        store.setMuted('', true).ok === false);
};

// --------------------------------------------------------------- arbiter
//
// Eight lanes is the normal case, and eight players started in the same 40 ms
// do not make eight sounds — they make one noise, out of which nothing can be
// told apart, which is the exact ability ten named tones exist to give.
const arbiterTests = async () => {
    // A fake clock the sleeps drive, so a 500 ms gap costs no wall time and a
    // test can assert the ORDER rather than race it.
    const mk = (opts) => {
        let t = 1000;
        const log = [];
        const a = new G.AudioArbiter({
            now: () => t,
            sleep: ms => { t += ms; return Promise.resolve(); },
            ...(opts || {})
        });
        const play = (name, dur) => () => { t += (dur === undefined ? 100 : dur); log.push(name); return Promise.resolve(name); };
        return { a, log, play, at: () => t, adv: ms => { t += ms; } };
    };

    {
        const { a, log, play } = mk();
        const all = Promise.all([
            a.submit('s1:turn-ready', 'turn-ready', play('turn')),
            a.submit('s2:question', 'question', play('question')),
            a.submit('s3:ended', 'ended', play('ended')),
            a.submit('s4:error', 'error', play('error'))
        ]);
        const tickets = await all;
        // The first one is already playing when the rest arrive, so it goes
        // first; the queue orders what is WAITING.
        ok('‼️ the waiting sounds play by how much the news matters, not by arrival',
            JSON.stringify(log) === '["turn","question","error","ended"]');
        ok('…and each says how long it waited', tickets[1].waitedMs > 0);
        ok('…and how many went in front of it while it did',
            tickets[2].ahead === 3 && tickets[1].ahead === 1);
        ok('every one of them actually played', tickets.every(t => t.played === true));
        ok('…and carries its player\'s own answer', tickets[0].result === 'turn');
    }

    {
        // ‼️ The gap is measured from the END of the last sound: the tones are
        // up to 1.2 s long and a gap counted from the start would let them
        // overlap, which is the whole thing this queue exists to stop.
        const { a, play, at } = mk({ gapMs: 500 });
        const t0 = at();
        await Promise.all([
            a.submit('a', 'turn-ready', play('a', 1200)),
            a.submit('b', 'turn-ready', play('b', 1200))
        ]);
        ok('‼️ the 500 ms gap is measured from the END, so two 1.2 s tones cannot overlap',
            at() - t0 === 1200 + 500 + 1200);
    }

    {
        const { a, log, play } = mk();
        const first = a.submit('same', 'question', play('first'));
        const dup = await a.submit('same', 'question', play('dup'));
        await first;
        ok('‼️ the same alert twice is ONE alert', dup.played === false
            && dup.dropped === 'duplicate');
        ok('…and it says so rather than hanging on a promise nothing resolves',
            /already (playing|waiting)/.test(dup.detail || ''));
        ok('…and the duplicate never reached a player',
            JSON.stringify(log) === '["first"]');
    }

    {
        // Over the ceiling the LEAST urgent waiting item goes — a backlog of
        // twenty chimes describes a fleet that has since moved on.
        const { a, log, play } = mk({ max: 3 });
        const busy = a.submit('busy', 'question', play('busy'));
        const q = [
            a.submit('q1', 'question', play('q1')),
            a.submit('t1', 'turn-ready', play('t1')),
            a.submit('t2', 'turn-ready', play('t2')),
            a.submit('e1', 'error', play('e1'))
        ];
        const tickets = await Promise.all([busy, ...q]);
        const dropped = tickets.filter(t => t.dropped === 'overflow');
        ok('‼️ over the ceiling something IS dropped rather than queued for a minute',
            dropped.length === 1);
        ok('…and it is the least urgent one, not the newest',
            JSON.stringify(log) === '["busy","q1","e1","t1"]');
        ok('…and the drop is reported with the reason', /least urgent/.test(dropped[0].detail || ''));
    }

    {
        // A player that throws must not wedge the queue behind it.
        const { a, log, play } = mk();
        const bad = a.submit('bad', 'question', () => Promise.reject(new Error('no device')));
        const good = a.submit('good', 'turn-ready', play('good'));
        const [b, g] = await Promise.all([bad, good]);
        ok('a player that throws is reported, not swallowed', /no device/.test(b.error || ''));
        ok('‼️ …and the queue behind it still runs', g.played === true
            && JSON.stringify(log) === '["good"]');
    }

    {
        const { a, play } = mk();
        const p = a.submit('x', 'question', play('x'));
        ok('the depth is readable while something waits', a.depth >= 0);
        await p;
        ok('…and drains to nothing', a.depth === 0 && a.peek().length === 0);
    }
};

// ----------------------------------------------------------------- nudge
const nudgeTests = () => {
    const cfg = G.nudgeConfig({ minutes: 3, repeat: 2 });
    ok('the nudge config is read whole', cfg.minutes === 3 && cfg.repeat === 2
        && cfg.voice === 'af_subtle_alert');
    ok('‼️ …and CLAMPED UP off the floor — an unclamped 0.05 in somebody\'s'
        + ' settings is a chime every three seconds, and "off" has to be said'
        + ' rather than typo\'d into',
        G.nudgeConfig({ minutes: 0.05 }).minutes === 1);
    ok('…at the top end too', G.nudgeConfig({ minutes: 9999, repeat: 9999 }).minutes === 240
        && G.nudgeConfig({ minutes: 9999, repeat: 9999 }).repeat === 20);
    ok('0 minutes is off, and says so as a number rather than a special case',
        G.nudgeConfig({ minutes: 0 }).minutes === 0);
    ok('rubbish falls back to the default tone',
        G.nudgeConfig({ voice: '  ' }).voice === 'af_subtle_alert');

    const EVERY = 3 * 60_000;
    const st = new G.NudgeStore();
    const waiting = { waiting: true, key: 'k1' };
    const look = () => waiting;

    ok('arming needs an interval', st.arm('s1', 'question', 'k1', 0, 0) === undefined);
    const a = st.arm('s1', 'question', 'k1', 0, EVERY);
    ok('an armed session is due one interval later', a.dueAt === EVERY && a.sent === 0);
    ok('nothing is due before then',
        st.due(EVERY - 1, look, { everyMs: EVERY, repeat: 2 }).length === 0);

    const first = st.due(EVERY, look, { everyMs: EVERY, repeat: 2 });
    ok('…and one reminder is due at it', first.length === 1 && first[0].sent === 1);
    ok('the reminder names the session and the event it is about',
        first[0].sessionId === 's1' && first[0].event === 'question');
    ok('the same instant does not fire twice',
        st.due(EVERY, look, { everyMs: EVERY, repeat: 2 }).length === 0);

    const second = st.due(2 * EVERY, look, { everyMs: EVERY, repeat: 2 });
    ok('a second reminder follows one interval later', second.length === 1 && second[0].sent === 2);
    ok('‼️ …and then it STOPS — a chime that never ends is one the user mutes for good',
        st.due(3 * EVERY, look, { everyMs: EVERY, repeat: 2 }).length === 0
        && st.has('s1') === false);

    // ‼️ The whole point: an answered question is not nudged about.
    const st2 = new G.NudgeStore();
    st2.arm('s2', 'question', 'p3:t7', 0, EVERY);
    ok('‼️ a session that MOVED ON is disarmed by the sweep, not by an edge'
        + ' somebody has to remember to wire',
        st2.due(EVERY, () => ({ waiting: true, key: 'p4:t9' }), { everyMs: EVERY, repeat: 2 }).length === 0
        && st2.has('s2') === false);

    const st3 = new G.NudgeStore();
    st3.arm('s3', 'question', 'k', 0, EVERY);
    ok('…and so is one that stopped waiting',
        st3.due(EVERY, () => ({ waiting: false, key: 'k' }), { everyMs: EVERY, repeat: 2 }).length === 0);

    const st4 = new G.NudgeStore();
    st4.arm('s4', 'question', 'k', 0, EVERY);
    ok('…and one the live monitor has lost altogether',
        st4.due(EVERY, () => undefined, { everyMs: EVERY, repeat: 2 }).length === 0);

    const st5 = new G.NudgeStore();
    st5.arm('s5', 'question', 'k', 0, EVERY);
    ok('turning the nudge off empties the store rather than leaving it ticking',
        st5.due(EVERY, look, { everyMs: 0, repeat: 2 }).length === 0 && st5.has('s5') === false);

    const st6 = new G.NudgeStore();
    st6.arm('s6', 'question', 'k1', 0, EVERY);
    st6.arm('s6', 'question', 'k1', 60_000, EVERY);
    ok('re-arming the SAME wait does not restart its clock',
        st6.list()[0].dueAt === EVERY);
    st6.arm('s6', 'question', 'k2', 60_000, EVERY);
    ok('‼️ …but a NEW question in the same conversation is a new wait',
        st6.list()[0].dueAt === 60_000 + EVERY && st6.list()[0].sent === 0);

    const st7 = new G.NudgeStore();
    for (let i = 0; i < G.NUDGE_MAX + 20; i++) { st7.arm('s' + i, 'question', 'k', i, EVERY); }
    ok('the store has a ceiling — a map that only grows is a leak',
        st7.list().length === G.NUDGE_MAX);
    ok('…and it is the OLDEST waits that go', st7.has('s0') === false
        && st7.has('s' + (G.NUDGE_MAX + 19)) === true);
    ok('disarming is reported', st7.disarm('s' + (G.NUDGE_MAX + 19)) === true
        && st7.disarm('nobody') === false);
};

// ------------------------------------- a gated sound is skipped, not failed
{
    const run = async () => {
        await storeTests();
        await arbiterTests();
        nudgeTests();
        const branches = await T.runTurnAlerts(['sound', 'toast'], {
            sound: () => Promise.resolve({
                backend: 'none', ok: false, startedAt: 0, durationMs: 0, exitCode: null,
                stderr: '', skipped: 'the farm is muted (the 🔇 in the status bar)'
            }),
            focus: () => undefined,
            modal: () => undefined,
            toast: () => undefined
        });
        const sound = branches.find(b => b.action === 'sound');
        const toast = branches.find(b => b.action === 'toast');
        ok('‼️ a gated sound is `skipped`, never `failed`', sound.status === 'skipped');
        ok('…and it carries the reason, which is the whole question a user has',
            /muted/.test(sound.detail || ''));
        ok('…and the other branches still ran — a mute is about the NOISE',
            toast.status === 'ok');

        const bad = await T.runTurnAlerts(['sound'], {
            sound: () => Promise.resolve({
                backend: 'afplay', ok: false, startedAt: 0, durationMs: 5, exitCode: 1, stderr: 'boom'
            }),
            focus: () => undefined, modal: () => undefined, toast: () => undefined
        });
        ok('…while a player that really failed still says `failed`',
            bad.find(b => b.action === 'sound').status === 'failed');
    };
    run().then(() => {
        console.log(`${pass} passed, ${fail} failed`);
        process.exit(fail ? 1 : 0);
    });
}
