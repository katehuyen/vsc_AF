// X-284 — the birth contract: derived from the adapter's shape, read and repaired
// on a fixture slot in os.tmpdir() (never inside test/ — a throwing test never
// reaches its cleanup and the leftover walks into the next `git add -A`).
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('  FAIL ' + name); } };

const sc = require(path.join(ROOT, 'out/core/slotCompleteness.js'));
const { ENGINE_AUTH_ADAPTERS, adapterFor } = require(path.join(ROOT, 'out/core/engineAccounts.js'));

// ---------- 1. every adapter field is either content (has a clause) or declared meta ----------
const src = fs.readFileSync(path.join(ROOT, 'src/core/engineAccounts.ts'), 'utf8');
const ifaceStart = src.indexOf('export interface EngineAuthAdapter');
const ifaceEnd = src.indexOf('\n}', ifaceStart);
const iface = src.slice(ifaceStart, ifaceEnd);
const fields = [...iface.matchAll(/^\s{4}([A-Za-z]+)\??:/gm)].map(m => m[1]);
ok('the adapter interface was found and has fields', fields.length >= 8);
const known = new Set([...sc.CONTENT_KEYS, ...sc.META_KEYS]);
const unclassified = fields.filter(f => !known.has(f));
ok('‼️ X-284 — every EngineAuthAdapter field is CONTENT (a clause derives from it) or META: ' + unclassified.join(','),
    unclassified.length === 0);
for (const k of sc.CONTENT_KEYS) {
    ok('content key ' + k + ' is a real adapter field', fields.includes(k));
}
// …and a content field really yields clauses on the engine that has it
const claude = adapterFor('claude');
const clauses = sc.slotClauses(claude);
const ids = clauses.map(c => c.id);
ok('claude: one clause per ownFile', claude.ownFiles.every(n => ids.includes('own:' + n)));
ok('claude: one clause per carryFile', (claude.carryFiles || []).every(n => ids.includes('carry:' + n)));
ok('claude: one clause per requiredEnv var',
    Object.keys(claude.requiredEnv.vars).every(k => ids.includes('env:' + k)));
ok('claude: one clause per sharedPath', claude.sharedPaths.every(n => ids.includes('link:' + n)));
ok('claude: the hooks clause rides on settings.json', ids.includes('hooks'));
// ‼️ X-269 — THE CONTRACT FIRST, THE HOOKS AFTER, kept by the SHAPE. The slot's
// settings.json is RENDERED out of the user's own, so a hook pass that ran before
// the render would write a port into a file about to be replaced. That order used
// to be three call sites agreeing with each other in a comment; it is now the
// order the clauses are derived in, which is the order completeSlot repairs in.
ok('‼️ X-269: carry and env are repaired BEFORE hooks, by clause order',
    ids.indexOf('hooks') === ids.length - 1
    && ids.indexOf('carry:settings.json') < ids.indexOf('hooks')
    && ids.findIndex(i => i.startsWith('env:')) < ids.indexOf('hooks'));
// ‼️ AND THE IDENTITY IS ASKED FIRST, so a slot that is nobody says so before it
// is told which links it is missing.
ok('X-270: the identity clauses come first', ids.slice(0, claude.ownFiles.length).every(i => i.startsWith('own:')));
ok('X-270 — identity clauses belong to the account and are NOT repairable in place',
    clauses.filter(c => c.kind === 'own').every(c => c.owner === 'account' && !c.repair));
ok('X-270 — everything else belongs to the fleet and IS repairable',
    clauses.filter(c => c.kind !== 'own').every(c => c.owner === 'fleet' && !!c.repair));
for (const a of ENGINE_AUTH_ADAPTERS) {
    const cs = sc.slotClauses(a);
    ok(a.engine + ': no clause carries a Claude-shaped file the engine never heard of',
        a.engine === 'claude' || !cs.some(c => c.id === 'hooks' || c.id.startsWith('env:')));
}

