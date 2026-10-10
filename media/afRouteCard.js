// Agent Farm — a route's card on the Engines page, and the verdict chip and Test
// button its card and the Route health section share (X-100, X-114, U-243).
//
// ‼️ ONE ROUTE, A VERDICT PER ENGINE. A route serving Claude Code and OpenCode is
// two programs reaching one service: what one engine proved says nothing about
// the other, so each served engine has its own chip and its own Test button,
// reading the same health row and posting the same `providerTest` the section does.
//
// ‼️ NOTHING HERE HOLDS A CREDENTIAL. The rows are `PublicProviderProfile`, built
// by naming what is public; `hasSecret` is the whole of what they say about a key.
(function () {
    'use strict'; // i18n-exempt — a directive, not interface text
    const t = (s, v) => (window.AFI18n ? window.AFI18n.t(s, v) : s.replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? String(v[k]) : m)));
    const esc = (s) => window.AFCharts.esc(String(s === undefined || s === null ? '' : s));
    /** The page's data for the card being drawn. */
    let D = {};

    const engineLabel = (id) => ((D.engines || []).find(e => e.id === id) || {}).label || id;

    /** The health row this route has on one engine, found by the id it wears there. */
    function rowOn(engine, routeId) {
        const pre = ((D.routeForm || {}).onEngine || {})[engine] || '';
        const rep = (D.providerHealth || []).find(r => r.engine === engine);
        return rep ? (rep.rows || []).find(r => r.providerId === pre + routeId) : undefined;
    }

    /**
     * ‼️ NEVER TESTED IS NOT A FAILURE, and neither is a refusal. Three readings
     * the first draft of this chip collapsed into a red cross: nothing has been
     * pressed yet, nothing was called at all, and a verdict that answered for a
     * configuration this one replaced.
     */
    function testedChip(r, data) {
        const T = window.AFTip;
        const now = (data && data.now) || Date.now();
        const v = r && r.tested;
        if (!v && r && r.testedSuperseded) {
            const s = r.testedSuperseded;
            return T.wrap('<span class="pohchip h-old">' + esc(t('superseded')) + '</span>',
                (s.ok ? t('Passed') : t('Failed')) + ' ' + window.AFTime.full(s.at),
                t('That verdict is not about this configuration any more: {why}. Press Test route to get one that is.',
                    { why: r.testedSupersededWhy || t('something it named has changed') }));
        }
        if (!v) {
            return T.wrap('<span class="pohchip h-none">' + esc(t('never tested')) + '</span>',
                t('No turn has been run through this route'),
                t('The ordinary state, and not a fault. A turn costs something, so nothing here buys one on its own — not on a timer, not on a refresh, not when this page opens.'));
        }
        const state = v.ok ? 'h-ok' : v.refused ? 'h-held' : 'h-bad';
        // X-532 — `reached`: the service was asked and held the turn with a limit of its own.
        const word = v.ok ? t('tested') : v.refused ? (v.reached ? t('service limit') : t('not attempted')) : t('failed');
        return T.wrap('<span class="pohchip ' + state + '">' + esc(word) + ' · '
            + esc(window.AFAccounts.age(v.at, now)) + '</span>',
            (v.ok ? t('Answered') + ' · ' : v.refused ? (v.reached ? t('Held by the service') + ' · ' : t('Nothing was called') + ' · ') : t('Did not answer') + ' · ')
            + window.AFTime.full(v.at),
            T.lines([
                v.detail,
                v.resetAt ? t('Reopens: {when}', { when: window.AFTime.full(v.resetAt) }) : '',
                v.error ? (v.reached ? t('The service said: {words}', { words: v.error }) : t('The engine said: {words}', { words: v.error })) : '',
                t('Took: {s}s', { s: (v.ms / 1000).toFixed(1) }),
                t('Proved: {what}', {
                    what: v.key.providerId + ' · ' + (v.key.modelId || t('the route default')) + ' · adapter ' + v.key.adapter
                        + (v.key.cli ? ' · CLI ' + v.key.cli : '') + (v.key.revision === undefined ? '' : ' · route r' + v.key.revision)
                })
            ]));
    }

    /** One real turn through one route on one engine — pressed, never scheduled. */
    function testButton(engine, providerId, model, busy) {
        return '<button class="secondary small" data-potest="' + esc(providerId) + '"'
            + ' data-poteng="' + esc(engine) + '" data-potmodel="' + esc(model || '') + '"'
            + (busy ? ' disabled' : '') + ' title="' + esc(t('Runs ONE real turn through this route — a token off its plan or a line on its bill. Pressed, never scheduled. Anything already known to be wrong refuses it before anything is spawned.')) + '">'
            + esc(busy ? t('Testing…') : t('Test route')) + '</button>';
    }

    /** Serves: each engine the route is marked for, with what a turn there proved. */
    function servesHtml(p) {
        const engines = Array.isArray(p.engines) ? p.engines : [];
        if (!engines.length) { return ''; }
        const testing = D.providerTesting || [];
        const pre = (D.routeForm || {}).onEngine || {};
        return '<div class="pobody poserves small"><span class="muted">' + esc(t('Serves')) + '</span>'
            + engines.map(e => {
                const id = (pre[e] || '') + p.id;
                const row = rowOn(e, p.id);
                return '<span class="poserve">' + esc(engineLabel(e)) + ' ' + testedChip(row, D) + ' '
                    + testButton(e, id, ((row && row.modelRefs) || [])[0], testing.indexOf(e + '/' + id) >= 0) + '</span>';
            }).join('')
            + (engines.includes('opencode')
                ? '<span class="muted">' + esc(t('OpenCode opened by hand outside Agent Farm does not see this route.')) + '</span>' : '')
            + '</div>';
    }

    function profileHtml(p) {
        const T = window.AFTip;
        // ‼️ MIRROR — a control narrow enough to cut its own text puts its
        // CURRENT value on the first line of its tooltip.
        const tiers = Object.keys(p.tiers || {});
        // X-488 — which key: a Farm Secret by name, or the route's own; the masked hint tells two apart.
        const hint = p.keyHint ? ' · ' + esc(p.keyHint) : '';
        // X-492 — a key never follows its route to a new endpoint; a person confirms it here.
        const held = p.keyHeldFor
            ? T.wrap('<span class="pokey k-no">' + esc(t('key held for another endpoint')) + '</span>',
                t('Given for {url}', { url: p.keyHeldFor }),
                t('This route\'s endpoint changed after its key was given, so no session starts on it until you confirm the key for the new endpoint (Change key) or give it another one.'))
            : '';
        const key = held || (p.secretRef && p.hasSecret
            ? T.wrap('<span class="pokey k-yes">' + esc(p.secretRef) + hint + '</span>',
                t('Signs in with the Farm Secret {name}', { name: p.secretRef }),
                t('The key is read from Farm Secrets each time a session starts on this route. Editing the secret there changes it here; removing this route leaves the secret in the vault.'))
            : p.secretRef
                ? T.wrap('<span class="pokey k-no">' + esc(t('{name} — not in Farm Secrets', { name: p.secretRef })) + '</span>',
                    t('The Farm Secret this route names is gone'),
                    t('No session can start on this route until it has a key again. Press Change key to pick another secret or type one.'))
                : p.hasSecret
                    ? T.wrap('<span class="pokey k-yes">' + esc(t('own key')) + hint + '</span>', t('A key of its own is stored'),
                        t('It lives in the OS keychain under this route\'s id — never in settings, never on the bridge, and never read back out to draw anything; only a masked reminder of which key it is is shown.'))
                    : T.wrap('<span class="pokey k-no">' + esc(t('no key')) + '</span>', t('No credential yet'),
                        t('This route cannot be used until it has a key. Press Add key to pick one of your Farm Secrets or type one — the value never enters this page.')));
        return '<div class="pocard">'
            + '<div class="pohead">'
            + '<span class="poname">' + esc(p.label) + '</span>'
            + T.wrap('<span class="poid">' + esc(p.id) + '</span>', 'id: ' + p.id,
                t('Permanent — the credential is filed under it. Copy the profile to get a new id; the copy deliberately starts with no key.'))
            + key
            + T.wrap('<span class="porev">r' + esc(p.revision) + '</span>', t('revision {n}', { n: p.revision }),
                t('Counts up whenever the ROUTE changes — provider, an address, auth kind, engines, tier mapping — or its key is replaced. Never on a rename. A launch records the revision it ran on, so a route edited afterwards cannot silently rewrite what a past session was served by.'))
            + '<span class="grow"></span>'
            + (window.AFRouteForm.editingId() === p.id ? '' : '<button class="secondary small" data-poedit="' + esc(p.id) + '" title="'
                + esc(t('Change this route\'s label, provider, addresses, engines, key kind, tiers or note. The id and the key stay.')) + '">'
                + esc(t('Edit')) + '</button>')
            + '<button class="secondary small" data-pokey="' + esc(p.id) + '" data-polabel="' + esc(p.label) + '" title="'
            + esc(t('Type a key for this route, or pick one you already keep in Farm Secrets.')) + '">'
            + esc(p.hasSecret || p.secretRef || p.keyHeldFor ? t('Change key') : t('Add key')) + '</button>'
            + '<button class="secondary small" data-pocopy="' + esc(p.id) + '" title="'
            + esc(t('A copy is a NEW route: its own id, its own history from revision 1, and no credential — duplicating a key would put one secret behind two names.')) + '">' + esc(t('Copy')) + '</button>'
            + '<button class="secondary small" data-porm="' + esc(p.id) + '" title="'
            + esc(t('Removes the route AND collects its credential from the keychain. A row dropped with the entry left behind is a working key nobody can see.')) + '">' + esc(t('Remove')) + '</button>'
            + '</div>'
            + (p.description ? '<div class="pobody small">' + esc(p.description) + '</div>' : '')
            + '<div class="pobody muted small">'
            + esc(p.providerId) + (p.baseUrl ? ' · ' + esc(p.baseUrl) : ' · ' + esc(t('first-party endpoint')))
            + (p.opencodeUrl ? ' · ' + esc(t('OpenCode: {url}', { url: p.opencodeUrl })) : '')
            + (p.authKind ? ' · ' + esc(window.AFRouteForm.authLabel(p.authKind, D)) : '')
            + (tiers.length
                ? ' · ' + tiers.map(k => esc(k) + ' → ' + esc(p.tiers[k])).join(', ')
                : ' · ' + esc(t('the route\'s own defaults')))
            + '</div>'
            + servesHtml(p)
            + '</div>';
    }

    /** A route's card, drawn against the page's data of this paint. */
    function cardHtml(p, data) { D = data || {}; return profileHtml(p); }

    window.AFRouteCard = { cardHtml, testedChip, testButton };
})();
