import { eolOf, lineStartOffset, TASK_LINE } from './projectPlan';

/**
 * The backlog — a project's standing pile of work, in the user's own markdown.
 *
 * ‼️ THIS IS NOT THE PLAN AND IT IS NOT THE WORK QUEUE. Three different things,
 * and keeping them apart is the whole reason this module exists:
 *
 *   Plan (`projectPlan.ts`)  — the ROADMAP. Macro, ~10 lines, phase-sized,
 *       changes a few times a month, answers "where are we taking this".
 *   Work Queue (`workqueue.ts`) — the user→agent CHANNEL. A flow: captured,
 *       grouped, delegated, gone. Global, not owned by any project.
 *   Backlog (here)           — the project's STOCK. Hundreds of items, coded,
 *       ranked, filtered, ordered; answers "what is next, which one now".
 *
 * Putting the backlog in the plan file was the obvious-looking move and it is
 * wrong twice over: a hundred "fix this too" lines make the roadmap unreadable,
 * and the brief's "open plan items" — the six lines an agent actually reads at
 * session start — would fill up with typo fixes. So: its own file, its own
 * `af-role`, its own tab; and one link back (`[plan:: afprj-05]`) instead of a
 * merge.
 *
 * WHAT THE FORMAT IS MADE OF — and what it deliberately is NOT.
 * Nothing here is invented. A backlog line is an ordinary Obsidian task line
 * carrying things the user's vault already understands:
 *
 *   - [ ] P-5.3 Work tab #feat 🔼 [effort:: L] ⛔ P-5.1 [plan:: afprj-05]
 *     └─┬─┘ └─┬┘ └──┬───┘ └─┬─┘ └┬┘ └─────┬────┘ └───┬──┘ └──────┬──────┘
 *    state code   text   kind  pri    effort     blockedBy    plan link
 *
 * state = the checkbox itself (Obsidian's own alternate states), kind = a real
 * `#tag` (clickable in the vault), priority = Obsidian Tasks' own icons,
 * blockedBy = its ⛔. Only `effort`, `plan` and `from` needed a field of their
 * own, and those use Dataview's `[key:: value]`, which the vault already reads.
 * The gain is concrete: every one of these lines keeps working in the user's
 * existing task queries, and a person editing the file in Obsidian is editing
 * something they already know how to write.
 *
 * ‼️ EVERYTHING IS OPTIONAL. A backlog item may be one line of plain text with
 * no code, no priority and no effort — because the first requirement is that
 * writing a note DOWN must cost nothing. A system that demands a code before it
 * will accept a thought does not get the thought. Unclassified items live in the
 * `📥` section and are handed a code later, by a person or an agent who has the
 * context to classify them.
 *
 * Pure string work: nothing here reads a file or knows what a `vscode` is.
 */

// ---------------------------------------------------------------------------
// the axes
// ---------------------------------------------------------------------------

/** The checkbox, read as four states rather than a boolean.
 *  `[ ]` open · `[/]` doing · `[x]` done · `[-]` cancelled. */
export type BacklogState = 'open' | 'doing' | 'done' | 'cancelled';
export const BACKLOG_STATES: BacklogState[] = ['open', 'doing', 'done', 'cancelled'];

/** What goes INSIDE the brackets for each state. `open` is a space. */
const STATE_CHAR: Record<BacklogState, string> = {
    open: ' ', doing: '/', done: 'x', cancelled: '-'
};

/**
 * Read one checkbox character.
 *
 * `/` and `-` are Obsidian's own alternate states and mean something specific
 * here; every OTHER non-space glyph is treated as done, which is the same
 * judgment `projectPlan.ts` makes — an unknown box is one nobody is waiting on,
 * and showing finished work as outstanding is the worse failure.
 */
function stateOf(box: string): BacklogState {
    if (box === ' ') { return 'open'; }
    if (box === '/') { return 'doing'; }
    if (box === '-') { return 'cancelled'; }
    return 'done';
}

/** Still to do — the two states that belong in a "what is next" answer. */
export const isLive = (s: BacklogState): boolean => s === 'open' || s === 'doing';

/** Obsidian Tasks' own priority scale. `normal` is the absence of an icon,
 *  which is why it has no glyph: most lines should carry none. */
export type BacklogPriority = 'highest' | 'high' | 'medium' | 'normal' | 'low' | 'lowest';
export const BACKLOG_PRIORITIES: BacklogPriority[] =
    ['highest', 'high', 'medium', 'normal', 'low', 'lowest'];

const PRIORITY_ICON: Record<BacklogPriority, string> = {
    highest: '🔺', high: '⏫', medium: '🔼', normal: '', low: '🔽', lowest: '⏬'
};
const ICON_PRIORITY: Record<string, BacklogPriority> = {
    '🔺': 'highest', '⏫': 'high', '🔼': 'medium', '🔽': 'low', '⏬': 'lowest'
};
const PRIORITY_WEIGHT: Record<BacklogPriority, number> = {
    highest: 5, high: 4, medium: 3, normal: 2, low: 1, lowest: 0.5
};

/** How big it is. XS ≈ five minutes · S ≈ half an hour · M ≈ half a day ·
 *  L ≈ a day · XL = should be split before anybody starts it. */
export type BacklogEffort = 'XS' | 'S' | 'M' | 'L' | 'XL';
export const BACKLOG_EFFORTS: BacklogEffort[] = ['XS', 'S', 'M', 'L', 'XL'];
const EFFORT_WEIGHT: Record<BacklogEffort, number> = { XS: 1, S: 2, M: 4, L: 8, XL: 16 };

/** ‼️ An item with no effort stated is scored as M, not as XS. The optimistic
 *  default is the dangerous one: it floats unestimated work to the top of the
 *  "cheap wins" list, an agent picks five of them, and the turn ends half done. */
const UNKNOWN_EFFORT_WEIGHT = EFFORT_WEIGHT.M;

// ---------------------------------------------------------------------------
// the code
// ---------------------------------------------------------------------------

/**
 * `<AREA>-<n>[.<n>…]` — P-5, P-5.3, P-5.3.1.
 *
 * Every level is a valid code on its own (`P-5` is a real item, an epic), so a
 * code carries its own position in the tree the way an ATC code does. What it
 * deliberately does NOT copy from ATC is the letter/digit alternation: `C09AA05`
 * can be written but not SAID, and this user dictates. "P five three" is
 * speakable; that is a hard constraint on an identifier whose first job is to be
 * quoted at an agent out loud.
 *
 * Two rules that never bend:
 *   1. A code is permanent. Cancel an item and its number is still spent — a
 *      note written three months ago that says `K-8` means this item, forever.
 *   2. A code is not an order. The order is the PINNED HEAD (`## 🎯 Queue`)
 *      followed by the ORDER OF LINES IN THE FILE, both of which the user
 *      changes by hand in Obsidian or from the panel. That is what makes "do
 *      the top five" work without renumbering anything.
 */
export const BACKLOG_CODE = /^([A-Z]{1,2})-(\d+(?:\.\d+)*)$/;

/** The code at the START of an item's text, which is the only place it counts.
 *  A code mentioned mid-sentence is prose about another item, not this one's. */
const LEADING_CODE = /^([A-Z]{1,2}-\d+(?:\.\d+)*)\s+/;

/** `P-5.3` → `P-5`; `P-5` → undefined (an area root has no parent item). */
export function parentCode(code: string): string | undefined {
    const at = code.lastIndexOf('.');
    return at < 0 ? undefined : code.slice(0, at);
}

/** Sorts codes the way a person expects: P-2 before P-10, P-5 before P-5.1. */
export function compareCodes(a: string, b: string): number {
    const pa = BACKLOG_CODE.exec(a); const pb = BACKLOG_CODE.exec(b);
    if (!pa || !pb) { return a.localeCompare(b); }
    if (pa[1] !== pb[1]) { return pa[1].localeCompare(pb[1]); }
    const na = pa[2].split('.').map(Number); const nb = pb[2].split('.').map(Number);
    for (let i = 0; i < Math.max(na.length, nb.length); i++) {
        const d = (na[i] ?? -1) - (nb[i] ?? -1);
        if (d) { return d; }
    }
    return 0;
}

// ---------------------------------------------------------------------------
// inline fields
// ---------------------------------------------------------------------------

