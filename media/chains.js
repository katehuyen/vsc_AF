// Agent Farm — "Chains" page script: every relay chain in one table, its legs strip and its controls (S-122).
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    const T = window.AFTime;
    const TIP = window.AFTip;
    // U-189 — every word on this page is drawn in the interface language (media/afI18n.js)
    const t = (s, v) => (window.AFI18n ? window.AFI18n.t(s, v) : s.replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? String(v[k]) : m)));
    let DATA = window.__DATA__;
    let chip = '';
    const open = new Set();
    const legs = {};
    let form = null;
    let note = null;
    // S-123 — the chain a ⑂ elsewhere opened this page on: shown whatever the chip, unfolded, scrolled to, marked once
    let focus = '';

    const repaint = window.AFRepaint.guard(render);
    window.addEventListener('message', ev => {
        const m = ev.data || {};
        if (m.type === 'focus' && m.chainId) { focusOn(String(m.chainId)); return; }
        if (m.type === 'data') { DATA = m.data; for (const id of open) { ask(id); } repaint(); }
        if (m.type === 'legs') { legs[m.chainId] = m.legs || []; repaint(); }
        if (m.type === 'done') { note = { ok: !!m.ok, text: m.text || '', say: Array.isArray(m.say) && m.say.length ? m.say : null }; if (m.ok) { form = null; } render(); }
    });

    // S-128 — colours, the relay symbols and the legs strip live in media/afChainsLook.js
    const L = window.AFChainsLook;
    const GLYPH = L.GLYPH;
    // S-128 — sort, filters, search and Show N live in media/afChainsBar.js; the choice survives a reload
    const B = window.AFChainsBar;
    const q = Object.assign(B.fresh(), ((vscode.getState && vscode.getState()) || {}).chainsQ || {});
    const keep = () => { if (vscode.setState) { vscode.setState(Object.assign({}, (vscode.getState && vscode.getState()) || {}, { chainsQ: q })); } };
    const CHIPS = [['', '⑂', 'All'], ['running', '▶', 'Running'], ['waiting', '⏳', 'Waiting'], ['parked', '🅿', 'Parked'],
        ['attention', '⚠', 'Needs attention'], ['done', '■', 'Done'], ['stopped', '✕', 'Stopped']];
    const SIGNAL = { hanging: 'Hanging', 'stuck-wait': 'Stuck wait', cut: 'Cut', fault: 'Engine fault', brake: 'Brake refused' };
    const esc = s => C.esc(String(s === undefined || s === null ? '' : s));
    const short = id => String(id || '').slice(0, 8);
    const money = n => C.fmtUSD(Number(n) || 0);
    const post = (type, o) => vscode.postMessage(Object.assign({ type }, o));
    const ask = id => post('legs', { chainId: id });
    const line1 = s => String(s || '').split('\n').map(x => x.trim()).find(Boolean) || '';
    const N_ = s => s;
    function focusOn(id) { chip = ''; open.add(id); ask(id); focus = id; render(); }

    function liveWord(r) {
        const p = r.paused;
        if (p) { return t(p.held ? N_('paused — waits for you') : p.closed ? N_('paused in place — closed by a restart') : p.mode === 'here' ? N_('paused in place') : N_('pauses at the pass')); }
        if (r.state === 'parked' && r.wakeAt) { return t('wakes {time}', { time: T.clock(r.wakeAt) }); }
        if (r.state === 'waiting') { return t('waits for leg {n} to end', { n: r.leg - 1 }); }
        if (r.state !== 'running') { return ''; }
        return r.live ? t(r.live) : t('not known');
    }

    function chipsHtml(n) {
        return '<div class="ch-chips">' + CHIPS.map(([id, g, label]) => {
            const count = id ? n[id] : n.total;
            const on = chip === id;
            return `<button class="ch-chip${on ? ' on' : ''}${id === 'attention' && count ? ' warn' : ''}" data-chip="${id}" aria-pressed="${on}"
                title="${esc(id && on ? t('Click again to show every chain') : t('{n} chains', { n: count }))}">${g} ${esc(t(label))} <b>${count}</b></button>`;
        }).join('') + '</div>';
    }

    function th(label, def, cls) { return `<th${cls ? ` class="${cls}"` : ''}>${TIP.wrap(esc(t(label)), t(label), t(def))}</th>`; }

    function stateCell(r) {
        const warn = r.signals.length ? '<span class="ch-warn">⚠</span>' : '';
        const lines = [t('Why: {why}', { why: r.why }), T.tip(r.since, 'Since'),
            ...(r.paused ? [t('Paused by {by}', { by: r.paused.by }), T.tip(r.paused.at, 'Paused')] : []),
            ...(r.signals.length ? [TIP.GAP, ...r.signals.map(s => `⚠ ${t(SIGNAL[s.kind] || s.kind)}: ${s.why}`)] : [])];
        const mark = r.paused ? '<span class="ch-g">⏸</span>' : '';
        return TIP.cell('ch-st', 'data-first', `${warn}${mark}<span class="ch-g">${GLYPH[r.state] || '·'}</span> <span class="ch-sw">${esc(t(r.state))}</span>`,
            `${GLYPH[r.state] || ''} ${t(r.state)}`, TIP.lines(lines));
    }

    function chainCell(r, proj) {
        const lines = [t('Chain: {id}', { id: r.chainId }), t('Agent: {agent}', { agent: r.agentName || '—' }),
            t('Project: {project}', { project: proj ? proj.name : '—' }), r.engine ? t('Engine: {engine}', { engine: r.engine }) : '',
            T.tip(r.startedAt, 'Started'), T.tip(r.lastAt, 'Last move'), r.trimmed ? t('Only its links are left on record.') : '',
            TIP.GAP, t('{copy} copies the chain id.', { copy: L.SYM.copy })];
        const copy = `<button class="ch-copy" data-copy="${esc(r.chainId)}" aria-label="${esc(t('Copy chain id'))}">${L.SYM.copy}</button>`;
        return TIP.cell('ch-name', 'data-lead', `<span class="ch-title">${esc(r.title || r.chainId)}</span><span class="ch-id muted">${esc(r.chainId)}${copy}</span>`,
            r.title || r.chainId, TIP.lines(lines));
    }

    function legCell(r) {
        const max = r.maxLegs ? String(r.maxLegs) : '∞';
        const ceiling = !r.lastLeg && L.atEnd(r);
        const lines = [t('Leg: {leg} of {max}', { leg: r.leg, max }), r.lastLeg ? t('Last leg: braked — it writes the handover note instead of passing') : '',
            ceiling ? t('Last leg: the chain\'s ceiling — it writes the handover note instead of passing') : '',
            r.brake ? t('Brake: {brake}', { brake: r.brake }) : '', TIP.GAP, t('● ran · ▶ running · ⏳ waiting · 🅿 parked · ○ still allowed · ∞ no ceiling')];
        return TIP.cell('ch-legc', `data-label="${esc(t('Leg'))}"`, L.stepper(r), t('Leg {leg} of {max}', { leg: r.leg, max }), TIP.lines(lines));
    }

    function nowCell(r) {
        const w = liveWord(r);
        const lines = [r.sessionId ? t('Session: {id}', { id: r.sessionId }) : '', w ? t('State: {state}', { state: w }) : ''];
        return TIP.cell('ch-live ' + (r.state === 'running' ? esc(r.live || '') : ''), `data-label="${esc(t('Now'))}"`, esc(w || '—'), w || t(r.state), TIP.lines(lines));
    }

    function totalsCell(r) {
        const x = r.totals;
        const lines = [t('Legs: {n}', { n: x.legs }), t('Cost: {cost}', { cost: money(x.cost) }), t('Tokens: {n}', { n: C.fmtTok(x.tokens) }),
            x.ms ? t('Time: {time}', { time: C.fmtDur(x.ms) }) : '', x.legs > 1 ? t('Per leg: {cost}', { cost: money(x.cost / x.legs) }) : ''];
        return TIP.cell('num ch-wide', `data-label="${esc(t('Cost'))}"`, x.cost || x.tokens ? money(x.cost) : '—', t('{n} legs', { n: x.legs }), TIP.lines(lines));
    }

    function nextCell(r) {
        const n = r.next;
        if (!n) { return `<td class="ch-wide muted" data-label="${esc(t('Next'))}">—</td>`; }
        const lines = [t('Account: {account}', { account: n.account }), t('Surface: {surface}', { surface: n.surface }),
            n.model ? t('Model: {model}', { model: n.model }) : '', n.effort ? t('Effort: {effort}', { effort: n.effort }) : '',
            n.rule ? t('Account set by: {by} · {when}', { by: n.rule.by, when: T.ago(n.rule.at) }) : '',
            r.acts.account ? t('Click the account to change it for the next legs.') : ''];
        // S-143 — while a leg runs or a successor waits, the account is the control that changes it (chains.setAccount)
        const account = r.acts.account
            ? `<button class="ch-next" data-act="account" data-chain="${esc(r.chainId)}" aria-label="${esc(t('Change account'))}">${esc(n.account)}</button>`
            : esc(n.account);
        return TIP.cell('ch-wide', `data-label="${esc(t('Next'))}"`, `${account} · ${esc(n.model || '—')}`, t('The next leg opens on'), TIP.lines(lines));
    }

    function act(r, type, glyph, label, why, attrs, more) {
        return TIP.wrap(`<button class="ch-act" data-act="${type}" data-chain="${esc(r.chainId)}" ${attrs || ''} aria-label="${esc(t(label))}">${glyph}</button>`,
            t(label), t(why) + (more ? ' ' + t(more) : ''), 'ch-actw');
    }

    // S-141 — ⏸ asks how to pause (a break in place, or pass and pause); a paused row's ▶ continues it in the way it was paused
    const RESUME = p => p.held ? N_('The waiting leg goes through the door now, and the pause ends.') : p.closed ? N_('Reopens the chain from the words the leg left at the pause.')
        : p.mode === 'here' ? N_('RESUME is said into the same session; it carries on where it stopped.') : N_('The pause is cancelled before the pass: the leg passes as usual and the next leg opens at once.');
    function actsCell(r) {
        const a = r.acts;
        const p = r.paused;
        return '<td class="ch-acts">' + [
            a.resume && p ? act(r, 'resume', '▶', N_('Resume'), RESUME(p))
                : a.pause ? act(r, 'pause', '⏸', N_('Pause'), N_('Pause the chain: a short break in place, or pass and pause — you choose.')) : '',
            a.now && !(p && p.held) ? act(r, 'now', '⏭', 'Start now', 'The waiting leg goes through the door now instead of waiting.', `data-baton="${esc(a.now)}"`) : '',
            a.stop ? act(r, 'stop', L.SYM.stop, 'Stop chain', 'Stops the waiting or parked baton; no further leg opens. Nothing is deleted.') : '',
            a.lastLeg ? act(r, 'lastLeg', L.SYM.lastLeg, r.lastLeg ? 'Release last leg' : 'Last leg',
                r.lastLeg ? 'Braked now. Press to let the leg pass the baton at its handover line again.' : 'The running leg writes the handover note instead of passing.',
                `data-session="${esc(r.sessionId)}" data-on="${!r.lastLeg}" aria-pressed="${!!r.lastLeg}"`) : '',
            a.legs ? act(r, 'ceiling', '⇕', 'Leg ceiling', 'How many legs this chain may run.') : '',
            a.cont ? act(r, 'continue', '↻', 'Continue', 'Opens a new leg from the last handover words, or from what you write.') : '',
            a.end ? act(r, 'end', L.SYM.end, 'End chain', 'Marks the chain finished on purpose; the current leg writes its note instead of passing.') : '',
            r.sessionId ? act(r, 'open', '↗', 'Open session', 'The current leg\'s transcript.', `data-session="${esc(r.sessionId)}"`) : ''
        ].join('') + '</td>';
    }

    // S-128 — a leg's three subjects: why it ended (its number's mark), the session it ran (its title), the words it passed on
    const END = { context: N_('Context window'), quota: N_('Quota window'), user: N_('User intervention'), fault: 'Fault', early: N_('Early pass'), done: 'Finished' };
    function legNoCell(l) {
        const e = l.end;
        if (!e) { return `<td class="num muted">${l.leg}</td>`; }
        return TIP.cell('num ch-ln muted', '', `${l.leg}<span class="ch-cause">${L.CAUSE[e.kind] || ''}</span>`, t(END[e.kind]), TIP.lines([e.why]));
    }
    function wordsCell(l) {
        const text = esc(line1(l.words) || (l.passed ? '' : t('no pass on record')));
        if (!l.words) { return `<td class="ch-lw muted">${text}</td>`; }
        const copy = `<button class="ch-copy" data-copy="${esc(l.words)}" aria-label="${esc(t('Copy the handover words'))}">${L.SYM.copy}</button>`;
        return TIP.cell('ch-lw muted', '', copy + text, t('Handover words'), TIP.lines([l.words]));
    }
    const accountLine = l => (l.account && l.rule && l.rule !== l.account ? t('Account: {rule} → {slot}', { rule: l.rule, slot: l.account })
        : l.account || l.rule ? t('Account: {account}', { account: l.account || l.rule }) : '');

    function legsRow(r) {
        const list = legs[r.chainId];
        const body = !list ? `<span class="muted">${esc(t('Loading the legs…'))}</span>` : !list.length ? `<span class="muted">${esc(t('No legs on record.'))}</span>`
            : '<table class="ch-legs">' + list.map(l => {
                const ran = l.firstTs && l.lastTs ? C.fmtDur(Math.max(0, l.lastTs - l.firstTs)) : '';
                const title = l.title || short(l.sessionId);
                const lines = [t('Session: {id}', { id: l.sessionId }), l.agentName ? t('Agent: {agent}', { agent: l.agentName }) : '', accountLine(l),
                    l.opened ? T.tip(l.opened, 'Opened') : '', l.passed ? T.tip(l.passed, 'Passed') : '', ran ? t('Ran: {time}', { time: ran }) : '',
                    l.cost !== undefined ? t('Cost: {cost}', { cost: money(l.cost) }) : '', l.tokens ? t('Tokens: {n}', { n: C.fmtTok(l.tokens) }) : ''];
                return `<tr class="ch-leg" data-open="${esc(l.sessionId)}" tabindex="0">${legNoCell(l)}
                    ${TIP.cell('ch-lt', '', esc(title), t('Leg {leg}: {title}', { leg: l.leg, title }), TIP.lines(lines))}
                    ${wordsCell(l)}
                    <td class="num muted ch-wide">${esc(ran)}</td><td class="num">${l.cost !== undefined ? money(l.cost) : ''}</td>
                    <td class="ch-live ${esc(l.live || '')}">${esc(l.live ? t(l.live) : '')}</td></tr>`;
            }).join('') + '</table>';
        return `<tr class="ch-sub" data-afcardmore><td colspan="9">${body}</td></tr>`;
    }

    function formRow(r) {
        if (!form || form.chainId !== r.chainId) { return ''; }
        const cont = form.kind === 'continue';
        return `<tr class="ch-sub" data-afcardmore><td colspan="9"><div class="ch-form">
            ${cont ? `<textarea id="ch-prompt" rows="3" placeholder="${esc(t('Empty: the new leg starts from the chain\'s last handover words'))}">${esc(form.prompt)}</textarea>` : ''}
            <input id="ch-why" type="text" value="${esc(form.why)}" placeholder="${esc(t('Why (recorded on the chain)'))}">
            ${cont ? '' : `<label class="ch-chk"><input id="ch-close" type="checkbox"${form.endSession ? ' checked' : ''}> ${esc(t('Also close the current leg\'s session (asks first if it is working)'))}</label>`}
            <button id="ch-go">${esc(cont ? '↻ ' + t('Continue') : L.SYM.end + ' ' + t('End chain'))}</button>
            <button id="ch-cancel" class="secondary">${esc(t('Cancel'))}</button></div></td></tr>`;
    }

    // S-128 — on the ⚠ chip, the hanging chains End can reach are ended together (chains.endHanging)
    function hangBtn(rows) {
        const list = chip === 'attention' ? rows.filter(r => r.acts.end && r.signals.some(s => s.kind === 'hanging')) : [];
        if (!list.length) { return ''; }
        const label = t('End hanging ({n})', { n: list.length });
        return '<div class="ch-bulk">' + TIP.wrap(`<button id="ch-endhang" data-ids="${esc(list.map(r => r.chainId).join(','))}">🧹 ${esc(label)}</button>`,
            label, TIP.lines([t('Ends each of these as End does; no session is closed, and any of them can be continued later.'), TIP.GAP,
                ...list.map(r => `${r.title || r.chainId} — ${r.chainId}`)])) + '</div>';
    }

    function rowsHtml(rows) {
        const projects = DATA.projects || [];
        return rows.map(r => {
            const isOpen = open.has(r.chainId);
            return `<tr class="ch-row t-${L.tone(r)}${r.signals.length ? ' attn' : ''}${isOpen ? ' open' : ''}" data-chain="${esc(r.chainId)}" data-afcard>
                ${stateCell(r)}${chainCell(r, window.AFProject.find(projects, r.projectId))}<td class="ch-wide" data-label="${esc(t('Agent'))}">${esc(r.agentName || '—')}</td>
                ${legCell(r)}${nowCell(r)}${TIP.cell('ch-wide muted', `data-label="${esc(t('Last move'))}"`, esc(T.ago(r.lastAt)), t('Last move'), TIP.lines([T.tip(r.lastAt, 'Last move'), T.tip(r.startedAt, 'Started')]))}
                ${totalsCell(r)}${nextCell(r)}${actsCell(r)}</tr>${formRow(r)}${isOpen ? legsRow(r) : ''}`;
        }).join('');
    }

    function render() {
        const d = DATA;
        const byChip = d.chains.filter(r => !chip || (chip === 'attention' ? r.signals.length > 0 : r.bucket === chip));
        const v = B.view(byChip, q);
        const rows = v.rows;
        const n = d.counts;
        const table = !d.chains.length ? `<p class="muted">${esc(t('No relay chain on record yet.'))}</p>`
            : !byChip.length ? `<p class="muted">${esc(t('No chain in this state.'))} <a href="#" data-chip="">${esc(t('Show every chain'))}</a></p>`
            : !rows.length ? `<p class="muted">${esc(t('No chain matches the filters.'))} <a href="#" data-reset>${esc(t('Reset filters'))}</a></p>`
                : `<table class="ch-tab" data-afcards><thead><tr data-afcardhead>${th('State', 'Where the chain stands, from its newest record. ⚠ = something the record shows going wrong.')}
                    ${th('Chain', 'The first leg\'s title and the chain id.')}${th('Agent', 'The agent the chain runs as.', 'ch-wide')}
                    ${th('Leg', 'The legs as a strip: ● ran, the current one in its state, ○ still allowed under the ceiling (∞ = none). ⑂⊣ = this leg is the last.')}
                    ${th('Now', 'The current leg: working, idle, gone — or what the next one waits for.')}
                    <th class="ch-wide">${TIP.wrap(esc(t('Last move')), t('Last move'), t('When the chain\'s record last changed.'))}</th>
                    <th class="ch-wide num">${TIP.wrap(esc(t('Cost')), t('Cost'), t('All legs together; hover for tokens and time.'))}</th>
                    <th class="ch-wide">${TIP.wrap(esc(t('Next')), t('Next'), t('The account and model the next leg opens on.'))}</th><th></th></tr></thead>
                    <tbody>${rowsHtml(rows)}</tbody></table>`
                + (v.hidden ? `<p class="muted ch-more">${esc(t('{n} more finished chains are not listed.', { n: v.hidden }))} <a href="#" data-showall>${esc(t('Show all'))}</a></p>` : '');
        document.getElementById('app').innerHTML = `
            <style>${L.CSS}${B.CSS}</style>
            ${window.AFHeader.html({
                page: 'chains',
                title: t('Chains'),
                sub: `${esc(t('{running} running · {waiting} waiting · {attention} need attention', n))} · ${T.clockUtc(d.generatedAt)}`
            })}
            ${chipsHtml(n)}
            ${d.chains.length ? B.html(d.chains, q, d.projects) : ''}
            ${hangBtn(rows)}
            ${note ? `<div class="ch-note ${note.ok ? 'ok' : 'bad'}">${esc(note.say ? note.say.map(p => t(p.key, p.vars)).join(' ') : note.text)}</div>` : ''}
            ${table}`;
        window.AFHeader.wire(vscode);
        wire();
        if (focus) {
            const row = Array.from(document.querySelectorAll('tr.ch-row')).find(x => x.dataset.chain === focus);
            if (row) { row.classList.add('focus'); if (row.scrollIntoView) { row.scrollIntoView({ block: 'center' }); } }
            focus = '';
        }
    }

    function wire() {
        const onQ = () => { keep(); render(); };
        B.wire(q, onQ);
        document.querySelectorAll('[data-reset]').forEach(el => el.addEventListener('click', ev => { ev.preventDefault(); Object.assign(q, B.fresh(), { sort: q.sort, show: q.show }); onQ(); }));
        const hang = document.getElementById('ch-endhang');
        if (hang) { hang.addEventListener('click', () => { note = null; post('endHanging', { chainIds: hang.dataset.ids.split(',') }); }); }
        document.querySelectorAll('[data-showall]').forEach(el => el.addEventListener('click', ev => { ev.preventDefault(); q.show = 0; onQ(); }));
        document.querySelectorAll('[data-chip]').forEach(el => el.addEventListener('click', ev => {
            ev.preventDefault();
            const id = el.dataset.chip;
            chip = chip === id ? '' : id;
            render();
        }));
        document.querySelectorAll('.ch-row').forEach(el => el.addEventListener('click', () => {
            const id = el.dataset.chain;
            if (open.has(id)) { open.delete(id); } else { open.add(id); ask(id); }
            render();
        }));
        document.querySelectorAll('[data-act]').forEach(el => el.addEventListener('click', ev => {
            ev.stopPropagation();
            const id = el.dataset.chain;
            const a = el.dataset.act;
            note = null;
            if (a === 'continue' || a === 'end') { form = { chainId: id, kind: a, prompt: '', why: '', endSession: false }; render(); return; }
            if (a === 'open') { post('openSession', { sessionId: el.dataset.session }); return; }
            post(a, { chainId: id, batonId: el.dataset.baton, sessionId: el.dataset.session, on: el.dataset.on === 'true' });
        }));
        document.querySelectorAll('[data-copy]').forEach(el => el.addEventListener('click', ev => {
            ev.stopPropagation();
            window.AFCtx.copy(el.dataset.copy);
        }));
        document.querySelectorAll('[data-open]').forEach(el => el.addEventListener('click', () => post('openSession', { sessionId: el.dataset.open })));
        const prompt = document.getElementById('ch-prompt');
        if (prompt) { prompt.addEventListener('input', () => { form.prompt = prompt.value; }); }
        const why = document.getElementById('ch-why');
        if (why) { why.addEventListener('input', () => { form.why = why.value; }); }
        const close = document.getElementById('ch-close');
        if (close) { close.addEventListener('change', () => { form.endSession = close.checked; }); }
        const go = document.getElementById('ch-go');
        if (go) {
            go.addEventListener('click', () => post(form.kind, { chainId: form.chainId, prompt: form.prompt, why: form.why, endSession: form.endSession }));
        }
        const cancel = document.getElementById('ch-cancel');
        if (cancel) { cancel.addEventListener('click', () => { form = null; render(); }); }
    }

    if (DATA.focusChain) { focusOn(String(DATA.focusChain)); } else { render(); }
})();
