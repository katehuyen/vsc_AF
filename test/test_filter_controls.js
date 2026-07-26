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
    window: {},
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
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
