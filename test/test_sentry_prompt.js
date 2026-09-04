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
    buildNextPrompt, modelNeeded, describeAssist, resolveSentryTemplates } = S;
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

console.log(`test_sentry_prompt: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
