// The backlog (compiled core/projectBacklog.js, pure): reading a project's
// standing pile of work off the user's own markdown, and the promises the write
// side makes about their file.
//
// What is actually being defended here:
//   - a code is PERMANENT and is not an order — cancel an item, move a line,
//     and P-5 still means P-5. A generator that reused a spent number would
//     silently repoint every note that ever quoted it.
//   - closing a box changes EXACTLY ONE CHARACTER, the same promise the plan
//     makes. Rebuilding the line would pass a naive test and mangle a vault.
//   - `next` is what "do the top five" runs on, so its queue order and explicit
//     filters decide whether an agent does the five items the user actually named.
//   - the backlog is FLAT. A dotted code and an indented line are things a file
//     on disk may already contain, so they must keep parsing and keep their
//     number — but neither makes an item the child of anything.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const B = require(path.join(__dirname, '..', 'out', 'core', 'projectBacklog.js'));

/** Code-UNIT diff. [...s] iterates code POINTS and drifts at the first emoji,
 *  which would make this file quietly stop measuring anything. */
function diff(a, b) {
    const n = Math.max(a.length, b.length);
    let count = 0, at = -1;
    for (let i = 0; i < n; i++) {
        if (a[i] !== b[i]) { count++; if (at < 0) { at = i; } }
    }
    return { count, at };
}

// A backlog written the way this vault writes them: CRLF, an inbox with
// uncoded captures, areas as headings, legacy dotted+indented lines, real Tasks
// metadata.
const VAULT = [
    '---',
    'af-role: backlog',
    '---',
    '',
    '# Agent Farm — Backlog',
    '',
    '## 📥 Inbox',
    '',
    '- [ ] console history search is case sensitive',
    '',
    '## P — Projects',
    '',
    '- [ ] P-5 Faz 5: the work layer [plan:: afprj-05]',
    '    - [ ] P-5.1 projectId on four models #feat ⏫ [efor:: M]',
    '    - [/] P-5.2 stamping #feat 🔼 [efor:: S]',
    '    - [ ] P-5.3 Work tab #feat [efor:: XL] ⛔ P-5.1',
    '- [ ] P-12 orphaned projectId after delete #bug 🔺 [efor:: S] 📅 2026-08-09',
    '',
    '## K — Console',
    '',
    '- [x] K-3 project box missing on ▶ #bug ✅ 2026-08-03',
    '- [ ] K-8 history search is case sensitive #bug 🔽 [efor:: XS]',
    ''
].join('\r\n');

// ---------- reading ----------
{
    const s = B.parseBacklog(VAULT);
    // 0 inbox · 1 P-5 · 2 P-5.1 · 3 P-5.2 · 4 P-5.3 · 5 P-12 · 6 K-3 · 7 K-8
    const by = code => s.items.find(i => i.code === code);
    ok('every checkbox line is an item', s.items.length === 8);
    ok('the four checkbox states are read apart',
        s.items.map(i => i.state).join() === 'open,open,open,doing,open,open,done,open');
    ok('a code at the start of the line is the item\'s code',
        s.items[1].code === 'P-5' && s.items[5].code === 'P-12');
    ok('an uncoded capture is an inbox item', !s.items[0].code && s.items[0].inbox === true);
    // ‼️ NEITHER A DOT NOR AN INDENT MAKES A PARENT — only `[parent:: CODE]`
    // does. Both of these exist in files on disk and both must keep parsing
    // and keep their number; the hierarchy that was removed read exactly these
    // two as structure, which is how a child ended up under a stranger.
    ok('a dotted legacy code is an item like any other, not a child',
        by('P-5.1').parent === undefined && by('P-5').container === undefined);
    ok('…and an indented line is not a child either',
        by('P-5.2').parent === undefined && by('P-5').children.join() === '');
    ok('the area comes off the code even when it is dotted',
        by('K-8').area === 'K' && by('P-5.1').area === 'P');
    ok('`## P — Projects` declares an area',
        s.areas.length === 2 && s.areas[0].code === 'P' && s.areas[0].label === 'Projects');
    ok('an area counts its own open items', s.areas[1].code === 'K' && s.areas[1].open === 1);
    ok('#tags are the kind',
        by('P-5.1').kinds.join() === 'feat' && by('P-12').kinds.join() === 'bug');
    ok('Obsidian Tasks priority icons are the priority',
        by('P-5.1').priority === 'high' && by('P-12').priority === 'highest'
        && by('K-8').priority === 'low' && by('P-5').priority === 'normal');
    // The fixture is written with the legacy alias on purpose: what a file on
    // disk already says must keep parsing even though nothing writes it now.
    ok('the legacy [efor:: …] alias is still read as the effort',
        by('P-5.2').effort === 'S' && by('K-8').effort === 'XS');
    ok('[effort:: …], the name that is written, is read too',
        B.parseBacklog('- [ ] K-1 x [effort:: L]').items[0].effort === 'L');
    ok('⛔ is what it waits on', by('P-5.3').blockedBy.join() === 'P-5.1');
    ok('[plan:: …] links the plan item', by('P-5').plan === 'afprj-05');
    ok('📅 and ✅ are read but never invented',
        by('P-12').due === '2026-08-09' && by('K-3').doneOn === '2026-08-03');
    ok('display text drops the code, the tags and the fields',
        by('P-5.1').text === 'projectId on four models');
    // ‼️ The one that catches the icon-eats-the-next-token bug: a priority icon
    // carries no value, so nothing after it may be swallowed.
    ok('a priority icon does not eat the field that follows it',
        by('K-8').text === 'history search is case sensitive');
    ok('the counts add up',
        s.open === 6 && s.doing === 1 && s.done === 1 && s.unclassified === 1);
    ok('the inbox heading is found', typeof s.inboxLine === 'number');
    ok('score is priority over effort — a cheap urgent item beats a big one',
        by('P-12').score > by('P-5.1').score);
    ok('an unsized item is scored as M, not as free',
        Math.abs(B.parseBacklog('- [ ] P-1 x').items[0].score - 0.5) < 1e-9);
}

// ---------- M-2: an item may be PART OF another one ----------
//
// ‼️ WHAT THIS FEATURE IS A REBUILD OF, because the tests below are shaped by
// it. The backlog carried a hierarchy once, drawn from the FILE's indentation
// and shown inside a list ordered by the QUEUE — two unrelated structures on one
// screen. The first time anybody used it a child appeared under an item that was
// not its parent and moved somewhere else on every re-sort. It was taken out
// whole with the note that a rebuild must cover the queue too.
//
// So the three things asserted hardest here are the three that went wrong:
//   1. the link is a FIELD — no line moves, no indent means anything, tidying
//      and archiving cannot disturb it;
//   2. the CODE is untouched — a child gets its own area's next number, and a
//      child in another area is the ordinary case, not the exotic one;
//   3. the QUEUE does not know — a part and its whole queue independently, and
//      nothing here drops either from `next`.
const FAMILY = [
    '# B',
    '',
    '## 🎯 Queue',
    '',
    '1. P-1 — the epic',
    '2. U-1 — a part of it',
    '',
    '## P — Projects',
    '',
    '- [ ] P-1 the epic #feat',
    '- [ ] P-2 unrelated',
    '',
    '## U — Interface',
    '',
    '- [ ] U-1 a part of it [parent:: P-1]',
    '- [ ] U-2 a part of the part [parent:: U-1]',
    ''
].join('\n');

{
    const s = B.parseBacklog(FAMILY);
    const by = c => s.items.find(i => i.code === c);
    ok('[parent:: CODE] is read off the child\'s own line', by('U-1').parent === 'P-1');
    ok('…and the parent learns its parts, in file order',
        by('P-1').children.join() === 'U-1' && by('U-1').children.join() === 'U-2');
    ok('an item that is part of nothing has no parent and no parts',
        by('P-2').parent === undefined && by('P-2').children.length === 0);
    // ‼️ THE CHILD IS IN ANOTHER AREA. That is the case a dotted code (`P-1.1`)
    // would have made impossible, and it is the common one here.
    ok('a child keeps its own area and its own flat code',
        by('U-1').area === 'U' && by('U-1').code === 'U-1');
    ok('the field never reaches the displayed words', by('U-1').text === 'a part of it');
    // Typed by hand in Obsidian, in whatever case was to hand.
    ok('a lower-case code in the field is the same link',
        B.parseBacklog('- [ ] P-1 a\n- [ ] P-2 b [parent:: p-1]').items[1].parent === 'P-1');

    // ‼️ THE QUEUE DOES NOT KNOW ABOUT ANY OF IT. Both are startable, neither is
    // a container, and neither drags the other.
    const next = B.nextBacklog(FAMILY, { limit: 10 });
    ok('a part and its whole are both handed out, on their own account',
        next.items.map(i => i.code).join() === 'P-1,U-1,P-2,U-2');
    ok('…and the parent carries its parts to whoever is handed it',
        next.items[0].children.join() === 'U-1');

    // "Do P-4" is a real instruction, so it is one argument. ‼️ The two words
    // mean the same two things here as on the plain read — direct parts, or the
    // whole family including the head — because two ops answering the same word
    // differently is the kind of thing nobody reads the docs to discover.
    const direct = B.nextBacklog(FAMILY, { limit: 10, parent: 'P-1' });
    ok('next narrows to a whole\'s direct parts', direct.items.map(i => i.code).join() === 'U-1');
    const deep = B.nextBacklog(FAMILY, { limit: 10, parent: 'P-1', deep: true });
    ok('…and deep is the whole family, the head included',
        deep.items.map(i => i.code).join() === 'P-1,U-1,U-2');
    ok('…still in the user\'s own order, not in tree order',
        deep.items[0].code === 'P-1' && deep.queue.join() === 'P-1,U-1,P-2,U-2');
    ok('a family nobody named narrows nothing',
        B.nextBacklog(FAMILY, { limit: 10 }).items.length === 4);
}

