// S-45 — A RESUMED SESSION COMES BACK AS ITSELF: model, effort, permission mode.
//
// ‼️ THE BUG THIS PINS. Both resume routes read `launchDefaults()` — the fleet's
// CURRENT settings — for all three dimensions. So a conversation the user had
// deliberately put on a bigger model, at a higher effort, under bypass, came
// back on whatever the settings page happened to say that day, and the three
// had to be re-picked by hand on every sitting. Worse than tedious: the wrong
// model runs silently, because nothing about the row says it changed.
//
// ‼️ AND WHY ORDER IS THE WHOLE FIX. The Console's composer boxes are SEEDED
// from those same defaults (`applyComposerSeed`: `st.model = d.model || ''`),
// so the `model` travelling with a resume click is normally the fleet default
// rather than an empty box. A transcript value placed AFTER it in an `||` chain
// could therefore never win. The order has to be transcript → box → default,
// and that is measured against the source below, because both call sites live
// inside message handlers a test cannot reach.
//
// ‼️ AND WHY THE TRANSCRIPT IS THE SOURCE RATHER THAN A STORE. A user who types
// `/model opus` inside the session changes the run without Agent Farm hearing
// about it; anything written down at launch would be stale exactly when it
// mattered. The file records what actually happened.
//
// The one subtlety in the parse: `SessionInfo.models` is a SET rendered in
// first-seen order, so a session that went opus → sonnet → opus holds
// `[opus, sonnet]` and its last element names the model that STOPPED being
// used. `lastModel` exists because of that.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`,
    JSON.stringify(got) === JSON.stringify(want));
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') {
        return {
            Uri: {}, window: {}, workspace: { getConfiguration: () => ({ get: (_k, d) => d }) },
            ViewColumn: {}, ConfigurationTarget: {}, env: {},
            EventEmitter: function () { this.event = () => ({ dispose() { } }); this.fire = () => { }; }
        };
    }
    return origLoad.apply(this, arguments);
};
const S = require(path.join(ROOT, 'out', 'core', 'sessions.js'));
const { narrowLaunch } = require(path.join(ROOT, 'out', 'core', 'models.js'));
const CT = require(path.join(ROOT, 'out', 'core', 'cliTranscripts.js'));
Module._load = origLoad;

const { parseSessionFile, lastRunDimensions, SESSION_PARSER_VERSION } = S;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-s45-'));
const pricing = { costFor: () => 0 };
let seq = 0;
// ‼️ THE TRAILING NEWLINE IS NOT COSMETIC. The parser cuts on the byte and
// HOLDS whatever follows the last newline, because a transcript is read while
// it is still being written and half a line is not JSON. A fixture without one
// therefore silently loses its last line — which, for a suite about "the LAST
// thing the transcript said", would fail every assertion for the wrong reason.
// Measured: all 40 most recent real transcripts end with one.
const parse = (lines) => {
    const file = path.join(dir, `s${++seq}.jsonl`);
    fs.writeFileSync(file, lines.map(l => JSON.stringify(l)).join('\n') + '\n', 'utf8');
    return parseSessionFile(file, pricing, 0);
};
const now = Date.now();
const iso = msAgo => new Date(now - msAgo).toISOString();
const say = (o) => Object.assign({
    type: 'assistant', timestamp: iso(1000), requestId: 'r' + Math.random(),
    message: { id: 'a' + Math.random(), model: 'claude-opus-5', usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'text', text: 'hi' }] }
}, o);
const ask = (text, t) => ({ type: 'user', timestamp: iso(t ?? 2000), cwd: 'D:\\w', message: { role: 'user', content: text } });

