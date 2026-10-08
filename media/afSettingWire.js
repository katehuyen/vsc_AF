// Agent Farm — Farm Settings: what the page's own controls do — the search box, the chips, the scalar boxes, the folder and Claude Code sections.
// Split out of media/settings.js unchanged (U-225): the page hands its state in once, as X.
(function () {
    'use strict';
    let X, agentEngine, bodySoon, errors, render, vscode;

    function wirePage(bodyOnly, enterLetsGo) {
        if (!bodyOnly) { window.AFHeader.wire(vscode); }
        // X-456 — the phone's own reach and port: shown on a phone, changed on the PC (settingsPhone.ts).
        (X.DATA.phoneLocked || []).forEach(k => ['data-set', 'data-reset', 'data-zero'].forEach(a =>
            document.querySelectorAll(`[${a}="${k}"]`).forEach(el => { el.disabled = true; })));
        const openJson = !bodyOnly && document.getElementById('opensettingsjson');
        if (openJson) {
            openJson.addEventListener('click', () => vscode.postMessage({ type: 'openSettingsJson' }));
        }
        // U-84 — the bridge card's own controls, wired by the component that
        // drew them. Safe on a draw that has no card: every lookup finds nothing.
        window.AFTelegram.wire(m => vscode.postMessage(m));
        // U-152 — the Flow & Content card; a new attempt clears the last refusal.
        window.AFFlexSettings.wire(m => { delete errors.flex; vscode.postMessage(m); });
        const dcMode = document.getElementById('docopenmode');
        if (dcMode) { dcMode.addEventListener('change', () => vscode.postMessage({ type: 'docOpenSet', field: 'defaultMode', value: dcMode.value })); }
        const dcCmd = document.getElementById('docopencmd');
        if (dcCmd) { dcCmd.addEventListener('change', () => vscode.postMessage({ type: 'docOpenSet', field: 'customCommand', value: dcCmd.value })); }
        const dcArgs = document.getElementById('docopenargs');
        if (dcArgs) { dcArgs.addEventListener('change', () => vscode.postMessage({ type: 'docOpenSet', field: 'customArgs', value: dcArgs.value })); }
        // U-139 — the two "Open with" boxes are one-line settings like any
        // other; see enterLetsGo above for why blur is the mechanism.
        enterLetsGo(dcCmd);
        enterLetsGo(dcArgs);
        // Saved prompts — the same three gestures the Console picker offers, so
        // whichever door you came in by, the buttons mean the same thing.
        const onClick = (id, type) => {
            const el = document.getElementById(id);
            if (el) { el.addEventListener('click', () => vscode.postMessage({ type })); }
        };
        // Engines — three gestures, and the host owns all three: a terminal it
        // opens, the vault form it already has, and a link. Nothing about a
        // credential is decided on this page.
        //
        // ‼️ ONE GESTURE, NOT TWO. Install and Sign in do exactly the same
        // thing — write a command into a terminal without running it — so they
        // are one binding carrying whichever command the row offered. It was
        // called `engineLogin` while it already wrote something that was not a
        // login; a handler whose name is a lie is the next reader's bug.
        document.querySelectorAll('[data-engcmd]').forEach(b =>
            b.addEventListener('click', () =>
                vscode.postMessage({ type: 'engineCommand', command: b.dataset.engcmd })));
        document.querySelectorAll('[data-engkey]').forEach(b =>
            b.addEventListener('click', () =>
                vscode.postMessage({ type: 'engineKey', name: b.dataset.engkey })));
        document.querySelectorAll('[data-engdocs]').forEach(b =>
            b.addEventListener('click', () =>
                vscode.postMessage({ type: 'engineDocs', url: b.dataset.engdocs })));
        onClick('openengines', 'openEngines');
        onClick('openaccounts', 'openAccounts');
        onClick('promptspick', 'promptsPick');
        onClick('promptsopen', 'promptsOpen');
        onClick('promptsreload', 'promptsReload');
        onClick('promptsdefault', 'promptsUseDefault');
        // X-57 — the wiki root. Choosing the folder is the ordinary Browse…
        // binding below (the setting declares itself a folder in the schema);
        // these four are the acts a text box cannot do.
        onClick('wikiinit', 'wikiInit');
        onClick('wikirescan', 'wikiRescan');
        onClick('wikireveal', 'wikiReveal');
        onClick('wikiopen', 'wikiOpen');
        // X-136 — the folder gestures, and the per-agent default. The box
        // writes ONE agent's row; the host normalises the key onto whatever
        // spelling is already in the setting, so ticking `Developer` beside an
        // existing `developer` cannot leave two rows for one agent.
        onClick('sprescan', 'spRescan');
        onClick('spreveal', 'spReveal');
        document.querySelectorAll('[data-spagent]').forEach(el =>
            el.addEventListener('change', () => vscode.postMessage({
                type: 'spDefault', agent: el.dataset.spagent, on: el.checked
            })));
        const filterEl = !bodyOnly && document.getElementById('filter');
        if (filterEl) {
            filterEl.addEventListener('input', () => {
                // the box is a QUERY, not a substring — media/afQuery.js. Kept as
                // typed: the grammar decides its own case handling.
                X.filter = filterEl.value;
                // ‼️ U-143/U-224 — the box is never rebuilt while it is typed in, so the
                // caret stays wherever the reader put it: only #setbody is redrawn.
                bodySoon();
            });
            filterEl.addEventListener('keydown', ev => {
                if (ev.key === 'ArrowDown') {
                    const first = window.AFSettingResults.firstControl(document);
                    if (first) { ev.preventDefault(); first.focus(); }
                    return;
                }
                if (ev.key !== 'Escape' || !filterEl.value) { return; }
                ev.preventDefault();
                filterEl.value = '';
                filterEl.dispatchEvent(new Event('input', { bubbles: true }));
            });
            window.AFFilter.clearable(filterEl);
            // the wrapper takes the box's place, so it takes the box's width too
            const clrWrap = filterEl.parentNode;
            if (clrWrap && clrWrap.className === 'af-clr') {
                clrWrap.style.width = '100%';
                clrWrap.style.maxWidth = '420px';
            }
        }
        const chip = !bodyOnly && document.getElementById('setchanged');
        if (chip) {
            chip.addEventListener('click', () => {
                X.changedOnly = !X.changedOnly;
                render();
                const again = document.getElementById('setchanged');
                if (again) { again.focus(); }
            });
        }
        const showAll = document.getElementById('setclear');
        if (showAll) {
            showAll.addEventListener('click', () => {
                X.filter = '';
                X.changedOnly = false;
                render();
                const box = document.getElementById('filter');
                if (box) { box.focus(); }
            });
        }
        document.querySelectorAll('[data-guide]').forEach(el =>
            el.addEventListener('click', () => vscode.postMessage({ type: 'openGuide', anchor: el.dataset.guide })));

        document.querySelectorAll('[data-set]').forEach(el => {
            el.addEventListener('change', () => {
                delete errors[el.dataset.set];
                const value = el.type === 'checkbox' ? el.checked : el.value;
                vscode.postMessage({ type: 'set', key: el.dataset.set, value });
            });
            enterLetsGo(el);
        });
        // U-227 — a row's one-line text or path box empties with its ✕, and emptying it saves as typing would
        document.querySelectorAll('[data-clr]').forEach(el =>
            window.AFFilter.clearable(el, box => box.dispatchEvent(new Event('change'))));
        // U-227 — a number whose 0 means off: off writes 0; on brings back its default, or opens the box for a figure
        document.querySelectorAll('[data-zero]').forEach(sw => sw.addEventListener('change', () => {
            const key = sw.dataset.zero;
            const box = document.getElementById('c-' + X.shortKey(key));
            const def = Number((X.allItems().find(i => i.key === key) || {}).default) || 0;
            delete errors[key];
            if (!sw.checked) { vscode.postMessage({ type: 'set', key, value: 0 }); }
            else if (def) { vscode.postMessage({ type: 'set', key, value: def }); }
            else if (box) { box.disabled = false; box.focus(); }
        }));
        /**
         * ‼️ U-139 — ENTER LETS GO OF A SCALAR BOX, WHICH IS HOW IT SAVES.
         *
         * A one-line setting saves on `change`, and `change` fires on blur — so
         * a reader who typed a value and pressed Enter watched nothing happen
         * and had to click elsewhere to commit it. Blur is deliberately the
         * mechanism rather than a second postMessage: the page HOLDS a
         * background refresh while a field has focus (the `focusin`/`focusout`
         * guard below), so an Enter that kept focus would write the value and
         * leave the old one on screen. The alert-sound rows, the quiet hours
         * and the announcement template already do exactly this; these are the
         * boxes that were missed.
         */
    }

    function wireAgents(enterLetsGo) {
        // Agent folders section
        const rootAdd = document.getElementById('rootadd');
        if (rootAdd) { rootAdd.addEventListener('click', () => vscode.postMessage({ type: 'rootAdd' })); }
        const cleanDupes = document.getElementById('afcleandupes');
        if (cleanDupes) { cleanDupes.addEventListener('click', () => vscode.postMessage({ type: 'rootCleanDupes' })); }
        document.querySelectorAll('[data-rootremove]').forEach(btn =>
            btn.addEventListener('click', () => vscode.postMessage({ type: 'rootRemove', root: btn.dataset.rootremove })));
        document.querySelectorAll('[data-rootreveal]').forEach(btn =>
            btn.addEventListener('click', () => vscode.postMessage({ type: 'rootReveal', root: btn.dataset.rootreveal })));
        document.querySelectorAll('[data-exclude]').forEach(a =>
            a.addEventListener('click', () => vscode.postMessage({ type: 'agentExclude', dir: a.dataset.exclude })));
        document.querySelectorAll('[data-include]').forEach(a =>
            a.addEventListener('click', () => vscode.postMessage({ type: 'agentInclude', dir: a.dataset.include })));
        document.querySelectorAll('[data-openagent]').forEach(a =>
            a.addEventListener('click', () => vscode.postMessage({ type: 'openAgent', agentId: a.dataset.openagent })));
        document.querySelectorAll('[data-agmodel]').forEach(el =>
            el.addEventListener('change', () => {
                if (el.value === '__custom__') {
                    X.customModelDir = el.dataset.agmodel;
                    render();
                    const inp = document.querySelector('[data-agcustom]');
                    if (inp && inp.focus) { inp.focus(); }
                    return;
                }
                vscode.postMessage({ type: 'agentModel', dir: el.dataset.agmodel, model: el.value, engine: agentEngine() });
            }));
        document.querySelectorAll('[data-ageffort]').forEach(el =>
            el.addEventListener('change', () => vscode.postMessage({
                type: 'agentEffort', dir: el.dataset.ageffort, effort: el.value, engine: agentEngine()
            })));
        document.querySelectorAll('[data-agaccount]').forEach(el =>
            el.addEventListener('change', () => vscode.postMessage({
                type: 'agentAccount', dir: el.dataset.agaccount, account: el.value, engine: agentEngine()
            })));
        // ‼️ The engine strip is a PAGE state, not a per-agent one: it says which
        // engine's defaults the boxes below are editing. Kept on the host so it
        // survives the refresh that follows every write.
        document.querySelectorAll('[data-agengine]').forEach(b =>
            b.addEventListener('click', () => vscode.postMessage({
                type: 'agentDefaultsEngine', engine: b.dataset.agengine
            })));
        document.querySelectorAll('[data-agcustom]').forEach(el =>
            el.addEventListener('keydown', ev => {
                if (ev.key === 'Enter') {
                    X.customModelDir = '';
                    vscode.postMessage({ type: 'agentModel', dir: el.dataset.agcustom, model: el.value.trim(), engine: agentEngine() });
                } else if (ev.key === 'Escape') {
                    X.customModelDir = '';
                    render();
                }
            }));

        // Claude Code section
        document.querySelectorAll('[data-ccset]').forEach(el => {
            el.addEventListener('change', () => {
                delete errors['cc:' + el.dataset.ccset];
                const value = el.type === 'checkbox' ? el.checked : el.value;
                vscode.postMessage({ type: 'ccSet', id: el.dataset.ccset, value });
            });
            enterLetsGo(el);
        });
        document.querySelectorAll('[data-ccclear]').forEach(btn =>
            btn.addEventListener('click', () => {
                delete errors['cc:' + btn.dataset.ccclear];
                vscode.postMessage({ type: 'ccClear', id: btn.dataset.ccclear });
            }));
        const ccOpen = document.getElementById('ccopen');
        if (ccOpen) { ccOpen.addEventListener('click', () => vscode.postMessage({ type: 'ccOpenFile' })); }
        const ccApply = document.getElementById('ccrawapply');
        if (ccApply) {
            ccApply.addEventListener('click', () => {
                delete errors['cc:__raw__'];
                const ta = document.getElementById('ccraw');
                X.ccRawSent = { was: X.DATA.claude ? String(X.DATA.claude.raw) : '' };
                vscode.postMessage({ type: 'ccRaw', text: ta ? ta.value : '' });
            });
        }
    }

    /** The setting sets bar — drawn only while its section is open (U-228), so nothing here may assume it. */
    function wireProfiles() {
        const sel = document.getElementById('profsel');
        if (!sel) { return; }
        document.getElementById('profapply').addEventListener('click', () => {
            if (sel.value) { vscode.postMessage({ type: 'applyProfile', name: sel.value }); }
        });
        document.getElementById('profdel').addEventListener('click', () => {
            if (sel.value) { vscode.postMessage({ type: 'deleteProfile', name: sel.value }); }
        });
        document.getElementById('profsave').addEventListener('click', () => {
            X.saveOpen = !X.saveOpen;
            render();
            const inp = document.getElementById('profname');
            if (inp) { inp.focus(); }
        });
        const confirm = document.getElementById('profconfirm');
        if (confirm) {
            const send = () => {
                const inp = document.getElementById('profname');
                if (inp && inp.value.trim()) {
                    vscode.postMessage({ type: 'saveProfile', name: inp.value.trim() });
                    X.saveOpen = false;
                }
            };
            confirm.addEventListener('click', send);
            document.getElementById('profname').addEventListener('keydown', ev => { if (ev.key === 'Enter') { send(); } });
        }
        document.getElementById('profexport').addEventListener('click', () => vscode.postMessage({ type: 'exportProfiles' }));
        document.getElementById('profimport').addEventListener('click', () => vscode.postMessage({ type: 'importProfiles' }));
    }

    window.AFSettingWire = function (ctx) {
        X = ctx;
        ({ agentEngine, bodySoon, errors, render, vscode } = ctx);
        return { wirePage, wireAgents, wireProfiles };
    };
})();
