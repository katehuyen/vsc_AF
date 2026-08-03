// The plan (compiled core/projectPlan.js, pure): reading the user's own
// checkbox lines, and the one promise the write side makes — that ticking a box
// changes EXACTLY ONE CHARACTER of their document.
//
// The assertions that matter here are the ones about restraint. It is easy to
// write a "tick an item" function that passes an obvious test and quietly
// normalises the file: rebuilding the line from its parsed pieces loses the
// user's bullet and spacing, splitting and rejoining loses their CRLFs, and
// "helpfully" stamping a ✅ writes metadata Agent Farm does not own. All three
// look identical in a naive test and are found weeks later as a mangled vault.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const {
    parsePlanItems, planSummary, openPlanItems, checkPlanItem, addPlanItem
} = require(path.join(__dirname, '..', 'out', 'core', 'projectPlan.js'));

/** Code-UNIT diff. [...s] iterates code POINTS and drifts at the first emoji,
 *  which would make this whole file quietly stop measuring anything. */
function diff(a, b) {
    const n = Math.max(a.length, b.length);
    let count = 0, at = -1;
    for (let i = 0; i < n; i++) {
        if (a[i] !== b[i]) { count++; if (at < 0) { at = i; } }
    }
    return { count, at };
}

// A plan written the way this vault writes them: Obsidian Tasks metadata,
// CRLF endings, a mix of bullets, a nested item.
const VAULT = [
    '# Plan',
    '',
    '## Milestones',
    '- [ ] Faz 4 — belgeler ⏫ 📅 2026-08-16 🆔 afprj-04',
    '  - [ ] alt madde',
    '- [x] Faz 3 — sayfa ✅ 2026-08-02 🆔 afprj-03',
    '',
    '## Next up',
    '* [ ] Faz 1.7 — legacy temizliği',
    ''
].join('\r\n');

// ---------- reading ----------
{
    const items = parsePlanItems(VAULT);
    ok('every checkbox line is an item', items.length === 4);
    ok('the box says done or open', items.map(i => i.done).join() === 'false,false,true,false');
    ok('the heading above it is its section',
        items[0].section === 'Milestones' && items[3].section === 'Next up');
    ok('nesting is kept as depth', items[1].depth === 2 && items[0].depth === 0);
    ok('the Obsidian Tasks id is a handle', items[0].id === 'afprj-04' && !items[1].id);
    ok('📅 is read as the due date', items[0].due === '2026-08-16');
    ok('✅ is read as the completion date — the ONLY honest timestamp an item has',
        items[2].doneOn === '2026-08-02' && !items[0].doneOn);
    ok('the display text drops the metadata and keeps the words',
        items[0].text === 'Faz 4 — belgeler' && items[2].text === 'Faz 3 — sayfa');
    ok('…and `raw` keeps the line exactly as it is on disk',
        items[0].raw === '- [ ] Faz 4 — belgeler ⏫ 📅 2026-08-16 🆔 afprj-04');

    const sum = planSummary(VAULT);
    ok('open and done are counted', sum.open === 3 && sum.done === 1);
    ok('sections come back in file order with their items',
        sum.sections.map(s => `${s.title}:${s.items.length}`).join() === 'Milestones:3,Next up:1');
    ok('a brief asks for what is LEFT', openPlanItems(VAULT, 2).map(i => i.text).join() ===
        'Faz 4 — belgeler,alt madde');
}

// ---------- what is NOT a task ----------
{
    ok('‼️ a one-letter markdown link is not a completed task',
        parsePlanItems('- [a](http://x)\n- [ ] real\n').length === 1);
    ok('a fenced code block holds examples, not tasks — ticking one would edit documentation',
        parsePlanItems('## X\n```\n- [ ] sample\n```\n- [ ] real\n').length === 1);
    ok('an ordered list is still a list', parsePlanItems('1. [ ] one\n2) [x] two\n').length === 2);
    ok('a bare box with no text parses rather than throwing',
        parsePlanItems('- [ ]\n')[0].text === '');
    ok('an unknown box glyph counts as done, not as outstanding work',
        parsePlanItems('- [/] in progress\n')[0].done === true);
}

// ---------- ticking: exactly one character ----------
{
    const r = checkPlanItem(VAULT, { id: 'afprj-04' }, true);
    const d = diff(VAULT, r.text);
    ok('ticking succeeds', r.ok && r.item.done === true);
    ok('‼️ EXACTLY ONE character of the document changed', d.count === 1);
    ok('…and it is the one inside the brackets',
        VAULT[d.at] === ' ' && r.text[d.at] === 'x'
        && r.text[d.at - 1] === '[' && r.text[d.at + 1] === ']');
    ok('…so the length is identical', r.text.length === VAULT.length);
    ok('‼️ every CRLF survives — a one-box request must not come back as a whole-file diff',
        (r.text.match(/\r\n/g) || []).length === (VAULT.match(/\r\n/g) || []).length);
    ok('the icons and Tasks metadata are untouched',
        r.text.includes('- [x] Faz 4 — belgeler ⏫ 📅 2026-08-16 🆔 afprj-04'));
    ok('‼️ no ✅ completion date is invented — Agent Farm does not write metadata it does not own',
        (r.text.match(/✅/g) || []).length === (VAULT.match(/✅/g) || []).length);

    const star = checkPlanItem(VAULT, { text: 'Faz 1.7' }, true);
    ok('the document\'s own bullet is kept', star.ok && star.text.includes('* [x] Faz 1.7'));
}

