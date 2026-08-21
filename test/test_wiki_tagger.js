// K-26 (X-50) — THE WIKI TAGGER: the badge on a turn, and the number behind it.
//
// ‼️ WHAT THIS FILE IS THE PROOF OF. The pool files by TURN NUMBER, and the
// number belongs to the transcript. A Console row does not carry it: the
// panel's own counter restarts on every resume and the backfill numbers rows by
// their place in the file. So the number is resolved from the row's opening
// line and its clock — and the failure that would be invisible is the one this
// pins: filing the NEIGHBOURING turn. A queued message can start the next turn
// inside the gap between when the panel stamped a prompt and when the CLI wrote
// it, so a clock-only rule is wrong exactly where it looks right.
//
// The second thing pinned here is that a guess ADMITS to being one. When the
// text matches nothing the clock still answers, and the popover has to show
// that number as something to check rather than assert it — an inferred number
// filed silently is worse than no badge at all.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const W = require(path.join(ROOT, 'out', 'core', 'wiki.js'));

// ================================================= the resolver (core/wiki.ts)
// A conversation whose turns are seconds apart — which is what a queue produces,
// and what makes the clock alone unsafe.
const TURNS = [
    { n: 1, label: 'read note.txt and tell me what is in it', ts: 1000 },
    { n: 2, label: 'now count the words in it', ts: 20000 },
    { n: 3, label: 'devam', ts: 40000 },
    { n: 4, label: 'devam', ts: 41000 },
    { n: 5, label: 'wiki icin bir sey daha', ts: 60000 }
];

{
    const r = W.turnFor(TURNS, { ts: 20050, text: 'now count the words in it' });
    ok('the opening line names the turn', r.turn === 2 && r.exact === true);
    ok('…and the count comes with it', r.count === 5);
}
{
    // ‼️ THE CASE THE CLOCK GETS WRONG. The panel stamped this prompt before the
    // CLI wrote it, and by the time it landed the next turn had already started.
    // A "last turn that had started by then" rule files turn 5; the text does not.
    const r = W.turnFor(TURNS, { ts: 61000, text: 'now count the words in it' });
    ok('a prompt stamped after the NEXT turn began is still filed by its words',
        r.turn === 2 && r.exact === true);
}
{
    // The same prompt typed twice — the clock only chooses between turns that
    // already said the same thing, which is the one job it is safe for.
    const near = W.turnFor(TURNS, { ts: 40900, text: 'devam' });
    ok('a repeated prompt is disambiguated by the clock, not abandoned',
        near.turn === 4 && near.exact === true);
    ok('…and the earlier one is still reachable',
        W.turnFor(TURNS, { ts: 40100, text: 'devam' }).turn === 3);
}
{
    // The label is a 90-character truncation of the prompt, so the row's own
    // text is LONGER than what the transcript kept. One is a prefix of the other.
    const long = 'read note.txt and tell me what is in it, then summarise it in three lines for the log';
    ok('a truncated label still matches the whole prompt it came from',
        W.turnFor(TURNS, { ts: 999999, text: long }).turn === 1);
}
{
    const r = W.turnFor(TURNS, { ts: 45000, text: 'a prompt this transcript has never seen' });
    ok('an unknown line falls back to the clock', r.turn === 4);
    ok('‼️ …and SAYS it is a guess', r.exact === false);
}
{
    ok('a transcript with no turns yet answers 0 rather than inventing one',
        W.turnFor([], { ts: 1, text: 'x' }).turn === 0);
    ok('a short word is not matched on two characters of coincidence',
        W.turnFor([{ n: 1, label: 'devam et', ts: 10 }], { ts: 99, text: 'de' }).exact === false);
}

// ================================ the pool's own view of what a surface asks it
{
    const os = require('os');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-tag-'));
    const store = new W.WikiStore(path.join(tmp, 'pool.json'));
    store.add({
        sessionId: 'S1', sessionFile: 'a.jsonl', engine: 'claude', agentName: 'dev',
        fromTurn: 2, toTurn: 2, topics: ['Agent Farm'], label: 'x', note: '', addedBy: 'you'
    });
    store.add({
        sessionId: 'S2', sessionFile: 'b.jsonl', engine: 'claude', agentName: 'dev',
        fromTurn: 0, toTurn: 0, topics: ['Wiki'], label: 'y', note: '', addedBy: 'you'
    });
    const dropped = store.add({
        sessionId: 'S1', sessionFile: 'a.jsonl', engine: 'claude', agentName: 'dev',
        fromTurn: 9, toTurn: 9, topics: ['Gitti'], label: 'z', note: '', addedBy: 'you'
    });
    dropped.candidate.state = 'dropped';
    ok('forSession answers about ONE conversation', store.forSession('S1').length === 1);
    ok('…and a dropped mark is not a turn the badge should call taken',
        !store.forSession('S1').some(c => c.state === 'dropped'));
    ok('a conversation nobody marked is empty, not undefined',
        Array.isArray(store.forSession('nope')) && store.forSession('nope').length === 0);
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* windows */ }
}

