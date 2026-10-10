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
    // U-238 — VS Code tells a webview its theme with a body class; the phone has its own: a light
    // device puts vscode-light on the body (media/theme-phone.css, media/theme.css key on it), live.
    (function followDeviceTheme() {
        var mq = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: light)') : null;
        var body = typeof document !== 'undefined' && document.body;
        if (!mq || !body || !body.classList) { return; }
        var apply = function () { body.classList.toggle('vscode-light', mq.matches === true); };
        apply();
        if (typeof mq.addEventListener === 'function') { mq.addEventListener('change', apply); } else if (typeof mq.addListener === 'function') { mq.addListener(apply); }
    })();
    var key ='afRemoteState:' + location.pathname + location.search;
    var api = null;
    var READS = { openSession: true, 'open-transcript': true, chainGo: true, accountOpenSession: true };
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
    // X-456 — a page's ? opens the phone's own guide, at the heading the button names
    function guideOf(m) {
        if (!m || m.type !== 'openGuide') { return null; }
        var args = {};
        if (typeof m.anchor === 'string' && m.anchor) { args.anchor = m.anchor; }
        return { type: 'afnav', to: 'guide', args: args };
    }
    // X-456 — a page's link to a page the phone has (the Tasks page's Analytics and its "need you",
    // the Analytics page's way back to Tasks) opens that page on the phone
    var LINKS = { 'open-analytics': 'analytics', 'open-needs': 'needs', 'open-tasks': 'tasks' };
    function linkOf(m) {
        return m && typeof m.type === 'string' && Object.prototype.hasOwnProperty.call(LINKS, m.type)
            ? { type: 'afnav', to: LINKS[m.type] } : null;
    }
    // X-443 — a page's own "open this file" opens the farm's "file" page on the phone, read-only: the PC's
    // editor is not the phone's. Each page that shows a file names the message that asks for one and what of
    // it says which (an item's id, or a path); the farm finds the file itself in what that page shows
    // (src/core/shownFile.ts, a source per page), so a path it shows nowhere opens nothing.
    var FILE_ASKS = {
        console: ['openFile', function (m) { return { file: m.file, diff: m.diff === true }; }],
        session: ['openEditedFile', function (m) { return { file: m.file, diff: m.diff === true, session: (window.__DATA__ || {}).sessionId }; }],
        queue: ['openFile', function (m) { return { id: m.id, kind: m.kind }; }],
        notices: ['openReport', function (m) { return { id: m.id }; }],
        a2anotes: ['openFile', function (m) { return { id: m.id, file: m.file }; }],
        missions: ['openFile', function (m) { return { file: m.file }; }],
        tasks: ['open-output', function (m) { return { file: m.file }; }],
        board: ['open-output', function (m) { return { file: m.file }; }],
        agent: ['openFile', function (m) { return { file: m.path }; }],
        search: ['openFile', function (m) { return { file: m.file }; }]
    };
    function fileOf(m) {
        var at = /^\/view\/([A-Za-z0-9._-]+)$/.exec(location.pathname);
        var ask = at && Object.prototype.hasOwnProperty.call(FILE_ASKS, at[1]) ? FILE_ASKS[at[1]] : null;
        if (!ask || !m || m.type !== ask[0]) { return null; }
        var args = ask[1](m);
        if (!(typeof args.file === 'string' && args.file) && !(typeof args.id === 'string' && args.id)) { return null; }
        args.from = at[1];
        return { type: 'afnav', to: 'file', args: args };
    }
    // X-443 — a link to the web opens in the phone's own browser, not on the PC: the page goes to it, and the
    // shell (and_AgentFarm PageClient.shouldOverrideUrlLoading) hands every http(s) address that is not the
    // farm's to the browser and keeps the page where it is. Any other scheme still goes to the farm, which
    // says on the phone that it is the PC's.
    function webOf(m) {
        return m && m.type === 'openExternal' && typeof m.url === 'string' && /^https?:\/\/[^\s]+$/i.test(m.url) ? m.url : null;
    }
    // A message posted while the user's own press is being handled carries afPress, so the farm
    // can say on the phone why it did nothing; one the page sends by itself never does. The farm
    // takes the mark off before the page's handler sees it.
    var pressing = false;
    // answered by the shell itself (and_AgentFarm ShellRequest): they never reach the farm
    var SHELL = { afnav: true, afClipboard: true, afVoice: true, afSpeak: true, afSpeakControl: true };
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
                // U-209 — a reading's messages become the phone's own voice's (media/afPhoneRead.js)
                if (window.AFPhoneRead && typeof window.AFPhoneRead.out === 'function') { m = window.AFPhoneRead.out(m); }
                var web = webOf(m);
                if (web) { location.assign(web); return; }
                var out = readOf(m) || chainOf(m) || agentOf(m) || guideOf(m) || linkOf(m) || fileOf(m) || m;
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
