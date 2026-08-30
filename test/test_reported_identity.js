// X-102 — WHAT THE ENGINE ACTUALLY SAID, AND THE THINGS IT IS NEVER ALLOWED TO
// BE READ AS HAVING SAID.
//
// ‼️ WHAT THIS SUITE IS ACTUALLY WATCHING. The launch manifest is the DECLARED
// half of a run. This is the reported half — and the whole value of holding two
// halves is lost the moment the second one is allowed to be inferred from the
// first. So most of what follows is refusals: a slash that is not cut, a
// provider that is not derived from a model name, an option list that is not
// mistaken for what ran, and Claude's route staying unknown no matter how much
// of its transcript is fed in.
//
// ‼️ AND THE TWO ENGINES ARE DELIBERATELY ASYMMETRIC. OpenCode names its
// provider in a field of its own; Claude's transcript demonstrably cannot
// (measured 23 Aug 2026 — two processes, two routes, one model name, and the
// transcript preserved neither). A suite that expected them to behave alike
// would be asking one of them to make something up.
'use strict';
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`,
    JSON.stringify(got) === JSON.stringify(want));

const R = require(path.join(ROOT, 'out', 'core', 'reportedIdentity.js'));
const G = require(path.join(ROOT, 'out', 'core', 'providerRegistry.js'));

// The engine's published list, as the catalog would answer it. Everything that
// is allowed to cut a qualified ref in half is checked against this and nothing
// else.
const KNOWN = ['opencode', 'anthropic'];

/* =========================================================================
 * 1 — THE EXPORT: THE FIELD, TAKEN LITERALLY
 * ========================================================================= */
{
    // Measured shape (`opencodehistory.ts`): the session carries
    // `info.model = { id, providerID }`, the user message repeats it as an
    // object and the assistant row writes the two flat.
    const doc = {
        info: {
            id: 'ses_7f3a91', title: 'a run', model: { id: 'big-pickle', providerID: 'opencode' }
        },
        messages: [
            { info: { id: 'msg_1', role: 'user', model: { providerID: 'opencode', modelID: 'big-pickle' } }, parts: [] },
            { info: { id: 'msg_2', role: 'assistant', providerID: 'opencode', modelID: 'big-pickle' }, parts: [] }
        ]
    };
    const r = R.openCodeReported(doc, KNOWN);
    eq('the export names its provider and it is read from the field', r.providerIds, ['opencode']);
    eq('…and the model, in first-seen order and deduped', r.models, ['big-pickle']);
    // ‼️ `ses_…` IS THE MARKER, so a scan for ids does not also collect the
    // message ids sitting one key away from it.
    eq('…and only the engine\'s own session id', r.sessionIds, ['ses_7f3a91']);
}

/* =========================================================================
 * 2 — ‼️ THE ORDER IS THE ORDER IT HAPPENED IN
 * ========================================================================= */
{
    // A session that changed model at a turn boundary — which this engine
    // documents as a real feature. Reported as two, in the order they ran,
    // because that is the order somebody debugging it is thinking in.
    const doc = {
        info: { id: 'ses_aa', model: { id: 'big-pickle', providerID: 'opencode' } },
        messages: [
            { info: { id: 'msg_1', role: 'assistant', providerID: 'opencode', modelID: 'big-pickle' } },
            { info: { id: 'msg_2', role: 'assistant', providerID: 'anthropic', modelID: 'claude-opus-5' } },
            { info: { id: 'msg_3', role: 'assistant', providerID: 'anthropic', modelID: 'claude-opus-5' } }
        ]
    };
    const r = R.openCodeReported(doc, KNOWN);
    eq('two providers across a session read as two', r.providerIds, ['opencode', 'anthropic']);
    eq('…and the repeat is not a third', r.models, ['big-pickle', 'claude-opus-5']);
}

/* =========================================================================
 * 3 — THE RUN STREAM: MANY DOCUMENTS, ONE ANSWER
 * ========================================================================= */
{
    // `opencode run --format json` prints a JSONL stream, not an envelope — a
    // reader told to look for one object finds none and calls the run empty.
    const stream = [
        '{"type":"step_start","sessionID":"ses_bb","part":{}}',
        '{"type":"text","sessionID":"ses_bb","part":{"text":"hello"}}',
        '',
        'not json at all',
        '{"type":"step_finish","sessionID":"ses_bb","providerID":"opencode","modelID":"big-pickle","part":{}}'
    ].join('\n');
    const r = R.openCodeReported(stream, KNOWN);
    eq('a stream is read line by line', r.sessionIds, ['ses_bb']);
    eq('…and the named fields on it are still the named fields', r.providerIds, ['opencode']);
    eq('…', r.models, ['big-pickle']);
    // An unreadable line is not an error here: this reader answers what it can
    // see, and a truncated stream is a normal thing to be handed.
    ok('an unparsable line does not take the reading down', r.models.length === 1);
}

/* =========================================================================
 * 4 — ‼️ THE ACP CURRENT VALUE, AND THE OPTION LIST THAT IS NOT IT
 * ========================================================================= */
{
    // `session/new` answers with config options. The `model` one carries the
    // current value AND the whole list of models on offer.
    const acp = {
        configOptions: [
            {
                id: 'model', name: 'Model', category: 'session',
                currentValue: 'opencode/big-pickle',
                options: [
                    { value: 'opencode/big-pickle', name: 'Big Pickle' },
                    { value: 'anthropic/claude-opus-5', name: 'Opus 5' },
                    { value: 'anthropic/claude-haiku-4-5', name: 'Haiku' }
                ]
            },
            { id: 'agent', name: 'Agent', category: 'session', currentValue: 'build', options: [] }
        ]
    };
    const r = R.openCodeReported(acp, KNOWN);
    // ‼️ THE HEART OF IT: three models were OFFERED and one RAN.
    eq('only the current value is what ran', r.models, ['big-pickle']);
    eq('…and its head becomes a provider because the catalog published it',
        r.providerIds, ['opencode']);
}

/* =========================================================================
 * 5 — ‼️ THE REFUSALS. A SLASH IS NOT EVIDENCE.
 * ========================================================================= */
{
    // The head is not in the published list, so nothing is claimed and the
    // whole string stays the model — the honest reading of a name nobody has
    // vouched for. `opencode.ts` (K-28) carries the scar of the other habit.
    const r = R.openCodeReported(
        { configOptions: [{ id: 'model', currentValue: 'mystery-co/some-model', options: [] }] },
        KNOWN);
    eq('an unpublished head is not promoted to a provider', r.providerIds, []);
    eq('…and the whole ref stays the model', r.models, ['mystery-co/some-model']);

    // And with no catalog reached at all, there is nothing to check against, so
    // nothing is cut. "Nobody has asked the engine yet" and "the engine offers
    // nothing" lead to the same refusal here for the same reason.
    const blind = R.openCodeReported(
        { configOptions: [{ id: 'model', currentValue: 'opencode/big-pickle', options: [] }] },
        undefined);
    eq('with no published list nothing is cut', blind.providerIds, []);
    eq('…and the ref survives whole', blind.models, ['opencode/big-pickle']);
}

/* =========================================================================
 * 6 — ‼️ CLAUDE: THE ROUTE STAYS UNKNOWN, THE MODEL DOES NOT
 * ========================================================================= */
{
    // The measured shape of a Claude transcript: `model` on the assistant
    // message, `sessionId` on the record. No route, anywhere, ever.
    const jsonl = [
        '{"type":"assistant","sessionId":"9c1f","message":{"model":"claude-opus-5","role":"assistant"}}',
        '{"type":"assistant","sessionId":"9c1f","message":{"model":"claude-haiku-4-5-20251001"}}',
        '{"type":"user","sessionId":"9c1f","message":{"role":"user"}}'
    ].join('\n');
    const r = R.claudeReported(jsonl);
    // ‼️ THE ONE THAT MUST NEVER CHANGE. `claude-opus-5` does not prove Anthropic
    // served it — measured against a fake endpoint under the same model name.
    eq('a Claude transcript names no route, and none is invented', r.providerIds, []);
    eq('…while the models it really does name are read', r.models,
        ['claude-opus-5', 'claude-haiku-4-5-20251001']);
    eq('…and its session id', r.sessionIds, ['9c1f']);
}

/* =========================================================================
 * 7 — NOTHING IN, NOTHING OUT
 * ========================================================================= */
{
    for (const empty of [undefined, null, '', '   ', {}, [], 42]) {
        const r = R.openCodeReported(empty, KNOWN);
        ok('nothing to read reports nothing: ' + JSON.stringify(empty),
            r.providerIds.length === 0 && r.models.length === 0 && r.sessionIds.length === 0);
    }
    // ‼️ A CYCLE DOES NOT HANG THE READER. These documents arrive from a process
    // and a truncated or hand-edited one can be anything; a reader that spun
    // would take the surface asking it down with it.
    const cyclic = { info: { id: 'ses_cc', providerID: 'opencode' } };
    cyclic.self = cyclic;
    const r = R.openCodeReported(cyclic, KNOWN);
    eq('a cyclic document is read to a bounded depth and answered', r.providerIds, ['opencode']);
}

/* =========================================================================
 * 8 — ‼️ THE MERGE SHAPE: AN EMPTY LIST IS OMITTED, NOT WRITTEN
 * ========================================================================= */
{
    // `Partial<ProviderIdentity>` is spread over a DECLARED identity. A written
    // `reportedProviderIds: []` would erase one that was already there; an
    // absent key merges as "I have nothing to say", which is what an engine
    // with no provider axis actually means.
    const p = R.reportedPartial('claude', { providerIds: [], models: ['claude-opus-5'], sessionIds: [] });
    eq('an empty provider list is left out of the merge', Object.keys(p).sort(),
        ['engine', 'reportedModels']);
    const q = R.reportedPartial('opencode', R.NOTHING_REPORTED);
    eq('and an engine that said nothing contributes only its name',
        Object.keys(q).sort(), ['engine']);
}

/* =========================================================================
 * 9 — THE ADAPTERS ANSWER WITH IT (the contract, actually wired)
 * ========================================================================= */
{
    // X-98 declared `identityFromEvents` and nothing implemented it — measured
    // with grep at the start of this item. The point of the suite above is only
    // realised if the registry actually calls it.
    const deps = {
        profiles: [{ id: 'anthropic', label: 'Anthropic', engine: 'claude', providerId: 'anthropic', tiers: {}, revision: 1 }],
        secretFor: () => undefined,
        inheritedEnv: {},
        // The engine's own catalog, in the shape `readOpenCodeCatalog` parses.
        openCodeCatalogText: JSON.stringify({ id: 'big-pickle', providerID: 'opencode', name: 'Big Pickle' }, null, 1)
    };
    const oc = G.adapterFor('opencode', deps);
    const got = oc.identityFromEvents({
        info: { id: 'ses_dd', model: { id: 'big-pickle', providerID: 'opencode' } }
    });
    eq('the OpenCode adapter reports what the engine named', got.reportedProviderIds, ['opencode']);
    eq('…and names itself', got.engine, 'opencode');

    const cl = G.adapterFor('claude', deps);
    const clGot = cl.identityFromEvents(
        '{"type":"assistant","message":{"model":"claude-opus-5"}}');
    ok('the Claude adapter reports no route, ever',
        clGot.reportedProviderIds === undefined);
    eq('…and the model it did name', clGot.reportedModels, ['claude-opus-5']);

    // An engine with no provider axis is still asked and still answers.
    const na = G.adapterFor('gemini', deps);
    eq('an engine with no provider axis contributes nothing to report',
        na.identityFromEvents({ model: 'gemini-3-pro' }), {});
}

console.log(`test_reported_identity: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
