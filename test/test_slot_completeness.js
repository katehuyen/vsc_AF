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

// ---------- 3. THE ACCEPTANCE TEST: wipe the slot folder, capture again, lose NOTHING ----------
// ‼️ X-270's whole claim, measured in one round trip. A slot is an IDENTITY and
// nothing else, so deleting its folder may cost the user a sign-in and must never
// cost them a setting, a permission or a session. If this fails, a clause is
// missing from the contract — that is the only thing it can mean.
//
// It lives here rather than in test_engine_accounts.js because that file is
// deliberately disk-free ("everything that touches disk or vscode lives above
// it"), and this round trip is entirely about what is on the disk.
{
    const { planCapture } = require(path.join(ROOT, 'out/core/accountStore.js'));
    const { liveSource } = require(path.join(ROOT, 'out/core/engineAccounts.js'));
    const { installHooksInto, hooksAreCurrent, userSettingsPath } = require(path.join(ROOT, 'out/core/hooksInstaller.js'));
    const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'af-slotacc-'));
    try {
        const home = path.join(tmp2, 'home');
        const live = path.join(home, '.claude');
        const root = path.join(tmp2, 'accounts');
        for (const d of claude.sharedPaths) { fs.mkdirSync(path.join(live, d), { recursive: true }); }
        fs.mkdirSync(root, { recursive: true });
        // the user's own machine: an identity, and a behaviour file they built by hand
        // ‼️ WHERE THE ENGINE KEEPS THEM, asked rather than guessed: .claude.json
        // sits at the HOME root and .credentials.json inside .claude/, and a fixture
        // that puts both in one place measures nothing.
        const put = (name, text) => {
            const f = path.join(home, liveSource('claude', name));
            fs.mkdirSync(path.dirname(f), { recursive: true });
            fs.writeFileSync(f, text, 'utf8');
        };
        put('.credentials.json', '{"claudeAiOauth":{"accessToken":"t"}}');
        put('.claude.json', '{"oauthAccount":{"emailAddress":"a@b.c"}}');
        const MINE = {
            model: 'opus', cleanupPeriodDays: 36500, includeCoAuthoredBy: false,
            permissions: { defaultMode: 'bypassPermissions', allow: ['Bash(git status)'], deny: ['Bash(rm -rf /)'] },
            statusLine: { type: 'command', command: 'mine.sh' }, outputStyle: 'Explanatory',
            alwaysThinkingEnabled: true, spinnerTipsEnabled: false
        };
        fs.writeFileSync(userSettingsPath(live), JSON.stringify(MINE, null, 2), 'utf8');
        // ‼️ AND THE USER'S OWN FILE CARRIES A STALE PORT. This is the X-265
        // state: hooks that are PRESENT and out of date, which every surface reads
        // as "installed" while the events go nowhere. Reproduction renders the slot
        // file out of this one, so the stale line travels with it and ONLY the hooks
        // clause can put it right — which is what makes the assertion below a
        // measurement of that clause rather than of the copy beneath it.
        installHooksInto(userSettingsPath(live), 8300);
        // ‼️ AND A SESSION: the record of work, which outlives every account.
        const poolFile = path.join(live, 'projects', 'D--proj', 'sess.jsonl');
        fs.mkdirSync(path.dirname(poolFile), { recursive: true });
        fs.writeFileSync(poolFile, '{"type":"user"}\n', 'utf8');

        const identity = { health: 'ready', email: 'a@b.c', accountUuid: 'U-ACC', subscriptionType: 'max' };
        const linkFor = (slotDirPath) => (_slotId, dryRun) => {
            const linked = [], failed = [];
            for (const name of claude.sharedPaths) {
                const to = path.join(slotDirPath, name);
                if (dryRun) { linked.push(to); continue; }
                // linked already -> left alone, as the real repair does; only an
                // absent one is made, and only a real failure is reported.
                try { if (fs.lstatSync(to).isSymbolicLink()) { continue; } } catch { /* absent */ }
                try { fs.symlinkSync(path.join(live, name), to, 'junction'); linked.push(to); }
                catch { failed.push(to); }
            }
            return { linked, failed };
        };
        // ‼️ THE CAPTURE EXECUTOR, exactly as extension.ts runs it since X-284:
        // the identity is copied and NOTHING else — the contract does the rest.
        const capture = (stored) => {
            const plan = planCapture({ engine: 'claude', home, root, identity, stored, onDisk: [], label: '' });
            if (plan.refusal) { return { refusal: plan.refusal }; }
            fs.mkdirSync(plan.slot.dir, { recursive: true });
            for (const c of plan.copies) { if (fs.existsSync(c.from)) { fs.copyFileSync(c.from, c.to); } }
            const ctx2 = {
                fs, home, dir: plan.slot.dir, slotId: plan.slot.id, engine: 'claude',
                hooksPort: 8377, repairLinks: linkFor(plan.slot.dir)
            };
            return { plan, state: sc.completeSlot(ctx2, false) };
        };

        const first = capture([]);
        ok('acceptance: the first capture plus the contract makes a complete slot',
            !first.refusal && first.state.complete === true);
        const dir = first.plan.slot.dir;
        const junctions = (() => { try { return fs.lstatSync(path.join(dir, 'projects')).isSymbolicLink(); } catch { return false; } })();

        // ‼️ AND NOW THE FOLDER IS DESTROYED, which is the clone, the format, the
        // reinstall and the user cleaning up a directory they did not recognise.
        fs.rmSync(dir, { recursive: true, force: true });
        ok('‼️ acceptance: wiping the slot does NOT take the session with it — a record never lived under an account',
            fs.existsSync(poolFile) && fs.readFileSync(poolFile, 'utf8') === '{"type":"user"}\n');
        ok('…nor the user\'s own behaviour file, which is the fleet\'s and not the slot\'s',
            JSON.parse(fs.readFileSync(userSettingsPath(live), 'utf8')).permissions.allow[0] === 'Bash(git status)');

        // ‼️ AND THE ROW IS FORGOTTEN TOO — the worst case, not the kind one.
        const again = capture([]);
        ok('acceptance: capturing again rebuilds a complete slot', !again.refusal && again.state.complete === true);
        const back = JSON.parse(fs.readFileSync(path.join(again.plan.slot.dir, 'settings.json'), 'utf8'));
        const lost = Object.keys(MINE).filter(k => JSON.stringify(back[k]) !== JSON.stringify(MINE[k]));
        ok('‼️ acceptance: every setting the user had is back, byte for byte: lost ' + lost.join(','), lost.length === 0);
        ok('…including the permissions, which are the ones that cost them a prompt each',
            back.permissions.defaultMode === 'bypassPermissions' && back.permissions.deny[0] === 'Bash(rm -rf /)');
        ok('…and the fleet\'s own env guarantee, which the user\'s file never carried',
            back.env && back.env.CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT === '0');
        ok('…and the live wire, so the rebuilt slot is not a session nobody can see',
            hooksAreCurrent(path.join(again.plan.slot.dir, 'settings.json'), 8377));
        if (junctions) {
            ok('‼️ acceptance: and the session is reachable through the rebuilt slot, not merely still in the pool',
                fs.existsSync(path.join(again.plan.slot.dir, 'projects', 'D--proj', 'sess.jsonl')));
        } else {
            console.log('  (junction unavailable on this host — the link half of the round trip left unmeasured)');
        }
    } finally {
        fs.rmSync(tmp2, { recursive: true, force: true });
    }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
