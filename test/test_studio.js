// E2/4.3 — Studio: the content pipeline as one subject (compiled core/studio.js).
//
// Four modules worked and nothing connected them, so the thing the user
// actually works — plan → generate → triage → assign → approve → assemble —
// existed nowhere. The model's whole job is to answer, per scene, "what is the
// next thing to do here", and to answer it from evidence rather than a guess.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const {
    buildStudio, nextSceneAction, sceneProgress, studioCost, toAsset, pipelineSummary
} = require(path.join(__dirname, '..', 'out', 'core', 'studio.js'));

const NOW = Date.parse('2026-07-28T12:00:00Z');
const DAY = 24 * 3600 * 1000;
const meta = (o) => Object.assign({
    taskId: 't' + Math.random().toString(36).slice(2, 7), title: 'shot', model: 'fal-ai/x',
    input: '{}', assetFiles: ['D:/out/a.png'], estCost: 0.01, ts: NOW - 3600_000
}, o);
const production = (scenes) => ({
    id: 'film', title: 'The Film',
    scenes: scenes.map((s, i) => ({ id: 's' + (i + 1), title: 'Scene ' + (i + 1), status: s }))
});

// ---------- what is a scene waiting for? ----------
{
    ok('a scene with nothing made needs generating', nextSceneAction('draft', 0, 0) === 'generate');
    ok('…even if its status says otherwise', nextSceneAction('approved', 0, 0) === 'generate');
    ok('unjudged assets outrank every other question', nextSceneAction('review', 5, 2) === 'triage');
    ok('…including approval', nextSceneAction('approved', 5, 1) === 'triage');
    ok('judged assets in a non-approved scene need a verdict', nextSceneAction('review', 3, 0) === 'review');
    ok('an approved scene with judged assets is done', nextSceneAction('approved', 3, 0) === 'approved');
}

// ---------- progress ----------
{
    const p = sceneProgress([{ status: 'draft' }, { status: 'approved' }, { status: 'approved' }, { status: 'review' }]);
    ok('statuses are counted', p.draft === 1 && p.approved === 2 && p.review === 1);
    ok('percent is approved over total', p.percent === 50);
    ok('an empty manifest is 0%, not NaN', sceneProgress([]).percent === 0);
}

// ---------- an asset row, and what "judged" means ----------
{
    const fresh = toAsset(meta({}));
    ok('a brand new asset is untriaged', fresh.untriaged && !fresh.kept && !fresh.dropped);
    const kept = toAsset(meta({ selectedUrls: ['u1'] }));
    ok('a kept asset is judged', kept.kept && !kept.untriaged);
    const dropped = toAsset(meta({ rejectedUrls: ['u1'] }));
    ok('a dropped asset is judged too', dropped.dropped && !dropped.untriaged);
    ok('the kind comes from the file', toAsset(meta({ assetFiles: ['D:/o/x.mp4'] })).kind === 'video');
    ok('a meta with no file still yields a row', !!toAsset(meta({ assetFiles: [] })).taskId);
    ok('the source defaults to fal but is kept when set',
        toAsset(meta({})).source === 'fal' && toAsset(meta({ source: 'external:drop' })).source === 'external:drop');
}

