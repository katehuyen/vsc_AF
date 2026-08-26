/**
 * ‼️ M-28 — WRITING ONE KEY BACK INTO A JSONC FILE WITHOUT REWRITING IT.
 *
 * VS Code can refuse to write a key its own manifest declares (measured on
 * `agentFarm.budgetsUnlimited`), and the honest completion is for this build to
 * put the line in `settings.json` itself. What makes that safe or destructive
 * is the file format: `settings.json` is JSONC, so `JSON.parse` +
 * `JSON.stringify` would hand the file back stripped of every comment the user
 * wrote and reflowed to somebody else's indentation. Nobody asked for their
 * settings file to be tidied.
 *
 * So the patch is SURGICAL: the text is scanned for the one member's value span
 * and only those characters are replaced. Everything else — comments, blank
 * lines, key order, indent width, trailing commas, CRLF, a BOM — is bytes this
 * function never touches. The scanner accepts the same JSONC dialect
 * `stripJsonc` reads, and a file it cannot scan is REFUSED rather than guessed
 * at: a settings file we do not understand is the last file to write blind.
 *
 * `undefined` is a delete (that is what `settings.reset` means), and a key that
 * is not there yet is appended to the root object in the flat `a.b` spelling
 * VS Code itself writes.
 */

/** Whitespace and comments — everything between two meaningful characters. */
function skipTrivia(t: string, i: number): number {
    for (;;) {
        while (i < t.length && /\s/.test(t[i])) { i++; }
        if (t[i] === '/' && t[i + 1] === '/') {
            while (i < t.length && t[i] !== '\n') { i++; }
            continue;
        }
        if (t[i] === '/' && t[i + 1] === '*') {
            const e = t.indexOf('*/', i + 2);
            i = e < 0 ? t.length : e + 2;
            continue;
        }
        return i;
    }
}

/** Spaces and tabs only — a newline ends the member's own line. */
function skipInline(t: string, i: number): number {
    while (i < t.length && (t[i] === ' ' || t[i] === '\t')) { i++; }
    return i;
}

/** `i` is at the opening quote; returns the index after the closing one. */
function scanString(t: string, i: number): number {
    for (let j = i + 1; j < t.length; j++) {
        if (t[j] === '\\') { j++; continue; }
        if (t[j] === '"') { return j + 1; }
    }
    return -1;
}

interface JsoncMember { key: string; keyStart: number; valueStart: number; valueEnd: number }
interface JsoncObject { start: number; end: number; members: JsoncMember[] }

/** `i` is at `{`; `end` is the index of the matching `}`. */
function scanObject(t: string, i: number): JsoncObject | undefined {
    const start = i;
    const members: JsoncMember[] = [];
    i++;
    for (;;) {
        i = skipTrivia(t, i);
        if (i >= t.length) { return undefined; }
        if (t[i] === '}') { return { start, end: i, members }; }
        if (t[i] === ',') { i++; continue; }
        // An unquoted key is not a spelling VS Code writes, and guessing at one
        // is how a patcher corrupts a file it did not understand.
        if (t[i] !== '"') { return undefined; }
        const keyStart = i;
        const keyEnd = scanString(t, i);
        if (keyEnd < 0) { return undefined; }
        let key: string;
        try { key = JSON.parse(t.slice(keyStart, keyEnd)) as string; } catch { return undefined; }
        i = skipTrivia(t, keyEnd);
        if (t[i] !== ':') { return undefined; }
        const valueStart = skipTrivia(t, i + 1);
        const valueEnd = scanValue(t, valueStart);
        if (valueEnd < 0) { return undefined; }
        members.push({ key, keyStart, valueStart, valueEnd });
        i = valueEnd;
    }
}

/** `i` is at the first character of a value; returns the index after it. */
function scanValue(t: string, i: number): number {
    const c = t[i];
    if (c === '"') { return scanString(t, i); }
    if (c === '{') { const o = scanObject(t, i); return o ? o.end + 1 : -1; }
    if (c === '[') {
        let j = i + 1;
        for (;;) {
            j = skipTrivia(t, j);
            if (j >= t.length) { return -1; }
            if (t[j] === ']') { return j + 1; }
            if (t[j] === ',') { j++; continue; }
            const e = scanValue(t, j);
            if (e < 0) { return -1; }
            j = e;
        }
    }
    // A literal runs until the punctuation that can end it; anything that is
    // not a number, `true`, `false` or `null` fails the shape check and the
    // whole file is refused rather than half-understood.
    let j = i;
    while (j < t.length && !/[\s,}\]]/.test(t[j])
        && !(t[j] === '/' && (t[j + 1] === '/' || t[j + 1] === '*'))) { j++; }
    if (j === i) { return -1; }
    return /^(-?\d[\d.eE+-]*|true|false|null)$/.test(t.slice(i, j)) ? j : -1;
}

/** The root object of a JSONC document, or nothing if it is not one. */
function rootObject(t: string): JsoncObject | undefined {
    const i = skipTrivia(t, 0);
    return t[i] === '{' ? scanObject(t, i) : undefined;
}

/** Duplicate keys are legal JSONC and the LAST one is the value in force —
 *  patching the first would leave the file reading the way it did before. */
function lastMember(obj: JsoncObject, key: string): JsoncMember | undefined {
    for (let i = obj.members.length - 1; i >= 0; i--) {
        if (obj.members[i].key === key) { return obj.members[i]; }
    }
    return undefined;
}

/** The flat `a.b` member first, then the nested spelling `lookupSetting` also
 *  honours — a reader that accepts both must patch whichever one is there. */
