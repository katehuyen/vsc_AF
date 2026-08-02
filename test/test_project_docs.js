// Project folder (compiled core/projectDocs.js, fs-backed): the skeleton and
// its configurability, the promise that documents are found by their af-role
// and never by their name, frontmatter reading, folder rename that fails
// honestly instead of losing the path, writes that refuse rather than overwrite
// what Obsidian changed underneath them, log insertion at a movable anchor, and
// the rescan that lets a folder rename in Obsidian be recognised as the same
// project.
const path = require('path');
const fs = require('fs');
const os = require('os');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const {
    PROJECT_DOC_ROLES, LOG_ANCHOR, DEFAULT_SKELETON, normalizeSkeleton, templateVars,
    renderTemplate, createSkeleton, ensureRoleFrontmatter, readAfFrontmatter, scanRoles,
    dirExists, renameProjectFolder, docMtime, safeWriteDoc, insertLogEntry, scanProjectsRoot
} = require(path.join(__dirname, '..', 'out', 'core', 'projectDocs.js'));

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'af-projectdocs-'));
let seq = 0;
const freshDir = () => {
    const d = path.join(tmpRoot, `d${++seq}`);
    fs.mkdirSync(d, { recursive: true });
    return d;
};
const P = (extra) => Object.assign(
    { id: 'prj_test1234', name: 'Agent Farm', status: 'active', createdAt: 1, updatedAt: 1 }, extra || {});
/** mtime is a change signal; a test has to let the clock move like reality does. */
const tick = () => { const t = Date.now(); while (Date.now() - t < 3) { /* spin */ } };

// ---------- vocabulary ----------
{
    ok('roles complete', PROJECT_DOC_ROLES.join() === 'charter,plan,people,log,deliverables,brief');
    ok('the default skeleton carries a charter', DEFAULT_SKELETON.some(e => e.role === 'charter'));
    ok('…a plan, people, a log and deliverables',
        ['plan', 'people', 'log', 'deliverables'].every(r => DEFAULT_SKELETON.some(e => e.role === r)));
    ok('…and the machine folder', DEFAULT_SKELETON.some(e => e.path === '_AF/'));
}

// ---------- skeleton normalisation ----------
{
    ok('nothing configured means the shipped default', normalizeSkeleton(undefined) === DEFAULT_SKELETON);
    ok('an empty list means the default too', normalizeSkeleton([]) === DEFAULT_SKELETON);
    ok('junk means the default', normalizeSkeleton('nope') === DEFAULT_SKELETON);

    const s = normalizeSkeleton([
        'Notes/',
        { path: 'A-DOC - {project} - Tanım - {yymmdd}.md', role: 'charter' },
        { path: 'dupe.md' }, { path: 'DUPE.md' },
        { path: '../escape.md' }, { path: 'a/../../escape.md' }, { path: '/abs.md' },
        { path: 'C:\\windows\\evil.md' }, { path: '   ' }, { path: 'x.md', role: 'nonsense' }
    ]);
    ok('a bare string is a path', s[0].path === 'Notes/');
    ok('a vault-style name with placeholders is fine', s[1].role === 'charter');
    ok('‼️ a path climbing out of the folder is dropped', !s.some(e => e.path.includes('..')));
    ok('an absolute path is dropped', !s.some(e => e.path.startsWith('/')));
    ok('a drive path is dropped', !s.some(e => /^[A-Za-z]:/.test(e.path)));
    ok('duplicates are dropped case-insensitively', s.filter(e => /dupe/i.test(e.path)).length === 1);
    ok('an unknown role is ignored, the entry survives', s.find(e => e.path === 'x.md').role === undefined);
    ok('backslashes are normalised', normalizeSkeleton([{ path: 'a\\b/' }])[0].path === 'a/b/');
}

// ---------- templates ----------
{
    const vars = templateVars(P(), new Date(2026, 7, 2));
    ok('date renders', vars.date === '2026-08-02');
    ok('yymmdd renders', vars.yymmdd === '260802');
    ok('every placeholder expands',
        renderTemplate('{project}|{id}|{status}|{date}|{yymmdd}', vars) ===
        'Agent Farm|prj_test1234|active|2026-08-02|260802');
    ok('an unknown placeholder is left alone', renderTemplate('{nope}', vars) === '{nope}');
    ok('empty input is empty output', renderTemplate('', vars) === '');
}

