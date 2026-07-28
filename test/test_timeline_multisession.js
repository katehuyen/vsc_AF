// DOM-stub test: timeline.js with the SAME agent open in two concurrent
// sessions — per-session swim-lane tracks + per-session alert overrides.
const fs = require('fs');
const vm = require('vm');

const code = fs.readFileSync(require('path').resolve(__dirname, '../media/pageHeader.js'), 'utf8') + '\n' + fs.readFileSync(require('path').resolve(__dirname, '../media/afFilters.js'), 'utf8') + '\n' + fs.readFileSync(require('path').resolve(__dirname, '../media/timeline.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

let posted = [];
let lastHtml = '';
let chipEls = [];
let resetEls = [];

function elemsForSelector(sel) {
    const els = [];
    if (sel === '.af-toggle') {
        // gutter toggles (svg <g>) — agent defaults
        let re = /<g class="af-toggle" data-agent="([^"]*)" data-action="([^"]*)"/g;
        let m;
        while ((m = re.exec(lastHtml))) {
            const el = { dataset: { agent: m[1], action: m[2] } };
            el.addEventListener = (_e, fn) => { el._click = fn; };
            els.push(el);
        }
        // card chips (<span>) — per-session overrides
        re = /<span class="af-toggle badge" data-agent="([^"]*)" data-session="([^"]*)" data-action="([^"]*)"/g;
        while ((m = re.exec(lastHtml))) {
            const el = { dataset: { agent: m[1], session: m[2], action: m[3] } };
            el.addEventListener = (_e, fn) => { el._click = fn; };
            els.push(el);
        }
        chipEls = els;
        return els;
    }
    if (sel === '.af-reset') {
        const re = /<span class="af-reset[^"]*" data-session="([^"]*)"/g;
        let m;
        while ((m = re.exec(lastHtml))) {
            const el = { dataset: { session: m[1] } };
            el.addEventListener = (_e, fn) => { el._click = fn; };
            els.push(el);
        }
        resetEls = els;
        return els;
    }
    return [];
}

const appEl = { set innerHTML(v) { lastHtml = v; }, get innerHTML() { return lastHtml; } };
const stubEl = { addEventListener() { }, set innerHTML(v) { } };

const NOW = Date.now();
const MIN = 60000;
const sandbox = {
    acquireVsCodeApi: () => ({ postMessage: (m) => posted.push(m), getState() { }, setState() { } }),
    window: {
        AFCharts: {
            esc: (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
            fmtUSD: (v) => '$' + Number(v).toFixed(2),
            fmtTok: (n) => n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n)
        },
        __DATA__: {
            listener: { state: 'listening', port: 1 },
            ownersKnown: true,
            stuckMs: 240000,
            sessions: [
                // the SAME agent, two concurrent sessions
                { sessionId: 'S1', agentName: 'dev', resolved: true, label: 'dev #1', status: 'tool', currentTool: 'Read', prompts: 1, toolCalls: 1, compactions: 0, subagentStops: 0, startedAt: NOW - 40 * MIN, lastEventTs: NOW - 5 * MIN, cost: 0.5, tokens: 48200, ctxTokens: 24100, turns: 3, model: 'claude-opus-5', owner: { pid: 4242, entrypoint: 'cli' }, cwd: 'D:/a/dev', transcriptPath: 'D:/t/S1.jsonl', title: 'the S1 job' },
                { sessionId: 'S2', agentName: 'dev', resolved: true, label: 'dev #2', status: 'waiting-input', prompts: 1, toolCalls: 1, compactions: 0, subagentStops: 0, startedAt: NOW - 20 * MIN, lastEventTs: NOW - 14 * MIN, owner: { pid: 77, entrypoint: 'cli' } },
                // another agent with one live session — its tool call never got
                // an end event, and the session has since moved on
                { sessionId: 'S3', agentName: 'ops', resolved: true, label: 'ops', status: 'idle', prompts: 0, toolCalls: 1, compactions: 0, subagentStops: 0, startedAt: NOW - 10 * MIN, lastEventTs: NOW - 8 * MIN, owner: { pid: 9, entrypoint: 'cli' } },
                // a session whose folder is not an agent folder: no name, only an id
                { sessionId: 'abcdef1234567890', agentName: 'abcdef12', resolved: false, label: 'abcdef12', status: 'waiting-input', prompts: 2, toolCalls: 0, compactions: 0, subagentStops: 0, startedAt: NOW - 30 * MIN, lastEventTs: NOW - 25 * MIN, owner: null }
            ],
            events: [
                { sessionId: 'S1', agentName: 'dev', ts: NOW - 30 * MIN, kind: 'prompt', detail: 'p1' },
                // still running: the session says it is inside this tool
                { sessionId: 'S1', agentName: 'dev', ts: NOW - 5 * MIN, kind: 'toolStart', tool: 'Read' },
                { sessionId: 'S2', agentName: 'dev', ts: NOW - 15 * MIN, kind: 'toolStart', tool: 'Bash' },
                { sessionId: 'S2', agentName: 'dev', ts: NOW - 14 * MIN, kind: 'toolEnd', tool: 'Bash' },
                // an EARLIER, ended ops session — sequential, so it must SHARE the ops row
                { sessionId: 'SOLD', agentName: 'ops', ts: NOW - 50 * MIN, kind: 'prompt', detail: 'old' },
                { sessionId: 'SOLD', agentName: 'ops', ts: NOW - 45 * MIN, kind: 'end' },
                // tool call with no end, on a session that is idle again
                { sessionId: 'S3', agentName: 'ops', ts: NOW - 9 * MIN, kind: 'toolStart', tool: 'Bash' },
                { sessionId: 'abcdef1234567890', ts: NOW - 25 * MIN, kind: 'prompt', detail: 'anon' }
            ],
            workflowRuns: [],
            turnActions: { dev: ['sound'] },
            sessionTurnActions: {}
        },
        addEventListener() { }
    },
    document: {
        getElementById: (id) => id === 'app' ? appEl : (id === 'install' ? null : stubEl),
        querySelectorAll: elemsForSelector
    },
    setInterval: () => 0, console
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox); // runs render() once

// ---- swim lanes: one row per CONCURRENT session ----
ok('lane row dev #1 exists', lastHtml.indexOf('>dev #1</text>') !== -1);
ok('lane row dev #2 exists', lastHtml.indexOf('>dev #2</text>') !== -1);
ok('sequential ops sessions share one plain row', lastHtml.indexOf('>ops</text>') !== -1 && lastHtml.indexOf('>ops #1</text>') === -1);
ok('four lane rows total (svg height)', lastHtml.indexOf('viewBox="0 0 900 216"') !== -1);
// S1's prompt mark sits in row 0 (cy = 22 + 23), S2's tool segment in row 1 (y = 22+46+23-7)
ok('S1 mark drawn in first dev row', /<circle cx="[\d.]+" cy="45" r="4\.2"/.test(lastHtml));
ok('S2 segment drawn in second dev row', /<rect x="[\d.]+" y="84" width="[\d.]+" height="14"/.test(lastHtml));

// ---- a session nobody could name is labelled by what it IS ----
ok('unresolved session row is labelled by its id', lastHtml.indexOf('>#abcdef12</text>') !== -1);
ok('…and says why', lastHtml.indexOf('not one of your agent folders') !== -1);

// ---- the row label is a handle: rich tooltip + click ----
ok('lane labels are clickable groups', lastHtml.indexOf('class="mark lanelabel"') !== -1);
ok('…carrying the session\'s own transcript', lastHtml.indexOf('class="mark lanelabel" data-file="D:/t/S1.jsonl"') !== -1);
ok('…and its figures in the tooltip', /dev #1 · #S1 · TOOL · Read/.test(lastHtml) && lastHtml.indexOf('$0.50 · 48.2k tok') !== -1);

// ---- a row is a session: right-click it for that session's commands ----
{
    const ctxOf = (s) => {
        const m = /sessionId&quot;:&quot;([^&]*)&quot;/.exec(s);
        return m ? m[1] : '';
    };
    const label = /<g class="mark lanelabel" data-file="D:\/t\/S1.jsonl" data-ts="0" data-vscode-context="([^"]*)"/.exec(lastHtml);
    ok('the row label carries the right-click contract', !!label);
    ok('…the same one the cards use', !!label && label[1].indexOf('afTimelineSession') !== -1);
    ok('…for that row\'s own session', !!label && ctxOf(label[1]) === 'S1');
    ok('…and the tooltip says so', lastHtml.indexOf("Right-click for this session's actions") !== -1);

    // Transparent hit areas: the whole row answers for its live session, and a
    // packed row's earlier session answers for itself.
    const rects = [];
    const re = /<rect x="([\d.]+)" y="(\d+)" width="([\d.]+)" height="42" fill="transparent" data-vscode-context="([^"]*)"\/>/g;
    let m;
    while ((m = re.exec(lastHtml))) {
        rects.push({ x: Number(m[1]), y: Number(m[2]), w: Number(m[3]), sid: ctxOf(m[4]) });
    }
    ok('every row has a full-width right-click area', rects.filter(r => r.w === 792).length === 4);
    ok('…the dev rows target their own sessions',
        rects.some(r => r.y === 24 && r.w === 792 && r.sid === 'S1') &&
        rects.some(r => r.y === 70 && r.w === 792 && r.sid === 'S2'));
    ok('…a packed row targets the session that is live', rects.some(r => r.y === 116 && r.w === 792 && r.sid === 'S3'));
    ok('…and the earlier session on that row answers over its own span',
        rects.some(r => r.y === 116 && r.sid === 'SOLD' && r.w < 792));
    ok('…a row nobody could name is still a session', rects.some(r => r.y === 162 && r.sid === 'abcdef1234567890'));
    ok('the hit areas are laid down before the bars, so left-click still opens',
        lastHtml.indexOf('fill="transparent"') < lastHtml.indexOf('rx="3" fill="var(--vscode-charts-green'));
}

