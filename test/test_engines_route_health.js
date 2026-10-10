// X-114 — THE ROUTE HEALTH SECTION OF THE ENGINES PAGE, driven through the real
// media/engines.js.
//
// The cards at the top of that page answer "is this ENGINE ready". Everything
// that goes wrong one level down starts and fails on an engine every one of
// them calls ready — a route with no key, a tier mapped to nothing, a route
// answered a second time from inside the CLI's own settings file, a provider
// the catalog stopped offering.
//
// ‼️ WHAT IS PINNED HERE IS THAT THE THREE STATES STAY THREE THINGS. The first
// draft of every check like this collapses into one traffic light, and then:
//   * "never tested" — the ORDINARY state of a healthy row — wears the colour
//     of a fault and sends somebody to spend a turn for nothing;
//   * "nothing was called" wears the colour of "it did not answer";
//   * "unknown" is drawn as "no", which is a claim nobody made;
//   * and a verdict about a configuration that has since changed is either
//     shown as current (a lie) or dropped (which says "never tested" about a
//     route tested twenty minutes ago).
'use strict';
const path = require('path');
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const fixture = require(path.join(__dirname, 'fixtures', 'enginespanel.js'));
const scene = (id) => fixture.variants().find(v => v.id === id).data;

/** Just the Route health section — a page-wide match would go green on a build
 *  that has no section at all, which is what this file exists to catch. */
const section = (data) => {
    const h = runPage('engines.js', data).html();
    const from = h.indexOf('>Route health<');
    return from < 0 ? '' : h.slice(from);
};

/* ---------- the section exists at all, and only when there is something to say */
{
    const empty = { ...scene('enginespanel'), providerHealth: [] };
    ok('nothing is drawn when no engine has a provider axis', section(empty) === '');
    ok('…and the section appears the moment one does',
        section(scene('enginespanel')).length > 0);
}

const s = section(scene('engineshealth'));

/* ---------- 1) three states, three marks, and none of them collapsed */
{
    ok('the section is really there', s.length > 0);
    ok('configured is its own chip', /pohchip h-cfg">configured/.test(s));
    ok('available is its own chip', /pohchip h-yes">available/.test(s));
    ok('…and so is the row that is not', /pohchip h-no">not available/.test(s));
    ok('‼️ unknown is DRAWN, not left blank and not drawn as "no"',
        /pohchip h-un">unknown/.test(s));
    ok('‼️ never tested is its own quiet chip, not a fault',
        /pohchip h-none">never tested/.test(s));
    ok('a pass carries its age', /pohchip h-ok">tested · 3m ago/.test(s));
    ok('a failure carries its own', /pohchip h-bad">failed · 22m ago/.test(s));
    ok('‼️ nothing was called reads as "not attempted", never as "failed"',
        /pohchip h-held">not attempted · 6m ago/.test(s));
    ok('‼️ a verdict about a configuration this replaced says so',
        /pohchip h-old">superseded/.test(s));
    ok('…with the reason a reader needs to decide whether to press again',
        /revision 2 → 3/.test(s));
}

/* ---------- 2) the faults, in the words a launch would print */
{
    ok('the settings.json route is named as an engine-wide problem',
        /pohprob">ANTHROPIC_BASE_URL is set in the CLI/.test(s));
    ok('…and the inherited one is a NOTE, not a problem',
        /pohnote">ANTHROPIC_API_KEY is present in the inherited/.test(s));
    ok('a tier mapped to nothing is on its own row',
        /pohprob">the &quot;sonnet&quot; tier maps to no model/.test(s));
    ok('‼️ an empty credentials file on OpenCode is a note and not a fault',
        /pohnote">~\/\.local\/share\/opencode\/auth\.json holds no credential/.test(s)
        && !/pohprob">[^<]*auth\.json/.test(s));
    ok('…and what a hosted card cannot carry is said where a picker is read',
        /ACP declares only model and mode/.test(s));
}

/* ---------- 3) the button, and the guard that stops a second turn */
{
    // U-243 — six rows now: the scene lends openrouter-r1 to OpenCode
    ok('every row offers one real turn', (s.match(/data-potest="/g) || []).length === 6);
    ok('…carrying the engine and the model it would aim at',
        /data-poteng="claude"/.test(s) && /data-potmodel="kimi-k2-thinking"/.test(s));
    ok('‼️ a row with a turn in the air cannot be pressed again',
        /data-potest="minimax"[^>]*disabled/.test(s));
    ok('…and says so rather than looking broken', /Testing…<\/button>/.test(s));
    ok('the cost is stated before the press, on the button itself',
        /Runs ONE real turn through this route/.test(s));
}

/* ---------- 4) ‼️ NOTHING ON THIS PAGE COULD CARRY A CREDENTIAL */
{
    ok('no key, header or token field reaches the markup',
        !/apiKey|"secret"|Bearer |sk-[a-z0-9]/i.test(s));
    ok('…and the row says only what was proved, by name',
        /Proved: kimi/.test(s) || /adapter claude-route@1/.test(s));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
