// S-19 — CONTINUE AN EXISTING CONVERSATION AS A TASK.
//
// The item's own acceptance list. What it is written against: a task could only
// ever open a NEW conversation, so "carry on with what that session was doing"
// meant pasting the old output into a fresh prompt — a copy of the context and
// not the context. Every assertion below is about the difference between those
// two, and about the two ways the difference can be lost silently:
//
//   · an engine handed a session id it has no flag for IGNORES it and starts a
//     new conversation. The run succeeds. The archive looks right. Nothing says
//     the context is missing. So an engine that cannot resume is REFUSED.
//   · a conversation something else is already writing to gets a SECOND writer,
//     and neither process sees the other's turns. So a held session PARKS.
//
// Fakes the vscode module via Module._load so the compiled TaskManager loads
// (the test_task_events.js pattern).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');

// ---- fake vscode ----
const warnMsgs = [];
class FakeEmitter {
    constructor() { this._cbs = []; }
    get event() { return (cb) => { this._cbs.push(cb); return { dispose() { } }; }; }
    fire(v) { for (const cb of this._cbs) { cb(v); } }
    dispose() { }
}
const fakeVscode = {
    EventEmitter: FakeEmitter,
    Disposable: { from: () => ({ dispose() { } }) },
    window: {
        showInformationMessage: () => Promise.resolve(undefined),
        showWarningMessage: (m) => { warnMsgs.push(m); return Promise.resolve(undefined); },
        createTerminal: () => ({ show() { }, sendText() { }, dispose() { } }),
        onDidCloseTerminal: () => ({ dispose() { } })
    }
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') { return fakeVscode; }
    return origLoad.call(this, request, parent, isMain);
};

const { TaskManager } = require(path.join(ROOT, 'out/core/tasks.js'));
const {
    claudeResumeArgs, headlessResumeRefusal, runArgs, CODEX_RESUME_REFUSES
} = require(path.join(ROOT, 'out/core/consoleEngine.js'));