// ---- an unfinished tool call must not run to "now" forever ----
{
    // row 2 (ops): toolStart at -9m, no toolEnd, session idle again since -8m
    const ghost = /<rect x="([\d.]+)" y="130" width="([\d.]+)" height="14" rx="3" ([^>]*)>/.exec(lastHtml);
    ok('the unfinished tool is drawn', !!ghost);
    ok('…hollow and dashed, not as work in progress',
        !!ghost && ghost[3].indexOf('fill="none"') !== -1 && ghost[3].indexOf('stroke-dasharray') !== -1);
    ok('…and stops where the session did (≈1 minute, not 9)', !!ghost && Number(ghost[2]) < 60);
    ok('…and says so on hover', lastHtml.indexOf('unfinished: no end event ever arrived') !== -1);
    // row 0 (dev #1): the session says it IS inside this tool — that one grows
    const live = /<rect x="([\d.]+)" y="38" width="([\d.]+)" height="14" rx="3" fill="var\(--vscode-charts-green/.exec(lastHtml);
    ok('a tool the session is still on keeps growing', !!live && Number(live[1]) + Number(live[2]) > 880);
}

// ---- gutter toggles: agent default, drawn ONCE per agent ----
const gutterDev = (lastHtml.match(/<g class="af-toggle" data-agent="dev"/g) || []).length;
const gutterOps = (lastHtml.match(/<g class="af-toggle" data-agent="ops"/g) || []).length;
ok('dev gutter toggles only on its first row (4 not 8)', gutterDev === 4);
ok('ops gutter toggles present once (4)', gutterOps === 4);

