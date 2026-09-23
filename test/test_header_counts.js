// The two live numbers in every page header — 🔔 unread notices and 📥 queue
// items that need you.
//
// They reach a page inside window.__AFUI__, which the HTML shell writes ONCE.
// A data refresh does not rebuild that HTML, so the badges used to freeze at
// the value the page was BUILT with: deleting 16 unread notices left the page
// saying "0 unread" in its own subtitle while the tab strip above it still read
// "🔔 Notices (16)" — and every other open page kept the stale number too.
//
// The fix is a push, so this walks the whole path: the badge is always in the
// DOM (empty at zero, or there would be nothing to repaint), the host registers
// every page and pushes on change, and an arriving push updates both the badges
// and __AFUI__ (so the NEXT render agrees with what you can already see).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const read = p => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

// ---------- a page with the shared header in it ----------
// Only what pageHeader.js touches: a window (for __AFUI__ + the message
// listener) and a document whose [data-afcount] lookup answers with the badges
// of the html most recently rendered — the way a browser would.
let rendered = '';
const badges = () => {
    const out = [];
    const re = /data-afcount="(\w+)">([^<]*)</g;
    let m;
    while ((m = re.exec(rendered))) {
        out.push({ dataset: { afcount: m[1] }, textContent: m[2] });
    }
    return out;
};
let live = [];   // the badge elements of the CURRENT render
const sandbox = {
    window: {},
    document: {
        querySelectorAll: sel => (sel === '[data-afcount]' ? live : []),
        addEventListener: () => { }
    }
};
let onMessage;
sandbox.window.addEventListener = (ev, fn) => { if (ev === 'message') { onMessage = fn; } };
sandbox.window.window = sandbox.window;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
// U-68 put every nav button's full name in a rich panel, so the component the
// panels come from has to be here too — the header degrades to a bare button
// without it, which is exactly the state that must not pass unnoticed.
vm.runInContext(read('media/afTipEdge.js'), sandbox);
vm.runInContext(read('media/afTip.js'), sandbox);
vm.runInContext(read('media/pageHeader.js'), sandbox);
const AFHeader = sandbox.window.AFHeader;

/** Render (tab strip + toolbar) the way a page does, and re-read the DOM. */
const renderPage = (page = 'notices') => {
    rendered = AFHeader.tabs(page) + AFHeader.html({ page, title: 'x' });
    live = badges();
    return rendered;
};
const badgeText = id => (live.find(b => b.dataset.afcount === id) || {}).textContent;
const push = afui => onMessage({ data: { type: 'afui', afui } });

// ---------- the badge is always there, even at zero ----------
{
    sandbox.window.__AFUI__ = { notices: { unread: 0 }, queue: { blocked: 0 } };
    const html = renderPage('notices');
    ok('the 🔔 tab badge exists at zero', /class="af-tab-n" data-afcount="notices"><\/span>/.test(html));
    ok('the 📥 tab badge exists at zero', /class="af-tab-n" data-afcount="queue"><\/span>/.test(html));
    ok('…and shows nothing', badgeText('notices') === '' && badgeText('queue') === '');
    ok('a zero count adds no stray parens anywhere', !/\(0\)/.test(html));
    // The nav badge belongs to the OTHER pages' 🔔 button (the page itself is
    // dropped from its own nav), so render from a page that has one.
    const q = renderPage('queue');
    ok('the nav 🔔 badge exists at zero', /class="af-nav-n" data-afcount="notices"><\/span>/.test(q));
}

// ---------- counts render, in both places ----------
{
    sandbox.window.__AFUI__ = { notices: { unread: 16 }, queue: { blocked: 3 } };
    const html = renderPage('queue');
    ok('the tab strip counts unread notices', /🔔 Notices<span class="af-tab-n" data-afcount="notices"> \(16\)</.test(html));
    ok('the tab strip counts what needs you', /📥 Queue<span class="af-tab-n" data-afcount="queue"> \(3\)</.test(html));
    ok('the nav button carries the unread count', /🔔 Notices<span class="af-nav-n" data-afcount="notices"> \(16\)</.test(html));
    ok('the queue count never leaks into the nav', (html.match(/data-afcount="queue"/g) || []).length === 1);
}

// ---------- a push repaints, without a re-render ----------
{
    sandbox.window.__AFUI__ = { notices: { unread: 16 }, queue: { blocked: 3 } };
    renderPage('queue');
    push({ notices: { unread: 0 }, queue: { blocked: 1 } });
    ok('deleting the 16 unread empties the 🔔 badge on the spot', badgeText('notices') === '');
    ok('…and the 📥 badge follows the same push', badgeText('queue') === ' (1)');
    ok('the page itself was NOT re-rendered', /\(16\)/.test(rendered));
    ok('__AFUI__ was updated too, so the next render agrees',
        sandbox.window.__AFUI__.notices.unread === 0 && sandbox.window.__AFUI__.queue.blocked === 1);
    ok('the next render shows the pushed values', !/\(16\)/.test(renderPage('queue')));

    // ‼️ The push carries counts only — it must not wipe the rest of the shell
    // config (the speaker-label template lives in the same object).
    sandbox.window.__AFUI__ = { speaker: { template: '{ai}' }, notices: { unread: 2 }, queue: { blocked: 0 } };
    renderPage('queue');
    push({ notices: { unread: 5 }, queue: { blocked: 0 } });
    ok('a count push leaves the speaker config alone',
        sandbox.window.__AFUI__.speaker && sandbox.window.__AFUI__.speaker.template === '{ai}');

    // Anything else on the wire is somebody else's message.
    onMessage({ data: { type: 'data', data: {} } });
    ok('a data message does not touch the badges', badgeText('notices') === ' (5)');
    onMessage({ data: null });
    ok('a junk message is survivable', badgeText('notices') === ' (5)');
}

