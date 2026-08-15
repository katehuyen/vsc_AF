// B-11 — the permanent bridge parity gate.
//
// ‼️ THE SCAN THAT PRODUCED B-3 WAS DONE BY HAND. This is the machine that
// keeps it true. It reads the three places a user-triggerable capability can
// be declared — package.json's contributed commands, the right-click
// catalogue, and the `case '…':` arms of the panels' own message handlers —
// and checks every one of them against parity.manifest.json, where each
// capability is recorded with its UI entry points and EITHER the bridge op(s)
// that do the same thing OR a reasoned exemption.
//
// The build drops when: a UI action is not in the manifest, a manifest entry
// answers neither question, an op it names is not registered, an op is
// registered without a handler or a describe, a mapped capability does not
// name the core function both sides go through, or that core function turns
// out to be on only one of the two sides.
//
//   node test/test_parity.js          — audit (what npm test runs)
//   node test/test_parity.js --fix    — re-derive the manifest from the real
//                                       commands, keeping every decision that
//                                       is still about something that exists.
//
// Nothing here hard-codes an op count or an op name list: the catalogue is
// read out of the source every run, which is the whole point.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const ROOT = path.resolve(__dirname, '..');
const P = require(path.join(ROOT, 'out', 'core', 'parity.js'));
const CTX = require(path.join(ROOT, 'out', 'core', 'ctxmenu.js'));
const MANIFEST_FILE = path.join(ROOT, 'parity.manifest.json');

const read = (f) => fs.readFileSync(f, 'utf8');
const EXT = path.join(ROOT, 'src', 'extension.ts');
const PANEL_DIR = path.join(ROOT, 'src', 'panels');
const CORE_DIR = path.join(ROOT, 'src', 'core');

// ---------------------------------------------------------------- the world
const sources = new Map();
sources.set('extension.ts', read(EXT));
for (const f of fs.readdirSync(PANEL_DIR).filter(f => f.endsWith('.ts'))) {
    sources.set(path.join('panels', f), read(path.join(PANEL_DIR, f)));
}
for (const f of fs.readdirSync(CORE_DIR).filter(f => f.endsWith('.ts'))) {
    sources.set(path.join('core', f), read(path.join(CORE_DIR, f)));
}

const ui = P.discoverCommandHandlers(sources.get('extension.ts'));
for (const [rel, src] of sources) {
    if (!rel.startsWith('panels')) { continue; }
    ui.push(...P.discoverPageActions(path.basename(rel), src));
}

// ‼️ The right-click catalogue is a THIRD declaration surface, not a view of
// the other two: an item there is a door a user can press, and one that relays
// a page act is the only place that act is reachable from a tree row. Each
// item becomes a door of its own, carrying the body of whatever it runs, so
// the manifest has to account for it like any other.
const MEDIA_DIR = path.join(ROOT, 'media');
const mediaSrc = new Map(fs.readdirSync(MEDIA_DIR).filter(f => f.endsWith('.js'))
    .map(f => [f, read(path.join(MEDIA_DIR, f))]));

/**
 * ‼️ A RIGHT-CLICK ACT IS HANDLED IN THE PAGE, NOT IN THE PANEL. `AFCtx.listen`
 * hands the act to the page's own script, which does the work or posts a
 * message back — and THAT message is the panel `case` the manifest already
 * knows about. Following the act through media/*.js is what makes a menu item
 * the same capability as the button beside it instead of a 328th orphan.
 */
function actPosts(act) {
    const types = new Set();
    // `blState:done` is dispatched on the `blState:` PREFIX in the page — the
    // value after the colon is the argument, not a second handler.
    const needles = act.includes(':') ? [act, act.split(':')[0] + ':'] : [act];
    for (const needle of needles) {
        for (const src of mediaSrc.values()) {
            let at = src.indexOf(`'${needle}`);
            while (at >= 0) {
                for (const m of src.slice(at, at + 700).matchAll(/type:\s*'([^']+)'/g)) { types.add(m[1]); }
                at = src.indexOf(`'${needle}`, at + 1);
            }
        }
        if (types.size) { break; }
    }
    return [...types];
}

for (const item of CTX.CTX_ITEMS) {
    const id = `ctx:${item.command || item.id}`;
    if (ui.some(u => u.id === id)) { continue; }
    const target = item.command
        ? ui.filter(u => u.id === `cmd:${item.command}`)
        : ui.filter(u => u.kind === 'page' && actPosts(item.act).some(t => u.id.endsWith(`#${t}`)));
    ui.push({
        id, kind: 'ctx', file: 'core/ctxmenu.ts',
        body: target.map(t => t.body).join('\n')
    });
}