/**
 * Dataview inline fields, in both bracket styles it accepts.
 *
 * ‼️ WHAT IS WRITTEN AND WHAT IS ACCEPTED ARE TWO DIFFERENT LISTS, and keeping
 * them apart is the rule this block exists to state.
 *
 * WRITTEN: English, always — `effort`, `plan`, `from`, `was`, `closed`. Agent
 * Farm's working language is English and a field name is part of the mechanism,
 * not part of the content. The CONTENT of a backlog (the items, the headings,
 * the areas) is in whatever language the project is written in — Turkish here,
 * Japanese somewhere else — and nothing in this file may assume otherwise.
 *
 * ACCEPTED: the English name plus the aliases files already on disk contain.
 * That is INPUT TOLERANCE, not a second working language: a line somebody wrote
 * years ago must keep parsing, and the next field edit rewrites it in English
 * anyway, so the aliases fade out on their own instead of by breaking a file.
 */
const field = (names: string): RegExp =>
    new RegExp(`[\\[(]\\s*(?:${names})\\s*::\\s*([^\\])]*?)\\s*[\\])]`, 'iu');

const F_EFFORT = field('effort|efor|boyut|size');
const F_PLAN = field('plan');
const F_FROM = field('from|kaynak|source');
const F_WAS = field('was|eski');
/** `[closed:: 9c4d1f#3]` — the session and turn a closed item was closed in.
 *  The whole history lives in the track ledger (`backlogTrack.ts`); this is the
 *  one point of it that also survives in the file, for somebody reading it in
 *  Obsidian with no extension running. */
const F_CLOSED = field('closed');
/** Every inline field, for stripping. Global, so `replace` clears them all. */
const F_ANY = /[[(]\s*[\p{L}\w -]+\s*::\s*[^\])]*[\])]/giu;

/** `#bug`, `#feat`, … — the item's kind. Any tag counts: the shipped set is a
 *  suggestion, and a project that wants `#regression` should just get it. */
const TAG = /(?:^|\s)#([\p{L}\d/_-]+)/giu;

/**
 * The kinds the panel knows how to colour — the WORK TYPE axis.
 *
 * ‼️ These are a canonical set, not a closed one: any `#tag` on the line is still
 * read as a kind and still filters, because a project that wants `#regression`
 * should just get it. What being canonical buys is the four questions a backlog
 * is actually sorted by in someone's head — *is this a defect, is it something to
 * find out, is it new capability, is it how it looks* — each having exactly one
 * name, so the filter can offer them and a row can say which one it is.
 *
 * `research` is the one that had no name before: measuring, reproducing,
 * investigating — work whose deliverable is an ANSWER, not a change. Filing it
 * as `#chore` (its only previous home) made it invisible next to the fixes.
 */
export const BACKLOG_KINDS = ['bug', 'research', 'feat', 'ux', 'chore', 'debt', 'idea', 'doc'];

/** ⛔ P-5.1 — blocked until that one closes. Several may sit on one line. */
const BLOCKED = /⛔\s*((?:[A-Z]{1,2}-\d+(?:\.\d+)*)(?:\s*,\s*[A-Z]{1,2}-\d+(?:\.\d+)*)*)/gu;

const dateAfter = (line: string, icon: string): string | undefined =>
    new RegExp(`${icon}\\s*(\\d{4}-\\d{2}-\\d{2})`, 'u').exec(line)?.[1];

/**
 * Obsidian Tasks metadata, in TWO groups — and the split is not tidiness.
 *
 * `projectPlan.ts` strips every icon together with the token that follows it,
 * which is right for a plan line where the metadata sits in a run at the end.
 * A backlog line is denser: a priority icon carries no value, so eating the next
 * token eats part of the item. Measured on a real line —
 * `K-8 history search #bug 🔽 [effort:: XS]` — the single-group version returned
 * "history search S]", swallowing the effort field's opening bracket and
 * leaving its tail in the text. An item whose displayed words are wrong is also
 * an item that cannot be found by text, which is how the wrong row gets edited.
 */
const META_VALUED = /\s*(?:🆔|⛔|📅|⏳|🛫|➕|✅|❌|🏁)\s*[^\s]*/gu;
const META_BARE = /\s*(?:🔺|⏫|🔼|🔽|⏬|🔁)/gu;

// ---------------------------------------------------------------------------
// areas
// ---------------------------------------------------------------------------

/**
 * `## P — Projects` opens an AREA.
 *
 * The heading IS the area dictionary: no separate "areas" block to keep in sync
 * with the headings somebody actually reads. Any separator the user is likely to
 * type is accepted (— – - :), and a heading that does not start with a bare
 * letter code is simply a section, not an area — so ordinary prose headings in
 * the file cost nothing.
 */
const AREA_HEADING = /^#{1,6}\s+(?:[^\p{L}\d\s]\s*)?([A-Z]{1,2})\s*[—–:-]\s*(.+?)\s*$/u;

/** A heading with 📥 in it, or plainly called Inbox/Gelen, is where unclassified
 *  captures land. Recognised rather than required: a file without one still
 *  works, new items just go to the end. */
const INBOX_HEADING = /(?:📥|\b(?:inbox|gelen)\b)/iu;

/**
 * `## 🎯 Queue` — THE HEAD OF THE QUEUE, AND THE ONLY ORDER THAT CROSSES AREAS.
 *
 * ‼️ WHY THIS EXISTS AT ALL. Line order is the user's prioritisation and stays
 * that way — but a real backlog file is grouped under area headings, and a
 * grouped file makes line order a SEGMENTED order: everything in `K` comes
 * before everything in `S`, for ever, because moving a line across a heading
 * would re-file the item. So "do X-5 next" was unsayable. It was not a missing
 * button; it was the one order the file could not express.
 *
 * The answer is not a second, hidden order — it is one order with an explicit
 * head. The queue is **this list, then the file's own order for everything not
 * in it.** Both halves live in the same document, so a person reading
 * `Backlog.md` in Obsidian with no extension running sees the same queue an
 * agent gets from `projects.backlog.next`.
 *
 * It holds CODES, and only codes. An uncoded capture has no handle that
 * survives the file being edited (a line number does not), so filing it is the
 * price of pinning it — one click, and the code it gets is permanent anyway.
 */
const QUEUE_HEADING = /(?:🎯|\bqueue\b|\bnext\s*up\b)/iu;

/** The heading written when the file has no queue block yet. */
export const QUEUE_TITLE = '## 🎯 Queue';

/** One line of the block: an ordered- or bulleted-list item opening with a
 *  code. Everything after the code is a label for the reader and is ignored —
 *  which is what lets the block carry the item's words without them ever
 *  becoming a second copy that has to be kept true. */
const QUEUE_ENTRY = /^\s*(?:\d+[.)]\s+|[-*+]\s+)([A-Z]{1,2}-\d+(?:\.\d+)*)(?:\s|$)/u;

export interface BacklogArea {
    /** The letter code — `P`. */
    code: string;
    /** What the heading calls it — `Projects`. */
    label: string;
    /** Line the heading is on (0-based). */
    line: number;
    open: number;
    total: number;
}

// ---------------------------------------------------------------------------
// items
// ---------------------------------------------------------------------------

export interface BacklogItem {
    /** 0-based index of the line in the document. */
    line: number;
    /** The line exactly as it is on disk. */
    raw: string;
    /** The words, with checkbox, code, tags, fields and Tasks metadata off.
     *  For display and matching only — never written back. */
    text: string;
    state: BacklogState;
    /** `P-5.3` when the line carries one. Absent = an unclassified capture. */
    code?: string;
    /** From the code when there is one, otherwise from the heading it sits
     *  under. Absent for an item in the inbox with no area heading above it. */
    area?: string;
    /** The code of the item this one hangs under, by CODE (not by indent). */
    parent?: string;
    /** Leading whitespace in columns — the tree as the file DRAWS it. */
    depth: number;
    /** The nearest heading above it. */
    section: string;
    /** True when it sits under the 📥 heading or carries no code. */
    inbox: boolean;
    kinds: string[];
    priority: BacklogPriority;
    effort?: BacklogEffort;
    /** Codes this item waits on (⛔). */
    blockedBy: string[];
    /** 🆔 — the Obsidian Tasks id, if the user put one there. Untouched. */
    taskId?: string;
    /** `[plan:: afprj-05]` — which plan item this belongs to. */
    plan?: string;
    /** `[from:: …]` — a queue item or notice it was promoted from. */
    from?: string;
    /** `[was:: K-8]` — the code it carried before a re-parent. */
    was?: string;
    /** `[closed:: 9c4d1f#3]` — the session and turn this was closed in. Written
     *  by `stampBacklogClosed`, carried through every rebuild, and never
     *  invented: an item with no stamp was closed before tracking existed, or
     *  outside Agent Farm. */
    closed?: string;
    /** 📅 due · ✅ completed — the user's own tooling wrote these. */
    due?: string;
    doneOn?: string;
    /** priority ÷ effort. Computed, never stored: a number in the file would be
     *  one more thing to keep true by hand. */
    score: number;
    /** True when the item has children — a container, never handed out as work
     *  (see `nextBacklog`). */
    container: boolean;
    /** Something true about the line the reader should know. NOT an error: the
     *  line still works. E.g. the indent says one parent and the code says
     *  another. ‼️ Reported, never silently corrected — rearranging somebody's
     *  file to match our idea of it is precisely what this module must not do. */
    warn?: string;
}