// Three ways a link can be wrong, and each is REPORTED on the line rather than
// corrected — the same rule the duplicate-code check follows. The commonest
// cause is a file half-way through being edited, and a program that "fixed" it
// would destroy the only evidence of what was meant.
{
    const gone = B.parseBacklog('- [ ] P-1 a [parent:: Z-9]').items[0];
    ok('a parent that is not in the file is reported, not dropped',
        gone.parent === 'Z-9' && /Z-9 is not in this backlog/.test(gone.warn || ''));
    const self = B.parseBacklog('- [ ] P-1 a [parent:: P-1]').items[0];
    ok('an item that names itself is reported', /its own parent/.test(self.warn || ''));
    const loop = B.parseBacklog('- [ ] P-1 a [parent:: P-2]\n- [ ] P-2 b [parent:: P-1]');
    ok('a chain that loops is reported on both members',
        loop.items.every(i => /loops/.test(i.warn || '')));
    ok('…and every walk over it still terminates',
        B.descendantCodes(loop.items, 'P-1').join() === 'P-2');
    const both = B.parseBacklog('- [ ] P-1 a\n- [ ] P-1 b [parent:: Z-9]').items[1];
    ok('‼️ two things wrong with one line are both said, not the last one only',
        /more than once/.test(both.warn) && /Z-9/.test(both.warn));
}

// The whole family, and the check both writers share.
{
    const items = B.parseBacklog(FAMILY).items;
    ok('descendants are depth first and include the grandchild',
        B.descendantCodes(items, 'P-1').join() === 'U-1,U-2');
    ok('an item with no parts has none', B.descendantCodes(items, 'P-2').join() === '');
    ok('a parent must be a code', !!B.parentLinkError(items, 'P-2', 'nonsense'));
    ok('…and must exist', /no backlog item with code Z-9/.test(B.parentLinkError(items, 'P-2', 'Z-9')));
    ok('…and may not be the item itself', /its own parent/.test(B.parentLinkError(items, 'P-2', 'P-2')));
    ok('‼️ …and may not be one of its own descendants — that would close a loop',
        /close a loop/.test(B.parentLinkError(items, 'P-1', 'U-2')));
    ok('an ordinary link is allowed', B.parentLinkError(items, 'P-2', 'P-1') === undefined);
    ok('a NEW item has no descendants to loop with, so only existence applies',
        B.parentLinkError(items, undefined, 'P-1') === undefined);
}

// ---------- writing the link ----------
{
    const r = B.addBacklogItem(FAMILY, { text: 'another part', area: 'U', parent: 'P-1' });
    ok('add writes the field on the new line', r.ok && /\[parent:: P-1\]/.test(r.item.raw));
    ok('…and the new item still gets its OWN area\'s next code', r.code === 'U-3');
    ok('…which is what the parse then reads back',
        B.parseBacklog(r.text).items.find(i => i.code === 'U-3').parent === 'P-1');
    // ‼️ An uncoded capture carries the link perfectly well: it is stored on the
    // child, and the child does not need a code of its own to hold one.
    const cap = B.addBacklogItem(FAMILY, { text: 'a thought', parent: 'P-1' });
    ok('an uncoded capture may name a parent', cap.ok && /\[parent:: P-1\]/.test(cap.item.raw));
    ok('a parent that is not there is refused rather than written and warned about',
        !B.addBacklogItem(FAMILY, { text: 'x', area: 'U', parent: 'Z-9' }).ok);
}

{
    const set = B.setBacklogFields(FAMILY, { code: 'P-2' }, { parent: 'P-1' });
    ok('set writes the link', set.ok && set.item.parent === 'P-1');
    ok('…in the fixed field order, after the size and before the plan link',
        /\[parent:: P-1\]/.test(set.item.raw));
    const clear = B.setBacklogFields(set.text, { code: 'P-2' }, { parent: null });
    ok('null clears it', clear.ok && clear.item.parent === undefined
        && !/parent::/.test(clear.item.raw));
    // ‼️ THE REBUILD TRAP THIS FILE ALREADY DOCUMENTS: a field the rebuild does
    // not know about is in neither half of the line and disappears the first
    // time anybody clicks a priority badge. Nobody sees it go.
    const other = B.setBacklogFields(FAMILY, { code: 'U-1' }, { priority: 'high' });
    ok('‼️ a change to another axis does not drop the link',
        other.ok && other.item.parent === 'P-1' && other.item.priority === 'high');
    ok('a loop is refused before a byte is written',
        !B.setBacklogFields(FAMILY, { code: 'P-1' }, { parent: 'U-2' }).ok);
    ok('…and so is naming yourself',
        !B.setBacklogFields(FAMILY, { code: 'P-1' }, { parent: 'P-1' }).ok);
}

// Filing a capture REBUILDS its line, which is the other place a field can
// silently evaporate — and the one where nobody is looking at it.
{
    const src = '# B\n\n## U — Interface\n\n- [ ] U-1 a\n\n## 📥 Inbox\n\n- [ ] a thought [parent:: U-1]\n';
    const filed = B.codeBacklogItem(src, { text: 'a thought' }, 'U');
    ok('‼️ filing a capture carries its parent through the rebuild',
        filed.ok && filed.item.parent === 'U-1' && filed.code === 'U-2');
    // ‼️ AND A BROKEN LINK MUST NOT MAKE A CAPTURE UNFILEABLE. The whole was
    // deleted in Obsidian; the field is the user's own data and the row already
    // warns about it. Refusing here would block an action about something else,
    // and dropping it would take their data away without saying so.
    const dangling = '# B\n\n## U — Interface\n\n- [ ] U-1 a\n\n## 📥 Inbox\n\n- [ ] a thought [parent:: Z-9]\n';
    const still = B.codeBacklogItem(dangling, { text: 'a thought' }, 'U');
    ok('a capture whose whole has been deleted still files, link and all',
        still.ok && still.item.parent === 'Z-9' && /Z-9 is not in this backlog/.test(still.item.warn || ''));
    // …but a fresh CLAIM of the same link is still refused, because there a typo
    // must not look like success.
    ok('…while adding a new item that names it is still refused',
        !B.addBacklogItem(dangling, { text: 'x', area: 'U', parent: 'Z-9' }).ok);
}

// A field that is there but is not a code says so, rather than reading as
// nothing at all — somebody typed it and meant something by it.
{
    const p = B.parseBacklog('- [ ] P-1 a [parent:: the big one]').items[0];
    ok('a parent that is not a code is reported',
        p.parent === undefined && /is not a backlog code/.test(p.warn || ''));
}

// Closing a whole does not close its parts — SAID, never refused. Both are real
// things to do; doing it in ignorance is the failure worth naming.
{
    const done = B.setBacklogState(FAMILY, { code: 'P-1' }, 'done');
    ok('closing a parent with open parts says which are still open',
        done.ok && /U-1 is still open under P-1/.test(done.note || ''));
    ok('…and changes exactly one character of the file',
        diff(FAMILY, done.text).count === 1);
    ok('a parent with nothing open under it says nothing',
        !B.setBacklogState(FAMILY, { code: 'P-2' }, 'done').note);
    ok('reopening says nothing either — it is closing that strands them',
        !B.setBacklogState(FAMILY, { code: 'P-1' }, 'doing').note);
}

// ‼️ NOTHING ABOUT THE FILE'S SHAPE FOLLOWS FROM A LINK. This is rule 1, and it
// is what makes the whole thing safe: tidying sorts by code as it always did,
// and archiving moves the closed line and only that line.
{
    const tidy = B.tidyBacklogFile(FAMILY);
    ok('tidying does not group families — the file is still in code order',
        tidy.ok && B.parseBacklog(tidy.text).items.map(i => i.code).join() === 'P-1,P-2,U-1,U-2');
    const closed = B.setBacklogState(FAMILY, { code: 'P-1' }, 'done').text;
    const arch = B.archiveBacklogDone(closed);
    const after = B.parseBacklog(arch.text);
    ok('archiving a whole moves ONLY its own line', arch.moved === 1);
    ok('…its open parts stay where they are, still coded, still live',
        after.items.find(i => i.code === 'U-1').state === 'open');
    ok('…the link still resolves, because the archive is the same file',
        after.items.find(i => i.code === 'P-1').children.join() === 'U-1');
    ok('‼️ …and it is said out loud, because the row you were reading them under has moved',
        /U-1 (is|are) still open under an item that just moved to the archive/.test(arch.note || ''));
}

// A `- [ ] thing` inside a fence is documentation, not a task.
{
    const fenced = ['# B', '', '```', '- [ ] P-1 example', '```', '', '- [ ] P-2 real'].join('\n');
    const s = B.parseBacklog(fenced);
    ok('a checkbox inside a code fence is not an item',
        s.items.length === 1 && s.items[0].code === 'P-2');
}

// ---------- codes ----------
{
    ok('codes sort like a person expects: P-2 before P-10',
        ['P-10', 'P-2', 'P-5.1', 'P-5'].sort(B.compareCodes).join() === 'P-2,P-5,P-5.1,P-10');
    const items = B.parseBacklog(VAULT).items;
    ok('the next area code is one past the highest, not one past the count',
        B.nextCode(items, 'P') === 'P-13');
    // ‼️ A dotted legacy code spends its FIRST number, so a flat code handed out
    // now can never collide with `P-5.3`.
    ok('a dotted code counts under its own first number',
        B.nextCode(B.parseBacklog('## Z — Z\n- [ ] Z-4.7 x\n').items, 'Z') === 'Z-5');
    ok('a fresh area starts at 1', B.nextCode(items, 'Z') === 'Z-1');
}

// ‼️ A cancelled item's number stays spent. The whole value of a code is that a
// three-month-old note quoting K-8 still means this item.
{
    const src = '## K — Console\n- [-] K-8 abandoned\n';
    ok('a cancelled item does not free its number',
        B.nextCode(B.parseBacklog(src).items, 'K') === 'K-9');
}

