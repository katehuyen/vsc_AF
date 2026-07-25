// Living page core (compiled core/living.js, pure): the loop-shaped signals
// that answer "is the system alive today?". Every case here is a real failure
// the farm actually had — a part reporting green while the system was dead.
const path = require('path');
const fs = require('fs');
const os = require('os');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { buildLivingReport, wireDuties } =
    require(path.join(__dirname, '..', 'out', 'core', 'living.js'));

const NOW = Date.UTC(2026, 6, 25, 12, 0, 0);
const H = 3600000;
const D = 24 * H;

/** A farm where everything is closing — the baseline every case deviates from. */
const healthy = () => ({
    now: NOW,
    notices: [{ id: 'n1', ts: NOW - H, type: 'update', level: 2, title: 'fyi', read: true }],
    queue: [],
    automations: [
        { id: 'a1', title: 'daily batch', enabled: true, hasGuard: true, lastFiredAt: NOW - 3 * H }
    ],
    duties: [{ agentName: 'manager', title: 'batch', cadence: 'daily', wired: true }],
    automationLog: [],
    checks: []
});

const sig = (rep, id) => rep.signals.find(s => s.id === id);

// ---------- baseline ----------
{
    const rep = buildLivingReport(healthy());
    ok('a healthy farm scores 100', rep.score === 100);
    ok('healthy verdict says so', rep.verdict === 'every loop is closing');
    ok('no dead loops', rep.counts.dead === 0 && rep.counts.warn === 0);
    ok('signals are sorted by weight', rep.signals.every((s, i, a) => i === 0 || a[i - 1].weight >= s.weight));
}

// ---------- the measured failure: an important notice nobody read ----------
{
    const input = healthy();
    input.notices = [
        { id: 'n1', ts: NOW - 3 * D, type: 'reminder', level: 3, title: 'Günün planı bekliyor', read: false },
        { id: 'n2', ts: NOW - 2 * D, type: 'reminder', level: 3, title: 'Günü kapatalım mı?', read: false },
        { id: 'n3', ts: NOW - 4 * D, type: 'report', level: 3, title: 'sabit bagaj', read: false }
    ];
    const rep = buildLivingReport(input);
    const s = sig(rep, 'notices-stale');
    ok('3 stale important notices read as DEAD', s.state === 'dead');
    ok('the oldest one is named', /sabit bagaj/.test(s.detail));
    ok('its age is reported in days', /4 days/.test(s.detail));
    ok('the row carries the age for the UI', s.ageMs === 4 * D);
    ok('it navigates to the board', s.goto === 'notices');
    ok('the hint states the consequence', /nobody reads/.test(s.hint));
    ok('score drops below 100', rep.score < 100);

    // one stale notice is a warning, not a death
    input.notices = [input.notices[0]];
    ok('a single stale notice warns', sig(buildLivingReport(input), 'notices-stale').state === 'warn');

    // fresh unread is fine — the point is AGE, not the unread count
    input.notices = [{ id: 'n9', ts: NOW - 2 * H, type: 'update', level: 3, title: 'just posted', read: false }];
    const fresh = sig(buildLivingReport(input), 'notices-stale');
    ok('a fresh unread important notice is OK', fresh.state === 'ok');
    ok('but it is still counted', /1 unread/.test(fresh.detail));

    // the threshold is configurable
    input.notices = [{ id: 'n8', ts: NOW - 5 * H, type: 'update', level: 3, title: 'x', read: false }];
    input.noticeStaleHours = 4;
    ok('noticeStaleHours drives the cutoff', sig(buildLivingReport(input), 'notices-stale').state === 'warn');
}

// ---------- an agent question left hanging ----------
{
    const input = healthy();
    input.notices = [{
        id: 'q1', ts: NOW - 2 * D, type: 'question', level: 2, status: 'open',
        title: 'GUNCEL BAGLAM guncellemesi gerek', read: true, agentName: 'manager'
    }];
    const rep = buildLivingReport(input);
    const s = sig(rep, 'questions');
    ok('an old open question reads as DEAD', s.state === 'dead');
    ok('the asking agent is named', /manager/.test(s.detail));
    ok('read-but-unanswered still counts (read !== answered)', /waiting/.test(s.detail));
    ok('the hint says who is blocked', /working without this answer/.test(s.hint));

    input.notices[0].ts = NOW - 3 * H;
    ok('a recent question only warns', sig(buildLivingReport(input), 'questions').state === 'warn');

    input.notices[0].status = 'answered';
    input.notices[0].handled = false;
    const rep2 = buildLivingReport(input);
    ok('answered questions clear the waiting row', sig(rep2, 'questions').state === 'ok');
    ok('but an unprocessed answer opens the agent-side row',
        sig(rep2, 'questions-unhandled').state === 'warn');

    input.notices[0].handled = true;
    ok('once processed, no row at all', !sig(buildLivingReport(input), 'questions-unhandled'));
}

