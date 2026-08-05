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
//   - `next` is what "do the top five" runs on, so its exclusions (containers,
//     blocked items, oversized ones) are the difference between five items an
//     agent finishes and five it abandons half-done.
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
// uncoded captures, areas as headings, a nested child, real Tasks metadata.
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
    ok('the parent comes from the code, not the indent', by('P-5.1').parent === 'P-5');
    ok('an item with children is a container, a leaf is not',
        by('P-5').container === true && by('P-5.1').container === false);
    ok('the area comes off the code', by('K-8').area === 'K');
    ok('`## P — Projects` declares an area',
        s.areas.length === 2 && s.areas[0].code === 'P' && s.areas[0].label === 'Projects');
    ok('an area counts its own open items', s.areas[1].code === 'K' && s.areas[1].open === 1);
    ok('#tags are the kind',
        by('P-5.1').kinds.join() === 'feat' && by('P-12').kinds.join() === 'bug');
    ok('Obsidian Tasks priority icons are the priority',
        by('P-5.1').priority === 'high' && by('P-12').priority === 'highest'
        && by('K-8').priority === 'low' && by('P-5').priority === 'normal');
    ok('[efor:: S] is the effort', by('P-5.2').effort === 'S' && by('K-8').effort === 'XS');
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

// A `- [ ] thing` inside a fence is documentation, not a task.
{
    const fenced = ['# B', '', '```', '- [ ] P-1 example', '```', '', '- [ ] P-2 real'].join('\n');
    const s = B.parseBacklog(fenced);
    ok('a checkbox inside a code fence is not an item',
        s.items.length === 1 && s.items[0].code === 'P-2');
}

// ---------- codes ----------
{
    ok('a code carries its own path', B.parentCode('P-5.3') === 'P-5');
    ok('an area root has no parent', B.parentCode('P-5') === undefined);
    ok('codes sort like a person expects: P-2 before P-10',
        ['P-10', 'P-2', 'P-5.1', 'P-5'].sort(B.compareCodes).join() === 'P-2,P-5,P-5.1,P-10');
    const items = B.parseBacklog(VAULT).items;
    ok('the next area code is one past the highest, not one past the count',
        B.nextCode(items, 'P') === 'P-13');
    ok('the next child code counts children only, not grandchildren',
        B.nextCode(items, 'P', 'P-5') === 'P-5.4');
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
    ok('a container is never handed out as work — the work is at the leaves',
        codes.indexOf('P-5') < 0);
    ok('a blocked item is held back and reported, not silently dropped',
        codes.indexOf('P-5.3') < 0 && r.blocked.some(b => b.item.code === 'P-5.3'));
    ok('a closed item is not next', codes.indexOf('K-3') < 0);
    ok('an uncoded capture is still work', codes.indexOf('inbox') >= 0);
    ok('file order is the default — the user\'s own arrangement wins',
        codes.join() === 'inbox,P-5.1,P-5.2,P-12,K-8');

    ok('the effort ceiling defaults to M and keeps L/XL out of a turn',
        B.nextBacklog(VAULT, { limit: 10 }).items.every(i => !i.effort || 'XS,S,M'.includes(i.effort)));
    ok('an UNSIZED item is not excluded by the ceiling — a fresh backlog is not empty',
        B.nextBacklog(VAULT, { limit: 10 }).items.some(i => !i.effort));
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

    const child = B.addBacklogItem(VAULT, { text: 'a child', parent: 'P-5' });
    ok('a parent gives it the next child code', child.code === 'P-5.4');
    ok('a child joins its family rather than the end of the section',
        child.text.indexOf('P-5.4') < child.text.indexOf('P-12'));
    ok('a child is indented under its parent', /\n {4}- \[ \] P-5\.4/.test(child.text));

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
        /- \[ \] K-9 everything #bug 🔺 \[efor:: S\] ⛔ K-8 📅 2026-09-01/.test(full.text));
    ok('an unknown parent is refused rather than guessed at',
        !B.addBacklogItem(VAULT, { text: 'x', parent: 'Q-1' }).ok);
    ok('a lower-case area is accepted and normalised',
        B.addBacklogItem(VAULT, { text: 'x', area: 'k' }).code === 'K-9');
    ok('an empty item is refused', !B.addBacklogItem(VAULT, { text: '  ' }).ok);
    ok('a multi-line item becomes one line — a list item is a line',
        /- \[ \] a b/.test(B.addBacklogItem('', { text: 'a\nb' }).text));
}

