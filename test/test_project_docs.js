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
    ok('roles complete',
        PROJECT_DOC_ROLES.join() === 'charter,plan,people,log,deliverables,backlog,backloglog,brief,handover');
    // ‼️ the handover is a ROLE but not a skeleton entry: it is built from the
    // project's own record when somebody asks, and shipping an empty one with
    // every new project puts a file in the folder that says nothing
    ok('‼️ handover is a role with no skeleton entry — it is generated, not seeded',
        PROJECT_DOC_ROLES.indexOf('handover') >= 0
        && !DEFAULT_SKELETON.some(e => e.role === 'handover'));
    ok('the backlog and its log are both in the skeleton, side by side',
        DEFAULT_SKELETON.some(e => e.role === 'backlog')
        && DEFAULT_SKELETON.some(e => e.role === 'backloglog'));
    ok('the track ledger\'s folder is DECLARED, never matched by name',
        DEFAULT_SKELETON.some(e => e.holds === 'tracks'));
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

    // ‼️ A LOG THAT CANNOT BE READ IS NOT AN EMPTY LOG.
    // The read used to be wrapped in `catch { existing = '' }`, so ANY failure
    // to read — a file a syncing client is holding, a permission that changed —
    // became "there is nothing there" and the whole worklog was replaced by the
    // one line being added. A directory standing where the file should be is
    // the same class of failure (EISDIR) and is the one a test can produce on
    // every platform.
    const asFolder = path.join(dir, 'Unreadable.md');
    fs.mkdirSync(asFolder);
    const refused = insertLogEntry(asFolder, '- must not land');
    ok('‼️ a log that is there but unreadable is refused, not overwritten', !refused.ok);
    ok('…and it says so rather than reporting success', /could not be read/.test(refused.error || ''));
    ok('…and what was there is still there',
        fs.existsSync(asFolder) && fs.statSync(asFolder).isDirectory());
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

// ===========================================================================
// Faz 4 — the documents are alive: decisions, deliverables, the tree, and a
// brief that shortens its lists rather than losing its instructions.
// ===========================================================================

const {
    addDecision, addDeliverableRow, buildBrief, decisionsFolder, DOC_EDIT_CAP, DOC_READ_CAP,
    listProjectDocs, parseDeliverables, readProjectDoc, resolveInFolder,
    scanProjectFolder, writeProjectDoc
} = require(path.join(__dirname, '..', 'out', 'core', 'projectDocs.js'));

