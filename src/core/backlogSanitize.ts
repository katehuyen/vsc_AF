/**
 * X-332 — A BARE `<tag>` IN A BACKLOG LINE, PUT IN CODE BEFORE IT CAN EAT THE PAGE.
 *
 * A placeholder written as plain text — `<ALAN>`, `<id>`, `<model>` — reads to
 * Markdown and Obsidian as an unclosed HTML opening tag, and every heading and
 * task line after it can stop being one. No rule written for the agents stops
 * that (Principle 1), so the writer and the tidy do it themselves.
 *
 * ‼️ ONLY A TAG THAT IS LEFT OPEN IS TOUCHED. Measured on the real backlog
 * before this shipped: the user writes `<br>` on purpose to break a long item,
 * and a path like `C:\Users\<user>` is already escaped by its backslash — both
 * render right and a blind wrap would have broken them. So a void element
 * (`<br>`, `<hr>`, `<wbr>`, `<img>`), a pair closed on the same line
 * (`<b>…</b>`) and a backslash-escaped `<` are left alone, as are code spans,
 * fenced blocks, HTML comments (one line or many), the YAML front matter and an
 * angle-bracket link target `](<…>)`. A `<…>` holding a dot, a colon, an `@` or
 * a space is a path, an autolink or an address, and the pattern cannot match it.
 */

const TAG = /<(\/?)([A-Za-z0-9_][A-Za-z0-9_-]*)(\/?)>/g;
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

interface Piece { code: boolean; text: string }

/** Backslashes directly before `at` — an odd count escapes the character. */
function escaped(s: string, at: number): boolean {
    let n = 0;
    while (at - 1 - n >= 0 && s[at - 1 - n] === '\\') { n++; }
    return n % 2 === 1;
}

/**
 * Cut one line into prose and untouchable pieces, left to right — a code span
 * and a comment are both inline constructs, and whichever OPENS first wins, so
 * a `<!--` quoted inside backticks is code, not a comment.
 */
function cut(line: string, st: { inComment: boolean }): { pieces: Piece[]; loose: Set<number> } {
    const pieces: Piece[] = [];
    const loose = new Set<number>();
    let plain = '';
    const keep = (text: string): void => { pieces.push({ code: false, text: plain }, { code: true, text }); plain = ''; };
    let i = 0;
    if (st.inComment) {
        const end = line.indexOf('-->');
        if (end < 0) { return { pieces: [{ code: true, text: line }], loose }; }
        keep(line.slice(0, end + 3));
        st.inComment = false;
        i = end + 3;
    }
    while (i < line.length) {
        if (line.startsWith('<!--', i) && !escaped(line, i)) {
            const end = line.indexOf('-->', i + 4);
            if (end < 0) { keep(line.slice(i)); st.inComment = true; i = line.length; break; }
            keep(line.slice(i, end + 3));
            i = end + 3;
            continue;
        }
        if (line[i] !== '`') { plain += line[i++]; continue; }
        if (escaped(line, i)) { plain += line[i++]; continue; }
        let n = 0;
        while (line[i + n] === '`') { n++; }
        // a code span closes at the next run of EXACTLY n backticks
        let close = -1;
        for (let j = i + n; j < line.length;) {
            if (line[j] !== '`') { j++; continue; }
            let m = 0;
            while (line[j + m] === '`') { m++; }
            if (m === n) { close = j; break; }
            j += m;
        }
        if (close < 0) { plain += '`'.repeat(n); loose.add(n); i += n; continue; }
        keep(line.slice(i, close + n));
        i = close + n;
    }
    pieces.push({ code: false, text: plain });
    return { pieces, loose };
}

/** Wrap the open tags in one line's prose pieces. */
function wrapLine(line: string, st: { inComment: boolean }): { text: string; wrapped: number } {
    const { pieces, loose } = cut(line, st);
    // Every tag in the line's prose, in order, so a pair can be found across pieces.
    const tags: { piece: number; at: number; len: number; close: boolean; name: string; bare: boolean }[] = [];
    pieces.forEach((p, n) => {
        if (p.code) { return; }
        for (const m of p.text.matchAll(TAG)) {
            const at = m.index ?? 0;
            const name = m[2].toLowerCase();
            const meant = escaped(p.text, at)
                || p.text.slice(Math.max(0, at - 2), at) === ']('
                || VOID.has(name);
            tags.push({ piece: n, at, len: m[0].length, close: m[1] === '/', name, bare: !meant });
        }
    });
    // A pair opened and closed on the same line is HTML somebody meant.
    const open: typeof tags = [];
    for (const t of tags) {
        if (!t.bare) { continue; }
        if (!t.close) { open.push(t); continue; }
        const k = open.map(o => o.name).lastIndexOf(t.name);
        if (k >= 0) { open[k].bare = false; t.bare = false; open.splice(k, 1); }
    }
    const wrap = tags.filter(t => t.bare);
    if (!wrap.length) { return { text: line, wrapped: 0 }; }
    // ‼️ The new span's fence must not be the length of a literal run on the
    // line, or that run would pair with it and leave the tag bare again.
    let k = 1;
    while (loose.has(k)) { k++; }
    const fence = '`'.repeat(k);
    const text = pieces.map((p, n) => {
        const mine = wrap.filter(t => t.piece === n).sort((a, b) => b.at - a.at);
        let s = p.text;
        for (const t of mine) { s = s.slice(0, t.at) + fence + s.slice(t.at, t.at + t.len) + fence + s.slice(t.at + t.len); }
        return s;
    }).join('');
    return { text, wrapped: wrap.length };
}

/** Sanitize one line of item text. Used by the write gate on every new or edited item. */
export function sanitizeBacklogTags(text: string): string {
    return sanitizeBacklogMarkdown(String(text ?? '')).text;
}

/**
 * Sanitize a whole document, leaving comments, fences and front matter alone.
 * `wrapped` counts the tags put in code — 0 means the text came back unchanged.
 */
export function sanitizeBacklogMarkdown(text: string): { text: string; wrapped: number } {
    const src = String(text ?? '');
    const eol = src.includes('\r\n') ? '\r\n' : '\n';
    const lines = src.split(/\r?\n/);
    const st = { inComment: false };
    let wrapped = 0;
    let fence = '';
    let front = lines[0] === '---';
    const out = lines.map((line, n) => {
        if (front) {
            if (n > 0 && line === '---') { front = false; }
            return line;
        }
        if (fence) {
            if (line.trim().startsWith(fence)) { fence = ''; }
            return line;
        }
        const opens = /^\s*(`{3,}|~{3,})/.exec(line);
        if (!st.inComment && opens) { fence = opens[1]; return line; }
        const w = wrapLine(line, st);
        wrapped += w.wrapped;
        return w.text;
    });
    return wrapped ? { text: out.join(eol), wrapped } : { text: src, wrapped: 0 };
}
