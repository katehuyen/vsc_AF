// Agent Farm — the Farm Settings "Flow & Content" card (U-152). Every row is a
// flex point with a Farm Settings level, as the host derived it from the
// registry (core/flexActions.ts flexSettingsState) — a point added to
// media/afFlex.js gains its row here with nobody touching this file. An
// inherited value is drawn faint, one you set is drawn solid, and the origin
// column is the resolver's own sentence. Below it, the preset library.
(function () {
    'use strict';

    const TRI_DETAIL = { ask: 'ask me', auto: 'automatic', never: 'never' };

    function editor(p, C) {
        const a = `data-flex-point="${C.esc(p.id)}" data-flex-type="${C.esc(p.type)}" id="flex-${C.esc(p.id.replace(/\./g, '-'))}"`;
        const v = p.value;
        if (p.type === 'tri' && p.states) {
            return `<select ${a}>` + window.AFFlexForms.TRI.map(s => C.option(p.states[s],
                `${TRI_DETAIL[s]} (${p.states[s]})`, { selected: p.states[s] === v })).join('') + '</select>';
        }
        if (p.type === 'enum' && p.options) {
            // an empty value is a choice too ("every kind"): it gets words, never a blank row with no title
            return `<select ${a}>` + p.options.map(o => C.option(o, o === '' ? (p.emptyLabel || 'empty') : o, { selected: o === v })).join('') + '</select>';
        }
        if (p.type === 'boolean') {
            return `<select ${a}>${C.option('true', 'on', { selected: v === true })}${C.option('false', 'off', { selected: v === false })}</select>`;
        }
        if (p.type === 'number') {
            // a text box, so it wears the page's input style; the host checks the range
            const range = p.min !== undefined || p.max !== undefined
                ? `${p.min ?? '…'}–${p.max ?? '…'}` : '';
            return `<input type="text" inputmode="decimal" ${a} value="${C.esc(String(v))}"`
                + `${range ? ` placeholder="${range}"` : ''}>`;
        }
        return `<input type="text" ${a} value="${C.esc(String(v ?? ''))}" placeholder="(empty)">`;
    }

    function row(p, C) {
        const own = p.from !== 'builtin';
        const tip = `${p.sentence}\n\nSetting: ${p.key}\nBuilt-in default: ${JSON.stringify(p.default)}`
            + (own ? '\n\n↺ puts it back to the built-in default.' : '\n\nNot set by you — change the box to set it.');
        return `<tr class="flexrow${own ? ' own' : ' inherited'}">
            <th>${window.AFTip.wrap(`<span>${C.esc(p.label)}</span>`, p.label, `${p.id}\n\n${tip}`, 'tip-field')}</th>
            <td class="flexbox">${editor(p, C)}</td>
            <td class="flexorigin">${window.AFTip.wrap(`<span>${C.esc(p.sentence)}</span>`, p.label, tip, 'tip-field')}</td>
            <td>${own ? `<button class="small secondary" data-flex-reset="${C.esc(p.id)}" title="Back to the built-in default, ${C.esc(JSON.stringify(p.default))}">↺</button>` : ''}</td>
        </tr>`;
    }

    function presetRow(p, C) {
        const vals = Object.entries(p.values).map(([k, v]) => `${k} = ${JSON.stringify(v)}`).join('\n');
        const tip = `${p.describe ? p.describe + '\n\n' : ''}${vals}\n\nNow: ${p.matches ? 'every value matches it' : p.reads}`;
        return `<tr class="flexpreset${p.matches ? ' on' : ''}">
            <th>${window.AFTip.wrap(`<span>${p.matches ? '● ' : ''}${C.esc(p.name)}</span>`, p.name, tip, 'tip-field')}</th>
            <td class="muted small">${C.esc(p.builtin ? `built-in${p.family ? ' · ' + p.family : ''}` : `yours${p.family ? ' · ' + p.family : ''}`)}</td>
            <td class="muted small">${C.esc(p.matches ? 'in effect' : p.reads)}</td>
            <td><button class="small" data-preset-apply="${C.esc(p.name)}" title="Write its ${Object.keys(p.values).length} value(s) into Farm Settings">Apply</button>`
            + `${p.builtin ? '' : ` <button class="small secondary" data-preset-delete="${C.esc(p.name)}" title="Delete this preset — the values already applied stay">✕</button>`}</td>
        </tr>`;
    }

    /** The card; `flex` = the host's state (null when this build has none), `err` = the last refusal. */
    function html(flex, C, err) {
        if (!flex) { return ''; }
        return `<div class="flexcard">
            ${err ? `<p class="flexerr">${C.esc(err)}</p>` : ''}
            <table class="flextable"><tbody>${flex.points.map(p => row(p, C)).join('')}</tbody></table>
            <h3 class="flexh">Presets</h3>
            <table class="flextable"><tbody>${flex.presets.map(p => presetRow(p, C)).join('')}</tbody></table>
            <div class="flexsave"><input type="text" id="flexpresetname" placeholder="name for the values above">
            <button class="small" id="flexpresetsave" title="Save every value in the table above as a preset of your own">Save as preset</button></div>
        </div>`;
    }

    function css() {
        return `.flextable { border-collapse:collapse; margin:4px 0 8px; width:auto; }
            .flextable th { text-align:left; font-weight:normal; padding:2px 10px 2px 0; white-space:nowrap; }
            .flextable td { padding:2px 8px 2px 0; vertical-align:middle; }
            .flexrow.inherited .flexbox input, .flexrow.inherited .flexbox select { opacity:.6; }
            .flexrow.own .flexbox input, .flexrow.own .flexbox select { font-weight:600; }
            .flexbox input, .flexbox select { width:220px; }
            .flexorigin { color:var(--vscode-descriptionForeground); }
            .flexpreset.on th { font-weight:600; }
            .flexh { font-size:1em; margin:10px 0 2px; }
            .flexsave { display:flex; gap:6px; align-items:center; }
            .flexsave input { width:220px; }
            .flexerr { color:var(--vscode-errorForeground); margin:4px 0; }`;
    }

    /** What a box holds, as the point's type; undefined = empty = back to inherited. */
    function valueOf(el) {
        const raw = String(el.value);
        if (raw.trim() === '') { return undefined; }
        const t = el.getAttribute('data-flex-type');
        if (t === 'number') { return Number(raw); }
        if (t === 'boolean') { return raw === 'true'; }
        return raw;
    }

    function wire(post) {
        document.querySelectorAll('[data-flex-point]').forEach(el => el.addEventListener('change', () => {
            const point = el.getAttribute('data-flex-point');
            const value = valueOf(el);
            post(value === undefined ? { type: 'flexReset', point } : { type: 'flexSet', point, value });
        }));
        document.querySelectorAll('[data-flex-reset]').forEach(b => b.addEventListener('click', () =>
            post({ type: 'flexReset', point: b.getAttribute('data-flex-reset') })));
        document.querySelectorAll('[data-preset-apply]').forEach(b => b.addEventListener('click', () =>
            post({ type: 'presetApply', name: b.getAttribute('data-preset-apply') })));
        document.querySelectorAll('[data-preset-delete]').forEach(b => b.addEventListener('click', () =>
            post({ type: 'presetDelete', name: b.getAttribute('data-preset-delete') })));
        const save = document.getElementById('flexpresetsave');
        const name = document.getElementById('flexpresetname');
        if (save && name) { save.addEventListener('click', () => post({ type: 'presetSave', name: String(name.value) })); }
    }

    window.AFFlexSettings = { html, css, wire, valueOf };
})();
