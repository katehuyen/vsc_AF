// Project store (compiled core/projectStore.js, fs-backed): the registry and
// the link table on disk — creation and its validation, patching (including the
// fields an edit form is allowed to clear and the one it is not), sub-project
// depth, deletion that never takes a folder or a child with it, session
// attach/detach/transfer in single and bulk form, the one-time legacy import,
// rescan that must not be able to throw the link table away, and the atomic
// save that exists because assignments cannot be rebuilt from anything.
const path = require('path');
const fs = require('fs');
const os = require('os');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { ProjectStore } = require(path.join(__dirname, '..', 'out', 'core', 'projectStore.js'));

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-projects-'));
let seq = 0;
const newStore = (roots) => {
    const file = path.join(tmpDir, `store-${++seq}.json`);
    const s = new ProjectStore(file, roots || (() => []));
    s.load();
    return { store: s, file };
};
const readFile = f => JSON.parse(fs.readFileSync(f, 'utf8'));

// ---------- a store that does not exist yet ----------
{
    const { store, file } = newStore();
    ok('a missing file loads as empty, not as a crash', store.all().length === 0);
    ok('…and nothing is written just by looking', !fs.existsSync(file));
    ok('links start empty', Object.keys(store.links().sessions).length === 0);
}

// ---------- unreadable file ----------
{
    const file = path.join(tmpDir, 'broken.json');
    fs.writeFileSync(file, '{ this is not json', 'utf8');
    const s = new ProjectStore(file);
    s.load();
    ok('a corrupt store loads clean rather than half-loaded', s.all().length === 0);
}

// ---------- create ----------
{
    const { store, file } = newStore();
    const res = store.create({ name: '  Agent Farm  ', kind: 'product', repos: ['D:\\code\\af'] });
    ok('create succeeds', !res.error && !!res.project);
    ok('name trimmed', res.project.name === 'Agent Farm');
    ok('id is generated and shaped', /^prj_[a-z2-9]{8}$/.test(res.project.id));
    ok('status defaults to active', res.project.status === 'active');
    ok('timestamps stamped', res.project.createdAt > 0 && res.project.updatedAt > 0);
    ok('it is on disk immediately', fs.existsSync(file) && readFile(file).projects.length === 1);
    ok('the file records its version', readFile(file).version === 1);

    ok('a duplicate name is refused', !!store.create({ name: 'agent farm' }).error);
    ok('…and nothing was added', store.all().length === 1);
    ok('a blank name is refused', !!store.create({ name: '   ' }).error);
    ok('a name with no usable folder characters is refused', !!store.create({ name: '///' }).error);

    const junk = store.create({ name: 'Junky', id: 'prj_HACKED', createdAt: 1, nonsense: true });
    ok('a supplied id is ignored — ids are ours', junk.project.id !== 'prj_HACKED');
    ok('unknown fields never reach the registry', junk.project.nonsense === undefined);
}

// ---------- lookup ----------
{
    const { store } = newStore();
    const a = store.create({ name: 'Agent Farm' }).project;
    ok('get by id', store.get(a.id).name === 'Agent Farm');
    ok('get by name, case-insensitively', store.get('AGENT farm').id === a.id);
    ok('get on nothing', store.get('nope') === undefined);
    ok('all() hands back a copy', store.all() !== store.all());
}

// ---------- update ----------
{
    const { store } = newStore();
    const a = store.create({ name: 'A', folder: 'D:\\docs\\a', budgetUSD: 5, summary: 'hi' }).project;
    store.create({ name: 'B' });

    ok('rename through update', !store.update(a.id, { name: 'A2' }).error && store.get(a.id).name === 'A2');
    ok('a name another project holds is still refused', !!store.update(a.id, { name: 'b' }).error);
    ok('…and the project kept its name', store.get(a.id).name === 'A2');
    ok('re-casing its own name is allowed', !store.update(a.id, { name: 'a2' }).error);

    store.update(a.id, { folder: '' });
    ok('an empty value CLEARS an optional field', store.get(a.id).folder === undefined);
    store.update(a.id, { budgetUSD: 0 });
    ok('a zero budget is no budget', store.get(a.id).budgetUSD === undefined);

    store.update(a.id, { status: '' });
    ok('‼️ status can never be cleared away — a project always has one',
        store.get(a.id).status === 'active');
    store.update(a.id, { status: 'paused' });
    ok('…but it can be changed', store.get(a.id).status === 'paused');
    store.update(a.id, { status: 'nonsense' });
    ok('…and a nonsense status does not stick', store.get(a.id).status === 'active');

    const before = store.get(a.id).createdAt;
    store.update(a.id, { createdAt: 999, id: 'prj_other' });
    ok('createdAt and id are immutable', store.get(a.id).createdAt === before && !!store.get(a.id));
    ok('updatedAt moves', store.get(a.id).updatedAt >= before);
    ok('an unknown id is refused', !!store.update('prj_zz', { name: 'x' }).error);
}

