// Agent Farm — Memory Graph page script: [[wikilink]] structure per agent.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    // X-456 — on a phone a file, a comparison and a merge draft would open in the PC's editor: not drawn there
    const ON_PHONE_HOST = !!(window.__AFUI__ && window.__AFUI__.remote === true);
    let DATA = window.__DATA__;
    let agentId = DATA.selectAgentId || (DATA.agents[0] && DATA.agents[0].id);

    // ‼️ M-33 — A HOST PUSH WAITS FOR THE READER'S HANDS; THE PAGE'S OWN
    // RENDERS DO NOT. render() replaces the whole of #app, so a repaint that
    // arrives while somebody is typing detaches the box they are typing in and
    // the caret falls to <body> — where space IS Page Down. Full text, and
    // what a page-specific busy() is for: media/afRepaint.js.
    const repaint = window.AFRepaint.guard(render);
    window.addEventListener('message', ev => {
        const m = ev.data;
        if (m.type === 'data') {
            DATA = m.data;
            if (m.data.selectAgentId) { agentId = m.data.selectAgentId; }
            if (!DATA.agents.some(a => a.id === agentId)) {
                agentId = DATA.agents[0] && DATA.agents[0].id;
            }
            repaint();
            return;
        }
        // ---- the memory surface's own messages (U-14, surface 3)
        if (m.type === 'mem-compose') { openCard(m.seed || {}); return; }
        if (m.type === 'mem-msg') {
            memMsg = String(m.text || '');
            memMsgOk = m.ok === true;
            busy = '';
            // A receipt means the write happened; the card that made it steps
            // aside. A refusal keeps it open with everything still typed in it.
            if (memMsgOk && card && (card.kind === 'new' || card.kind === 'copy')) { card = null; }
            render();
            return;
        }
        if (m.type === 'mem-asking') { busy = 'ask'; render(); return; }
        if (m.type === 'mem-distilling') { busy = 'distill:' + m.path; render(); return; }
        if (m.type === 'mem-hits') {
            busy = '';
            if (card && card.kind === 'ask') { card.hits = m.hits || []; card.asked = m.query; }
            render();
            return;
        }
    });

    // ------------------------------------------------------------- THE CARDS
    /**
     * ‼️ THE PAGE THAT DRAWS AN AGENT'S MEMORY CAN NOW CHANGE IT — U-14.
     *
     * Six commands lived in the palette as dialog chains over whatever page
     * happened to be on screen: `syncMemory` stacked five quickpicks (which
     * file → which action → left copy → right copy → confirm), `addMemory`
     * three boxes, `fixMemoryIndex` a multi-pick with the index it was
     * repairing nowhere in sight, `askMemory` a box whose ANSWER was a
     * quickpick of one-line labels, and `distillMemory` and `copyMemory` a
     * quickpick each.
     *
     * One card at a time, on the page, beside the graph they are about.
     */
    let card = null;      // { kind: 'new'|'copy'|'index'|'ask'|'sync'|'distill', … }
    let memMsg = '';
    let memMsgOk = false;
    let busy = '';        // '' | 'ask' | 'distill:<path>' — a round trip in flight

    function openCard(seed) {
        const s = seed || {};
        const kind = s.kind || 'new';
        if (s.agentId && DATA.agents.some(a => a.id === s.agentId)) { agentId = s.agentId; }
        card = {
            kind: kind,
            // new
            name: s.name || '', type: s.type || (DATA.memoryTypes || [])[0] || 'project',
            description: s.description || '',
            // copy
            path: s.path || '', fileName: s.fileName || '', target: '',
            // index — which lines stay ticked. Everything, until unticked.
            off: {},
            // ask
            query: s.query || '', hits: null, asked: '',
            // sync
            group: s.group || '', source: '', left: '', right: ''
        };
        memMsg = '';
        memMsgOk = false;
        render();
        const box = document.getElementById('memcard');
        if (box) { box.scrollIntoView(); }
    }

    function closeCard() { card = null; memMsg = ''; render(); }

    const entryFor = (id) => DATA.agents.find(a => a.id === id);

    function newCardHtml(F, a) {
        return F.card({
            id: 'memcard',
            title: 'New memory file',
            lede: 'One file, one fact. The description is not a caption — it IS the line that goes into MEMORY.md, and that index is all the agent reads before deciding whether this file is worth opening.',
            body: F.grid([
                F.sel('agentId', 'Agent', (DATA.allAgents || []).map(x => ({ id: x.id, label: x.name })),
                    card.agentId || (a && a.id) || '', { tip: 'Whose memory folder it lands in.' }),
                F.text('name', 'File name', card.name, {
                    required: true, ph: 'project-notescribe',
                    tip: 'Lowercase letters, digits, - and _ . The .md is added for you, and the same name becomes the index target.'
                }),
                F.sel('type', 'Type', (DATA.memoryTypes || []).map(t => ({ id: t, label: t })), card.type, {
                    tip: 'The frontmatter metadata.type. user = who they are · feedback = how to work · project = ongoing work · reference = a pointer to something external.'
                }),
                F.text('description', 'Description', card.description, {
                    wide: true, required: true,
                    ph: 'One line — what this file answers',
                    tip: 'Written into the frontmatter AND appended to MEMORY.md as the pointer line.'
                })
            ]),
            msg: memMsg, warn: !memMsgOk,
            submit: 'Create and index it'
        });
    }

    function copyCardHtml(F) {
        return F.card({
            id: 'memcard',
            title: 'Copy memory file',
            lede: 'It arrives indexed in the target\'s MEMORY.md — a copy that lands as an orphan is a copy the agent never reads.',
            body: F.grid([
                F.stat('Copying', card.fileName || card.path),
                F.sel('target', 'To', [{ id: '', label: '— pick an agent —' }]
                    .concat((DATA.allAgents || []).filter(x => x.id !== agentId).map(x => ({ id: x.id, label: x.name }))),
                    card.target, { tip: 'Which agent gets its own copy. Editing one afterwards leaves the other alone.' })
            ]),
            msg: memMsg, warn: !memMsgOk,
            submit: 'Copy it'
        });
    }

    /** The index repair plan, with the index it is repairing named above it. */
    function indexCardHtml(F, a) {
        const fixes = (a && a.fixes) || [];
        const body = !fixes.length
            ? F.msg('This agent\'s MEMORY.md is consistent — every file is pointed at, and every pointer resolves.')
            : F.list({
                numbered: false, acts: [],
                items: fixes.map((f, i) => ({
                    icon: f.kind === 'add' ? '＋' : '－',
                    hint: f.kind === 'add' ? 'a file with no pointer' : 'a pointer with no file',
                    title: f.target,
                    sub: f.line
                }))
            })
            + F.grid(fixes.map((f, i) => F.check('k' + i, (f.kind === 'add' ? 'index ' : 'drop ') + f.target,
                !card.off['k' + i], { tip: f.line })));
        return F.card({
            id: 'memcard',
            title: 'Repair MEMORY.md',
            lede: 'A file with no pointer is a file the agent will never open; a pointer with no file is a promise it cannot keep. Untick anything you want left alone — the index is backed up before it is written.',
            body: body,
            msg: memMsg, warn: !memMsgOk,
            submit: fixes.length ? 'Apply the ticked ones' : 'Nothing to apply'
        });
    }

    function askCardHtml(F) {
        const hits = card.hits;
        const results = hits === null ? ''
            : !hits.length
                ? F.msg('Nothing above the noise floor — the fleet does not know about that yet.')
                : F.sec('Answers', hits.length + ' record(s) for “' + card.asked + '” · the strongest first')
                + F.list({
                    numbered: false, acts: [],
                    items: hits.map(h => ({
                        icon: '📄',
                        title: h.agent + ' — ' + h.title,
                        sub: Math.round(h.score * 100) + '% · ' + String(h.text || '').slice(0, 220)
                    }))
                })
                + (ON_PHONE_HOST ? '' : '<div class="btnrow">' + hits.map((h, i) =>
                    `<button class="mini secondary" data-memopen="${C.esc(h.file)}">open ${C.esc(h.title)}</button>`).join('') + '</div>');
        return F.card({
            id: 'memcard',
            title: 'Ask the fleet',
            lede: 'A meaning search across every agent\'s memory, not a word search — ask it the way you would ask a person, in any language.',
            body: F.grid([
                F.text('query', '', card.query, {
                    wide: true, required: true,
                    ph: 'e.g. what is known about the user\'s sleep pattern',
                    tip: 'Embedded and compared against every memory file in the farm. The first query after a change also re-indexes what moved, so it can take a moment.'
                })
            ]) + results,
            msg: memMsg, warn: !memMsgOk,
            submit: busy === 'ask' ? 'Asking…' : 'Ask'
        });
    }

    function syncCardHtml(F) {
        const groups = DATA.duplicates || [];
        if (!groups.length) {
            return F.card({
                id: 'memcard', title: 'Shared memory',
                lede: '', body: F.msg('No memory file exists on two agents at once — there is nothing to keep in step.'),
                msg: memMsg, warn: !memMsgOk, submit: 'Close'
            });
        }
        const g = groups.find(x => x.name === card.group) || groups[0];
        card.group = g.name;
        const copyOpts = g.copies.map(c => ({
            id: c.path, label: c.agentName + ' — ' + relTime(c.mtime) + ' · ' + (c.size / 1024).toFixed(1) + ' KB'
        }));
        const body =
            F.grid([
                F.sel('group', 'File', groups.map(x => ({
                    id: x.name,
                    label: (x.identical ? '✓ ' : '⚠ ') + x.name + ' — ' + x.copies.length + ' copies'
                        + (x.identical ? ', identical' : ', DIVERGED')
                })), g.name, { wide: true, redraw: true, tip: 'Every memory file that exists on more than one agent.' })
            ])
            + F.list({
                numbered: false, acts: [],
                items: g.copies.map((c, i) => ({
                    icon: i === 0 ? '🕐' : '·',
                    hint: i === 0 ? 'the most recently changed copy' : '',
                    title: c.agentName,
                    sub: relTime(c.mtime) + ' · ' + (c.size / 1024).toFixed(1) + ' KB · ' + c.path
                }))
            })
            + (ON_PHONE_HOST ? '' : F.sec('Compare two', 'Opens the real diff editor — better than anything this page could draw.')
            + F.grid([
                F.sel('left', 'Left', copyOpts, card.left || g.copies[0].path, {}),
                F.sel('right', 'Right', copyOpts, card.right || (g.copies[1] && g.copies[1].path) || '', {})
            ])
            + '<div class="btnrow"><button class="secondary" data-memact="diff">Compare them</button>'
            + '<button class="secondary" data-memact="merge">Make a merge draft</button></div>')
            + F.sec('Or make one of them the truth',
                'Every other copy is overwritten, each with a timestamped .afbak backup beside it.')
            + F.grid([
                F.sel('source', 'Source of truth', [{ id: '', label: '— pick a copy —' }].concat(copyOpts),
                    card.source, { wide: true })
            ]);
        return F.card({
            id: 'memcard',
            title: 'Shared memory across agents',
            lede: 'The same file name on two agents is two files. This says which ones have drifted apart and lets you decide what to do about it.',
            body: body,
            msg: memMsg, warn: !memMsgOk,
            submit: 'Sync from the source'
        });
    }

    function distillCardHtml(F, a) {
        const files = ((a && a.files) || []).slice()
            .sort((x, y) => (y.stale ? 1 : 0) - (x.stale ? 1 : 0) || y.tokens - x.tokens);
        return F.card({
            id: 'memcard',
            title: 'Distil a memory file',
            lede: 'A cheap model rewrites the file shorter, and you get a diff before anything is touched. Big and stale come first — they are what a fixed context load is actually made of.',
            body: !files.length
                ? F.msg('This agent has no memory files to distil.')
                : F.list({
                    numbered: false, acts: [],
                    items: files.map(f => ({
                        icon: f.stale ? '🥀' : '📄',
                        hint: f.stale ? 'not touched for a long time' : '',
                        title: f.name,
                        sub: '~' + f.tokens + ' tok · last changed ' + f.staleDays + 'd ago'
                    }))
                })
                + '<div class="btnrow">' + files.map(f =>
                    `<button class="mini secondary" data-memdistill="${C.esc(f.path)}"${busy === 'distill:' + f.path ? ' disabled' : ''}>${busy === 'distill:' + f.path ? 'working…' : 'distil'} ${C.esc(f.name)}</button>`).join('') + '</div>',
            msg: memMsg, warn: !memMsgOk,
            submit: 'Close'
        });
    }

    function cardHtml() {
        const F = window.AFForm;
        const a = entryFor(agentId);
        if (card.kind === 'copy') { return copyCardHtml(F); }
        if (card.kind === 'index') { return indexCardHtml(F, a); }
        if (card.kind === 'ask') { return askCardHtml(F); }
        if (card.kind === 'sync') { return syncCardHtml(F); }
        if (card.kind === 'distill') { return distillCardHtml(F, a); }
        return newCardHtml(F, a);
    }

    function submitCard() {
        const a = entryFor(agentId);
        if (card.kind === 'new') {
            memMsg = '';
            vscode.postMessage({
                type: 'mem-save',
                mem: { mode: 'new', agentId: card.agentId || agentId, name: card.name, type: card.type, description: card.description }
            });
            return;
        }
        if (card.kind === 'copy') {
            memMsg = '';
            // `agentId` is the agent the file is copied FROM — implied by the
            // selection until the host started checking that the path really
            // sits in that agent's memory/ folder (B-6), and stated now.
            vscode.postMessage({
                type: 'mem-save',
                mem: { mode: 'copy', agentId: agentId, path: card.path, target: card.target }
            });
            return;
        }
        if (card.kind === 'index') {
            const fixes = (a && a.fixes) || [];
            const lines = fixes.filter((f, i) => !card.off['k' + i]).map(f => f.line);
            if (!lines.length) { memMsg = 'Nothing is ticked.'; memMsgOk = false; render(); return; }
            memMsg = '';
            vscode.postMessage({ type: 'mem-fix', agentId: agentId, lines: lines });
            return;
        }
        if (card.kind === 'ask') {
            memMsg = '';
            vscode.postMessage({ type: 'mem-ask', query: card.query });
            return;
        }
        if (card.kind === 'sync') {
            memMsg = '';
            vscode.postMessage({ type: 'mem-sync', act: 'sync', name: card.group, source: card.source });
            return;
        }
        closeCard();
    }

    function wireCard() {
        const F = window.AFForm;
        const box = document.getElementById('memcard');
        if (!box || !card) { return; }
        F.wire(box, {
            onEdit: v => {
                // The index card's ticks are `k<i>` booleans; everything else
                // is a field of the draft.
                Object.keys(v).forEach(k => {
                    if (/^k\d+$/.test(k)) { card.off[k] = !v[k]; } else { card[k] = v[k]; }
                });
            },
            onRedraw: () => render(),
            onSubmit: submitCard,
            onCancel: closeCard
        });
        box.querySelectorAll('[data-memact]').forEach(b =>
            b.addEventListener('click', () => {
                memMsg = '';
                vscode.postMessage({
                    type: 'mem-sync', act: b.dataset.memact, name: card.group,
                    left: card.left, right: card.right
                });
            }));
        box.querySelectorAll('[data-memdistill]').forEach(b =>
            b.addEventListener('click', () => {
                memMsg = '';
                vscode.postMessage({ type: 'mem-distill', agentId: agentId, path: b.dataset.memdistill });
            }));
        box.querySelectorAll('[data-memopen]').forEach(b =>
            b.addEventListener('click', () => vscode.postMessage({ type: 'open', path: b.dataset.memopen })));
    }

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
            const ring = !n.inIndex ? ` stroke="var(--vscode-charts-yellow, #cca700)" stroke-width="2.5" stroke-dasharray="3 2"` : ' stroke="var(--af-ground,var(--vscode-editor-background, #000))" stroke-width="1"';
            const tip = `${n.name}${n.type ? ' [' + n.type + ']' : ''}\n` +
                (n.description ? n.description + '\n' : '') +
                `~${n.tokens} tok · changed ${relTime(n.mtime)}\n` +
                `links: ${n.incoming} in / ${n.outgoing} out · recalls (30d): ${n.recalls}` +
                (n.inIndex ? '' : '\n⚠ not in MEMORY.md index');
            const anchor = p.x > cx + 5 ? 'start' : p.x < cx - 5 ? 'end' : 'middle';
            const lx = p.x + (anchor === 'start' ? r + 4 : anchor === 'end' ? -r - 4 : 0);
            const ly = anchor === 'middle' ? (p.y < cy ? p.y - r - 5 : p.y + r + 12) : p.y + 3;
            // A node IS a memory file, so it carries the memory row's menu —
            // the same one the agent page's memory table draws.
            dots += `<g class="node"${ON_PHONE_HOST ? '' : ` data-open="${C.esc(n.path)}" style="cursor:pointer"`} ` +
                window.AFCtx.row('afMemoryRow', { memPath: n.path, memName: n.name, agentId: agentId }) + '>' +
                `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r.toFixed(1)}" fill="${fill}"${ring} opacity="0.9"><title>${C.esc(tip)}</title></circle>` +
                `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" font-size="10" text-anchor="${anchor}" fill="currentColor" style="opacity:calc(1 - .15 * var(--af-dimk, 1))">${C.esc(short(n.name))}<title>${C.esc(tip)}</title></text></g>`;
        }
        return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${edges}${dots}</svg>`;
    }

    /**
     * Everything this page can now DO, in one band above the graph.
     *
     * Each button opens a card; none of them opens a dialog. The counts are on
     * the buttons because "is there anything to repair here?" is a question the
     * old command could only answer by being run.
     */
    function toolbar(entry) {
        const fixes = (entry && entry.fixes) || [];
        const dups = (DATA.duplicates || []).length;
        const diverged = (DATA.duplicates || []).filter(g => !g.identical).length;
        const on = k => card && card.kind === k ? ' disabled' : '';
        return `<div class="btnrow">
            <button class="secondary" data-memcard="new"${on('new')}
                title="Make a memory file here — it is created with its frontmatter and indexed in MEMORY.md in one go, so it is never born an orphan">+ New memory</button>
            <button class="secondary" data-memcard="index"${on('index')}
                title="${fixes.length ? C.esc(fixes.length + ' problem(s): a file with no pointer, or a pointer with no file') : 'The index and the folder agree'}">Repair index${fixes.length ? ` (${fixes.length})` : ''}</button>
            <button class="secondary" data-memcard="sync"${on('sync')}
                title="${dups ? C.esc(dups + ' file name(s) exist on more than one agent' + (diverged ? '; ' + diverged + ' of them have drifted apart' : ', all identical')) : 'No memory file exists on two agents at once'}">Shared${dups ? ` (${dups}${diverged ? '⚠' : ''})` : ''}</button>
            ${DATA.canDistill ? `<button class="secondary" data-memcard="distill"${on('distill')}
                title="A cheap model rewrites a file shorter and shows you the diff before anything is touched">Distil…</button>` : ''}
            <button class="secondary" data-memcard="ask"${on('ask')}${DATA.embeddingsOn ? '' : ' disabled'}
                title="${DATA.embeddingsOn
                ? 'A meaning search across every agent&#39;s memory — ask it the way you would ask a person'
                : 'Needs an embeddings provider — set agentFarm.embeddingsProvider (gemini, or a local OpenAI-compatible endpoint)'}">Ask the fleet</button>
        </div>`;
    }

    /** A memory file's name: a link to the PC's editor, plain text on a phone. */
    function fileName(n) {
        return ON_PHONE_HOST ? C.esc(n.name)
            : '<button class="linkish" data-open="' + C.esc(n.path) + '">' + C.esc(n.name) + '</button>';
    }

    function render() {
        const entry = DATA.agents.find(a => a.id === agentId);
        const seg = DATA.agents.map(a =>
            `<button data-agent="${C.esc(a.id)}" class="${a.id === agentId ? 'sel' : ''}"
                ${window.AFCtx.agent(a)} title="${C.esc(window.AFCtx.AGENT_HINT)}">${C.esc(a.name)}</button>`).join('');

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
                `<span class="badge" style="color:var(--af-ink-charts-blue, var(--vscode-charts-blue,#3794ff));border-color:var(--vscode-charts-blue,#3794ff)">${g.links.filter(l => !l.broken).length} links</span>` +
                (brokenLinks.length ? `<span class="badge err">${brokenLinks.length} broken</span>` : '') +
                (islands.length ? `<span class="badge warn">${islands.length} islands</span>` : '') +
                (notIndexed.length ? `<span class="badge warn">${notIndexed.length} not in index</span>` : '');

            const lists = `
                <div class="row">
                    ${brokenLinks.length ? `<div class="card"><h3>Broken links</h3><p class="muted small">The [[target]] resolves to no file — a typo, or a note not written yet.</p>${brokenLinks.map(l =>
                        `<div class="sub">• ${C.esc(l.from)} → <span style="color:var(--af-ink-charts-red, var(--vscode-charts-red,#f14c4c))">[[${C.esc(l.to)}]]</span></div>`).join('')}</div>` : ''}
                    ${islands.length ? `<div class="card"><h3>Islands</h3><p class="muted small">Notes with no links in or out — weave them into the fabric or archive them.</p>${islands.map(n =>
                        `<div class="sub">• ${fileName(n)}${n.recalls ? '' : ' <span class="muted">(not recalled 30d)</span>'}</div>`).join('')}</div>` : ''}
                    ${hubs.length ? `<div class="card"><h3>Hubs</h3><p class="muted small">The most linked-to notes — the centers of knowledge.</p>${hubs.map(n =>
                        `<div class="sub">• ${fileName(n)} — ${n.incoming} in</div>`).join('')}</div>` : ''}
                    ${notIndexed.length ? `<div class="card"><h3>Not in MEMORY.md</h3><p class="muted small">Files with no line in the index — the agent cannot find them.</p>${notIndexed.map(n =>
                        `<div class="sub">• ${fileName(n)}</div>`).join('')}
                        <div class="btnrow" style="margin-top:8px"><button id="fixindex">Repair MEMORY.md…</button></div></div>` : ''}
                </div>`;

            body = `
                <div class="spread" style="margin-top:6px"><div>${chips}</div>${toolbar(entry)}</div>
                ${card ? cardHtml() : (memMsg ? window.AFForm.msg(memMsg, !memMsgOk) : '')}
                <div class="card chartbox">${graphSvg(g)}
                    <div class="legend">
                        <span><i style="background:var(--vscode-charts-green,#4caf50);border-radius:50%"></i>recalled (30d)</span>
                        <span><i style="background:var(--vscode-descriptionForeground,#888);border-radius:50%"></i>not recalled</span>
                        <span><i style="border:2px dashed var(--vscode-charts-yellow,#cca700);border-radius:50%;background:none"></i>not in index</span>
                        <span><i style="background:var(--vscode-charts-blue,#3794ff);height:2px;margin-top:6px"></i>[[wikilink]]</span>
                        <span class="muted">node size = token weight<span class="pcclick"> · click = open file</span></span>
                    </div>
                </div>
                ${lists}`;
        }

        document.getElementById('app').innerHTML = `
            <style>
                .linkish { background:none;border:none;color:var(--vscode-textLink-foreground,#3794ff);cursor:pointer;padding:0;font:inherit }
                .linkish:hover { text-decoration:underline }
                html.af-phone .chartbox { overflow-x:auto }
                html.af-phone .chartbox svg { min-width:900px }
            </style>${ON_PHONE_HOST ? '<style>.pcclick { display:none }</style>' : ''}
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
        if (fix) { fix.addEventListener('click', () => openCard({ kind: 'index' })); }
        document.querySelectorAll('[data-memcard]').forEach(b =>
            b.addEventListener('click', () => openCard({ kind: b.dataset.memcard })));
        document.querySelectorAll('[data-agent]').forEach(b =>
            b.addEventListener('click', () => { agentId = b.dataset.agent; card = null; render(); }));
        document.querySelectorAll('[data-open]').forEach(el =>
            el.addEventListener('click', () => {
                if (el.dataset.open) { vscode.postMessage({ type: 'open', path: el.dataset.open }); }
            }));
        wireCard();
        centreGraph();
    }

    /** On a phone the graph keeps its size and scrolls sideways: it opens on its middle, where the hubs start. */
    function centreGraph() {
        const root = document.documentElement;
        const box = root && root.classList && root.classList.contains('af-phone') ? document.querySelector('.chartbox') : null;
        if (box) { box.scrollLeft = (box.scrollWidth - box.clientWidth) / 2; }
    }

    // ------------------------------------------------------- right-click menu

    /** A node is a memory file. The agent picker's buttons are agent rows and
     *  answer to host commands — nothing about them is here. */
    function ctxDo(act, ctx) {
        if (act === 'memOpen') {
            if (ctx.memPath) { vscode.postMessage({ type: 'open', path: String(ctx.memPath) }); }
            return;
        }
        // Already the memory graph — the item scopes it to the row's agent.
        if (act === 'memGraph') {
            if (ctx.agentId) { agentId = String(ctx.agentId); card = null; render(); }
            return;
        }
        if (act === 'memCopy') { window.AFCtx.copy(ctx.memPath); return; }
        // The two acts a memory row could not offer until the page had a form.
        if (act === 'memCopyTo') {
            if (ctx.agentId) { agentId = String(ctx.agentId); }
            openCard({ kind: 'copy', path: String(ctx.memPath || ''), fileName: String(ctx.memName || '') });
            return;
        }
        if (act === 'memDistil') {
            if (ctx.agentId) { agentId = String(ctx.agentId); }
            openCard({ kind: 'distill' });
        }
    }

    // ‼️ ONCE, at module scope — render() redraws the whole graph.
    window.AFCtx.listen(ctxDo);

    render();
    // afMobile.js marks a phone on DOMContentLoaded, after this first draw (its listener runs first)
    if (document.readyState === 'loading' && typeof document.addEventListener === 'function') {
        document.addEventListener('DOMContentLoaded', centreGraph);
    }
})();
