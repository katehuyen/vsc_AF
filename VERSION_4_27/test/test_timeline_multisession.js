// DOM-stub test: timeline.js with the SAME agent open in two concurrent
// sessions — per-session swim-lane tracks + per-session alert overrides.
const fs = require('fs');
const vm = require('vm');

const code = fs.readFileSync(require('path').resolve(__dirname, '../media/pageHeader.js'), 'utf8') + '\n' + fs.readFileSync(require('path').resolve(__dirname, '../media/timeline.js'), 'utf8');
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
        AFCharts: { esc: (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') },
        __DATA__: {
            listener: { state: 'listening', port: 1 },
            sessions: [
                // the SAME agent, two concurrent sessions
                { sessionId: 'S1', agentName: 'dev', label: 'dev #1', status: 'working', prompts: 1, toolCalls: 0, compactions: 0, subagentStops: 0, startedAt: NOW - 40 * MIN, lastEventTs: NOW - 30 * MIN },
                { sessionId: 'S2', agentName: 'dev', label: 'dev #2', status: 'waiting-input', prompts: 1, toolCalls: 1, compactions: 0, subagentStops: 0, startedAt: NOW - 20 * MIN, lastEventTs: NOW - 14 * MIN },
                // another agent with one live session
                { sessionId: 'S3', agentName: 'ops', label: 'ops', status: 'idle', prompts: 0, toolCalls: 0, compactions: 0, subagentStops: 0, startedAt: NOW - 10 * MIN, lastEventTs: NOW - 10 * MIN }
            ],
            events: [
                { sessionId: 'S1', agentName: 'dev', ts: NOW - 30 * MIN, kind: 'prompt', detail: 'p1' },
                { sessionId: 'S2', agentName: 'dev', ts: NOW - 15 * MIN, kind: 'toolStart', tool: 'Bash' },
                { sessionId: 'S2', agentName: 'dev', ts: NOW - 14 * MIN, kind: 'toolEnd', tool: 'Bash' },
                // an EARLIER, ended ops session — sequential, so it must SHARE the ops row
                { sessionId: 'SOLD', agentName: 'ops', ts: NOW - 50 * MIN, kind: 'prompt', detail: 'old' },
                { sessionId: 'SOLD', agentName: 'ops', ts: NOW - 45 * MIN, kind: 'end' }
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
ok('three lane rows total (svg height)', lastHtml.indexOf('viewBox="0 0 900 170"') !== -1);
// S1's prompt mark sits in row 0 (cy = 22 + 23), S2's tool segment in row 1 (y = 22+46+23-7)
ok('S1 mark drawn in first dev row', /<circle cx="[\d.]+" cy="45" r="4\.2"/.test(lastHtml));
ok('S2 segment drawn in second dev row', /<rect x="[\d.]+" y="84" width="[\d.]+" height="14"/.test(lastHtml));

// ---- gutter toggles: agent default, drawn ONCE per agent ----
const gutterDev = (lastHtml.match(/<g class="af-toggle" data-agent="dev"/g) || []).length;
const gutterOps = (lastHtml.match(/<g class="af-toggle" data-agent="ops"/g) || []).length;
ok('dev gutter toggles only on its first row (4 not 8)', gutterDev === 4);
ok('ops gutter toggles present once (4)', gutterOps === 4);

// ---- session cards: disambiguated titles + per-session chips ----
ok('card titled dev #1', lastHtml.indexOf('<h3 style="margin:0">dev #1</h3>') !== -1);
ok('card titled dev #2', lastHtml.indexOf('<h3 style="margin:0">dev #2</h3>') !== -1);
ok('cards show start time', /started \d{2}:\d{2}/.test(lastHtml));
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
