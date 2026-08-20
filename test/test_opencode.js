// A-16 — OpenCode's engine contract, tested against frames a real binary sent.
//
// ‼️ EVERY FIXTURE BELOW IS A CAPTURE, NOT A SKETCH. They were taken on
// 2026-08-15 from opencode 1.18.18 on this machine with `tools/opencode_acp_probe.js`
// and `opencode run --format json`; the raw wire logs are under `dist/measure/`
// and the sanitised evidence is `docs/OPENCODE-ENTEGRASYON.tr.md`. An adaptor
// written against imagined field names passes its own tests perfectly and
// produces an empty Console against the real program — which is the whole reason
// this file exists before the runtime does.
//
// What is asserted is the part a regex over the source cannot see:
//
//   * `sessionCapabilities` members are OBJECTS (`{ "list": {} }`), so a boolean
//     read of them switches off half the integration against a binary that
//     supports all of it;
//   * `session/set_config_option` takes `configId`, and `id` is refused — one
//     word between a working model picker and a silent stderr error;
//   * the turn usage is NOT cumulative, so the Codex-style delta would report
//     every second turn as free;
//   * spend and context arrive on DIFFERENT events and the totals are close
//     enough (29381 vs 29341) to look interchangeable;
//   * `opencode export` prints a sentence above its JSON, so `JSON.parse` on the
//     stdout of a perfectly good export throws.
const path = require('path');
const { StringDecoder } = require('string_decoder');
const O = require(path.join(__dirname, '..', 'out', 'core', 'opencode.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// --- captured: `initialize` result, opencode 1.18.18 -----------------------
const INIT = {
    protocolVersion: 1,
    agentCapabilities: {
        loadSession: true,
        mcpCapabilities: { http: true, sse: true },
        promptCapabilities: { embeddedContext: true, image: true },
        sessionCapabilities: { close: {}, fork: {}, list: {}, resume: {} }
    },
    authMethods: [{
        description: 'Run `opencode auth login` in the terminal',
        name: 'Login with opencode',
        id: 'opencode-login'
    }],
    agentInfo: { name: 'OpenCode', version: '1.18.18' }
};

const caps = O.opencodeCapabilities(INIT);
ok('protocol version read', caps.protocolVersion === 1);
ok('agent version recorded', caps.agentVersion === '1.18.18' && caps.agentName === 'OpenCode');
ok('loadSession is a real boolean', caps.loadSession === true);
// ‼️ The trap: these are `{}`, and `v === true` on them is false.
ok('sessionCapabilities objects read as present',
    caps.sessionList && caps.sessionResume && caps.sessionFork && caps.sessionClose);
ok('prompt capabilities', caps.image === true && caps.embeddedContext === true);
ok('mcp capabilities', caps.mcpHttp === true && caps.mcpSse === true);
ok('auth method carried whole',
    caps.authMethods.length === 1 && caps.authMethods[0].id === 'opencode-login'
    && /auth login/.test(caps.authMethods[0].description));

ok('a measured build is not refused', O.opencodeCapabilityRefusal(caps) === '');

const v2 = O.opencodeCapabilities({ ...INIT, protocolVersion: 2 });
ok('a different protocol is refused BY NUMBER',
    /protocol 2/.test(O.opencodeCapabilityRefusal(v2)) && /speaks 1/.test(O.opencodeCapabilityRefusal(v2)));

const noLoad = O.opencodeCapabilities({
    ...INIT,
    agentCapabilities: { ...INIT.agentCapabilities, loadSession: false, sessionCapabilities: { list: {} } }
});
const refusal = O.opencodeCapabilityRefusal(noLoad);
ok('a lost capability is refused BY NAME',
    /loadSession/.test(refusal) && /session resume/.test(refusal) && /1\.18\.18/.test(refusal));

// Nothing throws on rubbish — a malformed handshake must not take the host down.
const empty = O.opencodeCapabilities(undefined);
ok('fail-soft on no handshake at all', empty.protocolVersion === 0 && empty.loadSession === false);
ok('…and it refuses rather than proceeding', O.opencodeCapabilityRefusal(empty) !== '');

// --- captured: `session/new` result ---------------------------------------
const NEW_SESSION = {
    sessionId: 'ses_ffae93e06ffe3OOx0X42HLDzT2',
    configOptions: [
        {
            id: 'model', name: 'Model', category: 'model', type: 'select',
            currentValue: 'opencode/big-pickle',
            options: [
                { value: 'opencode/big-pickle', name: 'OpenCode Zen/Big Pickle' },
                { value: 'opencode/deepseek-v4-flash-free', name: 'OpenCode Zen/DeepSeek V4 Flash Free' },
                { value: 'opencode/nemotron-3.5-lightning-free', name: 'OpenCode Zen/Nemotron 3.5 Lightning Free' }
            ]
        },
        {
            id: 'mode', name: 'Session Mode', category: 'mode', type: 'select',
            currentValue: 'build',
            options: [
                { value: 'build', name: 'build', description: 'The default agent. Executes tools based on configured permissions.' },
                { value: 'plan', name: 'plan', description: 'Plan mode. Disallows all edit tools.' }
            ]
        }
    ]
};

ok('the real conversation id has the measured shape',
    O.OPENCODE_SESSION_ID.test(NEW_SESSION.sessionId));

const opts = O.opencodeConfigOptions(NEW_SESSION);
ok('both config options read', opts.length === 2 && opts[0].id === 'model' && opts[1].id === 'mode');
ok('current model is the engine\'s own default', opts[0].currentValue === 'opencode/big-pickle');
ok('mode descriptions survive', /Disallows all edit tools/.test(opts[1].options[1].description));

const models = O.opencodeModelsFrom(opts);
ok('the catalogue comes off the handshake, free',
    models.length === 3 && models[0].id === 'opencode/big-pickle'
    && models[0].label === 'OpenCode Zen/Big Pickle');
ok('config options fail soft', O.opencodeConfigOptions({}).length === 0
    && O.opencodeConfigOptions(null).length === 0);

// ‼️ THE ONE WORD. `id` was refused with -32602; `configId` works.
const cfg = O.opencodeSetConfigParams('ses_x', 'model', 'opencode/hy3-free');
ok('set_config_option says configId, not id',
    cfg.configId === 'model' && cfg.id === undefined && cfg.value === 'opencode/hy3-free');

// --- K-28: the bare model id an export leaves behind ----------------------
// Measured on this machine's own exports: `info.model` is
// `{ id: "big-pickle", providerID: "opencode", variant: "default" }`, so an
// indexed OpenCode transcript carries `big-pickle` while the live connection is
// on `opencode/big-pickle`. Comparing the two raw made every RESUME look like a
// model change, and the bare id came back as *Invalid params: model not found*.
{
    ok('‼️ K-28 — a bare model id is completed to the engine\'s own spelling',
        O.opencodeResolveOption(opts, 'model', 'big-pickle') === 'opencode/big-pickle');
    ok('…a value the engine already published is itself',
        O.opencodeResolveOption(opts, 'model', 'opencode/big-pickle') === 'opencode/big-pickle');
    ok('…a model nobody offers resolves to nothing, rather than to a refusal',
        O.opencodeResolveOption(opts, 'model', 'gpt-9-turbo') === undefined);
    ok('…a mode is resolved by the same rule', O.opencodeResolveOption(opts, 'mode', 'plan') === 'plan');
    // ‼️ Two providers offering the same model is a real shape; guessing one
    // would silently answer with a different engine's model.
    const twoProviders = [{
        id: 'model', name: 'Model', category: 'c', currentValue: 'a/shared',
        options: [{ value: 'a/shared', name: 'A' }, { value: 'b/shared', name: 'B' }]
    }];
    ok('‼️ …and an ambiguous tail is refused, never guessed at',
        O.opencodeResolveOption(twoProviders, 'model', 'shared') === undefined);
    ok('…while a config key this session never declared is left exactly as asked',
        O.opencodeResolveOption(opts, 'reasoning', 'high') === 'high');
    ok('…and nothing asked for is nothing to send',
        O.opencodeResolveOption(opts, 'model', '  ') === undefined);
}

// --- K-28: and the Console compares AFTER resolving, so a resume is quiet ---
{
    const fs = require('fs');
    const host = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'consolehost.ts'), 'utf8');
    ok('‼️ K-28 — the wanted value is resolved before it is compared or sent',
        /const v = opencodeResolveOption\(h\.opencode\.options, configId, asked\)/.test(host));
    ok('…and a same-model resume takes the engine\'s spelling instead of calling it',
        /if \(current === v\) \{[\s\S]{0,220}model: v, pendingModel: undefined/.test(host));
}

ok('initialize params declare the fs capability',
    O.opencodeInitializeParams().protocolVersion === 1
    && O.opencodeInitializeParams().clientCapabilities.fs.readTextFile === true);

// --- captured: three real turns' usage ------------------------------------
// turn 1 and turn 2 of ONE conversation, then a tool-using turn.
const TURN1 = { inputTokens: 6196, outputTokens: 13, totalTokens: 8192, thoughtTokens: 63, cachedReadTokens: 1920 };
const TURN2 = { inputTokens: 36, outputTokens: 13, totalTokens: 8241, cachedReadTokens: 8192 };
const TOOLTURN = { inputTokens: 29341, outputTokens: 14, totalTokens: 29381, thoughtTokens: 26 };

const s1 = O.opencodeSpendFromAcp(TURN1);
const s2 = O.opencodeSpendFromAcp(TURN2);
const s3 = O.opencodeSpendFromAcp(TOOLTURN);
ok('turn 1 read whole', s1.input === 6196 && s1.reasoning === 63 && s1.cacheRead === 1920 && s1.total === 8192);
ok('the engine\'s total IS input+output+reasoning+cache, on all three',
    O.opencodeTotal(s1) === s1.total && O.opencodeTotal(s2) === s2.total && O.opencodeTotal(s3) === s3.total);
// ‼️ A running total cannot go down. This is the proof no delta may be taken.
ok('turn usage is per-turn, not cumulative', s2.input < s1.input && s2.cacheRead > s1.cacheRead);
ok('a missing thought/cache field is 0, not NaN', s2.reasoning === 0 && s2.cacheWrite === 0);

// --- captured: the same numbers under the JSONL names ---------------------
const JSONL_TOKENS = { total: 8440, input: 1839, output: 4, reasoning: 69, cache: { write: 0, read: 6528 } };
const j = O.opencodeSpendFromJsonl(JSONL_TOKENS, 0);
ok('the JSONL shape lands on the same five numbers',
    j.input === 1839 && j.output === 4 && j.reasoning === 69 && j.cacheRead === 6528 && j.total === 8440);
ok('JSONL total also checks out', O.opencodeTotal(j) === j.total);
// ‼️ A free model's 0 is a REAL price, not a missing one.
ok('a stated zero cost is kept as a number', j.cost === 0);
ok('an unstated cost is absent, not zero', O.opencodeSpendFromJsonl(JSONL_TOKENS).cost === undefined);
ok('a total the engine did not state is derived',
    O.opencodeSpendFromJsonl({ input: 10, output: 5, cache: { read: 5 } }).total === 20);

// --- captured: usage_update, the CONTEXT event ----------------------------
const CTX = { sessionUpdate: 'usage_update', used: 29341, size: 262144, cost: { amount: 0, currency: 'USD' } };
const ctx = O.opencodeContextFrom(CTX);
ok('context and window both read', ctx.tokens === 29341 && ctx.window === 262144);
ok('the engine\'s own price rides along', ctx.cost === 0);
// ‼️ The window is per MODEL and runtime-reported: 200000 on one, 262144 on another.
ok('a second model reports a different window',
    O.opencodeContextFrom({ sessionUpdate: 'usage_update', used: 8116, size: 200000 }).window === 200000);
// ‼️ Spend is not context. 29381 and 29341 are one turn's two different numbers.
ok('a spend block is not accepted as context',
    O.opencodeContextFrom({ sessionUpdate: 'usage_update', totalTokens: 29381 }) === undefined);
ok('another update kind is not context',
    O.opencodeContextFrom({ sessionUpdate: 'agent_message_chunk', used: 5 }) === undefined);

// --- permission: two knobs, and neither is a sandbox ----------------------
ok('default is build and asks', JSON.stringify(O.opencodePermissionFor('default')) === '{"mode":"build","auto":false}');
ok('plan is the plan agent', O.opencodePermissionFor('plan').mode === 'plan');
ok('acceptEdits and bypass reach the same two flags',
    O.opencodePermissionFor('acceptEdits').auto === true && O.opencodePermissionFor('bypassPermissions').auto === true);
ok('an unknown mode is the safe one', O.opencodePermissionFor('nonsense').auto === false);
ok('the note says --auto is not workspace-scoped', /no workspace-only middle setting/.test(O.opencodeModeNote('acceptEdits')));
ok('the note says the Console really can ask', /really can ask/.test(O.opencodeModeNote('default')));
ok('…and that an unattended run cannot', /unattended run has nobody/.test(O.opencodeModeNote('default')));
ok('the setting is named as the engine names it',
    O.opencodePermissionSetting('plan').label === 'Session mode'
    && O.opencodePermissionSetting('bypassPermissions').value === 'build + --auto');

// --- command lines --------------------------------------------------------
const run = O.opencodeRunArgs({ model: 'opencode/hy3-free', cwd: 'D:\\a b', permissionMode: 'default' });
ok('a run is JSON or it is nothing', run[0] === 'run' && run.includes('--format') && run.includes('json'));
ok('the model rides on -m', run[run.indexOf('-m') + 1] === 'opencode/hy3-free');
ok('the folder is --dir on the run shape', run[run.indexOf('--dir') + 1] === '"D:\\a b"');
// ‼️ The prompt is piped. A positional would put the user's text on a command
// line that a Windows shim hands to cmd.exe — so `run [message..]` must stay
// empty: every argument after the subcommand is either a flag or the value of
// the flag before it, and nothing is left over for the message to occupy.
const dangling = run.slice(1).filter((a, i, list) => !a.startsWith('-') && !(list[i - 1] ?? '-').startsWith('-'));
ok('nothing positional carries the prompt', dangling.length === 0);
ok('default mode adds no --auto', !run.includes('--auto'));

const runPlan = O.opencodeRunArgs({ permissionMode: 'plan' });
ok('plan becomes --agent plan', runPlan[runPlan.indexOf('--agent') + 1] === 'plan');
const runAuto = O.opencodeRunArgs({ permissionMode: 'bypassPermissions', variant: 'high' });
ok('bypass adds --auto', runAuto.includes('--auto'));
ok('the effort is called --variant here', runAuto[runAuto.indexOf('--variant') + 1] === 'high');
const runResume = O.opencodeRunArgs({ resume: 'ses_ffae7344fffeoXeFqarl3jq8eB' });
ok('resume is -s, measured to carry the context',
    runResume[runResume.indexOf('-s') + 1] === 'ses_ffae7344fffeoXeFqarl3jq8eB');
ok('an explicit agent beats the mode',
    O.opencodeRunArgs({ agent: 'reviewer', permissionMode: 'plan' })
        .filter(a => a === '--agent').length === 1);
ok('attachments ride on -f', O.opencodeRunArgs({ files: ['C:\\x.png'] }).includes('-f'));

const tui = O.opencodeTuiArgs({ cwd: 'D:\\a b', resume: 'ses_z' });
ok('the TUI takes the folder POSITIONALLY, not as --dir',
    tui.includes('"D:\\a b"') && !tui.includes('--dir'));
ok('the TUI resumes with the same -s flag', tui[tui.indexOf('-s') + 1] === 'ses_z');
ok('continue-last is -c', O.opencodeTuiArgs({ continueLast: true }).includes('-c'));
ok('the ACP server is one subcommand', JSON.stringify(O.opencodeAcpArgs()) === '["acp"]');
ok('the readable surface has its two commands',
    O.opencodeSessionListArgs().join(' ') === 'session list'
    && O.opencodeExportArgs(' ses_q ').join(' ') === 'export ses_q');

// --- fail-soft readers ----------------------------------------------------
const STEP_FINISH = '{"type":"step_finish","timestamp":1786791912244,"sessionID":"ses_ffae7344fffeoXeFqarl3jq8eB",'
    + '"part":{"type":"step-finish","reason":"stop","tokens":{"total":8440,"input":1839,"output":4,'
    + '"reasoning":69,"cache":{"write":0,"read":6528}},"cost":0}}';
const ev = O.opencodeRunEvent(STEP_FINISH);
ok('a run event carries its type and conversation',
    ev.type === 'step_finish' && ev.sessionID === 'ses_ffae7344fffeoXeFqarl3jq8eB');
ok('…and its usage survives the trip', O.opencodeSpendFromJsonl(ev.part.tokens, ev.part.cost).total === 8440);
ok('a banner line is not an event', O.opencodeRunEvent('   ▀▀▀▀ █▀▀▀ ▀▀▀▀') === undefined);
ok('a half-written line is not an event', O.opencodeRunEvent('{"type":"text","par') === undefined);
ok('an object with no type is not an event', O.opencodeRunEvent('{"hello":1}') === undefined);
ok('nothing at all is not an event', O.opencodeRunEvent('') === undefined && O.opencodeRunEvent(undefined) === undefined);

// ‼️ A TURKISH LINE SPLIT AT EVERY BYTE BOUNDARY. The SOP names `String(chunk)`
// as a proven failure; this proves the stateful-decoder + line-buffer pattern
// the runtime must use recovers the same event from every possible split.
const TR_LINE = '{"type":"text","sessionID":"ses_a","part":{"type":"text","text":"NONCE değeri — çğışöü"}}\n';
const trBytes = Buffer.from(TR_LINE, 'utf8');
let splitsOk = 0;
for (let cut = 1; cut < trBytes.length; cut++) {
    const dec = new StringDecoder('utf8');
    let buf = dec.write(trBytes.subarray(0, cut)) + dec.write(trBytes.subarray(cut));
    const line = buf.slice(0, buf.indexOf('\n'));
    const e = O.opencodeRunEvent(line);
    if (e && e.part.text === 'NONCE değeri — çğışöü') { splitsOk++; }
}
ok('every byte split of a Turkish line decodes to the same event', splitsOk === trBytes.length - 1);

// ‼️ `export` prints a sentence ABOVE its JSON.
const EXPORT = 'Exporting session: ses_ffae7344fffeoXeFqarl3jq8eB\n'
    + JSON.stringify({
        info: {
            id: 'ses_ffae7344fffeoXeFqarl3jq8eB', slug: 'sunny-wizard',
            directory: 'D:\\zone\\dev\\git\\miropharm\\vsc_AgentFarm',
            title: 'New session - 2026-08-15T11:05:06.224Z', agent: 'build',
            model: { id: 'nemotron-3.5-lightning-free', providerID: 'opencode', variant: 'default' },
            version: '1.18.18', cost: 0,
            tokens: { input: 6232, output: 26, reasoning: 63, cache: { read: 10112, write: 0 } },
            time: { created: 1786791906224, updated: 1786791912625 }
        },
        messages: [{ info: { role: 'user' }, parts: [] }, { info: { role: 'assistant' }, parts: [] }]
    });
const exported = O.opencodeExportJson(EXPORT);
ok('the preamble does not defeat the reader', !!exported && exported.info.id === 'ses_ffae7344fffeoXeFqarl3jq8eB');
ok('the session-level tokens are the CUMULATIVE sum (6196+36=6232)',
    exported.info.tokens.input === 6232 && exported.info.tokens.cache.read === 10112);
ok('an export that is not one reads as nothing',
    O.opencodeExportJson('Exporting session: ses_x\n') === undefined
    && O.opencodeExportJson('{"unrelated":1}') === undefined
    && O.opencodeExportJson('') === undefined);

// `session list` — a drawn table, and titles have spaces in them.
const LIST = [
    'Session ID                      Title                                   Updated',
    '───────────────────────────────────────────────────────────────────────────────',
    'ses_ffae7344fffeoXeFqarl3jq8eB  New session - 2026-08-15T11:05:06.224Z  6:05 PM',
    'ses_ffae93e06ffe3OOx0X42HLDzT2  NONCE değeri yazma                      6:03 PM'
].join('\n');
const rows = O.opencodeSessionList(LIST);
ok('the header and its rule are not sessions', rows.length === 2);
ok('a title with spaces stays whole', rows[0].title === 'New session - 2026-08-15T11:05:06.224Z');
ok('a Turkish title survives', rows[1].title === 'NONCE değeri yazma' && rows[1].id === 'ses_ffae93e06ffe3OOx0X42HLDzT2');
ok('the clock is kept as text, never parsed into a date', rows[0].updated === '6:05 PM');
ok('an empty listing is empty, not an error', O.opencodeSessionList('') .length === 0);

// --- the honest sentences -------------------------------------------------
ok('readiness does not hang on a credential', O.OPENCODE_READY_WITHOUT_CREDENTIAL === true);
ok('there is no system-prompt channel', O.OPENCODE_HAS_NO_SYSTEM_PROMPT_FLAG === true);
ok('the no-transcript note names the CLI route rather than saying "yet"',
    /session list/.test(O.OPENCODE_NO_TRANSCRIPT_NOTE) && !/yet/.test(O.OPENCODE_NO_TRANSCRIPT_NOTE));

// ---------------------------------------------------------------------------
// M-14 — ONE BUILDER, AND THE GATE THAT KEEPS IT THAT WAY
// ---------------------------------------------------------------------------
//
// The item's first line asks that every production surface run OpenCode through
// "aynı opencode-specific builder/parser" — the same builder everywhere. Today
// they do: `runArgs`/`tuiArgs` are the only doors, and the four call sites
// outside the Console (tasks.ts twice, `scheduleExportFor`, launch.ts) all go
// through them. Nothing stops the fifth from being typed inline, and an inline
// `--auto` is exactly the kind of thing that works on the day it is written and
// then never learns anything the real builder learns afterwards.
//
// So it is DERIVED rather than trusted: an OpenCode flag written as an argv
// token anywhere but the module that owns them fails this test. Prose is not
// caught and must not be — half this repo's comments quote `--auto` to explain
// it — and the discriminator is the QUOTE: an argv element is written '--auto'
// or "--auto", prose writes it in backticks. That distinction is the whole gate,
// and it was found by writing the gate wrong first: with backticks in the class
// it reported nine "strays", every one of them a comment explaining the flag.
{
    const fsx = require('fs');
    const pathx = require('path');
    const SRC = pathx.resolve(__dirname, '..', 'src');
    // The two modules allowed to name this vocabulary: the launch lines, and the
    // read-only harvest path (`session list --format json`).
    const OWNERS = ['core/opencode.ts', 'core/opencodeharvest.ts'];
    // Flags that mean OpenCode and nothing else. `-s` is deliberately NOT here:
    // it is Codex's sandbox flag too, so it would report the wrong file.
    const FLAGS = ['--auto', '--variant', '--agent'];

    const walk = (dir) => fsx.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
        const p = pathx.join(dir, e.name);
        return e.isDirectory() ? walk(p) : (p.endsWith('.ts') ? [p] : []);
    });

    const strays = [];
    for (const file of walk(SRC)) {
        const rel = pathx.relative(SRC, file).replace(/\\/g, '/');
        if (OWNERS.includes(rel)) { continue; }
        const text = fsx.readFileSync(file, 'utf8');
        for (const f of FLAGS) {
            // A whole quoted token — how an argv element is written, and how
            // prose never is.
            const re = new RegExp(`(['"])${f.replace(/-/g, '\\-')}\\1`);
            if (re.test(text)) { strays.push(`${rel} names ${f} as an argument`); }
        }
    }
    ok('‼️ no surface builds an OpenCode command line of its own', strays.length === 0,
        strays.join(' · '));

    // …and the owner really does hold them, so the gate cannot pass by the
    // vocabulary having quietly moved somewhere it does not check.
    const owner = fsx.readFileSync(pathx.join(SRC, 'core', 'opencode.ts'), 'utf8');
    ok('…and the builder that owns them still does',
        FLAGS.every(f => new RegExp(`(['"\`])${f.replace(/-/g, '\\-')}\\1`).test(owner)));
}

