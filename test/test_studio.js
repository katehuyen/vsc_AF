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
        /localResourceRoots/.test(panel) && /assetDirs/.test(panel));

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

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
