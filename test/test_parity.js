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
/**
 * ‼️ A RIGHT-CLICK ITEM IS A SECOND DOOR, NOT A SECOND CAPABILITY.
 *
 * Every item in the catalogue is either an existing host command — in which
 * case it is that command, drawn again — or an `id`+`act` relay handed to the
 * page that drew the row, which runs the same function its own button runs
 * (core/ctxmenu.ts says so, and `test_ctxmenu_reach.js` proves every published
 * section really has handlers). So a command-backed item is recorded as
 * another door on that command's capability, and a relay is covered by the
 * page action it relays to. Treating the 327 of them as capabilities of their
 * own would fill this manifest with menu entries and hide the actual surface.
 */
for (const item of CTX.CTX_ITEMS) {
    if (!item.command) { continue; }
    const id = `ctx:${item.command}`;
    if (ui.some(u => u.id === id)) { continue; }
    const target = ui.find(u => u.id === `cmd:${item.command}`);
    ui.push({ id, kind: 'ctx', file: 'core/ctxmenu.ts', body: target ? target.body : '' });
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
/**
 * ‼️ A HANDLER IS ALMOST NEVER THE WHOLE STORY. `case 'mem-ask': await
 * this.ask(msg.query)` says nothing about where it ends up; the panel's own
 * `ask()` calls `deps.askMemory`, and the host wired that to the function the
 * op calls. Three hops, and the parity is only visible after all three — so
 * each side is expanded once, in place: its own text, plus the panel methods
 * it delegates to, plus whatever the host gave the deps keys those use.
 */
/**
 * ‼️ PROSE IS NOT A SIGNATURE — AND THE FAILURE IT CAUSED WAS SILENT.
 *
 * The scan below is one regex over the whole file, and an ordinary English
 * sentence in a doc comment — "…asks BEFORE (see the `bulk` message): many
 * rows, one press…" — reads to it exactly like `name(args): type {`. The match
 * then runs on to the next `{`, SWALLOWING the real declaration that follows,
 * and that method quietly leaves the map: its body is no longer folded into
 * the door that calls it, the door loses the vocabulary that proved it shares
 * core with its op, and this gate reports drift that is not there. The reverse
 * is worse — a comment can hide a genuine second implementation from the gate.
 *
 * So comments are blanked before the scan. Blanked, not removed: every
 * character keeps its place, so the offsets the scan indexes with still point
 * at the code they pointed at.
 */
const withoutComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\r\n]/g, ' '))
    // Only a comment that OWNS its line: `'https://…'` inside a string must
    // survive, and a trailing `// note` cannot fake a signature on its own.
    .replace(/(^|\n)([ \t]*)\/\/[^\r\n]*/g, (m, lead, indent) => lead + indent + ' '.repeat(m.length - lead.length - indent.length));

