// U-81 — what a Live Timeline session card says when you point at it.
//
// ‼️ WHY THIS FILE EXISTS. The cards had ONE rich panel and it was drawn
// translucent: it lived inside `.card .sub`, which was dimmed with `opacity`,
// and opacity is applied to the whole SUBTREE after it is painted — so the
// panel was painted at 70% however loudly it declared its own background, and
// the page's text read straight through its words. Two rounds of fixing the
// BACKGROUND changed nothing, because the background was never the cause. That
// is the class of bug a string test cannot see and a picture can, so the rule
// is pinned here and the picture is taken with `render_page.js --tip`.
//
// The rest of the card was the other half of the report: four lines carried no
// hover at all and three carried a native `title` holding an explanation (which
// belongs on a heading, never on a cell) or the words the card had just drawn.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));
const fixture = require(path.join(__dirname, 'fixtures', 'timeline.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const r = runPage(fixture.script, fixture.data(), fixture.window || {});
const html = r.html();
/** Just the session cards — the swim lanes have panels of their own (U-67). */
const cards = html.slice(html.indexOf('<h2>Live sessions'));

// ---- the transparency, as a RULE and not as one page's patch --------------
{
    const css = fs.readFileSync(path.join(ROOT, 'media', 'common.css'), 'utf8');
    ok('`.card .sub` still dims with opacity — which is what makes the rule necessary',
        /\.card \.sub \{[^}]*opacity/.test(css));
    ok('‼️ a block that hosts a panel is exempted from it', /\.card \.tip-host/.test(css));
    ok('…and the dimming is kept, as a COLOUR', /\.tip-host[^{]*\{[^}]*opacity: 1;[^}]*color:/.test(css));
    ok('…including where `.muted` would have dimmed it', /\.tip-host\.muted/.test(css));

    // Every panel on a card sits in a block that is exempt. Checked by walking
    // the markup rather than by trusting the page: this is the one mistake that
    // is invisible in every other test.
    const blocks = cards.match(/<div class="sub[^"]*"[^>]*>[\s\S]*?(?=<div class="(?:sub|btnrow)|<\/div>)/g) || [];
    const withPanel = blocks.filter(b => b.indexOf('af-tipw') >= 0);
    ok('the card has panelled blocks to check at all', withPanel.length >= 4);
    ok('‼️ EVERY block that carries a panel carries `tip-host`',
        withPanel.every(b => /<div class="sub[^"]*\btip-host\b/.test(b)));
}

// ---- every element on the card answers, and answers once ------------------
{
    ok('the name carries a panel', /<span class="af-tipw">\s*<span class="slink"/.test(cards));
    ok('the id chip carries its own', /<span class="af-tipw"><span class="sid">/.test(cards));
    ok('…and the id chip is what says the full id',
        /class="sid"[\s\S]{0,900}Full id: 407c78cb-2f1a-4d55-9e10-1b2c3d4e5f60/.test(cards));
    ok('the status badge answers what the shorthand means',
        cards.indexOf('the turn is finished and it is waiting on you') >= 0);
    ok('…and whether there is anything to interrupt',
        cards.indexOf('Can be interrupted:') >= 0);
    ok('the money line answers with figures, not an explanation',
        cards.indexOf('Cost per turn:') >= 0 && cards.indexOf('Weight ratio:') >= 0
        && cards.indexOf('Context now:') >= 0);
    ok('the work line answers', cards.indexOf('Tools per prompt:') >= 0);
    ok('the time line carries UTC, like every other clock in the extension',
        /Started: [\s\S]{0,80}UTC/.test(cards));
    ok('…and says which offset this machine rendered it in',
        cards.indexOf('on this machine') >= 0);
    ok('the pid says what a headless entrypoint means',
        cards.indexOf('headless — no terminal, nobody at the keyboard') >= 0);
    ok('the folder is a panel, because a path is text and the card cuts it',
        /class="pathlink"[\s\S]{0,400}Click reveals it in the OS file manager/.test(cards));
    ok('every button says what pressing it does',
        cards.indexOf('Stop the running turn, keep the session') >= 0
        && cards.indexOf('Take it off this page — card and swim lane, in every range') >= 0);
}

// ---- ONE SUBJECT ----------------------------------------------------------
{
    // The engine badge used to repeat the session id, which is the id chip's
    // whole subject two elements to its left.
    const badges = cards.match(/title="Engine:[^"]*"/g) || [];
    ok('the engine badge exists', badges.length > 0);
    ok('‼️ …and no longer repeats the session id — that is the chip\'s subject',
        badges.every(b => b.indexOf('Session:') < 0));
    ok('…it answers what the ENGINE decides instead',
        badges.some(b => b.indexOf('Cost reported:') >= 0 && b.indexOf('Transcript:') >= 0));
}

// ---- the two prompt panels, which used to hand back the cut line ----------
{
    const s = fixture.sessions()[0];

    // ‼️ THE WHOLE REASON AN AFTip IS USED HERE IS THAT NOTHING HAS TO BE CUT:
    // it takes any length and it scrolls. Both panels used to carry the same
    // 80/90-character string the card had already drawn, so hovering a clipped
    // line gave back the clipped line. (Neither text contains a character `esc`
    // touches, so the raw tail is what lands in the markup.)
    ok('the opening prompt is carried WHOLE, not as the name it was cut to',
        cards.indexOf(s.firstPrompt.slice(-60)) >= 0);
    ok('the last prompt is carried WHOLE, not as its 90-character row',
        cards.indexOf(s.lastPromptFull.slice(-60)) >= 0);
    ok('…and each panel says how long the text it holds is',
        /Opening prompt · [\d.,]+ characters/.test(cards)
        && /The last thing asked · [\d.,]+ characters/.test(cards));

    // ONE SUBJECT: how the conversation opened is the line ABOVE's fact, and
    // that line's own panel now carries it whole. The last-prompt panel used to
    // repeat it under a `How it opened` head — the same text twice on one card.
    ok('‼️ the last-prompt panel does not repeat how the conversation opened',
        cards.indexOf('How it opened') < 0);

    // Two facts, drawn identically one under the other, read as one paragraph
    // broken in half — which is what the reader reported.
    ok('the name line and the prompt line are told apart on the card',
        cards.indexOf('sub tip-host card-open') >= 0
        && cards.indexOf('sub tip-host card-said') >= 0
        && cards.indexOf('said-mark') >= 0);
}

// ---- the layout the narrow card needs -------------------------------------
{
    // `tip-block` measures the panel against the block it sits in. That is right
    // for a wide table row and wrong for a 260px card: it produced a panel
    // narrower than any other panel in the extension, which is half of what was
    // reported. Anchored to its trigger the panel is its own width again.
    ok('‼️ no card panel uses `tip-block` — a card is not a row',
        cards.indexOf('tip-block') < 0);
    // A thing you press must say so, or the panel stands under the hand
    // reaching for it (U-74).
    ok('the name says it can be pressed', cards.indexOf('class="slink" data-aftipact') >= 0);
    ok('…and so does the folder', cards.indexOf('class="pathlink" data-aftipact') >= 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
