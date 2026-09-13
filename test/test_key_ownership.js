// X-274 — key-level ownership inside the identity file: the sign-in is the
// slot's, the folder trusts and MCP servers are the fleet's, the telemetry is
// nobody's. Fixtures live in os.tmpdir() with an af- prefix and never touch the
// real ~/.claude.json (the X-272 method: the proof is produced in isolation).
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('  FAIL ' + name); } };

const ko = require(path.join(ROOT, 'out/core/keyOwnership.js'));
const sc = require(path.join(ROOT, 'out/core/slotCompleteness.js'));
const { adapterFor } = require(path.join(ROOT, 'out/core/engineAccounts.js'));

const claude = adapterFor('claude');
const own = claude.ownership['.claude.json'];

// ---------- 1. the classification is the adapter's, and it is the measured one ----------
ok('claude owns keys inside .claude.json', !!own);
ok('the identity is the slot\'s: oauthAccount and userID', own.keys.oauthAccount === 'slot' && own.keys.userID === 'slot');
ok('the MCP servers are the fleet\'s', own.keys.mcpServers === 'fleet');
ok('a key nobody named is IGNORED, not merged — the 21 telemetry fields per entry must never count', own.default === 'ignore');
const trust = ['allowedTools', 'hasTrustDialogAccepted', 'mcpServers', 'enabledMcpjsonServers',
    'disabledMcpjsonServers', 'mcpContextUris', 'hasClaudeMdExternalIncludesApproved'];
ok('every project entry\'s trust keys are the fleet\'s', trust.every(k => own.entries.projects.keys[k] === 'fleet'));
ok('inside an entry, everything else is ignored too', own.entries.projects.default === 'ignore');
// measured 2026-09-13: the 29 fields of a real entry — the trust keys, and telemetry
const realEntryFields = ['allowedTools', 'mcpContextUris', 'mcpServers', 'enabledMcpjsonServers', 'disabledMcpjsonServers',
    'hasTrustDialogAccepted', 'hasClaudeMdExternalIncludesApproved', 'hasClaudeMdExternalIncludesWarningShown', 'exampleFiles',
    'lastGracefulShutdown', 'lastVersionBase', 'lastCost', 'lastAPIDuration', 'lastAPIDurationWithoutRetries', 'lastToolDuration',
    'lastDuration', 'lastLinesAdded', 'lastLinesRemoved', 'lastTotalInputTokens', 'lastTotalOutputTokens',
    'lastTotalCacheCreationInputTokens', 'lastTotalCacheReadInputTokens', 'lastTotalWebSearchRequests', 'lastFpsAverage',
    'lastFpsLow1Pct', 'lastModelUsage', 'lastSessionId', 'lastSessionMetrics', 'lastStartTime'];
const fleetOwned = realEntryFields.filter(k => (own.entries.projects.keys[k] || own.entries.projects.default) === 'fleet');
ok('of the 29 measured entry fields exactly the 7 trust keys are the fleet\'s: ' + fleetOwned.join(','),
    fleetOwned.length === 7 && trust.every(k => fleetOwned.includes(k)));
ok('fleetKeyPaths prints what a card can read', ko.fleetKeyPaths(own).includes('mcpServers') && ko.fleetKeyPaths(own).includes('projects[*].hasTrustDialogAccepted'));

// ---------- 2. drift and projection, pure ----------
const P1 = 'D:\\zone\\one', P2 = 'D:\\zone\\two', P3 = 'D:\\zone\\three';
const entry = (extra) => ({
    allowedTools: [], mcpContextUris: [], mcpServers: {}, enabledMcpjsonServers: [], disabledMcpjsonServers: [],
    hasTrustDialogAccepted: true, hasClaudeMdExternalIncludesApproved: false,
    lastCost: 0.5, lastSessionId: 'fleet-session', lastDuration: 100, ...(extra || {})
});
const fleet = () => ({
    numStartups: 380, oauthAccount: { accountUuid: 'fleet-uuid', emailAddress: 'fleet@example' }, userID: 'fleet-user',
    mcpServers: { obsidian: { command: 'x' }, playwright: { command: 'y' } },
    projects: { [P1]: entry(), [P2]: entry() },
    cachedGrowthBookFeatures: { a: 1 }, tipsHistory: { t: 1 }
});
const slotOf = (f) => JSON.parse(JSON.stringify({
    ...f, numStartups: 12, oauthAccount: { accountUuid: 'slot-uuid', emailAddress: 'slot@example' }, userID: 'slot-user',
    cachedGrowthBookFeatures: { a: 2 },
    projects: Object.fromEntries(Object.entries(f.projects).map(([k, v]) => [k, { ...v, lastCost: 9.9, lastSessionId: 'slot-session' }]))
}));

