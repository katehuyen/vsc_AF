// M-13 — the supervisor's real dependencies (src/core/supervisorWire.ts): the
// incident it is shown, and the one read-only turn it is asked in — argv and
// stdin, never a prompt spelt into a shell line.
'use strict';
const path = require('path');
const { EventEmitter } = require('events');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, a, b) => ok(n + ` (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b));

const W = require(path.join(__dirname, '..', 'out', 'core', 'supervisorWire.js'));

const fakeSpawn = (reply, calls) => (cmd, args, opts) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => { };
    child.stdin = {
        end: (text) => {
            calls.push({ cmd, args, opts, stdin: text });
            setImmediate(() => { if (reply !== null) { child.stdout.emit('data', reply); child.emit('close', 0); } });
        }
    };
    return child;
};

(async () => {
    console.log('\n== the ask: read-only, argv + stdin, the envelope read ==');
    {
        const calls = [];
        const reply = JSON.stringify({ type: 'result', result: '{"action":"resume"}', total_cost_usd: 0.012, session_id: 'sup-1', is_error: false });
        const ask = W.supervisorAsk({ cwdOf: () => 'D:\\x', spawn: fakeSpawn(reply, calls) });
        const prompt = 'line one\n"quoted" %PATH% & rm -rf';
        const a = await ask({ engine: 'claude', model: 'haiku', maxCalls: 2, minConfidence: 0.6, lowConfidence: 'smart' }, prompt, { id: 't1' });
        eq('the reply, its cost and its session', a, { text: '{"action":"resume"}', costUsd: 0.012, sessionId: 'sup-1' });
        const c = calls[0];
        ok('‼️ it runs read-only', c.args.join(' ').includes('--permission-mode plan'));
        ok('…asks for the envelope, on the chosen model', c.args.join(' ').includes('--output-format json') && c.args.join(' ').includes('--model haiku'));
        ok('‼️ the prompt goes on stdin, untouched, and is not on the command line', c.stdin === prompt && !c.args.some(x => x.includes('quoted')));
        eq('in the run\'s folder', c.opts.cwd, 'D:\\x');
    }
    {
        const calls = [];
        const ask = W.supervisorAsk({ cwdOf: () => 'D:\\x', spawn: fakeSpawn('', calls) });
        const bad = await ask({ engine: 'claude', model: 'haiku & calc', maxCalls: 2, minConfidence: 0.6, lowConfidence: 'smart' }, 'p', { id: 't1' });
        ok('‼️ a model that is not a name is refused before anything spawns', /not a model name/.test(bad.error || '') && calls.length === 0);
        const none = await ask({ engine: 'nosuch', maxCalls: 2, minConfidence: 0.6, lowConfidence: 'smart' }, 'p', { id: 't1' });
        ok('an engine with no one-shot turn is refused by name', /no one-shot turn/.test(none.error || '') && calls.length === 0);
        const errReply = JSON.stringify({ type: 'result', result: '', is_error: true, subtype: 'error_during_execution' });
        const e = await W.supervisorAsk({ cwdOf: () => 'D:\\x', spawn: fakeSpawn(errReply, []) })(
            { engine: 'claude', maxCalls: 2, minConfidence: 0.6, lowConfidence: 'smart' }, 'p', { id: 't1' });
        ok('an engine error is an error, not an answer', /reported an error/.test(e.error || ''));
        const slow = await W.supervisorAsk({ cwdOf: () => 'D:\\x', spawn: fakeSpawn(null, []), timeoutMs: 20 })(
            { engine: 'claude', maxCalls: 2, minConfidence: 0.6, lowConfidence: 'smart' }, 'p', { id: 't1' });
        ok('a turn past its ceiling is cut', /ceiling/.test(slow.error || ''));
    }

    console.log('\n== the incident: the chain as attempts, the original prompt, the folder ==');
    {
        const origin = { id: 'a', title: 'gece taraması', prompt: 'ORIGINAL', status: 'failed', createdAt: 1, endedAt: 100, failurePhase: 'limit', engine: 'claude',
            events: [{ ts: 100, kind: 'finished', note: 'failed after 40 min — hit the session limit' }] };
        const failed = { id: 'b', title: 'gece taraması', prompt: 'CONTINUE', status: 'failed', createdAt: 150, endedAt: 200, retryOf: 'a', retryAttempt: 1,
            failurePhase: 'limit', engine: 'claude', hostedSessionId: 'sess-b', events: [{ ts: 200, kind: 'finished', note: 'limit again' }] };
        const row = { id: 'c', title: 'gece taraması', prompt: 'CONTINUE', status: 'queued', createdAt: 210, retryOf: 'a', retryAttempt: 2,
            resetAt: 5000, supervision: { key: 'inc-1' } };
        const all = [origin, failed, row];
        eq('attempts, oldest first, without the held row', W.attemptsOf(all, row).map(x => [x.n, x.phase, x.why]),
            [[1, 'limit', 'failed after 40 min — hit the session limit'], [2, 'limit', 'limit again']]);
        const asked = [];
        const b = await W.incidentFrom({
            all: () => all, sessionOf: t => t.hostedSessionId,
            lastTurns: async sid => { asked.push(sid); return 'assistant: tests are red in test_x.js'; },
            changes: async () => ({ status: ' M src/a.ts', stat: '1 file changed' }),
            retriesLeft: () => 1
        })(row, failed);
        eq('its key is the incident\'s', b.key, 'inc-1');
        eq('‼️ the task is shown with its ORIGINAL prompt', b.task.prompt, 'ORIGINAL');
        eq('the failure of the run that was cut', [b.failure.phase, b.failure.why, b.failure.sessionId, b.failure.resetAt], ['limit', 'limit again', 'sess-b', 5000]);
        ok('the transcript tail of THAT run', asked[0] === 'sess-b' && /tests are red/.test(b.lastTurns));
        eq('the folder, and what is left', [b.changes.status, b.remaining.retries], [' M src/a.ts', 1]);
        const blind = await W.incidentFrom({
            all: () => all, sessionOf: () => undefined, lastTurns: async () => { throw new Error('x'); },
            changes: async () => { throw new Error('no git'); }, retriesLeft: () => -3
        })(row, failed);
        ok('a source that cannot answer says so, and nothing throws', /could not be read/.test(blind.lastTurns) && !blind.changes && blind.remaining.retries === 0);
    }

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
