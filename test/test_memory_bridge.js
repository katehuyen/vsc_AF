// B-6 — memory maintenance and semantic operations over the bridge
// (compiled core/memoryBridge.js).
//
// Memory is the one store an agent is expected to keep itself, and it could
// only ever ADD to it. What this suite proves is the four rules that make the
// rest of it safe to hand over: the plan and the write are two different calls,
// a typed path cannot leave the agent's own memory/ folder, every write goes
// through the same core that leaves the .afbak behind, and the two cheap-model
// passes say what they cost and whether anything was actually applied.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { registerMemoryOps } = require(path.join(__dirname, '..', 'out', 'core', 'memoryBridge.js'));
const { BridgeRegistry } = require(path.join(__dirname, '..', 'out', 'core', 'bridge.js'));
const { resolveMemoryFile, isInsideMemoryDir } =
    require(path.join(__dirname, '..', 'out', 'core', 'memusage.js'));

const memFile = (dir, name) => {
    const p = path.join(dir, 'memory', name);
    const st = fs.statSync(p);
    return { path: p, name, size: st.size, mtime: st.mtimeMs, tokens: Math.ceil(st.size / 4) };
};

(async () => {
    const root = fs.mkdtempSync(path.join(__dirname, 'tmp-mem-'));
    const devDir = path.join(root, 'agents', 'developer');
    const mgrDir = path.join(root, 'agents', 'manager');
    for (const d of [devDir, mgrDir]) { fs.mkdirSync(path.join(d, 'memory'), { recursive: true }); }

    const write = (dir, name, body) =>
        fs.writeFileSync(path.join(dir, 'memory', name), body, 'utf8');

    write(devDir, 'MEMORY.md', '# Memory Index\n\n- [User Profile](user_profile.md) — who the user is\n- [Gone](gone.md) — a pointer at nothing\n');
    write(devDir, 'user_profile.md', '---\nname: user_profile\ndescription: who the user is\nmetadata:\n  type: user\n---\n\nWorks in Turkish.\n');
    // An ORPHAN: on disk, not in the index — the agent will never open it.
    write(devDir, 'shared_note.md', '---\nname: shared_note\ndescription: a fact both agents hold\nmetadata:\n  type: project\n---\n\nThe developer copy.\n');
    write(mgrDir, 'MEMORY.md', '# Memory Index\n');
    write(mgrDir, 'shared_note.md', '---\nname: shared_note\ndescription: a fact both agents hold\nmetadata:\n  type: project\n---\n\nThe manager copy, which says something else.\n');

    // ‼️ The roster is RE-SCANNED on every call, exactly as the extension's is:
    // a fixture holding a frozen file list would tell `planIndexFixes` that a
    // file just created is missing, and the suite would measure the fixture.
    const scan = (dir) => fs.readdirSync(path.join(dir, 'memory'))
        .filter(f => /\.md$/i.test(f))
        .map(f => memFile(dir, f));
    const agents = () => [
        { id: 'a-dev', name: 'developer', dir: devDir, memoryFiles: scan(devDir) },
        { id: 'a-mgr', name: 'manager', dir: mgrDir, memoryFiles: scan(mgrDir) }
    ];

    let refreshed = 0;
    let indexBuilds = 0;
    let embeddings = true;
    let askArgs = null;

    const reg = new BridgeRegistry();
    registerMemoryOps(reg, {
        getAgents: agents,
        refreshAll: () => { refreshed++; },
        judgeArgs: () => '--model claude-haiku-4-5-20251001',
        staleDays: () => 45,
        embeddingsOn: () => embeddings,
        buildMemoryIndex: async () => { indexBuilds++; return { indexed: 2, files: 5, chunks: 17 }; },
        askMemory: async (query, k) => {
            askArgs = { query, k };
            return { hits: [{ agent: 'developer', title: 'user_profile.md', score: 0.71, text: 'Works in Turkish.', file: 'x' }] };
        }
    });

    // ---------- the catalogue: an op nobody can find is not on the bridge ----------
    {
        const cat = (await reg.dispatch('farm.ops', {})).result.map(o => o.op);
        const wanted = [
            'memory.list', 'memory.add', 'memory.copy', 'memory.archive',
            'memory.index.plan', 'memory.index.fix', 'memory.duplicates', 'memory.sync',
            'memory.merge.draft', 'memory.merge.apply', 'memory.contradictions',
            'memory.distill', 'memory.semantic.build', 'memory.ask'
        ];
        ok('every memory op is in the catalogue', wanted.every(o => cat.includes(o)));
        const missing = wanted.filter(o => !cat.includes(o));
        if (missing.length) { console.log('    · missing: ' + missing.join(', ')); }
        // A contract nobody can read is a contract nobody can call correctly.
        const specs = (await reg.dispatch('farm.ops', {})).result
            .filter(o => o.op.startsWith('memory.'));
        ok('every memory op states its args', specs.every(s => /args:/.test(s.describe)));
        ok('the two cost-bearing ops say so in their contract',
            specs.filter(s => /memory\.(contradictions|distill)$/.test(s.op))
                .every(s => /CHEAP-MODEL CALL/.test(s.describe)));
    }

    // ---------- read: what is there, and is the index still pointing at it ----------
    {
        const r = await reg.dispatch('memory.list', { agent: 'developer' });
        ok('memory.list finds the agent by name', r.ok && r.result.agent === 'developer');
        const byName = Object.fromEntries(r.result.files.map(f => [f.name, f]));
        ok('…the index is excluded from the files it lists', !byName['MEMORY'] && !byName['MEMORY.md']);
        ok('…frontmatter type and description come back',
            byName.user_profile.type === 'user' && byName.user_profile.description === 'who the user is');
        ok('‼️ an orphan is reported as one — inIndex is the honest question',
            byName.user_profile.inIndex === true && byName.shared_note.inIndex === false);
        ok('…with the two figures a maintenance decision is made on',
            typeof byName.shared_note.tokens === 'number' && typeof byName.shared_note.staleDays === 'number');
        ok('an unknown agent is refused by name',
            !(await reg.dispatch('memory.list', { agent: 'nobody' })).ok);
    }

    // ---------- ‼️ the path never leaves the agent's memory/ ----------
    {
        const escapes = ['../../../../etc/passwd', '..\\..\\secrets', path.join(mgrDir, 'memory', 'shared_note.md')];
        for (const bad of escapes) {
            let threw = false;
            try { resolveMemoryFile(devDir, bad); } catch { threw = true; }
            ok(`resolveMemoryFile refuses "${bad.slice(0, 28)}"`, threw);
        }
        ok('a bare name resolves', resolveMemoryFile(devDir, 'user_profile')
            === path.join(devDir, 'memory', 'user_profile.md'));
        ok('…and so does the same name with its extension',
            resolveMemoryFile(devDir, 'user_profile.md') === path.join(devDir, 'memory', 'user_profile.md'));
        ok('a file that is not there is refused rather than invented', (() => {
            try { resolveMemoryFile(devDir, 'never-existed'); return false; } catch { return true; }
        })());
        ok('isInsideMemoryDir tells the folder from its neighbours',
            isInsideMemoryDir(path.join(devDir, 'memory', 'a.md'), devDir)
            && !isInsideMemoryDir(path.join(devDir, 'CLAUDE.md'), devDir)
            && !isInsideMemoryDir(path.join(mgrDir, 'memory', 'a.md'), devDir));
        // …and the ops inherit it rather than re-checking by hand.
        const r = await reg.dispatch('memory.archive', { agent: 'developer', file: '../../../evil', confirm: true });
        ok('‼️ memory.archive cannot be pointed outside the folder', !r.ok && /outside/.test(r.error));
        ok('the archive op refuses to archive the INDEX',
            !(await reg.dispatch('memory.archive', { agent: 'developer', file: 'MEMORY.md', confirm: true })).ok);
    }

    // ---------- add, and the index entry it is born with ----------
    {
        const r = await reg.dispatch('memory.add', {
            agent: 'developer', name: 'reference_paths', description: 'where things live', type: 'reference'
        });
        ok('memory.add writes the file', r.ok && fs.existsSync(r.result.file));
        const body = fs.readFileSync(r.result.file, 'utf8');
        ok('…with the frontmatter convention', /^---\nname: reference_paths\n/.test(body) && /type: reference/.test(body));
        ok('…and registered in MEMORY.md in the same write',
            fs.readFileSync(path.join(devDir, 'memory', 'MEMORY.md'), 'utf8').includes('reference_paths.md'));
        ok('a bad name is refused before anything is written',
            !(await reg.dispatch('memory.add', { agent: 'developer', name: 'Bad Name', description: 'x' })).ok);
        ok('a bad type is refused',
            !(await reg.dispatch('memory.add', { agent: 'developer', name: 'ok_name', description: 'x', type: 'gossip' })).ok);
        ok('a description is required — it IS the index line',
            !(await reg.dispatch('memory.add', { agent: 'developer', name: 'ok_name' })).ok);
    }

    // ---------- copy: it arrives indexed, and never silently overwrites ----------
    {
        const r = await reg.dispatch('memory.copy', { agent: 'developer', file: 'user_profile', to: 'manager' });
        ok('memory.copy lands the file on the other agent', r.ok && fs.existsSync(r.result.file));
        ok('…and indexes it there, so it is not born an orphan',
            fs.readFileSync(path.join(mgrDir, 'memory', 'MEMORY.md'), 'utf8').includes('user_profile.md'));
        ok('‼️ a second copy is REFUSED, not an overwrite',
            !(await reg.dispatch('memory.copy', { agent: 'developer', file: 'user_profile', to: 'manager' })).ok);
        ok('copying to itself is refused',
            !(await reg.dispatch('memory.copy', { agent: 'developer', file: 'user_profile', to: 'developer' })).ok);
    }

    // ---------- the index repair: plan, then write ----------
    {
        const plan = await reg.dispatch('memory.index.plan', { agent: 'developer' });
        ok('memory.index.plan finds the orphan and the dead pointer',
            plan.ok && plan.result.orphans >= 1 && plan.result.dead >= 1);
        const before = fs.readFileSync(path.join(devDir, 'memory', 'MEMORY.md'), 'utf8');
        const dry = await reg.dispatch('memory.index.fix', { agent: 'developer', all: true });
        ok('‼️ without apply:true it PLANS and writes nothing',
            dry.ok && dry.result.planned === true
            && fs.readFileSync(path.join(devDir, 'memory', 'MEMORY.md'), 'utf8') === before);
        ok('…and it refuses to guess WHICH fixes',
            !(await reg.dispatch('memory.index.fix', { agent: 'developer', apply: true })).ok);
        ok('a line that is not in the current plan is refused, not applied',
            !(await reg.dispatch('memory.index.fix',
                { agent: 'developer', lines: ['- [Invented](nope.md)'], apply: true })).ok);
        const done = await reg.dispatch('memory.index.fix', { agent: 'developer', all: true, apply: true });
        const after = fs.readFileSync(path.join(devDir, 'memory', 'MEMORY.md'), 'utf8');
        ok('apply:true writes the repairs', done.ok && after.includes('shared_note.md') && !after.includes('gone.md'));
        ok('‼️ …with a timestamped .afbak of the index beside it',
            done.result.backup && fs.existsSync(done.result.backup)
            && fs.readFileSync(done.result.backup, 'utf8') === before);
        ok('a consistent index answers "nothing to fix" rather than writing again',
            !(await reg.dispatch('memory.index.fix', { agent: 'developer', all: true, apply: true })).ok);
    }

    // ---------- shared files: which agents disagree, and the two ways to settle it ----------
    {
        const dup = await reg.dispatch('memory.duplicates', {});
        const shared = dup.result.groups.find(g => g.name === 'shared_note.md');
        ok('memory.duplicates finds the file two agents both hold', dup.ok && !!shared);
        ok('‼️ …and says their copies have DRIFTED apart', shared.identical === false);
        ok('…naming both holders', shared.copies.map(c => c.agent).sort().join(',') === 'developer,manager');

        const draft = await reg.dispatch('memory.merge.draft', { name: 'shared_note' });
        ok('memory.merge.draft returns the union as TEXT, not an editor',
            draft.ok && draft.result.draft.includes('=== FROM developer')
            && draft.result.draft.includes('=== FROM manager'));
        ok('an unshared file is refused by name',
            !(await reg.dispatch('memory.merge.draft', { name: 'user_profile_that_is_not_shared' })).ok);

        const devBefore = fs.readFileSync(path.join(devDir, 'memory', 'shared_note.md'), 'utf8');
        const plan = await reg.dispatch('memory.sync', { name: 'shared_note', source: 'developer' });
        ok('‼️ memory.sync PLANS first — it names what it would overwrite',
            plan.ok && plan.result.planned === true && plan.result.overwrites.length === 1
            && plan.result.overwrites[0].agent === 'manager');
        ok('…and changed nothing',
            fs.readFileSync(path.join(mgrDir, 'memory', 'shared_note.md'), 'utf8') !== devBefore);
        ok('a source that does not hold the file is refused',
            !(await reg.dispatch('memory.sync', { name: 'shared_note', source: 'nobody', confirm: true })).ok);
        const done = await reg.dispatch('memory.sync', { name: 'shared_note', source: 'developer', confirm: true });
        ok('confirm:true makes the other copy agree',
            done.ok && fs.readFileSync(path.join(mgrDir, 'memory', 'shared_note.md'), 'utf8') === devBefore);
        ok('‼️ …keeping a .afbak of what it overwrote',
            done.result.backups.length === 1 && fs.existsSync(done.result.backups[0]));

        const merged = '---\nname: shared_note\ndescription: a fact both agents hold\nmetadata:\n  type: project\n---\n\nBoth halves, merged by hand.\n';
        const mplan = await reg.dispatch('memory.merge.apply', { name: 'shared_note', content: merged });
        ok('memory.merge.apply plans before it writes', mplan.ok && mplan.result.planned === true
            && !fs.readFileSync(path.join(devDir, 'memory', 'shared_note.md'), 'utf8').includes('merged by hand'));
        const mdone = await reg.dispatch('memory.merge.apply', { name: 'shared_note', content: merged, confirm: true });
        ok('…and confirm:true writes the one version to every copy',
            mdone.ok && mdone.result.written.length === 2
            && fs.readFileSync(path.join(mgrDir, 'memory', 'shared_note.md'), 'utf8').includes('merged by hand'));
        ok('empty content is refused rather than written',
            !(await reg.dispatch('memory.merge.apply', { name: 'shared_note', content: '   ', confirm: true })).ok);
    }

    // ---------- archive: the plan says where it goes and which lines go with it ----------
    {
        const plan = await reg.dispatch('memory.archive', { agent: 'developer', file: 'reference_paths' });
        ok('memory.archive plans: where the file goes',
            plan.ok && plan.result.planned === true
            && plan.result.movesTo === path.join(devDir, 'memory', 'archive', 'reference_paths.md'));
        ok('…and which index lines leave with it',
            plan.result.indexLines.some(l => l.includes('reference_paths.md')));
        ok('…having moved nothing', fs.existsSync(path.join(devDir, 'memory', 'reference_paths.md')));
        const done = await reg.dispatch('memory.archive', { agent: 'developer', file: 'reference_paths', confirm: true });
        ok('confirm:true moves it out of the scan',
            done.ok && !fs.existsSync(path.join(devDir, 'memory', 'reference_paths.md'))
            && fs.existsSync(done.result.movedTo));
        ok('‼️ …and it is ARCHIVED, not deleted — still on disk',
            fs.readFileSync(done.result.movedTo, 'utf8').includes('where things live'));
        ok('…its pointer left MEMORY.md, with the index backed up',
            done.result.indexUpdated === true && fs.existsSync(done.result.indexBackup)
            && !fs.readFileSync(path.join(devDir, 'memory', 'MEMORY.md'), 'utf8').includes('reference_paths.md'));
    }

    // ---------- the semantic half ----------
    {
        const built = await reg.dispatch('memory.semantic.build', {});
        ok('memory.semantic.build reports what it embedded',
            built.ok && built.result.indexed === 2 && built.result.chunks === 17 && indexBuilds === 1);
        const asked = await reg.dispatch('memory.ask', { query: 'hangi dilde çalışıyor', k: 5 });
        ok('memory.ask passes the query and the count through',
            asked.ok && askArgs.query === 'hangi dilde çalışıyor' && askArgs.k === 5);
        ok('…and answers with the memory records themselves',
            asked.result.hits[0].agent === 'developer' && asked.result.hits[0].score === 0.71);
        ok('k defaults rather than being required',
            (await reg.dispatch('memory.ask', { query: 'x' })).ok && askArgs.k === 12);
        ok('an empty query is refused', !(await reg.dispatch('memory.ask', {})).ok);
        embeddings = false;
        const off = await reg.dispatch('memory.ask', { query: 'x' });
        ok('‼️ with no embeddings provider it REFUSES rather than answering "nothing found"',
            !off.ok && /embeddingsProvider/.test(off.error));
        ok('…and so does the build', !(await reg.dispatch('memory.semantic.build', {})).ok);
        embeddings = true;
    }

    // ---------- the cheap-model half: it never runs by accident ----------
    {
        // No `file` = the candidate list, which costs nothing and says so.
        const list = await reg.dispatch('memory.distill', { agent: 'developer' });
        ok('memory.distill with no file lists candidates and spends nothing',
            list.ok && Array.isArray(list.result.candidates) && /Nothing was spent/.test(list.result.note));
        ok('memory.distill refuses the INDEX — a model condensing it would drop pointers',
            !(await reg.dispatch('memory.distill', { agent: 'developer', file: 'MEMORY.md' })).ok);
        ok('memory.distill cannot be pointed outside the folder',
            !(await reg.dispatch('memory.distill', { agent: 'developer', file: '../../../evil' })).ok);
        ok('memory.contradictions needs two files to cross-check',
            !(await reg.dispatch('memory.contradictions', { agent: 'manager-with-one' })).ok);
    }

    // ---------- every write repainted the surfaces ----------
    ok('a bridge write refreshes the trees and the open page', refreshed > 0);

    fs.rmSync(root, { recursive: true, force: true });
    console.log(`${pass} passed, ${fail} failed`);
    if (fail) { process.exit(1); }
})();