/** Strip everything structural, leave the words.
 *
 *  ‼️ The ORDER is load-bearing: inline fields come off before the icons, or
 *  `🔽 [effort:: XS]` loses its bracket to the icon pass and leaves `S]` behind. */
function displayText(body: string): string {
    return body
        .replace(LEADING_CODE, '')
        .replace(F_ANY, ' ')
        .replace(META_VALUED, ' ')
        .replace(META_BARE, ' ')
        .replace(TAG, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export interface BacklogSummary {
    items: BacklogItem[];
    areas: BacklogArea[];
    /** Every section heading, in file order — what the panel groups by. */
    sections: string[];
    open: number;
    doing: number;
    done: number;
    cancelled: number;
    /** Items with no code — the inbox pile, whether or not it has a heading. */
    unclassified: number;
    /** Line of the 📥 heading, when the file has one. */
    inboxLine?: number;
    /** Line of the archive heading, when the file has one. */
    archiveLine?: number;
    /** The pinned head of the queue, in order — the codes listed under the 🎯
     *  heading, exactly as the file has them. Empty when there is no block, and
     *  a code in here is NOT verified to exist: the file is the truth and a
     *  stale entry is reported (see `nextBacklog`), never silently dropped. */
    queue: string[];
    /** Line of the 🎯 heading, when the file has one. */
    queueLine?: number;
}

/** A heading that holds finished work. Same idea as the inbox one. */
const ARCHIVE_HEADING = /(?:🗄|\b(?:archive|ar[şs]iv)\b)/iu;

/**
 * Every checkbox line in a backlog document, with its axes read off it.
 *
 * Headings are tracked as we go (so an item knows its section and its area) and
 * fenced code is skipped — a `- [ ]` inside a fence is documentation, and
 * ticking it would edit somebody's example.
 */
export function parseBacklog(text: string): BacklogSummary {
    const lines = String(text ?? '').split(/\r?\n/);
    const items: BacklogItem[] = [];
    const areas: BacklogArea[] = [];
    const sections: string[] = [];
    let section = '';
    let area: string | undefined;
    let inInbox = false;
    let inArchive = false;
    let inQueue = false;
    let fenced = false;
    let commented = false;
    let inboxLine: number | undefined;
    let archiveLine: number | undefined;
    let queueLine: number | undefined;
    const queue: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; continue; }
        if (fenced) { continue; }
        /* ‼️ AN HTML COMMENT IS NOT A LIST OF TASKS, and this is not theoretical:
         * the shipped backlog template explains the notation with an EXAMPLE line
         * inside a comment, and without this every project created from it opened
         * with a phantom item — which then appeared in the brief, where an agent
         * would have gone and done it. Same judgment as the code fence above: a
         * checkbox somebody wrote to show what a checkbox looks like is
         * documentation. */
        const opens = line.lastIndexOf('<!--');
        const closes = line.lastIndexOf('-->');
        const wasCommented = commented;
        if (opens >= 0 && opens > closes) { commented = true; } else if (closes >= 0 && closes > opens) { commented = false; }
        if (wasCommented || commented) { continue; }

        const heading = /^(#{1,6})\s+(.*)$/.exec(line);
        if (heading) {
            section = heading[2].trim();
            if (!sections.includes(section)) { sections.push(section); }
            const a = AREA_HEADING.exec(line);
            if (a) {
                area = a[1];
                if (!areas.some(x => x.code === area)) {
                    areas.push({ code: a[1], label: a[2].trim(), line: i, open: 0, total: 0 });
                }
            } else {
                area = undefined;
            }
            inInbox = INBOX_HEADING.test(section);
            inArchive = ARCHIVE_HEADING.test(section);
            // ‼️ An AREA heading is never the queue block, whatever it is
            // called. `## S — Sıradaki işler` is somebody's area and the items
            // under it are items; reading it as the queue would turn a section
            // of the backlog into an ordering list nobody wrote.
            //
            // Only the FIRST 🎯 block counts, so a second heading left in the
            // file cannot quietly append to the queue.
            const isQueue = !a && QUEUE_HEADING.test(section);
            if (isQueue && queueLine === undefined) { queueLine = i; }
            inQueue = isQueue && queueLine === i;
            if (inInbox && inboxLine === undefined) { inboxLine = i; }
            if (inArchive && archiveLine === undefined) { archiveLine = i; }
            continue;
        }

        // A code listed twice counts once, at its first position: a queue cannot
        // hold the same item in two places, and refusing the file over it would
        // be worse than reading it.
        if (inQueue) {
            const q = QUEUE_ENTRY.exec(line);
            if (q && !queue.includes(q[1])) { queue.push(q[1]); }
        }

        const m = TASK_LINE.exec(line);
        if (!m) { continue; }
        const body = m[3] ?? '';
        const state = stateOf(m[2]);
        const code = LEADING_CODE.exec(body)?.[1];

        const blockedBy: string[] = [];
        BLOCKED.lastIndex = 0;
        for (let b = BLOCKED.exec(line); b; b = BLOCKED.exec(line)) {
            for (const one of b[1].split(',')) { blockedBy.push(one.trim()); }
        }
        const kinds: string[] = [];
        TAG.lastIndex = 0;
        for (let t = TAG.exec(body); t; t = TAG.exec(body)) { kinds.push(t[1].toLowerCase()); }

        let priority: BacklogPriority = 'normal';
        for (const [icon, p] of Object.entries(ICON_PRIORITY)) {
            if (line.includes(icon)) { priority = p; break; }
        }
        const effortRaw = F_EFFORT.exec(body)?.[1]?.trim().toUpperCase();
        const effort = BACKLOG_EFFORTS.includes(effortRaw as BacklogEffort)
            ? effortRaw as BacklogEffort : undefined;

        items.push({
            line: i,
            raw: line,
            text: displayText(body),
            state,
            ...(code ? { code } : {}),
            ...(code ? { area: code.split('-')[0] } : (area ? { area } : {})),
            ...(code && parentCode(code) ? { parent: parentCode(code) as string } : {}),
            depth: m[1].replace(/\t/g, ' ').length,
            section,
            inbox: inInbox || !code,
            kinds,
            priority,
            ...(effort ? { effort } : {}),
            blockedBy,
            ...(/🆔\s*([A-Za-z0-9_-]+)/u.exec(line)?.[1]
                ? { taskId: /🆔\s*([A-Za-z0-9_-]+)/u.exec(line)?.[1] as string } : {}),
            ...(F_PLAN.exec(body)?.[1] ? { plan: F_PLAN.exec(body)?.[1]?.trim() as string } : {}),
            ...(F_FROM.exec(body)?.[1] ? { from: F_FROM.exec(body)?.[1]?.trim() as string } : {}),
            ...(F_WAS.exec(body)?.[1] ? { was: F_WAS.exec(body)?.[1]?.trim() as string } : {}),
            ...(F_CLOSED.exec(body)?.[1] ? { closed: F_CLOSED.exec(body)?.[1]?.trim() as string } : {}),
            ...(dateAfter(line, '📅') ? { due: dateAfter(line, '📅') as string } : {}),
            ...(dateAfter(line, '✅') ? { doneOn: dateAfter(line, '✅') as string } : {}),
            score: PRIORITY_WEIGHT[priority] /
                (effort ? EFFORT_WEIGHT[effort] : UNKNOWN_EFFORT_WEIGHT),
            container: false,
            ...(inArchive ? {} : {})
        });
    }

    // A second pass, because "is this a container" and "does the indent agree
    // with the code" can only be answered once every line has been read.
    const byCode = new Map<string, BacklogItem>();
    for (const it of items) { if (it.code && !byCode.has(it.code)) { byCode.set(it.code, it); } }
    const seen = new Set<string>();
    for (const it of items) {
        if (it.parent && byCode.has(it.parent)) { (byCode.get(it.parent) as BacklogItem).container = true; }
        if (it.code) {
            if (seen.has(it.code)) {
                it.warn = `code ${it.code} is used more than once`;
            } else if (it.parent && !byCode.has(it.parent)) {
                it.warn = `parent ${it.parent} is not in this file`;
            }
            seen.add(it.code);
        }
    }

    for (const a of areas) {
        for (const it of items) {
            if (it.area !== a.code) { continue; }
            a.total++;
            if (isLive(it.state)) { a.open++; }
        }
    }

    return {
        items, areas, sections,
        open: items.filter(i => i.state === 'open').length,
        doing: items.filter(i => i.state === 'doing').length,
        done: items.filter(i => i.state === 'done').length,
        cancelled: items.filter(i => i.state === 'cancelled').length,
        unclassified: items.filter(i => !i.code).length,
        ...(inboxLine !== undefined ? { inboxLine } : {}),
        ...(archiveLine !== undefined ? { archiveLine } : {}),
        queue,
        ...(queueLine !== undefined ? { queueLine } : {})
    };
}

// ---------------------------------------------------------------------------
// what to do next
// ---------------------------------------------------------------------------

export interface NextOptions {
    limit?: number;
    area?: string;
    kind?: string;
    /** Nothing below this priority. */
    minPriority?: BacklogPriority;
    /** ‼️ Nothing ABOVE this size. Default M. "Five you can manage" means five
     *  that FIT IN THE TURN; without a ceiling an agent picks an XL, leaves it
     *  half done, and the whole run is wasted. */
    maxEffort?: BacklogEffort;
    /** `file` (default — the user's own order) · `score` · `priority`. */
    sort?: 'file' | 'score' | 'priority';
    /** Include items whose blockers are still open. Default false. */
    includeBlocked?: boolean;
}

export interface NextResult {
    items: BacklogItem[];
    /** Live items held back because something they wait on is still open —
     *  reported rather than hidden, so "why is P-9 not in the list" has an
     *  answer that does not require reading the file. */
    blocked: { item: BacklogItem; waitingOn: string[] }[];
    /** How many live leaves there were before the filters. */
    considered: number;
    /** The pinned head, as the file has it. */
    queue: string[];
    /** Pinned codes that lead nowhere any more — the item is closed, gone, or
     *  is a container. ‼️ Reported, never quietly removed: the queue is the
     *  user's own list and a program that prunes it silently is a program that
     *  loses their ordering while telling them nothing. */
    staleQueue: string[];
}

/**
 * The engine behind "do the top five".
 *
 * Order of operations matters and each step earns its place: containers out
 * (work lives at the leaves), blocked out (doing it now would be doing it in the
 * wrong order), filters, then the user's own order — because the user arranging
 * their queue IS the prioritisation, and a clever sort that overrules it would
 * make dragging pointless.
 *
 * That order has two halves: the PINNED HEAD (`## 🎯 Queue`) first, then the
 * file's line order for everything not in it. The head is what makes a queue
 * possible at all in a file grouped by area — see `QUEUE_HEADING`.
 */
export function nextBacklog(text: string, opts: NextOptions = {}): NextResult {
    const { items, queue } = parseBacklog(text);
    const byCode = new Map(items.filter(i => i.code).map(i => [i.code as string, i]));
    const live = items.filter(i => isLive(i.state) && !i.container);
    const blocked: NextResult['blocked'] = [];
    const minW = PRIORITY_WEIGHT[opts.minPriority ?? 'lowest'];
    const maxW = EFFORT_WEIGHT[opts.maxEffort ?? 'M'];

    const passed = live.filter(i => {
        if (opts.area && i.area !== opts.area) { return false; }
        if (opts.kind && !i.kinds.includes(opts.kind.toLowerCase())) { return false; }
        if (PRIORITY_WEIGHT[i.priority] < minW) { return false; }
        // An item with no effort stated is NOT excluded by the ceiling: it has
        // not been sized, and refusing to hand out everything unsized would make
        // the feature useless on a fresh backlog where nothing is sized yet.
        if (i.effort && EFFORT_WEIGHT[i.effort] > maxW) { return false; }
        const waitingOn = i.blockedBy.filter(c => {
            const dep = byCode.get(c);
            return dep ? isLive(dep.state) : false;   // an unknown code blocks nothing
        });
        if (waitingOn.length) {
            blocked.push({ item: i, waitingOn });
            return opts.includeBlocked === true;
        }
        return true;
    });

    /**
     * ‼️ THE PINNED HEAD GOES FIRST, AND ONLY IN FILE ORDER.
     *
     * `score` and `priority` are a different QUESTION — "what is cheapest",
     * "what is most urgent" — and a caller who asked one of them did not ask
     * for the user's hand-made order. Overruling their sort with the pins would
     * make those two options mean nothing. File order is the one the queue is
     * an expression of, so that is the one it leads.
     *
     * Rank comes off the file's list, and everything unpinned keeps its line
     * order behind it: the queue is a HEAD, not a replacement.
     */
    const rank = new Map<string, number>();
    queue.forEach((c, n) => rank.set(c, n));
    const pinnedFirst = (a: BacklogItem, b: BacklogItem): number => {
        const ra = a.code !== undefined ? rank.get(a.code) : undefined;
        const rb = b.code !== undefined ? rank.get(b.code) : undefined;
        if (ra === undefined && rb === undefined) { return a.line - b.line; }
        if (ra === undefined) { return 1; }
        if (rb === undefined) { return -1; }
        return ra - rb;
    };

    const sorted = opts.sort === 'score'
        ? [...passed].sort((a, b) => b.score - a.score || a.line - b.line)
        : opts.sort === 'priority'
            ? [...passed].sort((a, b) =>
                PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority] || a.line - b.line)
            : (queue.length ? [...passed].sort(pinnedFirst) : passed);

    // A pin whose item is closed, gone or has become a container leads nowhere,
    // and the caller is told which — so "why is X-5 not first any more" never
    // needs the file to be read by hand. ‼️ Measured against the ITEM, not
    // against this call's filters: an `area: 'K'` query must not report every
    // other area's pins as rubbish.
    const staleQueue = queue.filter(c => {
        const it = byCode.get(c);
        return !it || !isLive(it.state) || it.container;
    });

    const limit = Math.max(1, Math.min(50, opts.limit ?? 5));
    return { items: sorted.slice(0, limit), blocked, considered: live.length, queue, staleQueue };
}

