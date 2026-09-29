// U-27 — what is left on THIS engine's plan.
//
// The complaint: the status bar's remaining-limit figure was Claude's, on a
// machine running four engines, with nothing on it saying so. These assertions
// are about the two halves of the answer — the engine that publishes a real
// quota where nobody had looked (Codex writes it into its own transcripts), and
// the engines that publish none, which must say "not published" and never 0%.
//
// The fixture is the REAL shape, read off this machine 2026-08-10 from
// ~/.codex/sessions/2026/08/10/rollout-*.jsonl.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { canRecheck, engineBarText, readAgyUsage, readCodexLimits, readCodexUsage, readEngineUsage, usageSummary, windowTitle } =
    require(path.join(__dirname, '..', 'out', 'core', 'engineUsage.js'));

const NULL_LINE = JSON.stringify({
    timestamp: '2026-07-19T09:06:06.611Z', type: 'event_msg',
    payload: { type: 'token_count', info: { total_token_usage: { total_tokens: 19340 } }, rate_limits: null }
});
const REAL_LINE = JSON.stringify({
    timestamp: '2026-08-10T18:28:59.000Z', type: 'event_msg',
    payload: {
        type: 'token_count',
        info: { total_token_usage: { total_tokens: 51230 } },
        rate_limits: {
            limit_id: 'codex', limit_name: null,
            primary: { used_percent: 7, window_minutes: 10080, resets_at: 1786903688 },
            secondary: null,
            credits: { has_credits: false, unlimited: false, balance: '0' },
            individual_limit: null, spend_control_reached: null,
            plan_type: 'plus', rate_limit_reached_type: null
        }
    }
});
const LATER_LINE = REAL_LINE.replace('"used_percent":7', '"used_percent":23');

// ---------- the block itself ----------
{
    const l = readCodexLimits([NULL_LINE, REAL_LINE].join('\n'));
    ok('the quota Codex wrote down is found', !!l && l.used === 7);
    ok('…with its window and its plan', l.windowMinutes === 10080 && l.plan === 'plus');
    ok('‼️ resets_at is SECONDS on this engine, and is read as such',
        l.resetsAt === 1786903688 * 1000);
    ok('a null rate_limits is not an answer', readCodexLimits(NULL_LINE) === undefined);
    ok('…and does not shadow a real one later in the file',
        readCodexLimits([REAL_LINE, NULL_LINE].join('\n')).used === 7);
    ok('‼️ the LAST reading wins — a quota is a moving figure',
        readCodexLimits([REAL_LINE, LATER_LINE].join('\n')).used === 23);
    ok('rubbish is not a reading', readCodexLimits('{nope') === undefined);
    ok('nothing is not a reading', readCodexLimits(undefined) === undefined);
}

// ---------- window names are derived, not invented ----------
{
    ok('10080 minutes is a week', windowTitle(10080) === 'Current week');
    ok('300 minutes is a 5h window', windowTitle(300) === 'Current 5h window');
    ok('1440 minutes is a day', windowTitle(1440) === 'Current day');
    ok('an unstated window still has a name', windowTitle(0) === 'Current window');
}

// ---------- Codex, through the probe ----------
const probe = (files, tails) => ({
    newestFiles: () => files,
    readTail: (p) => tails[p]
});
{
    const u = readCodexUsage(
        probe(['a.jsonl'], { 'a.jsonl': [NULL_LINE, REAL_LINE].join('\n') }),
        () => 1786903000000);
    ok('Codex reports a real reading', u.state === 'ok' && u.bars.length === 1);
    ok('…as a percentage with a reset time', u.bars[0].percent === 7 && u.bars[0].resetsAt > 0);
    ok('…named after the window it covers', u.bars[0].title === 'Current week');
    ok('‼️ …stamped with the TURN\'s time, not the time we read the file',
        u.fetchedAt === 1786903000000);
    ok('…and the note says it costs nothing and is as old as that turn',
        /costs nothing/.test(u.note) && /as old as that turn/.test(u.note));

    // a file that only ever carried nulls must not stop the search
    const stepped = readCodexUsage(
        probe(['new.jsonl', 'old.jsonl'], { 'new.jsonl': NULL_LINE, 'old.jsonl': REAL_LINE }),
        () => 1);
    ok('a rollout with no reading is stepped past', stepped.state === 'ok' && stepped.bars[0].percent === 7);

    const none = readCodexUsage(probe([], {}), () => 0);
    ok('‼️ never run = "not read yet", never 0%', none.state === 'unknown' && !none.bars.length);
    ok('…and the note says what to do about it', /run one turn/.test(none.note));
}

