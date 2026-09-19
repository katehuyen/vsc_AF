// X-115 — İKİ SAHİPLİK MODELİ İÇİN GÜVENLİK VE SIZINTI TESTLERİ.
//
// Two ownership models, and a canary through each:
//
//   · CLAUDE — Agent Farm OWNS the route. The key lives in the OS keychain and
//     is handed to exactly one place: the child's environment. A canary key is
//     pushed through the real adapter and looked for on every surface that is
//     derived from a launch — argv, identity, manifest, preflight, the public
//     profile list, the health report, a test record — and it must appear in
//     the private half and NOWHERE else.
//   · OPENCODE — the engine OWNS its credentials. Agent Farm may carry public
//     provider metadata and nothing more. MEASURED 2026-09-19: `opencode models
//     --verbose` prints a model's `options` and `headers` verbatim from the
//     user's config, and the raw listing was being persisted to globalState. A
//     canary in those fields must not survive into anything Agent Farm keeps.
//
// And the third clause: a cache about a profile or a provider EMPTIES when that
// profile goes — a verdict about a route nobody holds any more is a statement
// about nothing, and one about a deleted key is a record of where a key was.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`,
    JSON.stringify(got) === JSON.stringify(want));
const out = (m) => require(path.join(ROOT, 'out', 'core', m));

const CAT = out('providerCatalog.js');
const OC = out('opencode.js');
const REG = out('providerRegistry.js');
const RT = out('providerRuntime.js');
const MAN = out('launchManifest.js');
const HEALTH = out('providerHealth.js');
const OWN = out('providerOwnership.js');
const PROF = out('providerProfiles.js');
const SCRUB = out('secretScrub.js');

const CANARY = 'sk-ant-api03-CANARYx115CANARYx115CANARYx115';
const leaks = (v) => JSON.stringify(v ?? null).includes('CANARY');

/* =========================================================================
 * A — OPENCODE: the engine's listing, reduced to what Agent Farm may keep
 * ========================================================================= */
const VERBOSE = `opencode/big-pickle
{
  "id": "big-pickle",
  "providerID": "opencode",
  "name": "Big Pickle",
  "family": "big-pickle",
  "api": { "id": "big-pickle", "url": "https://opencode.ai/zen/v1?key=CANARY-API-URL", "npm": "@ai-sdk/openai-compatible" },
  "status": "active",
  "headers": { "Authorization": "Bearer CANARY-MODEL-HEADER" },
  "options": { "apiKey": "CANARY-MODEL-OPTION" },
  "cost": { "input": 0, "output": 0, "cache": { "read": 0, "write": 0 } },
  "limit": { "context": 200000, "input": 160000, "output": 32000 },
  "capabilities": {
    "temperature": true,
    "reasoning": true,
    "attachment": false,
    "toolcall": true,
    "input": { "text": true, "audio": false, "image": false, "video": false, "pdf": false },
    "interleaved": { "field": "CANARY-IN-A-CAPABILITY" }
  },
  "release_date": "2025-10-17",
  "futureField": { "token": "CANARY-UNKNOWN-FIELD" },
  "variants": {}
}
warning: config key provider.opencode.options.apiKey=CANARY-WARNING-LINE is deprecated
opencode/ling-3.0-flash-fin-free
{
  "id": "ling-3.0-flash-fin-free",
  "providerID": "opencode",
  "name": "Ling 3.0 Flash Fin Free",
  "status": "active",
  "headers": {},
  "options": {},
  "cost": { "input": 0, "output": 0 },
  "limit": { "context": 262144, "output": 32768 },
  "capabilities": { "reasoning": true, "toolcall": true },
  "variants": {
    "low": { "reasoningEffort": "low" },
    "high": { "reasoningEffort": "high", "headers": { "x-api-key": "CANARY-IN-A-VARIANT" } }
  }
}`;
{
    ok('the fixture really carries the canaries it claims to', /CANARY-MODEL-OPTION/.test(VERBOSE));
    const kept = CAT.publicOpenCodeCatalogText(VERBOSE);
    ok('‼️ no canary survives the reduction — option, header, url, variant, unknown field, warning line',
        !/CANARY/.test(kept));

    // ‼️ AND NOTHING A READER USES IS LOST — the reduction is only safe if it
    // is invisible to everything downstream.
    eq('the rows read identically before and after',
        CAT.readOpenCodeCatalog(kept).rows, CAT.readOpenCodeCatalog(VERBOSE).rows);
    eq('…and so do the providers, variants included',
        CAT.readOpenCodeCatalog(kept).providers, CAT.readOpenCodeCatalog(VERBOSE).providers);
    eq('the model list the pickers draw reads identically',
        OC.readOpencodeModelList(kept), OC.readOpencodeModelList(VERBOSE));
    eq('…and so does the free model a health check would pick',
        OC.opencodeFreeModel(kept), OC.opencodeFreeModel(VERBOSE));
    eq('reducing twice is reducing once', CAT.publicOpenCodeCatalogText(kept), kept);
    eq('nothing in, nothing out', CAT.publicOpenCodeCatalogText(''), '');
    ok('a block that does not parse is dropped whole rather than passed through',
        !/CANARY/.test(CAT.publicOpenCodeCatalogText('a/b\n{\n  "id": "b", "apiKey": "CANARY-BROKEN",\n')));
}