// ---------- the queue that swallowed the user's answer ----------
{
    const input = healthy();
    input.queue = [{
        id: 'i1', ts: NOW - 30 * H, status: 'captured', author: 'user',
        text: 'Gece 3.00 ile sabah 11.00 arasi 5 yildizli uyku oldu'
    }];
    const rep = buildLivingReport(input);
    const s = sig(rep, 'queue');
    ok('an item stuck past the age ceiling is DEAD', s.state === 'dead');
    ok('the stuck text is shown so it is recognisable', /5 yildizli uyku/.test(s.detail));
    ok('its state is named', /captured/.test(s.detail));
    ok('the hint distinguishes stalled from warming up', /stopped, not that it is warming up/.test(s.hint));

    input.queue[0].ts = NOW - 15 * H;     // over half the ceiling
    ok('past half the ceiling it warns', sig(buildLivingReport(input), 'queue').state === 'warn');
    input.queue[0].ts = NOW - 2 * H;
    ok('a fresh item is fine', sig(buildLivingReport(input), 'queue').state === 'ok');

    input.queueStaleHours = 1;
    ok('queueStaleHours drives the ceiling', sig(buildLivingReport(input), 'queue').state === 'dead');

    // terminal items never count as active
    input.queue = [{ id: 'i2', ts: NOW - 40 * D, status: 'done', text: 'old' }];
    delete input.queueStaleHours;
    ok('done items are not "stuck"', sig(buildLivingReport(input), 'queue').state === 'ok');

    input.queue = [{ id: 'i3', ts: NOW - H, status: 'blocked', text: 'need an answer' }];
    ok('a blocked item raises its own row', sig(buildLivingReport(input), 'queue-blocked').state === 'warn');
}

// ---------- automations: off, silent, unguarded ----------
{
    const input = healthy();
    input.automations = input.automations.map(a => ({ ...a, enabled: false }));
    const rep = buildLivingReport(input);
    ok('a farm with everything switched off is DEAD', sig(rep, 'automations').state === 'dead');
    ok('and says what that means', /depends on you remembering/.test(sig(rep, 'automations').hint));
    ok('it is the loudest row', rep.signals[0].id === 'automations');

    // the quiet death: enabled, listed, green — and firing nothing
    input.automations = [
        { id: 'a1', title: 'daily batch', enabled: true, hasGuard: true, lastFiredAt: NOW - 9 * D },
        { id: 'a2', title: 'queue sweep', enabled: true, hasGuard: true, lastFiredAt: NOW - H }
    ];
    const rep2 = buildLivingReport(input);
    ok('an enabled automation silent for a week warns', sig(rep2, 'automations').state === 'warn');
    ok('the silent one is named', /daily batch/.test(sig(rep2, 'automations').detail));
    ok('the healthy one is not named', !/queue sweep/.test(sig(rep2, 'automations').detail));

    input.automations = [{ id: 'a3', title: 'watch', enabled: true, hasGuard: false, lastFiredAt: NOW - H }];
    const rep3 = buildLivingReport(input);
    ok('a live unguarded automation raises the guard row', sig(rep3, 'guards').state === 'warn');
    ok('guard row explains the cost shape', /whether or not there is work/.test(sig(rep3, 'guards').detail));

    input.automations = [{ id: 'a4', title: 'w', enabled: false, hasGuard: false }];
    ok('a DISABLED unguarded automation raises nothing', !sig(buildLivingReport(input), 'guards'));
}

// ---------- the gate itself ----------
{
    const input = healthy();
    input.gateReason = 'all automations are paused — reviewing cost';
    const s = sig(buildLivingReport(input), 'gate');
    ok('a closed gate is surfaced', s && s.state === 'warn');
    ok('the reason is passed through verbatim', s.detail === input.gateReason);
    ok('a forgotten pause is the point', /forgotten is not/.test(s.hint));
    ok('an open gate raises no row', !sig(buildLivingReport(healthy()), 'gate'));
}

// ---------- duties with nothing behind them ----------
{
    const input = healthy();
    input.duties = [
        { agentName: 'manager', title: 'AGENT_AREA filing', cadence: 'daily', wired: false },
        { agentName: 'manager', title: 'AI scan', cadence: 'daily', wired: true },
        { agentName: 'genel', title: 'answered questions', cadence: 'every-turn', wired: false }
    ];
    const s = sig(buildLivingReport(input), 'duties');
    ok('an unwired timed duty warns', s.state === 'warn');
    ok('it counts only timed duties (1 of 2, not 1 of 3)', /1 of 2/.test(s.detail));
    ok('the dead duty is named with its agent', /manager: AGENT_AREA filing/.test(s.detail));
    ok('every-turn duties are exempt (they are passive by design)',
        !/answered questions/.test(s.detail));

    input.duties = [{ agentName: 'm', title: 'x', cadence: 'daily', wired: false, paused: true }];
    ok('a paused duty is not counted', !sig(buildLivingReport(input), 'duties'));
}

