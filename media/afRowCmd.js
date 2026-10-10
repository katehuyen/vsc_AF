// Agent Farm — a host command picked on the phone's row menu (X-443).
//
// A long press on a row (media/afMobile.js) lists the catalogue's page actions and, since X-443, the
// host commands that have a phone answer. Each of those arrives with the farm's verdict for a phone
// (src/core/ctxPhone.ts): `page` opens one of the phone's OWN pages, `copy` puts what the row knows on
// the PHONE's clipboard, and `run` asks the farm to run the same command for this row — whatever it
// then asks or says is asked and said here (media/afAsk.js). A command that stays on the PC is never
// sent to a phone at all, so nothing in this file can open a dialog there.
(function () {
    'use strict';

    function has(ctx, key) {
        var v = ctx ? ctx[key] : undefined;
        return typeof v === 'number' || (typeof v === 'string' && v !== '');
    }

    /** Whether the row carries what the command needs: a page or a copy with nothing to name is not offered. */
    function offers(a, ctx) {
        var p = (a && a.phone) || {};
        if (p.on === 'copy') { return has(ctx, p.key); }
        if (p.on === 'page') { return Object.keys(p.args || {}).some(function (k) { return has(ctx, p.args[k]); }); }
        return p.on === 'run';
    }

    function pick(a, ctx) {
        var p = (a && a.phone) || {};
        if (p.on === 'copy') { window.AFCtx.copy(ctx[p.key]); return; }
        var api = typeof window.acquireVsCodeApi === 'function' ? window.acquireVsCodeApi() : null;
        if (!api) { return; }
        if (p.on === 'page') {
            var args = {};
            Object.keys(p.args || {}).forEach(function (k) { if (has(ctx, p.args[k])) { args[k] = ctx[p.args[k]]; } });
            api.postMessage({ type: 'afnav', to: p.to, args: args });
        } else if (p.on === 'run') {
            api.postMessage({ type: 'afctxcmd', command: a.command, ctx: ctx });
        }
    }

    window.AFRowCmd = { offers: offers, pick: pick };
})();
