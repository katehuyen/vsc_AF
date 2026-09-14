/**
 * Guard: THE STRIP ABOVE THE COMPOSER IS ON THE COMPOSER'S RULER.
 *
 * Found in audit B-03.1, on scene 3. The "/" picker hangs off `.tawrap` — it
 * is `left:0; right:0` there, by design, because a typeahead has to sit over
 * the caret it serves. What it covers on its way up is the "still working"
 * strip, and that strip was drawn on a ruler of its own: `padding:5px 4px 0`
 * against the composer's `1px` border plus `8px`, so its right-aligned meta
 * line ended at 1344 where every row of the composer ended at 1339.
 *
 * Five pixels. Nobody would find that by looking at the strip. With the picker
 * open they are the only part of the covered line still on the screen, and what
 * they draw is the tail of a letter floating beside the panel with nothing
 * around it — measured on dist/render/console.s3.png, where `gpt 5.6 terra ·
 * low` ended at 1344 and the panel at 1339.
 *
 * The rule is the column, not the number: every row the composer draws and
 * every row the strip draws share one left edge and one right edge. Written
 * that way it also catches the next block somebody stacks in there.
 *
 *   node test/test_console_column_ruler.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

const CANDIDATES = [
    process.env.AF_CHROME,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
];

// The picker's own contract, which is what makes the ruler matter. If it ever
// stops hanging off `.tawrap`, this whole test is about the wrong box.
{
    const css = fs.readFileSync(path.join(ROOT, 'media', 'common.css'), 'utf8');
    ok('the "/" picker still spans its box edge to edge (left:0; right:0)',
        /\.af-slbox \{[^}]*left:\s*0;\s*right:\s*0/.test(css));
    const src = fs.readFileSync(path.join(ROOT, 'media', 'console.js'), 'utf8');
    ok('…and it is still the composer\'s textarea wrapper it hangs off',
        /<div class="tawrap">[\s\S]{0,400}<div id="c-slashpop">/.test(src));
    // U-135 — the two halves of the repair, each of which fails differently:
    // without the first the value draws over its neighbour, without the second
    // it keeps its lane by cutting a percentage in half.
    ok('a value on the composer row shares its box with whatever stands beside it',
        /\.crow \.axisw > select \{[^}]*flex:\s*0 1 auto/.test(src));
    ok('…and the pending-swap arrow is added to the box, not taken out of the value',
        /\.crow \.axisw\.pend:has\(#c-account-live\) \{[^}]*flex-basis:\s*\d+px/.test(src));
}

if (!CANDIDATES.some(p => p && fs.existsSync(p))) {
    console.log('  (no Chrome or Edge on this machine — the measured half is skipped)');
} else {
    const node = (args) => execFileSync(process.execPath, args,
        { cwd: ROOT, encoding: 'utf8', timeout: 240000, stdio: ['ignore', 'pipe', 'pipe'] });
    node([path.join('test', 'render_page.js'), 'console']);

    // Every row drawn inside the composer, and every row drawn inside the strip
    // above it, reported as `left..right`. An empty block draws nothing and is
    // not a row.
    const expr = `(()=>{const out=[];`
        + `document.querySelectorAll('.cmain').forEach((m,i)=>{`
        + `const rows=[];`
        + `const add=(el,where)=>{if(!el)return;[...el.children].forEach(k=>{`
        + `const b=k.getBoundingClientRect();if(b.height<=0||b.width<=0)return;`
        + `rows.push(where+':'+(k.className||k.id||k.tagName)+' '+Math.round(b.left)+'..'+Math.round(b.right));});};`
        + `add(m.querySelector('#c-composer'),'composer');`
        + `add(m.querySelector('.working'),'working');`
        + `if(rows.length)out.push({i,rows});});return out;})()`;
    const raw = node([path.join('test', 'measure_page.js'), 'console', expr]);
    let panels = [];
    try { panels = JSON.parse(raw.slice(raw.indexOf('['))); } catch { panels = []; }

    ok(`the page answered with composers to measure (${panels.length})`, panels.length > 0);

    const edgesOf = (row) => {
        const e = row.slice(row.lastIndexOf(' ') + 1).split('..');
        return { l: Number(e[0]), r: Number(e[1]) };
    };
    // The composer's own rows are full-width blocks, so they ARE the ruler.
    const wide = [], outside = [];
    let counted = 0;
    for (const p of panels) {
        const own = p.rows.filter(r => r.startsWith('composer:'));
        if (!own.length) { continue; }
        const col = edgesOf(own[0]);
        own.slice(1).forEach(r => {
            const e = edgesOf(r);
            if (e.l !== col.l || e.r !== col.r) { wide.push(`panel ${p.i}: ${r} — the column is ${col.l}..${col.r}`); }
        });
        // …and nothing in the column is drawn past it. `wmeta` legitimately
        // starts partway across — it is a right-aligned total — so what is
        // judged here is containment, not equality.
        p.rows.forEach(r => {
            counted++;
            const e = edgesOf(r);
            if (e.l < col.l || e.r > col.r) { outside.push(`panel ${p.i}: ${r} — the column is ${col.l}..${col.r}`); }
        });
    }
    ok('the composer\'s own rows are one ruler'
        + (wide.length ? '\n      ' + wide.slice(0, 6).join('\n      ') : ''),
        wide.length === 0);
    ok(`‼️ NOTHING IN THE COMPOSER COLUMN IS DRAWN OUTSIDE IT (${counted} rows)`
        + (outside.length ? '\n      ' + outside.slice(0, 8).join('\n      ') : ''),
        outside.length === 0);

    /**
     * ‼️ U-135 — AND A BOX ON THAT ROW DOES NOT DRAW OVER THE ONE BESIDE IT.
     *
     * The ruler above judges the composer's ROWS; this judges the controls
     * inside one of them, and the defect it was written for was invisible to
     * both a string test and the rows. `.crow .axisw` is the box that carries
     * the declared width and the `<select>` inside it asks for 100% of it — so
     * the moment X-213 drew a mark in FRONT of the value, the select went on
     * asking for the whole box and the glyph pushed it out the other side.
     * Measured on scene 11 before the repair: wrapper 635..767, select
     * 647..779, the next control starting at 773 — the account lay 6px over its
     * neighbour, in the yellow that means a swap is pending, which is exactly
     * what the user saw and called a broken box.
     *
     * The rule is the containment, not the arrow: any badge, dot or count a
     * later change puts beside one of these selects is held by the same
     * measurement. And the pending box is NAMED, because a guard that runs on a
     * page where no mark is drawn proves nothing at all.
     */
    const AXIS = `(()=>{const out=[];let pend=0;`
        + `document.querySelectorAll('.crow .axisw').forEach(w=>{`
        + `const s=w.querySelector('select');if(!s)return;`
        + `const a=s.getBoundingClientRect(),b=w.getBoundingClientRect();`
        + `if(a.width<=0||b.width<=0)return;`
        + `if(w.classList.contains('pend'))pend++;`
        + `const over=Math.round(Math.max(a.right-b.right,b.left-a.left));`
        + `if(over>0)out.push((s.id||'?')+' over by '+over+'px — box '`
        + `+Math.round(b.left)+'..'+Math.round(b.right)+', value '`
        + `+Math.round(a.left)+'..'+Math.round(a.right));});`
        + `return {pend,out:[...new Set(out)]};})()`;
    let axis;
    try { axis = JSON.parse(node([path.join('test', 'measure_page.js'), 'console', AXIS])); } catch { axis = null; }
    ok('a box with a mark beside its value was on the page to measure',
        axis && axis.pend > 0);
    ok('‼️ EVERY VALUE ON THE COMPOSER ROW IS DRAWN INSIDE THE BOX IT WAS GIVEN'
        + (axis && axis.out.length ? '\n      ' + axis.out.slice(0, 8).join('\n      ') : ''),
        axis && axis.out.length === 0);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) { process.exitCode = 1; }
