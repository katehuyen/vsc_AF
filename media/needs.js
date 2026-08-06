// Agent Farm — "Needs You" approval queue page script.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    let DATA = window.__DATA__;
    const selected = new Set();   // checked row keys (bulk clear)

    window.addEventListener('message', ev => {
        if (ev.data.type === 'data') { DATA = ev.data.data; render(); }
    });

    const KIND_META = {
        'permission':       { icon: '🛡️', label: 'PERMISSION',  cls: 'urgent' },
        'browser-approval': { icon: '🌐', label: 'APPROVAL',     cls: 'urgent' },
        'mission':          { icon: '🎯', label: 'MISSION',      cls: 'urgent' },
        'interrupted':      { icon: '✂️', label: 'INTERRUPTED',  cls: 'warn' },
        'stalled':          { icon: '⏳', label: 'STALLED',      cls: 'warn' },
        'conflict':         { icon: '⇄',  label: 'CONFLICT',     cls: 'warn' }
    };

    /**
     * What a blocked row IS, for the right-click menu.
     *
     * ‼️ A ROW HERE IS OFTEN TWO THINGS. A permission wait or a stalled run is a
     * blocker with its own buttons AND a session — and a session's eleven
     * actions (interrupt it, end it, open its transcript, pin it, resume it in
     * the Console) are exactly what you want on a row that says an agent is
     * stuck. One element carries one context, so the SECTION NAME decides:
     * a row that knows a transcript publishes itself as `afNeedSession` and
     * draws both menus; one that does not stays `afNeedRow` and is offered
     * nothing it cannot do. See src/core/ctxmenu.ts.
     *
     * The row's own buttons are built from the blocker (Approve · Reject ·
     * Resume · Reconcile…) and are deliberately NOT in the catalogue: they are
     * per-row data, and a static menu that guessed at them would be wrong.
     */
    function needCtx(item) {
        const ref = item.ref || {};
        const mine = {
            needKey: item.key, afClearable: !!item.clearable,
            afKind: item.kind, afAgentId: ref.agentId || '',
            needTitle: item.title || '', needDetail: item.detail || '',
            needAgent: item.agentName || ''
        };
        if (ref.transcriptPath || ref.sessionId) {
            return window.AFSessionCtx.row(
                { sessionId: ref.sessionId, file: ref.transcriptPath, title: item.title, agentName: item.agentName },
                Object.assign({ webviewSection: 'afNeedSession' }, mine));
        }
        return window.AFCtx.row('afNeedRow', mine);
    }

    /** The tooltip tail — and it has to say WHICH menu, because the two are
     *  genuinely different sets and the difference is visible on screen. */
    function rowHint(item) {
        const ref = item.ref || {};
        return ref.transcriptPath || ref.sessionId
            ? 'right-click: this blocker, and everything you can do to the session behind it'
            : window.AFCtx.HINT;
    }

    function rowHtml(item, i) {
        const meta = KIND_META[item.kind] || { icon: '•', label: item.kind, cls: '' };
        const when = item.ts ? new Date(item.ts).toLocaleTimeString() : '';
        const actions = item.actions.map(a =>
            `<button data-i="${i}" data-action="${C.esc(a.id)}"${a.id === 'reject' ? ' class="secondary"' : ''}>${C.esc(a.label)}</button>`
        ).join(' ');
        // A row holding a live promise gets no checkbox and no ✕: hiding it
        // would leave the agent waiting with nowhere left to answer from.
        const box = item.clearable
            ? `<input type="checkbox" class="nd-cb" data-cb="${C.esc(item.key)}" ${selected.has(item.key) ? 'checked' : ''} title="Select for bulk clear">`
            : '<span class="nd-lock" title="Answer it — Approve or Reject settles the waiting agent">🔒</span>';
        const clear = item.clearable
            ? `<button class="secondary nd-x" data-clear="${C.esc(item.key)}" title="Clear this row — it comes back if the same thing happens again">✕</button>`
            : '';
        return `<div class="need-row ${meta.cls} ${selected.has(item.key) ? 'sel' : ''}"
            ${needCtx(item)} title="${C.esc(rowHint(item))}">
            <div class="need-pick">${box}</div>
            <div class="need-icon">${meta.icon}</div>
            <div class="need-main">
                <div class="need-title">${C.esc(item.title)} <span class="tag">${meta.label}</span></div>
                ${item.detail ? `<div class="need-detail">${C.esc(item.detail)}</div>` : ''}
                <div class="muted small">${C.esc(item.agentName)}${when ? ' · ' + when : ''}</div>
            </div>
            <div class="need-actions btnrow">${actions}${clear}</div>
        </div>`;
    }

    function render() {
        const items = DATA.items || [];
        const keys = items.map(x => x.key);
        [...selected].forEach(k => { if (!keys.includes(k)) { selected.delete(k); } });
        const clearable = items.filter(x => x.clearable);
        const urgent = items.filter(x => x.urgency <= 2).length;
        const hidden = DATA.hidden || 0;

        const bar = items.length || hidden ? `<div class="nd-bar btnrow">
            <label class="nd-selall" title="Select / deselect every clearable row"><input type="checkbox" id="nd-selall"> all</label>
            <button class="secondary" data-bulk="sel" ${selected.size ? '' : 'disabled'}>🧹 Clear selected${selected.size ? ` (${selected.size})` : ''}</button>
            <button class="secondary" data-bulk="all" ${clearable.length ? '' : 'disabled'}>🧹 Clear all</button>
            ${hidden ? `<button class="secondary" data-bulk="restore" title="Bring the cleared rows back">↩ Restore (${hidden})</button>` : ''}
        </div>` : '';

        document.getElementById('app').innerHTML = `
            <style>
                .need-row { display:flex; gap:12px; align-items:center; padding:10px 12px; margin:6px 0;
                    border:1px solid var(--vscode-panel-border); border-radius:6px; }
                .need-row.urgent { border-left:4px solid var(--vscode-editorWarning-foreground); }
                .need-row.warn { border-left:4px solid var(--vscode-charts-orange, orange); }
                .need-row.sel { background:var(--vscode-list-inactiveSelectionBackground); }
                .need-pick { width:18px; text-align:center; flex-shrink:0; }
                .nd-lock { opacity:.5; font-size:12px; }
                .need-icon { font-size:20px; width:28px; text-align:center; }
                .need-main { flex:1; min-width:0; }
                .need-title { font-weight:600; }
                .need-detail { opacity:.85; margin:2px 0; word-break:break-word; }
                .need-actions { flex-shrink:0; }
                .nd-x { padding:2px 8px; }
                .nd-bar { margin:10px 0 4px; display:flex; align-items:center; gap:8px; }
                .nd-selall { display:flex; align-items:center; gap:4px; opacity:.8; font-size:12px; }
                .tag { font-size:10px; opacity:.7; border:1px solid var(--vscode-panel-border);
                    border-radius:3px; padding:1px 5px; margin-left:6px; vertical-align:middle; }
            </style>
            ${window.AFHeader.html({
                page: 'needs',
                title: 'Needs You',
                sub: `${items.length} item(s) · ${urgent} urgent${hidden ? ` · ${hidden} cleared` : ''}${selected.size ? ` · ${selected.size} selected` : ''} · ${new Date(DATA.generatedAt).toLocaleTimeString()}`,
                guide: 'onay-kuyrugu'
            })}
            ${bar}
            ${items.length
                ? items.map(rowHtml).join('')
                : `<p class="muted" style="margin-top:24px">🎉 Nothing is blocking the farm right now.${hidden ? ' Cleared rows are still hidden — Restore brings them back.' : ''}</p>
                   <p class="muted small">Budgets, instruction suggestions, parked tasks and idle sessions are news, not work — they are announced on <b>Notices</b>.</p>`}
        `;
        window.AFHeader.wire(vscode);

        document.querySelectorAll('[data-action]').forEach(el =>
            el.addEventListener('click', () => vscode.postMessage({
                type: 'action',
                actionId: el.dataset.action,
                item: items[Number(el.dataset.i)]
            })));

        document.querySelectorAll('[data-clear]').forEach(el =>
            el.addEventListener('click', () => {
                selected.delete(el.dataset.clear);
                vscode.postMessage({ type: 'clear', keys: [el.dataset.clear] });
            }));

        document.querySelectorAll('[data-bulk]').forEach(el =>
            el.addEventListener('click', () => {
                const b = el.dataset.bulk;
                if (b === 'restore') { vscode.postMessage({ type: 'restore' }); return; }
                const keys = b === 'sel' ? [...selected] : undefined;
                selected.clear();
                vscode.postMessage({ type: 'clear', keys, all: b === 'all' });
            }));

        const selAll = document.getElementById('nd-selall');
        if (selAll) {
            const ids = clearable.map(x => x.key);
            const on = ids.filter(k => selected.has(k)).length;
            selAll.checked = ids.length > 0 && on === ids.length;
            selAll.indeterminate = on > 0 && on < ids.length;
            selAll.addEventListener('change', () => {
                if (selAll.checked) { ids.forEach(k => selected.add(k)); } else { ids.forEach(k => selected.delete(k)); }
                render();
            });
        }
        document.querySelectorAll('.nd-cb').forEach(cb =>
            cb.addEventListener('change', () => {
                if (cb.checked) { selected.add(cb.dataset.cb); } else { selected.delete(cb.dataset.cb); }
                render();
            }));
    }

    /**
     * The three things the menu adds around a blocker: the agent that is stuck,
     * getting a judged row out of the way, and taking the row with you.
     * (The session half of the menu is host commands — it needs nothing here.)
     */
    function ctxDo(act, ctx) {
        if (act === 'ndAgent') {
            if (ctx.afAgentId) { vscode.postMessage({ type: 'openAgent', agentId: String(ctx.afAgentId) }); }
            return;
        }
        if (act === 'ndClear') {
            selected.delete(ctx.needKey);
            vscode.postMessage({ type: 'clear', keys: [String(ctx.needKey || '')] });
            return;
        }
        if (act === 'ndCopy') {
            window.AFCtx.copy([ctx.needTitle, ctx.needDetail, ctx.needAgent]
                .filter(Boolean).join('\n'));
        }
    }

    // ‼️ ONCE, at module scope — render() rewires the rows on every change.
    window.AFCtx.listen(ctxDo);

    render();
})();
