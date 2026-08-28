// Run a page script against a DOM shim and hand back the handles a test needs.
//
// ‼️ WHY IT IS SHARED. Every webview test in this repo grew its own shim, and
// they drift: one understands a comma-separated selector and the next does not,
// so the same page passes in one file and silently binds nothing in another.
// This is the one that knows the shapes these pages actually use — including
// the right-click relay, which arrives as a window message and is therefore
// invisible to a shim whose addEventListener is a no-op.
//
// It is deliberately NOT a replacement for the older per-file shims: those
// encode page-specific behaviour (afms popups, tail polling, focus tracking).
// This is the generic one, for tests about what a row PUBLISHES and what a menu
// pick DOES.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const shared = require(path.join(__dirname, 'lib_shared_media.js'));
const createAfmsDom = require(path.join(__dirname, 'lib_afms_dom.js'));

/** `data-vscode-context="…"` is 21 characters before the value starts. */
const CTX_ATTR_LEN = 'data-vscode-context="'.length;

/**
 * ‼️ THE REAL charts.js, NOT A STUB. Every page calls `window.AFCharts` for
 * escaping, token/duration/step formatting and the AI label — a hand-written
 * stub of it means each test file guesses a different subset, and the first
 * page to use a formatter nobody stubbed dies with "not a function" in a
 * message that says nothing about the real cause.
 */
