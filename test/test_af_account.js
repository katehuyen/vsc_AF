// X-263 — A SIGN-IN PICKER SAYS HOW MUCH OF THE PLAN IS LEFT (media/afAccount.js).
//
// ‼️ WHAT WAS MEASURED, AND IT IS NOT "ONE PICKER FORGOT A FIGURE".
//
// Five surfaces draw the same `<option>` for the same account, and every one of
// them had HAND-COPIED the same body:
//
//   media/console.js:3660   the composer's account box
//   media/console.js:3803   the live session's account box
//   media/missions.js:849   the member's delegation account
//   media/tasksPage.js:2156 the workflow step's account
//   media/tasksPage.js:2647 the task form's account
//
// Two of them (the Console's) had grown the five-hour figure; the other three
// had not — so the SAME account read `murvietnam-2 •` on the Tasks form and
// `murvietnam-2 • 42% used` in the Console, and the reader had to open a third
// page to find out which run would hit the wall. Writing the figure into three
// more places is what produces a sixth copy; the fix is that an account is
// DRAWN IN ONE PLACE, and this file is the place.
//
// ‼️ AND -1 IS NOT 0% (X-256's rule, restated here because a picker is exactly
// where it gets broken). "Nobody has read this account's window" and "this
// account has none of its window used" are OPPOSITE facts. An unread account
// draws an em dash, never a zero, and never an empty space that reads as good
// news.
//
// The last test is the one that actually holds the line: it reads the five page
// sources and fails if ANY of them hand-writes the body again.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const A = require(path.join(ROOT, 'media', 'afAccount.js'));
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

// ---------- the sentinels live once ----------
{
    ok('the machine sentinel is the one the host and the core share',
        A.MACHINE === '@machine');
    ok('…and what a picker calls it is one string too',
        A.MACHINE_ROW === '💻 Machine Global');
}

// ---------- the figure: a read percentage, or an em dash ----------
{
    ok('a measured window is the percentage', A.figure({ percent: 42 }) === '42%');
    ok('‼️ a REAL zero is a zero — nothing used is a fact worth printing',
        A.figure({ percent: 0 }) === '0%');
    ok('‼️ -1 is NOT 0% — an unread account draws the em dash',
        A.figure({ percent: -1 }) === '—');
    ok('…and so does an account the host said nothing about at all',
        A.figure({}) === '—');
    ok('…and a full window still prints', A.figure({ percent: 100 }) === '100%');
}

// ---------- the label: SHORTHAND, the shortest unambiguous form ----------
{
    ok('a healthy unread slot is its name and the em dash',
        A.label({ label: 'work', health: 'ready' }) === 'work · —');
    ok('a measured slot carries the figure beside the name',
        A.label({ label: 'work', health: 'ready', percent: 42 }) === 'work · 42%');
    ok('the standing choice keeps its trailing dot, after the figure',
        A.label({ label: 'work', health: 'ready', percent: 42, active: true })
        === 'work · 42% •');
    ok('a fallen sign-in still leads with the warning sign',
        A.label({ label: 'work', health: 'stale', percent: 42 }) === '⚠ work · 42%');
    ok('…and a fallen sign-in that is also the standing choice says both',
        A.label({ label: 'work', health: 'stale', active: true })
        === '⚠ work · — •');
}

// ---------- when the window turns over ----------
{
    const now = Date.UTC(2026, 8, 7, 10, 0, 0);
    ok('an account with no reset time says nothing about one',
        A.turns({ percent: 10 }, now) === '');
    const soon = A.turns({ percent: 10, resetsAt: now + 40 * 60000 }, now);
    ok('under an hour it is counted in minutes (got ' + soon + ')',
        /window turns over at .+ \(in 40m\)/.test(soon));
    const later = A.turns({ percent: 10, resetsAt: now + 3 * 3600000 }, now);
    ok('over an hour it is counted in hours (got ' + later + ')',
        /window turns over at .+ \(in 3h\)/.test(later));
    // ‼️ THIS RULE WAS NAILED DOWN THE WRONG WAY UP — audit B-04.1. It used to
    // require "(in 0m)" for a reset already past, on the reasoning that zero is
    // better than a negative. It is: both are wrong, and "in 0m" is the one that
    // reads as true. `resetsAt` comes off a READING, so an account nobody has
    // run on for hours carries a turnover that has been and gone — and two
    // cards in one picture then said 02:17 and 05:40, both "(in 0m)"
    // (dist/render/enginespanel.s2.png). Reversed, not deleted.
    const past = A.turns({ percent: 91, resetsAt: now - 3 * 3600000 }, now);
    ok('‼️ A TURNOVER THAT HAS BEEN AND GONE IS NOT DRESSED AS ONE ABOUT TO HAPPEN (got ' + past + ')',
        !/\(in 0m\)/.test(past) && /turned over at/.test(past));
    ok('…and it says the figure beside it belongs to the window before',
        /read before that/.test(past));
    ok('a turnover seconds away is still counted forwards, not backwards',
        /\(in 0m\)/.test(A.turns({ resetsAt: now + 5000 }, now)));
}

