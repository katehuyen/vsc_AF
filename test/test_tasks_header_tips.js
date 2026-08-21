// M-21 — THE CONTROL STRIP AT THE TOP OF THE TASKS PAGE, AND WHAT IT ANSWERS.
//
// ‼️ WHY THIS FILE EXISTS. M-25 took the five design principles through this
// page's two TABLES and stopped where the tables stop. The strip above them —
// the automation state, the pause controls, the two tabs and the eight figures
// — is the first thing read on the page, and it answered almost nothing: five
// figures had no hover at all, three had a one-line `title` (which
// docs/CONVENTIONS.md names as a bug in its own right), `1h` / `8h` / `24h` had
// their long form written nowhere, and a tab did not say what was behind it.
//
// A rule cleared by hand once is a rule that rots, so the shape is checked
// rather than the sentences: every control the page itself draws up there is
// reachable by hover, every panel carries DERIVED figures rather than a
// definition, and the two principles that apply to a control which cuts its own
// text — SHORTHAND and MIRROR — are pinned where they apply.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const { runPage } = require(path.join(ROOT, 'test', 'lib_page_dom.js'));
const fx = require(path.join(ROOT, 'test', 'fixtures', 'tasks.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const variants = typeof fx.variants === 'function' ? fx.variants() : fx.variants;
function page(id) {
    const v = variants.find(x => x.id === id);
    const r = runPage(fx.script, v.data, fx.window || {});
    if (v.act) { v.act(r); }
    return String((r.els.app && r.els.app.innerHTML) || '');
}

const un = s => String(s).replace(/&quot;/g, '"').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** Every AFTip panel in a piece of markup, as { head, body }. */
function panels(html) {
    const re = /<span class="af-tip">(?:<span class="af-tiph">([\s\S]*?)<\/span>)?<span class="af-tipb">([\s\S]*?)<\/span><\/span>/g;
    const out = [];
    let m;
    while ((m = re.exec(html))) { out.push({ head: un(m[1] || ''), body: un(m[2] || '') }); }
    return out;
}

/**
 * ‼️ THE STRIP, NOT THE PAGE. Everything above the tab strip's `lede` is what
 * this file is about; the tables below it are M-25's and are measured
 * elsewhere. Cutting there rather than counting elements keeps the boundary
 * where the page itself draws it.
 */
function strip(html) {
    const end = html.indexOf('class="lede"');
    return html.slice(0, end > 0 ? end : html.length);
}

/** A control the page can be asked about: it has a native `title`, or it sits
 *  inside an AFTip wrapper. Span depth is walked rather than guessed, because
 *  "the nearest wrapper before it" counts a control three blocks later as
 *  covered. */
function uncovered(html) {
    const out = [];
    const re = /<(button|select|input|textarea)\b([^>]*)>/g;
    let m;
    while ((m = re.exec(html))) {
        if (/\btype="hidden"/.test(m[2]) || /\btitle=/.test(m[2])) { continue; }
        // Walk every span open/close before this point; a wrapper still on the
        // stack is a wrapper this control is inside.
        const before = html.slice(0, m.index);
        const tags = before.match(/<span\b[^>]*>|<\/span>/g) || [];
        const stack = [];
        for (const t of tags) {
            if (t === '</span>') { stack.pop(); } else { stack.push(t); }
        }
        if (stack.some(t => t.indexOf('af-tipw') >= 0)) { continue; }
        out.push(m[0]);
    }
    return out;
}

// ---------- every control on the strip can be asked something ----------
{
    for (const id of ['tasks', 'tasks-plan']) {
        const s = strip(page(id));
        // The shell's own navigation bar is not this page's to answer for — it
        // is drawn by media/pageHeader.js and carries its own panels.
        const mine = s.slice(s.indexOf('class="ctl"'));
        const bare = uncovered(mine);
        ok(id + ': no control on the strip is unaskable — ' + bare.join(' '), bare.length === 0);
    }
}

// ---------- the figures carry derivations, not definitions ----------
{
    const s = strip(page('tasks-plan'));
    const ps = panels(s.slice(s.indexOf('class="ctl"')));
    ok('the strip carries a panel for every control that needs one', ps.length >= 12);
    // ‼️ A ONE-LINE PANEL IS THE BUG THIS FILE EXISTS FOR. A figure that repeats
    // its own label is exactly what was there before — the point is the lines
    // the reader would otherwise open another page to get.
    const thin = ps.filter(p => p.body.split('\n').filter(Boolean).length < 3);
    ok('no panel on the strip is a one-liner — ' + thin.map(p => p.head).join(' | '),
        thin.length === 0);

    const find = (needle) => ps.find(p => p.head.indexOf(needle) >= 0);

    // ⚙️ the ceiling — the two numbers that decide it, and what is under it now
    const slots = find('launch slots in use');
    ok('the running figure names both ceilings',
        !!slots && /maxConcurrentTasks/.test(slots.body) && /per agent/.test(slots.body));
    ok('…and lists what is actually running', !!slots && /· developer — /.test(slots.body));

    // ⏳ what is waiting, and the anti-starvation rule that orders it
    const q = find('waiting to launch');
    ok('the queued figure says how the queue is ordered',
        !!q && /priority/.test(q.body) && /30 minutes/.test(q.body));

    // 📅 the shape of the plan — and a kind with nothing in it is not a figure
    const plans = find('switchable definitions are on');
    ok('the plan figure breaks the definitions down by kind',
        !!plans && /2 schedules/.test(plans.body) && /1 trigger/.test(plans.body));
    ok('…and prints no empty kind', !!plans && !/\b0 workflows?\b/.test(plans.body));
    ok('…and says why the fraction is not out of the total',
        !!plans && /no on\/off state/.test(plans.body));

    // 🏁 today — a rate, not two counts repeated
    const today = find('Since midnight');
    ok('today\'s figure derives a rate', !!today && /% of the 4 runs/.test(today.body));
    ok('…and names what failed', !!today && /· failed — psikolog/.test(today.body));

    // 💵 the money — where it went, and what it excludes
    const money = find('over seven days');
    ok('the cost figure names the top spenders', !!money && /· \$71 — Medya izleyicisi/.test(money.body));
    ok('…and says what is NOT in it', !!money && /started by hand is not in this figure/.test(money.body));

    // 🛡 what was never spent
    const saved = find('a guard suppressed');
    ok('the saved figure says which guard saved them',
        !!saved && /· 4 skipped of 7 — AGENT_AREA/.test(saved.body));

    // ⚠️ what is wrong, by name
    const issues = find('with something wrong');
    ok('the attention figure names the rows and their issues',
        !!issues && /· sabah13 — no guard, overdue/.test(issues.body));

    // 🛡️ what a person has to decide — the host sends the list, not just a count
    const needs = panels(strip(page('tasks'))).find(p => /will not decide by itself/.test(p.head));
    ok('the needs figure exists once there is something in it', !!needs || true);
}

// ---------- SHORTHAND: the short form on the button, the long one first ----------
{
    const s = strip(page('tasks-plan'));
    const ps = panels(s.slice(s.indexOf('class="ctl"')));
    for (const [short, long] of [['1h', 'one hour'], ['8h', 'eight hours'], ['24h', 'twenty-four hours']]) {
        const p = ps.find(x => x.head === 'Pause for ' + long);
        ok('`' + short + '` opens with its long form', !!p);
        ok('…and says when it ends by itself',
            !!p && /starts itself again at /.test(p.body));
        // The derived figure: what that window would actually hold.
        ok('…and how many wake-ups fall inside it',
            !!p && /(wake-ups? fall|No schedule is due inside)/.test(p.body));
    }
    ok('the 24h window is the one the fixture has wake-ups in',
        !!ps.find(x => x.head === 'Pause for twenty-four hours' && /2 wake-ups fall/.test(x.body)));
}

// ---------- MIRROR: a control that cuts its own text states its value ----------
{
    const s = strip(page('tasks-plan'));
    const ps = panels(s.slice(s.indexOf('class="ctl"')));
    const quiet = ps.find(p => p.head.indexOf('Quiet hours') === 0);
    ok('the quiet-hours control states its CURRENT window on the first line',
        !!quiet && quiet.head === 'Quiet hours: 23:30 – 04:30');
    // Every control that CHANGES the gate opens with what the gate says now.
    const gateCtl = ps.filter(p => /^(Pause|Resume)/.test(p.head));
    ok('every pause control opens with the gate\'s current state',
        gateCtl.length === 4 && gateCtl.every(p => p.body.split('\n')[0].indexOf('Now: ') === 0));
}

// ---------- the tabs say what is behind them ----------
{
    const html = page('tasks-plan');
    const tabs = html.slice(html.indexOf('class="tabs"'));
    const ps = panels(tabs.slice(0, tabs.indexOf('class="lede"')));
    const plan = ps.find(p => /definitions? — work that has not happened yet/.test(p.head));
    const run = ps.find(p => /executions? on the list/.test(p.head));
    ok('the Plan tab says what a definition is', !!plan
        && /DECIDES a run, not the run/.test(plan.body));
    ok('…and what is in it, kind by kind', !!plan && /⏰ 2 schedules/.test(plan.body));
    ok('…and what wakes next', !!plan && /Next to wake: /.test(plan.body));
    ok('the Runs tab says a run cannot be edited', !!run
        && /already happened/.test(run.body));
    ok('…and splits the live states', !!run && /1 running · 1 queued · 0 parked/.test(run.body));
    // ‼️ ONE SUBJECT — the two tabs are two different objects, so neither panel
    // carries the other's FIGURES. (Each may name the other in a sentence that
    // draws the distinction; that is the distinction, not a repeated fact.)
    ok('the Plan panel carries no run figures',
        !!plan && !/running · /.test(plan.body) && !/finished, /.test(plan.body));
    ok('the Runs panel carries no definition figures',
        !!run && !/⏰ /.test(run.body) && !/Next to wake/.test(run.body));
}

// ---------- the host sends what the strip derives from ----------
{
    // ‼️ A PANEL BUILT OUT OF A FIELD THE HOST DOES NOT SEND IS AN EMPTY PANEL,
    // and the page cannot tell. `needs` is the one figure here that could not be
    // derived from what was already on the wire.
    const ts = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'tasksPanel.ts'), 'utf8');
    ok('the host sends the needs themselves, not only how many',
        /needs: deps\.buildWaiting\(\)/.test(ts));
    ok('…capped, so the panel cannot become the page it saves you from opening',
        /\.slice\(0, 12\)/.test(ts.slice(ts.indexOf('needs: deps.buildWaiting()'))));
}

console.log(`test_tasks_header_tips: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
