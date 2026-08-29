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

// ====================================== U-90/U-91: what a mark can be filed under
{
    const os = require('os');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'af-wiki-'));
    fs.mkdirSync(path.join(root, 'Ajanlar'));
    fs.writeFileSync(path.join(root, 'Ajanlar', 'Agent Farm.md'), '# x', 'utf8');
    fs.writeFileSync(path.join(root, 'Ajanlar', 'Kota.md'), '# x', 'utf8');
    fs.mkdirSync(path.join(root, 'Tarım'));                 // made in Obsidian, still empty
    fs.mkdirSync(path.join(root, '_KURALLAR_'));            // the wiki's own
    fs.writeFileSync(path.join(root, 'index.md'), '# i', 'utf8');

    const cats = W.readWikiCategories(root);
    ok('‼️ a folder somebody just made IS a category, page or no page',
        cats.some(c => c.name === 'Tarım' && c.pages === 0));
    ok('…and one that holds pages says how many',
        cats.some(c => c.name === 'Ajanlar' && c.pages === 2));
    ok('the wiki\'s own _ folders are not categories', !cats.some(c => c.name.startsWith('_')));
    ok('a file at the root is not one either', cats.length === 2);
    ok('an unreadable root answers nothing rather than throwing',
        W.readWikiCategories(path.join(root, 'nope')).length === 0);

    // ‼️ The name becomes a FOLDER, so it has to survive being one.
    ok('a separator would have made a second level and is removed',
        W.safeCategoryName('Ajanlar / Yol Haritası') === 'Ajanlar Yol Haritası');
    ok('every character Windows refuses goes with it',
        W.safeCategoryName('a\\b:c*d?e"f<g>h|i') === 'a b c d e f g h i');
    ok('‼️ a hyphen SURVIVES — it is how a family is spelled at one level',
        W.safeCategoryName('Teknoloji - Tarım') === 'Teknoloji - Tarım');
    ok('a trailing dot is dropped, because Windows would drop it silently',
        W.safeCategoryName(' Tarım. ') === 'Tarım');
    ok('a name that is nothing but punctuation comes back empty',
        W.safeCategoryName('  ///  ') === '');

    const made = W.createWikiCategory(root, 'Yeni / Konu');
    ok('a category is made under the root, at one level',
        made.ok && made.name === 'Yeni Konu' && fs.existsSync(path.join(root, 'Yeni Konu')));
    ok('…and it turns up in the list at once',
        W.readWikiCategories(root).some(c => c.name === 'Yeni Konu'));
    const again = W.createWikiCategory(root, 'yeni konu');
    ok('‼️ a category that exists is REPORTED, not duplicated in another spelling',
        again.ok && again.name === 'Yeni Konu' && again.existed === true);
    ok('a name that cleans away is refused with a reason',
        W.createWikiCategory(root, '::').ok === false);
    ok('the wiki\'s own _ prefix is refused', W.createWikiCategory(root, '_KURALLAR_').ok === false);
    ok('a device name Windows reserves is refused', W.createWikiCategory(root, 'CON').ok === false);
    ok('a root that is not there is refused rather than created',
        W.createWikiCategory(path.join(root, 'nope'), 'X').ok === false);
    fs.rmSync(root, { recursive: true, force: true });
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
            AFTip: { wrap: (btn, head, body, cls) => `${btn}<!--tip: ${head} | ${body} | ${cls || ''}-->` }
        },
        document: {
            body,
            createElement: () => {
                const e = mkEl();
                let raw = '';
                // ‼️ A REPAINT REPLACES THE MARKUP, so the elements the last
                // render handed out are gone and their listeners go with them.
                // A shim that kept them let every control fire once per repaint
                // it had lived through — an ArrowDown that moved two rows.
                Object.defineProperty(e, 'innerHTML', {
                    get() { return raw; },
                    set(v) {
                        raw = v;
                        Object.keys(nodes).forEach(k => {
                            if (k !== 'host' && nodes[k]) { nodes[k].listeners = {}; }
                        });
                    }
                });
                nodes.host = e;
                return e;
            },
            // The panel's Escape and the badge's click are document-level, and
            // a shim that swallowed them measured the two gestures the feature
            // is reached and left by.
            listeners: {},
            addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); },
            fire(ev, arg) { (this.listeners[ev] || []).forEach(f => f(arg || {})); },
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
            querySelectorAll: () => []
        },
        // Timers are RECORDED rather than dropped or run: the picker opens on
        // a 0ms one and the receipt closes the panel on an 1100ms one, and a
        // shim that ran both would close the panel in the middle of the tests
        // that read the receipt.
        timers: [],
        setTimeout: (fn, ms) => { sandbox.timers.push({ fn, ms: Number(ms) || 0 }); return sandbox.timers.length; },
        clearTimeout: () => { }, console
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    // The shell ships both to every page, and the tagger asks its one question
    // with the picker — a harness that loaded only half of that would measure a
    // panel that does not exist anywhere.
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'media', 'afCombo.js'), 'utf8'), sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'media', 'afWiki.js'), 'utf8'), sandbox);
    const AFWiki = sandbox.window.AFWiki;
    AFWiki.init(m => posted.push(m));
    // The panel is rebuilt into `nodes.host.innerHTML` on every render; the
    // controls are handed back by id, so the test finds them the way the
    // component's own render() does.
    const bind = (id) => { nodes[id] = nodes[id] || mkEl(); return nodes[id]; };
    /** Press one of the data-attribute controls the last render drew. */
    const press = (attr, value, ev) => {
        const list = (nodes.host && nodes.host.found && nodes.host.found['[' + attr + ']']) || [];
        const key = attr.slice(5).replace(/-([a-z])/g, (x, c) => c.toUpperCase());
        const el = list.find(e => e.dataset[key] === String(value));
        if (el) { el.fire(ev || 'click', { preventDefault() { }, stopPropagation() { } }); }
        return !!el;
    };
    /** Run every timer due by `ms`. */
    const tick = (ms) => {
        const due = sandbox.timers.filter(t => t.ms <= (ms === undefined ? 0 : ms));
        sandbox.timers = sandbox.timers.filter(t => t.ms > (ms === undefined ? 0 : ms));
        due.forEach(t => t.fn());
    };
    return {
        AFWiki, posted, bind, press, tick, nodes,
        doc: sandbox.document,
        html: () => (nodes.host ? nodes.host.innerHTML : '')
    };
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
    ok('a sure number does not cry wolf', !/check this/.test(h));
    ok('the panel says the vault is untouched', /Nothing is written to the vault/.test(h));
    ok('U-90: the question is asked with the picker', /id="afw-cat-in"/.test(h));
    ok('…whose list is not down until it is asked for', !/afc-pop/.test(h));
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
    const typed = t.bind('afw-cat-in');
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

    typed.value = 'Tur Numarasi';
    typed.fire('input');
    go.fire('click');
    const sent = t.posted.find(m => m.type === 'wikiMark');
    ok('‼️ a word left IN THE BOX still counts — pressing Keep does not lose it',
        sent && sent.topics.join('|') === 'Tur Numarasi');
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
    ok('a turn already kept opens with its own topics already picked',
        /class="afc-chip">Agent Farm/.test(t.html()));
    ok('…and the other topics are one press of the list away', (() => {
        const box = t.bind('afw-cat-in');
        t.AFWiki.receive({
            type: 'wikiAsk', session: 'S1', ok: true, from: 2, to: 2, exact: true,
            turnCount: 5, label: 'x',
            topics: [{ topic: 'Agent Farm', pending: 1, total: 1 }, { topic: 'Wiki', pending: 1, total: 1 }],
            marks: [{ id: 'w1', from: 2, to: 2, topics: ['Agent Farm'], state: 'pending' }]
        });
        box.fire('mousedown');
        t.tick(0);
        return /data-afc-pick="Wiki"/.test(t.html());
    })());
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

    // The box stays authoritative: what is typed there is what lights up — and
    // typing a TOPIC afterwards must not throw the span away.
    const range = t.bind('afw-range');
    const cat = t.bind('afw-cat-in');
    t.press('data-afw-tn', 4);     // a repaint, so both boxes get this render's listeners
    range.value = '1-3';
    range.fire('input');
    cat.value = 'wi';
    cat.fire('input');
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
        const typed = t.bind('afw-cat-in');
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
    t.AFWiki.wire();
    t.AFWiki.open({ session: 'S1', turn: 1 });
    const typed = t.bind('afw-cat-in');
    const wrap = t.bind('afw-wrap');
    const ask = {
        type: 'wikiAsk', session: 'S1', ok: true, from: 1, to: 1, exact: true,
        turnCount: 3, label: 'x', topics: [], marks: []
    };
    t.AFWiki.receive(ask);
    ok('the keyboard opens in the box that takes the answer', typed.focused > 0);
    // ‼️ Enter in a PICKER takes what is in it; the mark is kept by the next
    // one. A single Enter that both filed a topic and saved the mark would
    // close the panel on the reader mid-answer.
    typed.value = 'Wiki';
    typed.fire('keydown', { key: 'Enter', preventDefault() { }, stopPropagation() { } });
    ok('Enter takes the word as a topic rather than saving on top of it',
        /class="afc-chip">Wiki/.test(t.html()) && !t.posted.some(m => m.type === 'wikiMark'));
    typed.value = '';
    typed.fire('keydown', { key: 'Enter', preventDefault() { }, stopPropagation() { } });
    ok('…and Enter on an empty box is what keeps it',
        t.posted.some(m => m.type === 'wikiMark'));
    ok('…and a click on the backdrop closes it', (() => {
        wrap.fire('mousedown', { target: { id: 'afw-wrap' } });
        return !t.AFWiki.isOpen();
    })());
    // Esc: the picker's list first, the panel second — one key, two doors, in
    // the order the reader put them there.
    t.AFWiki.open({ session: 'S1', turn: 1 });
    t.AFWiki.receive(ask);
    const box = t.bind('afw-cat-in');
    t.AFWiki.receive(ask);
    box.fire('mousedown');
    t.tick(0);
    ok('the list comes down on a press of the box', /afc-pop/.test(t.html()));
    box.fire('keydown', { key: 'Escape', preventDefault() { }, stopPropagation() { } });
    ok('…and Esc puts it away without closing the panel',
        !/afc-pop/.test(t.html()) && t.AFWiki.isOpen());
    t.doc.fire('keydown', { key: 'Escape' });
    ok('…a second Esc closes the panel', !t.AFWiki.isOpen());
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
    const typed = u.bind('afw-cat-in');
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

