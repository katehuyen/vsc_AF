// Agent Farm — acquireVsCodeApi for a page the remote host serves (X-443).
//
// Inside VS Code the webview already has acquireVsCodeApi and this file does
// nothing. On the phone the page's own code stays as it is: its postMessage
// goes to the Android shell's bridge (afShell.post), which carries it to the
// farm as view.msg; the farm's view.post messages arrive as ordinary window
// "message" events, which the shell dispatches. State lives per view in
// sessionStorage, which the shell clears when the app locks.
(function () {
    'use strict';
    if (typeof window.acquireVsCodeApi === 'function') { return; }
    var key = 'afRemoteState:' + location.pathname + location.search;
    var api = null;
    window.acquireVsCodeApi = function () {
        if (api) { return api; }
        api = {
            postMessage: function (m) {
                if (window.afShell && typeof window.afShell.post === 'function') { window.afShell.post(JSON.stringify(m)); }
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
