// Agent Farm — the route form on the Engines page (X-494, U-243).
//
// ‼️ ONE FORM, TWO DOORS: "+ Add route" opens it empty, a route's Edit opens it
// filled with that route. The host is told which (`mode`), so a new route
// naming an id that exists is REFUSED rather than written over it — the form
// used to post every box, and an empty box wiped the stored value.
//
// ‼️ ONE ROUTE, TWO ENGINES (U-243): the boxes are providers.add / providers.set's
// arguments, so the form and the bridge cannot come to mean two things. What a box
// says before a save is media/afRouteCheck.js; the host still refuses on save.
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

    const vocab = (data) => (data && data.routeForm) || { authKinds: [], tiers: [], engines: [], templates: [], secrets: [] };
    const K = () => window.AFRouteCheck;

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
        const num = (v) => (v === undefined || v === null ? '' : String(v));
        return {
            mode: p ? 'edit' : 'new',
            // the card's title names the route as STORED, not as being retyped
            name: p ? p.label || p.id : '',
            id: p ? p.id : '', autoId: '', template: '',
            label: p ? p.label || '' : '',
            providerId: p ? p.providerId || '' : '',
            baseUrl: p ? p.baseUrl || '' : '',
            opencodeUrl: p ? p.opencodeUrl || '' : '',
            authKind: p ? p.authKind || '' : 'api-key',
            tiers, more: more.join(', '),
            context: num(p && p.context), output: num(p && p.output),
            description: p ? p.description || '' : '',
            // a new route serves every engine; an edited one keeps what it serves
            engines: p ? (Array.isArray(p.engines) ? p.engines.slice() : null) : vocab(data).engines.slice(),
            // a Farm Secret by NAME; sent only when it is a different one
            secretRef: p ? p.secretRef || '' : '', secretWas: p ? p.secretRef || '' : ''
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

    /** The tiers a save would write: Other tiers first, the boxes over them. */
    function tiersOf() {
        const tiers = parseTiers(form.more);
        for (const [k, v] of Object.entries(form.tiers)) {
            if (String(v || '').trim()) { tiers[k] = String(v).trim(); }
        }
        return tiers;
    }

    /** ‼️ A FORM, NOT A RECORD — every box it drew, so an emptied one is a deliberate clear. */
    function payload() {
        return {
            id: form.id, label: form.label, providerId: form.providerId,
            baseUrl: form.baseUrl, opencodeUrl: form.opencodeUrl, authKind: form.authKind,
            tiers: tiersOf(), context: form.context, output: form.output, description: form.description,
            ...(form.engines ? { engines: form.engines.slice() } : {}),
            ...(form.secretRef && form.secretRef !== form.secretWas ? { secretRef: form.secretRef } : {})
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

    const engineName = (id, data) => ((data.engines || []).find(e => e.id === id) || {}).label || id;

    /** Claude Code · OpenCode — each box says why its engine cannot run the route yet. */
    function enginesRow(data) {
        const F = window.AFForm, tiers = tiersOf();
        const why = { claude: K().claudeWhyNot(form), opencode: K().openCodeWhyNot(form, tiers) };
        const on = form.engines || [];
        const boxes = vocab(data).engines.map(e => F.check('eng_' + e, engineName(e, data), on.includes(e), {
            redraw: true,
            tip: why[e] || (e === 'opencode'
                ? t('Lent to OpenCode when a session starts: every model in the tiers is its own choice there. Nothing is written into OpenCode\'s files.')
                : t('Claude Code is pointed at the Endpoint; the tier a session asks for picks the model.'))
        }));
        const warn = vocab(data).engines.filter(e => on.includes(e) && why[e]).map(e => F.msg(why[e], true)).join('');
        return '<div class="affgrid"><span class="muted small">' + escText(t('Serves')) + '</span>' + boxes.join('') + '</div>' + warn;
    }

    const escText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    /** A note beside the box it is about, with the fix one press away. */
    function endpointNote(data) {
        const fix = K().v1Fix(form.baseUrl, data);
        if (!fix) { return ''; }
        return '<div class="affmsg warn">' + escText(t('Ends in /v1 — Claude Code adds /v1/messages itself, so every request would miss.'))
            + ' <button type="button" class="secondary mini" data-afact="fix-v1">' + escText(t('Use {url}', { url: fix })) + '</button></div>';
    }

    function secretRows(data) {
        return [{ id: '', label: form.mode === 'edit' ? t('Keep the key it has') : t('Add it on the card afterwards') }]
            .concat((vocab(data).secrets || []).map(n => ({ id: n, label: n, detail: t('A Farm Secret, by name') })));
    }

    function html(data) {
        if (!form) { return ''; }
        const F = window.AFForm;
        const editing = form.mode === 'edit';
        const tiers = tiersOf();
        const bad = K().badModels(tiers, data);
        const tierBoxes = vocab(data).tiers.map(n => F.text('tier_' + n, n, form.tiers[n] || '', {
            mono: true, redraw: true,
            tip: t('The model this route serves for {tier}. On Claude Code it runs when a session asks for {tier}; on OpenCode every model here is its own choice in the model box. Empty = the route\'s own default.', { tier: n })
        }));
        const start = editing ? '' : F.grid([F.sel('template', t('Start from'),
            [{ id: '', label: t('Nothing — fill every box') }].concat(vocab(data).templates.map(x => ({ id: x.id, label: x.label, detail: x.baseUrl }))),
            form.template, { redraw: true, tip: t('A known service fills its address and key kind; you add the models and the key.') })]);
        return F.card({
            id: 'poform',
            title: editing ? t('Edit {label}', { label: form.name }) : t('New route'),
            lede: editing
                ? t('The id stays — the key is filed under it. Changing an address, the key kind, the engines or a tier starts a new revision.')
                : t('One route for Claude Code and OpenCode: an address, its key and the models in its tiers.'),
            body: start + enginesRow(data)
                + F.grid([
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
                        required: true, ph: 'kimi', tip: t('anthropic · anthropic-api · kimi · minimax · openrouter, or one you name yourself.')
                    }),
                    F.sel('authKind', t('Key sent as'), authRows(data), form.authKind, {
                        tip: t('Which header carries the key. Check the provider\'s own documentation.')
                    }),
                    F.text('baseUrl', t('Endpoint'), form.baseUrl, {
                        wide: true, mono: true, redraw: true, ph: 'https://api.moonshot.ai/anthropic',
                        tip: t('The Anthropic-style address. Empty = first-party. Must be https, or http on this machine (localhost / 127.0.0.1).')
                    })
                ])
                + endpointNote(data)
                + F.sec(t('Tiers'), t('Claude Code runs the tier a session asks for; OpenCode offers each model as its own choice'))
                + F.grid(tierBoxes, F.text('more', t('Other tiers'), form.more, {
                    wide: true, mono: true, redraw: true, ph: 'name=model, name=model',
                    tip: t('Tiers the CLI has no alias for, as name=model pairs. Reached only when a launch names the tier.')
                }))
                + (bad.length ? F.msg(t('Not a model id ({tiers}): letters, digits, dot, colon, slash and hyphen only — it goes on a command line.', { tiers: bad.join(', ') }), true) : '')
                + F.grid([
                    F.text('context', t('Context'), form.context, {
                        type: 'number', ph: t('tokens'),
                        tip: t('The context window of the route\'s models, in tokens — one number for every tier, so write the smallest, or split the models into routes. Claude Code is told this window, and the context meter and the handover thresholds count against it; left empty, Claude Code assumes its own default and the meter shows no percentage for a model it does not know. OpenCode takes a limit only when Context and Output are both filled.')
                    }),
                    F.text('output', t('Output'), form.output, {
                        type: 'number', ph: t('tokens'),
                        tip: t('The longest answer of the route\'s models, in tokens. OpenCode takes a limit only when Context and Output are both filled.')
                    }),
                    F.sel('secretRef', t('Sign in with'), secretRows(data), form.secretRef, {
                        tip: t('One of your Farm Secrets, by name — its value never enters this page. A key of the route\'s own is typed on its card.')
                    })
                ])
                + F.sec(t('Advanced'), t('only when the service gives OpenCode a different address'))
                + F.grid([F.text('opencodeUrl', t('OpenCode address (OpenAI-compatible)'), form.opencodeUrl, {
                    wide: true, mono: true, redraw: true, ph: 'https://openrouter.ai/api/v1',
                    tip: t('Where OpenCode reaches the service in the OpenAI style. Empty = OpenCode uses the Endpoint. Claude Code never uses it.')
                })])
                + F.grid([F.text('description', t('Your note'), form.description, {
                    wide: true, ph: t('whose key, what for'),
                    tip: t('Shown on the route\'s card and under it in every picker. Never sent to the provider.')
                })]),
            msg, warn: true,
            submit: editing ? t('Save changes') : t('Add route')
        });
    }

    /** Bind the drawn card. `post` sends to the host; `redraw` repaints the page. */
    function wire(post, redraw, data) {
        const box = document.getElementById('poform');
        if (!box || !form) { return; }
        window.AFForm.wire(box, {
            onEdit: v => {
                for (const k of ['id', 'label', 'providerId', 'authKind', 'baseUrl', 'opencodeUrl', 'more', 'context', 'output', 'secretRef', 'description']) {
                    if (v[k] !== undefined) { form[k] = v[k]; }
                }
                for (const k of Object.keys(v)) {
                    if (k.startsWith('tier_')) { form.tiers[k.slice(5)] = v[k]; }
                }
                const ticked = Object.keys(v).filter(k => k.startsWith('eng_'));
                if (ticked.length) { form.engines = vocab(data).engines.filter(e => v['eng_' + e] === true); }
                if (v.template !== undefined && v.template !== form.template) { K().applyTemplate(form, v.template, data); }
            },
            onRedraw: () => redraw(),
            onAct: a => {
                if (a === 'fix-v1') { form.baseUrl = K().v1Fix(form.baseUrl, data) || form.baseUrl; redraw(); }
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