{
    const f = fleet(), s = slotOf(f);
    ok('a slot born from the fleet reads NO drift although the sign-in and every telemetry field differ', ko.ownedDrift(own, f, s).length === 0);
    ok('…and projecting it changes nothing', JSON.stringify(ko.projectOwned(own, f, s)) === JSON.stringify(s));
}
{
    // ‼️ THE X-274 FAULT: the user trusts a new folder in the main directory; the slot never hears of it.
    const f = fleet(), s = slotOf(f);
    f.projects[P3] = entry();
    const d = ko.ownedDrift(own, f, s);
    ok('a folder the fleet trusts and the slot lacks is drift on every fleet key of that entry',
        d.includes(`projects[${P3}].hasTrustDialogAccepted`) && d.includes(`projects[${P3}].allowedTools`) && d.length === 7);
    const out = ko.projectOwned(own, f, s);
    ok('projection creates the entry in the slot', !!out.projects[P3] && out.projects[P3].hasTrustDialogAccepted === true);
    ok('…with the fleet\'s keys only — no telemetry is invented', !('lastCost' in out.projects[P3]) && !('lastSessionId' in out.projects[P3]));
    ok('the sign-in stays the slot\'s, byte for byte', JSON.stringify(out.oauthAccount) === JSON.stringify(s.oauthAccount) && out.userID === 'slot-user');
    ok('the slot\'s telemetry on the other entries is untouched', out.projects[P1].lastCost === 9.9 && out.projects[P1].lastSessionId === 'slot-session');
    ok('the slot\'s own counters are untouched', out.numStartups === 12 && out.cachedGrowthBookFeatures.a === 2);
    ok('after projection there is no drift', ko.ownedDrift(own, f, out).length === 0);
    ok('the slot object passed in was not mutated', !s.projects[P3]);
}
{
    // the user adds an MCP server / revokes a trust in the main directory
    const f = fleet(), s = slotOf(f);
    f.mcpServers.airtable = { command: 'z' };
    f.projects[P2].hasTrustDialogAccepted = false;
    delete f.projects[P1].allowedTools;
    const d = ko.ownedDrift(own, f, s);
    ok('a changed top-level fleet key is drift', d.includes('mcpServers'));
    ok('a revoked trust is drift', d.includes(`projects[${P2}].hasTrustDialogAccepted`));
    ok('a key the fleet DELETED is drift — absence counts, as carriedDrift treats a deleted setting', d.includes(`projects[${P1}].allowedTools`));
    const out = ko.projectOwned(own, f, s);
    ok('projection copies the new server, the revocation and the deletion',
        out.mcpServers.airtable.command === 'z' && out.projects[P2].hasTrustDialogAccepted === false && !('allowedTools' in out.projects[P1]));
    ok('projection copies by value, not by reference', (out.mcpServers.airtable.command = 'w', f.mcpServers.airtable.command === 'z'));
}
{
    // a folder only a SLOT session trusted — the fleet has no entry for it
    const f = fleet(), s = slotOf(f);
    s.projects[P3] = entry({ lastCost: 1 });
    ok('an entry only the slot has is the slot\'s — not drift', ko.ownedDrift(own, f, s).length === 0);
    ok('…and projection keeps it', !!ko.projectOwned(own, f, s).projects[P3]);
}
{
    // ‼️ THE X-291 HOLE, PINNED: a slot session approves a tool in a folder the fleet
    // knows. Under `fleet` the fleet wins at the next gate and the fleet is never
    // told — there is no return leg yet. When `merge`/`promote` arrive this test
    // is the one that changes, on purpose.
    const f = fleet(), s = slotOf(f);
    s.projects[P1].allowedTools = ['Bash(git push)'];
    const d = ko.ownedDrift(own, f, s);
    ok('X-291 — a slot-side approval in a fleet-known folder reads as drift (the fleet wins)', d.length === 1 && d[0] === `projects[${P1}].allowedTools`);
    const out = ko.projectOwned(own, f, s);
    ok('X-291 — projection removes the slot-side approval', JSON.stringify(out.projects[P1].allowedTools) === '[]');
    ok('X-291 — the fleet is not changed by a projection: no return leg', JSON.stringify(f.projects[P1].allowedTools) === '[]');
}
{
    ok('an unreadable file is not a JSON object', !ko.isJsonObject('') && !ko.isJsonObject('nope') && !ko.isJsonObject('[1]') && ko.isJsonObject('{"a":1}'));
    ok('parseOwnedFile never throws and reads garbage as empty', JSON.stringify(ko.parseOwnedFile('{bad')) === '{}');
}

// ---------- 3. the clause on a fixture slot: reads, dry-runs, repairs, refuses ----------
const clauses = sc.slotClauses(claude);
const ids = clauses.map(c => c.id);
ok('‼️ X-284 — `ownership` is a CONTENT key, so the classification test guards it', sc.CONTENT_KEYS.includes('ownership'));
ok('the contract derives one keys clause per owned file', ids.includes('keys:.claude.json'));
ok('the keys clause is asked right after the identity and before the behaviour file',
    ids.indexOf('keys:.claude.json') === claude.ownFiles.length && ids.indexOf('keys:.claude.json') < ids.indexOf('carry:settings.json'));
