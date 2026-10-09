// Agent Farm — the route form on the Engines page (X-494).
//
// ‼️ ONE FORM, TWO DOORS: "+ Add route" opens it empty, a route's Edit opens it
// filled with that route. The host is told which (`mode`), so a new route
// naming an id that exists is REFUSED rather than written over it — the form
// used to post every box, and an empty box wiped the stored value.
//
// The draft lives here, not in the DOM: the page repaints on every host push,
// and a half-typed form must survive it (docs/CONVENTIONS.md, Making things).
(function () {
    'use strict'; // i18n-exempt — a directive, not interface text
    const t =(s, v) => (window.AFI18n ? window.AFI18n.t(s, v) : s.replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? String(v[k]) : m)));

    /** The open form's draft, or null. */
    let form = null;
    /** The host's refusal of the last save, shown in the card. */
    let msg = '';
    /** A save is in the air: the next `prov-msg` answers it. */
    let pending = false;

    const vocab = (data) => (data && data.routeForm) || { authKinds: [], tiers: [] };

    /** How a stored kind reads: the header it becomes, or the value as written. */
    function authLabel(kind, data) {
        const k = String(kind || '');
        const row = vocab(data).authKinds.find(a => a.id === k);
        return row ? t(row.label) : k;
    }

    /** `a=b, c=d` → an object. A pair with no `=` is dropped rather than guessed at. */
    function parseTiers(text) {
        const out = {};
        for (const part of String(text || '').split(',')) {
            const at = part.indexOf('=');
            if (at < 1) { continue; }
            const tier = part.slice(0, at).trim(), model = part.slice(at + 1).trim();
            if (tier && model) { out[tier] = model; }
        }
        return out;
    }

    /** A tier the CLI has an alias for gets its own box; any other rides in "Other tiers". */
    function draftOf(p, data) {
        const names = vocab(data).tiers;
        const tiers = {}, more = [];
        for (const [k, v] of Object.entries((p && p.tiers) || {})) {
            if (names.includes(k)) { tiers[k] = v; } else { more.push(k + '=' + v); }
        }
        return {
            mode: p ? 'edit' : 'new',
            // the card's title names the route as STORED, not as being retyped
            name: p ? p.label || p.id : '',
            id: p ? p.id : '',
            label: p ? p.label || '' : '',
            providerId: p ? p.providerId || '' : '',
            baseUrl: p ? p.baseUrl || '' : '',
            authKind: p ? p.authKind || '' : 'api-key',
            tiers, more: more.join(', '),
            description: p ? p.description || '' : ''
        };
    }

    function open(p, data) { form = draftOf(p, data); msg = ''; pending = false; }
    function close() { form = null; msg = ''; pending = false; }
    const editingId = () => (form && form.mode === 'edit' ? form.id : '');
    const isNew = () => !!form && form.mode === 'new';

    /** A push that no longer carries the route being edited closes its form. */
    function sync(profiles) {
        if (editingId() && !(profiles || []).some(p => p.id === form.id)) { close(); }
    }

    /** ‼️ A FORM, NOT A RECORD — every box it drew, so an emptied one is a deliberate clear. */
    function payload() {
        const tiers = parseTiers(form.more);
        for (const [k, v] of Object.entries(form.tiers)) {
            if (String(v || '').trim()) { tiers[k] = String(v).trim(); }
        }
        return {
            id: form.id, label: form.label, engine: 'claude', providerId: form.providerId,
            baseUrl: form.baseUrl, authKind: form.authKind, tiers, description: form.description
        };
    }

    /** The kinds this build knows, plus the stored one when it is not among them —
     *  a select draws an unknown value as its FIRST row (docs/CONVENTIONS.md). */
    function authRows(data) {
        const rows = vocab(data).authKinds.map(a => ({ id: a.id, label: t(a.label), detail: t(a.detail) }));
        if (!rows.some(r => r.id === form.authKind)) {
            rows.push(form.authKind
                ? { id: form.authKind, label: form.authKind, detail: t('Written by hand — sent as an API key') }
                : { id: '', label: t('not stated'), detail: t('Sent as an API key, as the route has always been') });
        }
        return rows;
    }

    function html(data) {
        if (!form) { return ''; }
        const F = window.AFForm;
        const editing = form.mode === 'edit';
        const tierBoxes = vocab(data).tiers.map(n => F.text('tier_' + n, n, form.tiers[n] || '', {
            mono: true, tip: t('The model this route serves when a session asks for {tier}. Empty = the route\'s own default.', { tier: n })
        }));
        return F.card({
            id: 'poform',
            title: editing ? t('Edit {label}', { label: form.name }) : t('New route'),
            lede: editing
                ? t('The id stays — the key is filed under it. Changing the endpoint, the key kind or a tier starts a new revision.')
                : t('An Anthropic-compatible endpoint Claude Code can be pointed at. The key is added on the route\'s card afterwards.'),
            body: F.grid([
                editing
                    ? F.stat(t('Id'), form.id)
                    : F.text('id', t('Id'), form.id, {
                        required: true, mono: true, ph: 'kimi',
                        tip: t('2–40 lowercase letters, digits and hyphens. The key is stored under it, so it cannot be changed afterwards.')
                    }),
                // S-131 — the label is the badge, held to what a badge shows in full (core PROFILE_LABEL_MAX)
                F.text('label', t('Label'), form.label, {
                    ph: 'Kimi', max: window.AFProvider.CARD_MAX,
                    tip: t('What a picker and every badge show — at most {n} characters, so it is never cut. A longer note goes in Your note. Renaming does not start a new revision.', { n: window.AFProvider.CARD_MAX })
                }),
                F.text('providerId', t('Provider'), form.providerId, {
                    required: true, ph: 'kimi', tip: t('anthropic · anthropic-api · kimi · minimax, or one you name yourself.')
                }),
                F.sel('authKind', t('Key sent as'), authRows(data), form.authKind, {
                    tip: t('Which header carries the key. Check the provider\'s own documentation.')
                }),
                F.text('baseUrl', t('Endpoint'), form.baseUrl, {
                    wide: true, mono: true, ph: 'https://api.moonshot.ai/anthropic',
                    tip: t('Empty = first-party. Must be https, or http on this machine (localhost / 127.0.0.1).')
                })
            ])
                + F.sec(t('Tiers'), t('which model each tier resolves to on this route'))
                + F.grid(tierBoxes, F.text('more', t('Other tiers'), form.more, {
                    wide: true, mono: true, ph: 'name=model, name=model',
                    tip: t('Tiers the CLI has no alias for, as name=model pairs. Reached only when a launch names the tier.')
                }))
                + F.grid([F.text('description', t('Your note'), form.description, {
                    wide: true, ph: t('whose key, what for'),
                    tip: t('Shown on the route\'s card and under it in every picker. Never sent to the provider.')
                })]),
            msg, warn: true,
            submit: editing ? t('Save changes') : t('Add route')
        });
    }

    /** Bind the drawn card. `post` sends to the host; `redraw` repaints the page. */
    function wire(post, redraw) {
        const box = document.getElementById('poform');
        if (!box || !form) { return; }
        window.AFForm.wire(box, {
            onEdit: v => {
                for (const k of ['id', 'label', 'providerId', 'authKind', 'baseUrl', 'more', 'description']) {
                    if (v[k] !== undefined) { form[k] = v[k]; }
                }
                for (const k of Object.keys(v)) {
                    if (k.startsWith('tier_')) { form.tiers[k.slice(5)] = v[k]; }
                }
            },
            onSubmit: () => {
                msg = ''; pending = true;
                post({ type: 'providerSave', mode: form.mode, profile: payload() });
            },
            onCancel: () => { close(); redraw(); }
        });
    }

    /** The host's answer to this form's save; anything else is the page's. */
    function onMessage(m) {
        if (!m || m.type !== 'prov-msg' || !pending) { return false; }
        pending = false;
        msg = String(m.text || '');
        if (m.saved === true) { close(); }
        return true;
    }

    window.AFRouteForm = { authLabel, parseTiers, open, close, editingId, isNew, sync, payload, html, wire, onMessage };
})();
