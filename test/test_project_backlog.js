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
    ok('the queue is the default — the user\'s own arrangement wins',
        codes.join() === 'P-5.1,P-5.2,P-12,K-8,inbox');
    ok('‼️ …and an item that cannot be IN the queue comes after it, not among it',
        codes[codes.length - 1] === 'inbox');

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
        /- \[ \] K-9 everything #bug 🔺 \[effort:: S\] ⛔ K-8 📅 2026-09-01/.test(full.text));
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
    ok('an unknown parent is refused',
        !B.codeBacklogItem(VAULT, { text: 'console history search' }, '', 'Q-9').ok);
}

// ---------- order ----------
//
// ‼️ EVERY ORDERING WRITE TOUCHES ONE BLOCK AND NO LINE. That is the promise the
// whole redesign rests on: an area heading can no longer hold an item back,
// because the order stopped being where the item's line sits.
{
    const order = () => B.queueOrder(B.parseBacklog(VAULT).items, B.parseBacklog(VAULT).queue);
    ok('with no block, the order is the file — live leaves only, in line order',
        order().join() === 'P-5.1,P-5.2,P-5.3,P-12,K-8');
    ok('…a container is not in it: work lives at the leaves',
        order().indexOf('P-5') < 0);
    ok('…and neither is a closed item', order().indexOf('K-3') < 0);

    // The move nobody could make before: last area to the front.
    const toTop = B.moveInQueue(VAULT, 'K-8', 'top');
    ok('‼️ an item can go to the front of the WHOLE queue, area or no area',
        toTop.ok && toTop.queue[0] === 'K-8');
    ok('…and not one item line moved — the file is the same but for the block',
        toTop.text.indexOf('- [ ] K-8 history search') > toTop.text.indexOf('- [ ] P-12 orphaned'));
    ok('…so its code, its area and its section are all untouched',
        /## K — Console\r\n\r\n- \[x\] K-3[\s\S]*- \[ \] K-8 history search/.test(toTop.text));

    const up1 = B.moveInQueue(VAULT, 'K-8', 'up');
    ok('a plain click moves one place', up1.queue.join() === 'P-5.1,P-5.2,P-5.3,K-8,P-12');
    const up3 = B.moveInQueue(VAULT, 'K-8', 'up', 3);
    ok('‼️ and the step menu moves several — the whole point of resting on ▲',
        up3.queue.join() === 'P-5.1,K-8,P-5.2,P-5.3,P-12');
    const up99 = B.moveInQueue(VAULT, 'K-8', 'up', 99);
    ok('a jump bigger than the queue lands on the end, it does not fail',
        up99.ok && up99.queue[0] === 'K-8');
    const down = B.moveInQueue(VAULT, 'P-5.1', 'down', 2);
    ok('…the same downwards', down.queue.join() === 'P-5.2,P-5.3,P-5.1,P-12,K-8');
    const bottom = B.moveInQueue(VAULT, 'P-5.1', 'bottom');
    ok('…and to the very back', bottom.queue.join() === 'P-5.2,P-5.3,P-12,K-8,P-5.1');

    const already = B.moveInQueue(VAULT, 'P-5.1', 'up');
    ok('already at the front is a no-op that says so, not an error',
        already.ok && already.text === VAULT && /already at the top/.test(already.note || ''));
    ok('the line ending is preserved when the block is written',
        (toTop.text.match(/\r\n/g) || []).length > (VAULT.match(/\r\n/g) || []).length
        && (toTop.text.match(/[^\r]\n/g) || []).length === 0);

    // ---- absolute position: "do this one third" ----
    const at3 = B.placeInQueue(VAULT, 'K-8', 3);
    ok('a code can be put at a position counted the way a person says it',
        at3.queue.join() === 'P-5.1,P-5.2,K-8,P-5.3,P-12');
    ok('…and position 1 is the front', B.placeInQueue(VAULT, 'K-8', 1).queue[0] === 'K-8');

    // ---- the drag: a named destination rather than a count of steps ----
    const dropped = B.dropInQueue(VAULT, 'K-8', 'P-5.1', 'before');
    ok('an entry can be dropped directly in front of another',
        dropped.ok && dropped.queue.join() === 'K-8,P-5.1,P-5.2,P-5.3,P-12');
    const after = B.dropInQueue(VAULT, 'P-5.1', 'K-8', 'after');
    ok('…or behind one, across areas, with no refusal anywhere',
        after.ok && after.queue.join() === 'P-5.2,P-5.3,P-12,K-8,P-5.1');
    ok('dropping something on itself is a no-op, not an error',
        B.dropInQueue(VAULT, 'K-8', 'K-8', 'after').text === VAULT);

    // ---- the four refusals, each said precisely: one message for all of them
    // would send somebody to read the file.
    ok('a container is refused — work lives at the leaves',
        /has children/.test(B.moveInQueue(VAULT, 'P-5', 'up').error || ''));
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
    ok('‼️ children ride with their parent — P-5.1 stays under P-5',
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
        === 'P-5.1,P-5.2,P-12');

    // The move that was unsayable: a K item ahead of every P item.
    const first = B.moveInQueue(VAULT, 'K-8', 'top');
    ok('‼️ THE FIRST WRITE MATERIALISES THE WHOLE ORDER — no half-list, no prefix',
        first.ok && first.queue.join() === 'K-8,P-5.1,P-5.2,P-5.3,P-12');
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
        B.parseBacklog(first.text).queue.join() === 'K-8,P-5.1,P-5.2,P-5.3,P-12');

    // ‼️ THE BUG THE PIN DESIGN HAD: moving one thing must move nothing else.
    // Sending the front item back to third used to drag the two above it into
    // the block as pins nobody had asked for.
    const third = B.placeInQueue(first.text, 'K-8', 3);
    ok('‼️ moving one entry back leaves every other entry exactly where it was',
        third.queue.join() === 'P-5.1,P-5.2,K-8,P-5.3,P-12');

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
            .items.map(i => i.code ?? '📥').join() === 'K-8,P-5.1,P-5.2,P-12,📥');

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
    const orphan = B.parseBacklog('## P — P\n- [ ] P-9.1 child of nothing\n');
    ok('a child whose parent is not in the file is flagged, not hidden',
        /parent P-9 is not in this file/.test(orphan.items[0].warn || ''));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
