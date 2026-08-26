// M-28 — the surgical JSONC patch: one key written into a user's settings.json
// with their comments, indentation, key order and line endings left as bytes
// nobody rewrote. The whole point of this suite is the DIFF: a patcher that
// produces the right VALUE while reflowing the file has failed.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const JP = require(path.join(__dirname, '..', 'out', 'core', 'jsoncPatch.js'));
const SO = require(path.join(__dirname, '..', 'out', 'core', 'settingsops.js'));
const patch = JP.patchJsoncSetting;

/** What the running extension would read back out of the patched text. */
const readBack = (text, key) => SO.readFlatSetting(text, key);
/** Every comment in the file, in order — the thing a rewrite destroys. */
const comments = (t) => (SO.stripJsonc(t).length, t.match(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g) || []);
/** The lines the patch did NOT touch, so "only the value moved" is measurable. */
const changedLines = (a, b) => {
    const A = a.split(/\r?\n/), B = b.split(/\r?\n/);
    const out = [];
    for (let i = 0, j = 0; i < A.length || j < B.length;) {
        if (A[i] === B[j]) { i++; j++; continue; }
        if (B[j] !== undefined && A.indexOf(B[j], i) < 0) { out.push('+' + B[j]); j++; continue; }
        out.push('-' + A[i]); i++;
    }
    return out;
};

// A file that looks like somebody's real settings.json: comments they wrote,
// two-space indent, a URL with a `//` in it, a trailing comma.
const REAL = [
    '{',
    '    // Editor — I like it quiet',
    '    "editor.fontSize": 13,',
    '    "editor.minimap.enabled": false,',
    '',
    '    /* Agent Farm',
    '       the fleet lives here */',
    '    "agentFarm.livePort": 7717,',
    '    "agentFarm.budgetsUnlimited": false, // ‼️ the one VS Code drops',
    '    "agentFarm.docsUrl": "http://localhost:8080//docs",',
    '    "agentFarm.agentRoots": [',
    '        "D:\\\\zone\\\\agent\\\\ajanlar"',
    '    ],',
    '}',
    ''
].join('\n');

// ---------- the value changes and nothing else does ----------
{
    const r = patch(REAL, 'agentFarm.budgetsUnlimited', true);
    ok('a declared key is patched', r.ok && r.changed);
    ok('the new value reads back', readBack(r.text, 'agentFarm.budgetsUnlimited').value === true);
    ok('‼️ every comment survives verbatim',
        JSON.stringify(comments(r.text)) === JSON.stringify(comments(REAL)));
    ok('‼️ exactly one line differs', changedLines(REAL, r.text).length === 2);
    ok('the trailing comment on that very line stays put',
        /"agentFarm\.budgetsUnlimited": true, \/\/ ‼️ the one VS Code drops/.test(r.text));
    ok('the blank line survives', r.text.split('\n')[4] === '');
    ok('key order is untouched', r.text.indexOf('livePort') < r.text.indexOf('budgetsUnlimited'));
    ok('the file still parses', SO.readFlatSetting(r.text, 'editor.fontSize').value === 13);
    ok('a `//` inside a string is not a comment',
        readBack(r.text, 'agentFarm.docsUrl').value === 'http://localhost:8080//docs');

    const same = patch(r.text, 'agentFarm.budgetsUnlimited', true);
    ok('writing the value it already has changes nothing',
        same.ok && same.changed === false && same.text === r.text);
}

