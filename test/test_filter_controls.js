// The shared filter controls (media/afFilters.js), which every "all or one"
// filter box in the extension was replaced by:
//   * AFFilter.multi   — a checkbox dropdown that expresses ANY subset
//                        (null = all · [] = none · [a,b] = exactly those),
//                        with Select all / Clear, and a menu that survives the
//                        page re-render each tick causes;
//   * AFFilter.live    — filter boxes apply AS YOU TYPE (debounced), with the
//                        caret surviving the re-render the filter triggers.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const createAfmsDom = require(path.join(__dirname, 'lib_afms_dom.js'));
const code = fs.readFileSync(path.resolve(__dirname, '../media/afFilters.js'), 'utf8');
/** The other half of this component: a width and a cut are only worth writing
 *  if the sheet honours them (A-14). */
const css = fs.readFileSync(path.resolve(__dirname, '../media/common.css'), 'utf8');

// ---------------------------------------------------------------- harness
// One "page": a html string the picker is rendered into, plus a render()
// that rebuilds it — exactly the loop every real page runs.
let rendered = '';
let timers = [];
const runTimers = () => { const t = timers; timers = []; t.forEach(fn => fn()); };

const ms = createAfmsDom(() => rendered);
const sandbox = {
    window: { AFTip: { wrap: (trigger, head, body, cls) =>
        `<span class="af-tipw ${cls || ''}">${trigger}<span class="af-tiph">${head}</span><span class="af-tipb">${body}</span></span>` } },
    document: {
        querySelector: (s) => ms.querySelector(s),
        querySelectorAll: () => [],
        addEventListener: () => { }
    },
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    clearTimeout: (h) => { if (h) { timers[h - 1] = () => { }; } },
    console
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const AF = sandbox.window.AFFilter;

// ------------------------------------------------------------- markup ----
const AGENTS = ['dev', 'manager', 'psy'];
const render = (selected, extra) => {
    rendered = AF.multi(Object.assign({
        id: 'p1', label: 'Agents', options: AGENTS, selected
    }, extra || {}));
};

render(null);
ok('unfiltered: every box ticked and the button says "all"',
    ms.label('p1') === 'Agents: all' && ms.ticked('p1').length === 3);
ok('the menu carries Select all and Clear', rendered.includes('>Select all<') && rendered.includes('>Clear<'));
ok('the menu starts closed', !ms.isOpen('p1'));

render(['dev']);
ok('a single pick is named on the button', ms.label('p1') === 'Agents: dev' && ms.ticked('p1').length === 1);
render(['dev', 'psy']);
ok('a subset is counted on the button', ms.label('p1') === 'Agents: 2/3');
render([]);
ok('an empty pick says "none", not "all"', ms.label('p1') === 'Agents: none' && ms.ticked('p1').length === 0);
render(null, { allLabel: 'any' });
ok('allLabel overrides the unfiltered word', ms.label('p1') === 'Agents: any');
render(null, { disabled: true });
ok('a disabled picker renders disabled', rendered.includes('disabled'));

// values with quotes/angles must not break out of the markup
rendered = AF.multi({ id: 'esc', label: 'X', options: ['a"b<c'], selected: null });
ok('option values are escaped', rendered.includes('&quot;') && rendered.includes('&lt;') && !rendered.includes('a"b<c'));

// -------------------------------------------------------- the wiring ----
// The page loop: onChange stores the pick and re-renders, like every page does.
let picked;
let renders = 0;
const wire = () => AF.wireMulti({
    id: 'p1',
    onChange: sel => { picked = sel; renders++; render(sel); wire(); }
});
render(null); wire();

ms.toggle('p1', 'manager', false);
ok('unticking one sends exactly the rest', JSON.stringify(picked) === '["dev","psy"]');
ok('the re-rendered picker shows the same pick', ms.label('p1') === 'Agents: 2/3');
ok('the menu stayed OPEN across the re-render', ms.isOpen('p1'));

ms.toggle('p1', 'psy', false);
ok('a second untick narrows further', JSON.stringify(picked) === '["dev"]');

ms.selectAll('p1');
ok('Select all means NO filter (null), not "every value listed"', picked === null);
ok('and the button goes back to "all"', ms.label('p1') === 'Agents: all');

ms.clear('p1');
ok('Clear is an honest empty set', JSON.stringify(picked) === '[]' && ms.label('p1') === 'Agents: none');

ms.only('p1', ['manager', 'psy']);
ok('clear-then-tick-two expresses an arbitrary subset', JSON.stringify(picked) === '["manager","psy"]');

// ‼️ THE NAME IS ITS OWN CONTROL — "only this", in one gesture rather than
// Clear plus a tick. The checkbox next to it still toggles, which is why the
// two stopped being one <label>.
ms.clickName('p1', 'psy');
ok('clicking a name means ONLY that one', JSON.stringify(picked) === '["psy"]');
ok('…and the button says so', ms.label('p1') === 'Agents: psy');
ms.toggle('p1', 'dev', true);
ok('the checkbox still toggles, so "only" is not a mode you get stuck in',
    JSON.stringify(picked) === '["dev","psy"]');
ok('the row is no longer a <label> — a label hands every click to its box',
    !/<label class="afms-item"/.test(rendered) && /data-afms-only=/.test(rendered));
ok('a picker with no presets declares none', ms.presets('p1').length === 0);

// the two gestures are explained on the button, once, for every picker
ok('the hint says what a name-click does',
    /Click a NAME to show only that one/.test(AF.multi({ id: 'p5', options: AGENTS })));

// ---- K-16: the hover says WHAT IS TICKED before it says anything else ----
//
// The button can only ever read `Agents: 2/3` once more than one thing is on,
// so the single question a reader has in front of a filtered list — *which
// two?* — could only be answered by OPENING the menu, a gesture that means "I
// am about to change this". Every picker in the extension gets this from the
// component, so no page can word it differently.
{
    const tip = h => {
        const head = (/<span class="af-tiph">([\s\S]*?)<\/span>/.exec(h) || [, ''])[1];
        const body = (/<span class="af-tipb">([\s\S]*?)<\/span>/.exec(h) || [, ''])[1];
        return head + '\n\n' + body;
    };
    const two = tip(AF.multi({ id: 'k16a', label: 'Agents', options: AGENTS, selected: ['dev', 'psy'] }));
    ok('‼️ the whole selection is named, not counted', /^Agents: dev · psy/.test(two));
    ok('…and the standing explanation still follows it, after a blank line',
        /Agents: dev · psy\n\n[\s\S]*Click a NAME/.test(two));
    ok('nothing narrowed reads as the picker\'s own word for "all"',
        /^Agents: everything/.test(tip(AF.multi({
            id: 'k16b', label: 'Agents', allLabel: 'everything', options: AGENTS, selected: null
        }))));
    ok('an empty selection says none rather than falling back to all',
        /^Agents: none/.test(tip(AF.multi({
            id: 'k16c', label: 'Agents', options: AGENTS, selected: []
        }))));
    ok('a page\'s own subject line sits between the selection and the grammar',
        /^Agents: dev\n\nwho ran it\n\n[\s\S]*Click a NAME/.test(tip(AF.multi({
            id: 'k16d', label: 'Agents', options: AGENTS, selected: ['dev'], title: 'who ran it'
        }))));
}

// ---- A-14: the button is a fixed width and a short readout -----------------
//
// The backlog's control row rocked back and forth under the hand: choosing
// "filed — has a code" grew the button by forty characters, pushed the tail of
// the row onto a second line, and undoing the choice pulled it back. Two halves
// to the fix, and both belong in the component because every picker in the
// extension has the same shape.
{
    const SENTENCES = [
        { v: 'coded', t: 'filed — has a code' },
        { v: 'unfiled', t: '📥 unfiled' }
    ];
    const one = AF.multi({ id: 'a14a', label: 'filing', allLabel: 'any', options: SENTENCES, selected: ['coded'] });
    const text = (/data-afms="a14a"[^>]*>([^<]*)</.exec(one) || [, ''])[1];
    ok('‼️ a sentence-shaped option is cut to its head on the button',
        /filing: filed… ▾/.test(text));
    ok('…at the dash, never mid-word', !/has a cod/.test(text));

    const tipHead = (/<span class="af-tiph">([\s\S]*?)<\/span>/.exec(one) || [, ''])[1];
    ok('…and the hover still carries it whole, which is where it belongs',
        /filing: filed — has a code/.test(tipHead));

    const widthOf = h => Number((/style="width:(\d+)ch"/.exec(h) || [, 0])[1]);
    ok('‼️ the button reserves the widest text it could ever print', widthOf(one) >= 20);
    ok('…so every state of the same picker is the same width',
        widthOf(one) === widthOf(AF.multi({ id: 'a14b', label: 'filing', allLabel: 'any', options: SENTENCES, selected: null }))
        && widthOf(one) === widthOf(AF.multi({ id: 'a14c', label: 'filing', allLabel: 'any', options: SENTENCES, selected: [] }))
        && widthOf(one) === widthOf(AF.multi({ id: 'a14d', label: 'filing', allLabel: 'any', options: SENTENCES, selected: ['coded', 'unfiled'] })));
    ok('…and a picker with short options does not reserve a picker\'s worth of nothing',
        widthOf(AF.multi({ id: 'a14e', label: 'due', allLabel: 'any', options: ['yes', 'no'] })) < widthOf(one));

    // The button says `state: 2/4` in words. A second signal for the same fact,
    // arriving on a control the user never asked to have redecorated, read as a
    // stray bracket beside the box.
    ok('‼️ nothing is drawn on the button to repeat what its text already says',
        !/is-filtered/.test(one) && !/is-filtered/.test(css));
    ok('…and the fixed width is honoured with an ellipsis rather than a clip',
        /\.afms-btn\s*\{[^}]*text-overflow:\s*ellipsis/.test(css)
        && /\.afms-btn\s*\{[^}]*text-align:\s*left/.test(css));
}

// the button click toggles the menu without touching the selection
const before = renders;
ms.open('p1');
ok('opening the menu is not a filter change', renders === before);

// a page that answers WITHOUT re-rendering (Search re-runs the query instead)
{
    let last;
    rendered = AF.multi({ id: 'p2', label: 'Agents', options: AGENTS, selected: null });
    AF.wireMulti({ id: 'p2', onChange: sel => { last = sel; } });
    const btn = ms.querySelector('[data-afms="p2"]');
    ms.toggle('p2', 'dev', false);
    ok('the button relabels itself when the page does not re-render',
        btn.textContent === 'Agents: 2/3 ▾' && JSON.stringify(last) === '["manager","psy"]');
}

// an options list that is empty must not claim "everything is picked"
{
    let last = 'untouched';
    rendered = AF.multi({ id: 'p3', label: 'Agents', options: [], selected: null });
    ok('an empty picker says so', rendered.includes('nothing to filter by'));
    AF.wireMulti({ id: 'p3', onChange: sel => { last = sel; } });
    ok('an empty picker has nothing to click', last === 'untouched');
}

// ------------------------------------------------------------ presets ----
// A named subset a particular list has a word for. The component knows the
// mechanism; only the page knows what the word means.
{
    let last = 'untouched';
    rendered = AF.multi({
        id: 'p4', label: 'show', options: ['user', 'agent', 'tool', 'result'],
        selected: null,
        presets: [{ id: 'dialog', label: 'Dialog', values: ['agent', 'user'], title: 'just the conversation' }]
    });
    ok('a preset is offered between Select all and Clear',
        /Select all<\/a> · <a data-afms-preset="dialog"[^>]*>Dialog<\/a> · <a data-afms-act="none">Clear/.test(rendered));
    AF.wireMulti({ id: 'p4', onChange: sel => { last = sel; } });
    ms.preset('p4', 'dialog');
    ok('pressing it ticks exactly its values', JSON.stringify(last) === '["user","agent"]');
}

// ------------------------------- U-131: right-click is the switch --------
//
// ‼️ THE BOX IS OPENED ALL DAY TO DO ONE THING. Dropping to the conversation
// and coming back is not a choice between four options, it is a switch — and a
// switch that costs a click, a read and two ticks is not a switch. It lives in
// the component because the same box is drawn on nine pages: one gesture, or
// nine that disagree.
{
    let last = 'untouched';
    const draw = (selected) => {
        rendered = AF.multi({
            id: 'p9', label: 'show', options: ['user', 'agent', 'tool', 'result'],
            selected,
            presets: [{ id: 'dialog', label: 'Dialog', values: ['agent', 'user'] }]
        });
        AF.wireMulti({ id: 'p9', onChange: sel => { last = sel; } });
    };

    draw(null);
    ok('‼️ U-131: right-clicking an unfiltered picker drops it to the first preset',
        ms.rightClick('p9') && JSON.stringify(last) === '["user","agent"]');

    // ‼️ …and back is `null`, not "all four ticked". The component's own
    // vocabulary for unfiltered is `null` (see the header), so the flip has to
    // land on the SAME state an untouched picker is in — a page told
    // `[a,b,c,d]` would file that as a filter somebody set.
    draw(['user', 'agent']);
    ok('‼️ U-131: …and right-clicking it again comes back to unfiltered',
        ms.rightClick('p9') && last === null && ms.ticked('p9').length === 4);

    // ‼️ THE THIRD STATE IS NOT A THIRD RULE. Somebody who reaches for a
    // shortcut in the middle of a hand-built filter means "take me to the
    // preset" — not "take me to everything", which would throw the filter away
    // and give them the noise they were escaping.
    draw(['tool']);
    ok('‼️ U-131: from ANY other combination it goes to the preset first',
        ms.rightClick('p9') && JSON.stringify(last) === '["user","agent"]');

    // A preset naming a value this list does not have is not missing — the
    // preset is written against a vocabulary, not against one render.
    rendered = AF.multi({
        id: 'p10', label: 'show', options: ['agent', 'tool'], selected: null,
        presets: [{ id: 'dialog', label: 'Dialog', values: ['agent', 'user'] }]
    });
    AF.wireMulti({ id: 'p10', onChange: sel => { last = sel; } });
    ok('U-131: a preset value this list does not have is simply not there',
        ms.rightClick('p10') && JSON.stringify(last) === '["agent"]');

    // ‼️ AND THE GESTURE IS ANNOUNCED. A right-click nobody is told about is a
    // right-click nobody uses (Principle 1).
    ok('‼️ U-131: the hover says the gesture exists, and names what it flips to',
        /RIGHT-CLICK flips between everything and Dialog/.test(rendered));

    // ‼️ …AND A PICKER WITH NO PRESET DOES NOTHING AT ALL. No listener, so the
    // platform's own menu is untouched: a gesture that silently does nothing on
    // the other pages is worse than no gesture.
    rendered = AF.multi({ id: 'p11', label: 'Agents', options: AGENTS, selected: null });
    AF.wireMulti({ id: 'p11', onChange: sel => { last = sel; } });
    last = 'untouched';
    ok('‼️ U-131: a picker with no preset does not take the right-click at all',
        ms.rightClick('p11') === false && last === 'untouched');
    ok('…and says nothing about a gesture it does not have',
        !/RIGHT-CLICK/.test(rendered));

    // ‼️ K-46 — A PICKER THAT ASKS FOR IT STEPS THROUGH EVERY PRESET: everything →
    // Dialog → Natural → everything; from anything else, the first preset.
    const two = [{ id: 'dialog', label: 'Dialog', values: ['agent', 'user'] },
        { id: 'natural', label: 'Natural', values: ['agent', 'user', 'system'] }];
    const drawCycle = (selected, cycle) => {
        rendered = AF.multi({ id: 'p12', label: 'show', options: ['user', 'agent', 'tool', 'system'], selected, presets: two, cycle });
        AF.wireMulti({ id: 'p12', onChange: sel => { last = sel; } });
    };
    drawCycle(null, true);
    ok('‼️ K-46: everything → the first preset', ms.rightClick('p12') && JSON.stringify(last) === '["user","agent"]');
    drawCycle(['user', 'agent'], true);
    ok('‼️ K-46: …the first preset → the second', ms.rightClick('p12') && JSON.stringify(last) === '["user","agent","system"]');
    drawCycle(['user', 'agent', 'system'], true);
    ok('‼️ K-46: …the last preset → back to everything', ms.rightClick('p12') && last === null);
    drawCycle(['tool'], true);
    ok('K-46: …any other combination → the first preset', ms.rightClick('p12') && JSON.stringify(last) === '["user","agent"]');
    ok('‼️ K-46: the hover names the whole round', /RIGHT-CLICK steps from everything through Dialog → Natural and back to everything/.test(rendered));
    drawCycle(['user', 'agent'], undefined);
    ok('‼️ K-46: a picker with two presets that does not ask for it still flips between everything and its first',
        ms.rightClick('p12') && last === null && /RIGHT-CLICK flips between everything and Dialog/.test(rendered));
}

// ------------------------------------------- U-92: a long menu finds ----
//
// ‼️ THE PICKER EARNS ITS FIND BOX BY BEING LONG, AND NOBODY HAS TO REMEMBER
// TO ASK FOR IT. A list of five is a list you read; the wiki's topics passed
// thirty and became a list you scroll past the thing you wanted. So the
// threshold lives in the component: every picker in the extension that grows
// gets the box on the day it grows, and a list that is deliberately
// short-and-ordered turns it off by name.
{
    const CATS = [
        'Agent Farm', 'Airtable Motoru', 'Ajanlar', 'Claude Code', 'Felsefe', 'Kota',
        'LLM Wiki', 'Mimari', 'Oturum Ekonomisi', 'Parity Kapısı', 'Süreç Yönetimi',
        'Tarım', 'Teknoloji - Tarım', 'Wiki Derleme'
    ];
    sandbox.document.querySelectorAll = sel => ms.querySelectorAll(sel);

    rendered = AF.multi({ id: 'short', label: 'Agents', options: AGENTS, selected: null });
    ok('a short list draws no find box — it would be furniture', !ms.hasFind('short'));
    rendered = AF.multi({ id: 'long', label: 'topic', options: CATS, selected: null });
    ok('a long one draws its own, without the page asking', ms.hasFind('long'));
    rendered = AF.multi({ id: 'off', label: 'topic', options: CATS, selected: null, search: false });
    ok('…and search:false is how a deliberately ordered list opts out', !ms.hasFind('off'));
    rendered = AF.multi({ id: 'on', label: 'Agents', options: AGENTS, selected: null, search: true });
    ok('…search:true forces one onto a short list', ms.hasFind('on'));

    // the page loop, exactly as a real page runs it
    let sel = null;
    let paints = 0;
    const paint = () => {
        rendered = AF.multi({ id: 'cats', label: 'topic', options: CATS, selected: sel });
        paints++;
        AF.wireMulti({ id: 'cats', onChange: s => { sel = s; paint(); } });
    };
    paint();

    ms.open('cats');
    ms.find('cats', 'wiki');
    ok('typing narrows the menu to what matches',
        JSON.stringify(ms.shown('cats')) === '["LLM Wiki","Wiki Derleme"]');
    ok('…and hiding a row is not unticking it — the pick is untouched',
        sel === null && ms.ticked('cats').length === CATS.length);

    // ‼️ Folded the Turkish way. `TARIM`.toLowerCase() is `tarim`, which does
    // not find `Tarım` — and the user filters their own categories in their own
    // language, on a page whose every topic is Turkish.
    ms.find('cats', 'TARIM');
    ok('‼️ the fold is Turkish, so TARIM finds Tarım',
        JSON.stringify(ms.shown('cats')) === '["Tarım","Teknoloji - Tarım"]');

    ms.find('cats', 'zzz');
    ok('nothing matching says so rather than showing an empty menu',
        ms.shown('cats').length === 0 && ms.noMatch('cats'));

    // ‼️ Select all acts on WHAT IS SHOWN, because with `wiki` typed that is
    // unmistakably what the reader means — and with an empty box the two are
    // the same thing, which is why this is not a second mode to learn.
    ms.find('cats', 'wiki');
    ok('the tools row says which it is about to do', /shown/.test(ms.allLabel('cats')));
    ms.clear('cats');
    ok('Clear empties only the rows on screen',
        JSON.stringify(sel).indexOf('Wiki Derleme') < 0 && sel.indexOf('Mimari') >= 0
        && sel.length === CATS.length - 2);
    ok('…and the find survives the re-render that answer caused',
        ms.findText('cats') === 'wiki' && ms.shown('cats').length === 2);
    ms.selectAll('cats');
    ok('Select all puts back exactly those rows', sel === null);

    ms.findEscape('cats');
    ok('Escape empties the box rather than closing the menu under the hand',
        ms.findText('cats') === '' && ms.shown('cats').length === CATS.length && ms.isOpen('cats'));
    ok('…and the tools row goes back to plain words', ms.allLabel('cats') === 'Select all');

    // ‼️ A find belongs to the visit that typed it: it must survive the tick's
    // re-render and must NOT survive the menu closing. Reopening onto a list
    // silently cut down to `tar` is the invisible-filter trap all over again.
    ms.find('cats', 'tar');
    ok('a find is in force while the menu is open', ms.shown('cats').length === 2);
    AF._closeMenus();
    ok('closing the menu forgets it — the box, the rows and the tools row',
        ms.findText('cats') === '' && ms.shown('cats').length === CATS.length
        && ms.allLabel('cats') === 'Select all' && !ms.noMatch('cats'));
    ok('…and closing is not a filter change', sel === null);

    sandbox.document.querySelectorAll = () => [];
}

// ------------------------------------------------------- live typing ----
{
    // a text box that filters, and a page that re-renders it on every change
    const mkInput = (value) => ({
        tagName: 'INPUT', value, className: 'af-ftext', id: '',
        selectionStart: value.length, selectionEnd: value.length,
        listeners: {}, focused: false,
        addEventListener(ev, fn) { this.listeners[ev] = fn; },
        getAttribute: () => null,
        focus() { this.focused = true; },
        setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; }
    });
    let box = mkInput('');
    let applied = [];
    sandbox.document.querySelectorAll = (sel) => (sel === 'input.af-ftext' ? [box] : []);

    AF.live(box, el => { applied.push(el.value); }, 200);
    box.value = 'ti';
    box.listeners.input();
    box.value = 'title2';
    box.listeners.input();
    ok('typing does not fire per keystroke', applied.length === 0);
    runTimers();
    ok('one debounced apply carries the final text', JSON.stringify(applied) === '["title2"]');

    // blur / Enter commits at once, and never a second time for the same text
    box.listeners.change();
    ok('a commit with unchanged text is not applied twice', applied.length === 1);
    box.value = 'title3';
    box.listeners.change();
    ok('a commit with new text applies immediately', JSON.stringify(applied) === '["title2","title3"]');

    // the caret survives the re-render the filter triggers
    const older = box;
    box = mkInput('title3');
    box.selectionStart = box.selectionEnd = 0;   // the fresh element starts at 0
    older.value = 'title';
    older.selectionStart = older.selectionEnd = 3;
    older.listeners.change();
    ok('focus lands back on the re-rendered box', box.focused === true);
    ok('and the caret is where it was', box.selectionStart === 3 && box.selectionEnd === 3);

    // ---- U-98: a live box is a box whose caret can be read --------------
    //
    // ‼️ THE BUG THIS REPLACES AN ASSUMPTION WITH. `<input type="number">` has
    // no selection API — `selectionStart` answers null (older Chromium threw)
    // and `setSelectionRange` is refused. So the caret machinery ran on the
    // min/max filters, saved nothing and restored nothing, while `restore()`
    // still put the focus back — and a freshly focused input starts at 0. Every
    // keystroke threw the caret to the far left, so `120` came out `021`. The
    // old test here asserted the box "filters without a caret to save", which
    // wrote the defect down as the contract.
    //
    // `live()` now converts such a box at the door, on the way in AND on the
    // way back from the re-render, because the element restore finds is a new
    // one built from the same markup.
    const mkNum = (value) => {
        const attrs = { type: 'number' };
        return {
            tagName: 'INPUT', value, className: 'af-count', id: '', type: 'number',
            selectionStart: null, selectionEnd: null, listeners: {}, focused: false,
            addEventListener(ev, fn) { this.listeners[ev] = fn; },
            getAttribute(a) { return attrs[a] === undefined ? null : attrs[a]; },
            setAttribute(a, v) { attrs[a] = v; },
            focus() { this.focused = true; },
            setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; }
        };
    };
    let num = mkNum('');
    let numApplied = 0;
    sandbox.document.querySelectorAll = (sel) => (sel === 'input.af-count' ? [num] : []);
    AF.live(num, () => { numApplied++; }, 50);
    ok('‼️ a number box handed to live() is turned into one with a caret',
        num.type === 'text');
    ok('…and keeps the numeric keypad it had, so nothing is lost but the spinner',
        num.getAttribute('inputmode') === 'numeric');
    num.value = '5000';
    num.listeners.input();
    runTimers();
    ok('a number box filters as you type', numApplied === 1);

    // the caret survives the re-render, which is the whole report
    {
        const older = num;
        older.value = '120';
        older.selectionStart = older.selectionEnd = 3;
        num = mkNum('120');                    // the re-render builds it fresh…
        num.selectionStart = num.selectionEnd = 0;
        older.listeners.change();
        ok('‼️ …and the box restore lands on is converted before the focus does',
            num.type === 'text' && num.focused === true);
        ok('‼️ …so the caret comes back where it was instead of jumping to the far left',
            num.selectionStart === 3 && num.selectionEnd === 3);
    }

    // a box that is already text is left exactly as it was
    {
        const plain = mkNum('x'); plain.type = 'text';
        AF.live(plain, () => { }, 50);
        ok('a text box is not touched — no inputmode is invented for it',
            plain.type === 'text' && plain.getAttribute('inputmode') === null);
    }

    ok('live() on a missing element is a no-op', AF.live(null, () => { }) === undefined);

    // ---- A-4: a date box is never filtered while its calendar is open ------
    //
    // ‼️ THE REPORTED RANDOMNESS HAD ONE CAUSE. `fn` repaints the page, and a
    // repaint replaces the element — so the native calendar popup, which hangs
    // off the element it was opened from, shut itself. `<input type="date">`
    // fires `input` whenever its three segments happen to form a valid date,
    // which during a picker gesture is while you are still moving through it:
    // the calendar closed under the cursor before a day had been chosen, and
    // only sometimes, because it depended on where in the popup you had got to.
    // `change` is the event that means A DATE WAS CHOSEN, and by then the popup
    // has closed itself — so nothing is lost by waiting for it.
    const mkDate = () => ({
        tagName: 'INPUT', type: 'date', value: '', className: 'af-ffrom', listeners: {},
        addEventListener(ev, fn) { this.listeners[ev] = fn; },
        getAttribute: () => null, focus() { }, selectionStart: null, selectionEnd: null
    });
    const d = mkDate();
    let dApplied = 0;
    sandbox.document.querySelectorAll = () => [];
    AF.live(d, () => { dApplied++; }, 50);
    ok('‼️ a date box has no as-you-type listener at all', d.listeners.input === undefined);
    d.value = '2026-08-01';
    d.listeners.change();
    runTimers();
    ok('…and commits on change, which is what "a date was chosen" means', dApplied === 1);
    d.value = '';
    d.listeners.change();
    ok('…clearing it is a change too, so the filter really widens again', dApplied === 2);

    // the other picker-backed types have the same popup and the same problem
    const dt = mkDate(); dt.type = 'datetime-local';
    AF.live(dt, () => { }, 50);
    ok('…the rule covers every type with a native picker', dt.listeners.input === undefined);
    const txt = mkDate(); txt.type = 'text';
    AF.live(txt, () => { }, 50);
    ok('…and a plain text box still filters as you type', typeof txt.listeners.input === 'function');
}