// ---------- sub-projects: one level, and no orphan-making deletes ----------
{
    const { store } = newStore();
    const parent = store.create({ name: 'TalkScribe' }).project;
    const zen = store.create({ name: 'ZEN', parentId: parent.id }).project;
    ok('a child can be created', zen.parentId === parent.id);
    ok('childrenOf finds it', store.childrenOf(parent.id).map(p => p.name).join() === 'ZEN');

    ok('a project cannot be its own parent', !!store.update(parent.id, { parentId: parent.id }).error);
    ok('an unknown parent is refused', !!store.create({ name: 'X', parentId: 'prj_nope' }).error);
    ok('‼️ two levels deep is refused', !!store.create({ name: 'Deep', parentId: zen.id }).error);
    ok('a project that HAS children cannot become a child',
        !!store.update(parent.id, { parentId: store.create({ name: 'Other' }).project.id }).error);

    store.update(zen.id, { parentId: '' });
    ok('a child can be detached from its parent', store.get(zen.id).parentId === undefined);
}
{
    const { store } = newStore();
    const parent = store.create({ name: 'TalkScribe' }).project;
    const zen = store.create({ name: 'ZEN', parentId: parent.id }).project;
    store.assignSession('s1', zen.id);
    ok('remove reports success', store.remove(parent.id) === true);
    ok('‼️ removing a parent ORPHANS its children, never deletes them',
        !!store.get(zen.id) && store.get(zen.id).parentId === undefined);
    ok('the child keeps its sessions', store.links().sessions.s1 === zen.id);
    ok('removing an unknown id is honest', store.remove('prj_zz') === false);
}

// ---------- session membership ----------
{
    const { store } = newStore();
    const a = store.create({ name: 'A' }).project;
    const b = store.create({ name: 'B' }).project;

    ok('attach by id', store.assignSession('s1', a.id) && store.links().sessions.s1 === a.id);
    ok('attach by NAME works too', store.assignSession('s2', 'B') && store.links().sessions.s2 === b.id);
    ok('transfer', store.assignSession('s1', b.id) && store.links().sessions.s1 === b.id);
    ok('detach writes the explicit-none marker',
        store.assignSession('s1', '') && store.links().sessions.s1 === '');
    ok('forgetting removes the row entirely',
        store.assignSession('s1', undefined) && !('s1' in store.links().sessions));
    ok('an unknown project is refused, not silently dropped', store.assignSession('s3', 'nope') === false);
    ok('…and nothing was written for it', !('s3' in store.links().sessions));
    ok('a blank session id is refused', store.assignSession('   ', a.id) === false);

    // resolution goes through the store so callers never assemble it themselves
    ok('resolve sees the link', store.assignSession('s9', a.id) && store.resolve({ sessionId: 's9' }).projectId === a.id);
    ok('resolve on an unknown session', store.resolve({ sessionId: 'zzz' }).via === 'none');
}

// ---------- the active project's STAMP ----------
// Weaker than an assignment on purpose: it arrives after the session started,
// so it may only fill a blank. Everything below is a decision the user made and
// the status bar must not be able to undo it on a resume.
{
    const { store } = newStore();
    const a = store.create({ name: 'A' }).project;
    const b = store.create({ name: 'B' }).project;

    ok('a session nobody decided about takes the stamp',
        store.stampSession('s1', a.id) === true && store.links().sessions.s1 === a.id);
    ok('stamping the same session again does nothing',
        store.stampSession('s1', b.id) === false && store.links().sessions.s1 === a.id);

    store.assignSession('s2', b.id);
    ok('‼️ a hand-filed session is NOT re-stamped',
        store.stampSession('s2', a.id) === false && store.links().sessions.s2 === b.id);

    store.assignSession('s3', '');
    ok('‼️ explicitly-no-project survives the stamp',
        store.stampSession('s3', a.id) === false && store.links().sessions.s3 === '');

    store.assignSession('s4', a.id);
    store.assignSession('s4', undefined);          // "forget the decision"
    ok('a forgotten decision leaves the session stampable again',
        store.stampSession('s4', b.id) === true && store.links().sessions.s4 === b.id);

    ok('an unknown project cannot stamp', store.stampSession('s5', 'nope') === false);
    ok('…and wrote nothing', !('s5' in store.links().sessions));
    ok('a blank session id cannot be stamped', store.stampSession('', a.id) === false);
}

