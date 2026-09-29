// X-332 — a bare `<tag>` in a backlog line is put in a code span before
// Markdown/Obsidian reads it as an unclosed HTML tag and swallows every heading
// and task line after it.
//
// What is defended:
//   * the pattern touches only what Markdown would have read as a TAG — code
//     spans, fences, comments (one line or many), front matter, an angle-bracket
//     link target, autolinks, paths and addresses pass through byte for byte;
//   * it is idempotent, so the tidy can be pressed twice;
//   * the WRITE GATE: an item added or re-worded through the core cannot land
//     bare, whoever wrote it — and a press that did not change the words does
//     not rewrite them;
//   * the TIDY repairs a file already broken, and says how many it wrapped.
'use strict';
const path = require('path');
const S = require(path.join(__dirname, '..', 'out', 'core', 'backlogSanitize.js'));
const B = require(path.join(__dirname, '..', 'out', 'core', 'projectBacklog.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const t = (s) => S.sanitizeBacklogTags(s);

// ---- the tag itself -----------------------------------------------------------
ok('a bare placeholder is put in code', t('fill <ALAN> in') === 'fill `<ALAN>` in');
ok('…every one on the line', t('<agent> runs <model>') === '`<agent>` runs `<model>`');
ok('…a closing tag too', t('ends with </div> here') === 'ends with `</div>` here');
ok('…a dashed or underscored name', t('see <project-context> and <session_id>') === 'see `<project-context>` and `<session_id>`');
ok('…and a self-closed one that is not void, which HTML leaves open', t('a <foo/> b') === 'a `<foo/>` b');

// ---- HTML somebody meant (measured on the real backlog) ------------------------
ok('‼️ a void element is complete — the <br> the user breaks long items with is kept',
    t('one<br>• two<br/>• three') === 'one<br>• two<br/>• three');
ok('‼️ a pair closed on the same line is kept', t('a <b>bold</b> word') === 'a <b>bold</b> word');
ok('…while an opener with no closer beside a closed pair is still wrapped', t('<b>x</b> and <id>') === '<b>x</b> and `<id>`');
ok('‼️ a backslash-escaped < is already literal', t('C:\\Users\\<user>\\AppData') === 'C:\\Users\\<user>\\AppData');
ok('‼️ a <!-- quoted inside backticks is code, not a comment — the pairing after it holds',
    t('comments (`<!-- -->`), code (`...`) and bare <id>') === 'comments (`<!-- -->`), code (`...`) and bare `<id>`');

// ---- what is not a tag, or is already safe -------------------------------------
ok('inside a code span it is left alone', t('use `<id>` here') === 'use `<id>` here');
ok('…a double-backtick span too', t('x `` a <b> `` y') === 'x `` a <b> `` y');
ok('‼️ …an unmatched backtick is literal, and the tag after it gets a fence that literal cannot pair with',
    t('a ` <id>') === 'a ` ``<id>``' && t('a ` <id>') === t(t('a ` <id>')));
ok('an angle-bracket link target is meant', t('[doc](<notes>)') === '[doc](<notes>)');
ok('a path with a dot or a space never matches', t('[x](</D:/zone/a b.md>)') === '[x](</D:/zone/a b.md>)');
ok('an autolink and an address never match', t('<https://x.y> <a@b.c>') === '<https://x.y> <a@b.c>');
ok('a comparison is not a tag', t('a < b > c and 3<4') === 'a < b > c and 3<4');
ok('an HTML comment on the line is passed through', t('<!-- <id> --> then <x>') === '<!-- <id> --> then `<x>`');
ok('a tag with attributes is not this pattern', t('<span class="x">') === '<span class="x">');

// ---- a document -------------------------------------------------------------------
{
    const doc = [
        '---', 'af-role: backlog', 'note: <kept>', '---',
        '<!-- legend',
        '     <ALAN> stays inside the comment',
        '-->',
        '## K',
        '- [ ] K-1 set <model> first #feat',
        '```',
        'code <kept> too',
        '```',
        '- [ ] K-2 plain line',
        ''
    ].join('\r\n');
    const r = S.sanitizeBacklogMarkdown(doc);
    const lines = r.text.split('\r\n');
    ok('document: one tag wrapped', r.wrapped === 1);
    ok('…the item line carries it in code', lines[8] === '- [ ] K-1 set `<model>` first #feat');
    ok('…front matter, the multi-line comment and the fence are untouched',
        lines[2] === 'note: <kept>' && lines[5] === '     <ALAN> stays inside the comment' && lines[10] === 'code <kept> too');
    ok('…CRLF is kept', r.text.split('\r\n').length === doc.split('\r\n').length && !/[^\r]\n/.test(r.text));
    const again = S.sanitizeBacklogMarkdown(r.text);
    ok('…and pressing it twice changes nothing', again.wrapped === 0 && again.text === r.text);
    const clean = 'nothing <!-- <x> --> here\n';
    ok('a clean document comes back as the same string', S.sanitizeBacklogMarkdown(clean).text === clean);
}

// ---- the write gate ------------------------------------------------------------------
const FILE = [
    '---', 'af-role: backlog', '---', '', '## K — Kod', '',
    '- [ ] K-1 existing item #feat [effort:: S]',
    '- [ ] K-2 older item with <raw> left alone #bug',
    ''
].join('\n');
{
    const a = B.addBacklogItem(FILE, { text: 'pass <token> to the <agent>', area: 'K' });
    ok('add: the item is written', a.ok === true);
    ok('‼️ …and it cannot land bare, whoever wrote it', /K-3 pass `<token>` to the `<agent>`/.test(a.text));
    const s = B.setBacklogFields(FILE, { code: 'K-1' }, { text: 'renamed with <id>' });
    ok('set text: the new words are sanitized', s.ok && /K-1 renamed with `<id>`/.test(s.text));
    const p = B.setBacklogFields(FILE, { code: 'K-2' }, { priority: 'high' });
    ok('…but a press that did not change the words does not rewrite them', p.ok && /K-2 older item with <raw> left alone/.test(p.text));
}

// ---- the tidy ------------------------------------------------------------------------
{
    const broken = FILE.replace('K-1 existing item', 'K-1 existing <ALAN> item');
    const r = B.tidyBacklogFile(broken);
    ok('tidy: a broken file is repaired', r.ok && /K-1 existing `<ALAN>` item/.test(r.text) && /K-2 older item with `<raw>`/.test(r.text));
    ok('…and says how many it wrapped', r.sanitized === 2 && /put 2 bare tags in code/.test(r.note || ''));
    const twice = B.tidyBacklogFile(r.text);
    ok('…a second press finds nothing', twice.sanitized === 0 && twice.text === r.text);
    const plain = B.tidyBacklogFile(FILE.replace(' with <raw>', ''));
    ok('a clean file in order still says so', plain.sanitized === 0 && plain.note === 'already in code order');
}

// ---- a pair that is not HTML (measured: X-94) ------------------------------------------
ok('‼️ a made-up pair closed on its line is wrapped — Obsidian drew it as nothing',
    t('"<project-context> === X === </project-context>"') === '"`<project-context>` === X === `</project-context>`"');
ok('…a real element pair is still kept', t('<kbd>Ctrl</kbd> and <mark>x</mark>') === '<kbd>Ctrl</kbd> and <mark>x</mark>');

// ---- a backtick typed for an apostrophe (measured: S-68…S-79) ---------------------------
ok('‼️ an in-word backtick on an unpaired line is put back as an apostrophe', t('aynı commit`te yazılır') === 'aynı commit\'te yazılır');
ok('…every one on the line, beside a real span that then pairs',
    t('BatonRunner`ın dinleyicisi. LiveMonitor `ended` geçişi, SessionEnd`i ve waiting-end`den')
    === 'BatonRunner\'ın dinleyicisi. LiveMonitor `ended` geçişi, SessionEnd\'i ve waiting-end\'den');
ok('…a digit before it counts as the word', t('%95`teyken %10`luk slot') === '%95\'teyken %10\'luk slot');
ok('‼️ …and the tag the broken pairing had hidden in "code" is then wrapped',
    t('ppid`sini yazar; yatak <config-dir>/x.json ve sessionId`yi') === 'ppid\'sini yazar; yatak `<config-dir>`/x.json ve sessionId\'yi');
ok('‼️ a span closed before a suffix on a line that pairs is never touched', t('`Notices`a yaz') === '`Notices`a yaz');
ok('…nor on a line that does not pair — the word holds its opener', t('`Notices`a ve bir ` tek') === '`Notices`a ve bir ` tek');
ok('‼️ all or none: if the line still would not pair, nothing is mended', t('a`b ve `x') === 'a`b ve `x');
ok('an escaped backtick is not a candidate', t('a\\`b ve c`d') === 'a\\`b ve c\'d');
{
    const doc = ['intro', '- [ ] X-1 regex (`a[`b]`) sonra', '- [ ] X-2 commit`te', '```', 'x`y', '```'].join('\n');
    const r = S.sanitizeBacklogMarkdown(doc);
    ok('document: the apostrophe is counted, the fence is left alone', r.mended === 1 && /X-2 commit'te/.test(r.text) && /\nx`y\n/.test(r.text));
    ok('‼️ …and a line no rule can mend is reported, not guessed at', JSON.stringify(r.unpaired) === '[1]' && /X-1 regex \(`a\[`b\]`\) sonra/.test(r.text));
    const again = S.sanitizeBacklogMarkdown(r.text);
    ok('…a second pass changes nothing', again.mended === 0 && again.wrapped === 0 && again.text === r.text);
}
{
    const broken = FILE.replace('K-1 existing item', 'K-1 existing commit`te item').replace('K-2 older item', 'K-2 older (`a[`b]`) item');
    const r = B.tidyBacklogFile(broken);
    ok('tidy: the apostrophe is mended and counted', r.mended === 1 && /K-1 existing commit'te item/.test(r.text));
    ok('‼️ …and the line it cannot mend is named by its code', JSON.stringify(r.unpaired) === '["K-2"]' && /K-2 still has a backtick with no partner/.test(r.note || ''));
}

console.log(`test_backlog_sanitize: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
