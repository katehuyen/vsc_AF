// X-175 — `sentry.*` ON THE BRIDGE, dispatched rather than described.
//
// The handlers in extension.ts need vscode to reach the setting and fs to read
// the file, so what is measured here is the CONTRACT they are built out of: the
// same registry, the same arg helpers, the same pure cores, and the promises an
// agent calling these ops is entitled to —
//
//   · ‼️ A FACT THE CALLER DID NOT SEND IS UNMEASURED, never measured-and-empty.
//     That distinction is the whole of X-174: an op that turns "you told me
//     nothing" into "the folder was empty" manufactures a verdict out of its own
//     defaults, and the next session is started on it.
//   · ‼️ NOTHING IS CALLED AND NOTHING IS WRITTEN. These ops reason over facts
//     they are handed. They report whether a cheap turn is WORTH making; the
//     turn itself belongs to the runner (X-176), so asking twice costs nothing
//     and answers the same.
//   · the built-ins work with nothing configured — no file, no vault, no folder
//     of anybody's anywhere — and a file REPLACES only the verdicts it answers.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const OUT = path.join(__dirname, '..', 'out', 'core');
const { BridgeRegistry, argStr, optStr } = require(path.join(OUT, 'bridge.js'));
const { diagnoseSession } = require(path.join(OUT, 'sessionDiagnosis.js'));
const { resolveSentryTemplates, buildNextPrompt, SENTRY_VERDICTS } = require(path.join(OUT, 'sentryPrompt.js'));

const SID = '878ae65b-f73a-485b-ae05-df47cbbe6d1d';
const FILE = 'D:/anywhere/nobet-sablonlari.md';
const FILE_BODY = [
    '## item-done', '', '```benimki', 'BITTI: {closed}. Sirada {nextCode} var.', '```', '',
    '## kofte', '', '```x', 'never fires', '```'
].join('\n');

/** The ops, wired to an in-memory disk — the same shapes extension.ts uses. */
function registry(disk) {
    const reg = new BridgeRegistry();
    const files = disk || {};
    const setting = files.__setting || '';
    const exists = (p) => Object.prototype.hasOwnProperty.call(files, p);
    const read = (p) => String(files[p] || '');
    /** ‼️ undefined means NOBODY MEASURED IT. '' and [] are measurements. */
    const listed = (v) => (Array.isArray(v) ? v : undefined);
    const said = (v) => (typeof v === 'string' ? v : undefined);
    const counted = (v) => {
        if (v === undefined || v === null || v === '') { return undefined; }
        const n = Number(v);
        return Number.isFinite(n) ? n : undefined;
    };
    const set = (a) => resolveSentryTemplates(optStr(a, 'file') || setting, exists, read);

    reg.register([
        {
            op: 'sentry.templates',
            describe: 'Which words the next session would be started with, and where they come '
                + 'from. args: file? (read this one instead of the configured one)',
            handler: (a) => {
                const s = set(a);
                return {
                    file: s.file, source: s.source, missing: s.missing,
                    refusals: s.refusals, covers: s.covers, verdicts: SENTRY_VERDICTS,
                    templates: s.templates.map(t => ({ when: t.when, id: t.id, source: t.source, text: t.text }))
                };
            }
        },
        {
            op: 'sentry.prompt',
            describe: 'The sentence the next session opens on, from facts you measured. '
                + 'args: session, answerFiles?, repos?, codes?, progress?, output?, quotaPercent?, '
                + 'policy?, next?, handoverPath?, project?, assist?, file?',
            handler: (a) => {
                const sessionId = argStr(a, 'session');
                const repos = listed(a.repos);
                const diagnosis = diagnoseSession({
                    sessionId,
                    answerFiles: listed(a.answerFiles),
                    repos,
                    codes: listed(a.codes),
                    progress: a.progress || undefined,
                    output: said(a.output),
                    quotaPercent: counted(a.quotaPercent)
                }, a.policy || undefined);
                const s = set(a);
                const built = buildNextPrompt({
                    diagnosis,
                    next: a.next || undefined,
                    handoverPath: optStr(a, 'handoverPath'),
                    project: optStr(a, 'project'),
                    repos: (repos || []).map(r => String((r && r.path) || '')),
                    assist: a.assist || undefined
                }, s.templates);
                return Object.assign({ diagnosis }, built, {
                    templates: { file: s.file, source: s.source, missing: s.missing, refusals: s.refusals }
                });
            }
        }
    ]);
    return reg;
}

