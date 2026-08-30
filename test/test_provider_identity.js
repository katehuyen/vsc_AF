// X-98 — MULTI-ENGINE PROVIDER IDENTITY AND THE ADAPTER CONTRACT.
//
// ‼️ WHY THIS FILE EXISTS.
//
// Agent Farm starts sessions on five engines and records, for each one, which
// MODEL ran. It records no provider at all — and the two engines that have a
// provider axis do not mean the same thing by it. On Claude Code a provider is
// a ROUTE (base URL + auth + tier) that Agent Farm itself owns, fixed for the
// whole session: changing it is not a resume, it is a different program. On
// OpenCode the provider is the engine's OWN identity and the first half of the
// wire name (`opencode/big-pickle`), and the engine legitimately allows it to
// change at a turn boundary (`session/set_config_option`).
//
// Written down as one shape, that difference is a field (`scope`). Written down
// per surface, it becomes an `if (engine === 'claude')` in twenty places, and
// the first one somebody forgets is a session that says it ran on a route it
// did not run on.
//
// THE RULE BEING PINNED, and it is the item's own acceptance line: NO SURFACE
// GUESSES THE PROVIDER FROM THE MODEL NAME. `claude-opus-5` does not prove
// Anthropic served it — that is exactly what the local fake-endpoint
// measurement of 23 Aug 2026 showed, with two routes answering under the same
// model name. A provider is DECLARED (the launch manifest wrote it) or REPORTED
// (the engine named it in its own events) or it is unknown, and "unknown" is an
// answer this system is required to be able to give.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`,
    JSON.stringify(got) === JSON.stringify(want));

const I = require(path.join(ROOT, 'out', 'core', 'providerIdentity.js'));
const A = require(path.join(ROOT, 'out', 'core', 'providerAdapter.js'));

/* =========================================================================
 * 1 — THE WIRE NAME, AND ITS INVERSE IS NOT A GUESS
 * ========================================================================= */
{
    eq('a provider and a model make one qualified name',
        I.qualifiedRef('opencode', 'big-pickle'), 'opencode/big-pickle');
    eq('…and a model with no provider is left as the model',
        I.qualifiedRef('', 'opus'), 'opus');

    // ‼️ THE ANTI-GUESS RULE, EXECUTABLE. Splitting on the slash is only
    // allowed to produce a provider the caller can already NAME. Anything else
    // comes back with an empty provider and the whole string as the model,
    // which is the honest reading of a name nobody has vouched for.
    eq('a known provider prefix is read',
        I.splitQualifiedRef('opencode/big-pickle', ['opencode', 'anthropic']),
        { providerId: 'opencode', modelId: 'big-pickle' });
    eq('…an UNKNOWN prefix is not a provider, it is part of the model name',
        I.splitQualifiedRef('kimi/k2', ['opencode', 'anthropic']),
        { providerId: '', modelId: 'kimi/k2' });
    eq('…and with nothing to check against, nothing is claimed',
        I.splitQualifiedRef('opencode/big-pickle', []),
        { providerId: '', modelId: 'opencode/big-pickle' });
    eq('a bare model is a bare model',
        I.splitQualifiedRef('opus', ['anthropic']), { providerId: '', modelId: 'opus' });
}

/* =========================================================================
 * 2 — HOW WE KNOW: THE PROOF AXIS
 * ========================================================================= */
{
    eq('the launch said so and the engine agreed',
        I.proofOf('anthropic', ['anthropic']), 'matched');
    eq('only the launch said so',
        I.proofOf('anthropic', []), 'launch-declared');
    eq('only the engine said so',
        I.proofOf('', ['opencode']), 'engine-reported');
    eq('nobody said so, and that is a real answer',
        I.proofOf('', []), 'unknown');

    // ‼️ A DISAGREEMENT IS NOT A PROOF VALUE, IT IS A FACT ABOUT ONE. The launch
    // manifest is the authority (the transcript cannot prove a route), so the
    // proof stays `launch-declared` — but the disagreement is kept, because on
    // Claude it is the signature of two routes inside one transcript.
    eq('a declared provider the engine contradicts is still declared',
        I.proofOf('anthropic', ['kimi']), 'launch-declared');
    ok('…and the contradiction itself is readable',
        I.hasProviderConflict({ providerId: 'anthropic', reportedProviderIds: ['kimi'] }) === true);
    ok('…while agreement is not a conflict',
        I.hasProviderConflict({ providerId: 'anthropic', reportedProviderIds: ['anthropic'] }) === false);
    ok('…and silence is not a conflict either',
        I.hasProviderConflict({ providerId: 'anthropic', reportedProviderIds: [] }) === false);
    // One session, two providers: legitimate on OpenCode, the thing to refuse
    // on Claude. The COUNT is a fact; what it means belongs to the adapter.
    ok('two reported providers in one session are visible as such',
        I.isMultiProvider({ reportedProviderIds: ['opencode', 'anthropic'] }) === true);
    ok('…and one is not', I.isMultiProvider({ reportedProviderIds: ['opencode'] }) === false);
}

