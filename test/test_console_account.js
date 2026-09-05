// X-211 / X-213 — THE SIGN-IN A CONSOLE CARD IS SPENDING, AND CHANGING IT MID-TASK.
//
// ‼️ Three failures, and all three were SILENT — which is why they are driven
// here against the real ConsoleHost with a fake child, rather than grepped for
// in the source:
//
//   1. **The ghost.** The composer's box had no row for "the machine's own
//      sign-in", so the browser drew the FIRST account as selected while the
//      composer stated nothing — and stating nothing does not mean the main
//      account, it falls through to whatever the Engines page last pointed at.
//      Three accounts could be involved at once: the one shown, the one the
//      tooltip described, and the one that ran.
//   2. **The card forgot.** Only one of the four session-start paths recorded
//      the account on the state, and the one it recorded was not Claude's — so
//      every re-spawn of the engine this family exists for read `undefined` and
//      quietly went back to the main sign-in.
//   3. **The lock.** The box closed the moment a session started, so a window
//      that hit its five-hour ceiling had no way forward but a second terminal.
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { EventEmitter } = require('events');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// ---- a child that is a shape, not a process ------------------------------
let spawned = 0;
const spawnEnvs = [];
const spawnArgv = [];
function fakeChild() {
    spawned++;
    const child = new EventEmitter();
    const pipe = () => {
        const s = new EventEmitter();
        s.setEncoding = () => { };
        s.destroy = () => { };
        return s;
    };
    child.stdout = pipe();
    child.stderr = pipe();
    child.stdin = { write: () => true, end: () => { } };
    child.pid = 7000 + spawned;
    child.kill = () => { };
    return child;
}
const realSpawn = cp.spawn;
cp.spawn = (_exe, args, opts) => {
    spawnArgv.push(Array.isArray(args) ? args.slice() : []);
    spawnEnvs.push((opts && opts.env) || {});
    return fakeChild();
};
const realExec = cp.exec;
cp.exec = (_c, cb) => { if (typeof cb === 'function') { cb(null, '', ''); } };
const realExecSync = cp.execSync;
cp.execSync = () => '';
const realExecFile = cp.execFile;
cp.execFile = (_c, _a, _o, cb) => {
    const done = typeof _o === 'function' ? _o : cb;
    if (typeof done === 'function') { done(null, '', ''); }
    return new EventEmitter();
};

const { ConsoleHost } = require(path.join(__dirname, '..', 'out', 'core', 'consolehost.js'));
const { MACHINE_ACCOUNT, MACHINE_GLOBAL, accountLabelOf, resolveAccount, accountRefusal, statedAccountLabel } =
    require(path.join(__dirname, '..', 'out', 'core', 'accountStore.js'));
const { carryOn } = require(path.join(__dirname, '..', 'out', 'core', 'consoleproto.js'));

const init = (o) => Object.assign({
    agentId: 'dev', agentName: 'developer', cwd: process.cwd(),
    engine: 'claude', permissionMode: 'default'
}, o);

/** The layer the extension installs: a slot id becomes CLAUDE_CONFIG_DIR. */
const layer = (engine, account) => {
    const id = String(account || '').trim();
    // ‼️ X-211 — the machine's own sign-in CLEARS the variable rather than
    // merely not setting one: this very test process inherits a
    // CLAUDE_CONFIG_DIR, which is exactly the case the clearing exists for.
    if (id === MACHINE_ACCOUNT) { return { CLAUDE_CONFIG_DIR: null }; }
    if (!id) { return undefined; }
    return { CLAUDE_CONFIG_DIR: 'D:/slots/' + id };
};
const newHost = (ownerPid = () => undefined) => new ConsoleHost(
    () => 'claude', ownerPid,
    () => undefined, () => undefined, () => undefined,
    undefined, undefined, layer);

const tick = () => new Promise(r => setImmediate(r));