// ---------------------------------------------------------------------------
// addressing an item
// ---------------------------------------------------------------------------

/** How a caller says WHICH item. The code is the stable handle; a line number is
 *  exact but goes stale the moment somebody inserts a paragraph in Obsidian. */
export interface BacklogTarget {
    code?: string;
    line?: number;
    /** A unique piece of the item's text. Ambiguous is an error, never a guess:
     *  editing the wrong line in somebody's backlog is silent. */
    text?: string;
}

export interface BacklogEditResult {
    ok: boolean;
    /** The whole document afterwards — the caller writes it through the guarded,
     *  atomic path, which is the only thing allowed to touch a file Obsidian may
     *  be holding open. */
    text?: string;
    error?: string;
    item?: BacklogItem;
    note?: string;
}

function locate(items: BacklogItem[], target: BacklogTarget): { item?: BacklogItem; error?: string } {
    if (target.code) {
        const want = target.code.trim().toUpperCase();
        const hits = items.filter(i => i.code === want);
        if (!hits.length) { return { error: `no backlog item with code ${want}` }; }
        if (hits.length > 1) { return { error: `code ${want} is on ${hits.length} lines — fix the duplicate first` }; }
        return { item: hits[0] };
    }
    if (typeof target.line === 'number' && target.line >= 0) {
        const hit = items.find(i => i.line === target.line);
        if (!hit) { return { error: `line ${target.line + 1} is not a backlog item` }; }
        const claimed = String(target.text ?? '').trim();
        // With a line AND text this is a CHECK, not a search — the document may
        // have moved under a panel that has been open for an hour.
        if (claimed && !hit.text.toLowerCase().includes(claimed.toLowerCase())) {
            return {
                error: `line ${target.line + 1} now reads "${hit.text}", not "${claimed}"`
                    + ' — the document changed since you read it; reload and try again'
            };
        }
        return { item: hit };
    }
    const needle = String(target.text ?? '').trim().toLowerCase();
    if (!needle) { return { error: 'say which item: code, line or text' }; }
    const exact = items.filter(i => i.text.toLowerCase() === needle);
    const hits = exact.length ? exact : items.filter(i => i.text.toLowerCase().includes(needle));
    if (!hits.length) { return { error: `no backlog item matches "${target.text}"` }; }
    if (hits.length > 1) {
        return {
            error: `"${target.text}" matches ${hits.length} items `
                + `(${hits.map(h => h.code ?? `line ${h.line + 1}`).join(', ')}) — be more specific, or use the code`
        };
    }
    return { item: hits[0] };
}