function runPage(scriptFile, DATA, extraWindow) {
    // charts.js and sessionsTable.js are shipped to every page by htmlShell but
    // are not in lib_shared_media's list (older tests load them themselves, and
    // adding them there would double-load). Here they belong: a page that
    // embeds the sessions table dies at load without it.
    const media = (f) => fs.readFileSync(path.resolve(__dirname, '..', 'media', f), 'utf8');
    const code = media('charts.js') + '\n' + shared.sharedMedia()
        + media('sessionsTable.js') + '\n' + media(scriptFile);

    const posted = [];
    const onMessage = [];
    const els = {};
    const elCache = new Map();
    let state = {};
    /**
     * ‼️ FOCUS IS MODELLED, BECAUSE LOSING IT IS A BUG PAGES ACTUALLY SHIP.
     *
     * These pages redraw a whole card while somebody is typing in it, and a
     * `focus()` that did nothing meant the one thing a reader notices — the
     * caret jumping out of the box on every keystroke — was invisible to every
     * test in the repo. `activeElement` used to be a hard `null`, which reads to
     * a page as "nothing was focused", so a page restoring focus and a page
     * silently dropping it were indistinguishable here.
     *
     * Pages that ASK whether something is focused still get the honest answer:
     * nothing is focused until something is focused.
     */
    let active = null;

    /** What counts as an element in this markup — named ONCE, because `query`
     *  builds the cache from it and an innerHTML write invalidates it by it. */
    const TAG_RE = /<(?:input|button|select|div|span|th|td|tr|li|ol|ul|label|a|textarea|h2)\b[^>]*>/g;
    function mkEl(tag, dataset, attrs, raw) {
        return {
            tagName: tag.toUpperCase(), dataset, raw,
            // ‼️ Every element can hold html, not just #app. Pages render in
            // pieces — the search page fills `#out`, the Console repaints in
            // slots — and a shim where only #app had innerHTML made those
            // renders invisible: the test saw an empty page and said so in an
            // assertion about something else.
            _html: '',
            get innerHTML() { return this._html; },
            /**
             * ‼️ ONLY A WHOLE-PAGE REPAINT EMPTIES THE ELEMENT CACHE.
             *
             * It used to be cleared on EVERY write, and that made a page which
             * redraws itself untestable past its first press. A page wires its
             * handlers immediately after writing its markup — and then writes
             * its results block, which cleared the cache and orphaned the
             * elements it had just wired. A later `query()` built fresh objects
             * with no listeners, so the click did nothing and the assertion
             * failed a long way from the cause.
             *
             * Writing `#app` IS the repaint: everything before it is gone and
             * the page is about to wire the new markup. A slot write (`#out`, a
             * status line) replaces one region and must leave the rest alone.
             *
             * ‼️ …AND THE REPAINT DROPS THE FOCUS, exactly as a browser does.
             * Writing #app detaches every element handed out so far, and a
             * detached node cannot hold the caret — the browser hands focus back
             * to the body. Without this the shim let a page that had LOST focus
             * keep answering `activeElement.id === 'q'` off the dead node, which
             * is the precise failure a focus test exists to catch.
             *
             * ‼️ …AND A REGION REWRITE DESTROYS ITS OWN CHILDREN, TOO (X-95).
             *
             * The rule above is right about `#app` and was silently wrong about
             * everything else: a component that owns one container (the Sessions
             * table owns `#sessblock`) rewrites it and RE-WIRES it on every
             * keystroke, and the cache handed the new wiring the SAME element
             * object as the old — so each repaint stacked another listener on it.
             * A control whose markup happened not to change between two renders
             * then fired its handler twice per click and appeared dead: pressing
             * Filters opened and shut the panel in one gesture. Two fixtures had
             * been shipping screenshots of a panel that was never open, and every
             * assertion about them read as passing.
             *
             * A browser destroys the old children on an innerHTML write, so the
             * cache does too — but only the entries that came from THIS
             * element's previous markup. A page that writes `#app`, wires it,
             * and then fills a slot must not orphan what it just wired, which is
             * the failure the `#app`-only rule was protecting against.
             */
            set innerHTML(v) {
                const gone = this._html;
                this._html = v;
                if (this.id === 'app') { elCache.clear(); active = null; return; }
                for (const raw of gone.match(TAG_RE) || []) { elCache.delete(raw); }
            },
            // A real element knows its own id, and a page that asks the focused
            // element what it is gets nothing back without this.
            id: attrs.id || '',
            value: attrs.value || '', type: attrs.type || '',
            checked: 'checked' in attrs, indeterminate: false,
            textContent: '', className: attrs.class || '', style: {},
            classList: { add() { }, remove() { } },
            _listeners: {},
            addEventListener(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); },
            focus() { active = this; }, blur() { if (active === this) { active = null; } },
            selectionStart: null, selectionEnd: null,
            setSelectionRange(s, e) { this.selectionStart = s; this.selectionEnd = e; },
            scrollIntoView() { },
            closest() { return null; },
            // Pages that hand their own root to wire() query through it. The
            // shim has one document, so an element's query is the page's query
            // — every element these tests build is inside #app anyway.
            //
            // ‼️ …EXCEPT A PICKER, which has its own shim (lib_afms_dom) and
            // must answer here exactly as it answers on `document`. A page that
            // wires its filters through a ROOT rather than the document used to
            // get markup-parsed elements instead of the picker stubs, so every
            // control inside the menu came back with no listeners — and a test
            // pressing one failed saying the page had not wired it, which was
            // the shim's fault and not the page's.
            querySelectorAll(sel) {
                return String(sel).indexOf('[data-afms') === 0 ? [] : query(sel);
            },
            querySelector(sel) {
                return String(sel).indexOf('[data-afms') === 0
                    ? ms.querySelector(sel) : (query(sel)[0] || null);
            },
            click() { this.fire('click'); },
            // A component that puts text into somebody else's box tells the box
            // the way a keystroke does (the saved-prompt picker, M-24), so the
            // page's own `input` listener is what records it.
            dispatchEvent(ev) { this.fire(ev && ev.type); return true; },
            fire(ev, extra) {
                (this._listeners[ev] || []).forEach(fn => fn(Object.assign({
                    currentTarget: this, target: this,
                    preventDefault() { }, stopPropagation() { }
                }, extra)));
            }
        };
    }

    function getEl(id) {
        if (!els[id]) {
            const el = mkEl('div', {}, {}, '');
            el.id = id;
            els[id] = el;
        }
        return els[id];
    }
    /** What `document.body` is for a page script: somewhere to append to. An
     *  element that lands here is registered by id, so it is queryable and it
     *  is drawn — see the `body` getter below for why this exists. */
    const bodyEl = {
        appendChild(el) {
            if (el && el.id) { els[el.id] = el; }
            return el;
        }
    };

    /** Everything currently on the page: #app plus whatever any other element
     *  has been given. The pieces never overlap — a slot's own markup is empty
     *  in its parent's html. */
    const html = () => getEl('app')._html
        + Object.keys(els).map(k => (k === 'app' ? '' : (els[k]._html || ''))).join('');

    /**
     * A CSS-ish selector over the rendered markup.
     *
     * ‼️ It understands a comma list and a descendant selector, because that is
     * how these pages bind their row actions (`.nt-actions [data-act], …`). A
     * shim that matched the whole string literally would bind nothing, every
     * button would do nothing, and a "the menu sends what the button sends"
     * assertion would be comparing the menu against silence.
     */
    function query(sel) {
        const parts = String(sel).split(',').map(s => s.trim()).filter(Boolean);
        if (parts.length > 1) {
            const seen = new Set(), all = [];
            for (const one of parts) {
                for (const el of query(one)) { if (!seen.has(el)) { seen.add(el); all.push(el); } }
            }
            return all;
        }
        // Only the last simple selector names the target; the ancestors in
        // front of it are context this shim does not model.
        const target = parts[0].split(/\s+/).pop();
        const idM = /#([\w-]+)/.exec(target);
        const cls = /\.([\w-]+)/.exec(target);
        const attrEq = /\[data-([\w-]+)="([^"]*)"\]/.exec(target);
        const attrAny = /\[data-([\w-]+)\]/.exec(target);
        const tagM = /^([a-z]+)(?![\w-])/.exec(target);
        const out = [];
        const tags = html().match(/<(?:input|button|select|div|span|th|td|tr|li|ol|ul|label|a|textarea|h2)\b[^>]*>/g) || [];
        for (const raw of tags) {
            const tag = /^<([a-z]\d?)/.exec(raw)[1];
            if (idM && !raw.includes(`id="${idM[1]}"`)) { continue; }
            if (tagM && tag !== tagM[1]) { continue; }
            if (cls && !new RegExp(`class="[^"]*\\b${cls[1]}\\b`).test(raw)) { continue; }
            if (attrEq && !raw.includes(`data-${attrEq[1]}="${attrEq[2]}"`)) { continue; }
            if (attrAny && !attrEq && !new RegExp(`data-${attrAny[1]}[="\\s>]`).test(raw)) { continue; }
            let el = elCache.get(raw);
            if (!el) {
                const dataset = {};
                let d;
                // data-foo-bar reaches JS as dataset.fooBar
                const dre = /data-([\w-]+)(?:="([^"]*)")?/g;
                while ((d = dre.exec(raw))) {
                    const key = d[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
                    dataset[key] = d[2] === undefined ? '' : d[2];
                }
                const attrs = {};
                let a;
                const are = /\b(value|type|class|id)="([^"]*)"/g;
                while ((a = are.exec(raw))) { attrs[a[1]] = a[2]; }
                if (/\bchecked\b/.test(raw)) { attrs.checked = true; }
                /**
                 * ‼️ A TEXTAREA HOLDS ITS VALUE IN ITS CHILD TEXT, NOT IN AN
                 * ATTRIBUTE — so without this it came back EMPTY after every repaint.
                 *
                 * The trap it set was silent and it cost two form pictures: a
                 * fixture types a prompt, the page repaints, the page reads its
                 * own form back (`readComposer`) and gets "" for every textarea,
                 * writes that into the draft, and repaints again — now the words
                 * really are gone. Every `<input>` on the same form survived,
                 * because an input DOES carry `value="…"`, so the picture looked
                 * like a page that loses only its big boxes. It is not: it was
                 * the shim, and every form fixture in this suite was exposed.
                 */
                if (tag === 'textarea') { if(raw.includes('nt-prompt')) console.error('DBG textarea branch hit');
                    const doc = html();
                    const at = doc.indexOf(raw);
                    if (at >= 0) {
                        const shut = doc.indexOf('</textarea>', at + raw.length);
                        if (shut > 0) {
                            attrs.value = doc.slice(at + raw.length, shut)
                                .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
                                .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
                                .replace(/&amp;/g, '&');
                        }
                    }
                }
                el = mkEl(tag, dataset, attrs, raw);
                if (attrs.id) { els[attrs.id] = el; }
                elCache.set(raw, el);
            }
            out.push(el);
        }
        return out;
    }

    const ms = createAfmsDom(html);
    const sandbox = {
        acquireVsCodeApi: () => ({
            postMessage: (m) => posted.push(m),
            getState: () => state,
            setState: (s) => { state = s; }
        }),
        window: Object.assign({
            __DATA__: DATA,
            scrollX: 0, scrollY: 0, scrollTo: () => { },
            addEventListener: (ev, fn) => { if (ev === 'message') { onMessage.push(fn); } }
        }, extraWindow || {}),
        document: {
            // ‼️ THE MARKUP WINS OVER THE MEMO. `els` remembers every element
            // ever handed out by id, and after a repaint that memo is the OLD
            // node: a page looking its own button up got the pre-repaint object
            // and attached a second handler to it, so one press ran the handler
            // of every render it had lived through and a toggle toggled twice.
            // Asking the current markup first keeps the two in step; the memo
            // stays as the fallback for the ids that are slots rather than tags.
            getElementById: (id) =>
                (id === 'app' ? getEl('app') : (query('#' + id)[0] || els[id] || null)),
            querySelectorAll: query,
            querySelector: (s) => (s.indexOf('[data-afms') === 0 ? ms.querySelector(s) : query(s)[0] || null),
            addEventListener: () => { },
            createElement: (t) => mkEl(t, {}, {}, ''),
            /**
             * ‼️ A COMPONENT IS ALLOWED TO HANG OFF THE BODY, so the shim has a
             * body to hang off. The saved-prompt picker (media/afSnippets.js)
             * does exactly that, and for a reason a page cannot work around:
             * every page redraws its own `#app`, and a host push repainting a
             * form under an OPEN picker would take the picker with it.
             *
             * An appended element joins `els` under its id, which is what makes
             * it visible to `html()` and to `query()` — so a fixture can drive
             * the window open and it really is in the picture. Like every other
             * slot, an `#app` repaint clears it; that is the shim's own rule
             * about a whole-page repaint and not a claim about the browser.
             */
            get body() { return bodyEl; },
            get hidden() { return false; },
            get activeElement() { return active; }
        },
        setTimeout: extraWindow && typeof extraWindow.setTimeout === 'function'
            ? extraWindow.setTimeout : () => 0,
        clearTimeout: extraWindow && typeof extraWindow.clearTimeout === 'function'
            ? extraWindow.clearTimeout : () => { },
        setInterval: () => 0, clearInterval: () => { },
        Event: class Event { constructor(type, opts) { this.type = type; this.bubbles = !!(opts && opts.bubbles); } },
    console, Date, Math, JSON, String, Number, Object, Array, RegExp, Set, Map, isNaN,
        parseInt, parseFloat
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);

    return {
        html, posted, query, els, sandbox,
        /** The multi-pick dropdowns on this page, driven the way a hand does
         *  (toggle · clickName · preset · selectAll · clear) — the same shim the
         *  older per-page tests use, so a picker's behaviour is testable from
         *  any page test rather than only from the two that grew their own. */
        ms,
        last: () => posted[posted.length - 1],
        /** Fire a host message at the page — including the right-click relay. */
        send: (data) => onMessage.forEach(fn => fn({ data })),
        /** Every row's published identity, decoded out of the markup. */
        contexts: () => (html().match(/data-vscode-context="([^"]*)"/g) || []).map(m =>
            JSON.parse(m.slice(CTX_ATTR_LEN, -1)
                .replace(/&quot;/g, '"').replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>').replace(/&amp;/g, '&')))
    };
}

module.exports = { runPage, matchesShell: shared.matchesShell };
