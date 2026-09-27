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
        && /Codex <b>7%/.test(html) && /Antigravity <b>36%/.test(html));

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

    // An engine whose figure has not arrived must not look like an engine at 0%.
    const unreadHtml = runPage(fx.script, fx.variants().find(v => v.id === 'planusage-agy-unread').data).html();
    const unreadCard = unreadHtml.slice(unreadHtml.indexOf('class="card pucard"'),
        unreadHtml.indexOf('class="card pucard"') + 3000);
    ok('an engine not read yet is never drawn at 0%',
        !/pu-bar/.test(unreadCard) && /agy -p \/usage/.test(unreadCard));
    ok('…and prints no "Checked" clock for a read that never happened (epoch 0 drew as 1970)',
        !/Checked /.test(unreadCard));
    // X-306 — and once its own /usage has been read, the card draws every
    // window of every pool: four bars, each naming its pool.
    const agyHtml = runPage(fx.script, fx.variants().find(v => v.id === 'planusage-agy').data).html();
    const agyCard = agyHtml.slice(agyHtml.indexOf('class="card pucard"'),
        agyHtml.indexOf('class="card pucard"') + 6000);
    ok('‼️ Antigravity\'s two pools × two windows are four bars, each naming its pool',
        (agyCard.match(/pu-bar/g) || []).length >= 4
        && /Gemini Models/.test(agyCard) && /Claude and GPT models/.test(agyCard));
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

// ---------- X-244: the sign-in picker on the plan card ----------
//
// The card named ONE owner (X-212) and that is the right answer to "whose
// figures are these". It is no answer to "and how are the others doing", which
// on a machine rotating between sign-ins is the question the card is opened
// for — and until this it was a page away.
{
    const fx = fixture('planusage');
    const run = () => runPage(fx.script, fx.data());
    const r = run();
    const html = r.html();

    ok('the head carries a picker once the engine holds more than one sign-in',
        /<select class="pu-acct pu-pick" id="pu-account"/.test(html));
    ok('…listing every sign-in of THAT engine and no other engine\'s',
        /<option value="claude-murvietnam"/.test(html)
        && /<option value="claude-kateanhkim"/.test(html)
        && /<option value="claude-aicozums"/.test(html)
        && !/<option value="codex-murposta"/.test(html));
    ok('…opening on the standing one, marked',
        /<option value="claude-murvietnam" selected/.test(html)
        && /murvietnam ★ · 86%/.test(html));
    // ‼️ SHORTHAND — the figure is what the choice is made on, so it is ON the
    // row; and an account nobody has read says so rather than reading as 0%.
    ok('‼️ AN UNREAD SIGN-IN IS "not read", NEVER 0%',
        /aicozums · not read/.test(html) && !/aicozums ★? ?· 0%/.test(html));
    // MIRROR — a control narrow enough to cut its own rows opens its tooltip
    // with the value it is currently on.
    ok('…and the control mirrors its current value on the first line of its tip',
        /title="Showing: the standing sign-in|title="Showing: murvietnam/.test(html));

    // ---- parked on another sign-in ----
    const picked = runPage(fx.script, fx.variants().find(v => v.id === 'planusage-picked').data);
    const sel = picked.query('#pu-account')[0];
    sel.value = 'claude-kateanhkim';
    sel.fire('change');
    const h2 = picked.html();
    ok('‼️ THE CARD DRAWS THE PICKED SIGN-IN\'S OWN BARS',
        /Current session<\/span><strong class="afq-pct hot">97%/.test(h2) && !/<strong[^>]*>86%/.test(h2));
    ok('U-154 — the percent, the reset time and the time left each wear their own class on the card',
        /<strong class="afq-pct[^"]*">\d+%/.test(h2) && /Resets <span class="afq-reset">[^<]+<\/span>/.test(h2));
    ok('…its plan and its own reading time', /pro plan/.test(h2) && !/max plan/.test(h2));
    // ‼️ The endpoint's beat belongs to the endpoint. A slot read off its own
    // record on the accounts beat must not carry "auto every 5 min", which
    // promises a refresh this card's ⟳ does not perform for it.
    ok('‼️ …AND NEVER THE ENDPOINT\'S BEAT, WHICH IS NOT WHAT MOVES IT',
        !/auto every 5 min/.test(h2) && /on the accounts beat/.test(h2));
    ok('…and the ⟳ says which account it would actually re-read',
        /Read the standing sign-in&#39;s limits|Read the standing sign-in's limits/.test(h2));
    // Nothing is switched by looking: a picker that wrote `activeAccounts`
    // would move every future session on a glance.
    ok('‼️ LOOKING AT A SIGN-IN NEVER STANDS IT UP — nothing is posted',
        !picked.posted.some(m => m && /account/i.test(String(m.type || ''))));

    // ---- one sign-in on the engine: the X-212 label, untouched ----
    //
    // ‼️ A `<select>` with a single row is a control that lies about what the
    // machine can do, so the engine with one sign-in keeps the plain label it
    // has had since X-212 — the whole of that behaviour, tip included.
    const codex = fx.variants().find(v => v.id === 'planusage-codex').data;
    const one = runPage(fx.script, { ...codex, planUsageAccount: 'murposta' }).html();
    ok('an engine with a single sign-in draws no picker at all', !/id="pu-account"/.test(one));
    ok('…and keeps the plain label, with the tip X-212 gave it',
        /<span class="pu-acct" title="Account: murposta/.test(one));
    // …and an engine that cannot hold a second sign-in draws nothing, which is
    // a third state and not an empty picker.
    const bare = runPage(fx.script, codex).html();
    ok('an engine that names no owner still draws nothing in the head',
        !/id="pu-account"/.test(bare) && !/class="pu-acct"/.test(bare));

    // ---- and the list reaches the page through the host, on every path ----
    const dash = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'panels', 'dashboard.ts'), 'utf8');
    ok('‼️ THE LIST RIDES EVERY PLAN-USAGE ANSWER, or the picker empties on a refresh',
        (dash.match(/planUsageAccounts\?\.\(\) \?\? \[\]/g) || []).length === 3);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