/**
 * Find one item WITHOUT changing anything — the read-only half of `locate`.
 *
 * Exported because "which item did you mean" is a rule, not a detail: opening a
 * row at its line has to resolve a code exactly the way ticking its box does, or
 * the two disagree about which line `K-8` is on and only one of them is right.
 */
export function findBacklogItem(
    text: string, target: BacklogTarget
): { item?: BacklogItem; error?: string } {
    return locate(parseBacklog(String(text ?? '')).items, target);
}

/** Replace one line in the source, working on OFFSETS INTO THE ORIGINAL STRING.
 *  Splitting and rejoining would rewrite every line ending in a mixed-ending
 *  file, so a one-word edit would land in the user's vault — and in git — as a
 *  whole-file diff. */
function replaceLine(src: string, line: number, next: string): string | undefined {
    const start = lineStartOffset(src, line);
    if (start < 0) { return undefined; }
    let end = src.indexOf('\n', start);
    if (end < 0) { end = src.length; } else if (src[end - 1] === '\r') { end--; }
    return src.slice(0, start) + next + src.slice(end);
}

// ---------------------------------------------------------------------------
// writing — state
// ---------------------------------------------------------------------------

/**
 * Move an item between states.
 *
 * ‼️ EXACTLY ONE CHARACTER OF THE DOCUMENT CHANGES — the one inside `[ ]`. No
 * ✅ date is added: Agent Farm does not write metadata it does not own, and
 * Obsidian's Tasks plugin puts one there when the box is ticked THERE, which is
 * the right division of labour. Rebuilding the line from its parsed pieces would
 * pass the same unit test and quietly normalise somebody's file in real life.
 */
export function setBacklogState(
    text: string, target: BacklogTarget, state: BacklogState
): BacklogEditResult {
    const src = String(text ?? '');
    const { items } = parseBacklog(src);
    const found = locate(items, target);
    if (!found.item) { return { ok: false, error: found.error as string }; }
    const item = found.item;
    if (item.state === state) { return { ok: true, text: src, item }; }

    const start = lineStartOffset(src, item.line);
    const box = start < 0 ? -1 : start + item.raw.indexOf('[') + 1;
    if (box < 0 || src[box - 1] !== '[' || src[box + 1] !== ']') {
        return { ok: false, error: 'that line no longer looks like a checkbox' };
    }
    const ch = STATE_CHAR[state];
    const nextText = src.slice(0, box) + ch + src.slice(box + 1);
    const raw = item.raw.slice(0, item.raw.indexOf('[') + 1) + ch + item.raw.slice(item.raw.indexOf('[') + 2);
    return {
        ok: true, text: nextText, item: { ...item, state, raw },
        ...(state !== 'done' && item.doneOn
            ? { note: `the line still carries its ✅ ${item.doneOn} — Agent Farm does not remove metadata it did not write` }
            : {})
    };
}

// ---------------------------------------------------------------------------
// writing — the closing stamp
// ---------------------------------------------------------------------------

/** `<session>#<turn>` — eight characters of the session id is enough to find it
 *  and short enough to sit on a line somebody reads. The full id is in the track
 *  ledger; this is the pointer, not the record. */
export const CLOSED_STAMP = /^[0-9a-zA-Z-]{4,40}#\d+$/;

/**
 * Write (or clear) `[closed:: 9c4d1f#3]` on one line, WITHOUT rebuilding it.
 *
 * Kept apart from `setBacklogFields` on purpose. Closing an item is the moment
 * the stamp is written, and closing goes through `setBacklogState`, whose whole
 * promise is that exactly one character of the document changes. Routing the
 * stamp through the rebuild would mean every tick also reordered the line's
 * pieces — a whole-line diff in the user's vault for a box they ticked. So this
 * function does the smallest edit that can carry the information: it replaces an
 * existing stamp where it stands, or appends one at the end of the line.
 *
 * The appended position is not the canonical one (`setBacklogFields` puts inline
 * fields before ⛔ 🆔 📅) and that is accepted rather than fixed: it parses
 * identically wherever it sits, and the next field edit moves it into place.
 */
export function stampBacklogClosed(
    text: string, target: BacklogTarget, stamp: string | null
): BacklogEditResult {
    const src = String(text ?? '');
    const { items } = parseBacklog(src);
    const found = locate(items, target);
    if (!found.item) { return { ok: false, error: found.error as string }; }
    const item = found.item;
    const want = stamp === null ? '' : String(stamp).trim();
    if (want && !CLOSED_STAMP.test(want)) {
        return { ok: false, error: `"${want}" is not a closing stamp — it looks like <session>#<turn>` };
    }
    if ((item.closed ?? '') === want) { return { ok: true, text: src, item }; }

    const existing = new RegExp(F_CLOSED.source, 'giu');
    let line = item.raw;
    if (item.closed) {
        line = want
            ? line.replace(existing, `[closed:: ${want}]`)
            : line.replace(existing, '').replace(/\s{2,}/g, ' ').trimEnd();
    } else if (want) {
        line = `${line.trimEnd()} [closed:: ${want}]`;
    }
    const nextText = replaceLine(src, item.line, line);
    if (nextText === undefined) { return { ok: false, error: 'that line is no longer there' }; }
    const rebuilt = parseBacklog(nextText).items.find(i => i.line === item.line);
    return { ok: true, text: nextText, ...(rebuilt ? { item: rebuilt } : {}) };
}

// ---------------------------------------------------------------------------
// writing — fields
// ---------------------------------------------------------------------------

export interface BacklogFields {
    priority?: BacklogPriority;
    /** `null` clears it. */
    effort?: BacklogEffort | null;
    /** Replaces the item's tags wholesale. `[]` clears them. */
    kinds?: string[];
    /** YYYY-MM-DD, or `null` to clear. */
    due?: string | null;
    /** A plan item's 🆔, or `null`. */
    plan?: string | null;
    /** Codes this waits on. `[]` clears. */
    blockedBy?: string[];
    /** Replace the item's words, keeping code and every axis in place. */
    text?: string;
}

/**
 * Surgery on one line: change the axes, keep everything else.
 *
 * The line is rebuilt in a FIXED order — `code text #kinds PRIO [fields] ⛔ 🆔 📅`
 * — and that is a real trade-off, stated rather than hidden: unlike
 * `setBacklogState` this one CAN move a line's pieces around. It is the price of
 * being able to set a priority without the caller hand-writing markdown.
 *
 * ‼️ EVERY INLINE FIELD THIS FUNCTION IS TO KEEP MUST BE LISTED BELOW, and the
 * failure when one is not is silent, which is why it is spelled out here. The
 * rebuild does not edit the old line; it composes a NEW one out of the pieces
 * the parser handed back. `displayText` strips every `[key:: value]` out of the
 * words, so a field the parser does not read is in neither half — it is simply
 * not in the new line, and it disappears the first time somebody clicks a
 * priority badge. Nobody sees it go. So: a new inline field means a new property
 * on `BacklogItem`, a new `F_*` pattern, AND a new `parts.push` here. Three
 * places, one commit.
 *
 * What it never does is touch a line it was not asked about, invent metadata, or
 * drop a piece it did not understand: anything that is not a field — prose,
 * unknown icons, a stray word — rides along inside the text.
 */
