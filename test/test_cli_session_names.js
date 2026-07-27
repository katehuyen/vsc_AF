// A session started with a name (`claude -n "…"`, what the Start Session…
// launcher passes) must SHOW that name. The name is not in the transcript: it
// lives only in the CLI's own live registry (~/.claude/sessions/<pid>.json),
// which dies with the process — so it is read from there, remembered, and
// applied as a title source above the derived title but below a user rename.
// Also: "Reveal folder" must open the folder, not select it in its parent.
const fs = require('fs');
const os = require('os');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { readCliSessions, mergeSessionNames, sessionsDir } =
    require(path.join(__dirname, '..', 'out', 'core', 'cliSessions.js'));
// reveal.ts talks to the file manager, so its module needs the vscode stub
const { revealActionFor } = (() => {
    const Module = require('module');
    const origLoad = Module._load;
    Module._load = function (request) {
        if (request === 'vscode') { return { Uri: {}, window: {}, commands: {}, env: {} }; }
        return origLoad.apply(this, arguments);
    };
    const m = require(path.join(__dirname, '..', 'out', 'core', 'reveal.js'));
    Module._load = origLoad;
    return m;
})();

// ---------- reading the CLI's registry ----------
{
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'af-cli-'));
    const dir = sessionsDir(home);
    fs.mkdirSync(dir, { recursive: true });
    ok('sessions dir is <claudeDir>/sessions', dir === path.join(home, 'sessions'));
    ok('a missing registry is empty, not an error', readCliSessions(path.join(home, 'nope')).length === 0);

    // the real shape, verified against a live file written by the CLI
    fs.writeFileSync(path.join(dir, '2264804.json'), JSON.stringify({
        pid: 2264804, sessionId: '8ae50684-6523-4a0c-bd86-da7a571b758e',
        cwd: 'D:\\zone\\agent\\ajanlar\\explorer', startedAt: 1785124993343,
        version: '2.1.220', peerProtocol: 1, kind: 'interactive', entrypoint: 'cli',
        name: 'deneme', status: 'idle', updatedAt: 1785125130106, statusUpdatedAt: 1785125130106
    }));
    // a session started without -n: no name field at all
    fs.writeFileSync(path.join(dir, '9999.json'), JSON.stringify({
        pid: 9999, sessionId: 'sid-unnamed', cwd: 'D:\\x', kind: 'interactive'
    }));
    // hostile neighbours
    fs.writeFileSync(path.join(dir, 'broken.json'), '{not json');
    fs.writeFileSync(path.join(dir, 'noid.json'), JSON.stringify({ pid: 1, name: 'x' }));
    fs.writeFileSync(path.join(dir, 'blankname.json'), JSON.stringify({ pid: 2, sessionId: 'sid-blank', name: '   ' }));
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'ignored');
    // a BOM-prefixed file (some editors) must still parse
    fs.writeFileSync(path.join(dir, '4321.json'),
        '\ufeff' + JSON.stringify({ pid: 4321, sessionId: 'sid-bom', name: 'bom-name' }));

    const list = readCliSessions(home);
    const byId = Object.fromEntries(list.map(s => [s.sessionId, s]));
    ok('the named live session is read', byId['8ae50684-6523-4a0c-bd86-da7a571b758e'].name === 'deneme');
    ok('…with its pid, cwd, kind and status', (() => {
        const s = byId['8ae50684-6523-4a0c-bd86-da7a571b758e'];
        return s.pid === 2264804 && /explorer$/.test(s.cwd) && s.kind === 'interactive' && s.status === 'idle';
    })());
    ok('an unnamed session is listed without a name', 'sid-unnamed' in byId && !byId['sid-unnamed'].name);
    ok('a blank name is not a name', byId['sid-blank'] && !byId['sid-blank'].name);
    ok('a BOM does not hide a session', byId['sid-bom'].name === 'bom-name');
    ok('broken JSON is skipped, not thrown', list.length === 4);
    ok('a record without a sessionId is useless and dropped', !list.some(s => !s.sessionId));
    fs.rmSync(home, { recursive: true, force: true });
}

