// ‼️ RETROSPECTIVE AUDIT — THE GATE.
//
// A rule that fails silently is not a rule. The audit ledger only means
// something if a verdict cannot be written without the evidence that earns it,
// and if an agent cannot close its own repair. This reads the ledger and
// refuses both.
//
// Row grammar — ONE line, like a backlog item:
//
//   - [ ] A-01.3 ❌ short claim · kanıt: media/queue.js:412 · @dbbbd9e7
//   - [ ] A-01.3 🔁 short claim · kanıt: test/test_queue.js:33 · fix@dbbbd9e7
//   - [x] A-01.3 ✅ short claim · kanıt: test/test_queue.js:33 · @9f21ab00 · fix@dbbbd9e7
//
//   ⬜ bakılmadı · ✅ doğrulandı · ⚠️ eksik · ❌ bozuk · ⛔ regresyon
//   🔁 düzeltildi, doğrulanmayı bekliyor
//
// Rules enforced:
//   1. every row has an id, a verdict and belongs to its own block
//   2. ids are unique
//   3. any verdict other than ⬜ carries a non-empty `kanıt:`
//   4. a `kanıt:` of the form `path:line` must point at a file that exists and
//      is long enough — a citation nobody can follow is not evidence
//   5. ✅ and 🔁 carry a session stamp `@xxxxxxxx`
//   6. ✅ may not carry the same stamp as the `fix@` beside it — NOBODY CLOSES
//      THEIR OWN REPAIR. The next agent verifies it.
//   7. only ✅ may tick the checkbox
//
// Usage:
//   node tools/audit_lint.js              lint the ledger (exit 1 on error)
//   node tools/audit_lint.js --next       print the next unexamined row
//   node tools/audit_lint.js --stats      verdict counts per track
//   node tools/audit_lint.js --seed       append missing session blocks
//
// Companion: tools/audit_extract.js (the dossier) and _REF/audit.md.

const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');
const LEDGER = process.env.AF_AUDIT_LEDGER || path.join(
    'D:', 'zone', 'know', 'note', 'obsidian', '00_AGENT_AREA', '10_PROJECTS',
    'PRS.MuratVural_DEV_VSC.AgentFarm', '10_Notes', 'DENETİM - Sicil.md');

const VERDICTS = ['⬜', '✅', '⚠️', '❌', '⛔', '🔁'];
// The corpus this audit opened on. Widening it is a decision, not a default.
const CORPUS = 'OTOMATİK PRO HESAP DEĞİŞTİRME';

// ------------------------------------------------------------------ parsing
// A block header:  ### A-01 · `dbbbd9e7` · title · 2026-09-07
// A row:           - [ ] A-01.3 ❌ text · kanıt: x · @sid · fix@sid
const RE_BLOCK = /^###\s+([AB]-\d{2})\s+·\s+(.*)$/;
const RE_ROW = /^-\s+\[( |x)\]\s+([AB]-\d{2}\.\d+)\s+(\S+)\s*(.*)$/u;