// ---------- the matrix ----------
{
    const all = readEngineUsage(
        probe(['a.jsonl'], { 'a.jsonl': REAL_LINE }),
        () => 1786903000000,
        { state: 'ok', bars: [{ id: 'five_hour', title: 'Current session', percent: 86, resetsAt: 0 }],
            plan: 'max', fetchedAt: 123, note: 'from the usage endpoint' });
    const by = Object.fromEntries(all.map(u => [u.id, u]));
    // ‼️ U-59 — AND THE FIFTH IS HERE TOO. An engine missing from this matrix
    // is missing from the status-bar hover, the Dashboard's Plan usage card and
    // the engines.usage op all at once — and a reader then cannot tell "no plan
    // window here" from "this build has never heard of it", which is the exact
    // distinction the rest of this file exists to keep.
    ok('every built-in engine answers',
        all.length === 5 && by.claude && by.codex && by.gemini && by.agy && by.opencode);
    ok('Claude\'s answer is passed in, never fetched here', by.claude.bars[0].percent === 86);
    ok('Codex reads its own transcript', by.codex.state === 'ok');

    // ‼️ THE ASSERTION THIS FILE EXISTS FOR. An engine whose figure has not
    // arrived must never be drawn as an engine at 0%. Antigravity now HAS a
    // source (X-306: its own `/usage`, run in print mode by the runner), so
    // with nothing handed in it is `unknown` — "publishes one, not read yet" —
    // and it says how the figure is read rather than pretending it cannot be.
    ok('‼️ Antigravity with nothing read yet says UNKNOWN, and shows no bar',
        by.agy.state === 'unknown' && by.agy.bars.length === 0);
    ok('…and says where the figure comes from', /agy -p \/usage/.test(by.agy.note) && /no token/.test(by.agy.note));
    ok('‼️ Gemini says there is no plan to be a percentage of',
        by.gemini.state === 'no-plan' && by.gemini.bars.length === 0);
    // ‼️ …AND OPENCODE IS `no-plan`, NOT `not-published`: nothing is being
    // withheld here. Each model runs against its own provider and the engine
    // states the price of every turn itself, so there is no single window to be
    // a percentage of — Gemini's answer, reached for its own reason.
    ok('‼️ OpenCode says there is no single plan window, and shows no bar',
        by.opencode.state === 'no-plan' && by.opencode.bars.length === 0);
    ok('…and says where what it spent DOES live', /cost figures/.test(by.opencode.note));
    // ‼️ …and NOT in Gemini's words. `no-plan` is one state reached for two
    // reasons, and "per-token" on the engine whose free models cost nothing
    // reads as "your tokens are being billed" — the opposite of the truth.
    ok('‼️ …in its own words, not the per-token engine\'s',
        by.opencode.headline === 'priced per turn'
        && usageSummary(by.opencode) === 'no plan — priced per turn'
        && usageSummary(by.gemini) === 'no plan — per-token');

    ok('a summary never prints a number it does not have',
        usageSummary(by.agy) === 'not read yet'
        && usageSummary(by.gemini) === 'no plan — per-token'
        && /week 7%/.test(usageSummary(by.codex)));
}

