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

const {
    readCliSessions, mergeSessionNames, sessionsDir, isChosenName, ownerOf,
    describeOwner, liveSessionIds, pidAlive
} = require(path.join(__dirname, '..', 'out', 'core', 'cliSessions.js'));
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

    // The registry only describes RUNNING sessions, so the fixtures use this
    // very process's pid for the ones that must be read: a record whose
    // process is gone describes nothing (see the stale-file check below).
    const LIVE = process.pid;
    // the real shape, verified against live files written by the CLI
    fs.writeFileSync(path.join(dir, `${LIVE}.json`), JSON.stringify({
        pid: LIVE, sessionId: '8ae50684-6523-4a0c-bd86-da7a571b758e',
        cwd: 'D:\\zone\\agent\\ajanlar\\explorer', startedAt: 1785124993343,
        version: '2.1.220', peerProtocol: 1, kind: 'interactive', entrypoint: 'cli',
        name: 'deneme', nameSource: 'explicit', status: 'idle',
        updatedAt: 1785125130106, statusUpdatedAt: 1785125130106
    }));
    // …and a session nobody named: the CLI still writes a name, marked derived
    fs.writeFileSync(path.join(dir, 'derived.json'), JSON.stringify({
        pid: LIVE, sessionId: 'c2b47f03-ac6b-4c7a-925b-c06b8d48b28b',
        cwd: 'D:\\zone\\agent\\ajanlar\\basit', kind: 'interactive', entrypoint: 'cli',
        name: 'basit-2e', nameSource: 'derived', status: 'idle'
    }));
    // a session started without -n: no name field at all
    fs.writeFileSync(path.join(dir, 'unnamed.json'), JSON.stringify({
        pid: LIVE, sessionId: 'sid-unnamed', cwd: 'D:\\x', kind: 'interactive'
    }));
    // ‼️ the file a hard-killed process leaves behind: it must NOT keep the
    // session looking open (this is what made closed sessions un-resumable)
    fs.writeFileSync(path.join(dir, 'stale.json'), JSON.stringify({
        pid: 999999998, sessionId: 'sid-stale', cwd: 'D:\\x', kind: 'interactive',
        name: 'ghost', nameSource: 'explicit'
    }));
    // hostile neighbours
    fs.writeFileSync(path.join(dir, 'broken.json'), '{not json');
    fs.writeFileSync(path.join(dir, 'noid.json'), JSON.stringify({ pid: LIVE, name: 'x' }));
    fs.writeFileSync(path.join(dir, 'blankname.json'), JSON.stringify({ pid: LIVE, sessionId: 'sid-blank', name: '   ' }));
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'ignored');
    // a BOM-prefixed file (some editors) must still parse
    fs.writeFileSync(path.join(dir, 'bom.json'),
        '\ufeff' + JSON.stringify({ pid: LIVE, sessionId: 'sid-bom', name: 'bom-name' }));

    const list = readCliSessions(home);
    const byId = Object.fromEntries(list.map(s => [s.sessionId, s]));
    ok('the named live session is read', byId['8ae50684-6523-4a0c-bd86-da7a571b758e'].name === 'deneme');
    ok('…with its pid, cwd, kind and status', (() => {
        const s = byId['8ae50684-6523-4a0c-bd86-da7a571b758e'];
        return s.pid === LIVE && /explorer$/.test(s.cwd) && s.kind === 'interactive' && s.status === 'idle';
    })());
    ok('an unnamed session is listed without a name', 'sid-unnamed' in byId && !byId['sid-unnamed'].name);
    ok('a blank name is not a name', byId['sid-blank'] && !byId['sid-blank'].name);
    ok('a BOM does not hide a session', byId['sid-bom'].name === 'bom-name');
    ok('‼️ a file left behind by a dead process is IGNORED', !byId['sid-stale']);
    ok('…which is what frees a closed session for resuming immediately',
        !liveSessionIds(list).has('sid-stale'));
    ok('pidAlive says yes to this very process, no to a dead one',
        pidAlive(process.pid) && !pidAlive(999999998) && !pidAlive(0));
    ok('broken JSON is skipped, not thrown', list.length === 5);
    ok('a derived name is read but marked as the CLI\'s own',
        byId['c2b47f03-ac6b-4c7a-925b-c06b8d48b28b'].nameSource === 'derived'
        && !isChosenName(byId['c2b47f03-ac6b-4c7a-925b-c06b8d48b28b']));
    ok('a record without a sessionId is useless and dropped', !list.some(s => !s.sessionId));
    fs.rmSync(home, { recursive: true, force: true });
}

