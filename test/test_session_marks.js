// A2 — the shelf: session marks (compiled core/sessionmarks.js, pure) and the
// two places a pin has to survive: the row pool the Sessions tables are built
// from (a pinned session is never cut by the top-N) and the Recent Sessions
// tree order. A mark is the user's own annotation, so the store must take
// whatever globalState hands back — including shapes written by an older build
// or edited by hand — without losing a pin.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const {
    normalizeMarks, parseTags, togglePin, setTags, isPinned, tagsOf, allTags, pinnedIds, pinnedFirst
} = require(path.join(__dirname, '..', 'out', 'core', 'sessionmarks.js'));

// ---------- parseTags ----------
{
    ok('comma separated', parseTags('zen, release').join('|') === 'zen|release');
    ok('newlines separate too', parseTags('zen\nrelease').join('|') === 'zen|release');
    ok('empties dropped', parseTags('zen, , release,').join('|') === 'zen|release');
    ok('trimmed', parseTags('  zen  ,  release ').join('|') === 'zen|release');
    ok('inner whitespace collapsed', parseTags('customer   x').join('|') === 'customer x');
    ok('de-duped case-insensitively, first spelling wins',
        parseTags('Zen, zen, ZEN').join('|') === 'Zen');
    ok('empty input = no tags', parseTags('').length === 0 && parseTags(undefined).length === 0);
}

// ---------- normalizeMarks: hostile input ----------
{
    ok('null/garbage yields an empty map',
        Object.keys(normalizeMarks(null)).length === 0
        && Object.keys(normalizeMarks('nope')).length === 0
        && Object.keys(normalizeMarks(42)).length === 0);
    const m = normalizeMarks({
        a: { pinned: true },
        b: { tags: ['x', 'x', 'y'] },
        c: { pinned: 'yes', tags: 'not-an-array' },   // wrong types
        d: {},                                        // marks nothing
        e: null,
        '': { pinned: true }                          // no session id
    });
    ok('a pin survives', m.a.pinned === true);
    ok('tags survive and are de-duped', m.b.tags.join('|') === 'x|y');
    ok('a non-boolean pin is not a pin', m.c === undefined);
    ok('an entry that marks nothing is dropped', m.d === undefined);
    ok('a null entry is dropped', m.e === undefined);
    ok('an empty session id is dropped', m[''] === undefined);
    ok('nothing else leaks in', Object.keys(m).sort().join(',') === 'a,b');
}

// ---------- toggling and tagging ----------
{
    let m = {};
    m = togglePin(m, 's1');
    ok('toggle pins', isPinned(m, 's1'));
    m = togglePin(m, 's1');
    ok('toggle again unpins', !isPinned(m, 's1'));
    ok('an unpinned session leaves no entry behind', m.s1 === undefined);
    m = togglePin(m, 's1', true);
    m = togglePin(m, 's1', true);
    ok('forcing on twice is idempotent', isPinned(m, 's1'));
    m = togglePin(m, 's1', false);
    ok('forcing off works', !isPinned(m, 's1'));

    m = setTags({}, 's2', ['zen', 'release']);
    ok('tags stored', tagsOf(m, 's2').join('|') === 'zen|release');
    m = togglePin(m, 's2', true);
    ok('pin and tags coexist', isPinned(m, 's2') && tagsOf(m, 's2').length === 2);
    m = setTags(m, 's2', []);
    ok('clearing tags keeps the pin', isPinned(m, 's2') && tagsOf(m, 's2').length === 0);
    m = togglePin(m, 's2', false);
    ok('clearing both removes the entry', m.s2 === undefined);

    const before = { s3: { pinned: true } };
    const after = togglePin(before, 's4', true);
    ok('updates are immutable', before.s4 === undefined && after.s4.pinned === true);
    ok('other entries are carried over', after.s3.pinned === true);
}

// ---------- the shelf as a whole ----------
{
    const m = setTags(setTags(togglePin(togglePin({}, 'a', true), 'b', true), 'a', ['Zen']), 'b', ['zen', 'ops']);
    ok('pinnedIds lists both', pinnedIds(m).sort().join(',') === 'a,b');
    ok('allTags de-dupes across sessions and sorts', allTags(m).join('|') === 'ops|Zen');
    const rows = [{ pinned: false, n: 1 }, { pinned: true, n: 2 }, { pinned: false, n: 3 }];
    ok('pinnedFirst floats the shelf',
        rows.slice().sort(pinnedFirst).map(r => r.n).join('') === '213');
    ok('pinnedFirst is stable for equals',
        [{ n: 1 }, { n: 2 }].sort(pinnedFirst).map(r => r.n).join('') === '12');
}

