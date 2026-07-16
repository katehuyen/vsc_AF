// Agent Farm — Farm Settings page: schema-driven editor for every agentFarm.*
// setting, with search, per-setting reset, and named setting sets.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    let DATA = window.__DATA__;
    let filter = '';
    let saveOpen = false;          // "Save current as…" inline input visibility
    const errors = {};             // key -> validation error from the host
    // While the user is typing in a field, background refreshes must not wipe
    // the edit — hold the data and apply it when focus leaves (2.47.0 lesson).
    let editing = false;
    let pendingData = null;

    function shortKey(k) { return k.replace(/^agentFarm\./, ''); }

    function fmtDefault(v) {
        if (v === undefined) { return '(none)'; }
        try {
            const s = JSON.stringify(v);
            return s.length > 60 ? s.slice(0, 60) + '…' : s;
        } catch { return String(v); }
    }

    function matches(it) {
        if (!filter) { return true; }
        return (it.key + ' ' + (it.description || '')).toLowerCase().includes(filter);
    }

    function controlHtml(it) {
        const id = `c-${shortKey(it.key)}`;
        if (it.type === 'boolean') {
            return `<input type="checkbox" id="${id}" data-set="${C.esc(it.key)}"${it.value ? ' checked' : ''}>`;
        }
        if (it.enum && it.enum.length) {
            return `<select id="${id}" data-set="${C.esc(it.key)}">${it.enum.map(o =>
                `<option value="${C.esc(o)}"${String(it.value) === o ? ' selected' : ''}>${C.esc(o)}</option>`).join('')}</select>`;
        }
        if (it.type === 'number') {
            return `<input type="number" id="${id}" data-set="${C.esc(it.key)}" value="${C.esc(String(it.value ?? ''))}" style="width:110px">`;
        }
        if (it.type === 'array' || it.type === 'object') {
            let text = '';
            try { text = JSON.stringify(it.value ?? (it.type === 'array' ? [] : {}), null, 2); } catch { text = ''; }
            const rows = Math.min(10, Math.max(2, text.split('\n').length));
            return `<textarea id="${id}" data-json="${C.esc(it.key)}" rows="${rows}" spellcheck="false"
                style="width:100%; font-family:var(--vscode-editor-font-family); font-size:11px">${C.esc(text)}</textarea>
                <button class="secondary small" data-apply="${C.esc(it.key)}">Apply JSON</button>`;
        }
        return `<input type="text" id="${id}" data-set="${C.esc(it.key)}" value="${C.esc(String(it.value ?? ''))}" style="width:100%; max-width:420px">`;
    }

    function itemHtml(it) {
        const err = errors[it.key];
        return `<div class="setitem${it.modified ? ' modified' : ''}" data-item="${C.esc(it.key)}"
            title="${C.esc(it.key)} — default: ${C.esc(fmtDefault(it.default))}">
            <div class="sethead">
                <span class="setname">${C.esc(shortKey(it.key))}</span>
                ${it.modified ? `<span class="moddot" title="Changed from default (${C.esc(fmtDefault(it.default))})"></span>
                    <button class="reset" data-reset="${C.esc(it.key)}" title="Reset to default: ${C.esc(fmtDefault(it.default))}">↺</button>` : ''}
            </div>
            <div class="setdesc">${C.esc(it.description || '')}</div>
            <div class="setctl">${controlHtml(it)}</div>
            ${err ? `<div class="seterr">⚠ ${C.esc(err)}</div>` : ''}
        </div>`;
    }

    // ---- Claude Code (claude CLI) settings — curated + raw JSON ----

    function ccControl(it) {
        const id = `cc-${it.id}`;
        if (it.kind === 'flag' || it.kind === 'boolean') {
            const on = it.kind === 'flag' ? String(it.value) === '1' : it.value === true;
            return `<input type="checkbox" id="${id}" data-ccset="${it.id}"${on ? ' checked' : ''}>`;
        }
        if (it.kind === 'enum') {
            return `<select id="${id}" data-ccset="${it.id}">
                <option value=""${it.set ? '' : ' selected'}>(not set — Claude default)</option>
                ${it.enum.map(o => `<option value="${C.esc(o)}"${String(it.value) === o ? ' selected' : ''}>${C.esc(o)}</option>`).join('')}
            </select>`;
        }
        const t = it.kind === 'number' ? 'number' : 'text';
        return `<input type="${t}" id="${id}" data-ccset="${it.id}" value="${C.esc(it.set ? String(it.value) : '')}"
            placeholder="(not set — Claude default)" style="width:${t === 'number' ? '130px' : '100%'}; max-width:420px">`;
    }

    function ccItemHtml(it) {
        const err = errors['cc:' + it.id];
        return `<div class="setitem${it.set ? ' modified' : ''}" data-item="cc:${it.id}"
            title="${C.esc(it.label)} — not set = Claude Code's own default">
            <div class="sethead">
                <span class="setname">${C.esc(it.label)}</span>
                ${it.set ? `<span class="moddot" title="Set in settings.json"></span>
                    <button class="reset" data-ccclear="${it.id}" title="Remove from settings.json — Claude's own default takes over">↺</button>` : ''}
            </div>
            <div class="setdesc">${C.esc(it.description)}</div>
            <div class="setctl">${ccControl(it)}</div>
            ${err ? `<div class="seterr">⚠ ${C.esc(err)}</div>` : ''}
        </div>`;
    }

    function claudeSection() {
        const cc = DATA.claude;
        if (!cc) { return ''; }
        const items = cc.items.filter(it => !filter || (it.label + ' ' + it.description).toLowerCase().includes(filter));
        if (filter && !items.length) { return ''; }
        const rawErr = errors['cc:__raw__'];
        return `
            <h2 class="cat" id="cat-claude">Claude Code (claude CLI) <span class="muted small">${items.length}</span></h2>
            <p class="muted small" style="max-width:760px">These are <b>claude's own settings</b>, not Agent Farm's — the file behind terminal tips like
            “Set CLAUDE_CODE_USE_POWERSHELL_TOOL=1 …”. Edits write to <code>${C.esc(cc.file)}</code>
            (a one-time <code>.agentfarm-backup</code> copy is kept next to it) and apply to <b>new</b> claude sessions.
            <a id="ccopen">Open the file</a></p>
            ${cc.parseError ? `<div class="seterr">⚠ settings.json could not be parsed (${C.esc(cc.parseError)}) — fix it in the raw editor below; edits are blocked until then.</div>` : ''}
            ${items.map(ccItemHtml).join('')}
            <details class="setitem" style="margin-top:10px">
                <summary style="cursor:pointer">Raw settings.json — everything else (hooks, statusLine, permissions lists…)</summary>
                <div class="setdesc">Full contents of the file. Validated before writing — broken JSON is rejected, never saved.</div>
                <textarea id="ccraw" rows="${Math.min(18, Math.max(4, String(cc.raw).split('\n').length))}" spellcheck="false"
                    style="width:100%; font-family:var(--vscode-editor-font-family); font-size:11px">${C.esc(cc.raw)}</textarea>
                <button class="secondary small" id="ccrawapply">Apply raw JSON</button>
                ${rawErr ? `<div class="seterr">⚠ ${C.esc(rawErr)}</div>` : ''}
            </details>`;
    }

    function profileBar() {
        const opts = DATA.profiles.map(p =>
            `<option value="${C.esc(p.name)}">${C.esc(p.name)} (${p.count})</option>`).join('');
        return `<div class="profbar">
            <span class="muted small">Setting sets:</span>
            <select id="profsel" ${DATA.profiles.length ? '' : 'disabled'}>
                ${opts || '<option>none saved yet</option>'}
            </select>
            <button class="secondary" id="profapply" ${DATA.profiles.length ? '' : 'disabled'}
                title="Apply the selected set: its values are set, other modified settings return to default">Apply</button>
            <button class="secondary" id="profdel" ${DATA.profiles.length ? '' : 'disabled'} title="Delete the selected set">Delete</button>
            <button class="secondary" id="profsave" title="Save every currently non-default value as a named set">Save current as…</button>
            ${saveOpen ? `<input id="profname" type="text" placeholder="set name" style="width:140px">
                <button id="profconfirm">Save</button>` : ''}
            <span style="flex:1"></span>
            <button class="secondary" id="profexport" ${DATA.profiles.length ? '' : 'disabled'} title="Write all sets to a JSON file">Export</button>
            <button class="secondary" id="profimport" title="Load sets from a JSON file (same-name sets are replaced)">Import</button>
        </div>`;
    }

    function render() {
        const cats = DATA.categories
            .map(c => ({ ...c, items: c.items.filter(matches) }))
            .filter(c => c.items.length);
        const total = DATA.categories.reduce((a, c) => a + c.items.length, 0);
        const modified = DATA.categories.reduce((a, c) => a + c.items.filter(i => i.modified).length, 0);

        document.getElementById('app').innerHTML = `
            <style>
                .profbar { display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin:10px 0;
                    padding:8px 10px; border:1px solid var(--vscode-panel-border); border-radius:6px; }
                .catnav { display:flex; gap:6px; flex-wrap:wrap; margin:8px 0 14px;
                    position:sticky; top:0; z-index:10; padding:6px 0;
                    background:var(--vscode-editor-background, var(--vscode-sideBar-background)); }
                .catnav a { font-size:11px; padding:2px 10px; border-radius:10px; cursor:pointer;
                    border:1px solid var(--vscode-widget-border, #4444); color:var(--vscode-foreground);
                    text-decoration:none; opacity:.8; }
                .catnav a:hover { opacity:1; }
                h2.cat { margin:22px 0 4px; }
                .setitem { padding:10px 12px; margin:6px 0; border-radius:5px;
                    border:1px solid var(--vscode-widget-border, #3333); }
                .setitem.modified { border-left:3px solid var(--vscode-textLink-foreground); }
                .sethead { display:flex; gap:8px; align-items:center; }
                .setname { font-weight:600; font-family:var(--vscode-editor-font-family); font-size:12px; }
                .moddot { width:7px; height:7px; border-radius:50%; background:var(--vscode-textLink-foreground); }
                .reset { font-size:11px; padding:0 6px; cursor:pointer; border-radius:3px; opacity:.7;
                    background:transparent; border:1px solid var(--vscode-widget-border, #4444);
                    color:var(--vscode-foreground); }
                .reset:hover { opacity:1; }
                .setdesc { font-size:11px; color:var(--vscode-descriptionForeground); margin:3px 0 6px; max-width:720px; }
                .setctl button.small { font-size:10px; margin-top:4px; }
                .seterr { font-size:11px; color:var(--vscode-errorForeground); margin-top:4px; }
                .setitem.flash { outline:2px solid var(--vscode-textLink-foreground); outline-offset:2px; }
            </style>
            ${window.AFHeader.html({
                page: 'settings',
                title: 'Farm Settings',
                sub: `Every <code>agentFarm.*</code> setting — schema-driven, so new settings appear here automatically. ${total} settings · ${modified} changed from default. Changes save immediately to your user settings.`,
                guide: 'dashboard'
            })}
            ${profileBar()}
            <div class="searchbar" style="margin:10px 0; position:relative">
                <input id="filter" type="text" placeholder="Filter settings… (name or description)" value="${C.esc(filter)}" style="width:100%; max-width:420px; padding:6px 8px">
            </div>
            <div class="catnav">${cats.map(c => `<a data-cat="${c.id}">${C.esc(c.label)}</a>`).join('')}${DATA.claude ? '<a data-cat="claude">Claude Code</a>' : ''}</div>
            ${cats.map(c => `
                <h2 class="cat" id="cat-${c.id}">${C.esc(c.label)} <span class="muted small">${c.items.length}</span></h2>
                ${c.items.map(itemHtml).join('')}`).join('')
            || (claudeSection() ? '' : '<p class="muted">No settings match the filter.</p>')}
            ${claudeSection()}
        `;

        // -- wiring --
        window.AFHeader.wire(vscode);
        const filterEl = document.getElementById('filter');
        filterEl.addEventListener('input', () => {
            filter = filterEl.value.toLowerCase();
            render();
            const el = document.getElementById('filter');
            el.focus();
            el.setSelectionRange(el.value.length, el.value.length);
        });
        document.querySelectorAll('.catnav a').forEach(a =>
            a.addEventListener('click', () => {
                const h = document.getElementById('cat-' + a.dataset.cat);
                if (h && h.scrollIntoView) { h.scrollIntoView({ behavior: 'smooth' }); }
            }));
        document.querySelectorAll('[data-guide]').forEach(el =>
            el.addEventListener('click', () => vscode.postMessage({ type: 'openGuide', anchor: el.dataset.guide })));

        document.querySelectorAll('[data-set]').forEach(el =>
            el.addEventListener('change', () => {
                delete errors[el.dataset.set];
                const value = el.type === 'checkbox' ? el.checked : el.value;
                vscode.postMessage({ type: 'set', key: el.dataset.set, value });
            }));
        document.querySelectorAll('[data-apply]').forEach(btn =>
            btn.addEventListener('click', () => {
                const key = btn.dataset.apply;
                delete errors[key];
                const ta = document.getElementById('c-' + shortKey(key));
                vscode.postMessage({ type: 'set', key, value: ta ? ta.value : '' });
            }));
        document.querySelectorAll('[data-reset]').forEach(btn =>
            btn.addEventListener('click', () => {
                delete errors[btn.dataset.reset];
                vscode.postMessage({ type: 'reset', key: btn.dataset.reset });
            }));

        // Claude Code section
        document.querySelectorAll('[data-ccset]').forEach(el =>
            el.addEventListener('change', () => {
                delete errors['cc:' + el.dataset.ccset];
                const value = el.type === 'checkbox' ? el.checked : el.value;
                vscode.postMessage({ type: 'ccSet', id: el.dataset.ccset, value });
            }));
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
                vscode.postMessage({ type: 'ccRaw', text: ta ? ta.value : '' });
            });
        }

        // profiles
        const sel = document.getElementById('profsel');
        document.getElementById('profapply').addEventListener('click', () => {
            if (sel && sel.value) { vscode.postMessage({ type: 'applyProfile', name: sel.value }); }
        });
        document.getElementById('profdel').addEventListener('click', () => {
            if (sel && sel.value) { vscode.postMessage({ type: 'deleteProfile', name: sel.value }); }
        });
        document.getElementById('profsave').addEventListener('click', () => {
            saveOpen = !saveOpen;
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
                    saveOpen = false;
                }
            };
            confirm.addEventListener('click', send);
            document.getElementById('profname').addEventListener('keydown', ev => { if (ev.key === 'Enter') { send(); } });
        }
        document.getElementById('profexport').addEventListener('click', () => vscode.postMessage({ type: 'exportProfiles' }));
        document.getElementById('profimport').addEventListener('click', () => vscode.postMessage({ type: 'importProfiles' }));

        // hold background refreshes while a field has focus
        const app = document.getElementById('app');
        if (app.addEventListener) {
            app.addEventListener('focusin', ev => {
                const t = ev.target;
                if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) { editing = true; }
            });
            app.addEventListener('focusout', () => {
                editing = false;
                if (pendingData) { DATA = pendingData; pendingData = null; render(); }
            });
        }
    }

    function focusKey(key) {
        const el = document.querySelector(`[data-item="${key}"]`);
        if (!el) { return; }
        if (el.scrollIntoView) { el.scrollIntoView({ block: 'center' }); }
        el.classList.add('flash');
        setTimeout(() => el.classList.remove('flash'), 2500);
    }

    window.addEventListener('message', ev => {
        if (ev.data.type === 'data') {
            if (editing) { pendingData = { ...DATA, ...ev.data.data }; return; }
            DATA = { ...DATA, ...ev.data.data };
            render();
            return;
        }
        if (ev.data.type === 'error') {
            errors[ev.data.key] = ev.data.error;
            render();
            focusKey(ev.data.key);
            return;
        }
        if (ev.data.type === 'ccError') {
            errors['cc:' + ev.data.id] = ev.data.error;
            render();
            focusKey('cc:' + ev.data.id);
            return;
        }
        if (ev.data.type === 'focus') { focusKey(ev.data.key); }
    });

    render();
    if (DATA.focus) { focusKey(DATA.focus); }
})();
