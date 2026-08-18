// U-40 — the Plan usage card's engine strip, and the Notices toolbar's one
// picker (X-28). Two different pages, one lesson: a CONTROL HANDLE IS A NAME.
//
// Both defects were reported the same way — "it looks like somebody broke the
// layout" — and both had the same cause: a handle carrying the thing the handle
// is FOR. The plan card's tabs carried each engine's percentage and, where an
// engine has none, a two-word explanation of why; on a 340px card that pushed
// the fourth tab onto a line of its own. The Notices toolbar's "File under…"
// picker is a `<select>`, so it was sized by the user's longest project name and
// grew every time a longer one was declared.
//
// The figures and the explanations are not gone in either case — they moved to
// the hover and to the body, which have room. What is pinned here is that they
// cannot come back into the handle.
const fs = require('fs');
const path = require('path');

const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const fixture = f => require(path.join(__dirname, 'fixtures', f + '.js'));
const media = f => fs.readFileSync(path.resolve(__dirname, '..', 'media', f), 'utf8');

// ---------- the plan card's engine tabs ----------
{
    const fx = fixture('planusage');
    const html = runPage(fx.script, fx.data()).html();
    const tabs = html.match(/<button class="pu-tab[^>]*>[^<]*<\/button>/g) || [];
    ok('one tab per engine', tabs.length === 5);

    // ‼️ THE HANDLE IS A NAME. Nothing else.
    const handleText = tabs.map(t => t.replace(/<[^>]*>/g, '').trim());
    ok('‼️ a handle is the engine\'s name and nothing else',
        handleText.join(',') === 'Claude,Codex,Gemini,Antigravity,OpenCode');
    ok('‼️ …no percentage in a tab handle',
        !handleText.some(t => /%/.test(t)));
    ok('‼️ …and no explanation in one either (this is what "per-token" was doing)',
        !handleText.some(t => /per-token|not published|n\/a|—/.test(t)));

    // The figure did not vanish — it is `Label: value` in the hover, which is
    // what a native tooltip is for (docs/CONVENTIONS.md → Hover).
    ok('the figure moved to the hover rather than being dropped',
        /title="Claude Code: 86%/.test(html) && /title="Gemini: per-token/.test(html));
    // …and every engine's figure is readable at once WITHOUT switching, which is
    // the thing the status bar's hover got right and this card did not.
    ok('‼️ …and the engines you are NOT on are readable without switching',
        /class="sub muted pu-others"/.test(html)
        && /Codex <b>7%/.test(html) && /Antigravity <b>not published/.test(html));

    // The colour comes from the ONE palette (AFEngine.cls → --af-engc), never
    // from a copy of the four values in this page's own stylesheet.
    ok('‼️ a tab wears the engine\'s own colour, out of the shared palette',
        /class="pu-tab af-engc claude on"/.test(html) && /af-engc agy/.test(html));
    const dash = media('dashboard.js');
    ok('…and this page declares no engine hue of its own',
        !/charts-orange|charts-purple/.test(dash.slice(dash.indexOf('.pu-tabs'), dash.indexOf('.pu-tabs') + 1200)));

    // ‼️ ONE ROW, AS A RULE. The strip used to wrap, which is how the fourth
    // engine ended up under the other three and read as a layout fault.
    ok('‼️ the strip cannot wrap — a handle too long ellipsises instead',
        /\.pu-tabs \{[^}]*flex-wrap:nowrap/.test(dash)
        && /\.pu-tab \{[^}]*text-overflow:ellipsis/.test(dash));

    // ‼️ …AND THE PRESS IS ANSWERED NOW. The reported symptom was "you press it
    // and nothing happens, sometimes it changes": the click posted to the host,
    // the host wrote a global setting to disk, and any repaint in between (this
    // page repaints on every index update) put the old tab back.
    ok('‼️ a tab flips locally first, then tells the host',
        /DATA\.planUsageEngine = want;\s*\n\s*render\(\);\s*\n\s*vscode\.postMessage/.test(dash));

    // The other two variants must not look like an engine at 0%.
    const agyHtml = runPage(fx.script, fx.variants().find(v => v.id === 'planusage-agy').data).html();
    const agyCard = agyHtml.slice(agyHtml.indexOf('class="card pucard"'),
        agyHtml.indexOf('class="card pucard"') + 3000);
    ok('an engine nobody can measure is never drawn at 0%',
        !/pu-bar/.test(agyCard) && /Antigravity publishes no quota/.test(agyCard));
}

// ---------- the Notices toolbar's "File under…" ----------
{
    const fx = fixture('notices');
    const html = runPage(fx.script, fx.data()).html();
    const nt = media('notices.js');

    // ‼️ WHERE IT SITS. Between the two buttons it belongs with, not parked in
    // a bulk group of its own halfway along the row.
    const at = s => html.indexOf(s);
    ok('‼️ it sits between Needs You and Export MD',
        at('data-hact="needs"') > 0 && at('data-hact="export"') > 0
        && at('nt-bulkproj') > at('data-hact="needs"')
        && at('nt-bulkproj') < at('data-hact="export"'));
    // …and it is no longer in a bulk group of its own, which is what made it
    // read as a fourth kind of control rather than one more action.
    ok('…in the actions group, not a strip of its own',
        (html.match(/class="nt-grp nt-bulk"/g) || []).length === 1);

    // ‼️ A FIXED WIDTH, AT THE BUTTONS' OWN SIZE. 169px is the MEASURED width of
    // the two buttons it sits between plus their gap (test/measure_page.js).
    ok('‼️ it is capped at two buttons and cannot grow with a project name',
        /\.nt-fileunder \{[^}]*width:169px/.test(nt) && /\.nt-fileunder \{[^}]*max-width:169px/.test(nt));
    ok('‼️ …and is drawn at the buttons\' own 12px, not a picker\'s default',
        /\.nt-fileunder \{[^}]*font-size:12px/.test(nt));

    // What no longer fits is in the rich panel, never in the layout — and the
    // panel says what the control IS, which is what the user could not find out.
    ok('the rich hover carries what it does and what it can file under',
        /class="af-tipw"/.test(html)
        && /Stamps the ticked notices with a project/.test(html)
        && /PRS\.MuratVural_DEV_VSC\.AgentFarm/.test(html));
    ok('…and it still offers the unfile row, which is the only bulk way back',
        /value="__clear__"/.test(html));

    // A farm with no projects declared must still be the same width and must
    // say what to do, rather than offering an empty list.
    const none = runPage(fx.script, fx.variants().find(v => v.id === 'noprojects').data).html();
    ok('with nothing declared it says where to declare one',
        /No projects declared yet/.test(none) && /nt-fileunder/.test(none));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
