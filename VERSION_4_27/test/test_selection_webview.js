// DOM-stub test for selection.js: min/max enforcement + confirm/cancel.
const fs = require('fs');
const vm = require('vm');

const code = fs.readFileSync(require('path').resolve(__dirname, '../media/selection.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

let posted = [];
let lastHtml = '';
let wired = {};

function pickEls() {
    const out = [];
    const re = /<div class="card pick[^"]*" data-i="(\d+)"/g;
    let m;
    while ((m = re.exec(lastHtml))) {
        const el = { dataset: { i: m[1] } };
        el.addEventListener = (_e, fn) => { el._click = fn; };
        out.push(el);
    }
    return out;
}
const idEls = {};
function idEl(id) {
    if (!idEls[id]) { idEls[id] = { disabled: false, addEventListener: (_e, fn) => { idEls[id]._click = fn; } }; }
    return idEls[id];
}
const appEl = { set innerHTML(v) { lastHtml = v; }, get innerHTML() { return lastHtml; } };

function run(data) {
    posted = []; lastHtml = ''; wired = {}; for (const k in idEls) delete idEls[k];
    const sandbox = {
        acquireVsCodeApi: () => ({ postMessage: (m) => posted.push(m) }),
        window: {
            AFCharts: { esc: s => String(s).replace(/</g, '&lt;'), fmtUSD: v => '$' + v },
            __DATA__: data
        },
        document: {
            getElementById: (id) => id === 'app' ? appEl : idEl(id),
            querySelectorAll: (sel) => { const e = sel === '.pick' ? pickEls() : []; wired[sel] = e; return e; }
        },
        console
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);
}

const mk = (n) => ({ candidates: Array.from({ length: n }, (_, i) => ({ url: 'u' + i, title: 'c' + i, kind: 'image', src: 's' + i })) });
const confirmDisabled = () => /<button id="confirm" disabled>/.test(lastHtml);

// min 2, max 3
run(Object.assign(mk(4), { title: 'T', message: '', min: 2, max: 3 }));
ok('confirm disabled at 0', confirmDisabled() === true);
ok('4 cards rendered', wired['.pick'].length === 4);

// pick one → still disabled (min 2)
wired['.pick'][0]._click();
ok('still disabled at 1 (<min)', confirmDisabled() === true);
// pick second → enabled
wired['.pick'][1]._click();
ok('enabled at 2 (>=min)', confirmDisabled() === false);
// pick third → ok (==max)
wired['.pick'][2]._click();
// pick fourth → blocked by max (atMax)
wired['.pick'][3]._click();
ok('4th blocked by max', !/4 selected/.test(lastHtml) && /3 selected/.test(lastHtml));

// confirm posts exactly the 3 chosen urls
idEl('confirm')._click();
ok('confirm posts 3 urls', posted.length === 1 && posted[0].type === 'confirm' && posted[0].urls.length === 3);
ok('confirm urls correct', JSON.stringify(posted[0].urls) === JSON.stringify(['u0', 'u1', 'u2']));

// toggle off then confirm blocked
run(Object.assign(mk(2), { title: 'T', message: '', min: 1, max: 0 }));
wired['.pick'][0]._click();
ok('unbounded max allows pick', confirmDisabled() === false);
wired['.pick'][0]._click(); // toggle off
ok('confirm disabled after toggle off', confirmDisabled() === true);

// cancel posts cancel
idEl('cancel')._click();
ok('cancel posts', posted.find(p => p.type === 'cancel'));

// empty candidates → no crash, confirm disabled (min 1)
run(Object.assign(mk(0), { title: 'T', message: '', min: 1, max: 0 }));
ok('empty renders no-candidate note', /No candidate assets/.test(lastHtml));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
