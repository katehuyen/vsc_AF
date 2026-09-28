// X-53 — two waits only a page could answer, now answered over the bridge too:
// a Needs You row's buttons (needs.act) and a workflow select step (workflows.select).
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { planNeedAct, NEED_LOOK_ACTIONS } = require(path.join(ROOT, 'out/core/needsAct.js'));
const { needKey } = require(path.join(ROOT, 'out/core/needs.js'));
const { SelectionWaits, selectionRefusal, urlsOfPicks } = require(path.join(ROOT, 'out/core/selectionWaits.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const row = (kind, ref, ids) => ({ urgency: 0, kind, agentName: 'a', title: 't', detail: 'd', ts: 1, ref, actions: ids.map(id => ({ id, label: id })) });
const approval = row('browser-approval', { approvalId: 'ap1' }, ['approve', 'reject', 'open-tasks']);
const mission = row('mission', { missionRunId: 'm1' }, ['mission-answer', 'open-missions']);
const question = row('question', { questionId: 'q1' }, ['wq-text']);
const items = [approval, mission, question];

{
    const p = planNeedAct(items, needKey(approval), 'approve');
    ok('a real button on a real row is planned with its row', !p.error && p.item === approval && p.action === 'approve' && p.answer === undefined);
    ok('an unknown key is refused and points at needs.list', /needs\.list/.test(planNeedAct(items, 'browser-approval|zz', 'approve').error));
    ok('a button the row does not carry is refused, naming the ones it does', /approve, reject, open-tasks/.test(planNeedAct(items, needKey(approval), 'permission-allow').error));
    ok('‼️ a button that only opens a view is refused with the op to read instead', /tasks\.list/.test(planNeedAct(items, needKey(approval), 'open-tasks').error));
    ok('every view button names where to read it', Object.values(NEED_LOOK_ACTIONS).every(v => typeof v === 'string' && v.length > 3));
    ok('‼️ a typed answer is required where the press would open an input box', /answer/.test(planNeedAct(items, needKey(mission), 'mission-answer').error)
        && /answer/.test(planNeedAct(items, needKey(question), 'wq-text', '   ').error));
    const t = planNeedAct(items, needKey(mission), 'mission-answer', ' go on ');
    ok('…and carried, trimmed, when given', !t.error && t.answer === 'go on');
}

(async () => {
    const ask = {
        title: 'Pick', message: 'keep two', min: 1, max: 2,
        candidates: [1, 2, 3].map(n => ({ taskId: 't' + n, title: 'c' + n, url: 'https://x/' + n, kind: 'image' }))
    };
    const w = new SelectionWaits();
    const a = w.add(ask, 1000);
    ok('an open selection is listed with its id and when it was asked', w.list().length === 1 && w.get(a.id).askedAt === 1000);
    ok('picks are 1-based candidate numbers', JSON.stringify(urlsOfPicks(ask, [1, 3])) === '["https://x/1","https://x/3"]');
    ok('…and a number naming no candidate is refused', urlsOfPicks(ask, [0]) === undefined && urlsOfPicks(ask, [4]) === undefined);
    ok('‼️ the page\'s own count rule holds on the bridge: too few, too many', /at least 1/.test(selectionRefusal(ask, []))
        && /at most 2/.test(selectionRefusal(ask, ['https://x/1', 'https://x/2', 'https://x/3'])));
    ok('…a stranger and a duplicate are refused', /not one of its candidates/.test(selectionRefusal(ask, ['https://y']))
        && /twice/.test(selectionRefusal(ask, ['https://x/1', 'https://x/1'])));
    ok('…and a fitting choice passes', selectionRefusal(ask, ['https://x/2']) === undefined);
    ok('max 0 means no upper bound', selectionRefusal({ ...ask, max: 0 }, ['https://x/1', 'https://x/2', 'https://x/3']) === undefined);
    ok('the first answer settles it', w.settle(a.id, ['https://x/2']) === true && JSON.stringify(await a.promise) === '["https://x/2"]');
    ok('‼️ …and the second door is told it was answered first', w.settle(a.id, null) === false && w.list().length === 0);
    const b = w.add(ask);
    w.settle(b.id, null);
    ok('a cancel resolves null (the step\'s onFail applies)', (await b.promise) === null);

    const ext = fs.readFileSync(path.join(ROOT, 'src/extension.ts'), 'utf8');
    const panel = fs.readFileSync(path.join(ROOT, 'src/panels/selectionPanel.ts'), 'utf8');
    ok('needs.act runs the panel\'s own handleNeedAction', /op: 'needs\.act'[\s\S]{0,1200}await handleNeedAction\(p\.action, p\.item, p\.answer\)/.test(ext));
    ok('…which takes the typed text instead of the input box', /answer \?\? await workflowAsks\.pick\(q\)/.test(ext)
        && /answerMissionQuestion\(item\.ref\.missionRunId, answer\)/.test(ext));
    ok('workflows.select settles the same store the page does', /op: 'workflows\.select'[\s\S]{0,2000}selectionWaits\.settle\(s\.id, urls!\)/.test(ext)
        && /waits\.settle\(req\.id, msg\.urls\)/.test(panel));
    ok('‼️ the page closes when the bridge answered first, and closing it unanswered cancels', /answered\.then\(\(\) => \{ if \(open\) \{ panel\.dispose\(\); \} \}\)/.test(panel)
        && /onDidDispose\(\(\) => \{ open = false; waits\.settle\(req\.id, null\); \}\)/.test(panel));

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
