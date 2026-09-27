// Agent Farm — THE METRICS STEP'S CARD ROW (M-52). A metrics step sends the
// content calendar's published notes to a connection (a webhook: the user's n8n
// flow reads the platforms' analytics) and files the numbers onto the media
// records and the performance snapshot that {performance} and the supervisor's
// brief read. Every box is a draft key the host maps to steps[].metrics
// (tasksPanel stepFromDraft); the fields are a flex point (media/afFlex.js).
// How often it pulls is the workflow's own schedule.
(function () {
    'use strict';
    const IDS = ['mtUrl', 'mtPlatform', 'mtDays', 'mtFields'];
    const SELECTS = ['mtPlatform'];
    const KEYS = ['views', 'watchSeconds', 'completion', 'likes', 'comments', 'shares', 'saves', 'engagement'];

    function blank() { return { mtUrl: '', mtPlatform: '', mtDays: '', mtFields: '' }; }
    const platformsOf = D => (D && D.publishPlatforms && D.publishPlatforms.length ? D.publishPlatforms : ['youtube', 'instagram', 'tiktok']);

    function text(C, id, label, value, ph, tip, cls) {
        return `<label class="ntf${cls ? ' ' + cls : ''}" title="${C.esc(tip)}"><span>${C.esc(label)}</span>
            <input type="text" id="nt-${id}" value="${C.esc(value == null ? '' : String(value))}" placeholder="${C.esc(ph)}"></label>`;
    }

    function row(s, C, D) {
        const plats = platformsOf(D);
        const plat = s.mtPlatform || '';
        return `<div class="ntgrid">
            <label class="ntf" title="${C.esc('Current: ' + (plat || 'every platform') + '\n\nWhose publishes are measured. Empty = every published note in the content calendar.')}"><span>Platform</span>
                <select id="nt-st-mtPlatform">${[['', 'every platform']].concat(plats.map(p => [p, p])).map(([v, l]) => C.option(v, l, { selected: v === plat })).join('')}</select></label>
            ${text(C, 'st-mtDays', 'Last days', s.mtDays, '30',
                'Current: ' + (s.mtDays || '30') + '\n\nOnly publishes of the last N days are sent to be measured.')}
            ${text(C, 'st-mtFields', 'Numbers', s.mtFields, 'Farm Settings metricsFields',
                'Current: ' + (s.mtFields || 'Farm Settings (metricsFields)') + '\n\nWhich numbers the flow is asked for and the briefs show, comma-separated: ' + KEYS.join(', ') + '. Whatever the flow answers still lands on the media record.', 'wide')}
            ${text(C, 'st-mtUrl', 'Connection URL', s.mtUrl, '{secret:N8N_METRICS_URL}',
                'The webhook your n8n flow listens on. It gets {fields, items: [{calendar, title, platform, url, record, publishedAt}]} and answers one row per publish: [{url or record, views, watchSeconds, likes, comments, shares, saves, engagement}]. {secret:NAME} is filled from Secrets.', 'wide')}
        </div>`;
    }

    function summary(s) {
        return 'metrics · ' + (s.mtPlatform || 'every platform') + ' · ' + (s.mtDays || '30') + ' days';
    }
    function read(s, g) { IDS.forEach(id => { const el = g(id); if (el && el.value != null) { s[id] = String(el.value); } }); }
    function error(s) {
        if (!String(s.mtUrl || '').trim()) { return 'A metrics step needs its connection URL — the webhook your n8n flow listens on.'; }
        const bad = String(s.mtFields || '').split(/[\s,]+/).filter(Boolean).filter(k => KEYS.indexOf(k) < 0);
        if (bad.length) { return 'Unknown numbers: ' + bad.join(', ') + ' — use ' + KEYS.join(', ') + '.'; }
        const d = String(s.mtDays || '').trim();
        return d && !(Number(d) > 0) ? 'Last days is a number above 0.' : '';
    }
    function wire(byId, readStep) { IDS.forEach(id => byId('nt-st-' + id, SELECTS.indexOf(id) >= 0 ? 'change' : 'input', () => readStep())); }

    window.AFMetrics = { IDS, blank, row, summary, read, error, wire };
})();
