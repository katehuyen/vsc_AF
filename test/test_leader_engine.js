// X-249 (2/n) — THE LEADER TURN'S ENGINE IS AN AXIS, NOT A CONSTANT.
//
// ‼️ WHAT WAS ACTUALLY IN THE WAY, MEASURED.
//
// `LEADER_ENGINE = 'claude'` was not laziness: it was the honest name for a
// runner that could spawn one engine and read one envelope. Its own comment
// said so — "a settable field over a runner that ignores it would be a box that
// lies". Two things had to exist before the constant could become a choice, and
// X-249 (2/n) is the second of them:
//
//   1. a per-engine ADAPTER carrying both halves (build the line, read the
//      reply) — that is `core/oneShot.ts`, built in the previous turn;
//   2. a SPAWN form of that line. The leader does not use the shell: its prompt
//      is several kilobytes of the user's own words, quotation marks and
//      newlines, and it goes down STDIN. `oneShotLine` builds a shell string
//      with the prompt inside `-p "…"`, so moving the leader onto it would have
//      been a REGRESSION — exactly the class of damage `sanitizePrompt` exists
//      to avoid. The adapter therefore publishes `argv(want)` beside `line`.
//
// ‼️ AND THE LEADER KEEPS ITS OWN PROCESS MANAGEMENT. It has its own cut, it
// kills and writes its own sentence, it streams stdout and stderr, and when the
// envelope cannot be read it hands the prose over ANYWAY. `execOneShot`'s single
// timeout-and-callback shape carries none of that. What it takes from the
// adapter is the three engine-specific facts and nothing else: ARGV · ENV ·
// ENVELOPE.
//
// ‼️ NOTHING IS INVENTED. There is still exactly one adapter, so the axis has
// one legal value today — and an engine nobody has written one for is REFUSED
// BY NAME rather than quietly spawning `claude`, which is what a constant would
// have gone on doing for ever.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const L = require(path.join(ROOT, 'out', 'core', 'sentryLeader.js'));
const one = require(path.join(ROOT, 'out', 'core', 'oneShot.js'));
const C = require(path.join(ROOT, 'out', 'core', 'sentryCampaign.js'));

// ---------- the axis exists, and the constant is gone ----------
{
    ok('the engine the leader runs on has a DEFAULT, named once',
        L.DEFAULT_LEADER_CAPS.engine === 'claude');
    ok('‼️ …and it is no longer a module constant a runner could ignore',
        L.LEADER_ENGINE === undefined);
    const src = fs.readFileSync(path.join(ROOT, 'src', 'core', 'sentryLeader.ts'), 'utf8');
    ok('‼️ …not even declared, so there is one place the answer can come from',
        !/export const LEADER_ENGINE/.test(src));
    ok('the default engine is one the adapter can really spawn AND read',
        !!one.oneShotAdapter(L.DEFAULT_LEADER_CAPS.engine));
}

// ---------- the runner is told which engine, every turn ----------
const TODAY = '2026-09-07', NOW = 1700000000000;
const clock = { today: TODAY, now: () => NOW };
const GOOD = { prompt: 'do the next thing', why: 'because', hold: false };
const runner = (out) => {
    const f = async (o) => { f.calls.push(o); return typeof out === 'function' ? out(o) : out; };
    f.calls = [];
    return f;
};
const BRIEF = {
    diagnosis: {
        sessionId: '689569e7-94b4-45f9-bb60-4c0f33b2bb5a', session: '689569e7',
        outcome: 'hit-the-wall', rule: 'wall', why: 'work outstanding, no handover.',
        evidence: ['D:/repo: 3 uncommitted paths'], unknown: [], limit: false, policy: {}
    },
    verdict: { verdict: 'leader', fired: ['no-handover'], why: 'no-handover fired', problems: [] },
    next: { code: 'X-249', text: 'the leader engine axis', effort: 'M' },
    project: 'PRS.MuratVural_DEV_VSC.AgentFarm'
};
const CAPS = Object.assign({}, L.DEFAULT_LEADER_CAPS);