/* ---- …and the host keeps only the reduced text, including what it had kept before */
{
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('‼️ the one ingest point stores the reduced listing, never the raw one',
        /const nextText = publicOpenCodeCatalogText\(String\(text \?\? ''\)\)\.trim\(\) \|\| opencodeCatalog\.text;/
            .test(ext));
    // A copy persisted by an earlier build may still hold a key. Reducing it on
    // the way in is not enough: the stored copy has to be REWRITTEN, or it
    // lives on in the editor's state database until the next fetch.
    ok('‼️ a listing restored from an older build is reduced on the way in',
        /const restoredText = publicOpenCodeCatalogText\(restoredCatalog\.text\)/.test(ext));
    ok('…and the stored copy is rewritten when the reduction changed it',
        /if \(restoredCatalog\.text && restoredText !== restoredCatalog\.text\)/.test(ext)
        && /context\.globalState\.update\(OPENCODE_CATALOG_KEY, \{ \.\.\.restoredCatalog, text: restoredText \}\)/.test(ext));
}

/* =========================================================================
 * B — CLAUDE: a canary key through the real adapter, looked for everywhere
 * ========================================================================= */
const route = {
    id: 'kimi', label: 'Kimi', engine: 'claude', providerId: 'moonshot',
    baseUrl: 'https://api.moonshot.ai/anthropic', authKind: 'api-key',
    tiers: { opus: 'kimi-k2-thinking' }, revision: 4
};
const deps = {
    profiles: [route],
    secretFor: (id) => (id === 'kimi' ? CANARY : undefined),
    inheritedEnv: { ANTHROPIC_BASE_URL: 'https://stale.example', ANTHROPIC_API_KEY: 'stale-key', PATH: '/bin' }
};
const adapter = REG.adapterFor('claude', deps);
const sel = { engine: 'claude', providerId: 'kimi', tier: 'opus' };
const rt = adapter.resolveRuntime(sel);
{
    // The ONE place it must be — otherwise the route cannot authenticate.
    eq('the key reaches the child\'s environment, which is the one place it belongs',
        rt.spawnEnv.ANTHROPIC_API_KEY, CANARY);
    ok('‼️ argv never carries it (a process list is world-readable)', !leaks(rt.args));
    ok('‼️ the identity never carries it', !leaks(rt.identity));
    ok('‼️ the names to clear are names, not values', !leaks(rt.clearEnv));
    ok('‼️ preflight never quotes it', !leaks(adapter.preflight(sel)));
    ok('‼️ the catalog never carries it', !leaks(adapter.catalog()));

    const manifest = MAN.manifestFor({
        launchId: 'L-1', at: 1, engine: 'claude', identity: rt.identity,
        options: { providerId: 'kimi', tier: 'opus' }, agentId: 'a', agentName: 'dev',
        mechanism: 'console', cwd: 'D:/x', surface: 'console'
    });
    ok('‼️ the launch manifest never carries it', !leaks(manifest));
    eq('…and the manifest\'s own name guard finds nothing', MAN.manifestLeaks(manifest), []);
    ok('…nor does the sentence a surface prints about it', !leaks(MAN.describeManifest(manifest)));

    ok('‼️ the public profile list never carries it',
        !leaks(PROF.publicProfiles ? PROF.publicProfiles([route], ['kimi']) : OWN.publicProfile(route, true)));

    const report = HEALTH.providerHealth({
        engine: 'claude', adapter, catalog: adapter.catalog(), profiles: [route],
        hasSecret: () => true, cli: { present: true, version: '2.1.0' }, inheritedEnv: deps.inheritedEnv
    });
    ok('‼️ the health report (providers.status) never carries it', !leaks(report));
}