// ---------- N-6: the A2A pair rides the same push, in grey, on its own tabs ----------
{
    sandbox.window.__AFUI__ = { notices: { unread: 1 }, queue: { blocked: 0 }, a2a: { notes: 3, tasks: 0 } };
    const html = renderPage('a2anotes');
    ok('the strip has four tabs and a separator between the pairs',
        (html.match(/class="af-tab /g) || []).length === 4 && /af-tab-sep/.test(html));
    ok('the A2A badges are grey and exist at zero too',
        /class="af-tab-n af-tab-grey" data-afcount="a2anotes"> \(3\)</.test(html)
        && /class="af-tab-n af-tab-grey" data-afcount="a2atasks"><\/span>/.test(html));
    ok('…and never reach the nav row (the bell\'s surface)', !/af-nav-n" data-afcount="a2a/.test(html));
    push({ notices: { unread: 1 }, queue: { blocked: 0 }, a2a: { notes: 0, tasks: 7 } });
    ok('a push repaints both grey badges in place', badgeText('a2anotes') === '' && badgeText('a2atasks') === ' (7)');
    ok('a push without the pair keeps the last known figures rather than throwing',
        (push({ notices: { unread: 1 }, queue: { blocked: 0 } }), badgeText('a2atasks') === ' (7)'));
}

// ---------- a claimed nav button still names a destination ----------
{
    sandbox.window.__AFUI__ = { notices: { unread: 4 }, queue: { blocked: 0 } };
    const html = AFHeader.html({
        page: 'queue', title: 'x',
        navActions: { notices: { label: 'Post a notice' } }
    });
    ok('the claimed button keeps its count', /data-afcount="notices"> \(4\)<\/span> ▾/.test(html));
    ok('…and its menu item stays a plain destination', /<button data-afnav="notices">Open Notices<\/button>/.test(html));
}

// ---------- U-68: every button in this row says its own full name ----------
//
// This row is on every page and it was the one control with no hovers at all:
// a dozen destinations, most of them a single word, and nothing anywhere saying
// what any of them opened. It also ran out of width and wrapped onto a second
// line, so a toolbar moved under the pointer. Both halves are the same fix —
// the ones that are identical on every page are drawn as their ICON, and the
// name they no longer show is the first line of the panel (SHORTHAND + MIRROR).
{
    const rx = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    sandbox.window.__AFUI__ = { notices: { unread: 0 }, queue: { blocked: 0 } };
    const html = AFHeader.html({ page: 'dashboard', title: 'x', guide: 'dash' });

    const buttons = (html.match(/<button /g) || []).length;
    const panels = (html.match(/class="af-tipw af-tipw-nav"/g) || []).length;
    ok('‼️ every button in the global row carries a rich hover, and there are a dozen of them',
        buttons > 12 && panels === buttons);
    ok('…whose FIRST line is the destination\'s full name',
        /aria-label="Search">⌕<\/button><span class="af-tip"><span class="af-tiph">Search<\/span>/.test(html));
    ok('…and whose body says what that page is for',
        /<span class="af-tiph">Toolbox<\/span><span class="af-tipb">Everything that extends/.test(html));

    const ICONS = [['Evals', '🧪'], ['Search', '⌕'], ['Engines', '🔌'], ['Settings', '⚙'],
    ['Refresh', '⟳'], ['Guide', '?']];
    for (const [name, icon] of ICONS) {
        ok(`${name} is its icon alone, at icon width, and still named for a screen reader`,
            new RegExp(`class="secondary af-ico[^"]*"[^>]*aria-label="${name}"[^>]*>${rx(icon)}</button>`).test(html));
    }
    ok('‼️ …and it is exactly those — shortening the rest is a decision, not a drift',
        (html.match(/class="secondary af-ico/g) || []).length === ICONS.length);
    ok('nothing in the row is left with a paragraph in a native title (that is what the panel is for)',
        !/<button[^>]*title="[^"]{60,}"/.test(html));

    // A page that claims a nav button still owes the same three things.
    const claimed = AFHeader.html({
        page: 'queue', title: 'x',
        navActions: { console: { label: 'Talk to this agent', title: 'Opens a card for it.' } }
    });
    ok('a claimed button keeps its own name on the panel\'s first line',
        /data-afclaim="console"[\s\S]{0,120}<span class="af-tiph">Console<\/span>/.test(claimed));
    ok('…and the panel says what the menu under it will offer',
        /A menu: “Talk to this agent”, or Console itself\./.test(claimed));
}

// ---------- the host half of the contract ----------
{
    const base = read('src/panels/base.ts');
    const ext = read('src/extension.ts');
    ok('every page built by the shell is registered as live', /livePages\.add\(webview\)/.test(base));
    ok('the shell seeds the counts from the same source it pushes',
        /\.\.\.headerCounts\(\)/.test(base));
    ok('the push reaches every live page', /for \(const w of \[\.\.\.livePages\]\)/.test(base));
    ok('…carrying the agreed message shape', /postMessage\(\{ type: 'afui', afui \}\)/.test(base));
    ok('a page that is gone is dropped, not retried forever', /livePages\.delete\(w\)/.test(base));
    ok('the counts are pushed from wherever the bell is repainted',
        /noticesBar\.show\(\);[\s\S]{0,400}?pushHeaderCounts\(\);/.test(ext));
    ok('…which is the one function every notice/queue change already calls',
        /const updateNoticesBadge = \(\) => \{[\s\S]*?pushHeaderCounts\(\);/.test(ext));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
