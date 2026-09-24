// X-357 (reopened) — "LAST TOUCHED" SEES AN EDIT.
//
// The user's words: an item edited on the Backlog page and saved did not move
// up in "last touched" — the extension did not even notice its own change.
// What must hold: an edit through a door (✎, ⛔, backlog.set/.hold) is recorded
// by that door; a line rewritten in Obsidian is found by the reconcile pass and
// dated by the file's last save; Agent Farm's own write is never mistaken for
// an outside edit; an edit moves the last touch and never the birth.
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'out', 'core');
const E = require(path.join(OUT, 'backlogEdits.js'));
const T = require(path.join(OUT, 'backlogTrack.js'));
const P = require(path.join(OUT, 'projectBacklog.js'));

const NOW = 1790000000000;
const SAVED = NOW - 60e3;
const doc = (...lines) => ['# Backlog', '', '## X', ...lines, ''].join('\n');
const items = (text) => P.parseBacklog(text).items;
const rec = (code, event, ts, o) => Object.assign({ code, event, ts, by: 'agent' }, o);

const V1 = doc('- [ ] X-1 Fix the sort #bug ⏫ [effort:: S]', '- [ ] X-2 Old undated line #ux');
const seen = T.snapshotBacklog(items(V1));

console.log('\n== the snapshot ==');
ok('it keeps the words AND the whole line of every code',
    seen.get('X-1') === 'Fix the sort' && seen.get(E.rawKey('X-1')) === '- [ ] X-1 Fix the sort #bug ⏫ [effort:: S]');

console.log('\n== an edit made outside ==');
const hist = [rec('X-1', 'opened', NOW - 86400e3)];
{
    const V2 = doc('- [ ] X-1 Fix the last-touched sort #bug ⏫ [effort:: S]', '- [ ] X-2 Old undated line #ux');
    const out = T.reconcileOutside(items(V2), hist, NOW, seen, SAVED);
    ok('reworded in Obsidian → one touch, by outside, dated by the file\'s save',
        out.length === 1 && out[0].code === 'X-1' && out[0].event === 'touch' && out[0].by === 'outside' && out[0].ts === SAVED
        && /reworded outside/.test(out[0].note));
    const V3 = doc('- [ ] X-1 Fix the sort #bug 🔺 [effort:: M]', '- [ ] X-2 Old undated line #ux');
    const o3 = T.reconcileOutside(items(V3), hist, NOW, seen, SAVED);
    ok('re-prioritised / re-sized with the same words → a touch too', o3.length === 1 && /tags, priority or fields/.test(o3[0].note));
    ok('nothing changed → nothing recorded', T.reconcileOutside(items(V1), hist, NOW, seen, SAVED).length === 0);
    ok('a record already as recent as the save → the door recorded it, nothing more',
        T.reconcileOutside(items(V2), hist.concat(rec('X-1', 'touch', SAVED + 5)), NOW, seen, SAVED).length === 0);
    ok('no save time → no guess', T.reconcileOutside(items(V2), hist, NOW, seen, undefined).length === 0);
    const V4 = doc('- [x] X-1 Fix the last-touched sort #bug ⏫ [effort:: S] ✅ 2026-09-20', '- [ ] X-2 Old undated line #ux');
    const o4 = T.reconcileOutside(items(V4), hist, NOW, seen, SAVED);
    ok('ticked AND reworded → the state change alone (it says more)', o4.length === 1 && o4[0].event === 'done');
    const oldSnap = new Map([['X-1', 'Fix the sort'], ['X-2', 'Old undated line']]);
    ok('a snapshot from before the line key → words still compared',
        T.reconcileOutside(items(V2), hist, NOW, oldSnap, SAVED).length === 1
        && T.reconcileOutside(items(V3), hist, NOW, oldSnap, SAVED).length === 0);
    const V5 = doc('- [ ] X-1 Fix the sort #bug ⏫ [effort:: S]', '- [ ] X-2 Old undated line, now reworded #ux');
    const o5 = T.reconcileOutside(items(V5), [], NOW, seen, SAVED);
    ok('an old line with no history, reworded → a touch (not a birth)', o5.length === 1 && o5[0].code === 'X-2' && o5[0].event === 'touch');
    const V6 = doc('- [ ] X-1 Fix the sort #bug ⏫ [effort:: S]', '- [ ] X-2 Old undated line #ux', '- [ ] X-9 Typed straight in #feat');
    const o6 = T.reconcileOutside(items(V6), [], NOW, seen, SAVED);
    ok('a new code is still a birth', o6.length === 1 && o6[0].code === 'X-9' && o6[0].event === 'opened');
}

