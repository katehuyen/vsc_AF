// M-13 — the user's word on a supervised retry row outranks the supervisor's:
// run it now, let Smart Continue go ahead, or rewrite its prompt. One rule
// (retrySupervision.userSupervision), one manager method, one bridge op.
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const Module = require('module');
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') {
        const off = () => ({ dispose() { } });
        return {
            Uri: {}, window: { onDidCloseTerminal: off, onDidOpenTerminal: off, showWarningMessage: () => { } },
            ViewColumn: {}, ConfigurationTarget: { Global: 1 }, env: {},
            EventEmitter: class { constructor() { this.event = () => ({ dispose() { } }); } fire() { } dispose() { } },
            QuickPickItemKind: { Separator: -1 }, commands: { executeCommand: () => { } },
            workspace: { getConfiguration: () => ({ get: (_k, d) => d, update: async () => { } }) }
        };
    }
    return origLoad.apply(this, arguments);
};

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'out', 'core');
const T = require(path.join(OUT, 'tasks.js'));
const S = require(path.join(OUT, 'retrySupervision.js'));

console.log('\n== the rule ==');
{
    const open = { supervision: { state: 'pending' }, deferredCode: S.SUPERVISION_HOLD_CODE };
    ok('not supervised = refused', S.userSupervision({}, 'run').ok === false);
    ok('edit needs words', S.userSupervision(open, 'edit', '  ').ok === false);
    const e = S.userSupervision(open, 'edit', 'carry on from the red test');
    ok('edit rewrites and releases nothing', e.ok && !e.release && e.prompt === 'carry on from the red test');
    const d = S.userSupervision(open, 'deterministic');
    ok('deterministic while open closes the incident as fallback and releases', d.ok && d.release && d.state === 'fallback' && !d.clearWait);
    ok('…and while a decision held it for a person (nothing changed)', S.userSupervision({ supervision: { state: 'decided' }, deferredCode: S.SUPERVISION_ASK_CODE }, 'deterministic').ok);
    ok('‼️ …but NOT once a decision rewrote the row', S.userSupervision({ supervision: { state: 'decided' } }, 'deterministic').ok === false);
    const r = S.userSupervision({ supervision: { state: 'decided' } }, 'run', 'my words');
    ok('run drops the wait, on the words given', r.ok && r.release && r.clearWait && r.prompt === 'my words' && !r.state);
}

console.log('\n== the manager ==');
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-sup-answer-'));
    const agent = { id: 'a1', name: 'developer', dir };
    const tm = new T.TaskManager(path.join(dir, 'tasks.json'), () => [agent], () => false, () => '', {
        startConsoleTask: () => ({ sessionId: 'cs1-x' }), consoleTaskState: () => ({ state: 'working', answered: false })
    });
    const held = () => {
        const t = tm.addTask(agent, 'gece taraması (continue 1)', 'CONTINUE', 'interactive', { interactiveTarget: 'console', autoStart: false });
        t.supervision = { key: 'inc', state: 'pending', at: Date.now() + 3600e3, atWhy: 'after the reset', failedTask: 'x', calls: 0 };
        t.deferredCode = S.SUPERVISION_HOLD_CODE; t.deferredReason = 'waiting for the supervisor'; t.notBefore = Date.now() + 3600e3;
        return t;
    };
    const a = held();
    ok('a held row cannot simply be started', tm.startTask(a) === false && a.status === 'queued');
    const ed = tm.answerSupervision(a, 'edit', 'new words');
    ok('edit: the prompt changes, the row stays held', ed.ok && a.prompt === 'new words' && a.status === 'queued' && a.supervision.state === 'pending');
    const run = tm.answerSupervision(a, 'run');
    ok('‼️ run now: the wait is dropped and it starts', run.ok && run.started && a.status === 'running' && a.notBefore === undefined);
    ok('…and the incident is closed, so the supervisor is never asked for it', a.supervision.state === 'fallback' && tm.supervisionDue(Date.now() + 7200e3).indexOf(a) < 0);
    ok('…and the row says who decided', (a.events || []).some(e => /you ran it now/.test(e.note || '')));
    ok('a running row takes no word', tm.answerSupervision(a, 'run').ok === false);
    tm.cancelTask(a);
    const b = held();
    const det = tm.answerSupervision(b, 'deterministic');
    ok('deterministic: released as it was made, prompt unchanged', det.ok && b.prompt === 'CONTINUE' && b.supervision.state === 'fallback');
    tm.dispose();
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}

console.log('\n== one implementation: the op and the row call the manager ==');
{
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    const at = ext.indexOf("op: 'tasks.supervision'");
    ok('tasks.supervision is registered', at > 0);
    ok('…and calls answerSupervision', /taskManager\.answerSupervision\(/.test(ext.slice(at, at + 2500)));
    const panel = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'tasksPanel.ts'), 'utf8');
    ok('the row\'s buttons call the same method', /supRun[\s\S]{0,200}answerSupervision/.test(panel) && /supEdit[\s\S]{0,400}answerSupervision\(t, 'edit'/.test(panel));
    const page = fs.readFileSync(path.join(ROOT, 'media', 'tasksPage.js'), 'utf8');
    ok('the page draws them on a supervised row', /r\.supervised \? `<button[^`]*data-task="supRun"/.test(page));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
