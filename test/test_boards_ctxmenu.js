// The three boards' right-click contract: Notices (agent→you), the Work Queue
// (you→agent) and Needs You (what the farm is stuck on).
//
// These pages had no webview test at all — their stores were covered, their
// markup was not. What is pinned here is the thing that breaks silently: a row
// must PUBLISH what it is, and a menu pick must run the row's own handler.
// Notices matter most, because opening a notice marks it read: if the menu did
// not work without opening, triaging the board would change the very state
// being triaged.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { runPage, matchesShell } = require(path.join(__dirname, 'lib_page_dom.js'));
ok('the shared media list still matches htmlShell', matchesShell());

const NOW = Date.now();

// ============================================================ NOTICES
{
    const p = runPage('notices.js', {
        generatedAt: NOW, unread: 1, openQuestions: 1,
        agents: ['manager', 'dev'], undoable: 0, focusId: null,
        docOpen: { mode: 'vscode', hasCustom: false },
        notices: [
            {
                id: 'n1', title: 'Backup done', body: 'all good', agentName: 'manager',
                type: 'update', level: 1, ts: NOW - 1000, read: false, tags: []
            },
            {
                id: 'n2', title: 'Which branch?', body: '', agentName: 'dev',
                type: 'question', level: 2, ts: NOW - 2000, read: true, status: 'open', tags: []
            },
            {
                id: 'n3', title: 'Weekly report', body: 'the body', agentName: 'manager',
                type: 'report', level: 3, ts: NOW - 3000, read: true, pinned: true,
                stars: 1, reportPath: 'D:/r/w.md', edited: true, tags: []
            }
        ]
    });

    ok('the board renders its notices', p.html().includes('Backup done') && p.html().includes('Which branch?'));

    const ctxs = p.contexts();
    const n1 = ctxs.find(c => c.notice === 'n1');
    const n2 = ctxs.find(c => c.notice === 'n2');
    const n3 = ctxs.find(c => c.notice === 'n3');
    ok('a notice row publishes itself to the menu',
        !!n1 && n1.webviewSection === 'afNoticeRow');
    ok('…with the flags the menu decides on',
        !!n1 && n1.afRead === false && n1.afPinned === false && n1.afQuestion === false);
    ok('a question says so, and says whether it is still open',
        !!n2 && n2.afQuestion === true && n2.afStatus === 'open');
    ok('a notice with a report attached says so',
        !!n3 && n3.afReport === true && n3.afEdited === true && n3.afPinned === true);
    ok('‼️ the body is NOT in the attribute — it is written on every row',
        !!n3 && n3.body === undefined);
    ok('the page keeps the normal Copy/Paste items', !!n1 && n1.preventDefaultContextMenuItems === false);
    ok('…and carries the address the pick comes back to', !!n1 && 'afPanel' in n1);
    ok('rows say a right-click has more', p.html().includes('right-click for more'));

    const rowDeletes = p.query('[data-row-dismiss]');
    ok('U-48: every notice row carries the same one-click ✕ as Needs You',
        rowDeletes.length === 3);
    p.posted.length = 0;
    rowDeletes.find(b => b.dataset.rowDismiss === 'n1').click();
    ok('…and the ✕ deletes only that notice without opening or marking it read',
        p.last().type === 'dismiss' && p.last().id === 'n1'
        && !p.posted.some(m => m.type === 'markRead'));

    // ‼️ The whole reason this menu exists: triaging a notice must not open it,
    // because opening one marks it read.
    p.posted.length = 0;
    p.send({ type: 'afctx', act: 'ntPin:1', ctx: n1 });
    ok('pinning an unread notice pins it', p.last().type === 'pin' && p.last().id === 'n1' && p.last().pinned === true);
    ok('‼️ …and does NOT mark it read on the way',
        !p.posted.some(m => m.type === 'markRead'));
    ok('…and the row is still folded afterwards',
        p.contexts().find(c => c.notice === 'n1').afOpen === false);

    p.send({ type: 'afctx', act: 'ntStars:3', ctx: n1 });
    ok('stars are a list, not a click-through-the-ring',
        p.last().type === 'setStars' && p.last().stars === 3);

    // The menu against the button, for the one act both offer.
    p.send({ type: 'afctx', act: 'ntOpen', ctx: n3 });     // n3 is already read
    const readBtn = p.query('[data-act="read"]').find(e => e.dataset.id === 'n3');
    ok('the opened notice offers its read button', !!readBtn);
    p.posted.length = 0;
    if (readBtn) { readBtn.click(); }
    const byButton = p.last();
    p.send({ type: 'afctx', act: 'ntRead:0', ctx: n3 });
    ok('‼️ mark-unread from the menu is the button\'s message, to the character',
        JSON.stringify(p.last()) === JSON.stringify(byButton));

    p.send({ type: 'afctx', act: 'ntReport', ctx: n3 });
    ok('the attached report opens from the row', p.last().type === 'openReport' && p.last().id === 'n3');
    p.send({ type: 'afctx', act: 'ntHand', ctx: n2 });
    ok('handing a notice to its agent names the notice', p.last().type === 'handoffNotice' && p.last().id === 'n2');
    p.send({ type: 'afctx', act: 'ntDecline', ctx: n2 });
    ok('passing a question over is one gesture', p.last().type === 'decline' && p.last().id === 'n2');

    // Narrowing the board from a row, without hunting for the filter control.
    p.send({ type: 'afctx', act: 'ntOnly:agent', ctx: n2 });
    ok('"only this agent" narrows the board to it',
        p.html().includes('Which branch?') && !p.html().includes('Backup done'));
    p.send({ type: 'afctx', act: 'ntOnly:agent', ctx: p.contexts().find(c => c.notice === 'n2') });
    ok('…and the question is still there afterwards', p.html().includes('Which branch?'));
}