// ================================================ 1. the parse: which model
{
    // opus → sonnet → opus. The SET says [opus, sonnet]; the session is on opus.
    const info = parse([
        ask('start', 9000),
        say({ timestamp: iso(8000), message: { id: 'a1', model: 'claude-opus-5', usage: {}, content: [] } }),
        say({ timestamp: iso(7000), message: { id: 'a2', model: 'claude-sonnet-5', usage: {}, content: [] } }),
        say({ timestamp: iso(6000), message: { id: 'a3', model: 'claude-opus-5', usage: {}, content: [] } })
    ]);
    eq('the set still holds both, in first-seen order', info.models, ['claude-opus-5', 'claude-sonnet-5']);
    eq('…and its last element is the WRONG answer to "what is it on now"',
        info.models[info.models.length - 1], 'claude-sonnet-5');
    eq('lastModel is the model that actually answered last', info.lastModel, 'claude-opus-5');
}
{
    // A synthetic reply is not a model choice — it is the CLI talking to itself.
    const info = parse([
        ask('start', 9000),
        say({ timestamp: iso(8000), message: { id: 'a1', model: 'claude-haiku-4-5', usage: {}, content: [] } }),
        say({ timestamp: iso(7000), message: { id: 'a2', model: '<synthetic>', usage: {}, content: [] } })
    ]);
    eq('a <synthetic> line does not become the last model', info.lastModel, 'claude-haiku-4-5');
    eq('…and stays out of the set as it always did', info.models, ['claude-haiku-4-5']);
}
{
    const info = parse([ask('nobody answered', 1000)]);
    eq('a transcript with no real reply names no model', info.lastModel, undefined);
}

// ================================================ 2. the parse: which effort
//
// ‼️ The field is on the LINE (beside type/timestamp), not inside `message` —
// measured against real transcripts in ~/.claude/projects. Reading it off
// `message` would have found nothing and the feature would have shipped as a
// permanent `undefined` that every test still passed.
{
    const info = parse([
        ask('start', 9000),
        say({ timestamp: iso(8000), effort: 'low', message: { id: 'a1', model: 'claude-opus-5', usage: {}, content: [] } }),
        say({ timestamp: iso(7000), effort: 'xhigh', message: { id: 'a2', model: 'claude-opus-5', usage: {}, content: [] } })
    ]);
    eq('effort is the last one the transcript states', info.effort, 'xhigh');
}
{
    // A line that says nothing must not ERASE what the line before it said:
    // most assistant lines carry no effort at all.
    const info = parse([
        ask('start', 9000),
        say({ timestamp: iso(8000), effort: 'high', message: { id: 'a1', model: 'claude-opus-5', usage: {}, content: [] } }),
        say({ timestamp: iso(7000), message: { id: 'a2', model: 'claude-opus-5', usage: {}, content: [] } }),
        say({ timestamp: iso(6000), effort: '   ', message: { id: 'a3', model: 'claude-opus-5', usage: {}, content: [] } })
    ]);
    eq('a silent line does not clear the effort', info.effort, 'high');
}
{
    const info = parse([
        ask('start', 2000),
        say({ timestamp: iso(1000), message: { id: 'a1', model: 'claude-opus-5', usage: {}, content: [] } })
    ]);
    ok('an engine that never writes effort leaves an ABSENCE, not a default',
        info.effort === undefined);
}

// ================================================ 3. the parse: which mode
// (X-124's field, unchanged — pinned here because S-45 now READS it.)
{
    const info = parse([
        ask('start', 9000),
        { type: 'permission-mode', timestamp: iso(8500), permissionMode: 'default' },
        say({ timestamp: iso(8000), message: { id: 'a1', model: 'claude-opus-5', usage: {}, content: [] } }),
        { type: 'permission-mode', timestamp: iso(7500), permissionMode: 'bypassPermissions' },
        say({ timestamp: iso(7000), message: { id: 'a2', model: 'claude-opus-5', usage: {}, content: [] } })
    ]);
    eq('permissionMode is the last mode stated', info.permissionMode, 'bypassPermissions');
}

