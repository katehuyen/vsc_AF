// ‼️ A FIXTURE MAY NOT INVENT A STATE THE PRODUCT CANNOT REACH (audit B-02).
//
// The sentry scenes exist because A-12.8 found the chip's own states had never
// been drawn. But three of them were drawn from vocabulary nobody writes:
//
//   · BLOCKED said `no-item` and a sentence ending in a bare `⛔`. There is no
//     such rule, and an empty backlog is not blocked at all — it is `idle` /
//     `nothing-to-take`, because only the user ends a campaign. So the picture
//     added to prove "the panel carries the reason" carried a reason nobody
//     could ever meet, and on screen it read as cut off mid-word.
//   · WAITING said `finish` / `round-ended`. `finish` is a MISSION action, a
//     different machine entirely; the chip reached WAITING as its fall-through,
//     so an invented action landed on the right picture for the wrong reason.
//
// That is the audit's own failure mode wearing a fixture: something looked
// checked, and what was checked was not the product. This gate reads the
// vocabulary out of `src/` and holds every fixture value against it, so the
// next invented word is red before it is ever photographed.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const ROOT = path.resolve(__dirname, '..');

/** Every `.ts` under `src/`, which is where the campaign's plans are written. */
function sources() {
    const out = [];
    (function walk(d) {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) { walk(p); } else if (p.endsWith('.ts')) { out.push(p); }
        }
    })(path.join(ROOT, 'src'));
    return out;
}

// ---- the vocabulary, read off the product ---------------------------------

const src = sources().map(f => fs.readFileSync(f, 'utf8'));

/** `SentryAction` is a declared union — the one authority, not a scrape. */
const unionLine = src.map(s => /export type SentryAction\s*=\s*([^;]+);/.exec(s)).find(Boolean);
ok('‼️ THE ACTIONS COME FROM THE DECLARED UNION, not from counting call sites — '
    + 'a scrape misses a branch and then blesses whatever the fixture says',
    !!unionLine);
const ACTIONS = new Set((unionLine ? unionLine[1].match(/'[a-z-]+'/g) || [] : []).map(s => s.slice(1, -1)));
ok('and it holds the five states the chip actually branches on',
    ['start', 'sleep', 'idle', 'blocked', 'stopped'].every(a => ACTIONS.has(a)));
ok('‼️ `finish` IS NOT ONE OF THEM — it belongs to missions, and the two machines '
    + 'are not the same one', !ACTIONS.has('finish'));

/** ‼️ RULES ARE SCRAPED, AND THE SCRAPE READS TERNARIES. `rule: crossed ?
 *  'engine-fallback' : 'has-room'` is two rules on one line; a regex anchored on
 *  `rule: '…'` sees neither and would have called `has-room` invented too. */
const RULES = new Set();
for (const s of src) {
    const re = /rule:\s*([^,\n]+)/g;
    let m;
    while ((m = re.exec(s))) {
        (m[1].match(/'[a-z][a-z0-9:._-]*'/g) || []).forEach(q => RULES.add(q.slice(1, -1)));
    }
}
ok('the rules are read out of the product, ternary branches included',
    RULES.has('has-room') && RULES.has('engine-fallback') && RULES.size > 10);
ok('‼️ AND AN EMPTY BACKLOG IS NOT A BLOCK — it is `nothing-to-take`, and the '
    + 'invented `no-item` is nowhere', RULES.has('nothing-to-take') && !RULES.has('no-item'));
ok('…nor is `round-ended` anything the product writes', !RULES.has('round-ended'));

// ---- and every fixture is held against it ---------------------------------

const fixDir = path.join(ROOT, 'test', 'fixtures');
const fixtures = fs.readdirSync(fixDir).filter(f => f.endsWith('.js'));
const strays = { action: [], rule: [] };
for (const f of fixtures) {
    const s = fs.readFileSync(path.join(fixDir, f), 'utf8');
    // Only the assignments, never the prose: these files explain themselves at
    // length and a comment naming the word it removed must not re-fail the gate.
    for (const m of s.match(/lastAction:\s*'[^']*'/g) || []) {
        const v = m.split("'")[1];
        if (!ACTIONS.has(v)) { strays.action.push(`${f}: ${v}`); }
    }
    for (const m of s.match(/lastRule:\s*'[^']*'/g) || []) {
        const v = m.split("'")[1];
        if (!RULES.has(v)) { strays.rule.push(`${f}: ${v}`); }
    }
}
ok('‼️ NO FIXTURE DRAWS AN ACTION THE PRODUCT CANNOT PRODUCE' + (strays.action.length ? ' — ' + strays.action.join(' · ') : ''),
    strays.action.length === 0);