// ---------- remembering: the registry file dies with the process ----------
{
    const live = [
        { sessionId: 'a', name: 'zen release' },
        { sessionId: 'b' },                       // unnamed
        { sessionId: 'c', name: 'audit' }
    ];
    const first = mergeSessionNames({}, live);
    ok('names found are remembered', first.a === 'zen release' && first.c === 'audit');
    ok('an unnamed session is not remembered as empty', !('b' in first));
    ok('a second identical scan changes nothing (no re-render)',
        mergeSessionNames(first, live) === undefined);
    ok('a name survives the session ending (empty scan changes nothing)',
        mergeSessionNames(first, []) === undefined);
    const renamed = mergeSessionNames(first, [{ sessionId: 'a', name: 'zen hotfix' }]);
    ok('a mid-run rename by the CLI wins', renamed.a === 'zen hotfix' && renamed.c === 'audit');
    ok('merging is immutable', first.a === 'zen release');
}

// ---------- the title precedence, as the index applies it ----------
{
    const Module = require('module');
    const origLoad = Module._load;
    Module._load = function (request) {
        if (request === 'vscode') {
            return {
                EventEmitter: class { constructor() { this.event = () => ({ dispose() { } }); } fire() { } dispose() { } },
                Uri: {}, window: {}, workspace: { getConfiguration: () => ({ get: (_k, d) => d }) },
                ViewColumn: {}, ConfigurationTarget: {}, env: {}
            };
        }
        return origLoad.apply(this, arguments);
    };
    const { SessionIndex } = require(path.join(__dirname, '..', 'out', 'core', 'sessions.js'));
    Module._load = origLoad;

    const idx = new SessionIndex('/nope', () => [], { costFor: () => 0 }, () => [], () => true, () => 1000);
    const s = { sessionId: 'sid1', autoTitle: 'fix the popup bug', title: 'fix the popup bug' };
    // reach the private map the way the extension does, then re-apply
    idx.sessions = new Map([['f1', s]]);
    idx.setCliNames({ sid1: 'zen release' });
    ok('a launch name replaces the derived title', s.title === 'zen release');
    ok('…and the derived title is still available for the tooltip', s.autoTitle === 'fix the popup bug');
    ok('the name is exposed as cliName', s.cliName === 'zen release');
    idx.setTitleOverrides({ sid1: 'my own name' });
    ok('a user rename outranks the launch name', s.title === 'my own name');
    idx.setTitleOverrides({});
    ok('clearing the rename falls back to the launch name, not the transcript', s.title === 'zen release');
    idx.setCliNames({});
    ok('with no name at all the derived title returns', s.title === 'fix the popup bug');
}

// ---------- reveal: a folder is opened, a file is revealed inside its folder ----------
{
    const isDir = p => (p === '/agents/dev' ? true : p === '/agents/dev/CLAUDE.md' ? false : undefined);
    ok('an agent folder is OPENED (not selected in the agents root)',
        revealActionFor('/agents/dev', isDir) === 'open-dir');
    ok('a file is revealed inside its folder', revealActionFor('/agents/dev/CLAUDE.md', isDir) === 'reveal-file');
    ok('a vanished path says so instead of opening something else',
        revealActionFor('/agents/gone', isDir) === 'missing');
    ok('an empty path is not a path', revealActionFor('', isDir) === 'missing');

    // no reveal call site may go back to the raw command — that is the bug
    const files = ['src/extension.ts', 'src/panels/settingsPanel.ts', 'src/panels/toolboxPanel.ts',
        'src/panels/airtablePanel.ts'];
    const offenders = files.filter(f =>
        /revealFileInOS/.test(fs.readFileSync(path.join(__dirname, '..', f), 'utf8')));
    ok('every reveal goes through the shared helper', offenders.length === 0
        || !console.log('    still raw: ' + offenders.join(', ')));
    ok('the agent reveal command uses the agent\'s OWN folder',
        /revealPath\(agent\.dir\)/.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8')));
}

// ---------- the view-title button order the user asked for ----------
{
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    const title = pkg.contributes.menus['view/title'].filter(m => m.when === 'view == agentfarm.agents');
    const order = title.map(m => ({ cmd: m.command, at: Number(m.group.replace('navigation@', '')) }))
        .sort((a, b) => a.at - b.at).map(x => x.cmd);
    ok('Start Session sits to the RIGHT of Open Dashboard',
        order.indexOf('agentfarm.launchSession') === order.indexOf('agentfarm.openDashboard') + 1);
    ok('…and nothing else claims the same slot',
        new Set(title.map(m => m.group)).size === title.length);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