// ---- session cards: disambiguated titles + per-session chips ----
ok('card titled dev #1', lastHtml.indexOf('>dev #1</span> <span class="sid"') !== -1);
ok('card titled dev #2', lastHtml.indexOf('>dev #2</span> <span class="sid"') !== -1);
ok('cards carry the session id, as the Console rows do', lastHtml.indexOf('(#S2)</span>') !== -1);
ok('cards show start time', /started \d{2}:\d{2}/.test(lastHtml));

// ---- the card is a place to act, not only to read ----
{
    ok('the title opens the session', lastHtml.indexOf('class="slink" data-open="D:/t/S1.jsonl"') !== -1);
    ok('…and so does the session\'s own name', lastHtml.indexOf('the S1 job') !== -1);
    ok('cards carry the right-click contract', lastHtml.indexOf('afTimelineSession') !== -1);
    ok('a session with a process can be ended', lastHtml.indexOf('data-endsess="S1"') !== -1);
    ok('…and any session can be cleared', lastHtml.indexOf('data-dropsess="S1"') !== -1);
    ok('the money line is on the card', lastHtml.indexOf('$0.50 · 48.2k tok · ctx 24.1k · 3 turns · opus-5') !== -1);
    ok('the work line is on the card', lastHtml.indexOf('1 prompts · 1 tools') !== -1);
    ok('where it runs is on the card', lastHtml.indexOf('pid 4242 · terminal') !== -1);
    ok('the folder can be revealed', lastHtml.indexOf('data-cwd="D:/a/dev"') !== -1);
}

