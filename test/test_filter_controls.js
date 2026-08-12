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

    // number inputs throw on selectionStart in a real browser — must not break
    const num = {
        tagName: 'INPUT', value: '', className: 'af-count', listeners: {},
        get selectionStart() { throw new Error('InvalidStateError'); },
        addEventListener(ev, fn) { this.listeners[ev] = fn; },
        getAttribute: () => null, focus() { }
    };
    let numApplied = 0;
    sandbox.document.querySelectorAll = (sel) => (sel === 'input.af-count' ? [num] : []);
    AF.live(num, () => { numApplied++; }, 50);
    num.value = '5000';
    num.listeners.input();
    runTimers();
    ok('a number box filters as you type without a caret to save', numApplied === 1);

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
