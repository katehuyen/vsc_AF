'use strict';
// X-512 — livePort and agentRoots take effect without a window reload. A port change rewrites the hook files that
// carry our hooks (the user's own here, every slot and the fleet's wires through the contract gate), and the agent
// roots are watched by the list the setting holds now (core/rootWatch.ts), expanded the way discovery expands them.
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const out = f => require(path.join(ROOT, 'out', 'core', f));
const { rootWatchers } = out('rootWatch.js');
const H = out('hooksInstaller.js');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

// ---------- the roots, watched by the list as it stands ----------
{
    const exist = new Set(['/r/a', '/r/b', '/r/c', '/home/x/agents']);
    const live = new Map(), log = [];
    let changes = 0, refuse = new Set(['/r/c']);
    const w = rootWatchers({
        exists: d => exist.has(d.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()),
        watch: (dir, onChange) => {
            if (refuse.has(dir)) { throw new Error('no recursive watch'); }
            log.push('open ' + dir);
            const h = { close: () => { log.push('close ' + dir); live.delete(dir); } };
            live.set(dir, onChange);
            return h;
        },
        onChange: () => { changes++; }
    });
    const first = w.sync(['/r/a', '/r/b', '/r/missing', '', '/R/A/']);
    ok('the roots that exist are watched once each (a second spelling of one is the same root): ' + first.join(', '),
        first.length === 2 && live.has('/r/a') && live.has('/r/b') && log.length === 2);
    live.get('/r/a')();
    ok('a change inside a root reaches the refresh', changes === 1);
    log.length = 0;
    const second = w.sync(['/r/b', '/r/c']);
    ok('‼️ a root taken off the list is let go, one kept is not reopened: ' + log.join(' | '),
        log.join('|') === 'close /r/a' && second.join() === '/r/b');
    refuse = new Set();
    log.length = 0;
    w.sync(['/r/b', '/r/c']);
    ok('…a root whose watch failed is tried again on the next change', log.join('|') === 'open /r/c' && live.has('/r/c'));
    process.env.AF_X512_HOME = '/home/x';
    log.length = 0;
    w.sync(['%AF_X512_HOME%/agents']);
    ok('‼️ a root written portably is expanded the way discovery expands it: ' + log.join(' | '),
        live.has('/home/x/agents') && !live.has('/r/b') && !live.has('/r/c'));
    delete process.env.AF_X512_HOME;
    w.dispose();
    ok('dispose closes every watch', live.size === 0);
}

// ---------- the hooks, brought to the port ----------
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-x512-'));
    try {
        const old = path.join(dir, 'old.json'), plain = path.join(dir, 'plain.json'), cur = path.join(dir, 'cur.json');
        H.installHooksInto(old, 1111);
        H.installHooksInto(cur, 2222);
        fs.writeFileSync(plain, '{ "model": "sonnet" }\n', 'utf8');
        const curText = fs.readFileSync(cur, 'utf8');
        const did = H.refreshStaleHooks([old, plain, cur, path.join(dir, 'absent.json')], 2222);
        ok('a file carrying our hooks on the old port is rewritten to the new one', did.length === 1 && did[0] === old && H.hooksAreCurrent(old, 2222));
        ok('‼️ a file with no hooks of ours is given none', fs.readFileSync(plain, 'utf8') === '{ "model": "sonnet" }\n' && !fs.existsSync(path.join(dir, 'absent.json')));
        ok('…and a file already on the port is left as it is', fs.readFileSync(cur, 'utf8') === curText);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// ---------- the wiring ----------
{
    const ext = strip(read('src/extension.ts'));
    ok('activation repairs the user\'s own hook files through the one function a port change calls again',
        /const refreshOwnHooks = \(\): string\[\] => refreshStaleHooks\(\[\s*userSettingsPath\(claudeDir\(\)\),\s*\.\.\.agents\.map\(a => path\.join\(a\.dir, '\.claude', 'settings\.local\.json'\)\)\s*\], cfg\(\)\.get<number>\('livePort', 8377\)\);/.test(ext)
        && /const stale = refreshOwnHooks\(\);/.test(ext));
    ok('‼️ a livePort change rewrites the user\'s hook files and runs the contract gate for every slot and wire',
        /if \(e\.affectsConfiguration\('agentFarm\.livePort'\)\) \{\s*try \{ refreshOwnHooks\(\); \} catch \{\s*\}\s*setTimeout\(\(\) => runContractGate\('port'\), 0\);\s*\}/.test(ext));
    ok('the roots are watched through rootWatchers, once, and no loop of fs.watch over them is left',
        (ext.match(/rootWatchers\(\{/g) || []).length === 1 && !/for \(const root of cfg\(\)\.get<string\[\]>\('agentRoots'/.test(ext)
        && /agentRootWatch\.sync\(cfg\(\)\.get<string\[\]>\('agentRoots', \[\]\)\);\s*context\.subscriptions\.push\(agentRootWatch\);/.test(ext));
    ok('‼️ an agentRoots change re-syncs the watches beside the refresh',
        /e\.affectsConfiguration\('agentFarm\.excludeAgentDirs'\)\) \{\s*refreshAll\(\);\s*index\.reassignAgents\(\);\s*agentRootWatch\.sync\(cfg\(\)\.get<string\[\]>\('agentRoots', \[\]\)\);/.test(ext));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
