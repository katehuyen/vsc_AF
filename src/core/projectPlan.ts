import { LINE_BREAKS } from './lineBreaks';

/**
 * The plan — the user's own checkbox lines, read and ticked without being
 * rewritten.
 *
 * Agent Farm imposes NO format on a plan file. Whatever the vault already does
 * is what a plan item looks like here: an Obsidian Tasks line with its 🆔 ⛔ ⏫ 📅
 * metadata, a bare `- [ ] thing`, a nested sub-item, an emoji somebody put there
 * on purpose. The gain of not having a format of our own is concrete — the same
 * line keeps showing up in the user's existing task queries, for free, because
 * it never stopped being one of their lines.
 *
 * ‼️ THE WRITE SIDE IS ONE CHARACTER WIDE, AND THAT IS THE WHOLE DESIGN.
 * Ticking an item replaces the space inside `[ ]` with an `x` and touches
 * nothing else on that line — not the spacing, not the bullet, not the icons,
 * not the metadata, not even the line ending. Anything more (adding a ✅ done
 * date, normalising a bullet, re-indenting) would be Agent Farm editing prose it
 * does not own, and the user would find their file quietly rewritten by a
 * program they asked to tick a box. If a done-date is wanted, Obsidian's own
 * Tasks plugin writes it when the box is ticked THERE — which is exactly the
 * right division of labour.
 *
 * Pure string work: nothing here reads a file or knows what a `vscode` is.
 */

// ---------------------------------------------------------------------------
// reading
// ---------------------------------------------------------------------------

export interface PlanItem {
    /** 0-based index of the line in the document — how a caller addresses it. */
    line: number;
    /** The line exactly as it is on disk, including indent and metadata. */
    raw: string;
    /** The item's words, with the checkbox and the Tasks metadata taken off.
     *  For DISPLAY and for matching only — never written back. */
    text: string;
    done: boolean;
    /** Leading whitespace, in columns (a tab counts as one). Sub-items keep
     *  their nesting when the page draws them. */
    depth: number;
    /** The nearest heading above it, '' when the file has none yet. */
    section: string;
    /** Obsidian Tasks id (🆔 xyz) when the line carries one — a stable handle
     *  that survives the line moving, which a line number does not. */
    id?: string;
    /** ✅ YYYY-MM-DD — the completion date the user's own tooling wrote. The
     *  only honest timestamp a plan item has; nothing here invents one. */
    doneOn?: string;
    /** 📅 YYYY-MM-DD — the due date, when the line states one. */
    due?: string;
}

/**
 * A markdown task line.
 *
 * Deliberately broad on the bullet (`-`, `*`, `+` and ordered lists all count)
 * and deliberately narrow on the box: exactly one character between the
 * brackets. `[ ]` is open, anything else is done — Obsidian's alternate
 * checkbox states (`[x]`, `[/]`, `[-]`) all mean "not waiting on you any more",
 * and treating an unknown glyph as open would show finished work as outstanding.
 */
/* ‼️ The whitespace after `]` is REQUIRED, and it is what keeps a markdown link
 * out of the plan: `- [a](http://x)` has a single character between brackets
 * too, and without this it would be read as a completed task called "(http://x)"
 * — which a caller could then "untick", editing a link in the user's prose. */
/* Exported because the backlog is the SAME kind of line — a project's backlog
 * file is checkbox lines too, and a line that counts as a task in the plan must
 * count as one there. Two copies of this regex would drift apart on the first
 * edge case somebody fixes in one of them. */
export const TASK_LINE = /^(\s*)(?:[-*+]|\d+[.)])\s+\[(.)\](?:\s(.*))?$/;

/** Obsidian Tasks metadata, stripped for display and never for writing. */
export const TASK_META = /\s*(?:🆔|⛔|⏫|🔼|🔽|⏬|🔺|📅|⏳|🛫|➕|✅|❌|🔁|🏁)\s*[^\s🆔⛔⏫🔼🔽⏬🔺📅⏳🛫➕✅❌🔁🏁]*/gu;

const idOf = (line: string): string | undefined =>
    /🆔\s*([A-Za-z0-9_-]+)/u.exec(line)?.[1];
const dateAfter = (line: string, icon: string): string | undefined =>
    new RegExp(`${icon}\\s*(\\d{4}-\\d{2}-\\d{2})`, 'u').exec(line)?.[1];