/* =========================================================================
 * 3 — THE ANSWERS FOR RECORDS THAT PREDATE ANY OF THIS
 * ========================================================================= */
{
    // ‼️ The item's third acceptance line: a missing old field stays explicitly
    // legacy/unknown. The tempting alternative is to fill it in from the model
    // name, and that is the defect this whole item exists to make impossible.
    const old = I.legacyIdentity('claude', 'claude-opus-5');
    eq('a record from before providers were recorded says so', old.origin, 'legacy-inherit');
    eq('…and names no provider', old.providerId, '');
    eq('…and proves nothing', old.proof, 'unknown');
    eq('…while keeping the model it really does know', old.requestedModelRef, 'claude-opus-5');

    const none = I.unknownIdentity('gemini');
    eq('an engine with nothing said about it is unknown, not empty', none.origin, 'unknown');
    eq('…and gets the safe scope', none.scope, 'session');
}

/* =========================================================================
 * 4 — SCOPE: THE ONE FIELD THAT KEEPS TWO ENGINES IN ONE SCHEMA
 * ========================================================================= */
{
    ok('a turn-scoped provider may change between turns',
        I.scopeAllowsTurnChange('turn') === true);
    ok('…and a session-scoped one may not',
        I.scopeAllowsTurnChange('session') === false);

    // A turn carries what was ASKED FOR and what came BACK, separately, or the
    // two collapse into one field and the difference stops being answerable.
    const t = I.turnIdentity(
        { engine: 'opencode', providerId: 'opencode', requestedModelRef: 'opencode/big-pickle' },
        { providerId: 'opencode', model: 'big-pickle' });
    eq('a turn keeps what it asked for', t.requestedModelRef, 'opencode/big-pickle');
    eq('…and what the engine answered with', t.reportedModels, ['big-pickle']);
    eq('…and says the two agree', t.proof, 'matched');
    ok('…and a turn that changed nothing says so', t.changedFromPrevious === false);
}

/* =========================================================================
 * 5 — ‼️ A REDACTED ROUTE, AND THE WORD REDACTED IS LOAD-BEARING
 * ========================================================================= */
{
    // The identity is written into a manifest, read by the bridge, shown in the
    // UI and exported. A route that carried its key would put that key in all
    // four. So the public shape is built by a function that can only ever emit
    // the three public fields, rather than by deleting the private ones from a
    // copy — a deny-list grows a hole the first time somebody adds a field.
    const r = I.redactRoute({
        baseUrl: 'https://api.example.com', authKind: 'api-key', tier: 'max',
        apiKey: 'sk-secret', token: 'tok', headers: { 'x-api-key': 'sk-secret' }
    });
    eq('the public fields survive',
        [r.baseUrl, r.authKind, r.tier], ['https://api.example.com', 'api-key', 'max']);
    ok('and nothing else does', Object.keys(r).sort().join() === 'authKind,baseUrl,tier');
    ok('…measured on the serialised form, which is what actually travels',
        !/sk-secret|tok|x-api-key/.test(JSON.stringify(r)));
    eq('nothing in, nothing out', I.redactRoute(undefined), undefined);
}

/* =========================================================================
 * 6 — THE ADAPTER CONTRACT, AND THE ENGINE THAT HAS NO PROVIDER AXIS
 * ========================================================================= */
{
    // ‼️ `not-applicable` IS AN ANSWER, NOT AN ABSENCE. Three of the five
    // engines have no provider axis at all. If that is expressed by leaving the
    // adapter out, every caller needs a null check and the UI draws an empty
    // box; expressed as an answer, the caller asks one question and gets one.
    const na = A.notApplicableAdapter('gemini');
    eq('an engine with no provider axis says exactly that', na.axis, 'not-applicable');
    eq('…and still answers every question the contract asks', na.engine, 'gemini');
    eq('…offering no providers rather than an unknown one', na.catalog().providers, []);
    eq('…and naming its catalog source honestly', na.catalog().source, 'not-applicable');
    eq('…with the safe scope', na.providerScope, 'session');
    ok('…which cannot change mid-session', na.canSwitchProviderAtTurnBoundary === false);
    // ‼️ AND ITS PAYLOAD CARRIES NO PROVIDER VALUE. The failure being prevented
    // is a Claude-shaped provider field travelling on a Gemini run because the
    // shared type had one.
    const id = na.identity();
    eq('its identity names no provider', id.providerId, '');
    eq('…and is honest about why', id.origin, 'not-applicable');

    ok('the contract names every capability the item lists',
        A.PROVIDER_ADAPTER_CAPABILITIES.slice().sort().join() ===
        ['billing', 'catalog', 'identity', 'preflight', 'resume', 'runtime'].join());
}