export function setBacklogFields(
    text: string, target: BacklogTarget, fields: BacklogFields
): BacklogEditResult {
    const src = String(text ?? '');
    const { items } = parseBacklog(src);
    const found = locate(items, target);
    if (!found.item) { return { ok: false, error: found.error as string }; }
    const item = found.item;

    const priority = fields.priority ?? item.priority;
    const effort = fields.effort === null ? undefined : (fields.effort ?? item.effort);
    const kinds = fields.kinds ?? item.kinds;
    const due = fields.due === null ? undefined : (fields.due ?? item.due);
    const plan = fields.plan === null ? undefined : (fields.plan ?? item.plan);
    const blockedBy = fields.blockedBy ?? item.blockedBy;
    const words = (fields.text ?? item.text).replace(/\r?\n/g, ' ').trim();
    if (!words) { return { ok: false, error: 'an item needs some text' }; }

    const indent = /^(\s*)/.exec(item.raw)?.[1] ?? '';
    const bullet = /^\s*([-*+]|\d+[.)])/.exec(item.raw)?.[1] ?? '-';
    const parts = [`${indent}${bullet} [${STATE_CHAR[item.state]}]`];
    if (item.code) { parts.push(item.code); }
    parts.push(words);
    for (const k of kinds) { parts.push(`#${k}`); }
    if (PRIORITY_ICON[priority]) { parts.push(PRIORITY_ICON[priority]); }
    if (effort) { parts.push(`[effort:: ${effort}]`); }
    if (plan) { parts.push(`[plan:: ${plan}]`); }
    if (item.from) { parts.push(`[from:: ${item.from}]`); }
    if (item.was) { parts.push(`[was:: ${item.was}]`); }
    if (item.closed) { parts.push(`[closed:: ${item.closed}]`); }
    for (const b of blockedBy) { parts.push(`⛔ ${b}`); }
    if (item.taskId) { parts.push(`🆔 ${item.taskId}`); }
    if (due) { parts.push(`📅 ${due}`); }
    if (item.doneOn) { parts.push(`✅ ${item.doneOn}`); }

    const line = parts.join(' ');
    const nextText = replaceLine(src, item.line, line);
    if (nextText === undefined) { return { ok: false, error: 'that line is no longer there' }; }
    const rebuilt = parseBacklog(nextText).items.find(i => i.line === item.line);
    return { ok: true, text: nextText, ...(rebuilt ? { item: rebuilt } : {}) };
}

// ---------------------------------------------------------------------------
// writing — adding
// ---------------------------------------------------------------------------

/** The next free number in an area (or under a parent). Only ever counts UP:
 *  a cancelled item's number stays spent, because a note from three months ago
 *  that says `K-8` must not start meaning something else. */
export function nextCode(items: BacklogItem[], area: string, parent?: string): string {
    const a = area.trim().toUpperCase();
    if (parent) {
        const prefix = `${parent}.`;
        let max = 0;
        for (const it of items) {
            if (!it.code?.startsWith(prefix)) { continue; }
            const tail = it.code.slice(prefix.length);
            if (tail.includes('.')) { continue; }          // a grandchild, not a child
            max = Math.max(max, Number(tail) || 0);
        }
        return `${parent}.${max + 1}`;
    }
    let max = 0;
    for (const it of items) {
        const m = it.code ? BACKLOG_CODE.exec(it.code) : null;
        if (!m || m[1] !== a) { continue; }
        max = Math.max(max, Number(m[2].split('.')[0]) || 0);
    }
    return `${a}-${max + 1}`;
}

export interface AddBacklogInput {
    /** The words. Everything else is optional, on purpose. */
    text: string;
    /** Where it belongs. With neither area nor parent the item goes to the
     *  inbox WITHOUT a code — which is the friction-free path and the one the
     *  quick-capture box uses. */
    area?: string;
    /** Hang it under this code; the area is taken from the parent. */
    parent?: string;
    priority?: BacklogPriority;
    effort?: BacklogEffort;
    kinds?: string[];
    due?: string;
    plan?: string;
    from?: string;
    blockedBy?: string[];
    state?: BacklogState;
}

export interface AddBacklogResult extends BacklogEditResult {
    /** The code it was given, when it got one. */
    code?: string;
}

/**
 * Add an item.
 *
 * Where it lands, in order of preference: under its parent's last descendant
 * (so a child joins its family), else at the end of its area's section, else
 * under the 📥 heading, else at the end of the file. Appending is the one
 * insertion that cannot damage a structure we read wrongly, so it is the last
 * resort rather than the first move.
 */
