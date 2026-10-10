// X-443 — A FILE AN AGENT WROTE, READ ON THE PHONE. A Console card's ✎ open and vs HEAD chips open the
// editor on the PC; on the phone they open the farm's "file" page, which reads the file as it is on disk
// and its diff against the last commit. ‼️ Only a file some card names is ever read: the phone never
// points the host at a path of its own choosing (the session page's rule, sessionPageTarget).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

class EventEmitter {
    constructor() { this.listeners = []; }
    get event() { return (fn) => { this.listeners.push(fn); return { dispose: () => { this.listeners = this.listeners.filter(x => x !== fn); } }; }; }
    fire(e) { for (const f of [...this.listeners]) { f(e); } }
    dispose() { this.listeners = []; }
}
const uri = p => ({ path: p, fsPath: p, toString: () => 'file://' + p });
const vscodeStub = {
    EventEmitter,
    Uri: { joinPath: (b, ...parts) => uri([b.path, ...parts].join('/')), file: uri, parse: uri },
    window: { createWebviewPanel: () => { throw new Error('no desktop tab for a phone'); } },
    workspace: { getConfiguration: () => ({ get: (_k, d) => d }), workspaceFolders: [], onDidChangeConfiguration: new EventEmitter().event }
};
const origLoad = Module._load;
Module._load = function (request) { return request === 'vscode' ? vscodeStub : origLoad.apply(this, arguments); };
const E = require(path.join(ROOT, 'out', 'core', 'editedFile.js'));
const { FileViewPanel } = require(path.join(ROOT, 'out', 'panels', 'fileView.js'));
const { RemoteViews, messageScope } = require(path.join(ROOT, 'out', 'panels', 'remoteViews.js'));
const { remotePages } = require(path.join(ROOT, 'out', 'panels', 'remotePages.js'));
Module._load = origLoad;
const { BridgeRegistry } = require(path.join(ROOT, 'out', 'core', 'bridge.js'));
const { scopeAtLeast } = require(path.join(ROOT, 'out', 'remote', 'index.js'));
const { requiredScope } = require(path.join(ROOT, 'out', 'remote', 'scopes.js'));

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'af-edited-'));
const A = path.join(TMP, 'a.ts'), BIN = path.join(TMP, 'b.bin'), BIG = path.join(TMP, 'big.txt'), GONE = path.join(TMP, 'gone.ts');
fs.writeFileSync(A, String.fromCharCode(0xfeff) + 'line one\nline two\n', 'utf8');
fs.writeFileSync(BIN, Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x01]));
fs.writeFileSync(BIG, 'x'.repeat(E.READ_MAX + 10), 'utf8');
const settle = () => new Promise(r => setTimeout(r, 20));

