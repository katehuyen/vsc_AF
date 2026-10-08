// Agent Farm — Farm Settings: taking the reader to one setting, and what the right-click menu does on the page.
// Split out of media/settings.js unchanged (U-225): the page hands its state in once, as X.
(function () {
    'use strict';
    let X, errors, render, vscode;

    function focusKey(key) {
        let el = document.querySelector(`[data-item="${key}"]`);
        // U-224 — a row the query or the Changed chip hides is shown: the search gives way to the link.
        // U-228 — a row in a closed section opens it, and its "more" too when the row waits behind it.
        if (!el) {
            const asked = !!(X.filter || X.changedOnly);
            X.filter = '';
            X.changedOnly = false;
            X.reveal(key);
            render(!asked);
            el = document.querySelector(`[data-item="${key}"]`);
        }
        // a key no section holds: the top of the page, quietly
        if (!el) { try { window.scrollTo(0, 0); } catch (e) { /* stub DOM */ } return; }
        if (el.scrollIntoView) { el.scrollIntoView({ block: 'center' }); }
        el.classList.add('flash');
        setTimeout(() => el.classList.remove('flash'), 2500);
    }

    // ------------------------------------------------------- right-click menu

    /**
     * A setting and an agent root, from the right button. Reset and Remove are
     * the page's own messages; the rest is what a settings row was never able
     * to answer — what is this called, what is it set to, and where does VS
     * Code's own editor show it.
     */
    function ctxDo(act, ctx) {
        const verb = act.split(':')[0];
        const arg = act.slice(verb.length + 1);
        switch (verb) {
            case 'stReset':
                delete errors[ctx.setKey];
                vscode.postMessage({ type: 'reset', key: String(ctx.setKey || '') });
                return;
            case 'stOpenUi':
                vscode.postMessage({ type: 'openSettingsUi', key: String(ctx.setKey || '') });
                return;
            // U-227 — the file every box writes into, at this key
            case 'stShowJson':
                vscode.postMessage({ type: 'openSettingsJson', key: String(ctx.setKey || '') });
                return;
            // U-227 — a list, form, table or pairs editor as its raw JSON; the editor's own view-switch, so what is typed goes along
            case 'stJson': {
                const it = X.allItems().find(x => x.key === ctx.setKey);
                const go = it && it.shape && { list: X.listToJson, form: X.formToJson, rows: X.rowsToJson, map: X.mapToJson }[it.shape.kind];
                if (go) { go(it.key); }
                return;
            }
            case 'stCopy': {
                if (arg === 'key') { window.AFCtx.copy(ctx.setKey); return; }
                // The settings live inside their categories, not in a flat list.
                let it;
                for (const cat of (X.DATA.categories || [])) {
                    it = (cat.items || []).find(x => x.key === ctx.setKey);
                    if (it) { break; }
                }
                const v = it ? it.value : undefined;
                window.AFCtx.copy(v === undefined || v === null ? ''
                    : typeof v === 'object' ? JSON.stringify(v) : String(v));
                return;
            }
            case 'rtReveal': vscode.postMessage({ type: 'rootReveal', root: String(ctx.rootPath || '') }); return;
            case 'rtRemove': vscode.postMessage({ type: 'rootRemove', root: String(ctx.rootPath || '') }); return;
            case 'rtAdd': vscode.postMessage({ type: 'rootAdd' }); return;
            case 'rtCopy': window.AFCtx.copy(ctx.rootPath); return;
        }
    }

    window.AFSettingNav = function (ctx) {
        X = ctx;
        ({ errors, render, vscode } = ctx);
        return { focusKey, ctxDo };
    };
})();