// ---------- bulk assignment writes ONCE ----------
{
    const { store } = newStore();
    const a = store.create({ name: 'A' }).project;
    let saves = 0;
    const realSave = Object.getPrototypeOf(store).save;
    store.save = function () { saves++; return realSave.call(this); };

    const ids = Array.from({ length: 90 }, (_, i) => `s${i}`);
    const changed = store.assignSessions(ids, a.id);
    ok('every id was assigned', changed === 90);
    ok('‼️ ninety assignments cost ONE write, not ninety', saves === 1);
    ok('they are all there', Object.keys(store.links().sessions).length === 90);

    saves = 0;
    ok('re-assigning the same value changes nothing', store.assignSessions(ids, a.id) === 0);
    ok('…and writes nothing', saves === 0);

    saves = 0;
    ok('bulk detach', store.assignSessions(['s1', 's2'], '') === 2);
    ok('…writes once', saves === 1);
    ok('detached rows carry the marker', store.links().sessions.s1 === '');
    ok('bulk forget removes rows', store.assignSessions(['s1'], undefined) === 1 && !('s1' in store.links().sessions));
    ok('an unknown project assigns nothing', store.assignSessions(['s5'], 'nope') === 0);
    ok('blank ids are skipped', store.assignSessions(['  ', ''], a.id) === 0);
    store.save = realSave;
}

// ---------- persistence round-trip ----------
{
    const { store, file } = newStore();
    const a = store.create({
        name: 'Round Trip', kind: 'customer', folder: 'D:\\docs\\rt', repos: ['D:\\code\\rt'],
        people: [{ name: 'Ayşe', role: 'client', kind: 'company' }],
        match: { agents: ['developer'] }, budgetTotalUSD: 120, tags: ['x']
    }).project;
    store.assignSession('s1', a.id);
    store.assignSession('s2', '');

    const reopened = new ProjectStore(file);
    reopened.load();
    const back = reopened.get(a.id);
    ok('the project survives a reload', !!back && back.name === 'Round Trip');
    ok('people survive with their roles', back.people[0].name === 'Ayşe' && back.people[0].role === 'client');
    ok('non-ASCII names survive the round trip', back.people[0].name === 'Ayşe');
    ok('rules survive', back.match.agents.join() === 'developer');
    ok('links survive', reopened.links().sessions.s1 === a.id);
    ok('‼️ the explicit-none marker survives a reload', reopened.links().sessions.s2 === '');
    ok('a dead link is pruned on load', reopened.links().sessions.sZ === undefined);
}

// ---------- links to deleted projects are pruned, markers are not ----------
{
    const { store, file } = newStore();
    const a = store.create({ name: 'A' }).project;
    store.assignSession('s1', a.id);
    store.assignSession('s2', '');
    store.remove(a.id);
    ok('the link to a removed project is gone', !('s1' in store.links().sessions));
    ok('‼️ the explicit-none marker is NOT collateral damage', store.links().sessions.s2 === '');
    const reopened = new ProjectStore(file); reopened.load();
    ok('…and that holds after a reload', reopened.links().sessions.s2 === '');
}

// ---------- atomic save ----------
{
    const { store, file } = newStore();
    store.create({ name: 'Atomic' });
    ok('no temp file is left behind', !fs.existsSync(`${file}.tmp`));
    ok('the store is valid json after every write', !!readFile(file).projects);
    const stray = fs.readdirSync(tmpDir).filter(f => f.endsWith('.tmp'));
    ok('no stray temp files anywhere', stray.length === 0);
}

