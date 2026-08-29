// U-70 (X-50) — THE WIKI COCKPIT, driven through the real page script.
//
// ‼️ WHAT THIS FILE IS THE PROOF OF. The pool has four doors that write to it
// and this page is the only one that READS it, so the failures worth pinning
// are the ones where the page would look right and be lying:
//
//   * a mark a run is already out for is PENDING — and offering it again files
//     the same concept twice (M-23). It must be undrawn as a choice: no tick
//     box, not counted in "all pending", and not sendable even if the reader
//     had it selected before the run started;
//   * a compile is REFUSED outright when the wiki has no law of its own, and
//     the page has to say so before the press rather than after it. A button
//     that looks alive over a missing `-WIKI-ANAYASA-.md` is the exact shape of
//     lie this whole feature is built to avoid;
//   * "Compile All Pending" sends NO ids — `all:true` is the op's own selector,
//     and a page that sent a snapshot of ids would compile a stale list;
//   * a mark cannot be left with no topic (the host refuses it by name), so an
//     emptied topic box must not be sent at all;
//   * a path is never the webview's to choose: the page names WHICH file, the
//     host resolves it.
'use strict';
const path = require('path');
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));
const fixture = require(path.join(__dirname, 'fixtures', 'wiki.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

/**
 * ‼️ THE SEARCH BOX IS DEBOUNCED (AFFilter.live), and the shim's timer is a
 * no-op — so without this every keystroke assertion would be measuring a page
 * that had not filtered yet, and would pass or fail for the wrong reason. A
 * synchronous timer is the honest stand-in: the debounce exists to spare the
 * renderer, not to change the answer.
 */
const NOW = { setTimeout: (fn) => { fn(); return 0; }, clearTimeout: () => { } };
const page = (data) => runPage('wiki.js', data, NOW);
const run = (over) => page(fixture.data(over));
const el = (r, attr, value) => r.query(`[data-${attr}]`)
    .find(e => e.dataset[attr.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] === value);

// ============================================================ the pool, drawn
{
    const r = run();
    const h = r.html();
    ok('the page draws', /Wiki<\/h1>/.test(h));
    ok('the subtitle counts both sides of the system',
        /6 waiting/.test(h) && /1 compiling/.test(h) && /2 compiled/.test(h) && /14 wiki page\(s\)/.test(h));
    ok('…and names who writes the wiki', /writer: developer/.test(h));

    // The default view is what is LIVE: waiting and compiled. A dropped mark is
    // history and does not compete for the reader's attention.
    // ‼️ Asserted on the ROW's own text, never on a topic name: the topic picker
    // lists every topic in the pool, so a name is on the page whether or not the
    // mark carrying it is.
    ok('a dropped mark is not in the default view', !/bunu bir daha/.test(h));
    ok('a waiting mark is', /bir derleme koşusu/.test(h));
    ok('a compiled mark is', /obsidian IDE ise/.test(h));

    ok('the vault strip names the root, the law, the index and the log',
        /00_WIKI/.test(h) && /WIKI-ANAYASA/.test(h) && /index\.md/.test(h) && /log\.md/.test(h));
    ok('…and the agent procedure beside them', /_REF\/wiki\.md/.test(h));
}

// ================ U-122: the vault strip, where every object IS a path
//
// ‼️ THE STRIP NAMED SIX THINGS AND LET YOU PRESS THREE. A path you can see and
// cannot copy, a drop box you can read the name of and cannot open, and the
// agent procedure rendered as a dead `<span>` are one omission with three
// faces: the object is DRAWN but is not an object.
{
    const r = run();
    const h = r.html();

    // 1 — the procedure. It is the file a compile is told to read FIRST, named
    // on the one page that starts compiles, and it could not be opened there.
    const proc = el(r, 'open', 'procedure');
    ok('‼️ the agent procedure is a link, not a dead span', !!proc);
    proc.fire('click');
    ok('…and pressing it asks the HOST which file that is',
        r.posted.some(m => m.type === 'openWikiFile' && m.which === 'procedure'));
    ok('…and the page never posts the path itself',
        !r.posted.some(m => typeof m.path === 'string' && /wiki\.md/.test(m.path)));

    // 3 — the drop box, with the count that is the reason to look at it.
    const raw = el(r, 'reveal', 'raw');
    ok('‼️ the drop box is on the strip, carrying what is waiting in it',
        !!raw && /📥 _RAW_ \(2\)/.test(h));
    raw.fire('click');
    ok('…and pressing it opens the FOLDER rather than an editor',
        r.posted.some(m => m.type === 'revealWikiPath' && m.which === 'raw'));

    // 2 — the root is a path you can press, and everything is a menu.
    const root = el(r, 'reveal', 'root');
    ok('the root shows itself in the file manager', !!root);
    root.fire('click');
    ok('…through the same door', r.posted.some(m => m.type === 'revealWikiPath' && m.which === 'root'));
    const ctx = (h.match(/afWikiVault/g) || []).length;
    ok('‼️ every object on the strip carries the right-click contract',
        ctx === 6 && /&quot;afWhich&quot;:&quot;procedure&quot;/.test(h)
        && /&quot;afWhich&quot;:&quot;raw&quot;/.test(h) && /&quot;afWhich&quot;:&quot;root&quot;/.test(h));
    ok('…and the path travels with it, because the clipboard is the page\'s job',
        /&quot;afPath&quot;:&quot;D:\\\\zone\\\\agent\\\\ajanlar\\\\_REF\\\\wiki.md&quot;/.test(h));
    ok('…and only the root offers the settings item',
        (h.match(/&quot;afRoot&quot;:true/g) || []).length === 1);

    // 4 — the four figures. A strip that names a file and says nothing about it
    // sends the reader to Obsidian to answer "is the index up to date?".
    ok('‼️ a named file states its length, its size and when it last changed',
        /58 line\(s\)/.test(h) && /3.0 KB/.test(h) && /Last changed:/.test(h));
    ok('…and the drop box states both boxes', /2 transcript\(s\) waiting/.test(h)
        && /1 already archived in _DONE_/.test(h));
}

// ‼️ AND THE OTHER END: a door that opens nothing is not drawn as a door.
{
    const r = page(fixture.variants().find(v => v.id === 'nolaw').data);
    const h = r.html();
    ok('‼️ a procedure no agent root holds stays plain text', !el(r, 'open', 'procedure'));
    ok('…and says why there is nothing to open', /no configured agent root holds it/.test(h));
    ok('a drop box that is not there yet cannot be pressed', !el(r, 'reveal', 'raw'));
    ok('…and it is drawn as text rather than as a link', /wk-raw bad wk-dead/.test(h));
    // The root of this variant DOES exist — only the law is missing — so it
    // stays pressable. The dead-door rule is about the path, not about health.
    ok('…while the root, which is there, is still a door', !!el(r, 'reveal', 'root'));
    ok('…but they are still right-clickable, and the menu knows they are missing',
        /&quot;afMissing&quot;:true/.test(h) && /afWikiVault/.test(h));
}

// ============================================= a run in flight is not a choice
{
    const r = run();
    const h = r.html();
    ok('a mark with a live run reads as compiling, not as waiting', /compiling/.test(h));
    ok('‼️ …and carries NO tick box — asking for it again files the concept twice',
        !el(r, 'cb', 'wc-2') && !!el(r, 'cb', 'wc-1'));
    // Six waiting marks: one claimed by a live run, one still without a topic
    // (U-117). The button must offer the four that are left.
    ok('‼️ "Compile All Pending" counts only what a run is NOT out for',
        /Compile All Pending \(4\)/.test(h));

    // Ticking everything selects the compilable rows and no others.
    const all = r.query('#wk-all')[0];
    all.checked = true; all.fire('change');
    ok('select-all takes every compilable row shown', /Compile Selected \(4\)/.test(r.html()));
    ok('…and still leaves the claimed one alone', !el(r, 'cb', 'wc-2'));

    /**
     * ‼️ X-58 — A MARK WHOSE LAST RUN DIED IS STILL WORK, AND IT DOES NOT LOOK
     * LIKE WORK NOBODY HAS REACHED. It reads `failed`, the reason is in the
     * panel rather than a badge with nothing behind it, and it is offered to a
     * compile again — the whole point of releasing the claim.
     */
    ok('a mark whose last run produced nothing reads as failed, not as waiting',
        /wk-failed/.test(h) && /⚠ failed/.test(h));
    ok('…the reason is there in the words the host wrote, not just a colour',
        h.indexOf('ran out of quota') > 0);
    ok('…it is compilable again — a crash must not lock a turn out for ever',
        !!el(r, 'cb', 'wc-6'));
    ok('…and it offers ↻, which clears the record rather than undoing work',
        /data-act="retry" data-id="wc-6"/.test(h));
    ok('‼️ the exclusions are part of what the mark IS, so the row says so',
        /whole session \(except 13, 14\)/.test(h));
}

// ================================================== the two compile selectors
/**
 * ‼️ U-95 — NO COMPILE BUTTON STARTS A RUN. They all open the same strip.
 *
 * A compile is a headless run of a real model over real transcripts: it spends
 * quota and it writes into the vault, and which agent, engine, model and effort
 * it uses are four settings the reader cannot see from this page. So the press
 * says what it is about to spend, and one more press spends it.
 */
{
    const r = run();
    const cb = el(r, 'cb', 'wc-1');
    cb.checked = true; cb.fire('change');
    const before = r.posted.length;
    r.query('#wk-csel')[0].fire('click');
    ok('pressing Compile Selected starts nothing yet', r.posted.length === before);
    const h = r.html();
    ok('…it says what it is about to read', /Compile 1 selected mark/.test(h));
    ok('…and what it will run with, from the settings that resolve the run',
        /developer/.test(h) && /claude/.test(h) && /sonnet/.test(h));
    ok('…a setting nobody set says so rather than reading as a choice',
        /effort: default/.test(h));
    r.query('#wk-ago')[0].fire('click');
    const m = r.last();
    ok('Start sends the ticked ids', m.type === 'compile' && m.ids.length === 1 && m.ids[0] === 'wc-1');
    ok('…and the strip is gone once it has been spent', !r.query('#wk-ago').length);
}
{
    const r = run();
    const cb = el(r, 'cb', 'wc-1');
    cb.checked = true; cb.fire('change');
    r.query('#wk-csel')[0].fire('click');
    ok('Cancel is a real way out', !!r.query('#wk-ago').length);
    const before = r.posted.length;
    r.query('#wk-acancel')[0].fire('click');
    ok('…it starts nothing and takes the strip away',
        r.posted.length === before && !r.query('#wk-ago').length);
}
{
    const r = run();
    r.query('#wk-call')[0].fire('click');
    r.query('#wk-ago')[0].fire('click');
    const m = r.last();
    // ‼️ NO IDS. `all:true` is resolved by the op at the moment it runs; a page
    // that sent a snapshot would compile a list that had already moved.
    ok('‼️ Compile All Pending sends no ids at all — the op resolves "all" itself',
        m.type === 'compile' && Array.isArray(m.ids) && m.ids.length === 0);
}
/** U-95 — one row, on its own, without ticking anything first. */
{
    const r = run();
    r.query('[data-act]').filter(e => e.dataset.act === 'compile' && e.dataset.id === 'wc-4')[0]
        .fire('click');
    r.query('#wk-ago')[0].fire('click');
    const m = r.last();
    ok('a waiting row compiles itself, alone',
        m.type === 'compile' && m.ids.length === 1 && m.ids[0] === 'wc-4');
    ok('‼️ …and a row a run is already out for is not offered one',
        !r.query('[data-act]').some(e => e.dataset.act === 'compile' && e.dataset.id === 'wc-2'));
}
/** U-95 — "compile what I am looking at", where the looking is done. */
{
    const r = run();
    ok('the unfiltered pool offers no "compile these" — it would be Compile All twice',
        !r.query('#wk-cfilt').length);
    const q = r.query('#wk-q')[0];
    q.value = 'kota'; q.fire('input');
    ok('narrowing the view offers it, counted', /⚡ Compile these 2/.test(r.html()));
    r.query('#wk-cfilt')[0].fire('click');
    r.query('#wk-ago')[0].fire('click');
    const m = r.last();
    ok('…and it compiles exactly the waiting rows the filters leave',
        m.type === 'compile' && m.ids.length === 2
        && m.ids.indexOf('wc-4') >= 0 && m.ids.indexOf('wc-6') >= 0);
}
/**
 * ‼️ U-95 — WHAT A TICK IS FOR BESIDES COMPILING. Ticking five rows and then
 * pressing 🚫 on each one is the gesture the tick box was put there to end.
 */
{
    const r = run();
    ok('with nothing ticked there is no bulk group to slip on', !r.query('#wk-dsel').length);
    ['wc-1', 'wc-4'].forEach(id => { const cb = el(r, 'cb', id); cb.checked = true; cb.fire('change'); });
    ok('ticking brings it, counted', /🚫 Drop 2/.test(r.html()) && /✕ Remove 2/.test(r.html()));
    r.query('#wk-dsel')[0].fire('click');
    const m = r.last();
    ok('Drop takes the ticked ones out of the queue in one write',
        m.type === 'edit' && m.state === 'dropped' && m.ids.length === 2);
    ok('…and the selection is spent with it', !/🚫 Drop 2/.test(r.html()));
}
{
    const r = run();
    ['wc-1', 'wc-4'].forEach(id => { const cb = el(r, 'cb', id); cb.checked = true; cb.fire('change'); });
    r.query('#wk-rsel')[0].fire('click');
    const m = r.last();
    ok('Remove deletes the ticked ones, and nothing else',
        m.type === 'remove' && m.ids.length === 2 && m.ids.indexOf('wc-2') < 0);
}

// ====================================== no law, no compile — and it says why
{
    const withoutLaw = fixture.variants().find(v => v.id === 'nolaw');
    const r = page(withoutLaw.data);
    const h = r.html();
    ok('‼️ both compile buttons are dead when the wiki has no law of its own',
        /id="wk-csel"[^>]*disabled/.test(h) && /id="wk-call"[^>]*disabled/.test(h));
    ok('‼️ …and the reason is on the button, before the press',
        /-WIKI-ANAYASA-\.md\) is missing|law \(-WIKI-ANAYASA/.test(h));
    ok('the strip marks the missing files rather than listing them the same way',
        /⚠ -WIKI-ANAYASA-\.md/.test(h) && /⚠ log\.md/.test(h));
    ok('…and what IS there is not marked', />index\.md</.test(h));

    /**
     * ‼️ U-92 — AND IT IS NOT A DEAD END. The strip named the missing file
     * correctly and then left the reader to work out that the fix is in
     * Settings, or in Obsidian, or somewhere. Neither way out is invented on
     * this page: one is X-57's scaffold (which only ever CREATES — the law on
     * disk is never rewritten), the other is the Settings section that reads
     * the folder.
     */
    ok('a strip that says the wiki is broken offers the two ways out of it',
        /id="wk-vinit"/.test(h) && /id="wk-vsettings"/.test(h));
    r.query('#wk-vinit')[0].fire('click');
    ok('…“Start the wiki here” asks the host to write the missing files',
        r.last().type === 'wikiInit');
    r.query('#wk-vsettings')[0].fire('click');
    ok('…and the other opens Settings on the wiki root, naming it',
        r.last().type === 'openSettings' && r.last().focus === 'agentFarm.wikiRoot');
    ok('‼️ neither is offered once the wiki is sound — a fix with nothing to fix',
        !/id="wk-vinit"/.test(run().html()));
}

/**
 * ‼️ U-92 — WHAT THE FILTER OFFERS IS THE UNION, AND IT COUNTS.
 *
 * The list used to be the pool's topics alone: a category the user made in
 * Obsidian this morning was not offered until something had been marked under
 * it, which made this the one surface still disagreeing with the tagger. And
 * the state buttons said `Waiting` with no number, so the press was the only
 * way to find out how many — a click spent on a fact a label could have
 * carried.
 */
{
    const r = run();
    const h = r.html();
    ok('the topic filter offers a wiki folder nothing is marked under yet',
        /data-afms-opt="Felsefe"/.test(h) && /data-afms-opt="Mimari"/.test(h));
    ok('…and a topic the pool uses that has no folder of its own',
        /data-afms-opt="Wiki Derleme"/.test(h));
    ok('…once each, however the two lists spell it',
        (h.match(/data-afms-opt="Agent Farm"/g) || []).length === 1);
    ok('…with the waiting count on the row, which is the number you filter by',
        /Wiki Derleme \(2\)/.test(h));
    ok('…and the pages on disk one hover away, not on the row',
        /9 page\(s\) on disk/.test(h) && !/9 page\(s\) on disk<\/span>/.test(h));
    ok('‼️ twenty-odd rows is what the wiki grows to, so the menu finds for itself',
        /data-afms-find="wk-topic"/.test(h));

    // ‼️ "whole session" over a 40-turn conversation and over a 3-turn one are
    // the same three words and completely different amounts of work.
    ok('the source hover spells the scope out — how long, and what is skipped',
        /Whole session \(turns 1–14\) · except 13, 14 — 12 turn\(s\) to read/.test(h));

    ok('the state buttons carry their own counts', /All 9/.test(h)
        && /⏳ Waiting 6/.test(h) && /✅ Compiled 2/.test(h) && /🚫 Dropped 1/.test(h));
    ok('…and the waiting hover breaks that number down',
        /1 with a run already out/.test(h) && /1 whose last run produced nothing/.test(h));
}

// ======================================================== filters and search
{
    const r = run();
    // The state segment is a single choice, and "All" brings the dropped back.
    el(r, 'state', 'all').fire('click');
    ok('All shows the dropped mark too', /bunu bir daha/.test(r.html()));
    el(r, 'state', 'dropped').fire('click');
    const h = r.html();
    ok('…and Dropped shows only it', /bunu bir daha/.test(h) && !/bir derleme koşusu/.test(h));
}
{
    const r = run();
    const q = r.query('#wk-q')[0];
    q.value = 'kota'; q.fire('input');
    const h = r.html();
    ok('the search reaches a word that is only in a TOPIC', /spare oturum/.test(h));
    ok('…and drops what does not carry it', !/bir derleme koşusu/.test(h));
}
{
    const r = run();
    const q = r.query('#wk-q')[0];
    // ‼️ The shared grammar, not a substring: two words that are not adjacent.
    q.value = 'derleme koşusu'; q.fire('input');
    ok('‼️ the box speaks the farm\'s query language, not `includes`',
        /bir derleme koşusu/.test(r.html()));
    q.value = '-derleme'; q.fire('input');
    ok('…including exclusion', !/bir derleme koşusu/.test(r.html()));
}
{
    const r = run();
    const chip = r.query('[data-only]').find(e => e.dataset.only === 'Wiki Derleme');
    chip.fire('click');
    const h = r.html();
    ok('pressing a topic chip narrows to that topic', /bir derleme koşusu/.test(h));
    ok('…and drops the marks that do not carry it', !/spare oturum/.test(h));
}

// ======================================================= amending a mark
{
    const r = run();
    el(r, 'act', 'drop').fire('click');
    const m = r.last();
    ok('🚫 takes a mark out of the queue through the pool\'s own act',
        m.type === 'edit' && m.state === 'dropped' && m.id === 'wc-1');
}
{
    const r = run();
    r.query('[data-act]').filter(e => e.dataset.act === 'remove')[0].fire('click');
    const m = r.last();
    ok('✕ deletes the mark and says which', m.type === 'remove' && m.ids[0] === 'wc-1');
}
/**
 * ‼️ U-92 — ✎ OPENS A PICKER, NOT A COMMA-SEPARATED BOX.
 *
 * The one surface whose whole job is fixing a mark was the one still asking the
 * reader to spell the taxonomy from memory — which is precisely what U-90 built
 * a picker to stop. It is the same `AFCombo`, in a row of its own under the mark
 * (three fields do not fit in a 180px cell), and while it is open it also edits
 * the note and X-58's excluded turns.
 */
{
    const r = run();
    el(r, 'act', 'topics').fire('click');
    const h = r.html();
    ok('✎ opens an editor row under the mark, not a box in the cell',
        /wk-erow/.test(h) && !/wk-tedit/.test(h));
    ok('…the topics are the U-90 picker, prefilled with what the mark carries',
        /wk-cat-in/.test(h) && /afc-chip/.test(h)
        && h.indexOf('Agent Farm') > 0 && h.indexOf('Wiki Derleme') > 0);
    ok('…and the note is editable in the same place', /id="wk-enote"/.test(h));

    // Pressing the box asks to see everything (U-90 item 4) — the list is not
    // down until then, because it is drawn over what is under it.
    r.query('[data-afc-box]')[0].fire('mousedown');
    const open = r.html();
    ok('…the list it offers is the wiki\'s own folders too, not only the pool\'s topics',
        open.indexOf('data-afc-pick="Felsefe"') > 0 && open.indexOf('data-afc-pick="Mimari"') > 0);

    // Take one off, add another, save.
    r.query('[data-afc-off]')[0].fire('mousedown');
    r.query('[data-afc-box]')[0].fire('mousedown');
    r.query('[data-afc-pick]').filter(e => e.dataset.afcPick === 'Felsefe')[0].fire('mousedown');
    r.query('#wk-esave')[0].fire('click');
    const m = r.last();
    ok('Save sends the picked list, the note and the exclusions in one edit',
        m.type === 'edit' && m.id === 'wc-1'
        && m.topics.indexOf('Felsefe') >= 0 && m.topics.indexOf('Agent Farm') < 0
        && m.note !== undefined && Array.isArray(m.excludeTurns));
}
{
    const r = run();
    el(r, 'act', 'topics').fire('click');
    const before = r.posted.length;
    r.query('[data-afc-off]').forEach(b => b.fire('mousedown'));
    r.query('#wk-esave')[0].fire('click');
    ok('‼️ a mark is never left with no topic — an emptied picker sends nothing',
        r.posted.length === before);
    ok('…and the editor says why rather than closing on a write that would bounce',
        /at least one topic/.test(r.html()));
}
/** X-58 in the editor: the whole-session mark can drop turns from its scope. */
{
    const r = run();
    r.query('[data-act]').filter(e => e.dataset.act === 'topics' && e.dataset.id === 'wc-6')[0]
        .fire('click');
    const h = r.html();
    ok('a mark that spans turns offers them as something to leave out',
        /data-ex="1"/.test(h) && /data-ex="14"/.test(h));
    ok('…the ones already excluded are struck through, not merely unlit',
        /class="wk-tn cut" data-ex="13"/.test(h) || /wk-tn cut" data-ex="13"/.test(h));
    r.query('[data-ex]').filter(e => e.dataset.ex === '2')[0].fire('click');
    r.query('#wk-esave')[0].fire('click');
    const m = r.last();
    ok('…and a press adds it to what the compile is told to skip',
        m.type === 'edit' && m.excludeTurns.join(',') === '2,13,14');
}

// =========================================== paths are the host\'s to resolve
{
    const r = run();
    r.query('[data-open]').find(e => e.dataset.open === 'rules').fire('click');
    const m = r.last();
    ok('‼️ the strip names WHICH wiki file, never a path',
        m.type === 'openWikiFile' && m.which === 'rules' && !('path' in m));
}
{
    const r = run();
    const page = r.query('[data-page]')[0];
    page.fire('click');
    const m = r.last();
    ok('a compiled row\'s breadcrumb opens the page it wrote, with the mark that claims it',
        m.type === 'openPage' && m.id === 'wc-3' && /LLM_Wiki\.md$/.test(m.page));
}
{
    const r = run();
    r.query('[data-session]')[0].fire('click');
    const m = r.last();
    ok('the source cell opens the conversation the mark came from',
        m.type === 'openSession' && m.id === 'ff54aa29-1c02-4f38-9a71-0c4e9b2d6a11');
}

// ================================================================ the lint
{
    const r = run();
    r.query('#wk-lint')[0].fire('click');
    ok('🩺 asks for the shape check', r.last().type === 'lint');
    r.send({
        type: 'lint',
        data: {
            root: 'D:\\00_WIKI', orphans: ['Sistem/Yalnız_Sayfa.md'],
            broken: [{ from: 'Sistem/LLM_Wiki.md', to: 'Yok_Böyle_Bir_Sayfa' }],
            unindexed: [], misplaced: []
        }
    });
    const h = r.html();
    ok('…and the findings are drawn where they can be read twice',
        /Shape check/.test(h) && /Yalnız_Sayfa/.test(h) && /Yok_Böyle_Bir_Sayfa/.test(h));
    ok('‼️ …stated as a report, never as a repair', /reported, never repaired/.test(h));
    r.query('#wk-lclose')[0].fire('click');
    ok('and it closes', !/Shape check/.test(r.html()));
}

// =========================================================== the empty pool
{
    const empty = fixture.variants().find(v => v.id === 'empty');
    const r = page(empty.data);
    const h = r.html();
    ok('‼️ an empty pool says where a mark COMES FROM, not just that there is none',
        /pool is empty/.test(h) && /badge/.test(h) && /Add to Wiki Candidates/.test(h));
    ok('…and nothing can be compiled', /id="wk-call"[^>]*disabled/.test(h));
}

/**
 * ============================================ U-117 — A DROPPED FILE IS NOT A
 * SESSION, AND THE PAGE MUST NOT DRAW IT AS ONE.
 *
 * X-139 made `_RAW_` a pool that fills itself, which put rows in this table
 * that never happened in a CLI: no engine, no agent, no turns, and — the whole
 * point — no topic, because a scan will not guess what a conversation was
 * about. The failures worth pinning are the ones where the row would look
 * ordinary and be lying:
 *
 *   * eight characters of `raw:notes.md` is `raw:note`, which identifies
 *     nothing. The file's own name is the only handle the reader has;
 *   * a mark with no topic has no page to be written to and `startCompileRun`
 *     refuses it BY NAME — so a tick box over it is a box whose only outcome is
 *     a warning toast, and it must not be counted in "all pending" either;
 *   * a file has no turns, so the editor's exclusion strip has nothing to draw.
 *     Leaving the line out would say nothing about scope at all;
 *   * and the note stops being "why it was worth keeping" and becomes the one
 *     way to tell the compiling agent which part of the file matters (X-140).
 */
{
    const r = run();
    const h = r.html();

    ok('‼️ a dropped file shows its NAME, not eight characters of a key',
        /claude-web-kota-mimarisi\.md/.test(h) && !/raw:clau</.test(h));
    ok('…badged as what it is, and CLI rows are badged too so the pair is scannable',
        /wk-rawbadge[^>]*>RAW</.test(h) && /💬/.test(h) && /📄/.test(h));
    ok('…and a file a compile has already archived says DONE, off its own path',
        /wk-rawbadge done[^>]*>DONE</.test(h));

    ok('‼️ a mark with no topic reads as its own stage, not as `waiting`',
        /🌱 needs a topic/.test(h));
    ok('…and the empty topics cell is the door to fixing it, not a dash',
        /pick a category…/.test(h));
    // ‼️ U-121 — TICKING IT AND COMPILING IT ARE TWO DIFFERENT QUESTIONS. The
    // row IS tickable (it can be dropped or removed with four others); what it
    // is never in is a compile — the button's own count leaves it out, and the
    // State and Topics cells both say why in words.
    ok('‼️ …is tickable like any row, but no compile button counts it',
        !!el(r, 'cb', 'wc-7') && !/Compile All Pending \(5\)/.test(h)
        && /Compile All Pending \(4\)/.test(h));

    // ‼️ THE SAME ROW, ONE CATEGORY LATER. wc-8 is a dropped file too, and it is
    // an ordinary compilable mark — so the distinction the page draws is
    // "filed / not filed", never "a file / a session".
    ok('…while a dropped file that HAS been filed is compilable like any other',
        /gemini-obsidian-vault-tasarimi\.md/.test(h));

    ok('the row hover says where the file is and that it is not a CLI run',
        /_RAW_\\claude-web-kota-mimarisi\.md/.test(h)
        && /not run in a CLI on this machine/.test(h));
    ok('‼️ …and never claims a turn range it does not have',
        /External file — the compile reads all of it/.test(h)
        && !/Whole session \(turns 1–0\)/.test(h));

    // Pressing the seed opens the same editor the ✎ does — it is not a second
    // act, it is the row's own empty cell made pressable.
    const seed = r.query('[data-act]').filter(e => e.dataset.act === 'topics' && e.dataset.id === 'wc-7')[0];
    seed.fire('click');
    const e = r.html();
    ok('‼️ pressing 🌱 opens the picker on that row', /wk-cat-in/.test(e));
    ok('‼️ …with the turn strip REPLACED, not omitted — it says all of it is read',
        /External file — the compile reads the whole of it/.test(e) && !/data-ex="1"/.test(e));
    ok('‼️ …and the note relabelled as what it now is: the agent\'s directive',
        />directive</.test(e) && /what the agent should take from this file/.test(e));

    // The source filter. It is not a fourth state button: a dropped file crosses
    // every state, so it is a toggle of its own.
    const t = run();
    t.query('[data-state]').filter(x => x.dataset.state === 'all')[0].fire('click');
    t.query('#wk-raw')[0].fire('click');
    const f = t.html();
    ok('the 📄 Files toggle narrows the table to the drop box alone',
        /claude-web-kota-mimarisi/.test(f) && !/wiki\.compile neden sadece brief/.test(f));
    ok('…and it says how many of them still need a topic before you press it',
        /still need a topic/.test(f));
    ok('‼️ …and only the filed one is offered to the filtered compile',
        /Compile these 1/.test(f));
}

/**
 * ============================== U-121 — THE TOOLBAR, THE MASTER BOX, AND THE
 * WAY BACK.
 *
 * Three things that all came from the same mistake: the tick box was the
 * COMPILE's box rather than a selection box.
 *
 *   * so it only existed on a waiting row, which left the `dropped` and
 *     `compiled` tabs with no way to act on more than one row at a time and no
 *     way at all to bring five dropped marks back;
 *   * so the master box was drawn unchecked on every repaint and every click
 *     read as "turn on" — ticking everything worked and untticking it was
 *     impossible, which is the one gesture that box exists for;
 *   * and the buttons that count the selection sat in the PAGE header, two
 *     strips away from the ticks that change their numbers.
 */
{
    const r = run();
    const h = r.html();

    ok('‼️ the table\'s buttons are under the filters, not in the page header',
        h.indexOf('wk-tbar') > h.indexOf('wk-bar')
        && h.indexOf('wk-tbar') < h.indexOf('wktable')
        && h.indexOf('id="wk-csel"') > h.indexOf('wk-tbar'));
    ok('…and the page header keeps what a header is for', /Wiki<\/h1>/.test(h) && /writer: developer/.test(h));

    // ‼️ EVERY TAB CAN BE SELECTED FROM. The dropped row and the compiled rows
    // are exactly the ones that had no box and therefore no bulk act. (A dropped
    // mark is history, so the DEFAULT view leaves it out — the press below is
    // what a reader does to go looking for one.)
    r.query('[data-state]').filter(e => e.dataset.state === 'all')[0].fire('click');
    ok('‼️ a dropped row has a tick box', !!el(r, 'cb', 'wc-5'));
    ok('‼️ …and so does a compiled one', !!el(r, 'cb', 'wc-3'));
    ok('…while the one with a live run out for it still has none', !el(r, 'cb', 'wc-2'));

    // The master box, pressed twice. This is the whole item.
    const all = () => r.query('#wk-all')[0];
    ok('the master box starts empty and undetermined',
        all().checked === false && all().indeterminate === false);
    all().checked = true; all().fire('change');
    const on = r.html();
    ok('one press selects every selectable row shown', /✕ Remove 8/.test(on));
    ok('‼️ …and the box now DRAWS as checked, which is what makes the next press work',
        all().checked === true && all().indeterminate === false);
    all().checked = false; all().fire('change');
    ok('‼️ …so the second press clears the selection (deselect-all)',
        !/✕ Remove/.test(r.html()));

    // A partial selection is neither, and the box says so rather than lying
    // in one direction.
    const one = r.query('[data-cb]').filter(e => e.dataset.cb === 'wc-1')[0];
    one.checked = true; one.fire('change');
    ok('‼️ a partial selection draws as indeterminate',
        all().indeterminate === true && all().checked === false);

    // ‼️ AND THE COUNTS DO NOT AGREE, WHICH IS THE POINT. A selection of a
    // dropped row and a waiting one compiles ONE of them, and every button says
    // its own number rather than one of them quietly taking the other's rows.
    const drop = r.query('[data-cb]').filter(e => e.dataset.cb === 'wc-5')[0];
    drop.checked = true; drop.fire('change');
    const mixed = r.html();
    ok('‼️ each act counts only the rows IT can take',
        /Compile Selected \(1\)/.test(mixed) && /🚫 Drop 1/.test(mixed)
        && /↺ Reopen 1/.test(mixed) && /✕ Remove 2/.test(mixed));
    ok('…and the compile button says out loud what it is leaving out',
        /cannot be compiled/.test(mixed));

    // The way back, in one press.
    r.query('#wk-osel')[0].fire('click');
    const sent = r.posted.filter(m => m.type === 'edit' && m.state === 'pending');
    ok('‼️ Reopen sends ONE edit for the closed rows only',
        sent.length === 1 && sent[0].ids.length === 1 && sent[0].ids[0] === 'wc-5');
    ok('…and never drags the waiting row in with them',
        sent[0].ids.indexOf('wc-1') < 0);
}

// ============================================= U-83 — reaching it at all
//
// The cockpit was one click from the Toolbox and nowhere else: a page about the
// whole farm's knowledge, filed behind the page about Claude's extension model.
// It is a global destination now, between Studio (what is being made) and
// Toolbox (what it is made of) — and, like every other one, absent from its own
// page and never drawn twice on one toolbar.
{
    const fs = require('fs');
    const nav = fs.readFileSync(path.join(__dirname, '..', 'media', 'pageHeader.js'), 'utf8');
    ok('the Wiki is in the global nav', /id: 'wiki', label: '📚 Wiki'/.test(nav));
    ok('…between Studio and Toolbox',
        nav.indexOf("id: 'studio'") < nav.indexOf("id: 'wiki'")
        && nav.indexOf("id: 'wiki'") < nav.indexOf("id: 'toolbox'"));
    ok('…and carries the sentence every destination owes its reader (U-68)',
        /id: 'wiki', label: '📚 Wiki',\s*\n\s*tip: '/.test(nav));
    ok('…so no page lists it as a `related` one as well',
        !/nav: 'wiki'/.test(fs.readFileSync(path.join(__dirname, '..', 'media', 'toolbox.js'), 'utf8')));
    ok('the page itself is skipped on its own toolbar (page id matches the nav id)',
        /page: 'wiki'/.test(fs.readFileSync(path.join(__dirname, '..', 'media', 'wiki.js'), 'utf8')));
    ok('…and the shell already knows where to send it',
        /wiki: 'agentfarm\.openWiki'/.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'panels', 'base.ts'), 'utf8')));
}

console.log(`\ntest_wiki_page: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