const methodBodies = (file) => {
    const src = withoutComments(sourceOf(file));
    let map = keyCache.get('§m§' + file);
    if (!map) {
        map = new Map();
        for (const m of src.matchAll(/(?:private|public|protected)?\s*(?:async\s+)?([a-zA-Z_$][\w$]*)\s*\([^)]*\)\s*:\s*[^{;]*\{/g)) {
            map.set(m[1], P.balanced ? '' : '');
            const open = src.indexOf('{', m.index + m[0].length - 1);
            map.set(m[1], src.slice(open, Math.min(src.length, open + 2500)));
        }
        keyCache.set('§m§' + file, map);
    }
    return map;
};
const wire = (body, file) => {
    let out = body;
    if (file && file.endsWith('.ts') && file !== 'extension.ts') {
        const methods = methodBodies(file);
        for (const m of body.matchAll(/\bthis\.([A-Za-z_$][\w$]*)\s*\(/g)) {
            const b = methods.get(m[1]);
            if (b) { out += '\n' + b; }
        }
    }
    // A page button that runs a command IS that command — follow it, or the
    // button and the op that share a manager look like strangers.
    for (const m of body.matchAll(/(?:executeCommand|\brun)\(\s*'(agentfarm\.[\w.]+)'/g)) {
        const cmd = ui.find(u => u.id === `cmd:${m[1]}`);
        if (cmd) { out += '\n' + cmd.body; }
    }
    const seen = new Set();
    for (const m of out.matchAll(/\bdeps\.([A-Za-z_$][\w$]*)/g)) {
        if (seen.has(m[1])) { continue; }
        seen.add(m[1]);
        if (!keyCache.has(m[1])) { keyCache.set(m[1], P.valueOfKey(hostSrc, m[1]).join('\n')); }
        out += '\n' + keyCache.get(m[1]);
    }
    return out;
};
for (const a of ui) { a.wired = wire(a.body, a.file); }
for (const o of ops) { o.wired = wire(o.body, o.file); }

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
        // A relay item has no door of its own — see the note above.
    }
    return groups;
}

// ---------------------------------------------------------------- --suggest
// Which ops actually share a function with a given capability. Used while a
// manifest is being filled in — the gate says "nothing links these two", and
// this says what would have.
if (process.argv.includes('--suggest')) {
    const manifest = JSON.parse(read(MANIFEST_FILE));
    const wanted = (process.env.AF_PARITY_SUGGEST || '').split(',').filter(Boolean);
    for (const name of wanted) {
        const entry = manifest.entries.find(e => e.capability === name);
        if (!entry) { console.log(`${name}: not in the manifest`); continue; }
        const actions = entry.ui.map(id => ui.find(u => u.id === id)).filter(Boolean);
        const vocab = new Set();
        for (const a of actions) { for (const s of vocabularyOf(a)) { vocab.add(s); } }
        const hits = P.suggestMapping(actions.map(a => a.wired ?? a.body), vocab, ops, 4);
        console.log(`${name}  [now: ${(entry.ops || []).join(',') || '-'}]  ->  `
            + (hits ? `${hits.ops.join(',')}  via ${hits.core.slice(0, 4).join(',')}` : 'nothing shares a symbol'));
    }
    process.exit(0);
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
            // ‼️ The DECISION is kept; the NAME is recomputed. A capability is
            // named after its doors, so carrying an old name forward is how
            // twenty-five different pages all came to be called after the
            // first one that happened to own a `case 'afnav'`.
            entries.push({ ...kept, capability, ui: live });
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
        // Only the OPS are proposed. `core` is derived by the audit on every
        // run, so writing a guess of it here would just be a stale pin.
        const guess = P.suggestMapping(actions.map(a => a.body), vocab, ops);
        entries.push(guess ? { capability, ui: live, ops: guess.ops } : { capability, ui: live });
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
    // ‼️ The budget SURVIVES a rewrite. A --fix that dropped it would reset
    // the ratchet to whatever today happens to be, which is the one thing a
    // ratchet must never do.
    fs.writeFileSync(MANIFEST_FILE, JSON.stringify({
        version: before.version || 1,
        gapBudget: typeof before.gapBudget === 'number'
            ? before.gapBudget : entries.filter(e => e.gap).length,
        entries
    }, null, 2) + '\n', 'utf8');
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

// ‼️ X-231 — AND A REFERENCE TO AN OP IS NOT A REGISTRATION OF ONE. A wait now
// says which op ENDS it, so a plain data table names `tasks.unpark`; read as a
// second registration that failed the build for a duplicate nobody wrote. The
// registry's own contract is the discriminator, so the hollow check keeps its
// teeth: half a registration is still reported, none of one is not a registration.
{
    const refs = P.discoverOps([{ file: 'core/waits.ts', src:
        "const RULES = [{ prefix: 'wait:', kind: 'task-clock', op: 'tasks.unpark' }];" }]);
    ok('‼️ an op NAMED in a data table is not counted as registered', refs.length === 0);
    const half = P.discoverOps([{ file: 'extension.ts', src:
        "bridge.register([{ op: 'x.y', describe: 'does a thing' }]);" }]);
    ok('…while half a registration is still caught as hollow',
        half.length === 1 && half[0].hasDescribe && !half[0].hasHandler);
}

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

// ‼️ THE RATCHET. A gap is an honest record of something the UI can do and the
// bridge cannot; the budget is what stops it becoming a place to put things.
// It may be lowered — that is the point — and raising it is a line in a diff
// with somebody's name on it, not something a build does quietly.
ok(`‼️ the recorded gaps do not outgrow the budget (${cover.gaps}/${manifest.gapBudget})`,
    cover.gaps <= manifest.gapBudget);
if (cover.gaps < manifest.gapBudget) {
    console.log(`    · ${manifest.gapBudget - cover.gaps} gap(s) closed — lower gapBudget to ${cover.gaps} to keep them closed.`);
}

console.log(`  ${cover.capabilities} capabilities · ${cover.doors} UI doors · `
    + `${cover.mapped} on the bridge · ${cover.exempt} exempt (`
    + Object.entries(cover.byExemption).map(([k, n]) => `${k} ${n}`).join(', ') + ')'
    + ` · ${cover.gaps} open gap(s)`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
