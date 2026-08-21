// ‼️ S-41 — TWO AXES, AND THE ARCHITECTURE THAT HAD ONLY ONE.
//
// Agent Farm asks a session two questions and the page carries two filters for
// them: WHO STARTED IT (🧑 You / 🤖 Auto) and WHERE IT RAN (🌙 headless / a
// terminal). They are independent — a task launched in interactive mode is
// automation with a screen — and the code had quietly collapsed them into one:
//
//   * `publishLaunchBindings` skipped every task whose mode was not 'headless',
//     so an interactive task produced NO launch binding and NO `launchedBy`;
//   * with no launcher record, the origin rule fell through to "an agent's own
//     folder, nothing of ours" (S-37) and stamped the run 🧑 User — a session a
//     schedule had started, filed as a person's;
//   * and `sessionHeadless` opened with `sessionOrigin(s) !== 'auto'`, which is
//     not a shortcut but a DEFINITION of one axis in terms of the other.
//
// So the row for a task-launched terminal was wrong on both counts, and the
// 🌙 chip could never see it. What is pinned here:
//
//   * every combination of the four facts, on BOTH axes, read separately;
//   * that 🤖 Auto + not-headless is a reachable state, because that is the
//     state the second filter exists for;
//   * that the same session read through a full record and through a
//     hand-built fact set gives the same verdict — two surfaces, one answer;
//   * and that widening the binding to interactive runs did not hand a person's
//     own conversation to a task. A terminal task opens in the AGENT'S folder
//     and stays open for hours, so on lifespan alone its binding would claim
//     the next session started there. It is claimed at its spawn or not at all.
'use strict';
const path = require('path');
const fs = require('fs');
const Module = require('module');
// `core/sessions.ts` reads a setting or two at load; the rules themselves are
// pure, so the editor is stubbed rather than the module being split for a test.
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') {
        return { Uri: {}, window: {}, workspace: { getConfiguration: () => ({ get: (_k, d) => d }) } };
    }
    return origLoad.apply(this, arguments);
};
const S = require(path.join(__dirname, '..', 'out', 'core', 'sessions.js'));
const LB = require(path.join(__dirname, '..', 'out', 'core', 'launchBinding.js'));
Module._load = origLoad;

