// Agent Farm — Living page. One screen answering "is the system alive today?".
// Rows are LOOPS, not errors: something opened — did it close? A part can be
// green while the system is dead, which is exactly what this page catches.
// All judgment is in src/core/living.ts; this only renders it.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    let DATA = window.__DATA__;

    const post = (m) => vscode.postMessage(m);

    const ICON = { ok: '✅', warn: '⚠️', dead: '🛑', idle: '·' };
    const ORDER = { dead: 0, warn: 1, idle: 2, ok: 3 };

    function relTime(ms) {
        if (!ms && ms !== 0) { return ''; }
        const h = ms / 3600000;
        if (h < 1) { return Math.max(1, Math.round(h * 60)) + ' min'; }
        if (h < 48) { return Math.round(h) + ' h'; }
        return Math.round(h / 24) + ' days';
    }

    function scoreRing(score, verdict, counts) {
        // A single honest number plus the verdict — no gauge theatre.
        const cls = counts.dead ? 'dead' : counts.warn ? 'warn' : 'ok';
        return `<div class="verdict ${cls}">
            <div class="score">${score}<span class="pct">%</span></div>
            <div class="vtext">
                <b>${C.esc(verdict)}</b>
                <div class="muted small">${counts.ok} closing · ${counts.warn} need you · ${counts.dead} stopped${counts.idle ? ` · ${counts.idle} idle` : ''}</div>
            </div>
        </div>`;
    }

    // -------------------------------------------------------- THE CHECKS EDITOR
    /**
     * ‼️ THE PAGE THAT REPORTS ON YOUR LOOPS CAN NOW DEFINE THEM — U-14.
     *
     * `configureLivingChecks` was a quickpick (add / remove / edit the JSON)
     * that led to five more boxes: a name, then a guard KIND, then its path,
     * then the names that do not count as work, then how loud, then the hint.
     * The one thing it never showed was **the list it was adding to** — so
     * "have I already got a check for this?" could only be answered by opening
     * settings.json, which was offered as the third option precisely because
     * the wizard could not answer it.
     *
     * Here every check is a row you can read, and one of them is open at a time
     * in a card. The list is the DRAFT: reordering, deleting and editing touch
     * nothing until Save, so Cancel is not a lie.
     */
    const CHECK_KINDS = [
        { id: 'fileMissing', label: 'a file is MISSING — the nudge case' },
        { id: 'folderHasFiles', label: 'a folder holds files — the inbox case' },
        { id: 'pathChangedWithin', label: 'a path changed recently' },
        { id: 'queueHasWork', label: 'the work queue has items' }
    ];
    const LEVELS = [
        { id: 'alert', label: '🛑 Alert — the loop has stopped' },
        { id: 'warn', label: '⚠️ Warn — needs you soon' },
        { id: 'info', label: '· Info — worth seeing, not urgent' }
    ];

    let editor = null;      // { rows: [...], idx: null|number } — the draft
    let checksMsg = '';
    let checksMsgOk = false;

    /** A stored check flattened into the form's own vocabulary. */
    function toRow(c) {
        const w = (c && c.when) || {};
        return {
            label: (c && c.label) || '',
            kind: w.kind || 'fileMissing',
            path: w.path || '',
            except: Array.isArray(w.except) ? w.except.join(', ') : '',
            recursive: w.recursive === true,
            hours: w.hours || 24,
            minCount: w.minCount || 1,
            level: (c && c.level) || 'warn',
            hint: (c && c.hint) || ''
        };
    }

    function openEditor(seed) {
        editor = {
            rows: (DATA.checks || []).map(toRow),
            idx: null
        };
        if (seed && seed.add) {
            editor.rows.push(toRow(null));
            editor.idx = editor.rows.length - 1;
        }
        checksMsg = '';
        checksMsgOk = false;
        render();
        const box = document.getElementById('checksbox');
        if (box) { box.scrollIntoView(); }
    }

    /** The one line a check reads as in the list — what it watches, how loud. */
    function rowSummary(r) {
        const k = CHECK_KINDS.find(x => x.id === r.kind);
        const what = r.kind === 'queueHasWork' ? 'the work queue'
            : (r.path || '(no path yet)');
        const extra = r.kind === 'pathChangedWithin' ? ' · within ' + r.hours + 'h'
            : r.kind === 'folderHasFiles' ? (r.recursive ? ' · sub-folders too' : '')
                + (r.except ? ' · ignoring ' + r.except : '')
                : '';
        return {
            icon: r.level === 'alert' ? '🛑' : r.level === 'info' ? '·' : '⚠️',
            hint: (k && k.label) || r.kind,
            sub: what + extra
        };
    }

    function checkCardHtml(F) {
        const r = editor.rows[editor.idx];
        const needsPath = r.kind !== 'queueHasWork';
        return `<div class="affsub" id="checkcard">`
            + F.grid([
                F.text('label', 'What loop is this?', r.label, {
                    wide: true, required: true,
                    ph: "e.g. Today's day file written",
                    tip: 'The name of the row this becomes on this page.'
                }),
                F.sel('kind', 'It hits when…', CHECK_KINDS, r.kind, {
                    redraw: true,
                    tip: 'The condition, evaluated for free — no agent is woken to answer it.'
                }),
                needsPath ? F.path('path', 'Path', r.path, {
                    kind: r.kind === 'fileMissing' ? 'file' : 'folder',
                    ph: 'D:/…  — {today} and {yesterday} expand to YYYY-MM-DD',
                    tip: 'The file or folder it looks at. The two date tokens are what makes "today\'s entry was never written" expressible at all.'
                }) : '',
                r.kind === 'folderHasFiles' ? F.text('except', 'Names that are not work', r.except, {
                    wide: true, ph: '_LOG_.md, .gitkeep',
                    tip: 'Comma separated. A folder whose own log file is the only thing in it is an empty folder.'
                }) : '',
                r.kind === 'folderHasFiles' ? F.check('recursive', 'look into sub-folders', r.recursive, {}) : '',
                r.kind === 'pathChangedWithin' ? F.num('hours', 'Within (hours)', r.hours, {
                    tip: 'How recently it must have changed to count as alive.'
                }) : '',
                (r.kind === 'folderHasFiles' || r.kind === 'queueHasWork')
                    ? F.num('minCount', 'At least', r.minCount, { tip: 'How many hits are needed before it counts.' }) : '',
                F.sel('level', 'How loud', LEVELS, r.level, {
                    tip: 'Alert and Warn both land in Open loops; Info is reported without claiming you are late.'
                }),
                F.text('hint', 'What closes it', r.hint, {
                    wide: true, ph: "e.g. write today's entry, or ask the agent to open it",
                    tip: 'Shown under the row when it hits. A signal that does not say what would close it is a signal you learn to ignore.'
                })
            ])
            + `<div class="ctl-row"><span class="spacer"></span>
                <button class="mini" data-chk="done">Done with this one</button></div></div>`;
    }

    function checksHtml() {
        const F = window.AFForm;
        const rows = editor.rows;
        const body = F.list({
            numbered: false,
            acts: ['up', 'down', 'edit', 'dup', 'del'],
            empty: 'No checks yet. Without them this page sees the farm, not the work the farm exists for.',
            items: rows.map((r, i) => {
                const s = rowSummary(r);
                return {
                    icon: s.icon, hint: s.hint, on: editor.idx === i,
                    title: r.label || '(unnamed check)', sub: s.sub
                };
            })
        })
            + (editor.idx === null
                ? '<div class="ctl-row"><button class="secondary" data-chk="add">+ Add a check</button>'
                + '<button class="secondary" data-chk="json" title="The same list as raw JSON, in your settings file">Edit as JSON</button>'
                + '<span class="spacer"></span></div>'
                : checkCardHtml(F));
        return F.card({
            id: 'checksbox',
            title: 'Your own checks',
            lede: 'Each one becomes a row on this page. They are evaluated for free — a path on disk, a folder, the work queue — so nothing here costs a model call.',
            body: body,
            msg: checksMsg, warn: !checksMsgOk,
            submit: 'Save the checks'
        });
    }

    function wireChecks() {
        const F = window.AFForm;
        const box = document.getElementById('checksbox');
        if (!box || !editor) { return; }
        F.wire(box, {
            onEdit: v => {
                if (editor.idx === null) { return; }
                Object.assign(editor.rows[editor.idx], v);
            },
            onRedraw: () => render(),
            onBrowse: (key, kind) => post({
                type: 'af-browse', key: key, kind: kind, title: 'What should this check look at?'
            }),
            onSubmit: () => {
                checksMsg = '';
                post({ type: 'checks-save', checks: editor.rows });
            },
            onCancel: () => { editor = null; checksMsg = ''; render(); },
            onList: (act, i) => {
                const rows = editor.rows;
                if (!(i >= 0 && i < rows.length)) { return; }
                if (act === 'edit') { editor.idx = editor.idx === i ? null : i; }
                else if (act === 'del') {
                    rows.splice(i, 1);
                    if (editor.idx === i) { editor.idx = null; }
                    else if (editor.idx > i) { editor.idx--; }
                } else if (act === 'dup') {
                    rows.splice(i + 1, 0, Object.assign({}, rows[i]));
                    if (editor.idx > i) { editor.idx++; }
                } else if (act === 'up' || act === 'down') {
                    const j = act === 'up' ? i - 1 : i + 1;
                    if (j < 0 || j >= rows.length) { return; }
                    const t = rows[i]; rows[i] = rows[j]; rows[j] = t;
                    if (editor.idx === i) { editor.idx = j; }
                    else if (editor.idx === j) { editor.idx = i; }
                }
                render();
            }
        });
        box.querySelectorAll('[data-chk]').forEach(b =>
            b.addEventListener('click', () => {
                const a = b.dataset.chk;
                if (a === 'add') { editor.rows.push(toRow(null)); editor.idx = editor.rows.length - 1; }
                else if (a === 'done') { editor.idx = null; }
                else if (a === 'json') { post({ type: 'openSettingsJson' }); return; }
                render();
            }));
    }

    function signalRow(s) {
        const age = s.ageMs ? `<span class="age" title="how long this loop has been open">${relTime(s.ageMs)}</span>` : '';
        return `<div class="sig ${s.state}"${s.goto ? ` data-goto="${C.esc(s.goto)}" role="button" tabindex="0"` : ''}
            ${window.AFCtx.row('afLivingSignal', {
            sigGoto: s.goto || '',
            sigText: [s.label, s.detail, s.hint].filter(Boolean).join(' — ')
        })} title="${C.esc(window.AFCtx.hint(s.label))}">
            <div class="sigicon">${ICON[s.state] || '·'}</div>
            <div class="sigbody">
                <div class="sighead"><b>${C.esc(s.label)}</b>${age}</div>
                <div class="sigdetail">${C.esc(s.detail)}</div>
                ${s.hint ? `<div class="sighint">${C.esc(s.hint)}</div>` : ''}
            </div>
            ${s.goto ? `<div class="siggo">→</div>` : ''}
        </div>`;
    }

    function recentHtml(recent) {
        if (!recent || !recent.length) {
            return `<p class="muted">No automation decisions recorded yet. Every firing — and every wake-up a
                precondition suppressed — lands here, so a guard can never quietly swallow real work.</p>`;
        }
        const rows = recent.map(e => `<tr class="${e.outcome}">
            <td class="muted small nowrap" title="${C.esc(window.AFTime.tip(e.ts, 'Decided'))}">${C.esc(window.AFTime.stamp(e.ts))}</td>
            <td>${e.outcome === 'fired' ? '▶ fired' : '🛡 skipped'}</td>
            <td>${C.esc(e.title)} <span class="muted small">(${C.esc(e.kind)})</span></td>
            <td class="muted small">${C.esc(e.reason)}</td>
        </tr>`).join('');
        return `<div class="tablewrap"><table>
            <tr><th>When</th><th>Outcome</th><th>Automation</th><th>Why</th></tr>${rows}</table></div>`;
    }

    function render() {
        const d = DATA;
        const groups = d.signals.slice().sort((a, b) =>
            (ORDER[a.state] - ORDER[b.state]) || (b.weight - a.weight));
        const open = groups.filter(s => s.state === 'dead' || s.state === 'warn');
        const fine = groups.filter(s => s.state === 'ok' || s.state === 'idle');

        document.getElementById('app').innerHTML = `
            <style>
                .verdict { display:flex; gap:14px; align-items:center; padding:12px 16px; margin:0 0 14px;
                    border:1px solid var(--vscode-widget-border,#4443); border-left-width:4px; border-radius:9px;
                    background:var(--vscode-editorWidget-background, rgba(128,128,128,.05)); }
                .verdict.ok { border-left-color:var(--vscode-charts-green,#3fb950); }
                .verdict.warn { border-left-color:var(--vscode-editorWarning-foreground,#cca700); }
                .verdict.dead { border-left-color:var(--vscode-errorForeground,#f85149); }
                .score { font-size:30px; font-weight:700; line-height:1; }
                .score .pct { font-size:14px; opacity:.6; margin-left:1px; }
                .vtext b { font-size:14px; }
                .sig { display:flex; gap:11px; align-items:flex-start; padding:9px 12px; margin-bottom:7px;
                    border:1px solid var(--vscode-widget-border,#4443); border-left-width:3px; border-radius:7px; }
                .sig[data-goto] { cursor:pointer; }
                .sig[data-goto]:hover { background:var(--vscode-list-hoverBackground); }
                .sig.ok { border-left-color:var(--vscode-charts-green,#3fb950); opacity:.75; }
                .sig.warn { border-left-color:var(--vscode-editorWarning-foreground,#cca700); }
                .sig.dead { border-left-color:var(--vscode-errorForeground,#f85149); }
                .sig.idle { border-left-color:var(--vscode-widget-border,#4443); opacity:.75; }
                .sigicon { font-size:15px; line-height:1.35; }
                .sigbody { flex:1; min-width:0; }
                .sighead { display:flex; gap:8px; align-items:baseline; }
                .sigdetail { font-size:12px; margin-top:2px; word-break:break-word; }
                .sighint { font-size:11.5px; opacity:.75; margin-top:3px; font-style:italic; }
                .siggo { opacity:.5; align-self:center; }
                .age { font-size:11px; opacity:.7; }
                .nowrap { white-space:nowrap; }
                h2.sec { margin:20px 0 8px; border:none; font-size:13px; text-transform:uppercase;
                    letter-spacing:.6px; opacity:.75; }
                tr.skipped td { opacity:.72; }
                .hintbox { border:1px solid var(--vscode-widget-border,#4443); border-radius:7px;
                    padding:8px 11px; margin:10px 0; font-size:12px; }
            </style>
            ${window.AFHeader.html({
                page: 'living',
                title: 'Living',
                sub: `is the system alive? — updated ${window.AFTime.clockUtc(d.generatedAt)}`,
                actions: `<button class="secondary" id="cfg"${editor ? ' disabled' : ''}
                    title="Your own loops — a file that should exist, a folder that should be empty, a queue that should be short. Each one becomes a row here.">Configure checks${(d.checks || []).length ? ` (${d.checks.length})` : '…'}</button>`,
                guide: 'yasam-panosu'
            })}
            ${scoreRing(d.score, d.verdict, d.counts)}
            ${editor ? checksHtml() : (checksMsg ? window.AFForm.msg(checksMsg, !checksMsgOk) : '')}
            ${open.length
                ? `<h2 class="sec">Open loops — ${open.length}</h2>${open.map(signalRow).join('')}`
                : `<h2 class="sec">Open loops</h2><p class="muted">Nothing is waiting on you. Every loop that opened has closed.</p>`}
            <h2 class="sec">Closing normally — ${fine.length}</h2>
            ${fine.map(signalRow).join('')}
            ${!d.hasChecks && !editor ? `<div class="hintbox">💡 Add your own checks (today's diary file, an inbox folder, anything with a path)
                — each one becomes a row here. Without them this page only sees the farm,
                not the work the farm exists for. <button class="mini" id="addcheck">Add one now</button></div>` : ''}
            <h2 class="sec">What the farm has been doing</h2>
            ${recentHtml(d.recent)}`;

        window.AFHeader.wire(vscode);
        document.querySelectorAll('[data-goto]').forEach(el => {
            el.addEventListener('click', () => post({ type: 'goto', to: el.dataset.goto }));
            el.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') { post({ type: 'goto', to: el.dataset.goto }); }
            });
        });
        const cfg = document.getElementById('cfg');
        if (cfg) { cfg.addEventListener('click', () => openEditor()); }
        const hintAdd = document.getElementById('addcheck');
        if (hintAdd) { hintAdd.addEventListener('click', () => openEditor({ add: true })); }
        wireChecks();
    }

    /** A signal's own two acts — "Configure checks…" beside them is a host
     *  command and needs nothing here. */
    function ctxDo(act, ctx) {
        if (act === 'lvGo') {
            if (ctx.sigGoto) { post({ type: 'goto', to: String(ctx.sigGoto) }); }
            return;
        }
        if (act === 'lvCopy') { window.AFCtx.copy(ctx.sigText); }
    }

    // ‼️ ONCE, at module scope — this page repaints itself every minute.
    window.AFCtx.listen(ctxDo);

    window.addEventListener('message', (e) => {
        const m = e.data;
        if (!m) { return; }
        if (m.type === 'data') {
            DATA = m.data;
            // ‼️ A REPAINT MUST NOT EAT A HALF-WRITTEN CHECK. This page
            // refreshes itself every minute; the draft is the user's, so the
            // incoming data only replaces the report around it.
            render();
            return;
        }
        if (m.type === 'checks-compose') { openEditor(); return; }
        if (m.type === 'checks-msg') {
            checksMsg = String(m.text || '');
            checksMsgOk = m.ok === true;
            if (checksMsgOk) { editor = null; }
            render();
            return;
        }
        if (m.type === 'af-browsed' && editor && editor.idx !== null) {
            window.AFForm.browsed(editor.rows[editor.idx], m);
            render();
        }
    });

    render();
    // Ages are the point on this page — keep them honest without a manual refresh.
    setInterval(() => { if (!document.hidden) { post({ type: 'refresh' }); } }, 60000);
})();
