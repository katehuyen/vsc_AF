// M-61 — the content calendar on Living and Needs You (src/core/calendarSignals.ts): one
// Living row for the calendar (overdue = warn, else the next one due), one Needs You row
// per overdue publish that opens its note or the workflow step that publishes it.
'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ROOT = path.resolve(__dirname, '..');
const origLoad = Module._load;
Module._load = function (r, p, m) { return r === 'vscode' ? {} : origLoad.call(this, r, p, m); };
const S = require(path.join(ROOT, 'out/core/calendarSignals.js'));
const N = require(path.join(ROOT, 'out/core/needs.js'));
const L = require(path.join(ROOT, 'out/core/living.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, a, b) => { const s = JSON.stringify(a) === JSON.stringify(b); ok(n, s); if (!s) { console.log('    got', JSON.stringify(a), 'want', JSON.stringify(b)); } };

const NOW = new Date(2026, 8, 27, 12, 0).getTime();
const e = (title, date, startTime, o) => ({ file: `C:\\cal\\${date} ${title}.md`, name: `${date} youtube - ${title}`, title, date, startTime, platform: 'youtube', status: 'planned', ...o });
const late1 = e('Kahve', '2026-09-25', '18:00', { status: 'ready' });
const late2 = e('Latte', '2026-09-27', '09:30', { platform: 'instagram' });
const next = e('Çay', '2026-09-29', '10:00');

const warn = S.publishSignals({ upcoming: [next], overdue: [late2, late1] }, NOW)[0];
ok('‼️ Living: overdue publishes are one warn row, the oldest first, how late each is, pointing at Needs You', warn.state === 'warn' && warn.label === '2 publishes are overdue'
    && /^"Kahve" \(youtube\) 42 h late · "Latte" \(instagram\) 3 h late$/.test(warn.detail) && warn.goto === 'needs' && warn.ageMs === NOW - new Date(2026, 8, 25, 18, 0).getTime());
const on = S.publishSignals({ upcoming: [next, e('Mocha', '2026-09-30')], overdue: [] }, NOW)[0];
ok('…nothing overdue = ok, with the next one due and how many this week', on.state === 'ok' && on.detail === 'next: "Çay" on youtube in 46 h · 2 due this week');
eq('…an empty calendar says nothing', [S.publishSignals({ upcoming: [], overdue: [] }, NOW), S.publishSignals(undefined, NOW)], [[], []]);

const flows = [{ id: 'w1', title: 'Dinamik', steps: [{ publish: { entry: '{input.note}' } }] },
    { id: 'w2', title: 'Haftalık yayın', steps: [{}, { publish: { entry: 'Kahve' } }] }];
eq('the publish step is found by a literal note name — a placeholder cannot say which note it is', [S.publishStepOf(late1, flows), S.publishStepOf(late2, flows)],
    [{ workflowId: 'w2', workflowTitle: 'Haftalık yayın', stepIndex: 1 }, undefined]);

const items = N.buildNeedsQueue({ liveSessions: [], approvals: [], insights: [], overduePublishes: [
    { entry: late1, lateMs: NOW - new Date(2026, 8, 25, 18, 0).getTime(), step: S.publishStepOf(late1, flows) }, { entry: late2, lateMs: 3 * 3_600_000 }] });
const k = items.find(i => i.title.startsWith('"Kahve"')), l = items.find(i => i.title.startsWith('"Latte"'));
ok('‼️ Needs You: a row per overdue publish, how late, its status and who publishes it', items.length === 2 && k.kind === 'publish-overdue'
    && k.title === '"Kahve" was due on youtube 42 h ago' && k.detail === '2026-09-25 18:00 · ready · published by "Haftalık yayın" step 2');
eq('…its buttons open the note and the step; with no step, Tasks', [k.actions.map(a => a.id), l.actions.map(a => a.id), k.ref], [['open-note', 'open-publish'], ['open-note', 'open-tasks'],
    { filePath: late1.file, workflowId: 'w2', stepIndex: 1 }]);
ok('…clearable, keyed by the note (the date moving ends it), not a blocker', N.isClearable(k) && N.needKey(k) === `publish-overdue|${late1.file}` && N.blockingCount(items) === 0);

const rep = L.buildLivingReport({ now: NOW, notices: [], queue: [], automations: [], duties: [], automationLog: [], checks: [], publishes: { upcoming: [], overdue: [late1] } });
ok('the Living report carries the calendar row', rep.signals.some(s => s.id === 'calendar' && s.state === 'warn'));

const ext = fs.readFileSync(path.join(ROOT, 'src/extension.ts'), 'utf8');
const page = fs.readFileSync(path.join(ROOT, 'media/needs.js'), 'utf8');
ok('the host feeds both pages from the calendar and answers the three buttons', /overduePublishes: calendarView\(readCalendar\(contentCalendarDir\(\)\)/.test(ext)
    && /publishes: calendarView\(readCalendar\(contentCalendarDir\(\)\)/.test(ext) && /case 'open-note':/.test(ext) && /case 'open-publish':/.test(ext) && /case 'open-tasks':/.test(ext));
ok('the Needs You page knows the kind', /'publish-overdue':\s*\{ icon:/.test(page));
console.log(`test_calendar_signals: ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
