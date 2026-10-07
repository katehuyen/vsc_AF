// Agent Farm — what the two A2A pages share (N-6): the card grammar, the
// coordinate chips, the supervisor directive block, the lease bar and a safe
// markdown for bodies agents write. A note and a task are two stores on
// purpose (core/a2aNotes.ts), but they are drawn in one voice — a reader who
// has learned one card has learned the other.
(function () {
    'use strict';
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // ---- minimal safe markdown (escape first, then structural transforms) ----
    function mdInline(t) {
        t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, x, u) => `<a href="#" class="a2a-link" data-href="${u}">${x}</a>`);
        t = t.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (m, p, u) => `${p}<a href="#" class="a2a-link" data-href="${u}">${u}</a>`);
        t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
        t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
        return t;
    }
    function md(src) {
        const lines = esc(src || '').split('\n');
        let html = '', inList = false, inCode = false;
        const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
        for (const line of lines) {
            if (/^```/.test(line.trim())) { if (inCode) { html += '</pre>'; inCode = false; } else { closeList(); html += '<pre class="a2a-code">'; inCode = true; } continue; }
            if (inCode) { html += line + '\n'; continue; }
            const h = line.match(/^(#{1,6})\s+(.*)$/);
            if (h) { closeList(); html += `<div class="a2a-h">${mdInline(h[2])}</div>`; continue; }
            const li = line.match(/^\s*[-*]\s+(.*)$/);
            if (li) { if (!inList) { html += '<ul>'; inList = true; } html += `<li>${mdInline(li[1])}</li>`; continue; }
            if (!line.trim()) { closeList(); html += '<div class="a2a-sp"></div>'; continue; }
            closeList(); html += `<div>${mdInline(line)}</div>`;
        }
        if (inCode) { html += '</pre>'; } closeList();
        return html;
    }

    // ---- the coordinates: what a row is ABOUT and who it is FOR ----
    // '*' is "anything" on the store's side; on screen it is drawn as the word,
    // never as a bare asterisk a reader would take for a footnote.
    const ANY = 'any';
    const STRICT = {
        hard: 'hard — every stated coordinate must match, or it is not yours',
        preferred: 'preferred — mismatches allowed, exact hits rank first; the target role\'s alone for a grace period',
        any: 'any — the coordinates are a label; anyone may take it'
    };
    function chip(cls, text, head, body, attrs) {
        const c = `<span class="a2a-chip ${cls}"${attrs || ''}>${esc(text)}</span>`;
        return window.AFTip ? window.AFTip.wrap(c, head, body) : c;
    }
    // An ABSOLUTE path is wide and its head says nothing: the chip carries the
    // last segment and the hover the whole of it (SHORTHAND). A relative
    // subsystem (`src/core`) is already the short form and stays whole.
    function shortPath(p) {
        const s = String(p);
        if (!/^([a-zA-Z]:[\\/]|[\\/])/.test(s)) { return s; }
        const parts = s.split(/[\\/]+/).filter(Boolean);
        return parts.length > 1 ? parts[parts.length - 1] : s;
    }
    function coords(row, projects) {
        const p = row.project === '*' ? null : window.AFProject.find(projects || [], row.project);
        const pName = row.project === '*' ? ANY : (p ? p.name : row.project);
        const where = row.subsystem !== undefined ? row.subsystem : row.workdir;
        const whereName = row.subsystem !== undefined ? 'Subsystem' : 'Workdir';
        return `<span class="a2a-coords">`
            + chip('a2a-c-proj', '◧ ' + pName, 'Project', `Project: ${pName}\n${row.project === '*' ? 'Every project — a broadcast on this axis.' : (p ? (p.summary || '') : 'Filed by key; the project is not open in this window.')}`)
            + chip('a2a-c-where', '📁 ' + (where === '*' ? ANY : shortPath(where)), whereName, `${whereName}: ${where === '*' ? 'anywhere' : where}`)
            // S-84 — on a relay card the topic IS the chain, so the chip is the
            // way into that race: one click locks the page to it, leg by leg.
            + (row.category === 'baton' && row.topic !== '*'
                ? chip('a2a-c-topic a2a-chainchip', '⑂ ' + row.topic, 'Chain',
                    `Chain: ${row.topic}\nThis card is one leg of that relay.\n\nClick to lock the page to this chain — every leg from the first, oldest first.`,
                    ` data-chain="${esc(row.topic)}"`)
                : chip('a2a-c-topic', '# ' + (row.topic === '*' ? ANY : row.topic), 'Topic', `Topic: ${row.topic === '*' ? 'anything' : row.topic}\nThe anchor a reader searches by.`))
            + chip('a2a-c-role', '→ ' + (row.targetRole === '*' ? 'anyone' : row.targetRole), 'Target role', `Target role: ${row.targetRole === '*' ? 'anyone' : row.targetRole}\nSession: ${row.targetSession === '*' ? 'any' : row.targetSession}`)
            + chip('a2a-c-strict a2a-s-' + esc(row.strictness), row.strictness, 'Strictness', `Strictness: ${STRICT[row.strictness] || row.strictness}`)
            + `</span>`;
    }

    // ---- the user's word, drawn the way the bridge prints it (N-8) ----
    function directive(d) {
        if (!d) { return ''; }
        const verb = { steer: 'do it THIS way', veto: 'NOT this — do something else', constraint: 'stay WITHIN these limits' }[d.kind] || d.kind;
        return `<div class="a2a-directive a2a-d-${esc(d.kind)}">
            <div class="a2a-dhead">⚠️ HUMAN SUPERVISOR DIRECTIVE — ${esc(d.kind)}: ${esc(verb)}</div>
            <div class="a2a-dbody">${md(d.text)}</div>
            <div class="a2a-dwhen muted">set ${esc(window.AFTime.full(d.ts))} · outranks every rule the agent applies</div>
        </div>`;
    }

    // ---- the supervisor's hand (N-7): a badge, a hidden +, an inline cockpit ----
    // The badge is the OPPOSITE of the + on purpose. A directive outranks every
    // rule the agent applies, so a card carrying one must be unmistakable from
    // across the list; the control that SETS one is a person's occasional
    // gesture and costs a card nothing until the pointer is on it.
    const KIND_VERB = { steer: 'do it THIS way', veto: 'NOT this — do something else', constraint: 'stay WITHIN these limits' };
    const KINDS = [
        { id: 'steer', label: 'steer — do it this way', detail: 'The work stands; this is how it is to be done.' },
        { id: 'veto', label: 'veto — not this, do something else', detail: 'The work as stated is refused. Say what instead.' },
        { id: 'constraint', label: 'constraint — stay within these limits', detail: 'The work stands, inside a boundary the agent may not cross.' }
    ];
    function directiveFlag(d) {
        if (!d) { return ''; }
        const b = `<span class="a2a-dflag a2a-df-${esc(d.kind)}">👤 ${esc(d.kind)}</span>`;
        return window.AFTip
            ? window.AFTip.wrap(b, 'Supervisor directive', `${d.kind} — ${KIND_VERB[d.kind] || d.kind}\n\n${d.text}\n\nThe agent reads this before its own rules. Press + on this card to change or take it off.`)
            : b;
    }
    function plus(id, open) {
        return `<button class="a2a-plus${open ? ' on' : ''}" data-plus="${esc(id)}"`
            + ` title="${open ? 'Close the supervisor cockpit' : 'Supervisor cockpit — steer, veto or constrain this card'}"`
            + ` aria-label="Supervisor cockpit">${open ? '✕' : '+'}</button>`;
    }
    /**
     * The cockpit itself, drawn by the page's own form component so a person
     * gets the same keyboard bargain here as everywhere else (Ctrl+Enter
     * submits, ✕ closes, the refusal lands IN the card).
     *
     * `reroute` and `runNow` are the task page's alone — a note is passive and
     * there is nothing to re-assign or to start.
     */
    function cockpit(o) {
        const F = window.AFForm;
        const d = o.draft || {};
        let body = F.grid([
            F.sel('kind', 'Directive', KINDS, d.kind, { tip: 'What your word DOES to the agent that reads it.' }),
            // A word already on the card says WHEN it was given: a constraint
            // set three weeks ago and one set this morning are read differently.
            o.setAt ? F.stat('Standing since', window.AFTime.full(o.setAt)) : '',
            F.area('text', 'Your word', d.text || '', {
                rows: 3, required: true,
                ph: 'Read before the agent\'s own rules — say what it must DO, in one or two sentences.'
            })
        ]);
        if (o.reroute) {
            body += F.sec('Re-route', 'give it to somebody else — your authority, so the loop guard does not apply and the count starts again')
                + F.grid([
                    F.sel('targetRole', 'To', o.roles || [], d.targetRole, { tip: 'The role or agent the new task is for. "anyone" puts it back on the open board.' }),
                    F.sel('project', 'Project', o.projects || [], d.project, { tip: 'Which project the new task is filed under.' }),
                    F.text('workdir', 'Workdir', d.workdir || '', { tip: 'The folder or subsystem it is about; * is anywhere.' }),
                    F.text('why', 'Why', d.why || '', { wide: true, ph: 'recorded on the task you are taking it off' })
                ]);
        }
        const extra = [
            o.has ? '<button class="secondary" data-afact="dremove" title="Take your directive off this card — the agent goes back to its own rules">✕ Remove directive</button>' : '',
            o.reroute ? '<button class="secondary" data-afact="reroute" title="Close this task and open a new one for the role above, carrying the trail and your directive">↪ Re-route</button>' : '',
            o.runNow ? '<button class="secondary" data-afact="runnow" title="Open a Console session on the agent this task names, with the claim as its first prompt">⚡ Run Now</button>' : ''
        ].filter(Boolean).join('');
        return `<div class="a2a-cockpit">${F.card({
            id: 'a2a-cockpit', title: '👤 Supervisor', lede: o.lede || '',
            body: body, msg: o.msg || '', warn: !!o.msg,
            submit: o.has ? 'Update directive' : 'Set directive',
            extra: extra
        })}</div>`;
    }

    // ---- a lease as a bar: how much of the 30 minutes is left, and the claimant's own word ----
    function leaseBar(task, now, leaseMs) {
        const c = task.claimedBy;
        // A lease means something only while the task is open; on a closed one it is history.
        if (!c || !leaseMs || ['done', 'failed', 'cancelled'].indexOf(task.state) >= 0) { return ''; }
        const left = Math.max(0, c.leaseExpiresAt - now);
        const pct = Math.max(0, Math.min(100, Math.round(left / leaseMs * 100)));
        const mins = Math.ceil(left / 60000);
        const tone = pct > 50 ? 'ok' : (pct > 20 ? 'warn' : 'dying');
        const bar = `<span class="a2a-lease a2a-l-${tone}" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">`
            + `<span class="a2a-lfill" style="width:${pct}%"></span></span>`
            + `<span class="a2a-ltext">${left ? mins + 'm left' : 'lease expired'}${c.progress ? ' · ' + esc(c.progress) : ''}</span>`;
        const body = `Claimed by: ${c.agent}${c.sessionId ? ' (' + c.sessionId.slice(0, 8) + ')' : ''}\nLease: ${left ? mins + ' min left' : 'expired — goes back to queued on the next sweep'}`
            + `\nExpires: ${window.AFTime.full(c.leaseExpiresAt)}\nProgress: ${c.progress || '—'}\n\nEvery heartbeat pushes the lease forward; a claimant that stops beating loses the task.`;
        return window.AFTip ? window.AFTip.wrap(`<span class="a2a-leasew">${bar}</span>`, 'Lease', body) : bar;
    }

    const CAT = { info: 'ℹ️', warning: '⚠️', convention: '📐', discovery: '🔎', result: '✅', baton: '⑂' };
    const STATE = {
        queued: ['⏳', 'queued — waiting for a claimant that fits'],
        claimed: ['✋', 'claimed — an agent holds the lease and has not reported running yet'],
        running: ['▶', 'running — the claimant is working and beating'],
        done: ['✓', 'done'], failed: ['✗', 'failed'],
        blocked: ['⛔', 'blocked — needs a person: past the handoff depth, or the claimant said so'],
        cancelled: ['⊘', 'cancelled']
    };
    function stateBadge(state) {
        const s = STATE[state] || ['·', state];
        const b = `<span class="a2a-state a2a-st-${esc(state)}">${s[0]} ${esc(state)}</span>`;
        return window.AFTip ? window.AFTip.wrap(b, 'State', s[1]) : b;
    }

    /** The filter row — a query box, the pickers, a reset — then `o.actions`, the bulk bar on its own line. */
    function controls(prefix, o) {
        return `<div class="a2a-controls">
            <input id="${prefix}-search" type="search" placeholder="🔍 search" value="${esc(o.query)}"
                title="${esc(o.searchTip)}">
            ${o.pickers.map(p => window.AFFilter.multi({ id: p.id, label: p.label, options: p.options, selected: p.get(), title: p.title })).join('')}
            ${o.extra || ''}
            <button class="secondary" id="${prefix}-reset" title="Reset filters">↺</button>
            ${o.actions || ''}
        </div>`;
    }
    /**
     * N-7 — the cockpit's own wiring, once for both pages. The draft lives on
     * the PAGE (o.onEdit) rather than here: these pages render by replacing
     * innerHTML, and a host push that repaints under a half-typed directive
     * must not throw the words away.
     */
    function wireCockpit(o) {
        const root = document.querySelector('.a2a-cockpit');
        if (!root) { return; }
        const F = window.AFForm;
        F.wire(root, {
            onEdit: v => { if (o.onEdit) { o.onEdit(v); } },
            onCancel: () => o.onCancel(),
            onSubmit: () => o.onSubmit(F.read(root)),
            onAct: a => o.onAct(a, F.read(root))
        });
        if (o.focus) {
            const t = root.querySelector('textarea');
            if (t && t.focus) { t.focus(); }
        }
    }

    function wireControls(prefix, o) {
        const bind = (id, ev, fn) => { const el = document.getElementById(id); if (el) { el.addEventListener(ev, fn); } };
        bind(prefix + '-search', 'input', e => o.onQuery(e.target.value));
        o.pickers.forEach(p => window.AFFilter.wireMulti({ id: p.id, onChange: sel => { p.set(sel); o.onChange(); } }));
        bind(prefix + '-reset', 'click', () => o.onReset());
    }

    const STYLE = `<style>
        .a2a-controls { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
        .a2a-controls input[type=search] { min-width:160px; padding:3px 6px; }
        .a2a-day { margin:14px 0 4px; font-size:11px; opacity:.6; text-transform:uppercase; letter-spacing:.04em; }
        .a2a-card { border:1px solid var(--vscode-panel-border); border-radius:6px; margin:4px 0; background:var(--vscode-editorWidget-background); }
        .a2a-card.a2a-focus { outline:2px solid var(--vscode-focusBorder); }
        .a2a-card.a2a-closed { opacity:calc(1 - .4 * var(--af-dimk, 1)); }
        .a2a-line { display:flex; gap:8px; align-items:center; padding:6px 10px; cursor:pointer; flex-wrap:wrap; }
        .a2a-line:hover { background:var(--vscode-list-hoverBackground); }
        .a2a-title { font-weight:600; flex:1 1 220px; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .a2a-from { flex-shrink:0; font-size:11.5px; opacity:.85; white-space:nowrap; }
        .a2a-age { flex-shrink:0; font-size:11px; opacity:calc(1 - .4 * var(--af-dimk, 1)); white-space:nowrap; }
        .a2a-coords { display:inline-flex; gap:4px; flex-wrap:wrap; }
        .a2a-chip { font-size:10.5px; padding:1px 6px; border-radius:9px; background:var(--vscode-badge-background); color:var(--vscode-badge-foreground); white-space:nowrap; opacity:.85; }
        .a2a-chip.a2a-c-strict { text-transform:uppercase; font-size:9.5px; letter-spacing:.04em; }
        .a2a-s-hard { background:var(--vscode-inputValidation-errorBackground); }
        .a2a-s-any { opacity:.6; }
        .a2a-state { font-size:11px; padding:1px 7px; border-radius:9px; white-space:nowrap; border:1px solid var(--vscode-panel-border); }
        .a2a-st-queued { color:var(--vscode-foreground); }
        .a2a-st-claimed, .a2a-st-running { color:var(--af-ink-testing-iconQueued, var(--vscode-testing-iconQueued, #d4a72c)); border-color:currentColor; }
        .a2a-st-done { color:var(--af-ink-testing-iconPassed, var(--vscode-testing-iconPassed, #3fb950)); }
        .a2a-st-failed { color:var(--af-ink-errorForeground, var(--vscode-errorForeground)); }
        .a2a-st-blocked { color:var(--af-ink-editorWarning-foreground, var(--vscode-editorWarning-foreground, #d4a72c)); font-weight:600; }
        .a2a-st-cancelled { opacity:.6; }
        .a2a-cat { flex-shrink:0; }
        .a2a-flag { font-size:11px; opacity:.8; flex-shrink:0; white-space:nowrap; }
        .a2a-body { padding:4px 12px 10px 28px; font-size:12.5px; line-height:1.5; border-top:1px dashed var(--vscode-panel-border); }
        .a2a-body .a2a-h { font-weight:600; margin-top:6px; }
        .a2a-body .a2a-sp { height:6px; }
        .a2a-code { background:var(--vscode-textCodeBlock-background); padding:6px 8px; border-radius:4px; overflow:auto; font-size:11.5px; }
        .a2a-sec { margin-top:8px; }
        .a2a-sech { font-size:11px; opacity:.6; text-transform:uppercase; letter-spacing:.04em; margin-bottom:2px; }
        .a2a-facts { display:grid; grid-template-columns:max-content 1fr; gap:2px 12px; font-size:12px; }
        .a2a-facts dt { opacity:.6; } .a2a-facts dd { margin:0; word-break:break-all; }
        .a2a-files a, .a2a-xref { cursor:pointer; text-decoration:underline; color:var(--vscode-textLink-foreground); }
        .a2a-actions { display:flex; gap:6px; margin-top:10px; flex-wrap:wrap; align-items:center; }
        .a2a-actions .muted { font-size:11.5px; }
        .a2a-directive { margin:8px 0; padding:8px 10px; border-left:4px solid var(--vscode-editorWarning-foreground, #d4a72c); background:var(--vscode-inputValidation-warningBackground); border-radius:0 4px 4px 0; }
        .a2a-d-veto { border-left-color:var(--vscode-errorForeground); background:var(--vscode-inputValidation-errorBackground); }
        .a2a-dhead { font-weight:700; font-size:12px; }
        .a2a-dwhen { font-size:11px; margin-top:4px; }
        .a2a-leasew { display:inline-flex; align-items:center; gap:6px; flex-shrink:0; }
        .a2a-lease { display:inline-block; width:90px; height:7px; border-radius:4px; background:var(--vscode-progressBar-background, #444); opacity:.35; overflow:hidden; vertical-align:middle; }
        .a2a-leasew .a2a-lease { opacity:1; background:var(--vscode-panel-border); }
        .a2a-lfill { display:block; height:100%; background:var(--vscode-testing-iconPassed, #3fb950); }
        .a2a-l-warn .a2a-lfill { background:var(--vscode-editorWarning-foreground, #d4a72c); }
        .a2a-l-dying .a2a-lfill { background:var(--vscode-errorForeground); }
        .a2a-ltext { font-size:11px; opacity:.75; white-space:nowrap; }
        .a2a-hop { font-size:11px; opacity:.75; white-space:nowrap; }
        .a2a-empty { margin-top:24px; }
        .a2a-lane { margin:16px 0 4px; font-size:12px; font-weight:600; opacity:.8; }
        .a2a-dflag { font-size:10.5px; font-weight:700; letter-spacing:.03em; text-transform:uppercase; padding:1px 7px; border-radius:9px; white-space:nowrap; flex-shrink:0;
            background:var(--vscode-editorWarning-foreground, #d4a72c); color:var(--vscode-editor-background, #1e1e1e); }
        .a2a-df-veto { background:var(--vscode-errorForeground, #f14c4c); color:var(--vscode-editor-background, #1e1e1e); }
        .a2a-df-constraint { background:var(--vscode-textLink-foreground, #3794ff); color:var(--vscode-editor-background, #1e1e1e); }
        .a2a-plus { flex-shrink:0; width:20px; height:20px; padding:0; line-height:1; font-size:13px; border-radius:50%;
            opacity:0; transition:opacity .12s; background:transparent; color:var(--vscode-foreground); border:1px solid var(--vscode-panel-border); }
        .a2a-card:hover .a2a-plus, .a2a-plus:focus, .a2a-plus.on { opacity:1; }
        .a2a-plus.on { background:var(--vscode-button-background); color:var(--vscode-button-foreground); border-color:transparent; }
        .a2a-cockpit { padding:0 10px 10px 28px; }
        .a2a-cockpit .affbox { margin:0; }
        .a2a-chainchip { cursor:pointer; }
        .a2a-chainchip:hover { background:var(--vscode-list-hoverBackground); text-decoration:underline; }
        .a2a-pin { flex-shrink:0; }
        .a2a-pin { cursor:pointer; opacity:.25; filter:grayscale(1); font-size:12px; }
        .a2a-pin:hover { opacity:.7; } .a2a-pin.on { opacity:1; filter:none; }
        .a2a-card.pinned { border-color:var(--vscode-focusBorder); }
        .a2a-card.sel { background:var(--vscode-list-inactiveSelectionBackground); }
        .a2a-bmode.on { background:var(--vscode-button-background); color:var(--vscode-button-foreground); }
        .a2a-chainbar { display:flex; gap:8px; align-items:center; margin:10px 0 2px; padding:5px 10px; border-radius:6px;
            border:1px solid var(--vscode-focusBorder); background:var(--vscode-editorWidget-background); font-size:12px; }
        .a2a-chainbar .a2a-chainid { font-weight:600; }
        .a2a-chainbar .muted { font-size:11.5px; }
        /* the phone (media/afMobile.js): a lease's words wrap under its bar */
        html.af-phone .a2a-leasew { display:flex; flex-wrap:wrap; max-width:100%; }
        html.af-phone .a2a-ltext { white-space:normal; }
    </style>`;

    window.AFA2A = { esc, md, coords, directive, directiveFlag, plus, cockpit, leaseBar, stateBadge, controls, wireControls, wireCockpit, CAT, KINDS, STYLE };
})();