(async () => {
    {
        const run = runner({ text: JSON.stringify(GOOD), costUsd: 0.01 });
        await runLeader(run, CAPS);
        ok('‼️ the engine travels to the runner — the one thing that decides what is spawned',
            run.calls.length === 1 && run.calls[0].engine === 'claude');
    }
    {
        // ‼️ UNLIKE THE ACCOUNT. An unnamed account means "you decide" and must
        // NOT be substituted; an unnamed engine is a missing answer with a
        // documented default, exactly like the model. The two look alike on the
        // record and are opposite in meaning, which is why both are pinned.
        const run = runner({ text: JSON.stringify(GOOD) });
        await runLeader(run, Object.assign({}, CAPS, { engine: '' }));
        ok('an unnamed engine falls through to the default, as the model does',
            run.calls[0].engine === 'claude');
        const run2 = runner({ text: JSON.stringify(GOOD) });
        await runLeader(run2, Object.assign({}, CAPS, { account: '' }));
        ok('…while an unnamed account is passed through EMPTY, because that is an answer',
            run2.calls[0].account === '');
    }
    {
        // The core module has no adapter list and must not grow one: refusing
        // belongs where the process is actually spawned, and it arrives back as
        // an ordinary failed turn — mechanical, recorded, campaign alive.
        const run = runner({ text: JSON.stringify(GOOD) });
        await runLeader(run, Object.assign({}, CAPS, { engine: 'codex' }));
        ok('an engine nobody wired is carried, not silently rewritten to claude',
            run.calls[0].engine === 'codex');
        const refused = runner({ text: '', error: 'no one-shot turn is implemented for "codex"' });
        const r = await runLeader(refused, Object.assign({}, CAPS, { engine: 'codex' }));
        ok('‼️ …and the refusal ends the turn mechanically instead of stopping the night',
            r.path === 'mechanical' && /codex/.test(r.why) && r.assist && r.assist.ok === false);
    }

    // ---------- a campaign may name one, and absent still means the setting ----------
    {
        const rec = C.newSentry({ project: 'proj', leaderEngine: 'claude' }, NOW);
        ok('a campaign can name the engine its leader turn runs on',
            !!rec.leaderCaps && rec.leaderCaps.engine === 'claude');
        const bare = C.newSentry({ project: 'proj' }, NOW);
        ok('‼️ …and asking for nothing writes nothing, so the setting goes on deciding',
            !bare.leaderCaps || bare.leaderCaps.engine === undefined);
    }

    // ---------- the spawn side takes THREE facts from the adapter ----------
    {
        const src = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
        const at = src.indexOf('const sentryLeaderRunner');
        const body = src.slice(at, src.indexOf('const leaderCapsFor', at));
        ok('the leader runner was found in the source', at > 0 && body.length > 500);
        ok('‼️ ARGV comes from the adapter, so the flag names are the engine\'s own',
            /oneShotArgv/.test(body));
        ok('‼️ ENVELOPE comes from the adapter, not from a Claude-shaped reader',
            /oneShotEnvelope/.test(body) && !/parsePlannerEnvelope/.test(body));
        ok('‼️ ENV comes from the same assembly every other spawn in the farm uses',
            /oneShotEnv/.test(body));
        ok('‼️ …and the engine is never spelt here again',
            !/LEADER_ENGINE/.test(body) && !/'claude'/.test(body));
        // What must NOT have happened: the leader handed to `execOneShot`.
        ok('‼️ the leader keeps its own spawn, its own cut and its own streams',
            /cp\.spawn/.test(body) && /setTimeout/.test(body) && !/execOneShot/.test(body));
        ok('…including handing the prose over when the envelope cannot be read',
            /out\.trim\(\)/.test(body));
        ok('‼️ and an engine with no adapter is refused BY NAME rather than spawned',
            /oneShotArgv[\s\S]{0,400}(no one-shot|not implemented|has no one-shot)/.test(body));
    }

    console.log((fail ? 'FAIL' : 'ok') + ' — test_leader_engine.js: '
        + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();

function runLeader(run, caps) {
    return L.runLeaderTurn(BRIEF, caps, run, clock);
}
