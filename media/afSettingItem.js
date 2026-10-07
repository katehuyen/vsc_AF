// Agent Farm — Farm Settings: one setting row and the control its schema asks for.
// Split out of media/settings.js unchanged (U-225): the page hands its state in once, as X.
(function () {
    'use strict';
    let X, C, errors, jsonMode, jsonDraft, shortKey, fmtDefault, hit, shapeHtml, pathLine, listHtml, formHtml, rowsHtml, mapHtml, BACK;

    function controlHtml(it) {
        const id = `c-${shortKey(it.key)}`;
        if (it.type === 'boolean') {
            return `<input type="checkbox" id="${id}" data-set="${C.esc(it.key)}"${it.value ? ' checked' : ''}>`;
        }
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
        if (it.type === 'number') {
            return `<input type="number" id="${id}" data-set="${C.esc(it.key)}" value="${C.esc(String(it.value ?? ''))}" style="width:110px">`;
        }
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
        return `<span class="setpath"><input type="text" id="${id}" data-set="${C.esc(it.key)}" value="${C.esc(String(it.value ?? ''))}" style="width:100%; max-width:420px">${browse}</span>`;
    }

    function itemHtml(it) {
        const err = errors[it.key];
        return `<div class="setitem${it.modified ? ' modified' : ''}" data-item="${C.esc(it.key)}"
            ${window.AFCtx.row('afSettingRow', { setKey: it.key, afModified: !!it.modified })}
            title="${C.esc(window.AFCtx.hint(it.key + ' — default: ' + fmtDefault(it.default)))}">
            ${window.AFSettingResults.placeHtml(it, C.esc)}
            <div class="sethead">
                <span class="setname">${hit(shortKey(it.key))}</span>
                ${it.modified ? `<span class="moddot" title="Changed from default (${C.esc(fmtDefault(it.default))})"></span>
                    <button class="reset" data-reset="${C.esc(it.key)}" title="Reset to default: ${C.esc(fmtDefault(it.default))}">↺</button>` : ''}
            </div>
            <div class="setdesc">${hit(it.description || '')}</div>
            <div class="setctl">${controlHtml(it)}</div>
            ${/* X-193 — a scalar path says where it points, for the same reason
                  each row of a list does. A list draws its own lines per row, so
                  drawing one here as well would be the fact twice. */
            it.browse && !it.shape ? pathLine(it.key, it.value) : ''}
            ${err ? `<div class="seterr">⚠ ${C.esc(err)}</div>` : ''}
            ${!err && it.refusal ? `<div class="seterr">⚠ An entry for this key in your settings file is being ignored — ${C.esc(it.refusal)}</div>` : ''}
            ${it.inForce ? `<div class="setinforce">${C.esc(it.inForce)}</div>` : ''}
        </div>`;
    }

    window.AFSettingItem = function (ctx) {
        X = ctx;
        ({ C, errors, jsonMode, jsonDraft, shortKey, fmtDefault, hit, shapeHtml, pathLine, listHtml, formHtml, rowsHtml, mapHtml, BACK } = ctx);
        return { itemHtml };
    };
})();