// ---------- decisions: one file each, never overwritten ----------
{
    const dir = freshDir();
    const p = P({ folder: dir });
    createSkeleton(dir, p);

    const one = addDecision(dir, { title: 'The channel is a file', body: 'Measured.', now: new Date(2026, 7, 3) });
    ok('a decision is written', one.ok && fs.existsSync(one.file));
    ok('…into the folder the skeleton declares it holds decisions in',
        path.basename(path.dirname(one.file)) === '20_Decisions');
    const body = fs.readFileSync(one.file, 'utf8');
    ok('…found by frontmatter, not by name', /af-role: decision/.test(body));
    ok('…and dated by the document itself', /af-date: 2026-08-03/.test(body));
    ok('…with the title as its heading', /^# The channel is a file$/m.test(body));

    const two = addDecision(dir, { title: 'The channel is a file', now: new Date(2026, 7, 3) });
    ok('‼️ a second decision with the same title NEVER overwrites the first',
        two.ok && two.file !== one.file && fs.readFileSync(one.file, 'utf8') === body);

    const scan = scanProjectFolder(dir);
    ok('both are found, newest first, in ONE folder walk',
        scan.decisions.length === 2 && !!scan.roles.charter);
    ok('a decision is not confused with an af-role document',
        !scan.roles.charter.includes('20_Decisions'));
    ok('a stated af-date is used rather than the file\'s mtime',
        scan.decisions.every(d => d.fromMtime === false));
    ok('new decisions follow the ones already there, wherever the user moved them',
        decisionsFolder(dir) === path.dirname(one.file));
    ok('a decision needs a title', !addDecision(dir, { title: '  ' }).ok);
    ok('a project with no folder on disk says so',
        !addDecision(path.join(dir, 'gone'), { title: 'x' }).ok);
}

// ---------- deliverables: rows in the user's own table ----------
{
    const shipped = '---\naf-role: deliverables\n---\n\n# X — Deliverables\n\n| What | Version | Date | Where |\n|---|---|---|---|\n';
    const a = addDeliverableRow(shipped, { what: 'VSIX', version: '3.57.0', date: '2026-08-03', where: 'local' });
    ok('a row is appended to the table', a.ok && /\| VSIX \| 3\.57\.0 \| 2026-08-03 \| local \|/.test(a.text));
    const b = addDeliverableRow(a.text, { what: 'Second', date: '2026-08-04' });
    ok('…after the LAST row, not at the end of the document',
        b.text.indexOf('Second') > b.text.indexOf('VSIX'));

    const rows = parseDeliverables(b.text).rows;
    ok('rows are read back', rows.length === 2 && rows[0].what === 'VSIX');
    ok('a real date becomes a real timestamp', rows[0].ts > 0);
    const q = parseDeliverables(addDeliverableRow(b.text, { what: 'Later', date: 'Q3' }).text).rows;
    ok('‼️ a date that is not a date gets NO timestamp rather than an invented one',
        q[2].what === 'Later' && q[2].ts === 0);

    // the user REORDERED the columns — names still say where each value goes
    const moved = '| Where | What | Date | Version |\n|---|---|---|---|\n';
    const m = addDeliverableRow(moved, { what: 'b', version: '2', date: '2026-02-02', where: 'y' });
    ok('‼️ values follow the table\'s OWN columns, by name where it says so',
        /\| y \| b \| 2026-02-02 \| 2 \|/.test(m.text));

    // a table in another language names nothing we know: position is the only
    // guess available, and it is made in the shipped order
    const foreign = '| Ne | Sürüm | Tarih | Nerede |\n|---|---|---|---|\n';
    const f = addDeliverableRow(foreign, { what: 'b', version: '2', date: '2026-02-02', where: 'y' });
    ok('a table that names nothing we know is filled positionally',
        /\| b \| 2 \| 2026-02-02 \| y \|/.test(f.text));

    // …and a mixed one keeps the column it DID name
    const mixed = '| Nerede | Ne | Date |\n|---|---|---|\n';
    const x = addDeliverableRow(mixed, { what: 'b', version: '2', date: '2026-02-02', where: 'y' });
    ok('‼️ a named column keeps its value even when its neighbours are guesses',
        /\| b \| 2 \| 2026-02-02 \|$/m.test(x.text));
    ok('…and the row never grows more cells than the table has columns',
        x.text.trim().split('\n').pop().split('|').length === mixed.trim().split('\n')[0].split('|').length);

    const prose = '# Notes\n\nnothing tabular here\n';
    const d = addDeliverableRow(prose, { what: 'first', date: '2026-03-03' });
    ok('with no table at all one is created — the only case this decides a column name',
        /\| What \| Version \| Date \| Where \|/.test(d.text) && /\| first \|/.test(d.text));
    ok('…and the prose above it is untouched', d.text.startsWith(prose));
    ok('a pipe in a value cannot break the table',
        /a\\\|b/.test(addDeliverableRow(shipped, { what: 'a|b' }).text));
    ok('a deliverable needs a name', !addDeliverableRow(shipped, { what: '' }).ok);
    ok('a table under prose is still found',
        parseDeliverables('intro\n\n| A | B |\n|---|---|\n| 1 | 2 |\n').rows.length === 1);
}

// ---------- the folder boundary ----------
{
    const dir = freshDir();
    createSkeleton(dir, P({ folder: dir }));
    ok('a path inside is resolved', !!resolveInFolder(dir, 'Plan.md'));
    ok('‼️ a path climbing out is refused, not sanitised',
        !resolveInFolder(dir, '../secret.md') && !resolveInFolder(dir, 'a/../../b'));
    ok('‼️ an absolute path is refused', !resolveInFolder(dir, 'C:/Windows/x') && !resolveInFolder(dir, '/etc/passwd'));
    ok('a backslash path is the same path', !!resolveInFolder(dir, '30_Deliverables\\Deliverables.md'));
    ok('reading outside the folder fails with a message, never with content',
        readProjectDoc(dir, '../../x').ok === false);
    ok('reading a folder is not reading a document', readProjectDoc(dir, '10_Notes').ok === false);
    ok('writing outside the folder is refused', writeProjectDoc(dir, '../x.md', 'no').ok === false);

    // ‼️ "NOT THERE" AND "THERE BUT UNREADABLE" ARE DIFFERENT ANSWERS.
    // Everything that decides whether a write can destroy something reads the
    // failed read as "nothing to lose". If a file that EXISTS but could not be
    // read came back looking the same as one that is absent, the create path
    // would replace it — which is precisely the blind overwrite the write side
    // exists to make impossible.
    const gone = readProjectDoc(dir, '10_Notes/never-written.md');
    ok('a file that is not there says so', !gone.ok && gone.missing === true);
    ok('‼️ a folder standing where a file was asked for does NOT claim to be missing',
        readProjectDoc(dir, '10_Notes').missing !== true);
    ok('a path outside the folder does not claim to be missing either',
        readProjectDoc(dir, '../x.md').missing !== true);
}

// ---------- the tree ----------
{
    const dir = freshDir();
    createSkeleton(dir, P({ folder: dir }));
    fs.writeFileSync(path.join(dir, '10_Notes', 'note.md'), '# note\n');
    const entries = listProjectDocs(dir);
    const by = Object.fromEntries(entries.map(e => [e.rel, e]));
    ok('folders and files are both listed, by a path relative to the project',
        by['10_Notes'].dir === true && by['Plan.md'].dir === false);
    ok('a document declares its role', by['Plan.md'].role === 'plan' && by['Charter.md'].role === 'charter');
    ok('a nested file is reached', !!by['10_Notes/note.md']);
    ok('a plain note claims no role', !by['10_Notes/note.md'].role);
    ok('folders come before files, so it reads like a file explorer',
        entries.findIndex(e => e.dir) < entries.findIndex(e => !e.dir));
    ok('the machine folder\'s own dotfile is not offered as a document',
        !entries.some(e => e.name.startsWith('.')));
    // ‼️ The machine FOLDER is marked too, not just the brief inside it — that
    // is what lets a caller keep it out of "where shall I put this note?". A
    // note filed under `_AF/` is gone at the next session start.
    ok('‼️ the machine folder itself is marked as generated', by['_AF'].managed === true);
    ok('…and a folder the user owns is not', by['10_Notes'].managed !== true);
}

// ---------- ‼️ the write refuses rather than overwriting Obsidian ----------
{
    const dir = freshDir();
    createSkeleton(dir, P({ folder: dir }));
    const first = readProjectDoc(dir, 'Plan.md');
    ok('a read hands back the mtime to guard the next write', first.ok && first.mtimeMs > 0);

    tick();
    // the user types in Obsidian while we were thinking
    fs.writeFileSync(path.join(dir, 'Plan.md'), 'what the user just wrote\n');
    const late = writeProjectDoc(dir, 'Plan.md', 'what we would have written', first.mtimeMs);
    ok('‼️ a write guarded by a stale mtime REFUSES', !late.ok && /changed since/.test(late.error));
    ok('…and the user\'s text is still on disk, whole',
        fs.readFileSync(path.join(dir, 'Plan.md'), 'utf8') === 'what the user just wrote\n');

    const fresh = readProjectDoc(dir, 'Plan.md');
    const good = writeProjectDoc(dir, 'Plan.md', 'agreed', fresh.mtimeMs);
    ok('…and re-reading first makes the write go through', good.ok);
    ok('no temp file is left behind by an atomic write',
        !fs.readdirSync(dir).some(f => f.endsWith('.af.tmp')));

    const big = 'x'.repeat(DOC_READ_CAP + 100);
    fs.writeFileSync(path.join(dir, '10_Notes', 'big.md'), big);
    const read = readProjectDoc(dir, '10_Notes/big.md');
    ok('a huge file comes back as its head and SAYS so, rather than freezing a webview',
        read.ok && read.truncated === true && read.text.length === DOC_READ_CAP && read.size === big.length);

    // ‼️ THE EDIT PATH HAS ITS OWN CEILING. Sharing the display cap turned a
    // safety into a trap: a backlog past 512 KB could not be added to, ticked,
    // moved, promoted or ARCHIVED — and archiving is the operation that would
    // have shrunk it, so the only way out was to hand-edit the file. Half a
    // megabyte of markdown was never what the webview cap was about.
    const whole = readProjectDoc(dir, '10_Notes/big.md', DOC_EDIT_CAP);
    ok('‼️ …but a caller that is going to WRITE it back reads all of it',
        whole.ok && whole.truncated === false && whole.text.length === big.length);
    ok('…and the edit ceiling is far above anything a person writes by hand, without being unlimited',
        DOC_EDIT_CAP > DOC_READ_CAP && Number.isFinite(DOC_EDIT_CAP));
    // X-460 — six now: doc.write, editProjectDoc, the handover merge, the two template seeds, the Backloglog render
    ok('‼️ the rewrite paths ask for the EDIT ceiling — the trap was one shared number',
        (fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8')
            .match(/readProjectDoc\(folder, rel, DOC_EDIT_CAP\)/g) || []).length === 6);
}

// ---------- the brief inlines the charter's constitution, not the queues ----------
{
    const { parseCharterSections } = require(path.join(__dirname, '..', 'out', 'core', 'projectDocs.js'));
    const charterDoc = (...body) => ['---', 'af-role: charter', '---', '', '# Charter', '', ...body, ''].join('\n');

    const dir = freshDir();
    const p = P({
        folder: dir, summary: 'the command centre',
        people: [{ name: 'PERSONWORD', role: 'owner', kind: 'person' }]
    });
    createSkeleton(dir, p);
    const scan0 = scanProjectFolder(dir);
    fs.writeFileSync(scan0.roles.charter, charterDoc(
        '## What this is', 'Prose the brief does not own.', '',
        '## Scope & Anti-Scope', '- Purpose: orchestrate the fleet.', '- Anti-Scope: it runs no model of its own.', '',
        '## Code Architecture', '- Entrypoint: src/extension.ts', '',
        '## Verification Gate', '- Test Command: `npm test`', '',
        '## Project Invariants', '1. Files stay under 300 lines.'));
    fs.writeFileSync(scan0.roles.plan, '---\naf-role: plan\n---\n\n# Plan\n\n## Milestones\n- [ ] PLANWORD belgeler\n');
    fs.writeFileSync(scan0.roles.backlog, '---\naf-role: backlog\n---\n\n# Backlog\n\n## U\n- [ ] U-1 BACKLOGWORD form\n');
    insertLogEntry(scan0.roles.log, '- 2026-08-03 — LOGWORD Faz 4 started.');
    addDecision(dir, { title: 'DECISIONWORD found by frontmatter', now: new Date(2026, 7, 3) });

    const brief = buildBrief({ project: p, roles: scanProjectFolder(dir).roles, repos: ['D:/c/app'] });
    ok('‼️ the brief inlines the invariants — an agent cannot plead ignorance of what is in front of it',
        /## Project Invariants/.test(brief) && /Files stay under 300 lines/.test(brief));
    ok('…the scope and the anti-scope', /## Scope & Anti-Scope/.test(brief) && /it runs no model of its own/.test(brief));
    ok('…the code map and the verification gate',
        /## Code Architecture/.test(brief) && /src\/extension\.ts/.test(brief)
        && /## Verification Gate/.test(brief) && /npm test/.test(brief));
    ok('…and not the charter prose under headings it does not own', !brief.includes('Prose the brief does not own'));

    // ‼️ THE QUEUES ARE NOT IN THE BRIEF, AND THAT IS THE POINT. A brief is
    // pinned in the prompt cache for a whole session; a backlog copied into it
    // is stale by the second turn, and the space it took belongs to the rules.
    ok('‼️ no backlog', !brief.includes('BACKLOGWORD') && !/## Next in backlog/.test(brief));
    ok('…no open plan items', !brief.includes('PLANWORD') && !/## Open plan items/.test(brief));
    ok('…no worklog lines', !brief.includes('LOGWORD') && !/## Recently/.test(brief));
    ok('…no decision records', !brief.includes('DECISIONWORD') && !/## Recent decisions/.test(brief));
    ok('…and no people', !brief.includes('PERSONWORD') && !/## People/.test(brief));
    ok('…and it still ends by saying where to write back',
        brief.indexOf('## Writing back') > brief.indexOf('## Project Invariants'));

    // ---- the heading reader
    const s = parseCharterSections(charterDoc(
        '## Kapsam', '- ne yapar', '', '## Kapsam dışı', '- ne yapmaz', '',
        '## MİMARİ', '- src/core saf', '', '## Doğrulama', '- npm test', '', '## Kurallar', '- 300 satır', '',
        '## Research notes', '- NOTARCH', '', '## Latest', '- NOTTEST'));
    ok('‼️ Turkish headings are read too — the user writes the charter in their own language',
        /ne yapar/.test(s.scope || '') && /src\/core saf/.test(s.architecture || '')
        && /npm test/.test(s.verification || '') && /300 satır/.test(s.invariants || ''));
    ok('‼️ a second heading of the same kind CONTINUES the section instead of wiping it',
        /ne yapar/.test(s.scope || '') && /### Kapsam dışı/.test(s.scope || '') && /ne yapmaz/.test(s.scope || ''));
    ok('‼️ headings match by WORD — "Research" is not architecture, "Latest" is not a test',
        !/NOTARCH/.test(s.architecture || '') && !/NOTTEST/.test(s.verification || ''));
    ok('an old charter\'s plain "## Scope" still feeds the brief', /x/.test(parseCharterSections(charterDoc('## Scope', 'x')).scope || ''));
    ok('the template\'s "Why it exists" is not mistaken for a constitutional section',
        Object.values(parseCharterSections(charterDoc('## Why it exists', 'WHY'))).every(v => !v));

    // ‼️ THE BUDGET SHORTENS THE LONG ENTRIES; IT MUST NEVER COST THE INSTRUCTIONS.
    // A project whose charter is a real document — which is exactly when the
    // old slice-the-tail cap started eating the "writing back" section.
    const busyDir = freshDir();
    const busy = P({ folder: busyDir, summary: 'a project with a constitution behind it' });
    createSkeleton(busyDir, busy);
    const busyRoles = scanProjectFolder(busyDir).roles;
    fs.writeFileSync(busyRoles.charter, charterDoc(
        '## Project Invariants',
        ...Array.from({ length: 12 }, (_, i) => `${i + 1}. Invariant number ${i} with a long enough sentence behind it to be worth clipping.`),
        '', '## Code Architecture',
        ...Array.from({ length: 8 }, (_, i) => `- Module number ${i} lives exactly where the map says it lives.`)));
    const seed = { project: busy, roles: scanProjectFolder(busyDir).roles, repos: ['D:/c/app'] };

    const full = buildBrief(seed);
    const tight = buildBrief({ ...seed, maxChars: 1800 });
    ok('‼️ a budgeted brief actually fits its budget', tight.length <= 1800);
    ok('…which means it is genuinely shorter than the full one', tight.length < full.length);
    ok('‼️ …and it STILL says where to write back — the section the old cap sliced off',
        /## Writing back/.test(tight) && /worklog/.test(tight));
    ok('‼️ …and it still says which file holds which role, which is the point of a brief',
        /## Where things are/.test(tight) && /log:/.test(tight));
    ok('…it still carries the invariants, shortened visibly rather than dropped',
        /## Project Invariants/.test(tight) && /…/.test(tight));
    ok('an unbudgeted brief is the FULL one — it is what the "cut to fit" pointer points at',
        full.includes('Invariant number 11') && full.includes('Module number 7'));
    ok('a budget nothing can satisfy still returns a whole document rather than a sliced one',
        /## Writing back/.test(buildBrief({ ...seed, maxChars: 50 })));

    // ‼️ ONE ENORMOUS SECTION. A charter is prose the user writes, and a single
    // paragraph can outweigh the whole budget on its own.
    const fatDir = freshDir();
    const fat = P({ folder: fatDir, summary: 'a project whose charter is a wall of text' });
    createSkeleton(fatDir, fat);
    const fatRoles = scanProjectFolder(fatDir).roles;
    fs.writeFileSync(fatRoles.charter, charterDoc('## Project Invariants', '- ' + 'kelime '.repeat(400).trim() + '.'));
    const fatSeed = { project: fat, roles: scanProjectFolder(fatDir).roles, repos: [] };
    const fatFull = buildBrief(fatSeed);
    const fatTight = buildBrief({ ...fatSeed, maxChars: 2500 });
    ok('‼️ ONE enormous charter section still fits the budget', fatTight.length <= 2500);
    ok('‼️ …and the instructions survive it, which is the whole point of the budget',
        /## Writing back/.test(fatTight) && /worklog/.test(fatTight));
    ok('…the section was shortened visibly, not silently', /…/.test(fatTight));
    ok('…and the FULL brief on disk keeps the whole section — it is what the pointer points at',
        fatFull.length > 2500 && !/…/.test(fatFull));

    // ‼️ THE BUDGET LOOP MUST NOT RE-READ THE FOLDER: it renders at up to seven
    // widths to find one that fits, and reading inside the renderer meant seven
    // disk reads of the same charter for one brief.
    const real = fs.readFileSync;
    let charterReads = 0;
    fs.readFileSync = function (f, ...rest) {
        if (typeof f === 'string' && f === fatRoles.charter) { charterReads++; }
        return real.call(fs, f, ...rest);
    };
    try { buildBrief({ ...fatSeed, maxChars: 900 }); } finally { fs.readFileSync = real; }
    ok('‼️ the charter is read ONCE per brief, not once per budget level', charterReads === 1);
}

try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best effort */ }

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
