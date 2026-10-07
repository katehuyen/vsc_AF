import { eolOf, lineStartOffset, TASK_LINE } from './projectPlan';
import { sanitizeBacklogMarkdown, sanitizeBacklogTags } from './backlogSanitize';
import { LINE_BREAKS } from './lineBreaks';
import { itemBlockEnd } from './backlogBlock';

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
 *   - [ ] P-5 Work tab #feat 🔼 [effort:: L] [parent:: P-1] ⛔ P-3 [plan:: afprj-05]
 *     └─┬─┘ └┬┘ └──┬───┘ └─┬─┘ └┬┘ └─────┬────┘ └─────┬─────┘ └──┬─┘ └──────┬──────┘
 *    state code  text    kind  pri    effort      part of    blockedBy   plan link
 *
 * state = the checkbox itself (Obsidian's own alternate states), kind = a real
 * `#tag` (clickable in the vault), priority = Obsidian Tasks' own icons,
 * blockedBy = its ⛔. Only `effort`, `parent`, `plan` and `from` needed a field
 * of their own, and those use Dataview's `[key:: value]`, which the vault
 * already reads.
 *
 * ‼️ `parent` is COMPOSITION and ⛔ is DEPENDENCY — two different questions that
 * a single link would blur. "P-5 is part of P-1" says nothing about when either
 * can be started; "P-5 waits on P-3" says nothing about what P-5 belongs to. The
 * two are never derived from each other: a child is not blocked by its parent,
 * and a parent is not blocked by its children.
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
 * `<AREA>-<n>` — P-5, K-8, X-12.
 *
 * ‼️ A CODE IS FLAT, AND IT STAYS FLAT EVEN THOUGH ITEMS CAN NOW HAVE PARENTS.
 * Nothing here reads a code as a path: `U-20` may be a child of `P-4`, and the
 * only thing that says so is the child's `[parent:: P-4]` field (see F_PARENT).
 * Putting the tree in the identifier would mean an item could not change parent
 * without changing its name, and a child could never belong to another area —
 * which is the common case here, not the exotic one.
 *
 * What it deliberately does NOT copy from ATC is the letter/digit alternation:
 * `C09AA05` can be written but not SAID, and this user dictates. "P five" is
 * speakable; that is a hard constraint on an identifier whose first job is to be
 * quoted at an agent out loud.
 *
 * The dotted form (`P-5.3`) is still ACCEPTED — a code is permanent, so one that
 * exists in somebody's file has to keep resolving — but it is never handed out
 * and it says nothing about where the item belongs.
 *
 * Two rules that never bend:
 *   1. A code is permanent. Cancel an item and its number is still spent — a
 *      note written three months ago that says `K-8` means this item, forever.
 *   2. A code is not an order. The order is the `## 🎯 Queue` block, which the
 *      user changes by hand in Obsidian or from the panel. That is what makes
 *      "do the top five" work without renumbering anything.
 */
export const BACKLOG_CODE = /^([A-Z]{1,2})-(\d+(?:\.\d+)*)$/;

/** The code at the START of an item's text, which is the only place it counts.
 *  A code mentioned mid-sentence is prose about another item, not this one's. */
const LEADING_CODE = /^([A-Z]{1,2}-\d+(?:\.\d+)*)\s+/;

/** Sorts codes the way a person expects: P-2 before P-10. */
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

/**
 * ‼️ X-318 — WHAT IS INSIDE BACKTICKS IS QUOTED TEXT, NOT A FIELD.
 *
 * An inline field is something this code wrote; a backtick code span is
 * something the PERSON wrote, and the two look identical to a regex. Measured:
 * X-312's own body quoted `[closed:: 2145c0a0#3]` as the evidence of the bug it
 * was describing. Closing the item read that quote as the item's `closed`
 * field, and the writer then replaced it in place — so the user's sentence
 * silently became a different session id, and the real stamp was never
 * appended. The promise that nothing else on the line is touched was broken by
 * the one function whose whole job is to keep it.
 *
 * Every backtick run is blanked to the SAME LENGTH, so an index found in the
 * mask is the same index in the real line: reads match nothing inside a quote,
 * and a write splices the real string by position. The mask is never written to
 * a file — it exists only to be matched against.
 */
const maskCodeSpans = (s: string): string =>
    s.replace(/(`+)[\s\S]*?\1/g, (m) => ' '.repeat(m.length));

/** X-318 — run a rewrite over the QUOTED-OUT parts of a line only, leaving every
 *  backtick span exactly as the person typed it. */
const outsideCode = (s: string, fn: (part: string) => string): string => {
    const re = /(`+)[\s\S]*?\1/g;
    let out = '', last = 0;
    for (let m = re.exec(s); m; m = re.exec(s)) {
        out += fn(s.slice(last, m.index)) + m[0];
        last = m.index + m[0].length;
    }
    return out + fn(s.slice(last));
};

const F_EFFORT = field('effort|efor|boyut|size');
const F_PLAN = field('plan');
/**
 * `[parent:: P-4]` — THE ITEM THIS ONE IS PART OF.
 *
 * ‼️ A FIELD, NOT AN INDENT, AND THAT IS THE WHOLE DESIGN. The backlog once
 * carried a hierarchy drawn from the file's own INDENTATION, and the first time
 * anybody used it the surface fell apart: the queue is one flat list of codes,
 * the rows were being indented by a property of the DOCUMENT, and a child ended
 * up drawn under an item that was not its parent and moved somewhere else on
 * every re-sort. It was removed whole (3.85.0) with the note that a rebuild must
 * cover the queue too.
 *
 * This is that rebuild, and the three rules it obeys are the three things that
 * went wrong:
 *
 *   1. THE LINK IS DATA. It is a Dataview field like `effort` and `plan`, so it
 *      survives tidying, archiving, reordering and being edited in Obsidian. No
 *      line moves because of it, ever; the file's line order and its indentation
 *      mean exactly what they meant before.
 *   2. THE CODE IS UNTOUCHED. A child gets the next free code in its OWN area —
 *      `U-20` may be a child of `P-4`, which is the common real case, and a
 *      dotted `P-4.1` would have forbidden it. A code says which item, never
 *      where in a tree.
 *   3. THE QUEUE DOES NOT KNOW. Every live coded item queues on its own account;
 *      a parent is not a container, is not dropped from `next`, and does not
 *      drag its children with it. The relation is drawn as a MARK on a row, and
 *      the one place a tree is drawn (the page's `family` ordering) is a way of
 *      LOOKING at the pile, not the order anything is worked in.
 */
const F_PARENT = field('parent');
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
 *
 * X-143 — `perf` (speed, memory, token spend) and `secu` (security,
 * authorisation, permissions): two questions a fix is also sorted by, which
 * `#bug` and `#debt` were hiding.
 */
export const BACKLOG_KINDS = ['bug', 'research', 'feat', 'ux', 'perf', 'secu', 'chore', 'debt', 'idea', 'doc'];

/**
 * WHO PUT THIS LINE HERE — a second axis, deliberately NOT one of the kinds.
 *
 * ‼️ THE QUESTION IT ANSWERS IS "WHOSE IDEA WAS THIS", and it matters because
 * three different things arrive in a backlog and only one of them was decided
 * by the person who owns it:
 *
 *   (nothing)     the user wrote it — in the capture box or in Obsidian.
 *   #byREQ        an agent wrote the line, but the user asked for it. The
 *                 thought is theirs; the agent was the typist.
 *   #byAI         an agent noticed it mid-job and filed it on its own
 *                 initiative. Nobody has agreed to this yet.
 *
 * That last distinction is the whole point. An agent's own suggestion is a
 * PROPOSAL, and a backlog where proposals are indistinguishable from decisions
 * quietly fills up with work nobody chose. Marked, they can be read as what they
 * are — and skimmed past, or swept, without doubting the rest of the pile.
 *
 * ‼️ These are ORDINARY `#tags`, and that is the design, not a shortcut. They
 * are read as kinds like anything else, they filter like anything else, and they
 * need no field of their own — so a person editing the file in Obsidian can add,
 * remove or query one with the tools they already use. Nothing here is
 * canonical-set business: the panel's type badge never touches them.
 */
export const BACKLOG_ORIGIN_TAGS = { agent: 'byAI', user: 'byREQ' } as const;
export type BacklogOrigin = keyof typeof BACKLOG_ORIGIN_TAGS;
export const BACKLOG_ORIGINS: BacklogOrigin[] = ['agent', 'user'];

/** The two above, found by their folded spelling. */
const ORIGIN_BY_FOLD = new Map(
    (Object.values(BACKLOG_ORIGIN_TAGS) as string[]).map(v => [v.toLowerCase(), v])
);

/**
 * One spelling for a tag, so the same tag never becomes two.
 *
 * ‼️ TAGS ARE MATCHED FOLDED AND WRITTEN CANONICAL, and the second half is not
 * tidiness. Everything downstream compares tags in lower case, so the parser
 * folds them — but the ORIGIN tags carry deliberate capitals (`byAI`, `byREQ`),
 * and folding is what a rebuild would write BACK to the file. A user's chosen
 * casing would then vanish the first time somebody clicked a priority badge,
 * silently, in their vault. So the fold is undone for exactly these two, on the
 * way in and on the way out — and `#byai`, `#BYAI` or `#ByAi` typed by hand in
 * Obsidian all land on the one spelling.
 */
export const canonKind = (tag: string): string => {
    const t = String(tag ?? '').replace(/^#/, '').toLowerCase();
    return ORIGIN_BY_FOLD.get(t) ?? t;
};

/** True for the two tags above — the panel labels them for what they are
 *  instead of calling them "your own tag". */
export const isOriginTag = (tag: string): boolean =>
    ORIGIN_BY_FOLD.has(String(tag).replace(/^#/, '').toLowerCase());

/** ⛔ P-5.1 — blocked until that one closes. Several may sit on one line. */
const BLOCKED = /⛔\s*((?:[A-Z]{1,2}-\d+(?:\.\d+)*)(?:\s*,\s*[A-Z]{1,2}-\d+(?:\.\d+)*)*)/gu;

/**
 * ‼️ U-60 — THE SAME MARK SAYING LESS: a ⛔ with no code behind it.
 *
 * `⛔ P-5.1` is "waiting on P-5.1" and stays exactly that. A BARE ⛔ is the
 * other half of the same sentence — waiting, with nothing named — and it is
 * what a person means when they take an item off the front of the queue by
 * hand: nothing is in its way, it is simply not to be started yet. The
 * vocabulary was already the user's own (`⛔ KOD  o kalemi bekliyor` is in the
 * legend at the top of their file); what was missing is that the panel could
 * READ a ⛔ and had no way whatsoever to write one.
 *
 * ‼️ NOT A FIFTH CHECKBOX STATE, and that is the decision worth keeping. The box
 * belongs to Obsidian — four statuses are configured in the user's Tasks plugin,
 * and a character it does not know renders as an unknown box in their vault. A
 * hold is also not a state: a held item is still open, still live, still counted
 * as work. It is only held BACK, which is a fact about the QUEUE.
 */
const HOLD = /⛔(?!\s*[A-Z]{1,2}-\d)/u;
/** Take the bare one off and leave every coded ⛔ where it stands. */
const HOLD_CUT = /\s*⛔(?!\s*[A-Z]{1,2}-\d)/u;

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
 *
 * ‼️ X-352 — AND A VALUED ICON TAKES ONLY ITS OWN VALUE, in the shape that
 * value has. "Any non-space token after it" turned `'⏳ Yanıt bekleniyor'` into
 * `' bekleniyor'` and ate the first word after every bare ⛔ hold. So a date
 * icon comes off only WITH its date (without one it is the user's word and
 * stays), 🆔 with an id, ⛔ with its code list — a bare ⛔ is a mark on its own
 * (the hold, `HOLD` above) — and 🏁 with its keep/delete.
 */
const META_VALUED = new RegExp([
    '\\s*(?:📅|⏳|🛫|➕|✅|❌)\\s*\\d{4}-\\d{2}-\\d{2}',
    '\\s*🆔\\s*[A-Za-z0-9_-]+',
    '\\s*⛔\\s*[A-Z]{1,2}-\\d+(?:\\.\\d+)*(?:\\s*,\\s*[A-Z]{1,2}-\\d+(?:\\.\\d+)*)*',
    '\\s*⛔',
    '\\s*🏁\\s*(?:delete|keep)\\b'
].join('|'), 'gu');
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
 * `## 🎯 Queue` — THE ORDER. Not part of it, not a head of it: the whole thing.
 *
 * ‼️ WHY THE FILE'S LINE ORDER IS NOT THE QUEUE. A backlog file is grouped under
 * area headings, so line order is a SEGMENTED order: every `K` item comes before
 * every `S` item, for ever, because moving a line across a heading re-files the
 * item. "Do X-5 next" was not a missing button — it was an order the file could
 * not express.
 *
 * ‼️ AND WHY A "PINNED HEAD" IS NOT THE ANSWER EITHER. A list that ordered only
 * its first few and let the file decide the rest is two orders pretending to be
 * one: moving something to position 8 has to drag the seven above it into the
 * list as a side effect, which is a rule nobody asked for and nobody can predict.
 * The queue is ONE list and it holds EVERYTHING — shuffled like cards, in
 * whatever order the user put them, areas interleaved freely.
 *
 * So the two halves of this file have two different jobs, and neither does the
 * other's:
 *
 *   * `Backlog.md`'s AREA SECTIONS are the dictionary — what exists, grouped,
 *     each area in its own natural code order (`tidyBacklogFile` restores that).
 *     Nothing reorders these lines to express a priority any more.
 *   * this BLOCK is the order, and the only one.
 *
 * A code that is not listed here has simply not been placed yet (it was added
 * in Obsidian since the last edit); it queues after everything that was, in file
 * order. The first write of any kind materialises the complete order, so the
 * block stops being partial the moment it is touched.
 *
 * It holds CODES, and only codes. An uncoded capture has no handle that survives
 * the file being edited (a line number does not), so filing it is the price of
 * queueing it — one click, and the code it gets is permanent anyway.
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
    /** The nearest heading above it. */
    section: string;
    /** The AREA that heading declares — `U` for `## U — Interface` — and
     *  undefined under a heading that declares none (📥, 🎯, an archive).
     *  ‼️ NOT the same as `area`, which a coded line takes from its own code:
     *  the two disagreeing is precisely a line filed under the wrong heading,
     *  and there is no other way to see it. */
    sectionArea?: string;
    /** True when it sits under the 📥 heading or carries no code. */
    inbox: boolean;
    kinds: string[];
    priority: BacklogPriority;
    effort?: BacklogEffort;
    /** Codes this item waits on (⛔). */
    blockedBy: string[];
    /** A BARE ⛔ — held back by hand, with no other item named. Still open and
     *  still live; it is only kept out of "what is next". See HOLD. */
    onHold?: boolean;
    /** 🆔 — the Obsidian Tasks id, if the user put one there. Untouched. */
    taskId?: string;
    /** `[plan:: afprj-05]` — which plan item this belongs to. */
    plan?: string;
    /** `[parent:: P-4]` — the item this one is PART OF. A code, from another
     *  area as often as not. See F_PARENT for why it is a field and not an
     *  indent. */
    parent?: string;
    /** Codes that name THIS item as their parent, in file order. Computed on
     *  every parse and never written to the file — the link is stored once, on
     *  the child, exactly like `blockedBy`. */
    children: string[];
    /** `[from:: …]` — a queue item or notice it was promoted from. */
    from?: string;
    /** `[was:: K-8]` — a code this item carried earlier. Read and carried
     *  through every rewrite, never invented. */
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
    /** ‼️ U-106 — it sits under the 🗄 Archive heading: a historical record that
     *  was moved out of the way, not merely a closed line still in the list.
     *  The two were drawn identically (grey, struck through), so "is this
     *  finished, or is this history?" could not be answered by looking. It is a
     *  fact about WHERE the line is, exactly like `inbox`; absent means no. */
    archived?: boolean;
    /** Something true about the line the reader should know. NOT an error: the
     *  line still works. E.g. the same code is on two lines. ‼️ Reported, never
     *  silently corrected — rearranging somebody's file to match our idea of it
     *  is precisely what this module must not do. */
    warn?: string;
}

/** Strip everything structural, leave the words.
 *
 *  ‼️ The ORDER is load-bearing: inline fields come off before the icons, or
 *  `🔽 [effort:: XS]` loses its bracket to the icon pass and leaves `S]` behind. */
function displayText(body: string): string {
    // ‼️ X-318 — and only OUTSIDE the backticks. A quoted `[closed:: …]` or a
    // quoted `#tag` is the person's example, and stripping it deleted the
    // evidence out of the sentence that was making a point of it.
    return outsideCode(body, part => part
        .replace(LEADING_CODE, '')
        .replace(F_ANY, ' ')
        .replace(META_VALUED, ' ')
        .replace(META_BARE, ' ')
        .replace(TAG, ' '))
        .replace(/\s+/g, ' ')
        .trim();
}

/** Add one more thing worth knowing about a line, without losing the last one.
 *  ‼️ `warn` is a single string and a line can be wrong in two ways at once —
 *  a duplicate code that ALSO points at a parent that is not there. Overwriting
 *  would silently hide whichever was noticed first. */
function warnOn(item: BacklogItem, what: string): void {
    item.warn = item.warn ? `${item.warn}; ${what}` : what;
}

/**
 * Resolve `[parent:: …]` across the whole file: fill in `children`, and say so
 * when a link cannot mean what it says.
 *
 * ‼️ NOTHING IS EVER CORRECTED HERE — the same rule the duplicate-code check
 * follows. A parent that is not in the file is REPORTED on the child's row; the
 * field stays exactly as the user typed it, because the commonest cause is a
 * line they are half-way through moving, and a program that "helpfully" deleted
 * the link would take the only evidence of what they meant.
 *
 * Three things can be wrong, and they are three different sentences:
 *   - the parent code is not in this backlog (deleted, or a typo);
 *   - the item names ITSELF;
 *   - the chain loops (A → B → A), which no reader spots by eye and which every
 *     walk over the tree must survive.
 */
function linkParents(items: BacklogItem[], only?: BacklogItem): void {
    const byCode = new Map<string, BacklogItem>();
    for (const it of items) { if (it.code && !byCode.has(it.code)) { byCode.set(it.code, it); } }
    // ‼️ X-130 — THE SAME THREE SENTENCES, SAID ABOUT ONE ITEM. A mutation that
    // rewrote a single line re-reads only that line, and the link warnings are
    // the one thing on an item that its own line cannot decide. So the fresh
    // item is annotated against the file as it stands, `items` is NOT touched
    // (it is the caller's, and a line rewrite changes no other row's children),
    // and there is still exactly one implementation of what is wrong with a
    // link — two would start disagreeing on the day one of them was edited.
    if (only?.code) { byCode.set(only.code, only); }
    const targets = only ? [only] : items;
    for (const it of targets) {
        const p = it.parent;
        if (!p) { continue; }
        if (it.code && p === it.code) { warnOn(it, `${it.code} is its own parent`); continue; }
        const up = byCode.get(p);
        if (!up) { warnOn(it, `parent ${p} is not in this backlog`); continue; }
        if (!only && it.code) { up.children.push(it.code); }
    }
    // The loop check walks UP from every item; `seen` is per walk, so a chain
    // that rejoins a healthy branch is not mistaken for a cycle.
    for (const it of targets) {
        if (!it.parent || !it.code) { continue; }
        const seen = new Set<string>([it.code]);
        let at: BacklogItem | undefined = byCode.get(it.parent);
        while (at?.code) {
            if (seen.has(at.code)) { warnOn(it, `the parent chain loops at ${at.code}`); break; }
            seen.add(at.code);
            at = at.parent ? byCode.get(at.parent) : undefined;
        }
    }
}

/**
 * Every code under `code`, depth first, cycle-safe.
 *
 * Exported because "the whole family" is asked for in three places that must
 * agree: the bridge's `deep` read, the page's family ordering, and the check
 * that refuses a parent link which would close a loop.
 */
export function descendantCodes(items: BacklogItem[], code: string): string[] {
    const kids = new Map<string, string[]>();
    for (const it of items) {
        if (!it.parent || !it.code) { continue; }
        const list = kids.get(it.parent) ?? [];
        list.push(it.code);
        kids.set(it.parent, list);
    }
    const out: string[] = [];
    const seen = new Set<string>([String(code ?? '').toUpperCase()]);
    const walk = (c: string): void => {
        for (const kid of kids.get(c) ?? []) {
            if (seen.has(kid)) { continue; }
            seen.add(kid);
            out.push(kid);
            walk(kid);
        }
    };
    walk(String(code ?? '').toUpperCase());
    return out;
}

/**
 * May `child` name `parent`? Returns the refusal, or undefined when it may.
 *
 * ‼️ THE ONE CHECK BOTH WRITERS SHARE. `addBacklogItem` calls it with no child
 * code (the item does not exist yet, so only "is that a real item" applies) and
 * `setBacklogFields` calls it with one, which is where the loop check earns its
 * place: a cycle is invisible on the row you are editing and breaks every walk
 * over the tree afterwards.
 */
export function parentLinkError(
    items: BacklogItem[], child: string | undefined, parent: string
): string | undefined {
    const want = String(parent ?? '').trim().toUpperCase();
    if (!BACKLOG_CODE.test(want)) {
        return `"${parent}" is not a backlog code — a parent is named by its code, like P-4`;
    }
    if (!items.some(i => i.code === want)) { return `no backlog item with code ${want}`; }
    const me = child ? child.trim().toUpperCase() : '';
    if (!me) { return undefined; }
    if (me === want) { return `${me} cannot be its own parent`; }
    if (descendantCodes(items, me).includes(want)) {
        return `${want} is already under ${me} — that would close a loop`;
    }
    return undefined;
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
    /** The queue block, exactly as the file has it — the codes under the 🎯
     *  heading, in their order. Empty when there is no block, and a code in
     *  here is NOT verified to exist: the file is the truth and a stale entry
     *  is reported (see `nextBacklog`), never silently dropped. For the order
     *  a reader actually sees, pass this through `queueOrder`. */
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
/**
 * ‼️ X-130 — ONE LINE, READ ON ITS OWN. Everything an item says about itself is
 * ON its line; the only facts that need the whole document are which HEADING it
 * sits under (its section and area) and the links between items. So the two are
 * separated here: this reads a line given its heading context, `parseBacklog`
 * walks the file and supplies that context, and a mutation that changed ONE
 * line re-reads only that line (`rereadItem`).
 *
 * Returns undefined for a line that is not an item, which is most of them.
 */
function parseItemLine(
    line: string, at: number, section: string, area: string | undefined
): BacklogItem | undefined {
    const m = TASK_LINE.exec(line);
    if (!m) { return undefined; }
    const body = m[3] ?? '';
    // X-318 — the same body with every backtick quote blanked out, which is
    // what an inline field is read from. Positions are preserved, so nothing
    // that works off an index has to know the difference.
    const fieldBody = maskCodeSpans(body);
    const state = stateOf(m[2]);
    const code = LEADING_CODE.exec(body)?.[1];
    // Derived from the heading exactly as the walk derives them, so a line read
    // on its own and the same line read in a full pass cannot disagree.
    const inInbox = INBOX_HEADING.test(section);
    const inArchive = ARCHIVE_HEADING.test(section);

    const blockedBy: string[] = [];
    BLOCKED.lastIndex = 0;
    for (let b = BLOCKED.exec(line); b; b = BLOCKED.exec(line)) {
        for (const one of b[1].split(',')) { blockedBy.push(one.trim()); }
    }
    const kinds: string[] = [];
    TAG.lastIndex = 0;
    for (let t = TAG.exec(body); t; t = TAG.exec(body)) { kinds.push(canonKind(t[1])); }

    let priority: BacklogPriority = 'normal';
    for (const [icon, p] of Object.entries(ICON_PRIORITY)) {
        if (line.includes(icon)) { priority = p; break; }
    }
    const effortRaw = F_EFFORT.exec(fieldBody)?.[1]?.trim().toUpperCase();
    const effort = BACKLOG_EFFORTS.includes(effortRaw as BacklogEffort)
        ? effortRaw as BacklogEffort : undefined;
    // Read in whatever case it was typed and held in ONE case, because
    // everything downstream compares codes as strings — `[parent:: p-4]`
    // typed in Obsidian must be the same link as `[parent:: P-4]`.
    const parentRaw = F_PARENT.exec(fieldBody)?.[1]?.trim().toUpperCase();
    const parent = parentRaw && BACKLOG_CODE.test(parentRaw) ? parentRaw : undefined;

    return {
        line: at,
        raw: line,
        text: displayText(body),
        state,
        ...(code ? { code } : {}),
        ...(code ? { area: code.split('-')[0] } : (area ? { area } : {})),
        section,
        ...(area ? { sectionArea: area } : {}),
        inbox: inInbox || !code,
        kinds,
        priority,
        ...(effort ? { effort } : {}),
        blockedBy,
        ...(HOLD.test(line) ? { onHold: true } : {}),
        ...(/🆔\s*([A-Za-z0-9_-]+)/u.exec(line)?.[1]
            ? { taskId: /🆔\s*([A-Za-z0-9_-]+)/u.exec(line)?.[1] as string } : {}),
        ...(F_PLAN.exec(fieldBody)?.[1] ? { plan: F_PLAN.exec(fieldBody)?.[1]?.trim() as string } : {}),
        ...(parent ? { parent } : {}),
        // ‼️ A field that is THERE but is not a code is reported, not
        // swallowed. Somebody typed `[parent:: the big one]` in Obsidian and
        // meant something by it; a parser that silently read nothing would
        // leave them with a line that looks linked and is not.
        ...(parentRaw && !parent ? { warn: `"${parentRaw}" is not a backlog code, so the parent link does nothing` } : {}),
        children: [],
        ...(F_FROM.exec(fieldBody)?.[1] ? { from: F_FROM.exec(fieldBody)?.[1]?.trim() as string } : {}),
        ...(F_WAS.exec(fieldBody)?.[1] ? { was: F_WAS.exec(fieldBody)?.[1]?.trim() as string } : {}),
        ...(F_CLOSED.exec(fieldBody)?.[1] ? { closed: F_CLOSED.exec(fieldBody)?.[1]?.trim() as string } : {}),
        ...(dateAfter(line, '📅') ? { due: dateAfter(line, '📅') as string } : {}),
        ...(dateAfter(line, '✅') ? { doneOn: dateAfter(line, '✅') as string } : {}),
        score: PRIORITY_WEIGHT[priority] /
            (effort ? EFFORT_WEIGHT[effort] : UNKNOWN_EFFORT_WEIGHT),
        // ‼️ U-106 — AND WHETHER IT IS UNDER THE ARCHIVE HEADING, which the
        // parser has known all along and was throwing away on this line.
        // "Closed" and "archived" are two different things about an item: one
        // is finished work still sitting in the list, the other is a
        // historical record that has been moved out of the way — and drawn
        // identically (grey, struck through) there was no way to tell them
        // apart on the page. Kept only when true, so nothing about an
        // ordinary line changes shape.
        ...(inArchive ? { archived: true } : {})
    };
}

/**
 * ‼️ X-130 — RE-READ THE ONE LINE A MUTATION TOUCHED, NOT THE WHOLE FILE.
 *
 * Every mutation here parsed the document to find its target and then parsed
 * the WHOLE DOCUMENT AGAIN, to hand back the one line it had just written.
 * `Backlog.md` never shrinks over a project's life — measured on this one at
 * 473 KB / 376 items, a single parse is 42 ms and every tick of a checkbox cost
 * two of them. At four times the items that is most of a second to change one
 * character.
 *
 * The second read is not thrown away, because it is the honest answer to "what
 * does that line say NOW" — it is made cheap instead: the line is sliced out by
 * offset and read on its own, with the heading context taken from the item that
 * was there a moment ago. A mutation replaces a line in place, so its section,
 * its area heading and its position are exactly what they were.
 *
 * ‼️ WHAT A SINGLE-LINE READ CANNOT DECIDE is what comes from the whole file:
 * an item's PARTS, and whether its `parent` names anything real. The parts did
 * not change (replacing a line moves nothing), so they are carried across from
 * the item that was there; the link warnings ARE re-decided, against the file
 * the caller already has in its hands — and by the same function that decides
 * them in a full pass, so the two cannot drift apart. `setBacklogFields`
 * rewrites the parent field, and a link that quietly stopped being checked on
 * the one path that edits it is the worst possible place to save a millisecond.
 */
function addedLine(
    line: string, neighbour: BacklogItem, items: BacklogItem[]
): BacklogItem | undefined {
    const item = parseItemLine(line, neighbour.line + 1, neighbour.section, neighbour.sectionArea);
    if (item) { linkParents(items, item); }
    return item;
}

function rereadItem(
    nextText: string, was: BacklogItem, items: BacklogItem[]
): BacklogItem | undefined {
    const start = lineStartOffset(nextText, was.line);
    if (start < 0) { return undefined; }
    let end = nextText.indexOf('\n', start);
    if (end < 0) { end = nextText.length; } else if (nextText[end - 1] === '\r') { end--; }
    const item = parseItemLine(nextText.slice(start, end), was.line, was.section, was.sectionArea);
    if (!item) { return undefined; }
    if (was.children.length) { item.children = [...was.children]; }
    linkParents(items, item);
    return item;
}

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

        const it = parseItemLine(line, i, section, area);
        if (it) { items.push(it); }
    }

    // A second pass, because "is this code on another line too" can only be
    // answered once every line has been read.
    const seen = new Set<string>();
    for (const it of items) {
        // ‼️ X-134 — LIVE WORK UNDER THE ARCHIVE HEADING IS A DIAGNOSIS, NOT A
        // STATE. The archive is history: an open or doing line down there is
        // invisible in every default view (the page hides the archive, the
        // queue reads file order from the top) while still counting as open, so
        // it is work nobody will ever be shown. Said on the line itself,
        // because that is where somebody can act on it — and `tidy` carries it
        // home for them.
        if (it.archived && isLive(it.state)) {
            warnOn(it, `this line is closed or gone from the file, but is still ${it.state} under the archive heading`);
        }
        if (!it.code) { continue; }
        if (seen.has(it.code)) { warnOn(it, `code ${it.code} is used more than once`); }
        seen.add(it.code);
    }
    linkParents(items);

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
    /** Only what is part of this code. ‼️ The same two arguments mean the same
     *  two things here as on the plain read: `parent` alone is the DIRECT parts,
     *  `parent` + `deep` is the whole family including the named item — which is
     *  what "do P-4" means. Two ops answering the same word differently would be
     *  the kind of inconsistency nobody reads the docs to discover. */
    parent?: string;
    deep?: boolean;
    /** Nothing below this priority. */
    minPriority?: BacklogPriority;
    /** Nothing ABOVE this size. Optional: an unqualified "top five" must mean
     *  the first five entries in the user's queue, regardless of their size.
     *  Callers asking for work that fits a smaller turn can state a ceiling. */
    maxEffort?: BacklogEffort;
    /** `file` (default — the user's own order) · `score` · `priority`. */
    sort?: 'file' | 'score' | 'priority';
    /** Include items whose blockers are still open. Default false. */
    includeBlocked?: boolean;
    /** Include items held back by a bare ⛔. Default false — the whole point of
     *  a hold is that "what is next" stops offering it. */
    includeHeld?: boolean;
}

export interface NextResult {
    items: BacklogItem[];
    /** Live items held back because something they wait on is still open —
     *  reported rather than hidden, so "why is P-9 not in the list" has an
     *  answer that does not require reading the file. */
    blocked: { item: BacklogItem; waitingOn: string[] }[];
    /** ‼️ U-60 — held back by a bare ⛔, i.e. by hand. Reported SEPARATELY from
     *  `blocked` because it is a different answer to "why is this not in the
     *  list": nothing is in its way, somebody parked it. Folding the two
     *  together would print "waiting on ∅", which reads as a bug. */
    held: BacklogItem[];
    /** How many live leaves there were before the filters. */
    considered: number;
    /** THE ORDER, complete — every queueable item, the block's codes first and
     *  anything the block has not placed yet behind them in file order. This is
     *  what a row's position number means and what a reorder is computed
     *  against; the raw block is `parseBacklog(...).queue`. */
    queue: string[];
    /** Codes in the block that lead nowhere any more — the item is closed or
     *  gone. ‼️ Reported, never quietly removed: the queue is
     *  the user's own list and a program that prunes it silently is a program
     *  that loses their ordering while telling them nothing. */
    staleQueue: string[];
}

/**
 * THE ORDER, resolved: the block's codes, then everything it has not placed.
 *
 * ‼️ THE TAIL IS NOT A SECOND ORDERING SYSTEM — it is the answer to one
 * question: where does an item go that was written into the file five minutes
 * ago and has never been placed? At the back, which is what a queue does with
 * something that just arrived. Every write materialises the whole list, so the
 * tail is empty from the first edit onwards.
 *
 * Only live coded items are in it: a closed item is not waiting, and an uncoded
 * capture has no handle that survives an edit of the file.
 */
export function queueOrder(items: BacklogItem[], queue: string[]): string[] {
    const placeable = items.filter(i => i.code && isLive(i.state));
    const byCode = new Map(placeable.map(i => [i.code as string, i]));
    const out: string[] = [];
    const seen = new Set<string>();
    for (const code of queue) {
        if (byCode.has(code) && !seen.has(code)) { out.push(code); seen.add(code); }
    }
    for (const i of placeable) {
        const code = i.code as string;
        if (!seen.has(code)) { out.push(code); seen.add(code); }
    }
    return out;
}

/**
 * The engine behind "do the top five".
 *
 * Order of operations matters and each step earns its place: blocked out (doing
 * it now would be doing it in the wrong order), filters, then the user's own
 * order — because the user arranging their queue IS the prioritisation, and a
 * clever sort that overrules it would make dragging pointless.
 *
 * That order is the `## 🎯 Queue` block, resolved by `queueOrder` — one list
 * holding every queueable item, areas interleaved however the user shuffled
 * them. See `QUEUE_HEADING` for why the file's own line order cannot be it.
 */
export function nextBacklog(text: string, opts: NextOptions = {}): NextResult {
    const { items, queue } = parseBacklog(text);
    const byCode = new Map(items.filter(i => i.code).map(i => [i.code as string, i]));
    const live = items.filter(i => isLive(i.state));
    const blocked: NextResult['blocked'] = [];
    const held: BacklogItem[] = [];
    const minW = PRIORITY_WEIGHT[opts.minPriority ?? 'lowest'];
    const maxW = opts.maxEffort ? EFFORT_WEIGHT[opts.maxEffort] : undefined;

    const wantParent = opts.parent ? String(opts.parent).trim().toUpperCase() : '';
    const familyOf = wantParent && opts.deep
        ? new Set([wantParent, ...descendantCodes(items, wantParent)]) : null;

    const passed = live.filter(i => {
        if (opts.area && i.area !== opts.area) { return false; }
        if (opts.kind && !i.kinds.includes(canonKind(opts.kind))) { return false; }
        if (wantParent) {
            if (familyOf ? !(i.code && familyOf.has(i.code)) : i.parent !== wantParent) { return false; }
        }
        if (PRIORITY_WEIGHT[i.priority] < minW) { return false; }
        // A ceiling exists only when the caller asked for one. An unqualified
        // "top N" is positional and may never skip a queued L/XL item. An item
        // with no effort stated is not excluded by an explicit ceiling: it has
        // not been sized, so treating it as too large would be invented data.
        if (maxW !== undefined && i.effort && EFFORT_WEIGHT[i.effort] > maxW) { return false; }
        // ‼️ U-60 — A HOLD IS THE STRONGEST "not this one", so it is asked first
        // and it is asked of the ITEM rather than of anything around it. It is
        // also the only one of these the user set by hand for no stated reason,
        // which is exactly why it is reported instead of silently dropping the
        // row: "I parked it and forgot" is the commonest thing a hold becomes.
        if (i.onHold) {
            held.push(i);
            if (opts.includeHeld !== true) { return false; }
        }
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
     * ‼️ THE QUEUE IS THE ORDER, AND IT IS THE DEFAULT ONE.
     *
     * `score` and `priority` are a different QUESTION — "what is cheapest",
     * "what is most urgent" — and a caller who asked one of them did not ask for
     * the user's hand-made order, so those two are left alone. Everything else
     * follows the queue, because the user arranging it IS the prioritisation.
     *
     * An uncoded capture cannot be in the queue (see `queueOrder`) and comes
     * after everything that can, in file order: it has not been filed yet, and
     * filing is what puts something in a queue.
     */
    const order = queueOrder(items, queue);
    const rank = new Map<string, number>();
    order.forEach((c, n) => rank.set(c, n));
    const queued = (a: BacklogItem, b: BacklogItem): number => {
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
            : [...passed].sort(queued);

    // An entry whose item is closed or gone leads nowhere, and the caller is told
    // which — so "why is X-5 not in the list any more" never needs the file to be
    // read by hand. ‼️ Measured against the ITEM, not against this call's
    // filters: an `area: 'K'` query must not report every other area's entries
    // as rubbish.
    const staleQueue = queue.filter(c => {
        const it = byCode.get(c);
        return !it || !isLive(it.state);
    });

    const limit = Math.max(1, Math.min(50, opts.limit ?? 5));
    return {
        items: sorted.slice(0, limit), blocked, held,
        considered: live.length, queue: order, staleQueue
    };
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
    /** ‼️ X-142 — the line was carried out of 🗄 Archive and back under its own
     *  area heading, because reopening it made it live work again. Named rather
     *  than left in the prose: a caller that draws the item has to know its line
     *  moved, and "did anything else change?" must be answerable without
     *  reading English. */
    reseatedFromArchive?: boolean;
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
    /**
     * ‼️ SAID, NEVER REFUSED. Closing something that still has open parts is a
     * real and ordinary thing to do — the parts may have been split off, or
     * cancelled in spirit — and a tick that argued back would be a tick nobody
     * trusts. But closing it in ignorance is the failure worth naming, because
     * the children do not move, do not close and do not leave the queue: they
     * are simply now hanging off something finished, which nothing else on the
     * screen would tell you.
     */
    const strays = isLive(state) ? [] : item.children.filter(c => {
        const kid = items.find(i => i.code === c);
        return kid ? isLive(kid.state) : false;
    });
    /**
     * ‼️ X-142 — REOPENING SOMETHING ARCHIVED TAKES IT OUT OF THE ARCHIVE.
     *
     * Flipping the box alone left the line hanging under 🗄, which is the worst
     * of both states: every default view hides the archive (the page folds it
     * away, `next` reads the file from the top), so the item was open, counted
     * as open, and appeared nowhere. X-134 already diagnosed that shape and
     * built the carry-home; it only ran on a deliberate `tidy`, so the file
     * stayed wrong until somebody happened to run one. The reopen IS the moment
     * it becomes live work, so it is the moment it goes home.
     *
     * ‼️ THE LINE'S TEXT IS NOT TOUCHED — it is lifted and re-inserted verbatim.
     * The one-character promise above is about never REBUILDING somebody's line
     * from parsed pieces, and that still holds: what changes is where the line
     * sits, which is precisely what was asked for.
     *
     * Only ever on the way OUT. A closed line under 🗄 belongs there, and
     * archiving stays a deliberate act in the other direction (`archive`) —
     * auto-filing on every tick would move work somebody was still looking at.
     */
    let outText = nextText;
    let out: BacklogItem = { ...item, state, raw };
    let reseatedFromArchive = false;
    if (item.archived && isLive(state) && item.code) {
        const r = reseatMisfiled(nextText, item.code);
        if (r.moved.length) {
            outText = r.text;
            reseatedFromArchive = true;
            // The line number changed, so the item has to be found again by the
            // one identity that survived the move.
            const again = locate(parseBacklog(outText).items, { code: item.code });
            if (again.item) { out = again.item; }
        }
    }
    const notes = [
        state !== 'done' && item.doneOn
            ? `the line still carries its ✅ ${item.doneOn} — Agent Farm does not remove metadata it did not write`
            : '',
        strays.length
            ? `${strays.join(', ')} ${strays.length === 1 ? 'is' : 'are'} still open under ${item.code}`
            + ' — closing a parent does not close its children, and they stay in the queue'
            : '',
        reseatedFromArchive
            ? `it was under 🗄 Archive and came back to ${item.area} — open work cannot live in the archive,`
            + ' where every default view hides it'
            : '',
        // Said, never silently accepted: the item is live under the archive and
        // there is no heading to carry it to, so it stays invisible.
        !reseatedFromArchive && item.archived && isLive(state)
            ? '⚠ this line is under 🗄 Archive and there is no heading for its area to carry it back to —'
            + ' it is open but hidden from every default view'
            : ''
    ].filter(Boolean);
    return {
        ok: true, text: outText, item: out,
        ...(reseatedFromArchive ? { reseatedFromArchive: true } : {}),
        ...(notes.length ? { note: notes.join(' · ') } : {})
    };
}

// ---------------------------------------------------------------------------
// writing — the hold
// ---------------------------------------------------------------------------

/**
 * ‼️ U-60 — PARK IT, OR TAKE IT OFF THE PARKING. One mark on, or one mark off.
 *
 * Kept apart from `setBacklogFields` for the reason `stampBacklogClosed` is: a
 * rebuild reorders every piece of the line, and turning a hold on and off is a
 * gesture somebody will make twice in a minute on a row they are looking at. A
 * whole-line diff in their vault for a button press is not a fair trade, so this
 * does the smallest edit that carries the fact — append the mark, or cut the
 * bare one and leave every coded ⛔ exactly where it stands.
 *
 * The appended position is not the canonical one (`setBacklogFields` puts ⛔
 * before 🆔 📅); like the closing stamp that is accepted rather than fixed,
 * because it parses identically wherever it sits and the next field edit moves
 * it into place.
 *
 * ‼️ IT DOES NOT TOUCH THE CHECKBOX. A held item is open, and the two facts are
 * set by two different presses — see HOLD.
 */
export function setBacklogHold(
    text: string, target: BacklogTarget, on: boolean
): BacklogEditResult {
    const src = String(text ?? '');
    const { items } = parseBacklog(src);
    const found = locate(items, target);
    if (!found.item) { return { ok: false, error: found.error as string }; }
    const item = found.item;
    const want = !!on;
    if (!!item.onHold === want) { return { ok: true, text: src, item }; }

    const line = want
        ? `${item.raw.trimEnd()} ⛔`
        : item.raw.replace(HOLD_CUT, '').replace(/(\S)\s{2,}/g, '$1 ').trimEnd();
    const nextText = replaceLine(src, item.line, line);
    if (nextText === undefined) { return { ok: false, error: 'that line is no longer there' }; }
    const rebuilt = rereadItem(nextText, item, items);
    /** A hold on something already blocked is a real thing to do and says
     *  something the ⛔ codes do not — but it is worth saying out loud, because
     *  the row now carries two reasons it will not be handed out and taking one
     *  off changes nothing. */
    const note = want && item.blockedBy.length
        ? `${item.code ?? 'it'} was already waiting on ${item.blockedBy.join(', ')}`
        + ' — the hold is a second, separate reason it stays out of the queue'
        : '';
    return {
        ok: true, text: nextText,
        ...(rebuilt ? { item: rebuilt } : {}),
        ...(note ? { note } : {})
    };
}

/**
 * ‼️ U-60 — MOVING THE BOX ENDS THE HOLD, AND IT IS ONE WRITE.
 *
 * Everything that changes an item's state goes through here rather than through
 * `setBacklogState` directly, because the rule is the same wherever the press
 * came from: a parked item that is now `doing` is a contradiction the file would
 * otherwise keep, and one that is `done` or `cancelled` carries a hold that
 * means nothing — which is the same failure a week later, when somebody reads it
 * as a reason.
 *
 * `open` is the exception and deliberately so: putting something BACK to open is
 * not a decision to start it, and silently unparking on the way past would throw
 * away the one thing the reader said by hand.
 *
 * `setBacklogState` keeps its promise untouched — exactly one character — and
 * the hold comes off with the small edit `setBacklogHold` makes. Two edits, one
 * guarded write, so there is no state in which the box moved and the mark stayed.
 */
export function moveBacklogState(
    text: string, target: BacklogTarget, state: BacklogState
): BacklogEditResult {
    const moved = setBacklogState(text, target, state);
    if (!moved.ok || state === 'open' || !moved.item?.onHold) { return moved; }
    // ‼️ X-142 — a reseat renumbers the line, so a `{line}` target no longer
    // names it. The code survived the move and is the only identity that did;
    // without this the hold silently stayed on, on the one path where the item
    // had just been rescued from the archive.
    const at: BacklogTarget = moved.reseatedFromArchive && moved.item?.code
        ? { code: moved.item.code } : target;
    const free = setBacklogHold(moved.text as string, at, false);
    if (!free.ok) { return moved; }
    const item = free.item ?? moved.item;
    return {
        ...moved, text: free.text, item,
        note: [moved.note, 'the ⛔ hold came off with it'].filter(Boolean).join(' · ')
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

    let line = item.raw;
    if (item.closed) {
        /**
         * ‼️ X-318 — SPLICED BY POSITION, NEVER BY `replace`. A plain replace
         * rewrites every match on the line, and a line may carry a `[closed::
         * …]` the PERSON typed inside backticks as an example — which is
         * exactly how X-312's own body lost its evidence. The mask blanks the
         * quotes and keeps the offsets, so what is found is the real field and
         * what is cut is the real field's characters.
         */
        const existing = new RegExp(F_CLOSED.source, 'giu');
        const masked = maskCodeSpans(line);
        const hits: { start: number; end: number }[] = [];
        for (let m = existing.exec(masked); m; m = existing.exec(masked)) {
            hits.push({ start: m.index, end: m.index + m[0].length });
        }
        // From the end, so an earlier hit's offsets are still good.
        for (let i = hits.length - 1; i >= 0; i--) {
            const h = hits[i] as { start: number; end: number };
            line = line.slice(0, h.start) + (want ? `[closed:: ${want}]` : '') + line.slice(h.end);
        }
        // `(\S)` first: the indentation is the item's nesting, not a gap to close.
        if (!want) { line = line.replace(/(\S)\s{2,}/g, '$1 ').trimEnd(); }
    } else if (want) {
        line = `${line.trimEnd()} [closed:: ${want}]`;
    }
    const nextText = replaceLine(src, item.line, line);
    if (nextText === undefined) { return { ok: false, error: 'that line is no longer there' }; }
    const rebuilt = rereadItem(nextText, item, items);
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
    /** The bare ⛔ — held back by hand. Omitted leaves it as it is; the toggle
     *  the panel presses is `setBacklogHold`, which does not rebuild the line. */
    hold?: boolean;
    /** The code this item is PART OF, or `null` to clear. Refused when it names
     *  something that is not there, itself, or one of its own descendants. */
    parent?: string | null;
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
    const hold = fields.hold === undefined ? !!item.onHold : !!fields.hold;
    // X-332 — new words pass the write gate; a press that did not bring any
    // (a priority, a tag) leaves the old ones exactly as they were.
    const words = (fields.text === undefined ? item.text : sanitizeBacklogTags(fields.text))
        .replace(LINE_BREAKS, ' ').trim();
    if (!words) { return { ok: false, error: 'an item needs some text' }; }

    // ‼️ REFUSED BEFORE A BYTE IS WRITTEN. A loop in the parent chain is
    // invisible on the row being edited and breaks every walk over the tree
    // afterwards, so it is caught here rather than reported later.
    let parent = item.parent;
    if (fields.parent === null) {
        parent = undefined;
    } else if (fields.parent !== undefined) {
        const bad = parentLinkError(items, item.code, fields.parent);
        if (bad) { return { ok: false, error: bad }; }
        parent = fields.parent.trim().toUpperCase();
    }

    const indent = /^(\s*)/.exec(item.raw)?.[1] ?? '';
    const bullet = /^\s*([-*+]|\d+[.)])/.exec(item.raw)?.[1] ?? '-';
    const parts = [`${indent}${bullet} [${STATE_CHAR[item.state]}]`];
    if (item.code) { parts.push(item.code); }
    parts.push(words);
    for (const k of kinds) { parts.push(`#${canonKind(k)}`); }
    if (PRIORITY_ICON[priority]) { parts.push(PRIORITY_ICON[priority]); }
    if (effort) { parts.push(`[effort:: ${effort}]`); }
    if (parent) { parts.push(`[parent:: ${parent}]`); }
    if (plan) { parts.push(`[plan:: ${plan}]`); }
    if (item.from) { parts.push(`[from:: ${item.from}]`); }
    if (item.was) { parts.push(`[was:: ${item.was}]`); }
    if (item.closed) { parts.push(`[closed:: ${item.closed}]`); }
    // The bare hold leads the coded ones so every ⛔ on the line stays together.
    if (hold) { parts.push('⛔'); }
    for (const b of blockedBy) { parts.push(`⛔ ${b}`); }
    if (item.taskId) { parts.push(`🆔 ${item.taskId}`); }
    if (due) { parts.push(`📅 ${due}`); }
    if (item.doneOn) { parts.push(`✅ ${item.doneOn}`); }

    const line = parts.join(' ');
    const nextText = replaceLine(src, item.line, line);
    if (nextText === undefined) { return { ok: false, error: 'that line is no longer there' }; }
    const rebuilt = rereadItem(nextText, item, items);
    return { ok: true, text: nextText, ...(rebuilt ? { item: rebuilt } : {}) };
}

/** The axes `setBacklogFields` can change, in the order the contract names them. */
export const BACKLOG_AXES = ['priority', 'effort', 'kinds', 'due', 'plan', 'parent', 'blockedBy', 'text'] as const;
export type BacklogAxis = typeof BACKLOG_AXES[number];

/**
 * ‼️ WHICH AXES REALLY CHANGED between two readings of one item (X-287). A
 * write that changed nothing answered `ok:true` with a full item, and the
 * caller walked on believing the tags were on the line — a silent failure
 * dressed as a success. The answer to "did it take?" is read off the item,
 * not off the request: an axis is reported only when its value differs.
 */
export function backlogAxesChanged(before: BacklogItem, after: BacklogItem): BacklogAxis[] {
    const list = (v: string[]) => v.map(canonKind).join('|');
    const out: BacklogAxis[] = [];
    if (before.priority !== after.priority) { out.push('priority'); }
    if ((before.effort ?? '') !== (after.effort ?? '')) { out.push('effort'); }
    if (list(before.kinds) !== list(after.kinds)) { out.push('kinds'); }
    if ((before.due ?? '') !== (after.due ?? '')) { out.push('due'); }
    if ((before.plan ?? '') !== (after.plan ?? '')) { out.push('plan'); }
    if ((before.parent ?? '') !== (after.parent ?? '')) { out.push('parent'); }
    if (before.blockedBy.join('|') !== after.blockedBy.join('|')) { out.push('blockedBy'); }
    if (before.text.trim() !== after.text.trim()) { out.push('text'); }
    return out;
}

// ---------------------------------------------------------------------------
// writing — adding
// ---------------------------------------------------------------------------

/** The next free number in an area. Only ever counts UP: a cancelled item's
 *  number stays spent, because a note from three months ago that says `K-8`
 *  must not start meaning something else. ‼️ A dotted legacy code counts under
 *  its own first number (`U-14.3` is spent U-14), so a flat code handed out now
 *  can never collide with one. */
export function nextCode(items: BacklogItem[], area: string): string {
    const a = area.trim().toUpperCase();
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
    /** Where it belongs. With no area the item goes to the inbox WITHOUT a code
     *  — which is the friction-free path and the one the quick-capture box
     *  uses. */
    area?: string;
    priority?: BacklogPriority;
    effort?: BacklogEffort;
    kinds?: string[];
    due?: string;
    plan?: string;
    /** The code this new item is PART OF. Independent of `area` on purpose: a
     *  `U` item is a child of a `P` epic as often as not, and an uncoded capture
     *  may name a parent too — the link is stored on the child and the child
     *  does not need a code of its own to carry one. */
    parent?: string;
    /**
     * ‼️ THE LINK IS BEING CARRIED, NOT CLAIMED — set only by `codeBacklogItem`.
     *
     * Filing a capture REBUILDS its line, so it comes back through here with
     * whatever the line already said. If the whole it names has since been
     * deleted in Obsidian, a fresh claim would rightly be refused — but refusing
     * HERE would mean a broken link in the user's file makes a capture
     * unfileable, and dropping it would take their data away on an action about
     * something else. So a carried link is kept as it stands: the row already
     * warns about it, which is where it can actually be fixed.
     */
    carriedParent?: boolean;
    from?: string;
    blockedBy?: string[];
    /** The bare ⛔ — carried through when a held capture is filed, never
     *  invented for a new item. */
    hold?: boolean;
    state?: BacklogState;
}

export interface AddBacklogResult extends BacklogEditResult {
    /** The code it was given, when it got one. */
    code?: string;
}

/**
 * Add an item.
 *
 * Where it lands, in order of preference: at the end of its area's section, else
 * under the 📥 heading, else at the end of the file. Appending is the one
 * insertion that cannot damage a structure we read wrongly, so it is the last
 * resort rather than the first move.
 */
export function addBacklogItem(text: string, input: AddBacklogInput): AddBacklogResult {
    const src = String(text ?? '');
    // ‼️ X-332 — the write gate: a bare `<tag>` cannot land, whoever wrote it.
    const words = sanitizeBacklogTags(String(input.text ?? '').replace(LINE_BREAKS, ' ').trim());
    if (!words) { return { ok: false, error: 'an item needs some text' }; }
    const parsed = parseBacklog(src);
    const eol = eolOf(src);

    const area = input.area?.trim().toUpperCase();
    if (area && !BACKLOG_CODE.test(`${area}-1`)) {
        return { ok: false, error: `"${area}" is not an area code — one or two capital letters` };
    }
    // The item does not exist yet, so there is nothing to loop with — only
    // "is that a real item" applies. Refused rather than written and warned
    // about: a link nobody asked for is not worth a line in somebody's file.
    let parent: string | undefined;
    if (input.parent) {
        const want = input.parent.trim().toUpperCase();
        if (input.carriedParent) {
            parent = BACKLOG_CODE.test(want) ? want : undefined;
        } else {
            const bad = parentLinkError(parsed.items, undefined, input.parent);
            if (bad) { return { ok: false, error: bad }; }
            parent = want;
        }
    }
    const code = area ? nextCode(parsed.items, area) : undefined;

    // Where to put it.
    let after = -1;                                    // insert AFTER this line
    /** The line we sat after, when it was an ITEM — its heading context is the
     *  new line's too, and that is what lets the new item be read back without
     *  a second pass over the file (X-130). */
    let neighbour: BacklogItem | undefined;
    if (area) {
        // ‼️ X-134 — NEVER LAND IN THE ARCHIVE. The seat is "after this area's
        // last item", and once an area's items have been archived its last one
        // is at the BOTTOM OF THE FILE, under 🗄 — so a brand-new item was
        // written into the history section and was open, coded and invisible
        // from the moment it was created. Measured: B-16..B-21 and X-132..X-133
        // all landed there. Archived lines are not seats.
        //
        // The test is the HEADING the line sits under (U-106's `archived`), not
        // "below the archive line": a `## X — …` heading written after the
        // archive opens a section that is not the archive, and its items are
        // perfectly good seats.
        const inArea = parsed.items.filter(i => i.area === area && !i.archived);
        if (inArea.length) {
            neighbour = inArea[inArea.length - 1];
            after = neighbour.line;
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
        if (mine.length) { neighbour = mine[mine.length - 1]; }
        after = mine.length ? mine[mine.length - 1].line : (parsed.inboxLine as number);
    }
    // No seat at all: the end of the file is under 🗄, so sit directly above it.
    let aboveArchive = false;
    if (after < 0 && parsed.archiveLine !== undefined) {
        const ls = src.split(/\r?\n/);
        after = parsed.archiveLine - 1;
        while (after >= 0 && !ls[after].trim()) { after--; }
        aboveArchive = true;
    }

    const parts = [`- [${STATE_CHAR[input.state ?? 'open']}]`];
    if (code) { parts.push(code); }
    parts.push(words);
    for (const k of input.kinds ?? []) { parts.push(`#${canonKind(k)}`); }
    if (input.priority && PRIORITY_ICON[input.priority]) { parts.push(PRIORITY_ICON[input.priority]); }
    if (input.effort) { parts.push(`[effort:: ${input.effort}]`); }
    if (parent) { parts.push(`[parent:: ${parent}]`); }
    if (input.plan) { parts.push(`[plan:: ${input.plan}]`); }
    if (input.from) { parts.push(`[from:: ${input.from}]`); }
    if (input.hold) { parts.push('⛔'); }
    for (const b of input.blockedBy ?? []) { parts.push(`⛔ ${b}`); }
    if (input.due) { parts.push(`📅 ${input.due}`); }
    const line = parts.join(' ');

    let nextText: string;
    if (aboveArchive && after < 0) {
        nextText = line + eol + src;
    } else if (after >= 0) {
        const at = lineStartOffset(src, after + 1);
        nextText = at >= 0
            ? src.slice(0, at) + line + eol + src.slice(at)
            : src + (src.endsWith('\n') ? '' : eol) + line + eol;
    } else {
        nextText = src + (!src || src.endsWith('\n') ? '' : eol) + line + eol;
    }
    // ‼️ X-130 — read the ONE line just written, when its heading context is
    // already known: it went directly under an item, so it shares that item's
    // section and area heading. Seated under a bare heading (the first item of
    // an area, or an empty inbox) there is no neighbour to take the context
    // from, and the file is read again — which is the rare case and the one
    // where the file is smallest.
    const added = neighbour
        ? addedLine(line, neighbour, parsed.items)
        : parseBacklog(nextText).items.find(i => i.raw === line);
    return {
        ok: true, text: nextText,
        ...(code ? { code } : {}),
        ...(added ? { item: added } : {}),
        ...(code
            ? (aboveArchive ? { note: `there is no ${area} heading — it went directly above 🗄 Archive` } : {})
            : { note: 'no area given — it went to the inbox without a code' })
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
    text: string, target: BacklogTarget, area: string
): AddBacklogResult {
    const src = String(text ?? '');
    const parsed = parseBacklog(src);
    const found = locate(parsed.items, target);
    if (!found.item) { return { ok: false, error: found.error as string }; }
    const item = found.item;
    if (item.code) { return { ok: false, error: `${item.code} already has a code` }; }

    const a = area.trim().toUpperCase();
    if (!BACKLOG_CODE.test(`${a}-1`)) {
        return { ok: false, error: `"${a}" is not an area code — one or two capital letters` };
    }
    const code = nextCode(parsed.items, a);

    // Re-add it where it belongs, then take the old line out. Doing it in this
    // order keeps the line numbers we already resolved valid while inserting.
    const added = addBacklogItem(src, {
        text: item.text,
        area: a,
        priority: item.priority,
        ...(item.effort ? { effort: item.effort } : {}),
        kinds: item.kinds,
        ...(item.due ? { due: item.due } : {}),
        ...(item.plan ? { plan: item.plan } : {}),
        // ‼️ Filing REBUILDS the line, so every field it is to keep has to be
        // listed here — the same trap `setBacklogFields` documents. A parent
        // dropped in this one place would vanish exactly when a capture got its
        // code, which is the moment nobody is looking at the field.
        ...(item.parent ? { parent: item.parent, carriedParent: true } : {}),
        ...(item.from ? { from: item.from } : {}),
        blockedBy: item.blockedBy,
        // U-60 — and the hold, for the same reason as the parent above: filing a
        // parked capture must not quietly unpark it.
        ...(item.onHold ? { hold: true } : {}),
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
// writing — the order (all of which is the queue)
// ---------------------------------------------------------------------------

/** Where a move puts an item, in the order a person says it: some number of
 *  steps either way, or all the way to one end of the whole queue. */
export type BacklogMoveDir = 'up' | 'down' | 'top' | 'bottom';
export const BACKLOG_MOVES: BacklogMoveDir[] = ['up', 'down', 'top', 'bottom'];

/**
 * Move one code some number of steps through the queue.
 *
 * ‼️ THIS MOVES IT IN THE QUEUE, NOT IN THE FILE. Not one line is touched, so the
 * item keeps its code, its area and its section — and the move can cross areas,
 * which is the whole point: a line cannot leave its own heading, an entry in a
 * list can go anywhere.
 *
 * `by` is what the step menu under ▲/▼ sends. One step is a plain click; the
 * menu offers the jumps a hand actually wants (2, 3, 4, 5, 10, 15, 20), and
 * `top`/`bottom` go to the ends of the WHOLE queue, not of an area. Anything
 * that would run off an end lands ON that end rather than failing: "up 20" from
 * position 3 means the top, which is what the hand that pressed it meant.
 */
export function moveInQueue(
    text: string, code: string, dir: BacklogMoveDir, by?: number
): QueueEditResult {
    const src = String(text ?? '');
    const parsed = parseBacklog(src);
    const want = String(code ?? '').trim().toUpperCase();
    const order = queueOrder(parsed.items, parsed.queue);
    const at = order.indexOf(want);
    if (at < 0) { return { ok: false, queue: order, error: queueRefusal(parsed, want) }; }

    const steps = Math.max(1, Math.floor(Number(by) || 1));
    const to = dir === 'top' ? 0
        : dir === 'bottom' ? order.length - 1
            : dir === 'up' ? Math.max(0, at - steps)
                : Math.min(order.length - 1, at + steps);
    if (to === at) {
        const end = dir === 'up' || dir === 'top' ? 'top' : 'bottom';
        return { ok: true, text: src, queue: order, note: `${want} is already at the ${end} of the queue` };
    }
    const moved = order.slice();
    moved.splice(at, 1);
    moved.splice(to, 0, want);
    return setBacklogQueue(src, moved);
}

/** Put one code at an absolute position, counted the way a person says it — 1 is
 *  the front. Out of range clamps to an end rather than failing. */
export function placeInQueue(text: string, code: string, at: number): QueueEditResult {
    const src = String(text ?? '');
    const parsed = parseBacklog(src);
    const want = String(code ?? '').trim().toUpperCase();
    const order = queueOrder(parsed.items, parsed.queue);
    const from = order.indexOf(want);
    if (from < 0) { return { ok: false, queue: order, error: queueRefusal(parsed, want) }; }
    const moved = order.slice();
    moved.splice(from, 1);
    const to = Math.max(0, Math.min(moved.length, Math.floor(at) - 1));
    moved.splice(to, 0, want);
    return setBacklogQueue(src, moved);
}

/**
 * Drop one code directly before or after another — the drag, in one call.
 *
 * Kept apart from `moveInQueue` because it answers a different question: one
 * nudges through a known order, this one names where it lands. Neither has an
 * area rule or a depth rule to enforce any more, because neither moves a line.
 */
export function dropInQueue(
    text: string, code: string, dest: string, place: 'before' | 'after'
): QueueEditResult {
    const src = String(text ?? '');
    const parsed = parseBacklog(src);
    const want = String(code ?? '').trim().toUpperCase();
    const onto = String(dest ?? '').trim().toUpperCase();
    const order = queueOrder(parsed.items, parsed.queue);
    const from = order.indexOf(want);
    if (from < 0) { return { ok: false, queue: order, error: queueRefusal(parsed, want) }; }
    if (want === onto) { return { ok: true, text: src, queue: order }; }
    const moved = order.slice();
    moved.splice(from, 1);
    // The anchor is found AFTER the removal, or dropping something onto an entry
    // below it lands one place short.
    const anchor = moved.indexOf(onto);
    if (anchor < 0) { return { ok: false, queue: order, error: queueRefusal(parsed, onto) }; }
    moved.splice(place === 'before' ? anchor : anchor + 1, 0, want);
    return setBacklogQueue(src, moved);
}

/**
 * PULL EVERY PART TO ITS WHOLE — the queue, rearranged so a family reads as one
 * run instead of being scattered through two hundred entries.
 *
 * ‼️ THE PARTS MOVE, INCLUDING THE ONES THAT WERE ABOVE. "Gather" means every
 * part leaves wherever it is and settles under its whole — a part queued ahead
 * of the thing it belongs to is the case this is most often pressed for, and
 * leaving it where it stood would be gathering the family everywhere except the
 * one place a reader had already noticed. What is kept is the WHOLES' order
 * among themselves: where a family sits is a decision about the whole, and a
 * button that re-prioritised those could not be pressed twice without checking.
 * Inside a run the parts keep the order they already had, depth first.
 *
 * `root`, when given, narrows it to one family: the row's own "gather its parts"
 * rather than the whole list. Everything outside that family stays exactly where
 * it stands, which is why it is a different pass and not the full one over a
 * filtered list.
 *
 * No line in the file moves — this writes the 🎯 block, like every other
 * ordering write here. Cycle-safe by construction (`placed` plus a final sweep),
 * because a `[parent:: …]` chain that loops is something a user can type in
 * Obsidian and the parse reports rather than repairs.
 */
export function gatherFamilies(text: string, root?: string): QueueEditResult {
    const src = String(text ?? '');
    const parsed = parseBacklog(src);
    const order = queueOrder(parsed.items, parsed.queue);
    const want = String(root ?? '').trim().toUpperCase();
    if (want && order.indexOf(want) < 0) {
        return { ok: false, queue: order, error: queueRefusal(parsed, want) };
    }

    const rank = new Map(order.map((c, n) => [c, n]));
    const parentOf = new Map<string, string>();
    const kids = new Map<string, string[]>();
    for (const it of parsed.items) {
        if (!it.parent || !it.code || !rank.has(it.code)) { continue; }
        // A parent that is closed, uncoded or missing is not in the queue, so
        // its part has nothing to gather to and stays a head of its own.
        if (!rank.has(it.parent)) { continue; }
        parentOf.set(it.code, it.parent);
        const list = kids.get(it.parent) ?? [];
        list.push(it.code);
        kids.set(it.parent, list);
    }
    // Parts in the order they are QUEUED in, not the order they were written —
    // the run under a whole has to read the same way the rest of the strip does.
    for (const list of kids.values()) {
        list.sort((a, b) => (rank.get(a) ?? 1e9) - (rank.get(b) ?? 1e9));
    }

    const placed = new Set<string>();
    /** One family, depth first — the run that goes under `code`. */
    const run = (code: string, into: string[]): void => {
        for (const kid of kids.get(code) ?? []) {
            if (placed.has(kid)) { continue; }
            placed.add(kid);
            into.push(kid);
            run(kid, into);
        }
    };

    let out: string[];
    if (want) {
        // ONE family. The parts come out of wherever they were and go back in
        // directly behind their whole; every other entry keeps its place.
        const mine: string[] = [];
        placed.add(want);
        run(want, mine);
        const rest = order.filter(c => c === want || !placed.has(c));
        out = [];
        for (const c of rest) {
            out.push(c);
            if (c === want) { out.push(...mine); }
        }
    } else {
        // EVERY family. The wholes keep their order among themselves; each one
        // takes its run with it.
        out = [];
        for (const code of order) {
            if (parentOf.has(code) || placed.has(code)) { continue; }
            placed.add(code);
            out.push(code);
            run(code, out);
        }
        // Members of a loop reach no whole of their own; they are drawn in their
        // old order rather than dropped, because an entry the queue refuses to
        // carry is an item nobody can fix.
        for (const code of order) {
            if (placed.has(code)) { continue; }
            placed.add(code);
            out.push(code);
        }
    }

    const same = out.length === order.length && out.every((c, n) => c === order[n]);
    if (same) {
        return {
            ok: true, text: src, queue: order,
            note: want ? `every part of ${want} is already under it`
                : 'every family is already together in the queue'
        };
    }
    const moved = out.filter((c, n) => c !== order[n]).length;
    const res = setBacklogQueue(src, out);
    return res.ok
        ? {
            ...res, note: `${moved} entr${moved === 1 ? 'y' : 'ies'} moved — `
                + (want ? `the parts of ${want} now follow it` : 'each part now follows its whole')
        }
        : res;
}

/**
 * ‼️ U-56 — ONE PART, TO ITS OWN WHOLE. The child-side half of `gatherFamilies`.
 *
 * "Gather its parts under it" is pressed on the WHOLE and moves everything that
 * belongs to it, which is the right gesture when a family has scattered and the
 * wrong one when a reader is looking at a single part that has drifted: it
 * rearranges rows they were not asking about. This moves exactly the row it was
 * pressed on, and nothing else in the queue changes place.
 *
 * ‼️ IT LANDS AT THE END OF THE FAMILY RUN, not immediately behind the parent.
 * A whole with three parts already gathered under it has a BLOCK, and dropping
 * the newcomer directly behind the whole would push its siblings down and
 * reorder a group nobody touched. Where the whole has no parts beside it, the
 * end of the run IS immediately behind it, which is what the item asks for.
 *
 * Like every other ordering write here, no line in the document moves — the 🎯
 * block is rewritten.
 */
export function joinParent(text: string, code: string): QueueEditResult {
    const src = String(text ?? '');
    const parsed = parseBacklog(src);
    const want = String(code ?? '').trim().toUpperCase();
    const order = queueOrder(parsed.items, parsed.queue);
    if (order.indexOf(want) < 0) {
        return { ok: false, queue: order, error: queueRefusal(parsed, want) };
    }
    const item = parsed.items.find(i => i.code === want);
    const parent = (item?.parent ?? '').toUpperCase();
    if (!parent) {
        return {
            ok: false, queue: order,
            error: `${want} is not part of anything — it has no [parent:: …] on its line,`
                + ' so there is nothing to send it under'
        };
    }
    if (order.indexOf(parent) < 0) {
        // The whole is closed, uncoded or gone. Saying WHICH is the difference
        // between a user fixing it in ten seconds and opening the file to look,
        // so the reason comes from the same place every other refusal does.
        return {
            ok: false, queue: order,
            error: `${want} belongs to ${parent}, which is not in the queue — `
                + queueRefusal(parsed, parent)
        };
    }

    // Which codes are parts of the parent, so the run below it can be measured.
    const siblings = new Set(parsed.items
        .filter(i => i.code && (i.parent ?? '').toUpperCase() === parent)
        .map(i => i.code as string));

    // ‼️ ALREADY THERE IS A STATE, NOT A COMPARISON OF RESULTS. A part sitting
    // in the middle of its family's run is under its whole by any reading a
    // person has; moving it to the end of that run to make the answer identical
    // would reorder siblings to report "nothing changed".
    const pAt = order.indexOf(parent);
    const iAt = order.indexOf(want);
    if (iAt > pAt && order.slice(pAt + 1, iAt).every(c => siblings.has(c))) {
        return { ok: true, text: src, queue: order, note: `${want} is already under ${parent}` };
    }

    const rest = order.filter(c => c !== want);
    const at = rest.indexOf(parent);
    // Walk past the parts already sitting behind the whole — that block is the
    // family, and the row joins the end of it.
    let to = at + 1;
    while (to < rest.length && siblings.has(rest[to])) { to++; }
    rest.splice(to, 0, want);

    const res = setBacklogQueue(src, rest);
    return res.ok ? { ...res, note: `${want} now follows ${parent} in the queue` } : res;
}

/** Why a code is not in the queue, said precisely. ‼️ Three different causes, and
 *  one message covering all of them would send somebody to read the file: not a
 *  code at all, no such item, or closed. */
function queueRefusal(parsed: BacklogSummary, code: string): string {
    if (!BACKLOG_CODE.test(code)) {
        return `"${code}" is not a backlog code`
            + ' — an uncoded capture has to be filed (🗂) before it can be queued';
    }
    const item = parsed.items.find(i => i.code === code);
    if (!item) { return `no backlog item with code ${code}`; }
    if (!isLive(item.state)) { return `${code} is ${item.state} — a closed item is not in the queue`; }
    return `${code} is not in the queue`;
}

// ---------------------------------------------------------------------------
// writing — the queue
// ---------------------------------------------------------------------------

/** How much of an item's words rides along beside its code in the block. Enough
 *  to recognise it, short enough that the block stays a LIST — a queue holding
 *  every open item is only readable if one entry is one short line. */
const QUEUE_LABEL = 52;

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
 * Replace the queue with exactly these codes, in this order.
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
 * job (`queueRefusal`), because there a typo must not look like success.
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

// ---------------------------------------------------------------------------
// writing — tidying the file back into its own order
// ---------------------------------------------------------------------------

export interface TidyResult extends BacklogEditResult {
    /** How many item blocks changed place. 0 means the file was already tidy. */
    moved: number;
    /** Sections left alone, and why — see the prose rule below. */
    skipped: string[];
    /** Codes that were sitting under somebody else's heading — or still OPEN
     *  under 🗄 Archive (X-134) — and were carried back to their own section.
     *  Named rather than counted: this one is worth reading, because a line in
     *  the wrong place is a line its owner cannot find in Obsidian. */
    reseated: string[];
    /** X-332 — bare `<tag>`s put in a code span. 0 = none were found. */
    sanitized: number;
    /** Backticks typed for an apostrophe (`commit`te`) put back as `'`. */
    mended: number;
    /** Lines whose backticks still do not pair, by item code (else `line N`) — a person fixes these. */
    unpaired: string[];
}

/**
 * Carry a coded item back under its own area's heading.
 *
 * ‼️ WHY THIS IS THE OTHER HALF OF TIDYING, AND WHY ITS ABSENCE WAS INVISIBLE.
 * The sort below works on RUNS of consecutive items and cannot cross a heading,
 * by design — so an item filed under the wrong one was never moved back; it was
 * merely sorted into a tidy-looking position among its new neighbours. Measured
 * on the real file: `A-4, P-6 … P-10, U-1, U-3 …` all sat under `## U`, in
 * perfect code order, looking deliberate. The panel never showed the damage,
 * because it groups by the CODE and so drew every one of them under P and A as
 * if nothing were wrong. The only reader who saw it was the person scrolling
 * `Backlog.md` to the `## P` section and finding five items missing from a file
 * that is supposed to be the record. That is what this repairs, and — running
 * on every tidy — what stops it accumulating again.
 *
 * An item goes home only if its area HAS a heading here: inventing one would be
 * restructuring somebody's document rather than repairing it.
 *
 * ‼️ X-134 — AND THE ARCHIVE IS NOT A PLACE OPEN WORK CAN HIDE. A CLOSED line
 * under 🗄 is left exactly where it is: the archive is a record of what was, not
 * a section to sort. But an OPEN or DOING line down there is not a record of
 * anything — it is live work that every default view hides (the page folds the
 * archive away, the queue reads the file from the top) while it still counts as
 * open. That is the worst of both: not shown, and not finished. So it is
 * carried back to its own area, exactly as a mis-filed line is, and named in
 * `reseated` so somebody can see it happened. Uncoded captures have no home to go to and never move.
 *
 * One item per pass, re-parsing between: an insertion renumbers every line under
 * it, and the cost of getting that arithmetic wrong is a line deleted from the
 * user's vault. A backlog is hundreds of lines, so re-reading it is free.
 */
function reseatMisfiled(src: string, only?: string): { text: string; moved: string[] } {
    const eol = eolOf(src);
    let text = String(src ?? '');
    const moved: string[] = [];
    // ‼️ X-142 — `only` narrows this to ONE code, for the reopen path. A tick on
    // an archived item must carry THAT item home and touch nothing else: the
    // full sweep is a deliberate act (`projects.backlog.tidy`), and quietly
    // relocating four other mis-filed lines because somebody unticked a box
    // would be an edit they did not ask for, in a file they read by eye.
    const want = String(only ?? '').trim().toUpperCase();
    for (let guard = 0; guard < 400; guard++) {
        const parsed = parseBacklog(text);
        const home = new Map<string, number>();
        for (const a of parsed.areas) { home.set(a.code, a.line); }
        const stray = parsed.items.find(i => {
            if (!i.code || !i.area || !home.has(i.area)) { return false; }
            if (want && i.code !== want) { return false; }
            // Under the archive: rescued only while it is still live. A closed
            // one belongs there and moving it would undo an archiving somebody
            // asked for.
            if (ARCHIVE_HEADING.test(i.section)) { return isLive(i.state); }
            return i.sectionArea !== i.area;
        });
        if (!stray) { break; }

        const area = stray.area as string;
        // Land after the last item ALREADY seated correctly, so a run of strays
        // arrives in the order it left; with none seated yet, straight under the
        // heading. An archived line is never a landing point — it is the place
        // being rescued FROM.
        const seated = parsed.items.filter(i =>
            i.area === area && i.sectionArea === area && !i.archived);
        const after = seated.length ? seated[seated.length - 1].line : (home.get(area) as number);
        const cut = removeLine(text, stray.line, stray.raw);
        if (!cut) { break; }
        // Taking the line out pulled everything below it up by one.
        const at = lineStartOffset(cut, stray.line < after + 1 ? after : after + 1);
        text = at >= 0
            ? cut.slice(0, at) + stray.raw + eol + cut.slice(at)
            : cut + (cut.endsWith('\n') ? '' : eol) + stray.raw + eol;
        moved.push(stray.code as string);
    }
    return { text, moved };
}

/**
 * Put each area's items back in code order: K-1, K-2, K-3…
 *
 * ‼️ WHY THIS EXISTS. Line order used to BE the priority, so years of "move this
 * one up" left every area shuffled — K-6, K-1, K-8, K-7 — and a file you read in
 * Obsidian could not be scanned for a number. Now that the order lives in the
 * 🎯 block, the file's job is to be the DICTIONARY, and a dictionary is sorted.
 * Nothing about the queue changes when this runs: it names codes, and a code
 * does not care which line it is on.
 *
 * ‼️ A SECTION WITH PROSE BETWEEN ITS ITEMS IS LEFT ALONE AND REPORTED. Somebody
 * wrote that paragraph where it is for a reason and no sort knows what it was;
 * refusing the section is honest, silently relocating the paragraph is not.
 * Blank lines between items are furniture, not prose, and are closed up.
 */
export function tidyBacklogFile(text: string): TidyResult {
    // ‼️ HOME FIRST, THEN ORDER. Sorting cannot cross a heading, so an item
    // sorted before it is reseated is sorted into the wrong section and stays
    // there looking correct. See reseatMisfiled.
    // X-332 — a bare `<tag>` suspends Markdown's block parser for everything
    // below it, so it is repaired before anything reads the file's shape.
    const clean = sanitizeBacklogMarkdown(String(text ?? ''));
    const sanitized = clean.wrapped;
    const mended = clean.mended;
    const codeAt = new Map(parseBacklog(clean.text).items.map(i => [i.line, i.code]));
    const unpaired = clean.unpaired.map(n => codeAt.get(n) || `line ${n + 1}`);
    const reseat = reseatMisfiled(clean.text);
    const reseated = reseat.moved;
    const src = reseat.text;
    const parsed = parseBacklog(src);
    const lines = src.split(/\r?\n/);
    const eol = eolOf(src);
    const isItemLine = new Set(parsed.items.map(i => i.line));

    // ‼️ SECTIONS ARE TAKEN AS RUNS OF CONSECUTIVE ITEMS, not by looking the
    // heading up: an item's `area` comes from its CODE, so a K-coded line that
    // somebody parked under `## S` would otherwise drag a span across a heading.
    // A run cannot cross one, because the heading line itself would then sit
    // between two blocks and be caught by the prose rule below.
    const byLine = [...parsed.items].sort((a, b) => a.line - b.line);
    const runs: BacklogItem[][] = [];
    for (const item of byLine) {
        const last = runs[runs.length - 1];
        if (last && last[0].section === item.section) { last.push(item); } else { runs.push([item]); }
    }
    const skipped: string[] = [];
    let moved = 0;
    // Highest line first, so an earlier run's rewrite cannot shift the line
    // numbers of one not yet done.
    for (const mine of runs.reverse()) {
        const section = mine[0].section;
        // The inbox holds uncoded captures with nothing to sort by, and the
        // archive is a record rather than a list.
        if (INBOX_HEADING.test(section) || ARCHIVE_HEADING.test(section)) { continue; }
        if (mine.length < 2) { continue; }

        // One item is one line, so one item is one block.
        const blocks = mine.map(it => ({
            ...(it.code ? { code: it.code } : {}), from: it.line, to: it.line
        }));
        if (blocks.length < 2) { continue; }

        const span = { from: blocks[0].from, to: blocks[blocks.length - 1].to };
        const prose = [];
        for (let n = span.from; n <= span.to; n++) {
            if (!isItemLine.has(n) && lines[n].trim() && !insideBlock(blocks, n)) { prose.push(n + 1); }
        }
        if (prose.length) {
            skipped.push(`${section || 'the top of the file'} (line ${prose[0]})`);
            continue;
        }

        // Uncoded lines keep their relative place at the back: there is nothing
        // to sort them by, and putting them first would bury the sorted list.
        const sorted = blocks.map((b, n) => ({ b, n })).sort((x, y) => {
            if (x.b.code && y.b.code) { return compareCodes(x.b.code, y.b.code) || x.n - y.n; }
            if (!x.b.code && !y.b.code) { return x.n - y.n; }
            return x.b.code ? -1 : 1;
        }).map(x => x.b);
        if (sorted.every((b, n) => b === blocks[n])) { continue; }

        moved += sorted.filter((b, n) => b !== blocks[n]).length;
        const body: string[] = [];
        for (const b of sorted) { for (let n = b.from; n <= b.to; n++) { body.push(lines[n]); } }
        lines.splice(span.from, span.to - span.from + 1, ...body);
    }

    const parts: string[] = [];
    if (sanitized) {
        parts.push(`put ${sanitized} bare tag${sanitized === 1 ? '' : 's'} in code`);
    }
    if (mended) {
        parts.push(`put ${mended} backtick${mended === 1 ? '' : 's'} typed for an apostrophe back as '`);
    }
    if (unpaired.length) {
        parts.push(`${unpaired.join(', ')} still ${unpaired.length === 1 ? 'has a backtick' : 'have backticks'} with no partner — the rest of the line reads inside out, fix by hand`);
    }
    if (reseated.length) {
        parts.push(`carried ${reseated.join(', ')} back under ${reseated.length === 1 ? 'its' : 'their'} own heading`);
    }
    if (skipped.length) {
        parts.push(`left ${skipped.join(', ')} alone — prose sits between those items`);
    }
    const left = parts.join('; ');
    if (!moved) {
        return {
            ok: true, text: src, moved: 0, skipped, reseated, sanitized, mended, unpaired,
            note: left || 'already in code order'
        };
    }
    return { ok: true, text: lines.join(eol), moved, skipped, reseated, sanitized, mended, unpaired, ...(left ? { note: left } : {}) };
}

const insideBlock = (blocks: { from: number; to: number }[], line: number): boolean =>
    blocks.some(b => line >= b.from && line <= b.to);

// ---------------------------------------------------------------------------
// writing — archiving
// ---------------------------------------------------------------------------

/** The heading finished work is moved under. Written only if it is needed. */
export const ARCHIVE_TITLE = '## 🗄 Archive';

export interface ArchiveResult extends BacklogEditResult {
    moved: number;
    /** Closed rows left visible because an age filter was requested but their
     *  closing time is not recorded anywhere. Unknown is never treated as old. */
    undated?: number;
}

export interface ArchiveOptions {
    cancelled?: boolean;
    /** Archive only rows closed MORE than this many whole days ago. Omit for
     *  the original sweep-all behaviour. */
    olderThanDays?: number;
    /** Clock seam for tests. */
    now?: number;
    /** The host supplies the track-ledger resolver; the pure fallback below
     *  knows only the Tasks plugin's day-level ✅ metadata. */
    closedAt?: (item: BacklogItem) => number | null;
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
export function archiveBacklogDone(text: string, opts: ArchiveOptions = {}): ArchiveResult {
    const src = String(text ?? '');
    const parsed = parseBacklog(src);
    // ‼️ X-134 — ONLY `[x]` AND `[-]` EVER MOVE, and the rule is stated as the
    // filter rather than trusted to the caller: an open line swept into the
    // archive is work that is still live and can no longer be seen, which is
    // the exact damage the rescue in `reseatMisfiled` exists to undo. Lines
    // already under 🗄 are excluded by the HEADING they sit under, not by being
    // below its line number — a `## X — …` heading written after the archive
    // opens a section that is not the archive.
    const closed = parsed.items.filter(i =>
        (i.state === 'done' || (opts.cancelled !== false && i.state === 'cancelled'))
        && !i.archived);
    const hasAge = opts.olderThanDays !== undefined;
    const days = Number(opts.olderThanDays);
    if (hasAge && (!Number.isInteger(days) || days < 0)) {
        return { ok: false, text: src, moved: 0, error: 'olderThanDays must be a whole number of days, 0 or greater' };
    }
    const fallbackClosedAt = (i: BacklogItem): number | null => {
        const day = i.doneOn ? Date.parse(`${i.doneOn}T12:00:00`) : NaN;
        return Number.isFinite(day) ? day : null;
    };
    const closedAt = opts.closedAt ?? fallbackClosedAt;
    const cutoff = hasAge ? Number(opts.now ?? Date.now()) - days * 86_400_000 : 0;
    const undated = hasAge ? closed.filter(i => !closedAt(i)).length : 0;
    const wanted = hasAge ? closed.filter(i => {
        const ts = closedAt(i);
        return !!ts && ts < cutoff;
    }) : closed;
    const undatedNote = undated
        ? `${undated} closed item${undated === 1 ? '' : 's'} had no closing date and stayed in place`
        : '';
    if (!wanted.length) {
        return {
            ok: true, text: src, moved: 0, ...(hasAge ? { undated } : {}),
            note: [hasAge ? 'nothing old enough to archive' : 'nothing closed to archive', undatedNote]
                .filter(Boolean).join(' — ')
        };
    }

    const lines = src.split(/\r?\n/);
    const eol = eolOf(src);
    // X-460 — an item moves with the indented lines under it (core/backlogBlock.ts)
    const itemLines = new Set(parsed.items.map(i => i.line));
    const ends = wanted.map(i => itemBlockEnd(lines, i.line, itemLines));
    const taken = new Set<number>();
    wanted.forEach((i, k) => { for (let n = i.line; n <= ends[k]; n++) { taken.add(n); } });
    const kept = lines.filter((_, n) => !taken.has(n));
    // Verbatim: every parsed item already has its bullet (`-`, `*`, `+`, `1.`).
    const body = wanted.flatMap((i, k) => [i.raw, ...lines.slice(i.line + 1, ends[k] + 1)]);

    let out: string[];
    if (parsed.archiveLine !== undefined) {
        // Insert under the existing heading, which may have moved up as lines
        // above it were taken out.
        const shift = [...taken].filter(n => n < (parsed.archiveLine as number)).length;
        const at = (parsed.archiveLine as number) - shift + 1;
        out = [...kept.slice(0, at), ...body, ...kept.slice(at)];
    } else {
        while (kept.length && !kept[kept.length - 1].trim()) { kept.pop(); }
        out = [...kept, '', ARCHIVE_TITLE, '', ...body, ''];
    }
    /**
     * ‼️ NOTHING IS DRAGGED ALONG, AND THAT IS WHY IT IS SAID OUT LOUD. A
     * family is a set of links, not a block of lines: a closed parent goes to
     * the archive on its own account and its open children stay exactly where
     * they are, still coded, still queued, still pointing at it — which is
     * correct (the parent is in the same file, so the link still resolves) and
     * surprising (the row you were reading them under is no longer in the
     * list). Moving them too would archive open work; saying nothing would
     * leave somebody hunting for a heading that moved.
     */
    const archivedCodes = new Set(wanted.map(i => i.code).filter(Boolean) as string[]);
    const orphaned = parsed.items.filter(i =>
        !!i.parent && archivedCodes.has(i.parent) && isLive(i.state)
        && !archivedCodes.has(i.code ?? ''));
    const familyNote = orphaned.length
        ? `${orphaned.map(i => i.code ?? `line ${i.line + 1}`).join(', ')} `
        + `${orphaned.length === 1 ? 'is' : 'are'} still open under an item that just moved to the archive`
        + ' — the link still resolves, the children did not move'
        : '';
    const note = [familyNote, undatedNote].filter(Boolean).join(' · ');
    return {
        ok: true, text: out.join(eol), moved: wanted.length,
        ...(hasAge ? { undated } : {}), ...(note ? { note } : {})
    };
}