(async () => {
    // ---------- the catalog, which is how an agent finds these at all ----------
    {
        const cat = registry().catalog();
        const ops = cat.map(c => c.op);
        ok('both sentry ops are in farm.ops',
            ['sentry.templates', 'sentry.prompt'].every(o => ops.includes(o)));
        ok('...and each says what it does and what it takes',
            cat.filter(c => c.op.indexOf('sentry.') === 0)
                .every(c => c.describe.length > 20 && /args:/.test(c.describe)));
    }

    // ---------- it answers with NOTHING configured ----------
    {
        const r = await registry().dispatch('sentry.templates', {});
        ok('with no file named the built-ins are what is in force',
            r.ok && r.result.source === 'none' && r.result.file === '' && r.result.missing === '');
        ok('...and every verdict has words',
            SENTRY_VERDICTS.filter(v => v !== '*')
                .every(v => r.result.templates.some(t => t.when === v)));
        ok('...none of which is a path to anybody folders',
            r.result.templates.every(t => !/[A-Za-z]:[\\/]|obsidian|Users/i.test(t.text)));
    }

    // ---------- a session id is REQUIRED, and refused by name ----------
    {
        const r = await registry().dispatch('sentry.prompt', {});
        ok('a prompt with no session is refused, by the name of what is missing',
            !r.ok && /session/i.test(r.error));
    }

    // ---------- ‼️ what nobody measured is not a measurement ----------
    {
        const bare = await registry().dispatch('sentry.prompt', { session: SID });
        ok('a caller who sent only a session leaves the facts UNKNOWN',
            bare.ok && bare.result.diagnosis.unknown.length > 0);
        ok('...so the op says a cheap turn is worth making, and names what to ask',
            bare.result.assist.needed === true
            && bare.result.assist.questions.length === bare.result.diagnosis.unknown.length);
        ok('...and it still produces a prompt rather than refusing',
            typeof bare.result.prompt === 'string' && bare.result.prompt.length > 40);

        const told = await registry().dispatch('sentry.prompt', {
            session: SID, answerFiles: [], repos: [{ path: 'D:/repo', dirty: 0 }],
            codes: [{ code: 'X-175', closed: true }], output: '',
            progress: { assistantSteps: 40, toolCalls: 120 }
        });
        ok('a caller who measured everything gets a verdict with nothing left to ask',
            told.ok && told.result.diagnosis.unknown.length === 0
            && told.result.assist.needed === false);
        ok('...and an empty folder REALLY is evidence, not a shrug',
            told.result.diagnosis.evidence.length > 0);
    }

    // ---------- the words match the verdict, and the facts reach them ----------
    {
        const r = await registry().dispatch('sentry.prompt', {
            session: SID, answerFiles: [], output: '',
            repos: [{ path: 'D:/zone/dev/git/miropharm/vsc_AgentFarm', dirty: 0 }],
            codes: [{ code: 'X-175', closed: true }],
            progress: { assistantSteps: 40, toolCalls: 120 },
            next: { code: 'X-176', text: 'KAMPANYA KOSUCUSU', effort: 'L' },
            project: 'PRS.MuratVural_DEV_VSC.AgentFarm'
        });
        ok('the template picked is the one for the verdict reached',
            r.result.when === r.result.diagnosis.outcome || r.result.when === '*');
        ok('the next item reaches the words the session opens on',
            /X-176/.test(r.result.prompt) && /KAMPANYA KOSUCUSU/.test(r.result.prompt));
        ok('nothing is left as a placeholder', r.result.unfilled.length === 0);
        ok('‼️ the repositories are ONE argument, counted for the verdict and named in the words',
            r.result.vars.repos === 'D:/zone/dev/git/miropharm/vsc_AgentFarm');
    }

    // ---------- asking twice costs nothing and answers the same ----------
    {
        const args = { session: SID, answerFiles: [], repos: [], codes: [], output: '' };
        const a = await registry().dispatch('sentry.prompt', args);
        const b = await registry().dispatch('sentry.prompt', args);
        ok('the op is pure — the same facts answer the same, twice',
            a.result.prompt === b.result.prompt && a.result.templateId === b.result.templateId);
    }

    // ---------- a file replaces the words, and says what it could not ----------
    {
        const disk = { __setting: FILE };
        disk[FILE] = FILE_BODY;
        const t = await registry(disk).dispatch('sentry.templates', {});
        ok('a named file that is on disk is what is in force',
            t.result.source === 'setting' && t.result.file === FILE);
        ok('...and it is named as answering exactly the verdict it answered',
            t.result.covers.join() === 'item-done');
        ok('...while a heading naming no verdict is refused BY NAME',
            t.result.refusals.some(x => /kofte/.test(x)));

        const r = await registry(disk).dispatch('sentry.prompt', {
            session: SID, answerFiles: [], output: '',
            repos: [{ path: 'D:/repo', dirty: 0 }],
            codes: [{ code: 'X-175', closed: true }],
            progress: { assistantSteps: 40, toolCalls: 120 },
            next: { code: 'X-176', text: 'KOSUCU', effort: 'L' }
        });
        ok('the own words of the user are the ones the next session opens on',
            r.result.source === 'file' && /^BITTI:/.test(r.result.prompt));

        const missing = { __setting: FILE };
        const m = await registry(missing).dispatch('sentry.templates', {});
        ok('a named file that has gone is reported and the built-ins carry on',
            m.result.missing === FILE && m.result.source === 'none'
            && m.result.templates.every(x => x.source === 'built-in'));
    }

    // ---------- what the cheap turn cost travels with the prompt ----------
    {
        const r = await registry().dispatch('sentry.prompt', {
            session: SID,
            assist: { model: 'claude-haiku-4-5-20251001', ms: 2400, costUsd: 0.0031, at: 1, ok: true }
        });
        ok('the record of the call reaches the words, price and all',
            /claude-haiku-4-5-20251001 · 2\.4s · \$0\.0031/.test(r.result.prompt));
        ok('...and with no call it says so plainly rather than as a zero',
            /no model was called/.test(
                (await registry().dispatch('sentry.prompt', { session: SID })).result.prompt));
    }

    console.log(`test_sentry_bridge: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