// ================================================ 4. the reader
{
    eq('nothing in, nothing out', lastRunDimensions(undefined), {});
    eq('…and a null row does not throw', lastRunDimensions(null), {});
    eq('an unparsed session offers no opinion', lastRunDimensions({}), {});
    eq('all three when the transcript has all three',
        lastRunDimensions({ lastModel: 'claude-opus-5', effort: 'high', permissionMode: 'bypassPermissions' }),
        { model: 'claude-opus-5', effort: 'high', permissionMode: 'bypassPermissions' });
    // Absent stays absent — the caller must be able to fall through to its own
    // next layer rather than be handed an invention.
    eq('effort alone does not invent a model',
        lastRunDimensions({ effort: 'high' }), { effort: 'high' });
    eq('blank strings are absences too',
        lastRunDimensions({ lastModel: '  ', effort: '', permissionMode: ' ' }), {});
    eq('values are trimmed', lastRunDimensions({ lastModel: ' claude-opus-5 ' }),
        { model: 'claude-opus-5' });
    // A parse remembered by an older build has no lastModel. The set is the
    // fallback and ONLY the fallback: it is the last model to appear, which is
    // right far more often than it is wrong, and never as right as the field.
    eq('an older cached parse falls back to the set',
        lastRunDimensions({ models: ['claude-opus-5', 'claude-sonnet-5'] }),
        { model: 'claude-sonnet-5' });
    eq('…and the field wins whenever it is there',
        lastRunDimensions({ lastModel: 'claude-opus-5', models: ['claude-opus-5', 'claude-sonnet-5'] }),
        { model: 'claude-opus-5' });
    eq('an empty set is not a model', lastRunDimensions({ models: [] }), {});
}

// ================================================ 5. the parser version
//
// ‼️ WITHOUT THIS BUMP THE FEATURE WOULD SHIP DEAD. The version is part of the
// index's cache key, and every session already on this machine is cached from a
// build that had neither field. They would come back with `lastModel` and
// `effort` undefined — for exactly the sessions the user resumes most, which
// are the ones already indexed.
ok('SESSION_PARSER_VERSION was bumped past the build that had neither field',
    SESSION_PARSER_VERSION >= 2);

// ================================================ 6. the pair still narrows
//
// The inherited pair is a fact about the catalogue AS IT STOOD THEN. A row
// resumed after the model was retired, or on an engine that never offered that
// effort, is the X-30 error with an older date on it.
{
    const em = {
        models: [{ id: 'claude-opus-5' }, { id: 'claude-sonnet-5' }],
        efforts: { 'claude-opus-5': [{ id: 'low' }, { id: 'high' }] },
        defaultEffort: { 'claude-opus-5': 'low' }
    };
    const kept = narrowLaunch(em, 'claude-opus-5', 'high');
    eq('a pair the engine still offers comes back whole', kept, { model: 'claude-opus-5', effort: 'high' });
    const gone = narrowLaunch(em, 'claude-opus-3-retired', 'high');
    eq('a model the catalogue no longer knows is dropped', gone.model, '');
}

