// X-438 — a charter that lost one of its three binding sections is SAID, in the
// brief every session gets and in the project warning list (projects.health,
// the project page, the tree), instead of the brief silently printing nothing.
const path = require('path');
const fs = require('fs');
const os = require('os');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const out = (...p) => path.join(__dirname, '..', 'out', ...p);
const { charterGaps, charterGapSentence, CHARTER_REQUIRED } = require(out('core', 'charterGaps.js'));
const { charterWarning } = require(out('core', 'charterHealth.js'));
const { buildBrief, createSkeleton, parseCharterSections, scanRoles } = require(out('core', 'projectDocs.js'));

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'af-chartergaps-'));
let seq = 0;
const freshDir = () => { const d = path.join(tmpRoot, `d${++seq}`); fs.mkdirSync(d, { recursive: true }); return d; };
const P = (extra) => Object.assign(
    { id: 'prj_gap12345', name: 'Gap', status: 'active', createdAt: 1, updatedAt: 1 }, extra || {});
const charterDoc = (...body) => ['---', 'af-role: charter', '---', '', '# Charter', '', ...body, ''].join('\n');
const FULL = [
    '## Code Architecture', '- Entrypoint: src/main.ts', '',
    '## Verification Gate', '- npm test', '',
    '## Project Invariants', '1. Small files.'
];

// ---------- the verdict ----------
{
    ok('the three binding sections are read from one list',
        CHARTER_REQUIRED.map(r => r.heading).join('|') === 'Code Architecture|Verification Gate|Project Invariants');
    ok('a full charter has no gap', charterGaps(parseCharterSections(charterDoc(...FULL))).length === 0);

    const gone = charterGaps(parseCharterSections(charterDoc('## Code Architecture', '- x', '', '## Verification Gate', '- y')));
    ok('‼️ a deleted heading is MISSING', gone.length === 1 && gone[0].heading === 'Project Invariants' && gone[0].state === 'missing');

    const bare = charterGaps(parseCharterSections(charterDoc('## Code Architecture', '', '## Verification Gate', '- y', '', '## Project Invariants', '- z')));
    ok('‼️ a heading with nothing under it is EMPTY', bare.length === 1 && bare[0].state === 'empty' && bare[0].heading === 'Code Architecture');

    const note = charterGaps(parseCharterSections(charterDoc(...FULL.slice(0, 6), '## Project Invariants', '<!-- fill me -->')));
    ok('a section holding only an HTML comment is empty — a note is not a rule', note.length === 1 && note[0].state === 'empty');

    ok('Turkish headings count like English ones',
        charterGaps(parseCharterSections(charterDoc('## Mimari', '- a', '', '## Doğrulama', '- b', '', '## Yasalar', '- c'))).length === 0);

    ok('the sentence names each gap and its state',
        charterGapSentence(gone.concat(bare)) === 'charter: Project Invariants missing · Code Architecture empty — sessions are not told it');
    ok('no gap, no sentence', charterGapSentence([]) === undefined);
    ok('no charter file is its own sentence', /no charter file/.test(charterGapSentence([], false) || ''));
}

// ---------- the brief says it ----------
{
    const dir = freshDir();
    const p = P({ folder: dir });
    createSkeleton(dir, p);
    const skeletonBrief = buildBrief({ project: p, roles: scanRoles(dir) });
    ok('‼️ a fresh skeleton\'s brief names all three as empty',
        /## Charter gaps/.test(skeletonBrief)
        && /Code Architecture: empty · Verification Gate: empty · Project Invariants: empty/.test(skeletonBrief));
    ok('…and tells the session not to guess', /Do not guess them: ask the user/.test(skeletonBrief));

    fs.writeFileSync(scanRoles(dir).charter, charterDoc(...FULL));
    const full = buildBrief({ project: p, roles: scanRoles(dir) });
    ok('a filled charter prints no gap section', !/## Charter gaps/.test(full) && /## Project Invariants/.test(full));
    ok('the gap section sits before the writing-back protocol',
        skeletonBrief.indexOf('## Charter gaps') < skeletonBrief.indexOf('## Writing back'));

    const none = buildBrief({ project: P({ folder: freshDir() }), roles: {} });
    ok('a project with no charter file says so', /No charter file \(af-role: charter\)/.test(none));

    const mission = buildBrief({ project: p, roles: { ...scanRoles(dir) }, audience: 'mission' });
    ok('a mission brief of a full charter carries no gap either', !/## Charter gaps/.test(mission));
}

// ---------- the warning list, cached on the charter's mtime ----------
{
    const dir = freshDir();
    const p = P({ folder: dir });
    createSkeleton(dir, p);
    const t0 = Date.now();
    ok('a fresh skeleton warns', /Code Architecture empty/.test(charterWarning(dir, t0) || ''));

    const file = scanRoles(dir).charter;
    fs.writeFileSync(file, charterDoc(...FULL));
    const later = new Date(Date.now() + 5000);
    fs.utimesSync(file, later, later);
    ok('‼️ editing the charter clears the warning at once (the mtime moved)', charterWarning(dir, t0 + 1000) === undefined);

    fs.writeFileSync(file, charterDoc(...FULL.slice(0, 6)));
    const later2 = new Date(Date.now() + 9000);
    fs.utimesSync(file, later2, later2);
    ok('…and deleting a section brings it back', /Project Invariants missing/.test(charterWarning(dir, t0 + 2000) || ''));

    const empty = freshDir();
    ok('a folder with no charter warns', /no charter file/.test(charterWarning(empty, t0) || ''));
    fs.writeFileSync(path.join(empty, 'Charter.md'), charterDoc(...FULL));
    ok('…a charter written later is not seen inside the minute (cached)', /no charter file/.test(charterWarning(empty, t0 + 1000) || ''));
    ok('…and is seen once the minute is up', charterWarning(empty, t0 + 61_000) === undefined);
}

// ---------- wired into the one warning list ----------
{
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8').replace(/\r\n/g, '\n');
    const at = src.indexOf('const projectWarnings = (p: Project): string[] => {');
    const body = at >= 0 ? src.slice(at, src.indexOf('\n    };', at)) : '';
    ok('‼️ projectWarnings asks charterWarning — projects.health, the page and the tree read that list',
        /charterWarning\(p\.folder\)/.test(body));
    ok('…only for an open project whose folder is there', /state === 'ok'/.test(body) && /CLOSED_PROJECT_STATUSES/.test(body));
}

try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best effort */ }

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