/** Trailing `#tags`, links and Tasks metadata off; the words stay. */
function displayText(body: string): string {
    return body.replace(TASK_META, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Every checkbox line in a plan document, in file order.
 *
 * Headings are tracked as we go so each item knows which section it is under —
 * that is what lets the page draw "Milestones" and "Next up" the way the file
 * has them, instead of one flat list that loses the user's own structure.
 * A fenced code block is skipped: a `- [ ]` inside one is an example, not a
 * task, and ticking it would edit somebody's documentation.
 */
export function parsePlanItems(text: string): PlanItem[] {
    const lines = String(text ?? '').split(/\r?\n/);
    const out: PlanItem[] = [];
    let section = '';
    let fenced = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; continue; }
        if (fenced) { continue; }
        const heading = /^(#{1,6})\s+(.*)$/.exec(line);
        if (heading) { section = heading[2].trim(); continue; }
        const m = TASK_LINE.exec(line);
        if (!m) { continue; }
        const id = idOf(line);
        const doneOn = dateAfter(line, '✅');
        const due = dateAfter(line, '📅');
        out.push({
            line: i,
            raw: line,
            text: displayText(m[3] ?? ''),
            done: m[2] !== ' ',
            depth: m[1].replace(/\t/g, ' ').length,
            section,
            ...(id ? { id } : {}),
            ...(doneOn ? { doneOn } : {}),
            ...(due ? { due } : {})
        });
    }
    return out;
}

export interface PlanSummary {
    items: PlanItem[];
    open: number;
    done: number;
    /** Section name → the items under it, in file order. Sections with no
     *  checkbox line at all do not appear: an empty heading is prose. */
    sections: { title: string; items: PlanItem[] }[];
}

export function planSummary(text: string): PlanSummary {
    const items = parsePlanItems(text);
    const sections: PlanSummary['sections'] = [];
    for (const item of items) {
        let bucket = sections.find(s => s.title === item.section);
        if (!bucket) { bucket = { title: item.section, items: [] }; sections.push(bucket); }
        bucket.items.push(item);
    }
    return {
        items,
        open: items.filter(i => !i.done).length,
        done: items.filter(i => i.done).length,
        sections
    };
}

/** The open items a brief should carry — top of the file first, because that is
 *  where the user put what matters. */
export function openPlanItems(text: string, max = 6): PlanItem[] {
    return parsePlanItems(text).filter(i => !i.done).slice(0, max);
}

// ---------------------------------------------------------------------------
// writing
// ---------------------------------------------------------------------------

export interface PlanEditResult {
    ok: boolean;
    /** The whole document afterwards — the caller writes it through the guarded,
     *  atomic path (`safeWriteDoc`), which is the only thing allowed to touch a
     *  file Obsidian may be holding open. */
    text?: string;
    error?: string;
    /** Which line was touched, for the answer the user reads. */
    item?: PlanItem;
    /** Something true about the result the caller should pass on. Not a
     *  warning about a failure — the edit worked; this is what it did NOT do. */
    note?: string;
}

/** How a caller says WHICH item. An id is the stable one; a line number is
 *  exact but goes stale the moment the user inserts a paragraph; the text is
 *  what a person (or an agent reading the brief) actually has to hand. */
export interface PlanTarget {
    id?: string;
    line?: number;
    /**
     * Matched case-insensitively against the item's display text; a unique
     * substring is enough, an ambiguous one is an error rather than a guess.
     *
     * ‼️ WITH `line` IT IS A CHECK, NOT A SEARCH — and that is the point.
     * A line number goes stale the moment somebody inserts a paragraph in
     * Obsidian, and a page holds one for as long as it stays open. Passing what
     * you believe is ON that line turns "the document moved under you" from a
     * tick on the wrong item into a refusal. Ticking the wrong box in
     * somebody's plan is silent; they find out weeks later.
     */
    text?: string;
}

function locate(items: PlanItem[], target: PlanTarget): { item?: PlanItem; error?: string } {
    if (target.id) {
        const hits = items.filter(i => i.id === target.id);
        if (!hits.length) { return { error: `no plan item with id ${target.id}` }; }
        return { item: hits[0] };
    }
    if (typeof target.line === 'number' && target.line >= 0) {
        const hit = items.find(i => i.line === target.line);
        if (!hit) { return { error: `line ${target.line + 1} is not a plan item` }; }
        const claimed = String(target.text ?? '').trim();
        if (claimed && hit.text.trim() !== claimed) {
            return {
                error: `line ${target.line + 1} now reads "${hit.text}", not "${claimed}"`
                    + ' — the document changed since you read it; reload and try again'
            };
        }
        return { item: hit };
    }
    const needle = String(target.text ?? '').trim().toLowerCase();
    if (!needle) { return { error: 'say which item: id, line or text' }; }
    const exact = items.filter(i => i.text.toLowerCase() === needle);
    const hits = exact.length ? exact : items.filter(i => i.text.toLowerCase().includes(needle));
    if (!hits.length) { return { error: `no plan item matches "${target.text}"` }; }
    // ‼️ Ambiguity is an ERROR, not a first-match. Ticking the wrong box in
    // somebody's plan is silent and they find out weeks later.
    if (hits.length > 1) {
        return {
            error: `"${target.text}" matches ${hits.length} items (${hits.map(h => `line ${h.line + 1}`).join(', ')}) — be more specific, or use the id`
        };
    }
    return { item: hits[0] };
}

/**
 * The character offset a given line starts at, or -1 past the end.
 *
 * Every write in this module works on OFFSETS INTO THE ORIGINAL STRING rather
 * than on a split-and-rejoin. The difference is not stylistic: splitting on
 * `/\r?\n/` and joining with one chosen ending rewrites every other line in a
 * file with mixed endings, so a request to tick one box would come back as a
 * whole-file diff in the user's vault — and in git.
 */
export function lineStartOffset(src: string, line: number): number {
    let at = 0;
    for (let n = 0; n < line; n++) {
        const nl = src.indexOf('\n', at);
        if (nl < 0) { return -1; }
        at = nl + 1;
    }
    return at <= src.length ? at : -1;
}

/** The ending the document itself uses, for a line we are ADDING. */
export const eolOf = (src: string): string => (/\r\n/.test(src) ? '\r\n' : '\n');

/**
 * Tick (or untick) one item.
 *
 * ‼️ Exactly one character of the document changes. The box's offset is computed
 * in the original string and spliced; nothing is re-serialised, so the bullet,
 * the spacing, the icons, the Tasks metadata, the line ending and every other
 * line come back byte for byte. Rebuilding the line from its parsed pieces would
 * pass the same unit test and quietly normalise the user's file in real life.
 */
export function checkPlanItem(text: string, target: PlanTarget, done = true): PlanEditResult {
    const src = String(text ?? '');
    const items = parsePlanItems(src);
    const found = locate(items, target);
    if (!found.item) { return { ok: false, error: found.error }; }
    const item = found.item;
    if (item.done === done) {
        return { ok: true, text: src, item };          // already there; not an error
    }
    const start = lineStartOffset(src, item.line);
    const box = start < 0 ? -1 : start + item.raw.indexOf('[') + 1;
    if (box < 0 || src[box - 1] !== '[' || src[box + 1] !== ']') {
        return { ok: false, error: 'that line no longer looks like a checkbox' };
    }
    const next = src.slice(0, box) + (done ? 'x' : ' ') + src.slice(box + 1);
    const raw = item.raw.slice(0, item.raw.indexOf('[') + 1)
        + (done ? 'x' : ' ') + item.raw.slice(item.raw.indexOf('[') + 2);
    return {
        ok: true, text: next, item: { ...item, done, raw },
        // Reopening leaves the ✅ the user's own tooling wrote, because removing
        // it would be this module editing metadata it did not put there. Saying
        // so beats both alternatives: a silent inconsistency, or a rule broken
        // "helpfully".
        ...(!done && item.doneOn
            ? { note: `the line still carries its ✅ ${item.doneOn} — Agent Farm does not remove metadata it did not write` }
            : {})
    };
}

export interface AddPlanItemOptions {
    /** Put it under this heading. Missing or unmatched → the end of the file,
     *  which is always safe; inventing a section would restructure the user's
     *  document to hold one line. */
    section?: string;
    /** Written verbatim after the item's text — this is how a caller passes the
     *  vault's own metadata (📅 2026-09-01 🆔 afprj-09) without this module
     *  needing to know what any of it means. */
    meta?: string;
    /** `-` unless the document plainly prefers something else. */
    bullet?: string;
}

/**
 * Add an open item.
 *
 * Inserted after the LAST checkbox line of the target section, so a new item
 * joins the list instead of landing above work already written down. With no
 * section (or an unknown one) it goes at the end of the file — appending is the
 * one insertion that cannot damage a structure we did not read correctly.
 */
export function addPlanItem(text: string, item: string, opts: AddPlanItemOptions = {}): PlanEditResult {
    const body = String(item ?? '').replace(LINE_BREAKS, ' ').trim();
    if (!body) { return { ok: false, error: 'nothing to add' }; }
    const src = String(text ?? '');
    const eol = eolOf(src);
    const existing = parsePlanItems(src);

    // Follow the document's own bullet rather than imposing one.
    const bullet = opts.bullet
        || (existing.length ? (/^\s*([-*+])/.exec(existing[0].raw)?.[1] ?? '-') : '-');
    const line = `${bullet} [ ] ${body}${opts.meta?.trim() ? ' ' + opts.meta.trim() : ''}`;

    const wanted = String(opts.section ?? '').trim().toLowerCase();
    let after = -1;                                   // insert BEFORE this line
    if (wanted) {
        const inSection = existing.filter(i => i.section.toLowerCase() === wanted);
        if (inSection.length) {
            after = inSection[inSection.length - 1].line + 1;
        } else {
            // The heading exists but holds no items yet: go straight under it.
            const lines = src.split(/\r?\n/);
            for (let i = 0; i < lines.length; i++) {
                const h = /^#{1,6}\s+(.*)$/.exec(lines[i]);
                if (h && h[1].trim().toLowerCase() === wanted) { after = i + 1; break; }
            }
        }
    }

    const at = after >= 0 ? lineStartOffset(src, after) : -1;
    let next: string;
    if (at >= 0) {
        next = src.slice(0, at) + line + eol + src.slice(at);
    } else {
        // Appending is the one insertion that cannot damage a structure we read
        // wrongly — so an unknown section falls back to it rather than guessing.
        const pad = !src || src.endsWith('\n') ? '' : eol;
        next = src + pad + line + eol;
    }
    const added = parsePlanItems(next).find(i => i.raw === line);
    return { ok: true, text: next, ...(added ? { item: added } : {}) };
}