// ---------- ‼️ the rule that matters: WHOSE name is it? ----------
// The CLI names every session, whether or not a human asked for one, and marks
// which is which. Adopting the invented ones replaced good conversation titles
// ("fix the popup bug") with noise ("basit-2e") — the whole point of a title.
{
    ok('a name the CLI invented is NOT a chosen name',
        !isChosenName({ sessionId: 'x', name: 'basit-2e', nameSource: 'derived' }));
    ok('…whatever the casing of that marker',
        !isChosenName({ sessionId: 'x', name: 'developer-07', nameSource: 'DERIVED' }));
    ok('a name a human set IS chosen',
        isChosenName({ sessionId: 'x', name: 'zen release', nameSource: 'explicit' }));
    ok('a name with no marker is not trusted (fall back to the conversation)',
        !isChosenName({ sessionId: 'x', name: 'zen release' }));
    ok('no name at all is no name', !isChosenName({ sessionId: 'x', nameSource: 'explicit' }));

    const live = [
        { sessionId: 'a', name: 'zen release', nameSource: 'explicit' },
        { sessionId: 'b' },                                              // unnamed
        { sessionId: 'c', name: 'basit-2e', nameSource: 'derived' },     // the CLI's own
        { sessionId: 'd', name: 'audit' }                                // unmarked
    ];
    const first = mergeSessionNames({}, live);
    ok('a chosen name is remembered', first.a === 'zen release');
    ok('‼️ an invented name is NOT remembered', !('c' in first));
    ok('an unnamed session is not remembered as empty', !('b' in first));
    ok('an unmarked name is left alone by default', !('d' in first));
    ok('…but IS adopted when Agent Farm itself passed it with -n',
        mergeSessionNames({}, live, ['audit']).d === 'audit');
    ok('…and that still does not rescue an invented one',
        !('c' in mergeSessionNames({}, live, ['basit-2e', 'audit'])));

    ok('a second identical scan changes nothing (no re-render)',
        mergeSessionNames(first, live) === undefined);
    ok('a name survives the session ending (empty scan changes nothing)',
        mergeSessionNames(first, []) === undefined);
    const renamed = mergeSessionNames(first, [{ sessionId: 'a', name: 'zen hotfix', nameSource: 'explicit' }]);
    ok('a mid-run rename by the human wins', renamed.a === 'zen hotfix');
    ok('merging is immutable', first.a === 'zen release');
}

