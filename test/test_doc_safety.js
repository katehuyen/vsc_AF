// X-460 — THREE WAYS A PROJECT DOCUMENT LOST TEXT, CLOSED. (1) Archiving moved
// only a closed item's checkbox line and left its indented notes behind,
// headless. (2) No write kept the version it replaced. (3) Reads that are
// parsed or written back used the 512 KB DISPLAY cap: a 1.2 MB backlog answered
// from its head, and the Backloglog (809 KB) was merged from its head and
// written back, dropping hand-written lines past the cap on every rewrite.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const out = m => require(path.join(ROOT, 'out', 'core', m + '.js'));
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const K = out('backlogBlock'), B = out('projectBacklog'), D = out('docBackup'), PD = out('projectDocs');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

console.log('\n== an item is its line and the indented lines under it ==');
{
    const L = ['- [x] X-1 a', '    note', '', '    more', '', 'prose', '- [ ] X-2 b', '    - [ ] X-3 nested', '    tail'];
    const items = new Set([0, 6, 7]);
    ok('indented lines, and a blank between them, belong to the item; the trailing blank does not',
        K.itemBlockEnd(L, 0, items) === 3);
    ok('a nested checkbox is an item of its own and ends the block', K.itemBlockEnd(L, 6, items) === 6);
    ok('…and the lines under it are its own', K.itemBlockEnd(L, 7, items) === 8);
    ok('a line with nothing under it is a block of one', K.itemBlockEnd(['- [x] X-1', 'flat'], 0, new Set([0])) === 0);
}

console.log('\n== archiving moves the whole block ==');
{
    const doc = [
        '---', 'af-role: backlog', '---', '', '## X — Cross', '',
        '- [x] X-1 Done thing', '    indented note one', '    - sub bullet note', '', '    after a blank, still its own',
        '- [ ] X-2 Open thing', '    open note',
        '- [x] X-3 Closed parent', '    - [ ] X-4 nested open', '    note under the nested one', ''
    ].join('\n');
    const a = B.archiveBacklogDone(doc);
    const lines = a.text.split('\n');
    const archAt = lines.indexOf('## 🗄 Archive');
    ok('two closed items moved', a.ok && a.moved === 2 && archAt > 0);
    ok('X-1 arrives with every indented line, in order',
        lines.slice(archAt).join('\n').includes('- [x] X-1 Done thing\n    indented note one\n    - sub bullet note\n\n    after a blank, still its own'));
    ok('nothing of X-1 is left above the archive', !lines.slice(0, archAt).some(l => /indented note one|sub bullet note|after a blank/.test(l)));
    ok('the open item keeps its own note where it was',
        lines.slice(0, archAt).join('\n').includes('- [ ] X-2 Open thing\n    open note'));
    ok('a nested open checkbox and its lines stay: open work never moves (X-134)',
        lines.slice(0, archAt).join('\n').includes('    - [ ] X-4 nested open\n    note under the nested one')
        && B.parseBacklog(a.text).items.find(i => i.code === 'X-4').archived !== true);
    const again = B.archiveBacklogDone(a.text);
    ok('archiving again moves nothing', again.moved === 0);
    // an archive that already exists: the insert point shifts by the LINES taken above it
    const withArch = [
        '## X — Cross', '', '- [x] X-5 closed', '    its note', '    its second note', '- [ ] X-6 open', '',
        '## 🗄 Archive', '', '- [x] X-0 old', ''
    ].join('\n');
    const b = B.archiveBacklogDone(withArch);
    const bl = b.text.split('\n');
    const at = bl.indexOf('## 🗄 Archive');
    ok('into an existing archive: right under its heading, block intact, the old entry kept',
        b.moved === 1 && bl.slice(at + 1, at + 4).join('\n').includes('- [x] X-5 closed\n    its note\n    its second note')
        && bl.includes('- [x] X-0 old') && bl.indexOf('- [ ] X-6 open') < at);
}