// ============================================ the popover itself (media/afWiki.js)
function tagger() {
    const posted = [];
    const nodes = {};
    const mkEl = () => {
        const el = {
            innerHTML: '', value: '', dataset: {}, listeners: {},
            addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); },
            fire(ev, arg) { (this.listeners[ev] || []).forEach(f => f(arg || {})); },
            focus() { }, setSelectionRange() { },
            appendChild() { },
            getBoundingClientRect: () => ({ left: 120, top: 200, bottom: 216 }),
            querySelectorAll: () => [],
            closest: () => null
        };
        return el;
    };
    const body = mkEl();
    const sandbox = {
        window: { innerWidth: 1200, innerHeight: 900 },
        document: {
            body,
            createElement: () => { const e = mkEl(); nodes.host = e; return e; },
            getElementById: (id) => nodes[id] || null,
            addEventListener: () => { },
            querySelectorAll: () => []
        },
        setTimeout: () => 0, clearTimeout: () => { }, console
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'media', 'afWiki.js'), 'utf8'), sandbox);
    const AFWiki = sandbox.window.AFWiki;
    AFWiki.init(m => posted.push(m));
    // The panel is rebuilt into `nodes.host.innerHTML` on every render; the
    // controls are handed back by id, so the test finds them the way the
    // component's own render() does.
    const bind = (id) => { nodes[id] = nodes[id] || mkEl(); return nodes[id]; };
    return { AFWiki, posted, html: () => (nodes.host ? nodes.host.innerHTML : ''), bind, nodes };
}

{
    const t = tagger();
    t.AFWiki.open({ session: 'S1', turn: 0, ts: 20050, text: 'now count the words in it' });
    ok('opening asks the host, and asks with the row\'s own moment and words',
        t.posted[0] && t.posted[0].type === 'wikiAsk'
        && t.posted[0].ts === 20050 && t.posted[0].text === 'now count the words in it');
    ok('…and it asks NOTHING of the vault on the way in',
        !t.posted.some(m => m.type === 'wikiMark'));

    t.AFWiki.receive({
        type: 'wikiAsk', session: 'S1', ok: true, from: 2, to: 2, exact: true,
        turnCount: 5, label: 'now count the words in it',
        topics: [{ topic: 'Agent Farm', pending: 3, total: 9 }, { topic: 'Wiki', pending: 1, total: 2 }],
        marks: []
    });
    const h = t.html();
    ok('the resolved turn is IN THE BOX, editable', /id="afw-range"[^>]*value="2"/.test(h));
    ok('…and the reader is told what it is out of', /turn 2 of 5/.test(h));
    ok('the topics already in the pool are the list', /Agent Farm/.test(h) && /Wiki/.test(h));
    ok('…each saying how much is waiting under it', /3 waiting, 9 marked in all/.test(h));
    ok('a sure number does not cry wolf', !/check this/.test(h));
    ok('the panel says the vault is untouched', /Nothing is written to the vault/.test(h));
}

{
    // ‼️ AN INFERRED NUMBER SHOWS ITS WORKING. Same panel, one flag different.
    const t = tagger();
    t.AFWiki.open({ session: 'S1', turn: 0, ts: 45000, text: 'something else' });
    t.AFWiki.receive({
        type: 'wikiAsk', session: 'S1', ok: true, from: 4, to: 4, exact: false,
        turnCount: 5, label: 'devam', topics: [], marks: []
    });
    ok('‼️ a guessed turn number says so on the row it is in', /check this/.test(t.html()));
    ok('…and an empty pool asks for the first word rather than showing nothing',
        /Nothing in the pool yet/.test(t.html()));
}

{
    // Saving: what goes on the wire, and what a refusal looks like.
    const t = tagger();
    t.AFWiki.open({ session: 'S1', turn: 3 });
    t.AFWiki.receive({
        type: 'wikiAsk', session: 'S1', ok: true, from: 3, to: 3, exact: true,
        turnCount: 5, label: 'devam',
        topics: [{ topic: 'Agent Farm', pending: 1, total: 1 }], marks: []
    });
    const typed = t.bind('afw-typed');
    const go = t.bind('afw-go');
    // Re-render so the freshly bound controls get this render's listeners.
    t.AFWiki.receive({
        type: 'wikiAsk', session: 'S1', ok: true, from: 3, to: 3, exact: true,
        turnCount: 5, label: 'devam',
        topics: [{ topic: 'Agent Farm', pending: 1, total: 1 }], marks: []
    });
    go.fire('click');
    ok('‼️ saving with no topic is refused IN the panel, not silently',
        /at least one topic/.test(t.html())
        && !t.posted.some(m => m.type === 'wikiMark'));

    typed.value = 'Tur Numarasi, Wiki';
    typed.fire('input');
    go.fire('click');
    const sent = t.posted.find(m => m.type === 'wikiMark');
    ok('‼️ what is TYPED counts without being ticked — the commonest way it is used',
        sent && sent.topics.join('|') === 'Tur Numarasi|Wiki');
    ok('…and it carries the turn it was opened on', sent && sent.from === 3 && sent.to === 3);

    t.AFWiki.receive({
        type: 'wikiMarked', session: 'S1', ok: true, merged: false, pending: 4,
        from: 3, to: 3, topics: [], marks: [{ id: 'w1', from: 3, to: 3, topics: ['Wiki'], state: 'pending' }]
    });
    ok('the receipt names the turn it kept', /Kept — turn 3/.test(t.html()));
    ok('…and says how much is waiting', /4 waiting to be compiled/.test(t.html()));
}