const ops = P.discoverOps([...sources.entries()]
    .filter(([rel]) => rel === 'extension.ts' || rel.startsWith('core'))
    .map(([rel, src]) => ({ file: rel, src })));

/** extension.ts is where every panel's deps are wired to the core. */
const hostSrc = sources.get('extension.ts');
const hostCore = P.coreImports(hostSrc);
const sourceOf = (file) => sources.get(file) ?? sources.get(path.join('panels', file)) ?? '';
/** The file an action was declared in, as text — where its imports live. */
const sourceFor = (action) => sourceOf(action.file);

// Fold each side's wired dependencies into it once, so "do these two end in
// the same function" is a question about text rather than about three hops.
// ‼️ The lookup is cached per key: `valueOfKey` walks the whole 20k-line host
// file, and a thousand handlers asking for the same dozen keys is the
// difference between two seconds and five minutes.
const keyCache = new Map();
const wire = (body) => {
    let out = body;
    const seen = new Set();
    for (const m of body.matchAll(/\bdeps\.([A-Za-z_$][\w$]*)/g)) {
        if (seen.has(m[1])) { continue; }
        seen.add(m[1]);
        if (!keyCache.has(m[1])) { keyCache.set(m[1], P.valueOfKey(hostSrc, m[1]).join('\n')); }
        out += '\n' + keyCache.get(m[1]);
    }
    return out;
};
for (const a of ui) { a.wired = wire(a.body); }
for (const o of ops) { o.wired = wire(o.body); }

const vocabCache = new Map();
const vocabularyOf = (action) => {
    let v = vocabCache.get(action.id);
    if (!v) {
        v = new Set(P.coreImports(sourceFor(action)));
        for (const s of P.depsVocabulary(action.body, hostSrc, hostCore)) { v.add(s); }
        for (const s of P.methodVocabulary(action.wired ?? action.body)) { v.add(s); }
        // A bare local call — `costReportText()`, `runPulse()` — is the host
        // function both surfaces were wired to, and names it exactly.
        for (const n of P.calleesIn(action.wired ?? action.body)) {
            if (n.length > 3 && !P.HARMLESS.has(n)) { v.add(n); }
        }
        vocabCache.set(action.id, v);
    }
    return v;
};

const world = { ui, ops, vocabularyOf };

// ---------------------------------------------------------------- grouping
// The right-click catalogue is the one place that says two doors are the SAME
// act: an item with `command` is another way to run that command, an item with
// `id`+`act` relays that act to whichever page drew the row. So the groups
// below are read out of it rather than guessed at from names.
function ctxGroups() {
    const groups = new Map();     // capability seed -> Set(door ids)
    for (const item of CTX.CTX_ITEMS) {
        if (item.command) {
            const key = `cmd:${item.command}`;
            if (!groups.has(key)) { groups.set(key, new Set([key])); }
            groups.get(key).add(`ctx:${item.command}`);
            continue;
        }
        if (!item.id || !item.act) { continue; }
        const posts = actPosts(item.act);
        const doors = ui.filter(u => u.kind === 'page' && posts.some(t => u.id.endsWith(`#${t}`)))
            .map(u => u.id);
        if (!doors.length) { continue; }
        const key = doors[0];
        if (!groups.has(key)) { groups.set(key, new Set(doors)); }
        for (const d of doors) { groups.get(key).add(d); }
        groups.get(key).add(`ctx:${item.id}`);
    }
    return groups;
}

