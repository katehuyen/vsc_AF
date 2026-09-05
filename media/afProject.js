// Agent Farm — WHICH PROJECT, said the same way everywhere.
//
// ‼️ WHY THIS IS A COMPONENT (Faz 5, and the same lesson as afEngine.js).
//
// A project is recognisable by its own colour and icon on the sidebar, on the
// status bar and on its own page. The moment a fourth surface has to draw one,
// the mark starts being re-invented per page: the sessions table grew a dot in
// its own injected CSS, and the next page would have grown a different one.
// Notices, the queue, tasks and missions all now carry a project, so the mark
// lives HERE and the CSS lives in common.css.
//
// Three things a surface needs, and nothing else:
//   badge(p)   — the mark plus the name, for a row
//   options(…) — <option> list for a picker, including the two non-projects
//   tip(p)     — the `Label: value` readout a hover carries (CONVENTIONS)
(function () {
    'use strict';

    /** The filter value that asks for rows carrying NO project. It has to match
     *  `NO_PROJECT` in core/notices.ts and core/workqueue.ts — the page sends
     *  this string and the host filters on it. */
    const NONE = '(none)';

    function esc(s) {
        return String(s === undefined || s === null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /** id → the project row, out of whatever list the page was given. */
    function find(projects, id) {
        const list = projects || [];
        for (let i = 0; i < list.length; i++) {
            if (list[i] && list[i].id === id) { return list[i]; }
        }
        return undefined;
    }

    /**
     * The mark itself.
     *
     * ‼️ THE DOT IS DRAWN ONLY WHEN IT SAYS SOMETHING — the project's OWN
     * colour, the one the sidebar and the status bar use. On a project without
     * one it used to fall back to the panel border, which is an identical grey
     * dot in front of every name carrying no information and taking the
     * narrowest column's first 12px.
     */
    function mark(p) {
        if (!p) { return ''; }
        return (p.color ? '<span class="af-pdot" style="background:' + esc(p.color) + '"></span>' : '')
            + (p.icon ? '<span class="af-picon">' + esc(p.icon) + '</span>' : '');
    }

    /** The mark plus the name. An unfiled row gets the em dash every other
     *  "nothing here" cell in this extension gets, not an empty space. */
    function badge(p, opts) {
        const o = opts || {};
        if (!p) {
            return o.hideEmpty ? ''
                : '<span class="af-proj muted">' + esc(o.emptyLabel || '—') + '</span>';
        }
        return '<span class="af-proj"' + (o.cls ? '' : '') + '>'
            + mark(p) + '<span class="af-pname">' + esc(p.name) + '</span></span>';
    }

    /**
     * What a hover says about a project — figures, `Label: value`, one per line.
     * The definition of the column belongs on its heading; this is the readout.
     */
    function tip(p) {
        if (!p) { return { head: 'No project', body: 'Nothing has filed this under a project.' }; }
        const line = function (k, v) {
            return (v === undefined || v === null || v === '') ? '' : k + ': ' + v;
        };
        const body = [
            p.summary || '',
            p.summary ? '' : null,
            line('Status', p.status + (p.kind ? ' · ' + p.kind : '')),
            line('Docs', p.folder || ''),
            line('Code', (p.repos || []).join(' · ')),
            line('Budget', p.budgetUSD ? '$' + p.budgetUSD + '/day' : ''),
            line('Tags', (p.tags || []).join(', '))
        ].filter(function (x) { return x !== null && x !== ''; }).join('\n');
        return { head: 'Project · ' + p.name, body: body || p.name };
    }

    /**
     * `<option>`s for a picker.
     *
     * `withNone` adds the "(none)" row — a FILTER wants it (it is a real
     * question: what has nobody filed?), a form that stamps one does not,
     * because there the empty option already means that.
     */
    function options(projects, selected, opts) {
        const o = opts || {};
        // ‼️ U-130 — A PROJECT'S NAME IS THE LONGEST TEXT ON THESE PAGES and the
        // picker is the narrowest box on them: `PRS.MuratVural_DEV_VSC.Agen…`
        // is what six surfaces showed. The popup a `<select>` opens is drawn by
        // the operating system, so no AFTip reaches into it and the option's
        // own `title` is the only surface there is. The detail is the SAME
        // readout the row's hover carries (`tip`), so a project is described
        // one way everywhere — which is why this lives in the component.
        const C = window.AFCharts;
        const out = [C.option('', o.anyLabel || 'Any project', {
            selected: !selected,
            detail: o.anyDetail || 'Every row, whichever project it is filed under — and the unfiled ones too.'
        })];
        if (o.withNone) {
            out.push(C.option(NONE, o.noneLabel || 'No project', {
                selected: selected === NONE,
                detail: o.noneDetail || 'Only the rows that name no project at all.'
            }));
        }
        (projects || []).forEach(function (p) {
            out.push(C.option(p.id, (p.icon ? p.icon + ' ' : '') + p.name, {
                selected: selected === p.id, detail: tip(p).body
            }));
        });
        return out.join('');
    }

    /** Names only, for `AFFilter.multi` — which filters on the displayed value.
     *  Named projects first, "No project" last: it is a leftover, not a project. */
    function names(projects) {
        return (projects || []).map(function (p) { return p.name; });
    }

    window.AFProject = {
        NONE: NONE, find: find, mark: mark, badge: badge,
        tip: tip, options: options, names: names
    };
})();