{
    // A second mark on a turn already kept is an ADDITION, and the panel opens
    // saying so — the pool merges rather than adding a row (B-14), so a picker
    // that started empty would invite retyping what is already there.
    const t = tagger();
    t.AFWiki.open({ session: 'S1', turn: 2 });
    t.AFWiki.receive({
        type: 'wikiAsk', session: 'S1', ok: true, from: 2, to: 2, exact: true,
        turnCount: 5, label: 'x',
        topics: [{ topic: 'Agent Farm', pending: 1, total: 1 }, { topic: 'Wiki', pending: 1, total: 1 }],
        marks: [{ id: 'w1', from: 2, to: 2, topics: ['Agent Farm'], state: 'pending' }]
    });
    ok('a turn already kept opens with its own topics ticked',
        /class="afw-chip on"[^>]*>Agent Farm</.test(t.html()));
    ok('…and the other topics are still only a click away',
        /class="afw-chip"[^>]*>Wiki</.test(t.html()));
}

{
    // The badge. It is the whole surface of this feature and it has two states.
    const t = tagger();
    const off = t.AFWiki.badge({ session: 'S1', turn: 4, marks: [], ts: 7, text: 'hi' });
    ok('an unmarked turn draws a quiet badge',
        /data-afwiki="1"/.test(off) && !/class="afwiki on"/.test(off));
    ok('…carrying everything the host needs to answer it',
        /data-afw-session="S1"/.test(off) && /data-afw-ts="7"/.test(off));
    const on = t.AFWiki.badge({
        session: 'S1', turn: 4,
        marks: [{ id: 'w1', from: 3, to: 6, topics: ['Wiki', 'Agent Farm'], state: 'pending' }]
    });
    ok('‼️ a turn inside a marked RANGE is drawn as kept', /class="afwiki on"/.test(on));
    const outside = t.AFWiki.badge({
        session: 'S1', turn: 9,
        marks: [{ id: 'w1', from: 3, to: 6, topics: ['Wiki'], state: 'pending' }]
    });
    ok('…and a turn outside it is not', !/class="afwiki on"/.test(outside));
    const whole = t.AFWiki.badge({
        session: 'S1', turn: 4,
        marks: [{ id: 'w2', from: 0, to: 0, topics: ['Wiki'], state: 'pending' }]
    });
    ok('a whole-conversation mark (S-38) covers every turn in it', /class="afwiki on"/.test(whole));
    ok('covers() is the pool\'s own overlap rule, reachable for the surfaces',
        t.AFWiki.covers({ from: 0, to: 0 }, 12) === true
        && t.AFWiki.covers({ from: 3, to: 6 }, 2) === false);
}

// ============================================ the surfaces actually draw it
{
    const viewer = fs.readFileSync(path.join(ROOT, 'media', 'sessionViewer.js'), 'utf8');
    ok('the transcript\'s turn band carries the badge', /AFWiki\.badge\(\{/.test(viewer));
    ok('…and the marks it draws come down with the page\'s own data',
        /DATA\.wikiMarks/.test(viewer));
    const consoleJs = fs.readFileSync(path.join(ROOT, 'media', 'console.js'), 'utf8');
    ok('‼️ the Console hangs it on the PROMPT row — the backfill has no result rows',
        /m\.role === 'user'[\s\S]{0,1400}AFWiki\.badge/.test(consoleJs));
    ok('…and never on a steered message, which starts no turn',
        /!m\.steer && cur\.sessionId && window\.AFWiki/.test(consoleJs));
    const shell = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'base.ts'), 'utf8');
    ok('every page gets the component, so no surface has to opt in',
        /'media',\s*'afWiki\.js'/.test(shell));
    ok('…and the host answers for it in one place', /export function wikiMarkMessage/.test(shell));
    const css = fs.readFileSync(path.join(ROOT, 'media', 'common.css'), 'utf8');
    ok('the badge is quiet until the row is under the pointer',
        /\.msg:hover \.afwiki/.test(css) && /\.afwiki \{[^}]*opacity: \.22/.test(css));
    ok('…and a kept one stays lit whatever the pointer does',
        /\.afwiki\.on \{[^}]*opacity: 1/.test(css));
}

console.log(`test_wiki_tagger: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
