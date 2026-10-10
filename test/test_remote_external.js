// X-443 — A LINK TO THE WEB OPENS IN THE PHONE'S OWN BROWSER. On the PC a page's openExternal is VS Code
// opening the address; on the phone it was one of the PC's own actions, refused with a note. media/afRemote.js
// now answers an http(s) one on the phone: the page goes to the address, and the Android shell
// (and_AgentFarm PageClient.shouldOverrideUrlLoading) hands every http(s) address that is not the farm's to
// the browser, keeping the page where it is. The farm never sees it. Anything else still goes to the farm.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const posted = [], went = [];
const win = {
    addEventListener: () => undefined,
    afShell: { post: s => posted.push(JSON.parse(s)) },
    sessionStorage: { getItem: () => null, setItem: () => undefined }
};
const ctx = { window: win, location: { pathname: '/view/notices', search: '?view=v1', assign: u => went.push(u) }, setTimeout: f => f(), Object, JSON, Array };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'media', 'afRemote.js'), 'utf8'), ctx);
const api = win.acquireVsCodeApi();

api.postMessage({ type: 'openExternal', url: 'https://example.com/a?b=1#c' });
ok('‼️ an https link opens where the page is — the shell hands it to the phone\'s browser', went.length === 1 && went[0] === 'https://example.com/a?b=1#c');
ok('…and the farm never sees it (no PC-only note on the phone)', posted.length === 0);
api.postMessage({ type: 'openExternal', url: 'HTTP://example.com' });
ok('http, in any case, the same', went.length === 2 && posted.length === 0);

for (const url of ['file:///C:/secret.txt', 'javascript:alert(1)', 'vscode://settings', 'command:workbench.action.reloadWindow', 'https://exa mple.com', '', undefined, 42]) {
    const n = posted.length, w = went.length;
    api.postMessage({ type: 'openExternal', url });
    ok(`‼️ ${JSON.stringify(url)} is never navigated to on the phone; it goes to the farm as before, which refuses it`,
        went.length === w && posted.length === n + 1 && posted[n].type === 'openExternal');
}
api.postMessage({ type: 'open', url: 'https://example.com' });
ok('only openExternal is a web link: another message with a url goes to the farm untouched', went.length === 2 && posted[posted.length - 1].type === 'open');

// the pages that send it send exactly this shape
const senders = fs.readdirSync(path.join(ROOT, 'media')).filter(f => f.endsWith('.js'))
    .filter(f => /type:\s*'openExternal'/.test(fs.readFileSync(path.join(ROOT, 'media', f), 'utf8')));
const shaped = senders.filter(f => [...fs.readFileSync(path.join(ROOT, 'media', f), 'utf8').matchAll(/\{\s*type:\s*'openExternal'\s*,\s*url:/g)].length > 0);
ok('every page that opens a web link sends { type: \'openExternal\', url }' + (senders.length !== shaped.length ? ' — not: ' + senders.filter(f => !shaped.includes(f)).join(', ') : ''),
    senders.length > 0 && senders.length === shaped.length);

console.log(`\ntest_remote_external: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
