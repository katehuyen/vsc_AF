/**
 * X-424 — the Studio's Assets tab read from the library.
 *
 * ‼️ THE SMALLEST ARITY FIRST: one card is the wall the user actually gets on
 * a fresh database, and it is the scene where a strip that wraps, a filter row
 * that drops a control, or a note that runs off the row shows. Then the same
 * one card from the sidecar cache (engine down), where the page must SAY it is
 * not showing the database, and a small wall with a bare record next to a
 * generated one (its re-run/vary/scene doors kept).
 */
const T = Date.parse('2026-09-26T21:40:00Z');
const H = 3600000;

const card = (o) => Object.assign({
    id: 'media_mp4_20260926_0001', file: 'D:\\zome\\media\\media_TEST\\video\\final\\kedi_dans.mp4', name: 'kedi_dans.mp4',
    stage: 'final', type: 'video', topic: 'kedi', tags: ['kedi'], status: 'draft', failed: false,
    score: 7, scoreBy: 'auto', fill: 75, reason: '', causes: ['media_gif_20260614_0001'], effects: [], version: 3, at: T - H, from: 'library'
}, o || {});

const item = (o) => Object.assign({
    taskId: 'gen-1', title: 'Kedi dans ediyor — 5 sn', model: 'fal-ai/kling-video', input: 'a cat dancing, 5 s', estCost: 0.35, ts: T - H,
    workflowTitle: 'GIF → video', projectId: '', sceneId: '', source: 'fal', selectedCount: 0, rejectedCount: 0,
    assetPath: 'D:\\zome\\media\\media_TEST\\video\\final\\kedi_dans.mp4', assetUri: '', kind: 'video'
}, o || {});

const lib = (o) => Object.assign({
    source: 'library', base: 'TEST', note: '1 record(s) from TEST.', matched: 1, error: '',
    view: {}, resolved: { base: 'TEST', stages: [], kind: '', success: '' },
    why: ['base: the Airtable page\'s default', 'stages: every stage — built-in default', 'kind: all — built-in default', 'success: both — built-in default']
}, o || {});

const data = (over) => Object.assign({
    generatedAt: T, tab: 'assets', project: '', agents: [{ id: 'a1', name: 'developer' }],
    productions: [], loose: [], untriaged: [], cost: { month: 0.35 }, sequence: [],
    providers: { fal: true, replicate: false }, ingestFolders: [], candidates: 0,
    items: [item({ lib: card() })], library: lib()
}, over || {});

module.exports = {
    script: 'studio.js',
    data,
    variants: () => [
        { id: 'one-record', label: 'Assets → one record from TEST (auto score, 75% form, one cause)', data: data() },
        {
            id: 'cache', label: 'Assets → engine down: the one card from the sidecar cache, and the note says so',
            data: data({
                items: [item({ lib: card({ id: '', stage: 'final', status: '', score: 0, scoreBy: '', fill: 0, causes: [], version: 0, from: 'cache' }) })],
                library: lib({ source: 'cache', note: 'The TEST engine is not answering (ECONNREFUSED 127.0.0.1:5173) — showing the sidecar cache (1), not the database.' })
            })
        },
        {
            id: 'mixed', label: 'Assets → a failed human-scored record nothing here made, next to a generated one; live stages filter',
            data: data({
                items: [
                    item({ lib: card() }),
                    {
                        taskId: '', title: 'kedi_eski.gif', model: '', input: '', estCost: 0, ts: T - 30 * H, source: 'library',
                        selectedCount: 0, rejectedCount: 0, assetPath: 'W:\\zome\\media\\media_TEST\\image\\raw\\kedi_eski.gif', assetUri: '', kind: 'image',
                        lib: card({ id: 'media_gif_20260614_0001', file: 'W:\\zome\\media\\media_TEST\\image\\raw\\kedi_eski.gif', name: 'kedi_eski.gif', stage: 'raw', type: 'image', status: 'review', failed: true, reason: 'Eller eriyor; arka plan titriyor.', score: 4, scoreBy: 'human', fill: 40, causes: [], effects: ['media_mp4_20260926_0001'] })
                    }
                ],
                library: lib({ note: '2 record(s) from TEST.', matched: 2, view: { stages: 'raw,final' }, resolved: { base: 'TEST', stages: ['raw', 'final'], kind: '', success: '' } })
            })
        }
    ]
};
