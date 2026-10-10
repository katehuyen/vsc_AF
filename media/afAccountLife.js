// X-530 / X-531 — an account card's life: Disable / Enable, Sign out, Delete, and the asleep mark.
// The host decides everything (src/core/accountLifeOps.ts, the functions accounts.disable / .enable /
// .signout / .delete call); this draws the buttons and posts the card's id. Loaded before afAccounts.js.
(function () {
    'use strict';
    const t = (s, v) => (window.AFI18n ? window.AFI18n.t(s, v)
        : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? String(v[k]) : m)));
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
    const TYPES = { enable: 'accountEnable', disable: 'accountDisable', signout: 'accountSignOut', delete: 'accountForget' };

    function badge(a) {
        if (!a || !a.disabled) { return ''; }
        return window.AFTip.wrap('<span class="acbad asleep">' + esc(t('disabled')) + '</span>',
            t('Disabled — asleep on purpose'),
            t('Nothing reads this account\'s quota and nothing starts on it: no picker, pool, rule or relay offers it, and a launch that names it is refused by name. Its folder, sign-in, settings and history are all kept — Enable brings it back at once.'));
    }

    function button(kind, id, word, cls) {
        return '<button class="secondary small' + (cls ? ' ' + cls : '') + '" data-aclife="' + kind
            + '" data-acid="' + esc(id) + '">' + esc(word) + '</button>';
    }

    function actions(a) {
        const T = window.AFTip;
        const name = a.label || a.id;
        const sleep = a.disabled
            ? T.wrap(button('enable', a.id, t('Enable')), t('Wake {name}', { name: name }),
                t('Its sign-in is read off the disk at once: if it still works the account is back in every picker and pool and its figure is read; if it has expired the card says so and the 🔑 signs it in again.'))
            : T.wrap(button('disable', a.id, t('Disable')), t('Put {name} to sleep', { name: name }),
                t('Keeps everything — folder, sign-in, settings, history — and stops everything that uses it: no quota reads, no pickers, no pools, no relay legs. A launch that names it is refused by name; an agent that stands on it steps over it to the next choice. A run already on it keeps going. Enable undoes it.'));
        const out = !a.disabled && a.health === 'ready'
            ? T.wrap(button('signout', a.id, t('Sign out')), t('Sign {name} out, keep the account', { name: name }),
                t('Removes only the sign-in tokens from this account\'s folder. The card, its label, settings and history stay, it reads as needing a sign-in at once, and the 🔑 signs it in again into this same slot. Refused while a session or task runs on it. Local removal is not revocation: the provider honours the tokens until they expire or you revoke them there.'))
            : '';
        const del = T.wrap(button('delete', a.id, t('Delete'), 'acdel'), t('Delete {name} for good', { name: name }),
            t('You are shown what goes and what stays, then asked. Its session records are moved to the shared pool first, then the folder — sign-in tokens included — is deleted; if anything cannot be moved, nothing is deleted. A running session or task refuses it. Local deletion is not revocation: the tokens stay in the agent repo\'s git history. To keep the account for later, Disable it instead.'));
        return sleep + out + del;
    }

    function wire(post) {
        document.querySelectorAll('[data-aclife]').forEach(b =>
            b.addEventListener('click', () => post({ type: TYPES[b.dataset.aclife], id: b.dataset.acid })));
    }

    /** Within one engine's group the awake accounts come first; the order among each is kept. */
    function order(rows) {
        return rows.filter(a => !a.disabled).concat(rows.filter(a => a.disabled));
    }

    // U-246 — Delete is the one press on a card that cannot be taken back: red at rest, filled under the
    // hand. And the key that answers a verdict wears that verdict (the badge's own class): tinted and
    // lined in the badge's colour while the sign-in is dead, a line alone while it works and runs out.
    // A line is an inset shadow, never a border — the row's buttons stay one height (the shared button
    // has no border to colour, which is why the old border-color rules drew nothing).
    const CSS = `
        .accard.asleep { border-style:dashed; }
        .acbad.asleep { background:transparent; color:var(--vscode-descriptionForeground,#9d9d9d);
            border:1px dashed var(--vscode-descriptionForeground,#9d9d9d); }
        button.secondary.acdel { color:var(--af-ink-charts-red, var(--vscode-charts-red,#f14c4c));
            box-shadow:inset 0 0 0 1px var(--af-ink-charts-red, var(--vscode-charts-red,#f14c4c)); }
        button.secondary.acdel:hover { background:var(--af-ink-charts-red, var(--vscode-charts-red,#f14c4c)); color:var(--af-on-fill, #000); }
        button.secondary.acreauth.ok { box-shadow:inset 0 0 0 1px var(--vscode-charts-yellow,#d7ba7d); }
        button.secondary.acreauth.warn { box-shadow:inset 0 0 0 1px var(--vscode-charts-yellow,#d7ba7d);
            background:color-mix(in srgb, var(--vscode-charts-yellow,#d7ba7d) 45%, var(--vscode-button-secondaryBackground,#3a3d41)); }
        button.secondary.acreauth.bad { box-shadow:inset 0 0 0 1px var(--af-ink-charts-red, var(--vscode-charts-red,#f14c4c));
            background:color-mix(in srgb, var(--af-ink-charts-red, var(--vscode-charts-red,#f14c4c)) 45%, var(--vscode-button-secondaryBackground,#3a3d41)); }
        button.secondary.acreauth:hover { filter:brightness(1.2); }
    `;

    const api = { badge, actions, wire, order, TYPES, CSS };
    if (typeof window !== 'undefined') { window.AFAccountLife = api; }
    if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
})();