// ---------- the detail: MIRROR, the full sentence the narrow box cannot hold ----------
{
    // ‼️ audit B-04.3 — THE ROW CARRIES ITS WINDOW'S NAME NOW, and this line
    // used to prove the opposite: it handed `detail` a row with NO window and
    // asserted the words "five-hour window" came out anyway. That was the whole
    // defect — the panel naming the window instead of printing the one the
    // reading carried — pinned as if it were the rule. Inverted, not deleted.
    const d = A.detail({ label: 'work', health: 'ready', percent: 42,
        window: 'five-hour window', resetsAt: Date.now() + 3600000, active: true });
    ok('the detail names the figure in words', /42% of the five-hour window/.test(d));
    const wk = A.detail({ label: 'work', health: 'ready', percent: 72, window: 'Current week' });
    ok('‼️ …in the window the READING named, not one of its own',
        /72% of the current week used\./.test(wk) && !/five-hour|5-hour/.test(wk));
    ok('…says it is the standing choice', /standing choice/.test(d));
    ok('…and says when the window turns over', /turns over at/.test(d));

    const unread = A.detail({ label: 'work', health: 'ready', percent: -1 });
    ok('‼️ an unread account SAYS it is unread rather than drawing nothing',
        /nobody has read/i.test(unread));
    ok('…and never claims a percentage it does not have',
        unread.indexOf('%') < 0);

    const down = A.detail({ label: 'work', health: 'stale', percent: 10 });
    ok('a fallen sign-in says what has to happen to it',
        /capture it again|signing in again/i.test(down));
    ok('the host may override that sentence with its own',
        /the token expired/.test(A.detail({ health: 'stale', next: 'the token expired' })));
}

// ---------- the row, and the options built out of it ----------
{
    const r = A.row({ id: 'sl-1', label: 'work', health: 'ready', percent: 42 });
    ok('a row is id, label and detail — what every picker on every page needs',
        r.id === 'sl-1' && r.label === 'work · 42%' && typeof r.detail === 'string');

    // The pages build their `<option>`s with AFCharts; the component is handed
    // it rather than reaching for a global, so this runs in Node like the rest.
    const C = {
        option: (v, l, o) => '<option value="' + v + '"'
            + (o && o.selected ? ' selected' : '')
            + ' title="' + (o && o.detail ? o.detail.split('\n')[0] : '') + '">' + l + '</option>'
    };
    const html = A.options([
        { id: 'sl-1', label: 'work', health: 'ready', percent: 42 },
        { id: 'sl-2', label: 'spare', health: 'ready', percent: -1 }
    ], 'sl-2', C);
    ok('every account gets a row', (html.match(/<option/g) || []).length === 2);
    ok('…and the selected one is marked', /value="sl-2" selected/.test(html));
    ok('…and the unread one still draws its em dash in the list',
        /spare · —/.test(html));
    ok('an empty list is an empty string, so a box with no referent is not drawn',
        A.options([], '', C) === '');
}

// ---------- ‼️ THE LIVE WIRE: nobody draws an account by hand any more ----------
{
    // The exact body that was copied five times. If it comes back on any page,
    // that page has started answering "which sign-in" on its own again.
    const HAND_WRITTEN = /health === 'ready' \? '' : '⚠ '/;
    const pages = ['media/console.js', 'media/missions.js', 'media/tasksPage.js'];
    pages.forEach(function (p) {
        ok('‼️ ' + p + ' draws an account through the component, not by hand',
            !HAND_WRITTEN.test(read(p)));
    });
    pages.forEach(function (p) {
        ok(p + ' really asks the component', /AFAccount\./.test(read(p)));
    });
    // The sixth copy: the Engines page owned the "turns over" sentence.
    ok('‼️ the Engines page asks the component when the window turns over',
        /AFAccount\.turns/.test(read('media/engines.js')));
    // …and the sentinels, which were typed into three files.
    ok('the machine sentinel is not re-declared on a page',
        (read('media/tasksPage.js').match(/MACHINE_ACCOUNT = '@machine'/g) || []).length === 0
        || /AFAccount\.MACHINE/.test(read('media/tasksPage.js')));
}

// ---------- ‼️ AND THE FIGURE REALLY REACHES THE PAGES ----------
{
    // Measured in X-263: `accountsFor` sent `percent`, but the three pickers
    // that lacked the figure read `engineAccountMatrix`, which sent NO figure at
    // all. A component that formats a percentage nobody hands it draws an em
    // dash on every row for ever — green tests, blind page. So the host's two
    // readers are pinned to carry it.
    const ext = read('src/extension.ts');
    const figure = ext.indexOf('const accountFigure');
    const figureBody = ext.slice(figure, ext.indexOf('\n    };', figure));
    ok('‼️ ONE reader turns a slot into a figure', figure > 0);
    ok('…it carries the five-hour percentage', /percent/.test(figureBody));
    ok('…and when the window turns over', /resetsAt/.test(figureBody));
    ok('…and -1 / 0 are what it says when nothing has been read',
        /percent >= 0 \? u\.percent : -1/.test(figureBody));

    // ‼️ The invariant is not "each reader mentions resetsAt" — it is that
    // NEITHER of them computes the figure itself. Two readers deciding
    // separately what -1 means is exactly the drift X-263 closes.
    const at = ext.indexOf('const engineAccountMatrix');
    const body = ext.slice(at, ext.indexOf('\n    };', at));
    ok('‼️ engineAccountMatrix takes the figure from that one reader',
        /accountFigure\(/.test(body));
    ok('…out of the SAME snapshot the Engines page reads, never a second reader',
        /accountUsage\.current\(\)/.test(body));

    const af = ext.indexOf('accountsFor: (engine: string)');
    const afBody = ext.slice(af, ext.indexOf('\n        },', af));
    ok('‼️ …and so does accountsFor, so the two cannot disagree about a slot',
        /accountFigure\(/.test(afBody));
}

// ---------- the component ships ----------
{
    ok('‼️ afAccount.js is loaded by the shell, or every page above is blank',
        /'media',\s*'afAccount\.js'/.test(read('src/panels/base.ts')));
    ok('…and the webview tests stand it up too',
        /'afAccount\.js'/.test(read('test/lib_shared_media.js')));
}

console.log((fail ? 'FAIL' : 'ok') + ' — test_af_account.js: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
