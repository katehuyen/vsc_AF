// X-175 — THE PROMPT THE NEXT SESSION IS STARTED WITH.
//
// The diagnosis (X-174) says what a finished session left behind; this turns
// that, the next backlog item and the path of the handover note into the actual
// sentence the next session opens on. Two rules the item is emphatic about:
//
//   * A MODEL IS CALLED ONLY WHEN THE FACTS ARE UNCERTAIN. The diagnosis
//     already separates measured from unmeasured, so "uncertain" is not a
//     feeling here — it is `unknown` being non-empty, and that is what this
//     module reports. The call itself belongs to the runner (X-176); what is
//     testable is the DECISION, and it is tested here.
//   * ‼️ THE EXTENSION IS SELF-CONTAINED. The templates ship inside it and work
//     with nothing configured, on a machine with no vault, no Obsidian and no
//     folder of the user's anywhere. A file may REPLACE them — any file, on any
//     path the user names in settings — and if that file is gone the built-ins
//     carry on. Nothing is written to anybody's notes and nothing is expected
//     from them.
'use strict';
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const S = require(path.join(__dirname, '..', 'out', 'core', 'sentryPrompt.js'));
const { BUILT_IN_SENTRY_TEMPLATES, templatesFromFile, mergeTemplates, pickTemplate,
    buildNextPrompt, modelNeeded, describeAssist, resolveSentryTemplates,
    resolveInstructionPool, materialFor } = S;
const { diagnoseSession } = require(path.join(__dirname, '..', 'out', 'core', 'sessionDiagnosis.js'));

const SID = 'dc980395-1e2f-4a7b-9c33-8b21aa77c001';
const NOTE = '2026-09-04_devir_03_dc980395_x172-kapandi.md';
const next = { code: 'X-176', text: 'NÖBET: KAMPANYA KOŞUCUSU', effort: 'L' };

const facts = (over) => Object.assign({
    sessionId: SID, answerFiles: [], repos: [{ path: 'D:/repo', dirty: 0 }],
    codes: [{ code: 'X-175', closed: false }],
    progress: { assistantSteps: 12, toolCalls: 47 }, output: ''
}, over || {});