// ---------- X-306: Antigravity's own /usage, in print mode ----------
{
    // ‼️ THE REAL ANSWER, read off this machine 2026-09-19 (agy 1.2.7) with
    // `agy -p /usage --output-format json`: num_turns 0, every token counter 0,
    // ~4 s. Two pools, each with a 5-hour and a weekly window; the fraction is
    // what is LEFT, and the CLI prints it rounded (0.6367 → 64%).
    const REAL_USAGE = JSON.stringify({
        conversation_id: '', status: 'SUCCESS',
        response: 'Gemini Models\tWeekly Limit Remaining\t64%\t2026-09-23T03:06:33Z\n',
        duration_seconds: 0, num_turns: 0,
        usage: { input_tokens: 0, output_tokens: 0, thinking_tokens: 0, cache_read_tokens: 0, total_tokens: 0 },
        command: { name: 'usage', data: {
            description: 'Within each group, models share a weekly limit and a 5-hour limit.',
            groups: [
                { name: 'Gemini Models', description: 'Models within this group: Gemini Flash, Gemini Pro', buckets: [
                    { id: 'gemini-weekly', name: 'Weekly Limit Remaining', window: 'weekly',
                        remaining_fraction: 0.6367819309234619, reset_time: '2026-09-23T03:06:33Z' },
                    { id: 'gemini-5h', name: 'Five Hour Limit Remaining', window: '5h',
                        remaining_fraction: 0.990929901599884, reset_time: '2026-09-19T18:06:26Z' }
                ] },
                { name: 'Claude and GPT models', description: 'Models within this group: Claude Opus, Claude Sonnet, GPT-OSS', buckets: [
                    { id: '3p-weekly', name: 'Weekly Limit Remaining', window: 'weekly', remaining_fraction: 1, reset_time: '2026-09-26T13:48:21Z' },
                    { id: '3p-5h', name: 'Five Hour Limit Remaining', window: '5h', remaining_fraction: 1, reset_time: '2026-09-19T18:48:21Z' }
                ] }
            ] } }
    });
    const agy = readAgyUsage({ text: REAL_USAGE, fetchedAt: 1789824000000 });
    ok('‼️ Antigravity reads its own /usage into real figures', agy.state === 'ok' && agy.bars.length === 4);
    ok('…one bar per pool × window, keyed by the CLI\'s own bucket ids',
        agy.bars.map(b => b.id).join(',') === 'gemini-weekly,gemini-5h,3p-weekly,3p-5h');
    ok('‼️ the percentage is USED, as the complement of the rounding the CLI prints (64% left → 36% used, 99% left → 1%)',
        agy.bars[0].percent === 36 && agy.bars[1].percent === 1 && agy.bars[2].percent === 0 && agy.bars[3].percent === 0);
    ok('the title has the shape Claude\'s own has — `Current <window> (<pool>)`',
        agy.bars[0].title === 'Current week (Gemini Models)' && agy.bars[1].title === 'Current 5h window (Gemini Models)'
        && agy.bars[3].title === 'Current 5h window (Claude and GPT models)');
    ok('the reset is the CLI\'s ISO time, as epoch ms', agy.bars[0].resetsAt === Date.parse('2026-09-23T03:06:33Z'));
    ok('the read time is the fetch\'s, and the note says it cost no turn',
        agy.fetchedAt === 1789824000000 && /no turn, no token/.test(agy.note));
    ok('the summary is the same shape every engine gets',
        usageSummary(agy) === 'week (Gemini Models) 36% · 5h window (Gemini Models) 1% · week (Claude and GPT models) 0% · 5h window (Claude and GPT models) 0%');
    ok('…and it can be re-read', canRecheck(agy) === true);
    ok('the whole matrix carries it when the runner hands the text in',
        readEngineUsage(probe([], {}), () => 0, { state: 'unknown', bars: [], plan: '', fetchedAt: 0, note: 'x' },
            { text: REAL_USAGE, fetchedAt: 5 }).find(u => u.id === 'agy').state === 'ok');

    // ‼️ THE STRIP: two pools collide on `wk` / `5h`, so each field carries
    // the pool's initials — and ONLY then; Claude's strip below is unchanged.
    ok('‼️ the strip tags every field with its pool when the short names collide',
        engineBarText(agy, () => '3d 13h') === '$(dashboard) G 3d 13h - 36% / G 5h 1% / CG wk 0% / CG 5h 0%');

    // ---- the ways it can fail to arrive, none of them a zero ----
    const absent = readAgyUsage({ error: 'agy is not on PATH', fetchedAt: 1 });
    ok('a CLI that is not there is `unknown` with the reason, not 0%',
        absent.state === 'unknown' && absent.bars.length === 0 && /not on PATH/.test(absent.note));
    const odd = readAgyUsage({ text: JSON.stringify({ status: 'SUCCESS', response: 'hello', command: null }), fetchedAt: 2 });
    ok('an answer in a shape this build does not read says so, and shows no bar',
        odd.state === 'unknown' && odd.bars.length === 0 && /shape/.test(odd.note));
    ok('garbage is not a figure', readAgyUsage({ text: '{not json', fetchedAt: 3 }).state === 'unknown');
    // ‼️ A window the CLI stated no fraction for is NOT a 0% bar — it is no
    // bar, and with none left the row is `unknown` and says why.
    const blank = readAgyUsage({ text: JSON.stringify({ command: { name: 'usage', data: { groups: [{ name: 'P', buckets: [{ id: 'x', window: '5h' }] }] } } }) });
    ok('‼️ a window with no stated fraction draws no bar, never 0%',
        blank.state === 'unknown' && blank.bars.length === 0 && /no windows/.test(blank.note));
}

