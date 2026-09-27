// Agent Farm — THE PUBLISH STEP'S CARD ROW (M-51). A publish step sends one
// platform's publish to a connection (a webhook: the user's n8n flow does the
// upload), then updates the content calendar note and the media record from the
// answer. Every box is a draft key the host maps to steps[].publish
// (tasksPanel stepFromDraft); approval, schedule and connection are flex points
// (media/afFlex.js), the platform list is Farm Settings' publishPlatforms.
(function () {
    'use strict';
    const IDS = ['puPlatform', 'puEntry', 'puUrl', 'puBody', 'puApproval', 'puSchedule', 'puConnection'];
    const SELECTS = ['puPlatform', 'puApproval', 'puSchedule', 'puConnection'];

    function blank() { return { puPlatform: '', puEntry: '', puUrl: '', puBody: '', puApproval: '', puSchedule: '', puConnection: '' }; }
    const platformsOf = D => (D && D.publishPlatforms && D.publishPlatforms.length ? D.publishPlatforms : ['youtube', 'instagram', 'tiktok']);

    function sel(C, id, label, list, value, tip) {
        return `<label class="ntf" title="${C.esc(tip)}"><span>${C.esc(label)}</span>
            <select id="nt-${id}">${list.map(([v, l]) => C.option(v, l, { selected: v === value })).join('')}</select></label>`;
    }
    function text(C, id, label, value, ph, tip, extra) {
        return `<label class="ntf wide" title="${C.esc(tip)}"><span>${C.esc(label)}</span>
            <input type="text" id="nt-${id}" value="${C.esc(value == null ? '' : String(value))}" placeholder="${C.esc(ph)}"${extra || ''}></label>`;
    }

    function row(s, C, D) {
        const plats = platformsOf(D);
        const plat = s.puPlatform || plats[0];
        const notes = (D && D.calendarNotes) || [];
        const appr = s.puApproval || '';
        return `<div class="ntgrid">
            ${sel(C, 'st-puPlatform', 'Platform', plats.map(p => [p, p]), plat,
                'Current: ' + plat + '\n\nWhere this step publishes — one platform per step. The list and its order are Farm Settings\' publishPlatforms.')}
            ${sel(C, 'st-puApproval', 'Ask first', [['', 'Default — Farm Settings'], ['ask', 'ask — wait for a yes'], ['auto', 'auto — publish without asking'], ['never', 'never — rehearse, send nothing']], appr,
                'Current: ' + (appr || 'Farm Settings (publishApproval)') + '\n\nask stops the run for a yes; auto sends at once; never rehearses — the payload is built and recorded, nothing is sent.')}
            ${sel(C, 'st-puSchedule', 'When', [['', 'now'], ['planned', 'planned — at the calendar note\'s time']], s.puSchedule || '',
                'Current: ' + (s.puSchedule || 'now') + '\n\nplanned hands the calendar note\'s date and time on as publishAt, for the flow to schedule.')}
            ${sel(C, 'st-puConnection', 'Connection', [['', 'webhook (n8n)']], s.puConnection || '',
                'Current: webhook\n\nThe connection posts the payload as JSON to the URL below; your n8n flow does the platform upload and answers {url, id, publishedAt, scheduled}.')}
            ${text(C, 'st-puEntry', 'Calendar note', s.puEntry, notes[0] || 'the note\'s name or title, or {input.note}',
                'Current: ' + (s.puEntry || 'none') + '\n\nThe content calendar note this publish is (Farm Settings contentCalendarDir). When the step ends it is marked published — or ready, when the flow only scheduled it — with the URL.', notes.length ? ' list="af-pu-notes"' : '')}
            ${notes.length ? `<datalist id="af-pu-notes">${notes.map(n => `<option value="${C.esc(n)}"></option>`).join('')}</datalist>` : ''}
            ${text(C, 'st-puUrl', 'Connection URL', s.puUrl, '{secret:N8N_PUBLISH_URL}',
                'The webhook your n8n flow listens on. {secret:NAME} is filled from Secrets; {prev_text} / {input.x} are substituted.')}
            <label class="ntf wide" title="${C.esc('The platform\'s metadata as JSON, handed on as metadata. {prev_json.x} / {prev_text} / {input.x} are filled inside its values, so a quote stays valid JSON. Empty = none: the payload still carries the platform, title, files, text and the calendar note.')}"><span>Metadata (JSON)</span>
                <textarea id="nt-st-puBody" rows="3" placeholder="${C.esc('{"title": "{prev_json.title}", "description": "{prev_text}", "tags": ["kahve"]}')}">${C.esc(s.puBody || '')}</textarea></label>
        </div>`;
    }

    function summary(s) {
        const e = String(s.puEntry || '').trim();
        return (s.puPlatform || 'publish') + (e ? ' · ' + (e.length > 30 ? e.slice(0, 30) + '…' : e) : '') + (s.puApproval === 'never' ? ' · rehearsal' : '');
    }
    function read(s, g) { IDS.forEach(id => { const el = g(id); if (el && el.value != null) { s[id] = String(el.value); } }); }
    function error(s) { return String(s.puUrl || '').trim() ? '' : 'A publish step needs its connection URL — the webhook your n8n flow listens on.'; }
    function wire(byId, readStep) { IDS.forEach(id => byId('nt-st-' + id, SELECTS.indexOf(id) >= 0 ? 'change' : 'input', () => readStep())); }

    window.AFPublish = { IDS, blank, row, summary, read, error, wire };
})();
