// B3 — what the agent did to the code (compiled core/codeedits.js, pure).
// The transcript records every file-writing tool call WITH its before/after
// text, so the diff Agent Farm shows is what THAT session changed, at the time
// it changed it — never a later session's work, never the file's current state.
// A call that came back as an error changed nothing and must never be counted.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { collectEdits, groupByFile, hunkStats, fileStats } =
    require(path.join(__dirname, '..', 'out', 'core', 'codeedits.js'));

const L = o => JSON.stringify(o);
const user = (text, extra) => L(Object.assign({
    type: 'user', timestamp: '2026-07-27T10:00:00.000Z',
    message: { role: 'user', content: text }
}, extra));
const assistant = (blocks, ts) => L({
    type: 'assistant', timestamp: ts || '2026-07-27T10:01:00.000Z',
    message: { role: 'assistant', content: blocks }
});
const toolUse = (id, name, input) => ({ type: 'tool_use', id, name, input });
const result = (id, isError) => L({
    type: 'user', timestamp: '2026-07-27T10:02:00.000Z',
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: !!isError }] }
});

// ---------- the shapes each write tool has ----------
{
    const lines = [
        user('fix the popup'),
        assistant([toolUse('t1', 'Edit', {
            file_path: 'D:/app/src/popup.ts', old_string: 'let a = 1;', new_string: 'const a = 1;\nconst b = 2;'
        })]),
        result('t1'),
        assistant([toolUse('t2', 'Write', { file_path: 'D:/app/src/new.ts', content: 'a\nb\nc' })]),
        result('t2'),
        assistant([toolUse('t3', 'MultiEdit', {
            file_path: 'D:/app/src/popup.ts',
            edits: [{ old_string: 'x', new_string: 'y' }, { old_string: 'p', new_string: 'q' }]
        })]),
        result('t3'),
        assistant([toolUse('t4', 'NotebookEdit', { notebook_path: 'D:/app/nb.ipynb', new_source: 'print(1)' })]),
        assistant([toolUse('t5', 'Read', { file_path: 'D:/app/src/other.ts' })]),   // a read is not a change
        assistant([toolUse('t6', 'Bash', { command: 'ls' })])
    ];
    const recs = collectEdits(lines);
    ok('reads and shell calls are not edits', !recs.some(r => /other\.ts/.test(r.file)));
    ok('Edit keeps both sides',
        recs[0].tool === 'Edit' && recs[0].oldText === 'let a = 1;' && /const b = 2;/.test(recs[0].newText));
    ok('Write carries the whole content and its size',
        recs[1].tool === 'Write' && recs[1].newText === 'a\nb\nc' && recs[1].bytes === 5);
    ok('MultiEdit becomes one record per hunk',
        recs[2].hunk === 1 && recs[3].hunk === 2 && recs[3].newText === 'q');
    ok('NotebookEdit is read from notebook_path',
        recs[4].tool === 'NotebookEdit' && /nb\.ipynb$/.test(recs[4].file));
    ok('every record carries a timestamp and a turn',
        recs.every(r => r.ts > 0 && r.turn >= 1));

    const files = groupByFile(recs);
    const popup = files.find(f => /popup\.ts$/.test(f.file));
    ok('hunks of one file are grouped', popup.edits === 3);
    ok('a Write marks the file as written', files.find(f => /new\.ts$/.test(f.file)).written === true);
    ok('an edited-only file is not "written"', popup.written === false);
    ok('files are listed newest activity first', files[0].lastTs >= files[files.length - 1].lastTs);
}

// ---------- failed calls changed nothing ----------
{
    const lines = [
        user('try it'),
        assistant([toolUse('t1', 'Edit', { file_path: 'D:/a.ts', old_string: 'a', new_string: 'b' })]),
        result('t1', true),
        assistant([toolUse('t2', 'Edit', { file_path: 'D:/a.ts', old_string: 'c', new_string: 'd' })]),
        result('t2')
    ];
    const recs = collectEdits(lines);
    ok('the failed call is marked', recs[0].failed === true && !recs[1].failed);
    const f = groupByFile(recs)[0];
    ok('a failed call is not counted as an edit', f.edits === 1 && f.failed === 1);
    ok('…and does not inflate the +/- totals', fileStats(f).added === 1);
}

// ---------- turn numbering follows the viewer ----------
{
    const lines = [
        user('<command-name>/init</command-name>', { isMeta: true }),   // meta: not a turn
        user('first ask'),
        assistant([toolUse('t1', 'Write', { file_path: 'D:/x.ts', content: '1' })]),
        user('second ask'),
        assistant([toolUse('t2', 'Write', { file_path: 'D:/y.ts', content: '2' })]),
        L({
            type: 'user', isSidechain: true, timestamp: '2026-07-27T10:03:00.000Z',
            message: { role: 'user', content: 'subagent prompt' }
        }),
        assistant([toolUse('t3', 'Write', { file_path: 'D:/z.ts', content: '3' })])
    ];
    const recs = collectEdits(lines);
    ok('the first edit belongs to turn 1', recs[0].turn === 1);
    ok('the second to turn 2', recs[1].turn === 2);
    ok('a subagent prompt does not open a new turn', recs[2].turn === 2);
    ok('array-content prompts open turns too', collectEdits([
        L({ type: 'user', message: { content: [{ type: 'text', text: 'ask' }] } }),
        assistant([toolUse('a', 'Write', { file_path: 'D:/q.ts', content: 'x' })])
    ])[0].turn === 1);
}

// ---------- line stats ----------
{
    ok('added/removed count lines',
        JSON.stringify(hunkStats({ oldText: 'a\nb', newText: 'a\nb\nc' })) === JSON.stringify({ added: 3, removed: 2 }));
    ok('a pure insertion removes nothing',
        hunkStats({ newText: 'a\nb' }).removed === 0);
    ok('an empty string is zero lines, not one',
        hunkStats({ oldText: '', newText: '' }).added === 0);
}

// ---------- hostile input ----------
{
    ok('broken lines are skipped', collectEdits(['{not json', '', '   ']).length === 0);
    ok('a write with no path is not a record',
        collectEdits([assistant([toolUse('t', 'Edit', { old_string: 'a', new_string: 'b' })])]).length === 0);
    ok('an empty transcript yields nothing', groupByFile(collectEdits([])).length === 0);
}

// ---------- the surfaces are wired ----------
{
    const fs = require('fs');
    const viewer = fs.readFileSync(path.join(__dirname, '..', 'media', 'sessionViewer.js'), 'utf8');
    ok('the viewer has a Files changed box', /Files changed/.test(viewer));
    ok('…that fetches hunks on demand', /type: 'sessionFileEdits'/.test(viewer));
    ok('…and separates "vs HEAD" from the session\'s own hunks', /vs HEAD/.test(viewer));
    const host = fs.readFileSync(path.join(__dirname, '..', 'src', 'panels', 'sessionViewer.ts'), 'utf8');
    ok('the host caps a hunk only where it would be absurd, not where edits live',
        /const CUT = 4000;/.test(host) && /never cut/.test(host));
    const table = fs.readFileSync(path.join(__dirname, '..', 'media', 'sessionsTable.js'), 'utf8');
    ok('the sessions tables have a Files column', /files: r =>/.test(table));
    const sessions = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'sessions.ts'), 'utf8');
    ok('the index counts edited files during its own parse', /filesEdited\[key\]/.test(sessions));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