// ---------- unticking ----------
{
    const r = checkPlanItem(VAULT, { id: 'afprj-03' }, false);
    ok('unticking is one character too', r.ok && diff(VAULT, r.text).count === 1);
    ok('‼️ …and it SAYS the ✅ was left behind, rather than silently removing the user\'s metadata',
        /✅ 2026-08-02/.test(r.note || '') && r.text.includes('- [ ] Faz 3 — sayfa ✅ 2026-08-02'));
}

// ---------- addressing an item ----------
{
    ok('by line (0-based, as the parser counts)',
        checkPlanItem(VAULT, { line: 8 }, true).item.text === 'Faz 1.7 — legacy temizliği');
    ok('by an exact text match', checkPlanItem(VAULT, { text: 'alt madde' }, true).ok);
    ok('by a unique substring', checkPlanItem(VAULT, { text: 'legacy' }, true).ok);
    const amb = checkPlanItem(VAULT, { text: 'Faz' }, true);
    ok('‼️ an ambiguous match is an ERROR, never a first-match guess',
        !amb.ok && /matches 3 items/.test(amb.error) && /line \d/.test(amb.error));
    ok('an exact match wins over the substrings it is contained in',
        checkPlanItem('- [ ] a\n- [ ] ab\n', { text: 'a' }).item.line === 0);
    ok('a missing item says so', !checkPlanItem(VAULT, { text: 'nope' }).ok);
    ok('a stale id says so rather than ticking something else',
        !checkPlanItem(VAULT, { id: 'gone' }).ok);
    ok('no target at all is refused', !checkPlanItem(VAULT, {}).ok);
    ok('ticking what is already ticked is not an error and changes nothing',
        checkPlanItem(VAULT, { id: 'afprj-03' }, true).text === VAULT);

    // ‼️ A LINE NUMBER GOES STALE, AND A PAGE HOLDS ONE FOR AS LONG AS IT IS
    // OPEN. The plan tab draws checkboxes with the line they were on; the same
    // file is open in Obsidian. One paragraph inserted there and every number
    // below it points one item down — and ticking the wrong box in somebody's
    // plan is silent, so they find out weeks later. Sending WHAT you believe is
    // on that line turns it into a refusal.
    // one paragraph inserted at the top of the file in Obsidian: line 4 was the
    // nested sub-item, and is now the milestone above it
    const moved = '\r\n' + VAULT;
    const wrong = checkPlanItem(moved, { line: 4, text: 'alt madde' }, true);
    ok('‼️ a line whose text no longer matches is REFUSED, not ticked', !wrong.ok);
    ok('…and it says what is there now and what to do', /now reads/.test(wrong.error || '')
        && /reload/.test(wrong.error || ''));
    ok('…and nothing was written', wrong.text === undefined);
    ok('…and the box it would have ticked is still open',
        !parsePlanItems(moved).find(i => i.line === 4).done);
    ok('the same claim against the line it really moved to goes through',
        checkPlanItem(moved, { line: 5, text: 'alt madde' }, true).ok);
    ok('a line target with no claimed text still works — the check is opt-in',
        checkPlanItem(moved, { line: 5 }, true).ok);
    ok('an id beats a stale line, because an id does not move',
        checkPlanItem(moved, { id: 'afprj-04', line: 3 }, true).item.text === 'Faz 4 — belgeler');
    ok('a line that is not an item at all names itself the way an editor numbers it',
        /line 1 is not a plan item/.test(checkPlanItem(VAULT, { line: 0 }).error || ''));
}

// ---------- adding ----------
{
    const r = addPlanItem(VAULT, 'Faz 5 — iş', { section: 'Milestones', meta: '📅 2026-09-01' });
    const lines = r.text.split('\r\n');
    ok('an item joins the END of its section, not the top',
        r.ok && lines[6] === '- [ ] Faz 5 — iş 📅 2026-09-01');
    ok('…so work already written down keeps its place',
        lines.slice(3, 6).join('|') ===
        '- [ ] Faz 4 — belgeler ⏫ 📅 2026-08-16 🆔 afprj-04|  - [ ] alt madde|- [x] Faz 3 — sayfa ✅ 2026-08-02 🆔 afprj-03');
    ok('…and the next section is still where it was', lines[8] === '## Next up');
    ok('meta is written verbatim — this module never has to understand it',
        r.item.due === '2026-09-01');
    ok('the document\'s line ending is used for the new line',
        (r.text.match(/\r\n/g) || []).length === (VAULT.match(/\r\n/g) || []).length + 1);

    const end = addPlanItem(VAULT, 'no section');
    ok('with no section it is appended, which cannot damage a structure we read wrongly',
        end.text.trimEnd().endsWith('- [ ] no section'));
    const unknown = addPlanItem(VAULT, 'x', { section: 'Nope' });
    ok('an unknown section falls back to appending rather than inventing a heading',
        unknown.text.trimEnd().endsWith('- [ ] x') && !/## Nope/.test(unknown.text));
    const emptySection = addPlanItem('# P\n\n## A\n\n## B\n', 'first', { section: 'A' });
    ok('a heading with no items yet gets the item directly under it',
        emptySection.text === '# P\n\n## A\n- [ ] first\n\n## B\n');
    ok('the star bullet is followed when that is what the file uses',
        addPlanItem('* [ ] a\n', 'b').text === '* [ ] a\n* [ ] b\n');
    ok('a file with no trailing newline still gets a well-formed line',
        addPlanItem('- [ ] a', 'b').text === '- [ ] a\n- [ ] b\n');
    ok('an empty item is refused', !addPlanItem(VAULT, '   ').ok);
    ok('a multi-line item becomes one line — a list item is a line',
        addPlanItem('', 'a\nb').text === '- [ ] a b\n');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
