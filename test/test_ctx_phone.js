// X-443 — A HOST COMMAND OF THE RIGHT-CLICK CATALOGUE ON A PHONE. Every command has one verdict
// (src/core/ctxPhone.ts): a page of the phone, the phone's clipboard, the same command run on the farm
// with the view's ask, or the PC's own — and a `run` handler speaks through that ask, so nothing a
// phone picks opens a dialog on the PC. The sheet, the relay and ui.ctxmenu all read the one table.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { CTX_ITEMS, ctxPageActions } = require(path.join(ROOT, 'out', 'core', 'ctxmenu.js'));
const P = require(path.join(ROOT, 'out', 'core', 'ctxPhone.js'));
const manifest = JSON.parse(read('package.json'));
const titles = new Map(manifest.contributes.commands.map(c => [c.command, c.title]));
const titleOf = c => titles.get(c) || '';

// ---- the table: every catalogue command, one verdict
{
    const problems = P.ctxPhoneProblems();
    ok('every host command of the catalogue has a phone verdict, and the table has no stranger' + (problems.length ? ' — ' + problems.join(' · ') : ''), problems.length === 0);
    const commands = [...new Set(CTX_ITEMS.filter(i => i.command).map(i => i.command))];
    ok('(the catalogue has host commands to judge)', commands.length > 40);
    const kinds = {};
    for (const c of commands) { const v = P.ctxPhoneVerdict(c); kinds[v.on] = (kinds[v.on] || 0) + 1; }
    ok('the four verdicts are all in use', kinds.page > 0 && kinds.copy > 0 && kinds.run > 0 && kinds.pc > 0);
    ok('a command that stays on the PC says why', commands.every(c => { const v = P.ctxPhoneVerdict(c); return v.on !== 'pc' || v.why.length > 10; }));
    ok('a command the catalogue does not have has no verdict', P.ctxPhoneVerdict('agentfarm.openFarmSettings') === undefined && P.ctxPhoneVerdict('toString') === undefined);
    const pageSrc = read('src/panels/remotePages.ts') + read('src/panels/remotePagesMore.ts');
    ok('a page verdict names a page a phone can open (a key of the farm\'s phone pages)',
        commands.every(c => { const v = P.ctxPhoneVerdict(c); return v.on !== 'page' || new RegExp('\\n        ' + v.to + ': \\{').test(pageSrc); }));
}

// ---- what the phone is sent
const items = P.ctxPhoneItems(titleOf);
{
    ok('a command that stays on the PC is not sent to a phone', items.every(i => P.ctxPhoneVerdict(i.command).on !== 'pc')
        && !items.some(i => i.command === 'agentfarm.revealAgent' || i.command === 'agentfarm.launchSession'));
    ok('every item carries the manifest\'s own title, its when clause and its group', items.length > 10
        && items.every(i => i.title === titleOf(i.command) && i.title && i.when && /^\d_[a-z]+@\d+$/.test(i.group)));
    const pin = items.find(i => i.command === 'agentfarm.pinSession');
    ok('a run item tells the phone only that it is the farm\'s', !!pin && JSON.stringify(pin.phone) === '{"on":"run"}');
    const open = items.find(i => i.command === 'agentfarm.openSession');
    ok('a page item says which page and what of the row fills it', open.phone.on === 'page' && open.phone.to === 'session' && open.phone.args.sessionId === 'sessionId');
    ok('with no title source the command\'s own name stands', P.ctxPhoneItems(() => '').find(i => i.command === 'agentfarm.pinSession').title === 'pinSession');
    const note = P.ctxPhoneNote;
    ok('ui.ctxmenu says where a pick is answered for a phone', note('agentfarm.pinSession').phone === 'run' && note('agentfarm.copySessionId').phone === 'copy'
        && note('agentfarm.revealAgent').phone === 'pc' && /file manager/.test(note('agentfarm.revealAgent').phoneWhy)
        && note('agentfarm.consoleForAgent').phone === 'page' && note('agentfarm.ctx.ndClear').phone === 'page action');
    ok('…and the op adds it to every item', /items: items\.map\(i => \(\{ \.\.\.i, \.\.\.ctxPhoneNote\(i\.command\) \}\)\)/.test(read('src/extension.ts')));
}

