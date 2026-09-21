// B-21 — core/mdTable: the one Markdown table every export assembles.
//
// The page used to build the document inside the webview and the host only
// filed it, which is why "export the rows you can see" was reachable from a
// button and from nowhere else. The page still decides WHICH rows; the bytes
// are made here, where an op can make the same ones.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { markdownTable, tableOfRecords } =
    require(path.join(__dirname, '..', 'out', 'core', 'mdTable.js'));

const AT = Date.parse('2026-08-14T12:00:00Z');

// ---------- the table itself ----------
{
    const md = markdownTable({
        title: 'Agents', cols: ['agent', 'runs'], rows: [['yazar', 9], ['dev', 3]], at: AT
    });
    const lines = md.split('\n');
    ok('the title is the document heading', lines[0] === '# Agents');
    ok('the subtitle states when and how many', /^_Exported .* · 2 row\(s\)_$/.test(lines[2]));
    ok('header and separator have one cell per column',
        lines[4] === '| agent | runs |' && lines[5] === '| --- | --- |');
    ok('a row is its cells in column order', lines[6] === '| yazar | 9 |');
    ok('the document ends with a newline', md.endsWith('|\n'));

    const noted = markdownTable({ title: 'T', cols: ['a'], rows: [['x']], at: AT, note: 'last 30 days' });
    ok('a note rides on the subtitle', /· 1 row\(s\) · last 30 days_/.test(noted));
}

// ---------- the two characters that would break a table ----------
{
    const md = markdownTable({
        title: 'Escapes', cols: ['what'], at: AT,
        rows: [['a | b'], ['two\nlines'], ['crlf\r\nhere']]
    });
    ok('a pipe is escaped, so the column does not end early', /\| a \\\| b \|/.test(md));
    ok('a newline becomes a space, so the row does not end early',
        /\| two lines \|/.test(md) && /\| crlf here \|/.test(md));
    ok('…and the table still has exactly one line per row',
        md.trim().split('\n').length === 4 + 2 + 3);
}

// ---------- empty is an answer, not a broken table ----------
{
    const md = markdownTable({ title: 'Nothing', cols: ['a', 'b'], rows: [], at: AT });
    ok('no rows says so in words rather than drawing an empty grid',
        /_No rows matched what was being looked at\._/.test(md) && !/---/.test(md));
    ok('…and still names what was being exported', md.startsWith('# Nothing'));
}

// ---------- missing and odd cells ----------
{
    const md = markdownTable({
        title: 'Holes', cols: ['a', 'b', 'c'], at: AT,
        rows: [['x'], ['y', null, undefined], ['z', 0, false]]
    });
    ok('a short row is padded to the column count, never ragged',
        md.split('\n').filter(l => l.startsWith('| x')).join() === '| x |  |  |');
    ok('null and undefined are blank', md.includes('| y |  |  |'));
    // ‼️ 0 and false are VALUES. A `v || ""` fallback silently blanks both, and
    // a figures table whose zeros are empty reads as missing data.
    ok('‼️ 0 and false are printed, not blanked', md.includes('| z | 0 | false |'));
}

// ---------- columns are DERIVED from the rows ----------
{
    const t = tableOfRecords('Agents', [
        { agent: 'yazar', runs: 9 },
        { agent: 'dev', runs: 3, retries: 2 }
    ]);
    ok('the column order is first-seen, then whatever the later rows add',
        t.cols.join() === 'agent,runs,retries');
    ok('a field only one row carries still gets a column',
        t.rows[0].join('|') === 'yazar|9|' && t.rows[1].join('|') === 'dev|3|2');

    const rich = tableOfRecords('Rich', [{ models: ['opus', 'haiku'], where: { a: 1 }, nil: null }]);
    ok('an array cell is readable rather than JSON', rich.rows[0][0] === 'opus, haiku');
    ok('an object cell falls back to JSON rather than [object Object]',
        rich.rows[0][1] === '{"a":1}');
    ok('null is blank', rich.rows[0][2] === '');
    ok('no rows means no columns, and the table says nothing rather than guessing',
        tableOfRecords('Empty', []).cols.length === 0);

    ok('a derived table feeds straight back in',
        markdownTable({ ...t, at: AT }).includes('| agent | runs | retries |'));
}

// ---------- the wiring this module exists for ----------
// ‼️ The document must not drift back INTO the webview. A page that assembles
// its own markdown is reachable from a button and from nowhere else, which is
// the whole of B-21's complaint.
{
    const fs = require('fs');
    const ROOT = path.join(__dirname, '..');
    const page = fs.readFileSync(path.join(ROOT, 'media', 'taskAnalytics.js'), 'utf8');
    const panel = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'taskAnalyticsPanel.ts'), 'utf8');
    const op = fs.readFileSync(path.join(ROOT, 'src', 'core', 'reportBridge.ts'), 'utf8');

    ok('the analytics page sends its ROWS, not a finished document',
        /type: 'export-md', name: id, title: t\.title/.test(page)
        && /cols: t\.cols\.map\(c => c\.label\)/.test(page));
    ok('…and assembles no markdown table of its own',
        !/\| ' \+/.test(page) && !page.includes("map(() => '---')"));
    ok('the host builds it with markdownTable', /markdownTable\(\{ title: String\(msg\.title/.test(panel));
    ok('…and so does the op, so the two cannot describe a table differently',
        /markdownTable\(t\)\.replace/.test(op) && /tasks\.analytics\.export/.test(op));

    // ‼️ …and the wire really carries it: press the page's own ⬇ MD and build
    // the document out of what it posted, exactly as the host does.
    const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));
    const fixture = require(path.join(__dirname, 'fixtures', 'taskanalytics.js'));
    const p = runPage('taskAnalytics.js', fixture.variants()[0].data);
    p.query('[data-texport]')[0].click();
    const msg = p.last();
    ok('pressing ⬇ MD posts export-md with a title, columns and rows',
        msg && msg.type === 'export-md' && typeof msg.title === 'string'
        && Array.isArray(msg.cols) && msg.cols.length > 0 && Array.isArray(msg.rows));
    ok('…and no `content`, because the page no longer writes the document',
        msg && msg.content === undefined);
    ok('…every posted row has one cell per column',
        msg && msg.rows.every(r => Array.isArray(r) && r.length === msg.cols.length));
    const built = markdownTable({ title: msg.title, cols: msg.cols, rows: msg.rows, at: AT });
    ok('…and the host turns exactly that into the page\'s document',
        built.startsWith('# ' + msg.title)
        && built.includes('| ' + msg.cols.join(' | ') + ' |')
        && built.split('\n').filter(l => l.startsWith('| ')).length === msg.rows.length + 2);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
