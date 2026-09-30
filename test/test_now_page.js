// U-177 — THE "NOW" PAGE: one screen of what waits for you, what runs, today's
// spend and quotas and the latest notices, and a box that speaks into a running
// session. The phone's home page and a desktop tab; `now.get` returns the same
// snapshot. A read device may look, only a manage device may send, and the page's
// links are the shell's to follow on a phone, never the PC's.
'use strict';
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

class EventEmitter {
    constructor() { this.listeners = []; }
    get event() {
        return (fn, thisArg, bag) => {
            const f = thisArg ? fn.bind(thisArg) : fn;
            this.listeners.push(f);
            const d = { dispose: () => { this.listeners = this.listeners.filter(x => x !== f); } };
            if (Array.isArray(bag)) { bag.push(d); }
            return d;
        };
    }
    fire(e) { for (const f of [...this.listeners]) { f(e); } }
    dispose() { this.listeners = []; }
}
const uri = p => ({ path: p, fsPath: p, toString: () => 'file://' + p });
const pcSide = [];
const vscodeStub = {
    EventEmitter,
    Uri: { joinPath: (b, ...parts) => uri([b.path, ...parts].join('/')), file: uri, parse: uri },
    ViewColumn: { One: 1 },
    window: { createWebviewPanel: () => { throw new Error('the tests draw on their own host'); } },
    commands: { executeCommand: (...a) => { pcSide.push('command:' + a[0]); return Promise.resolve(undefined); } },
    workspace: { getConfiguration: () => ({ get: (_k, d) => d }) }
};
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') { return vscodeStub; }
    return origLoad.apply(this, arguments);
};
const { NowPanel } = require(path.join(ROOT, 'out', 'panels', 'nowPanel.js'));
const { messageScope } = require(path.join(ROOT, 'out', 'panels', 'remoteViews.js'));
const { remotePages } = require(path.join(ROOT, 'out', 'panels', 'remotePages.js'));
Module._load = origLoad;
const { buildNow, doingOf, NOW_LIMITS } = require(path.join(ROOT, 'out', 'core', 'nowPage.js'));
const { buildNeedsQueue } = require(path.join(ROOT, 'out', 'core', 'needs.js'));
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));

const T = 1_790_000_000_000;
const sess = (o) => ({ agentName: 'dev', status: 'idle', startedAt: T - 3600e3, lastTs: T, costUSD: 0.5, messages: [], ...o });
const input = (o = {}) => ({
    needs: buildNeedsQueue({
        liveSessions: [{ sessionId: 's1', agentName: 'developer', status: 'waiting-permission', lastPrompt: 'Bash: npm test', lastEventTs: T - 60e3 }],
        approvals: [], insights: [],
        conflicts: []
    }),
    sessions: [
        sess({ id: 'c1', agentName: 'asistan', status: 'idle', startedAt: T - 7200e3 }),
        sess({ id: 'c2', agentName: 'developer', status: 'working', turnStartedAt: T - 90e3,
            messages: [{ role: 'agent', text: 'Testleri\nçalıştırıyorum' }, { role: 'tool', tool: { name: 'Bash', detail: 'npm test' } }] }),
        sess({ id: 'c3', agentName: 'psikolog', status: 'idle', pendingAsk: { requestId: 'a' } }),
        sess({ id: 'c4', agentName: 'old', status: 'ended' })
    ],
    todayCost: 12.34,
    quotas: [{ account: 'aicozums', engine: 'claude', percent: 40, resetsAt: T + 3600e3 },
        { account: 'rotam', engine: 'claude', percent: 92, resetsAt: 0 }],
    notices: Array.from({ length: 9 }, (_, i) => ({ id: 'n' + i, ts: T - i * 60e3, agentName: 'developer', type: 'update', level: 2, title: 'Gece kararı ' + i })),
    now: T,
    ...o
});

// ---------------------------------------------------------------- the snapshot
{
    const d = buildNow(input());
    ok('the permission wait is on the page', d.waiting.length === 1 && d.waiting[0].kind === 'permission');
    ok('a waiting row carries the key Needs You uses', typeof d.waiting[0].key === 'string' && d.waiting[0].key.startsWith('permission|'));
    ok('an ended session is not running', !d.running.some(s => s.id === 'c4'));
    ok('a session held by a question comes first', d.running[0].id === 'c3' && d.running[0].waits === true);
    ok('…then the one working, then the idle', d.running[1].id === 'c2' && d.running[2].id === 'c1');
    ok('a working session is timed from its turn', d.running[1].since === T - 90e3);
    ok('an idle one from its start', d.running[2].since === T - 7200e3);
    ok('what it is doing is its last visible act, on one line', d.running[1].doing === 'Bash npm test');
    ok('an engine left unsaid is claude', d.running[0].engine === 'claude');
    ok('the fullest quota comes first', d.today.quotas[0].account === 'rotam');
    ok('today is the figure handed over', d.today.cost === 12.34);
    ok('notices: the latest first, capped', d.notices.length === NOW_LIMITS.notices && d.notices[0].id === 'n0');
    ok('the snapshot is stamped', d.generatedAt === T);

    ok('the agent\'s own words when they are last', doingOf([{ role: 'tool', tool: { name: 'Read', detail: 'a' } }, { role: 'agent', text: ' bitti\n\n ' }]) === 'bitti');
    const long = doingOf([{ role: 'agent', text: 'x'.repeat(500) }]);
    ok('a long line is cut to the limit with an ellipsis', long.length === NOW_LIMITS.doing && long.endsWith('…'));
    ok('nothing said yet is an empty line', doingOf([{ role: 'user', text: 'hi' }]) === '');

    const many = buildNow(input({
        needs: buildNeedsQueue({
            liveSessions: Array.from({ length: 11 }, (_, i) => ({ sessionId: 's' + i, agentName: 'a' + i, status: 'waiting-permission', lastPrompt: 'p', lastEventTs: T })),
            approvals: [], insights: []
        })
    }));
    ok('waiting rows are capped and the rest counted', many.waiting.length === NOW_LIMITS.waiting && many.waitingMore === 11 - NOW_LIMITS.waiting);
}