console.log('\n== a write keeps the version it replaces ==');
{
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-docsafety-'));
    try {
        const store = path.join(tmp, 'store'), proj = path.join(tmp, 'proj');
        fs.mkdirSync(proj);
        fs.writeFileSync(path.join(proj, 'Backlog.md'), 'v1', 'utf8');
        D.configureDocBackups(store);
        const w1 = PD.writeProjectDoc(proj, 'Backlog.md', 'v2');
        const w2 = PD.writeProjectDoc(proj, 'Backlog.md', 'v3');
        const vs = D.listDocBackups(path.join(proj, 'Backlog.md'));
        ok('each write reports where the replaced version went', w1.ok && w2.ok && !!w1.backup && !!w2.backup && w1.backup !== w2.backup);
        ok('the versions are listed newest first, each holding what the write replaced',
            vs.length === 2 && fs.readFileSync(vs[0].path, 'utf8') === 'v2' && fs.readFileSync(vs[1].path, 'utf8') === 'v1');
        ok('the copies live in the store, never beside the document',
            vs.every(v => v.path.startsWith(store)) && fs.readdirSync(proj).join() === 'Backlog.md');
        const fresh = PD.writeProjectDoc(proj, 'New.md', 'x');
        ok('a new file has nothing to keep', fresh.ok && !fresh.backup);
        PD.writeBrief(proj, 'brief 1'); PD.writeBrief(proj, 'brief 2');
        ok('_AF/ is ours and rewritten every spawn: no copies of it', D.listDocBackups(path.join(proj, '_AF', 'BRIEF.md')).length === 0);
        const f = path.join(proj, 'Backlog.md');
        const T = new Date(2026, 9, 2, 12, 0, 0, 0).getTime();
        for (let i = 0; i < 6; i++) { D.backupBeforeWrite(f, T, 3); }
        const kept = D.listDocBackups(f);
        ok('only the newest are kept, and a second copy in the same millisecond still sorts after the first',
            kept.length === 3 && kept[0].at > kept[1].at && kept[1].at > kept[2].at && kept[0].at >= T);
        D.backupBeforeWrite(f, T - 60000, 3);
        ok('a clock set back still stamps the new copy after the newest', D.listDocBackups(f)[0].at > kept[0].at);
        D.configureDocBackups(undefined);
        ok('backups off: a write still works and keeps nothing', PD.writeProjectDoc(proj, 'Backlog.md', 'v4').ok && !PD.writeProjectDoc(proj, 'Backlog.md', 'v5').backup);
    } finally {
        D.configureDocBackups(undefined);
        fs.rmSync(tmp, { recursive: true, force: true });
    }
}

console.log('\n== parsed or written back: the whole file ==');
{
    const ext = src('src/extension.ts');
    ok('the backlog ops read the whole file and refuse a head',
        /readProjectDoc\(folder, relDoc\(folder, file as string\), DOC_EDIT_CAP\);\s*need\(read\.ok[^\n]*\n\s*need\(!read\.truncated/.test(ext));
    ok('the Backlog page reads the whole file and says so when even that is cut',
        /const read = readProjectDoc\(doc\.folder, doc\.path, DOC_EDIT_CAP\);\s*if \(!read\.ok\) \{ return \{ state: 'unreadable'/.test(ext)
        && /read\.truncated \? \{ truncated: true, size: read\.size \}/.test(ext) && /d\.truncated \? `<p class="muted small">⚠️ This backlog is too large/.test(src('media/projects.js')));
    ok('the Backloglog is merged from the whole file and never written back from a head',
        /const current = readProjectDoc\(folder, rel, DOC_EDIT_CAP\);\s*\/\/[^\n]*\n\s*if \(current\.truncated\) \{ return \{ error:/.test(ext));
    ok('the handover merge and template seeding refuse a head as well',
        /if \(existing\?\.truncated\) \{ return \{ error:/.test(ext) && (ext.match(/if \(!read\.ok \|\| read\.truncated\)/g) || []).length === 2);
    ok('no backlog or backloglog role document is read at the display cap any more',
        !/readProjectDoc\(folder, relDoc\(folder, roles\.backlog(log)?\)\)/.test(ext));
    ok('backups are switched on at activation, in the extension\'s own storage',
        /configureDocBackups\(path\.join\(context\.globalStorageUri\.fsPath, 'doc-backups'\)\)/.test(ext));
    ok('the bridge lists the versions: projects.doc.backups', /op: 'projects\.doc\.backups'/.test(ext) && /listDocBackups\(file as string\)/.test(ext));
}

console.log(`test_doc_safety: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