let pass = 0, fail = 0;
const ok = (msg, cond) => { if (cond) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg); } };
const eq = (msg, got, want) => ok(msg + (got === want ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`), got === want);

/** The four facts, always all four — the shape the rules now require. */
const facts = (o = {}) => ({
    entrypoint: o.entrypoint, consoleHosted: o.consoleHosted,
    launchedBy: o.launchedBy, agentId: o.agentId
});

// ============================================ 1. the origin axis, on its own
{
    console.log('\n-- who started it');
    eq('a run the farm started is automation, whatever it ran in',
        S.sessionOrigin(facts({ launchedBy: { kind: 'task', label: 'nightly', mode: 'interactive' }, agentId: 'dev' })), 'auto');
    eq('…and so is the headless one',
        S.sessionOrigin(facts({ launchedBy: { kind: 'schedule', label: '9am', mode: 'headless' }, agentId: 'dev' })), 'auto');
    eq('the Console is a person typing, sdk-cli or not',
        S.sessionOrigin(facts({ entrypoint: 'sdk-cli', consoleHosted: true, agentId: 'dev' })), 'user');
    eq('‼️ S-37 stands: inside the fleet, no record of ours means it was not ours',
        S.sessionOrigin(facts({ entrypoint: 'sdk-cli', agentId: 'dev' })), 'user');
    eq('outside the fleet, sdk-* is still the only evidence there is',
        S.sessionOrigin(facts({ entrypoint: 'sdk-cli' })), 'auto');
    eq('a plain terminal outside the fleet is a person',
        S.sessionOrigin(facts({ entrypoint: 'cli' })), 'user');
    eq('‼️ a launcher outranks the Console id — reading a robot never relabels it',
        S.sessionOrigin(facts({ consoleHosted: true, launchedBy: { kind: 'schedule', label: '9am' } })), 'auto');
}

// ========================================== 2. the execution axis, on its own
{
    console.log('\n-- where it ran');
    ok('‼️ AUTO AND NOT HEADLESS IS REACHABLE — the state the 🌙 filter exists for',
        S.sessionOrigin(facts({ launchedBy: { kind: 'task', label: 't', mode: 'interactive' } })) === 'auto'
        && S.sessionHeadless(facts({ launchedBy: { kind: 'task', label: 't', mode: 'interactive' } })) === false);
    eq('a task that opened no terminal is headless',
        S.sessionHeadless(facts({ launchedBy: { kind: 'task', label: 't', mode: 'headless' } })), true);
    eq('…and a launcher with no mode recorded is read as the headless it always was',
        S.sessionHeadless(facts({ launchedBy: { kind: 'task', label: 't' } })), true);
    eq('an entrypoint of cli is a terminal, whatever the launcher says',
        S.sessionHeadless(facts({ entrypoint: 'cli', launchedBy: { kind: 'task', label: 't', mode: 'headless' } })), false);
    eq('the Console has a screen',
        S.sessionHeadless(facts({ entrypoint: 'sdk-cli', consoleHosted: true })), false);
    eq('‼️ inside the fleet, sdk-cli is the Console shape whose record can go missing',
        S.sessionHeadless(facts({ entrypoint: 'sdk-cli', agentId: 'dev' })), false);
    eq('outside it, sdk-* is a program entering with nobody there',
        S.sessionHeadless(facts({ entrypoint: 'sdk-cli' })), true);
    eq('an unknown entrypoint claims nothing', S.sessionHeadless(facts({})), false);
    eq('a person at a terminal is not headless', S.sessionHeadless(facts({ entrypoint: 'cli' })), false);
}

// ================================= 3. the axes do not consult one another
{
    console.log('\n-- independence');
    // The whole 2^4-ish space of what the rules read. Every row is checked on
    // both axes; what matters is that neither answer moves when the other does.
    const space = [];
    for (const entrypoint of [undefined, 'cli', 'sdk-cli', 'claude-desktop']) {
        for (const consoleHosted of [undefined, true]) {
            for (const agentId of [undefined, 'dev']) {
                for (const launchedBy of [undefined,
                    { kind: 'task', label: 't', mode: 'headless' },
                    { kind: 'task', label: 't', mode: 'interactive' }]) {
                    space.push(facts({ entrypoint, consoleHosted, agentId, launchedBy }));
                }
            }
        }
    }
    eq('the whole space is walked', space.length, 48);
    ok('‼️ headless never reads the origin: no row is headless BECAUSE it is auto',
        space.every(f => {
            const h = S.sessionHeadless(f);
            // The rule is stated in three clauses; recompute it here from the
            // execution facts alone and require the same answer. If the
            // implementation ever consults sessionOrigin again, a row where the
            // two disagree (Console-hosted with a launcher, say) breaks this.
            const own = f.consoleHosted ? false
                : f.launchedBy ? !(f.launchedBy.mode === 'interactive' || f.entrypoint === 'cli')
                    : f.entrypoint === 'cli' ? false
                        : String(f.entrypoint ?? '').startsWith('sdk') ? !f.agentId : false;
            return h === own;
        }));
    ok('a headless session is never labelled 🧑 by these rules',
        space.every(f => !(S.sessionHeadless(f) && S.sessionOrigin(f) === 'user')));
    ok('every row answers both questions without throwing',
        space.every(f => ['auto', 'user'].includes(S.sessionOrigin(f))
            && typeof S.sessionHeadless(f) === 'boolean'));
}

// ============================ 4. one session, one verdict, whichever surface
{
    console.log('\n-- two surfaces, one answer');
    // A full SessionInfo is what the tables, the dashboard and the bridge hold;
    // a hand-built fact set is what a page with only a transcript can offer.
    // The union type stops the THIRD shape — two of the four facts — from
    // compiling at all, which is what used to make these two disagree.
    const record = {
        file: 'x.jsonl', sessionId: 'abc', isSidechain: false,
        entrypoint: 'sdk-cli', agentId: 'developer',
        launchedBy: { kind: 'schedule', label: '9am', mode: 'interactive' }
    };
    eq('the record and the facts read off it agree on origin',
        S.sessionOrigin(record), S.sessionOrigin(facts(record)));
    eq('…and on headless', S.sessionHeadless(record), S.sessionHeadless(facts(record)));
    eq('the real case: a schedule opened a terminal — 🤖', S.sessionOrigin(record), 'auto');
    eq('…and it is NOT 🌙', S.sessionHeadless(record), false);

    // ‼️ The rule is a type, so it is checked by the compiler — but a future
    // widening of the signature would silently unmake it. Every call written as
    // an object literal must still name all four facts.
    const srcs = ['src/core/sessions.ts', 'src/core/turns.ts', 'src/extension.ts',
        'src/panels/sessionViewer.ts', 'src/panels/dashboard.ts',
        'src/panels/searchPanel.ts', 'src/panels/consolePanel.ts'];
    const partial = [];
    for (const rel of srcs) {
        // Comments out first — the rule is explained in a doc block that quotes
        // the very shape it forbids, and a scanner that reads prose measures
        // nothing but its own documentation.
        const text = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
        const re = /session(?:Origin|Headless)\(\s*\{([^}]*)\}/g;
        let m;
        while ((m = re.exec(text))) {
            const body = m[1];
            for (const key of ['entrypoint', 'consoleHosted', 'launchedBy', 'agentId']) {
                if (!new RegExp('\\b' + key + '\\b').test(body)) { partial.push(rel + ' → missing ' + key); }
            }
        }
    }
    ok('‼️ no surface calls the rules with a hand-built object missing a fact'
        + (partial.length ? ' (' + partial.slice(0, 4).join(', ') + ')' : ''), partial.length === 0);
}

// ================= 5. widening the binding did not widen what it may claim
{
    console.log('\n-- the interactive binding');
    const base = {
        taskId: 't1', agentId: 'dev', agentName: 'dev', kind: 'task', label: 'look at this',
        cwd: 'D:/zone/agent/ajanlar/developer', startedAt: 1_000_000
    };
    const spawn = { ...base, mode: 'interactive' };          // still open: no endedAt
    const headless = { ...base, mode: 'headless', endedAt: 1_000_000 + 3_600_000 };
    const now = 1_000_000 + 6 * 3_600_000;
    const sess = (firstTs, lastTs) => ({
        sessionId: 's', file: 'D:/x/s.jsonl',
        cwd: 'D:/zone/agent/ajanlar/developer', firstTs, lastTs: lastTs ?? firstTs + 60_000
    });

    const atSpawn = LB.bindSession(sess(1_000_500), [spawn], now);
    ok('an interactive run claims the transcript that begins at its spawn',
        LB.isBindingHit(atSpawn) && atSpawn.binding.taskId === 't1');
    eq('…and it carries the mode, which is what makes it Auto and not 🌙',
        LB.isBindingHit(atSpawn) ? atSpawn.binding.mode : '', 'interactive');
    ok('‼️ a conversation started an hour later in the same folder is NOT its transcript',
        LB.bindSession(sess(1_000_000 + 3_600_000), [spawn], now) === undefined);
    ok('the two-minute skew a real spawn has is still absorbed',
        LB.isBindingHit(LB.bindSession(sess(1_000_000 + 110_000), [spawn], now)));
    ok('a headless run keeps its whole lifespan — nothing else of ours is in there',
        LB.isBindingHit(LB.bindSession(sess(1_000_000 + 1_800_000, 1_000_000 + 1_900_000), [headless], now)));
    // A declared id is stronger than any clock rule and is how a Console-hosted
    // task binds: the panel hands its session id back at the spawn (M-26).
    const declared = { ...spawn, sessionId: 's' };
    const late = LB.bindSession(sess(1_000_000 + 5 * 3_600_000), [declared], now);
    ok('‼️ a DECLARED id is never subject to the clock',
        LB.isBindingHit(late) && late.proof === 'declared');

    // And the whole point of the widening: the binding becomes a launchedBy.
    const info = LB.applyBinding({}, atSpawn);
    eq('the binding becomes the launcher record the origin rule reads',
        info.launchedBy.kind, 'task');
    eq('…with the mode on it', info.launchedBy.mode, 'interactive');
    eq('so the session reads 🤖 Auto', S.sessionOrigin(facts({ ...info, agentId: 'dev' })), 'auto');
    eq('…and NOT headless', S.sessionHeadless(facts({ ...info, agentId: 'dev' })), false);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
