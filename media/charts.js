// Agent Farm — tiny dependency-free SVG chart helpers.
// All charts read VS Code theme colors via CSS variables.
(function () {
    'use strict';

    const PALETTE = [
        'var(--vscode-charts-blue, #3794ff)',
        'var(--vscode-charts-green, #4caf50)',
        'var(--vscode-charts-orange, #d18616)',
        'var(--vscode-charts-purple, #b180d7)',
        'var(--vscode-charts-red, #f14c4c)',
        'var(--vscode-charts-yellow, #cca700)',
        'var(--vscode-charts-foreground, #cccccc)'
    ];

    function esc(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function fmtUSD(v) {
        if (v >= 100) return '$' + v.toFixed(0);
        if (v >= 1) return '$' + v.toFixed(2);
        return '$' + v.toFixed(3);
    }

    function fmtTok(n) {
        if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
        if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
        return String(n);
    }

    /**
     * ‼️ THE TWO TOKEN FIGURES ALWAYS TRAVEL TOGETHER — this is that pair.
     *
     * `fmtTok` alone answers "how much text moved". It does NOT answer "how
     * much of the 5-hour window did that burn", and the two are not even
     * proportional: a cache-read token is a tenth of a fresh input token and
     * makes up 94-99% of any raw total, so a long conversation's raw count runs
     * away from what it actually costs the limit. Measured over 32 days of real
     * transcripts the ratio between them ranges 0.80x to 3.86x, and the eight
     * heaviest windows sit inside a ±13% band by weighted total while spanning
     * 111M-175M raw. A surface printing only the first number therefore makes a
     * change in the shape of the work look like a change in the counter — which
     * is exactly the reading that sent four investigations after a counting bug
     * that was never there.
     *
     * So: raw first, `⚖` and the weighted figure after it. `WEIGHTED_TIP` is
     * the one explanation, shared by every surface's title attribute.
     */
    const WEIGHTED_TIP =
        'Left: raw tokens — everything that moved, cache reads included.\n' +
        'Right (⚖): the same work weighted the way the plan limit charges it ' +
        '(output x5, cache-write x1.25, cache-read x0.1, and Opus x5 over Sonnet).\n' +
        'The two are not proportional (measured ratio 0.8x-3.9x across 32 days), ' +
        'so the raw figure alone cannot tell you how full your 5-hour window is — this one can. ' +
        'It approximates the plan formula, which is not published; the exact ' +
        'answer stays the Plan usage card.';

    /** `4.6M ⚖ 0.6M` — both figures, one string. `w` of 0/undefined shows raw only. */
    function fmtTokW(n, w) {
        const raw = fmtTok(n || 0);
        return w > 0 ? raw + ' <span class="wtok" title="' + esc(WEIGHTED_TIP) + '">⚖ ' + fmtTok(Math.round(w)) + '</span>' : raw;
    }

    /** Plain-text twin of fmtTokW, for tooltips and title attributes. */
    function fmtTokWText(n, w) {
        const raw = fmtTok(n || 0);
        return w > 0 ? raw + ' (⚖ ' + fmtTok(Math.round(w)) + ')' : raw;
    }

    /**
     * ‼️ WHAT KIND OF STEP THIS IS — the webview's copy of `src/core/stepkind.ts`.
     *
     * A turn was a list of things that looked alike: a file read off this disk
     * and the model reasoning for nine seconds drew the same row, though one
     * costs nothing to run and the other is billed at the output rate. Without
     * the kind, "where did my limit go?" has no answer on the page.
     *
     * Held identical to the TypeScript table by `test_step_kinds.js` — a chip in
     * the Console and a cell in the viewer must not describe one step two ways.
     */
    const STEP_KIND = {
        think: { glyph: '◈', label: 'thinking', cost: 'model reasoning — billed as output tokens, the dearest kind' },
        say: { glyph: '▸', label: 'reply', cost: 'model writing — billed as output tokens' },
        local: { glyph: '⌘', label: 'local tool', cost: 'runs on this machine — no tokens to run; its result is paid on the next call' },
        mcp: { glyph: '⇄', label: 'MCP tool', cost: 'a request to an MCP server — no model tokens; its result is paid on the next call' },
        web: { glyph: '⌗', label: 'web', cost: 'out to the internet — no model tokens; the page comes back into context' },
        subagent: { glyph: '⑂', label: 'sub-agent', cost: "its own conversation with its own context, spending this session's budget" },
        harness: { glyph: '⚙', label: 'harness', cost: 'inside the CLI — no model, no network' },
        result: { glyph: '↩', label: 'tool result', cost: 'free to produce; this is what makes the next call bigger' },
        none: { glyph: '·', label: 'local only', cost: 'never reached a model' }
    };

    /** `◈` with the explanation on hover. Empty string for an unknown kind, so
     *  a row from an older transcript simply carries no chip. */
    function stepChip(kind, tokens, wTokens) {
        const s = STEP_KIND[kind];
        if (!s) { return ''; }
        const cost = tokens > 0
            ? '\nThis call: ' + fmtTokWText(tokens, wTokens)
            : '\nThis row rode on the call above it — one API call carries several steps and its cost is written once.';
        return '<span class="skind sk-' + kind + '" title="' + esc(s.label + ' — ' + s.cost + cost) + '">'
            + s.glyph + '</span>';
    }

    /** The legend, for the one place that explains the whole scheme. */
    function stepKindLegend() {
        return Object.keys(STEP_KIND).map(k =>
            '<span class="skleg" title="' + esc(STEP_KIND[k].cost) + '"><span class="skind sk-' + k + '">'
            + STEP_KIND[k].glyph + '</span> ' + esc(STEP_KIND[k].label) + '</span>').join(' ');
    }

    /**
     * A duration read at a glance: `34s` · `3m-29s` · `1h-4m-23s` · `1d-7h-54m-41s`.
     *
     * ‼️ SECONDS ALONE STOP BEING AN ANSWER AT ABOUT TWO MINUTES. The strips
     * counted seconds forever, so a turn that ran an hour said `3847s` — a
     * number the reader has to divide before it means anything, and the longer
     * the turn the less it says. A unit appears only once it is REACHED, and
     * from there down every unit is always written: `1h-0m-5s`, never `1h-5s`,
     * so the string can be read left to right without checking which fields
     * happen to be present.
     */
    function fmtDur(ms) {
        const s = Math.max(0, Math.round(Number(ms) / 1000) || 0);
        const d = Math.floor(s / 86400);
        const h = Math.floor((s % 86400) / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        if (d) { return d + 'd-' + h + 'h-' + m + 'm-' + sec + 's'; }
        if (h) { return h + 'h-' + m + 'm-' + sec + 's'; }
        if (m) { return m + 'm-' + sec + 's'; }
        return sec + 's';
    }

    /**
     * The turn's size, in the one shape every surface uses: `14api/26`.
     *
     * ‼️ ONE NUMBER HERE WAS TWO QUESTIONS. "26" is how many STEPS the agent
     * took — each reply fragment and each tool call is one — while what it
     * actually spent is decided by how many API CALLS those steps took, and a
     * single call routinely carries several steps. A run whose call count
     * halved while its step count held looked unchanged, and the token total
     * moving underneath it looked like a counting bug. Both numbers, always, in
     * the same order, everywhere.
     */
    function fmtSteps(apiCalls, steps) {
        const a = Number(apiCalls) || 0;
        const s = Number(steps) || 0;
        if (!a) { return String(s); }
        return a + 'api/' + s;
    }

    /** The one sentence that explains `14api/26` wherever it is shown. */
    const STEPS_TIP = 'API calls / steps — a step is one reply fragment or one '
        + 'tool call; a single API call usually carries several of them. The '
        + 'tokens follow the CALLS, not the steps.';

    /**
     * Stacked bar chart.
     * days: ['2026-07-01', ...]; series: [{name, values:[...]}]
     * fmt: value formatter for tooltip/axis.
     */
    function stackedBars(days, series, opts) {
        opts = opts || {};
        const W = 640, H = 220, padL = 44, padB = 30, padT = 10, padR = 6;
        const innerW = W - padL - padR, innerH = H - padT - padB;
        const totals = days.map((_, i) => series.reduce((a, s) => a + (s.values[i] || 0), 0));
        const max = Math.max(1e-9, ...totals);
        const bw = Math.max(2, innerW / days.length - 3);
        const fmt = opts.fmt || fmtUSD;
        let bars = '';
        days.forEach((day, i) => {
            const x = padL + (innerW / days.length) * i + 1.5;
            let y = padT + innerH;
            series.forEach((s, si) => {
                const v = s.values[i] || 0;
                if (v <= 0) return;
                const h = (v / max) * innerH;
                y -= h;
                bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0.5, h).toFixed(1)}" rx="1" fill="${PALETTE[si % PALETTE.length]}"><title>${esc(day)} — ${esc(s.name)}: ${fmt(v)}</title></rect>`;
            });
        });
        // x labels: ~6 evenly spaced
        let labels = '';
        const step = Math.max(1, Math.round(days.length / 6));
        days.forEach((day, i) => {
            if (i % step !== 0 && i !== days.length - 1) return;
            const x = padL + (innerW / days.length) * i + bw / 2;
            labels += `<text x="${x.toFixed(1)}" y="${H - 8}" font-size="9" text-anchor="middle" fill="currentColor" opacity="0.6">${esc(day.slice(5))}</text>`;
        });
        const gridLines = [0.25, 0.5, 0.75, 1].map(f => {
            const y = padT + innerH * (1 - f);
            return `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="currentColor" opacity="0.08"/>` +
                `<text x="${padL - 5}" y="${y + 3}" font-size="9" text-anchor="end" fill="currentColor" opacity="0.5">${fmt(max * f)}</text>`;
        }).join('');
        const legend = series.map((s, i) =>
            `<span><i style="background:${PALETTE[i % PALETTE.length]}"></i>${esc(s.name)}</span>`).join('');
        return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${gridLines}${bars}${labels}</svg><div class="legend">${legend}</div>`;
    }

    /** Donut chart. items: [{name, value}] */
    function donut(items, opts) {
        opts = opts || {};
        const fmt = opts.fmt || fmtUSD;
        const total = items.reduce((a, x) => a + x.value, 0);
        if (total <= 0) return '<p class="muted">No data yet.</p>';
        const R = 70, r = 42, CX = 90, CY = 90;
        let angle = -Math.PI / 2;
        let paths = '';
        items.forEach((item, i) => {
            const frac = item.value / total;
            if (frac <= 0) return;
            const a2 = angle + frac * Math.PI * 2;
            const large = frac > 0.5 ? 1 : 0;
            const x1 = CX + R * Math.cos(angle), y1 = CY + R * Math.sin(angle);
            const x2 = CX + R * Math.cos(a2), y2 = CY + R * Math.sin(a2);
            const xi2 = CX + r * Math.cos(a2), yi2 = CY + r * Math.sin(a2);
            const xi1 = CX + r * Math.cos(angle), yi1 = CY + r * Math.sin(angle);
            if (frac >= 0.999) {
                paths += `<circle cx="${CX}" cy="${CY}" r="${(R + r) / 2}" fill="none" stroke="${PALETTE[i % PALETTE.length]}" stroke-width="${R - r}"><title>${esc(item.name)}: ${fmt(item.value)} (100%)</title></circle>`;
            } else {
                paths += `<path d="M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${R} ${R} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} L ${xi2.toFixed(1)} ${yi2.toFixed(1)} A ${r} ${r} 0 ${large} 0 ${xi1.toFixed(1)} ${yi1.toFixed(1)} Z" fill="${PALETTE[i % PALETTE.length]}"><title>${esc(item.name)}: ${fmt(item.value)} (${Math.round(frac * 100)}%)</title></path>`;
            }
            angle = a2;
        });
        const legend = items.map((item, i) =>
            `<span><i style="background:${PALETTE[i % PALETTE.length]}"></i>${esc(item.name)} · ${fmt(item.value)}</span>`).join('');
        return `<div class="row" style="align-items:center"><svg viewBox="0 0 180 180" style="max-width:170px;flex:none">${paths}` +
            `<text x="${CX}" y="${CY + 4}" text-anchor="middle" font-size="13" font-weight="700" fill="currentColor">${fmt(total)}</text>` +
            `</svg><div class="legend" style="flex-direction:column;align-items:flex-start">${legend}</div></div>`;
    }

    /** Horizontal bars. items: [{name, value}], fmt optional */
    function hbars(items, opts) {
        opts = opts || {};
        const fmt = opts.fmt || fmtTok;
        const max = Math.max(1e-9, ...items.map(x => x.value));
        const rowH = 22, W = 520, labelW = 150, valueW = 62;
        const H = items.length * rowH + 4;
        let rows = '';
        items.forEach((item, i) => {
            const y = i * rowH + 3;
            const w = Math.max(1, (item.value / max) * (W - labelW - valueW - 12));
            const color = opts.color || PALETTE[i % PALETTE.length];
            rows += `<text x="${labelW - 8}" y="${y + 12}" font-size="11" text-anchor="end" fill="currentColor" opacity="0.8">${esc(item.name.length > 22 ? item.name.slice(0, 21) + '…' : item.name)}</text>` +
                `<rect x="${labelW}" y="${y}" width="${w.toFixed(1)}" height="15" rx="2" fill="${color}"><title>${esc(item.name)}: ${fmt(item.value)}</title></rect>` +
                `<text x="${labelW + w + 6}" y="${y + 12}" font-size="11" fill="currentColor" opacity="0.7">${fmt(item.value)}</text>`;
        });
        return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${rows}</svg>`;
    }

    /** Weekly heatmap from a 168-length array (dow*24+hour). */
    function heatmap(heat) {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const cell = 16, gap = 2, padL = 34, padT = 16;
        const W = padL + 24 * (cell + gap), H = padT + 7 * (cell + gap) + 4;
        const max = Math.max(1, ...heat);
        let cells = '';
        for (let d = 0; d < 7; d++) {
            cells += `<text x="${padL - 6}" y="${padT + d * (cell + gap) + 12}" font-size="9" text-anchor="end" fill="currentColor" opacity="0.6">${days[d]}</text>`;
            for (let h = 0; h < 24; h++) {
                const v = heat[d * 24 + h];
                const op = v === 0 ? 0.06 : 0.15 + 0.85 * (v / max);
                cells += `<rect x="${padL + h * (cell + gap)}" y="${padT + d * (cell + gap)}" width="${cell}" height="${cell}" rx="3" fill="var(--vscode-charts-green, #4caf50)" opacity="${op.toFixed(2)}"><title>${days[d]} ${String(h).padStart(2, '0')}:00 — ${v} msgs</title></rect>`;
            }
        }
        let hours = '';
        for (let h = 0; h < 24; h += 4) {
            hours += `<text x="${padL + h * (cell + gap)}" y="${padT - 5}" font-size="9" fill="currentColor" opacity="0.6">${String(h).padStart(2, '0')}</text>`;
        }
        return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${hours}${cells}</svg>`;
    }

    /** Tiny sparkline from an array of values. */
    function sparkline(values, width, height) {
        width = width || 120; height = height || 28;
        const max = Math.max(1e-9, ...values);
        const step = width / Math.max(1, values.length - 1);
        const pts = values.map((v, i) =>
            `${(i * step).toFixed(1)},${(height - 2 - (v / max) * (height - 6)).toFixed(1)}`).join(' ');
        return `<svg viewBox="0 0 ${width} ${height}" style="max-width:${width}px" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="var(--vscode-charts-blue, #3794ff)" stroke-width="1.5"/></svg>`;
    }

    // ---- AI speaker label (mirrors src/core/speaker.ts — keep in sync) ----
    // The label is derived from a message's model id (never a hardcoded engine
    // name) and composed via a user template in window.__AFUI__ (Farm Settings).
    const DEFAULT_SPEAKER = { template: '{ai}', casing: 'page', fallback: 'agent' };
    const SPEAKER_FAMILIES = ['opus', 'sonnet', 'haiku', 'flash', 'pro', 'gpt', 'codex'];

    function aiName(rawModel) {
        const m = String(rawModel == null ? '' : rawModel).toLowerCase();
        if (!m || m === '<synthetic>') { return ''; }
        if (m.indexOf('claude') === 0) { return 'claude'; }
        if (m.indexOf('gemini') === 0) { return 'gemini'; }
        if (m.indexOf('gpt') === 0 || m.indexOf('o1') === 0 || m.indexOf('o3') === 0 || m.indexOf('o4') === 0 || m.indexOf('codex') >= 0) { return 'codex'; }
        return '';
    }
    function speakerVersion(m) {
        const dotted = m.match(/\d+\.\d+/);
        if (dotted) { return dotted[0]; }
        const nums = [];
        m.split(/[^a-z0-9]+/i).forEach(function (tok) {
            if (!tok || /^\d{6,}$/.test(tok)) { return; }
            const lead = tok.match(/^(\d+)/);
            if (lead) { nums.push(lead[1]); }
        });
        return nums.slice(0, 2).join('.');
    }
    function parseModel(rawModel) {
        const m = String(rawModel == null ? '' : rawModel).toLowerCase().trim();
        if (!m || m === '<synthetic>') { return { ai: '', model: '', version: '', raw: '' }; }
        const ai = aiName(m);
        const raw = ai === 'claude' ? m.replace(/^claude-/, '') : m;
        let model = '';
        for (let i = 0; i < SPEAKER_FAMILIES.length; i++) { if (m.indexOf(SPEAKER_FAMILIES[i]) >= 0) { model = SPEAKER_FAMILIES[i]; break; } }
        if (!model && ai === 'codex') { const o = m.match(/\bo[1-9]\b/); if (o) { model = o[0]; } }
        return { ai: ai, model: model, version: speakerVersion(m), raw: raw };
    }
    function normalizeSpeaker(o) {
        o = (o && typeof o === 'object') ? o : {};
        const casing = ['page', 'upper', 'lower', 'asis'].indexOf(o.casing) >= 0 ? o.casing : 'page';
        const template = (typeof o.template === 'string' && o.template.trim()) ? o.template : DEFAULT_SPEAKER.template;
        const fallback = (typeof o.fallback === 'string' && o.fallback.trim()) ? o.fallback : DEFAULT_SPEAKER.fallback;
        return { template: template, casing: casing, fallback: fallback };
    }
    function renderSpeaker(rawModel, pageUpper, cfg) {
        cfg = normalizeSpeaker(cfg);
        const p = parseModel(rawModel);
        let out = cfg.template
            .replace(/\{ai\}/g, p.ai).replace(/\{model\}/g, p.model)
            .replace(/\{version\}/g, p.version).replace(/\{raw\}/g, p.raw)
            .replace(/\(\s*\)|\[\s*\]/g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/^[\s\-·,/|]+|[\s\-·,/|]+$/g, '')
            .trim();
        if (!out) { out = cfg.fallback; }
        if (cfg.casing === 'upper') { return out.toUpperCase(); }
        if (cfg.casing === 'lower') { return out.toLowerCase(); }
        if (cfg.casing === 'asis') { return out; }
        return pageUpper ? out.toUpperCase() : out.toLowerCase();
    }
    // What the pages call: reads the live user config from window.__AFUI__.
    function aiLabel(rawModel, pageUpper) {
        return renderSpeaker(rawModel, pageUpper, (window.__AFUI__ || {}).speaker);
    }

    window.AFCharts = { stackedBars, donut, hbars, heatmap, sparkline, esc, fmtUSD, fmtTok, fmtTokW, fmtTokWText, WEIGHTED_TIP, STEP_KIND, stepChip, stepKindLegend, fmtDur, fmtSteps, STEPS_TIP, aiName, parseModel, renderSpeaker, aiLabel, PALETTE };
})();
