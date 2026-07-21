// F1 follow-up: interrupted workflow runs surface in the Needs You queue
// with Resume/Dismiss actions and count as blocking (status-bar badge).
'use strict';
const path = require('path');
const { buildNeedsQueue, blockingCount } = require(path.join(__dirname, '..', 'out/core/needs.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const base = { liveSessions: [], approvals: [], insights: [], deferredTasks: [] };

{
    const items = buildNeedsQueue({
        ...base,
        interruptedRuns: [
            { runId: 'r1', workflowTitle: 'Sabah Zinciri', stepIndex: 1, stepTitle: 'analiz' },
            { runId: 'r2', workflowTitle: 'Video Hattı', stepIndex: 0, stepTitle: 'render' }
        ]
    });
    ok('two interrupted rows', items.filter(i => i.kind === 'interrupted').length === 2);
    const r1 = items.find(i => i.ref.runId === 'r1');
    ok('title names the workflow', r1.title.includes('Sabah Zinciri'));
    ok('detail names the cut step (1-based)', r1.detail.includes('step 2') && r1.detail.includes('analiz'));
    ok('actions are Resume + Dismiss', r1.actions.map(a => a.id).join(',') === 'resume-run,dismiss-run');
    ok('interrupted counts as blocking', blockingCount(items) === 2);
}

{
    const items = buildNeedsQueue({ ...base });
    ok('absent input -> no rows, nothing blocking', items.length === 0 && blockingCount(items) === 0);
}

{
    // Urgency: a permission wait still outranks an interrupted run.
    const items = buildNeedsQueue({
        ...base,
        liveSessions: [{
            sessionId: 's1', agentName: 'dev', status: 'waiting-permission',
            lastEventTs: Date.now(), transcriptPath: ''
        }],
        interruptedRuns: [{ runId: 'r1', workflowTitle: 'W', stepIndex: 0, stepTitle: 's' }]
    });
    ok('permission sorts above interrupted', items[0].kind === 'permission' && items[1].kind === 'interrupted');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
