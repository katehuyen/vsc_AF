// DOM-stub test for timeline.js swim-lane turn-ready toggles (real page handlers).
const fs = require('fs');
const vm = require('vm');

const shared = require(require('path').join(__dirname, 'lib_shared_media.js'));
const code = shared.sharedMedia() + fs.readFileSync(require('path').resolve(__dirname, '../media/timeline.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

let posted = [];
let lastHtml = '';
let lastToggleEls = [];

function elemsForSelector(sel) {
    if (sel === '.af-toggle') {
        const els = [];
        const re = /<g class="af-toggle" data-agent="([^"]*)" data-action="([^"]*)"/g;
        let m;
        while ((m = re.exec(lastHtml))) {
            const el = { dataset: { agent: m[1], action: m[2] } };
            el.addEventListener = (_e, fn) => { el._click = fn; };
            els.push(el);
        }
        lastToggleEls = els;
        return els;
    }
    return [];
}

const appEl = { set innerHTML(v) { lastHtml = v; }, get innerHTML() { return lastHtml; } };
const stubEl = { addEventListener() { }, set innerHTML(v) { } };

const sandbox = {
    acquireVsCodeApi: () => ({ postMessage: (m) => posted.push(m), getState() { }, setState() { } }),
    window: {
        AFCharts: { esc: (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') },
        __DATA__: {
            listener: { state: 'listening', port: 1 },
            sessions: [{ sessionId: 'S1', agentName: 'dev', label: 'dev', status: 'waiting-input', prompts: 1, toolCalls: 0, compactions: 0, subagentStops: 0, startedAt: Date.now() - 60000, lastEventTs: Date.now() }],
            events: [], workflowRuns: [], turnActions: { dev: ['sound'] }, sessionTurnActions: {}
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

const grp = (action) => {
    const m = new RegExp('<g class="af-toggle" data-agent="dev" data-action="' + action + '"[\\s\\S]*?</g>').exec(lastHtml);
    return m ? m[0] : '';
};
ok('sound toggle ON (blue fill)', /fill="var\(--vscode-charts-blue/.test(grp('sound')));
ok('modal toggle OFF (transparent)', /fill="transparent"/.test(grp('modal')));
ok('all four toggles present', ['sound', 'focus', 'modal', 'toast'].every(a => grp(a).length > 0));

// Click sound (ON) via the page's own wired handler → OFF, agent dropped from map.
posted = [];
lastToggleEls.find(e => e.dataset.action === 'sound')._click();
ok('post is setTurnActions', posted.length === 1 && posted[0].type === 'setTurnActions');
ok('turning off last action drops agent', !('dev' in posted[0].map));
ok('re-render shows sound OFF now', /fill="transparent"/.test(grp('sound')));

// Now click modal (OFF) → ON, map {dev:['modal']}.
posted = [];
lastToggleEls.find(e => e.dataset.action === 'modal')._click();
ok('modal added to map', posted[0].map.dev && posted[0].map.dev.indexOf('modal') !== -1);
ok('re-render shows modal ON', /fill="var\(--vscode-charts-blue/.test(grp('modal')));

// ---------------------------------------------------------------------------
// Two CONCURRENT sessions of one agent: the lanes pack into "dev #1" / "dev #2".
// The toggles used to be drawn on the first row only, which left the second row
// with an empty gutter that read as a broken row. Every row carries them now,
// they all point at the same agent key, and the tooltip says so.
// ---------------------------------------------------------------------------
function boot(sessions, turnActions) {
    let html = '';
    const els = [];
    const app = { set innerHTML(v) { html = v; }, get innerHTML() { return html; } };
    const stub = { addEventListener() { }, set innerHTML(v) { } };
    const box = {
        acquireVsCodeApi: () => ({ postMessage() { }, getState() { }, setState() { } }),
        window: {
            AFCharts: { esc: (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') },
            __DATA__: { listener: { state: 'listening', port: 1 }, sessions, events: [], workflowRuns: [], turnActions, sessionTurnActions: {} },
            addEventListener() { }
        },
        document: {
            getElementById: (id) => id === 'app' ? app : (id === 'install' ? null : stub),
            querySelectorAll: (sel) => {
                if (sel !== '.af-toggle') { return []; }
                els.length = 0;
                const re = /<g class="af-toggle" data-agent="([^"]*)" data-action="([^"]*)"/g;
                let m;
                while ((m = re.exec(html))) {
                    const el = { dataset: { agent: m[1], action: m[2] } };
                    el.addEventListener = (_e, fn) => { el._click = fn; };
                    els.push(el);
                }
                return els;
            }
        },
        setInterval: () => 0, console
    };
    box.globalThis = box;
    vm.createContext(box);
    vm.runInContext(code, box);
    return { html, els };
}

const t0 = Date.now() - 120000;
const two = boot([
    { sessionId: 'A', agentName: 'dev', label: 'dev', status: 'working', prompts: 1, toolCalls: 0, compactions: 0, subagentStops: 0, startedAt: t0, lastEventTs: Date.now() },
    { sessionId: 'B', agentName: 'dev', label: 'dev', status: 'waiting-input', prompts: 1, toolCalls: 0, compactions: 0, subagentStops: 0, startedAt: t0 + 1000, lastEventTs: Date.now() }
], { dev: ['sound'] });

ok('two concurrent sessions make two rows', /dev #1/.test(two.html) && /dev #2/.test(two.html));
const gToggles = two.html.match(/<g class="af-toggle" data-agent="dev"/g) || [];
ok('both rows carry all four toggles (8 groups)', gToggles.length === 8);
ok('every toggle points at the agent key, not a session', gToggles.every(g => /data-agent="dev"/.test(g)));
ok('repeated rows say the setting is shared', /they all carry this same one setting/.test(two.html));
ok('shared note names the row count', /has 2 rows here/.test(two.html));
ok('clicking a row-2 toggle still writes the agent default', two.els.length === 8 && two.els[7].dataset.agent === 'dev');

// A single-session agent must NOT get the "shared" sentence — it would be a lie.
const one = boot([
    { sessionId: 'A', agentName: 'solo', label: 'solo', status: 'working', prompts: 1, toolCalls: 0, compactions: 0, subagentStops: 0, startedAt: t0, lastEventTs: Date.now() }
], {});
ok('single row gets the four toggles', (one.html.match(/<g class="af-toggle" data-agent="solo"/g) || []).length === 4);
ok('single row has no shared-setting sentence', !/rows here/.test(one.html));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