// ---- the farm's judgement of a command a phone asks it to run
{
    const row = { webviewSection: 'afSessionRow', sessionId: 's1', file: 'C:/t.jsonl', title: 'A', n: 3, on: true };
    const run = P.ctxPhoneRun('agentfarm.pinSession', { ...row, ask: { info() { } }, obj: { x: 1 }, afSelectedSessions: ['s1', 's2', { no: 1 }], nan: NaN });
    ok('a run command on its own row is accepted at its scope', run.ok === true && run.command === 'agentfarm.pinSession' && run.scope === 'manage');
    ok('…with the row\'s plain values', run.arg.sessionId === 's1' && run.arg.file === 'C:/t.jsonl' && run.arg.n === 3 && run.arg.on === true);
    ok('‼️ …and nothing else the phone put there: no ask of its own, no object', !('ask' in run.arg) && !('obj' in run.arg) && !('nan' in run.arg));
    ok('…a selection travels as the list of plain ids it is', JSON.stringify(run.arg.afSelectedSessions) === '["s1","s2"]');
    ok('a string for an ask is dropped too', !('ask' in P.ctxPhoneRun('agentfarm.pinSession', { ...row, ask: 'x' }).arg));
    const pcOnly = P.ctxPhoneRun('agentfarm.revealSessionFolder', row);
    ok('a command that stays on the PC is refused, with its reason', pcOnly.ok === false && /Not available on the phone/.test(pcOnly.why) && /file manager/.test(pcOnly.why));
    ok('a command the phone answers itself is not the farm\'s to run', P.ctxPhoneRun('agentfarm.copySessionId', row).ok === false);
    ok('a command that is not of the catalogue is refused', P.ctxPhoneRun('workbench.action.reloadWindow', row).ok === false
        && P.ctxPhoneRun(undefined, row).ok === false && P.ctxPhoneRun('constructor', row).ok === false);
    ok('‼️ a run command is refused on a row whose menu does not draw it', P.ctxPhoneRun('agentfarm.consoleEndSession', row).ok === false
        && P.ctxPhoneRun('agentfarm.consoleEndSession', { webviewSection: 'afConsoleSession', hostId: 'cs1' }).ok === true);
    ok('no context is no row', P.ctxPhoneRun('agentfarm.pinSession', null).ok === false && P.ctxPhoneRun('agentfarm.pinSession', ['afSessionRow']).ok === false);
}

