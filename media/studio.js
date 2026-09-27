// Agent Farm — Studio: the content pipeline on one page.
//
// The four things that used to be scattered (the scene manifest, the asset
// wall, the Premiere export, and the machinery that generates/ingests) are
// five tabs of one subject — a production — laid out as the work actually
// flows: plan → generate → triage → assign → approve → assemble.
(function () {
    'use strict';

    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    // The shell's own global (see htmlShell) — not AF_DATA, which nothing sets.
    let DATA = window.__DATA__ || { productions: [], items: [], untriaged: [], loose: [] };

    // Assets tab filters (the gallery's own semantics: production/scene are a
    // drill-down, source is a plain multi-pick).
    let fScene = '';
    let fSource = null;

    const TABS = [
        { id: 'pipeline', label: 'Pipeline', hint: 'the production, scene by scene' },
        { id: 'assets', label: 'Assets', hint: 'everything that was made or ingested' },
        { id: 'triage', label: 'Triage', hint: 'assets nobody has judged yet' },
        { id: 'assemble', label: 'Assemble', hint: 'the sequence Premiere would get' },
        { id: 'sources', label: 'Sources', hint: 'providers · watched folders · budget' }
    ];

    const STATUS_COLORS = {
        draft: 'var(--vscode-descriptionForeground, #999)',
        generating: 'var(--vscode-charts-blue, #3794ff)',
        review: 'var(--vscode-charts-yellow, #cca700)',
        approved: 'var(--vscode-charts-green, #4caf50)',
        unassigned: 'var(--vscode-descriptionForeground, #999)'
    };
    // What each scene is waiting for — the label is the button, so the row
    // always offers the one thing that moves it forward.
    const ACTION = {
        generate: { label: '＋ Generate', title: 'Nothing has been made for this scene yet — start a recipe workflow', msg: 'generate' },
        triage: { label: '👁 Triage', title: 'Assets here have never been kept or dropped', msg: 'tab', arg: 'triage' },
        review: { label: '✓ Set status', title: 'Judged assets are waiting for your verdict on the scene', msg: 'setSceneStatus' },
        approved: { label: '🎬 In sequence', title: 'Approved — this scene goes into the export', msg: 'tab', arg: 'assemble' }
    };

    const STYLE = `<style>
        .tabs { display:flex; gap:4px; margin:0 0 12px; border-bottom:1px solid var(--vscode-panel-border); flex-wrap:wrap; }
        .tab { padding:7px 15px; border:none; border-bottom:2px solid transparent; border-radius:6px 6px 0 0;
            background:transparent; color:var(--vscode-foreground); opacity:.7; cursor:pointer; font-size:12px; }
        .tab:hover { opacity:1; background:var(--vscode-list-hoverBackground); }
        .tab.on { opacity:1; border-bottom-color:var(--vscode-textLink-foreground); font-weight:600; }
        .tab .cnt { font-size:10px; margin-left:6px; padding:0 6px; border-radius:8px;
            background:var(--vscode-badge-background); color:var(--vscode-badge-foreground); }
        .scenerow { display:flex; gap:12px; align-items:center; padding:9px 10px; border-radius:8px;
            border:1px solid var(--vscode-widget-border,#4443); margin-bottom:7px; flex-wrap:wrap; }
        .scenerow .nm { flex:0 0 190px; font-weight:600; font-size:13px; }
        .scenerow .counts { flex:0 0 150px; font-size:11px; color:var(--vscode-descriptionForeground); }
        .strip { display:flex; gap:5px; flex:1 1 220px; min-width:120px; overflow:hidden; }
        .strip img, .strip video { height:44px; width:64px; object-fit:cover; border-radius:4px; cursor:pointer; }
        .strip .none { font-size:11px; color:var(--vscode-descriptionForeground); }
        .bar { height:7px; border-radius:4px; background:var(--vscode-widget-border,#4443); overflow:hidden; margin:6px 0 2px; }
        .bar > span { display:block; height:100%; background:var(--vscode-charts-green,#4caf50); }
        .tri { display:flex; gap:10px; align-items:flex-start; padding:9px; border-radius:8px;
            border:1px solid var(--vscode-widget-border,#4443); margin-bottom:8px; }
        .tri img, .tri video { width:150px; height:96px; object-fit:cover; border-radius:5px; cursor:pointer; }
        .seqrow { display:flex; gap:10px; align-items:center; padding:6px 9px; border-radius:7px;
            border:1px solid var(--vscode-widget-border,#4443); margin-bottom:5px; }
        .seqrow img, .seqrow video { width:96px; height:54px; object-fit:cover; border-radius:4px; }
        .srcrow { display:flex; gap:10px; align-items:center; padding:7px 10px; border-radius:7px;
            border:1px solid var(--vscode-widget-border,#4443); margin-bottom:6px; }
        .srcrow .lbl { flex:0 0 150px; font-weight:600; font-size:12px; }
        .dot { width:9px; height:9px; border-radius:50%; display:inline-block; flex:none; }
    </style>`;

    const cur = () => (DATA.productions || []).find(p => p.id === DATA.project);
    const post = (type, extra) => vscode.postMessage(Object.assign({ type }, extra || {}));
    const fmtTime = ts => window.AFTime.full(ts);

    function thumb(a) {
        if (!a.uri) { return ''; }
        if (a.kind === 'video') { return `<video src="${a.uri}" muted data-open="${C.esc(a.file)}"></video>`; }
        if (a.kind === 'image') { return `<img src="${a.uri}" data-open="${C.esc(a.file)}" title="${C.esc(a.title)}">`; }
        return '';
    }

    // ---------- 1. Pipeline ----------
    function pipelineHtml() {
        const p = cur();
        if (!p) {
            return `<div class="card"><h3>No production yet</h3>
                <p class="muted">A production is a small <code>production.json</code> in an agent's folder: a title and its scenes. It is what turns a pile of generated files into a piece of work with a state — and what the sequence export walks.</p>
                <button id="newprod">＋ New production</button></div>`;
        }
        const rows = p.scenes.map(s => {
            const act = ACTION[s.next];
            return `<div class="scenerow"
                ${window.AFCtx.row('afSceneRow', { sceneId: s.id, sceneNext: s.next, sceneStatus: s.status })}
                title="${C.esc(window.AFCtx.hint(s.title + ' — ' + s.status))}">
                <span class="nm">${C.esc(s.title)} <span class="muted small">${C.esc(s.id)}</span></span>
                <span class="badge click" style="color:${STATUS_COLORS[s.status]};border-color:${STATUS_COLORS[s.status]}"
                      data-status="${C.esc(s.id)}" title="click to change this scene's status">${s.status}</span>
                <span class="counts">${s.total ? `${s.counts.image} img · ${s.counts.video} vid · ${s.counts.audio} aud` : 'no assets'}${s.untriaged ? ` · <b>${s.untriaged} unjudged</b>` : ''}</span>
                <span class="strip">${s.thumbs.map(thumb).join('') || '<span class="none">—</span>'}</span>
                <button class="secondary" data-act="${C.esc(s.next)}" data-scene="${C.esc(s.id)}" title="${act.title}">${act.label}</button>
            </div>`;
        }).join('');
        const un = p.unassigned.length
            ? `<div class="scenerow" style="border-style:dashed">
                <span class="nm">Unassigned</span>
                <span class="badge">no scene</span>
                <span class="counts">${p.unassigned.length} asset(s)</span>
                <span class="strip">${p.unassigned.slice(0, 6).map(thumb).join('')}</span>
                <button class="secondary" data-tab="assets" title="Show them in Assets and give each a scene">Assign…</button>
            </div>` : '';
        return `<div class="spread">
                <h2 style="margin:0">${C.esc(p.title)} <span class="muted small">${C.esc(p.agentName)}</span></h2>
                <div>
                    <button class="secondary" id="editmanifest" title="Open production.json">Edit manifest</button>
                    <button class="secondary" id="newprod">＋ New production</button>
                </div>
            </div>
            <div class="bar"><span style="width:${p.progress.percent}%"></span></div>
            <p class="sub">${p.progress.approved}/${p.progress.total} scenes approved · ${C.esc(p.summary)} · ${C.fmtUSD(p.cost)} spent on this production</p>
            ${rows || '<div class="card muted">This manifest has no scenes yet — add them to production.json.</div>'}
            ${un}`;
    }

    // ---------- 2. Assets (the wall the Gallery used to be) ----------
    function assetCard(item) {
        let preview;
        if (item.kind === 'image' && item.assetUri) {
            preview = `<img src="${item.assetUri}" style="width:100%;max-height:220px;object-fit:cover;border-radius:6px;cursor:pointer" data-open="${C.esc(item.assetPath)}">`;
        } else if (item.kind === 'video' && item.assetUri) {
            preview = `<video src="${item.assetUri}" controls muted style="width:100%;max-height:220px;border-radius:6px"></video>`;
        } else if (item.kind === 'audio' && item.assetUri) {
            preview = `<audio src="${item.assetUri}" controls style="width:100%"></audio>`;
        } else {
            preview = `<div class="muted" style="padding:30px;text-align:center">no asset${item.assetPath ? '' : ' (pruned or failed)'}</div>`;
        }
        const external = item.source && item.source.indexOf('external') === 0;
        const bare = !item.taskId;
        const p = (DATA.productions || []).find(x => x.id === item.projectId);
        const sceneTag = item.projectId
            ? `<span class="badge" title="assigned scene">${C.esc(p ? p.title + (item.sceneId ? ' · ' + ((p.scenes.find(s => s.id === item.sceneId) || {}).title || item.sceneId) : '') : item.projectId)}</span>`
            : '';
        const srcTag = external ? `<span class="badge warn" title="registered from a watched/external folder">${C.esc(item.source)}</span>` : '';
        const pickTag = bare ? '' : item.selectedCount
            ? `<span class="badge" style="color:var(--vscode-charts-green,#4caf50);border-color:var(--vscode-charts-green,#4caf50)" title="kept in triage">✓ kept</span>`
            : item.rejectedCount
                ? '<span class="badge muted" title="dropped in triage">✗ dropped</span>'
                : '<span class="badge warn" title="nobody has judged this yet">unjudged</span>';
        return `<div class="card"
            ${window.AFCtx.row('afAssetCard', {
            asTask: item.taskId || '', asPath: item.assetPath || '',
            asExternal: !!external, asModel: item.model || '', asInput: item.input || ''
        })} title="${C.esc(window.AFCtx.hint(item.title))}">
            ${preview}
            <h3 style="margin:8px 0 2px">${C.esc(item.title)}</h3>
            <div class="sub">${item.model ? C.esc(item.model) + ' · ' : ''}${fmtTime(item.ts)}${item.estCost ? ' · ~' + C.fmtUSD(item.estCost) : ''} ${sceneTag}${srcTag}${pickTag}</div>
            ${window.AFStudioLib.strip(item.lib, (DATA.library || {}).base)}
            ${item.workflowTitle ? `<div class="sub muted">from: ${C.esc(item.workflowTitle)}</div>` : ''}
            ${item.input ? `<details style="margin-top:6px"><summary class="small">input</summary><pre>${C.esc(item.input)}</pre></details>` : ''}
            <div class="btnrow">
                ${item.assetPath ? `<button class="secondary" data-open="${C.esc(item.assetPath)}">Open file</button>` : ''}
                ${external || bare ? '' : `<button class="secondary" data-rerun="${C.esc(item.taskId)}">Re-run</button>
                <button class="secondary" data-vary="${C.esc(item.taskId)}">Vary…</button>
                <button class="secondary" data-feedback="${C.esc(item.taskId)}" title="Say what was wrong — the note is injected into the prompt and it is regenerated">Feedback…</button>`}
                ${bare ? '' : `<button class="secondary" data-assign="${C.esc(item.taskId)}">Scene…</button>`}
            </div>
        </div>`;
    }

    function assetsHtml() {
        const p = cur();
        const items = (DATA.items || []).filter(i =>
            (!DATA.project || !i.taskId || i.projectId === DATA.project) &&
            (!fScene || (fScene === '·' ? (i.projectId === DATA.project && !i.sceneId) : i.sceneId === fScene)) &&
            (!fSource || fSource.indexOf(i.source) >= 0));
        const sources = [...new Set((DATA.items || []).map(i => i.source))].sort();
        const sceneOpts = p
            ? `<option value="">all scenes</option><option value="·"${fScene === '·' ? ' selected' : ''}>unassigned</option>` +
              p.scenes.map(s => `<option value="${C.esc(s.id)}"${fScene === s.id ? ' selected' : ''}>${C.esc(s.title)}</option>`).join('')
            : '';
        return `${window.AFStudioLib.head(DATA.library)}<div class="chiprow">
                ${p ? `<select id="fscene" title="scene">${sceneOpts}</select>` : ''}
                ${sources.length > 1 ? window.AFFilter.multi({
                    id: 'studio-sources', label: 'Sources', options: sources, selected: fSource,
                    title: 'Which sources to show — tick any combination'
                }) : ''}
                <span class="muted small">${items.length}/${(DATA.items || []).length} shown</span>
            </div>
            ${items.length
                ? `<div class="grid">${items.map(assetCard).join('')}</div>`
                : (DATA.items || []).length
                    ? '<div class="card"><p class="muted">Nothing matches these filters.</p></div>'
                    : `<div class="card"><h3>No media yet</h3><p class="muted">Add a 🎬 Media step to a workflow (or run a recipe) — what it generates lands here with its prompt, model and cost. Files dropped into a watched folder are registered automatically (see <b>Sources</b>).</p></div>`}`;
    }

    // ---------- 3. Triage ----------
    function triageHtml() {
        const rows = DATA.untriaged || [];
        if (!rows.length) {
            return `<div class="card"><h3>Nothing waiting</h3><p class="muted">Every asset has been kept or dropped. New ones appear here the moment they are generated or ingested — this is the queue that decides what the sequence may use.</p></div>`;
        }
        return `<p class="sub">${rows.length} asset(s) nobody has judged. Keeping or dropping here writes the same decision a workflow's selection step writes — the sequence export never picks a dropped asset.</p>
            ${rows.map(a => `<div class="tri">
                ${a.uri ? (a.kind === 'video'
                    ? `<video src="${a.uri}" controls muted></video>`
                    : `<img src="${a.uri}" data-open="${C.esc(a.file)}">`)
                    : '<div class="muted" style="width:150px;text-align:center">no preview</div>'}
                <div style="flex:1;min-width:0">
                    <div><strong>${C.esc(a.title)}</strong></div>
                    <div class="sub">${fmtTime(a.ts)}${a.cost ? ' · ~' + C.fmtUSD(a.cost) : ''} · ${C.esc(a.source)}</div>
                    <div class="btnrow">
                        <button data-keep="${C.esc(a.taskId)}" title="Keep it — the sequence may use it">✓ Keep</button>
                        <button class="secondary" data-drop="${C.esc(a.taskId)}" title="Drop it — never picked for the sequence">✗ Drop</button>
                        <button class="secondary" data-assign="${C.esc(a.taskId)}">Scene…</button>
                        ${a.file ? `<button class="secondary" data-open="${C.esc(a.file)}">Open file</button>` : ''}
                    </div>
                </div>
            </div>`).join('')}`;
    }

    // ---------- 4. Assemble ----------
    function assembleHtml() {
        const p = cur();
        if (!p) { return '<div class="card muted">Pick a production first.</div>'; }
        const seq = DATA.sequence || [];
        return `<div class="spread">
                <h2 style="margin:0">Sequence — ${C.esc(p.title)}</h2>
                <button id="exportseq"${seq.length ? '' : ' disabled'} title="Write an FCP7 XML + EDL you can import in Premiere">Export XML + EDL →</button>
            </div>
            <p class="sub">One clip per scene, in manifest order: a kept video first, else any video, else an image. Scenes with nothing usable are skipped, and a dropped asset is never chosen — so what you see here is exactly what the export will contain.</p>
            ${seq.length
                ? seq.map((c, i) => `<div class="seqrow">
                    <span class="muted small" style="width:22px">${i + 1}</span>
                    ${c.uri ? (c.kind === 'video' ? `<video src="${c.uri}" muted></video>` : `<img src="${c.uri}">`) : ''}
                    <span style="flex:1;min-width:0"><strong>${C.esc(c.sceneTitle)}</strong><br><span class="muted small">${C.esc(c.name)}</span></span>
                    <button class="secondary" data-open="${C.esc(c.file)}">Open</button>
                </div>`).join('')
                : '<div class="card muted">No scene has a usable asset yet — generate or keep something first.</div>'}`;
    }

    // ---------- 5. Sources ----------
    function sourcesHtml() {
        const pr = DATA.providers || {};
        const cost = DATA.cost || {};
        const pct = cost.budgetMonth ? Math.round((cost.month / cost.budgetMonth) * 100) : 0;
        const dot = on => `<span class="dot" style="background:${on ? 'var(--vscode-charts-green,#4caf50)' : 'var(--vscode-descriptionForeground,#999)'}"></span>`;
        const folders = (DATA.ingestFolders || []);
        const provider = (name, setting) =>
            window.AFCtx.row('afProviderRow', { pvName: name, pvSetting: setting })
            + ` title="${C.esc(window.AFCtx.hint(name))}"`;
        return `${window.AFBrand ? window.AFBrand.studioSection(DATA, C) : ''}
            <h2>Who generates</h2>
            <div class="srcrow" ${provider('fal.ai', 'agentFarm.mediaAuthSecret')}>${dot(pr.fal)}<span class="lbl">fal.ai</span>
                <span class="muted small" style="flex:1">${pr.fal ? 'key present in the vault — media steps can run' : 'no key: add one to the secret vault (agentFarm.mediaAuthSecret names it)'}</span>
                <button class="secondary" data-settings="agentFarm.mediaAuthSecret">Setting</button></div>
            <div class="srcrow" ${provider('Replicate', 'agentFarm.replicateAuthSecret')}>${dot(pr.replicate)}<span class="lbl">Replicate</span>
                <span class="muted small" style="flex:1">${pr.replicate ? 'key present in the vault' : 'no key: models prefixed replicate: cannot run'}</span>
                <button class="secondary" data-settings="agentFarm.replicateAuthSecret">Setting</button></div>

            <h2>What is watched</h2>
            ${folders.length
                ? folders.map(f => `<div class="srcrow">${dot(f.exists)}<span class="lbl">${C.esc(f.agent || 'any agent')}</span>
                    <span class="muted small" style="flex:1">${C.esc(f.path)}${f.exists ? '' : ' — folder not found'}</span></div>`).join('')
                : '<div class="srcrow"><span class="muted small">No watched folders. Anything you drop into one is registered as an asset automatically — useful for footage you did not generate.</span><button class="secondary" data-settings="agentFarm.ingestFolders">Set up</button></div>'}
            <div class="btnrow"><button class="secondary" id="register">Register asset(s) by hand…</button></div>

            <h2>What it costs</h2>
            <div class="srcrow"><span class="lbl">Today</span><span style="flex:1">${C.fmtUSD(cost.today || 0)}</span></div>
            <div class="srcrow"><span class="lbl">Last 30 days</span>
                <span style="flex:1">${C.fmtUSD(cost.month || 0)}${cost.budgetMonth ? ` of ${C.fmtUSD(cost.budgetMonth)} budget` : ''}</span>
                ${cost.budgetMonth ? `<span class="badge${pct >= 100 ? ' err' : pct >= 75 ? ' warn' : ''}">${pct}%</span>` : ''}
                <button class="secondary" data-settings="agentFarm.mediaBudgetMonthUSD">Budget</button></div>
            <div class="srcrow"><span class="lbl">All time</span><span style="flex:1">${C.fmtUSD(cost.total || 0)}</span>
                <button class="secondary" data-settings="agentFarm.mediaPricing">Pricing rules</button></div>
            <p class="footnote">Media cost is estimated from your own <code>agentFarm.mediaPricing</code> rules against each model's response — it is not a bill from the provider.</p>`;
    }

    // -------------------------------------------------------------- THE CARDS
    /**
     * ‼️ THE STUDIO MAKES ITS OWN OBJECTS NOW — U-14, surface 6.
     *
     * Five acts on this page ended in a VS Code box: creating a production
     * (title, then scene titles as one comma-separated line), varying a
     * generation (a whole JSON input in a ONE-LINE box), regenerating with a
     * critique, assigning an asset to a scene (a quickpick with the production
     * tree flattened into indented labels), and exporting a sequence (which
     * production → fps → seconds, three in a row).
     *
     * The worst of them is the one nobody would guess: a media input is JSON
     * with a prompt paragraph inside it, and it was being edited in a single
     * line of an input box.
     */
    let card = null;
    let cardMsg = '';
    let cardMsgOk = false;

    function openCard(seed) {
        const s = seed || {};
        card = {
            kind: s.kind || 'production',
            // production
            agentId: s.agentId || ((DATA.agents || [])[0] || {}).id || '',
            title: s.title || '',
            scenes: s.scenes || '',
            // vary / feedback
            taskId: s.taskId || '', model: s.model || '',
            input: s.input || '', feedback: '',
            // assign
            target: s.target === undefined ? '' : s.target,
            // export
            projectId: s.projectId || DATA.project || '',
            fps: '30', clipSeconds: '5'
        };
        cardMsg = '';
        cardMsgOk = false;
        render();
        const box = document.getElementById('studiocard');
        if (box) { box.scrollIntoView(); }
    }

    /** Every production and scene as one flat picker — the same tree the
     *  quickpick flattened with indentation, but with the production's own name
     *  on every row so a scene called "Opening" is never ambiguous. */
    function sceneOptions() {
        const out = [{ id: '', label: '— detach it from every production —' }];
        for (const p of (DATA.productions || [])) {
            out.push({ id: p.id, label: p.title + ' — the production, no scene' });
            for (const s of (p.scenes || [])) {
                // ‼️ SCENE_TARGET_SEP in core/studio.ts — the panel splits on
                // exactly this, and a test pins the two spellings together.
                out.push({ id: p.id + '::' + s.id, label: '    ' + p.title + ' · ' + s.title + ' (' + s.status + ')' });
            }
        }
        return out;
    }

    function cardHtml() {
        const F = window.AFForm;
        const c = card;
        let title, lede, body, submit;
        if (c.kind === 'production') {
            title = 'New production';
            lede = 'A production is a production.json in an agent folder — a title and its scenes. Everything after this (statuses, assets, the export) hangs off those scenes, and you can still edit the file by hand.';
            body = F.grid([
                F.sel('agentId', 'In which agent folder', (DATA.agents || []).map(a => ({ id: a.id, label: a.name })), c.agentId, {
                    tip: 'production.json is written there. It is the folder the media runs will belong to.'
                }),
                F.text('title', 'Title', c.title, {
                    required: true, ph: 'e.g. Launch Film',
                    tip: 'What the production is called everywhere on this page.'
                }),
                F.area('scenes', 'Scenes — one per line', c.scenes, {
                    rows: 5, ph: 'Opening\nProduct intro\nClosing',
                    tip: 'ONE PER LINE, not comma separated: a scene title with a comma in it used to become two scenes silently. Order is the order they are exported in, and you can reorder them in the file later.'
                })
            ]);
            submit = 'Create the production';
        } else if (c.kind === 'vary' || c.kind === 'feedback') {
            const varying = c.kind === 'vary';
            title = varying ? 'Run it again, changed' : 'Run it again, with a critique';
            lede = varying
                ? 'The same model, with the input edited. This is the JSON the provider receives, so the prompt lives inside it — which is why it gets a real box rather than a line.'
                : 'The original input is kept and your critique is injected into its prompt, exactly the way the vision check\'s own retry does it.';
            body = F.grid([
                F.stat('Model', c.model || '(unknown)'),
                varying
                    ? F.area('input', 'Input', c.input, {
                        rows: 8, required: true, tip: 'The provider\'s JSON input. Edit the prompt inside it, or anything else.'
                    })
                    : F.area('feedback', 'What was wrong / what should change', c.feedback, {
                        rows: 4, required: true,
                        ph: 'e.g. hands look wrong; warmer light; closer camera',
                        tip: 'Added to the original prompt. The original input is not replaced.'
                    })
            ]);
            submit = varying ? 'Run the variation' : 'Run it with the critique';
        } else if (c.kind === 'assign') {
            title = 'Assign this asset';
            lede = 'Which production and which scene this asset belongs to. That link is what the Assemble tab and the sequence export read.';
            body = F.grid([
                F.stat('Asset', c.title || c.taskId),
                F.sel('target', 'Belongs to', sceneOptions(), c.target, {
                    wide: true,
                    tip: 'Every production and every one of its scenes. The first row detaches it from all of them.'
                })
            ]);
            submit = 'Save the assignment';
        } else {
            title = 'Export a sequence';
            lede = 'An FCP7 XML plus an EDL, built from the assets assigned to each scene, in scene order. The file chooser comes last — that one is the operating system\'s and stays.';
            body = F.grid([
                F.sel('projectId', 'Production', (DATA.productions || []).map(p => ({
                    id: p.id, label: p.title + ' — ' + (p.scenes || []).length + ' scene(s)'
                })), c.projectId, { wide: true, tip: 'Which production is exported.' }),
                F.sel('fps', 'Frame rate', ['30', '25', '24', '60'].map(f => ({ id: f, label: f + ' fps' })), c.fps, {
                    tip: 'The sequence frame rate written into the XML.'
                }),
                F.num('clipSeconds', 'Clip length (s)', c.clipSeconds, {
                    min: 1, tip: 'How long each scene\'s clip is placed for. The editor refines it afterwards; this only has to be sane.'
                })
            ]);
            submit = 'Choose where to save it';
        }
        return F.card({
            id: 'studiocard', title: title, lede: lede, body: body,
            msg: cardMsg, warn: !cardMsgOk, submit: submit
        });
    }

    function wireCard() {
        const F = window.AFForm;
        const box = document.getElementById('studiocard');
        if (!box || !card) { return; }
        F.wire(box, {
            onEdit: v => Object.assign(card, v),
            onRedraw: () => render(),
            onSubmit: () => { cardMsg = ''; post('studio-save', { form: card }); },
            onCancel: () => { card = null; cardMsg = ''; render(); }
        });
    }

    function render() {
        const p = cur();
        const body = DATA.tab === 'assets' ? assetsHtml()
            : DATA.tab === 'triage' ? triageHtml()
                : DATA.tab === 'assemble' ? assembleHtml()
                    : DATA.tab === 'sources' ? sourcesHtml()
                        : pipelineHtml();
        const counts = { triage: (DATA.untriaged || []).length, assets: (DATA.items || []).length };
        document.getElementById('app').innerHTML = `${STYLE}
            ${window.AFHeader.html({
                page: 'studio',
                title: '🎬 Studio',
                sub: p
                    ? `${C.esc(p.title)} · ${p.progress.approved}/${p.progress.total} scenes approved · ${C.fmtUSD((DATA.cost || {}).month || 0)} in 30 days`
                    : `${(DATA.items || []).length} asset(s) · ${C.fmtUSD((DATA.cost || {}).month || 0)} in 30 days`,
                controls: (DATA.productions || []).length > 1
                    ? `<select id="fproj" title="production">${DATA.productions.map(x =>
                        `<option value="${C.esc(x.id)}"${x.id === DATA.project ? ' selected' : ''}>${C.esc(x.title)}</option>`).join('')}</select>`
                    : '',
                guide: 'medya-uretim-hatti'
            })}
            <div class="tabs">${TABS.map(t =>
                `<button class="tab${DATA.tab === t.id ? ' on' : ''}" data-tab="${t.id}" title="${t.hint}">${t.label}${counts[t.id] ? `<span class="cnt">${counts[t.id]}</span>` : ''}</button>`).join('')}</div>
            ${card ? cardHtml() : (cardMsg ? window.AFForm.msg(cardMsg, !cardMsgOk) : '')}
            ${body}`;

        window.AFHeader.wire(vscode, { onRefresh: () => post('refresh') });
        const on = (sel, fn) => document.querySelectorAll(sel).forEach(fn);
        on('[data-tab]', el => el.addEventListener('click', () => post('tab', { tab: el.dataset.tab })));
        const proj = document.getElementById('fproj');
        if (proj) { proj.addEventListener('change', e => { fScene = ''; post('project', { project: e.target.value }); }); }
        const fs = document.getElementById('fscene');
        if (fs) { fs.addEventListener('change', e => { fScene = e.target.value; render(); }); }
        window.AFFilter.wireMulti({ id: 'studio-sources', onChange: sel => { fSource = sel; render(); } });
        window.AFStudioLib.wire(post);
        if (window.AFBrand && DATA.tab === 'sources') { window.AFBrand.wireStudio(DATA, post, render); }

        on('[data-open]', el => el.addEventListener('click', () => post('openAsset', { path: el.dataset.open })));
        on('[data-rerun]', el => el.addEventListener('click', () => post('rerun', { taskId: el.dataset.rerun })));
        on('[data-vary]', el => el.addEventListener('click', () => openAssetCard('vary', el.dataset.vary)));
        on('[data-feedback]', el => el.addEventListener('click', () => openAssetCard('feedback', el.dataset.feedback)));
        on('[data-assign]', el => el.addEventListener('click', () => openAssetCard('assign', el.dataset.assign)));
        on('[data-status]', el => el.addEventListener('click', () =>
            post('setSceneStatus', { projectId: DATA.project, sceneId: el.dataset.status })));
        on('[data-keep]', el => el.addEventListener('click', () => post('triageDecision', { taskId: el.dataset.keep, keep: true })));
        on('[data-drop]', el => el.addEventListener('click', () => post('triageDecision', { taskId: el.dataset.drop, keep: false })));
        on('[data-settings]', el => el.addEventListener('click', () => post('openSettings', { focus: el.dataset.settings })));
        // the per-scene next action
        on('[data-act]', el => el.addEventListener('click', () => {
            const a = ACTION[el.dataset.act];
            if (!a) { return; }
            if (a.msg === 'tab') { post('tab', { tab: a.arg }); return; }
            if (a.msg === 'setSceneStatus') {
                post('setSceneStatus', { projectId: DATA.project, sceneId: el.dataset.scene });
                return;
            }
            post(a.msg, { sceneId: el.dataset.scene });
        }));
        const byId = (id, fn) => { const el = document.getElementById(id); if (el) { el.addEventListener('click', fn); } };
        byId('newprod', () => openCard({ kind: 'production' }));
        byId('exportseq', () => openCard({ kind: 'export' }));
        wireCard();
        byId('register', () => post('registerAsset'));
        byId('editmanifest', () => { const x = cur(); if (x) { post('openFile', { path: x.file }); } });
    }

    /** The three acts that need an asset's own numbers to fill their card. */
    function openAssetCard(kind, taskId) {
        const it = (DATA.items || []).find(x => x.taskId === taskId);
        if (!it) { return; }
        openCard({
            kind: kind, taskId: taskId, model: it.model, input: it.input, title: it.title,
            target: it.projectId ? (it.sceneId ? it.projectId + ' ' + it.sceneId : it.projectId) : ''
        });
    }

    // ------------------------------------------------------- right-click menu

    /**
     * Everything a right-click on a scene, an asset or a provider can ask for.
     * Each branch posts what the row's own button posts; what the menu adds is
     * the acts that only ever appeared on ANOTHER tab (keep/drop live in
     * Triage, "show its assets" was a filter you had to set by hand) and the
     * scene status as a list rather than a dialog.
     */
    function ctxDo(act, ctx) {
        const verb = act.split(':')[0];
        const arg = act.slice(verb.length + 1);
        switch (verb) {
            // ---- a scene ----
            case 'scAssets':
                fScene = String(ctx.sceneId || '');
                post('tab', { tab: 'assets' });
                return;
            case 'scNext': {
                const a = ACTION[ctx.sceneNext];
                if (!a) { return; }
                if (a.msg === 'tab') { post('tab', { tab: a.arg }); return; }
                if (a.msg === 'setSceneStatus') {
                    post('setSceneStatus', { projectId: DATA.project, sceneId: String(ctx.sceneId || '') });
                    return;
                }
                post(a.msg, { sceneId: String(ctx.sceneId || '') });
                return;
            }
            case 'scStatus':
                post('setSceneStatus', {
                    projectId: DATA.project, sceneId: String(ctx.sceneId || ''), status: arg
                });
                return;
            case 'scCopy': window.AFCtx.copy(ctx.sceneId); return;

            // ---- an asset ----
            case 'asOpen': post('openAsset', { path: String(ctx.asPath || '') }); return;
            case 'asRerun': post('rerun', { taskId: String(ctx.asTask || '') }); return;
            case 'asVary': openAssetCard('vary', String(ctx.asTask || '')); return;
            case 'asFeedback': openAssetCard('feedback', String(ctx.asTask || '')); return;
            case 'asAssign': openAssetCard('assign', String(ctx.asTask || '')); return;
            case 'asTriage':
                post('triageDecision', { taskId: String(ctx.asTask || ''), keep: arg === '1' });
                return;
            case 'asCopy':
                window.AFCtx.copy(arg === 'input' ? ctx.asInput
                    : arg === 'model' ? ctx.asModel : ctx.asPath);
                return;

            // ---- who generates ----
            case 'pvSetting': post('openSettings', { focus: String(ctx.pvSetting || '') }); return;
            case 'pvVault': post('afnav', { to: 'secrets' }); return;
            case 'pvCopy': window.AFCtx.copy(ctx.pvName); return;
        }
    }

    // ‼️ ONCE, at module scope — render() rebuilds every card on every change.
    window.AFCtx.listen(ctxDo);

    // ‼️ M-33 — A HOST PUSH WAITS FOR THE READER'S HANDS; THE PAGE'S OWN
    // RENDERS DO NOT. render() replaces the whole of #app, so a repaint that
    // arrives while somebody is typing detaches the box they are typing in and
    // the caret falls to <body> — where space IS Page Down. Full text, and
    // what a page-specific busy() is for: media/afRepaint.js.
    const repaint = window.AFRepaint.guard(render);
    window.addEventListener('message', ev => {
        const m = ev.data;
        if (!m) { return; }
        if (m.type === 'data') { DATA = m.data; repaint(); return; }
        if (m.type === 'studio-compose') { openCard(m.seed || {}); return; }
        if (m.type === 'studio-msg') {
            cardMsg = String(m.text || '');
            cardMsgOk = m.ok === true;
            if (cardMsgOk) { card = null; }
            render();
        }
    });

    render();
})();
