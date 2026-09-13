// X-260 (2/n) — A TURN THE HEADLESS SERVICE FIRES SPENDS THE SIGN-IN THAT WAS
// WRITTEN ON IT.
//
// ‼️ THE MEASUREMENT THAT CORRECTS THE ONE THIS ITEM WAS PAUSED ON. It was left
// open as a POLICY question — "whose plan pays for a turn fired while VS Code is
// closed" — on a reading of `src/core/automation.ts`, which is the trigger's
// PRECONDITION module and has never carried a route of any kind. It is not
// where the answer lives. `FarmSchedule extends RunDimensions` and a trigger's
// `{ kind: 'task' }` action does too (src/core/tasks.ts), so `account` is
// already written on a schedule when the user makes one, already persisted into
// farm-tasks.json, and already honoured by the extension's own runner.
//
// So there was nothing to decide. What was missing was one hop: the service
// read the file, dropped the field on the floor, and spawned with NO
// environment at all — whichever sign-in the machine happened to hold paid, off
// the rotation and unattributable. This pins the hop.
//
//   · A NAMED SIGN-IN PAYS. The id on the item resolves to its slot directory.
//   · AN UNNAMED ONE FALLS TO THE STANDING CHOICE — the same order the
//     extension uses (`resolveAccount`), not a second policy for the night.
//   · AND A NAME THAT RESOLVES TO NOTHING REFUSES THE RUN. Falling through to
//     the main sign-in is exactly the silent wrong spend this item is about; at
//     3 a.m. with nobody watching it is worse, not better.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const {
    headlessAccountPlan, MACHINE_ACCOUNT
} = require(path.join(__dirname, '..', 'out', 'core', 'accountStore.js'));

const CFG = {
    accounts: [
        { id: 'claude-gece', engine: 'claude', dir: 'D:/slots/gece', label: 'Gece' },
        { id: 'claude-gunduz', engine: 'claude', dir: 'D:/slots/gunduz' },
        { id: 'codex-is', engine: 'codex', dir: 'D:/slots/codex-is' }
    ],
    activeAccounts: { claude: 'claude-gunduz' }
};

// ---------- the sign-in written on the item ----------
{
    const p = headlessAccountPlan({ engine: 'claude', account: 'claude-gece' }, CFG);
    ok('‼️ the account the user wrote on the schedule is the one that pays',
        p.account === 'claude-gece' && p.refusal === '');
    ok('…and it pays by being a DIRECTORY, which is the only thing that isolates one',
        p.env.CLAUDE_CONFIG_DIR === 'D:/slots/gece');
}

// ---------- nobody wrote one ----------
{
    // ‼️ NOT A NEW POLICY FOR THE NIGHT. This is `resolveAccount`'s own order —
    // stated, then standing — so a run fired at 3 a.m. lands on the same
    // sign-in the same schedule would have landed on had VS Code been open.
    // Two orders would disagree the first time one of them was changed.
    const p = headlessAccountPlan({ engine: 'claude' }, CFG);
    ok('‼️ an item that names none falls to the STANDING choice, exactly as the '
        + 'extension resolves it', p.account === 'claude-gunduz'
        && p.env.CLAUDE_CONFIG_DIR === 'D:/slots/gunduz');

    const bare = headlessAccountPlan({ engine: 'claude' }, { accounts: CFG.accounts });
    ok('…and with no standing choice either, nothing is injected and the machine '
        + 'sign-in answers — byte for byte what this service did before',
        bare.account === '' && Object.keys(bare.env).length === 0 && bare.refusal === '');
}

