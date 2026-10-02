// X-480 — A STOPPED TURN SAYS WHO STOPPED IT, AND A TURN NOBODY STOPPED SAYS THAT.
//
// 2026-10-02 20:00:05 UTC: a revived relay leg's nudge turn ended two seconds in
// as `[Request interrupted by user]` / "turn interrupted", the leg sat idle and
// the chain stalled. Every stop Agent Farm can send goes through ONE writer
// (ConsoleHost.interrupt), yet the card kept no trace of which surface had
// called it — an empty interrupt receipt is silent by design — so the source
// could not be told apart afterwards: Esc or ⎋ in the Console, the phone's view,
// the card's menu, the Interrupt command, the bridge or Telegram.
//
// Pinned here: (1) the stop names its surface on the turn's closing row, and a
// turn the engine ended as interrupted with no stop asked says THAT; (2) the
// engine's own words still win (X-26) and are never re-labelled by guesswork;
// (3) a new turn starts with no stop asked; (4) the host records the stop only on
// a turn that is running; (5) every caller in the source names its surface.
const Module = require('module');
const path = require('path');
const fs = require('fs');
const cp = require('child_process');
const { EventEmitter } = require('events');

class Emitter {
    constructor() { this.handlers = []; }
    get event() { return (fn) => { this.handlers.push(fn); return { dispose() { } }; }; }
    fire(v) { for (const h of this.handlers) h(v); }
    dispose() { }
}
const fakeVscode = {
    EventEmitter: Emitter,
    window: {
        showInformationMessage: () => Promise.resolve(undefined),
        showWarningMessage: () => Promise.resolve(undefined)
    },
    commands: { executeCommand: () => Promise.resolve(undefined) }
};
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') { return fakeVscode; }
    return origLoad.apply(this, arguments);
};
const written = [];
function fakeChild() {
    const child = new EventEmitter();
    const pipe = () => { const s = new EventEmitter(); s.setEncoding = () => { }; s.destroy = () => { }; return s; };
    child.stdout = pipe(); child.stderr = pipe();
    child.stdin = { write: (l) => { written.push(String(l)); return true; }, end: () => { } };
    child.pid = 4321; child.kill = () => { };
    return child;
}
cp.spawn = () => fakeChild();
cp.exec = (_c, cb) => { if (typeof cb === 'function') { cb(null, '', ''); } };
cp.execSync = () => '';
cp.execFile = (_c, _a, _o, cb) => {
    const done = typeof _o === 'function' ? _o : cb;
    if (typeof done === 'function') { done(null, '', ''); }
    return new EventEmitter();
};