// ---------- who owns a session right now ----------
// Two processes on one session id both write the same transcript and never see
// each other's turns. The registry is what makes that detectable BEFORE it
// happens rather than after it looks like one conversation.
{
    const records = [
        { pid: 2452924, sessionId: 'c2b47f03', entrypoint: 'cli', status: 'idle' },
        { pid: 2455148, sessionId: 'c2b47f03', entrypoint: 'sdk-cli' },
        { pid: 2462644, sessionId: '35769ba9', entrypoint: 'cli' }
    ];
    ok('live session ids are listed', liveSessionIds(records).has('c2b47f03'));
    ok('an unknown session is free', !liveSessionIds(records).has('nope'));
    ok('the owner of a session is found', ownerOf(records, '35769ba9').pid === 2462644);
    ok('a free session has no owner', ownerOf(records, 'free') === undefined);
    ok('a terminal owner is described as one', /terminal/.test(describeOwner(records[0])));
    ok('a program owner says it is a program',
        /program/.test(describeOwner(records[1])) && /Console/.test(describeOwner(records[1])));
    ok('the description names the pid', /pid 2452924/.test(describeOwner(records[0])));
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

    // The Console's own sessions: their transcripts say `sdk-cli` like any
    // headless run, so the index is told which ids it hosted (see sessionOrigin).
    const { sessionOrigin } = require(path.join(__dirname, '..', 'out', 'core', 'sessions.js'));
    s.entrypoint = 'sdk-cli';
    ok('an sdk session is automation until the Console claims it', sessionOrigin(s) === 'auto');
    idx.setConsoleSessions(['sid1']);
    ok('a claimed session is a person talking', s.consoleHosted === true && sessionOrigin(s) === 'user');
    idx.setConsoleSessions(['sid1']);   // same set: no work, no event
    ok('…re-setting the same list changes nothing', s.consoleHosted === true);
    idx.setConsoleSessions([]);
    ok('…and it can be taken back', s.consoleHosted === undefined && sessionOrigin(s) === 'auto');
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
    const files = ['src/extension.ts', 'src/panels/settingsPanel.ts', 'src/panels/settingsSectionMessages.ts',
        'src/panels/settingsAgentMessages.ts', 'src/panels/toolboxPanel.ts', 'src/panels/airtablePanel.ts'];
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

// ---------- ‼️ X-266 — the registry is per claude home, and a machine has several ----------
{
    const { readCliSessionsAcross, twinsOf } = require(path.join(__dirname, '..', 'out', 'core', 'cliSessions.js'));
    const LIVE = process.pid;
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'af-cli-home-'));
    const slotA = fs.mkdtempSync(path.join(os.tmpdir(), 'af-cli-slotA-'));
    const slotB = fs.mkdtempSync(path.join(os.tmpdir(), 'af-cli-slotB-'));
    fs.mkdirSync(sessionsDir(home), { recursive: true });
    fs.mkdirSync(sessionsDir(slotA), { recursive: true });
    // slotB has no registry at all
    // the home holds nothing — measured: ~/.claude/sessions/ is EMPTY while a
    // slot session runs, so a reader that asks only the home says "nobody"
    // the slot holds the session TWICE — the twin as it sat on disk 2026-09-13
    fs.writeFileSync(path.join(sessionsDir(slotA), `${LIVE}.json`), JSON.stringify({
        pid: LIVE, sessionId: 'f5daa334-3a9c-4207-8c93-753bbf5086a6', entrypoint: 'sdk-cli', kind: 'interactive'
    }));
    fs.writeFileSync(path.join(sessionsDir(slotA), `${LIVE}-twin.json`), JSON.stringify({
        pid: LIVE, sessionId: 'f5daa334-3a9c-4207-8c93-753bbf5086a6', entrypoint: 'sdk-cli', kind: 'interactive'
    }));
    // …and a second, unrelated live session
    fs.writeFileSync(path.join(sessionsDir(slotA), 'other.json'), JSON.stringify({
        pid: LIVE, sessionId: 'sid-other', entrypoint: 'cli'
    }));

    ok('‼️ X-266: the home alone sees nobody', readCliSessions(home).length === 0);
    const all = readCliSessionsAcross([home, slotA, slotB, undefined, '', null]);
    ok('‼️ X-266: asked across every home, the slot session is found', all.some(r => r.sessionId === 'f5daa334-3a9c-4207-8c93-753bbf5086a6'));
    ok('…a home with no registry, an undefined and an empty entry are skipped, not errors', all.length === 3);
    ok('‼️ X-266: a home listed twice is read once (no double records)',
        readCliSessionsAcross([slotA, slotA, slotA + path.sep, slotA.toUpperCase()]).length === 3);
    ok('…and ownerOf answers through the same list', ownerOf(all, 'sid-other') !== undefined);

    // twins: same pid twice is ONE process (two files for one pid cannot happen,
    // but a reader must not invent a twin out of it); two pids is the twin
    ok('X-266: one pid under one id is not a twin', twinsOf(all).length === 0);
    const twinned = [
        { pid: 176768, sessionId: 'f5daa334-3a9c-4207-8c93-753bbf5086a6' },
        { pid: 175844, sessionId: 'f5daa334-3a9c-4207-8c93-753bbf5086a6' },
        { pid: 1, sessionId: 'sid-other' }
    ];
    const t = twinsOf(twinned);
    ok('‼️ X-266: two live pids on one session id IS the twin, pids sorted',
        t.length === 1 && t[0].sessionId === 'f5daa334-3a9c-4207-8c93-753bbf5086a6'
        && t[0].pids.join(',') === '175844,176768');

    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(slotA, { recursive: true, force: true });
    fs.rmSync(slotB, { recursive: true, force: true });
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