// ---------- a name that resolves to nothing ----------
{
    // ‼️ THE WHOLE POINT. A slot the user deleted, or a config the service has
    // not been handed yet, must STOP the run. Falling through would spend a
    // window on a plan nobody chose and record it as the one they did — with
    // nobody at a window to notice.
    const p = headlessAccountPlan({ engine: 'claude', account: 'silinmis' }, CFG);
    ok('‼️ an account that is not on this machine REFUSES the run by name',
        /silinmis/.test(p.refusal));
    ok('…and injects nothing, so a refused run cannot half-happen',
        Object.keys(p.env).length === 0);

    const wrongEngine = headlessAccountPlan({ engine: 'claude', account: 'codex-is' }, CFG);
    ok('‼️ …and so does a sign-in belonging to a DIFFERENT engine — the variable '
        + 'would be set and unread, which is the silent case',
        /codex/.test(wrongEngine.refusal) && Object.keys(wrongEngine.env).length === 0);

    // The service being handed no account table at all is a service that cannot
    // honour a named sign-in — and must say so rather than run anyway.
    const noTable = headlessAccountPlan({ engine: 'claude', account: 'claude-gece' }, {});
    ok('‼️ a named sign-in with no account table handed to the service is refused too',
        noTable.refusal !== '' && Object.keys(noTable.env).length === 0);
}

// ---------- the machine's own sign-in, stated outright ----------
{
    // X-211's sentinel travels here too: it is a STATEMENT of nothing and it
    // outranks the standing choice, which is the only way "run this one on the
    // machine account" can be said at all once a standing choice exists.
    const p = headlessAccountPlan({ engine: 'claude', account: MACHINE_ACCOUNT }, CFG);
    ok('‼️ @machine outranks the standing choice and REMOVES the variable',
        p.account === '' && p.refusal === '' && p.env.CLAUDE_CONFIG_DIR === null);
}

// ---------- an engine this service cannot spawn ----------
{
    // The service runs `claude` and nothing else today. Resolving a codex slot
    // for it would set a variable the spawned process never reads while every
    // record claimed the run was on that plan — so the engine is part of the
    // question, not a detail beside it.
    const p = headlessAccountPlan({ engine: 'codex', account: 'codex-is' }, CFG);
    ok('the plan is resolved for the item\'s OWN engine, not for claude',
        p.env.CODEX_HOME === 'D:/slots/codex-is' && p.refusal === '');
}