// ---------- the whole pipeline ----------
{
    const prod = production(['draft', 'review', 'approved']);
    const metas = [
        // scene 1: nothing
        // scene 2: two assets, one unjudged
        meta({ taskId: 'a1', projectId: 'film', sceneId: 's2', selectedUrls: ['u'], assetFiles: ['D:/o/1.mp4'] }),
        meta({ taskId: 'a2', projectId: 'film', sceneId: 's2' }),
        // scene 3: judged
        meta({ taskId: 'a3', projectId: 'film', sceneId: 's3', selectedUrls: ['u'] }),
        // in the production but in no scene
        meta({ taskId: 'a4', projectId: 'film' }),
        // in a scene that no longer exists in the manifest
        meta({ taskId: 'a5', projectId: 'film', sceneId: 'sX' }),
        // nothing to do with any production
        meta({ taskId: 'a6' })
    ];
    const st = buildStudio({
        productions: [{ agentName: 'dev', file: 'D:/a/dev/production.json', production: prod }],
        metas, now: NOW, budgetMonth: 10
    });
    const p = st.productions[0];
    const byId = Object.fromEntries(p.scenes.map(s => [s.id, s]));

    ok('an empty scene asks to be generated', byId.s1.next === 'generate' && byId.s1.total === 0);
    ok('a scene with an unjudged asset asks for triage', byId.s2.next === 'triage' && byId.s2.untriaged === 1);
    ok('…and counts its assets by kind', byId.s2.counts.video === 1 && byId.s2.counts.image === 1);
    ok('an approved, judged scene is done', byId.s3.next === 'approved');
    ok('assets with no scene land in "unassigned"', p.unassigned.length === 2);
    ok('…including one pointing at a scene the manifest no longer has',
        p.unassigned.some(a => a.taskId === 'a5'));
    ok('an asset of no production is loose, not silently lost',
        st.loose.length === 1 && st.loose[0].taskId === 'a6');
    ok('the triage queue spans everything, production or not',
        st.untriaged.map(a => a.taskId).sort().join(',') === 'a2,a4,a5,a6');
    ok('progress comes from the manifest', p.progress.total === 3 && p.progress.approved === 1);
    ok('the production carries its own spend', p.cost === 0.05);
    ok('thumbs are newest first and capped', byId.s2.thumbs.length === 2);

    ok('the summary says what is actually left',
        /1 scene\(s\) with nothing made yet/.test(pipelineSummary(p))
        && /nobody has judged/.test(pipelineSummary(p))
        && /in no scene/.test(pipelineSummary(p)));
    const done = buildStudio({
        productions: [{
            agentName: 'dev', file: 'f',
            production: production(['approved'])
        }],
        metas: [meta({ projectId: 'film', sceneId: 's1', selectedUrls: ['u'] })],
        now: NOW
    }).productions[0];
    ok('…and says so plainly when nothing is', pipelineSummary(done) === 'every scene is approved');
}

// ---------- money ----------
{
    const c = studioCost([
        meta({ estCost: 1, ts: NOW }),                 // today
        meta({ estCost: 2, ts: NOW - 3 * DAY }),       // this month
        meta({ estCost: 4, ts: NOW - 60 * DAY })       // older
    ], NOW, 10);
    ok('today counts only today', c.today === 1);
    ok('the month window is 30 days', c.month === 3);
    ok('all time is all of it', c.total === 7);
    ok('the budget travels with the figures', c.budgetMonth === 10);
    ok('no media is $0, not NaN', studioCost([], NOW).total === 0);
}

// ---------- the page is the four modules in one place ----------
{
    const js = fs.readFileSync(path.join(__dirname, '..', 'media', 'studio.js'), 'utf8');
    for (const tab of ['pipeline', 'assets', 'triage', 'assemble', 'sources']) {
        ok(`the ${tab} tab exists`, new RegExp(`id: '${tab}'`).test(js));
    }
    ok('the asset wall kept its actions (re-run · vary · feedback · scene)',
        /data-rerun/.test(js) && /data-vary/.test(js) && /data-feedback/.test(js) && /data-assign/.test(js));
    ok('triage can keep and drop', /data-keep/.test(js) && /data-drop/.test(js));
    ok('assemble shows the clips the export will really contain',
        /exactly what the export will contain/.test(js));
    ok('sources shows provider keys, watched folders and the budget',
        /fal\.ai/.test(js) && /What is watched/.test(js) && /What it costs/.test(js));
    ok('the money is labelled an estimate, not a bill', /not a bill from the provider/.test(js));

    const panel = fs.readFileSync(path.join(__dirname, '..', 'src', 'panels', 'studioPanel.ts'), 'utf8');
    ok('triage writes the same fields a workflow selection step writes',
        /selectedUrls: keep \? urls : \[\]/.test(panel));
    ok('"Generate" is wired to the command that really exists',
        /no invented one-click generator/.test(panel));
    ok('external assets stay loadable in the webview',
        /localResourceRoots: studioRoots\(/.test(panel) && /localResourceRoots: studioRoots\(.*this\.lib\.dirs\(\)\)/.test(panel)
        && /m\.assetFiles\) \{ dirs\.add\(path\.dirname\(f\)\)/.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'panels', 'studioLibraryView.ts'), 'utf8')));

    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    const ids = new Set(pkg.contributes.commands.map(c => c.command));
    ok('the Studio has its own command', ids.has('agentfarm.openStudio'));
    ok('the old gallery entry point still exists', ids.has('agentfarm.openGallery'));
    const base = fs.readFileSync(path.join(__dirname, '..', 'src', 'panels', 'base.ts'), 'utf8');
    ok('…and both route to the Studio', /gallery: 'agentfarm\.openStudio'/.test(base));
    ok('the gallery page itself is gone (one surface, not two)',
        !fs.existsSync(path.join(__dirname, '..', 'media', 'gallery.js'))
        && !fs.existsSync(path.join(__dirname, '..', 'src', 'panels', 'gallery.ts')));
    const nav = fs.readFileSync(path.join(__dirname, '..', 'media', 'pageHeader.js'), 'utf8');
    ok('Studio is in the global nav', /id: 'studio'/.test(nav));
}

