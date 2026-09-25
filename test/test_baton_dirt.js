// S-92 — A LEG IN AN AGENT FOLDER IS NOT DIRTY BECAUSE ITS ENGINE WROTE ITS OWN DUMP.
//
// Measured 2026-09-24 (chain chn_muevjx4n001kqd, leg 4): every leg that ended
// cleanly in D:\zone\agent\ajanlar\<agent> was rescued "it left uncommitted
// changes" — its own transcript under _run_folder_move had changed. What must
// hold: the engines' pool never counts; a line already there when the leg
// opened never counts; a new change of the leg's own always counts; and the
// folder is photographed at every door a leg opens through.
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'out', 'core');
const LF = require(path.join(OUT, 'batonLegFacts.js'));

const POOL = [
    ' M ../../_run_folder_move/claude/projects/D--zone-agent-ajanlar-developer/59b9cee1.jsonl',
    ' M ../../_run_folder_move/codex/state_5.sqlite',
    ' D ../../_run_folder_move/vscode/muvusoft.agent-farm/accounts/claude-x/sessions/290540.json',
    '?? "../../_run_folder_move/claude/projects/D--zone-agent-ajanlar-developer/n\\303\\266t.jsonl"'
].join('\n');

console.log('\n== what the leg itself left ==');
ok('the engines\' pool alone is clean — the measured chain', LF.newDirt(POOL, undefined) === '');
ok('…backslash paths too', LF.newDirt(' M ..\\..\\_run_folder_move\\codex\\goals_1.sqlite') === '');
ok('a real change of the leg\'s own counts', LF.newDirt(POOL + '\n M memory/MEMORY.md') === ' M memory/MEMORY.md');
ok('a line already there when the leg opened does not', LF.newDirt(' M notes.md\n?? new.md', ' M notes.md') === '?? new.md');
ok('…but the same file changed in a NEW way (now staged too) does', LF.newDirt('MM notes.md', ' M notes.md') === 'MM notes.md');
ok('CRLF output reads the same', LF.newDirt(' M a.md\r\n M b.md\r\n', ' M a.md\r\n') === ' M b.md');
ok('‼️ nothing read is still nothing — never a guess', LF.newDirt(undefined, ' M a.md') === undefined);
ok('a folder name that merely CONTAINS the word is not the pool', LF.newDirt(' M src/my_run_folder_move/x.ts') === ' M src/my_run_folder_move/x.ts');

console.log('\n== the folder photographed at the open ==');
(async () => {
    const b = { from: { cwd: 'D:\\agent' }, id: 'btn_1' };
    const m = await LF.markFolder(b, async () => 'abc1234', async () => ' M a.md');
    ok('head and dirt are both recorded', m.head === 'abc1234' && m.dirt === ' M a.md' && m.id === 'btn_1');
    const c = await LF.markFolder(b, async () => 'abc1234', async () => '');
    ok('a clean folder records no dirt', c.head === 'abc1234' && !('dirt' in c));
    const f = await LF.markFolder(b, async () => { throw new Error('no git'); }, async () => { throw new Error('no git'); });
    ok('a reader that fails records nothing and never throws', !('head' in f) && !('dirt' in f));
    ok('no readers → the baton unchanged', (await LF.markFolder(b)).id === 'btn_1');

    const src = (o) => Object.assign({
        card: () => undefined, row: () => undefined, guard: () => undefined, notePath: () => undefined,
        readNote: () => undefined, toolCalls: () => undefined, cwdOf: () => 'D:\\agent', gitStatus: async () => POOL
    }, o);
    const clean = await LF.legFactsFrom(src({}))('s1', 1);
    ok('‼️ a leg that left only the pool is not dirty — the chain can end as done', clean.dirty === '');
    const opened = await LF.legFactsFrom(src({ gitStatus: async () => ' M user-wip.md\n M mine.md', openDirt: () => ' M user-wip.md' }))('s1', 1);
    ok('the opener\'s dirt is subtracted', opened.dirty === ' M mine.md');
    const broken = await LF.legFactsFrom(src({ gitStatus: async () => ' M a.md', openDirt: () => { throw new Error('x'); } }))('s1', 1);
    ok('an opener that cannot be read subtracts nothing', broken.dirty === ' M a.md');

    const read = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
    ok('every door a leg opens through photographs the folder',
        /markFolder\(res\.baton, deps\.headOf, deps\.dirtOf\)/.test(read('core/batonBridge.ts'))
        && /markFolder\(r\.baton, deps\.headOf, deps\.dirtOf\)/.test(read('core/batonAttach.ts'))
        && /markFolder\(draft, this\.deps\.headOf, this\.deps\.dirtOf\)/.test(read('core/batonLegEnd.ts'))
        && /markStored\(this\.deps\.store, r\.baton, this\.deps\.headOf, this\.deps\.dirtOf\)/.test(read('core/batonRunner.ts'))
        && /dirtOf: deps\.dirtOf/.test(read('core/batonRunner.ts')));
    const ext = read('extension.ts');
    ok('the window hands the reader to the pass, the seal and the failsafe',
        /dirtOf: gitShortStatus,/.test(ext) && /dirtOf: gitShortStatus\n/.test(ext)
        && /openDirt: sid => openerOf\(batonStore\.all\(\), sid\)\?\.dirt/.test(ext));

    console.log(`\ntest_baton_dirt: ${pass} passed, ${fail} failed`);
    process.exitCode = fail ? 1 : 0;
})();