// ---------- creating the folder ----------
{
    const dir = freshDir();
    const res = createSkeleton(path.join(dir, 'Agent Farm'), P());
    ok('nothing failed', res.failed.length === 0);
    ok('the charter is there', fs.existsSync(path.join(dir, 'Agent Farm', 'Charter.md')));
    ok('the folders are there', dirExists(path.join(dir, 'Agent Farm', '20_Decisions')));
    ok('the machine folder is there', dirExists(path.join(dir, 'Agent Farm', '_AF')));

    const charter = fs.readFileSync(path.join(dir, 'Agent Farm', 'Charter.md'), 'utf8');
    ok('the charter carries the id', charter.includes('af-id: prj_test1234'));
    ok('…and its role', charter.includes('af-role: charter'));
    ok('…and the project name', charter.includes('# Agent Farm'));
    ok('the worklog carries the anchor',
        fs.readFileSync(path.join(dir, 'Agent Farm', 'Worklog.md'), 'utf8').includes(LOG_ANCHOR));

    // running it again must be safe — this is what "Recreate" does
    fs.writeFileSync(path.join(dir, 'Agent Farm', 'Charter.md'), 'MY OWN TEXT', 'utf8');
    fs.rmSync(path.join(dir, 'Agent Farm', 'Plan.md'));
    const again = createSkeleton(path.join(dir, 'Agent Farm'), P());
    ok('‼️ an existing file is NEVER overwritten',
        fs.readFileSync(path.join(dir, 'Agent Farm', 'Charter.md'), 'utf8') === 'MY OWN TEXT');
    ok('…and it says it skipped it', again.skipped.some(p => p.endsWith('Charter.md')));
    ok('a missing file is filled back in', fs.existsSync(path.join(dir, 'Agent Farm', 'Plan.md')));
    ok('…and it says it created it', again.created.some(p => p.endsWith('Plan.md')));
}
{
    // a name in any script, and a name that would try to nest
    const dir = freshDir();
    createSkeleton(path.join(dir, 'Проект'), P({ name: 'Проект' }));
    ok('a non-Latin project name creates its folder', dirExists(path.join(dir, 'Проект')));

    const dir2 = freshDir();
    const r = createSkeleton(dir2, P({ name: 'a/b' }),
        [{ path: '{project}/Charter.md', role: 'charter' }]);
    ok('‼️ a slash in the name cannot silently create a nested folder',
        r.created.length === 1 && dirExists(path.join(dir2, 'a b')));

    const dir3 = freshDir();
    const escaped = createSkeleton(dir3, P(), [{ path: '../escape.md' }]);
    ok('a template path escaping the folder is refused, not written',
        escaped.failed.length === 1 && !fs.existsSync(path.join(path.dirname(dir3), 'escape.md')));
}

// ---------- a custom skeleton still produces identifiable files ----------
{
    const dir = freshDir();
    // a template that forgot the identity keys entirely
    createSkeleton(dir, P(), [{ path: 'Proje Tanımı.md', role: 'charter', template: '# Benim dosyam\n' }]);
    const text = fs.readFileSync(path.join(dir, 'Proje Tanımı.md'), 'utf8');
    ok('‼️ a custom charter template without af-id still gets one', text.includes('af-id: prj_test1234'));
    ok('…and its role', text.includes('af-role: charter'));
    ok('…and the user\'s own content survives', text.includes('# Benim dosyam'));

    const vars = templateVars(P());
    ok('a role already declared is respected, not corrected',
        ensureRoleFrontmatter('---\naf-role: plan\n---\nx', 'charter', vars).match(/af-role/g).length === 1);
    ok('a charter that has an id keeps it',
        ensureRoleFrontmatter('---\naf-id: prj_mine\naf-role: charter\n---\n', 'charter', vars)
            .includes('af-id: prj_mine'));
    ok('keys are inserted into an existing block, not a second one',
        (ensureRoleFrontmatter('---\naf-status: active\n---\nx', 'plan', vars).match(/^---$/gm) || []).length === 2);
}