// ============================================================ WORK QUEUE
{
    const p = runPage('queue.js', {
        generatedAt: NOW, blocked: 1, active: 2,
        targets: ['repoA'], agents: ['manager'], live: {}, focusItem: null,
        docOpen: { mode: 'vscode', hasCustom: false },
        items: [
            { id: 'q1', text: 'fix the pad', author: 'user', status: 'captured', urgency: 'normal', ts: NOW - 1000, tags: [] },
            { id: 'q2', text: 'answer me', author: 'user', status: 'blocked', urgency: 'urgent', ts: NOW - 2000, tags: [], sourceNoticeId: 'n9' },
            { id: 'q3', text: 'done thing', author: 'user', status: 'done', urgency: 'normal', ts: NOW - 3000, tags: [], reportPath: 'D:/r/q3.md' }
        ]
    });

    ok('the queue renders its lanes', p.html().includes('fix the pad') && p.html().includes('Needs you'));

    const ctxs = p.contexts();
    const live = ctxs.find(c => c.item === 'q1');
    const blocked = ctxs.find(c => c.item === 'q2');
    const done = ctxs.find(c => c.item === 'q3');
    ok('a queue item publishes itself to the menu',
        !!live && live.webviewSection === 'afQueueRow' && live.afTerminal === false);
    ok('a blocked item says it is waiting on you', !!blocked && blocked.afBlocked === true);
    ok('…and says where it came from', !!blocked && blocked.afSource === true);
    ok('a handled item says so, and that it has a report',
        !!done && done.afTerminal === true && done.afReport === true);

    // ‼️ The safety rule of this page, now enforced by the context rather than
    // by two buttons that happen not to be drawn together.
    ok('‼️ a live item is not terminal, so Delete is never drawn on it', live.afTerminal === false);
    ok('‼️ a handled item is terminal, so Drop and Edit are not', done.afTerminal === true);

    p.posted.length = 0;
    p.send({ type: 'afctx', act: 'qUrg:soon', ctx: live });
    ok('urgency is a list, not the three-press cycle the ⏫ button walks',
        p.last().type === 'setUrgency' && p.last().id === 'q1' && p.last().urgency === 'soon');

    const dropBtn = () => { p.send({ type: 'afctx', act: 'qOpen', ctx: live }); return p.query('[data-act="drop"]').find(e => e.dataset.id === 'q1'); };
    const btn = dropBtn();
    ok('an opened item offers its Drop button', !!btn);
    p.posted.length = 0;
    if (btn) { btn.click(); }
    const byButton = p.last();
    p.send({ type: 'afctx', act: 'qDrop', ctx: live });
    ok('‼️ dropping from the menu is the button\'s message, to the character',
        JSON.stringify(p.last()) === JSON.stringify(byButton));

    p.send({ type: 'afctx', act: 'qNotice', ctx: blocked });
    ok('the source notice opens by the id the ITEM carries, not one from the menu',
        p.last().type === 'openNotice' && p.last().id === 'n9');
    p.send({ type: 'afctx', act: 'qFile:report', ctx: done });
    ok('the report it produced opens', p.last().type === 'openFile' && p.last().kind === 'report' && p.last().id === 'q3');
    p.send({ type: 'afctx', act: 'qRemove', ctx: done });
    ok('a handled item can be deleted', p.last().type === 'remove' && p.last().id === 'q3');

    const lane = p.contexts().find(c => c.webviewSection === 'afQueueLane');
    ok('a lane heading publishes which lane it is',
        !!lane && typeof lane.lane === 'string' && lane.afDropShown === false);
    p.send({ type: 'afctx', act: 'qlDropped:1', ctx: lane });
    ok('the dropped lane can be shown from a lane heading',
        p.contexts().some(c => c.webviewSection === 'afQueueLane' && c.afDropShown === true));
}

