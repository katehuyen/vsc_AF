// Agent Farm — Memory Graph page script: [[wikilink]] structure per agent.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    let DATA = window.__DATA__;
    let agentId = DATA.selectAgentId || (DATA.agents[0] && DATA.agents[0].id);

    window.addEventListener('message', ev => {
        if (ev.data.type === 'data') {
            DATA = ev.data.data;
            if (DATA.selectAgentId) { agentId = DATA.selectAgentId; }
            if (!DATA.agents.some(a => a.id === agentId)) {
                agentId = DATA.agents[0] && DATA.agents[0].id;
            }
            render();
        }
    });

    function relTime(ts) {
        const h = Math.round((Date.now() - ts) / 3600000);
        if (h < 1) return 'now';
        if (h < 24) return h + 'h ago';
        return Math.round(h / 24) + 'd ago';
    }

    function short(name) {
        const n = name.replace(/\.md$/i, '');
        return n.length > 18 ? n.slice(0, 17) + '…' : n;
    }

    function graphSvg(g) {
        const nodes = g.nodes;
        if (!nodes.length) { return '<p class="muted">No memory records (MEMORY.md index excluded).</p>'; }
        const W = 900, H = Math.max(360, Math.min(640, 120 + nodes.length * 26));
        const cx = W / 2, cy = H / 2;
        const rx = W / 2 - 130, ry = H / 2 - 40;
        // Ellipse layout, hubs first (they sort first) spread evenly.
        const pos = new Map();
        nodes.forEach((n, i) => {
            const a = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
            pos.set(n.name, { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
        });
        let edges = '';
        for (const l of g.links) {
            if (l.broken) { continue; }
            const p1 = pos.get(l.from), p2 = pos.get(l.to);
            if (!p1 || !p2) { continue; }
            // Slight curve toward center so opposing edges don't overlap.
            const mx = (p1.x + p2.x) / 2 + (cx - (p1.x + p2.x) / 2) * 0.25;
            const my = (p1.y + p2.y) / 2 + (cy - (p1.y + p2.y) / 2) * 0.25;
            edges += `<path d="M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}" ` +
                `fill="none" stroke="var(--vscode-charts-blue, #3794ff)" stroke-width="1.2" opacity="0.4">` +
                `<title>${C.esc(l.from)} → ${C.esc(l.to)}</title></path>`;
        }
        let dots = '';
        for (const n of nodes) {
            const p = pos.get(n.name);
            const r = Math.max(5, Math.min(14, 4 + Math.sqrt(n.tokens / 60)));
            const fill = n.recalls > 0 ? 'var(--vscode-charts-green, #4caf50)' : 'var(--vscode-descriptionForeground, #888)';
            const ring = !n.inIndex ? ` stroke="var(--vscode-charts-yellow, #cca700)" stroke-width="2.5" stroke-dasharray="3 2"` : ' stroke="var(--vscode-editor-background, #000)" stroke-width="1"';
            const tip = `${n.name}${n.type ? ' [' + n.type + ']' : ''}\n` +
                (n.description ? n.description + '\n' : '') +
                `~${n.tokens} tok · changed ${relTime(n.mtime)}\n` +
                `links: ${n.incoming} in / ${n.outgoing} out · recalls (30d): ${n.recalls}` +
                (n.inIndex ? '' : '\n⚠ not in MEMORY.md index');
            const anchor = p.x > cx + 5 ? 'start' : p.x < cx - 5 ? 'end' : 'middle';
            const lx = p.x + (anchor === 'start' ? r + 4 : anchor === 'end' ? -r - 4 : 0);
            const ly = anchor === 'middle' ? (p.y < cy ? p.y - r - 5 : p.y + r + 12) : p.y + 3;
            dots += `<g class="node" data-open="${C.esc(n.path)}" style="cursor:pointer">` +
                `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r.toFixed(1)}" fill="${fill}"${ring} opacity="0.9"><title>${C.esc(tip)}</title></circle>` +
                `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" font-size="10" text-anchor="${anchor}" fill="currentColor" opacity="0.85">${C.esc(short(n.name))}<title>${C.esc(tip)}</title></text></g>`;
        }
        return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${edges}${dots}</svg>`;
    }

    function render() {
        const entry = DATA.agents.find(a => a.id === agentId);
        const seg = DATA.agents.map(a =>
            `<button data-agent="${C.esc(a.id)}" class="${a.id === agentId ? 'sel' : ''}">${C.esc(a.name)}</button>`).join('');

        let body;
        if (!entry) {
            body = '<p class="muted">No agents with memory files.</p>';
        } else {
            const g = entry.graph;
            const linked = new Set();
            g.links.filter(l => !l.broken).forEach(l => { linked.add(l.from); linked.add(l.to); });
            const islands = g.nodes.filter(n => !linked.has(n.name));
            const brokenLinks = g.links.filter(l => l.broken);
            const hubs = g.nodes.filter(n => n.incoming > 0).sort((a, b) => b.incoming - a.incoming).slice(0, 5);
            const notIndexed = g.nodes.filter(n => !n.inIndex);

            const chips =
                `<span class="badge">${g.nodes.length} records</span>` +
                `<span class="badge" style="color:var(--vscode-charts-blue,#3794ff);border-color:var(--vscode-charts-blue,#3794ff)">${g.links.filter(l => !l.broken).length} links</span>` +
                (brokenLinks.length ? `<span class="badge err">${brokenLinks.length} broken</span>` : '') +
                (islands.length ? `<span class="badge warn">${islands.length} islands</span>` : '') +
                (notIndexed.length ? `<span class="badge warn">${notIndexed.length} not in index</span>` : '');

            const lists = `
                <div class="row">
                    ${brokenLinks.length ? `<div class="card"><h3>Broken links</h3><p class="muted small">The [[target]] resolves to no file — a typo, or a note not written yet.</p>${brokenLinks.map(l =>
                        `<div class="sub">• ${C.esc(l.from)} → <span style="color:var(--vscode-charts-red,#f14c4c)">[[${C.esc(l.to)}]]</span></div>`).join('')}</div>` : ''}
                    ${islands.length ? `<div class="card"><h3>Islands</h3><p class="muted small">Notes with no links in or out — weave them into the fabric or archive them.</p>${islands.map(n =>
                        `<div class="sub">• <button class="linkish" data-open="${C.esc(n.path)}">${C.esc(n.name)}</button>${n.recalls ? '' : ' <span class="muted">(not recalled 30d)</span>'}</div>`).join('')}</div>` : ''}
                    ${hubs.length ? `<div class="card"><h3>Hubs</h3><p class="muted small">The most linked-to notes — the centers of knowledge.</p>${hubs.map(n =>
                        `<div class="sub">• <button class="linkish" data-open="${C.esc(n.path)}">${C.esc(n.name)}</button> — ${n.incoming} in</div>`).join('')}</div>` : ''}
                    ${notIndexed.length ? `<div class="card"><h3>Not in MEMORY.md</h3><p class="muted small">Files with no line in the index — the agent cannot find them.</p>${notIndexed.map(n =>
                        `<div class="sub">• <button class="linkish" data-open="${C.esc(n.path)}">${C.esc(n.name)}</button></div>`).join('')}
                        <div class="btnrow" style="margin-top:8px"><button id="fixindex">Fix Memory Index…</button></div></div>` : ''}
                </div>`;

            body = `
                <div class="spread" style="margin-top:6px"><div>${chips}</div></div>
                <div class="card chartbox">${graphSvg(g)}
                    <div class="legend">
                        <span><i style="background:var(--vscode-charts-green,#4caf50);border-radius:50%"></i>recalled (30d)</span>
                        <span><i style="background:var(--vscode-descriptionForeground,#888);border-radius:50%"></i>not recalled</span>
                        <span><i style="border:2px dashed var(--vscode-charts-yellow,#cca700);border-radius:50%;background:none"></i>not in index</span>
                        <span><i style="background:var(--vscode-charts-blue,#3794ff);height:2px;margin-top:6px"></i>[[wikilink]]</span>
                        <span class="muted">node size = token weight · click = open file</span>
                    </div>
                </div>
                ${lists}`;
        }

        document.getElementById('app').innerHTML = `
            <style>
                .linkish { background:none;border:none;color:var(--vscode-textLink-foreground,#3794ff);cursor:pointer;padding:0;font:inherit }
                .linkish:hover { text-decoration:underline }
            </style>
            ${window.AFHeader.html({
                page: 'memgraph',
                title: 'Memory Graph',
                sub: '[[wikilink]] structure of each agent\'s memory — hubs, islands, broken targets · recall coloring from real transcripts (30d)',
                controls: `<span class="seg">${seg}</span>`,
                guide: 'hafiza-grafigi'
            })}
            ${body}
            <p class="footnote">Scanned on open/refresh (file contents are read fresh each time). MEMORY.md is the index, not a node.</p>
        `;

        window.AFHeader.wire(vscode);
        const fix = document.getElementById('fixindex');
        if (fix) { fix.addEventListener('click', () => vscode.postMessage({ type: 'fixIndex', agentId })); }
        document.querySelectorAll('[data-agent]').forEach(b =>
            b.addEventListener('click', () => { agentId = b.dataset.agent; render(); }));
        document.querySelectorAll('[data-open]').forEach(el =>
            el.addEventListener('click', () => {
                if (el.dataset.open) { vscode.postMessage({ type: 'open', path: el.dataset.open }); }
            }));
    }

    render();
})();