ok('it is the fleet\'s and repairable', clauses.find(c => c.id === 'keys:.claude.json').owner === 'fleet' && !!clauses.find(c => c.id === 'keys:.claude.json').repair);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-keyown-'));
try {
    const home = path.join(tmp, 'home');
    const live = path.join(home, '.claude');
    for (const n of claude.sharedPaths) { fs.mkdirSync(path.join(live, n), { recursive: true }); }
    fs.writeFileSync(path.join(live, 'settings.json'), '{"model":"opus"}', 'utf8');
    const slot = path.join(tmp, 'accounts', 'claude-test');
    fs.mkdirSync(slot, { recursive: true });
    for (const n of claude.sharedPaths) { try { fs.symlinkSync(path.join(live, n), path.join(slot, n), 'junction'); } catch { /* unavailable */ } }
    fs.writeFileSync(path.join(slot, '.credentials.json'), '{}', 'utf8');
    const f = fleet();
    fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify(f, null, 2) + '\n', 'utf8');
    const slotObj = slotOf(f);
    const slotText0 = JSON.stringify(slotObj, null, 2) + '\n';
    fs.writeFileSync(path.join(slot, '.claude.json'), slotText0, 'utf8');
    const ctx = { fs, home, dir: slot, slotId: 'claude-test', engine: 'claude', repairLinks: () => ({ linked: [], failed: [] }) };
    const row = (r) => r.rows.find(x => x.id === 'keys:.claude.json');

    ok('a slot born from the fleet: the keys clause reads ok', row(sc.slotCompleteness(ctx)).ok === true);

    // the user trusts a new folder in the main directory
    f.projects[P3] = entry();
    fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify(f, null, 2) + '\n', 'utf8');
    const before = sc.slotCompleteness(ctx);
    ok('‼️ X-274 — a trust given in the main directory reads as a GAP on the slot', before.gaps.includes('keys:.claude.json'));
    ok('…and the detail names the keys, not just a count', /7 fleet keys differ/.test(row(before).detail) && /hasTrustDialogAccepted|allowedTools/.test(row(before).detail));

    const dry = sc.completeSlot(ctx, true);
    ok('dryRun: says it would write', row(dry).wrote === true);
    ok('dryRun: touches nothing', fs.readFileSync(path.join(slot, '.claude.json'), 'utf8') === slotText0);

    const after = sc.completeSlot(ctx, false);
    const written = JSON.parse(fs.readFileSync(path.join(slot, '.claude.json'), 'utf8'));
    ok('repair: the trust reached the slot', written.projects[P3] && written.projects[P3].hasTrustDialogAccepted === true);
    ok('repair: the slot\'s sign-in is intact', written.oauthAccount.accountUuid === 'slot-uuid' && written.userID === 'slot-user');
    ok('repair: the slot\'s telemetry is intact', written.projects[P1].lastCost === 9.9 && written.numStartups === 12);
    ok('repair: the row carries the reading it was repaired FROM (X-292)', /7 fleet keys differ/.test(row(after).was || ''));
    ok('repair: the clause reads ok afterwards', row(after).ok === true && !after.gaps.includes('keys:.claude.json'));
    const text1 = fs.readFileSync(path.join(slot, '.claude.json'), 'utf8');
    const again = sc.completeSlot(ctx, false);
    ok('idempotent: a second pass writes nothing', row(again).wrote !== true && fs.readFileSync(path.join(slot, '.claude.json'), 'utf8') === text1);

    // ‼️ an unreadable identity file is never repaired INTO
    fs.writeFileSync(path.join(slot, '.claude.json'), '{ this is not json', 'utf8');
    const broken = sc.slotCompleteness(ctx);
    ok('an unreadable slot file reads as a gap with the reason on it', broken.gaps.includes('keys:.claude.json') && /not a JSON object/.test(row(broken).detail));
    const refused = sc.completeSlot(ctx, false);
    ok('…and the repair refuses rather than erasing the sign-in',
        row(refused).wrote === false && /not a JSON object/.test(row(refused).error || '')
        && fs.readFileSync(path.join(slot, '.claude.json'), 'utf8') === '{ this is not json');

    // the fleet has no identity file at all (a fresh machine)
    fs.writeFileSync(path.join(slot, '.claude.json'), text1, 'utf8');
    fs.rmSync(path.join(home, '.claude.json'));
    ok('no fleet file: nothing to project from, reads ok', row(sc.slotCompleteness(ctx)).ok === true && /no \.claude\.json to project from/.test(row(sc.slotCompleteness(ctx)).detail));
    // the slot has no identity file — the own: clause says so; this one does not repeat it
    fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify(f, null, 2) + '\n', 'utf8');
    fs.rmSync(path.join(slot, '.claude.json'));
    const none = sc.slotCompleteness(ctx);
    ok('no slot file: the identity clause owns that fact, the keys clause does not double-count it',
        none.gaps.includes('own:.claude.json') && !none.gaps.includes('keys:.claude.json'));
    ok('…and the repair does not invent an identity file', sc.completeSlot(ctx, false).rows.find(x => x.id === 'keys:.claude.json').wrote !== true
        && !fs.existsSync(path.join(slot, '.claude.json')));
} finally {
    fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