// ---------- the row pool: a pin outranks every top-N ----------
{
    const Module = require('module');
    const origLoad = Module._load;
    Module._load = function (request) {
        if (request === 'vscode') {
            return { Uri: {}, window: {}, workspace: { getConfiguration: () => ({ get: (_k, d) => d }) }, ViewColumn: {}, ConfigurationTarget: {}, env: {} };
        }
        return origLoad.apply(this, arguments);
    };
    const { sessionRowPool } = require(path.join(__dirname, '..', 'out', 'panels', 'dashboard.js'));
    Module._load = origLoad;

    const usage = i => ({ input: i, output: 0, cacheWrite: 0, cacheRead: 0 });
    // 40 sessions; #40 is the oldest, cheapest, shortest — bottom of every
    // single criterion, so only the pin can put it in the pool.
    const sessions = [];
    for (let i = 1; i <= 40; i++) {
        sessions.push({
            file: `f${i}`, sessionId: `sid${i}`, agentName: 'dev', title: `t${i}`,
            firstTs: 1000, lastTs: 100000 - i * 1000, mtime: 900, usage: usage(41 - i),
            cost: 41 - i, isSidechain: false, toolCalls: 1, errors: 0, userTurns: 1,
            entrypoint: 'cli',
            pinned: i === 40, tags: i === 40 ? ['zen'] : undefined
        });
    }
    const pool = sessionRowPool(sessions, undefined, 5);
    const p40 = pool.find(r => r.sessionId === 'sid40');
    ok('the pinned bottom-of-every-list session is in the pool', !!p40);
    ok('the pool marks it pinned', p40 && p40.pinned === true);
    ok('its tags travel with it', p40 && p40.tags.join('|') === 'zen');
    ok('unpinned rows carry pinned:false', pool.find(r => r.sessionId === 'sid1').pinned === false);
    ok('unpinned rows carry an empty tag list',
        Array.isArray(pool.find(r => r.sessionId === 'sid1').tags)
        && pool.find(r => r.sessionId === 'sid1').tags.length === 0);
    const none = sessionRowPool(sessions.map(s => ({ ...s, pinned: false })), undefined, 5);
    ok('without the pin that same session is cut', !none.find(r => r.sessionId === 'sid40'));
}

// ---------- the wiring contract: a toggle must not read a row's own state ----------
// A SessionInfo carries `pinned`. If the pin command treated that field as an
// instruction, every click on an already-pinned tree row would say "pin it
// again" and nothing would ever come off the shelf. The webviews therefore
// pass the state they want as `wantPinned`, and the command only honours that.
{
    const fs = require('fs');
    const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    const cmd = ext.slice(ext.indexOf("registerCommand('agentfarm.pinSession'"),
        ext.indexOf("registerCommand('agentfarm.pinSession'") + 2000);
    ok('the pin command reads wantPinned, never the row\'s own pinned flag',
        /wantPinned/.test(cmd) && !/\?\.pinned === 'boolean'/.test(cmd));
    ok('…and falls back to a real toggle read off the marks, not off the row',
        /!isPinned\(marks,/.test(cmd) && /togglePin\(marks,/.test(cmd));
    // ‼️ On a SELECTION the whole set must move the same way, decided once by
    // the row that was clicked. Toggling each one on its own state would invert
    // the ones already pinned, so "pin these twelve" would come back with four
    // of them unpinned and no explanation anywhere.
    ok('‼️ a bulk pin decides the direction ONCE and applies it to all of them',
        /for \(const s of list\) \{ marks = togglePin\(marks, s\.sessionId as string, want\); \}/.test(cmd));
    for (const panel of ['dashboard.ts', 'agentDetail.ts']) {
        const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'panels', panel), 'utf8');
        const block = src.slice(src.indexOf("case 'pinSession'"), src.indexOf("case 'pinSession'") + 500);
        ok(`${panel} forwards the webview's wanted state as wantPinned`,
            /wantPinned: msg\.pinned === true/.test(block));
    }
    ok('SessionInfo really does carry a pinned flag (the reason for the rule)',
        /pinned\?: boolean/.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'sessions.ts'), 'utf8')));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
