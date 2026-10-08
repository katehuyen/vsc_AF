// Agent Farm — Farm Settings: one setting row and the control its schema asks for.
// Split out of media/settings.js unchanged (U-225): the page hands its state in once, as X.
(function () {
    'use strict';
    let X, C, errors, jsonMode, jsonDraft, shortKey, fmtDefault, hit, shapeHtml, pathLine, listHtml, formHtml, rowsHtml, mapHtml, BACK;

    /** U-227 — up to this many choices are drawn side by side, every one visible; more go in a list. */
    const SEG_MAX = 4;
    // a radio group is one per document by its name: a render puts several drawings of the page in one
    // document, and a shared name would leave a checked choice in only the last of them
    const SEG_RUN = Math.random().toString(36).slice(2, 7);
    let segSeq = 0;

    /** A pick-one of two to four: radios in a radiogroup, each carrying data-set, so a pick saves the way a list does. */
    function segHtml(it, id) {
        const name = `${id}-${SEG_RUN}${++segSeq}`;
        const cur = String(it.value ?? '');
        // a stored value no option names is drawn as itself, never dropped onto the first option
        const opts = cur !== '' && it.enum.indexOf(cur) < 0 ? it.enum.concat([cur]) : it.enum;
        return `<span class="setseg" role="radiogroup" id="${id}" aria-label="${C.esc(it.label || shortKey(it.key))}">${opts.map(o =>
            `<label class="setsego"><input type="radio" name="${name}" value="${C.esc(o)}" data-set="${C.esc(it.key)}"${cur === o ? ' checked' : ''}><span>${C.esc(o === '' ? t('Not set') : o)}</span></label>`).join('')}</span>`;
    }

    /** A number in its box, its unit beside it ($ in front) and the schema's bounds on the box. A number whose
     *  0 means off (the catalog's zeroMeans) gets a switch in front: off is 0 and the box rests. */
    function numberHtml(it, id) {
        const lim = (typeof it.minimum === 'number' ? ` min="${it.minimum}"` : '') + (typeof it.maximum === 'number' ? ` max="${it.maximum}"` : '');
        const zero = it.zeroMeans === 'off';
        const off = zero && Number(it.value) === 0;
        const box = `<input type="number" id="${id}" data-set="${C.esc(it.key)}" value="${C.esc(String(it.value ?? ''))}"${lim}${off ? ' disabled' : ''}>`;
        const unit = it.unit ? `<span class="setunit">${C.esc(it.unit)}</span>` : '';
        const sw = zero ? `<input type="checkbox" role="switch" class="setswitch" data-zero="${C.esc(it.key)}"${off ? '' : ' checked'}
            aria-label="${C.esc(t('{name}: on or off', { name: it.label || shortKey(it.key) }))}">` : '';
        return `<span class="setnum">${sw}${it.unit === '$' ? unit + box : box + unit}</span>`;
    }

    function controlHtml(it) {
        const id = `c-${shortKey(it.key)}`;
        if (it.type === 'boolean') {
            return `<input type="checkbox" role="switch" class="setswitch" id="${id}" data-set="${C.esc(it.key)}"${it.value ? ' checked' : ''} aria-label="${C.esc(it.label || shortKey(it.key))}">`;
        }
        if (it.enum && it.enum.length && it.enum.length <= SEG_MAX) { return segHtml(it, id); }
        if (it.enum && it.enum.length) {
            // U-130 — the box CUTS a long enum value and the popup belongs to
            // the OS, so the name goes on the option itself. The one fact the
            // list already implies and nobody can see: which of them is the
            // value this setting falls back to when it is left alone.
            /**
             * ‼️ audit B-05 — AND AN EMPTY MEMBER IS NOT AN EMPTY BOX.
             *
             * `agentFarm.wikiEngine` and `agentFarm.wikiEffort` name `''` in
             * their own enum and default to it, so this map drew an option
             * whose text was the empty string: on the page, a picker with
             * NOTHING in it, three rows under one saying `high` and one saying
             * `opus`. Nothing on the screen said whether it was unset, broken
             * or still loading. The value is real and it means "left out" —
             * so it is written down, the same way the Claude-config picker
             * three hundred lines below already writes it.
             */
            const label = (o) => o === '' ? '— not set —' : o;
            const why = (o) => [
                o === '' ? 'Left out of your settings, so whoever starts the work decides it.' : '',
                String(it.default ?? '') === o ? `The default for ${shortKey(it.key)}.` : ''
            ].filter(Boolean).join(' ');
            return `<select id="${id}" data-set="${C.esc(it.key)}">${it.enum.map(o =>
                C.option(o, label(o), {
                    selected: String(it.value) === o,
                    detail: why(o)
                })).join('')}</select>`;
        }
        /**
         * ‼️ U-84 (d) — A PICKER WHOSE OPTIONS ARE NOT IN THE MANIFEST.
         *
         * `telegram.defaultAgent` and `wikiAgent` are strings whose only correct
         * values are the names of agents this machine has — which the schema
         * cannot enumerate and a text box cannot check. The schema names a
         * SOURCE and the host fills it in (`X.DATA.valueSources`).
         *
         * ‼️ AND THE STORED VALUE IS ALWAYS AN OPTION, even when the source has
         * never heard of it. An agent that was renamed or is not on this machine
         * would otherwise be silently swapped for whatever sits first in the
         * list, which is a settings page changing a setting nobody touched.
         */
        const src = it.values && (X.DATA.valueSources || {})[it.values];
        if (src) {
            const cur = String(it.value ?? '');
            const names = cur && src.indexOf(cur) < 0 ? [cur].concat(src) : src;
            return `<select id="${id}" data-set="${C.esc(it.key)}">
                ${C.option('', '— none —', { selected: !cur, detail: `Leave ${shortKey(it.key)} unset.` })}
                ${names.map(o => C.option(o, o + (src.indexOf(o) < 0 ? ' (not on this machine)' : ''), {
                selected: cur === o,
                detail: src.indexOf(o) < 0
                    ? 'Stored in the setting, but nothing here answers to that name — kept so redrawing the page cannot quietly swap it for the first entry in the list.'
                    : ''
            })).join('')}</select>`;
        }
        if (it.type === 'number') { return numberHtml(it, id); }
        // ‼️ U-108/U-109 — a shape the schema describes gets the editor that
        // fits it rather than a JSON box, unless the user asked for the box.
        // Derived from `shape.kind`, never from a list of keys.
        if (it.shape && !jsonMode[it.key]) {
            if (it.shape.kind === 'list') { return listHtml(it); }
            if (it.shape.kind === 'form') { return formHtml(it); }
            if (it.shape.kind === 'rows') { return rowsHtml(it); }
            if (it.shape.kind === 'map') { return mapHtml(it); }
        }
        if (it.type === 'array' || it.type === 'object') {
            let text = '';
            // What the box is showing beats what is stored: the user got here
            // from an editor with unsaved work in it, or from a refusal they
            // are in the middle of fixing.
            if (jsonDraft[it.key] !== undefined) { text = jsonDraft[it.key]; }
            else {
                try { text = JSON.stringify(it.value ?? (it.type === 'array' ? [] : {}), null, 2); } catch { text = ''; }
            }
            const rows = Math.min(10, Math.max(2, text.split('\n').length));
            return `<textarea id="${id}" data-json="${C.esc(it.key)}" rows="${rows}" spellcheck="false"
                style="width:100%; font-family:var(--vscode-editor-font-family); font-size:11px">${C.esc(text)}</textarea>
                <div class="setjrow">
                    <button class="secondary small" data-apply="${C.esc(it.key)}">Apply JSON</button>
                    ${it.shape && BACK[it.shape.kind]
            ? `<a href="#" class="setljson" data-${BACK[it.shape.kind][0]}="${C.esc(it.key)}"
                            title="Back to ${BACK[it.shape.kind][1]}. Nothing here is saved either way until you press a button.">Back to the ${BACK[it.shape.kind][2]}</a>`
            : ''}
                    ${shapeHtml(it)}
                </div>`;
        }
        // A path setting gets a picker beside the box — typing a Windows path
        // by hand is where the typo that makes a feature look broken comes
        // from. Which settings are paths is declared in the SCHEMA (`format`),
        // never listed here: see SettingSpec.browse.
        const browse = it.browse
            ? ` <button class="secondary small" data-browse="${C.esc(it.key)}" data-browsekind="${C.esc(it.browse)}"
                    title="Pick ${it.browse === 'folder' ? 'a folder' : 'a file'} — the path is written into the box and saved">Browse…</button>`
            : '';
        // S-82 — the schema says a text is several lines (editPresentation), so it gets a text box
        if (it.multiline) {
            const text = String(it.value ?? '');
            return `<textarea id="${id}" data-set="${C.esc(it.key)}" rows="${Math.min(14, Math.max(4, text.split('\n').length + 1))}" spellcheck="false"
                placeholder="empty — the built-in text stays in charge"
                style="width:100%; max-width:640px; font-family:var(--vscode-editor-font-family); font-size:11px">${C.esc(text)}</textarea>`;
        }
        return `<span class="setfield"><input type="text" id="${id}" data-set="${C.esc(it.key)}" data-clr value="${C.esc(String(it.value ?? ''))}">${browse}</span>`;
    }

    const T = () => window.AFSettingText;
    const t = (s, v) => (window.AFI18n ? window.AFI18n.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? String(v[k]) : m)));
    const nameOf = key => (X.allItems().find(x => x.key === key) || {}).label;

    /** U-227 — the description as a person reads it: no **, ` or #agentFarm.x# marks; another setting by its name */
    function descOf(it) {
        return T().plainIn(it.description || '', X.allItems());
    }

    /** A list, a table, a form, a map or several lines of text: its editor goes under the name, full width. */
    const isWide = it => !!it.multiline || it.type === 'array' || it.type === 'object';

    /** Under a query, a row whose name and summary carry no hit says where the hit is: its sentence, else its key. */
    function whyHtml(it, sum) {
        if (!String(X.filter || '').trim()) { return ''; }
        const has = s => s.indexOf('<mark>') >= 0;
        if (has(hit(it.label || '')) || has(hit(sum))) { return ''; }
        const s = T().sentences(descOf(it)).map(hit).find(has) || (has(hit(it.key)) ? hit(it.key) : '');
        return s ? `<div class="setwhy">${s}</div>` : '';
    }

    function itemHtml(it) {
        const err = errors[it.key];
        const label = it.label || window.AFSettingSearch.humanize(it.key);
        const sum = it.summary || T().firstSentence(descOf(it));
        // U-227 — the name opens the description panel (MIRROR): the value now and the default, the
        // description, the key. title="" keeps the row's right-click hint off the panel's trigger.
        const name = window.AFTip.wrap(`<span class="setname">${hit(label)}</span>`
            + (it.modified ? '<span class="moddot"></span>' : '') + '<span class="setinfo" aria-hidden="true">ⓘ</span>',
        '', window.AFTip.lines(T().panelLines(it, nameOf, window.AFTip.GAP)), 'setnamew', 'title=""', label);
        const aside = `<span class="setaside">${it.modified
            ? `<button class="reset" data-reset="${C.esc(it.key)}" title="${C.esc(t('Reset to default: {d}', { d: fmtDefault(it.default) }))}">↺</button>` : ''}${it.reloadRequired ? `<span class="setreload">${C.esc(t('Reload'))}</span>` : ''}</span>`;
        const wide = isWide(it);
        return `<div class="setitem srow${it.modified ? ' modified' : ''}${wide ? ' wide' : ''}" data-item="${C.esc(it.key)}"
            ${window.AFCtx.row('afSettingRow', { setKey: it.key, afModified: !!it.modified, afJson: !!(it.shape && BACK[it.shape.kind] && !jsonMode[it.key]) })}
            title="${C.esc(window.AFCtx.hint())}">
            <div class="setl">
                ${window.AFSettingResults.placeHtml(it, C.esc)}
                <div class="sethead">${name}${wide ? aside : ''}</div>
                ${sum ? `<div class="setsum">${hit(sum)}</div>` : ''}
                ${whyHtml(it, sum)}
                ${err ? `<div class="seterr">⚠ ${C.esc(err)}</div>` : ''}
                ${!err && it.refusal ? `<div class="seterr">⚠ An entry for this key in your settings file is being ignored — ${C.esc(it.refusal)}</div>` : ''}
                ${it.inForce ? `<div class="setinforce">${C.esc(it.inForce)}</div>` : ''}
            </div>
            <div class="setr"><div class="setctl">${controlHtml(it)}</div>${wide ? '' : aside}</div>
            ${/* X-193 — a scalar path says where it points, for the same reason
                  each row of a list does. A list draws its own lines per row, so
                  drawing one here as well would be the fact twice. */
            it.browse && !it.shape ? pathLine(it.key, it.value) : ''}
        </div>`;
    }

    window.AFSettingItem = function (ctx) {
        X = ctx;
        ({ C, errors, jsonMode, jsonDraft, shortKey, fmtDefault, hit, shapeHtml, pathLine, listHtml, formHtml, rowsHtml, mapHtml, BACK } = ctx);
        return { itemHtml };
    };
})();