// ---------- portable paths ----------
{
    const home = path.join(tmpDir, 'homedir');
    const roots = () => [{ token: '${home}', path: home }];
    const { store, file } = newStore(roots);
    const folder = path.join(home, 'Documents', 'MyProject');
    store.create({ name: 'Portable', folder });

    const onDisk = fs.readFileSync(file, 'utf8');
    ok('‼️ a folder under home is TOKENISED on disk', onDisk.includes('${home}'));
    ok('…and the machine path is not written', !onDisk.includes(home.replace(/\\/g, '\\\\')));

    const reopened = new ProjectStore(file, roots);
    reopened.load();
    ok('…and expands back to this machine on load', reopened.get('Portable').folder === folder);

    // a path on a fixed volume is already portable and stays verbatim
    const fixed = newStore(roots);
    fixed.store.create({ name: 'Fixed', folder: 'D:\\zone\\know\\note\\obsidian\\10_PROJECTS\\Fixed' });
    ok('a path outside every known root stays absolute',
        readFile(fixed.file).projects[0].folder === 'D:\\zone\\know\\note\\obsidian\\10_PROJECTS\\Fixed');
}

// ---------- the store is the whole registry ----------
// ‼️ There is no import path and no second source. A file left over from an
// older shape carries keys this version does not know, and reading it must not
// resurrect anything — the store keeps what it understands and drops the rest.
{
    const { file } = newStore();
    fs.writeFileSync(file, JSON.stringify({
        version: 1, projects: [], links: { sessions: {} },
        migrated: true, unknownKey: { anything: 1 }
    }, null, 2), 'utf8');
    const reopened = new ProjectStore(file);
    reopened.load();
    ok('a store file with keys from another shape still loads', reopened.all().length === 0);
    reopened.create({ name: 'After' });
    const written = readFile(file);
    ok('…and what it writes back holds only what it owns',
        Object.keys(written).sort().join() === 'links,projects,version');
    ok('the project it just created is there', written.projects[0].name === 'After');
}

// ---------- rescan ----------
{
    const { store } = newStore();
    const a = store.create({ name: 'A' }).project;
    store.assignSession('s1', a.id);
    store.assignSession('s2', '');

    // the folder scan finds A (same id) and a project the store never had
    store.replaceAll([
        { id: a.id, name: 'A renamed in Obsidian', status: 'active', createdAt: 1, updatedAt: 2 },
        { id: 'prj_scanned1', name: 'Found On Disk', status: 'active', createdAt: 1, updatedAt: 2 }
    ]);
    ok('a rescan can rename from the folder side', store.get(a.id).name === 'A renamed in Obsidian');
    ok('a rescan can add what it found', !!store.get('Found On Disk'));
    ok('‼️ a rescan does NOT throw the link table away — it cannot be rebuilt',
        store.links().sessions.s1 === a.id);
    ok('…including the explicit-none markers', store.links().sessions.s2 === '');

    store.replaceAll([{ id: 'prj_scanned1', name: 'Found On Disk', status: 'active', createdAt: 1, updatedAt: 2 }]);
    ok('a link whose project the scan no longer sees is pruned', !('s1' in store.links().sessions));
    ok('the marker still survives', store.links().sessions.s2 === '');
}

// ---------- two windows on one file ----------
// The failure this prevents: a second VS Code window, open since before a
// project existed, writes its stale copy back over it. The casualty is the link
// table — the one thing here that cannot be rebuilt from anything on disk.
{
    // mtime is the change signal, so a test must let the clock move between
    // writes the way two real windows always would
    const tick = () => { const t = Date.now(); while (Date.now() - t < 3) { /* spin */ } };

    const file = path.join(tmpDir, 'two-windows.json');
    const a = new ProjectStore(file); a.load();
    const b = new ProjectStore(file); b.load();      // opened while the file was empty

    const p1 = a.create({ name: 'Made In Window A' }).project;
    a.assignSession('s1', p1.id);
    tick();

    const p2 = b.create({ name: 'Made In Window B' }).project;
    ok('‼️ window B did not erase window A\'s project', !!b.get(p1.id));
    ok('…and its own is there too', !!b.get(p2.id));
    ok('‼️ and A\'s session assignment survived', b.links().sessions.s1 === p1.id);
    tick();

    b.assignSession('s2', p2.id);
    tick();
    a.assignSession('s3', p1.id);
    ok('window A picked up B\'s assignment before writing', a.links().sessions.s2 === p2.id);
    ok('…and added its own', a.links().sessions.s3 === p1.id);
    tick();

    const c = new ProjectStore(file); c.load();
    ok('a third window sees everything', c.all().length === 2);
    ok('…and every assignment', Object.keys(c.links().sessions).length === 3);

    // removal propagates the same way
    tick();
    a.remove(p2.id);
    tick();
    b.assignSession('s4', p1.id);
    ok('window B saw the removal instead of resurrecting it', !b.get(p2.id));
    ok('…and the removed project\'s links are gone', !('s2' in b.links().sessions));
}

try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best effort */ }

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
