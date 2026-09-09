// ‼️ THE RETROSPECTIVE AUDIT'S GATE IS ITSELF MEASURED.
//
// The audit ledger exists because "done" was self-declared and never
// re-checked. A gate that lives only in a script nobody runs would repeat the
// exact failure it was built to end, so this suite proves the gate REFUSES —
// on a fixture it builds itself — and then holds the real ledger against it.
//
// The two halves are deliberately different:
//   · the fixture half runs everywhere and pins the RULES;
//   · the real-ledger half runs only where the vault is mounted, because the
//     ledger is the user's document and lives in Obsidian, not in this repo.
const fs = require('fs');
const os = require('os');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { parse, lint, nextRow, LEDGER } =
    require(path.join(__dirname, '..', 'tools', 'audit_lint.js'));

const errsFor = (text) => lint(parse(text)).map(e => e[1]);
const has = (errs, needle) => errs.some(e => e.includes(needle));

// ---------- the gate refuses what it was built to refuse ----------
{
    const led = [
        '### A-01 · `deadbeef` · fixture · 2026-09-07',
        '',
        '- [x] A-01.1 ✅ kanıtsız hüküm',
        '- [ ] A-01.2 ❌ olmayan dosya · kanıt: src/bu-dosya-yok.ts:12',
        '- [x] A-01.3 ✅ kendi işini kapatıyor · kanıt: package.json:2 · @dbbbd9e7 · fix@dbbbd9e7',
        '- [ ] A-01.4 ✅ kutusu işaretsiz · kanıt: package.json:2 · @aaaaaaaa',
        '- [ ] A-01.1 ⬜ tekrar eden id',
        '- [ ] A-01.5 🔁 fix damgası yok · kanıt: package.json:2',
        '- [ ] A-02.1 ⬜ yanlış bloğun altında'
    ].join('\n');
    const errs = errsFor(led);

    ok('‼️ KANITSIZ HÜKÜM REDDEDİLİR — this is the whole rule; a verdict with no '
        + 'artefact behind it is the self-declared "done" all over again',
        has(errs, 'KANITSIZ HÜKÜM'));
    ok('…and a citation nobody can follow is not evidence either',
        has(errs, 'kanıt dosyası yok'));
    ok('‼️ KUVVETLER AYRILIĞI — nobody closes their own repair (fix@ == @)',
        has(errs, 'KUVVETLER AYRILIĞI'));
    ok('a ✅ carries the session that judged it', has(errs, 'oturum damgası'));
    ok('a 🔁 carries the session that repaired it', has(errs, 'fix@xxxxxxxx'));
    ok('the checkbox and the verdict cannot disagree', has(errs, 'kutusu [x] olmalı'));
    ok('an id is claimed once', has(errs, 'id tekrar ediyor'));
    ok('a row belongs to its own block', has(errs, 'bloğuna ait değil'));
}

// ---------- and it accepts a well-formed one ----------
{
    const led = [
        '### A-01 · `deadbeef` · fixture · 2026-09-07',
        '',
        '- [ ] A-01.1 ⬜ henüz bakılmadı',
        '- [ ] A-01.2 ❌ bozuk · kanıt: package.json:2 · @deadbeef',
        '- [ ] A-01.3 🔁 düzeltildi · kanıt: package.json:2 · fix@deadbeef',
        '- [x] A-01.4 ✅ doğrulandı · kanıt: package.json:2 · @cafe1234 · fix@deadbeef'
    ].join('\n');
    ok('a well-formed ledger passes clean', errsFor(led).length === 0);
}

// ---------- the legend is documentation, not verdicts ----------
{
    const led = [
        '## Satır dilbilgisi',
        '',
        '```',
        '- [x] A-01.3 ✅ örnek · kanıt: media/queue.js:412 · @dbbbd9e7 · fix@dbbbd9e7',
        '```',
        '',
        '### A-01 · `deadbeef` · fixture · 2026-09-07',
        '',
        '- [ ] A-01.1 ⬜ henüz bakılmadı'
    ].join('\n');
    ok('‼️ example rows inside a fence are the legend — linting them would make '
        + 'the legend unwritable, and an unwritable legend gets deleted',
        errsFor(led).length === 0);
}