// ---------- ‼️ the assign picker: one separator, spelled the same twice ----------
//
// The bug this pins down shipped in 3.92.0 and could not be seen: the page
// joined a production id to a scene id with a raw NUL byte and the panel split
// the result on a SPACE, so every scene assignment filed the asset under a
// project id that was really the whole joined string, with no scene. Both
// halves are machine-generated ids, so nothing downstream could tell.
{
    const { SCENE_TARGET_SEP } = require(path.join(__dirname, '..', 'out', 'core', 'studio.js'));
    ok('there is one separator, and it is printable',
        typeof SCENE_TARGET_SEP === 'string' && SCENE_TARGET_SEP.length > 0
        && !/[\x00-\x1f\s]/.test(SCENE_TARGET_SEP));

    const page = fs.readFileSync(path.join(__dirname, '..', 'media', 'studio.js'), 'utf8');
    const panel = fs.readFileSync(path.join(__dirname, '..', 'src', 'panels', 'studioPanel.ts'), 'utf8');
    ok('the page joins with exactly that separator',
        page.includes("p.id + '" + SCENE_TARGET_SEP + "' + s.id"));
    ok('…and the panel splits on the shared constant, not a literal of its own',
        /indexOf\(SCENE_TARGET_SEP\)/.test(panel) && !/target\.split\(' '\)/.test(panel));

    // ‼️ AND NO SOURCE FILE CARRIES A RAW NUL. One did, and ripgrep called the
    // whole file BINARY and skipped it — media/studio.js was invisible to every
    // content search in this repo, by a person or an agent, for as long as it
    // was there.
    const roots = ['media', 'src', 'src/core', 'src/panels', 'src/views', 'test'];
    const offenders = [];
    for (const r of roots) {
        const dir = path.join(__dirname, '..', r);
        if (!fs.existsSync(dir)) { continue; }
        for (const f of fs.readdirSync(dir)) {
            if (!/\.(ts|js|css)$/.test(f)) { continue; }
            const p = path.join(dir, f);
            if (!fs.statSync(p).isFile()) { continue; }
            if (fs.readFileSync(p).includes(0)) { offenders.push(r + '/' + f); }
        }
    }
    ok('no source file carries a literal NUL byte'
        + (offenders.length ? ' — ' + offenders.join(', ') : ''), offenders.length === 0);
}