// ---------------------------------------------------------------- the page
{
    const r = runPage('now.js', buildNow(input()));
    const html = r.html();
    for (const t of ['Waiting for you', 'Running', 'Today', 'Notices']) { ok('the page draws ' + t, html.includes(t)); }
    ok('the spend is on the page', html.includes('$12.34'));
    ok('a quota bar per account', (html.match(/class="nw-q"/g) || []).length === 2);
    ok('the box aims at the first running session', /data-pick="c3"[^>]*aria-pressed="true"/.test(html));
    ok('Send starts disabled with nothing written', /id="nw-send"[^>]*disabled/.test(html));

    const box = r.query('#nw-text')[0];
    box.value = 'devam et'; box.fire('input');
    r.query('[data-pick]').find(e => e.dataset.pick === 'c2').click();
    r.query('#nw-send')[0].click();
    const sent = r.last();
    ok('Send says the words into the picked session', sent.type === 'send' && sent.id === 'c2' && sent.text === 'devam et');

    r.send({ type: 'data', data: buildNow(input()) });
    ok('a push while writing keeps the words', r.html().includes('devam et'));
    r.send({ type: 'sent', id: 'c2', ok: false, error: 'the session is busy' });
    ok('a refusal is said and the words stay', r.html().includes('the session is busy') && r.html().includes('devam et'));
    r.send({ type: 'sent', id: 'c2', ok: true });
    ok('a sent message empties the box', !r.html().includes('devam et') && r.html().includes('Sent.'));

    r.query('#nw-new')[0].click();
    ok('New goes to the Console (its door, not a second one)', r.last().type === 'afnav' && r.last().to === 'console');
    r.query('[data-nav]').find(e => e.dataset.nav === 'needs').click();
    ok('a waiting row goes to Needs You', r.last().type === 'afnav' && r.last().to === 'needs');

    const empty = runPage('now.js', buildNow(input({ needs: [], sessions: [], notices: [], quotas: [], todayCost: 0 })));
    const eh = empty.html();
    ok('an empty farm says nothing waits', eh.includes('Nothing is waiting for you'));
    ok('…and the box cannot be written to', /id="nw-text"[^>]*disabled/.test(eh));
    ok('…but New still opens the Console', eh.includes('id="nw-new"'));
}

// ---------------------------------------------------------------- the panel
{
    const inbox = new EventEmitter(), gone = new EventEmitter(), changed = new EventEmitter();
    const out = [];
    const host = {
        remote: true, title: '', visible: true, reveal() { }, dispose() { gone.fire(); },
        onDidDispose: gone.event, onDidChangeViewState: () => ({ dispose() { } }),
        webview: {
            html: '', cspSource: "'self'", remote: true, asWebviewUri: u => ({ toString: () => '/res/' + u.path }),
            postMessage: m => { out.push(m); return Promise.resolve(true); }, onDidReceiveMessage: inbox.event
        }
    };
    const said = [];
    NowPanel.openOn(host, {
        extensionUri: uri('/ext'),
        build: () => buildNow(input()),
        send: (id, text) => { said.push([id, text]); return id === 'gone' ? undefined : id === 'busy' ? { refused: 'busy now' } : {}; },
        onDidChange: changed.event
    });
    ok('the page loads its script', host.webview.html.includes('now.js'));
    inbox.fire({ type: 'send', id: 'c2', text: '  tamam  ' });
    ok('the panel says it, trimmed, through the send it was given', said.length === 1 && said[0][0] === 'c2' && said[0][1] === 'tamam');
    ok('…and tells the page it went', out.some(m => m.type === 'sent' && m.ok === true));
    inbox.fire({ type: 'send', id: 'busy', text: 'x' });
    ok('a refusal goes back with its reason', out.some(m => m.type === 'sent' && m.ok === false && m.error === 'busy now'));
    inbox.fire({ type: 'send', id: 'gone', text: 'x' });
    ok('an ended session is named as ended', out.some(m => m.type === 'sent' && /ended/.test(m.error || '')));
    inbox.fire({ type: 'send', id: 'c2', text: '   ' });
    ok('blank words are not sent', said.length === 3);
    inbox.fire({ type: 'afnav', to: 'needs' });
    ok('on the desktop a link opens the page', pcSide.includes('command:agentfarm.openNeeds'));
    host.dispose();
}

// ---------------------------------------------------------------- on a phone
{
    const spec = remotePages({ needs() { }, console() { }, now() { } }).now;
    ok('a phone may open Now', !!spec);
    ok('looking needs only read', messageScope(spec, 'refresh') === 'read');
    ok('sending needs manage', messageScope(spec, 'send') === 'manage');
    ok('a link is the shell\'s, never run on the PC', messageScope(spec, 'afnav') === null);
}

console.log(`test_now_page: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