const out = (f) => path.resolve(__dirname, '../out/core', f);
const { reduceEvent, newSessionState, acceptUserText } = require(out('consoleproto.js'));
const { stopWords, NO_STOP_ASKED } = require(out('stopSource.js'));
const { ConsoleHost } = require(out('consolehost.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const NOW = 1790971203023;
const fresh = () => newSessionState({ id: 'c1', agentId: 'dev', agentName: 'developer', cwd: '/x', now: NOW });
const reduce = (s, ev, now = NOW) => reduceEvent(s, ev, now).state;
const working = (extra) => ({ ...fresh(), status: 'working', turnStartedAt: NOW, ...extra });
const cut = { type: 'result', subtype: 'error_during_execution', is_error: true, total_cost_usd: 0 };
const last = (s) => s.messages[s.messages.length - 1];

// ---------- (1) the closing row names the stop, or says there was none ----------
{
    const asked = reduce(working({ stopAsked: { from: 'console-esc', ts: NOW + 1000 } }), cut, NOW + 2094);
    ok('‼️ a stop asked from the Console with Esc is named on the closing row',
        last(asked).text === `turn interrupted · ${stopWords('console-esc')}` && /Esc/.test(stopWords('console-esc')));
    ok('the stop is consumed with the turn', asked.stopAsked === undefined);
    const phone = reduce(working({ stopAsked: { from: 'phone-button', ts: NOW + 1000 } }), cut, NOW + 2094);
    ok('‼️ the phone is told apart from the PC', /phone/.test(last(phone).text) && !/Console/.test(stopWords('phone-button')));
    const nobody = reduce(working(), cut, NOW + 2094);
    ok('‼️ a turn the engine ended as interrupted, with no stop asked, says nothing in Agent Farm asked',
        last(nobody).text === `turn interrupted · ${NO_STOP_ASKED}`);
    ok('… and its outcome is still the subtype\'s', nobody.lastTurn.outcome === 'interrupted');
    const every = ['console-esc', 'console-button', 'phone-esc', 'phone-button', 'card-menu', 'command', 'bridge', 'telegram'];
    ok('every surface has its own words', new Set(every.map(stopWords)).size === every.length
        && every.every(f => stopWords(f).length > 8 && stopWords(f) !== NO_STOP_ASKED));
}

// ---------- (2) the engine's own words still win, and are not re-labelled ----------
{
    const refusal = { ...cut, error: 'invalid model selection (--model "x")', result: 'invalid model selection (--model "x")' };
    const said = reduce(working(), refusal, NOW + 900);
    ok('‼️ X-26: a failure in the engine\'s own words is shown as they are, with no claim about a stop',
        last(said).text === 'invalid model selection (--model "x")');
    const saidAsked = reduce(working({ stopAsked: { from: 'bridge', ts: NOW } }), { ...cut, error: 'turn cancelled' }, NOW + 900);
    ok('an engine that answers a stop in its own words keeps them, and the stop is named after them',
        last(saidAsked).text === `turn cancelled · ${stopWords('bridge')}`);
    const clean = reduce(working({ stopAsked: { from: 'command', ts: NOW } }),
        { type: 'result', subtype: 'success', is_error: false, total_cost_usd: 0 }, NOW + 900);
    ok('a turn that finished anyway carries no stop words, and lets go of the request', !/stopped/.test(last(clean).text || '')
        && clean.stopAsked === undefined);
}

// ---------- (3) a new turn starts with no stop asked ----------
{
    const idle = { ...fresh(), status: 'idle', stopAsked: { from: 'bridge', ts: NOW } };
    const r = acceptUserText(idle, 'go on', NOW + 5);
    ok('‼️ a new turn clears a stop asked before it', r.send === true && r.state.stopAsked === undefined);
}

// ---------- (4) the host records the stop only on a running turn ----------
{
    const host = new ConsoleHost(() => 'claude');
    const id = host.start({ agentId: 'dev', agentName: 'developer', cwd: process.cwd(), engine: 'claude', permissionMode: 'default' });
    host.interrupt(id, 'bridge');
    ok('a stop asked of a seat with no turn running is not recorded', host.get(id).stopAsked === undefined);
    host.send(id, 'work');
    ok('the seat is working', host.get(id).status === 'working');
    written.length = 0;
    host.interrupt(id, 'console-esc');
    ok('‼️ a stop asked of a running turn is recorded with its surface', host.get(id).stopAsked
        && host.get(id).stopAsked.from === 'console-esc');
    ok('… and the engine is still asked to stop', written.some(l => /"subtype":"interrupt"/.test(l)));
}

// ---------- (5) every caller names its surface ----------
{
    const src = (f) => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
    // Each call's own argument list, read to its matching parenthesis: a
    // top-level comma is a second argument (the surface).
    const argsAt = (s, open) => {
        let depth = 0;
        for (let i = open; i < s.length; i++) {
            if (s[i] === '(') { depth++; }
            else if (s[i] === ')') { depth--; if (depth === 0) { return s.slice(open + 1, i); } }
        }
        return '';
    };
    const topComma = (a) => {
        let depth = 0;
        for (const ch of a) {
            if ('([{'.includes(ch)) { depth++; } else if (')]}'.includes(ch)) { depth--; }
            else if (ch === ',' && depth === 0) { return true; }
        }
        return false;
    };
    const calls = [];
    for (const f of ['extension.ts', 'panels/consolePanel.ts']) {
        const s = src(f);
        const re = /\b(?:consoleHost|host)\.interrupt\(/g;
        let m;
        while ((m = re.exec(s))) { calls.push({ f, args: argsAt(s, m.index + m[0].length - 1) }); }
    }
    // bridge ×2, Telegram ×2, the two commands, the Console page
    ok('the callers are found', calls.length >= 7);
    ok('‼️ every call to ConsoleHost.interrupt passes the surface that asked',
        calls.every(c => topComma(c.args)));
    const page = fs.readFileSync(path.join(__dirname, '..', 'media', 'console.js'), 'utf8');
    ok('the Console page says whether it was Esc or the ⎋ button',
        /type: 'interrupt', id: cur\.id, how: 'esc'/.test(page) && /type: 'interrupt', id: DATA\.selected, how: 'button'/.test(page));
    ok('the panel tells a phone\'s view from the PC\'s',
        /this\.surface\.remote\s*\?\s*\(esc \? 'phone-esc' : 'phone-button'\)\s*:\s*\(esc \? 'console-esc' : 'console-button'\)/
            .test(src('panels/consolePanel.ts')));
}

Module._load = origLoad;
console.log(`test_stop_provenance: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