function parse(text) {
    const blocks = [];
    let cur = null;
    const lines = text.split('\n');
    let fenced = false;
    lines.forEach((line, i) => {
        // The legend shows example rows inside a fence. They are documentation,
        // not verdicts, and linting them would make the legend unwritable.
        if (/^\s*```/.test(line)) { fenced = !fenced; return; }
        if (fenced) return;
        const b = RE_BLOCK.exec(line);
        if (b) {
            cur = { id: b[1], head: b[2], line: i + 1, rows: [] };
            blocks.push(cur);
            return;
        }
        const r = RE_ROW.exec(line);
        if (!r) return;
        const [, tick, id, verdict, rest] = r;
        const kanit = /·\s*kanıt:\s*([^·]+)/u.exec(rest);
        const stamp = /(?:^|·|\s)@([0-9a-f]{8})\b/.exec(rest);
        const fix = /fix@([0-9a-f]{8})\b/.exec(rest);
        const row = {
            id, verdict, line: i + 1, ticked: tick === 'x',
            text: rest.split('·')[0].trim(),
            kanit: kanit ? kanit[1].trim() : null,
            stamp: stamp ? stamp[1] : null,
            fix: fix ? fix[1] : null,
            block: cur ? cur.id : null
        };
        if (cur) cur.rows.push(row); else blocks.push({ orphan: row });
    });
    return blocks;
}

// ------------------------------------------------------------------ linting
function citationOk(kanit) {
    // `path:line` inside the repo, or an absolute path, must resolve. Anything
    // else (a command, a PNG, a quoted output) is accepted as prose evidence
    // but must not be empty — rule 3 already covers that.
    const m = /^([^\s:][^\s]*?):(\d+)$/.exec(kanit);
    if (!m) return null;
    const p = path.isAbsolute(m[1]) ? m[1] : path.join(REPO, m[1]);
    if (!fs.existsSync(p)) return 'kanıt dosyası yok: ' + m[1];
    const n = fs.readFileSync(p, 'utf8').split('\n').length;
    if (Number(m[2]) > n) {
        return 'kanıt satırı dosyanın dışında: ' + kanit + ' (dosya ' + n + ' satır)';
    }
    return null;
}

function lint(blocks) {
    const errs = [];
    const seen = new Map();
    for (const b of blocks) {
        if (b.orphan) {
            errs.push([b.orphan.line, b.orphan.id
                + ' bir blok başlığının altında değil']);
            continue;
        }
        for (const r of b.rows) {
            const at = m => errs.push([r.line, r.id + ': ' + m]);
            if (!VERDICTS.includes(r.verdict)) {
                at('tanınmayan hüküm işareti "' + r.verdict + '" ('
                    + VERDICTS.join(' ') + ')');
                continue;
            }
            if (seen.has(r.id)) at('id tekrar ediyor (ilk: satır ' + seen.get(r.id) + ')');
            else seen.set(r.id, r.line);
            if (!r.id.startsWith(b.id + '.')) at('id bloğuna ait değil (' + b.id + ')');
            if (!r.text) at('metni yok');

            if (r.verdict !== '⬜') {
                if (!r.kanit) at('KANITSIZ HÜKÜM — ' + r.verdict
                    + ' için `· kanıt: …` zorunlu');
                else {
                    const bad = citationOk(r.kanit);
                    if (bad) at(bad);
                }
            }
            if (r.verdict === '✅' || r.verdict === '🔁') {
                if (!r.stamp && r.verdict === '✅') at('✅ oturum damgası (@xxxxxxxx) taşımalı');
                if (r.verdict === '🔁' && !r.fix) at('🔁 `fix@xxxxxxxx` taşımalı');
            }
            if (r.verdict === '✅' && r.fix && r.stamp && r.fix === r.stamp) {
                at('KUVVETLER AYRILIĞI — kendi düzeltmesini kapatamaz '
                    + '(fix@' + r.fix + ' == @' + r.stamp + '); doğrulamayı sonraki ajan yapar');
            }
            if (r.ticked && r.verdict !== '✅') at('sadece ✅ kutusunu işaretleyebilir');
            if (!r.ticked && r.verdict === '✅') at('✅ satırının kutusu [x] olmalı');
        }
    }
    return errs;
}

// -------------------------------------------------------------------- views
function nextRow(blocks) {
    for (const b of blocks) {
        if (b.orphan) continue;
        for (const r of b.rows) {
            if (r.verdict === '⬜') return { b, r };
        }
    }
    // Nothing unexamined: the oldest repair waiting for an independent check.
    for (const b of blocks) {
        if (b.orphan) continue;
        for (const r of b.rows) {
            if (r.verdict === '🔁') return { b, r, waiting: true };
        }
    }
    return null;
}

function stats(blocks) {
    const per = { A: {}, B: {} };
    for (const b of blocks) {
        if (b.orphan) continue;
        const t = b.id[0];
        for (const r of b.rows) per[t][r.verdict] = (per[t][r.verdict] || 0) + 1;
    }
    return per;
}

// --------------------------------------------------------------------- seed
function seed() {
    const { loadIndex } = require('./audit_extract.js');
    const text = fs.readFileSync(LEDGER, 'utf8');
    const have = new Set();
    for (const m of text.matchAll(/`([0-9a-f]{8})`/g)) have.add(m[1]);
    const rows = [...loadIndex().values()]
        .filter(i => i.title && i.title.includes(CORPUS))
        .sort((a, b) => b.firstTs - a.firstTs)          // newest first
        .filter(i => !have.has(i.sessionId.slice(0, 8)));
    if (!rows.length) { console.log('sicil güncel — eklenecek oturum yok'); return; }
    const used = [...text.matchAll(/^###\s+A-(\d{2})\s/gm)].map(m => Number(m[1]));
    let n = used.length ? Math.max(...used) : 0;
    const out = rows.map(i => {
        n++;
        const id = 'A-' + String(n).padStart(2, '0');
        return '\n### ' + id + ' · `' + i.sessionId.slice(0, 8) + '` · '
            + i.title + ' · ' + new Date(i.firstTs).toISOString().slice(0, 10)
            + '\n\n- [ ] ' + id + '.0 ⬜ dosya çıkarılmadı — '
            + '`node tools/audit_extract.js ' + i.sessionId.slice(0, 8) + '`\n';
    }).join('');
    const anchor = '\n## İz B —';
    const at = text.indexOf(anchor);
    const next = at < 0
        ? text.trimEnd() + '\n' + out
        : text.slice(0, at) + out + text.slice(at);
    fs.writeFileSync(LEDGER, next, 'utf8');
    console.log(rows.length + ' oturum bloğu eklendi (' + LEDGER + ')');
}

// --------------------------------------------------------------------- main
function main() {
    const argv = process.argv.slice(2);
    if (argv[0] === '--seed') { seed(); return; }
    if (!fs.existsSync(LEDGER)) {
        console.error('sicil bulunamadı: ' + LEDGER);
        process.exit(1);
    }
    const blocks = parse(fs.readFileSync(LEDGER, 'utf8'));

    if (argv[0] === '--next') {
        const x = nextRow(blocks);
        if (!x) { console.log('sıra boş — her satır hükme bağlanmış'); return; }
        console.log((x.waiting ? 'DOĞRULAMA BEKLİYOR' : 'SIRADAKİ') + '\n');
        console.log('  blok : ' + x.b.id + ' · ' + x.b.head);
        console.log('  satır: ' + x.r.id + ' ' + x.r.verdict + ' ' + x.r.text);
        if (x.r.fix) console.log('  fix  : @' + x.r.fix + ' (bu damga ✅ veremez)');
        console.log('  yer  : ' + LEDGER + ':' + x.r.line);
        return;
    }
    if (argv[0] === '--stats') {
        const s = stats(blocks);
        for (const t of ['A', 'B']) {
            const e = Object.entries(s[t]);
            const total = e.reduce((a, [, n]) => a + n, 0);
            console.log('İz ' + t + ' — ' + total + ' satır: '
                + (e.map(([k, n]) => k + ' ' + n).join('  ') || '—'));
        }
        return;
    }

    const errs = lint(blocks);
    const rows = blocks.reduce((a, b) => a + (b.rows ? b.rows.length : 1), 0);
    if (!errs.length) {
        console.log('audit_lint: ' + rows + ' satır, ' + blocks.length
            + ' blok — temiz');
        return;
    }
    errs.sort((a, b) => a[0] - b[0]);
    for (const [line, msg] of errs) console.error(LEDGER + ':' + line + '  ' + msg);
    console.error('\naudit_lint: ' + errs.length + ' HATA');
    process.exit(1);
}

if (require.main === module) main();
module.exports = { parse, lint, nextRow, LEDGER };