// ---------- frontmatter reading ----------
{
    const fm = readAfFrontmatter([
        '---', 'af-id: prj_x', 'af-role:  charter ', 'af-tags: [a, "b", c]',
        'af-repos:', '  - D:\\code\\one', '  - D:\\code\\two',
        'title: not ours', 'af-empty:', '---', '# body', 'af-role: decoy'
    ].join('\n'));
    ok('scalar read and trimmed', fm['af-id'] === 'prj_x' && fm['af-role'] === 'charter');
    ok('an inline list is a list', Array.isArray(fm['af-tags']) && fm['af-tags'].join() === 'a,b,c');
    ok('a block list is a list', fm['af-repos'].join() === 'D:\\code\\one,D:\\code\\two');
    ok('non-af keys are ignored — the rest of the frontmatter is the user\'s', fm.title === undefined);
    ok('a key with no value is an empty list', Array.isArray(fm['af-empty']));
    ok('nothing in the body is read', fm['af-role'] === 'charter');
    ok('no frontmatter, no keys', Object.keys(readAfFrontmatter('# just a note')).length === 0);
    ok('unterminated frontmatter reads as none', Object.keys(readAfFrontmatter('---\naf-id: x\n')).length === 0);
    ok('CRLF is fine', readAfFrontmatter('---\r\naf-id: y\r\n---\r\n')['af-id'] === 'y');
    ok('a BOM is fine', readAfFrontmatter('\uFEFF---\naf-id: z\n---\n')['af-id'] === 'z');
    ok('empty input is fine', Object.keys(readAfFrontmatter('')).length === 0);
}

// ---------- ‼️ role discovery: the name is never what identifies a file ----------
{
    const dir = freshDir();
    createSkeleton(dir, P());
    const roles = scanRoles(dir);
    ok('the charter is found', roles.charter && roles.charter.endsWith('Charter.md'));
    ok('a file in a subfolder is found too', roles.deliverables.includes('30_Deliverables'));

    // now do what the user is explicitly allowed to do: rename it, and move it
    fs.mkdirSync(path.join(dir, '10_Notes'), { recursive: true });
    fs.renameSync(path.join(dir, 'Charter.md'),
        path.join(dir, '10_Notes', 'A-DOC - Agent Farm - Proje Tanımı - 260802.md'));
    const after = scanRoles(dir);
    ok('‼️ renamed AND moved, the charter is still found by its role',
        after.charter && after.charter.includes('Proje Tanımı'));
    ok('the other roles are unaffected', after.plan.endsWith('Plan.md'));

    // a file with no role contributes nothing
    fs.writeFileSync(path.join(dir, 'Random.md'), '# hello', 'utf8');
    ok('a note without a role is not mistaken for one', Object.keys(scanRoles(dir)).length === Object.keys(after).length);
    ok('scanning a folder that is not there is empty, not a crash',
        Object.keys(scanRoles(path.join(dir, 'nope'))).length === 0);
}

// ---------- folder rename ----------
{
    const dir = freshDir();
    const from = path.join(dir, 'Old Name');
    fs.mkdirSync(from);
    const r = renameProjectFolder(from, 'New Name');
    ok('rename works', r.ok && dirExists(path.join(dir, 'New Name')));
    ok('…and reports the new path', r.path === path.join(dir, 'New Name'));

    fs.mkdirSync(path.join(dir, 'Taken'));
    const clash = renameProjectFolder(path.join(dir, 'New Name'), 'Taken');
    ok('renaming onto an existing folder is refused', !clash.ok && !!clash.error);
    ok('‼️ a refused rename keeps the OLD path — never a path to nothing',
        clash.path === path.join(dir, 'New Name') && dirExists(clash.path));

    ok('a missing source is refused', !renameProjectFolder(path.join(dir, 'ghost'), 'x').ok);
    ok('an unusable name is refused', !renameProjectFolder(path.join(dir, 'New Name'), '///').ok);
    ok('renaming to the same name is a no-op success',
        renameProjectFolder(path.join(dir, 'New Name'), 'New Name').ok);
    ok('a Turkish name works', renameProjectFolder(path.join(dir, 'New Name'), 'Günlük İşler').ok
        && dirExists(path.join(dir, 'Günlük İşler')));
}

// ---------- guarded, atomic writes ----------
{
    const dir = freshDir();
    const file = path.join(dir, 'doc.md');
    const first = safeWriteDoc(file, 'one');
    ok('write works', first.ok && fs.readFileSync(file, 'utf8') === 'one');
    ok('it hands back the mtime', first.mtimeMs > 0 && first.mtimeMs === docMtime(file));
    ok('no temp file is left behind', !fs.existsSync(`${file}.af.tmp`));

    const guarded = safeWriteDoc(file, 'two', first.mtimeMs);
    ok('a guarded write on an unchanged file goes through', guarded.ok);

    // now simulate Obsidian writing to it while we were holding an old mtime
    tick();
    fs.writeFileSync(file, 'THE USER TYPED THIS', 'utf8');
    const refused = safeWriteDoc(file, 'three', guarded.mtimeMs);
    ok('‼️ a guarded write REFUSES when the file changed underneath', !refused.ok);
    ok('…and says why', /changed since it was read/.test(refused.error));
    ok('‼️ …and the user\'s text is still there',
        fs.readFileSync(file, 'utf8') === 'THE USER TYPED THIS');

    ok('an unguarded write still goes through', safeWriteDoc(file, 'four').ok);
    ok('a write creates missing folders',
        safeWriteDoc(path.join(dir, 'deep', 'a', 'b.md'), 'x').ok);
    ok('the mtime of a file that is not there is 0', docMtime(path.join(dir, 'ghost.md')) === 0);
}

