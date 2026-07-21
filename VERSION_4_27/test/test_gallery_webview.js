// DOM-stub test for gallery.js: filters, scene matrix, assign round-trip.
const fs = require('fs');
const vm = require('vm');

const code = fs.readFileSync(require('path').resolve(__dirname, '../media/pageHeader.js'), 'utf8') + '\n' + fs.readFileSync(require('path').resolve(__dirname, '../media/gallery.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

let posted = [];
let lastHtml = '';
let wired = {};        // data-attr → [elements with real handlers]

function makeEls(re, mapper) {
    const out = [];
    let m;
    while ((m = re.exec(lastHtml))) {
        const el = mapper(m);
        el.addEventListener = (_e, fn) => { el._click = fn; };
        out.push(el);
    }
    return out;
}

const selectorMap = {
    '[data-assign]': () => makeEls(/data-assign="([^"]*)"/g, m => ({ dataset: { assign: m[1] } })),
    '[data-status-scene]': () => makeEls(/data-status-scene="([^"]*)"/g, m => ({ dataset: { statusScene: m[1] } })),
    '[data-cell-scene]': () => makeEls(/data-cell-scene="([^"]*)"/g, m => ({ dataset: { cellScene: m[1] } })),
    '[data-open]': () => makeEls(/data-open="([^"]*)"/g, m => ({ dataset: { open: m[1] } })),
    '[data-rerun]': () => makeEls(/data-rerun="([^"]*)"/g, m => ({ dataset: { rerun: m[1] } })),
    '[data-vary]': () => makeEls(/data-vary="([^"]*)"/g, m => ({ dataset: { vary: m[1] } })),
    '[data-guide]': () => makeEls(/data-guide="([^"]*)"/g, m => ({ dataset: { guide: m[1] } }))
};

const appEl = { set innerHTML(v) { lastHtml = v; }, get innerHTML() { return lastHtml; } };
const idEls = {};
function idEl(id) {
    if (!idEls[id]) {
        idEls[id] = { value: '', addEventListener: (_e, fn) => { idEls[id]._handler = fn; } };
    }
    return idEls[id];
}

const DATA = {
    totalCost: 0.5,
    productions: [{
        id: 'film', title: 'Film', agentName: 'dev',
        scenes: [
            { id: 's01', title: 'Açılış', status: 'review' },
            { id: 's02', title: 'Kapanış', status: 'draft' }
        ],
        matrix: [
            { sceneId: 's01', title: 'Açılış', status: 'review', counts: { image: 2, video: 1, audio: 0, file: 0 }, total: 3 },
            { sceneId: 's02', title: 'Kapanış', status: 'draft', counts: { image: 0, video: 0, audio: 0, file: 0 }, total: 0 },
            { sceneId: '', title: 'unassigned', status: 'unassigned', counts: { image: 1, video: 0, audio: 0, file: 0 }, total: 1 }
        ]
    }],
    items: [
        { taskId: 't1', title: 'kare 1', model: 'fal-ai/flux', input: '{}', estCost: 0.02, ts: Date.now(), projectId: 'film', sceneId: 's01', source: 'fal', assetPath: '/a/t1.png', assetUri: 'vs://a/t1.png', kind: 'image' },
        { taskId: 't2', title: 'indirilen.mp4', model: 'external', input: '', estCost: 0, ts: Date.now(), source: 'external:dl', assetPath: '/dl/x.mp4', assetUri: 'vs://dl/x.mp4', kind: 'video' }
    ]
};

const sandbox = {
    acquireVsCodeApi: () => ({ postMessage: (m) => posted.push(m), getState() { }, setState() { } }),
    window: {
        AFCharts: {
            esc: (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'),
            fmtUSD: (v) => '$' + Number(v).toFixed(2)
        },
        __DATA__: DATA,
        addEventListener() { }
    },
    document: {
        getElementById: (id) => id === 'app' ? appEl : idEl(id),
        querySelectorAll: (sel) => {
            const els = (selectorMap[sel] || (() => []))();
            wired[sel] = els;
            return els;
        }
    },
    setInterval: () => 0, console,
    Date, JSON
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox); // initial render

ok('production select rendered', /id="fproj"/.test(lastHtml));
ok('no matrix before project selected', !/Scene<\/th>/.test(lastHtml));
ok('both cards rendered', /kare 1/.test(lastHtml) && /indirilen.mp4/.test(lastHtml));
ok('external card has no re-run', !/data-rerun="t2"/.test(lastHtml) && /data-rerun="t1"/.test(lastHtml));
ok('every card has Scene… button', /data-assign="t1"/.test(lastHtml) && /data-assign="t2"/.test(lastHtml));
ok('external source badge', /external:dl/.test(lastHtml));
ok('scene tag on assigned card', /Film · Açılış/.test(lastHtml));

// select the production → matrix + scene filter appear
idEl('fproj')._handler({ target: { value: 'film' } });
ok('matrix rendered after project pick', /Scene<\/th>/.test(lastHtml) && /Açılış/.test(lastHtml));
ok('unassigned row present', /unassigned/.test(lastHtml));
ok('status badge clickable', /data-status-scene="s01"/.test(lastHtml));
ok('scene filter select appears', /id="fscene"/.test(lastHtml));
ok('project filter applied to grid', /kare 1/.test(lastHtml) && !/data-assign="t2"/.test(lastHtml));

// click a matrix cell → scene filter set
wired['[data-cell-scene]'].find(e => e.dataset.cellScene === 's01')._click();
ok('cell click filters to scene', /kare 1/.test(lastHtml));

// assign button posts message with taskId
posted = [];
wired['[data-assign]'].find(e => e.dataset.assign === 't1')._click();
ok('assign posts', posted.length === 1 && posted[0].type === 'assign' && posted[0].taskId === 't1');

// status badge posts setSceneStatus with project + scene
posted = [];
wired['[data-status-scene]'].find(e => e.dataset.statusScene === 's01')._click();
ok('status change posts', posted[0].type === 'setSceneStatus' && posted[0].projectId === 'film' && posted[0].sceneId === 's01');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
