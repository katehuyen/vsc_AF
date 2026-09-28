// M-54 — the browser recipe book: a recipe step runs on Agent Farm's own Playwright MCP on a
// signed-in profile, and what it downloads is filed into the gallery (src/core/browserRecipes.ts,
// src/core/browserDownloads.ts, src/core/browserLogin.ts).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const { EventEmitter } = require('events');
const { PassThrough } = require('stream');
const ROOT = path.resolve(__dirname, '..');
const fakeVscode = {
    EventEmitter: class { constructor() { this.c = []; } get event() { return cb => { this.c.push(cb); return { dispose() { } }; }; } fire(v) { this.c.forEach(cb => cb(v)); } dispose() { } },
    window: { showInformationMessage: () => Promise.resolve(), showWarningMessage: () => Promise.resolve(), createTerminal: () => ({ show() { }, sendText() { }, dispose() { } }), onDidCloseTerminal: () => ({ dispose() { } }) }
};
const origLoad = Module._load;
Module._load = function (r, p, m) { return r === 'vscode' ? fakeVscode : origLoad.call(this, r, p, m); };
const R = require(path.join(ROOT, 'out/core/browserRecipes.js'));
const D = require(path.join(ROOT, 'out/core/browserDownloads.js'));
const L = require(path.join(ROOT, 'out/core/browserLogin.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, a, b) => { const s = JSON.stringify(a) === JSON.stringify(b); ok(n, s); if (!s) { console.log('    got', JSON.stringify(a), 'want', JSON.stringify(b)); } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-brecipe-'));

/* ---------- the plan ---------- */
const env = { profilesRoot: path.join(tmp, 'profiles'), runDir: path.join(tmp, 'run') };
const none = R.planBrowser({ url: 'https://example.com/x', goal: 'g', allowHosts: ['example.com'] }, env);
ok('no recipe: no profile and no download folder — the agent\'s own MCP, as before', !none.recipe && !none.profileDir && !none.downloadDir && none.url === 'https://example.com/x');
eq('…its hosts its own, else Farm Settings\'', [none.hosts, R.planBrowser({ url: 'u', goal: 'g' }, { ...env, settingsHosts: ['a.com'] }).hosts], [['example.com'], ['a.com']]);
const flow = R.planBrowser({ url: '', goal: 'g', recipe: 'flow' }, env);
ok('a recipe fills the URL and hosts the step left empty', flow.url === 'https://labs.google/fx/tools/flow' && flow.hosts.includes('labs.google') && /preset: flow/.test(flow.why[0]));
ok('…gets its own profile and a download folder of the step\'s own', flow.profileDir === path.join(env.profilesRoot, 'flow') && flow.downloadDir === env.runDir);
eq('the step\'s own hosts and folder win over the recipe\'s', [R.planBrowser({ goal: 'g', recipe: 'flow', allowHosts: ['x.com'], downloadDir: 'D:\\dl' }, env).hosts, R.planBrowser({ goal: 'g', recipe: 'flow', downloadDir: 'D:\\dl' }, env).downloadDir], [['x.com'], 'D:\\dl']);
eq('approval: built-in ask, Farm Settings auto, the step\'s own wins', [
    R.planBrowser({ goal: 'g' }, env).confirm,
    R.planBrowser({ goal: 'g' }, { ...env, settingsApproval: 'auto' }).confirm,
    R.planBrowser({ goal: 'g', confirm: 'ask' }, { ...env, settingsApproval: 'auto' }).confirm,
    R.planBrowser({ goal: 'g', confirm: 'auto' }, env).confirm], ['ask', 'auto', 'ask', 'auto']);
eq('an unknown recipe is refused by name; none is fine', [R.browserRecipeRefusal(''), R.browserRecipeRefusal('flow'), /not a recipe \(web, flow, higgsfield\)/.test(R.browserRecipeRefusal('sora'))], ['', '', true]);

/* ---------- the browser it gets ---------- */
const cfg = R.playwrightMcpConfig(flow, 'win32');
eq('its only browser: Playwright MCP on the profile, saving into the download folder (cmd /c npx on Windows)', cfg.mcpServers.afbrowser,
    { command: 'cmd', args: ['/c', 'npx', '-y', '@playwright/mcp@latest', '--user-data-dir', flow.profileDir, '--output-dir', flow.downloadDir] });
