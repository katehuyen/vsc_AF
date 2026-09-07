// X-249 (2/n) · X-260 (2/n) — THE ONE-SHOT TURN IS A PER-ENGINE ADAPTER.
//
// ‼️ WHY THESE TWO ITEMS MEET HERE, MEASURED.
//
// X-260 (1/n) built the seam that gives the fleet's dozen short turns an
// ACCOUNT (`core/oneShot.ts`). It deliberately stopped at Claude:
// `oneShotLine` refuses any other engine BY NAME rather than falling through
// and quietly spawning `claude`.
//
// X-249's remaining half — "the leader turn should have an engine axis" — was
// measured to be blocked on the same thing from the other side, and the blocker
// is not the command line, it is the ENVELOPE. `parsePlannerEnvelope`
// (`core/missions.ts`) reads Claude's `--output-format json` envelope: an object
// carrying `result`, `session_id`, `total_cost_usd` and a `usage` block whose
// four token fields are summed. All three of those — the flag, the field names,
// the cost field — are Claude's, and a second engine publishes its own.
//
// So an engine axis is not "one more select". It is a pair per engine: BUILD
// THE LINE and READ WHAT CAME BACK. This file pins that pair as one adapter, so
// the next engine is a registration rather than an edit in two files that can
// disagree.
//
// ‼️ AND NO FORMAT IS INVENTED HERE. Codex's envelope has not been measured, so
// there is no Codex adapter — asking for one gets `undefined`, exactly as
// `oneShotLine` already refuses by name. A guessed field name would parse to
// `null` at 3 a.m. inside a mission round and read as "the model said nothing".
'use strict';
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const one = require(path.join(ROOT, 'out', 'core', 'oneShot.js'));
const M = require(path.join(ROOT, 'out', 'core', 'missions.js'));

// ---------- the adapter answers for the engines it has, and only those ----------
{
    ok('claude has a one-shot adapter', !!one.oneShotAdapter('claude'));
    ok('an unstated engine is claude — what these turns have always run on',
        !!one.oneShotAdapter(''));
    ok('‼️ an engine with no measured envelope has NO adapter, rather than a guess',
        one.oneShotAdapter('codex') === undefined);
    ok('…and the same for a name nobody has ever wired',
        one.oneShotAdapter('nonesuch') === undefined);
    ok('the engines that DO have one can be listed', Array.isArray(one.oneShotEngines())
        && one.oneShotEngines().indexOf('claude') >= 0);
}

// ---------- reading what came back ----------
{
    const env = JSON.stringify({
        result: 'the reply', session_id: 's-1', total_cost_usd: 0.25,
        usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 2 }
    });
    const r = one.oneShotEnvelope('claude', env);
    ok('the reply text comes back', r && r.result === 'the reply');
    ok('…the session id, which is what makes a planner continue',
        r && r.sessionId === 's-1');
    ok('…the cost', r && r.costUSD === 0.25);
    ok('…and the tokens, summed across the four fields', r && r.tokens === 17);
    ok('an error envelope is flagged rather than read as a reply',
        one.oneShotEnvelope('claude', JSON.stringify({ result: 'x', is_error: true })).isError === true);
    ok('leading noise before the envelope is tolerated',
        one.oneShotEnvelope('claude', 'warning: something\n' + env).result === 'the reply');
    ok('garbage is null, so the caller reports honestly instead of inventing a reply',
        one.oneShotEnvelope('claude', 'not json at all') === null);
    ok('‼️ an engine with no adapter reads NOTHING rather than reading Claude\'s shape',
        one.oneShotEnvelope('codex', env) === null);
}

