// Agent Farm — Farm Settings: a setting whose right values are known is picked, not typed (U-229). The
// catalog's control (src/core/settingsCatalog) says which kind; the values come from the host
// (DATA.valueSources, DATA.engineModels). A stored value no list holds is drawn as itself, never moved.
(function () {
    'use strict';
    let X, C;
    const t = (s, v) => (window.AFI18n ? window.AFI18n.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? String(v[k]) : m)));
    const DAYS = () => [t('Sunday'), t('Monday'), t('Tuesday'), t('Wednesday'), t('Thursday'), t('Friday'), t('Saturday')];
    const CUSTOM = '__custom__', SECRET = '__secret__';
    /** the model rows whose box is open for a typed id */
    const typing = {};
    let dragFrom = null;

    const valOf = key => (X.allItems().find(i => i.key === key) || {}).value;
    const listOf = v => String(v ?? '').split(',').map(s => s.trim()).filter(Boolean);
    const set = (key, value) => { delete X.errors[key]; X.vscode.postMessage({ type: 'set', key, value }); };
    const lbl = it => C.esc(it.label || X.shortKey(it.key));

    function engineOf(it) { return (X.DATA.engineModels || {})[it.engine || 'claude'] || null; }
    function modelIds(it) {
        const em = engineOf(it);
        const ids = em && em.models ? em.models.map(m => m.id).filter(Boolean) : [];
        return ids.length ? ids : (X.DATA.modelAliases || []);
    }
    function effortIds(it) {
        const em = engineOf(it);
        if (!em || !em.efforts) { return []; }
        const all = [].concat(...Object.values(em.efforts)).map(e => e.id).filter(Boolean);
        return (em.efforts[''] || []).map(e => e.id).filter(Boolean).concat(all).filter((e, i, a) => a.indexOf(e) === i);
    }
    /** the values a control offers: the engine's own lists for a model or an effort, else the host's source */
    function choicesOf(it) {
        const from = it.control === 'chips' || it.control === 'orderedChips' ? it.from : it.control;
        if (from === 'model') { return modelIds(it); }
        if (from === 'effort') { return effortIds(it); }
        return (X.DATA.valueSources || {})[from] || [];
    }

    /** One pick from a list, '' first; a stored value the list lacks is an option of its own, marked. */
    function selectHtml(it, id, list, extra, attr) {
        const cur = String(it.value ?? '');
        const lost = cur && list.indexOf(cur) < 0;
        const mark = it.control === 'model' ? t('(custom)') : it.control === 'secret' ? t('(not in vault)') : t('(not on this machine)');
        return `<select id="${id}" ${attr}="${C.esc(it.key)}" aria-label="${lbl(it)}">
            ${C.option('', t('— not set —'), { selected: !cur, detail: t('Leave {name} unset.', { name: X.shortKey(it.key) }) })}
            ${lost ? C.option(cur, `${cur} ${mark}`, { selected: true, detail: t('Stored in the setting, but not in this list — kept as it is, never swapped for another entry.') }) : ''}
            ${list.map(o => C.option(o, o, { selected: cur === o })).join('')}
            ${extra || ''}</select>`;
    }

    function modelHtml(it, id) {
        if (typing[it.key]) {
            return `<span class="setfield"><input type="text" id="${id}" data-set="${C.esc(it.key)}" data-custom="${C.esc(it.key)}" data-clr
                value="${C.esc(String(it.value ?? ''))}" placeholder="${C.esc(t('model id — Enter saves, Esc goes back'))}" aria-label="${lbl(it)}"></span>`;
        }
        return selectHtml(it, id, modelIds(it), C.option(CUSTOM, t('Custom…'), { detail: t('Type a model id this list does not name.') }), 'data-pick');
    }

    function secretHtml(it, id) {
        return selectHtml(it, id, choicesOf(it), C.option(SECRET, t('Set secret…'), { detail: t('Store a secret in the Secrets vault — its value never comes to this page.') }), 'data-pick');
    }

    /** a number from a fixed list: a weekday (-1 off) or an hour of the day */
    function numPickHtml(it, id, pairs) {
        const cur = Number(it.value);
        const known = pairs.some(p => p[0] === cur);
        return `<select id="${id}" data-set="${C.esc(it.key)}" aria-label="${lbl(it)}">
            ${known ? '' : C.option(String(it.value ?? ''), String(it.value ?? ''), { selected: true })}
            ${pairs.map(p => C.option(String(p[0]), p[1], { selected: p[0] === cur })).join('')}</select>`;
    }

    function timeHtml(it, id) {
        const v = String(it.value ?? '').trim();
        const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(v);
        const on = !!m;
        const hhmm = m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
        const odd = !on && v && v.toLowerCase() !== 'off'
            ? `<span class="setunit" title="${C.esc(t('Stored as {v} — not a time, so it is off.', { v }))}">${C.esc(v)}</span>` : '';
        return `<span class="setnum"><input type="checkbox" role="switch" class="setswitch" data-timeoff="${C.esc(it.key)}"${on ? ' checked' : ''}
            aria-label="${C.esc(t('{name}: on or off', { name: it.label || X.shortKey(it.key) }))}"><input type="time" id="${id}" data-set="${C.esc(it.key)}"
            value="${hhmm}"${on ? '' : ' disabled'} aria-label="${lbl(it)}">${odd}</span>`;
    }

    function chipsHtml(it, id) {
        const list = choicesOf(it), cur = listOf(it.value);
        const all = list.concat(cur.filter(c => list.indexOf(c) < 0));
        return `<span class="setchips" id="${id}" role="group" aria-label="${lbl(it)}">${all.map(o => {
            const on = cur.indexOf(o) >= 0, lost = list.indexOf(o) < 0;
            return `<button type="button" class="setchip${on ? ' on' : ''}${lost ? ' lost' : ''}" aria-pressed="${on}" data-chip="${C.esc(o)}" data-chipkey="${C.esc(it.key)}"
                title="${C.esc(lost ? t('Stored in the setting, but not one of the known values.') : '')}">${C.esc(o)}</button>`;
        }).join('')}</span>`;
    }

    function ladderHtml(it, id) {
        const list = choicesOf(it), cur = listOf(it.value);
        const rest = list.filter(o => cur.indexOf(o) < 0);
        return `<span class="setchips setladder" id="${id}" role="list" aria-label="${lbl(it)}">${cur.map((o, i) =>
            `<span class="setchip on${list.indexOf(o) < 0 ? ' lost' : ''}" role="listitem" draggable="true" data-rung="${C.esc(o)}" data-rungkey="${C.esc(it.key)}"
                title="${C.esc(t('Rung {n} — drag to reorder.', { n: i + 1 }))}"><span class="setgrip" aria-hidden="true">⋮⋮</span>${C.esc(o)}<button type="button" class="setchipx" data-rungx="${C.esc(o)}"
                data-rungkey="${C.esc(it.key)}" aria-label="${C.esc(t('Remove {v}', { v: o }))}">✕</button></span>`).join('')}
            ${rest.length ? `<select class="setrungadd" data-rungadd="${C.esc(it.key)}" aria-label="${C.esc(t('Add a rung'))}">${C.option('', t('+ Add…'), { selected: true })}${rest.map(o => C.option(o, o)).join('')}</select>` : ''}</span>`;
    }

    function tokenHtml(it, id) {
        const k = C.esc(it.key);
        return `<span class="setfield"><input type="password" id="${id}" data-set="${k}" value="${C.esc(String(it.value ?? ''))}" autocomplete="off" spellcheck="false" aria-label="${lbl(it)}">
            <button class="secondary small" data-tokshow="${id}" title="${C.esc(t('Show or hide the token'))}">${C.esc(t('Show'))}</button>
            <button class="secondary small" data-tokgen="${k}" title="${C.esc(t('Make a new token and put it in force — every link made with the old one stops working.'))}">${C.esc(t('Generate'))}</button>
            <button class="secondary small" data-tokcopy="${k}" title="${C.esc(t('Copy the token'))}">${C.esc(t('Copy'))}</button></span>`;
    }

    /** The control for a row the catalog gives a known value set, or '' for the row's ordinary control. */
    function pickHtml(it, id) {
        switch (it.control) {
            case 'model': return modelHtml(it, id);
            case 'secret': return secretHtml(it, id);
            case 'effort': case 'agent': case 'engine': case 'airtableBase': return selectHtml(it, id, choicesOf(it), '', 'data-set');
            case 'weekday': return numPickHtml(it, id, [[-1, t('Off')]].concat(DAYS().map((d, i) => [i, d])));
            case 'hour': return numPickHtml(it, id, Array.from({ length: 24 }, (_, h) => [h, String(h).padStart(2, '0') + ':00']));
            case 'time': return timeHtml(it, id);
            case 'chips': return chipsHtml(it, id);
            case 'orderedChips': return ladderHtml(it, id);
            case 'token': return tokenHtml(it, id);
            default: return '';
        }
    }

    const on = (sel, ev, fn) => document.querySelectorAll(sel).forEach(el => el.addEventListener(ev, e => fn(el, e)));

    function wirePicks() {
        on('[data-pick]', 'change', el => {
            const key = el.dataset.pick;
            if (el.value === CUSTOM) { typing[key] = true; X.render(true); const box = document.getElementById(el.id); if (box && box.focus) { box.focus(); } return; }
            if (el.value === SECRET) {
                const cur = String(valOf(key) ?? '');
                X.vscode.postMessage(cur ? { type: 'engineKey', name: cur } : { type: 'openSecrets' });
                X.render(true);
                return;
            }
            set(key, el.value);
        });
        on('[data-custom]', 'change', el => { delete typing[el.dataset.custom]; });
        on('[data-custom]', 'keydown', (el, e) => { if (e && e.key === 'Escape') { delete typing[el.dataset.custom]; X.render(true); } });
        on('[data-timeoff]', 'change', sw => {
            const key = sw.dataset.timeoff, box = document.getElementById('c-' + X.shortKey(key));
            if (!sw.checked) { set(key, 'off'); }
            else if (box && box.value) { set(key, box.value); }
            else if (box) { box.disabled = false; if (box.focus) { box.focus(); } }
        });
        on('[data-chip]', 'click', b => {
            const key = b.dataset.chipkey, v = b.dataset.chip, cur = listOf(valOf(key));
            const next = cur.indexOf(v) >= 0 ? cur.filter(c => c !== v) : cur.concat([v]);
            const order = choicesOf(X.allItems().find(i => i.key === key) || {});
            const known = order.filter(o => next.indexOf(o) >= 0);
            set(key, known.concat(next.filter(o => order.indexOf(o) < 0)).join(', '));
        });
        on('[data-rungx]', 'click', b => set(b.dataset.rungkey, listOf(valOf(b.dataset.rungkey)).filter(o => o !== b.dataset.rungx).join(',')));
        on('[data-rungadd]', 'change', el => { if (el.value) { set(el.dataset.rungadd, listOf(valOf(el.dataset.rungadd)).concat([el.value]).join(',')); } });
        on('[data-rung]', 'dragstart', (el, e) => {
            dragFrom = el.dataset.rung;
            if (e && e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragFrom); }
        });
        on('[data-rung]', 'dragover', (el, e) => { if (dragFrom !== null && e && e.preventDefault) { e.preventDefault(); } });
        on('[data-rung]', 'drop', (el, e) => {
            if (e && e.preventDefault) { e.preventDefault(); }
            const from = dragFrom, to = el.dataset.rung, key = el.dataset.rungkey;
            dragFrom = null;
            const was = listOf(valOf(key));
            if (from === null || from === to || was.indexOf(from) < 0) { return; }
            // dropped on a later rung it goes after it, on an earlier one before it
            const next = was.filter(o => o !== from);
            next.splice(next.indexOf(to) + (was.indexOf(from) < was.indexOf(to) ? 1 : 0), 0, from);
            set(key, next.join(','));
        });
        on('[data-rung]', 'dragend', () => { dragFrom = null; });
        on('[data-tokshow]', 'click', b => {
            const box = document.getElementById(b.dataset.tokshow);
            if (!box) { return; }
            box.type = box.type === 'password' ? 'text' : 'password';
            b.textContent = box.type === 'password' ? t('Show') : t('Hide');
        });
        on('[data-tokgen]', 'click', () => X.vscode.postMessage({ type: 'webTokenNew' }));
        on('[data-tokcopy]', 'click', b => window.AFCtx.copy(String(valOf(b.dataset.tokcopy) ?? ''),
            (m, bad) => window.AFCtx.toast(bad ? m : t('Token copied.'), bad)));
    }

    window.AFSettingPick = function (ctx) {
        X = ctx;
        C = ctx.C;
        return { pickHtml, wirePicks };
    };
})();
