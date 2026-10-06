// U-199 — the transcript's 🔊: a step with words is read aloud through the one
// reading channel, the step being read shows ■ (stop) and a paused one ▶
// (resume), drawn from the host's broadcast; the turn and step menus read the
// answer, the whole turn, one step, or from here to the end.
//
// The page names a step by the host's key (sessionRead.ts stepKey): the line's
// uuid, else `#n` — its place in the WHOLE conversation, which is why a
// transcript cut to its last N steps counts the hidden ones in front.
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));
const NOW = Date.now();
const SID = 'S1-full-id';

const msg = (turn, role, extra) => Object.assign({ turn, role, ts: NOW - (10 - turn) * 1000, text: role + ' words of turn ' + turn }, extra || {});
const data = over => Object.assign({
    title: 'reading aloud', sessionId: SID, cwd: 'D:/repo', permissionMode: '',
    firstTs: NOW - 9000, lastTs: NOW, models: [], usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    totalTokens: 0, cost: 0, errors: 0, toolCalls: 1, context: { tokens: 0, limit: 0 },
    turnCount: 3, messageCount: 12, truncatedCount: 5, turnTotals: {},
    messages: [
        msg(1, 'user', { turnStart: true, uuid: 'u-1' }),
        msg(1, 'assistant'),                                   // #7 — 5 hidden in front, 2nd shown
        msg(1, 'tool', { tool: 'Read', input: '{"file_path": "D:/repo/a.ts"}', text: '' }),
        msg(2, 'user', { turnStart: true, uuid: 'u-2' }),
        msg(2, 'assistant', { text: '   ' }),                  // no words: nothing to read
        msg(3, 'user', { turnStart: true, uuid: 'u-3' }),
        msg(3, 'assistant', { uuid: 'a-3s', sidechain: true }), // a subagent's aside is not the answer
        msg(3, 'assistant', { uuid: 'a-3' })
    ],
    turns: [{ n: 1, label: 'one', ts: NOW - 9000 }, { n: 2, label: 'two', ts: NOW - 8000 }, { n: 3, label: 'three', ts: NOW - 7000 }],
    files: [], reading: null
}, over || {});

