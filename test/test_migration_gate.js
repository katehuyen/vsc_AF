// X-283 — the post-migration acceptance gate: one pass/fail composed out of the
// checks that already exist, every failing item carrying what a program can run.
// X-276 — account dirs stored as tokens, opened as this machine's path.
// Fixtures live in os.tmpdir() with an af- prefix; nothing here reads the real
// settings or the real slots.
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('  FAIL ' + name); } };

const { migrationGate } = require(path.join(ROOT, 'out/core/migrationGate.js'));
const { normalizeSlots, portableSlots, unportableDirs } = require(path.join(ROOT, 'out/core/accountStore.js'));
const { standardRoots } = require(path.join(ROOT, 'out/core/portablePaths.js'));

// ---------- X-276: the store round-trips through tokens ----------
{
    const home = 'C:\\Users\\here';
    const storage = 'C:\\Users\\here\\AppData\\Roaming\\Code\\User\\globalStorage\\muvusoft.agent-farm';
    const roots = standardRoots({ claudeDir: home + '\\.claude', globalStorage: storage, home });
    const raw = [
        { id: 'claude-a', dir: storage + '\\accounts\\claude-a', engine: 'claude' },
        { id: 'claude-b', dir: '${globalStorage}\\accounts\\claude-b', engine: 'claude' },
        { id: 'claude-c', dir: 'C:\\Users\\THEM\\AppData\\Roaming\\Code\\User\\globalStorage\\muvusoft.agent-farm\\accounts\\claude-c', engine: 'claude' },
        { id: 'claude-e', dir: 'E:\\slots\\claude-e', engine: 'claude' }
    ];
    const slots = normalizeSlots(raw, roots);
    ok('a token opens as this machine\'s path', slots.find(s => s.id === 'claude-b').dir === storage + '\\accounts\\claude-b');
    ok('an absolute path recorded on ANOTHER machine heals onto this machine\'s storage',
        slots.find(s => s.id === 'claude-c').dir === storage + '\\accounts\\claude-c');
    ok('this machine\'s own absolute path opens unchanged', slots.find(s => s.id === 'claude-a').dir === storage + '\\accounts\\claude-a');
    ok('a dir under no known root is taken as written', slots.find(s => s.id === 'claude-e').dir === 'E:\\slots\\claude-e');
    ok('without roots nothing is expanded (a test that owns no machine)', normalizeSlots(raw)[1].dir === '${globalStorage}\\accounts\\claude-b');
    const written = portableSlots(slots, roots);
    ok('‼️ X-276 — the list is WRITTEN as tokens', written.every(s => s.id === 'claude-e' || s.dir.startsWith('${globalStorage}')));
    ok('…and a dir under no root is written as an honest absolute', written.find(s => s.id === 'claude-e').dir === 'E:\\slots\\claude-e');
    ok('a written list opens back to the same paths', JSON.stringify(normalizeSlots(written, roots)) === JSON.stringify(slots));
    const un = unportableDirs(raw, roots);
    ok('unportableDirs reads the RAW rows that name a machine', un.map(u => u.id).sort().join(',') === 'claude-a,claude-c,claude-e');
    ok('…and says which of them a token can replace', un.find(u => u.id === 'claude-a').tokenizable === true && un.find(u => u.id === 'claude-e').tokenizable === false);
    // ‼️ another machine's absolute path is not under THIS machine's root, so no
    // token replaces it on the way out — but it HEALS on the way in, and the
    // rewrite the gate offers writes the healed, tokenized form.
    ok('a foreign absolute path is unportable and not tokenizable as written…', un.find(u => u.id === 'claude-c').tokenizable === false);
    ok('…yet portableSlots(normalizeSlots()) writes it as a token, because it healed on the way in',
        written.find(s => s.id === 'claude-c').dir === '${globalStorage}\\accounts\\claude-c');
    ok('a token row is not unportable', un.every(u => u.id !== 'claude-b'));
    ok('garbage is not a row', unportableDirs([null, 7, { id: 'x' }, { dir: 'C:\\x' }], roots).length === 0 && unportableDirs('nope', roots).length === 0);
}