console.log('\n== an edit moves the last touch, never the birth ==');
{
    const e = { code: 'X-1', event: 'touch', ts: SAVED, by: 'outside', uncertain: 'none', note: 'reworded outside Agent Farm' };
    const s = T.summarizeCode('X-1', hist.concat(e));
    ok('last touched is the edit; opened stays the opening', s.lastTs === SAVED && s.firstTs === NOW - 86400e3);
    const only = T.summarizeCode('X-2', [Object.assign({}, e, { code: 'X-2' })]);
    ok('an old line whose only record is an edit: touched, but never "opened today"', only.lastTs === SAVED && only.firstTs === 0);
    const noticedClose = { code: 'X-1', event: 'done', ts: NOW, by: 'outside', uncertain: 'none' };
    ok('a close that was only NOTICED still does not date (X-135)', T.summarizeCode('X-1', hist.concat(noticedClose)).lastTs === NOW - 86400e3);
}

console.log('\n== Agent Farm\'s own write is not an outside edit ==');
{
    const s = T.snapshotBacklog(items(V1));
    const mine = doc('- [ ] X-1 Fix the sort #bug ⏫ ⛔ [effort:: S]', '- [ ] X-2 Old undated line #ux');
    ok('the lines this write changed are adopted', E.adoptOwnWrite(s, V1, mine) === true);
    ok('…so the next pass finds nothing', T.reconcileOutside(items(mine), hist, NOW, s, SAVED).length === 0);
    ok('a write that changed no item line adopts nothing', E.adoptOwnWrite(s, mine, mine + '\n') === false);
    const s2 = T.snapshotBacklog(items(V1));
    const userEdited = doc('- [ ] X-1 Fix the sort #bug ⏫ [effort:: S]', '- [ ] X-2 Old undated line, the user rewrote it #ux');
    const thenOurs = doc('- [ ] X-1 Fix the sort #bug 🔺 [effort:: S]', '- [ ] X-2 Old undated line, the user rewrote it #ux');
    E.adoptOwnWrite(s2, userEdited, thenOurs);
    const o = T.reconcileOutside(items(thenOurs), hist, NOW, s2, SAVED);
    ok('‼️ a line the user changed a moment before our write is still found', o.length === 1 && o[0].code === 'X-2');
}

console.log('\n== the doors ==');
{
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('every write through editProjectDoc moves the baseline',
        /try \{ ownBacklogWrite\(folder, file, read\.text \?\? '', next\.text as string\); \}/.test(ext)
        && /if \(adoptOwnWrite\(seen, before, after\)\) \{ saveOutsideSeen\(\); \}/.test(ext));
    ok('the page\'s ✎ and ⛔ go through editItem, which records a touch',
        /backlogHold: \(id: string, target: BacklogTarget, on: boolean\) =>\s*editItem\(/.test(ext)
        && /backlogSet: \(id: string, target: BacklogTarget, fields: Record<string, unknown>\) =>\s*editItem\(/.test(ext)
        && /trackEdited\(id, \(projectStore\.get\(id\)\?\.folder \?\? ''\)\.trim\(\), after\.code \?\? before\.code, 'panel'/.test(ext));
    ok('backlog.set and backlog.hold record theirs',
        /if \(after && updated\.length\) \{ trackEdited\(project\.id, folder, after\.code, 'agent', `set \$\{updated\.join\(', '\)\}`\); \}/.test(ext)
        && /trackEdited\(project\.id, folder, after\.code, 'agent', on \? 'put on hold' : 'taken off hold'\)/.test(ext));
}

console.log(`\ntest_backlog_edits: ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