// ---------- the worklog ----------
{
    const dir = freshDir();
    const file = path.join(dir, 'Worklog.md');

    ok('an empty entry is refused', !insertLogEntry(file, '   ').ok);
    ok('writing to a file that does not exist creates it', insertLogEntry(file, '- first').ok);
    ok('…with an anchor', fs.readFileSync(file, 'utf8').includes(LOG_ANCHOR));

    insertLogEntry(file, '- second');
    insertLogEntry(file, '- third');
    const body = fs.readFileSync(file, 'utf8');
    ok('‼️ newest is on top', body.indexOf('- third') < body.indexOf('- second'));
    ok('…and nothing was lost', ['- first', '- second', '- third'].every(s => body.includes(s)));
    ok('the anchor stays above them all', body.indexOf(LOG_ANCHOR) < body.indexOf('- third'));
    ok('the gap does not grow with each insert', !/\n{4,}/.test(body));

    // the user moved the anchor to the bottom — entries must follow it
    const moved = path.join(dir, 'Moved.md');
    fs.writeFileSync(moved, `# Log\n\n- old entry\n\n${LOG_ANCHOR}\n`, 'utf8');
    insertLogEntry(moved, '- newest');
    const movedBody = fs.readFileSync(moved, 'utf8');
    ok('‼️ moving the anchor moves where entries land',
        movedBody.indexOf('- old entry') < movedBody.indexOf('- newest'));

    // a log the user rewrote without an anchor still works
    const noAnchor = path.join(dir, 'NoAnchor.md');
    fs.writeFileSync(noAnchor, '# My log\n\n- mine\n', 'utf8');
    insertLogEntry(noAnchor, '- added');
    const na = fs.readFileSync(noAnchor, 'utf8');
    ok('with no anchor it appends instead of refusing', na.includes('- added'));
    ok('…and the user\'s content is untouched', na.includes('- mine') && na.startsWith('# My log'));
}

// ---------- rescan ----------
{
    const root = freshDir();
    createSkeleton(path.join(root, 'Agent Farm'), P());
    createSkeleton(path.join(root, 'TalkScribe'), P({ id: 'prj_talk0001', name: 'TalkScribe' }));
    fs.mkdirSync(path.join(root, 'Just A Folder'));
    fs.mkdirSync(path.join(root, '.hidden'));

    const scanned = scanProjectsRoot(root);
    const by = Object.fromEntries(scanned.map(s => [s.name, s]));
    ok('both projects are found', !!by['Agent Farm'] && !!by.TalkScribe);
    ok('ids come off the charter', by['Agent Farm'].id === 'prj_test1234');
    ok('status comes off the charter', by['Agent Farm'].status === 'active');
    ok('a folder with no charter is reported as unregistered',
        by['Just A Folder'] && by['Just A Folder'].unregistered === true);
    ok('a dot folder is skipped', !by['.hidden']);
    ok('a registered project is not flagged', by.TalkScribe.unregistered === false);

    // ‼️ the user renames the folder in Obsidian — same project, new name
    fs.renameSync(path.join(root, 'Agent Farm'), path.join(root, 'Agent Farm 2'));
    const after = scanProjectsRoot(root);
    const renamed = after.find(s => s.id === 'prj_test1234');
    ok('‼️ a folder renamed in Obsidian is still the same project', !!renamed);
    ok('…and its new name is the folder name', renamed.name === 'Agent Farm 2');

    // somebody copied a project folder to start another one
    fs.cpSync(path.join(root, 'TalkScribe'), path.join(root, 'TalkScribe Copy'), { recursive: true });
    const dupes = scanProjectsRoot(root).filter(s => s.id === 'prj_talk0001');
    ok('‼️ a duplicated id is claimed by exactly one folder', dupes.length === 1);
    ok('…and the copy is reported as unregistered, not as the original',
        scanProjectsRoot(root).find(s => s.name === 'TalkScribe Copy').unregistered === true);

    ok('scanning a root that is not there is empty', scanProjectsRoot(path.join(root, 'nope')).length === 0);
}

try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best effort */ }

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