// ---------------------------------------------------------------- clearable
//
// U-3: a search box you cannot empty in one press is a search box you retype.
// The ✕ is BORN AND DIES WITH THE TEXT rather than being hidden and shown — an
// empty box with a dead ✕ in it is a control claiming it can do something.
{
    const made = [];
    const mkNode = (tag) => ({
        tagName: String(tag).toUpperCase(), className: '', type: 'button', textContent: '',
        style: {}, children: [], listeners: {}, dataset: {}, title: '',
        addEventListener(ev, fn) { this.listeners[ev] = fn; },
        appendChild(c) { this.children.push(c); c.parent = this; },
        insertBefore(n) { this.children.push(n); n.parent = this; },
        remove() { if (this.parent) { this.parent.children = this.parent.children.filter(x => x !== this); } },
        focus() { this.focused = true; }
    });
    sandbox.document.createElement = (tag) => { const n = mkNode(tag); made.push(n); return n; };

    const parent = mkNode('div');
    const box = mkNode('input');
    box.type = 'text';
    box.value = '';
    box.parent = parent;
    box.parentNode = parent;
    box.dispatchEvent = () => { };

    let cleared = 0;
    AF.clearable(box, () => { cleared++; });
    const wrap = made.find(n => n.className === 'af-clr');
    ok('the box is wrapped in place', !!wrap && wrap.children.indexOf(box) >= 0);
    ok('‼️ no ✕ while the box is empty — a clear button on nothing is furniture',
        wrap.children.filter(c => c.className === 'af-clrx').length === 0);

    box.value = 'parser';
    box.listeners.input();
    const x = wrap.children.find(c => c.className === 'af-clrx');
    ok('typing brings the ✕ into being', !!x && x.textContent === '✕');

    x.listeners.click();
    ok('pressing it empties the box', box.value === '');
    ok('…tells the page, so clearing IS a filter change', cleared === 1);
    ok('…puts the caret back where the typing was', box.focused === true);
    ok('…and takes itself away again', wrap.children.filter(c => c.className === 'af-clrx').length === 0);

    AF.clearable(box, () => { });
    ok('wiring the same box twice is a no-op', made.filter(n => n.className === 'af-clr').length === 1);
    ok('clearable() on a missing element is a no-op', AF.clearable(null) === undefined);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