// ---------- ‼️ AND THE SERVICE ACTUALLY CALLS IT ----------
{
    // ‼️ THE FAILURE THIS BLOCK EXISTS FOR IS THE ONE X-251 JUST FOUND: a
    // resolver that takes the right argument and NOBODY PASSES ONE. The pure
    // function above can be perfect while the spawn goes on inheriting whatever
    // the machine holds, and every test would stay green — the file cannot say
    // otherwise, because every slot's projects folder is a junction onto one
    // shared root. So the wire is read here, at both call sites.
    const fs = require('fs');
    const svc = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'service', 'farmService.ts'), 'utf8');

    ok('the service asks the shared resolver rather than spelling the variable',
        /headlessAccountPlan\(/.test(svc) && !/CLAUDE_CONFIG_DIR/.test(svc));
    ok('‼️ …and the spawn is GIVEN the environment — this used to be the whole bug',
        /env: envForRun\(plan\)/.test(svc));
    ok('‼️ a refused sign-in stops the run before a task record is made',
        /if \(plan\.refusal\)[\s\S]{0,200}return false;/.test(svc));
    ok('the SCHEDULE hands its own axes on', /\{ account: s\.account, engine: s\.engine \}/.test(svc));
    ok('…and so does the TRIGGER action — two doors, and one of them missing is '
        + 'half a fix that reads as a whole one',
        /\{ account: t\.action\.account, engine: t\.action\.engine \}/.test(svc));
    ok('the run\'s own report names the sign-in that paid, because the transcript cannot',
        /- Account: \$\{plan\.account/.test(svc));

    // The table is the half the service cannot get for itself: an account is a
    // config DIRECTORY and the id→directory map lives in VS Code settings.
    const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    ok('‼️ the extension writes the sign-in table into service-config.json',
        /accounts: storedAccounts\(\),\s*\n\s*activeAccounts: activeAccounts\(\)/.test(ext));
    ok('‼️ …and rewrites it when the sign-ins move, or a slot captured this '
        + 'afternoon would be refused tonight for a reason that stopped being true',
        /affectsConfiguration\('agentFarm\.accounts'\)[\s\S]{0,240}writeServiceConfig\(\)/.test(ext));

    /* ---------------------------------------------------------------------
     * ‼️ X-296 — AND THE OTHER RUNNER ASKS THE SAME THING, which is the half
     * this item shipped without.
     *
     * The refusal above was built for the night and stated as doctrine — "a
     * name that resolves to nothing refuses the run rather than falling
     * through to the main sign-in". The extension's own runner did fall
     * through: `accountEnv` answers `{}` for a slot it cannot find, `{}` is no
     * variable, and no variable is the machine's own sign-in. So ONE task,
     * naming ONE deleted account, spent the named plan or a stranger's
     * depending on whether a VS Code window happened to be open — the exact
     * disagreement the service's own comment says must not exist ("two orders
     * would disagree the first time one of them was changed").
     *
     * It is a HOLD there rather than a skip, and that difference is the only
     * one allowed: the board can carry a sentence and release the run when the
     * sign-in comes back, and the night cannot.
     * ------------------------------------------------------------------- */
    const tasks = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'tasks.ts'), 'utf8');
    ok('‼️ X-296 — the extension\'s runner asks before it spawns, at the last gate',
        /const accountNo = this\.opts\.accountBlock\?\.\(task\.engine \?\? 'claude', task\.account\);/.test(tasks)
        && /if \(accountNo\) \{/.test(tasks));
    ok('…and it is asked inside `launchBlock`, so the answer is a row the reader '
        + 'can see rather than a spawn that never says anything',
        tasks.indexOf('private launchBlock(task: FarmTask)') > 0
        && tasks.indexOf('const accountNo = this.opts.accountBlock')
        > tasks.indexOf('private launchBlock(task: FarmTask)'));
    ok('‼️ …the code names the ACCOUNT, so several runs waiting on one missing '
        + 'sign-in are one piece of news and one capture releases them all',
        /code: `account:missing:\$\{\(task\.account \?\? ''\)\.trim\(\) \|\| task\.engine \|\| 'claude'\}`/.test(tasks));
    ok('‼️ …and it is wired to the SAME two lines the service runs, resolve then '
        + 'refuse — not a second order that agrees today',
        /accountBlock: \(engine, account\) =>\s*\n\s*accountRefusal\(launchAccountFor\(engine, account\), storedAccounts\(\), engine\)/.test(ext));
    // The resolution has to come FIRST in both, and not only for tidiness: it
    // is what catches a STANDING choice left pointing at a slot that is gone,
    // which a settings file carried over from another machine can do alone.
    ok('…both resolve before they refuse, which is what catches a dead STANDING '
        + 'choice as well as a dead named one',
        /const id = resolveAccount\(stated, engine, active\);\s*\n\s*const refusal = accountRefusal\(id, list, engine\);/
            .test(fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'accountStore.ts'), 'utf8')));

    /* ---------------------------------------------------------------------
     * ‼️ X-296 — AND FORGETTING ONE NAMES EVERYTHING THAT POINTS AT IT.
     *
     * `accountReferences` answered "what am I about to break" with the runs
     * already on the board — tasks and console sessions — and said nothing
     * about the runs that do not exist yet. A nightly schedule saved on this
     * sign-in was never mentioned in the dialog that deletes it.
     * ------------------------------------------------------------------- */
    for (const [what, re] of [
        ['schedules', /for \(const s of taskManager\.schedules\)/],
        ['templates', /for \(const tp of taskManager\.templates\)/],
        ['workflow steps', /for \(const st of w\.steps\)/],
        ['triggers', /\(act\.kind === 'task' \|\| act\.kind === 'dispatch'\) && act\.account === slotId/],
        ['launch profiles', /for \(const p of launchProfiles\(\)\)/]
    ]) {
        ok(`‼️ forgetting a sign-in names the ${what} that carry it`, re.test(ext));
    }
}