// ---- it works with NOTHING configured --------------------------------------
{
    ok('every verdict has a built-in answer, so the feature works out of the box',
        ['item-done', 'clean-handover', 'nothing-to-continue', 'hit-the-wall']
            .every(w => BUILT_IN_SENTRY_TEMPLATES.some(t => t.when === w)));
    ok('...and they really are built in, not a path to somewhere',
        BUILT_IN_SENTRY_TEMPLATES.every(t => t.source === 'built-in' && t.text.length > 30));
    ok('‼️ no personal, machine or vault path is baked into the templates',
        !/[A-Z]:\|obsidian|Users\|\/home\//i.test(JSON.stringify(BUILT_IN_SENTRY_TEMPLATES)));
}

// ---- the four verdicts each get their own words ----------------------------
{
    const d = diagnoseSession(facts({ codes: [{ code: 'X-174', closed: true }] }));
    const p = buildNextPrompt({ diagnosis: d, next, project: 'Agent Farm' });
    ok('a finished item hands over the next one, by code and by name',
        p.prompt.indexOf('X-176') >= 0 && p.prompt.indexOf('NÖBET: KAMPANYA KOŞUCUSU') >= 0);
    ok('...and the template that answered is named', p.when === 'item-done' && !!p.templateId);

    const handed = buildNextPrompt({
        diagnosis: diagnoseSession(facts({ answerFiles: [NOTE] })),
        next, handoverPath: 'C:/anywhere/the/user/keeps/notes/' + NOTE
    });
    ok('a handover sends the next session to the note, by its full path',
        handed.when === 'clean-handover'
        && handed.prompt.indexOf('C:/anywhere/the/user/keeps/notes/' + NOTE) >= 0);

    const wall = buildNextPrompt({
        diagnosis: diagnoseSession(facts({ output: 'usage limit reached' })), next
    });
    ok('the wall says what was measured rather than what is feared',
        wall.when === 'hit-the-wall' && /plan window/i.test(wall.prompt));

    ok('nothing left behind opens on the next item without a rescue',
        buildNextPrompt({
            diagnosis: diagnoseSession(facts({ progress: { assistantSteps: 0, toolCalls: 0 }, codes: [] })),
            next
        }).when === 'nothing-to-continue');
}

// ---- a file REPLACES a template, and adds cases without a release ----------
{
    const file = [
        '## hit-the-wall',
        '```',
        'Bak {session}: {why}',
        '```',
        '## made-up-verdict',
        '```',
        'nobody asked for this',
        '```',
        '## item-done',
        '```',
        '```'
    ].join('\n');
    const read = templatesFromFile(file);
    ok('a block under a verdict heading becomes that verdict\'s template',
        read.templates.some(t => t.when === 'hit-the-wall' && t.source === 'file'));
    ok('‼️ a heading naming no verdict is REFUSED BY NAME, not dropped in silence',
        read.refusals.some(r => /made-up-verdict/.test(r)));
    ok('...and so is an empty block, which would replace words with nothing',
        read.refusals.some(r => /item-done/.test(r)));

    const merged = mergeTemplates(BUILT_IN_SENTRY_TEMPLATES, read.templates);
    const p = buildNextPrompt({
        diagnosis: diagnoseSession(facts({ output: 'usage limit reached' })), next
    }, merged);
    ok('the user\'s words win over the built-in ones', p.source === 'file'
        && p.prompt.indexOf('Bak dc980395') === 0);
    ok('...and the verdicts they did not touch still answer',
        buildNextPrompt({ diagnosis: diagnoseSession(facts({ codes: [{ code: 'X-174', closed: true }] })), next },
            merged).source === 'built-in');
    ok('a file that is empty or missing changes nothing at all',
        mergeTemplates(BUILT_IN_SENTRY_TEMPLATES, []).length === BUILT_IN_SENTRY_TEMPLATES.length
        && templatesFromFile('').templates.length === 0);
}

// ---- the placeholders ------------------------------------------------------
{
    const one = [{ when: '*', id: 'test', source: 'file', text: 'A {nextCode} B {nope} C {project}' }];
    const p = buildNextPrompt({
        diagnosis: diagnoseSession(facts()), next, project: 'Agent Farm'
    }, one);
    ok('what is known is filled', p.prompt.indexOf('A X-176 B') === 0
        && p.prompt.indexOf('C Agent Farm') > 0);
    ok('‼️ a placeholder nothing answers is LEFT VISIBLE and reported, never blanked',
        p.prompt.indexOf('{nope}') > 0 && p.unfilled.indexOf('nope') >= 0);
    ok('the catch-all answers a verdict nobody wrote a template for',
        p.when === '*');
}

// ---- ‼️ when a model is worth calling, and only then -----------------------
{
    const sure = modelNeeded(diagnoseSession(facts()));
    ok('every fact measured means no model call at all', sure.needed === false
        && sure.questions.length === 0);

    const blind = modelNeeded(diagnoseSession({ sessionId: SID }));
    ok('facts that were never measured are the ONE reason to spend a turn',
        blind.needed === true && blind.questions.length > 0);
    ok('...and the questions are the unmeasured facts themselves, so the turn is cheap',
        blind.questions.some(q => /transcript|repo|handover/i.test(q)));
    ok('the reason is carried, because a spend with no stated cause is the bill this family exists about',
        /not measured|unknown|uncertain/i.test(blind.why));

    // The dirty-repo case the item names: no note, uncommitted work, and a
    // transcript nobody read. That is three unknowns, not a hunch.
    const murky = modelNeeded(diagnoseSession({
        sessionId: SID, answerFiles: [], repos: [{ path: 'D:/repo', dirty: 4 }]
    }));
    ok('the item\'s own example is the one that asks', murky.needed === true);

    ok('a prompt carries the decision with it', buildNextPrompt({
        diagnosis: diagnoseSession(facts()), next
    }).assist.needed === false);
}

// ---- what the call cost, in one shape ---------------------------------------
{
    ok('the record has a model, a duration and a price', describeAssist({
        model: 'claude-haiku-4-5-20251001', ms: 2400, costUsd: 0.0031, at: 1, ok: true
    }) === 'claude-haiku-4-5-20251001 · 2.4s · $0.0031');
    ok('...and no call is said plainly rather than as a zero', describeAssist() === 'no model was called');
}

// ---- ‼️ THE TEMPLATES REALLY COME FROM A FILE ------------------------------
//
// The item asks for templates that live as DATA, so a new case is a line rather
// than a release. The parser was only half of that: something has to settle
// WHICH file, read it, and fall back to the built-ins when there is none — on a
// machine where the user has configured nothing at all.
{
    const FILE = 'D:/anywhere/nobet-sablonlari.md';
    const body = [
        '## item-done', '', '```bitti', 'Bitti: {closed}. Sirada: {nextCode}.', '```', '',
        '## sucuk', '', '```x', 'never fires', '```'
    ].join('\n');

    const none = resolveSentryTemplates('', () => false, () => '');
    ok('with nothing configured the built-ins ARE the answer — no file needed anywhere',
        none.source === 'none' && none.file === '' && none.missing === ''
        && none.templates.length === BUILT_IN_SENTRY_TEMPLATES.length && !none.refusals.length);

    // ‼️ Same rule as the snippets file: a named path that has gone is REPORTED,
    // never cleared, and never read.
    const gone = resolveSentryTemplates(FILE, () => false, () => { throw new Error('must not read'); });
    ok('a named file that is gone is reported and the built-ins carry on',
        gone.missing === FILE && gone.source === 'none' && gone.file === ''
        && gone.templates.length === BUILT_IN_SENTRY_TEMPLATES.length);

    const set = resolveSentryTemplates(FILE, p => p === FILE, p => (p === FILE ? body : ''));
    ok('the file is read and ITS template wins for the verdict it answers',
        set.file === FILE && set.source === 'setting'
        && pickTemplate(set.templates, 'item-done').source === 'file');
    ok('...and every verdict it did not touch still has a built-in answer',
        ['clean-handover', 'nothing-to-continue', 'hit-the-wall']
            .every(w => pickTemplate(set.templates, w).source === 'built-in'));
    ok('a heading naming no verdict is refused BY NAME rather than dropped',
        set.refusals.some(r => /sucuk/.test(r)));
    ok('...and what the file DID answer is named, so "why did mine not fire" is answerable',
        set.covers.join() === 'item-done');
    ok('a new case is one block in that file, not a release',
        resolveSentryTemplates(FILE, () => true, () => '## hit-the-wall\n```benim\nbenim\n```')
            .templates[0].when === 'hit-the-wall');
}

// ---- what the cheap turn cost travels WITH the prompt -----------------------
//
// The item asks that WHICH model was called, how long it took and what it cost
// be recorded. The record had a shape and a sentence, but no way into the words
// the next session reads — so nothing carried it and nothing could show it.
{
    const d = diagnoseSession(facts({ answerFiles: undefined, repos: undefined }));
    const spent = { model: 'claude-haiku-4-5-20251001', ms: 2400, costUsd: 0.0031, at: 1, ok: true };
    const withCost = buildNextPrompt({ diagnosis: d, next, assist: spent });
    ok('the prompt can say what the model call cost',
        withCost.vars.assist === 'claude-haiku-4-5-20251001 · 2.4s · $0.0031');
    ok('...and one built without a call says so plainly rather than as a zero',
        buildNextPrompt({ diagnosis: d, next }).vars.assist === 'no model was called');
    ok('the verdicts that rest on UNMEASURED facts are the ones that carry it',
        BUILT_IN_SENTRY_TEMPLATES.filter(t => t.text.indexOf('{assist}') >= 0)
            .map(t => t.when).sort().join() === '*,hit-the-wall');
    const wall = buildNextPrompt({
        diagnosis: Object.assign({}, d, { outcome: 'hit-the-wall' }), next, assist: spent
    });
    ok('...and it lands in their words, filled rather than left as a placeholder',
        /2\.4s · \$0\.0031/.test(wall.prompt) && wall.unfilled.indexOf('assist') < 0);
}

// ---- X-192 — ONE POOL, TWO USES ---------------------------------------------
//
// The user's saved instructions were never a second file to invent: they are
// the SAME file read a second way. A block whose heading names a verdict is a
// template and fills mechanically; a block whose heading names anything else is
// no longer thrown away by name — it is the material the leader blends. And the
// pool is a LIST of paths, because one file was the defect the item names.
{
    const A = 'D:/anywhere/nobet-sablonlari.md';
    const B = 'D:/baska/tembihler.md';
    const a = [
        '## item-done', '', '```bitti', 'Bitti: {closed}. Sirada: {nextCode}.', '```', '',
        '## hit-the-wall', '', '```duvar', 'Duvara tosladi.', '```'
    ].join('\n');
    const b = [
        '## Genel tembihler', '', '```oturum kimligi', 'Oturum kimligini her zaman yaz.', '```', '',
        '## Sabaha karsi', '', '```sessiz', 'Saat 03:00 sonrasi kisa yaz.', '```'
    ].join('\n');
    const disk = { [A]: a, [B]: b };
    const pool = resolveInstructionPool([A, B], p => p in disk, p => disk[p]);

    ok('the pool is a LIST of files, read in the order it was given',
        pool.files.join() === [A, B].join());
    ok('every block in every file is material for the leader',
        pool.instructions.length === 4);
    ok('...and each one says which file it came from',
        pool.instructions.filter(x => x.file === B).length === 2);
    ok('a block under a verdict heading is BOTH a template and material',
        pickTemplate(pool.templates, 'item-done').source === 'file'
        && pool.instructions.some(x => x.when === 'item-done' && x.template));
    ok('a heading naming no verdict is still refused BY NAME as a template',
        pool.refusals.some(r => /Genel tembihler/.test(r)));
    ok('...but the block is KEPT as material rather than dropped — that is the item',
        pool.instructions.some(x => x.label === 'oturum kimligi' && !x.template
            && x.when === 'Genel tembihler'));
    ok('...and the refusal SAYS it was kept, so nobody reads a refusal as a loss',
        pool.refusals.some(r => /Genel tembihler/.test(r) && /material/i.test(r)));

    // The pool concatenates settings, so the single-file setting is easily in
    // the list twice. Twice named is read ONCE: a doubled instruction is a
    // doubled prompt on a model with a ceiling.
    const twice = resolveInstructionPool(
        [A, 'd:\\anywhere\\nobet-sablonlari.md'],
        p => p.toLowerCase().replace(/\\/g, '/') === A.toLowerCase(), () => a);
    ok('a file named twice is read once',
        twice.files.length === 1 && twice.instructions.length === 2);

    // Same rule as everywhere else in this file: reported, never cleared. The
    // gone one is named FIRST on purpose — a list that stops at the first
    // missing path passes a test where the missing path is last.
    const gone = resolveInstructionPool([B, A], p => p === A, p => (p === A ? a : ''));
    ok('a path in the list that is gone is reported and the REST of the pool still reads',
        gone.missing.join() === B && gone.files.join() === A && gone.instructions.length === 2);

    const none = resolveInstructionPool([], () => false, () => '');
    ok('with nothing listed the built-ins are still the whole answer and there is no material',
        none.templates.length === BUILT_IN_SENTRY_TEMPLATES.length
        && !none.instructions.length && !none.files.length && !none.missing.length);

    // ‼️ The leader runs on a cheap model with a ceiling; handing it all four
    // verdicts' words is noise it pays for. It gets the standing instructions
    // and the ONE block that answers the round that actually happened.
    const mat = materialFor(pool, 'hit-the-wall');
    ok('the leader gets the standing instructions plus the block for THIS verdict',
        mat.length === 3 && mat.some(x => x.when === 'hit-the-wall')
        && !mat.some(x => x.when === 'item-done'));
    const anyPool = resolveInstructionPool([A], p => p === A,
        () => '## *\n```her\nHer durumda kisa yaz.\n```');
    ok('...and a catch-all block answers every round, so it is always material',
        materialFor(anyPool, 'item-done').length === 1);

    // One implementation, two doors: the single-file setting still opens the
    // same way it did before the pool existed.
    const one = resolveSentryTemplates(A, p => p === A, () => a);
    ok('the single-file setting still behaves exactly as it did',
        one.source === 'setting' && one.file === A && !one.missing
        && one.covers.slice().sort().join() === 'hit-the-wall,item-done');
}

// ===========================================================================
// X-319 — A ROUND THAT TAKES AN ITEM IS TOLD WHAT THE ITEM SAYS
// ===========================================================================
//
// Measured in X-309's second drill (campaign `sc-mu403dqa`): five rounds in a
// row took P-1 and every one of them ended having done nothing, until the
// failure brake stopped the campaign. Of the five built-in templates only
// `item-done` and `nothing-to-continue` name the item; `hit-the-wall` and the
// `*` fallback hand the round the DIAGNOSIS of the previous session and nothing
// else. The round was taking real work off the backlog and was never told what
// it was — and a model given an instruction with a hole in it fills the hole:
// one decided the item "was already closed" without looking, another read the
// diagnosis as a file-naming problem and renamed a file in the vault.
{
    const NEXT = { code: 'P-1', text: 'write sentry_hello.md with one line', effort: 'XS' };
    const round = (outcome, rule) => S.buildNextPrompt({
        diagnosis: {
            session: 'aaaa1111', outcome, rule, why: 'the session left no trace',
            evidence: [], unknown: []
        },
        next: NEXT, project: 'TST', repos: []
    });

    // Every verdict, including the two that never named it and the catch-all.
    for (const [outcome, rule] of [
        ['hit-the-wall', 'wall-unfinished'], ['item-done', 'all-done'],
        ['nothing-to-continue', 'no-turn'], ['clean-handover', 'note'],
        ['something-nobody-named', 'unknown']
    ]) {
        const p = round(outcome, rule).prompt;
        ok(`‼️ X-319 — "${outcome}" names the item the round is on`,
            p.includes('P-1') && p.includes('write sentry_hello.md with one line'));
    }

    // ‼️ The template is the USER'S to write, so the guarantee cannot live in it.
    const mine = [{ when: '*', id: 'mine', source: 'file', text: 'Devam et. {why}' }];
    const own = S.buildNextPrompt({
        diagnosis: {
            session: 'aaaa1111', outcome: 'hit-the-wall', rule: 'wall-unfinished',
            why: 'nothing', evidence: [], unknown: []
        },
        next: NEXT, project: 'TST', repos: []
    }, mine).prompt;
    ok('‼️ X-319 — a block the USER wrote gets the item too, without having to remember it',
        own.includes('P-1') && own.includes('write sentry_hello.md with one line'));

    // A template that already says it is left exactly as it was.
    const twice = round('item-done', 'all-done').prompt;
    ok('…and a template that already names the code is not given it a second time',
        (twice.match(/P-1/g) || []).length === 1);

    // ‼️ `clean-handover` has a real trace to carry on from — naming the item
    // must not turn into "start it over".
    const carry = round('clean-handover', 'note').prompt;
    ok('‼️ X-319 — a clean handover names the item WITHOUT telling the round to restart it',
        carry.includes('P-1') && !/this is the work/.test(carry));
    ok('…while a round with nothing behind it is told plainly that the item IS the work',
        /this is the work/.test(round('hit-the-wall', 'wall-unfinished').prompt));

    // No item taken (an empty backlog is a WAIT) — nothing is invented.
    const none = S.buildNextPrompt({
        diagnosis: {
            session: 'aaaa1111', outcome: 'hit-the-wall', rule: 'wall-unfinished',
            why: 'nothing', evidence: [], unknown: []
        },
        project: 'TST', repos: []
    }).prompt;
    ok('a round that took no item is given no item line to read',
        !/THE ITEM THIS ROUND IS ON/.test(none));
}

console.log(`test_sentry_prompt: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
