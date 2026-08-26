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
        /4 waiting/.test(h) && /1 compiling/.test(h) && /1 compiled/.test(h) && /14 wiki page\(s\)/.test(h));
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

// ============================================= a run in flight is not a choice
{
    const r = run();
    const h = r.html();
    ok('a mark with a live run reads as compiling, not as waiting', /compiling/.test(h));
    ok('‼️ …and carries NO tick box — asking for it again files the concept twice',
        !el(r, 'cb', 'wc-2') && !!el(r, 'cb', 'wc-1'));
    // Two waiting marks, one of them claimed: the button must offer two.
    ok('‼️ "Compile All Pending" counts only what a run is NOT out for',
        /Compile All Pending \(3\)/.test(h));

    // Ticking everything selects the compilable rows and no others.
    const all = r.query('#wk-all')[0];
    all.checked = true; all.fire('change');
    ok('select-all takes every compilable row shown', /Compile Selected \(3\)/.test(r.html()));
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
{
    const r = run();
    const cb = el(r, 'cb', 'wc-1');
    cb.checked = true; cb.fire('change');
    r.query('#wk-csel')[0].fire('click');
    const m = r.last();
    ok('Compile Selected sends the ticked ids', m.type === 'compile' && m.ids.length === 1 && m.ids[0] === 'wc-1');
}
{
    const r = run();
    r.query('#wk-call')[0].fire('click');
    const m = r.last();
    // ‼️ NO IDS. `all:true` is resolved by the op at the moment it runs; a page
    // that sent a snapshot would compile a list that had already moved.
    ok('‼️ Compile All Pending sends no ids at all — the op resolves "all" itself',
        m.type === 'compile' && Array.isArray(m.ids) && m.ids.length === 0);
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
{
    const r = run();
    el(r, 'act', 'topics').fire('click');
    const box = r.query('.wk-tedit')[0];
    ok('✎ opens the row\'s topics in a box, prefilled', !!box && /Agent Farm, Wiki Derleme/.test(box.value));
    box.value = 'Agent Farm, Kota';
    box.fire('keydown', { key: 'Enter' });
    const m = r.last();
    ok('Enter sends the new list, split and trimmed',
        m.type === 'edit' && m.topics.length === 2 && m.topics[1] === 'Kota');
}
{
    const r = run();
    el(r, 'act', 'topics').fire('click');
    const box = r.query('.wk-tedit')[0];
    const before = r.posted.length;
    box.value = '   ,  ';
    box.fire('keydown', { key: 'Enter' });
    ok('‼️ a mark is never left with no topic — an emptied box sends nothing',
        r.posted.length === before);
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