// ---------- X-52: the same catalogue, read without a session ----------
{
    // Real `opencode models` stdout: one `provider/model` per line and nothing
    // else — no display names, which is why the handshake's list still wins
    // when there is one. The banner goes to stderr, but a line of prose that
    // leaked into stdout must not become a model.
    const OUT = [
        'opencode/big-pickle',
        'opencode/nemotron-3-ultra-free',
        'opencode/deepseek-v4-flash-free',
        'opencode/big-pickle',
        '',
        'Fetching available models…'
    ].join('\n');
    const rows = O.readOpencodeModelList(OUT);
    ok('a model line and nothing else survives the read',
        rows.length === 3 && !rows.some(r => /\s/.test(r.id)));
    ok('‼️ the same id twice is one row — a picker that lists it twice is not trusted',
        rows.filter(r => r.id === 'opencode/big-pickle').length === 1);
    ok('sorted, so two reads of one catalogue offer the same order',
        rows.map(r => r.id).join(',') === rows.map(r => r.id).slice().sort().join(','));
    ok('‼️ the provider stays on the id — that whole string is what goes on the wire',
        rows.every(r => r.id.startsWith('opencode/')));
    ok('the CLI prints no display name, so the id is the label',
        rows.every(r => r.label === r.id));
    ok('nothing at all is an empty list, not a throw',
        O.readOpencodeModelList('').length === 0 && O.readOpencodeModelList(undefined).length === 0);
    ok('…and the free-model pick reads the same list',
        O.opencodeFreeModel(OUT) === 'opencode/deepseek-v4-flash-free');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