// ---- a run handler speaks through the ask it was handed (its own source)
{
    const lines = read('src/extension.ts').split(/\r?\n/);
    const starts = [];
    lines.forEach((l, i) => { if (/vscode\.commands\.registerCommand\(/.test(l)) { starts.push(i); } });
    const bodyOf = command => {
        const at = lines.findIndex(l => l.includes("registerCommand('" + command + "'"));
        if (at < 0) { return ''; }
        return lines.slice(at, starts.find(s => s > at) || lines.length).join('\n');
    };
    const runs = Object.keys(P.CTX_PHONE).filter(c => P.CTX_PHONE[c].on === 'run');
    const PC_ASK = /vscode\.window\.(show\w*|create\w*|withProgress)|vscode\.env\.clipboard/;
    for (const c of runs) {
        const body = bodyOf(c);
        ok(`‼️ ${c}: its handler asks and says nothing with vscode.window`, body.length > 0 && !PC_ASK.test(body));
    }
    const SAYS = ['agentfarm.renameSession', 'agentfarm.resumeInConsole', 'agentfarm.consoleResumeSession',
        'agentfarm.consoleInterruptTurn', 'agentfarm.consoleForgetSession', 'agentfarm.pinSession',
        'agentfarm.tagSession', 'agentfarm.endSession', 'agentfarm.forceKillSession', 'agentfarm.interruptSession',
        'agentfarm.dismissSession', 'agentfarm.assignSessionProject', 'agentfarm.assignProject',
        'agentfarm.addSessionFolderToProject', 'agentfarm.sessionToWiki', 'agentfarm.planUsageRefresh',
        'agentfarm.insightHistory', 'agentfarm.restoreInsights', 'agentfarm.syncAntigravity', 'agentfarm.copyCorpus'];
    for (const c of SAYS) { ok(`${c}: what it says goes to the ask in its argument`, /arg\??\.ask/.test(bodyOf(c))); }
    ok('(the test can tell: a handler that still asks on the PC is caught)', PC_ASK.test(bodyOf('agentfarm.compileWiki')) && PC_ASK.test(bodyOf('agentfarm.backlogAdd')));
    // a command a run handler hands on is held to the same rule
    const delegate = bodyOf('agentfarm.delegateInsight');
    ok('‼️ insightHistory hands its ask to delegateInsight, which asks and says nothing with vscode.window',
        /executeCommand\('agentfarm\.delegateInsight', live, arg\?\.ask\)/.test(bodyOf('agentfarm.insightHistory'))
        && /async \(ins\?: Insight, phone\?: PanelAsk\)/.test(delegate) && /const ask = phone \?\? desktopAsk\(\);/.test(delegate) && !PC_ASK.test(delegate)
        && /resolveAgent\(undefined, ask\)/.test(delegate));
    ok('a button that opens the PC\'s editor, diff or Tasks view is not offered to a phone',
        /\.\.\.\(phone \? \[\] : \['Show Tasks'\]\)/.test(delegate)
        && /const onPc = \(\.\.\.buttons: string\[\]\): string\[\] => \(arg\?\.ask \? \[\] : buttons\);/.test(bodyOf('agentfarm.syncAntigravity'))
        && (bodyOf('agentfarm.syncAntigravity').match(/\.\.\.onPc\('(Open AGENTS\.md|Show Diff)'\)/g) || []).length === 3
        && !/[^.]'Show Diff',|, 'Open AGENTS\.md'\)/.test(bodyOf('agentfarm.syncAntigravity')));

    // the helpers a run handler leans on ask through the same ask, and every call hands it on
    const helperOf = name => {
        const at = lines.findIndex(l => l.startsWith('    const ' + name + ' = '));
        if (at < 0) { return ''; }
        const end = lines.findIndex((l, i) => i > at && /^    (const |\/\*\*|\/\/ )/.test(l));
        return lines.slice(at, end < 0 ? lines.length : end).join('\n');
    };
    const HELPERS = ['interruptSession', 'pickLiveSessionId', 'endLiveSession', 'forceKillLiveSession', 'askWikiTopics', 'resolveAgent'];
    for (const h of HELPERS) {
        const body = helperOf(h);
        ok(`‼️ helper ${h}: it takes the ask and asks nothing with vscode.window`, body.length > 0 && /ask: PanelAsk/.test(body) && !PC_ASK.test(body));
    }
    const calls = [];
    for (const c of runs) {
        for (const h of HELPERS) {
            for (const m of bodyOf(c).matchAll(new RegExp('[^.\\w]' + h + '\\(((?:[^()]|\\([^()]*\\))*)\\)', 'g'))) { calls.push([c, h, m[1]]); }
        }
    }
    ok('(the run handlers do call the helpers: ' + calls.length + ' calls)', calls.length >= 9);
    const dropped = calls.filter(([, , a]) => !/(^|[\s,])(arg\.)?ask$/.test(a.trim()));
    ok('‼️ …and every call hands the handler\'s ask on' + (dropped.length ? ' — not: ' + dropped.map(d => d[0] + '→' + d[1]).join(', ') : ''), dropped.length === 0);
    const corpus = bodyOf('agentfarm.copyCorpus');
    ok('‼️ X-552: a farm-made text goes to the ask\'s clipboard, and a phone names only a transcript the index knows',
        /await ask\.copy\(got\.text\);/.test(corpus) && /const file = arg\?\.ask \? sessionFromArg\(arg\.afCorpusFile \|\| undefined\)\?\.file : arg\?\.afCorpusFile;/.test(corpus)
        && /corpusFor\(file,/.test(corpus));
    ok('a session row carries its relay chain for the phone (afChain)', /afChain: \(s && s\.chain && s\.chain\.chainId\) \|\| ''/.test(read('media/afSessionCtx.js')));
    ok('the phone\'s agent page finds an agent by name when the row has no id',
        /agents\.find\(a => typeof args\?\.agentName === 'string' && !!args\.agentName && a\.name === args\.agentName\)\?\.id \?\? ''/.test(read('src/extension.ts')));
    ok('the desktop keeps its own topic picker; a phone types the topics', /arg\?\.ask\s*\?\s*await askWikiTopics\(wikiStore, list\.length, arg\.ask\)\s*:\s*await pickWikiTopics\(/.test(bodyOf('agentfarm.sessionToWiki')));
    ok('‼️ a row that opens a PC form is not offered to a phone', ['agentfarm.assignSessionProject', 'agentfarm.assignProject']
        .every(c => /\.\.\.\(arg\?\.ask \? \[\] : \[\{ label: '\$\(add\) New project/.test(bodyOf(c))));
    const all = lines.join('\n');
    const rowId = all.slice(all.indexOf('const consoleRowId = '), all.indexOf('const consoleRowId = ') + 700);
    ok('the Console row lookup they share says a stale row to the same ask', /arg\?\.ask \?\? desktopAsk\(\)\)\.info\(/.test(rowId) && !/vscode\.window\./.test(rowId.split('return id;')[0]));
}

// ---- on the phone: the row's sheet offers them, and a pick goes where the verdict says
{
    const menu = [...ctxPageActions(), ...items].sort((a, b) => a.group.localeCompare(b.group));
    const sent = [], copied = [];
    const win = {
        __AFUI__: { ctxMenu: menu },
        acquireVsCodeApi: () => ({ postMessage: m => sent.push(m) }),
        AFCtx: { copy: v => copied.push(v) }
    };
    const sb = { window: win, document: {}, JSON, RegExp, String, Object, Number, setTimeout, clearTimeout };
    vm.runInNewContext(read('media/afRowCmd.js'), sb);
    vm.runInNewContext(read('media/afMobile.js'), sb);
    const M = win.AFMobile, R = win.AFRowCmd;
    const cmds = ctx => M.actionsFor(ctx).filter(a => a.command).map(a => a.command.replace('agentfarm.', ''));
    const session = { webviewSection: 'afSessionRow', sessionId: 's1', file: '', title: 'A', agentName: 'dev', cwd: '' };
    const onSession = cmds(session);
    ok('a session row offers the commands a phone can answer', ['openSession', 'resumeInConsole', 'renameSession', 'pinSession', 'copySessionId'].every(c => onSession.includes(c)));
    ok('…not one whose row value is empty (no path, no folder)', !onSession.includes('copySessionPath') && !onSession.includes('copySessionCwd'));
    ok('…its stop, label, wiki and project commands among them', ['interruptSession', 'endSession', 'forceKillSession', 'dismissSession', 'tagSession',
        'sessionToWiki', 'assignSessionProject', 'addSessionFolderToProject'].every(c => onSession.includes(c)));
    ok('…and none that stays on the PC', !onSession.includes('revealSessionFolder') && !onSession.includes('resumeSession'));
    ok('…nor an agent row\'s own', !onSession.includes('consoleForAgent') && !onSession.includes('openAgentDetail'));
    const full = cmds({ ...session, file: 'C:/t.jsonl', cwd: 'D:/w' });
    ok('a row that knows its path and folder offers those copies', full.includes('copySessionPath') && full.includes('copySessionCwd'));
    const onAgent = cmds({ webviewSection: 'afAgentRow', agentId: 'a1', agentName: 'dev', agentDir: 'D:/a' });
    ok('an agent row offers its page, its Console, its project rule, its engine sync and its copies',
        onAgent.join() === ['openAgentDetail', 'consoleForAgent', 'assignProject', 'syncAntigravity', 'copyAgentName', 'copyAgentFolder'].join());
    const noId = cmds({ webviewSection: 'afAgentRow', agentId: '', agentName: 'dev' });
    ok('…an agent row with no id offers no page and no Console', !noId.includes('openAgentDetail') && !noId.includes('consoleForAgent'));
    const onCard = cmds({ webviewSection: 'afConsoleSession', hostId: 'cs1', sessionId: 's1' });
    ok('a Console card offers its own five', ['consoleResumeSession', 'consoleInterruptTurn', 'consoleEndSession', 'consoleEndAndRemove', 'consoleForgetSession'].every(c => onCard.includes(c)));
    ok('the page actions are still offered beside them', M.actionsFor({ webviewSection: 'afNeedRow', afClearable: true }).some(a => a.act === 'ndClear'));
    const by = c => menu.find(a => a.command === 'agentfarm.' + c);
    R.pick(by('pinSession'), session);
    ok('‼️ a run pick asks the farm for the same command with the row\'s context', sent.length === 1 && sent[0].type === 'afctxcmd'
        && sent[0].command === 'agentfarm.pinSession' && sent[0].ctx.sessionId === 's1' && sent[0].ctx.webviewSection === 'afSessionRow');
    R.pick(by('openSession'), session);
    ok('a page pick opens the phone\'s own page, named from the row (an empty key is not sent)',
        sent.length === 2 && sent[1].type === 'afnav' && sent[1].to === 'session' && JSON.stringify(sent[1].args) === '{"sessionId":"s1"}');
    R.pick(by('copySessionId'), session);
    ok('a copy pick is the phone\'s own clipboard: nothing goes to the farm', sent.length === 2 && copied.join() === 's1');
    R.pick(by('sessionToQueue'), session);
    ok('‼️ Add to Queue opens the phone\'s own Work Queue page, naming the session (the farm builds the draft)',
        sent.length === 3 && sent[2].type === 'afnav' && sent[2].to === 'queue' && JSON.stringify(sent[2].args) === '{"session":"s1"}');
    // X-552 — the relay chain: the row carries it (afChain), so the PC's chain list is not needed
    const chained = { ...session, afChain: 'chn_x1' };
    ok('‼️ a chained session row offers Show Chain and Copy Chain ID, an unchained one neither',
        cmds(chained).includes('showChain') && cmds(chained).includes('copyChainId') && !onSession.includes('showChain') && !onSession.includes('copyChainId'));
    ok('…on a Console card too, by the same key', cmds({ webviewSection: 'afConsoleSession', hostId: 'cs1', sessionId: 's1', afChain: 'chn_x1' }).includes('showChain'));
    R.pick(by('showChain'), chained);
    ok('‼️ Show Chain opens the phone\'s own chain page on that chain', sent.length === 4 && sent[3].to === 'chains' && JSON.stringify(sent[3].args) === '{"chain":"chn_x1"}');
    R.pick(by('copyChainId'), chained);
    ok('Copy Chain ID is the phone\'s own clipboard', sent.length === 4 && copied.join() === 's1,chn_x1');
    ok('the phone\'s when drops only the PC-list term, and only for a page or a copy', by('showChain').when.indexOf(' in ') < 0
        && CTX_ITEMS.some(i => i.command === 'agentfarm.showChain' && / in agentfarm\.chainSessions/.test(i.when))
        && items.filter(i => i.phone.on === 'run').every(i => CTX_ITEMS.some(c => c.command === i.command && c.when === i.when)));
    R.pick(by('openSessionAgent'), session);
    ok('Open Agent opens the phone\'s agent page by the row\'s agent name', sent.length === 5 && sent[4].to === 'agent' && JSON.stringify(sent[4].args) === '{"agentName":"dev"}');
    R.pick(by('consoleForAgent'), { webviewSection: 'afAgentRow', agentId: 'a1', agentName: 'dev', agentDir: 'D:/a' });
    ok('‼️ X-552: an agent row\'s Console pick opens the phone\'s own Console page on that agent',
        sent.length === 6 && sent[5].type === 'afnav' && sent[5].to === 'console' && JSON.stringify(sent[5].args) === '{"agentId":"a1"}');
    const ext = read('src/extension.ts');
    const maker = ext.slice(ext.indexOf('            console: (host, args) => {'), ext.indexOf('            now: host => NowPanel.openOn('));
    ok('‼️ …which the farm opens as the PC\'s command does: one function builds what the Console is told, for an agent it knows',
        /const agentId = consolePageAgent\(args, agents\);\s+if \(agentId === undefined\) \{ return false; \}/.test(maker)
        && /ConsolePanel\.openOn\(host, consoleDeps, agentId\s+\? consoleOptsForAgent\(agentId, \{ seed: seedLastLaunch, accountFor: launchAccountFor \}\) : undefined\);/.test(maker)
        && /ConsolePanel\.show\(consoleDeps, consoleOptsForAgent\(agent\.id, \{ seed: seedLastLaunch, accountFor: launchAccountFor \}\)\);/.test(
            ext.slice(ext.indexOf("registerCommand('agentfarm.consoleForAgent'"), ext.indexOf("registerCommand('agentfarm.openWebView'")))
        && !/treeMenuDoor/.test(ext));
    ok('the phone layer hands a command pick to afRowCmd and a page action to the page', /if \(a\.command\) \{ window\.AFRowCmd\.pick\(a, ctx\); return; \}/.test(read('media/afMobile.js')));
    const base = read('src/panels/base.ts');
    ok('every page is sent the script, after the phone layer', base.indexOf('src="${rowCmd}"') > base.indexOf('src="${mobile}"') && /'media', 'afRowCmd\.js'/.test(base));
    ok('…and a phone\'s view is sent the menu with the commands in it', /ctxMenu: phoneCtxMenu\(\)/.test(base));
}

// ---- the farm's relay: scope, the view's own ask, never the page's message
{
    class EventEmitter {
        constructor() { this.listeners = []; }
        get event() { return fn => { this.listeners.push(fn); return { dispose: () => { this.listeners = this.listeners.filter(x => x !== fn); } }; }; }
        fire(e) { for (const f of [...this.listeners]) { f(e); } }
        dispose() { this.listeners = []; }
    }
    const uri = p => ({ path: p, fsPath: p, scheme: 'file', toString: () => 'file://' + p });
    const ran = [];
    let boom = false;
    const stub = {
        EventEmitter, Uri: { joinPath: (b, ...parts) => uri([b.path, ...parts].join('/')), file: uri, parse: uri },
        window: {}, extensions: { getExtension: () => ({ packageJSON: manifest }) },
        commands: { executeCommand: (c, arg) => { ran.push([c, arg]); return boom ? Promise.reject(new Error('it broke')) : Promise.resolve(); } }
    };
    const load = Module._load;
    Module._load = function (request, ...rest) { return request === 'vscode' ? stub : load.call(this, request, ...rest); };
    const { RemoteViews } = require(path.join(ROOT, 'out', 'panels', 'remoteViews.js'));
    const { phoneCtxMenu } = require(path.join(ROOT, 'out', 'panels', 'remoteCtx.js'));
    Module._load = load;

    const sent = phoneCtxMenu();
    ok('the menu a phone is sent: page actions and commands, in the catalogue\'s group order',
        sent.some(a => a.act === 'ndClear') && sent.some(a => a.command === 'agentfarm.pinSession' && a.title === titleOf('agentfarm.pinSession'))
        && sent.every((a, i) => i === 0 || sent[i - 1].group.localeCompare(a.group) <= 0));

    const ORDER = ['read', 'answer', 'manage', 'admin'];
    const pageGot = [];
    const views = new RemoteViews({
        media: uri('/media'), waitMs: 5,
        atLeast: (have, needed) => ORDER.indexOf(have) >= 0 && ORDER.indexOf(have) >= ORDER.indexOf(needed),
        pages: { sessions: { open: 'read', act: 'manage', looks: [], answers: [], pcOnly: [], make(host) { host.webview.onDidReceiveMessage(m => pageGot.push(m)); } } }
    });
    const phone = { manage: [], read: [] };
    const manage = { device: 'd1', scope: 'manage' }, reader = { device: 'd2', scope: 'read' };
    views.open(manage, 'v1', 'sessions', undefined, m => phone.manage.push(m));
    views.open(reader, 'v2', 'sessions', undefined, m => phone.read.push(m));
    const row = { webviewSection: 'afSessionRow', sessionId: 's1' };

    const a = views.message(manage, 'v1', { type: 'afctxcmd', command: 'agentfarm.pinSession', ctx: { ...row, ask: 'mine', obj: {} }, afPress: true });
    ok('‼️ a manage phone\'s pick runs the same command on the farm', a.ran === true && a.act === true && ran.length === 1 && ran[0][0] === 'agentfarm.pinSession');
    const arg = ran[0][1];
    ok('…for the row it named', arg.sessionId === 's1' && arg.webviewSection === 'afSessionRow' && !('obj' in arg));
    ok('‼️ …with the VIEW\'s ask, whatever the phone sent as one', typeof arg.ask === 'object' && typeof arg.ask.info === 'function' && typeof arg.ask.input === 'function');
    void arg.ask.info('told on the phone');
    ok('…so what the handler says is said on that phone', phone.manage.some(m => m.type === 'afAsk' && m.message === 'told on the phone'));
    ok('the page\'s own handler never sees the pick', pageGot.length === 0);

    const b = views.message(reader, 'v2', { type: 'afctxcmd', command: 'agentfarm.pinSession', ctx: row });
    ok('‼️ a read phone\'s pick does not run', b.ran === false && ran.length === 1);
    ok('…and it is told what it would need', phone.read.some(m => m.type === 'afAsk' && /This phone may read; this needs manage/.test(m.message)));

    const c = views.message(manage, 'v1', { type: 'afctxcmd', command: 'agentfarm.revealSessionFolder', ctx: row });
    ok('a command that stays on the PC does not run from a phone, and says so there', c.ran === false && ran.length === 1
        && phone.manage.some(m => m.type === 'afAsk' && /Not available on the phone/.test(m.message)));
    const d = views.message(manage, 'v1', { type: 'afctxcmd', command: 'workbench.action.reloadWindow', ctx: row });
    ok('‼️ a command that is not of the catalogue never reaches executeCommand', d.ran === false && ran.length === 1);
    ok('a pick for a view that is not open is nobody\'s', views.message(manage, 'nope', { type: 'afctxcmd', command: 'agentfarm.pinSession', ctx: row }) === undefined && ran.length === 1);

    boom = true;
    views.message(manage, 'v1', { type: 'afctxcmd', command: 'agentfarm.pinSession', ctx: row });
    setTimeout(() => {
        ok('a command that fails says so on the phone', phone.manage.some(m => m.type === 'afAsk' && m.level === 'error' && /it broke/.test(m.message)));
        phonePage();
    }, 20);
}

// ---- the sheet itself, laid out on a phone: every item reachable, a pick sent
function phonePage() {
    let bin;
    try { bin = require('./shoot_page').browser(); } catch { bin = null; }
    if (!bin) { console.log('test_ctx_phone: no Chrome here — the laid-out sheet was not measured'); return done(); }
    const { execFileSync } = require('child_process');
    const { headlessFlags, sweepAndReport } = require('./headless_chrome');
    const { withPhoneLayer, windowSize } = require('./phone_frame');
    const menu = [...ctxPageActions(), ...items].sort((a, b) => a.group.localeCompare(b.group));
    const ctx = { webviewSection: 'afSessionRow', sessionId: 'b1946ac9-2f0e-4c1d-9d5e-0a1b2c3d4e5f', file: 'C:/Users/x/.claude/projects/p/b1946ac9.jsonl', title: 'Uzun bir oturum', agentName: 'developer', cwd: 'D:/zone/dev' };
    const inline = s => s.replace(/<\/script/gi, '<\\/script');
    const PAGE = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>'
        + '<div class="af-head"><div class="af-head-nav"><button>Dashboard</button></div></div>'
        + '<div id="row" data-vscode-context="' + JSON.stringify(ctx).replace(/"/g, '&quot;') + '">a session</div>'
        + '<script>window.__AFUI__={ctxMenu:' + inline(JSON.stringify(menu)) + '};window.__sent=[];window.__copied=[];'
        + 'window.acquireVsCodeApi=function(){return{postMessage:function(m){window.__sent.push(m);}};};'
        + 'window.AFCtx={copy:function(v){window.__copied.push(v);}};'
        + inline(read('media/afI18n.js')) + '\n' + inline(read('media/pageHeader.js')) + '\n' + inline(read('media/afRowCmd.js')) + '</script>'
        + '</body></html>';
    const MARK = 'AF-CTXPHONE';
    const expr = `(function(){
        var r={phone:document.documentElement.classList.contains('af-phone'), w:window.innerWidth, h:window.innerHeight};
        r.open=window.AFMobile.openRow(document.getElementById('row'), null);
        var s=document.getElementById('af-sheet');
        var b=[].slice.call(s.querySelectorAll('[data-afrowact]'));
        r.items=b.map(function(x){return x.textContent;});
        r.minH=Math.min.apply(null,b.map(function(x){return x.getBoundingClientRect().height;}));
        r.xH=s.querySelector('[data-afsheetx]').getBoundingClientRect().height;
        r.sheetH=s.getBoundingClientRect().height; r.scrollW=s.scrollWidth; r.clientW=s.clientWidth;
        r.reach=s.scrollHeight<=s.clientHeight || getComputedStyle(s).overflowY==='auto';
        r.wide=b.filter(function(x){return x.scrollWidth>x.clientWidth+1;}).length;
        b[r.items.indexOf(${JSON.stringify(titleOf('agentfarm.pinSession'))})].click();
        r.sent=window.__sent.slice(); r.closed=!document.getElementById('af-sheet');
        return r;})()`;
    const probe = '<script>window.addEventListener("load",function(){var out;try{out=JSON.stringify((' + expr + '));}catch(e){out=JSON.stringify("ERROR: "+e.message);}'
        + 'document.body.innerHTML="<pre id=\\"' + MARK + '\\"></pre>";document.getElementById("' + MARK + '").textContent=out;});</script>';
    const file = path.join(os.tmpdir(), 'af-ctxphone-' + process.pid + '.html');
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'af-ctxphone-'));
    let got = null;
    try {
        fs.writeFileSync(file, withPhoneLayer(PAGE, 'sessions').replace(/<\/body>(?![\s\S]*<\/body>)/i, probe + '</body>'), 'utf8');
        const dom = execFileSync(bin, headlessFlags(profile).concat([windowSize({ w: 500, h: 800 }), '--virtual-time-budget=3000',
            '--dump-dom', 'file:///' + file.replace(/\\/g, '/')]), { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] });
        const m = new RegExp('<pre id="' + MARK + '">([\\s\\S]*?)</pre>').exec(dom);
        got = m ? JSON.parse(m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')) : null;
    } finally {
        fs.rmSync(file, { force: true });
        try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* locked */ }
        sweepAndReport();
    }
    ok('(the phone page answered)' + (typeof got === 'string' ? ' — ' + got : ''), !!got && typeof got === 'object');
    if (got && typeof got === 'object') {
        ok('the page is in phone mode and the row\'s sheet opened', got.phone === true && got.open === true);
        const want = ['agentfarm.openSession', 'agentfarm.resumeInConsole', 'agentfarm.renameSession', 'agentfarm.pinSession',
            'agentfarm.copySessionId', 'agentfarm.copySessionPath', 'agentfarm.copySessionCwd'].map(titleOf);
        ok('the sheet lists the session commands a phone can answer, by the manifest\'s titles', want.every(t => got.items.includes(t)));
        ok('‼️ every item is a finger\'s height on a phone, and so is the sheet\'s ✕ (measured ' + got.minH + ' and ' + got.xH + ')', got.minH >= 44 && got.xH >= 44);
        ok('(the sheet was measured at a phone\'s width, with a list to scroll)', got.w <= 500 && got.items.length >= 7);
        ok('the sheet stays within three quarters of the screen and scrolls to the rest (measured ' + got.sheetH + ' of ' + got.h + ', scrolls ' + got.reach + ')',
            got.sheetH <= got.h * 0.75 + 1 && got.reach === true);
        ok('nothing runs off the side', got.scrollW <= got.clientW + 1 && got.wide === 0);
        ok('‼️ a tap on Pin sends the farm the command and closes the sheet', got.closed === true && got.sent.length === 1
            && got.sent[0].type === 'afctxcmd' && got.sent[0].command === 'agentfarm.pinSession' && got.sent[0].ctx.sessionId === ctx.sessionId);
    }
    done();
}

function done() {
    console.log(`test_ctx_phone: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
}
