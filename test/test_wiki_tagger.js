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
            focused: 0,
            focus() { this.focused++; }, setSelectionRange() { },
            appendChild() { },
            getBoundingClientRect: () => ({ left: 120, top: 200, bottom: 216 }),
            // ‼️ The data-attribute controls are wired through querySelectorAll,
            // so a shim that answers [] measures the MARKUP and never the
            // gesture. This reads the attribute back out of the html the render
            // just wrote and hands over stubs the component then binds — which
            // is what lets a press on a turn chip be tested at all.
            querySelectorAll(sel) {
                const m = /^\[(data-[a-z-]+)\]$/.exec(sel);
                if (!m) { return []; }
                const camel = m[1].slice(5).replace(/-([a-z])/g, (x, c) => c.toUpperCase());
                const re = new RegExp(m[1] + '="([^"]*)"', 'g');
                const out = [];
                let hit;
                while ((hit = re.exec(this.innerHTML || ''))) {
                    const stub = mkEl();
                    stub.dataset[camel] = hit[1];
                    out.push(stub);
                }
                (this.found = this.found || {})[sel] = out;
                return out;
            },
            closest: () => null
        };
        return el;
    };
    const body = mkEl();
    const sandbox = {
        // The real AFTip wraps the button in its own markup; here the panel's
        // words are parked next to it, because what a badge SAYS is half of
        // what it is and a shim that drops the text measures only the pixels.
        window: {
            innerWidth: 1200, innerHeight: 900,
            AFTip: { wrap: (btn, head, body) => `${btn}<!--tip: ${head} | ${body}-->` }
        },
        document: {
            body,
            createElement: () => { const e = mkEl(); nodes.host = e; return e; },
            getElementById: (id) => {
                const el = nodes[id];
                // A repaint rewrites the control, so the element the component
                // finds carries the value the html it just wrote says it does —
                // the same as a real DOM, and the difference decides whether
                // carrying the boxes over a repaint is measured or assumed.
                if (el && nodes.host) {
                    const m = new RegExp('id="' + id + '"[^>]*value="([^"]*)"')
                        .exec(nodes.host.innerHTML || '');
                    if (m) { el.value = m[1].replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&'); }
                }
                return el || null;
            },
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
    /** Press one of the data-attribute controls the last render drew. */
    const press = (attr, value) => {
        const list = (nodes.host && nodes.host.found && nodes.host.found['[' + attr + ']']) || [];
        const key = attr.slice(5).replace(/-([a-z])/g, (x, c) => c.toUpperCase());
        const el = list.find(e => e.dataset[key] === String(value));
        if (el) { el.fire('click'); }
        return !!el;
    };
    return { AFWiki, posted, html: () => (nodes.host ? nodes.host.innerHTML : ''), bind, press, nodes };
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
    // U-93: the resolved turn is not a number in a box, it is the answer
    // already chosen — the badge on a turn would be pointless otherwise.
    ok('the resolved turn is the scope already chosen',
        /class="afw-seg on"[^>]*data-afw-scope="turn"[\s\S]{0,80}This turn \(2\)/.test(h));
    ok('…and the reader is told what it is out of', /turn 2 of 5/.test(h));
    ok('…without being asked to type a number', !/id="afw-range"/.test(h));
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
    // ‼️ U-93 — WHICH TURNS IS A CHOICE, AND THE GESTURE IS MEASURED, NOT THE
    // MARKUP. Every assertion below presses the control and then reads what
    // went on the wire, because a scope picker that renders beautifully and
    // sends the wrong span is exactly the failure this feature can have.
    const t = tagger();
    t.AFWiki.open({ session: 'S1', turn: 3 });
    const ask = {
        type: 'wikiAsk', session: 'S1', ok: true, from: 3, to: 3, exact: true,
        turnCount: 7, label: 'devam',
        topics: [{ topic: 'Wiki', pending: 1, total: 1 }], marks: []
    };
    t.AFWiki.receive(ask);
    ok('the three answers are all on the panel',
        /data-afw-scope="turn"/.test(t.html()) && /data-afw-scope="all"/.test(t.html())
        && /data-afw-scope="range"/.test(t.html()));
    ok('the whole session says how much that is', /Turns 1–7 — the whole conversation/.test(t.html()));

    // One press: the whole conversation.
    ok('the scope buttons are really wired', t.press('data-afw-scope', 'all'));
    ok('…and the whole session is chosen, not merely shown',
        /class="afw-seg on"[^>]*data-afw-scope="all"/.test(t.html()));

    // Two presses: a span, picked by pointing at the turns.
    t.press('data-afw-scope', 'range');
    ok('the range mode draws a chip per turn of the conversation',
        (t.html().match(/data-afw-tn="/g) || []).length === 7);
    ok('…and it opens on the turn that was pressed, not on turn 1',
        /class="afw-tn on"[^>]*data-afw-tn="3"/.test(t.html()));
    ok('the box is back as the escape hatch', /id="afw-range"[^>]*value="3"/.test(t.html()));
    ok('the turn chips are really wired', t.press('data-afw-tn', 5));
    ok('one press takes that turn alone',
        /id="afw-range"[^>]*value="5"/.test(t.html())
        && (t.html().match(/class="afw-tn on"/g) || []).length === 1);
    t.press('data-afw-tn', 2);
    ok('‼️ the second press stretches the span BACKWARDS as readily as forwards',
        /id="afw-range"[^>]*value="2-5"/.test(t.html())
        && (t.html().match(/class="afw-tn on"/g) || []).length === 4);
    // The third press starts over, so the gesture has no mode to be stuck in.
    t.press('data-afw-tn', 6);
    ok('a third press starts a new span rather than growing the old one',
        /id="afw-range"[^>]*value="6"/.test(t.html())
        && (t.html().match(/class="afw-tn on"/g) || []).length === 1);

    // The box stays authoritative: what is typed there is what lights up.
    const range = t.bind('afw-range');
    t.press('data-afw-chip', 0);   // a repaint, so the box gets this render's listeners
    range.value = '1-3';
    range.fire('input');
    t.press('data-afw-chip', 0);
    ok('‼️ the box still rules the chips — typing a span lights it up',
        (t.html().match(/class="afw-tn on"/g) || []).length === 3
        && /id="afw-range"[^>]*value="1-3"/.test(t.html()));
}

{
    // What each scope puts ON THE WIRE. A picker that renders beautifully and
    // files the wrong span is the failure this feature can actually have, so
    // each one is pressed and the message read back.
    const ask = {
        type: 'wikiAsk', session: 'S1', ok: true, from: 3, to: 3, exact: true,
        turnCount: 7, label: 'devam',
        topics: [{ topic: 'Wiki', pending: 1, total: 1 }], marks: []
    };
    const filed = (gesture) => {
        const t = tagger();
        t.AFWiki.open({ session: 'S1', turn: 3 });
        t.AFWiki.receive(ask);
        const typed = t.bind('afw-typed');
        const go = t.bind('afw-go');
        t.AFWiki.receive(ask);
        gesture(t);
        typed.value = 'Wiki';
        typed.fire('input');
        go.fire('click');
        return t.posted.filter(m => m.type === 'wikiMark').pop();
    };
    const whole = filed(t => t.press('data-afw-scope', 'all'));
    ok('‼️ "whole session" is filed as the pool\'s own whole-conversation span',
        whole && whole.from === 0 && whole.to === 0);
    const one = filed(() => { });
    ok('the turn that was pressed is filed untouched', one && one.from === 3 && one.to === 3);
    const span = filed(t => {
        t.press('data-afw-scope', 'range');
        t.press('data-afw-tn', 2);
        t.press('data-afw-tn', 5);
    });
    ok('‼️ a span picked by pointing is the span that is filed',
        span && span.from === 2 && span.to === 5);
}

{
    // A row the host could not place has no "this turn" to offer, and must not
    // pretend it does — it opens on the whole conversation.
    const t = tagger();
    t.AFWiki.open({ session: 'S1', turn: 0, ts: 5, text: 'unplaceable' });
    t.AFWiki.receive({
        type: 'wikiAsk', session: 'S1', ok: true, from: 0, to: 0, exact: true,
        turnCount: 4, label: '', topics: [], marks: []
    });
    ok('an unplaceable row offers no "this turn"', !/data-afw-scope="turn"/.test(t.html()));
    ok('…and opens on the whole conversation',
        /class="afw-seg on"[^>]*data-afw-scope="all"/.test(t.html()));

    // And a conversation the host could not count keeps the box rather than
    // drawing zero chips and looking broken.
    const u = tagger();
    u.AFWiki.open({ session: 'S1', turn: 2 });
    u.AFWiki.receive({
        type: 'wikiAsk', session: 'S1', ok: true, from: 2, to: 2, exact: true,
        turnCount: 0, label: '', topics: [], marks: []
    });
    u.press('data-afw-scope', 'range');
    ok('an uncounted conversation says so and keeps the box',
        /turn count is not known/.test(u.html()) && /id="afw-range"/.test(u.html()));
}

{
    // U-93 item 4 — the keyboard lands where the answer is typed, and both ways
    // out work. This is the part that was already right; it is pinned so it
    // stays right.
    const t = tagger();
    t.AFWiki.open({ session: 'S1', turn: 1 });
    const typed = t.bind('afw-typed');
    const wrap = t.bind('afw-wrap');
    t.AFWiki.receive({
        type: 'wikiAsk', session: 'S1', ok: true, from: 1, to: 1, exact: true,
        turnCount: 3, label: 'x', topics: [], marks: []
    });
    ok('the keyboard opens in the box that takes the answer', typed.focused > 0);
    typed.value = 'Wiki';
    typed.fire('keydown', { key: 'Enter' });
    ok('Enter saves from that box', t.posted.some(m => m.type === 'wikiMark'));
    ok('…and a click on the backdrop closes it', (() => {
        wrap.fire('mousedown', { target: { id: 'afw-wrap' } });
        return !t.AFWiki.isOpen();
    })());
    t.AFWiki.open({ session: 'S1', turn: 1 });
    t.bind('afw-typed').fire('keydown', { key: 'Escape' });
    ok('…as does Esc', !t.AFWiki.isOpen());
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

{
    // ‼️ U-94 — THE WHOLE-CONVERSATION BADGE. A surface with no rows (a session
    // card, a session's own heading) had no way to keep the lot except the
    // right-click menu, which is why the feature read as absent there.
    const t = tagger();
    const none = t.AFWiki.badge({ session: 'S1', whole: true, kept: [] });
    ok('the whole-session badge says so on the wire it will send',
        /data-afw-whole="1"/.test(none) && /data-afw-turn="0"/.test(none));
    ok('…and a conversation with nothing kept is quiet', !/class="afwiki on"/.test(none));
    ok('a whole-conversation mark lights it',
        /class="afwiki on"/.test(t.AFWiki.badge({ session: 'S1', whole: true, kept: [0] })));
    const parts = t.AFWiki.badge({ session: 'S1', whole: true, kept: [3, 7] });
    ok('‼️ turns kept ON THEIR OWN do NOT claim the whole conversation is kept',
        !/class="afwiki on"/.test(parts));
    ok('…but the reader is told they are there rather than left to wonder',
        /2 turns of this conversation are already kept|2 turns of it are kept/.test(parts));
    const wide = t.AFWiki.badge({
        session: 'S1', whole: true, label: 'Wiki', cls: 'secondary',
        marks: [{ id: 'w1', from: 0, to: 0, topics: ['Wiki'], state: 'pending' }]
    });
    ok('where there is room for a word it is a labelled button',
        /class="afwiki wide on secondary"/.test(wide) && /🔖 Wiki/.test(wide));
    ok('…and it names what the whole thing is filed under', /Filed under: Wiki/.test(wide));

    // What it asks the host, and what the host has to do with it.
    const u = tagger();
    u.AFWiki.open({ session: 'S1', whole: true, turn: 4 });
    ok('‼️ opening it asks for the WHOLE conversation, not for turn 4',
        u.posted[0] && u.posted[0].whole === true && u.posted[0].turn === 0);
    u.AFWiki.receive({
        type: 'wikiAsk', session: 'S1', ok: true, from: 0, to: 0, exact: true,
        turnCount: 9, label: '', topics: [], marks: []
    });
    ok('…and the panel opens on the whole conversation with nothing to check',
        /class="afw-seg on"[^>]*data-afw-scope="all"/.test(u.html()) && !/check this/.test(u.html()));
    const go = u.bind('afw-go');
    const typed = u.bind('afw-typed');
    u.AFWiki.receive({
        type: 'wikiAsk', session: 'S1', ok: true, from: 0, to: 0, exact: true,
        turnCount: 9, label: '', topics: [], marks: []
    });
    typed.value = 'Wiki';
    typed.fire('input');
    go.fire('click');
    const sent = u.posted.find(m => m.type === 'wikiMark');
    ok('…and it is filed as the whole conversation', sent && sent.from === 0 && sent.to === 0);
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
    // U-94: the surfaces that show a conversation rather than a row.
    ok('‼️ the session\'s own heading carries a labelled Wiki button',
        /actions: `\$\{window\.AFWiki[\s\S]{0,200}whole: true, label: 'Wiki'/.test(viewer));
    ok('‼️ every Console session card carries one too',
        /AFWiki\.badge\(\{\s*session: s\.sessionId, whole: true, kept: s\.wikiKept/.test(consoleJs));
    const panel = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'consolePanel.ts'), 'utf8');
    ok('…and the host sends each card the figure that badge needs, not every mark',
        /wikiKept: s\.sessionId \? wikiMarksOf\(s\.sessionId\)\.map\(m => m\.from\) : \[\]/.test(panel));
    ok('‼️ a whole-conversation ask is answered WITHOUT guessing a turn',
        shell.indexOf('msg.whole === true') > 0
        && shell.indexOf('msg.whole === true') < shell.indexOf('turnFor(turns, { ts:'));
    const css = fs.readFileSync(path.join(ROOT, 'media', 'common.css'), 'utf8');
    ok('the badge is quiet until the row is under the pointer',
        /\.msg:hover \.afwiki/.test(css) && /\.afwiki \{[^}]*opacity: \.22/.test(css));
    ok('the labelled badge reads as one of the buttons beside it',
        /\.afwiki\.wide \{/.test(css) && /\.srow:hover \.afwiki/.test(css));
    ok('…and a kept one stays lit whatever the pointer does',
        /\.afwiki\.on \{[^}]*opacity: 1/.test(css));
}

console.log(`test_wiki_tagger: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