// ================================================ 7. both doors, in order
//
// The two call sites are inside a webview message handler and a command
// closure; the source is the only handle a test has on them.
{
    const cp = read('src', 'panels', 'consolePanel.ts');
    ok('the Console resume reads the row it already looked up',
        /const\s+inherit\s*=\s*lastRunDimensions\(row\)/.test(cp));
    ok('…and the transcript comes FIRST in the model chain',
        /inherit\.model\s*\|\|\s*str\('model'\)\s*\|\|\s*d\.model/.test(cp));
    ok('…and in the effort chain',
        /inherit\.effort\s*\|\|\s*str\('effort'\)\s*\|\|\s*d\.effort/.test(cp));
    ok('…and in the permission chain',
        /inherit\.permissionMode\s*\|\|\s*str\('permissionMode'\)\s*\|\|\s*d\.permissionMode/.test(cp));
    ok('…and the pair still goes through narrowLaunch',
        /narrowLaunch\(this\.engineModelsFor\(engine\),\s*\n\s*inherit\.model/.test(cp));

    const ex = read('src', 'extension.ts');
    ok('the terminal resume reads the session it was handed',
        /const\s+inherit\s*=\s*lastRunDimensions\(s\)/.test(ex));
    ok('…and narrows the inherited pair for that engine',
        /narrowLaunch\(engineModelMatrix\(\)\[engine\],\s*\n\s*inherit\.model\s*\|\|\s*defaulted\.model/.test(ex));
    ok('…and the inherited mode beats the fleet/agent default',
        /permissionMode:\s*inherit\.permissionMode\s*\|\|\s*defaulted\.permissionMode/.test(ex));
    // ‼️ K-22 — inheriting a mode must not be a way AROUND the folder's policy.
    ok('…and the resolved permission is still what reaches the command line',
        /permission:\s*resolveLaunchPermission\(merged\.permissionMode/.test(ex));

    // ‼️ THERE ARE FOUR DOORS, NOT TWO. The item named two and the codebase had
    // four; `_REF/agentfarm-dev.md` calls doing one and forgetting the rest a
    // structural failure, and this is the measurement of it. `resumeInConsole`
    // is the one that made the case: it ALREADY reached for the model and
    // reached wrong, through `models[models.length - 1]`.
    ok('resumeInConsole inherits all three rather than guessing at one',
        /const\s+inherit\s*=\s*lastRunDimensions\(s\);\s*\n\s*const\s+sameEngine/.test(ex));
    ok('…and no longer reads the model off the first-seen set',
        !/models\[s\.models\.length - 1\]/.test(ex) && !/s\.models\[s\.models\.length - 1\]/.test(ex));
    ok('…and narrows the inherited pair for the row\'s engine',
        /narrowLaunch\(engineModelMatrix\(\)\[engine\],\s*\n\s*inherit\.model\s*\|\|\s*\(sameEngine/.test(ex));
    ok('…and its inherited mode beats the fleet default',
        /permissionMode:\s*inherit\.permissionMode\s*\|\|\s*d\.permissionMode/.test(ex));

    // The bridge door — and the ONE place the order is deliberately the other
    // way round: an argument a caller wrote is a real choice, unlike a composer
    // box that was seeded from the defaults, so it wins over the transcript.
    ok('sessions.start looks the resumed transcript up',
        /const\s+resumed\s*=\s*optStr\(args, 'resume'\)\s*\n\s*\?\s*sessionFromArg\(optStr\(args, 'resume'\)\)/.test(ex));
    ok('…and fills only what the caller left out',
        /if \(!o\.model && inherit\.model\)/.test(ex)
        && /if \(!o\.effort && inherit\.effort\)/.test(ex)
        && /if \(!o\.permissionMode && inherit\.permissionMode\)/.test(ex));
    ok('…and says so in its describe, because that is all an agent reads',
        /resume\? \(session id[^)]*inherited from its transcript/.test(ex));
}

// ============================ 7. S-46 — and the engine S-45 never reached
//
// ‼️ THE HALF THAT WAS MISSING. S-45 was built and tested against the Claude
// parser alone, so an Antigravity conversation still came back from a resume on
// the fleet default: the exact failure S-45 exists to end, on a different
// engine. This engine writes no model field at all — it staples a SENTENCE to
// the USER_INPUT step, and the sentence is the record.
//
// Every string below is verbatim from `~/.gemini/antigravity-cli/brain`.
{
    // The captured shape: the ask inside <USER_REQUEST>, the setting after it.
    const said = (from, to) => '<USER_REQUEST>\ndo the thing\n</USER_REQUEST>\n'
        + '<ADDITIONAL_METADATA>\nThe current local time is: 2026-08-19T11:40:30+07:00.\n</ADDITIONAL_METADATA>\n'
        + '<USER_SETTINGS_CHANGE>\nThe user changed setting `Model Selection` from '
        + `${from} to ${to}. No need to comment on this change if the user doesn't ask about it. `
        + 'If reporting what model you are, please use a human readable name instead of the exact string.\n'
        + '</USER_SETTINGS_CHANGE>';

    eq('‼️ the human label is split back into the id and the effort the CLI takes',
        CT.agyModelSetting(said('None', 'Gemini 3.7 Flash (High)')),
        { model: 'gemini-3.7-flash', effort: 'high' });
    // ‼️ THE VERSION DOT IS THE TRAP. A pattern that stops at the first `.`
    // reads this model as "Gemini 3", which resolves to nothing and looks like
    // "the engine did not say" rather than like a broken parse.
    eq('…including the dot in the version, which is part of the id',
        CT.agyModelSetting(said('None', 'Gemini 3.1 Pro (Low)')).model, 'gemini-3.1-pro');
    eq('a model changed mid-conversation is read as the LAST one, not the first',
        CT.agyModelSetting(said('None', 'Gemini 3.7 Flash (High)') + '\n'
            + said('Gemini 3.7 Flash (High)', 'Gemini 3.6 Flash (Low)')),
        { model: 'gemini-3.6-flash', effort: 'low' });
    // ‼️ AND WHAT IT REFUSES TO GUESS. `Claude Sonnet 4.6 (Thinking)` is
    // `claude-sonnet-4-6` while `Claude Opus 4.6 (Thinking)` is
    // `claude-opus-4-6-thinking` — two identical parentheticals mapping two
    // different ways, so the label does not derive the id and nothing is
    // invented. Measured: this is the ONE label of 106 that goes unread.
    ok('‼️ a label whose id is not derivable says nothing rather than a wrong id',
        CT.agyModelSetting(said('None', 'Claude Sonnet 4.6 (Thinking)')) === undefined);
    ok('a conversation that never changed the setting says nothing',
        CT.agyModelSetting('<USER_REQUEST>\nhello\n</USER_REQUEST>') === undefined
        && CT.agyModelSetting(said('Gemini 3.7 Flash (High)', 'None')) === undefined);

    // End to end, through the source the Sessions table actually reads.
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'af-s46-'));
    const conv = path.join(home, 'brain', 'conv-agy', '.system_generated', 'logs');
    fs.mkdirSync(conv, { recursive: true });
    const t0 = Date.parse('2026-08-19T11:40:30Z');
    const iso = ms => new Date(ms).toISOString().replace('.000Z', 'Z');
    fs.writeFileSync(path.join(conv, 'transcript.jsonl'), [
        { step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', status: 'DONE', created_at: iso(t0), content: said('None', 'Gemini 3.7 Flash (High)') },
        { step_index: 1, source: 'MODEL', type: 'PLANNER_RESPONSE', status: 'DONE', created_at: iso(t0 + 1000), content: 'done' },
        { step_index: 2, source: 'USER_EXPLICIT', type: 'USER_INPUT', status: 'DONE', created_at: iso(t0 + 2000), content: said('Gemini 3.7 Flash (High)', 'Gemini 3.6 Flash (Low)') }
    ].map(o => JSON.stringify(o)).join('\n') + '\n', 'utf8');
    const row = CT.agySessionsSource(() => home, () => ({}), undefined, 0).scan()[0];
    eq('‼️ the row carries the model that answered LAST, which is what a resume takes',
        [row.lastModel, row.effort], ['gemini-3.6-flash', 'low']);
    // `models` stays the honest answer to "what has served it" — a set in
    // first-seen order, so its last element is NOT the current model.
    eq('…while `models` still names everything it ran on, in the order it did',
        row.models, ['gemini-3.7-flash', 'gemini-3.6-flash']);
    eq('…and the resume ladder reads the pair off the row unchanged',
        lastRunDimensions(row), { model: 'gemini-3.6-flash', effort: 'low' });
    // The whole point: with the catalogue in hand the pair survives narrowing,
    // which is where a bare model would have lost its effort and died at the CLI.
    fs.rmSync(home, { recursive: true, force: true });

    // ‼️ AND THE SAME BUMP AGAIN, FOR THE SAME REASON. Every agy session on this
    // machine is already cached from a build that read no model; without a new
    // version they stay modelless for ever, because their files never change.
    ok('SESSION_PARSER_VERSION was bumped past the build that read no agy model',
        SESSION_PARSER_VERSION >= 3);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
