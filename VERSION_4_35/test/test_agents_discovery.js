// Agent discovery: nest rule (root CLAUDE.md + agent children = shared config,
// not an agent), single-agent roots, case/slash-insensitive root dedupe (the
// old accidental double-scan), excludeAgentDirs, and fail-soft missing roots.
const fs = require('fs');
const path = require('path');
const os = require('os');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const A = require(path.join(__dirname, '..', 'out', 'core', 'agents.js'));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-agents-'));
const mk = (...parts) => {
    const p = path.join(tmp, ...parts);
    fs.mkdirSync(p, { recursive: true });
    return p;
};
const touch = (dir, name, content) => fs.writeFileSync(path.join(dir, name), content ?? '# x', 'utf8');

// plain root: two agent children (different markers), one plain folder, one dot-dir
const plain = mk('plain');
const dev = mk('plain', 'dev'); touch(dev, 'CLAUDE.md');
const ops = mk('plain', 'ops'); fs.mkdirSync(path.join(ops, 'memory'), { recursive: true }); touch(path.join(ops, 'memory'), 'MEMORY.md');
mk('plain', 'notes'); // not agent-like
const hidden = mk('plain', '.hidden'); touch(hidden, 'CLAUDE.md'); // dot-dir → skipped

// nest root: its OWN CLAUDE.md + agent children
const nest = mk('nest'); touch(nest, 'CLAUDE.md', '# constitution');
const child1 = mk('nest', 'child1'); touch(child1, 'CLAUDE.md');
const child2 = mk('nest', 'child2'); fs.mkdirSync(path.join(child2, '.claude'), { recursive: true });

// single-agent root: CLAUDE.md, no agent-like children
const solo = mk('solo'); touch(solo, 'CLAUDE.md');
mk('solo', 'stuff'); // plain child doesn't break single-agent

// ---------- plain root ----------
{
    const { agents, reports } = A.scanRoots([plain]);
    ok('plain: agent children discovered', agents.length === 2
        && agents.map(a => a.name).join(',') === 'dev,ops');
    ok('plain: report kind + candidates', reports[0].kind === 'plain'
        && reports[0].candidates.length === 2 && reports[0].candidates.every(c => !c.excluded));
    ok('plain: dot-dirs and plain folders skipped', !agents.some(a => a.name === '.hidden' || a.name === 'notes'));
}

// ---------- nest rule ----------
{
    const { agents, reports } = A.scanRoots([nest]);
    ok('nest: children are the agents', agents.length === 2
        && agents.map(a => a.name).join(',') === 'child1,child2');
    ok('nest: the root itself is NOT an agent', !agents.some(a => a.name === 'nest'));
    ok('nest: report says nest', reports[0].kind === 'nest');
}

// ---------- single-agent root ----------
{
    const { agents, reports } = A.scanRoots([solo]);
    ok('single-agent root is one agent', agents.length === 1 && agents[0].name === 'solo');
    ok('single-agent report kind', reports[0].kind === 'single-agent'
        && reports[0].candidates.length === 1 && reports[0].candidates[0].dir === solo);
}

// ---------- duplicate roots (the old accident, now a rule) ----------
{
    // trailing slash = same folder spelled differently (case differences behave identically)
    const { agents, reports } = A.scanRoots([nest, nest + path.sep]);
    ok('duplicate root scanned once — children not doubled', agents.length === 2);
    ok('duplicate entry flagged, first kept', reports[0].duplicate === false && reports[1].duplicate === true);
    ok('regression: dup + root CLAUDE.md still yields children only, no root agent',
        !agents.some(a => a.name === 'nest') && agents.some(a => a.name === 'child1'));
}

// ---------- excludes ----------
{
    // spelled with backslashes + different case — comparison must not care
    const exDev = dev.replace(/\//g, '\\').toUpperCase();
    const { agents, reports } = A.scanRoots([plain], [exDev]);
    ok('excluded child is not an agent', agents.length === 1 && agents[0].name === 'ops');
    const c = reports[0].candidates.find(x => x.name === 'dev');
    ok('excluded child stays visible as a flagged candidate', !!c && c.excluded === true);

    const soloEx = A.scanRoots([solo], [solo]);
    ok('excluding a single-agent root removes the agent', soloEx.agents.length === 0
        && soloEx.reports[0].kind === 'single-agent' && soloEx.reports[0].candidates[0].excluded === true);

    ok('discoverAgents honors excludes too', A.discoverAgents([plain], [dev]).length === 1);
    ok('discoverAgents without excludes = old signature keeps working',
        A.discoverAgents([plain]).length === 2);
}

// ---------- missing / empty roots ----------
{
    const { agents, reports } = A.scanRoots([path.join(tmp, 'no-such-dir'), '', plain]);
    ok('missing root reported, not fatal', reports[0].kind === 'missing' && reports[0].candidates.length === 0);
    ok('empty root string skipped silently', reports.length === 2); // '' produces no report
    ok('later roots still scanned', agents.length === 2);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