// ---------------------------------------------------------------- --fix
if (process.argv.includes('--fix')) {
    const before = fs.existsSync(MANIFEST_FILE)
        ? JSON.parse(read(MANIFEST_FILE)) : { version: 1, entries: [] };
    const decided = new Map();   // door id -> the entry that owns it
    for (const e of before.entries) { for (const d of e.ui) { decided.set(d, e); } }

    const groups = ctxGroups();
    const seen = new Set();
    const entries = [];

    /** Keep an existing decision when its doors still exist; otherwise propose. */
    const emit = (capability, doors) => {
        const live = doors.filter(d => d.startsWith('ctx:') || ui.some(u => u.id === d));
        if (!live.length) { return; }
        for (const d of live) { seen.add(d); }
        const kept = live.map(d => decided.get(d)).find(Boolean);
        if (kept) {
            entries.push({ ...kept, capability: kept.capability, ui: live });
            return;
        }
        // A new door: propose only what the code PROVES, and leave the rest
        // unanswered so the audit stops the build until somebody decides.
        const actions = live.map(d => ui.find(u => u.id === d)).filter(Boolean);
        const navs = actions.map(a => P.proposeNavigation(a.body));
        if (actions.length && navs.every(Boolean)) {
            entries.push({
                capability, ui: live,
                exempt: {
                    kind: 'navigation',
                    why: `Handler only ${[...new Set(navs.flatMap(v => v.evidence))].slice(0, 3).join(', ')} — it moves the eye and changes nothing.`
                }
            });
            return;
        }
        // ‼️ Mapped by EVIDENCE, not by name: an op whose handler goes through
        // the same core function this button goes through is the same act, and
        // that shared symbol becomes the `core` the gate re-checks every build.
        const vocab = new Set();
        // The core imports of the declaring file, plus the hop through the
        // panel's deps, where the host wired the page's button to the very
        // function the op calls.
        for (const a of actions) { for (const s of vocabularyOf(a)) { vocab.add(s); } }
        const guess = P.suggestMapping(actions.map(a => a.body), vocab, ops);
        entries.push(guess ? { capability, ui: live, ...guess } : { capability, ui: live });
    };

    for (const [key, set] of groups) {
        const doors = [...set].filter(d => !seen.has(d));
        if (!doors.length) { continue; }
        emit(key.replace(/^(cmd|page):/, '').replace('agentfarm.', ''), doors);
    }
    for (const action of ui) {
        if (seen.has(action.id)) { continue; }
        emit(action.id.replace(/^(cmd|page):/, '').replace('agentfarm.', ''), [action.id]);
    }
    entries.sort((a, b) => a.capability.localeCompare(b.capability));
    fs.writeFileSync(MANIFEST_FILE,
        JSON.stringify({ version: before.version || 1, entries }, null, 2) + '\n', 'utf8');
    const undecided = entries.filter(e => !e.exempt && !(e.ops || []).length);
    console.log(`parity.manifest.json rewritten — ${entries.length} capabilities, `
        + `${undecided.length} still waiting for a decision.`);
    for (const e of undecided) { console.log('  · ' + e.capability + '  ' + e.ui.join(' ')); }
    process.exit(0);
}

// ---------------------------------------------------------------- the gate
ok('parity.manifest.json exists — the record IS the gate', fs.existsSync(MANIFEST_FILE));
if (!fs.existsSync(MANIFEST_FILE)) {
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(1);
}
const manifest = JSON.parse(read(MANIFEST_FILE));

ok('the scan found the surface at all — commands, page actions and ops',
    ui.filter(u => u.kind === 'command').length > 150
    && ui.filter(u => u.kind === 'page').length > 300
    && ops.length > 200);

// Every op is registered once and completely — a second registration silently
// shadows the first (the reason BridgeRegistry throws on one), and an op with
// no handler is a catalogue line that answers `undefined`.
{
    const names = ops.map(o => o.op);
    const dup = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))];
    ok('‼️ no op is registered twice', dup.length === 0);
    for (const d of dup) { console.log('    · ' + d + ' is declared more than once'); }
    const hollow = ops.filter(o => !o.hasHandler || !o.hasDescribe);
    ok('‼️ every op carries both a describe and a handler', hollow.length === 0);
    for (const h of hollow) {
        console.log(`    · ${h.op} (${h.file}) has no ${h.hasHandler ? 'describe' : 'handler'}`);
    }
}

const problems = P.auditParity(manifest, world);
const byKind = {};
for (const p of problems) { (byKind[p.kind] = byKind[p.kind] || []).push(p); }

for (const kind of Object.keys(P.EXEMPT_KINDS)) {
    // nothing to assert per kind — listed so a reader sees the closed list
    void kind;
}

const LABEL = {
    unlisted: '‼️ every user-triggerable UI action is in the manifest',
    stale: 'no manifest entry points at a door that no longer exists',
    duplicate: 'no door is claimed by two capabilities',
    'no-answer': '‼️ every capability answers with an op or an exemption',
    'bad-exemption': '‼️ every exemption is one of the five kinds, with a real reason',
    'wrong-exemption': '‼️ nothing that writes is exempt as navigation',
    'missing-op': '‼️ every op a capability names is really registered',
    'no-handler': 'every named op has a handler and a describe',
    'no-core': '‼️ every mapped capability names the core both sides call',
    'core-drift': '‼️ …and that core really is on both sides',
    'dangling-front': 'every door that only opens a surface names a surface that exists'
};
for (const [kind, label] of Object.entries(LABEL)) {
    const list = byKind[kind] || [];
    ok(label, list.length === 0);
    for (const p of list.slice(0, 40)) { console.log(`    · ${p.subject} — ${p.detail}`); }
    if (list.length > 40) { console.log(`    · …and ${list.length - 40} more`); }
}

const cover = P.parityCoverage(manifest);
console.log(`  ${cover.capabilities} capabilities · ${cover.doors} UI doors · `
    + `${cover.mapped} on the bridge · ${cover.exempt} exempt (`
    + Object.entries(cover.byExemption).map(([k, n]) => `${k} ${n}`).join(', ') + ')');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
