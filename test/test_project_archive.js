// Faz 7 — archive mirroring (compiled core/projectArchive.js, fs-backed): where
// a finished project's folder goes, the refusals that stand between a click and
// a year of somebody's notes landing on top of another year's, the real move
// (including the cross-volume fallback), and the inverse that makes archiving a
// decision you can take back.
const path = require('path');
const fs = require('fs');
const os = require('os');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const {
    archiveRootFor, isInside, planArchive, planRestore, moveProjectFolder, listArchived
} = require(path.join(__dirname, '..', 'out', 'core', 'projectArchive.js'));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-archive-'));
const mk = (...parts) => {
    const p = path.join(tmp, ...parts);
    fs.mkdirSync(p, { recursive: true });
    return p;
};

// ---------- where the archive is ----------
{
    const root = path.join('D:', 'vault', '00_AGENT_AREA', '10_PROJECTS');
    const derived = archiveRootFor(root);
    ok('‼️ the counterpart is derived from the vault\'s own convention, not invented',
        derived === path.join('D:', 'vault', '00_AGENT_AREA', '99_ARCHIVE', '10_PROJECTS_ARCHIVE'));
    ok('a configured root wins outright',
        archiveRootFor(root, 'E:\\elsewhere') === path.resolve('E:\\elsewhere'));
    ok('no projects root and no setting means no archive root', archiveRootFor('') === '');
    ok('a blank setting falls back to the derivation', archiveRootFor(root, '   ') === derived);
}

// ---------- inside ----------
{
    const root = path.join('D:', 'v', '99_ARCHIVE', 'P_ARCHIVE');
    ok('a folder in the archive is recognised', isInside(path.join(root, 'Thing'), root));
    ok('the root itself counts as inside', isInside(root, root));
    ok('‼️ case and separators do not decide the answer',
        isInside(path.join('d:', 'v', '99_archive', 'p_archive', 'Thing'), root));
    ok('a sibling whose name merely starts the same is NOT inside',
        !isInside(path.join('D:', 'v', '99_ARCHIVE', 'P_ARCHIVE_OLD'), root));
    ok('an empty side is never inside', !isInside('', root) && !isInside(root, ''));
}

// ---------- planning the move ----------
{
    const live = mk('live');
    const arch = path.join(tmp, 'archive');
    const folder = mk('live', 'Thing');

    const plan = planArchive(folder, arch);
    ok('the plan keeps the folder\'s own name — vault links point at it',
        plan.to === path.join(arch, 'Thing') && !plan.error);

    ok('a project with no folder has nothing to move',
        /nothing to move/.test(planArchive('', arch).error));
    ok('a folder that is not on this machine is refused by name',
        /not on this machine/.test(planArchive(path.join(live, 'Ghost'), arch).error));
    ok('‼️ no archive root is an error that says which setting to reach for',
        /projectsArchiveRoot/.test(planArchive(folder, '').error));

    fs.mkdirSync(path.join(arch, 'Thing'), { recursive: true });
    ok('‼️ landing on something that already exists is refused — nothing is merged',
        /already there/.test(planArchive(folder, arch).error));
    fs.rmSync(path.join(arch, 'Thing'), { recursive: true, force: true });

    const already = mk('archive', 'Done');
    ok('a folder already in the archive says so rather than moving it into itself',
        /already in the archive/.test(planArchive(already, arch).error));
}

// ---------- the move itself ----------
{
    const folder = mk('m-live', 'Proj');
    fs.writeFileSync(path.join(folder, 'Charter.md'), 'hello', 'utf8');
    fs.mkdirSync(path.join(folder, '20_Decisions'), { recursive: true });
    fs.writeFileSync(path.join(folder, '20_Decisions', 'why.md'), 'because', 'utf8');
    const arch = path.join(tmp, 'm-archive', 'nested');

    const res = moveProjectFolder(planArchive(folder, arch));
    ok('the move reports where the folder is NOW', res.ok && res.path === path.join(arch, 'Proj'));
    ok('…the archive root is created on the way, however deep it is',
        fs.existsSync(path.join(arch, 'Proj', 'Charter.md')));
    ok('…the whole tree came with it',
        fs.readFileSync(path.join(arch, 'Proj', '20_Decisions', 'why.md'), 'utf8') === 'because');
    ok('…and nothing is left behind', !fs.existsSync(folder));

    ok('a plan that already failed is not attempted',
        moveProjectFolder({ from: 'x', to: 'y', error: 'nope' }).ok === false);
}

// ---------- back again ----------
{
    const projects = mk('r-live');
    const arch = mk('r-archive');
    const folder = mk('r-archive', 'Back');
    fs.writeFileSync(path.join(folder, 'Plan.md'), 'plan', 'utf8');

    const plan = planRestore(folder, projects, arch);
    ok('restore is the same operation with the roots swapped',
        plan.to === path.join(projects, 'Back') && !plan.error);
    const res = moveProjectFolder(plan);
    ok('…and it really goes back',
        res.ok && fs.existsSync(path.join(projects, 'Back', 'Plan.md')));

    ok('‼️ a folder that is not in the archive is not "restored" from nowhere',
        /not in the archive/.test(planRestore(path.join(projects, 'Back'), projects, arch).error));
    ok('no projects root means no destination', /projectsRoot/.test(planRestore(folder, '', arch).error));
}

// ---------- reading the archive ----------
{
    const arch = mk('l-archive');
    mk('l-archive', 'Alpha');
    mk('l-archive', 'Beta');
    mk('l-archive', '.hidden');
    fs.writeFileSync(path.join(arch, 'loose.md'), 'x', 'utf8');
    const list = listArchived(arch);
    ok('‼️ the ARCHIVE is read, not the registry — a project nobody registered is still there',
        list.length === 2 && list.map(x => x.name).sort().join() === 'Alpha,Beta');
    ok('files and dot-folders are not projects', !list.some(x => /hidden|loose/.test(x.name)));
    ok('a root that does not exist is an empty list, not a crash',
        listArchived(path.join(tmp, 'nope')).length === 0 && listArchived('').length === 0);
}

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