// ---------- the SPAWN form: argv, because a prompt is not a shell argument ----------
{
    // ‼️ X-249 (2/n) — WHY A SECOND FORM RATHER THAN ONE.
    //
    // `line` builds a shell string and puts the prompt inside `-p "…"`. That is
    // right for the fleet's short turns, whose prompts they shape themselves. It
    // is WRONG for the leader turn: several kilobytes of the user's own words,
    // quotation marks and newlines, which is exactly the class of damage a dozen
    // inner rounds of `sanitizePrompt` exist to avoid. So the adapter publishes
    // the same turn as an ARGUMENT VECTOR too, and the prompt goes down STDIN.
    const a = one.oneShotArgv({ engine: 'claude', model: 'haiku', json: true });
    ok('the spawn form names the command on its own', a && a.cmd === 'claude');
    ok('…with the model as two arguments rather than one quoted word',
        a && a.args.join(' ') === '--model haiku --output-format json -p');
    ok('‼️ THE PROMPT IS NOT IN THE VECTOR — it goes down stdin, which is the point',
        a && a.stdin === true
        && !one.oneShotArgv({ model: 'haiku', prompt: 'quote " and newline' })
            .args.some(function (x) { return x.indexOf('quote') >= 0; }));
    ok('an unstated model asks for none, rather than inventing a default here',
        one.oneShotArgv({ json: true }).args.join(' ') === '--output-format json -p');
    ok('…and an unstated envelope asks for none either',
        one.oneShotArgv({}).args.join(' ') === '-p');
    ok('‼️ an engine nobody has written an adapter for is refused by name here too',
        one.oneShotArgv({ engine: 'codex' }) === undefined);
    // The shell form must be able to say the same two things, or a caller that
    // moves between the forms silently loses its model.
    ok('the shell form states the same dimensions',
        one.oneShotLine({ model: 'haiku', json: true, prompt: 'x' })
            === 'claude --model haiku --output-format json -p "x"');
    ok('…and still takes the raw flag string the fleet already passes',
        one.oneShotLine({ args: '--model sonnet', prompt: 'x' })
            === 'claude --model sonnet -p "x"');
}

// ---------- ‼️ ONE READER: missions must not keep a second copy ----------
{
    // `parsePlannerEnvelope` is the name four call sites already import. It
    // stays, and it now DELEGATES — because two readers of one envelope is the
    // exact shape this family of items keeps closing.
    const env = JSON.stringify({ result: 'hi', session_id: 'z', total_cost_usd: 1 });
    const viaMissions = M.parsePlannerEnvelope(env);
    const viaAdapter = one.oneShotEnvelope('claude', env);
    ok('‼️ the mission reader and the adapter return the same thing',
        JSON.stringify(viaMissions) === JSON.stringify(viaAdapter));
    ok('…including the null case', M.parsePlannerEnvelope('rubbish') === null
        && one.oneShotEnvelope('claude', 'rubbish') === null);

    const fs = require('fs');
    const src = fs.readFileSync(path.join(ROOT, 'src', 'core', 'missions.ts'), 'utf8');
    const at = src.indexOf('export function parsePlannerEnvelope');
    const body = src.slice(at, at + 900);
    ok('‼️ missions.ts no longer carries its own copy of the envelope shape',
        /oneShotEnvelope/.test(body) && !/total_cost_usd/.test(body));
}

// ---------- the line and the envelope are ONE adapter, not two lists ----------
{
    const fs = require('fs');
    const src = fs.readFileSync(path.join(ROOT, 'src', 'core', 'oneShot.ts'), 'utf8');
    ok('‼️ the line and the envelope are declared together, per engine',
        /line[\s\S]{0,200}envelope|envelope[\s\S]{0,200}line/.test(src));
    // The failure this prevents: an engine that can be SPAWNED but whose reply
    // nobody can read is worse than one that is refused — it burns a window and
    // reports silence.
    one.oneShotEngines().forEach(function (e) {
        const ad = one.oneShotAdapter(e);
        ok('every engine that can be spawned can also be read: ' + e,
            !!ad && typeof ad.envelope === 'function' && typeof ad.line === 'function');
        // ‼️ AND IT CAN BE SPAWNED BOTH WAYS. A registration carrying only the
        // shell form leaves the leader — the one caller that must not go through a
        // shell — with no way to run on that engine at all.
        ok('…and spawned without a shell, which is what a long prompt needs: ' + e,
            !!ad && typeof ad.argv === 'function');
    });
    ok('‼️ …and oneShotLine still refuses an unadapted engine by name',
        one.oneShotLine({ engine: 'codex', prompt: 'x' }) === undefined);
}

console.log((fail ? 'FAIL' : 'ok') + ' — test_one_shot_adapter.js: '
    + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
