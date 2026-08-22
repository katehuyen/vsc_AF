// Guard: no mojibake in the shipped text files.
//
// package.json had been through 1-3 rounds of "UTF-8 bytes re-read as CP1252", which is
// what put the trailing garbage on command palette titles and sidebar tooltips. The damage
// is invisible in some of its forms (CP1252's undefined slots 0x81 0x8D 0x8F 0x90 0x9D come
// through as bare C1 controls), so the eye is not a reliable check and this test is.
//
//   node test/test_encoding.js          scan, exit 1 on any finding
//   node test/test_encoding.js --fix    repair in place, then scan
const fs = require('fs');
const path = require('path');

// CP1252 0x80-0x9F do not map to U+0080-U+009F; these are the characters they show as.
const CP1252_HIGH = {
  0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A,
  0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92,
  0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C,
  0x017E: 0x9E, 0x0178: 0x9F
};
const CONT = '\\u0080-\\u00BF' + Object.keys(CP1252_HIGH)
  .map(cp => '\\u' + Number(cp).toString(16).padStart(4, '0')).join('');
// A mangled run is a UTF-8 lead character followed by its continuation characters.
const RUN = new RegExp(`(?:[\\u00C2-\\u00F4][${CONT}]{1,3})+`, 'g');
// C1 controls have no business in source text at all, mangled or not.
const C1 = new RegExp('[' + String.fromCharCode(0x80) + '-' + String.fromCharCode(0x9F) + ']', 'g');
// ...and so do C0 controls. NUL is the one that actually happened: an editing tool
// wrote a literal U+0000 where a "\u0000" escape was meant, and it survived
// everything - tsc compiled it, the bundle shipped it, and grep quietly reclassified
// the whole source file as binary. Tab, newline and carriage return are the three
// that belong in text; every other C0 byte is damage.
const C0 = new RegExp('[' + String.fromCharCode(0x00) + '-' + String.fromCharCode(0x08)
  + String.fromCharCode(0x0B) + String.fromCharCode(0x0C)
  + String.fromCharCode(0x0E) + '-' + String.fromCharCode(0x1F) + ']', 'g');
// A LEADING byte-order mark is what a Windows shell leaves behind when it re-encodes a
// file it was only asked to redirect. It is worse than cosmetic in JSON: JSON.parse
// refuses it, so the file is unreadable to every tool that reads it as data rather than
// as text - and that is how a bridge dump taken with `> file` broke the repair pass.
// ONLY position 0 counts. A U+FEFF INSIDE a line is deliberate source in this repo:
// nine files write the character literally inside the regex that strips it off somebody
// else's input (`raw.replace(/^<bom>/, '')`) and inside fixtures that build BOM-prefixed
// content on purpose. Flagging those would make --fix delete the very code that handles
// the damage.
const BOM = /^\uFEFF/;
const decoder = new TextDecoder('utf-8', { fatal: true });

const ROOT = path.join(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'out', 'dist', '.vscode-test']);
const EXTS = new Set(['.json', '.ts', '.js', '.html', '.css', '.md']);

function decodeRun(run) {
  const bytes = [];
  for (const ch of run) {
    const cp = ch.codePointAt(0);
    if (cp <= 0xFF) bytes.push(cp);
    else if (CP1252_HIGH[cp] !== undefined) bytes.push(CP1252_HIGH[cp]);
    else return null;
  }
  try { return decoder.decode(Buffer.from(bytes)); } catch { return null; }
}

function repair(s) {
  let cur = s.replace(BOM, '');
  for (let i = 0; i < 6; i++) {
    const next = cur.replace(RUN, (m) => decodeRun(m) ?? m);
    if (next === cur) break;
    cur = next;
  }
  return cur;
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), out); }
    else if (EXTS.has(path.extname(e.name))) out.push(path.join(dir, e.name));
  }
  return out;
}

const fix = process.argv.includes('--fix');
const files = walk(ROOT);
let findings = 0, repaired = 0, skipped = 0;
let pass = 0, fail = 0;

for (const file of files) {
  let text = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');

  if (fix) {
    const next = repair(text);
    if (next !== text) {
      // Never write invalid JSON. This used to be a bare JSON.parse, which threw out of
      // the loop and abandoned EVERY REMAINING FILE unrepaired - one damaged file took
      // the whole repair run down with it, and the operator read the crash as "the fixer
      // is broken" rather than "this one file is". A refusal is about one file; say so
      // and carry on. The scan below still fails the build, so nothing is swept away.
      let writable = true;
      if (path.extname(file) === '.json') {
        try { JSON.parse(next); } catch (e) {
          console.log(`  SKIP ${rel}  repair would not parse as JSON: ${e.message}`);
          writable = false; skipped++;
        }
      }
      if (writable) {
        fs.writeFileSync(file, next, 'utf8');
        console.log(`fixed  ${rel}`);
        text = next; repaired++;
      }
    }
  }

  // A run only counts if it actually decodes back to valid UTF-8. Turkish text supplies
  // plenty of lead+continuation pairs by accident ("ac..." is c-cedilla + ellipsis) and
  // those are not damage - if it cannot be reversed, there is nothing to report.
  const runs = [...text.matchAll(RUN)].filter(m => decodeRun(m[0]) !== null);
  // BOM is anchored, so it carries no /g flag and cannot go through matchAll: it is one
  // position or none. Give it the shape matchAll yields so the report loop below stays a
  // single loop over a single kind of thing.
  const bom = BOM.test(text) ? [Object.assign(['\uFEFF'], { index: 0 })] : [];
  const ctrls = [...text.matchAll(C1), ...text.matchAll(C0), ...bom];
  if (!runs.length && !ctrls.length) { pass++; continue; }
  fail++;
  for (const m of [...runs, ...ctrls]) {
    const line = text.slice(0, m.index).split('\n').length;
    const codes = [...m[0]].map(c => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'));
    console.log(`  FAIL ${rel}:${line}  ${JSON.stringify(m[0])}  ${codes.join(' ')}`);
    findings++;
  }
}

if (fix) console.log(`${repaired} file(s) repaired${skipped ? `, ${skipped} skipped (repair would not parse)` : ''}.`);
if (findings) console.log(`${findings} finding(s) - repair with: node test/test_encoding.js --fix`);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
