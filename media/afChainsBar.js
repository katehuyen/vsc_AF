// Agent Farm — the Chains page's bar (S-128): sort, the agent / project / reason filters, a search over
// the words, and how many finished chains to show. Live and attention chains are never cut by the limit.
(function () {
    'use strict'; // i18n-exempt — a directive, not interface text
    const t = (s, v) => (window.AFI18n ? window.AFI18n.t(s, v) : s.replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? String(v[k]) : m)));
    const esc = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
    const ACTIVE = { running: 1, waiting: 1, parked: 1 };
    const SORTS = [
        ['last', 'Last move', 'Newest activity first.'], // i18n-exempt — translated where drawn, t(o[1]) / t(o[2])
        ['cost', 'Cost', 'The most expensive chains first, all legs together.'], // i18n-exempt — translated where drawn, t(o[1]) / t(o[2])
        ['legs', 'Legs', 'The longest chains first.'], // i18n-exempt — translated where drawn, t(o[1]) / t(o[2])
        ['attention', 'Attention', 'Chains with something going wrong first, then the newest.'] // i18n-exempt — translated where drawn, t(o[1]) / t(o[2])
    ];
    const SHOWS = [['25', '25', 'The newest 25 finished chains.'], ['50', '50', 'The newest 50 finished chains.'], ['0', 'All', 'Every finished chain.']]; // i18n-exempt — translated where drawn, t(o[1]) / t(o[2])
    const REASONS = [['hanging', 'Hanging'], ['stuck-wait', 'Stuck wait'], ['cut', 'Cut'], ['fault', 'Engine fault'], // i18n-exempt — translated where drawn, t(o[1]) / t(o[2])
        ['brake', 'Brake refused'], ['ceiling', 'Ceiling'], ['barren', 'Barren']]; // i18n-exempt — translated where drawn, t(o[1]) / t(o[2])

    function fresh() { return { sort: 'last', agents: null, projects: null, reasons: null, text: '', show: 25 }; }

    /** The same reasons chains.list filters by (src/core/chainBoard.ts reasonsOf). */
    function reasonsOf(r) {
        return r.signals.map(s => s.kind).concat(r.brake === 'ceiling' || r.brake === 'barren' ? [r.brake] : []);
    }
    const pinned = r => !!ACTIVE[r.state] || r.signals.length > 0;
    const legsOf = r => Math.max((r.totals && r.totals.legs) || 0, Number(r.leg) || 0);
    const BY = {
        last: (a, b) => b.lastAt - a.lastAt,
        cost: (a, b) => ((b.totals && b.totals.cost) || 0) - ((a.totals && a.totals.cost) || 0) || b.lastAt - a.lastAt,
        legs: (a, b) => legsOf(b) - legsOf(a) || b.lastAt - a.lastAt,
        attention: (a, b) => Number(b.signals.length > 0) - Number(a.signals.length > 0) || b.lastAt - a.lastAt
    };

    /** Which rows the table draws: the filtered ones, sorted, live and attention first; the rest cut at `show`. */
    function view(rows, q) {
        // the one query grammar every typed box shares (media/afQuery.js): Turkish i, quotes, -not, OR
        const m = String(q.text || '').trim() ? window.AFQuery.compile(q.text) : null;
        const kept = rows.filter(r => (q.agents === null || q.agents.indexOf(r.agentName || '') >= 0)
            && (q.projects === null || q.projects.indexOf(r.projectId || '') >= 0)
            && (q.reasons === null || reasonsOf(r).some(k => q.reasons.indexOf(k) >= 0))
            && (!m || m.test([r.title, r.chainId, r.agentName, r.why, r.words].filter(Boolean).join('\n'))))
            .sort(BY[q.sort] || BY.last);
        const top = kept.filter(pinned);
        const rest = kept.filter(r => !pinned(r));
        const shown = q.show > 0 ? rest.slice(0, q.show) : rest;
        return { rows: top.concat(shown), hidden: rest.length - shown.length, matched: kept.length };
    }

    /** How many of the bar's own filters narrow the list (sort and Show do not). */
    const narrowing = q => [q.agents, q.projects, q.reasons].filter(x => x !== null).length + (String(q.text || '').trim() ? 1 : 0);

    function select(id, label, list, value, detail) {
        const cur = list.find(o => o[0] === String(value)) || list[0];
        return window.AFTip.wrap(`<select id="${id}" aria-label="${esc(t(label))}">${list.map(o =>
            `<option value="${esc(o[0])}" title="${esc(t(o[2]))}"${o[0] === String(value) ? ' selected' : ''}>${esc(t(o[1]))}</option>`).join('')}</select>`,
        t(label), window.AFTip.lines([t('{label}: {value}', { label: t(label), value: t(cur[1]) }), window.AFTip.GAP, detail(cur)]), 'ch-barw');
    }

    function html(rows, q, projects) {
        const F = window.AFFilter;
        const agents = Array.from(new Set(rows.map(r => r.agentName || ''))).sort();
        const projs = Array.from(new Set(rows.map(r => r.projectId || ''))).sort();
        const pname = id => (id ? ((window.AFProject && window.AFProject.find(projects || [], id)) || {}).name || id : '—');
        return `<div class="ch-bar">
            ${select('ch-sort', 'Sort', SORTS, q.sort, o => t(o[2]))}
            ${F.multi({ id: 'ch-agents', label: t('Agent'), options: agents.map(a => ({ v: a, t: a || '—' })), selected: q.agents })}
            ${F.multi({ id: 'ch-projects', label: t('Project'), options: projs.map(p => ({ v: p, t: pname(p) })), selected: q.projects })}
            ${F.multi({ id: 'ch-reasons', label: t('Reason'), options: REASONS.map(o => ({ v: o[0], t: t(o[1]) })), selected: q.reasons })}
            ${window.AFTip.wrap(`<input id="ch-q" type="text" value="${esc(q.text)}" placeholder="${esc(t('search titles, ids, reasons, handover words'))}" aria-label="${esc(t('Search'))}">`,
        t('Search'), window.AFQuery.tip(t('Searched against the title, the chain id, the agent, the record\'s reason and the latest handover words.')), 'ch-barw ch-qw')}
            ${select('ch-show', 'Show', SHOWS, q.show, o => t(o[2]) + ' ' + t('Running, waiting, parked and attention chains are always listed.'))}
            ${narrowing(q) ? window.AFTip.wrap(`<button id="ch-reset" class="secondary" aria-label="${esc(t('Reset filters'))}">↺</button>`,
        t('Reset filters'), t('Agent, project, reason and search back to all; the sort and Show stay.'), 'ch-barw') : ''}
        </div>`;
    }

    function wire(q, onChange) {
        const F = window.AFFilter;
        const sort = document.getElementById('ch-sort');
        if (sort) { sort.addEventListener('change', () => { q.sort = sort.value; onChange(); }); }
        const show = document.getElementById('ch-show');
        if (show) { show.addEventListener('change', () => { q.show = Number(show.value) || 0; onChange(); }); }
        [['ch-agents', 'agents'], ['ch-projects', 'projects'], ['ch-reasons', 'reasons']].forEach(([id, key]) =>
            F.wireMulti({ id, onChange: sel => { q[key] = sel; onChange(); } }));
        const box = document.getElementById('ch-q');
        if (box) {
            F.live(box, () => { q.text = box.value; onChange(); });
            F.clearable(box, () => { q.text = ''; onChange(); });
        }
        const reset = document.getElementById('ch-reset');
        if (reset) { reset.addEventListener('click', () => { Object.assign(q, fresh(), { sort: q.sort, show: q.show }); onChange(); }); }
    }

    const CSS = `
        .ch-bar { display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin:0 0 8px; }
        .ch-bar select { min-height:26px; }
        .ch-bar #ch-q { flex:1 1 220px; min-width:0; min-height:26px; }
        .ch-bar .af-clr, .ch-bar .ch-qw { flex:1 1 220px; min-width:0; display:flex; }
        .ch-barw { display:inline-block; }
        .ch-more { margin:6px 0; font-size:12px; }`;

    window.AFChainsBar = { fresh, view, html, wire, reasonsOf, narrowing, CSS };
})();