// ---------- a key that is not there yet ----------
{
    const r = patch(REAL, 'agentFarm.autoReportFolder', 'D:\\out');
    ok('a missing key is appended', r.ok && r.changed
        && readBack(r.text, 'agentFarm.autoReportFolder').value === 'D:\\out');
    ok('appending adds one line and nothing else', changedLines(REAL, r.text).length === 1);
    ok('it takes the file\'s own indent',
        /\n    "agentFarm\.autoReportFolder": "D:\\\\out"/.test(r.text));
    ok('the array before it kept its shape', /\[\n        "D:\\\\zone/.test(r.text));
}

// ---------- the comma is the trap ----------
{
    const withComment = '{\n  "a": 1 // mine\n}\n';
    const r = patch(withComment, 'b', 2);
    ok('‼️ the comma goes BEFORE a trailing comment, not inside it',
        r.ok && r.text === '{\n  "a": 1, // mine\n  "b": 2\n}\n');
    ok('and the file parses afterwards', readBack(r.text, 'a').value === 1 && readBack(r.text, 'b').value === 2);

    const block = '{\n  "a": 1 /* mine */\n}\n';
    const rb = patch(block, 'b', 2);
    ok('a block comment on the line is stepped over the same way',
        rb.ok && rb.text === '{\n  "a": 1, /* mine */\n  "b": 2\n}\n');

    const already = '{\n  "a": 1,\n}\n';
    const ra = patch(already, 'b', 2);
    ok('a trailing comma that is already there is not doubled',
        ra.ok && ra.text === '{\n  "a": 1,\n  "b": 2\n}\n');

    const empty = patch('{}\n', 'a', 1);
    ok('an empty object gets its first member', empty.ok && empty.text === '{\n    "a": 1\n}\n');

    const onlyComment = patch('{\n  // nothing yet\n}\n', 'a', 1);
    ok('an object holding only a comment keeps it',
        onlyComment.ok && readBack(onlyComment.text, 'a').value === 1
        && onlyComment.text.includes('// nothing yet'));

    for (const blank of ['', '   \n', '\n\n']) {
        const rf = patch(blank, 'agentFarm.livePort', 7717);
        ok('an empty file becomes a whole document',
            rf.ok && readBack(rf.text, 'agentFarm.livePort').value === 7717 && rf.text.startsWith('{'));
    }
}

// ---------- indentation, tabs and CRLF are the user's, not ours ----------
{
    const crlf = REAL.replace(/\n/g, '\r\n');
    const r = patch(crlf, 'agentFarm.newThing', [1, 2]);
    ok('CRLF stays CRLF', r.ok && !/[^\r]\n/.test(r.text));
    ok('and the value written into it is CRLF too',
        r.text.includes('"agentFarm.newThing": [\r\n        1,\r\n        2\r\n    ]'));

    const tabs = '{\n\t"a": 1\n}\n';
    const rt = patch(tabs, 'b', { x: 1 });
    ok('a tab-indented file is extended with tabs',
        rt.ok && rt.text === '{\n\t"a": 1,\n\t"b": {\n\t\t"x": 1\n\t}\n}\n');

    const wide = '{\n        "a": 1\n}\n';
    const rw = patch(wide, 'b', 2);
    ok('an eight-space file is extended with eight spaces',
        rw.ok && rw.text === '{\n        "a": 1,\n        "b": 2\n}\n');
}

// ---------- the nested spelling, and duplicates ----------
{
    const nested = '{\n  "agentFarm": {\n    // section style\n    "budgetsUnlimited": false\n  }\n}\n';
    const r = patch(nested, 'agentFarm.budgetsUnlimited', true);
    ok('the nested spelling is patched where it lives, not duplicated flat',
        r.ok && r.text === '{\n  "agentFarm": {\n    // section style\n    "budgetsUnlimited": true\n  }\n}\n');
    ok('and the reader agrees with the patcher',
        readBack(r.text, 'agentFarm.budgetsUnlimited').value === true);

    const dup = '{\n  "a": 1,\n  "a": 2\n}\n';
    const rd = patch(dup, 'a', 3);
    ok('‼️ a duplicated key is patched at the LAST spelling — the one in force',
        rd.ok && rd.text === '{\n  "a": 1,\n  "a": 3\n}\n' && readBack(rd.text, 'a').value === 3);
}

// ---------- reset means delete ----------
{
    const r = patch(REAL, 'agentFarm.livePort', undefined);
    ok('a reset removes the member', r.ok && r.changed
        && readBack(r.text, 'agentFarm.livePort').found === false);
    ok('the line goes with it and nothing else moves', changedLines(REAL, r.text).length === 1);
    ok('the comment block above it stays', r.text.includes('the fleet lives here */'));
    ok('the neighbours still read', readBack(r.text, 'agentFarm.docsUrl').found === true);

    const inline = patch('{ "a": 1, "b": 2 }', 'b', undefined);
    ok('deleting the last member takes the comma that held it',
        inline.ok && inline.text === '{ "a": 1 }');

    const lines = patch('{\n  "a": 1,\n  "b": 2\n}\n', 'b', undefined);
    ok('and on its own line the dangling comma goes too',
        lines.ok && lines.text === '{\n  "a": 1\n}\n');

    const gone = patch('{\n  "a": 1\n}\n', 'zzz', undefined);
    ok('resetting a key that was never there writes nothing',
        gone.ok && gone.changed === false && gone.text === '{\n  "a": 1\n}\n');

    const commented = patch('{\n  "a": 1,\n  // about b\n  "b": 2\n}\n', 'b', undefined);
    ok('a comment about the deleted key is somebody\'s sentence and survives',
        commented.ok && commented.text.includes('// about b')
        && readBack(commented.text, 'b').found === false
        && readBack(commented.text, 'a').value === 1);
}

// ---------- a file we do not understand is refused, never guessed at ----------
{
    for (const bad of [
        '{ "a": 1',                       // unterminated object
        '[1, 2]',                         // not an object
        '{ a: 1 }',                       // unquoted key
        "{ \"a\": 'x' }",                 // single-quoted value
        '{ "a": }',                       // no value
        '{ "a" 1 }',                      // no colon
        '{ "a": undefined }',             // not a JSON literal
        'not json at all'
    ]) {
        const r = patch(bad, 'k', 1);
        ok('‼️ refused rather than rewritten: ' + bad, r.ok === false && typeof r.error === 'string');
    }
    const r = patch('{ "a": 1 }', 'k', () => 1);
    ok('a value that is not JSON is refused', r.ok === false);
    ok('undefined is a delete, not a refusal', patch('{ "a": 1 }', 'a', undefined).ok === true);
}

// ---------- every setting this build declares survives a round trip ----------
{
    const props = require(path.join(__dirname, '..', 'package.json')).contributes.configuration.properties;
    const keys = Object.keys(props);
    let text = REAL, broke = '';
    for (const k of keys) {
        const v = props[k].type === 'boolean' ? true
            : props[k].type === 'number' || props[k].type === 'integer' ? 42
                : props[k].type === 'array' ? ['x']
                    : props[k].type === 'object' ? { x: 1 }
                        : props[k].enum ? props[k].enum[0] : 'v';
        const r = patch(text, k, v);
        if (!r.ok) { broke = broke || (k + ': ' + r.error); break; }
        text = r.text;
        const back = readBack(text, k);
        if (!back.found || JSON.stringify(back.value) !== JSON.stringify(v)) {
            broke = broke || (k + ': did not read back'); break;
        }
    }
    ok('‼️ all ' + keys.length + ' declared settings write and read back: ' + broke, broke === '');
    ok('and after ' + keys.length + ' patches the comments are still there',
        JSON.stringify(comments(text)) === JSON.stringify(comments(REAL)));
    let back = text;
    for (const k of keys) { const r = patch(back, k, undefined); if (r.ok) { back = r.text; } }
    ok('deleting them all again leaves the original keys readable',
        readBack(back, 'editor.fontSize').value === 13
        && readBack(back, 'agentFarm.docsUrl').value === 'http://localhost:8080//docs');
}

// ---------- the door is wired to it, and writes what the patcher produced ----------
{
    const door = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'settingsDoor.ts'), 'utf8');
    ok('the door exports the write fallback', /export function patchUserSetting\(/.test(door));
    ok('‼️ what reaches the disk is the PATCHER\'s text, not a re-serialised object',
        /fs\.writeFileSync\(file, patched\.text, 'utf8'\)/.test(door)
        && !/JSON\.stringify\((json|obj)/.test(door));
    ok('it writes the user scope, the last link in the chain',
        /scopes\[scopes\.length - 1\]\.file/.test(door));
    ok('it re-reads to prove the write, rather than claiming it',
        door.includes('does not read back'));
    ok('the cached text is dropped so this window sees the new value',
        /textCache\.delete\(file\)/.test(door));

    const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    const branch = ext.slice(ext.indexOf('not a registered configuration'));
    ok('‼️ the registry refusal now WRITES instead of handing over a line to paste',
        branch.indexOf('patchUserSetting(key, value)') > 0
        && branch.indexOf('patchUserSetting(key, value)') < branch.indexOf('add the line by hand'));
    ok('a value shadowed by a workspace file is reported, not claimed as applied',
        /shadowedBy/.test(branch.slice(0, 1200)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