// ---------- X-283: the gate on a fixture machine ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-gate-'));
try {
    const drive = path.join(tmp, 'D');
    const home = path.join(tmp, 'C', 'Users', 'me');
    fs.mkdirSync(path.join(drive, 'claude'), { recursive: true });
    fs.mkdirSync(path.join(drive, 'storage'), { recursive: true });
    fs.mkdirSync(home, { recursive: true });
    const claudeDir = path.join(home, '.claude');
    const storage = path.join(home, 'globalStorage', 'muvusoft.agent-farm');
    fs.mkdirSync(path.dirname(storage), { recursive: true });
    let junctions = true;
    try {
        fs.symlinkSync(path.join(drive, 'claude'), claudeDir, 'junction');
        fs.symlinkSync(path.join(drive, 'storage'), storage, 'junction');
    } catch { junctions = false; }

    const complete = (id, ok) => ({
        slotId: id, engine: 'claude', complete: ok, gaps: ok ? [] : ['link:todos', 'own:.credentials.json'],
        rows: ok
            ? [{ id: 'own:.claude.json', kind: 'own', owner: 'account', repairable: false, ok: true, detail: 'present' },
                { id: 'link:todos', kind: 'link', owner: 'fleet', repairable: true, ok: true, detail: 'todos → pool' }]
            : [{ id: 'own:.credentials.json', kind: 'own', owner: 'account', repairable: false, ok: false, detail: '.credentials.json missing — sign in again' },
                { id: 'link:todos', kind: 'link', owner: 'fleet', repairable: true, ok: false, detail: 'todos missing — no link to the pool' }]
    });
    const base = () => ({
        roots: [{ name: 'claudeDir', path: claudeDir }, { name: 'globalStorage', path: storage }],
        fs,
        completeness: () => [complete('claude-a', true), complete('codex-b', true)],
        twins: () => new Map([['claude-a', []], ['codex-b', []]]),
        unportable: () => [],
        stores: () => [{ name: 'titles', exists: true, rows: 12, legacyOnly: 0 }, { name: 'marks', exists: false, rows: 0, legacyOnly: 0 }],
        now: () => 1000
    });

    // a machine where everything holds
    const green = migrationGate(base());
    ok('a migrated machine PASSES', green.ok === true && green.failed === 0 && green.at === 1000);
    ok('every area is represented', ['roots', 'slots', 'accounts', 'state'].every(a => green.items.some(i => i.area === a)));
    ok('the items carry stable ids', ['root:claudeDir', 'root:globalStorage', 'slot:claude-a', 'slot:codex-b', 'twins', 'portable-dirs', 'state:titles', 'state:marks']
        .every(id => green.items.some(i => i.id === id)));
    if (junctions) {
        ok('a linked root reads where it really points', /root:claudeDir/.test(green.items[0].id) && green.items[0].ok && /claude/.test(green.items[0].detail));
    } else { console.log('  (junction unavailable on this host — root half left unmeasured)'); }
    ok('a passing item carries no action and no fix', green.items.every(i => !i.ok || (i.actions.length === 0 && i.fix === '')));
    ok('the marks store that has nothing to carry passes with the reason', green.items.find(i => i.id === 'state:marks').ok && /nothing to carry/.test(green.items.find(i => i.id === 'state:marks').detail));

    // (7) a REAL folder where the link belongs — the data is on the system drive
    {
        const src = base();
        const realDir = path.join(tmp, 'real', '.claude');
        fs.mkdirSync(realDir, { recursive: true });
        src.roots = [{ name: 'claudeDir', path: realDir }, { name: 'globalStorage', path: path.join(tmp, 'nowhere') }];
        const v = migrationGate(src);
        ok('‼️ a real folder on the system drive FAILS, and says the data will die with the next format',
            !v.ok && !v.items[0].ok && /REAL folder/.test(v.items[0].detail) && /Link-Folders\.ps1/.test(v.items[0].fix));
        ok('a missing root FAILS and names the script', !v.items[1].ok && /not there/.test(v.items[1].detail) && /Link-Folders\.ps1/.test(v.items[1].fix));
        ok('a root has no program action — it is the person\'s job', v.items[0].actions.length === 0);
    }

    // (1)(2)(3) a slot that fails its contract — repairable clauses get the action, the identity gets the fix
    {
        const src = base();
        src.completeness = () => [complete('claude-a', false), complete('codex-b', true)];
        const v = migrationGate(src);
        const it = v.items.find(i => i.id === 'slot:claude-a');
        ok('‼️ a failing slot FAILS the gate and names its clauses', !v.ok && !it.ok && /link:todos/.test(it.detail) && /own:\.credentials\.json/.test(it.detail));
        ok('…the repairable clause becomes the one-click action, through the contract\'s own op',
            it.actions.length === 1 && it.actions[0].op === 'accounts.complete' && it.actions[0].args.id === 'claude-a' && it.actions[0].args.dryRun === false && it.actions[0].danger === 'low');
        ok('…and the identity clause is a FIX for a person, never an action', /sign in again on claude-a/.test(it.fix));
        ok('the other slot still passes', v.items.find(i => i.id === 'slot:codex-b').ok);
        ok('the counts are honest', v.passed === v.items.length - 1 && v.failed === 1);
    }

    // (4) one account in two slots
    {
        const src = base();
        src.twins = () => new Map([['claude-a', ['claude-a-2']], ['claude-a-2', ['claude-a']]]);
        const v = migrationGate(src);
        const it = v.items.find(i => i.id === 'twins');
        ok('‼️ twins FAIL the gate and are named as pairs', !it.ok && /claude-a = claude-a-2/.test(it.detail));
        ok('…with a forget action per twin, marked HIGH danger', it.actions.length === 2 && it.actions.every(a => a.op === 'accounts.forget' && a.danger === 'high'));
    }

    // (5) dirs stored as this machine's path
    {
        const src = base();
        src.unportable = () => [{ id: 'claude-a', dir: 'C:\\Users\\me\\...\\claude-a', tokenizable: true }, { id: 'claude-e', dir: 'E:\\slots\\claude-e', tokenizable: false }];
        const v = migrationGate(src);
        const it = v.items.find(i => i.id === 'portable-dirs');
        ok('‼️ an absolute account dir FAILS the gate', !it.ok && /claude-a, claude-e/.test(it.detail));
        ok('…the tokenizable ones get the rewrite action', it.actions.length === 1 && it.actions[0].op === 'accounts.portable' && it.actions[0].args.dryRun === false);
        ok('…and the one under no root is named as the person\'s job', /claude-e/.test(it.fix) && /no known root/.test(it.fix));
        src.unportable = () => [{ id: 'claude-e', dir: 'E:\\slots\\claude-e', tokenizable: false }];
        ok('nothing tokenizable → no action, only the fix', migrationGate(src).items.find(i => i.id === 'portable-dirs').actions.length === 0);
    }

    // (6) the legacy state never adopted
    {
        const src = base();
        src.stores = () => [{ name: 'titles', exists: false, rows: 0, legacyOnly: 5 }, { name: 'marks', exists: true, rows: 3, legacyOnly: 2 }];
        const v = migrationGate(src);
        ok('‼️ legacy rows with no portable file FAIL — the adoption never ran', !v.items.find(i => i.id === 'state:titles').ok && /adoption never ran/.test(v.items.find(i => i.id === 'state:titles').detail));
        ok('legacy rows kept OUT of an existing store pass and say so — a merge, not an overwrite, once',
            v.items.find(i => i.id === 'state:marks').ok && /2 legacy row\(s\) kept out by design/.test(v.items.find(i => i.id === 'state:marks').detail));
    }

    // a source that throws never takes the gate down with it
    {
        const src = base();
        src.completeness = () => { throw new Error('store unreadable'); };
        src.twins = () => { throw new Error('nope'); };
        const v = migrationGate(src);
        ok('a check that throws is a FAILING item with the error on it, not a crash',
            !v.ok && v.items.some(i => i.id === 'slots' && !i.ok && /store unreadable/.test(i.detail)));
        ok('…and the other checks still ran', v.items.some(i => i.id === 'twins') && v.items.some(i => i.id === 'portable-dirs'));
    }
} finally {
    fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
