// Agent Farm — KAPICI ON THE PAGES (U-155). No panel of its own: three small
// surfaces on pages that already exist.
//   chip(k, C)     — the 🛡 chip on a run or trigger row; its AFTip carries the
//                    answers, who gave them and how fast (src/core/kapiciChip.ts).
//   section(K, C)  — the head of Farm Settings' Kapıcı section: the key (present
//                    or missing, never its value), the rules, how often each
//                    consumer's shadow agreed with today's path, and the MCP.
//   rules(list, C) — the Toolbox's rule list.
// Styles are inline on purpose: a page that never loaded a stylesheet for this
// still draws it right.
(function () {
    'use strict';
    const CONSUMERS = [['dispatch', 'routing'], ['retry', 'retries'], ['trigger', 'triggers'], ['workflow', 'workflow steps']];
    const LABEL = { dispatch: 'routing incoming work', retry: 'a held retry', trigger: 'a trigger precondition', workflow: 'a workflow step' };
    const pct = x => Math.round((Number(x) || 0) * 100) + '%';
    const T = () => window.AFTip;
    const CHIP = 'display:inline-block;padding:0 5px;border-radius:3px;font-size:11px;line-height:16px;white-space:nowrap;';
    const tint = ok => (ok ? 'background:rgba(76,175,80,.18);color:var(--af-ink-charts-green, var(--vscode-charts-green,#4caf50))' : 'background:rgba(241,76,76,.16);color:var(--af-ink-charts-red, var(--vscode-charts-red,#f14c4c))');

    function word(k) { return k.outcome || (k.fallback ? k.fallback + ' path' : k.passed ? 'pass' : 'reject'); }

    function chip(k, C) {
        if (!k || !k.rule) { return ''; }
        const sure = !k.fallback;
        const ok = k.outcome ? !/skip|stop|reject/.test(k.outcome) : k.passed;
        const trig = `<span class="kpc-chip" style="${CHIP}${sure ? tint(ok) : 'background:rgba(128,128,128,.18)'}">🛡 ${C.esc(word(k))}${sure ? ' ' + pct(k.confidence) : ''}</span>`;
        return T().wrap(trig, 'Gatekeeper — ' + k.rule, T().lines([
            'Decision: ' + k.decision + (k.outcome && k.outcome !== k.decision ? ' → ' + k.outcome : ''),
            'Confidence: ' + (sure ? pct(k.confidence) : 'none — the rule\'s ' + k.fallback + ' path'),
            'Answered by: ' + k.provider + ' · ' + (k.latencyMs || 0) + ' ms',
            ...Object.keys(k.answers || {}).map(q => 'Question ' + q + ': ' + k.answers[q]),
            'For: ' + (LABEL[k.consumer] || k.consumer),
            'When: ' + new Date(k.at).toLocaleString(),
            k.reason ? '\nWhy: ' + k.reason : ''
        ]), 'tip-kapici');
    }

    function section(K, C) {
        if (!K || !K.key) { return ''; }
        const key = K.key;
        const agree = K.agreement || {};
        const problems = K.problems || [];
        const keyHtml = T().wrap(`<span style="${CHIP}${tint(key.present)}">🔑 ${C.esc(key.name)} — ${key.present ? 'present' : 'missing'}</span>`,
            'Key — ' + (key.present ? 'present' : 'missing'), T().lines([
                'Key: ' + key.name + (key.present ? ' — present; its value never leaves the Secret vault' : ' — missing'),
                'Road: ' + key.route + ' · ' + key.url,
                'Model: ' + key.model,
                ...(K.candidates || []).map(c => 'Looked for: ' + c.name + ' — ' + (c.present ? 'present' : 'missing')),
                key.present ? '' : '\nWithout a key every question goes down its rule\'s failure path — nothing breaks, and nothing is asked of a model.'
            ]), 'tip-kpc-key');
        const rulesHtml = T().wrap(`<span>${Number(K.rules) || 0} rule(s)${problems.length ? ` · <b style="color:var(--af-ink-charts-red, var(--vscode-charts-red,#f14c4c))">${problems.length} broken</b>` : ''}</span>`,
            'Rules — ' + (Number(K.rules) || 0), T().lines([
                ...(K.rulesDirs || []).map(d => 'Folder: ' + d),
                ...problems.map(p => 'Broken: ' + (p.file || p.layer || '?') + ' — ' + p.error),
                '\nThe built-in rules come with Agent Farm; a rule file in a folder above with the same id replaces one. The Toolbox lists them all.'
            ]), 'tip-kpc-rules');
        const shown = CONSUMERS.filter(([id]) => agree[id] && agree[id].compared);
        const agreeHtml = T().wrap(`<span>agreed: ${shown.length ? shown.map(([id, l]) => l + ' ' + pct(agree[id].rate)).join(' · ') : 'nothing compared yet'}</span>`,
            'Shadow agreement — 30 days', T().lines([
                ...CONSUMERS.map(([id, l]) => {
                    const a = agree[id];
                    return l + ': ' + (a && a.compared ? a.agreed + ' of ' + a.compared + ' (' + pct(a.rate) + '), confidence ' + a.confidence.min + '–' + a.confidence.max : 'nothing compared');
                }),
                '\nIn shadow a consumer works exactly as before and Gatekeeper answers beside it; this is how often the two agreed. Switch one on when its rate is high enough for you.'
            ]), 'tip-kpc-agree');
        return `<div class="kpc-head" style="display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;margin:4px 0 8px">${keyHtml}${rulesHtml}${agreeHtml}${mcp(K.mcp, C)}`
            + `<button id="kpc-secrets" title="Secret vault\n\nEnter the key there under ${C.esc(key.name)} and tick Farm only — Agent Farm reads it, no agent's environment gets it.">Secret vault…</button></div>`;
    }

    /** B-28 — whether every Claude Code session gets the kapici_* tools, and the button that gives or takes them. */
    function mcp(m, C) {
        if (!m) { return ''; }
        const given = m.registered && m.upToDate;
        const word = given ? 'given to agents' : m.registered ? 'points elsewhere' : 'not given';
        return T().wrap(`<span>MCP: ${word}</span>`, 'MCP — ' + word, T().lines([
            'Tools: kapici_eval · kapici_ask · kapici_rules',
            'Server: ' + m.path + (m.staged ? '' : ' — not staged yet (reload the window once)'),
            'Registered in: ' + m.configFile + (m.registered ? (given ? '' : ' — at another copy; press the button to point it here') : ' — no'),
            '\nA Claude Code session started after it is given gets the tools. They carry each question to Agent Farm over the bridge, so the key never leaves it; with VS Code closed they say so and nothing runs.'
        ]), 'tip-kpc-mcp') + `<button id="kpc-mcp" class="secondary" data-on="${given ? '0' : '1'}">${given ? 'Take the MCP back' : 'Give agents the MCP'}</button>`;
    }

    function rules(list, C) {
        if (!list || !list.length) { return '<p class="muted small">No Gatekeeper rules found.</p>'; }
        return `<div class="kpc-rules" style="display:grid;grid-template-columns:auto auto auto 1fr;gap:2px 12px;align-items:baseline">`
            + list.map(r => T().wrap(`<code>${C.esc(r.id)}</code>`, r.id + ' — v' + r.version, T().lines([
                r.description,
                '\nLayer: ' + r.layer + (r.overrides && r.overrides.length ? ' (over ' + r.overrides.join(', ') + ')' : ''),
                r.file ? 'File: ' + r.file : 'File: shipped with Agent Farm',
                'Asks: ' + Object.keys(r.questions || {}).map(id => id + ' (' + r.questions[id] + ')').join(', '),
                'Providers: ' + (r.providers ? r.providers.join(' → ') : 'the default chain'),
                r.minConfidence !== undefined ? 'Min confidence: ' + r.minConfidence + ' · unsure: ' + r.onLowConfidence + ' · failure: ' + r.onFailure : '',
                'Golden examples: ' + r.golden
            ]), 'tip-kpc-rule')
                + `<span class="muted small">${C.esc(r.layer)}</span>`
                + `<span class="muted small">${C.esc(Object.keys(r.questions || {}).map(id => r.questions[id]).join(' + '))} · ${r.golden} golden</span>`
                + `<span class="small">${C.esc(r.description)}</span>`).join('')
            + '</div>';
    }

    /** Farm Settings: the vault button. `post` = the page's message sender. */
    function wire(post) {
        const b = document.getElementById('kpc-secrets');
        if (b) { b.addEventListener('click', () => post({ type: 'openSecrets' })); }
        const m = document.getElementById('kpc-mcp');
        if (m) { m.addEventListener('click', () => post({ type: 'kapiciMcp', on: m.getAttribute('data-on') === '1' })); }
    }

    window.AFKapici = { chip, section, rules, wire, CONSUMERS };
})();
