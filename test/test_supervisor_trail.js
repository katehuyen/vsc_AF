// U-153 — the supervisor strip: one row per checkpoint visit (src/core/supervisorTrail.ts),
// the same rows on the Live Timeline, a run row's badge and workflows.supervisor.status.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const T = require(path.join(ROOT, 'out/core/supervisorTrail.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, a, b) => { const s = JSON.stringify(a) === JSON.stringify(b); ok(n, s); if (!s) { console.log('    got', JSON.stringify(a), 'want', JSON.stringify(b)); } };

/* ---------- the call a visit keeps ---------- */
const c = T.supervisorCall({ trigger: 'checkpoint', decision: { decision: 'jump', target: 's1', why: 'baştan', confidence: 0.7, patch: { prompt: 'x' } },
    model: 'haiku', limitsOrigin: 'step', supervisorOrigin: 'workflow', sessionId: 'sid1', at: 5 });
eq('a call keeps the decision, not its patch', c, { trigger: 'checkpoint', decision: 'jump', target: 's1', why: 'baştan', confidence: 0.7, model: 'haiku', limitsOrigin: 'step', supervisorOrigin: 'workflow', sessionId: 'sid1', at: 5 });
const m = T.supervisorCall({ trigger: 'woken by a failed step', mechanical: 'over budget', limitsOrigin: 'built-in', supervisorOrigin: 'built-in', at: 6 });
eq('a mechanical call carries no decision', [m.decision, m.mechanical, m.model], [undefined, 'over budget', undefined]);

/* ---------- SHORTHAND: every decision has its badge ---------- */
eq('‼️ the six badges', ['proceed', 'retry', 'jump', 'insert', 'ask_user', 'stop'].map(k => T.DECISION_BADGE[k]), ['✓', '↻', '⤳', '＋', '?', '■']);

/* ---------- the trail of one run ---------- */
const tasks = [
    { id: 't3', workflowRunId: 'r1', stepIndex: 3, title: 'c2', costUSD: 0.01, supervisorCall: m },
    { id: 't1', workflowRunId: 'r1', stepIndex: 1, title: 'c1', costUSD: 0.02, supervisorCall: c },
    { id: 't2', workflowRunId: 'r1', stepIndex: 2, title: 'step' },
    { id: 't9', workflowRunId: 'r2', stepIndex: 1, title: 'other', supervisorCall: c }
];
const tr = T.supervisorTrail('r1', tasks, undefined);
eq('rows of this run only, visits in time order, steps 1-based', tr.rows.map(r => [r.taskId, r.step, r.badge, r.word]), [['t1', 2, '⤳', 'jump s1'], ['t3', 4, '→', 'carried on the mechanical way — over budget']]);
eq('with no run record: calls counted off the rows, cost summed', [tr.calls, Math.round(tr.costUSD * 100)], [1, 3]);
const tr2 = T.supervisorTrail('r1', tasks, { supervisor: { calls: 4, costUSD: 0.5 }, live: { supervisor: { budgetUSD: 2 }, pause: true } });
eq('the run record says the calls and cost', [tr2.calls, tr2.costUSD], [4, 0.5]);
eq('…and its live settings come along, one line each', tr2.live.length, 2);
eq('a run with no visits has no rows', T.supervisorTrail('r3', tasks).rows, []);

/* ---------- the bridge and the surfaces ---------- */
const ext = fs.readFileSync(path.join(ROOT, 'src/extension.ts'), 'utf8');
const block = op => { const i = ext.indexOf(`op: '${op}'`); return i < 0 ? '' : ext.slice(i, ext.indexOf('\n        },', i)); };
ok('‼️ workflows.supervisor.status calls the manager', /taskManager\.supervisorStatus\(/.test(block('workflows.supervisor.status')));
ok('the live command takes the run it was opened from', /registerCommand\('agentfarm\.workflowLive', \(runId\?: unknown\)/.test(ext));
const tl = fs.readFileSync(path.join(ROOT, 'src/panels/timeline.ts'), 'utf8');
ok('the timeline opens a conversation by id, and the live settings', /msg\.sessionId/.test(tl) && /case 'workflowLive'/.test(tl));
ok('base.ts loads the strip', /'afSupervisorStrip\.js'/.test(fs.readFileSync(path.join(ROOT, 'src/panels/base.ts'), 'utf8')));
ok('the Runs row carries the trail row', /supervisor: trailRow\(/.test(fs.readFileSync(path.join(ROOT, 'src/panels/tasksPanel.ts'), 'utf8')));

/* ---------- the strip draws the rows it is given ---------- */
const ctx = { window: {}, console };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'media/afSupervisorStrip.js'), 'utf8'), ctx);
const S = ctx.window.AFSupervisorStrip;
eq('no trail, no section', S.section([{ title: 'x', steps: [] }]), '');
const html = S.section([{ title: 'Klip', supervisor: Object.assign({}, tr2, { running: true }) }]);
ok('one row per visit', (html.match(/class="svr"/g) || []).length === 2);
ok('‼️ a row with a conversation opens it at its moment', /data-svsession="sid1" data-ts="5"/.test(html));
ok('a row with none is not a button', (html.match(/data-svsession="/g) || []).length === 1);
ok('the head says the supervisor total and the live settings', /4 calls/.test(html) && /\$0\.5000/.test(html) && /svs-live/.test(html));
ok('a running run offers the live settings, an ended one does not', /data-svlive="r1"/.test(html)
    && !/data-svlive/.test(S.section([{ title: 'Klip', supervisor: Object.assign({}, tr2, { running: false }) }])));
ok('the why is escaped', !/<b>/.test(S.section([{ title: 'x', supervisor: T.supervisorTrail('r', [{ id: 'a', workflowRunId: 'r', title: 't', supervisorCall: Object.assign({}, c, { why: '<b>' }) }]) }])));

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