export function addBacklogItem(text: string, input: AddBacklogInput): AddBacklogResult {
    const src = String(text ?? '');
    const words = String(input.text ?? '').replace(/\r?\n/g, ' ').trim();
    if (!words) { return { ok: false, error: 'an item needs some text' }; }
    const parsed = parseBacklog(src);
    const eol = eolOf(src);

    const parent = input.parent?.trim().toUpperCase();
    if (parent && !parsed.items.some(i => i.code === parent)) {
        return { ok: false, error: `no backlog item with code ${parent} to hang this under` };
    }
    const area = parent ? parent.split('-')[0] : input.area?.trim().toUpperCase();
    if (area && !BACKLOG_CODE.test(`${area}-1`)) {
        return { ok: false, error: `"${area}" is not an area code — one or two capital letters` };
    }
    const code = area ? nextCode(parsed.items, area, parent) : undefined;

    // Where to put it.
    let after = -1;                                    // insert AFTER this line
    let indent = '';
    if (parent) {
        const owner = parsed.items.find(i => i.code === parent) as BacklogItem;
        const family = parsed.items.filter(i => i.code?.startsWith(`${parent}.`));
        const last = family.length ? family[family.length - 1] : owner;
        after = last.line;
        indent = ' '.repeat((family.length ? last.depth : owner.depth + 4));
    } else if (area) {
        const inArea = parsed.items.filter(i => i.area === area && i.depth === 0);
        if (inArea.length) {
            // past the last top-level item of the area AND its children
            const last = inArea[inArea.length - 1];
            const kids = parsed.items.filter(i => i.line > last.line && i.depth > last.depth);
            after = kids.length ? kids[kids.length - 1].line : last.line;
        } else {
            const heading = parsed.areas.find(x => x.code === area);
            if (heading) { after = heading.line; }
        }
    } else if (parsed.inboxLine !== undefined) {
        const inInbox = parsed.items.filter(i => i.inbox && i.line > (parsed.inboxLine as number));
        // stop at the next heading: only the items directly under 📥 count
        const nextHeading = src.split(/\r?\n/)
            .findIndex((l, n) => n > (parsed.inboxLine as number) && /^#{1,6}\s/.test(l));
        const mine = inInbox.filter(i => nextHeading < 0 || i.line < nextHeading);
        after = mine.length ? mine[mine.length - 1].line : (parsed.inboxLine as number);
    }

    const parts = [`${indent}- [${STATE_CHAR[input.state ?? 'open']}]`];
    if (code) { parts.push(code); }
    parts.push(words);
    for (const k of input.kinds ?? []) { parts.push(`#${k.replace(/^#/, '')}`); }
    if (input.priority && PRIORITY_ICON[input.priority]) { parts.push(PRIORITY_ICON[input.priority]); }
    if (input.effort) { parts.push(`[effort:: ${input.effort}]`); }
    if (input.plan) { parts.push(`[plan:: ${input.plan}]`); }
    if (input.from) { parts.push(`[from:: ${input.from}]`); }
    for (const b of input.blockedBy ?? []) { parts.push(`⛔ ${b}`); }
    if (input.due) { parts.push(`📅 ${input.due}`); }
    const line = parts.join(' ');

    let nextText: string;
    if (after >= 0) {
        const at = lineStartOffset(src, after + 1);
        nextText = at >= 0
            ? src.slice(0, at) + line + eol + src.slice(at)
            : src + (src.endsWith('\n') ? '' : eol) + line + eol;
    } else {
        nextText = src + (!src || src.endsWith('\n') ? '' : eol) + line + eol;
    }
    const added = parseBacklog(nextText).items.find(i => i.raw === line);
    return {
        ok: true, text: nextText,
        ...(code ? { code } : {}),
        ...(added ? { item: added } : {}),
        ...(code ? {} : { note: 'no area given — it went to the inbox without a code' })
    };
}

// ---------------------------------------------------------------------------
// writing — classifying
// ---------------------------------------------------------------------------

/**
 * Give a code to an item that has none, and move it into its area's section.
 *
 * This is the second half of friction-free capture: writing the note costs
 * nothing, and the cost of classifying it is paid later by whoever has the
 * context — which may well be an agent.
 */
export function codeBacklogItem(
    text: string, target: BacklogTarget, area: string, parent?: string
): AddBacklogResult {
    const src = String(text ?? '');
    const parsed = parseBacklog(src);
    const found = locate(parsed.items, target);
    if (!found.item) { return { ok: false, error: found.error as string }; }
    const item = found.item;
    if (item.code) { return { ok: false, error: `${item.code} already has a code` }; }

    const owner = parent?.trim().toUpperCase();
    if (owner && !parsed.items.some(i => i.code === owner)) {
        return { ok: false, error: `no backlog item with code ${owner}` };
    }
    const a = (owner ? owner.split('-')[0] : area.trim().toUpperCase());
    if (!BACKLOG_CODE.test(`${a}-1`)) {
        return { ok: false, error: `"${a}" is not an area code — one or two capital letters` };
    }
    const code = nextCode(parsed.items, a, owner);

    // Re-add it where it belongs, then take the old line out. Doing it in this
    // order keeps the line numbers we already resolved valid while inserting.
    const added = addBacklogItem(src, {
        text: item.text,
        ...(owner ? { parent: owner } : { area: a }),
        priority: item.priority,
        ...(item.effort ? { effort: item.effort } : {}),
        kinds: item.kinds,
        ...(item.due ? { due: item.due } : {}),
        ...(item.plan ? { plan: item.plan } : {}),
        ...(item.from ? { from: item.from } : {}),
        blockedBy: item.blockedBy,
        state: item.state
    });
    if (!added.ok) { return added; }
    const withNew = added.text as string;
    // The original line moved down by one if the insertion happened above it.
    const insertedAbove = (added.item?.line ?? Infinity) <= item.line;
    const oldLine = insertedAbove ? item.line + 1 : item.line;
    const cut = removeLine(withNew, oldLine, item.raw);
    if (!cut) { return { ok: false, error: 'the original line moved while classifying — reload and try again' }; }
    return { ok: true, text: cut, code, ...(added.item ? { item: added.item } : {}) };
}

/** Take one line out, verified by what it says. The check is the point: without
 *  it a stale line number deletes a line the caller never saw. */
function removeLine(src: string, line: number, expect: string): string | undefined {
    const start = lineStartOffset(src, line);
    if (start < 0) { return undefined; }
    let end = src.indexOf('\n', start);
    const hasEol = end >= 0;
    if (!hasEol) { end = src.length; }
    const raw = src.slice(start, hasEol ? (src[end - 1] === '\r' ? end - 1 : end) : end);
    if (raw !== expect) { return undefined; }
    return src.slice(0, start) + src.slice(hasEol ? end + 1 : end);
}

// ---------------------------------------------------------------------------
// writing — order
// ---------------------------------------------------------------------------

/** Where a move puts an item, in the order a person says it: one step either
 *  way, or all the way to one end of its section. */
export type BacklogMoveDir = 'up' | 'down' | 'top' | 'bottom';
export const BACKLOG_MOVES: BacklogMoveDir[] = ['up', 'down', 'top', 'bottom'];

/** An item plus every line indented under it — what a move carries. */
function blockOf(items: BacklogItem[], start: BacklogItem): { from: number; to: number } {
    let to = start.line;
    for (const it of items) {
        if (it.line > start.line && it.depth > start.depth) { to = it.line; } else if (it.line > start.line) { break; }
    }
    return { from: start.line, to };
}

/**
 * Lift one item's block out and put it back down against another's.
 *
 * Cut-and-reinsert rather than swap, because the two blocks are rarely the same
 * height and "move to the top" is not a swap with anything. The anchor is worked
 * out in the ORIGINAL line numbering and then corrected for the lines that were
 * removed above it — doing it the other way round is how an item lands one row
 * off, which on a two-hundred-line backlog nobody notices until the order is
 * wrong everywhere.
 */
function spliceBlock(
    src: string, items: BacklogItem[], item: BacklogItem, dest: BacklogItem, place: 'before' | 'after'
): BacklogEditResult {
    const mine = blockOf(items, item);
    const theirs = blockOf(items, dest);
    if (theirs.from >= mine.from && theirs.to <= mine.to) {
        return { ok: false, error: 'an item cannot be moved inside itself' };
    }
    if (mine.from >= theirs.from && mine.to <= theirs.to) {
        return { ok: false, error: 'that would move an item inside its own parent block' };
    }
    const lines = src.split(/\r?\n/);
    const eol = eolOf(src);
    const moving = lines.slice(mine.from, mine.to + 1);
    const rest = lines.filter((_, n) => n < mine.from || n > mine.to);
    const anchor = place === 'before' ? theirs.from : theirs.to + 1;
    const at = anchor > mine.to ? anchor - moving.length : anchor;
    const out = [...rest.slice(0, at), ...moving, ...rest.slice(at)];

    // ‼️ A move is the one edit that genuinely reorders lines, so rejoining is
    // unavoidable — but the document's OWN ending is used, so a file that was
    // CRLF stays CRLF and does not come back as a whole-file diff.
    return { ok: true, text: out.join(eol), item };
}

/**
 * Move an item among its siblings, carrying its children with it.
 *
 * ‼️ THE CODE DOES NOT CHANGE. Order and identity are different things here, and
 * this function is where that promise is kept: dragging `K-8` above `K-3` leaves
 * both codes exactly as they were, so every note, commit message and chat line
 * that ever quoted one still points at the same item.
 *
 * `top` and `bottom` exist because a backlog is a QUEUE and the thing a person
 * wants from a queue is "this one next" — reached by pressing ▲ eleven times
 * otherwise, which is the same as not being able to do it.
 */
export function moveBacklogItem(
    text: string, target: BacklogTarget, dir: BacklogMoveDir
): BacklogEditResult {
    const src = String(text ?? '');
    const { items } = parseBacklog(src);
    const found = locate(items, target);
    if (!found.item) { return { ok: false, error: found.error as string }; }
    const item = found.item;

    const siblings = items.filter(i => i.depth === item.depth && i.section === item.section);
    const at = siblings.findIndex(i => i.line === item.line);
    const dest = dir === 'up' ? siblings[at - 1]
        : dir === 'down' ? siblings[at + 1]
            : dir === 'top' ? siblings[0]
                : siblings[siblings.length - 1];
    const end = dir === 'up' || dir === 'top' ? 'top' : 'bottom';
    if (!dest || dest.line === item.line) {
        return { ok: true, text: src, item, note: `already at the ${end} of its section` };
    }
    return spliceBlock(src, items, item, dest, end === 'top' ? 'before' : 'after');
}

/**
 * Drop an item directly above or below another one — the drag, in one call.
 *
 * Kept apart from `moveBacklogItem` because it answers a different question:
 * one nudges within a known order, this one names the destination. Two rules it
 * will not bend, both because breaking them is SILENT: the destination must be
 * in the same section (crossing a heading changes which area an item belongs to,
 * which is a re-file and has its own operation) and at the same depth (landing
 * under a different parent is a re-parent, likewise).
 */
export function reorderBacklogItem(
    text: string, target: BacklogTarget, dest: BacklogTarget, place: 'before' | 'after'
): BacklogEditResult {
    const src = String(text ?? '');
    const { items } = parseBacklog(src);
    const found = locate(items, target);
    if (!found.item) { return { ok: false, error: found.error as string }; }
    const to = locate(items, dest);
    if (!to.item) { return { ok: false, error: to.error as string }; }
    const item = found.item;
    const anchor = to.item;
    if (item.line === anchor.line) { return { ok: true, text: src, item }; }
    if (item.section !== anchor.section) {
        return {
            ok: false,
            error: `"${item.section}" and "${anchor.section}" are different sections`
                + ' — moving between them re-files the item; use backlog.code for that'
        };
    }
    if (item.depth !== anchor.depth) {
        return { ok: false, error: 'those two sit at different depths — dropping across them would re-parent the item' };
    }
    return spliceBlock(src, items, item, anchor, place);
}

// ---------------------------------------------------------------------------
// writing — the queue
// ---------------------------------------------------------------------------

/** How much of an item's words rides along beside its code in the block. Enough
 *  to recognise it, short enough that the block stays a LIST — a queue you have
 *  to read paragraphs of is not one you can see the shape of. */
const QUEUE_LABEL = 64;

export interface QueueEditResult extends BacklogEditResult {
    /** The queue as it stands afterwards. */
    queue: string[];
}

/** Where the block's lines run, heading included. `to` is exclusive and stops
 *  at the next heading of any level, so prose somebody wrote under the queue is
 *  carried out with it rather than being orphaned above the next section. */
function queueBlock(lines: string[], at: number): { from: number; to: number } {
    let to = at + 1;
    while (to < lines.length && !/^#{1,6}\s/.test(lines[to])) { to++; }
    return { from: at, to };
}

/**
 * Replace the pinned head with exactly these codes.
 *
 * ‼️ THE WHOLE BLOCK IS REWRITTEN AND NOTHING ELSE IS TOUCHED. That split is
 * what makes the queue safe to own: Agent Farm writes this one block, every
 * item line in the file stays byte-identical, and a person who rearranges the
 * block by hand in Obsidian is doing the same edit this function does.
 *
 * An empty list REMOVES the block rather than leaving an empty heading — a
 * queue you cleared should leave no furniture behind.
 *
 * ‼️ A code that leads nowhere is DROPPED HERE, WITH A NOTE, rather than
 * refused — and that is not laxness, it is the only way the list stays
 * editable. A queue holding one item that was deleted in Obsidian would
 * otherwise refuse every later edit of itself, including the one that would
 * have removed the dead entry. Validating a code somebody NAMED is the caller's
 * job (see `pinBacklogItem`), because there a typo must not look like success.
 */
export function setBacklogQueue(text: string, codes: string[]): QueueEditResult {
    const src = String(text ?? '');
    const parsed = parseBacklog(src);
    const byCode = new Map(parsed.items.filter(i => i.code).map(i => [i.code as string, i]));

    const wanted: string[] = [];
    for (const raw of codes) {
        const code = String(raw ?? '').trim().toUpperCase();
        if (!code || wanted.includes(code)) { continue; }
        wanted.push(code);
    }
    // Gone, or closed: not in anybody's queue. Keeping either would leave a
    // dead entry at the head for ever.
    const dropped = wanted.filter(c => {
        const it = byCode.get(c);
        return !it || !isLive(it.state);
    });
    const queue = wanted.filter(c => !dropped.includes(c));

    const lines = src.split(/\r?\n/);
    const eol = eolOf(src);
    const body = queue.map((code, n) => {
        const words = (byCode.get(code) as BacklogItem).text.replace(/\s+/g, ' ').trim();
        const label = words.length > QUEUE_LABEL ? `${words.slice(0, QUEUE_LABEL).replace(/\s+\S*$/, '')}…` : words;
        return `${n + 1}. ${code}${label ? ` — ${label}` : ''}`;
    });

    let out: string[];
    if (parsed.queueLine !== undefined) {
        const block = queueBlock(lines, parsed.queueLine);
        const rest = [...lines.slice(0, block.from), ...lines.slice(block.to)];
        out = queue.length
            ? [...lines.slice(0, block.from), QUEUE_TITLE, '', ...body, '', ...lines.slice(block.to)]
            : rest;
    } else if (!queue.length) {
        return { ok: true, text: src, queue, note: 'the queue was already empty' };
    } else {
        // A new block goes ABOVE the first section — the head of the queue is
        // the first thing a reader of this file should meet. The document's own
        // title (a single #) is not a section, so it keeps its place.
        let at = lines.findIndex(l => /^#{2,6}\s/.test(l));
        if (at < 0) { at = lines.length; }
        out = [...lines.slice(0, at), QUEUE_TITLE, '', ...body, '', ...lines.slice(at)];
    }

    return {
        ok: true, text: out.join(eol), queue,
        ...(dropped.length
            ? { note: `${dropped.join(', ')} ${dropped.length === 1 ? 'is' : 'are'} closed or gone — left out of the queue` }
            : {})
    };
}

/**
 * Put one code at a position in the queue — `at` counted the way a person says
 * it, 1 being the head and the default.
 *
 * This is the "do this one next" button, and it is the whole reason the block
 * exists: it works ACROSS AREAS, which no move of a line ever can.
 */
export function pinBacklogItem(text: string, code: string, at?: number): QueueEditResult {
    const src = String(text ?? '');
    const want = String(code ?? '').trim().toUpperCase();
    const parsed = parseBacklog(src);
    if (!BACKLOG_CODE.test(want)) {
        return {
            ok: false, queue: parsed.queue,
            error: `"${code}" is not a backlog code — an uncoded capture has to be filed before it can be queued`
        };
    }
    const item = parsed.items.find(i => i.code === want);
    if (!item) { return { ok: false, error: `no backlog item with code ${want}`, queue: parsed.queue }; }
    if (!isLive(item.state)) {
        return { ok: false, error: `${want} is ${item.state} — a closed item is not queued`, queue: parsed.queue };
    }
    if (item.container) {
        return {
            ok: false, queue: parsed.queue,
            error: `${want} has children — work lives at the leaves, so queue one of them instead`
        };
    }
    const rest = parsed.queue.filter(c => c !== want);
    const where = Math.max(0, Math.min(rest.length, (at === undefined ? 1 : Math.floor(at)) - 1));
    return setBacklogQueue(src, [...rest.slice(0, where), want, ...rest.slice(where)]);
}

/** Take one code out of the queue — it falls back to its place in the file's
 *  own order, which is where it was before anybody pinned it. */
export function unpinBacklogItem(text: string, code: string): QueueEditResult {
    const src = String(text ?? '');
    const want = String(code ?? '').trim().toUpperCase();
    const parsed = parseBacklog(src);
    if (!parsed.queue.includes(want)) {
        return { ok: true, text: src, queue: parsed.queue, note: `${want} was not in the queue` };
    }
    return setBacklogQueue(src, parsed.queue.filter(c => c !== want));
}

// ---------------------------------------------------------------------------
// writing — archiving
// ---------------------------------------------------------------------------

/** The heading finished work is moved under. Written only if it is needed. */
export const ARCHIVE_TITLE = '## 🗄 Archive';

export interface ArchiveResult extends BacklogEditResult {
    moved: number;
}

/**
 * Move closed items to an archive section AT THE END OF THE SAME FILE.
 *
 * Deliberately not a separate file, and the reason is codes: a number must never
 * be handed out twice, and the cheapest guarantee of that is that every code
 * this project has ever used is still in the file the generator reads. An
 * archive elsewhere would let `K-8` be reissued the moment somebody moved the
 * old K-8 out — and the two would look identical in a three-month-old note.
 */
export function archiveBacklogDone(text: string, opts: { cancelled?: boolean } = {}): ArchiveResult {
    const src = String(text ?? '');
    const parsed = parseBacklog(src);
    const wanted = parsed.items.filter(i =>
        (i.state === 'done' || (opts.cancelled !== false && i.state === 'cancelled'))
        && !i.container
        && !(parsed.archiveLine !== undefined && i.line > parsed.archiveLine));
    if (!wanted.length) { return { ok: true, text: src, moved: 0, note: 'nothing closed to archive' }; }

    const lines = src.split(/\r?\n/);
    const eol = eolOf(src);
    const taken = new Set(wanted.map(i => i.line));
    const kept = lines.filter((_, n) => !taken.has(n));
    const body = wanted.map(i => i.raw.trim().startsWith('-') ? i.raw : `- ${i.raw.trim()}`);

    let out: string[];
    if (parsed.archiveLine !== undefined) {
        // Insert under the existing heading, which may have moved up as lines
        // above it were taken out.
        const shift = wanted.filter(i => i.line < (parsed.archiveLine as number)).length;
        const at = (parsed.archiveLine as number) - shift + 1;
        out = [...kept.slice(0, at), ...body, ...kept.slice(at)];
    } else {
        while (kept.length && !kept[kept.length - 1].trim()) { kept.pop(); }
        out = [...kept, '', ARCHIVE_TITLE, '', ...body, ''];
    }
    return { ok: true, text: out.join(eol), moved: wanted.length };
}
