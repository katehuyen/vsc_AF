/**
 * Guard: THE PROVIDER CHIP IS NEVER CUT — measured, not read.
 *
 * X-110 put a second mark in a column that had been sized for one, and the
 * first thing it did was draw `···` where `opencode` should have been: the
 * Turns page declares its Engine column at 6.0 shares, which is exactly a badge
 * and nothing else. Every string test in the repo passed on it — the markup was
 * correct, the label was present, and the AFTip carried the whole name on hover.
 * It is a LAYOUT defect, so only a layout measurement can hold it.
 *
 * The rule is written as a rule and not as "Turns is 10.2 now": a chip that
 * carries a provider's name and shows less than one character of it tells the
 * reader nothing, and a chip cut to an ellipsis tells them there is a provider
 * without saying which — which is worse than no chip at all, because it looks
 * like an answer.
 *
 * Two pages, because they are the two that put the chip inside a fixed-layout
 * table: the Console card sizes itself and is already held by
 * test_console_identity_width.js. Cost is two Chrome passes.
 *
 *   node test/test_provider_chip_width.js
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

// The structural half runs everywhere: a chip is only drawable if the cell it
// sits in lays two marks out as a row rather than stacking or clipping them.
{
    const sess = fs.readFileSync(path.join(ROOT, 'media', 'sessionsTable.js'), 'utf8');
    const turns = fs.readFileSync(path.join(ROOT, 'media', 'turns.js'), 'utf8');
    ok('‼️ the sessions Engine cell lays its two marks out as a row',
        /engine: r => `<td title="\$\{tipOf\(TIP\.engine\(r\)\)\}"><span class="cellline">/.test(sess)
        && /\.cellline \{[^}]*display:flex/.test(sess));
    const viewer = fs.readFileSync(path.join(ROOT, 'media', 'sessionViewer.js'), 'utf8');
    ok('…and every surface asks the component rather than drawing a provider itself',
        /window\.AFProvider\.chip\(/.test(sess) && /window\.AFProvider\.chip\(/.test(turns)
        && /window\.AFProvider\.chip\(I\)/.test(viewer));
    // X-110 (part 3) — the last three surfaces: a live card, a run row, a
    // delegation row. Each asks the component and each is fed by the host's
    // ONE reader, never by a field of its own.
    {
        const live = fs.readFileSync(path.join(ROOT, 'media', 'timeline.js'), 'utf8');
        const tasks = fs.readFileSync(path.join(ROOT, 'media', 'tasksPage.js'), 'utf8');
        const missions = fs.readFileSync(path.join(ROOT, 'media', 'missions.js'), 'utf8');
        ok('‼️ the Live card, the run row and the delegation row draw the shared chip beside the engine',
            /\$\{engineBadge\(s\)\}\$\{providerChip\(s\)\}<\/h3>/.test(live)
            && /reported'\)\)\}\$\{runProviderChip\(r\)\}<\/td>/.test(tasks)
            && /\$\{stepProv\(s\)\}\$\{stepProvider\(s\)\}/.test(missions)
            && /window\.AFProvider\.chip\(I\)/.test(live) && /window\.AFProvider\.chip\(I\)/.test(tasks)
            && /window\.AFProvider\.chip\(I\)/.test(missions));
        const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
        const tl = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'timeline.ts'), 'utf8');
        const tp = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'tasksPanel.ts'), 'utf8');
        ok('…and all three are fed by sessionIdentityOf, the reader the resume gate asks',
            /identityFor: \(sessionId: string\) => sessionIdentityOf\(sessionId\),\s*\n\s*\/\/ A live card may only claim/.test(ext)
            && /identityFor: \(sessionId: string\) => sessionIdentityOf\(sessionId\),\s*\n\s*cliProfiles:/.test(ext)
            && /const identity = stepSess \? sessionIdentityOf\(stepSess\.sessionId\) : undefined;/.test(ext)
            && /identity: deps\.identityFor\?\.\(s\.sessionId\) \?\? null,/.test(tl)
            && /return sid \? deps\.identityFor\?\.\(sid\) \?\? null : null;/.test(tp));
    }
    // ‼️ THE PAGE AND THE RESUME GATE READ ONE RECORD. A page with its own
    // reader could say "Kimi" over a run the gate then refuses to resume onto
    // Kimi — two true-looking answers about one session.
    {
        const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
        ok('‼️ the viewer and the resume gate ask the SAME reader',
            /const sessionIdentityOf = \(sessionId: string, engine\?: string\)/.test(ext)
            && /identityFor: \(sessionId: string\) => sessionIdentityOf\(sessionId\)/.test(ext)
            && /const ident = sessionIdentityOf\(sessionId, engine\)/.test(ext));
    }
    // ‼️ THE FIXTURES HAVE TO CONTAIN THE CASE. A page whose rows carry no
    // provider measures a column that was never asked to hold a chip, and every
    // assertion below would pass on a picture of the old layout.
    ok('‼️ both fixtures carry a routed row AND a changed-provider row, or this file '
        + 'measures nothing',
        /reportedProviderIds: \['kimi'\]/.test(fs.readFileSync(path.join(ROOT, 'test', 'fixtures', 'sessions.js'), 'utf8'))
        && /reportedProviderIds: \['anthropic', 'openai'\]/.test(fs.readFileSync(path.join(ROOT, 'test', 'fixtures', 'sessions.js'), 'utf8'))
        && /providerIds: \['opencode'\]/.test(fs.readFileSync(path.join(ROOT, 'test', 'fixtures', 'turns.js'), 'utf8'))
        && /providerIds: \['anthropic', 'openai'\]/.test(fs.readFileSync(path.join(ROOT, 'test', 'fixtures', 'turns.js'), 'utf8')));
}

if (!CANDIDATES.some(p => p && fs.existsSync(p))) {
    console.log('  (no Chrome or Edge on this machine — the measured half is skipped)');
} else {
    const node = (args) => execFileSync(process.execPath, args,
        { cwd: ROOT, encoding: 'utf8', timeout: 240000, stdio: ['ignore', 'pipe', 'pipe'] });

    // Every chip on the page, with what it would need against what it was given.
    const EXPR = "(()=>{const out=[];document.querySelectorAll('.af-prov').forEach(e=>{"
        + "const r=e.getBoundingClientRect();"
        + "out.push({t:(e.textContent||'').trim(),w:Math.round(r.width),sw:e.scrollWidth,"
        + "cut:e.scrollWidth>Math.ceil(r.width)+1});});return out;})()";

    // X-110 (part 3) — the live card, the run row and the delegation row join
    // the sweep. The mission fixture has ONE routed delegation, so the count
    // case is not asserted there — asserting it would be asserting a fixture.
    const ONE_CHIP = ['sessionviewer', 'missions'];
    for (const page of ['sessions', 'turns', 'sessionviewer', 'timeline', 'tasks', 'missions']) {
        node([path.join('test', 'render_page.js'), page]);
        let chips;
        try { chips = JSON.parse(node([path.join('test', 'measure_page.js'), page, EXPR])); }
        catch { chips = null; }
        ok(`${page}: the page was measured and answered`, Array.isArray(chips));
        ok(`${page}: there are provider chips on it — a table with none proves nothing`,
            Array.isArray(chips) && chips.length >= (ONE_CHIP.includes(page) ? 1 : 2));
        const cut = (chips || []).filter(c => c.cut);
        ok(`‼️ ${page}: NO PROVIDER CHIP IS CUT — a chip that says there is a route `
            + 'without saying which is worse than no chip at all'
            + (cut.length ? ' — ' + cut.map(c => `${c.t} ${c.w}/${c.sw}`).join(' · ') : ''),
            cut.length === 0);
        // …and the count chip, which is the widest text the mark ever carries,
        // is the one that fails first when a column is trimmed later. The
        // viewer draws ONE session and so has one chip: there is no count case
        // to hold there, and asserting one would be asserting a fixture.
        if (!ONE_CHIP.includes(page)) {
            const many = (chips || []).find(c => /providers$/.test(c.t));
            ok(`${page}: the "N providers" chip is whole — it is the widest case`,
                !!many && !many.cut);
        }
        // X-112 — the viewer's chip panel ends with the billing line the host
        // worded: the one sentence that says whether ⚖ is on the plan window.
        if (page === 'sessionviewer') {
            const BILL = "(()=>{const w=document.querySelector('.af-prov');const tip=w&&w.closest('.af-tipw');"
                + "const t=tip?tip.textContent:'';return {has:/Billing: Kimi \\(work\\)/.test(t),window:/NOT on the Claude plan window/.test(t)};})()";
            let bill;
            try { bill = JSON.parse(node([path.join('test', 'measure_page.js'), page, BILL])); } catch { bill = null; }
            ok('‼️ sessionviewer: the chip\'s panel says who is billed and that ⚖ is NOT on the plan window',
                !!bill && bill.has && bill.window);
        }
    }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