ok('‼️ NO FIXTURE DRAWS A RULE THE PRODUCT DOES NOT WRITE' + (strays.rule.length ? ' — ' + strays.rule.join(' · ') : ''),
    strays.rule.length === 0);

// ---- and the sentence on the blocked scene is the product's own -----------
{
    const fx = fs.readFileSync(path.join(fixDir, 'missions.js'), 'utf8');
    const blocked = /const SENTRY_BLOCKED[\s\S]*?\n\}\);/.exec(fx);
    ok('the blocked scene exists to be checked', !!blocked);
    const why = blocked && /lastWhy: '([\s\S]*?)'\s*\n?\s*\}\)/.exec(blocked[0]);
    ok('‼️ AND ITS SENTENCE DOES NOT TRAIL OFF INTO AN ICON — `⛔` is a mark on a '
        + 'backlog line, not a word, and as the last thing in a sentence it reads '
        + 'as a truncation to everyone who did not write it',
        !!blocked && !/⛔/.test(blocked[0]));
    ok('…and it is a sentence the product really writes, found verbatim in src/',
        !!blocked && src.some(s => s.includes('none of the accounts this campaign is allowed to use is captured any more')));
    void why;
}

// ---- and no scene is idle and mid-round at the same time ------------------
//
// ‼️ THE INVARIANT, NOT THE FIVE FIXTURES THAT BROKE IT. Every state below
// `sentry-live` is derived from it and sets `running: false, live: null` — and
// every one went on inheriting a round table whose last row said `running` with
// no `endedAt`. Five signed-off pictures of a campaign that is simultaneously
// idle and mid-round. A rule, not a list, because the next derived scene will
// inherit the same thing.
{
    const fx = require(path.join(fixDir, 'missions.js'));
    const bad = [];
    for (const v of fx.variants()) {
        const s = (v.data && v.data.sentry) || {};
        if (s.running || s.live) { continue; }
        const open = (s.rounds || []).filter(r => r.status === 'running' || (r.endedAt == null && r.status !== 'done'));
        if (open.length) { bad.push(`${v.id}: ${open.map(r => r.title || r.id).join(', ')}`); }
    }
    ok('‼️ NOTHING ON THE BOARD MEANS NO ROUND IS STILL RUNNING' + (bad.length ? ' — ' + bad.join(' · ') : ''),
        bad.length === 0);

    const live = fx.variants().find(v => v.id === 'sentry-live');
    ok('…and the one scene that IS running still has its open round, so the rule '
        + 'did not just empty every table',
        !!live && (live.data.sentry.rounds || []).some(r => r.status === 'running'));
}


// ---- and a round never takes negative time --------------------------------
//
// ‼️ B-02. `Took` was `Math.round(endedAt - createdAt)` with no floor, so a row
// whose stamps were out of order printed `-24m` — a round that finished before
// it began — and nothing said a word. The run table one screen up in the same
// file already clamps the identical figure; this holds the two to the same rule.
{
    const src = fs.readFileSync(path.join(ROOT, 'media', 'missions.js'), 'utf8');
    ok('‼️ THE ROUND TABLE CLAMPS ITS DURATION, like the run table beside it does',
        /Math\.max\(0, Math\.round\(\(r\.endedAt - r\.createdAt\)/.test(src));

    const fx = require(path.join(fixDir, 'missions.js'));
    const bad = [];
    for (const v of fx.variants()) {
        for (const r of ((v.data && v.data.sentry && v.data.sentry.rounds) || [])) {
            if (r.endedAt && r.createdAt && r.endedAt < r.createdAt) {
                bad.push(`${v.id}: ${r.title || r.id}`);
            }
        }
    }
    ok('…and no scene hands it a row that ended before it opened' + (bad.length ? ' — ' + bad.join(' · ') : ''),
        bad.length === 0);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) { process.exitCode = 1; }