// ============== U-120: the scope a chip carries, and the colour that says it
//
// ‼️ THE AGGREGATION ILLUSION. A mark on the WHOLE conversation covers turn 2,
// so pressing turn 2's badge ticks it alongside a mark that covers turns 1–3
// and nothing else. Two scopes, one colour, one list — and the reader files the
// next thing under whichever chip the eye landed on. What is measured here is
// that the two are told apart BEFORE the press, not after it.
{
    const marks = () => [
        { id: 'm1', from: 0, to: 0, topics: ['Agent Farm'], state: 'pending', exclude: [] },
        { id: 'm2', from: 1, to: 3, topics: ['Wiki'], state: 'pending', exclude: [] }
    ];
    const openAt = (o) => {
        const t = tagger();
        t.AFWiki.open({ session: 'S1', turn: 0, ts: 5, text: 'x', whole: !!o.whole });
        t.AFWiki.receive({
            type: 'wikiAsk', session: 'S1', ok: true, from: o.from, to: o.from, exact: true,
            turnCount: 10, label: 'x', topics: [], marks: o.marks || marks()
        });
        return t;
    };

    const t = openAt({ from: 2 });
    const h = t.html();
    ok('both marks that cover the pressed turn are ticked',
        /class="afc-chip whole">Agent Farm/.test(h) && /class="afc-chip">Wiki/.test(h));
    ok('‼️ …and only the session-wide one is warm — that is the whole item',
        !/class="afc-chip whole">Wiki/.test(h));
    ok('the hover counts the turns the way the cockpit says them',
        h.indexOf('tip: Whole session (10 turns) | Whole session') > 0);
    ok('…and a partial topic states the span rather than the count alone',
        h.indexOf('tip: 3 turns (3/10) | Turns: 1–3') > 0);
    ok('…and says where the topic already stands, apart from where it is going',
        /Already kept on turns 1–3\./.test(h));
    ok('the rich panel is used, so a 340px popover cannot clip it',
        / \| tip-free-->/.test(h));

    // ‼️ Item 4 — the colour follows the segmented control, live. A chip that
    // only reported the past would go amber AFTER the save, which is one press
    // too late to be a warning.
    ok('pressing Whole session repaints the chips', t.press('data-afw-scope', 'all'));
    const all = t.html();
    ok('‼️ …and a partial topic goes warm the moment the scope would make it session-wide',
        /class="afc-chip whole">Wiki/.test(all));
    ok('…and the hover says what the press would do, not only what is there',
        /Keeping it now files it on the whole session \(turns 1–10\)\./.test(all));

    // X-58's subtraction is part of the count, or the figure is a claim the
    // compile will not honour.
    ok('a turn is taken out of the whole-session scope', t.press('data-afw-ex', 4));
    const cut = t.html();
    ok('‼️ an excluded turn is subtracted from the chip that would gain it',
        cut.indexOf('tip: Whole session (9 of 10 turns) | Whole session · except 4') > 0);
    ok('…but a mark that ALREADY covers every turn is not reduced by it',
        cut.indexOf('tip: Whole session (10 turns) | Whole session') > 0);

    // A mark whose own exclusions came down the wire.
    const ex = openAt({
        from: 2,
        marks: [{ id: 'm3', from: 0, to: 0, topics: ['Wiki'], state: 'pending', exclude: [9, 10] }]
    });
    ok('‼️ a whole-session mark that leaves two turns out does not claim ten',
        ex.html().indexOf('tip: Whole session (8 of 10 turns) | Whole session · except 9–10') > 0);
    ok('…and it is still a session-wide chip, because that is what it is',
        /class="afc-chip whole">Wiki/.test(ex.html()));

    // A topic nobody has filed yet: the chip reports the pending scope alone.
    const fresh = openAt({ from: 2, marks: [] });
    const box = fresh.bind('afw-cat-in');
    box.value = 'Ajanlar';
    box.fire('input');
    box.fire('keydown', { key: 'Enter', preventDefault() { }, stopPropagation() { } });
    // Enter on a word nobody has filed offers to START the category, and the
    // name that comes back is the one that really exists on disk (U-91).
    fresh.AFWiki.receive({ type: 'wikiCategory', session: 'S1', ok: true, name: 'Ajanlar' });
    const nh = fresh.html();
    ok('a topic that is not kept anywhere yet says so',
        nh.indexOf('tip: 1 turn (1/10) | Turns: 2') > 0 && /Not kept yet\./.test(nh));
    ok('…and is drawn in the ordinary colour', /class="afc-chip">Ajanlar/.test(nh));

    // Item 3 — the same rule from the session badge, which has no turn at all.
    const w = openAt({ from: 0, whole: true });
    ok('‼️ the session-level popover tells the two apart by the same rule',
        /class="afc-chip whole">Agent Farm/.test(w.html())
        && /class="afc-chip whole">Wiki/.test(w.html()));
    ok('…and Wiki is warm THERE because the scope is the session, and says so',
        w.html().indexOf('Already kept on turns 1–3. Keeping it now files it on the whole session') > 0);

    // Item 5 — what this window is not.
    ok('the footer says the cockpit is where candidates are managed',
        /afw-role[^>]*>This window only ADDS topics/.test(t.html()));
}