// ---------- fields ----------
{
    const r = B.setBacklogFields(VAULT, { code: 'K-8' }, { priority: 'highest', effort: 'M' });
    ok('the axes change', r.ok && /K-8.*🔺/.test(r.text) && /K-8.*\[efor:: M\]/.test(r.text));
    ok('the code, the state and the words survive a rebuild',
        /- \[ \] K-8 history search is case sensitive/.test(r.text));
    ok('every OTHER line is untouched',
        r.text.split('\r\n').filter((l, i) => l !== VAULT.split('\r\n')[i]).length === 1);
    ok('null clears a field',
        !/\[efor::/.test(B.setBacklogFields(VAULT, { code: 'K-8' }, { effort: null }).text
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

// ---------- classifying an inbox capture ----------
{
    const r = B.codeBacklogItem(VAULT, { text: 'console history search' }, 'K');
    ok('an uncoded capture gets a code', r.ok && r.code === 'K-9');
    ok('and moves into its area', /## K — Console[\s\S]*K-9 console history search/.test(r.text));
    ok('the original line is gone — it moved, it was not copied',
        (r.text.match(/console history search is case sensitive/g) || []).length === 1);
    ok('an item that already has a code is refused',
        !B.codeBacklogItem(VAULT, { code: 'K-8' }, 'P').ok);
    ok('an unknown parent is refused',
        !B.codeBacklogItem(VAULT, { text: 'console history search' }, '', 'Q-9').ok);
}

// ---------- order ----------
{
    const r = B.moveBacklogItem(VAULT, { code: 'K-8' }, 'up');
    ok('an item moves among its siblings', r.ok);
    ok('‼️ and its CODE does not change — order and identity are separate',
        /K-8/.test(r.text) && /K-3/.test(r.text)
        && r.text.indexOf('K-8') < r.text.indexOf('K-3'));
    ok('the line ending is preserved through the reorder',
        (r.text.match(/\r\n/g) || []).length === (VAULT.match(/\r\n/g) || []).length);
    const withKids = B.moveBacklogItem(VAULT, { code: 'P-5' }, 'down');
    ok('a parent carries its children with it',
        withKids.text.indexOf('P-5.3') < withKids.text.indexOf('P-5 Faz 5') + 400
        && withKids.text.indexOf('P-12') < withKids.text.indexOf('P-5.1'));
    const top = B.moveBacklogItem(VAULT, { code: 'P-5' }, 'up');
    ok('already at the top is a no-op that says so, not an error',
        top.ok && top.text === VAULT && /already at the top/.test(top.note || ''));

    // The backlog is a queue, and "this one next" is what a queue is for. Eleven
    // presses of ▲ is the same as not being able to do it.
    const toTop = B.moveBacklogItem(VAULT, { code: 'K-8' }, 'top');
    ok('an item can be sent to the top of its section in one move',
        toTop.ok && toTop.text.indexOf('K-8') < toTop.text.indexOf('K-3'));
    const toBottom = B.moveBacklogItem(VAULT, { code: 'P-5' }, 'bottom');
    ok('…and to the bottom, children in tow',
        toBottom.ok && toBottom.text.indexOf('P-12') < toBottom.text.indexOf('P-5 Faz 5')
        && toBottom.text.indexOf('P-5 Faz 5') < toBottom.text.indexOf('P-5.1'));
    ok('a block sent to the bottom keeps every one of its children',
        (toBottom.text.match(/P-5\.\d/g) || []).length === (VAULT.match(/P-5\.\d/g) || []).length);
    ok('already at the bottom says so rather than shuffling anything',
        /already at the bottom/.test(B.moveBacklogItem(VAULT, { code: 'P-12' }, 'bottom').note || ''));
    ok('top and bottom leave the line endings alone too',
        (toBottom.text.match(/\r\n/g) || []).length === (VAULT.match(/\r\n/g) || []).length);

    // ---- the drag: a named destination rather than a count of steps ----
    const dropped = B.reorderBacklogItem(VAULT, { code: 'P-12' }, { code: 'P-5' }, 'before');
    ok('an item can be dropped directly above another',
        dropped.ok && dropped.text.indexOf('P-12') < dropped.text.indexOf('P-5 Faz 5'));
    ok('…and its code still means what it meant', /P-12 orphaned projectId/.test(dropped.text));
    const after = B.reorderBacklogItem(VAULT, { code: 'P-5' }, { code: 'P-12' }, 'after');
    ok('…or below one, carrying its children',
        after.ok && after.text.indexOf('P-12') < after.text.indexOf('P-5 Faz 5')
        && (after.text.match(/P-5\.\d/g) || []).length === (VAULT.match(/P-5\.\d/g) || []).length);
    // The two refusals, both because getting them wrong would be SILENT.
    const crossSection = B.reorderBacklogItem(VAULT, { code: 'K-8' }, { code: 'P-12' }, 'after');
    ok('‼️ a drop into another section is refused — that is a re-file, not a reorder',
        !crossSection.ok && /different sections/.test(crossSection.error || ''));
    const crossDepth = B.reorderBacklogItem(VAULT, { code: 'P-12' }, { code: 'P-5.1' }, 'after');
    ok('‼️ a drop at another depth is refused — that would re-parent it',
        !crossDepth.ok && /different depths/.test(crossDepth.error || ''));
    const intoSelf = B.reorderBacklogItem(VAULT, { code: 'P-5' }, { code: 'P-5.2' }, 'after');
    ok('an item cannot be dropped inside its own block', !intoSelf.ok);
    ok('dropping something on itself is a no-op, not an error',
        B.reorderBacklogItem(VAULT, { code: 'K-8' }, { code: 'K-8' }, 'after').text === VAULT);
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

// ---------- duplicate codes are reported, never resolved ----------
{
    const dupe = '## P — P\n- [ ] P-1 one\n- [ ] P-1 two\n';
    const s = B.parseBacklog(dupe);
    ok('a duplicate code is flagged on the line', /used more than once/.test(s.items[1].warn || ''));
    ok('and addressing it is refused rather than guessed at',
        !B.setBacklogState(dupe, { code: 'P-1' }, 'done').ok);
    const orphan = B.parseBacklog('## P — P\n- [ ] P-9.1 child of nothing\n');
    ok('a child whose parent is not in the file is flagged, not hidden',
        /parent P-9 is not in this file/.test(orphan.items[0].warn || ''));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