// ============================================================ NEEDS YOU
{
    const p = runPage('needs.js', {
        generatedAt: NOW, hidden: 0,
        items: [
            {
                key: 'k1', clearable: false, kind: 'permission', agentName: 'dev',
                title: 'dev is waiting for permission', detail: 'Bash', ts: NOW, urgency: 0,
                ref: { sessionId: 's1', transcriptPath: 'D:/t/s1.jsonl', agentId: 'a1' },
                actions: [{ id: 'open', label: 'Open the session' }]
            },
            {
                key: 'k2', clearable: true, kind: 'conflict', agentName: 'manager',
                title: 'Antigravity drift', detail: 'two sides changed', ts: NOW, urgency: 3,
                ref: { filePath: 'D:/x.md', agentId: 'a2' },
                actions: [{ id: 'reconcile', label: 'Reconcile' }]
            }
        ]
    });

    ok('the queue renders its blockers',
        p.html().includes('waiting for permission') && p.html().includes('Antigravity drift'));

    const ctxs = p.contexts();
    const withSession = ctxs.find(c => c.needKey === 'k1');
    const plain = ctxs.find(c => c.needKey === 'k2');
    // ‼️ The point of this page's contract: a blocked row is often a SESSION,
    // and the session's own eleven actions are exactly what you want on it.
    ok('‼️ a blocker that names a transcript publishes itself as a session too',
        !!withSession && withSession.webviewSection === 'afNeedSession'
        && withSession.file === 'D:/t/s1.jsonl' && withSession.sessionId === 's1');
    ok('…and still says what it is as a blocker',
        !!withSession && withSession.afKind === 'permission' && withSession.afClearable === false);
    ok('‼️ a blocker with no session is NOT one — it is offered nothing it cannot do',
        !!plain && plain.webviewSection === 'afNeedRow' && plain.file === undefined);
    ok('a clearable row says so', !!plain && plain.afClearable === true);
    ok('both carry the agent behind them',
        withSession.afAgentId === 'a1' && plain.afAgentId === 'a2');
    ok('a session row says its right-click does more than the blocker',
        p.html().includes('everything you can do to the session behind it'));

    p.posted.length = 0;
    p.send({ type: 'afctx', act: 'ndClear', ctx: plain });
    ok('clearing a judged row names just that row',
        p.last().type === 'clear' && p.last().keys.length === 1 && p.last().keys[0] === 'k2');
    p.send({ type: 'afctx', act: 'ndAgent', ctx: withSession });
    ok('the stuck agent opens from the row', p.last().type === 'openAgent' && p.last().agentId === 'a1');
}

// -------- the catalogue actually draws the session menu on a needs row --------
{
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'));
    const web = pkg.contributes.menus['webview/context'];
    const draws = (when, section) => {
        const m = /^webviewSection =~ \/(.+)\/$/.exec(String(when || ''));
        if (m) { return new RegExp(m[1]).test(section); }
        return when === `webviewSection == '${section}'`;
    };
    ok('‼️ the session actions are declared for afNeedSession, not just afSessionRow',
        web.some(e => e.command === 'agentfarm.interruptSession' && draws(e.when, 'afNeedSession')));
    ok('…and the needs-only items are declared for BOTH needs sections',
        web.some(e => e.command === 'agentfarm.ctx.ndCopy' && draws(e.when, 'afNeedRow'))
        && web.some(e => e.command === 'agentfarm.ctx.ndCopy' && draws(e.when, 'afNeedSession')));
    ok('‼️ a plain needs row does NOT get the session actions',
        !web.some(e => e.command === 'agentfarm.endSession' && draws(e.when, 'afNeedRow')));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
