// The two halves of the contract, checked across the WHOLE extension.
//
// ‼️ A MENU NOBODY KNOWS ABOUT IS NOT A FEATURE. Every row that publishes
// itself to the right-click menu must also say so — the tooltip tail is the
// only thing that tells anyone the menu exists. And every section the pages
// publish must have items in the catalogue, or that right-click still shows
// Cut/Copy/Paste and nothing else.
//
// Both directions rot silently, which is why they are checked here and not
// left to somebody noticing.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const MEDIA = path.resolve(__dirname, '..', 'media');
const CAT = require(path.join(__dirname, '..', 'out', 'core', 'ctxmenu.js'));

const files = fs.readdirSync(MEDIA).filter(f => f.endsWith('.js'));
const sources = new Map(files.map(f => [f, fs.readFileSync(path.join(MEDIA, f), 'utf8')]));

// ---------------------------------------------------------------- what pages publish
// Every literal section name a page hands to AFCtx.row / AFSessionCtx.row /
// AFCtx.agent, plus the ones written straight into a context object.
const published = new Map();     // section -> [file]
for (const [file, src] of sources) {
    if (file === 'afCtx.js' || file === 'afSessionCtx.js') { continue; }
    const re = /(?:AFCtx\.row\(|webviewSection:\s*)['"]([a-zA-Z]+)['"]/g;
    let m;
    while ((m = re.exec(src))) {
        if (!published.has(m[1])) { published.set(m[1], []); }
        if (published.get(m[1]).indexOf(file) < 0) { published.get(m[1]).push(file); }
    }
    // AFSessionCtx.row(x) with no section override publishes afSessionRow;
    // AFCtx.agent(x) with none publishes afAgentRow.
    if (/AFSessionCtx\.row\(/.test(src)) {
        const list = published.get('afSessionRow') || published.set('afSessionRow', []).get('afSessionRow');
        if (list.indexOf(file) < 0) { list.push(file); }
    }
    if (/AFCtx\.agent\(/.test(src)) {
        const list = published.get('afAgentRow') || published.set('afAgentRow', []).get('afAgentRow');
        if (list.indexOf(file) < 0) { list.push(file); }
    }
}

ok('the pages publish rows at all', published.size > 20);

// ---------------------------------------------------------------- every section has a menu
{
    const orphans = [...published.keys()]
        .filter(s => CAT.ctxForSection(s, () => '').length === 0);
    ok('‼️ every section a page publishes has items in the catalogue', orphans.length === 0);
    for (const o of orphans) {
        console.log(`    · ${o} is published by ${published.get(o).join(', ')} but the catalogue draws nothing on it`);
    }
}

// ---------------------------------------------------------------- and every catalogue section is drawn
// Here the question is only "does any page name this section" — a page may
// hand it to a helper (timeline's laneCtx takes one) rather than write it at
// the call site, and that is still publishing it.
{
    const names = [...sources.values()].join('\n');
    const unused = CAT.ctxSections()
        .filter(s => !published.has(s) && !names.includes(`'${s}'`));
    ok('‼️ every section in the catalogue is published by some page', unused.length === 0);
    for (const u of unused) {
        console.log(`    · the catalogue draws a menu on ${u}, but no page publishes that section`);
    }
}

// ---------------------------------------------------------------- the tooltip tail
// A row that publishes itself must say so somewhere in the same file. The
// helpers (AFCtx.HINT / .hint() / .AGENT_HINT, AFSessionCtx.HINT) are the only
// approved wording — a hand-typed one would drift the day the words change.
{
    const HINT = /AFCtx\.(HINT|hint\()|AFSessionCtx\.HINT|AGENT_HINT|right-click/;
    const silent = [];
    for (const [file, src] of sources) {
        if (file === 'afCtx.js' || file === 'afSessionCtx.js') { continue; }
        const publishes = /AFCtx\.row\(|AFCtx\.agent\(|AFSessionCtx\.row\(|webviewSection:/.test(src);
        if (publishes && !HINT.test(src)) { silent.push(file); }
    }
    ok('‼️ no page draws a menu without telling anyone it is there', silent.length === 0);
    for (const s of silent) { console.log('    · ' + s + ' publishes rows but never says a right-click has more'); }
}

// ---------------------------------------------------------------- every act is answered
// test_ctxmenu.js proves each relayed act is NAMED by some page; this proves
// the naming page is one that actually publishes the section the act is for.
{
    const bad = [];
    for (const section of CAT.ctxSections()) {
        const acts = CAT.ctxForSection(section, () => '')
            .map(i => i.command)
            .filter(c => c.indexOf(CAT.CTX_PREFIX) === 0);
        if (!acts.length) { continue; }
        const owners = published.get(section) || [];
        if (!owners.length) { continue; }
        const relayActs = CAT.ctxRelays()
            .filter(r => acts.indexOf(r.command) >= 0)
            .map(r => r.act.split(':')[0]);
        const answered = relayActs.every(verb =>
            owners.some(f => sources.get(f).includes(`'${verb}'`))
            // a section drawn on several pages may be answered by any of them
            || [...sources.values()].some(s => s.includes(`'${verb}'`)));
        if (!answered) { bad.push(section); }
    }
    ok('‼️ every page action is answered by a page that draws that row', bad.length === 0);
    for (const b of bad) { console.log('    · nothing answers the acts drawn on ' + b); }
}

// ---------------------------------------------------------------- the bridge can read it
{
    // The op itself, as extension.ts registers it — the same check
    // test_bridge.js makes for the session ops it cannot dispatch here.
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    const at = src.indexOf("op: 'ui.ctxmenu'");
    ok('ui.ctxmenu is registered on the bridge', at > 0);
    const block = src.slice(at, at + 1400);
    ok('…and its describe names the argument and what omitting it does',
        /section\?/.test(block) && /omit for the list/.test(block));
    ok('…and it CALLS the catalogue rather than re-deriving the menu',
        /ctxForSection\(/.test(block) && /ctxSections\(\)/.test(block));

    ok('ui.ctxmenu can list the kinds of row', CAT.ctxSections().length > 20);
    const backlog = CAT.ctxForSection('afBacklogRow', () => '');
    ok('…and answer for one of them', backlog.length > 20);
    ok('…with the words a person sees', backlog.every(i => !!i.title));
    ok('…and the submenu each item sits under, where there is one',
        backlog.some(i => i.menu === 'Priority'));
    const agent = CAT.ctxForSection('afAgentRow', () => 'a host command');
    ok('‼️ a host command\'s words come from the manifest, not the catalogue',
        agent.length > 10 && agent.every(i => i.title === 'a host command'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