/* ---- the OFFICIAL route: no endpoint of its own, and still no stale answer */
{
    const official = { ...route, id: 'anthropic', providerId: 'anthropic', baseUrl: undefined };
    const r = RT.claudeRouteRuntime(official, undefined, deps.inheritedEnv, '');
    ok('‼️ choosing the first-party route still clears an inherited endpoint',
        r.clearEnv.includes('ANTHROPIC_BASE_URL'));
    ok('…and an inherited key',
        r.clearEnv.includes('ANTHROPIC_API_KEY'));
    ok('…and leaves what is not a route alone', !r.clearEnv.includes('PATH'));
    const env = RT.spawnEnvironment({ ...deps.inheritedEnv }, [], r);
    ok('the environment the child really gets has neither stale value',
        env.ANTHROPIC_BASE_URL === undefined && env.ANTHROPIC_API_KEY === undefined);
}

/* =========================================================================
 * C — what an engine SAYS back is scrubbed of what was injected into it
 * ========================================================================= */
{
    // A CLI that echoes its own environment in an error is not hypothetical —
    // a debug line, a proxy error quoting a header. The verdict of a provider
    // test is stored and drawn, so it is scrubbed before it is either.
    const said = `401 Unauthorized: invalid x-api-key "${CANARY}" for https://api.moonshot.ai`;
    const clean = SCRUB.scrubSecrets(said, Object.values(rt.spawnEnv));
    ok('‼️ a key the engine quotes back is removed before anything stores it', !/CANARY/.test(clean));
    ok('…and the rest of the sentence survives, which is the part worth reading',
        /401 Unauthorized/.test(clean) && /moonshot/.test(clean));
    eq('a short value is not treated as a secret (it would shred ordinary words)',
        SCRUB.scrubSecrets('model opus answered', ['opus']), 'model opus answered');
    eq('nothing to scrub leaves the text alone', SCRUB.scrubSecrets('fine', []), 'fine');

    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    const at = ext.indexOf('const runProviderTest = async (');
    const run = ext.slice(at, at + 4200);
    ok('‼️ the provider test scrubs what it stores with the values it injected',
        /scrubSecrets\(r\.detail, injectedValues\)/.test(run)
        && /scrubSecrets\(r\.error, injectedValues\)/.test(run));
}

