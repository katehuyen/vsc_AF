// Agent Farm — the Secrets page's one card: a new secret, or a stored one's edit
// (rename, replace the value, what it is for, who may use it). Lifted out of
// media/secrets.js (X-487) so the page stays a table and this stays a form.
// ‼️ The value only travels one way: the page never receives a stored value, so
// on an edit an empty value box means "keep what is in the keychain".
(function () {
    'use strict'; // i18n-exempt — a directive, not interface text
    const t =(s, v) => (window.AFI18n ? window.AFI18n.t(s, v) : s.replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? String(v[k]) : m)));

    /**
     * ‼️ X-487 — WHO MAY USE IT IS EXACTLY ONE OF THREE, so it is a picker. A
     * "Farm only" switch beside a row of ticks where NOTHING ticked meant EVERY
     * agent drew an arithmetic the vault does not have (docs/CONVENTIONS.md, X-217).
     */
    const REACH = () => [
        { id: 'all', label: t('Every agent'), detail: t('Every agent\'s tasks receive it, agents added later too.') },
        { id: 'some', label: t('Chosen agents'), detail: t('Only the ticked agents\' tasks receive it.') },
        { id: 'farm', label: t('Agent Farm only'), detail: t('Agent Farm reads it itself; no agent\'s task receives it. A workflow step that names it as {secret:NAME} still gets it — that is your own explicit reference.') }
    ];

    function create(o) {
        let form = null;
        let msg = '';
        let ok = false;
        const data = () => o.data() || {};
        const known = () => form && form.from ? (data().secrets || []).find(x => x.name === form.from) : null;

        function open(seed) {
            const k = (data().secrets || []).find(x => x.name === (seed || {}).name);
            const scope = {};
            if (k && !k.allAgents && !k.farmOnly) { k.agents.forEach(a => { scope['ag_' + a.id] = true; }); }
            form = {
                mode: k ? 'edit' : 'new', from: k ? k.name : '', name: k ? k.name : '', value: '',
                description: k ? (k.description || '') : '',
                reach: k ? (k.farmOnly ? 'farm' : k.allAgents ? 'all' : 'some') : 'all',
                scope
            };
            msg = ''; ok = false;
        }

        /** X-487 — what a rename moves and what it cannot, said while the name is being typed. */
        function renameNote() {
            if (!form || form.mode !== 'edit' || !form.name || form.name === form.from) { return ''; }
            const k = known() || {};
            const routes = (k.routes || []).map(r => r.label);
            const readers = k.readers || [];
            return [
                t('Renaming moves the value, what it is for and who may use it to "{to}".', { to: form.name }),
                routes.length ? t('Routes signing in with it follow: {list}.', { list: routes.join(', ') }) : '',
                readers.length ? t('‼ Agent Farm looks it up as "{from}" for: {list} — renamed, it will not find it.', { from: form.from, list: readers.join('; ') }) : '',
                t('{secret:{from}} in prompts, tasks and workflow steps, and ${from} in an agent\'s own scripts, are not rewritten.', { from: form.from })
            ].filter(Boolean).join(' ');
        }

        function html() {
            const F = window.AFForm;
            const editing = form.mode === 'edit';
            const agents = data().agents || [];
            const ticked = agents.filter(a => form.scope['ag_' + a.id]).length;
            const k = known();
            const used = k && (k.routes || []).length
                ? t('Routes signing in with it: {list}.', { list: k.routes.map(r => r.label).join(', ') }) : '';
            const reachNow = REACH().find(r => r.id === form.reach) || REACH()[0];
            return F.card({
                id: 'secform',
                title: editing ? t('Edit “{name}”', { name: form.from }) : t('New secret'),
                lede: editing
                    ? t('The stored value is not shown and never will be — leave the value box empty to keep it, or type a new one to replace it.')
                    : t('The value goes into the OS keychain, never into a settings file and never into git. It reaches a task as an environment variable and a prompt as {secret:NAME}.'),
                body: F.grid([
                    F.text('name', t('Name'), form.name, {
                        required: true, mono: true, ph: 'FAL_KEY', redraw: editing,
                        tip: t('Name: {v}', { v: form.name || '—' }) + '\n\n' + (editing
                            ? t('Letters, digits, _ . and - . Changing it renames the secret: the value, what it is for and who may use it move with it.')
                            : t('Letters, digits, _ . and - . It becomes the environment variable name and the {secret:NAME} reference.'))
                    }),
                    F.text('value', editing ? t('New value') : t('Value'), form.value, {
                        type: 'password', required: !editing,
                        tip: editing ? t('Empty = keep what is stored. Typing here replaces it.')
                            : t('Held in the OS keychain (VS Code SecretStorage). It is never read back into this page.')
                    }),
                    F.text('description', t('What it is for'), form.description, {
                        wide: true, ph: t('which site / which API / whose account'),
                        tip: t('The only thing about a secret you will still recognise in six months.')
                    })
                ])
                    + F.msg(renameNote(), true)
                    + F.sec(t('Who may use it'), used)
                    + F.grid([F.sel('reach', t('Who may use it'), REACH(), form.reach, {
                        redraw: true, tip: t('Who may use it: {v}', { v: reachNow.label }) + '\n\n' + reachNow.detail
                    })])
                    + (form.reach !== 'some' ? '' : `<div class="secpick">`
                        + `<button type="button" class="secondary mini" data-secpick="all">${window.AFCharts.esc(t('Tick all'))}</button>`
                        + `<button type="button" class="secondary mini" data-secpick="none">${window.AFCharts.esc(t('Untick all'))}</button>`
                        + `<span class="muted small">${window.AFCharts.esc(t('{n} of {all} ticked', { n: ticked, all: agents.length }))}</span></div>`
                        + F.grid(agents.map(a => F.check('ag_' + a.id, a.name, !!form.scope['ag_' + a.id], {
                            redraw: true, tip: t('Only the ticked agents\' tasks receive it.')
                        }))))
                    + F.msg(form.reach === 'some' && !ticked ? t('Tick at least one agent — or pick Every agent.') : '', true),
                msg: msg, warn: !ok,
                submit: editing ? t('Save changes') : t('Store it in the keychain')
            });
        }

        function wire() {
            const F = window.AFForm;
            const box = document.getElementById('secform');
            if (!box || !form) { return; }
            const take = v => Object.keys(v).forEach(key => {
                if (key.indexOf('ag_') === 0) { form.scope[key] = !!v[key]; } else { form[key] = v[key]; }
            });
            F.wire(box, {
                onEdit: take,
                onRedraw: () => o.render(),
                onSubmit: () => {
                    msg = '';
                    o.submit({
                        mode: form.mode, from: form.from, name: form.name, value: form.value,
                        description: form.description, reach: form.reach, farmOnly: form.reach === 'farm',
                        agents: form.reach === 'some' ? Object.keys(form.scope).filter(key => form.scope[key]).map(key => key.slice(3)) : []
                    });
                },
                onCancel: () => { form = null; msg = ''; o.render(); }
            });
            box.querySelectorAll('[data-secpick]').forEach(b => b.addEventListener('click', () => {
                take(F.read(box));
                (data().agents || []).forEach(a => { form.scope['ag_' + a.id] = b.dataset.secpick === 'all'; });
                o.render();
            }));
        }

        return {
            open, html, wire,
            isOpen: () => !!form,
            /** The row a card belongs to: an edit opens under its own row (N-7), a new one at the top. */
            rowOf: () => (form && form.mode === 'edit' ? form.from : ''),
            answer: (text, good) => { msg = text; ok = good; if (good) { form = null; } },
            message: () => msg,
            good: () => ok,
            clear: () => { msg = ''; }
        };
    }

    window.AFSecretForm = { create };
})();
