// X-443 — A FILE A PAGE SHOWS, READ ON THE PHONE. On the PC a page's own "open this file" opens the
// editor (a card's chip, a report, a step's or a task's output, a note's file, a memory file); a phone
// has none, so media/afRemote.js turns the press into the farm's "file" page and the farm finds the
// file in what the page it came from shows (src/core/shownFile.ts). ‼️ A path that page does not show
// opens nothing, and a file that can hold a key (an agent's settings) is in no source.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const Module = require('module');
const { execFileSync } = require('child_process');

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
const S = require(path.join(ROOT, 'out', 'core', 'shownFile.js'));
const E = require(path.join(ROOT, 'out', 'core', 'editedFile.js'));
const { FileViewPanel } = require(path.join(ROOT, 'out', 'panels', 'fileView.js'));
const { RemoteViews } = require(path.join(ROOT, 'out', 'panels', 'remoteViews.js'));
const { remotePages } = require(path.join(ROOT, 'out', 'panels', 'remotePages.js'));
Module._load = origLoad;
const { BridgeRegistry } = require(path.join(ROOT, 'out', 'core', 'bridge.js'));
const { scopeAtLeast } = require(path.join(ROOT, 'out', 'remote', 'index.js'));
const { requiredScope } = require(path.join(ROOT, 'out', 'remote', 'scopes.js'));
const { runPage } = require('./lib_page_dom');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'af-shown-'));
const write = (n, t) => { const p = path.join(TMP, n); fs.writeFileSync(p, t, 'utf8'); return p; };
const REPORT = write('report.md', 'the report\n'), NREPORT = write('notice-report.md', 'the source notice\'s report\n'), ANSWER = write('answer.md', 'the answer\n');
const NOTICE = write('notice.md', 'a notice\'s report\n'), CTX = write('ctx.ts', 'export {};\n'), CTX2 = write('ctx2.ts', 'export {};\n');
const STEP = write('step.md', 'a step\'s output\n'), OUT = write('task.md', 'a task\'s output\n');
const CLAUDE = write('CLAUDE.md', 'instructions\n'), DUTIES = write('DUTIES.md', 'duties\n'), MEMIDX = write('MEMORY.md', 'index\n'), MEM = write('feedback_x.md', 'a memory\n');
const SETTINGS = write('settings.json', '{"env":{"KEY":"secret"}}\n');
const CARD = write('card.ts', 'card\n'), EDITED = write('edited.ts', 'edited\n'), OTHER = write('other.ts', 'other\n');
const TRANSCRIPT = write('s1.jsonl', [
    JSON.stringify({ type: 'user', timestamp: '2026-10-11T00:00:00Z', message: { role: 'user', content: 'go' } }),
    JSON.stringify({ type: 'assistant', timestamp: '2026-10-11T00:00:01Z', message: { role: 'assistant', content: [
        { type: 'tool_use', id: 't1', name: 'Edit', input: { file_path: EDITED, old_string: 'a', new_string: 'b' } },
        { type: 'tool_use', id: 't2', name: 'Read', input: { file_path: OTHER } }] } })
].join('\n') + '\n');