const unfold = p => { for (const n of [1, 2, 3]) { p.send({ type: 'afctx', act: 'vtFold:0', ctx: { turnN: n } }); } };
const reads = p => (p.html().match(/data-read="[^"]*"/g) || []).map(s => s.slice(11, -1));
// by dataset: the page shim reads the `#7` inside `[data-read="#7"]` as an id selector
const btn = (p, key) => p.query('button[data-read]').find(b => b.dataset.read === key);
/** A press as the browser delivers it: on #msgs, its target inside the button. */
const press = (p, key) => {
    const b = btn(p, key);
    p.els.msgs.fire('click', { target: { closest: s => (/data-read/.test(s) ? b : null) } });
};

// ---------------------------------------------------------------- the 🔊 on the steps
{
    const p = runPage('sessionViewer.js', data());
    unfold(p);
    ok('a step with words gets a 🔊 under its key — uuid, else its place in the whole conversation',
        reads(p).join() === 'u-1,#7,u-2,u-3,a-3s,a-3');
    ok('a tool step and a step of blank words get none', !reads(p).includes('#8') && !reads(p).includes('#10'));
    ok('the 🔊 rides on the meta line just before the ⧉', /data-read="#7"[^>]*>🔊<\/button><button class="copyb"/.test(p.html()));
    ok('…and says what it does', /data-read="u-1"[^>]*title="Read this step aloud"/.test(p.html()));

    p.posted.length = 0;
    press(p, '#7');
    ok('a press reads that step, named by its key — the host knows the transcript', p.last().type === 'readAloud'
        && JSON.stringify(p.last().pick) === '{"msg":"#7"}');

    p.send({ type: 'reading', reading: { sessionId: SID, key: '#7', paused: false } });
    ok('‼️ the broadcast paints the step being read IN PLACE: ■, and its title says stop',
        btn(p, '#7').textContent === '■' && btn(p, '#7').title === 'Stop reading');
    ok('…and only that step', btn(p, 'u-1').textContent === '🔊');
    p.posted.length = 0;
    press(p, '#7');
    ok('pressing ■ stops the reading', p.last().type === 'readControl' && p.last().action === 'stop');

    p.send({ type: 'reading', reading: { sessionId: SID, key: '#7', paused: true } });
    ok('a paused reading shows ▶', btn(p, '#7').textContent === '▶' && btn(p, '#7').title === 'Resume reading');
    press(p, '#7');
    ok('pressing ▶ resumes it', p.last().type === 'readControl' && p.last().action === 'resume');

    p.send({ type: 'reading', reading: { sessionId: 'another-session', key: '#7', paused: false } });
    ok('‼️ the same key in ANOTHER conversation is not this step', btn(p, '#7').textContent === '🔊');
    p.send({ type: 'reading', reading: null });
    ok('a reading that ends puts the 🔊 back', btn(p, '#7').textContent === '🔊');

    p.send({ type: 'data', data: data({ reading: { sessionId: SID, key: 'u-3', paused: false } }), auto: true });
    unfold(p);
    ok('a data push carries the reading too, and a repaint draws ■ from it',
        /data-read="u-3"[^>]*>■<\/button>/.test(p.html()) && /data-read="u-3"[^>]*class="readb on"/.test(p.html()));

    p.send({ type: 'readRefused', error: 'turn 2 has no answer in words' });
    ok('a refusal is said in the host\'s own words', p.els['afctx-toast'] && /no answer in words/.test(p.els['afctx-toast'].textContent));
}

// ---------------------------------------------------------------- the reading already on when the page opens
{
    const p = runPage('sessionViewer.js', data({ reading: { sessionId: SID, key: 'u-1', paused: true } }));
    unfold(p);
    ok('a page opened mid-reading draws the step\'s ▶ from its data', /data-read="u-1"[^>]*>▶<\/button>/.test(p.html()));
}

// ---------------------------------------------------------------- the menus
{
    const p = runPage('sessionViewer.js', data());
    unfold(p);
    const steps = p.contexts().filter(c => c.webviewSection === 'afViewerStep');
    ok('a step says whether it has words to read — the menu item is drawn on that',
        steps.filter(c => c.stepWords).length === 6 && steps.filter(c => !c.stepWords).length >= 1);
    const second = steps.find(c => c.stepWords && c.stepRole === 'assistant');
    const post = (act, ctx) => { p.posted.length = 0; p.send({ type: 'afctx', act, ctx }); return p.posted.find(m => m.type === 'readAloud'); };
    ok('Read aloud ▸ This step reads that step', JSON.stringify(post('vsRead:step', second).pick) === '{"msg":"#7"}');
    ok('Read aloud ▸ From here to the end starts at it', JSON.stringify(post('vsRead:rest', second).pick) === '{"from":"#7"}');
    ok('a turn\'s answer', JSON.stringify(post('vtRead:answer', { turnN: 2 }).pick) === '{"turn":2}');
    ok('a turn whole', JSON.stringify(post('vtRead:all', { turnN: 2 }).pick) === '{"turn":2,"whole":true}');
    ok('‼️ from a turn to the end starts at the first ANSWER at or after it — not a blank one, not an aside',
        JSON.stringify(post('vtRead:rest', { turnN: 2 }).pick) === '{"from":"a-3"}');
    const last = runPage('sessionViewer.js', data({ messages: [msg(1, 'user', { uuid: 'u' })], turns: [{ n: 1, label: 'x', ts: NOW }] }));
    last.send({ type: 'afctx', act: 'vtRead:rest', ctx: { turnN: 1 } });
    ok('a turn with no answer from it on says so, and sends nothing',
        !last.posted.some(m => m.type === 'readAloud') && /No answer from here on/.test(last.els['afctx-toast'].textContent));

    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    const web = pkg.contributes.menus['webview/context'];
    ok('the turn band and the step each carry a Read aloud submenu',
        web.some(e => e.submenu === 'agentfarm.ctx.vtRead' && /afViewerTurn/.test(e.when))
        && web.some(e => e.submenu === 'agentfarm.ctx.vsRead' && /afViewerStep' && stepWords$/.test(e.when)));
    ok('…with the answer, the whole turn and from here on — and this step and from here on',
        pkg.contributes.menus['agentfarm.ctx.vtRead'].length === 3 && pkg.contributes.menus['agentfarm.ctx.vsRead'].length === 2);
}

// ---------------------------------------------------------------- on the phone (U-209)
{
    const p = runPage('sessionViewer.js', data(), { __AFUI__: { remote: true } });
    unfold(p);
    ok('‼️ a phone that cannot speak draws no 🔊 — a phone never makes the PC speak', reads(p).length === 0);
    p.send({ type: 'afctx', act: 'vsRead:step', ctx: { stepIdx: 1 } });
    ok('…and its menu says the phone app cannot read instead of sending it',
        !p.posted.some(m => m.type === 'readAloud') && /cannot read aloud/.test(p.els['afctx-toast'].textContent));
}
{
    const p = runPage('sessionViewer.js', data(), { __AFUI__: { remote: true }, afShell: { speaks: () => true, post: () => { } } });
    unfold(p);
    ok('a phone that speaks draws the same 🔊 on the same steps', reads(p).join() === 'u-1,#7,u-2,u-3,a-3s,a-3');
    p.posted.length = 0;
    p.send({ type: 'afctx', act: 'vsRead:step', ctx: { stepIdx: 1 } });
    ok('…and its menu sends the step to be read (the phone shell turns it into its own voice)',
        p.last() && p.last().type === 'readAloud' && JSON.stringify(p.last().pick) === '{"msg":"#7"}');
    p.send({ type: 'reading', reading: { sessionId: SID, key: '#7', paused: false, head: '' }, phone: true });
    p.send({ type: 'data', auto: true, data: data({ reading: null }) });
    ok('‼️ the PC\'s reading in a data push does not wipe the phone\'s ■', /data-read="#7"[^>]*class="readb on"[^>]*>■/.test(p.html()));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