// ---------- 2. a fixture slot: gaps read, repairs applied, idempotent ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-slotc-'));
try {
    const home = path.join(tmp, 'home');
    const live = path.join(home, '.claude');
    fs.mkdirSync(path.join(live, 'projects'), { recursive: true });
    fs.mkdirSync(path.join(live, 'todos'), { recursive: true });
    fs.mkdirSync(path.join(live, 'shell-snapshots'), { recursive: true });
    fs.writeFileSync(path.join(live, 'settings.json'), JSON.stringify({ model: 'opus', permissions: { defaultMode: 'bypassPermissions' } }, null, 2), 'utf8');
    const slot = path.join(tmp, 'accounts', 'claude-test');
    fs.mkdirSync(slot, { recursive: true });
    fs.writeFileSync(path.join(slot, '.credentials.json'), '{}', 'utf8');
    fs.writeFileSync(path.join(slot, '.claude.json'), '{"oauthAccount":{}}', 'utf8');
    // a REAL folder where the pool link belongs — the X-271 fault
    fs.mkdirSync(path.join(slot, 'projects'));

    let linkCalls = 0;
    const repairLinks = (slotId, dryRun) => {
        linkCalls++;
        const linked = [];
        for (const name of claude.sharedPaths) {
            const to = path.join(slot, name);
            if (dryRun) { linked.push(to); continue; }
            try { fs.rmdirSync(to); } catch { /* absent */ }
            try { fs.symlinkSync(path.join(live, name), to, 'junction'); linked.push(to); } catch { /* unavailable */ }
        }
        return { linked, failed: [] };
    };
    const ctx = { fs, home, dir: slot, slotId: 'claude-test', engine: 'claude', repairLinks };

    const before = sc.slotCompleteness(ctx);
    ok('fresh slot: identity present', before.rows.filter(r => r.kind === 'own').every(r => r.ok));
    ok('fresh slot: settings.json gap read', before.gaps.includes('carry:settings.json'));
    ok('fresh slot: env gap read', before.gaps.includes('env:CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT'));
    ok('fresh slot: a real folder in the slot reads as a gap, with the reason on it',
        before.gaps.includes('link:projects') && /real folder/.test(before.rows.find(r => r.id === 'link:projects').detail));
    ok('fresh slot: missing links read as gaps', before.gaps.includes('link:todos') && before.gaps.includes('link:shell-snapshots'));
    ok('fresh slot is not complete', before.complete === false);

    const dry = sc.completeSlot(ctx, true);
    ok('dryRun: reports what it would write', dry.rows.some(r => r.wrote));
    ok('dryRun: touches nothing', !fs.existsSync(path.join(slot, 'settings.json')) && !fs.lstatSync(path.join(slot, 'projects')).isSymbolicLink());

    const after = sc.completeSlot(ctx, false);
    const st = fs.lstatSync(path.join(slot, 'projects'));
    const linked = st.isSymbolicLink();
    ok('repair: settings.json reproduced from the fleet with the guarantee on it',
        fs.existsSync(path.join(slot, 'settings.json'))
        && JSON.parse(fs.readFileSync(path.join(slot, 'settings.json'), 'utf8')).env.CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT === '0'
        && JSON.parse(fs.readFileSync(path.join(slot, 'settings.json'), 'utf8')).model === 'opus');
    ok('repair: the link repair was CALLED, not reimplemented', linkCalls >= 1);
    if (linked) {
        ok('repair: the slot is complete afterwards', after.complete === true && after.gaps.length === 0);
        const again = sc.completeSlot(ctx, false);
        ok('idempotent: a complete slot writes nothing', again.rows.every(r => !r.wrote));
    } else {
        console.log('  (junction unavailable on this host — link half left unmeasured)');
        ok('repair: every non-link clause is complete afterwards', after.rows.filter(r => r.kind !== 'link').every(r => r.ok));
    }
    // the identity is never touched by a repair
    ok('X-270 — the identity files are byte-identical after every repair',
        fs.readFileSync(path.join(slot, '.claude.json'), 'utf8') === '{"oauthAccount":{}}');
} finally {
    fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