// What the farm's pages show, as the stores hold it.
const data = {
    cards: () => [CARD],
    transcript: sid => sid === 's1' ? TRANSCRIPT : undefined,
    queueItem: id => id === 'q1' ? { reportPath: REPORT, sourceNoticeReportPath: NREPORT, answerPath: ANSWER } : id === 'q2' ? {} : undefined,
    notice: id => id === 'n1' ? { reportPath: NOTICE } : id === 'n2' ? {} : undefined,
    note: id => id === 'a1' ? { contextFiles: [CTX] } : id === 'a2' ? { contextFiles: [CTX2] } : undefined,
    missionRuns: () => [{ rounds: [{ steps: [{ outputFile: STEP }, {}] }] }, {}],
    tasks: () => [{ outputFile: OUT }, {}],
    agents: () => [{ claudeMdPath: CLAUDE, dutiesPath: DUTIES, memoryIndexPath: MEMIDX, memoryFiles: [{ path: MEM }], settingsPath: SETTINGS }, {}]
};
// What each page's own press sends (its script in media/), and the file that press is about.
const ASKS = {
    console: [{ type: 'openFile', file: CARD, diff: true }, CARD],
    session: [{ type: 'openEditedFile', file: EDITED, diff: true }, EDITED],
    queue: [{ type: 'openFile', kind: 'report', id: 'q1' }, REPORT],
    notices: [{ type: 'openReport', id: 'n1' }, NOTICE],
    a2anotes: [{ type: 'openFile', id: 'a1', file: CTX }, CTX],
    missions: [{ type: 'openFile', file: STEP }, STEP],
    tasks: [{ type: 'open-output', file: OUT }, OUT],
    board: [{ type: 'open-output', file: OUT }, OUT],
    agent: [{ type: 'openFile', path: MEM }, MEM],
    search: [{ type: 'openFile', file: MEM }, MEM]
};
const settle = () => new Promise(r => setTimeout(r, 20));
const REMOTE_JS = fs.readFileSync(path.join(ROOT, 'media', 'afRemote.js'), 'utf8').replace(/\r\n/g, '\n');
/** media/afRemote.js on a phone's view of `page`: what a press there posts to the shell. */
const press = (page, m) => {
    const posted = [];
    const win = { addEventListener: () => undefined, afShell: { post: s => posted.push(JSON.parse(s)) }, sessionStorage: { getItem: () => null, setItem: () => undefined }, __DATA__: { sessionId: 's1' } };
    const ctx = { window: win, location: { pathname: '/view/' + page, search: '?view=v1', assign: () => undefined }, setTimeout: f => f(), Object, JSON, Array };
    vm.createContext(ctx);
    vm.runInContext(REMOTE_JS, ctx);
    win.acquireVsCodeApi().postMessage(m);
    return posted[0];
};