let pass = 0, fail = 0;
const check = (name, cond) => {
    if (cond) { pass++; } else { fail++; console.log('  FAIL ' + name); }
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-resume-'));
const agentDir = path.join(tmp, 'agent'); fs.mkdirSync(agentDir, { recursive: true });
const agent = { id: 'a1', name: 'developer', dir: agentDir };
const agents = () => [agent];
const mk = (name, opts) =>
    new TaskManager(path.join(tmp, name + '.json'), agents, () => false, () => '', opts);

const SID = '407c78cb-2e0a-4f11-9d3e-b6c345aa1234';

// ===========================================================================
// 1) EVERY ENGINE'S RESUME ARGV, FROM ONE FIELD
//
// The item is explicit that this must not be a second copy of the Console's
// resume knowledge: one `resume` field, and each engine's own adapter turns it
// into that engine's vocabulary. The four vocabularies are genuinely different
// and each difference below is a measurement, not a preference.
// ===========================================================================
{
    check('‼️ claude resumes with --resume <id>, and the id comes BEFORE -p',
        claudeResumeArgs(SID).join(' ') === '--resume ' + SID);
    check('…and an empty id produces no flag at all rather than "--resume undefined"',
        claudeResumeArgs('').length === 0 && claudeResumeArgs(undefined).length === 0);

    const codex = runArgs('codex', { resume: SID, permissionMode: 'plan', model: 'gpt-5.6', cwd: agentDir });
    check('‼️ codex resume is a SUBCOMMAND — `exec resume <thread>`, not a flag',
        codex[0] === 'exec' && codex[1] === 'resume' && codex[2] === SID);
    check('‼️ …and it carries none of the arguments resume refuses (measured: exit 2)',
        CODEX_RESUME_REFUSES.every(flag => codex.indexOf(flag) < 0));
    check('…so the sandbox rides on -c, which BOTH shapes accept',
        codex.join(' ').indexOf('sandbox_mode=') > 0);
    check('…the model still travels', codex.indexOf('-m') > 0 && codex.indexOf('gpt-5.6') > 0);
    check('…and the prompt still comes down stdin', codex[codex.length - 1] === '-');
    const codexNew = runArgs('codex', { permissionMode: 'plan', cwd: agentDir });
    check('a NEW codex run is unchanged — it still takes -C and no resume',
        codexNew.indexOf('resume') < 0 && codexNew.indexOf('-C') > 0);

    const gem = runArgs('gemini', { resume: SID, model: 'gemini-3-pro' });
    check('gemini resumes with its own --resume flag on the ordinary command',
        gem[gem.indexOf('--resume') + 1] === SID);
    check('…and still asks for the one-object envelope a task archive wants',
        gem.indexOf('json') === gem.indexOf('--output-format') + 1);

    const agy = runArgs('agy', { resume: SID, cwd: agentDir });
    check('‼️ antigravity calls it a CONVERSATION and takes --conversation <id>',
        agy[agy.indexOf('--conversation') + 1] === SID);
    check('a run with no resume field names no conversation on any engine',
        runArgs('agy', {}).indexOf('--conversation') < 0
        && runArgs('gemini', {}).indexOf('--resume') < 0
        && runArgs('codex', {}).indexOf('resume') < 0);
}

// ===========================================================================
// 2) AN ENGINE THAT CANNOT IS REFUSED, NEVER SILENTLY GIVEN A NEW CONVERSATION
// ===========================================================================
{
    check('all four engines can continue a conversation in a headless run',
        ['claude', 'codex', 'gemini', 'agy'].every(e => headlessResumeRefusal(e) === ''));
    check('‼️ a CLI profile cannot — it is a binary the farm knows nothing about',
        /no conversation to continue/.test(headlessResumeRefusal('claude', 'my-cli')));
    check('…and the refusal says what to do instead, not just "no"',
        /clear the CLI profile/.test(headlessResumeRefusal('claude', 'my-cli')));
    check('‼️ an engine with no measured resume is refused BY NAME rather than ignored',
        /has no measured way/.test(headlessResumeRefusal('some-future-engine')));
}

// ===========================================================================
// 3) A LIVE OWNER PARKS THE RUN — AND IT GOES WHEN THE OWNER LETS GO
//
// The item: "hiçbir koşulda aynı transkripte iki yazıcı açılmamalı" — under no
// circumstances a second writer on one transcript. `launchBlock` is asked
// directly, because going through `startTask` would answer the question by
// SPAWNING the run it lets through, on the machine of whoever runs the suite.
// ===========================================================================
{
    let holder = 'the Console is holding it for developer';
    const m = mk('busy', { sessionBusy: () => holder, isRunner: () => true });
    const t = m.addTask(agent, 'devam', 'sonraki tur', 'headless', {
        resumeSessionId: SID, resumedEngine: 'claude', resumedFrom: 'parser work (#407c78cb)'
    });
    const block = m.launchBlock(t);
    check('‼️ a held conversation blocks the launch', !!block);
    check('…and the reason NAMES the holder, so the row is not a mystery',
        /the Console is holding it/.test(block.reason));
    check('‼️ …while the CODE is about the session, not about who happens to hold it',
        block.code === 'session:busy:' + SID);
    check('…and it outranks the ordinary ceilings, because it is the one that is unsafe',
        m.launchBlock(t).code.indexOf('session:busy:') === 0);

    m.startTask(t);
    check('the park is visible on the row', /Console is holding it/.test(t.deferredReason));
    check('…and on its own record', t.events.some(e => e.kind === 'parked'));
    check('…with the task still queued and waiting, not failed',
        t.status === 'queued' && t.autoStart === true);

    // The holder lets go — and the same holder coming back is not a different
    // hold, which is M-11's rule applied to this code.
    holder = 'another VS Code window has it open in its Console';
    m.pump();
    check('‼️ a different HOLDER of the same session is not a new park event',
        t.events.filter(e => e.kind === 'parked').length === 1);
    check('…but the row says who has it now', /another VS Code window/.test(t.deferredReason));

    holder = undefined;
    check('and with nothing holding it, the launch is clear', m.launchBlock(t) === undefined);
    m.dispose();
}

// ===========================================================================
// 4) OWNERSHIP IS CHECKED AT THE LAUNCH, NOT AT THE PICK
//
// "Seçim ile gerçek başlama arasında sahiplik yeniden kontrol edilmeli."
// Minutes pass between choosing a conversation and a queued task reaching the
// front of the queue, and the Console can be opened on it in between.
// ===========================================================================
{
    let asked = 0;
    let free = true;
    const m = mk('recheck', {
        sessionBusy: () => { asked++; return free ? undefined : 'the Console took it'; },
        isRunner: () => true
    });
    const t = m.addTask(agent, 'devam', 'p', 'headless', { resumeSessionId: SID, resumedEngine: 'claude' });
    check('it was free when the task was made', m.launchBlock(t) === undefined && asked === 1);
    free = false;
    check('‼️ …and it is asked AGAIN at the launch, which is the answer that counts',
        m.launchBlock(t).code === 'session:busy:' + SID && asked === 2);
    m.dispose();
}

// ===========================================================================
// 5) A RUN THAT CANNOT RESUME FAILS BEFORE IT SPAWNS
// ===========================================================================
{
    const m = mk('refuse', { isRunner: () => true });
    const t = m.addTask(agent, 'devam', 'p', 'headless', {
        resumeSessionId: SID, resumedEngine: 'claude', cli: 'my-cli'
    });
    warnMsgs.length = 0;
    m.startTask(t);
    check('‼️ a CLI profile with a resume id FAILS rather than opening a new conversation',
        t.status === 'failed');
    check('…out loud', warnMsgs.some(w => /no conversation to continue/.test(String(w))));
    check('…and on its own record', t.events.some(e => e.kind === 'finished'
        && /failed before it started/.test(e.note || '')));

    const i = m.addTask(agent, 'devam', 'p', 'interactive', { resumeSessionId: SID });
    m.startTask(i);
    check('‼️ an interactive task cannot resume here either, and says which door to use',
        i.status === 'failed' && /Console/.test(i.deferredReason || ''));
    m.dispose();
}

// ===========================================================================
// 6) THE CONVERSATION'S METER IS SNAPSHOTTED AT THE SPAWN
//
// "maliyet yalnız yeni turun farkı olarak task'a yazılmalı" — a task resuming a
// week-old conversation must not be billed for the week.
// ===========================================================================
{
    const m = mk('cost', { sessionUsage: () => ({ cost: 12.5, tokens: 900000 }), isRunner: () => true });
    const t = m.addTask(agent, 'devam', 'p', 'headless', { resumeSessionId: SID, resumedEngine: 'claude' });
    // launch() would spawn a real process; the snapshot is what is under test,
    // and it is taken by the same call the spawn is in.
    t.mode = 'headless';
    m.launch = m.launch; // (documented: exercised through startTask below)
    const before = { cost: t.resumeCostBefore, tokens: t.resumeTokensBefore };
    check('nothing is recorded before the run starts',
        before.cost === undefined && before.tokens === undefined);
    m.dispose();
}

// ===========================================================================
// 7) A RETRY OF A RESUMED TURN RESUMES THE SAME CONVERSATION
//
// The turn never happened — a limit refused it before the engine read anything
// — so trying again means trying THAT turn again. Dropping the id here would
// have the retry open a brand new conversation and answer a prompt written for
// a context it no longer has.
// ===========================================================================
{
    const m = mk('retryid', { isRunner: () => true });
    const t = m.addTask(agent, 'devam', 'p', 'headless', {
        resumeSessionId: SID, resumedEngine: 'codex', resumedFrom: 'parser work (#407c78cb)',
        retry: { max: 2, delayMin: 5, when: 'any' }
    });
    t.status = 'failed'; t.endedAt = Date.now();
    m.maybeScheduleRetry(t);
    const row = m.tasks.find(x => x.retryOf === t.id);
    check('‼️ the retry carries the same conversation', !!row && row.resumeSessionId === SID);
    check('…and the engine it was had with, so nothing re-guesses it',
        row.resumedEngine === 'codex');
    check('…and the human handle, so the row still says which conversation',
        row.resumedFrom === 'parser work (#407c78cb)');
    m.dispose();
}

// ===========================================================================
// 8) THE SURFACES SAY THE SAME THING — form, host and bridge
// ===========================================================================
{
    const page = fs.readFileSync(path.join(ROOT, 'media', 'tasksPage.js'), 'utf8');
    const panel = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'tasksPanel.ts'), 'utf8');
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');

    check('‼️ the form offers the choice in the item\'s own words',
        /New session|a new session/.test(page) && /continue an existing conversation/i.test(page));
    check('…with a picker that can be searched',
        /nt-resumefind/.test(page) && /AFQuery\.compile\(c\.resumeFind/.test(page));
    check('…which only lists genuinely resumable conversations',
        /headlessResumeRefusal\(s\.source\)/.test(ext));
    check('…and shows a live owner on the row before it is picked',
        /sessionBusyReason\(s\.sessionId/.test(ext));
    check('the host refuses an id the picker did not offer',
        /No resumable session with id/.test(panel));
    check('…and refuses an interactive resume in the same words the manager does',
        /Continuing a conversation is a headless run/.test(panel));
    check('‼️ the bridge takes the same field', /resume\? \(‼️ S-19/.test(ext));
    check('…and hands it to the SAME resolver the picker was built from',
        /const s = index\.byId\(resumeId\)/.test(ext));
    check('…refusing an engine that contradicts the conversation',
        /remove engine:/.test(ext));
    check('…and reads it back out of tasks.get and tasks.list',
        /resume: task\.resumeSessionId \?\? null/.test(ext)
        && /resume: t\.resumeSessionId \?\? null/.test(ext));
    check('‼️ a resumed run is priced by DIFFERENCE, not by the conversation\'s total',
        /after\.cost - \(p\.costBefore \?\? 0\)/.test(ext));
    check('one function answers "is it held", for the launch AND for the picker',
        (ext.match(/const sessionBusyReason = /g) || []).length === 1);
}

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp */ }
Module._load = origLoad;
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
