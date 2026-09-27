// Agent Farm — U-151: '↑ make default' and '↺ back to inherited' beside a flex picker.
//
// A value typed on one run is a guess; the same value typed on the tenth run is
// a default nobody wrote down. The ↑ beside a box that holds its own value opens
// one strip: move it up the chain in one move (this project · this agent ·
// everywhere), or drop it and inherit again. A box that inherits has nothing to
// move, so it draws nothing (DENSITY). The page posts `flexPromote`; the host
// writes through the same core as the bridge's `flex.set`.
(function () {
    'use strict';
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const own = v => v !== undefined && v !== null && String(v).trim() !== '';

    /** Most specific first: the run's project, its agent, then Farm Settings. */
    function levelsFor(agent, project) {
        const out = [];
        if (project && project.id) {
            out.push({ level: 'project', target: project.id, name: 'this project', who: project.name || project.id });
        }
        if (agent) { out.push({ level: 'agent', target: agent, name: 'this agent', who: agent }); }
        out.push({ level: 'settings', target: '', name: 'everywhere', who: 'Farm Settings' });
        return out;
    }

    /** The point a surface's box sets, read off the registry (`levels.<l>.surface`). */
    function pointAt(surface) {
        const F = window.AFFlex;
        const hit = F && (F.POINTS || []).find(p => Object.keys(p.levels || {}).some(l => (p.levels[l] || {}).surface === surface));
        return hit ? hit.id : '';
    }

    const ORDER = ['settings', 'agent', 'project', 'workflow', 'step', 'run'];
    /** The levels ABOVE `from` the point can be set at and the run has a target for — most specific first. */
    function levelsAbove(point, from, ctx) {
        const p = window.AFFlex && window.AFFlex.point(point);
        const c = ctx || {};
        if (!p) { return []; }
        return ORDER.slice(0, Math.max(0, ORDER.indexOf(from))).reverse().filter(l => p.levels[l]).map(l => (
            l === 'settings' ? { level: l, target: '', name: 'everywhere', who: 'Farm Settings' }
                : l === 'agent' ? (c.agent ? { level: l, target: c.agent, name: 'this agent', who: c.agent } : null)
                    : l === 'project' ? (c.project && c.project.id ? { level: l, target: c.project.id, name: 'this project', who: c.project.name || c.project.id } : null)
                        : l === 'workflow' ? (c.workflow && c.workflow.id ? { level: l, target: c.workflow.id, name: 'this flow', who: c.workflow.title || c.workflow.id } : null)
                            : null)).filter(Boolean);
    }

    function button(point, value, open) {
        if (!own(value)) { return ''; }
        return `<button type="button" class="flexup${open ? ' on' : ''}" data-flexup="${esc(point)}" aria-expanded="${open}"`
            + ` title="${esc('Make this value a default, or go back to the inherited one\n\n'
                + 'Opens a strip under the row: this project · this agent · everywhere (Farm Settings), and ↺ back to inherited.')}">↑</button>`;
    }

    /** `label` names the box, `shown` is the value as the box words it. */
    function strip(point, label, shown, levels) {
        const to = l => `<button type="button" class="secondary" data-flexup-to="${esc(point)}" data-level="${l.level}"`
            + ` data-target="${esc(l.target)}" title="${esc(label + ' = ' + shown + ' — the default for ' + l.name + ' (' + l.who + ')\n\n'
                + 'Written there and taken off this form: from now on every run '
                + (l.level === 'settings' ? 'that says nothing inherits it.' : 'of ' + l.name.replace('this ', 'that ') + ' inherits it.'))}">`
            + `${esc(l.name)} · ${esc(l.who)}</button>`;
        return `<div class="ntf wide flexup-strip" data-flexup-strip="${esc(point)}">`
            + `<span class="lbl">↑ ${esc(label)} = <b>${esc(shown)}</b> — make it the default for</span>`
            + levels.map(to).join('')
            + `<button type="button" class="secondary" data-flexup-back="${esc(point)}"`
            + ` title="${esc('↺ Back to inherited\n\nEmpties the box: this run takes the value its agent, project or Farm Settings states.')}">↺ back to inherited</button></div>`;
    }

    /** What a box holds, as the point's own type — the host checks it against the point. */
    function typed(point, raw) {
        const p = window.AFFlex && window.AFFlex.point(point);
        const s = String(raw == null ? '' : raw).trim();
        if (p && p.type === 'number') { return Number(s); }
        if (p && p.type === 'boolean') { return s === 'true'; }
        return s;
    }

    /**
     * `on.open(point)` toggles the strip, `on.back(point)` empties the box,
     * `on.value(point)` reads what it holds now; the promotion itself is posted.
     */
    function wire(root, post, on) {
        const all = sel => Array.from((root || document).querySelectorAll(sel));
        all('[data-flexup]').forEach(b => b.addEventListener('click', ev => {
            ev.preventDefault();
            on.open(b.dataset.flexup);
        }));
        all('[data-flexup-to]').forEach(b => b.addEventListener('click', ev => {
            ev.preventDefault();
            const point = b.dataset.flexupTo;
            post({
                type: 'flexPromote', point, level: b.dataset.level,
                target: b.dataset.target || '', value: typed(point, on.value(point))
            });
        }));
        all('[data-flexup-back]').forEach(b => b.addEventListener('click', ev => {
            ev.preventDefault();
            on.back(b.dataset.flexupBack);
        }));
    }

    /** One look on every surface that draws the control. */
    function css() {
        return `.flexup { margin-left:6px; padding:0 5px; min-width:0; height:16px; line-height:14px; font-size:11px;
                border-radius:3px; background:transparent; color:var(--vscode-descriptionForeground);
                border:1px solid var(--vscode-panel-border, rgba(128,128,128,.35)); cursor:pointer; vertical-align:1px; }
            .flexup:hover, .flexup.on { color:var(--vscode-foreground); border-color:var(--vscode-focusBorder); }
            .flexup-strip { flex-direction:row !important; flex-wrap:wrap; align-items:center; gap:6px; font-size:12px; }
            .flexup-strip .lbl { opacity:.8; }
            .flexup-strip button { padding:2px 8px; }`;
    }

    const api = { levelsFor, pointAt, levelsAbove, button, strip, typed, wire, css };
    if (typeof window !== 'undefined') { window.AFFlexPromote = api; }
    if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
})();
