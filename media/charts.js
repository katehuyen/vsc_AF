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

    window.AFCharts = { stackedBars, donut, hbars, heatmap, sparkline, esc, fmtUSD, fmtTok, PALETTE };
})();