// ---------- wireDuties: what counts as "driven by something" ----------
{
    const duties = [
        { agentName: 'manager', title: 'AGENT_AREA filing', cadence: 'daily' },
        { agentName: 'manager', title: 'TODO cycle health check', cadence: 'daily' },
        { agentName: 'genel', title: 'Filing inbox', cadence: 'session-start' }
    ];
    const autos = [
        { title: 'AGENT_AREA filing — daily batch', enabled: true },
        { title: 'nightly', prompt: 'apply the TODO cycle health check duty', enabled: true },
        { title: 'Filing inbox sweep', enabled: false }
    ];
    const wired = wireDuties(duties, autos);
    ok('a duty named in an automation TITLE is wired', wired[0].wired === true);
    ok('a duty named in an automation PROMPT is wired', wired[1].wired === true);
    ok('a DISABLED automation does not count as wiring', wired[2].wired === false);
    ok('matching ignores case', wireDuties(
        [{ agentName: 'a', title: 'AI SCAN', cadence: 'daily' }],
        [{ title: 'ai scan daily', enabled: true }])[0].wired === true);
}

// ---------- spend against the ceiling ----------
{
    const input = healthy();
    input.spendToday = 12.5;
    ok('no budget set reads as idle, not healthy',
        sig(buildLivingReport(input), 'spend').state === 'idle');
    ok('and it says how to make it a brake',
        /brake, not a hope/.test(sig(buildLivingReport(input), 'spend').hint));

    input.budgetToday = 50;
    ok('well under the ceiling is OK', sig(buildLivingReport(input), 'spend').state === 'ok');
    input.spendToday = 42;
    ok('80% warns', sig(buildLivingReport(input), 'spend').state === 'warn');
    input.spendToday = 51;
    const s = sig(buildLivingReport(input), 'spend');
    ok('over the ceiling is dead', s.state === 'dead');
    ok('and says launches have stopped', /nothing new launches/.test(s.hint));
    ok('the numbers are shown', /\$51\.00 of \$50\.00 \(102%\)/.test(s.detail));

    delete input.spendToday;
    ok('with no spend data there is no row', !sig(buildLivingReport(input), 'spend'));
}

// ---------- user checks: TRUE = needs attention ----------
{
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-living-'));
    const input = healthy();
    input.checks = [{
        label: "Today's day file written",
        when: { kind: 'fileMissing', path: path.join(tmp, 'gun.md') },
        level: 'alert',
        hint: 'write it, or ask the agent to open it'
    }];
    let rep = buildLivingReport(input);
    let s = rep.signals.find(x => x.label === "Today's day file written");
    ok('a missing day file is DEAD at alert level', s.state === 'dead');
    ok('the check hint is shown when it hits', s.hint === 'write it, or ask the agent to open it');
    ok('an alert check outranks routine rows', s.weight > 90);

    fs.writeFileSync(path.join(tmp, 'gun.md'), '# today');
    rep = buildLivingReport(input);
    s = rep.signals.find(x => x.label === "Today's day file written");
    ok('once written the loop closes', s.state === 'ok');
    ok('and the hint disappears', s.hint === undefined);

    input.checks = [{ label: 'Inbox empty', when: { kind: 'folderHasFiles', path: tmp }, level: 'warn' }];
    ok('a warn-level check that hits is a warning',
        buildLivingReport(input).signals.find(x => x.label === 'Inbox empty').state === 'warn');
    input.checks[0].level = 'info';
    ok('an info-level check that hits stays idle',
        buildLivingReport(input).signals.find(x => x.label === 'Inbox empty').state === 'idle');

    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp */ }
}

// ---------- the score ----------
{
    const input = healthy();
    input.notices = [{ id: 'n', ts: NOW - 3 * D, type: 'u', level: 3, title: 'x', read: false }];
    input.queue = [{ id: 'i', ts: NOW - 3 * D, status: 'captured', text: 'y' }];
    const rep = buildLivingReport(input);
    ok('a dead loop pulls the verdict to "stopped"', /loop\(s\) have stopped/.test(rep.verdict));
    // 3 ok + 1 warn + 1 dead → (3 + 0.5) / 5 = 70
    ok('the score weighs a warning as half and a death as zero', rep.score === 70);
    ok('idle rows do not distort the score (they are not counted)',
        rep.counts.ok + rep.counts.warn + rep.counts.dead === rep.signals.length - rep.counts.idle);

    const warnOnly = healthy();
    warnOnly.automations = [{ id: 'a', title: 't', enabled: true, hasGuard: false, lastFiredAt: NOW }];
    const rep2 = buildLivingReport(warnOnly);
    ok('warnings alone say "need you"', /loop\(s\) need you/.test(rep2.verdict));
    ok('a warning counts as half, not zero', rep2.score > 50 && rep2.score < 100);
}

// ---------- the recent tail ----------
{
    const input = healthy();
    // the store appends chronologically (oldest first) — mirror that here
    input.automationLog = Array.from({ length: 40 }, (_, i) => ({
        ts: NOW - (39 - i) * 60000, kind: 'trigger', id: 't', title: 'media',
        outcome: i % 2 ? 'skipped' : 'fired', reason: 'r' + i
    }));
    const rep = buildLivingReport(input);
    ok('the tail is capped at 25', rep.recent.length === 25);
    ok('newest first', rep.recent[0].ts > rep.recent[1].ts);
    ok('the tail takes the LATEST 25, not the first', rep.recent[0].reason === 'r39');
}

console.log(`test_living: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
