/**
 * Guard: NO TEXT ON THE CONSOLE IS SQUEEZED TO NOTHING — measured, not read.
 *
 * Found in audit B-03.1. The session list is a fixed 250px column on every
 * window (`.clist` is `flex: 0 0 250px`), and a card carrying engine + route +
 * tokens + 🔖 beside the agent name is the ordinary case rather than a
 * docked-narrow one. Measured on it:
 *
 *   .n  65px   .nm  0/54    .sid 53/53     → "(#019fe860)", and no name
 *   .n  29px   .nm  0/33    .sid 51/51     → "(#:"
 *
 * The name — the card's first fact — was not on the screen at all, and on the
 * tightest row the id K-13 calls "meaningless once an ellipsis reaches it" was
 * clipped too. Nothing in the suite could see it: the markup was correct, every
 * string was present, and the AFTip carried the whole name on hover. It is a
 * LAYOUT defect, so only a layout measurement can hold it.
 *
 * The rule is written as a rule rather than as a list of the two classes that
 * happened to break: an element that carries text and is cut by its own
 * overflow must still show some of it. At zero width there is not even an
 * ellipsis to tell the reader that something is missing.
 *
 * Scope is the Console because that is the surface this finding is on; a later
 * sweep that repairs another page adds it here. Cost is one Chrome pass.
 *
 *   node test/test_console_identity_width.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

const ROOT = path.resolve(__dirname, '..');

const CANDIDATES = [
    process.env.AF_CHROME,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
];

// The structural half runs everywhere: the badges are ONE group, so the line
// breaks between the identity and them rather than through them.
{
    const src = fs.readFileSync(path.join(ROOT, 'media', 'console.js'), 'utf8');
    ok('the card header can wrap at all', /\.srow \.h \{[^}]*flex-wrap:wrap/.test(src));
    ok('…and the badges beside the name are one group, not four loose children',
        /<span class="hb">/.test(src) && /\.srow \.hb \{/.test(src));
    ok('…and the identity has a floor, so the half that may be cut is not cut to nothing',
        /\.srow \.n \{[^}]*min-width:\s*\d/.test(src)
        && /\.srow \.n \.nm \{[^}]*min-width:/.test(src));
}

if (!CANDIDATES.some(p => p && fs.existsSync(p))) {
    console.log('  (no Chrome or Edge on this machine — the measured half is skipped)');
} else {
    const node = (args) => execFileSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', timeout: 240000, stdio: ['ignore', 'pipe', 'pipe'] });
    node([path.join('test', 'render_page.js'), 'console']);

    // Anything that carries its own text, is cut by its own overflow, and has
    // less than this much of itself on the screen. Eight pixels is under one
    // character at any size this page uses — below it there is nothing to read
    // and no ellipsis either.
    // ‼️ A CLOSED HOVER PANEL IS NOT ON THE SCREEN, BUT ITS TRIGGER IS. `AFTip`
    // keeps its head and body in the markup and collapses them until the
    // pointer arrives, so every shut panel reports zero width with content
    // behind it; judging those would be judging a picture nobody is looking at.
    // The exclusion is the PANEL (`.af-tip`), never the wrapper — skipping the
    // whole `.af-tipw` subtree would also skip the trigger, which is exactly
    // where this defect lived: the agent name is a trigger, and it was the
    // thing at zero width.
    const EXPR = "(()=>{const out=[];document.querySelectorAll('*').forEach(e=>{"
        + "if(e.children.length)return;const t=(e.textContent||'').trim();if(!t)return;"
        + "if(e.closest('.af-tip'))return;"
        + "const r=e.getBoundingClientRect();if(!r.height)return;"
        + "if(e.scrollWidth<=Math.ceil(r.width)+1)return;"
        + "if(r.width>=8)return;"
        + "out.push(e.tagName+'.'+String(e.className)+' '+Math.round(r.width)+'/'+e.scrollWidth+' :: '+t.slice(0,30));});"
        + "return [...new Set(out)];})()";
    const raw = node([path.join('test', 'measure_page.js'), 'console', EXPR]);
    let found;
    try { found = JSON.parse(raw); } catch { found = null; }

    ok('the page was measured and answered', Array.isArray(found));
    ok('‼️ NO TEXT ON THE CONSOLE IS DRAWN NARROWER THAN ONE CHARACTER OF ITSELF'
        + (found && found.length ? '\n      ' + found.join('\n      ') : ''),
        Array.isArray(found) && found.length === 0);

    // …and the instance this was written for, named: every session card shows
    // its whole agent name and its whole id.
    const CARDS = "(()=>{const out=[];document.querySelectorAll('.srow .n').forEach(e=>{"
        + "const nm=e.querySelector('.nm'),sid=e.querySelector('.sid');if(!nm)return;"
        + "const cut=[];const w=(x)=>Math.round(x.getBoundingClientRect().width);"
        + "if(w(nm)<nm.scrollWidth-1){cut.push('name '+w(nm)+'/'+nm.scrollWidth);}"
        + "if(sid&&w(sid)<sid.scrollWidth-1){cut.push('id '+w(sid)+'/'+sid.scrollWidth);}"
        + "if(cut.length){out.push((nm.textContent||'').trim()+': '+cut.join(' · '));}});"
        + "return {rows:document.querySelectorAll('.srow .n').length,cut:out};})()";
    let cards;
    try { cards = JSON.parse(node([path.join('test', 'measure_page.js'), 'console', CARDS])); } catch { cards = null; }
    ok('there are session cards to measure', cards && cards.rows > 3);
    ok('‼️ EVERY SESSION CARD SHOWS ITS WHOLE NAME AND ITS WHOLE ID'
        + (cards && cards.cut.length ? ' — ' + cards.cut.join(' · ') : '')
        + (cards ? ` (${cards.rows} rows)` : ''),
        cards && cards.cut.length === 0);

    /**
     * ‼️ S-58 — AND THE CARD'S ✕ IS IN THE CARD, IN ITS CORNER, COSTING NO ROW.
     *
     * `cardTip` wraps the button in an AFTip `<span class="af-tipw">`, and
     * `media/console.js:1270` says out loud that `cls` lands on the WRAPPER, so
     * every sizing rule has to move out to it. It did not: `position:absolute;
     * right:4px` stayed on the trigger, and the wrapper is `position:relative`
     * and 0px wide — so `right:4px` was measured against nothing and put the ✕
     * 7px OUTSIDE the card's left edge, behind the border, where no amount of
     * hovering could find it. And the wrapper, still in the flow as an
     * `inline-block`, contributed a line box: every card carried an empty row
     * above its own name.
     *
     * Both halves are geometry, both had perfectly correct markup, and no string
     * test could have failed on either. Two facts, because the two repairs are
     * independent — taking the positioning off the button without giving it to
     * the wrapper would fix the corner by dropping the button into the flow.
     */
    const CROSS = "(()=>{const out=[];document.querySelectorAll('.srow').forEach(row=>{"
        + "const w=row.querySelector('.srowxw'),b=row.querySelector('.srowx'),h=row.querySelector('.h');"
        + "if(!w||!b||!h)return;const rb=b.getBoundingClientRect(),rr=row.getBoundingClientRect(),"
        + "rh=h.getBoundingClientRect();out.push({pos:getComputedStyle(w).position,"
        + "inside:rb.left>=rr.left&&rb.right<=rr.right+1,"
        + "gap:Math.round(rr.right-rb.right),headTop:Math.round(rh.top-rr.top)});});return out;})()";
    let x;
    try { x = JSON.parse(node([path.join('test', 'measure_page.js'), 'console', CROSS])); } catch { x = null; }
    ok('there are cards with an End & remove button to measure', x && x.length > 3);
    ok('‼️ THE ✕ IS INSIDE ITS CARD, AT THE RIGHT EDGE'
        + (x ? ' (' + JSON.stringify(x[0]) + ')' : ''),
        x && x.length > 0 && x.every(r => r.inside && r.gap >= 0 && r.gap <= 12));
    // ‼️ …AND IT COSTS THE CARD NO ROW. The identity line starts at the card's
    // own padding (7px + 1px border); anything more is the wrapper's line box
    // back in the flow, which is the empty row the user saw on every card.
    ok('‼️ …AND THE NAME IS STILL THE FIRST THING IN THE CARD'
        + (x ? ' (headTop ' + [...new Set(x.map(r => r.headTop))].join('/') + ')' : ''),
        x && x.length > 0 && x.every(r => r.pos === 'absolute' && r.headTop <= 10));

    /**
     * ‼️ …AND ON THE COMPOSER ROW, NOTHING IS PAINTED OVER ITS NEIGHBOUR.
     *
     * Reported live by the user, with a session running: as the panel narrows,
     * the agent name and the engine badge under the conversation box climb on
     * top of each other. The name's wrapper was shrinkable and the text inside
     * it is not clipped, so the row did not get narrower — it got stacked.
     * Measured on the live row of this fixture before the repair:
     *
     *   900px   "developer" [309-357] over the Codex badge [347-384]   10px
     *   760px   ... 23px        640px   ... 35px
     *
     * 900px is an ordinary panel, not a corner case. The rule held here is the
     * one the user stated: the FACTS on the row (the agent it opened in, the
     * engine it runs on) keep their size and their place, and what gives way is
     * the boxes beside them. Every string is present and every markup test
     * passes while this happens — only a layout measurement can hold it.
     *
     * The row is narrowed by its HOST, because what the reader drags is the
     * panel; the widths are the ones the defect was measured at.
     */
    const OVER = "(function(){var rows=[].slice.call(document.querySelectorAll('.crow'))"
        + ".filter(function(r){return r.querySelector('.fixw');});"
        + "if(!rows.length){return 'no live row on the page';}"
        + "var row=rows[0],host=row.parentElement,out=[];"
        + "[1030,900,760,640].forEach(function(w){host.style.width=w+'px';row.getBoundingClientRect();"
        + "var leaves=[].slice.call(row.querySelectorAll('*')).filter(function(e){"
        + "if(e.closest('.af-tip')){return false;}"
        + "var r=e.getBoundingClientRect();if(r.width<=0||r.height<=0){return false;}"
        + "var c=e.tagName==='SELECT'||e.tagName==='BUTTON'||e.tagName==='INPUT';"
        + "if(!c&&(e.children.length||!(e.textContent||'').trim())){return false;}return true;})"
        + ".map(function(e){var r=e.getBoundingClientRect();"
        + "return {who:e.tagName.toLowerCase()+(e.id?('#'+e.id):('.'+String(e.className||'').split(' ')[0])),"
        + "x1:Math.round(r.left),x2:Math.round(r.right),y:Math.round(r.top),"
        + "txt:(e.textContent||'').trim().slice(0,16)};});"
        + "var hits=[];for(var i=0;i<leaves.length;i++){for(var j=i+1;j<leaves.length;j++){"
        + "var a=leaves[i],b=leaves[j];if(Math.abs(a.y-b.y)>14){continue;}"
        + "var ov=Math.min(a.x2,b.x2)-Math.max(a.x1,b.x1);"
        + "if(ov>1){hits.push(w+'px: '+a.who+' \"'+a.txt+'\" over '+b.who+' \"'+b.txt+'\" by '+ov+'px');}}}"
        + "out.push({at:w,hits:hits});});host.style.width='';return out;})()";
    let over;
    try { over = JSON.parse(node([path.join('test', 'measure_page.js'), 'console', OVER])); }
    catch { over = null; }
    ok('the live composer row was found and laid out at four widths',
        Array.isArray(over) && over.length === 4);
    const stacked = (over || []).filter(r => r.hits.length);
    ok('‼️ NOTHING ON THE COMPOSER ROW IS PAINTED OVER ITS NEIGHBOUR'
        + (stacked.length ? '\n      ' + stacked.map(r => r.hits.join('\n      ')).join('\n      ') : ''),
        Array.isArray(over) && stacked.length === 0);
    // …and the reason it does not: the identity is the one thing on the row
    // that cannot be chosen, so it is the one thing that does not shrink.
    const FIXED = "(function(){var f=document.querySelector('.crow .fixw');"
        + "if(!f){return 'no identity chip on the row';}var cs=getComputedStyle(f);"
        + "var t=f.querySelector('.fixed');var ts=t?getComputedStyle(t):null;"
        + "return {shrink:cs.flexShrink,clip:ts?ts.textOverflow:'',cap:ts?ts.maxWidth:''};})()";
    let fx;
    try { fx = JSON.parse(node([path.join('test', 'measure_page.js'), 'console', FIXED])); }
    catch { fx = null; }
    ok('‼️ THE IDENTITY CHIP DOES NOT SHRINK, AND CLIPS RATHER THAN SPILLS'
        + (fx ? ' (' + JSON.stringify(fx) + ')' : ''),
        fx && fx.shrink === '0' && fx.clip === 'ellipsis' && /px$/.test(fx.cap || ''));
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) { process.exitCode = 1; }