eq('…npx itself elsewhere', R.playwrightMcpConfig(flow, 'linux').mcpServers.afbrowser.command, 'npx');
eq('the flags: that config, nothing else, its tools allowed', R.browserMcpArgs('C:\\o\\b.mcp.json'), '--mcp-config "C:\\o\\b.mcp.json" --strict-mcp-config --allowedTools mcp__afbrowser');
const p = R.buildRecipePrompt(flow, 'make a clip of {x}');
ok('the prompt names the site\'s way, the hosts, the login rule and the download rule', /GOAL: make a clip/.test(p) && /Google Flow: open or create/.test(p)
    && /labs\.google, accounts\.google\.com/.test(p) && /LOGIN NEEDED: Google Flow/.test(p) && /download button/.test(p));
ok('…and forbids switching accounts and names the guard page', /Never switch, add or sign out of an account/.test(p) && p.includes(R.GUARD_MARK));

/* ---------- the hosts, held by the browser ---------- */
eq('a guard file rides as --init-script', R.playwrightMcpConfig(flow, 'linux', '/o/k.guard.js').mcpServers.afbrowser.args.slice(-2), ['--init-script', '/o/k.guard.js']);
const vm = require('vm');
const page = (host, top = true, hash = '') => {
    const body = { textContent: '' };
    const w = { stopped: false, stop() { w.stopped = true; }, went: '',
        location: { hostname: host, hash, replace(u) { w.went = u; } },
        document: { readyState: 'complete', title: '', body, documentElement: body } };
    w.window = w; w.top = top ? w : {};
    vm.runInNewContext(R.hostGuardScript(['labs.google', 'accounts.google.com']), w);
    return { stopped: w.stopped, went: w.went, title: w.document.title, text: body.textContent };
};
eq('an allowed host and its subdomains load untouched', [page('labs.google').stopped, page('www.labs.google').stopped, page('accounts.google.com').stopped], [false, false, false]);
const off = page('flow.google.com');
const said = decodeURIComponent(off.went.replace(/^about:blank#/, ''));
ok('a host outside the list is stopped before the site runs and swapped for a blank page carrying why', off.stopped && /^about:blank#/.test(off.went)
    && said.startsWith(R.GUARD_MARK) && /flow\.google\.com is outside/.test(said) && /labs\.google, accounts\.google\.com/.test(said));
const shown = page('', true, '#' + encodeURIComponent(said));
ok('…and that blank page reads the reason out in its title and body', shown.title === R.GUARD_MARK && shown.text === said);
eq('…a look-alike suffix is not a subdomain', page('evillabs.google').stopped, true);
eq('a frame inside an allowed page is left alone, as is a hostless page not ours', [page('flow.google.com', false).stopped, page('').stopped, page('', true, '#top').text], [false, false, '']);

/* ---------- what it downloaded ---------- */
const dl = path.join(tmp, 'dl');
fs.mkdirSync(dl, { recursive: true });
const since = Date.now();
fs.writeFileSync(path.join(dl, 'old.mp4'), 'OLD');
fs.utimesSync(path.join(dl, 'old.mp4'), new Date(since - 60000), new Date(since - 60000));
['clip-42.mp4', 'page-2026-09-27T12-35-02-489Z.yml', 'page-2026-09-27T12-35-03-001Z.png', 'half.mp4.crdownload', 'empty.png'].forEach(n => fs.writeFileSync(path.join(dl, n), n === 'empty.png' ? '' : 'x'));
eq('downloads = new, non-empty, never Playwright\'s own snapshots or a half download', D.downloadedFiles(dl, since).map(f => path.basename(f)), ['clip-42.mp4']);
eq('a missing folder is no downloads', D.downloadedFiles(path.join(tmp, 'nope'), since), []);
const arch = '# T\n\n---\n\nI made it.\n\n---\nFinished: now · exit 0\n';
eq('the answer lists them above the footer', D.withDownloads(arch, ['F1'], ['Library: F1 → x']), '# T\n\n---\n\nI made it.\n\nDownloaded files:\n- F1\n- Library: F1 → x\n\n---\nFinished: now · exit 0\n');

/* ---------- sign in once ---------- */
const runs = [];
const lo = L.openRecipeLogin({ recipe: 'higgsfield', root: path.join(tmp, 'profiles'), env: { ProgramFiles: 'C:\\PF' }, exists: f => f === path.join('C:\\PF', 'Google', 'Chrome', 'Application', 'chrome.exe'), run: (c, a) => runs.push([c, a]) });
ok('sign-in opens plain Chrome on the recipe\'s profile at its site', lo.ok && runs.length === 1 && runs[0][1][0] === `--user-data-dir=${path.join(tmp, 'profiles', 'higgsfield')}`
    && runs[0][1].includes('https://higgsfield.ai') && !runs[0][1].some(a => /remote-debugging/.test(a)) && fs.existsSync(lo.profileDir));
ok('…and says to close it before a step runs', /CLOSE it/.test(lo.note));
ok('the web recipe needs a site; no Chrome is said plainly; an unknown recipe is refused',
    /pass url=/.test(L.openRecipeLogin({ recipe: 'web', root: tmp, run: () => { } }).error)
    && /Chrome was not found/.test(L.openRecipeLogin({ recipe: 'flow', root: tmp, env: {}, exists: () => false, run: () => { } }).error)
    && /No browser recipe "sora"/.test(L.openRecipeLogin({ recipe: 'sora', root: tmp }).error));
const lockDir = path.join(tmp, 'lockp');
fs.mkdirSync(lockDir, { recursive: true });
const free = [L.profileInUse(lockDir), (fs.writeFileSync(path.join(lockDir, 'lockfile'), ''), L.profileInUse(lockDir))];
fs.chmodSync(path.join(lockDir, 'lockfile'), 0o444);
ok('a profile is in use only when its lockfile cannot be opened (Chrome holds it: EBUSY)', free[0] === false && free[1] === false && L.profileInUse(lockDir) === (process.platform === 'win32'));
fs.chmodSync(path.join(lockDir, 'lockfile'), 0o666);
const listed = L.listBrowserRecipes(path.join(tmp, 'profiles'));
ok('the list says which profile has been opened', listed.find(r => r.id === 'higgsfield').profileExists && !listed.find(r => r.id === 'flow').profileExists);

/* ---------- the runtime: a recipe step end to end, claude faked ---------- */
(async () => {
    const cp = require('child_process');
    const commands = [];
    let mgr;
    cp.spawn = (cmd, a) => {
        const child = new EventEmitter();
        child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.pid = 4242; child.kill = () => true;
        commands.push(typeof cmd === 'string' && !Array.isArray(a) ? cmd : [cmd].concat(a || []).join(' '));
        setTimeout(() => {
            const t = mgr.tasks.find(x => x.status === 'running' && x.browserRun);
            if (t) {
                fs.writeFileSync(path.join(t.browserRun.downloadDir, 'veo-clip.mp4'), 'MP4');
                fs.writeFileSync(path.join(t.browserRun.downloadDir, 'page-2026-09-27T12-35-02-489Z.yml'), 'snapshot');
            }
            child.stdout.end('Rendered and downloaded veo-clip.mp4\n');
            setTimeout(() => child.emit('close', 0), 10);
        }, 20);
        return child;
    };
    const { TaskManager } = require(path.join(ROOT, 'out/core/tasks.js'));
    const agentDir = path.join(tmp, 'agent');
    fs.mkdirSync(agentDir, { recursive: true });
    const agent = { id: 'a1', name: 'browsy', dir: agentDir, normDir: agentDir.toLowerCase(), memoryFiles: [], toolFiles: [], contextLoad: {}, duties: [] };
    let asked = 0;
    mgr = new TaskManager(path.join(tmp, 'c.json'), () => [agent], () => false, () => '', {
        browserProfilesDir: () => path.join(tmp, 'profiles'), browserApproval: () => 'ask',
        confirmBrowser: async () => { asked++; return true; }
    });
    const settle = async (runId) => {
        let t;
        for (let i = 0; i < 300; i++) {
            await new Promise(r => setTimeout(r, 10));
            t = mgr.tasks.find(x => x.workflowRunId === runId);
            if (t && t.status !== 'running' && t.status !== 'queued') { break; }
        }
        return t;
    };
    const step = browser => [{ id: 'b', agentId: 'a1', agentName: 'browsy', title: 'Flow klip', prompt: '', mode: 'headless', browser }];
    try {
        const r1 = mgr.runWorkflow(mgr.addWorkflow('Tarayıcı reçetesi', step({ url: '', goal: 'make a clip', recipe: 'flow', confirm: 'auto' })));
        const t1 = await settle(r1);
        const cmd = commands[commands.length - 1] || '';
        const conf = JSON.parse(fs.readFileSync(t1.browserRun.mcpConfig, 'utf8'));
        ok('‼️ a recipe step runs claude on that config alone, its tools allowed', /--mcp-config "[^"]+\.mcp\.json" --strict-mcp-config --allowedTools mcp__afbrowser/.test(cmd));
        ok('…the config opens the recipe\'s profile and saves into the step\'s folder', conf.mcpServers.afbrowser.args.join(' ').includes(path.join(tmp, 'profiles', 'flow'))
            && conf.mcpServers.afbrowser.args.includes(t1.browserRun.downloadDir));
        const guardAt = conf.mcpServers.afbrowser.args[conf.mcpServers.afbrowser.args.indexOf('--init-script') + 1] || '';
        ok('‼️ …and the recipe\'s hosts are held by a guard script written beside it', /\.guard\.js$/.test(guardAt) && fs.existsSync(guardAt)
            && fs.readFileSync(guardAt, 'utf8').includes('"labs.google","accounts.google.com"'));
        ok('the step\'s own confirm:auto skipped the question Farm Settings would ask', asked === 0);
        ok('the step ends done', t1.status === 'done');
        const meta = JSON.parse(fs.readFileSync(path.join(mgr.outputsDir, t1.id + '.media.json'), 'utf8'));
        ok('‼️ the download lands in the gallery by itself (source browser), the snapshot does not', meta.source === 'browser' && meta.model === 'browser:flow'
            && meta.assetFiles.length === 1 && path.basename(meta.assetFiles[0]) === 'veo-clip.mp4');
        ok('…and the answer the next step reads names it', /Downloaded files:\n- .*veo-clip\.mp4/.test(fs.readFileSync(t1.outputFile, 'utf8')));

        const r2 = mgr.runWorkflow(mgr.addWorkflow('Eski yol', step({ url: 'https://example.com/r', goal: 'read it', allowHosts: ['example.com'] })));
        const t2 = await settle(r2);
        const cmd2 = commands[commands.length - 1] || '';
        ok('no recipe: the agent\'s own MCP, no config, nothing filed — as before', !/--mcp-config/.test(cmd2) && !t2.browserRun
            && !fs.existsSync(path.join(mgr.outputsDir, t2.id + '.media.json')) && asked === 1);

        const r3 = mgr.runWorkflow(mgr.addWorkflow('Bilinmeyen', step({ url: '', goal: 'g', recipe: 'sora' })));
        const t3 = await settle(r3);
        ok('an unknown recipe fails the step by name, nothing spawned', t3.status === 'failed' && commands.length === 2);

        const lf = path.join(tmp, 'profiles', 'flow', 'lockfile');
        fs.mkdirSync(path.dirname(lf), { recursive: true });
        fs.writeFileSync(lf, '');
        fs.chmodSync(lf, 0o444);
        const r4 = mgr.runWorkflow(mgr.addWorkflow('Profil açık', step({ url: '', goal: 'g', recipe: 'flow', confirm: 'auto' })));
        const t4 = await settle(r4);
        fs.chmodSync(lf, 0o666);
        if (process.platform === 'win32') {
            ok('‼️ a profile another Chrome holds fails the step before anything is paid for', t4.status === 'failed' && commands.length === 2);
        }
    } finally {
        mgr.dispose();
        fs.rmSync(tmp, { recursive: true, force: true });
    }

    /* ---------- the surfaces ---------- */
    const page = fs.readFileSync(path.join(ROOT, 'media/tasksPage.js'), 'utf8');
    const flex = fs.readFileSync(path.join(ROOT, 'media/afFlex.js'), 'utf8');
    ok('the step card has the recipe, ask-first and download-folder boxes', /pickSel\('st-bRecipe'/.test(page) && /pickSel\('st-bConfirm'/.test(page) && /textF\('st-bDownloadDir'/.test(page));
    const panel = fs.readFileSync(path.join(ROOT, 'src/panels/tasksPanel.ts'), 'utf8');
    ok('…and Sign in… beside a recipe, which the panel hands to the same sign-in the bridge uses', /id="nt-st-bLogin"/.test(page) && /post\(\{ type: 'browserLogin'/.test(page)
        && /case 'browserLogin'/.test(panel) && /browserLogin: \(recipe: string, url\?: string\) =>\s*openRecipeLogin\(/.test(fs.readFileSync(path.join(ROOT, 'src/extension.ts'), 'utf8')));
    ok('every box is a flex point', ['browser.recipe', 'browser.hosts', 'browser.confirm', 'browser.downloadDir'].every(id => flex.includes(`id: '${id}'`)));
    const ext = fs.readFileSync(path.join(ROOT, 'src/extension.ts'), 'utf8');
    ok('the bridge has browser.recipes and browser.login, and workflows.add refuses an unknown recipe', /op: 'browser\.recipes'/.test(ext) && /op: 'browser\.login'/.test(ext) && /browserRecipeRefusal\(\(raw\.browser/.test(ext));

    console.log(`test_browser_recipes: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
