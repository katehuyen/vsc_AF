// Agent Farm — Evals page: an agent's regression suite, its runs, and what
// changed between the last two.
//
// ‼️ THIS IS THE ONE SURFACE THE SWEEP HAD TO BUILD (U-14). Every other object
// in the extension had a page that listed it and could not make it; evals had
// no page at all — four palette commands were the whole of it. So a suite you
// spent an afternoon on could only be read back one quickpick line at a time,
// and "which cases fail now that passed last week?" had no answer short of
// re-running everything and reading a generated file.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    const F = window.AFForm;
    let DATA = window.__DATA__;

    const post = (m) => vscode.postMessage(m);
    const t = (s, v) => (window.AFI18n ? window.AFI18n.t(s, v) : s.replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? String(v[k]) : m)));

    let card = null;      // { kind: 'case' | 'ab', … }
    let msg = '';
    let msgOk = false;

    // ‼️ M-33 — A HOST PUSH WAITS FOR THE READER'S HANDS; THE PAGE'S OWN
    // RENDERS DO NOT. render() replaces the whole of #app, so a repaint that
    // arrives while somebody is typing detaches the box they are typing in and
    // the caret falls to <body> — where space IS Page Down. Full text, and
    // what a page-specific busy() is for: media/afRepaint.js.
    const repaint = window.AFRepaint.guard(render);
    window.addEventListener('message', ev => {
        const m = ev.data;
        if (!m) { return; }
        if (m.type === 'data') { DATA = m.data; repaint(); return; }
        if (m.type === 'ev-compose') { openCard(m.seed || {}); return; }
        if (m.type === 'ev-msg') {
            msg = String(m.text || '');
            msgOk = m.ok === true;
            if (msgOk && card) { card = null; }
            render();
            return;
        }
        if (m.type === 'af-browsed' && card) {
            F.browsed(card, m);
            render();
        }
    });

    function openCard(seed) {
        const s = seed || {};
        const kind = s.kind === 'ab' ? 'ab' : 'case';
        card = {
            kind: kind,
            // a case
            from: '', title: '', input: s.input || '', expectation: '',
            // an A/B
            rule: '', file: '',
            useCases: (DATA.cases || []).length > 0,
            prompts: (DATA.cases || []).slice(0, 5).map(c => c.input).join('\n')
        };
        msg = '';
        msgOk = false;
        render();
        const box = document.getElementById('evcard');
        if (box) { box.scrollIntoView(); }
    }

    /**
     * A case is normally BORN FROM A BAD TRACE. The old chain opened with a
     * quickpick of those traces and then asked for the input in a box —
     * prefilled, but with no way to see the trace beside it. Here the trace is
     * a field that FILLS the two boxes under it, and both stay editable.
     */
    function caseCardHtml() {
        const cands = DATA.candidates || [];
        return F.card({
            id: 'evcard',
            title: 'New eval case',
            lede: 'A case is a prompt plus what a good answer has to satisfy. The judge is handed the expectation verbatim, so a vague one produces a vague verdict — say what MUST be true, not what would be nice.',
            body: F.grid([
                cands.length ? F.sel('from', 'Born from', [{ id: '', label: '— write it myself —' }]
                    .concat(cands.map(c => ({ id: c.id, label: c.label, title: c.detail }))), card.from, {
                    wide: true, redraw: true,
                    tip: 'A low-scored session or a failed verification. Picking one fills the input below and records where the case came from, so the same trace is never turned into two cases.'
                }) : '',
                F.text('title', 'Title', card.title, {
                    wide: true, ph: '(optional — the first line of the input otherwise)',
                    tip: 'What this case is called in the list and in a run report.'
                }),
                F.area('input', 'Input', card.input, {
                    rows: 4, required: true,
                    ph: 'The prompt, exactly as it would be sent',
                    tip: 'Replayed against the agent on every run. Ctrl+Enter saves.'
                }),
                F.area('expectation', 'Expectation', card.expectation, {
                    rows: 3, required: true,
                    ph: 'e.g. answers in Turkish, gives three concrete suggestions, no headings',
                    tip: 'The judge criteria, in plain language. This is the whole difference between a test and a re-run.'
                })
            ]),
            msg: msg, warn: !msgOk,
            submit: 'Add the case'
        });
    }

    function abCardHtml() {
        const sugg = DATA.suggestions || [];
        const opts = sugg.map(s => ({ id: s.id, label: '💡 ' + s.rule.slice(0, 80) }))
            .concat([
                { id: 'rule', label: '✎ Write the rule myself' },
                { id: 'file', label: '📄 Read variant B from a file' }
            ]);
        return F.card({
            id: 'evcard',
            title: 'A/B the agent\'s own instructions',
            lede: 'A is this agent\'s CLAUDE.md as it stands. B is the same file plus one rule — or a different file entirely. Both answer the same prompts and a cheap judge says which did better.',
            body: F.grid([
                F.sel('from', 'Where B comes from', opts, card.from || (opts[0] && opts[0].id) || '', {
                    wide: true, redraw: true,
                    tip: 'An open suggestion is the readiest source: it is already a one-line rule somebody proposed for this agent.'
                }),
                card.from === 'rule' ? F.text('rule', 'The rule B adds', card.rule, {
                    wide: true, required: true,
                    ph: 'one line, appended to the current CLAUDE.md',
                    tip: 'Appended under its own heading so the diff between A and B is exactly this line.'
                }) : '',
                card.from === 'file' ? F.path('file', 'Variant B file', card.file, {
                    kind: 'file', ph: 'a whole CLAUDE.md',
                    tip: 'Read whole — B is that file, not the current one plus anything.'
                }) : '',
                F.area('prompts', 'Prompts to compare on — one per line', card.prompts, {
                    rows: 5, required: true,
                    tip: 'Two to five. Prefilled from this agent\'s eval cases when it has any, because a suite you already trust is the fairest comparison there is.'
                })
            ]),
            msg: msg, warn: !msgOk,
            submit: 'Run the comparison'
        });
    }

    function wireCard() {
        const box = document.getElementById('evcard');
        if (!box || !card) { return; }
        F.wire(box, {
            onEdit: v => {
                const prevFrom = card.from;
                Object.assign(card, v);
                card._fromChanged = v.from !== undefined && v.from !== prevFrom;
            },
            onRedraw: () => {
                // Picking a trace fills the boxes under it — and only when the
                // pick CHANGED, so a redraw never overwrites what was typed.
                if (card._fromChanged && card.kind === 'case' && card.from) {
                    const c = (DATA.candidates || []).find(x => x.id === card.from);
                    if (c) { card.input = c.input; }
                }
                card._fromChanged = false;
                render();
            },
            onBrowse: (key, kind) => post({ type: 'af-browse', key: key, kind: kind, title: 'Variant B CLAUDE.md' }),
            onSubmit: () => {
                msg = '';
                post({ type: card.kind === 'ab' ? 'ev-ab' : 'ev-case-save', form: card });
            },
            onCancel: () => { card = null; msg = ''; render(); }
        });
    }

    // ------------------------------------------------------------------ rows

    const CHANGE = {
        regressed: { icon: '⛔', text: 'regressed — it passed last time', cls: 'stop' },
        fixed: { icon: '✅', text: 'fixed — it failed last time', cls: 'ok' },
        'new': { icon: '🆕', text: 'new since the previous run', cls: '' },
        same: { icon: '', text: '', cls: '' }
    };

    function caseRows() {
        const byCase = new Map((DATA.verdicts || []).map(v => [v.caseId, v]));
        const cases = DATA.cases || [];
        if (!cases.length) {
            return `<tr data-afcard><td colspan="5" class="muted" style="padding:16px">
                No cases yet. A case is normally born from a bad trace — a session you scored low, or a task whose
                verification failed. Those are offered in the card the <b>+ New case</b> button opens.</td></tr>`;
        }
        return cases.map(c => {
            const v = byCase.get(c.id);
            const ch = v ? CHANGE[v.change] : null;
            const verdict = !v ? '<span class="muted">not run</span>'
                : v.pass ? '<span class="ok">pass</span>' : '<span class="stop">FAIL</span>';
            return `<tr data-afcard ${window.AFCtx.row('afEvalCase', { evCase: c.id, evTitle: c.title, evInput: c.input })}
                title="${C.esc(window.AFCtx.hint(c.title))}">
                <td class="main" data-lead>${window.AFTip.wrap(
                    `<b>${C.esc(c.title)}</b>`,
                    `${C.esc(c.title)} · ${c.input.length} characters · from a ${C.esc(c.source)} trace`,
                    'INPUT\n' + c.input + '\n\nEXPECTATION\n' + c.expectation)}
                    <div class="muted small">${C.esc(c.expectation.slice(0, 120))}${c.expectation.length > 120 ? '…' : ''}</div></td>
                <td class="small" data-label="${C.esc(t('From'))}">${C.esc(c.source)}</td>
                <td class="state" data-label="${C.esc(t('Last run'))}">${verdict}</td>
                <td class="small ${ch ? ch.cls : ''}">${ch && ch.icon ? ch.icon + ' ' + C.esc(ch.text) : ''}</td>
                <td class="acts"><button class="mini secondary" data-del="${C.esc(c.id)}" title="Delete this case">✕</button></td>
            </tr>`;
        }).join('');
    }

    function runRows() {
        const runs = DATA.runs || [];
        if (!runs.length) { return '<p class="muted">No runs yet.</p>'; }
        return `<div class="tablewrap"><table class="grid">
            <tr><th>When</th><th class="num">Passed</th><th class="num">Failed</th><th class="num">Rate</th></tr>
            ${runs.map(r => {
            const total = r.passed + r.failed;
            const rate = total ? Math.round(100 * r.passed / total) : 0;
            return `<tr><td>${window.AFTime.clock(r.ts)}
                    <span class="muted small">${C.esc(window.AFTime.tip(r.ts, 'run').split('\n')[0])}</span></td>
                    <td class="num ok">${r.passed}</td>
                    <td class="num${r.failed ? ' stop' : ''}">${r.failed}</td>
                    <td class="num">${rate}%</td></tr>`;
        }).join('')}
        </table></div>`;
    }

    function render() {
        const agents = DATA.agents || [];
        const agent = agents.find(a => a.id === DATA.agentId);
        const cases = DATA.cases || [];
        const verdicts = DATA.verdicts || [];
        const regressed = verdicts.filter(v => v.change === 'regressed').length;
        const fixed = verdicts.filter(v => v.change === 'fixed').length;
        const failing = verdicts.filter(v => !v.pass).length;

        const seg = agents.map(a =>
            `<button data-agent="${C.esc(a.id)}" class="${a.id === DATA.agentId ? 'sel' : ''}"
                title="${a.cases} case(s)">${C.esc(a.name)}${a.cases ? ` <span class="cnt">${a.cases}</span>` : ''}</button>`).join('');

        document.getElementById('app').innerHTML = `
            <style>
                .ok { color: var(--vscode-charts-green,#4caf50); }
                .stop { color: var(--vscode-charts-red,#f14c4c); }
                .cnt { opacity:calc(1 - .4 * var(--af-dimk, 1)); font-size:10px; }
                table.grid { width:100%; border-collapse:collapse; }
                table.grid th { text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:.4px;
                    opacity:calc(1 - .35 * var(--af-dimk, 1)); font-weight:600; padding:4px 10px; border-bottom:1px solid var(--vscode-panel-border); }
                table.grid td { padding:7px 10px; border-bottom:1px solid var(--vscode-panel-border); vertical-align:top; }
                td.num, th.num { text-align:right; white-space:nowrap; width:1%; }
                td.acts, th.acts { text-align:right; white-space:nowrap; width:1%; }
                td.state { width:1%; white-space:nowrap; }
                td.main { min-width:22rem; }
                button.mini { font-size:10px; padding:1px 6px; }
                html.af-phone #abtest { display:none; } html.af-phone td.main .small { font-weight:400; }
            </style>
            ${window.AFHeader.html({
                page: 'evals',
                title: '🧪 Evals',
                sub: agent
                    ? `${C.esc(agent.name)} · ${cases.length} case(s)`
                        + (DATA.lastTs ? ` · last run ${window.AFTime.clockUtc(DATA.lastTs)}` : ' · never run')
                        + (failing ? ` · ${failing} failing` : '')
                    : 'No agents.',
                controls: seg ? `<span class="seg">${seg}</span>` : '',
                actions: `<button class="secondary" id="newcase"${card ? ' disabled' : ''}
                        title="A prompt plus what a good answer has to satisfy — born from a bad trace, or written by hand">+ New case</button>
                    <button id="runset"${cases.length && !card ? '' : ' disabled'}
                        title="${cases.length
                        ? C.esc(`Replays all ${cases.length} case(s). Each one is a full agent call (${DATA.runArgs || 'the agent default'}) plus a cheap judge call — you are asked to confirm first.`)
                        : 'Add a case first'}">Run the set${cases.length ? ` (${cases.length})` : ''}</button>
                    <button class="secondary" id="abtest"${DATA.hasClaudeMd && !card ? '' : ' disabled'}
                        title="${DATA.hasClaudeMd
                        ? 'Compare the CLAUDE.md this agent has now against the same file plus one rule, on the same prompts'
                        : 'This agent has no CLAUDE.md to experiment on'}">A/B its instructions</button>`,
                guide: 'degerlendirme'
            })}
            ${card ? (card.kind === 'ab' ? abCardHtml() : caseCardHtml()) : (msg ? F.msg(msg, !msgOk) : '')}
            ${DATA.prevTs ? `<div class="card" style="margin-bottom:10px">
                <b>Against the previous run</b>
                <span class="muted small">${window.AFTime.clockUtc(DATA.prevTs)} → ${window.AFTime.clockUtc(DATA.lastTs)}</span>
                <div class="sub" style="margin-top:4px">
                    ${regressed ? `<span class="stop">⛔ ${regressed} regressed</span> · ` : ''}
                    ${fixed ? `<span class="ok">✅ ${fixed} fixed</span> · ` : ''}
                    ${verdicts.filter(v => v.change === 'same').length} unchanged
                    ${verdicts.filter(v => v.change === 'new').length ? ` · ${verdicts.filter(v => v.change === 'new').length} new` : ''}
                </div></div>` : ''}
            <div class="tablewrap"><table class="grid" data-afcards>
                <tr data-afcardhead><th>Case</th><th>From</th><th>Last run</th><th>Change</th><th class="acts"></th></tr>
                ${caseRows()}
            </table></div>
            <h2>Runs</h2>
            ${runRows()}`;

        window.AFHeader.wire(vscode);
        document.querySelectorAll('[data-agent]').forEach(b =>
            b.addEventListener('click', () => { card = null; post({ type: 'ev-agent', agentId: b.dataset.agent }); }));
        document.querySelectorAll('[data-del]').forEach(b =>
            b.addEventListener('click', () => post({ type: 'ev-case-delete', id: b.dataset.del })));
        const byId = (id, fn) => { const el = document.getElementById(id); if (el) { el.addEventListener('click', fn); } };
        byId('newcase', () => openCard({ kind: 'case' }));
        byId('abtest', () => openCard({ kind: 'ab' }));
        byId('runset', () => { msg = ''; post({ type: 'ev-run' }); });
        wireCard();
    }

    /** A case's own menu — the row is the object. */
    function ctxDo(act, ctx) {
        if (act === 'evDelete') { post({ type: 'ev-case-delete', id: String(ctx.evCase || '') }); return; }
        if (act === 'evCopyInput') { window.AFCtx.copy(ctx.evInput); return; }
        if (act === 'evCopyTitle') { window.AFCtx.copy(ctx.evTitle); }
    }

    // ‼️ ONCE, at module scope — render() redraws every row.
    window.AFCtx.listen(ctxDo);

    render();
})();