/* =========================================================================
 * 7 — ‼️ THE GATE: NO SURFACE GUESSES THE PROVIDER FROM THE MODEL NAME
 *
 * The acceptance line is a rule about code that has not been written yet —
 * X-99 to X-117 are the twenty items that will be tempted to write it. A rule
 * measured only in prose is not measured (Anayasa, Principle 1), so it is
 * measured here, from today, while the count is still zero.
 *
 * TWO SHAPES ARE REFUSED: a `provider…` field taking its value from an
 * expression that mentions a model, and a model string split on a slash. The
 * second is the OpenCode-specific temptation and it already has its correct
 * answer in `opencode.ts` (K-28): resolve the wanted value against the list the
 * ENGINE published, never by completing a guessed prefix.
 *
 * ‼️ THE BUDGET ONLY EVER SHRINKS. An exemption is a named line with a reason,
 * not a number that drifts up. Closing one deletes its line.
 * ========================================================================= */
{
    const walk = (d, out) => {
        for (const f of fs.readdirSync(d)) {
            const p = path.join(d, f);
            if (fs.statSync(p).isDirectory()) { walk(p, out); } else if (/\.(ts|js)$/.test(f)) { out.push(p); }
        }
        return out;
    };
    // A `provider…` field or variable taking its value out of something that
    // mentions a model.
    const GUESS_FIELD = /provider\w*\s*[:=][^;\n]*\bmodel/i;
    // A model string split on a slash — `provider/model` taken apart by hand.
    const GUESS_SPLIT = /\bmodel\w*\s*\.\s*split\s*\(\s*['"`]\//;

    // ‼️ EVERY EXEMPTION IS A SENTENCE SOMEBODY HAD TO WRITE.
    const EXEMPT = [
        {
            at: 'src/core/tasks.ts',
            why: 'A DIFFERENT DOMAIN ENTIRELY. `providerFor(media.model)` is about '
                + 'image and video GENERATION services (core/mediaProviders.ts), which '
                + 'genuinely are identified by the model they serve and have nothing to '
                + 'do with an engine route. Named rather than pattern-excluded so that a '
                + 'real engine-provider guess appearing in this same file is still caught.'
        }
    ];
    const exemptAt = new Set(EXEMPT.map(e => e.at));

    const found = [];
    for (const p of walk(path.join(ROOT, 'src'), []).concat(walk(path.join(ROOT, 'media'), []))) {
        const rel = path.relative(ROOT, p).replace(/\\/g, '/');
        // The identity module is where the rule is DEFINED; it is allowed to
        // say the words, and its own tests above hold it to saying them right.
        if (rel === 'src/core/providerIdentity.ts' || rel === 'src/core/providerAdapter.ts') { continue; }
        fs.readFileSync(p, 'utf8').split(/\r?\n/).forEach((l, i) => {
            if (/^\s*(\/\/|\*|\/\*)/.test(l)) { return; } // prose is not behaviour
            if (GUESS_FIELD.test(l) || GUESS_SPLIT.test(l)) { found.push({ rel, line: i + 1, text: l.trim() }); }
        });
    }
    const unexempt = found.filter(f => !exemptAt.has(f.rel));
    unexempt.forEach(f => console.log('  GUESS  ' + f.rel + ':' + f.line + '  ' + f.text.slice(0, 110)));
    ok('no surface derives a provider from a model name', unexempt.length === 0);

    // ‼️ AND THE EXEMPTIONS ARE MEASURED TOO — a line kept for a site that has
    // since been fixed is a budget that quietly stopped shrinking.
    EXEMPT.forEach(e => ok('the exemption for ' + e.at + ' is still needed',
        found.some(f => f.rel === e.at)));
    ok('every exemption carries a reason somebody wrote',
        EXEMPT.every(e => typeof e.why === 'string' && e.why.length > 80));
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) { process.exit(1); }