// ============================ U-90/U-91: the picker, driven the way a hand does
{
    const ASK = {
        type: 'wikiAsk', session: 'S1', ok: true, from: 2, to: 2, exact: true,
        turnCount: 5, label: 'x',
        // The two lists are two facts and arrive separately: a folder with no
        // page yet, a topic with no folder yet, and one that is both.
        categories: [{ name: 'Ajanlar', pages: 2 }, { name: 'Tarım', pages: 0 }],
        topics: [{ topic: 'Ajanlar', pending: 1, total: 4 }, { topic: 'Kota', pending: 2, total: 2 }],
        marks: []
    };
    const opened = () => {
        const t = tagger();
        t.AFWiki.open({ session: 'S1', turn: 2 });
        t.AFWiki.receive(ASK);
        const box = t.bind('afw-cat-in');
        t.AFWiki.receive(ASK);
        box.fire('mousedown');
        t.tick(0);
        return { t, box };
    };

    const { t, box } = opened();
    const h = t.html();
    ok('‼️ pressing the empty box lists everything there is', /afc-pop/.test(h)
        && /data-afc-pick="Ajanlar"/.test(h) && /data-afc-pick="Tarım"/.test(h)
        && /data-afc-pick="Kota"/.test(h));
    ok('…each with the figure that tells them apart',
        (h.match(/class="afc-n">\d+</g) || []).length === 3);
    ok('‼️ a name in BOTH lists is one row, not two',
        (h.match(/data-afc-pick="Ajanlar"/g) || []).length === 1);
    ok('a folder says it is one, and how much is in it', /Wiki folder: 2 pages/.test(h));
    ok('…and a topic with no folder yet says that instead',
        /Not a folder yet/.test(h) && /Marked: 2 in the pool/.test(h));
    ok('nothing is offered as new while the box is empty', !/data-afc-new/.test(h));

    // Typing filters, and it filters in Turkish.
    box.value = 'tar';
    box.fire('input');
    ok('typing filters the list', /data-afc-pick="Tarım"/.test(t.html())
        && !/data-afc-pick="Kota"/.test(t.html()));
    ok('…and offers to start what it did not find, above what it did',
        t.html().indexOf('data-afc-new') > 0
        && t.html().indexOf('data-afc-new') < t.html().indexOf('data-afc-pick'));
    box.value = 'TARIM';
    box.fire('input');
    ok('‼️ and it folds case the Turkish way — TARIM finds Tarım',
        /data-afc-pick="Tarım"/.test(t.html()));
    ok('…so an exact match offers nothing to create', !/data-afc-new/.test(t.html()));

    // The create row, which is the one that writes to the vault.
    box.value = 'Tohum';
    box.fire('input');
    const mk = t.html();
    ok('‼️ a name nothing matches offers to START the category', /data-afc-new="1"/.test(mk));
    ok('…and it says plainly that Enter alone would not make a folder',
        /Enter on its own keeps the topic WITHOUT making a folder/.test(mk));
    ok('pressing it asks the host, and asks with what was typed', (() => {
        t.press('data-afc-new', '1', 'mousedown');
        const m = t.posted.filter(x => x.type === 'wikiCategory').pop();
        return m && m.name === 'Tohum' && m.session === 'S1';
    })());
    t.AFWiki.receive({
        type: 'wikiCategory', session: 'S1', ok: true, name: 'Tohum', existed: false,
        categories: [...ASK.categories, { name: 'Tohum', pages: 0 }], topics: ASK.topics, marks: []
    });
    ok('…and what comes back is picked, with the box cleared behind it',
        /class="afc-chip">Tohum/.test(t.html()) && !/value="Tohum"/.test(t.html()));

    // ‼️ The name that EXISTS wins over the name that was typed.
    const two = opened();
    two.box.value = 'ajanlar';
    two.box.fire('input');
    two.t.press('data-afc-new', '1', 'mousedown');
    ok('a spelling that already exists is not offered as new', !/data-afc-new/.test(two.t.html()));
    two.t.AFWiki.receive({
        type: 'wikiCategory', session: 'S1', ok: true, name: 'Ajanlar', existed: true,
        categories: ASK.categories, topics: ASK.topics, marks: []
    });
    ok('‼️ and when the host says it was already there, it is FILED UNDER THAT ONE',
        /class="afc-chip">Ajanlar/.test(two.t.html()) && !/afc-chip">ajanlar/.test(two.t.html()));
    ok('…and the reader is told, rather than left thinking they made one',
        /was already there/.test(two.t.html()));

    const bad = opened();
    bad.box.value = 'CON';
    bad.box.fire('input');
    bad.t.press('data-afc-new', '1', 'mousedown');
    bad.t.AFWiki.receive({
        type: 'wikiCategory', session: 'S1', ok: false, why: '"CON" is a name Windows reserves for a device.'
    });
    ok('a refusal is said IN the panel, in the host\'s own words',
        /Windows reserves for a device/.test(bad.t.html()));

    // Keyboard: the list is reachable without the mouse.
    const kb = opened();
    kb.box.fire('keydown', { key: 'ArrowDown', preventDefault() { }, stopPropagation() { } });
    ok('ArrowDown moves onto the second row', /class="afc-opt[^"]* hot"[^>]*data-afc-pick="Kota"/.test(kb.t.html()));
    kb.box.fire('keydown', { key: 'Enter', preventDefault() { }, stopPropagation() { } });
    ok('…and Enter takes the row the keyboard is on', /class="afc-chip">Kota/.test(kb.t.html()));
    kb.box.value = '';
    kb.box.fire('keydown', { key: 'Backspace', preventDefault() { }, stopPropagation() { } });
    ok('‼️ Backspace on an empty box takes the last one back off',
        !/class="afc-chip">Kota/.test(kb.t.html()));

    // The ✕ on a chip, and what finally goes on the wire.
    const pick = opened();
    const again = (p) => { p.box.fire('mousedown'); p.t.tick(0); };
    pick.t.press('data-afc-pick', 'Tarım', 'mousedown');
    ok('‼️ taking one puts the list away — it was drawn over the Keep button',
        !/afc-pop/.test(pick.t.html()));
    again(pick);
    pick.t.press('data-afc-pick', 'Kota', 'mousedown');
    ok('two picks are two chips', /afc-chip">Tarım/.test(pick.t.html()) && /afc-chip">Kota/.test(pick.t.html()));
    pick.t.press('data-afc-off', 'Tarım', 'mousedown');
    ok('…and the ✕ takes one back off', !/afc-chip">Tarım/.test(pick.t.html()));
    const go = pick.t.bind('afw-go');
    pick.t.AFWiki.receive(ASK);
    ok('‼️ what was PICKED is what is filed — nothing is retyped on the way out', (() => {
        again(pick);
        pick.t.press('data-afc-pick', 'Ajanlar', 'mousedown');
        go.fire('click');
        const sent = pick.t.posted.filter(m => m.type === 'wikiMark').pop();
        return sent && sent.topics.join('|') === 'Kota|Ajanlar';
    })());

    // filter() is the same function the markup and the keyboard both read, so
    // it is measured on its own rather than through a repaint.
    const box2 = { window: {}, document: { addEventListener() { } }, console };
    box2.globalThis = box2;
    vm.createContext(box2);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'media', 'afCombo.js'), 'utf8'), box2);
    const C = box2.window.AFCombo;
    const opts = [{ name: 'Kota' }, { name: 'Tarım' }, { name: 'Tarih' }, { name: 'Arıtma' }];
    ok('‼️ what STARTS with the query comes before what merely contains it',
        C.filter(opts, 'ar').map(o => o.name).join('|') === 'Arıtma|Tarım|Tarih');
    ok('an empty query is not a filter', C.filter(opts, '').length === 4);
    ok('a query nothing matches filters to nothing', C.filter(opts, 'zzz').length === 0);
    ok('exact() folds the same way the list does',
        C.exact(opts, 'TARIM') === true && C.exact(opts, 'tar') === false);
    // ‼️ U-120 — THE BOX IS SHARED, so what one owner needs must cost the other
    // owner nothing. The cockpit's row editor draws these chips over a mark
    // that already has exactly one scope and has nothing to add; it passes no
    // `chipMeta`, and its chips must come out exactly as they always did.
    const bare = C.html({ id: 'x', options: opts, picked: ['Kota'], query: '' });
    ok('‼️ a caller that says nothing about scope still gets the plain chip',
        /class="afc-chip">Kota/.test(bare) && !/af-tipw/.test(bare));
    box2.window.AFTip = { wrap: (t, h, b, c) => `${t}<!--${h}|${b}|${c}-->` };
    const rich = C.html({
        id: 'x', options: opts, picked: ['Kota'], query: '',
        chipMeta: n => ({ cls: 'whole', head: n, body: 'scope', tipCls: 'tip-free' })
    });
    ok('…and one that does gets the class and the hover on the same chip',
        /class="afc-chip whole">Kota/.test(rich) && rich.indexOf('<!--Kota|scope|tip-free-->') > 0);
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
    // U-120: the warm chip is the editor's own warning pair, not a hex that
    // only holds its contrast in the dark theme.
    ok('‼️ a session-wide chip is warm, in whichever theme it is read',
        /\.afc-chip\.whole \{[^}]*inputValidation-warningBackground/.test(css)
        && /\.afc-chip\.whole \{[^}]*editorWarning-foreground/.test(css));
    ok('and the role note stands on its own line rather than joining the one above',
        /\.afw-role \{[^}]*display: block/.test(css));
    // The scope has to reach the page to be drawn: a mark's exclusions travel
    // with it on the wire, or the count is a claim the compile will not honour.
    ok('‼️ the host sends each mark its exclusions',
        /exclude: c\.excludeTurns \?\? \[\]/.test(fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8'))
        && /state: string;\s*\n\s*exclude: number\[\]/.test(shell));
}

console.log(`test_wiki_tagger: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
