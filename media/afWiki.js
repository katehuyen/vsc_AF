// Agent Farm — the wiki tagger: one click on the turn you are reading.
//
// ‼️ K-26 — MARKING A TURN HAS TO BE CHEAPER THAN DECIDING WHERE IT GOES.
//
// "Obsidian is the IDE, the LLM is the programmer, the wiki is the codebase" —
// but a turn worth keeping goes past at conversation speed, and the moment
// keeping it means stopping to decide WHICH page it belongs on, nothing gets
// kept at all. So the gesture is a badge on the row, and the only question it
// asks is what the turn is ABOUT. Nothing is written to the vault: the mark
// lands in the candidate pool (src/core/wiki.ts), where a compile picks it up
// later — and where dropping it again costs nothing.
//
// ‼️ AND IT IS A POPOVER, NOT A WINDOW. The saved-prompt picker (afSnippets)
// takes the screen because choosing a prompt IS what you stopped to do. This is
// the opposite: the answer is arriving in the panel behind it and the reader
// must not lose their place, so the panel opens beside the badge that was
// pressed, over a backdrop you can see straight through, and closes on Esc, on
// Save, or on a click anywhere else.
//
// ‼️ WHAT IS ALREADY FILED IS THE LIST. A pool where one subject is spelled
// three ways files one concept three times, and nobody spells consistently from
// memory across weeks — the same reason the session menu is a picker and not a
// box (S-38). The question is asked with `media/afCombo.js`: a searchable box
// over the wiki's own folders AND the pool's topics, picked as chips. A word
// nobody has filed yet still counts — it becomes a topic on Enter, and a folder
// only when the reader asks for one.
//
// Three messages, answered by wikiMarkMessage in src/panels/base.ts:
//   { type:'wikiAsk',  session, turn?, ts?, text?, whole? } → topics, categories, marks, the turn
//   { type:'wikiCategory', session, name } → the folder that now exists
//   { type:'wikiMark', session, from, to, topics, note } → what it did
// The turn NUMBER is the host's answer, never the page's guess: a Console row
// carries a moment and an opening line, and only the transcript knows what turn
// those are. A number the host is not sure of comes back flagged and is shown
// as something to check.
(function () {
    'use strict';

    /** How this page talks to the extension host. Set once by init(). */
    let post = null;
    /** null while closed. Otherwise everything the panel is drawing. */
    let state = null;
    /** The overlay, created on first use. Off <body>, because every page redraws
     *  its own body and a panel living in a slot would be wiped mid-typing. */
    let host = null;
    /** Called with (session, marks) after a mark lands, so the surface can turn
     *  its badge green without waiting for the next data push. */
    let onMarks = null;

    const esc = s => String(s === undefined || s === null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    /** How a range reads wherever it is written — one turn, a span, or the lot. */
    function rangeWords(from, to) {
        if (!from) { return 'the whole conversation'; }
        return from === to ? `turn ${from}` : `turns ${from}–${to}`;
    }

    /** A list of turn numbers as the fewest words that name them: [1,2,3,7]
     *  reads `1–3, 7`. Nobody scans thirty numbers; a run is one fact. */
    function spanWords(list) {
        const ns = (list || []).slice().sort((a, b) => a - b);
        const out = [];
        let i = 0;
        while (i < ns.length) {
            let j = i;
            while (j + 1 < ns.length && ns[j + 1] === ns[j] + 1) { j++; }
            out.push(i === j ? String(ns[i]) : `${ns[i]}–${ns[j]}`);
            i = j + 1;
        }
        return out.join(', ');
    }

    /** `4` or `3-7` or empty, exactly as the pool's own parser takes it. */
    function parseRange(s) {
        const t = String(s || '').trim();
        if (!t) { return { from: 0, to: 0 }; }
        const m = /^(\d+)\s*(?:[-–—]\s*(\d+))?$/.exec(t);
        if (!m) { return null; }
        const a = Number(m[1]);
        const b = m[2] === undefined ? a : Number(m[2]);
        if (a < 1 || b < 1) { return null; }
        return { from: Math.min(a, b), to: Math.max(a, b) };
    }

    /** Does a mark cover this turn? The pool's own overlap rule (rangesOverlap),
     *  so a badge is green exactly when marking again would MERGE rather than
     *  add a row. */
    function covers(mark, turn) {
        if (!mark) { return false; }
        if (!mark.from || !turn) { return true; }
        return mark.from <= turn && turn <= mark.to;
    }

    /**
     * The badge, drawn the same way on every surface that draws one.
     *
     * `marks` is the page's own list for this conversation (it comes down with
     * the page's data and is refreshed after a mark), so the row knows it is
     * taken at PAINT time rather than after a round trip.
     */
    function badge(o) {
        if (o && o.whole) { return wholeBadge(o); }
        const turn = Number(o && o.turn) || 0;
        const marks = (o && o.marks) || [];
        const on = marks.filter(m => covers(m, turn));
        const topics = [];
        on.forEach(m => (m.topics || []).forEach(t => {
            if (topics.indexOf(t) < 0) { topics.push(t); }
        }));
        const data = ' data-afwiki="1"'
            + ` data-afw-session="${esc((o && o.session) || '')}"`
            + ` data-afw-turn="${turn}"`
            + ` data-afw-ts="${Number(o && o.ts) || 0}"`
            + ` data-afw-text="${esc((o && o.text) || '')}"`;
        const btn = `<button class="afwiki${on.length ? ' on' : ''}"${data}>🔖</button>`;
        if (!window.AFTip) { return btn; }
        return on.length
            ? window.AFTip.wrap(btn, `Kept for the wiki — ${rangeWords(on[0].from, on[0].to)}`,
                `Filed under: ${topics.join(' · ')}\n\n`
                + (on.some(m => m.state === 'compiled')
                    ? 'A compile has already written this one into 00_WIKI.'
                    : 'Waiting in the candidate pool. Nothing is in the vault yet — a compile reads'
                      + ' the transcript over these turns and writes the pages.')
                + '\n\nPress it again to add another topic to the same mark; a second press never'
                + ' makes a second row.', 'tip-free')
            : window.AFTip.wrap(btn, 'Keep this turn for the wiki',
                'Marks it in the candidate pool — free, reversible, and NOTHING is written to the'
                + ' vault. All it asks for is what the turn is about; a compile does the reading and'
                + ' the writing later.\n\nThe topics already in the pool are offered as chips, so the'
                + ' same subject is not spelled three ways and filed three times.', 'tip-free');
    }

    /**
     * ‼️ U-94 — THE WHOLE CONVERSATION, FROM THE SURFACES THAT SHOW ONE.
     *
     * The turn badge lives on a row and needs one. A session card and a
     * session's own heading have no rows — and keeping the LOT is the commonest
     * thing to want from them, so it was the one thing only the right-click
     * menu could do, which reads as the feature not existing.
     *
     * What it needs to know is thinner than what a row needs: whether anything
     * of this conversation is already kept. `kept` is the turn each mark starts
     * at (0 being the whole thing), which is what a list of cards can carry
     * without shipping every mark of every conversation on every repaint.
     */
    function wholeBadge(o) {
        const froms = Array.isArray(o.kept) ? o.kept.map(Number)
            : ((o.marks || []).map(m => Number(m && m.from) || 0));
        const on = froms.some(f => !f);
        const parts = froms.filter(f => f).length;
        const topics = [];
        ((o.marks || []).filter(m => !m.from)).forEach(m => (m.topics || []).forEach(t => {
            if (topics.indexOf(t) < 0) { topics.push(t); }
        }));
        const face = o.label ? `🔖 ${esc(o.label)}` : '🔖';
        const btn = `<button class="afwiki${o.label ? ' wide' : ''}${on ? ' on' : ''}`
            + `${o.cls ? ' ' + esc(o.cls) : ''}" data-afwiki="1" data-afw-whole="1"`
            + ` data-afw-session="${esc(o.session || '')}" data-afw-turn="0"`
            + ' data-afw-ts="0" data-afw-text="">' + face + '</button>';
        if (!window.AFTip) { return btn; }
        const partWords = parts
            ? `\n\n${parts} turn${parts === 1 ? '' : 's'} of it ${parts === 1 ? 'is' : 'are'} kept on ${parts === 1 ? 'its' : 'their'} own as well.`
            : '';
        return on
            ? window.AFTip.wrap(btn, 'Kept for the wiki — the whole conversation',
                (topics.length ? `Filed under: ${topics.join(' · ')}\n\n` : '')
                + 'Press it again to add another topic to the same mark; a second press never makes'
                + ' a second row.' + partWords, 'tip-free')
            : window.AFTip.wrap(btn, 'Keep this whole conversation for the wiki',
                'Marks every turn of it in the candidate pool — free, reversible, and NOTHING is'
                + ' written to the vault. All it asks for is what the conversation is about; a'
                + ' compile does the reading and the writing later.'
                + (parts ? partWords : '\n\nThe same panel opens for a single turn from the badge that row carries.'),
                'tip-free');
    }

    function ensureHost() {
        if (host) { return host; }
        const body = document.body;
        if (!body || typeof body.appendChild !== 'function') { return null; }
        host = document.createElement('div');
        host.id = 'af-wiki';
        body.appendChild(host);
        return host;
    }

    function init(api, marksCb) {
        post = typeof api === 'function' ? api
            : (api && typeof api.postMessage === 'function' ? m => api.postMessage(m) : null);
        if (typeof marksCb === 'function') { onMarks = marksCb; }
    }

    /**
     * Open the tagger for one row. `at` is the badge's own rect — the panel is
     * placed against it, because a reader who pressed a badge halfway down a
     * conversation should not have to look somewhere else to answer.
     */
    function open(o) {
        const el = (o && o.el) || null;
        const r = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
        const whole = !!(o && o.whole);
        state = {
            session: (o && o.session) || '',
            turn: whole ? 0 : Number(o && o.turn) || 0,
            whole,
            range: '', label: '', exact: true,
            scope: 'turn', anchor: 0,
            // X-58 — turns taken OUT of a whole-session mark. Empty is the
            // ordinary case and the one nobody has to think about.
            exclude: [],
            topics: [], categories: [], picked: [], note: '',
            // The picker's own three (U-90): what is typed, whether its list is
            // down, and which row the keyboard is on.
            query: '', open: false, active: 0,
            turnCount: 0, marks: [], pending: 0,
            loading: true, error: '', done: '',
            at: r ? { x: r.left, y: r.bottom, top: r.top } : null
        };
        render();
        if (post) {
            post({
                type: 'wikiAsk', session: state.session, whole,
                turn: state.turn, ts: Number(o && o.ts) || 0, text: (o && o.text) || ''
            });
        }
    }

    function close() { state = null; render(); }

    const isOpen = () => !!state;

    /** The host's two answers. Returns true when the message was ours, so a page
     *  can hand its whole message event over and stop caring. */
    function receive(msg) {
        if (!msg) { return false; }
        if (msg.type === 'wikiAsk') {
            if (!state || msg.session !== state.session) { return true; }
            if (!msg.ok) { state.loading = false; state.error = msg.why || 'Unavailable.'; render(); return true; }
            state.loading = false;
            state.topics = msg.topics || [];
            state.categories = msg.categories || [];
            state.marks = msg.marks || [];
            state.turnCount = msg.turnCount || 0;
            state.exact = msg.exact !== false;
            state.label = msg.label || '';
            const from = Number(msg.from) || 0;
            const to = Number(msg.to) || from;
            state.turn = from;
            state.range = from ? (from === to ? String(from) : `${from}-${to}`) : '';
            // The turn the reader pressed is the answer nearly every time, so it
            // is the one already chosen. A row the host could not place has no
            // "this turn" to offer and opens on the whole conversation.
            state.scope = from ? 'turn' : 'all';
            state.anchor = 0;
            // A turn already marked opens with its own topics ticked: pressing
            // the badge on a kept turn is nearly always "…and this too".
            const on = state.marks.filter(m => covers(m, from));
            on.forEach(m => (m.topics || []).forEach(t => {
                if (state.picked.indexOf(t) < 0) { state.picked.push(t); }
            }));
            render();
            return true;
        }
        // ‼️ U-91 — the folder was made (or was already there). Either way the
        // answer is the name that REALLY exists on disk, not the one that was
        // typed: "Tarim" typed beside an existing "Tarım" files under the one
        // that is there, which is the duplicate this picker exists to prevent.
        if (msg.type === 'wikiCategory') {
            if (!state || msg.session !== state.session) { return true; }
            if (!msg.ok) {
                state.error = msg.why || 'The folder could not be made.';
                render();
                return true;
            }
            const name = msg.name || '';
            if (name && !state.picked.some(p => p.toLowerCase() === name.toLowerCase())) {
                state.picked.push(name);
            }
            state.categories = msg.categories || state.categories;
            state.topics = msg.topics || state.topics;
            state.query = '';
            state.active = 0;
            state.open = false;
            state.error = '';
            state.made = msg.existed ? `“${name}” was already there — filed under it.` : '';
            render();
            if (window.AFCombo) { window.AFCombo.focus('afw-cat', 0); }
            return true;
        }
        if (msg.type === 'wikiMarked') {
            if (!msg.ok) {
                if (state) { state.saving = false; state.error = msg.why || 'It did not go in.'; render(); }
                return true;
            }
            // ‼️ The surface is told even when the panel has already gone: the
            // badge turning green is the whole point, and it must not depend on
            // the popover still being open to receive the news.
            if (onMarks) { onMarks(msg.session, msg.marks || []); }
            if (state && msg.session === state.session) {
                state.marks = msg.marks || [];
                state.topics = msg.topics || state.topics;
                state.pending = msg.pending || 0;
                state.done = msg.merged
                    ? `Added to the mark already on ${rangeWords(msg.from, msg.to)}`
                    : `Kept — ${rangeWords(msg.from, msg.to)}`;
                state.saving = false;
                render();
                // Long enough to read, short enough that it is not a dialog to
                // dismiss: the panel closes itself and the badge stays green.
                setTimeout(() => { if (state && state.done) { close(); } }, 1100);
            }
            return true;
        }
        return false;
    }

    /**
     * The two lists the picker offers, as one: the wiki's own folders and the
     * pool's topics, merged on the name and each keeping what it knows (pages
     * on disk · marks in the pool). Assembled here rather than on the wire so
     * the two facts arrive separately and can still be told apart in the hover.
     */
    function comboOptions() {
        const out = [];
        const fold = s => String(s || '').toLocaleLowerCase('tr').trim();
        (state.categories || []).forEach(c => {
            if (c && c.name) { out.push({ name: c.name, pages: Number(c.pages) || 0 }); }
        });
        (state.topics || []).forEach(t => {
            if (!t || !t.topic) { return; }
            const at = out.findIndex(o => fold(o.name) === fold(t.topic));
            if (at >= 0) { out[at].marks = t.total; out[at].pending = t.pending; }
            else { out.push({ name: t.topic, marks: t.total, pending: t.pending }); }
        });
        return out.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    }

    /**
     * ‼️ U-120 — WHICH TOPIC BELONGS TO THE WHOLE CONVERSATION, AND WHICH TO
     * THREE TURNS OF IT.
     *
     * The panel opens with the pressed turn's topics already ticked — and a
     * mark on the WHOLE session covers that turn too, so it is ticked there as
     * well. Same chip, same colour, and the reader is left to remember which is
     * which. That is the aggregation illusion: two different scopes read as one
     * list, and the next mark is filed under whichever one the eye picked.
     *
     * What a chip reports is what pressing "Keep it" LEAVES BEHIND — everything
     * the topic is already kept on, PLUS the scope now chosen. The pending half
     * is what makes it worth repainting: a chip that only reported the past
     * would turn amber after the save, which is one press too late to be a
     * warning. `render()` redraws the whole panel on every scope press, so the
     * colours and the hovers follow the segmented control for free.
     */
    function chipScope(name) {
        const n = state.turnCount || 0;
        const fold = s => String(s || '').toLocaleLowerCase('tr').trim();
        const spread = (from, to, ex, into) => {
            const skip = {};
            (ex || []).forEach(x => { skip[Number(x)] = 1; });
            const a = from ? from : 1;
            const b = from ? to : n;
            for (let i = a; i <= b; i++) { if (!skip[i]) { into[i] = 1; } }
        };
        const keys = o => Object.keys(o).map(Number).sort((a, b) => a - b);
        // Where it stands now: the union of every mark of THIS conversation
        // that carries the topic — which is how a topic ends up on `1–3, 7`
        // without any single mark saying so.
        const had = {};
        let wasWhole = false;
        (state.marks || []).filter(m => (m.topics || []).some(t => fold(t) === fold(name)))
            .forEach(m => {
                if (!Number(m.from)) { wasWhole = true; }
                spread(Number(m.from) || 0, Number(m.to) || 0, m.exclude, had);
            });
        // Where this press would put it. A range that does not parse adds
        // NOTHING — the panel already refuses to save it, and reading it as an
        // empty range would draw every chip amber on a typo.
        const r = parseRange(state.range);
        const addsWhole = !!r && !r.from;
        const adds = {};
        if (r) { spread(r.from, r.to, state.scope === 'all' ? (state.exclude || []) : [], adds); }
        const whole = wasWhole || addsWhole;
        const all = {};
        Object.keys(had).forEach(k => { all[k] = 1; });
        Object.keys(adds).forEach(k => { all[k] = 1; });
        const turns = keys(all);
        const cnt = turns.length;
        const gaps = [];
        for (let i = 1; i <= n; i++) { if (!all[i]) { gaps.push(i); } }
        const head = whole
            ? (n
                ? (gaps.length
                    ? `Whole session (${cnt} of ${n} turns)`
                    : `Whole session (${n} turn${n === 1 ? '' : 's'})`)
                : 'Whole session')
            : (n ? `${cnt} turn${cnt === 1 ? '' : 's'} (${cnt}/${n})`
                : `${cnt} turn${cnt === 1 ? '' : 's'}`);
        const detail = whole
            ? (gaps.length ? `Whole session · except ${spanWords(gaps)}` : 'Whole session')
            : (cnt ? `Turns: ${spanWords(turns)}` : 'No turn chosen');
        // Present and future are said apart, because they are the two things a
        // reader is actually deciding between.
        const kept = keys(had);
        const already = wasWhole ? 'Already kept on the whole session.'
            : kept.length ? `Already kept on turn${kept.length === 1 ? '' : 's'} ${spanWords(kept)}.`
                : 'Not kept yet.';
        const news = keys(adds).some(x => !had[x]) || (addsWhole && !wasWhole);
        const then = news
            ? ` Keeping it now files it on ${addsWhole && n ? `the whole session (turns 1–${n})`
                : addsWhole ? 'the whole conversation' : rangeWords(r.from, r.to)}.`
            : ' This scope is already covered — keeping it again only adds the topic.';
        return {
            cls: whole ? 'whole' : '',
            head,
            body: `${detail}\n${already}${then}`,
            tipCls: 'tip-free',
            tipAttrs: 'data-aftip-anchor=".afw-box"'
        };
    }

    /** Everything picked plus anything still in the box — a word typed and not
     *  yet entered counts, which is the commonest way this is used. */
    function chosenTopics() {
        const out = state.picked.slice();
        const s = String(state.query || '').trim();
        if (s && !out.some(x => x.toLowerCase() === s.toLowerCase())) { out.push(s); }
        return out;
    }

    function save() {
        if (!state || state.saving) { return; }
        const topics = chosenTopics();
        if (!topics.length) {
            state.error = 'It needs at least one topic — that is what the compile files the concept under.';
            render();
            return;
        }
        const r = parseRange(state.range);
        if (!r) {
            state.error = 'Turns read as 4, or 3-7, or leave it empty for the whole conversation.';
            render();
            return;
        }
        state.saving = true;
        state.error = '';
        render();
        if (post) {
            post({
                type: 'wikiMark', session: state.session,
                from: r.from, to: r.to, topics, note: state.note,
                // X-58 — only a whole-session mark carries exclusions; a span
                // that leaves turns out is simply a different span.
                excludeTurns: state.scope === 'all' ? (state.exclude || []) : []
            });
        }
    }

    /**
     * ‼️ U-93 — WHICH TURNS IS A CHOICE, NOT A NUMBER TO TYPE.
     *
     * The scope used to be a 62px box the reader had to type digits into, which
     * made the badge on every turn pointless: pressing the one you are reading
     * still asked you which one you meant. The three answers are now on the
     * panel — the turn you pressed (already chosen), the whole conversation, or
     * a span — and the span is picked by pointing at the turns.
     *
     * The box has not gone anywhere. It is the escape hatch for a conversation
     * whose turns the host could not count, and it stays authoritative: what is
     * typed there is what is highlighted below it.
     */
    function scopeHtml(r, turnLine) {
        const n = state.turnCount || 0;
        const allWords = n ? `Turns 1–${n} — the whole conversation` : 'The whole conversation';
        const seg = (id, text, tip, on) => `<button class="afw-seg${on ? ' on' : ''}"
            data-afw-scope="${id}" title="${esc(tip)}">${esc(text)}</button>`;
        const guess = state.exact ? '' : `<span class="afw-guess" title="The transcript did not carry this row's opening line, so the number came from its clock alone. Check it before saving — the neighbouring turn is a real possibility.">≈ check this</span>`;
        const row = `<div class="afw-scope">
            ${state.turn ? seg('turn', `This turn (${state.turn})`, turnLine, state.scope === 'turn') : ''}
            ${seg('all', 'Whole session', allWords, state.scope === 'all')}
            ${seg('range', 'Range', 'Pick a span: press the first turn, then the last.', state.scope === 'range')}
            <span class="afw-grow"></span>${guess}
        </div>`;
        /**
         * ‼️ X-58 — "THE WHOLE SESSION" USUALLY MEANS "THE WHOLE SESSION EXCEPT
         * THE LAST TWO", AND SAYING SO USED TO COST TWELVE CLICKS.
         *
         * Fourteen turns are the work and the last two are "commit this" and
         * "good night". Marking the session is one press; picking 1–12 out of
         * the chips to leave those two out is a span you have to get right, so
         * nobody does it and the compile reads the noise. Subtraction is the
         * cheap gesture: everything is taken, and a press REMOVES a turn.
         *
         * Same chips as Range, inverted — an excluded turn is struck through
         * rather than merely unlit, because "not chosen yet" and "deliberately
         * left out" must not look alike on a strip where everything else is on.
         */
        if (state.scope === 'all') {
            const ex = (state.exclude || []).slice().sort((a, b) => a - b);
            const kept = n ? n - ex.length : 0;
            const words = !n ? allWords
                : ex.length
                    ? `Turns 1–${n} except ${ex.join(', ')} — ${kept} turn${kept === 1 ? '' : 's'}`
                    : allWords;
            const strip = n ? `<div class="afw-tns">${excludeChips()}</div>` : '';
            const clear = ex.length
                ? ` <button class="afw-clear" id="afw-exclear" title="Put every turn back — the whole conversation, nothing left out">↺ take all ${n}</button>`
                : '';
            return row + strip
                + `<div class="afw-of${ex.length ? ' afw-of-cut' : ''}">${esc(words)}${clear}</div>`
                + (n ? '<div class="afw-hint">Press a turn to leave it OUT of the compile.</div>' : '');
        }
        if (state.scope !== 'range') {
            return row + `<div class="afw-of">${esc(turnLine)}</div>`;
        }
        return row + `<div class="afw-tns">${turnChips(r)}</div>
            <div class="afw-turn">
                <label title="One number, a span like 3-7, or empty for the whole conversation. Typing here moves the chips above.">turns
                    <input id="afw-range" type="text" value="${esc(state.range)}" placeholder="all"></label>
                <span class="afw-of">${esc(turnLine)}</span>
            </div>`;
    }

    /** X-58 — the same strip, read the other way round: every turn is IN and a
     *  press takes one out. Struck through, so a turn deliberately left out
     *  never reads as one merely not reached yet. */
    function excludeChips() {
        const n = state.turnCount || 0;
        const ex = state.exclude || [];
        let out = '';
        for (let i = 1; i <= n; i++) {
            const off = ex.indexOf(i) >= 0;
            out += `<button class="afw-tn${off ? ' cut' : ' on'}" data-afw-ex="${i}"
                title="Turn ${i} of ${n} — ${off ? 'left OUT of the compile; press to put it back' : 'press to leave it out'}">${i}</button>`;
        }
        return out;
    }

    /** One chip per turn of the conversation, the span highlighted across them.
     *  A conversation the host could not count keeps the box and loses nothing. */
    function turnChips(r) {
        const n = state.turnCount || 0;
        if (!n) {
            return '<div class="afw-none">The turn count is not known here — type the span below.</div>';
        }
        let out = '';
        for (let i = 1; i <= n; i++) {
            const on = !!(r && r.from && i >= r.from && i <= r.to);
            const next = state.anchor && !on ? ` — press to take turns ${Math.min(state.anchor, i)}–${Math.max(state.anchor, i)}` : '';
            out += `<button class="afw-tn${on ? ' on' : ''}" data-afw-tn="${i}"
                title="Turn ${i} of ${n}${next}">${i}</button>`;
        }
        return out;
    }

    function html() {
        if (!state) { return ''; }
        const at = state.at;
        // Placed against the badge and clamped inside the window; when the badge
        // is low on the screen the panel goes ABOVE it rather than off the end.
        // The window's own size, with a fallback: a page script also runs in a
        // shim that has no viewport, and a NaN coordinate places the panel
        // nowhere at all rather than failing loudly.
        const W = 340, H = 300;
        const vw = window.innerWidth || 1200;
        const vh = window.innerHeight || 800;
        const x = at ? Math.max(8, Math.min(at.x - 12, vw - W - 8)) : 40;
        const below = at ? at.y + 6 : 60;
        const y = at && below + H > vh ? Math.max(8, at.top - H - 6) : below;
        const r = parseRange(state.range);
        const turnLine = state.loading ? 'reading the transcript…'
            : !r ? 'that is not a turn or a range'
                : state.turnCount ? `${rangeWords(r.from, r.to)} of ${state.turnCount}`
                    : rangeWords(r.from, r.to);
        return `<div class="afw-wrap" id="afw-wrap">
            <div class="afw-box" style="left:${Math.round(x)}px; top:${Math.round(y)}px;">
                <div class="afw-head">
                    <b>Keep for the wiki</b>
                    <span class="afw-grow"></span>
                    <button class="afw-x" id="afw-x" title="Close (Esc) — nothing is saved">✕</button>
                </div>
                ${state.done ? `<div class="afw-done">✓ ${esc(state.done)}${state.pending
        ? ` · ${state.pending} waiting to be compiled` : ''}</div>` : `
                ${scopeHtml(r, turnLine)}
                ${state.label ? `<div class="afw-label">${esc(state.label)}</div>` : ''}
                <div class="afw-ask" title="The compile files the concept under these. Picking one that is already in use is what stops the same subject being spelled three ways and filed three times — the list is the wiki's own folders and the topics the pool already carries.">what is it about?</div>
                ${state.loading ? '' : window.AFCombo.html({
        id: 'afw-cat', options: comboOptions(), picked: state.picked,
        query: state.query, open: state.open, active: state.active, create: true,
        chipMeta: chipScope,
        placeholder: state.picked.length ? 'another…' : 'search the categories…'
    })}
                ${state.made ? `<div class="afw-made">${esc(state.made)}</div>` : ''}
                <input id="afw-note" type="text" value="${esc(state.note)}"
                    placeholder="why it is worth keeping (optional)"
                    title="Your own words, kept with the mark so the pool is readable on its own.">
                ${state.error ? `<div class="afw-err">${esc(state.error)}</div>` : ''}
                <div class="afw-foot">
                    <span class="afw-note">Nothing is written to the vault — it lands in the candidate pool.
                        <span class="afw-role">This window only ADDS topics — dropping, editing and compiling
                            candidates is the Wiki cockpit's job.</span></span>
                    <button class="afw-go" id="afw-go"${state.saving ? ' disabled' : ''}>${state.saving ? 'Keeping…' : 'Keep it'}</button>
                </div>`}
            </div>
        </div>`;
    }

    function render() {
        const root = ensureHost();
        if (!root) { return; }
        root.innerHTML = html();
        if (!state) { return; }
        const on = (id, ev, fn) => {
            const node = document.getElementById(id);
            if (node) { node.addEventListener(ev, fn); }
        };
        on('afw-x', 'click', close);
        on('afw-wrap', 'mousedown', ev => {
            if (ev.target && ev.target.id === 'afw-wrap') { close(); }
        });
        on('afw-go', 'click', save);
        // U-90 — the one question this panel asks is asked with the picker, and
        // the picker keeps its own caret across the repaints it causes.
        if (window.AFCombo && !state.loading && !state.done) {
            window.AFCombo.wire(root, {
                id: 'afw-cat', state, options: comboOptions(), create: true, render,
                onCreate: (name) => {
                    const n = String(name || '').trim();
                    if (!n || !post) { return; }
                    state.error = '';
                    state.made = '';
                    post({ type: 'wikiCategory', session: state.session, name: n });
                },
                onDone: save
            });
            const box = document.getElementById('afw-cat-in');
            // The keyboard lands where the answer is typed — but only when it
            // is not already there, or the picker's own caret restore would be
            // undone by this every time it repaints (U-98).
            if (box && document.activeElement !== box) {
                try { box.focus({ preventScroll: true }); } catch (e) { box.focus(); }
            }
        }
        const note = document.getElementById('afw-note');
        if (note) {
            note.addEventListener('input', () => { state.note = note.value; });
            note.addEventListener('keydown', ev => {
                if (ev.key === 'Enter') { state.note = note.value; save(); }
                if (ev.key === 'Escape') { close(); }
            });
        }
        const range = document.getElementById('afw-range');
        if (range) {
            range.addEventListener('input', () => { state.range = range.value; });
            range.addEventListener('keydown', ev => {
                if (ev.key === 'Enter') { state.range = range.value; save(); }
                if (ev.key === 'Escape') { close(); }
            });
        }
        // The boxes are rewritten by the repaint, so what is in them now is
        // carried over rather than lost. Every control that repaints calls it.
        const carry = () => {
            const box = document.getElementById('afw-cat-in');
            if (box) { state.query = box.value; }
            if (note) { state.note = note.value; }
            if (range) { state.range = range.value; }
        };
        root.querySelectorAll('[data-afw-scope]').forEach(node =>
            node.addEventListener('click', () => {
                const next = node.dataset.afwScope;
                if (!next || next === state.scope) { return; }
                carry();
                state.scope = next;
                state.anchor = 0;
                state.error = '';
                if (next === 'all') { state.range = ''; }
                else if (next === 'turn') { state.range = state.turn ? String(state.turn) : ''; }
                else {
                    const r = parseRange(state.range);
                    if (!r || !r.from) { state.range = String(state.turn || 1); }
                }
                render();
            }));
        // X-58 — the exclusion strip. A press toggles one turn OUT of a whole-
        // session mark; every turn is in until it is taken out.
        root.querySelectorAll('[data-afw-ex]').forEach(node =>
            node.addEventListener('click', () => {
                const n = Number(node.dataset.afwEx) || 0;
                if (!n) { return; }
                carry();
                const list = state.exclude || (state.exclude = []);
                const at = list.indexOf(n);
                if (at >= 0) { list.splice(at, 1); } else { list.push(n); }
                list.sort((a, b) => a - b);
                state.error = '';
                render();
            }));
        const exclear = document.getElementById('afw-exclear');
        if (exclear) {
            exclear.addEventListener('click', () => { carry(); state.exclude = []; render(); });
        }
        root.querySelectorAll('[data-afw-tn]').forEach(node =>
            node.addEventListener('click', () => {
                const n = Number(node.dataset.afwTn) || 0;
                if (!n) { return; }
                carry();
                // ‼️ A SPAN IS TWO PRESSES, NEVER A NUMBER TYPED TWICE. The first
                // takes that turn and remembers it; the second stretches to where
                // you pressed, whichever side of it that is. Then it starts over,
                // so the gesture has no mode to be stuck in.
                if (state.anchor) {
                    state.range = `${Math.min(state.anchor, n)}-${Math.max(state.anchor, n)}`;
                    state.anchor = 0;
                } else {
                    state.anchor = n;
                    state.range = String(n);
                }
                state.error = '';
                render();
            }));
        // A long conversation opens on the turn that was pressed rather than on
        // turn 1 — the strip scrolls, and a reader on turn 140 should not have to.
        if (typeof root.querySelector === 'function') {
            const sel = root.querySelector('.afw-tn.on');
            if (sel && sel.scrollIntoView) {
                try { sel.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (e) { /* no layout here */ }
            }
        }
    }

    /**
     * Hang the badge on a page. One document-level listener, because every
     * surface repaints its rows constantly and a listener bound per badge would
     * be rebound per repaint — and missed on the one repaint somebody forgot.
     */
    function wire() {
        // The same guard afSnippets' ensureHost carries, for the same reason: a
        // page script is also run against a light DOM (the webview tests), and
        // a shared component that assumed a whole document would take five
        // pages' tests down with a message naming none of them.
        if (!document || typeof document.addEventListener !== 'function') { return false; }
        if (document.body && document.body.dataset && document.body.dataset.afWiki === '1') { return true; }
        if (document.body && document.body.dataset) { document.body.dataset.afWiki = '1'; }
        document.addEventListener('click', ev => {
            const b = ev.target && ev.target.closest ? ev.target.closest('[data-afwiki]') : null;
            if (!b) { return; }
            ev.preventDefault();
            ev.stopPropagation();
            open({
                el: b,
                session: b.dataset.afwSession || '',
                turn: Number(b.dataset.afwTurn) || 0,
                ts: Number(b.dataset.afwTs) || 0,
                text: b.dataset.afwText || '',
                whole: b.dataset.afwWhole === '1'
            });
        }, true);
        document.addEventListener('keydown', ev => {
            if (ev.key === 'Escape' && state) { close(); }
        });
        return true;
    }

    window.AFWiki = { init, wire, open, close, isOpen, receive, badge, covers };
})();