// ---------- --next hands the baton over, in order ----------
{
    const led = [
        '### A-01 · `deadbeef` · fixture · 2026-09-07',
        '',
        '- [x] A-01.1 ✅ bitti · kanıt: package.json:2 · @cafe1234 · fix@deadbeef',
        '- [ ] A-01.2 🔁 doğrulanmayı bekliyor · kanıt: package.json:2 · fix@deadbeef',
        '- [ ] A-01.3 ⬜ sıradaki'
    ].join('\n');
    const n = nextRow(parse(led));
    ok('--next hands over the first UNEXAMINED row', n && n.r.id === 'A-01.3');

    const done = led.replace('- [ ] A-01.3 ⬜ sıradaki', '');
    const w = nextRow(parse(done));
    ok('‼️ …and when nothing is unexamined it hands over the repair WAITING for '
        + 'an independent check — otherwise 🔁 rows would silently become permanent',
        w && w.waiting && w.r.id === 'A-01.2');
}

// ---------- the real ledger, where the vault is mounted ----------
{
    if (!fs.existsSync(LEDGER)) {
        console.log('  skip — ledger not on this machine (' + LEDGER + ')');
    } else {
        const blocks = parse(fs.readFileSync(LEDGER, 'utf8'));
        const errs = lint(blocks);
        if (errs.length) errs.forEach(e => console.log('    ' + e[0] + ': ' + e[1]));
        ok('the real audit ledger is clean', errs.length === 0);
        const rows = blocks.reduce((a, b) => a + (b.rows ? b.rows.length : 0), 0);
        ok('…and it actually holds rows (an empty ledger measures nothing)', rows > 0);
    }
}

// ---------- one clock, or the evidence is worthless ----------
// ‼️ THE DOSSIER AND ITS COMMIT LIST ARE ON ONE CLOCK. The commits a dossier
// prints come from `git log --date=format:`, i.e. LOCAL time. The window above
// them used to be printed with `toISOString()`, i.e. UTC — on this machine a
// 7-hour skew, and a dossier that showed a 09:54→12:17 window over commits
// stamped 17:35 and 19:13 while calling them "in the window". Nobody noticed,
// because both numbers look like times, and the tool asserted the conclusion
// itself. No ledger row was ultimately argued off it — A-01.6 was checked and
// both of its numbers were local — but that was luck, so the rule is pinned
// here rather than left to the next reader's arithmetic.
{
    const X = require(path.join(__dirname, '..', 'tools', 'audit_extract.js'));
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'tools', 'audit_extract.js'), 'utf8');

    ok('the extractor exposes the clock it prints in', typeof X.localStamp === 'function');

    // the stamp must be the LOCAL rendering of the instant, not the UTC one —
    // measured against an instant whose two clocks differ by whole hours here.
    const ms = Date.parse('2026-09-04T12:13:37Z');
    const d = new Date(ms);
    const pad = n => String(n).padStart(2, '0');
    const local = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
        + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    ok('…and it renders an instant in local time, the clock git prints in',
        X.localStamp(ms) === local);
    if (d.getTimezoneOffset() !== 0) {
        ok('…so on a machine that is not UTC it DIFFERS from the ISO rendering '
            + '(the whole defect: the two used to sit side by side unlabelled)',
            X.localStamp(ms) !== new Date(ms).toISOString().slice(0, 16).replace('T', ' '));
    }

    // and the idiom that caused it may not come back anywhere in the file.
    ok('‼️ NO UTC STAMP IS PRINTED ANYWHERE IN THE DOSSIER — the ban is the rule, '
        + 'not a list of the two places it happened to be',
        !src.includes('toISOString().slice(0, 16)'));

    ok('…and the window says which clock it is in, so the next reader never guesses',
        src.includes("saat: ' + CLOCK"));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