(async () => {
    try {
        // ---- the files a card names ----
        const sessions = [
            { messages: [{ role: 'user', text: 'go' }, { role: 'tool', tool: { name: 'Write', file: A } }, { role: 'tool', tool: { name: 'Read' } }] },
            { messages: [{ tool: { name: 'Edit', file: A } }, { tool: { file: BIN } }, { tool: { file: BIG } }, { tool: { file: GONE } }, { tool: { file: 'rel/x.ts' } }] }
        ];
        const known = E.editedFilesOf(sessions);
        ok('every file a hosted card\'s write tools name, once each', known.length === 5 && known[0] === A && !known.includes(undefined));
        ok('‼️ a file no card names is refused', E.editedFileTarget({ file: path.join(TMP, 'other.ts') }, known) === undefined);
        ok('‼️ …and so is one walked out of a named file\'s folder', E.editedFileTarget({ file: A + '/../other.ts' }, known) === undefined);
        const t = E.editedFileTarget({ file: A, diff: 'yes' }, known);
        ok('a named file comes back as the card wrote it; the diff only for diff:true', t && t.file === A && t.diff === false
            && E.editedFileTarget({ file: A, diff: true }, known).diff === true);
        ok('nothing named, nothing read', E.editedFileTarget({}, known) === undefined && E.editedFileTarget(undefined, known) === undefined);
        if (process.platform === 'win32') {
            ok('on Windows the same file in another case is that file, as the card wrote it', (E.editedFileTarget({ file: A.toUpperCase() }, known) || {}).file === A);
        }

        // ---- reading ----
        const va = await E.readEditedFile(A, false);
        ok('a text file: its text without the byte-order mark, its size and its time; no diff unasked',
            va.exists && va.text === 'line one\nline two\n' && va.size > 0 && va.mtime > 0 && !va.truncated && va.diff === undefined && va.diffNote === undefined);
        const vb = await E.readEditedFile(BIN, false);
        ok('a binary file is said, never shown', vb.exists && vb.binary === true && vb.text === undefined && /binary/.test(vb.note));
        const vg = await E.readEditedFile(BIG, false);
        ok('a long file: its first 256 KB, and that there is more', vg.truncated === true && vg.text.length === E.READ_MAX);
        const vx = await E.readEditedFile(GONE, false);
        ok('a file that is gone is said', vx.exists === false && /no longer on disk/.test(vx.note));
        const vr = await E.readEditedFile('rel/x.ts', false);
        ok('a path with no folder is never read relative to the host\'s own folder', vr.exists === false && /without its folder/.test(vr.note));

        // ---- the diff, with a git that answers as it is told ----
        const calls = [];
        const git = answers => (args, cwd) => {
            calls.push({ args, cwd });
            const r = answers[args[0]];
            return r instanceof Error ? Promise.reject(r) : Promise.resolve(r === undefined ? '' : r);
        };
        let v = await E.readEditedFile(A, true, git({ 'rev-parse': TMP + '\n', diff: '--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-x\n+y\n' }));
        ok('the diff against HEAD is git\'s own text', v.diff.startsWith('--- a/a.ts') && v.diffNote === undefined && v.text === 'line one\nline two\n');
        const d = calls.find(c => c.args[0] === 'diff');
        ok('…asked in the file\'s repository, by its path there, against HEAD', d && d.cwd === TMP && d.args.includes('HEAD') && d.args[d.args.length - 1] === 'a.ts');
        v = await E.readEditedFile(A, true, git({ 'rev-parse': TMP, diff: '' }));
        ok('no change against the last commit is said', v.diff === undefined && /No changes/.test(v.diffNote));
        v = await E.readEditedFile(A, true, git({ 'rev-parse': TMP, diff: '', 'ls-files': new Error('not tracked') }));
        ok('a file git has never seen is a new file', /new file/i.test(v.diffNote));
        v = await E.readEditedFile(A, true, git({ 'rev-parse': new Error('not a repo') }));
        ok('a file outside a repository is said', /Not inside a git repository/.test(v.diffNote));
        v = await E.readEditedFile(A, true, git({ 'rev-parse': Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' }) }));
        ok('a machine without git is said', /git was not found/.test(v.diffNote));
        v = await E.readEditedFile(A, true, git({ 'rev-parse': TMP, diff: new Error('bad revision HEAD') }));
        ok('a repository git cannot compare (no commit yet) is said', /could not compare/.test(v.diffNote));
        v = await E.readEditedFile(A, true, git({ 'rev-parse': TMP, diff: '+'.repeat(E.DIFF_MAX + 5) }));
        ok('a diff longer than a phone should read is cut, and says so', v.diff.length === E.DIFF_MAX && /cut/.test(v.diffNote));

        // ---- the op ----
        const reg = new BridgeRegistry();
        E.registerEditedFileOp(reg, { known: () => known });
        let r = await reg.dispatch('console.file.read', { file: A });
        ok('console.file.read reads a file a card names', r.ok && r.result.text === 'line one\nline two\n');
        r = await reg.dispatch('console.file.read', { file: path.join(TMP, 'other.ts') });
        ok('‼️ …and refuses any other path by name', !r.ok && /no hosted conversation wrote that file/.test(r.error));
        ok('a phone may call it at the transcript\'s own scope (read)', requiredScope('console.file.read') === 'read');

        // ---- the page, on a phone's view ----
        const reads = [];
        const pages = remotePages({ file: () => true });
        ok('the file page opens at read; switching to the diff and reading it again only look',
            pages.file.open === 'read' && messageScope(pages.file, 'mode') === 'read' && messageScope(pages.file, 'refresh') === 'read');
        ok('another tab is never opened from it', messageScope(pages.file, 'afnav') === null);
        const views = new RemoteViews({
            media: uri(ROOT + '/media'), atLeast: scopeAtLeast, waitMs: 60,
            pages: remotePages({
                file: (host, args) => {
                    const to = E.editedFileTarget(args, known);
                    if (to) { FileViewPanel.openOn(host, to, { extensionUri: uri(ROOT), readEdited: (f, diff) => { reads.push([f, diff]); return E.readEditedFile(f, diff, git({ 'rev-parse': TMP, diff: '+y\n' })); } }); }
                    return !!to;
                }
            })
        });
        const phone = { device: 'dev_r', scope: 'read' };
        const got = [];
        const opened = views.open(phone, 'f1', 'file', { file: A, diff: false }, m => got.push(m));
        ok('a phone opens a named file', opened !== false && got.length >= 0);
        views.message(phone, 'f1', { type: 'refresh' });
        await settle();
        const first = got.filter(m => m.type === 'view').pop();
        ok('‼️ the page asks and is answered with the file, read where it is', first && first.diff === false && first.view.text === 'line one\nline two\n' && reads[0][0] === A);
        views.message(phone, 'f1', { type: 'mode', diff: true });
        await settle();
        const second = got.filter(m => m.type === 'view').pop();
        ok('switching to the diff answers with the diff of the same file', second && second.diff === true && second.view.diff === '+y\n' && reads[1][0] === A && reads[1][1] === true);
        views.message(phone, 'f1', { type: 'mode', diff: true, file: path.join(TMP, 'other.ts') });
        await settle();
        ok('‼️ a message naming another path still reads only the file the view was opened on', reads.every(x => x[0] === A));
        const before = got.length;
        const refused = views.open(phone, 'f2', 'file', { file: path.join(TMP, 'other.ts') }, m => got.push(m));
        ok('‼️ a file no card names opens nothing on the phone', reads.length === 3 && refused !== true && !got.slice(before).some(m => m.type === 'view'));
        views.close(phone, 'f1');

        // ---- afRemote.js: the Console's chips become the phone's file page ----
        const posted = [];
        const at = p => {
            const win = { addEventListener: () => undefined, afShell: { post: s => posted.push(JSON.parse(s)) }, sessionStorage: { getItem: () => null, setItem: () => undefined } };
            const ctx = { window: win, location: { pathname: p, search: '?view=v1', assign: () => undefined }, setTimeout: f => f(), Object, JSON, Array };
            vm.createContext(ctx);
            vm.runInContext(fs.readFileSync(path.join(ROOT, 'media', 'afRemote.js'), 'utf8'), ctx);
            return win.acquireVsCodeApi();
        };
        at('/view/console').postMessage({ type: 'openFile', file: A, diff: true });
        ok('‼️ on the Console a chip opens the file page with the file and the mode it asked for',
            posted[0].type === 'afnav' && posted[0].to === 'file' && posted[0].args.file === A && posted[0].args.diff === true);
        at('/view/console').postMessage({ type: 'openFile', file: A });
        ok('✎ open is the file itself', posted[1].args.diff === false);
        at('/view/missions').postMessage({ type: 'openFile', file: A });
        ok('another page\'s openFile is not the Console\'s chip: it goes to the farm as before', posted[2].type === 'openFile');
        at('/view/console').postMessage({ type: 'openFile', kind: 'noticeReport', id: 'n1' });
        ok('…and so does one that names no file', posted[3].type === 'openFile');
    } finally {
        fs.rmSync(TMP, { recursive: true, force: true });
    }
    console.log(`\ntest_edited_file: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