/* =========================================================================
 * ‼️ X-296 — AND THE HOLD ITSELF, RUN RATHER THAN READ.
 *
 * The source pins above say the wire is there; this says what a task actually
 * does with it. Both halves are needed and the second is the one that would
 * have caught the original defect: the old code had no wire to grep for and
 * every string test in the suite passed.
 * ========================================================================= */
{
    const fs2 = require('fs');
    const os = require('os');
    const Module = require('module');
    const origLoad = Module._load;
    Module._load = function (request, parent, isMain) {
        if (request === 'vscode') {
            return {
                EventEmitter: class { get event() { return () => ({ dispose() { } }); } fire() { } dispose() { } },
                Disposable: { from: () => ({ dispose() { } }) },
                window: {
                    showInformationMessage: () => Promise.resolve(undefined),
                    showWarningMessage: () => Promise.resolve(undefined),
                    createTerminal: () => ({ show() { }, sendText() { }, dispose() { } }),
                    onDidCloseTerminal: () => ({ dispose() { } })
                }
            };
        }
        return origLoad.call(this, request, parent, isMain);
    };
    const { TaskManager } = require(path.join(__dirname, '..', 'out', 'core', 'tasks.js'));
    Module._load = origLoad;

    const tmp = fs2.mkdtempSync(path.join(os.tmpdir(), 'af-acctgate-'));
    const agentDir = path.join(tmp, 'agent');
    fs2.mkdirSync(agentDir, { recursive: true });
    const agent = { id: 'a1', name: 'developer', dir: agentDir };
    // The stand-in IS the extension's wire: the two lines the service runs,
    // over a machine holding exactly one sign-in.
    const here = ['claude-aicozums'];
    const m = new TaskManager(path.join(tmp, 'gate.json'), () => [agent], () => false, () => '', {
        isRunner: () => true,
        accountBlock: (engine, account) => {
            const id = String(account || '').trim();
            if (!id) { return undefined; }
            return here.includes(id) ? undefined
                : `No account "${id}" is stored on this machine — it may have been forgotten.`;
        }
    });

    const gone = m.addTask(agent, 'gece işi', 'devam', 'headless', { account: 'claude-silinmis' });
    const block = m.launchBlock(gone);
    ok('‼️ a run naming a sign-in that is not here does NOT start', !!block);
    ok('…and the row says which sign-in, by name',
        !!block && /claude-silinmis/.test(block.reason));
    ok('‼️ …the code is the ACCOUNT, so two runs on one dead sign-in are one hold',
        !!block && block.code === 'account:missing:claude-silinmis');

    // ‼️ A HOLD, not a failure — which is the whole difference from the night's
    // version and the reason this may be applied while somebody is watching.
    m.startTask(gone);
    ok('‼️ …and it is HELD, not failed — the work survives the sign-in coming back',
        gone.status === 'queued');
    here.push('claude-silinmis');
    ok('…so capturing the sign-in again releases it, with nothing else touched',
        m.launchBlock(gone) === undefined);

    const named = m.addTask(agent, 'iş', 'devam', 'headless', { account: 'claude-aicozums' });
    ok('a run naming a sign-in that IS here is not touched by any of this',
        m.launchBlock(named) === undefined);
    const silent = m.addTask(agent, 'iş', 'devam', 'headless', {});
    ok('‼️ …and a run naming NONE is not refused — an empty account means the '
        + 'standing choice answers, which is what every run written before '
        + 'accounts existed means',
        m.launchBlock(silent) === undefined);
    // ‼️ …and the fleet's reading of it names a PERSON, which no other hold in
    // the table does: nothing finishing and no minute passing brings a deleted
    // sign-in back, so a row that read like a queue would be a lie about who is
    // being waited for.
    const { TASK_WAIT_RULES } = require(path.join(__dirname, '..', 'out', 'core', 'waits.js'));
    const rule = TASK_WAIT_RULES.find(r => block && block.code.indexOf(r.prefix) === 0);
    ok('‼️ the hold reads as waiting for a HAND, and names the door that ends it',
        !!rule && rule.clearedBy === 'human' && rule.op === 'accounts.capture');

    m.dispose();
    try { fs2.rmSync(tmp, { recursive: true, force: true }); } catch { /* a temp dir never fails a run */ }
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