async function main() {
    // ---------- the value that says "the machine's own", out loud ----------
    {
        ok('an account stated as the machine\'s own resolves to no slot at all',
            resolveAccount(MACHINE_ACCOUNT, 'claude', { claude: 'claude-work' }) === '');
        ok('‼️ …and it OUTRANKS the standing account, which is the whole point',
            resolveAccount('', 'claude', { claude: 'claude-work' }) === 'claude-work');
        ok('a stated slot still wins over the standing one',
            resolveAccount('claude-other', 'claude', { claude: 'claude-work' }) === 'claude-other');
        ok('the machine\'s own sign-in is never a refusal',
            accountRefusal(MACHINE_ACCOUNT, [], 'claude') === '');
        ok('…while a name that resolves to nothing still is',
            accountRefusal('claude-gone', [], 'claude').length > 20);
        ok('the sentinel cannot collide with a minted id', /^@/.test(MACHINE_ACCOUNT));

        const list = [{ id: 'claude-work', engine: 'claude', dir: 'd', label: 'work' }];
        ok('a stated account is named for the reader, never shown as the sentinel',
            statedAccountLabel(MACHINE_ACCOUNT, list) === MACHINE_GLOBAL
            && statedAccountLabel('claude-work', list) === 'work'
            && statedAccountLabel('', list) === ''
            && accountLabelOf(undefined) === MACHINE_GLOBAL);
    }

    // ---------- the card REMEMBERS what it ran as ----------
    {
        const host = newHost();
        const id = host.start(init({ account: 'claude-work' }));
        ok('‼️ a Claude card records the account it was started on',
            host.get(id).account === 'claude-work');
        const env = spawnEnvs[spawnEnvs.length - 1];
        ok('…and the process really got that account\'s directory',
            env.CLAUDE_CONFIG_DIR === 'D:/slots/claude-work');

        const host2 = newHost();
        const id2 = host2.start(init({ account: MACHINE_ACCOUNT }));
        ok('a card pinned to the machine\'s own sign-in records THAT, not a blank',
            host2.get(id2).account === MACHINE_ACCOUNT);
        ok('‼️ …and nothing is injected for it, which is what the main sign-in IS',
            spawnEnvs[spawnEnvs.length - 1].CLAUDE_CONFIG_DIR === undefined);
    }

    // ---------- changing it mid-session: the promise ----------
    {
        const host = newHost();
        const id = host.start(init({ resume: 'S-A', account: 'claude-work' }));
        const done = host.setAccount(id, 'claude-other');
        ok('the switch is accepted', done.ok === true);
        ok('‼️ …and NOTHING is re-spawned at the moment of choosing',
            host.get(id).account === 'claude-work' && host.get(id).accountNext === 'claude-other');
        ok('…the card says so, rather than leaving the reader to hover',
            host.get(id).messages.some(m => m.role === 'system' && /next message runs on/.test(m.text)));

        // picking the one that is already running takes the promise back
        ok('choosing what is already sealed is accepted and promises nothing',
            host.setAccount(id, 'claude-other').ok === true);
    }

    // ---------- …and the promise is KEPT on the next message ----------
    {
        const host = newHost();
        const id = host.start(init({ resume: 'S-B', account: 'claude-work' }));
        host.get(id).costUSD = 1.25;
        host.get(id).turns = 4;
        host.get(id).tokens = 900;
        host.setAccount(id, MACHINE_ACCOUNT);
        const before = spawned;
        const r = host.send(id, 'carry on');
        ok('the message is not lost, it is waiting for the new process', r.queued === true);
        // the swap waits for the CLI's registry to let the id go, then resumes
        await new Promise(res => setTimeout(res, 700));
        ok('‼️ the same conversation came back up — one card, not two',
            host.list().length === 1);
        const s = host.get(id);
        ok('…on the account that was asked for', s.account === MACHINE_ACCOUNT && !s.accountNext);
        ok('…by RESUMING it, so nothing that was said is lost',
            s.sessionId === 'S-B' && s.resumed === true);
        ok('…in a new process', spawned > before);
        ok('‼️ …and the conversation did not get cheaper for changing account',
            s.costUSD === 1.25 && s.turns === 4 && s.tokens === 900);
        const argv = spawnArgv[spawnArgv.length - 1].join(' ');
        ok('…which is `--resume <id>` and nothing more clever than that',
            /--resume/.test(argv) && /S-B/.test(argv));
        ok('…spawned with the new account\'s environment, not the old one\'s',
            spawnEnvs[spawnEnvs.length - 1].CLAUDE_CONFIG_DIR === undefined);
    }

    // ---------- what it refuses, and says so ----------
    {
        const host = newHost();
        const fresh = host.start(init({}));
        const no = host.setAccount(fresh, 'claude-work');
        ok('‼️ a session with no id yet cannot be resumed, and is told so NOW',
            no.ok === false && /has not reported its id/.test(no.note));

        const blank = host.setAccount(fresh, '');
        ok('a blank is refused: the machine\'s own sign-in has a name of its own',
            blank.ok === false && blank.note.length > 20);

        const gone = host.setAccount('nosuch', 'claude-work');
        ok('a card that is not open here is refused rather than crashed', gone.ok === false);

        host.close(fresh);
        const dead = host.setAccount(fresh, 'claude-work');
        ok('an ended card says to resume it instead of pretending to switch',
            dead.ok === false && /resume it/.test(dead.note));
    }

    // ---------- a per-turn engine has nothing to re-seal ----------
    {
        const host = newHost();
        const id = host.start(init({ engine: 'codex', account: 'codex-a' }));
        const done = host.setAccount(id, 'codex-b');
        ok('‼️ on a per-turn engine the change is simply TRUE — no pending state',
            done.ok === true && host.get(id).account === 'codex-b' && !host.get(id).accountNext);
        ok('…and it says why nothing had to be interrupted',
            host.get(id).messages.some(m => /new process per turn/.test(m.text)));
    }

    // ---------- the totals a re-seal hands forward ----------
    {
        const s = {
            costUSD: 2.5, tokens: 100, wTokens: 40, turns: 3,
            contextTokens: 12, contextWindowTokens: 200
        };
        const c = carryOn(s);
        ok('the running totals are the baseline the next process starts from',
            c.costUSD === 2.5 && c.tokens === 100 && c.wTokens === 40 && c.turns === 3
            && c.contextTokens === 12 && c.contextWindowTokens === 200);
        ok('…and a figure nobody has is left out rather than sent as zero',
            carryOn({ costUSD: 0, tokens: 0, wTokens: 0, turns: 0 }).contextTokens === undefined);
    }

    // ---------- the old process is watched out, not assumed away ----------
    {
        // the CLI's registry never lets go: the resume would be refused, so it
        // is not attempted and the reader is told what to do about it
        const host = newHost(() => 9191);
        const id = host.start(init({ resume: 'S-C', account: 'claude-work' }));
        host.setAccount(id, 'claude-other');
        host.send(id, 'carry on');
        await new Promise(res => setTimeout(res, 6000));
        const s = host.get(id);
        ok('‼️ a process that will not let go is REPORTED, never resumed over',
            s.status === 'error'
            && s.messages.some(m => m.role === 'error' && /still holding this session/.test(m.text)));
        ok('…and the reader is told nothing was lost',
            s.messages.some(m => /Nothing was lost/.test(m.text)));
    }

    // ---------- X-214: a TERMINAL resume names its account too ----------
    //
    // ‼️ The Console half of this family is driven above against a real host.
    // The terminal half is a VS Code command and a QuickPick, which cannot be;
    // what CAN be pinned is that the layer reaches the terminal at all, because
    // its absence was the whole defect — this door passed `undefined` where
    // every other door passes an account layer, so a resumed conversation ran
    // as whatever the window happened to hold.
    {
        const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
        const has = (t) => ext.includes(t);
        ok('‼️ X-214: the terminal resume carries an account layer — it used to carry none',
            has('const account = await pickResumeAccount(engine, ')
            && has('launchAccountEnv({ engine, account }),'));
        ok('…and cancelling the picker opens NOTHING, rather than guessing',
            has('if (account === undefined) { return; }'));
        ok('the standing account is the first row, so Enter does what the machine would have',
            has('const first = mine.filter(r => r.id === standing);')
            && has('showQuickPick([...first, machine, ...rest]'));
        ok('‼️ …and no question is asked where there is no choice: no axis, or nothing captured',
            has("if (!canIsolateAccounts(engine)) { return ''; }")
            && has('if (!slots.length) { return MACHINE_ACCOUNT; }'));
        ok('DENSITY — the figure the choice turns on is on the row, not a click away',
            has('% of the 5-hour window used')
            && has('nothing has measured this account'));
        ok('the same swap is on the bridge, so an unattended runner can make it too',
            has("op: 'console.setAccount'"));
    }

    await tick();
}

main().then(() => {
    cp.spawn = realSpawn;
    cp.exec = realExec;
    cp.execSync = realExecSync;
    cp.execFile = realExecFile;
    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
}, e => {
    console.log('  FAIL threw: ' + (e && e.stack || e));
    process.exit(1);
});