function findMember(t: string, root: JsoncObject, key: string): JsoncMember | undefined {
    const flat = lastMember(root, key);
    if (flat) { return flat; }
    const parts = key.split('.');
    if (parts.length < 2) { return undefined; }
    let obj: JsoncObject | undefined = root;
    let hit: JsoncMember | undefined;
    for (const part of parts) {
        if (!obj) { return undefined; }
        hit = lastMember(obj, part);
        if (!hit) { return undefined; }
        obj = t[hit.valueStart] === '{' ? scanObject(t, hit.valueStart) : undefined;
    }
    return hit;
}

/** The leading whitespace of the line `at` sits on, when it owns that line. */
function lineIndent(t: string, at: number): string {
    const start = t.lastIndexOf('\n', at - 1) + 1;
    const lead = t.slice(start, at);
    return /^[ \t]*$/.test(lead) ? lead : '';
}

/** A value written the way the file around it is written: the document's own
 *  indent unit, its own line ending, nested under the member's own column. */
function render(value: unknown, indent: string, unit: string, eol: string): string {
    return JSON.stringify(value, null, unit).split('\n').join(eol + indent);
}

/** The member and the punctuation that was only there to hold it — including
 *  the whole line, when the member had a line to itself. A comment on that
 *  line is somebody's sentence about the setting, so it stays. */
function cutMember(text: string, m: JsoncMember): string {
    let cutEnd = m.valueEnd;
    const j = skipInline(text, cutEnd);
    const trailingComma = text[j] === ',';
    if (trailingComma) { cutEnd = j + 1; }
    let cutStart = m.keyStart;
    const lineStart = text.lastIndexOf('\n', m.keyStart - 1) + 1;
    const ownsLine = /^[ \t]*$/.test(text.slice(lineStart, m.keyStart));
    const e = skipInline(text, cutEnd);
    const afterEol = text[e] === '\n' ? e + 1
        : (text[e] === '\r' && text[e + 1] === '\n' ? e + 2 : -1);
    if (ownsLine && afterEol > 0) { cutStart = lineStart; cutEnd = afterEol; }
    let out = text.slice(0, cutStart) + text.slice(cutEnd);
    if (!trailingComma) {
        // Nothing follows any more to need the comma that preceded us. On one
        // line the space that separated them goes with it; across lines it is
        // the newline the next member still stands on, so it stays.
        let k = cutStart - 1;
        while (k >= 0 && /\s/.test(out[k])) { k--; }
        if (out[k] === ',') {
            out = /\n/.test(out.slice(k + 1, cutStart))
                ? out.slice(0, k) + out.slice(k + 1)
                : out.slice(0, k) + out.slice(cutStart);
        }
    }
    return out;
}

/**
 * One key, patched into a JSONC settings file. `undefined` deletes it. The
 * result is the same text with the smallest possible span replaced, or a
 * refusal naming what could not be understood. `changed` is false when the file
 * already said exactly this — a write nobody needs is a mtime nobody asked for.
 */
export function patchJsoncSetting(text: string, key: string, value: unknown):
    { ok: true; text: string; changed: boolean } | { ok: false; error: string } {
    if (value !== undefined && JSON.stringify(value) === undefined) {
        return { ok: false, error: 'the value is not JSON' };
    }
    const eol = /\r\n/.test(text) ? '\r\n' : '\n';

    if (text.trim() === '') {
        if (value === undefined) { return { ok: true, text, changed: false }; }
        return {
            ok: true, changed: true,
            text: '{' + eol + '    ' + JSON.stringify(key) + ': '
                + render(value, '    ', '    ', eol) + eol + '}' + eol
        };
    }

    const root = rootObject(text);
    if (!root) { return { ok: false, error: 'it is not a JSON object, or it has a syntax error' }; }

    // The file's own indent, taken from a member that already has one.
    const unit = root.members.map(m => lineIndent(text, m.keyStart)).find(s => s.length > 0) ?? '    ';
    const found = findMember(text, root, key);

    if (found) {
        if (value === undefined) { return { ok: true, changed: true, text: cutMember(text, found) }; }
        const body = render(value, lineIndent(text, found.keyStart) || unit, unit, eol);
        if (body === text.slice(found.valueStart, found.valueEnd)) { return { ok: true, text, changed: false }; }
        return {
            ok: true, changed: true,
            text: text.slice(0, found.valueStart) + body + text.slice(found.valueEnd)
        };
    }

    if (value === undefined) { return { ok: true, text, changed: false }; }
    const line = JSON.stringify(key) + ': ' + render(value, unit, unit, eol);
    const last = root.members[root.members.length - 1];
    if (!last) {
        // No member to hang a comma off — and none to lose either, so the only
        // thing between the braces that can matter is a comment.
        return {
            ok: true, changed: true,
            text: text.slice(0, root.start + 1) + eol + unit + line + eol + text.slice(root.start + 1)
        };
    }
    // A comment trailing the last member keeps its place: the comma goes before
    // it, the new line after it. Put them the other way round and the comma
    // lands INSIDE the comment and the file stops parsing.
    let at = skipInline(text, last.valueEnd);
    const comma = text[at] === ',';
    let insertAt = comma ? at + 1 : last.valueEnd;
    at = skipInline(text, comma ? at + 1 : at);
    if (text.startsWith('//', at)) {
        const nl = text.indexOf('\n', at);
        insertAt = nl < 0 ? text.length : (text[nl - 1] === '\r' ? nl - 1 : nl);
    } else if (text.startsWith('/*', at)) {
        const e = text.indexOf('*/', at);
        if (e >= 0) { insertAt = e + 2; }
    }
    let out = text.slice(0, insertAt) + eol + lineIndent(text, last.keyStart) + line + text.slice(insertAt);
    if (!comma) { out = out.slice(0, last.valueEnd) + ',' + out.slice(last.valueEnd); }
    return { ok: true, text: out, changed: true };
}
