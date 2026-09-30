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
/** …and the children themselves, so a test can END A TURN — the only way to
 *  reach the code that releases a HELD message (see the queued-message case). */
const children = [];
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
    children.push(child);
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
        // ‼️ X-282 — a dead id says so: it used to read as one more account.
        ok('‼️ an id that names no stored slot is marked, not shown as a bare id or a blank',
            /not on this machine/.test(statedAccountLabel('claude-gone', list))
            && /claude-gone/.test(statedAccountLabel('claude-gone', list)));
        // ‼️ K-41 — …AND A POLICY IS NOT AN ID THAT NAMES NO SLOT. It names no
        // slot BY DESIGN: it is the rule that picks one. Sent into `findSlot` it
        // came back through the X-282 branch as `⚠ not on this machine:
        // @emptiest` — a deleted-account warning drawn over a session running
        // perfectly on a rule the user had just chosen (measured on a live card,
        // e45a1888). Every built-in and every named rule reads as itself.
        ok('‼️ K-41 — a smart policy is its own name, never a missing account',
            statedAccountLabel('@emptiest', list) === '@emptiest'
            && statedAccountLabel('@round-robin', list) === '@round-robin'
            && statedAccountLabel('@pool', list) === '@pool');
        ok('…and so is a rule the user named themselves',
            statedAccountLabel('@Gece', list) === '@Gece');
        ok('‼️ …and NO policy picks up the missing-account mark',
            !/not on this machine/.test(
                ['@emptiest', '@round-robin', '@pool', '@Gece']
                    .map(p => statedAccountLabel(p, list)).join(' ')));
        // The sentinel is an '@' too and is NOT a policy — it has its own words,
        // and a fix that swept every '@' into "a rule" would have lost them.
        ok('…while the machine\'s own sign-in keeps its own words',
            statedAccountLabel(MACHINE_ACCOUNT, list) === MACHINE_GLOBAL);
        // A policy that names no stored rule is NOT judged here: this function
        // has no rule list, and inventing one would be the second half of the
        // same mistake. The typo is refused at the door it was typed into.
        ok('…and a rule nobody has defined is still shown, not accused',
            statedAccountLabel('@nosuchrule', list) === '@nosuchrule');
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

    // ---------- …and a HELD message keeps the promise too ----------
    //
    // ‼️ The gap this family shipped with: `send` kept the promise for a message
    // said into an idle card, but a message PARKED while a turn was running is
    // released somewhere else entirely — straight down the pipe of the process
    // the conversation is leaving, with the card still saying the swap was
    // pending. The reader would have been told the next message runs on the
    // other sign-in and then watched it spend the old one, with nothing on
    // screen saying so. A promise that fails silently is not a promise.
    {
        const host = newHost();
        const id = host.start(init({ resume: 'S-D', account: 'claude-work' }));
        const child = children[children.length - 1];
        host.send(id, 'start a long one');
        ok('a turn is running, so the next message is one that can be held',
            host.get(id).status === 'working');
        host.setAccount(id, MACHINE_ACCOUNT);
        const r = host.send(id, 'and this one on the other account', true);
        ok('the held message is parked rather than said into the running turn',
            r.queued === true && host.get(id).queued.length === 1);
        const before = spawned;
        // the turn ends — this is the only door to the release path
        child.stdout.emit('data', JSON.stringify({
            type: 'result', subtype: 'success', is_error: false, total_cost_usd: 0
        }) + '\n');
        await new Promise(res => setTimeout(res, 900));
        const s = host.get(id);
        ok('‼️ the released message RE-SEALED the session instead of spending the old account',
            spawned > before && s.account === MACHINE_ACCOUNT && !s.accountNext);
        ok('…on the same conversation, by --resume', s.sessionId === 'S-D');
        ok('…and it is said exactly once — the queue is not also replayed',
            s.messages.filter(m => m.role === 'user'
                && m.text === 'and this one on the other account').length === 1);
        ok('…leaving nothing held behind it', s.queued.length === 0);
        ok('…in a process carrying the new account\'s environment',
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
        // S-102 — the conversation's own sign-in leads when it is known; the
        // standing one only answers for a conversation nothing recorded.
        ok('the account the conversation ran on is the first row, else the standing one, so Enter continues as it was',
            has('const lead = own || standing;')
            && has('[...mine.filter(r => r.id === lead), machine, ...mine.filter(r => r.id !== lead)]')
            && has('showQuickPick(ordered,'));
        // ‼️ …and BOTH of those answer '' — nothing STATED. `@machine` is an
        // answer that CLEARS the config variable, and nobody was asked here, so
        // a terminal resume would have run as an identity the Console's own
        // spawn (which inherits) would not.
        ok('‼️ …and no question is asked where there is no choice: no axis, or nothing captured',
            has("if (!canIsolateAccounts(engine)) { return ''; }")
            && has("if (!slots.length) { return ''; }")
            && !has('if (!slots.length) { return MACHINE_ACCOUNT; }'));
        ok('DENSITY — the figure the choice turns on is on the row, not a click away',
            has('% of the 5-hour window used')
            && has('nothing has measured this account'));
        ok('the same swap is on the bridge, so an unattended runner can make it too',
            has("op: 'console.setAccount'"));
    }

    // ---------- ‼️ X-305 R2 — a RULE picked in a Console box is ONE slot ----------
    // Measured 2026-09-18: the composer pruned `@round-robin` to nothing and the
    // card started on the standing slot (at 100%); the live box kept the RULE
    // on the card, so every re-spawn could land somewhere else. A rule is now
    // turned into one slot at the moment it is picked, and the cursor moves once.
    {
        const commits = [];
        const ring = ['claude-a', 'claude-b'];
        let cursor = '';
        const pick = (engine, stated, agentId, model) => {
            if (stated === '@none') {
                return { id: '', note: '', refusal: '@none: every claude sign-in is at or past 90%.' };
            }
            if (stated === '@standing') { return { id: '', note: 'the main sign-in — @standing' }; }
            const at = ring.indexOf(cursor);
            const id = ring[(at + 1) % ring.length];
            cursor = id;
            commits.push({ engine, stated, agentId, model, id });
            return { id, note: `${id} — @round-robin: after ${at >= 0 ? ring[at] : 'nobody'}` };
        };
        const ruled = () => new ConsoleHost(
            () => 'claude', () => undefined,
            () => undefined, () => undefined, () => undefined,
            undefined, undefined, layer, undefined, pick);

        const host = ruled();
        const passed = host.pickAccount('claude', 'claude-work', 'dev');
        ok('a stated slot passes through pickAccount untouched, and nothing is committed',
            passed.id === 'claude-work' && !passed.refusal && commits.length === 0);
        const mach = host.pickAccount('claude', MACHINE_ACCOUNT, 'dev');
        ok('…and so does the machine\'s own sign-in — it is not a rule',
            mach.id === MACHINE_ACCOUNT && commits.length === 0);
        const first = host.pickAccount('claude', '@round-robin', 'dev', 'opus');
        ok('‼️ a rule becomes ONE slot, with the resolver\'s own sentence',
            first.id === 'claude-a' && /@round-robin/.test(first.note) && commits.length === 1);
        ok('…and the resolver is told the engine, the agent and the model it decides for',
            commits[0].engine === 'claude' && commits[0].agentId === 'dev' && commits[0].model === 'opus');
        const main = host.pickAccount('claude', '@standing', 'dev');
        ok('‼️ a rule answering "the main sign-in" is STATED as @machine, never a blank that falls through',
            main.id === MACHINE_ACCOUNT);
        const walled = host.pickAccount('claude', '@none', 'dev');
        ok('a rule that can choose nothing is a refusal with its reason, and no slot',
            walled.id === '' && /at or past 90%/.test(walled.refusal));

        const bare = newHost();
        const noHook = bare.pickAccount('claude', '@round-robin', 'dev');
        ok('a host given no resolver REFUSES a rule rather than guessing one',
            noHook.id === '' && /rule/.test(noHook.refusal));

        // the live box
        const live = host.start(init({ resume: 'S-R2', account: 'claude-a' }));
        const before = commits.length;
        const moved = host.setAccount(live, '@round-robin');
        ok('‼️ the live box accepts a rule…', moved.ok === true && commits.length === before + 1);
        ok('‼️ …and the card keeps the SLOT it chose, never the rule',
            host.get(live).accountNext === 'claude-b' && host.get(live).account === 'claude-a');
        ok('…and says which slot and why, on the card',
            host.get(live).messages.some(m => m.role === 'system'
                && /next message runs on claude-b \(claude-b — @round-robin/.test(m.text)));
        const refused = host.setAccount(live, '@none');
        ok('a rule that can choose nothing is refused on the live box, with its reason',
            refused.ok === false && /at or past 90%/.test(refused.note)
            && host.get(live).accountNext === 'claude-b');

        const unborn = host.start(init({}));
        const beforeUnborn = commits.length;
        const early = host.setAccount(unborn, '@round-robin');
        ok('‼️ a move that cannot happen does NOT advance the rotation',
            early.ok === false && /has not reported its id/.test(early.note) && commits.length === beforeUnborn);

        // the promise is kept on the slot, and the process is really sealed on it
        const r = host.send(live, 'carry on');
        ok('the message waits for the new process', r.queued === true);
        await new Promise(res => setTimeout(res, 700));
        const s = host.get(live);
        ok('‼️ the conversation came back up on the SLOT the rule chose',
            s.account === 'claude-b' && !s.accountNext
            && spawnEnvs[spawnEnvs.length - 1].CLAUDE_CONFIG_DIR === 'D:/slots/claude-b');
        ok('…and nothing re-resolved the rule on the way (one pick per choice)',
            commits.length === beforeUnborn);
    }

    // ---------- ‼️ X-305 R2 — the panel and the bridge use the same pick ----------
    {
        const blank = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        const panel = blank(fs.readFileSync(path.join(__dirname, '..', 'src', 'panels', 'consolePanel.ts'), 'utf8'));
        const ext = blank(fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8'));
        const pruned = panel.slice(panel.indexOf('private prunedAccount('), panel.indexOf('private accountShown('));
        ok('‼️ the composer KEEPS a rule this engine offers instead of pruning it to the standing slot',
            /if \(isPolicyId\(want\)\) \{\s*return \(this\.deps\.policiesFor\?\.\(engine\) \?\? \[\]\)\.some\(p => p\.id === want\) \? want : undefined;/.test(pruned));
        const startAt = panel.indexOf('const pick: { id: string; note: string; refusal?: string } = isPolicyId(started.account)');
        const hostStart = panel.indexOf('this.selected = host.start({', startAt);
        ok('‼️ the composer resolves the rule through the host before it starts the card',
            startAt > 0 && hostStart > startAt
            && /host\.pickAccount\(engine, started\.account, agent\.id, started\.model\)/.test(panel.slice(startAt, hostStart))
            && /if \(pick\.refusal\) \{\s*void this\.surface\.ask\.warn/.test(panel.slice(startAt, hostStart)));
        ok('…and starts it on the SLOT, not on what the box said',
            /account: pick\.id \|\| undefined,/.test(panel.slice(hostStart, hostStart + 1500)));
        const ctor = ext.slice(ext.indexOf('new ConsoleHost('), ext.indexOf('new ConsoleHost(') + 6000);
        ok('‼️ the host is handed the extension\'s one resolver, and it commits the round-robin cursor',
            /const r = launchAccountPick\(\{ engine, account: stated, agentId, model \}\);/.test(ctor)
            && /roundRobinKey\(engine\), r\.cursor/.test(ctor));
        const op = ext.slice(ext.indexOf("op: 'console.setAccount'"), ext.indexOf("op: 'console.answer'"));
        ok('‼️ the bridge\'s live switch knows the user\'s own rules, so @Night is not read as a typo',
            /accountRefusal\(account, storedAccounts\(\), engineOf\(row\?\.engine\)\.id, accountPolicies\(\)\)/.test(op));
    }

    // ---------- S-82: a card that asked to open a baton relay ----------
    {
        const host = newHost();
        const id = host.start(init({ account: 'claude-work' }));
        let fired = 0;
        host.onChange(x => { if (x === id) { fired++; } });
        host.wantRelay(id, { account: '@emptiest', maxLegs: 0 });
        ok('S-82: wantRelay marks the card with the RULE and its ceiling (0 kept, not dropped)',
            host.get(id).relayWanted && host.get(id).relayWanted.account === '@emptiest' && host.get(id).relayWanted.maxLegs === 0);
        ok('…and says so, so the extension can seal it the moment the id is known', fired >= 1);
        host.wantRelay(id, {});
        ok('…a start that named no rule and no ceiling is marked all the same', !!host.get(id).relayWanted
            && !('account' in host.get(id).relayWanted) && !('maxLegs' in host.get(id).relayWanted));
        host.wantRelay('no-such-seat', { account: '@x' });
        ok('…and an unknown seat is a no-op', host.get('no-such-seat') === undefined);
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
