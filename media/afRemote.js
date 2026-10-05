// Agent Farm — acquireVsCodeApi for a page the remote host serves (X-443).
//
// Inside VS Code the webview already has acquireVsCodeApi and this file does
// nothing. On the phone the page's own code stays as it is: its postMessage
// goes to the Android shell's bridge (afShell.post), which carries it to the
// farm as view.msg; the farm's view.post messages arrive as ordinary window
// "message" events, which the shell dispatches. State lives per view in
// sessionStorage, which the shell clears when the app locks.
//
// X-456 — a page opening a transcript (a Sessions row, a search hit, a task's
// run, the viewer's chain arrows) would open a tab on the PC; on the phone the
// same click opens the "session" page in the shell instead, and Back returns.
(function () {
    'use strict';
    if (typeof window.acquireVsCodeApi === 'function') { return; }
    var key = 'afRemoteState:' + location.pathname + location.search;
    var api = null;
    var READS = { openSession: true, 'open-transcript': true, chainGo: true };
    function readOf(m) {
        // a project timeline row's link to a transcript is the same read
        if (m && m.type === 'openLink' && m.link && m.link.to === 'session') {
            m = { type: 'openSession', sessionId: m.link.sessionId, file: m.link.file, ts: m.link.ts };
        }
        if (!m || READS[m.type] !== true) { return null; }
        var args = {};
        if (typeof m.sessionId === 'string' && m.sessionId) { args.sessionId = m.sessionId; }
        if (typeof m.file === 'string' && m.file) { args.file = m.file; }
        if (!args.sessionId && !args.file) { return null; }
        if (typeof m.ts === 'number' && m.ts > 0) { args.ts = m.ts; }
        if (Array.isArray(m.roles)) { args.roles = m.roles.filter(function (r) { return typeof r === 'string'; }); }
        return { type: 'afnav', to: 'session', args: args };
    }
    // S-125 — a ⑂ mark's `chains:<id>` is the phone's Chains page told which chain (a page id has no colon)
    function chainOf(m) {
        var at = m && m.type === 'afnav' && typeof m.to === 'string' ? /^chains:(.+)$/.exec(m.to) : null;
        return at ? { type: 'afnav', to: 'chains', args: { chain: at[1] } } : null;
    }
    // X-456 — an agent's name, card or row opens that agent's page on the phone
    function agentOf(m) {
        return m && m.type === 'openAgent' && typeof m.agentId === 'string' && m.agentId
            ? { type: 'afnav', to: 'agent', args: { agentId: m.agentId } } : null;
    }
    // A message posted while the user's own press is being handled carries afPress, so the farm
    // can say on the phone why it did nothing; one the page sends by itself never does. The farm
    // takes the mark off before the page's handler sees it.
    var pressing = false;
    // answered by the shell itself (and_AgentFarm ShellRequest): they never reach the farm
    var SHELL = { afnav: true, afClipboard: true, afVoice: true };
    function pressStart(e) {
        if (e.type === 'keydown' && e.key !== 'Enter') { return; }
        pressing = true;
        setTimeout(pressEnd, 0);
    }
    function pressEnd() { pressing = false; }
    if (typeof window.addEventListener === 'function') {
        ['click', 'change', 'submit', 'keydown'].forEach(function (t) {
            window.addEventListener(t, pressStart, true);
            window.addEventListener(t, pressEnd, false);
        });
    }
    window.acquireVsCodeApi = function () {
        if (api) { return api; }
        api = {
            postMessage: function (m) {
                var out = readOf(m) || chainOf(m) || agentOf(m) || m;
                if (pressing && out && typeof out === 'object' && SHELL[out.type] !== true) { out = Object.assign({}, out, { afPress: true }); }
                if (window.afShell && typeof window.afShell.post === 'function') { window.afShell.post(JSON.stringify(out)); }
            },
            getState: function () {
                try {
                    var s = window.sessionStorage.getItem(key);
                    return s ? JSON.parse(s) : undefined;
                } catch (e) { return undefined; }
            },
            setState: function (s) {
                try { window.sessionStorage.setItem(key, JSON.stringify(s)); } catch (e) { /* storage full or off */ }
                return s;
            }
        };
        return api;
    };
})();
