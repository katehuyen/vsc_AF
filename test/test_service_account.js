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
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