// ---------- state: exactly one character ----------
{
    const r = B.setBacklogState(VAULT, { code: 'P-12' }, 'done');
    ok('closing an item works', r.ok);
    const d = diff(VAULT, r.text);
    ok('EXACTLY ONE CHARACTER of the document changed', d.count === 1);
    ok('the character that changed is the one inside the box', r.text[d.at] === 'x');
    ok('the CRLFs survive',
        (r.text.match(/\r\n/g) || []).length === (VAULT.match(/\r\n/g) || []).length);
    ok('no ✅ date is invented', !/P-12.*✅/.test(r.text));
    ok('the icons and metadata on the line are untouched',
        /- \[x\] P-12 orphaned projectId after delete #bug 🔺 \[efor:: S\] 📅 2026-08-09/.test(r.text));

    ok('doing is its own state, written as \\[\\/\\]',
        /- \[\/\] P-12/.test(B.setBacklogState(VAULT, { code: 'P-12' }, 'doing').text));
    ok('cancelling writes [-] rather than deleting the line',
        /- \[-\] P-12/.test(B.setBacklogState(VAULT, { code: 'P-12' }, 'cancelled').text));

    const same = B.setBacklogState(VAULT, { code: 'K-3' }, 'done');
    ok('an item already in that state is not an error and not a write',
        same.ok && same.text === VAULT);
    const reopened = B.setBacklogState(VAULT, { code: 'K-3' }, 'open');
    ok('reopening says out loud that it leaves the ✅ somebody else wrote',
        reopened.ok && /✅/.test(reopened.note || ''));
}

// ---------- addressing ----------
{
    ok('an unknown code is refused', !B.setBacklogState(VAULT, { code: 'P-99' }, 'done').ok);
    ok('ambiguous text is an error, never a first match',
        !B.setBacklogState(VAULT, { text: 'case sensitive' }, 'done').ok);
    ok('unique text is enough',
        B.setBacklogState(VAULT, { text: 'stamping' }, 'done').ok);
    // A line number goes stale the moment somebody inserts a paragraph in
    // Obsidian, and a panel holds one for as long as it stays open.
    const line = B.parseBacklog(VAULT).items.find(i => i.code === 'P-12').line;
    ok('line + text is a CHECK: a mismatch is refused rather than guessed at',
        !B.setBacklogState(VAULT, { line, text: 'something else entirely' }, 'done').ok);
    ok('line + the right text works', B.setBacklogState(VAULT, { line, text: 'orphaned' }, 'done').ok);
}

// ---------- next ----------
{
    const r = B.nextBacklog(VAULT, { limit: 10, maxEffort: 'XL' });
    const codes = r.items.map(i => i.code || 'inbox');
    ok('‼️ nothing is held back for having a dotted code — the list is flat',
        codes.indexOf('P-5') >= 0 && codes.indexOf('P-5.1') >= 0);
    ok('a blocked item is held back and reported, not silently dropped',
        codes.indexOf('P-5.3') < 0 && r.blocked.some(b => b.item.code === 'P-5.3'));
    ok('a closed item is not next', codes.indexOf('K-3') < 0);
    ok('an uncoded capture is still work', codes.indexOf('inbox') >= 0);
    ok('the queue is the default — the user\'s own arrangement wins',
        codes.join() === 'P-5,P-5.1,P-5.2,P-12,K-8,inbox');
    ok('‼️ …and an item that cannot be IN the queue comes after it, not among it',
        codes[codes.length - 1] === 'inbox');

    const sized = '## 🎯 Queue\n\n1. P-2\n2. P-1\n\n## P — Work\n- [ ] P-1 small [effort:: S]\n- [ ] P-2 large [effort:: XL]\n';
    ok('‼️ top N has no hidden effort ceiling — a queued XL item keeps first place',
        B.nextBacklog(sized, { limit: 2 }).items.map(i => i.code).join() === 'P-2,P-1');
    ok('an explicit effort ceiling still narrows the answer',
        B.nextBacklog(VAULT, { limit: 10, maxEffort: 'M' }).items
            .every(i => !i.effort || 'XS,S,M'.includes(i.effort)));
    ok('an UNSIZED item is not excluded by an explicit ceiling — a fresh backlog is not empty',
        B.nextBacklog(VAULT, { limit: 10, maxEffort: 'M' }).items.some(i => !i.effort));
    ok('limit is honoured', B.nextBacklog(VAULT, { limit: 2 }).items.length === 2);
    ok('area filters', B.nextBacklog(VAULT, { limit: 10, area: 'K' }).items
        .every(i => i.area === 'K'));
    ok('kind filters', B.nextBacklog(VAULT, { limit: 10, kind: 'bug' }).items
        .every(i => i.kinds.includes('bug')));
    ok('minPriority filters', B.nextBacklog(VAULT, { limit: 10, minPriority: 'high' }).items
        .every(i => ['high', 'highest'].includes(i.priority)));
    const byScore = B.nextBacklog(VAULT, { limit: 10, maxEffort: 'XL', sort: 'score' }).items;
    ok('sorting by score puts the cheap urgent item first', byScore[0].code === 'P-12');
    ok('includeBlocked brings the held-back ones back in',
        B.nextBacklog(VAULT, { limit: 10, maxEffort: 'XL', includeBlocked: true })
            .items.some(i => i.code === 'P-5.3'));
    // A blocker that is not in the file cannot be checked, so it must not
    // silently stop work — an unknown code blocks nothing.
    ok('an unknown blocker does not freeze an item',
        B.nextBacklog('- [ ] P-1 x ⛔ Q-9', {}).items.length === 1);
}

// ---------- adding ----------
{
    const r = B.addBacklogItem(VAULT, { text: 'new thing', area: 'K' });
    ok('an area gives it the next code', r.ok && r.code === 'K-9');
    ok('it lands inside its area, after the last item there',
        r.text.indexOf('## K — Console') < r.text.indexOf('K-9 new thing')
        && r.text.indexOf('K-8') < r.text.indexOf('K-9 new thing'));
    ok('the document\'s own line ending is used',
        (r.text.match(/\r\n/g) || []).length === (VAULT.match(/\r\n/g) || []).length + 1);

    // ‼️ A NEW ITEM IS NEVER A SUB-ITEM. It goes at the end of its area with a
    // flat code and no indent, whatever the file already contains.
    const flat = B.addBacklogItem(VAULT, { text: 'a new one', area: 'P' });
    ok('a new item in an area with dotted legacy codes still gets a flat one',
        flat.code === 'P-13');
    ok('…at the end of the area, at the left margin',
        /\n- \[ \] P-13 a new one/.test(flat.text)
        && flat.text.indexOf('P-13') > flat.text.indexOf('P-12'));

    const loose = B.addBacklogItem(VAULT, { text: 'just a thought' });
    ok('with no area it goes in uncoded — capture must cost nothing',
        loose.ok && !loose.code && /no area given/.test(loose.note || ''));
    ok('and it goes under the inbox heading',
        loose.text.indexOf('just a thought') > loose.text.indexOf('📥')
        && loose.text.indexOf('just a thought') < loose.text.indexOf('## P —'));

    const full = B.addBacklogItem(VAULT, {
        text: 'everything', area: 'K', kinds: ['bug'], priority: 'highest',
        effort: 'S', due: '2026-09-01', blockedBy: ['K-8']
    });
    ok('every axis is written in the vault\'s own notation',
        /- \[ \] K-9 everything #bug 🔺 \[effort:: S\] ⛔ K-8 📅 2026-09-01/.test(full.text));
    ok('something that is not an area code is refused rather than guessed at',
        !B.addBacklogItem(VAULT, { text: 'x', area: 'Q-1' }).ok);
    ok('a lower-case area is accepted and normalised',
        B.addBacklogItem(VAULT, { text: 'x', area: 'k' }).code === 'K-9');
    ok('an empty item is refused', !B.addBacklogItem(VAULT, { text: '  ' }).ok);
    ok('a multi-line item becomes one line — a list item is a line',
        /- \[ \] a b/.test(B.addBacklogItem('', { text: 'a\nb' }).text));
}

// ---------- fields ----------
{
    const r = B.setBacklogFields(VAULT, { code: 'K-8' }, { priority: 'highest', effort: 'M' });
    ok('the axes change', r.ok && /K-8.*🔺/.test(r.text) && /K-8.*\[effort:: M\]/.test(r.text));
    // ‼️ The extension's working language is English and a field NAME is part of
    // the mechanism. The fixture's line says `[efor:: XS]`; the rebuild must not
    // copy that spelling forward, or the alias never dies out.
    ok('a rebuilt line is written with the English field name, not the alias it was read from',
        !/K-8.*\[efor::/.test(r.text));
    ok('the code, the state and the words survive a rebuild',
        /- \[ \] K-8 history search is case sensitive/.test(r.text));
    ok('every OTHER line is untouched',
        r.text.split('\r\n').filter((l, i) => l !== VAULT.split('\r\n')[i]).length === 1);
    ok('null clears a field, in either spelling',
        !/\[(?:efor|effort)::/.test(B.setBacklogFields(VAULT, { code: 'K-8' }, { effort: null }).text
            .split('\r\n').find(l => l.includes('K-8'))));
    ok('kinds REPLACE rather than accumulate',
        /K-8 history search is case sensitive #regression/.test(
            B.setBacklogFields(VAULT, { code: 'K-8' }, { kinds: ['regression'] }).text));
    ok('the plan link is preserved when something else changes',
        /\[plan:: afprj-05\]/.test(
            B.setBacklogFields(VAULT, { code: 'P-5' }, { priority: 'high' }).text));
    ok('new words can be set without touching the code',
        /- \[ \] K-8 something else/.test(
            B.setBacklogFields(VAULT, { code: 'K-8' }, { text: 'something else' }).text));
}

// ---------- the closing stamp ----------
{
    const stamped = B.stampBacklogClosed(VAULT, { code: 'K-8' }, '9c4d1f2a#3');
    const lineOf = (text, code) => text.split('\r\n').find(l => l.includes(code));
    ok('a stamp is written onto the line', stamped.ok && /\[closed:: 9c4d1f2a#3\]/.test(stamped.text));
    ok('and nothing else on the line moved — this runs on a tick, not on a rebuild',
        /- \[ \] K-8 history search is case sensitive #bug 🔽 \[efor:: XS\] \[closed:: 9c4d1f2a#3\]/
            .test(lineOf(stamped.text, 'K-8')));
    ok('exactly one line changed',
        stamped.text.split('\r\n').filter((l, i) => l !== VAULT.split('\r\n')[i]).length === 1);
    ok('the stamp is read back off the item', B.parseBacklog(stamped.text).items
        .find(i => i.code === 'K-8').closed === '9c4d1f2a#3');
    ok('it is not mistaken for part of the words', B.parseBacklog(stamped.text).items
        .find(i => i.code === 'K-8').text === 'history search is case sensitive');

    // ‼️ The regression this pair exists for: a field the rebuild does not know
    // about is stripped from the text AND not re-emitted, so it vanishes the
    // first time somebody clicks a priority badge — silently.
    const after = B.setBacklogFields(stamped.text, { code: 'K-8' }, { priority: 'high' });
    ok('a rebuild keeps the stamp instead of dropping it',
        /\[closed:: 9c4d1f2a#3\]/.test(lineOf(after.text, 'K-8')));

    const restamped = B.stampBacklogClosed(stamped.text, { code: 'K-8' }, '11112222#7');
    ok('re-stamping replaces in place rather than accumulating',
        (lineOf(restamped.text, 'K-8').match(/\[closed::/g) || []).length === 1
        && /\[closed:: 11112222#7\]/.test(restamped.text));
    ok('null clears it',
        !/\[closed::/.test(lineOf(B.stampBacklogClosed(stamped.text, { code: 'K-8' }, null).text, 'K-8')));
    ok('something that is not <session>#<turn> is refused rather than written',
        !B.stampBacklogClosed(VAULT, { code: 'K-8' }, 'yesterday, I think').ok);
    ok('stamping the same value twice is a no-op',
        B.stampBacklogClosed(stamped.text, { code: 'K-8' }, '9c4d1f2a#3').text === stamped.text);
}

// ---------- classifying an inbox capture ----------
{
    const r = B.codeBacklogItem(VAULT, { text: 'console history search' }, 'K');
    ok('an uncoded capture gets a code', r.ok && r.code === 'K-9');
    ok('and moves into its area', /## K — Console[\s\S]*K-9 console history search/.test(r.text));
    ok('the original line is gone — it moved, it was not copied',
        (r.text.match(/console history search is case sensitive/g) || []).length === 1);
    ok('an item that already has a code is refused',
        !B.codeBacklogItem(VAULT, { code: 'K-8' }, 'P').ok);
    ok('something that is not an area code is refused, never guessed',
        !B.codeBacklogItem(VAULT, { text: 'console history search' }, 'Q-9').ok);
}

// ---------- order ----------
//
// ‼️ EVERY ORDERING WRITE TOUCHES ONE BLOCK AND NO LINE. That is the promise the
// whole redesign rests on: an area heading can no longer hold an item back,
// because the order stopped being where the item's line sits.
{
    const order = () => B.queueOrder(B.parseBacklog(VAULT).items, B.parseBacklog(VAULT).queue);
    ok('with no block, the order is the file — every live coded item, in line order',
        order().join() === 'P-5,P-5.1,P-5.2,P-5.3,P-12,K-8');
    ok('…a closed item is not in it', order().indexOf('K-3') < 0);

    // The move nobody could make before: last area to the front.
    const toTop = B.moveInQueue(VAULT, 'K-8', 'top');
    ok('‼️ an item can go to the front of the WHOLE queue, area or no area',
        toTop.ok && toTop.queue[0] === 'K-8');
    ok('…and not one item line moved — the file is the same but for the block',
        toTop.text.indexOf('- [ ] K-8 history search') > toTop.text.indexOf('- [ ] P-12 orphaned'));
    ok('…so its code, its area and its section are all untouched',
        /## K — Console\r\n\r\n- \[x\] K-3[\s\S]*- \[ \] K-8 history search/.test(toTop.text));

    const up1 = B.moveInQueue(VAULT, 'K-8', 'up');
    ok('a plain click moves one place', up1.queue.join() === 'P-5,P-5.1,P-5.2,P-5.3,K-8,P-12');
    const up3 = B.moveInQueue(VAULT, 'K-8', 'up', 3);
    ok('‼️ and the step menu moves several — the whole point of resting on ▲',
        up3.queue.join() === 'P-5,P-5.1,K-8,P-5.2,P-5.3,P-12');
    const up99 = B.moveInQueue(VAULT, 'K-8', 'up', 99);
    ok('a jump bigger than the queue lands on the end, it does not fail',
        up99.ok && up99.queue[0] === 'K-8');
    const down = B.moveInQueue(VAULT, 'P-5.1', 'down', 2);
    ok('…the same downwards', down.queue.join() === 'P-5,P-5.2,P-5.3,P-5.1,P-12,K-8');
    const bottom = B.moveInQueue(VAULT, 'P-5.1', 'bottom');
    ok('…and to the very back', bottom.queue.join() === 'P-5,P-5.2,P-5.3,P-12,K-8,P-5.1');

    const already = B.moveInQueue(VAULT, 'P-5', 'up');
    ok('already at the front is a no-op that says so, not an error',
        already.ok && already.text === VAULT && /already at the top/.test(already.note || ''));
    ok('the line ending is preserved when the block is written',
        (toTop.text.match(/\r\n/g) || []).length > (VAULT.match(/\r\n/g) || []).length
        && (toTop.text.match(/[^\r]\n/g) || []).length === 0);

    // ---- absolute position: "do this one third" ----
    const at3 = B.placeInQueue(VAULT, 'K-8', 3);
    ok('a code can be put at a position counted the way a person says it',
        at3.queue.join() === 'P-5,P-5.1,K-8,P-5.2,P-5.3,P-12');
    ok('…and position 1 is the front', B.placeInQueue(VAULT, 'K-8', 1).queue[0] === 'K-8');

    // ---- the drag: a named destination rather than a count of steps ----
    const dropped = B.dropInQueue(VAULT, 'K-8', 'P-5.1', 'before');
    ok('an entry can be dropped directly in front of another',
        dropped.ok && dropped.queue.join() === 'P-5,K-8,P-5.1,P-5.2,P-5.3,P-12');
    const after = B.dropInQueue(VAULT, 'P-5.1', 'K-8', 'after');
    ok('…or behind one, across areas, with no refusal anywhere',
        after.ok && after.queue.join() === 'P-5,P-5.2,P-5.3,P-12,K-8,P-5.1');
    ok('dropping something on itself is a no-op, not an error',
        B.dropInQueue(VAULT, 'K-8', 'K-8', 'after').text === VAULT);

    // ---- the three refusals, each said precisely: one message for all of them
    // would send somebody to read the file.
    ok('a closed item is refused', /is done/.test(B.moveInQueue(VAULT, 'K-3', 'up').error || ''));
    ok('an unknown code is refused by name',
        /no backlog item with code Z-9/.test(B.moveInQueue(VAULT, 'Z-9', 'up').error || ''));
    ok('‼️ and a non-code says what to do about it, not merely no',
        /has to be filed/.test(B.moveInQueue(VAULT, 'not a code', 'up').error || ''));
}

// ---------- tidying the file back into its own order ----------
{
    const shuffled = VAULT.replace(
        '- [x] K-3 project box missing on ▶ #bug ✅ 2026-08-03\r\n'
        + '- [ ] K-8 history search is case sensitive #bug 🔽 [efor:: XS]',
        '- [ ] K-8 history search is case sensitive #bug 🔽 [efor:: XS]\r\n'
        + '\r\n'
        + '- [x] K-3 project box missing on ▶ #bug ✅ 2026-08-03');
    const t = B.tidyBacklogFile(shuffled);
    ok('a shuffled area comes back to code order', t.ok && t.moved === 2
        && t.text.indexOf('K-3 project box') < t.text.indexOf('K-8 history search'));
    ok('…and the blank line the old shuffling left behind is closed up',
        !/K-8 history search[^\r\n]*\r\n\r\n/.test(t.text));
    ok('a file already in order says so and is returned byte-identical',
        B.tidyBacklogFile(t.text).text === t.text && B.tidyBacklogFile(t.text).moved === 0);
    ok('a dotted legacy code sorts numerically, not as a string',
        /P-5 Faz 5[\s\S]*P-5\.1[\s\S]*P-5\.2[\s\S]*P-5\.3[\s\S]*P-12/.test(t.text));
    ok('the queue is untouched by it: it names codes, and a code has no line',
        B.queueOrder(B.parseBacklog(t.text).items, ['K-8']).join()
        === B.queueOrder(B.parseBacklog(shuffled).items, ['K-8']).join());

    const prose = VAULT.replace('- [ ] P-12 orphaned',
        'Everything below waits on the API work.\r\n\r\n- [ ] P-12 orphaned');
    const left = B.tidyBacklogFile(prose);
    ok('‼️ a section with prose between its items is LEFT ALONE and reported',
        left.text === prose && left.skipped.length === 1 && /prose/.test(left.note || ''));

    ok('tidying keeps the file\'s own line ending — no lone \\n creeps in',
        !/[^\r]\n/.test(t.text));
}

// ---------- ‼️ P-10: an item under the WRONG heading is carried home ----------
//
// The sort above works on runs of consecutive items and cannot cross a heading,
// so before this a misfiled line was merely sorted into a tidy-looking place
// among its new neighbours — and the panel never showed the damage, because it
// groups by the CODE. The only reader who saw it was the person scrolling the
// file to `## P` and finding items missing. Measured on the real vault: A-4 and
// P-6…P-10 all sat under `## U`, in perfect code order, looking deliberate.
{
    const misfiled = [
        '## P — Projects',
        '- [ ] P-1 first',
        '',
        '## K — Console',
        '- [ ] K-1 console thing',
        '- [ ] P-2 filed under the wrong heading',
        '- [ ] P-3 and so is this one',
        ''
    ].join('\n');
    const r = B.tidyBacklogFile(misfiled);
    ok('‼️ a P-coded line parked under `## K` goes back under `## P`',
        r.ok && /## P — Projects\n- \[ \] P-1 first\n- \[ \] P-2 filed[\s\S]*- \[ \] P-3 and so/.test(r.text));
    ok('…and the section it was squatting in keeps its own item',
        /## K — Console\n- \[ \] K-1 console thing/.test(r.text));
    ok('…the codes that moved are NAMED, not counted — a reader has to know which',
        r.reseated.join() === 'P-2,P-3' && /P-2, P-3/.test(r.note || ''));
    ok('…a run of strays arrives in the order it left',
        r.text.indexOf('P-2 filed') < r.text.indexOf('P-3 and so'));
    ok('…nothing is lost or invented: the same items, the same count',
        B.parseBacklog(r.text).items.length === B.parseBacklog(misfiled).items.length);
    ok('…and it is idempotent — a repaired file reports nothing to do',
        B.tidyBacklogFile(r.text).reseated.length === 0
        && B.tidyBacklogFile(r.text).text === r.text);

    // An area with no heading has nowhere to go, and inventing one would be
    // restructuring the user's document rather than repairing it.
    const homeless = '## K — Console\n- [ ] K-1 x\n- [ ] Z-1 no Z section exists\n';
    ok('‼️ an area with no heading in the file is never invented — the line stays',
        B.tidyBacklogFile(homeless).reseated.length === 0
        && /Z-1 no Z section/.test(B.tidyBacklogFile(homeless).text));

    ok('the queue is untouched by a reseat too — it names codes',
        B.parseBacklog(r.text).queue.join() === B.parseBacklog(misfiled).queue.join());
}

// ---------- ‼️ K-8: the origin tags keep the capitals they were given ----------
{
    ok('the two tags are the ones the user named',
        B.BACKLOG_ORIGIN_TAGS.agent === 'byAI' && B.BACKLOG_ORIGIN_TAGS.user === 'byREQ');
    const added = B.addBacklogItem('## P — P\n- [ ] P-1 x\n',
        { text: 'agent noticed this', area: 'P', kinds: [B.BACKLOG_ORIGIN_TAGS.agent] });
    ok('an added line carries `#byAI` exactly as spelled', /#byAI\b/.test(added.text));
    // ‼️ The silent failure this guards: everything downstream compares tags
    // folded, so the parser folds them — and a rebuild writes back what the
    // parser returned. Without the canonical form the user's capitals would
    // vanish the first time somebody clicked a priority badge, in their vault.
    const parsed = B.parseBacklog(added.text).items.find(i => i.code === 'P-2');
    ok('…and the parser hands it back canonical, not folded',
        parsed.kinds.indexOf('byAI') >= 0 && parsed.kinds.indexOf('byai') < 0);
    const rebuilt = B.setBacklogFields(added.text, { code: 'P-2' }, { priority: 'high' });
    ok('‼️ …so setting a priority does not quietly fold it to `#byai`',
        /#byAI\b/.test(rebuilt.text) && !/#byai\b/.test(rebuilt.text));
    ok('a hand-typed `#byai` in Obsidian lands on the one spelling',
        B.parseBacklog('## P — P\n- [ ] P-1 x #BYAI\n').items[0].kinds.indexOf('byAI') >= 0);
    ok('both are recognised as origin tags, whatever the case',
        B.isOriginTag('#byREQ') && B.isOriginTag('byreq') && !B.isOriginTag('bug'));
    ok('an ordinary tag is still folded, as everything downstream expects',
        B.parseBacklog('## P — P\n- [ ] P-1 x #Regression\n').items[0].kinds.join() === 'regression');
}

// ---------- the work-type axis ----------
{
    ok('research is a canonical kind — work whose deliverable is an answer',
        B.BACKLOG_KINDS.indexOf('research') >= 0);
    ok('and the four a backlog is really sorted by are all there',
        ['bug', 'research', 'feat', 'ux'].every(k => B.BACKLOG_KINDS.indexOf(k) >= 0));
    const tagged = B.parseBacklog('## X — X\n- [ ] X-1 measure the counter #research\n');
    ok('a #research line reads back as that kind', tagged.items[0].kinds[0] === 'research');
    ok('every move direction is declared for the callers that validate one',
        ['up', 'down', 'top', 'bottom'].every(d => B.BACKLOG_MOVES.indexOf(d) >= 0));
}

// ---------- archive ----------
{
    const r = B.archiveBacklogDone(VAULT);
    ok('closed items are moved', r.ok && r.moved === 1);
    ok('they go under an archive heading at the END of the same file',
        r.text.indexOf('🗄') > r.text.indexOf('## K — Console')
        && r.text.indexOf('K-3') > r.text.indexOf('🗄'));
    ok('‼️ they stay IN the file, so a spent code can never be reissued',
        B.nextCode(B.parseBacklog(r.text).items, 'K') === 'K-9');
    ok('open items are left alone', /- \[ \] K-8/.test(r.text));
    ok('a second sweep with nothing to move is a no-op that says so',
        B.archiveBacklogDone(B.archiveBacklogDone(r.text).text).moved === 0);
    const noCancel = B.archiveBacklogDone('## K — C\n- [-] K-1 x\n', { cancelled: false });
    ok('cancelled items can be kept out of the sweep', noCancel.moved === 0);

    const now = Date.parse('2026-08-11T12:00:00Z');
    const aged = [
        '## K — C',
        '- [x] K-1 closed long ago',
        '- [x] K-2 closed yesterday',
        '- [x] K-3 closed but date unknown',
        ''
    ].join('\n');
    const times = { 'K-1': now - 30 * 86400000, 'K-2': now - 86400000 };
    const filtered = B.archiveBacklogDone(aged, {
        olderThanDays: 7, now, closedAt: i => times[i.code] || null
    });
    ok('M-4: an age sweep moves only items older than the requested days',
        filtered.moved === 1 && /## 🗄 Archive[\s\S]*K-1/.test(filtered.text)
        && filtered.text.indexOf('K-2') < filtered.text.indexOf('## 🗄 Archive'));
    ok('‼️ an unknown closing date is left visible, never guessed to be old',
        filtered.undated === 1 && filtered.text.indexOf('K-3') < filtered.text.indexOf('## 🗄 Archive')
        && /no closing date/.test(filtered.note));
    ok('a non-whole age is refused instead of rounded silently',
        !B.archiveBacklogDone(aged, { olderThanDays: 1.5 }).ok);

    // ‼️ U-106 — AND THE SWEEP'S RESULT IS READABLE AFTERWARDS. The parser knew
    // it was under the archive heading all along and threw the fact away, so a
    // line that had been moved out of the way was indistinguishable from a
    // closed line still in the list — on the page, in the bridge, everywhere.
    const swept = B.parseBacklog(B.archiveBacklogDone(r.text).text);
    const by = code => swept.items.find(i => i.code === code);
    ok('‼️ U-106: an item under the archive heading says so',
        !!by('K-3') && by('K-3').archived === true);
    ok('…and one still in the open list does not — closed is not archived',
        !!by('K-8') && by('K-8').archived === undefined);
    ok('…the flag follows the HEADING, not the state: a cancelled line archived '
        + 'with the rest is archived too',
        swept.items.filter(i => i.archived).every(i => /archiv|arşiv|🗄/i.test(i.section)));
    // Nothing about the sweep depends on the heading being ours: a file the user
    // titled `## Arşiv` by hand reads the same, which is the rule ARCHIVE_HEADING
    // already stated and this is the proof it reaches the item.
    const byHand = B.parseBacklog('## K — C\n- [ ] K-1 open\n\n## Arşiv\n- [x] K-2 old\n');
    ok('‼️ …and a heading the USER wrote in their own language still archives',
        byHand.items.find(i => i.code === 'K-2').archived === true
        && byHand.items.find(i => i.code === 'K-1').archived === undefined);
}

// ---------- ‼️ X-130: the mutation reads back ONE line, not the whole file ----------
//
// ‼️ EVERY MUTATION PARSED THE DOCUMENT TWICE. Once to find its target, and
// then the WHOLE FILE AGAIN to hand back the one line it had just written.
// `Backlog.md` never shrinks over a project's life — measured on this project's
// real file at 495 KB / 396 items, a parse is 34 ms and a mutation was 67. The
// second read is not wrong (it is the honest answer to "what does that line say
// now"), so it was made cheap rather than removed: the line is sliced out by
// offset and read on its own.
//
// The whole risk of that is DIVERGENCE — a line read on its own saying something
// different from the same line read in a full pass — so that is what is pinned
// here, field for field, on every door that rewrites a line.
{
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const full = (text, line) => B.parseBacklog(text).items.find(i => i.line === line);

    const src = [
        '# B', '',
        '## U — Interface', '',
        '- [ ] U-1 the whole thing #feat ⏫ [effort:: M]',
        '- [ ] U-2 a part of it [parent:: U-1] [effort:: S] 📅 2026-09-01',
        '- [ ] U-3 dangling [parent:: Z-9]', '',
        '## 📥 Inbox', '',
        '- [ ] a thought', ''
    ].join('\n');

    const held = B.setBacklogHold(src, { code: 'U-2' }, true);
    ok('‼️ X-130: a hold read back off its own line is the full parse, field for field',
        held.ok && same(held.item, full(held.text, held.item.line)));
    const fields = B.setBacklogFields(src, { code: 'U-2' }, { effort: 'L', priority: 'highest' });
    ok('…and so is a rebuilt line, which is the one that changes the most',
        fields.ok && same(fields.item, full(fields.text, fields.item.line)));
    const stamped = B.stampBacklogClosed(src, { code: 'U-2' }, 'sess#4');
    ok('…and so is a closing stamp',
        stamped.ok && same(stamped.item, full(stamped.text, stamped.item.line)));
    const added = B.addBacklogItem(src, { area: 'U', text: 'a new one', parent: 'U-1' });
    ok('…and a NEW line, seated after a neighbour whose heading it shares',
        added.ok && same(added.item, full(added.text, added.item.line)));

    // ‼️ THE PART A SINGLE LINE CANNOT DECIDE. An item's PARTS and whether its
    // `parent` names anything real come from the whole file — and
    // setBacklogFields is the one door that rewrites the parent field, so a
    // link that quietly stopped being checked there is the worst possible place
    // to have saved a millisecond.
    ok('‼️ …the parts of a whole survive a rewrite of its own line',
        B.setBacklogFields(src, { code: 'U-1' }, { effort: 'L' }).item.children.join() === 'U-2');
    ok('‼️ …and a broken link is still REPORTED, by the same rule a full pass uses',
        /Z-9 is not in this backlog/.test(B.setBacklogHold(src, { code: 'U-3' }, true).item.warn || ''));
    ok('…a link pointed at something real by the very edit being made is not warned about',
        !B.setBacklogFields(src, { code: 'U-3' }, { parent: 'U-1' }).item.warn);
    ok('…while a link that would name the item itself never reaches the line at all — '
        + 'it is refused before anything is written',
        !B.setBacklogFields(src, { code: 'U-3' }, { parent: 'U-3' }).ok);
    // Annotating one item must not write on the caller's copy of the file: the
    // list handed in is the document as it was, and it is not the mutation's.
    const before = B.parseBacklog(src);
    const kids = before.items.find(i => i.code === 'U-1').children.slice();
    B.setBacklogHold(src, { code: 'U-2' }, true);
    ok('…and reading one line back leaves the file it was checked against untouched',
        before.items.find(i => i.code === 'U-1').children.join() === kids.join());
}

// ---------- ‼️ X-134: the archive is not a place new work can land in ----------
//
// ‼️ THE BUG, AND WHY IT WAS INVISIBLE FOR MONTHS. A new item is seated "after
// this area's last item". Once an area's items have been archived, its last one
// is at the BOTTOM OF THE FILE under 🗄 — so every new item in that area was
// written into the history section: coded, open, queued by nobody, and hidden
// from every default view. Measured on the real vault: B-16..B-21 and
// X-132..X-133 all landed there and nobody noticed until the list came up short.
//
// And the repair was blocked by the rule that protects the archive. `tidy` left
// anything under 🗄 alone — correct for a CLOSED line, which is a record, and
// exactly wrong for an OPEN one, which is live work that cannot be seen.
{
    const withArchive = [
        '## K — Console',
        '- [ ] K-1 open one',
        '- [ ] K-2 open two',
        '',
        '## 🗄 Archive',
        '- [x] K-3 done long ago',
        ''
    ].join('\n');

    const added = B.addBacklogItem(withArchive, { area: 'K', text: 'brand new' });
    const seatedAt = B.parseBacklog(added.text).items.find(i => i.code === 'K-4');
    ok('‼️ X-134: a new item lands in its AREA, never after the archived line',
        added.ok && added.code === 'K-4' && !seatedAt.archived
        && added.text.indexOf('brand new') < added.text.indexOf('## 🗄 Archive'));
    ok('…directly after the last live item of that area, where a reader expects it',
        /- \[ \] K-2 open two\r?\n- \[ \] K-4 brand new/.test(added.text));

    // Every item of the area archived: there is no live line to sit after, and
    // the area's own heading is the seat — still above the archive.
    const allGone = [
        '## K — Console', '', '## 🗄 Archive', '- [x] K-1 done', ''
    ].join('\n');
    const first = B.addBacklogItem(allGone, { area: 'K', text: 'the only live one' });
    ok('…and with EVERY line of the area archived it goes under the heading, not the 🗄',
        first.ok && first.text.indexOf('the only live one') < first.text.indexOf('## 🗄 Archive'));

    // A heading written AFTER the archive opens a section that is not the
    // archive — the flag follows the heading, so its items are ordinary seats.
    const afterArchive = [
        '## 🗄 Archive', '- [x] K-1 done', '', '## K — Console', '- [ ] K-2 open', ''
    ].join('\n');
    const later = B.addBacklogItem(afterArchive, { area: 'K', text: 'late arrival' });
    ok('‼️ …and "below the archive line" is not the test — the HEADING is',
        later.ok && /- \[ \] K-2 open\r?\n- \[ \] K-3 late arrival/.test(later.text));

    // ---- the rescue ----
    const stranded = [
        '## K — Console',
        '- [ ] K-1 open one',
        '',
        '## 🗄 Archive',
        '- [x] K-2 done and belongs here',
        '- [ ] K-3 open and does NOT',
        '- [/] K-4 doing and does NOT',
        '- [-] K-5 cancelled and belongs here',
        ''
    ].join('\n');
    const diag = B.parseBacklog(stranded);
    const warnOf = code => (diag.items.find(i => i.code === code) || {}).warn || '';
    ok('‼️ X-134(c): an open line under 🗄 is DIAGNOSED on its own line',
        /under the archive heading but is still open/.test(warnOf('K-3'))
        && /still doing/.test(warnOf('K-4')));
    ok('…and a closed one is not — it is exactly where it belongs',
        !warnOf('K-2') && !warnOf('K-5'));

    const tidied = B.tidyBacklogFile(stranded);
    ok('‼️ X-134(b): tidy carries the live lines home and NAMES them',
        tidied.ok && tidied.reseated.includes('K-3') && tidied.reseated.includes('K-4'));
    ok('…they land under their own area heading, above the archive',
        tidied.text.indexOf('K-3 open') < tidied.text.indexOf('## 🗄 Archive')
        && tidied.text.indexOf('K-4 doing') < tidied.text.indexOf('## 🗄 Archive'));
    ok('‼️ …while the CLOSED ones are left exactly where they are — the archive is a record',
        tidied.text.indexOf('K-2 done') > tidied.text.indexOf('## 🗄 Archive')
        && tidied.text.indexOf('K-5 cancelled') > tidied.text.indexOf('## 🗄 Archive'));
    ok('…the rescued lines are word-for-word what they were, states included',
        /- \[ \] K-3 open and does NOT/.test(tidied.text)
        && /- \[\/\] K-4 doing and does NOT/.test(tidied.text));
    ok('…and nothing is left to diagnose afterwards',
        B.parseBacklog(tidied.text).items.every(i => !/under the archive heading/.test(i.warn || '')));
    ok('a second tidy moves nothing — the repair settles', B.tidyBacklogFile(tidied.text).reseated.length === 0);

    // An area with no heading has no home to be carried to; inventing one would
    // be restructuring the document rather than repairing it. The line stays,
    // and the warning is what says so.
    const homeless = '## 🗄 Archive\n- [ ] Z-1 open, and Z has no heading\n';
    ok('‼️ …but an item whose area has no heading is left alone, warned rather than relocated',
        B.tidyBacklogFile(homeless).reseated.length === 0
        && /under the archive heading/.test(B.parseBacklog(homeless).items[0].warn || ''));

    // ---- (d) only [x] and [-] ever move ----
    const mixed = '## K — Console\n- [ ] K-1 open\n- [/] K-2 doing\n- [x] K-3 done\n- [-] K-4 cancelled\n';
    const swept2 = B.archiveBacklogDone(mixed);
    ok('‼️ X-134(d): only done and cancelled are ever swept into the archive',
        swept2.moved === 2
        && swept2.text.indexOf('K-1 open') < swept2.text.indexOf('## 🗄 Archive')
        && swept2.text.indexOf('K-2 doing') < swept2.text.indexOf('## 🗄 Archive')
        && swept2.text.indexOf('K-3 done') > swept2.text.indexOf('## 🗄 Archive'));
    ok('…and a sweep over a file with a live line already stranded does not adopt it',
        B.archiveBacklogDone(stranded).moved === 0);
}

// ---------------------------------------------------------------------------
// ‼️ X-142: REOPENING SOMETHING ARCHIVED TAKES IT OUT OF THE ARCHIVE.
//
// X-134 built the carry-home but only ran it on a deliberate `tidy`, so an
// item reopened from the archive sat under 🗄 with an open box until somebody
// happened to tidy — open, counted as open, and hidden from every default view.
// The reopen IS the moment it becomes live work, so it is the moment it moves.
// ---------------------------------------------------------------------------
{
    const filed = [
        '## K — Console',
        '- [ ] K-1 open one',
        '',
        '## S — Sessions',
        '- [ ] S-1 open one',
        '',
        '## 🗄 Archive',
        '- [x] K-2 the one being reopened',
        '- [x] K-3 still done, still archived',
        '- [ ] S-9 already stranded, nobody touched it',
        ''
    ].join('\n');

    const back = B.moveBacklogState(filed, { code: 'K-2' }, 'open');
    ok('‼️ X-142: reopening an archived item carries it out of the archive',
        back.ok && back.reseatedFromArchive === true);
    ok('…it lands under its OWN area heading, above the archive',
        back.text.indexOf('K-2 the one being reopened') < back.text.indexOf('## 🗄 Archive')
        && back.text.indexOf('## K — Console') < back.text.indexOf('K-2 the one being reopened'));
    ok('…after the area\'s last seated item, so a run arrives in order',
        back.text.indexOf('K-1 open one') < back.text.indexOf('K-2 the one being reopened'));
    ok('…the line is word-for-word what it was, box aside',
        /- \[ \] K-2 the one being reopened/.test(back.text));
    ok('…and the move is SAID, not merely done',
        /under 🗄 Archive and came back to K/.test(back.note || ''));

    // ‼️ ONE ITEM MOVES. The full sweep is a deliberate act; a tick must not
    // quietly relocate lines somebody did not touch.
    ok('‼️ X-142: nothing else is reseated by a tick',
        back.text.indexOf('S-9 already stranded') > back.text.indexOf('## 🗄 Archive'));
    ok('…and the closed neighbour stays archived — the archive is a record',
        back.text.indexOf('K-3 still done') > back.text.indexOf('## 🗄 Archive'));
    ok('…so the parse has one diagnosis left, not none and not three',
        B.parseBacklog(back.text).items
            .filter(i => /under the archive heading/.test(i.warn || ''))
            .map(i => i.code).join() === 'S-9');

    // The returned item has to describe where the line IS now, or a caller that
    // opens it at `line` opens the wrong one.
    ok('‼️ the returned item carries its NEW line and section',
        back.item && back.item.code === 'K-2' && !back.item.archived
        && back.item.line === B.parseBacklog(back.text).items
            .find(i => i.code === 'K-2').line);

    // One way only: the archive is a record of what was.
    const closed = B.moveBacklogState(back.text, { code: 'K-2' }, 'done');
    ok('‼️ X-142 is ONE-WAY: closing does not file it back into the archive',
        closed.ok && !closed.reseatedFromArchive
        && closed.text.indexOf('K-2 the one being reopened') < closed.text.indexOf('## 🗄 Archive'));
    ok('…and reopening something that was never archived moves nothing',
        !B.moveBacklogState(filed, { code: 'K-1' }, 'doing').reseatedFromArchive);

    // No heading to go home to: say so rather than pretend, exactly as tidy does.
    const homeless = '## 🗄 Archive\n- [x] Z-1 done, and Z has no heading\n';
    const stuck = B.moveBacklogState(homeless, { code: 'Z-1' }, 'open');
    ok('‼️ an item whose area has no heading is left where it is AND warned about',
        stuck.ok && !stuck.reseatedFromArchive
        && /no heading for its area/.test(stuck.note || ''));

    // ‼️ THE HOLD COMES OFF THE LINE THAT MOVED. `moveBacklogState` clears a ⛔
    // when an item is started, and it names the item by the same target it was
    // given — a line number that the reseat has just invalidated.
    const held = [
        '## K — Console', '- [ ] K-1 open one', '',
        '## 🗄 Archive', '- [x] K-7 parked and archived ⛔', ''
    ].join('\n');
    const started = B.moveBacklogState(held, { line: 4 }, 'doing');
    ok('‼️ X-142: a reseat does not lose the hold that should have come off',
        started.ok && started.reseatedFromArchive
        && !/⛔/.test(started.text) && /the ⛔ hold came off/.test(started.note || ''));
}

// ---------- finding an item without touching it ----------
//
// The read-only half of the same resolution every write uses — because "open K-8
// at its line" has to agree with "tick K-8's box" about which line that is.
{
    const found = B.findBacklogItem(VAULT, { code: 'K-8' });
    ok('a code resolves to the item', !!found.item && found.item.code === 'K-8');
    ok('‼️ …with the line it is on RIGHT NOW, which is the whole point',
        found.item.line === B.parseBacklog(VAULT).items.find(i => i.code === 'K-8').line);
    ok('nothing is changed by looking', B.findBacklogItem(VAULT, { code: 'K-8' }).item.raw
        === found.item.raw);
    ok('a code that is not there is an error, not a guess',
        !B.findBacklogItem(VAULT, { code: 'Z-9' }).item
        && /no backlog item with code Z-9/.test(B.findBacklogItem(VAULT, { code: 'Z-9' }).error));
    // Two partial hits and no exact one — the case where guessing would silently
    // open (or edit) the wrong item.
    ok('an ambiguous text match is refused rather than resolved',
        !B.findBacklogItem('## P — P\n- [ ] P-1 the thing here\n- [ ] P-2 the thing there\n',
            { text: 'the thing' }).item);
    ok('an uncoded capture is reachable by its 0-based line',
        !!B.findBacklogItem(VAULT, { line: B.parseBacklog(VAULT).items[0].line }).item);
}

// ---------- ‼️ the queue: ONE order, holding everything ----------
//
// The file is grouped under area headings, so LINE order is a segmented order —
// every P item comes before every K item, for ever, because a line cannot cross
// a heading without re-filing the item. That made "do K-8 next" impossible to
// SAY, which is not a missing button but a missing order. The `## 🎯 Queue`
// block IS the order now: one list, every open item, areas interleaved freely.
{
    ok('a file with no block has an empty queue', B.parseBacklog(VAULT).queue.length === 0);
    ok('…and the order is then exactly the file order',
        B.nextBacklog(VAULT, { limit: 3, maxEffort: 'XL' }).items.map(i => i.code ?? '📥').join()
        === 'P-5,P-5.1,P-5.2');

    // The move that was unsayable: a K item ahead of every P item.
    const first = B.moveInQueue(VAULT, 'K-8', 'top');
    ok('‼️ THE FIRST WRITE MATERIALISES THE WHOLE ORDER — no half-list, no prefix',
        first.ok && first.queue.join() === 'K-8,P-5,P-5.1,P-5.2,P-5.3,P-12');
    ok('…and K-8 is now first, across the areas', B.nextBacklog(first.text,
        { limit: 3, maxEffort: 'XL' }).items[0].code === 'K-8');
    ok('the item itself is untouched — same line, same words, same code',
        B.parseBacklog(first.text).items.find(i => i.code === 'K-8').raw
        === B.parseBacklog(VAULT).items.find(i => i.code === 'K-8').raw);
    ok('the block carries the item\'s words so the file reads as a queue',
        /1\. K-8 — history search is case sensitive/.test(first.text));
    ok('it goes ABOVE the first section, which is where a queue belongs',
        first.text.indexOf('## 🎯 Queue') < first.text.indexOf('## 📥 Inbox'));
    ok('a CRLF file stays CRLF', !/[^\r]\n/.test(first.text));

    // Reading it back is the same list — the file is the truth, not a cache.
    ok('the block round-trips',
        B.parseBacklog(first.text).queue.join() === 'K-8,P-5,P-5.1,P-5.2,P-5.3,P-12');

    // ‼️ THE BUG THE PIN DESIGN HAD: moving one thing must move nothing else.
    // Sending the front item back to third used to drag the two above it into
    // the block as pins nobody had asked for.
    const third = B.placeInQueue(first.text, 'K-8', 3);
    ok('‼️ moving one entry back leaves every other entry exactly where it was',
        third.queue.join() === 'P-5,P-5.1,K-8,P-5.2,P-5.3,P-12');

    const empty = B.setBacklogQueue(first.text, []);
    ok('emptying the queue removes the block rather than leaving a heading',
        empty.queue.length === 0 && !/🎯/.test(empty.text));
    ok('‼️ …and every item is exactly where it was before any of this',
        empty.text === VAULT);

    // A blocked entry is not stale — it is blocked, and that is already reported.
    const blocked = B.moveInQueue(VAULT, 'P-5.3', 'top');
    ok('an item waiting on a ⛔ is still held back wherever it sits in the queue',
        !B.nextBacklog(blocked.text, { maxEffort: 'XL' }).items.some(i => i.code === 'P-5.3'));
    ok('…and is NOT called stale, because nothing about it is wrong',
        B.nextBacklog(blocked.text, { maxEffort: 'XL' }).staleQueue.length === 0);

    // An entry whose item was closed in Obsidian: reported, never swept up.
    const closedOff = B.setBacklogState(first.text, { code: 'K-8' }, 'done');
    ok('an entry that leads nowhere is reported rather than quietly removed',
        B.nextBacklog(closedOff.text, { maxEffort: 'XL' }).staleQueue.join() === 'K-8');
    ok('…and the block can still be edited, dead entry and all',
        B.moveInQueue(closedOff.text, 'P-12', 'top').ok);

    // An uncoded capture has no handle that survives an edit, so it queues last.
    ok('an uncoded capture comes after everything that can be ordered',
        B.nextBacklog(first.text, { limit: 9, maxEffort: 'XL' })
            .items.map(i => i.code ?? '📥').join() === 'K-8,P-5,P-5.1,P-5.2,P-12,📥');

    // `sort` is a different QUESTION, and the queue must not answer it.
    ok('asking for the cheapest is not asking for your queue',
        B.nextBacklog(first.text, { sort: 'score', maxEffort: 'XL' }).items[0].code !== 'K-8');

    // A block somebody rearranges by hand in Obsidian is the same edit.
    const byHand = VAULT.replace('## 📥 Inbox',
        '## 🎯 Queue\r\n\r\n2. K-8\r\n1. P-12 — anything after the code is a label\r\n\r\n## 📥 Inbox');
    ok('a hand-written block is read in ITS order, not in its numbering',
        B.parseBacklog(byHand).queue.join() === 'K-8,P-12');
    ok('an area heading is never mistaken for the queue, whatever it is called',
        B.parseBacklog('## Q — Queue\n- [ ] Q-1 a real item\n').queue.length === 0);
    ok('a second 🎯 block cannot quietly append to the queue',
        B.parseBacklog(byHand + '\r\n## 🎯 Queue\r\n\r\n1. P-5.1\r\n').queue.join() === 'K-8,P-12');
}

// ---------- duplicate codes are reported, never resolved ----------
{
    const dupe = '## P — P\n- [ ] P-1 one\n- [ ] P-1 two\n';
    const s = B.parseBacklog(dupe);
    ok('a duplicate code is flagged on the line', /used more than once/.test(s.items[1].warn || ''));
    ok('and addressing it is refused rather than guessed at',
        !B.setBacklogState(dupe, { code: 'P-1' }, 'done').ok);
    // ‼️ A dotted code standing on its own is NOT a complaint any more: nothing
    // is its parent, so there is nothing missing to report.
    const dotted = B.parseBacklog('## P — P\n- [ ] P-9.1 on its own\n');
    ok('a lone dotted code is an ordinary item, warned about nothing',
        dotted.items[0].code === 'P-9.1' && !dotted.items[0].warn);
}

// ---------- gather: the parts come to the whole, the whole does not move ------
//
// ‼️ THE ONE THING THIS MUST NOT DO IS MOVE A HEAD. Where a family sits in the
// queue is a decision about the WHOLE; a "tidy" that also re-prioritised it
// would be a button nobody could press twice in a row without checking.
{
    // K-8 and P-12 are parts of P-5, and both are queued away from it — K-8
    // right at the front, ahead of its own whole.
    const FAM = [
        '# B',
        '',
        '## 🎯 Queue',
        '',
        '1. K-8',
        '2. P-5',
        '3. P-5.1',
        '4. P-12',
        '5. P-5.2',
        '',
        '## P — Projects',
        '',
        '- [ ] P-5 the work layer',
        '- [ ] P-5.1 projectId on four models',
        '- [ ] P-5.2 stamping [parent:: P-12]',
        '- [ ] P-12 orphaned projectId [parent:: P-5]',
        '',
        '## K — Console',
        '',
        '- [ ] K-8 history search [parent:: P-5]',
        ''
    ].join('\n');
    ok('the fixture starts scattered',
        B.queueOrder(B.parseBacklog(FAM).items, B.parseBacklog(FAM).queue).join()
        === 'K-8,P-5,P-5.1,P-12,P-5.2');

    const all = B.gatherFamilies(FAM);
    ok('every part follows its whole, depth first',
        all.ok && all.queue.join() === 'P-5,K-8,P-12,P-5.2,P-5.1');
    ok('‼️ a part that was queued AHEAD of its whole comes back down to it — K-8 was first',
        all.queue.indexOf('K-8') > all.queue.indexOf('P-5'));
    ok('‼️ the wholes keep their order among themselves — P-5 still leads P-5.1',
        all.queue.indexOf('P-5') < all.queue.indexOf('P-5.1'));
    ok('a part two levels down rides under its own part', all.queue.join().includes('P-12,P-5.2'));
    ok('it says how much moved', /moved/.test(all.note || ''));
    ok('‼️ NO LINE MOVED — this writes the 🎯 block and nothing else',
        all.text.split('\n').filter(l => /^- \[/.test(l)).join()
        === FAM.split('\n').filter(l => /^- \[/.test(l)).join());

    ok('running it again is a no-op that says so',
        /already together/.test(B.gatherFamilies(all.text).note || ''));

    // ---- one family only: everything else is left exactly where it stands ----
    const one = B.gatherFamilies(FAM, 'P-12');
    ok('a named family pulls only its own parts',
        one.ok && one.queue.join() === 'K-8,P-5,P-5.1,P-12,P-5.2');
    ok('…and says which one it was about', /P-12/.test(one.note || ''));
    const mine = B.gatherFamilies(FAM, 'P-5');
    ok('the whole chain comes when the head of it is named',
        mine.queue.join() === 'P-5,K-8,P-12,P-5.2,P-5.1');

    ok('a code that is not in the queue is refused by name',
        /no backlog item with code Z-9/.test(B.gatherFamilies(FAM, 'Z-9').error || ''));

    // ---- a chain that loops is survived, not hung on ----
    const LOOP = [
        '# B', '', '## P — P', '',
        '- [ ] P-1 one [parent:: P-2]',
        '- [ ] P-2 two [parent:: P-1]',
        '- [ ] P-3 three',
        ''
    ].join('\n');
    const looped = B.gatherFamilies(LOOP);
    ok('‼️ a parent chain that loops leaves every item in the queue exactly once',
        looped.queue.slice().sort().join() === 'P-1,P-2,P-3');

    // ---- U-56: the same relation from the PART's end ---------------------
    //
    // ‼️ Gather is pressed on the whole and rearranges a family; this is
    // pressed on ONE row that has drifted. The difference that matters is
    // what it must NOT touch: every other entry keeps its place.
    {
        const j = B.joinParent(FAM, 'K-8');
        ok('‼️ U-56 — the part goes under its whole and NOTHING else moves',
            j.ok && j.queue.join() === 'P-5,K-8,P-5.1,P-12,P-5.2');
        ok('…and it says where it went', /K-8/.test(j.note || '') && /P-5/.test(j.note || ''));
        ok('‼️ NO LINE MOVED — the 🎯 block is the only thing rewritten',
            j.text.split('\n').filter(l => /^- \[/.test(l)).join()
            === FAM.split('\n').filter(l => /^- \[/.test(l)).join());

        // ‼️ It lands at the END of the run already behind the whole, so
        // siblings somebody has already gathered are not pushed down.
        const two = B.joinParent(j.text, 'P-12');
        ok('‼️ a second part joins the END of the family run, above nobody',
            two.queue.join() === 'P-5,K-8,P-12,P-5.1,P-5.2');

        ok('running it on a part that is already there is a no-op that says so',
            /already under/.test(B.joinParent(two.text, 'K-8').note || ''));

        // The two refusals, and each names the reason rather than the rule.
        ok('an item that belongs to nothing is refused, and told why',
            /P-5 is not part of anything/.test(B.joinParent(FAM, 'P-5').error || ''));
        ok('a whole that is not in the queue is refused with ITS reason',
            /P-5.*closed/.test(B.joinParent(
                FAM.replace('- [ ] P-5 the work layer', '- [x] P-5 the work layer'), 'K-8'
            ).error || ''));
        ok('a code that is not there at all is refused by name',
            /no backlog item with code Z-9/.test(B.joinParent(FAM, 'Z-9').error || ''));
    }
}

// ---------- U-60: the hold — a bare ⛔, which is not a state ----------
//
// What is defended here is the SEPARATION. `⛔ P-3` means "waiting on P-3" and
// must go on meaning exactly that; a ⛔ with nothing behind it means "parked",
// and the two live on the same line without either one reading as the other.
// The checkbox is not involved: a held item is open, live and counted.
{
    const HELD = [
        '# Backlog', '',
        '## P — Projects', '',
        '- [ ] P-1 first thing #bug [effort:: S]',
        '- [ ] P-2 second thing [effort:: M] ⛔ P-1',
        '- [ ] P-3 third thing [effort:: S]', ''
    ].join('\n');

    const held = B.setBacklogHold(HELD, { code: 'P-3' }, true);
    ok('U-60: a hold puts a bare ⛔ on the line', held.ok && held.item.onHold === true);
    ok('‼️ …and changes NOTHING else — the box, the code, the field all stand',
        /^- \[ \] P-3 third thing \[effort:: S\] ⛔$/m.test(held.text)
        && HELD.split('\n').filter(l => !/P-3/.test(l)).join('\n')
        === held.text.split('\n').filter(l => !/P-3/.test(l)).join('\n'));
    ok('…the item is still OPEN — a hold is not a state',
        B.parseBacklog(held.text).items.find(i => i.code === 'P-3').state === 'open');

    const nxt = B.nextBacklog(held.text, { limit: 9 });
    ok('‼️ …and "what is next" stops offering it',
        !nxt.items.some(i => i.code === 'P-3'));
    ok('…reported under `held`, NOT under `blocked` — nothing is in its way',
        nxt.held.map(i => i.code).join() === 'P-3'
        && !nxt.blocked.some(b => b.item.code === 'P-3'));
    ok('…and a caller may still ask for it',
        B.nextBacklog(held.text, { limit: 9, includeHeld: true }).items.some(i => i.code === 'P-3'));

    // ‼️ The two ⛔ meanings on one line, each still saying its own thing.
    const both = B.setBacklogHold(held.text, { code: 'P-2' }, true);
    const p2 = B.parseBacklog(both.text).items.find(i => i.code === 'P-2');
    ok('‼️ a coded ⛔ and a bare one coexist and are read apart',
        p2.onHold === true && p2.blockedBy.join() === 'P-1');
    ok('…and the second reason is said out loud rather than left to be discovered',
        /already waiting on P-1/.test(both.note || ''));

    const off = B.setBacklogHold(both.text, { code: 'P-2' }, false);
    const p2off = B.parseBacklog(off.text).items.find(i => i.code === 'P-2');
    ok('‼️ taking the hold off leaves every CODED ⛔ exactly where it stood',
        p2off.onHold !== true && p2off.blockedBy.join() === 'P-1'
        && /- \[ \] P-2 second thing \[effort:: M\] ⛔ P-1/.test(off.text));
    ok('holding something already held writes nothing',
        B.setBacklogHold(held.text, { code: 'P-3' }, true).text === held.text);

    // Rebuilding the line must not quietly unpark it — the trap
    // `setBacklogFields` documents, one field wider.
    const rebuilt = B.setBacklogFields(held.text, { code: 'P-3' }, { priority: 'high' });
    ok('‼️ a field edit CARRIES the hold — a rebuild that dropped it would unpark silently',
        B.parseBacklog(rebuilt.text).items.find(i => i.code === 'P-3').onHold === true);

    // Moving the box is a decision, so it ends the hold — except `open`, which
    // is not a decision to start anything.
    const doing = B.moveBacklogState(held.text, { code: 'P-3' }, 'doing');
    ok('‼️ starting it takes the hold off in the same write',
        doing.ok && !/⛔/.test(doing.text.split('\n').find(l => /P-3/.test(l)))
        && /hold came off/.test(doing.note || ''));
    ok('…and cancelling it does too', (() => {
        const c = B.moveBacklogState(held.text, { code: 'P-3' }, 'cancelled');
        return c.ok && !/⛔/.test(c.text.split('\n').find(l => /P-3/.test(l)));
    })());
    ok('‼️ …but reopening does NOT — putting something back to open is not starting it', (() => {
        const closedHeld = B.setBacklogHold(
            B.setBacklogState(HELD, { code: 'P-3' }, 'done').text, { code: 'P-3' }, true);
        const back = B.moveBacklogState(closedHeld.text, { code: 'P-3' }, 'open');
        return back.ok && B.parseBacklog(back.text).items.find(i => i.code === 'P-3').onHold === true;
    })());

    // Filing a parked capture must not unpark it — `codeBacklogItem` rebuilds.
    ok('‼️ filing a held capture keeps it held', (() => {
        const cap = B.setBacklogHold(`${HELD}- [ ] a parked thought\n`, { text: 'parked thought' }, true);
        const filed = B.codeBacklogItem(cap.text, { text: 'parked thought' }, 'P');
        return filed.ok && !!filed.item.onHold;
    })());
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