// ---- a session whose process is gone says so, and can be swept ----
{
    ok('the finished session is marked', lastHtml.indexOf('No live process owns this session') !== -1);
    ok('…it is not offered an Interrupt', lastHtml.indexOf('data-stopsess="abcdef1234567890"') === -1);
    ok('…and the header offers to clear it', lastHtml.indexOf('id="clear-gone"') !== -1 &&
        lastHtml.indexOf('Clear 1 finished session<') !== -1);
    ok('a session with a live process is NOT called finished',
        (lastHtml.match(/No live process owns this session/g) || []).length === 1);
}
ok('chips carry data-session', lastHtml.indexOf('data-session="S2"') !== -1);
ok('no override yet — cards follow agent default', lastHtml.indexOf('(agent default)') !== -1 && lastHtml.indexOf('session override') === -1);

// S2 card's sound chip is ON via the dev default
const s2Sound = () => new RegExp('<span class="af-toggle badge" data-agent="dev" data-session="S2" data-action="sound"[^>]*>').exec(lastHtml)[0];
ok('S2 sound chip inherits agent default (blue)', /background:var\(--vscode-charts-blue/.test(s2Sound()));

// ---- click S2's sound chip → session-only override (mute), S1 untouched ----
posted = [];
chipEls.find(e => e.dataset.session === 'S2' && e.dataset.action === 'sound')._click();
ok('post is setSessionTurnActions', posted.length === 1 && posted[0].type === 'setSessionTurnActions');
ok('override is an explicit empty set (mute)', Array.isArray(posted[0].map.S2) && posted[0].map.S2.length === 0);
ok('agent default map untouched', posted.every(p => p.type !== 'setTurnActions'));
ok('S2 chip now off', !/background:var\(--vscode-charts-blue/.test(s2Sound()));
ok('S2 card shows override marker + reset', lastHtml.indexOf('session override — reset') !== -1);
const s1Sound = new RegExp('<span class="af-toggle badge" data-agent="dev" data-session="S1" data-action="sound"[^>]*>').exec(lastHtml)[0];
ok('S1 chip still follows the default (blue)', /background:var\(--vscode-charts-blue/.test(s1Sound));

// ---- reset → back to agent default ----
posted = [];
resetEls.find(e => e.dataset.session === 'S2')._click();
ok('reset posts map without S2', posted.length === 1 && !('S2' in posted[0].map));
ok('S2 chip back to default (blue)', /background:var\(--vscode-charts-blue/.test(s2Sound()));

// ---- gutter toggle still edits the agent default ----
posted = [];
chipEls.find(e => !e.dataset.session && e.dataset.agent === 'dev' && e.dataset.action === 'modal')._click();
ok('gutter click posts setTurnActions', posted.length === 1 && posted[0].type === 'setTurnActions');
ok('modal added to dev default', posted[0].map.dev.indexOf('modal') !== -1 && posted[0].map.dev.indexOf('sound') !== -1);

// ---- range buttons: no gaps a user has to jump over ----
{
    const wins = (lastHtml.match(/data-win="(\d+)"/g) || []).map(s => Number(/\d+/.exec(s)[0]));
    ok('the range strip runs 15m → 30d',
        JSON.stringify(wins) === JSON.stringify([15, 30, 60, 120, 180, 240, 480, 960, 1440, 4320, 10080, 43200]));
    ok('the in-between ranges are labelled 30m / 2h / 3h',
        lastHtml.includes('data-win="30" class="">30m<') && lastHtml.includes('>2h<') && lastHtml.includes('>3h<'));
    ok('1h is still the one selected on open', /data-win="60" class="sel"/.test(lastHtml));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