// ---------- X-437: WHEN Antigravity's quota is read — only its own turns decide ----------
//
// Every `agy -p /usage` flashes a terminal on screen. The figure moves only
// while ANTIGRAVITY works, so a Claude or Codex turn is no reason to read it.
{
    const { agyNextReadAt, agyReadDue } = require(path.join(__dirname, '..', 'out', 'core', 'agyUsageBeat.js'));
    const MIN = 60_000, T = 1_000_000_000;
    const st = (o) => Object.assign({
        now: T, lastAskedAt: T - MIN, running: false, runningSince: 0, lastRunEndedAt: 0,
        idleMinutes: 240, activeSeconds: 60
    }, o);

    ok('never read → once, now (what the bar opens with)',
        agyNextReadAt(st({ lastAskedAt: 0 })) === T && agyReadDue(st({ lastAskedAt: 0 })));
    ok('…even with idle 0: the one read at start is kept',
        agyReadDue(st({ lastAskedAt: 0, idleMinutes: 0 })));
    ok('idle: the next read is the minutes setting after the last one',
        agyNextReadAt(st({})) === T - MIN + 240 * MIN && !agyReadDue(st({})));
    ok('idle: due once the minutes have passed',
        agyReadDue(st({ now: T - MIN + 240 * MIN })));
    ok('‼️ idle 0 after the first read = no automatic read, ever, while Antigravity is idle',
        agyNextReadAt(st({ idleMinutes: 0 })) === 0 && !agyReadDue(st({ idleMinutes: 0, now: T + 365 * 24 * 60 * MIN })));

    // running: counted from the run's start, never from the last idle read
    ok('‼️ a run that has just started earns no read — nothing is spent yet',
        !agyReadDue(st({ running: true, runningSince: T, lastAskedAt: T - 300 * MIN })));
    ok('running: the seconds setting after the start',
        agyNextReadAt(st({ running: true, runningSince: T, lastAskedAt: T - 300 * MIN })) === T + 60_000);
    ok('running: …or after the last read inside the run',
        agyNextReadAt(st({ running: true, runningSince: T - 10 * MIN, lastAskedAt: T - 20_000 })) === T + 40_000);
    ok('running: the 30 s floor holds',
        agyNextReadAt(st({ running: true, runningSince: T, activeSeconds: 5 })) === T + 30_000);
    ok('running: idle 0 does not stop the reads while Antigravity works',
        agyNextReadAt(st({ running: true, runningSince: T, idleMinutes: 0 })) === T + 60_000);

    // the end of a run: its settled figure, once
    ok('‼️ a run that ended after the last read → one read, now',
        agyReadDue(st({ lastRunEndedAt: T - 1000 })) && agyNextReadAt(st({ lastRunEndedAt: T - 1000 })) === T);
    ok('…with idle 0 too — that read is the run\'s, not the idle beat\'s',
        agyReadDue(st({ lastRunEndedAt: T - 1000, idleMinutes: 0 })));
    ok('‼️ …and once it is read, idle 0 stops again',
        !agyReadDue(st({ lastRunEndedAt: T - 2000, lastAskedAt: T - 1000, idleMinutes: 0 }))
        && agyNextReadAt(st({ lastRunEndedAt: T - 2000, lastAskedAt: T - 1000, idleMinutes: 0 })) === 0);
}

// ---------- X-437: "Antigravity is running" is Antigravity's turn, nobody else's ----------
{
    const Module = require('module');
    const origLoad = Module._load;
    class Emitter {
        constructor() { this.handlers = []; }
        get event() { return (fn) => { this.handlers.push(fn); return { dispose() { } }; }; }
        fire(v) { for (const h of this.handlers) { h(v); } }
        dispose() { }
    }
    Module._load = function (request) {
        if (request === 'vscode') {
            return {
                EventEmitter: Emitter,
                window: { showInformationMessage: () => Promise.resolve(undefined), showWarningMessage: () => Promise.resolve(undefined) },
                commands: { executeCommand: () => Promise.resolve(undefined) }
            };
        }
        return origLoad.apply(this, arguments);
    };
    const { LiveMonitor } = require(path.join(__dirname, '..', 'out', 'core', 'live.js'));
    Module._load = origLoad;
    const cfg = {
        enabled: true, port: 0, stuckThresholdMs: 999999,
        notifyPermission: false, notifyStuck: false, notifyTurnEnd: false
    };
    const live = new LiveMonitor(() => cfg, () => ({ agentId: 'a1', agentName: 'dev' }));
    const ev = (id, name, extra) => live.handle(Object.assign({ session_id: id, cwd: '/x', hook_event_name: name }, extra));

    // a Claude turn (a real hook: no `engine`) and a Codex turn (hosted, the mirror names it)
    ev('claude-1', 'UserPromptSubmit', { prompt: 'hi' });
    ev('codex-1', 'UserPromptSubmit', { prompt: 'hi', engine: 'codex' });
    ok('‼️ Claude and Codex working is NOT Antigravity running',
        live.activeTurns() === 2 && live.activeTurns('agy') === 0);
    // a hosted Antigravity turn — the Console mirror names its engine
    ev('agy-1', 'UserPromptSubmit', { prompt: 'hi', engine: 'agy' });
    ok('a hosted Antigravity turn is Antigravity running', live.activeTurns('agy') === 1);
    // a terminal Antigravity session: its `cli:agy:` id names the engine
    ev('cli:agy:a1:1', 'UserPromptSubmit', { prompt: 'hi' });
    ok('…and so is one opened in a terminal', live.activeTurns('agy') === 2);
    ev('agy-1', 'Stop', { engine: 'agy' });
    ev('cli:agy:a1:1', 'Stop');
    ok('‼️ both Antigravity turns ended → not running, while Claude still works',
        live.activeTurns('agy') === 0 && live.activeTurns() === 2);
}