// ---------- B-2: the Studio over the bridge -------------------------------
//
// ‼️ THIS PAGE HAD NO BRIDGE AT ALL, and it is the surface where that cost the
// most: producing media is the long, repetitive, many-step job an agent should
// be able to drive. Every op below calls the same core function the panel calls.
(async () => {
    const { registerStudioOps } = require(path.join(__dirname, '..', 'out', 'core', 'studioBridge.js'));
    const { BridgeRegistry } = require(path.join(__dirname, '..', 'out', 'core', 'bridge.js'));
    const root = fs.mkdtempSync(path.join(__dirname, 'tmp-studio-'));
    const agentDir = path.join(root, 'agents', 'media');
    const outputs = path.join(root, 'outputs');
    fs.mkdirSync(agentDir, { recursive: true });
    fs.mkdirSync(outputs, { recursive: true });
    fs.writeFileSync(path.join(agentDir, 'CLAUDE.md'), '# media agent\n');
    const agent = { id: 'media', name: 'media', dir: agentDir };
    const started = [];
    const reg = new BridgeRegistry();
    registerStudioOps(reg, {
        getAgents: () => [agent],
        outputsDir: () => outputs,
        runMedia: (title, model, input, opts) => started.push({ title, model, input, opts })
    });

    // ---- the manifest, and the one thing it refuses to do twice ----
    const made = await reg.dispatch('studio.production.new',
        { agent: 'media', title: 'The Film', scenes: 'Opening, wide\nThe reply' });
    ok('studio.production.new writes a manifest', made.ok && made.result.scenes.length === 2);
    ok('‼️ …splitting on NEWLINES, so "Opening, wide" stays one scene',
        made.result.scenes[0].title === 'Opening, wide');
    const again = await reg.dispatch('studio.production.new',
        { agent: 'media', title: 'Another', scenes: 'x' });
    ok('…and it refuses to overwrite an existing manifest by accident',
        !again.ok && /already has a production/.test(again.error));

    const projectId = made.result.id;
    const sceneId = made.result.scenes[0].id;

    // ---- an asset, filed, judged, and re-asked ----
    const meta1 = {
        taskId: 'gen1', title: 'wide shot', model: 'fal-ai/x',
        input: '{"prompt":"a wide shot"}', assetFiles: [path.join(outputs, 'a.png')],
        estCost: 0.02, ts: NOW
    };
    fs.writeFileSync(path.join(outputs, 'gen1.media.json'), JSON.stringify(meta1, null, 2));

    const loose = await reg.dispatch('studio.assets', { unassigned: true });
    ok('studio.assets finds what is filed nowhere', loose.ok && loose.result.total === 1);
    const assigned = await reg.dispatch('studio.assign',
        { taskId: 'gen1', project: 'The Film', scene: sceneId });
    ok('studio.assign files it against a scene, by TITLE or by id', assigned.ok);
    const badScene = await reg.dispatch('studio.assign',
        { taskId: 'gen1', project: projectId, scene: 'nope' });
    ok('…and a scene that is not in that production is named, not written',
        !badScene.ok && /not a scene in/.test(badScene.error));
    const kept = await reg.dispatch('studio.triage', { taskId: 'gen1', keep: true });
    ok('studio.triage keeps it', kept.ok && kept.result.keep === true);
    const undecided = await reg.dispatch('studio.assets', { state: 'undecided' });
    ok('…so it is no longer in the undecided pile', undecided.ok && undecided.result.total === 0);

    const rows = (await reg.dispatch('studio.productions', { project: projectId })).result.productions[0];
    ok('studio.productions counts the asset against its scene',
        rows.scenes.find(s => s.id === sceneId).assets === 1);

    // ---- the three re-asks, and what makes them different ----
    const plain = await reg.dispatch('studio.rerun', { taskId: 'gen1' });
    ok('studio.rerun sends the identical input again',
        plain.ok && started[0].input === meta1.input && /re-run/.test(started[0].title));
    ok('‼️ …and the new run inherits where the first one was filed',
        started[0].opts.projectId === projectId && started[0].opts.sceneId === sceneId);
    const varied = await reg.dispatch('studio.rerun',
        { taskId: 'gen1', mode: 'vary', input: '{"prompt":"a tighter shot"}' });
    ok('vary sends the input you rewrote', varied.ok && /tighter/.test(started[1].input));
    const noInput = await reg.dispatch('studio.rerun', { taskId: 'gen1', mode: 'vary' });
    ok('…and vary with nothing to send is refused', !noInput.ok && /input/.test(noInput.error));
    const fed = await reg.dispatch('studio.rerun',
        { taskId: 'gen1', mode: 'feedback', feedback: 'warmer light' });
    ok('feedback folds a critique into the ORIGINAL input',
        fed.ok && /warmer light/.test(started[2].input) && /a wide shot/.test(started[2].input));
    const noFb = await reg.dispatch('studio.rerun', { taskId: 'gen1', mode: 'feedback' });
    ok('…and a feedback run that says nothing is refused', !noFb.ok && /what should change/.test(noFb.error));

    // ---- status, and the export that only places what is assigned ----
    const approved = await reg.dispatch('studio.scene.status',
        { project: projectId, scene: sceneId, status: 'approved' });
    ok('studio.scene.status moves the scene', approved.ok && approved.result.status === 'approved');
    const badStatus = await reg.dispatch('studio.scene.status',
        { project: projectId, scene: sceneId, status: 'lovely' });
    ok('…and an invented status lists the real ones', !badStatus.ok && /draft/.test(badStatus.error));

    const xml = await reg.dispatch('studio.export', { project: projectId });
    ok('studio.export writes a timeline beside the manifest',
        xml.ok && fs.existsSync(xml.result.file) && xml.result.clips === 1);
    const edl = await reg.dispatch('studio.export',
        { project: projectId, format: 'edl', file: path.join(root, 'cut.edl') });
    ok('…and an EDL where it was asked for', edl.ok && fs.existsSync(path.join(root, 'cut.edl')));
    const empty = await reg.dispatch('studio.export', { project: 'not a film' });
    ok('an unknown production is named honestly', !empty.ok && /No production/.test(empty.error));

    // Detaching is a real state, not an error.
    const off = await reg.dispatch('studio.assign', { taskId: 'gen1' });
    ok('studio.assign with no project detaches it', off.ok && off.result.project === null);
    ok('…and the export then has nothing to place',
        !(await reg.dispatch('studio.export', { project: projectId })).ok);

    // ---- B-10: a file the farm did not generate, filed by hand ----
    //
    // "Register asset" lived behind a file picker only, so an agent could
    // produce nothing an agent could then file. Every path is judged before a
    // single sidecar is written.
    const drop = path.join(root, 'drop');
    fs.mkdirSync(drop, { recursive: true });
    const png = path.join(drop, 'hand.png');
    const mp4 = path.join(drop, 'hand.mp4');
    const txt = path.join(drop, 'notes.txt');
    fs.writeFileSync(png, 'x'); fs.writeFileSync(mp4, 'x'); fs.writeFileSync(txt, 'x');

    const one = await reg.dispatch('studio.asset.register',
        { files: png, project: projectId, scene: sceneId, prompt: 'made in another tool' });
    ok('studio.asset.register files a local file as an asset',
        one.ok && one.result.registered === 1 && one.result.assets[0].kind === 'image');
    const extMeta = JSON.parse(fs.readFileSync(
        path.join(outputs, one.result.assets[0].taskId + '.media.json'), 'utf8'));
    ok('…through the SAME sidecar store the gallery reads',
        extMeta.model === 'external' && extMeta.projectId === projectId
        && extMeta.sceneId === sceneId && extMeta.input === 'made in another tool');
    ok('…and it is external, so nothing offers to re-run it',
        /^external/.test(extMeta.source));

    const dup = await reg.dispatch('studio.asset.register', { files: png });
    ok('‼️ a file already registered is reported, not registered twice',
        dup.ok && dup.result.registered === 0 && dup.result.skipped === 1);

    const many = await reg.dispatch('studio.asset.register', { files: [mp4, mp4] });
    ok('a batch registers each file once, even repeated inside one call',
        many.ok && many.result.registered === 1 && many.result.skipped === 1);

    const missing = await reg.dispatch('studio.asset.register',
        { files: [png, path.join(drop, 'nope.png')] });
    ok('a path that is not there names the path', !missing.ok && /No file at/.test(missing.error));
    const notMedia = await reg.dispatch('studio.asset.register', { files: txt });
    ok('…and a file the gallery cannot read is refused', !notMedia.ok && /not a media file/.test(notMedia.error));
    const wrongKind = await reg.dispatch('studio.asset.register',
        { files: mp4, mediaKind: 'image' });
    ok('mediaKind is a claim that is checked', !wrongKind.ok && /is video, not image/.test(wrongKind.error));
    const orphanScene = await reg.dispatch('studio.asset.register',
        { files: png, scene: sceneId });
    ok('a scene with no production is refused', !orphanScene.ok && /belongs to a production/.test(orphanScene.error));
    const beforeBad = fs.readdirSync(outputs).length;
    await reg.dispatch('studio.asset.register', { files: [txt, mp4] });
    ok('‼️ …and a refused batch writes NOTHING, not the good half',
        fs.readdirSync(outputs).length === beforeBad);

    fs.rmSync(root, { recursive: true, force: true });
    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