(async () => {
    try {
        // ---- every source: the phone's table, the host's sources and the pages' gates are one list ----
        const sources = Object.keys(S.SHOWN_FILE_SOURCES).sort();
        const table = /var FILE_ASKS = \{\n([\s\S]*?)\n {4}\};/.exec(REMOTE_JS);
        const client = {};
        for (const m of (table ? table[1] : '').matchAll(/^\s+([A-Za-z0-9]+): \['([A-Za-z-]+)',/gm)) { client[m[1]] = m[2]; }
        ok('‼️ every page the farm has a source for is a page the phone turns into the file page, and no other'
            + ` (${sources.join(' ')} / ${Object.keys(client).sort().join(' ')})`,
            sources.length >= 10 && JSON.stringify(sources) === JSON.stringify(Object.keys(client).sort()));
        ok('this test presses every one of them', JSON.stringify(sources) === JSON.stringify(Object.keys(ASKS).sort()));
        const pages = remotePages({ file: () => true });
        for (const page of sources) {
            const [msg, file] = ASKS[page] || [{}, ''];
            const spec = pages[page];
            ok(`${page}: its press is the message the phone's table names`, client[page] === msg.type);
            ok(`‼️ ${page}: that message never reaches the PC's editor from a phone (pcOnly)`, !!spec && spec.pcOnly.includes(msg.type));
            ok(`‼️ ${page}: a page that opens at the file page's own scope — a source never widens what a phone reads`, !!spec && spec.open === pages.file.open);
            const nav = press(page, msg) || {};
            ok(`${page}: on the phone the press opens the file page, naming the page it came from`, nav.type === 'afnav' && nav.to === 'file' && !!nav.args && nav.args.from === page);
            const to = S.shownFileTarget(nav.args, data);
            ok(`‼️ ${page}: the farm finds the file that page shows`, !!to && to.file === file);
            const edits = page === 'console' || page === 'session';
            ok(`${page}: ${edits ? 'a file an agent wrote can be compared with the last commit' : 'a document is never compared, even when asked'}`,
                !!to && to.edits === edits && to.diff === edits && (S.shownFileTarget({ ...nav.args, diff: true }, data) || {}).diff === edits);
            // the same press about a file that page does not show
            const stray = { ...nav.args, id: nav.args.id ? 'nobody' : undefined, file: nav.args.id && !nav.args.file ? undefined : OTHER };
            ok(`‼️ ${page}: a file that page does not show opens nothing`, S.shownFileTarget(stray, data) === undefined);
            ok(`‼️ ${page}: …and a file another page shows is not this page's`, page === 'agent' || page === 'search' || page === 'tasks' || page === 'board'
                ? S.shownFileTarget({ from: page, file: CARD, id: 'q1' }, data) === undefined
                : S.shownFileTarget({ ...nav.args, file: MEM, id: nav.args.id ? 'nobody' : undefined }, data) === undefined);
        }
        ok('a press that names nothing goes to the farm as it was', press('missions', { type: 'openFile' }).type === 'openFile'
            && press('queue', { type: 'openFile', kind: 'report' }).type === 'openFile');
        ok('another message of the page is not a file press', press('queue', { type: 'openNotice', id: 'n1' }).type === 'openNotice');
        ok('a page with no source keeps its own openFile for the farm to refuse', press('studio', { type: 'openFile', path: OUT }).type === 'openFile');

        // ---- the sources, one by one ----
        const t = a => S.shownFileTarget(a, data);
        ok('a work item\'s three documents: its report, its source notice\'s report, and its answer for any other kind',
            t({ from: 'queue', id: 'q1', kind: 'report' }).file === REPORT && t({ from: 'queue', id: 'q1', kind: 'noticeReport' }).file === NREPORT
            && t({ from: 'queue', id: 'q1', kind: 'answer' }).file === ANSWER && t({ from: 'queue', id: 'q1' }).file === ANSWER);
        ok('‼️ an item names its own file: a path sent beside the id is not read', t({ from: 'queue', id: 'q1', kind: 'report', file: OTHER }).file === REPORT
            && t({ from: 'notices', id: 'n1', file: SETTINGS }).file === NOTICE);
        ok('an item without that document, or no item, opens nothing', t({ from: 'queue', id: 'q2', kind: 'report' }) === undefined
            && t({ from: 'notices', id: 'n2' }) === undefined && t({ from: 'notices' }) === undefined && t({ from: 'queue', kind: 'report' }) === undefined);
        ok('‼️ a note\'s file is one THAT note names', t({ from: 'a2anotes', id: 'a1', file: CTX2 }) === undefined && t({ from: 'a2anotes', id: 'a2', file: CTX2 }).file === CTX2
            && t({ from: 'a2anotes', file: CTX }) === undefined);
        ok('an agent\'s own documents: its instructions, its duties, its memory index and its memory files',
            [CLAUDE, DUTIES, MEMIDX, MEM].every(f => (t({ from: 'agent', file: f }) || {}).file === f));
        ok('‼️ an agent\'s settings are in no source: a file that can hold a key stays on the PC',
            Object.keys(S.SHOWN_FILE_SOURCES).every(from => t({ from, file: SETTINGS, id: 'a1', session: 's1' }) === undefined));
        ok('a search hit is a memory file, nothing else of the agent', t({ from: 'search', file: MEM }).file === MEM && t({ from: 'search', file: CLAUDE }) === undefined);
        ok('‼️ a transcript\'s file is one its WRITE tools name, in a session the index knows',
            t({ from: 'session', session: 's1', file: EDITED }).file === EDITED && t({ from: 'session', session: 's1', file: OTHER }) === undefined
            && t({ from: 'session', session: 'nobody', file: EDITED }) === undefined && t({ from: 'session', file: EDITED }) === undefined);
        ok('a transcript that is gone names nothing', S.transcriptFiles(path.join(TMP, 'gone.jsonl')).length === 0 && S.transcriptFiles(undefined).length === 0);
        ok('‼️ no page named, or a name that is no page, opens nothing', t({ file: CARD }) === undefined && t(undefined) === undefined
            && ['', 'nobody', 'constructor', '__proto__', 'toString', 'file'].every(from => t({ from, file: CARD }) === undefined));
        ok('queueDocOf is the Queue page\'s own verdict (its panel asks it too)',
            /queueDocOf\(this\.deps\.store\.get\(id\), kind\)/.test(fs.readFileSync(path.join(ROOT, 'src', 'panels', 'queuePanel.ts'), 'utf8')));
        ok('prose is told from code by its name', S.readsAsProse('a/b/Rapor.MD') && S.readsAsProse('x.txt') && !S.readsAsProse('x.ts') && !S.readsAsProse('md'));

        // ---- the op ----
        const reg = new BridgeRegistry();
        const asked = [];
        S.registerShownFileOp(reg, { data, readEdited: (f, diff) => { asked.push([f, diff]); return E.readEditedFile(f, false); } });
        let r = await reg.dispatch('files.read', { from: 'notices', id: 'n1' });
        ok('files.read reads a file a page shows, and says it is no agent\'s edit', r.ok && r.result.text === 'a notice\'s report\n' && r.result.edits === false);
        r = await reg.dispatch('files.read', { from: 'console', file: CARD, diff: true });
        ok('…and asks the diff only for a file an agent wrote', r.ok && r.result.edits === true && asked[1][1] === true && asked[0][1] === false);
        r = await reg.dispatch('files.read', { from: 'agent', file: SETTINGS });
        ok('‼️ …and refuses a file no page shows, by name', !r.ok && /no page shows that file/.test(r.error) && asked.length === 2);
        r = await reg.dispatch('files.read', { file: CARD });
        ok('…and a call that names no page', !r.ok && /from/.test(r.error));
        ok('a phone may call it at the pages\' own scope (read)', requiredScope('files.read') === 'read');

        // ---- the page, on a phone's view ----
        const reads = [];
        const git = () => Promise.reject(new Error('git is never asked for a document'));
        const views = new RemoteViews({
            media: uri(ROOT + '/media'), atLeast: scopeAtLeast, waitMs: 60,
            pages: remotePages({
                file: (host, args) => {
                    const to = S.shownFileTarget(args, data);
                    if (to) { FileViewPanel.openOn(host, to, { extensionUri: uri(ROOT), readEdited: (f, diff) => { reads.push([f, diff]); return E.readEditedFile(f, diff, git); } }); }
                    return !!to;
                }
            })
        });
        const phone = { device: 'dev_r', scope: 'read' };
        const got = [];
        ok('a phone at read opens a work item\'s answer', views.open(phone, 'f1', 'file', { from: 'queue', id: 'q1', kind: 'answer', diff: true }, m => got.push(m)) !== false);
        const served = await views.page('/view/file?view=f1', phone);
        ok('the page is told it is a document, and prose', !!served && /"edits":\s*false/.test(served.body) && /"prose":\s*true/.test(served.body) && /"diff":\s*false/.test(served.body));
        views.message(phone, 'f1', { type: 'refresh' });
        await settle();
        const first = got.filter(m => m.type === 'view').pop();
        ok('‼️ it is answered with the file, read where it is', !!first && first.diff === false && first.view.text === 'the answer\n' && reads[0][0] === ANSWER);
        views.message(phone, 'f1', { type: 'mode', diff: true, file: SETTINGS });
        await settle();
        const second = got.filter(m => m.type === 'view').pop();
        ok('‼️ a document asked for its diff is answered with the file again: git is never run for it, and no other path is read',
            !!second && second.diff === false && second.view.diff === undefined && second.view.diffNote === undefined && reads.length === 2 && reads.every(x => x[0] === ANSWER && x[1] === false));
        const before = got.length;
        ok('‼️ a file no page shows opens nothing on the phone', views.open(phone, 'f2', 'file', { from: 'agent', file: SETTINGS }, m => got.push(m)) === false
            && views.open(phone, 'f3', 'file', { file: CARD }, m => got.push(m)) === false && got.length === before && reads.length === 2);
        views.close(phone, 'f1');

        // ---- what the page draws ----
        const view = (text) => ({ type: 'view', diff: false, view: { file: REPORT, name: 'report.md', exists: true, size: 11, mtime: 1, text } });
        const docPage = runPage('fileView.js', { file: REPORT, name: 'report.md', diff: true, edits: false, prose: true });
        ok('a document opens on the file, whatever mode it was asked in', docPage.posted.length === 1 && docPage.posted[0].type === 'refresh');
        docPage.send(view('# Rapor\n\nUzun bir satır.\n'));
        ok('‼️ a document has no diff to switch to: only Read again', docPage.query('[data-mode]').length === 0 && docPage.query('[data-act="refresh"]').length === 1);
        ok('prose is drawn wrapped, without line numbers', docPage.query('.fv-prose').length === 1 && docPage.query('.fv-n').length === 0 && docPage.query('.fv-row').length === 3);
        const codePage = runPage('fileView.js', { file: CARD, name: 'card.ts', diff: false, edits: true, prose: false });
        codePage.send(view('a\nb\n'));
        ok('a file an agent wrote keeps its two modes and its line numbers', codePage.query('[data-mode]').length === 2 && codePage.query('.fv-n').length === 2 && codePage.query('.fv-prose').length === 0);
        const old = runPage('fileView.js', { file: CARD, name: 'card.ts', diff: true });
        ok('a view opened without the two marks is the Console\'s chip, as it was', old.posted[0].type === 'refresh' && /data-mode="diff" aria-pressed="true"/.test(old.html()));

        // ---- measured: a report at a phone's width ----
        const CANDIDATES = [
            process.env.AF_CHROME,
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
            'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
            'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
            '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
        ];
        if (!CANDIDATES.some(p => p && fs.existsSync(p))) {
            console.log('  (no Chrome or Edge on this machine — the measured half is skipped)');
        } else {
            const node = (args) => execFileSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', timeout: 240000, stdio: ['ignore', 'pipe', 'pipe'] });
            // every block of file text on the page: is anything in it wider than the block, and is it prose
            const EXPR = `[...document.querySelectorAll('.fv-code')].map(c=>({prose:c.classList.contains('fv-prose'),over:c.scrollWidth-c.clientWidth,rows:c.querySelectorAll('.fv-row').length,`
                + `out:[...c.querySelectorAll('.fv-t')].filter(e=>e.getBoundingClientRect().right>c.getBoundingClientRect().right+0.5).length,w:Math.round(c.getBoundingClientRect().width)}))`;
            let m = null;
            try {
                node([path.join('test', 'render_page.js'), 'fileView']);
                m = JSON.parse(node([path.join('test', 'measure_page.js'), 'fileView', EXPR, '--phone', 'long']));
            } catch (e) { console.log('  measuring failed: ' + String(e && e.message).slice(0, 300)); }
            const prose = (m || []).filter(x => x.prose), code = (m || []).filter(x => !x.prose);
            ok('the instrument sees a line longer than the phone: code runs past its block and is scrolled' + (m ? ` (${code.filter(x => x.over > 0).length} of ${code.length})` : ''),
                code.length > 0 && code.some(x => x.over > 0));
            ok('‼️ a report is read without scrolling sideways: no line of it, not even an address with nowhere to break, is wider than the phone'
                + (prose.length ? ' — ' + JSON.stringify(prose) : ''),
                prose.length === 1 && prose[0].over <= 0 && prose[0].out === 0 && prose[0].rows > 5 && prose[0].w <= 360);
        }
    } finally {
        fs.rmSync(TMP, { recursive: true, force: true });
    }
    console.log(`\ntest_shown_file: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