/* ---- the SAME scrub on a stream, where a chunk boundary can cut a key in half */
{
    const whole = `error: bad key ${CANARY} rejected\n`;
    // Every possible cut point, including inside the key itself.
    let everyCutClean = true, everyCutComplete = true;
    for (let cut = 1; cut < whole.length; cut++) {
        const s = new SCRUB.SecretScrubber([CANARY]);
        const got = s.push(whole.slice(0, cut)) + s.push(whole.slice(cut)) + s.flush();
        if (/CANARY/.test(got)) { everyCutClean = false; }
        if (got !== whole.replace(CANARY, '‹redacted›')) { everyCutComplete = false; }
    }
    ok('‼️ a key split across two chunks is caught at EVERY possible cut', everyCutClean);
    ok('…and nothing else is lost or duplicated at any cut', everyCutComplete);

    // Byte chunks, with a multi-byte character cut in half: the decoder must
    // carry the half-character across, or the file gets a replacement glyph.
    const bytes = Buffer.from(`çıktı: ${CANARY} — tamam`, 'utf8');
    const s = new SCRUB.SecretScrubber([CANARY]);
    let got = '';
    for (let i = 0; i < bytes.length; i += 3) { got += s.push(bytes.subarray(i, i + 3)); }
    got += s.flush();
    eq('byte chunks cutting through multi-byte characters come out whole',
        got, 'çıktı: ‹redacted› — tamam');

    const idle = new SCRUB.SecretScrubber([]);
    ok('‼️ with nothing injected the scrubber is not in the way at all', idle.active === false);
    const idleShort = new SCRUB.SecretScrubber(['opus']);
    ok('…and a short public value does not switch it on', idleShort.active === false);
    eq('secret values leave the public route facts out',
        SCRUB.secretValuesOf({
            ANTHROPIC_BASE_URL: 'https://x.example', ANTHROPIC_MODEL: 'kimi-k2-thinking',
            ANTHROPIC_API_KEY: CANARY
        }), [CANARY]);

    const tasks = fs.readFileSync(path.join(ROOT, 'src', 'core', 'tasks.ts'), 'utf8');
    ok('‼️ a task\'s output file is written through the scrubber',
        /const scrub = new SecretScrubber\(secretValuesOf\(routeRuntime\?\.spawnEnv\)\)/.test(tasks)
        && /child\.stdout\?\.on\('data', chunk => \{\s*put\(chunk\);/.test(tasks)
        && /child\.stderr\?\.on\('data', chunk => put\(chunk\)\)/.test(tasks));
    ok('…with nothing injected, the raw bytes are written exactly as before',
        /if \(!scrub\.active\) \{ stream\.write\(chunk\); return; \}/.test(tasks));
    ok('…and what is held back is flushed before the footer, on both endings',
        (tasks.match(/drain\(\);\s*\n\s*stream\.write\(`\\n\\n---\\n/g) || []).length === 2);
    ok('…and the route the output is scrubbed for is the SAME runtime the spawn got',
        /const routeRuntime = this\.opts\.engineRuntime\?\./.test(tasks)
        && /this\.opts\.accountLayer\?\.\(engine\.id, task\.account, agent\.id\)\],\s*routeRuntime\s*\)/.test(tasks));
}

/* =========================================================================
 * D — a cache about a profile empties when the profile goes
 * ========================================================================= */
{
    const key = (providerId, revision) => ({
        engine: 'claude', providerId, modelId: 'm', adapter: 'claude@1', cli: '2.1.0', revision
    });
    const records = [
        { key: key('kimi', 3), ok: true, at: 1, ms: 1, detail: 'old' },
        { key: key('kimi', 4), ok: true, at: 2, ms: 1, detail: 'current' },
        { key: key('minimax', 1), ok: false, at: 3, ms: 1, detail: 'other' },
        { key: { ...key('kimi', undefined), engine: 'opencode' }, ok: true, at: 4, ms: 1, detail: 'same id, other engine' }
    ];
    const kept = HEALTH.dropTestsFor(records, 'claude', 'kimi');
    eq('‼️ every verdict about a removed route goes — current AND superseded',
        kept.filter(r => r.key.engine === 'claude' && r.key.providerId === 'kimi').length, 0);
    eq('…and nothing about any other route is touched', kept.length, 2);
    ok('…including the same id on a different engine, which is a different provider',
        kept.some(r => r.key.engine === 'opencode'));

    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('‼️ removing a route through the bridge empties its verdicts',
        /await forgetProviderTests\(w\.profile\?\.engine \?\? 'claude', id\);/.test(
            ext.slice(ext.indexOf("op: 'providers.remove'"), ext.indexOf("op: 'providers.remove'") + 2400)));
    ok('‼️ …and so does removing it from the page, through the same function',
        (ext.match(/await forgetProviderTests\(/g) || []).length >= 2);
}

/* =========================================================================
 * E — the artefact itself: a credential-shaped string does not ship
 * ========================================================================= */
{
    const tool = fs.readFileSync(path.join(ROOT, 'tools', 'verify_vsix.js'), 'utf8');
    ok('‼️ the package check reads CONTENTS for credential shapes, not only names',
        /inflateRawSync/.test(tool) && /credentialFindings\(text\)/.test(tool));
    const SHAPES = require(path.join(ROOT, 'tools', 'credentialShapes.js'));
    ok('…from the ONE list the commit hook reads too',
        /require\('\.\/credentialShapes'\)/.test(tool)
        && /require\('\.\/credentialShapes'\)/.test(
            fs.readFileSync(path.join(ROOT, 'tools', 'scan_staged.js'), 'utf8')));
    eq('it names an Anthropic key, a GitHub token and a private key by kind',
        SHAPES.credentialFindings('sk-ant-api03-' + 'x'.repeat(30) + ' ghp_' + 'Y'.repeat(36)
            // Assembled, never written whole: this file is committed, and the
            // commit hook reads it with the same list it is testing.
            + ' -----BEGIN ' + 'PRIVATE KEY-----'),
        ['an Anthropic key', 'a GitHub token', 'a private key']);
    eq('‼️ a placeholder in a doc is not a key', SHAPES.credentialFindings('use sk-ant-... or ghp_xxxx'), []);
    eq('‼️ a planted canary is not a leak', SHAPES.credentialFindings(CANARY), []);
    ok('‼️ the commit hook runs the staged scan and blocks on it',
        /node tools\/scan_staged\.js/.test(fs.readFileSync(path.join(ROOT, '.githooks', 'pre-commit'), 'utf8')));
    ok('…and untracked files under a shipped folder are refused by name',
        /nothing untracked rode into the archive/.test(tool));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