// ---------- U-40: the STRIP, which is not a sentence ----------
{
    // ‼️ THE LINE THE USER READ OFF THEIR OWN STATUS BAR, VERBATIM:
    //   "sessions 100% (54m) / week (all models) 20% (6d 8h)"
    // — an engine name, two window HEADINGS, two percentages and two countdowns,
    // on the one surface in the editor where every character is taken from
    // something else on the same row. The shape below is the one Claude's
    // indicator had before four engines existed, and it is now what every
    // engine gets: time left, how much is gone, then each further window as a
    // short name and a percentage. The subject is in the hover, which is also
    // where the engine is chosen.
    const left = () => '2h 43m';
    const claude = {
        id: 'claude', label: 'Claude Code', state: 'ok', plan: 'max', fetchedAt: 1, note: '',
        bars: [
            { id: 'five_hour', title: 'Current session', percent: 78, resetsAt: 9 },
            { id: 'seven_day', title: 'Current week (all models)', percent: 21, resetsAt: 9 }
        ]
    };
    ok('‼️ the old format is back, exactly',
        engineBarText(claude, left) === '$(dashboard) 2h 43m - 78% / wk 21%');
    ok('‼️ …and it does NOT name the engine — the hover does',
        !/Claude/.test(engineBarText(claude, left)));
    ok('‼️ …nor repeat a window heading nobody has room for',
        !/all models/.test(engineBarText(claude, left)) && !/session/.test(engineBarText(claude, left)));

    // Every other engine is adapted to the same shape rather than given one of
    // its own — Codex's windows are stated in minutes and named by us.
    const codex = {
        id: 'codex', label: 'Codex', state: 'ok', plan: 'plus', fetchedAt: 1, note: '',
        bars: [
            { id: 'codex_primary', title: windowTitle(300), percent: 33, resetsAt: 9 },
            { id: 'codex_secondary', title: windowTitle(10080), percent: 8, resetsAt: 9 }
        ]
    };
    ok('a second engine reads the same way, not a second way',
        engineBarText(codex, left) === '$(dashboard) 2h 43m - 33% / wk 8%');
    // A window whose reset the record did not state says its own name rather
    // than an invented span — never a blank where a countdown would be.
    ok('a window with no stated reset falls back to its name, never to a guess',
        engineBarText({ ...codex, bars: [{ ...codex.bars[0], resetsAt: 0 }] }, left)
            === '$(dashboard) 5h 33%');
    ok('a day window is not called a week',
        engineBarText({ ...codex, bars: [codex.bars[0], { ...codex.bars[1], title: windowTitle(1440) }] }, left)
            === '$(dashboard) 2h 43m - 33% / day 8%');

    // ‼️ MINIMISED, NOT OMITTED, and never a percentage nobody measured.
    const flat = (state) => engineBarText(
        { id: 'agy', label: 'Antigravity', state, bars: [], plan: '', fetchedAt: 0, note: 'x' }, left);
    ok('‼️ an engine with no readable quota is two or three words, not a sentence',
        flat('not-published') === '$(dashboard) no quota published'
        && flat('no-plan') === '$(dashboard) per-token'
        && flat('unknown') === '$(dashboard) usage ?');
    ok('nothing at all hides the item rather than printing a placeholder',
        engineBarText(undefined, left) === undefined);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
