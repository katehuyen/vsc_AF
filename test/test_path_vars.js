// X-188 — A PATH THE USER CAN WRITE, RESOLVED BY A MODULE THAT REFUSES TO GUESS.
//
// The defect this exists to end is one line: `cevapDir()` fell back to
// `D:\zone\know\note\obsidian\…\01_CEVAPLAR`, one person's vault, compiled into
// an extension that is supposed to work on any machine. The user's own words
// were "hiç bugünün klasörüne göre program yazılır mı" — a program is written
// open-ended, elastic, adaptable.
//
// The rules this file pins are the ones that make such a setting SAFE to have:
//
//   * `${name}` is the syntax, because a path template is typed into a settings
//     box beside real paths and VS Code's own settings already speak it
//     (`${workspaceFolder}`, `${userHome}`). Prompt templates keep `{name}` —
//     two different subjects, and neither borrows the other's punctuation.
//   * ‼️ AN UNRESOLVED VARIABLE CANCELS THE PATH. It does NOT become an empty
//     string. `${vault}/01_CEVAPLAR` on a machine with no vault must skip that
//     source, not look in `/01_CEVAPLAR` and report "no handover note" about a
//     folder that was never the question. This is the same law X-174 states for
//     facts: not measured is not the same as measured empty.
//   * an UNKNOWN name and a KNOWN name with nothing behind it are both refusals,
//     and they are told apart in the reason, because one is a typo the user can
//     fix and the other is a machine that has no such thing.
//   * a resolved value is NOT re-expanded — a folder literally called
//     `${home}` cannot make this loop or reach anywhere else.
//   * the dictionary lives in ONE place and is exported, so a settings page can
//     draw the list rather than repeat it.
'use strict';
const path = require('path');
const {
    PATH_VARS, resolvePathVars, resolvePathList, previewPathList
} = require(path.resolve(__dirname, '../out/core/pathVars.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// 2026-09-05 12:34:56 local
const NOW = new Date(2026, 8, 5, 12, 34, 56).getTime();
const CTX = {
    home: 'C:/Users/rotam',
    temp: 'C:/Users/rotam/AppData/Local/Temp',
    workspace: 'D:/repo',
    repo: 'D:/repo',
    vault: 'D:/vault',
    project: 'Agent Farm',
    projectFolder: 'D:/vault/10_PROJECTS/Agent Farm',
    projectNotes: 'D:/vault/10_PROJECTS/Agent Farm/10_Notes',
    agentDir: 'D:/agents/developer',
    sessionId: '689569e7-94b4-45f9-bb60-4c0f33b2bb5a',
    now: NOW
};

// ---- the plain substitutions ----------------------------------------------
{
    const r = resolvePathVars('${vault}/00_OUTPUT/01_CEVAPLAR', CTX);
    ok('a known variable is replaced', r.ok && r.value === 'D:/vault/00_OUTPUT/01_CEVAPLAR');
    ok('…and nothing is reported missing', r.missing.length === 0);

    ok('several in one template', resolvePathVars('${home}/x/${project}', CTX).value
        === 'C:/Users/rotam/x/Agent Farm');
    ok('a template with no variables is itself',
        resolvePathVars('D:/plain/path', CTX).value === 'D:/plain/path');
    ok('an empty template resolves to empty and is still ok',
        resolvePathVars('', CTX).ok === true && resolvePathVars('', CTX).value === '');
}

// ---- VS Code's own names work too, because the user already knows them -----
{
    ok('${workspaceFolder} is the same thing as ${workspace}',
        resolvePathVars('${workspaceFolder}/a', CTX).value === 'D:/repo/a');
    ok('${userHome} is the same thing as ${home}',
        resolvePathVars('${userHome}/a', CTX).value === 'C:/Users/rotam/a');
}

// ---- the session id, whole and short --------------------------------------
{
    ok('${sessionId} is the whole id',
        resolvePathVars('${sessionId}.md', CTX).value === CTX.sessionId + '.md');
    ok('${sessionId8} is the eight characters a handover note is named by',
        resolvePathVars('devir_${sessionId8}.md', CTX).value === 'devir_689569e7.md');
}

// ---- dates -----------------------------------------------------------------
{
    ok('${today} is the local calendar day, zero padded',
        resolvePathVars('${today}', CTX).value === '2026-09-05');
    ok('${yesterday} is the day before it',
        resolvePathVars('${yesterday}', CTX).value === '2026-09-04');
    ok('${date:YYYY} and friends',
        resolvePathVars('${date:YYYY-MM}', CTX).value === '2026-09'
        && resolvePathVars('${date:YYMMDD}', CTX).value === '260905'
        && resolvePathVars('${date:HH-mm}', CTX).value === '12-34');
}

// ---- ‼️ a refusal is a refusal, never an empty string ----------------------
{
    const unknown = resolvePathVars('${nosuchthing}/x', CTX);
    ok('an UNKNOWN variable cancels the path', unknown.ok === false);
    ok('…and the path is not handed back half-built', unknown.value === '');
    ok('…and it is named', unknown.missing.includes('nosuchthing'));
    ok('…and the reason says it is not a variable at all',
        /not a variable/i.test(unknown.why));

    const absent = resolvePathVars('${vault}/x', { home: 'C:/h', now: NOW });
    ok('a KNOWN variable with nothing behind it cancels the path too', absent.ok === false);
    ok('…and says that this machine has no such thing, which is a different fault',
        /nothing/i.test(absent.why) && absent.missing.includes('vault'));

    const blank = resolvePathVars('${vault}/x', Object.assign({}, CTX, { vault: '   ' }));
    ok('whitespace is not a value either', blank.ok === false);

    ok('every missing name is collected, not just the first',
        resolvePathVars('${a}/${b}', CTX).missing.join(',') === 'a,b');
}

// ---- a resolved value is not re-expanded -----------------------------------
{
    const r = resolvePathVars('${home}/end', Object.assign({}, CTX, { home: 'C:/${vault}' }));
    ok('a value that looks like a variable is left alone', r.ok && r.value === 'C:/${vault}/end');
}

// ---- the list form: skip the ones that cannot be built, keep the rest ------
{
    const r = resolvePathList(['${vault}/a', '${nope}/b', 'D:/plain'], CTX);
    ok('a list keeps the paths it could build, in order',
        r.paths.join('|') === 'D:/vault/a|D:/plain');
    ok('…and says which it skipped and why, rather than dropping them silently',
        r.skipped.length === 1 && r.skipped[0].template === '${nope}/b'
        && /not a variable/i.test(r.skipped[0].why));
    ok('an empty entry is skipped as nothing, not as a fault',
        resolvePathList(['', '   ', 'D:/x'], CTX).paths.join('|') === 'D:/x');
}

// ---- the ROW-ALIGNED form: what a settings row shows beside itself ---------
//
// X-193 draws one row per entry and each row must say what THAT entry resolves
// to. `resolvePathList` cannot answer it: it returns the paths in one array and
// the skips in another, so a page pairing them back up has to re-derive which
// row was which — the guess this module exists to refuse. One entry in, one
// answer out, in the same order, including the empty ones.
{
    const r = previewPathList(['${vault}/a', '${nope}/b', '', 'D:/plain'], CTX);
    ok('one row in, one row out, in the same order — nothing is dropped',
        r.length === 4 && r.map(x => x.template).join('|') === '${vault}/a|${nope}/b||D:/plain');
    ok('a row that resolves carries the REAL path, so it costs no click to see',
        r[0].ok === true && r[0].path === 'D:/vault/a' && r[0].why === '');
    ok('a row that cannot resolve carries the REASON and no path at all',
        r[1].ok === false && r[1].path === '' && /not a variable/i.test(r[1].why));
    ok('an empty row is neither resolved nor a fault — it is an empty row',
        r[2].ok === false && r[2].path === '' && r[2].why === '');
    ok('a plain path is its own answer rather than a fault',
        r[3].ok === true && r[3].path === 'D:/plain');
    ok('nothing to preview is an empty list, not a thrown error',
        previewPathList(undefined, CTX).length === 0);
}

// ---- the dictionary is exported so a page can draw it ----------------------
{
    ok('the dictionary is a list of names with a sentence each',
        Array.isArray(PATH_VARS) && PATH_VARS.length >= 12
        && PATH_VARS.every(v => typeof v.name === 'string' && v.name
            && typeof v.describe === 'string' && v.describe.length > 10));
    ok('…and every name it advertises really resolves',
        PATH_VARS.filter(v => !/^date:/.test(v.name))
            .every(v => resolvePathVars('${' + v.name + '}', CTX).ok));
    ok('…with no duplicate names',
        new Set(PATH_VARS.map(v => v.name)).size === PATH_VARS.length);
}

// ---- and the three folders that used to END in one person's vault ---------
//
// The resolver on its own changes nothing; what closes the defect is that the
// callers go through it. The legacy absolute path stays — the user's own
// instruction was that today's folders may remain, but "en fazla olsa olsa …
// fallback olarak", nothing more — so what is pinned here is its POSITION: last,
// reached only when neither the setting nor the built-in template can be built.
{
    const fs = require('fs');
    const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    const props = pkg.contributes.configuration.properties || {};

    // ‼️ THE NEWLINE IS NOT PART OF THE CLAIM. `core.autocrlf` is true on this
    // machine, so a fresh clone hands every source file CRLF and `git stash`
    // flips one on the spot — this gate then reads `configuredFolder(\r\n`, fails
    // to match `configuredFolder(\n`, and reports that a resolver somebody never
    // touched has gone missing. It passed only because the files it reads
    // happened to be LF in one working tree. What is being counted is the CALL
    // ON ITS OWN LINE, which is what the argument list following it means.
    ok('there is ONE resolver the folder settings go through',
        /const configuredFolder = \(/.test(ext)
        && (ext.match(/configuredFolder\(\r?\n/g) || []).length === 4);
    ok('…and it asks the module, rather than expanding anything itself',
        /resolvePathVars\(candidate, ctx\)/.test(ext));
    ok('…and a template it could not build is SKIPPED, never half-used',
        /if \(r\.ok && r\.value\.trim\(\)\)/.test(ext));

    for (const [name, tpl] of [
        ['wikiRoot', '${vault}/00_WIKI'],
        ['reportDir', '${vault}/00_AGENT_AREA/00_OUTPUT/10_REPORT'],
        ['answerDir', '${vault}/00_AGENT_AREA/00_OUTPUT/01_CEVAPLAR']
    ]) {
        ok(`${name} has a machine-independent built-in ahead of the legacy path`,
            ext.indexOf(`'${name}', '${tpl}'`) >= 0);
    }
    // ‼️ X-189 tightened this rather than loosening it. The answers folder now
    // has TWO last-resort readers — `configuredFolder` and the `fallback`
    // handover source — so spelling it inline at both would have been a second
    // copy to drift. It is a named constant, and what is pinned is still its
    // POSITION: an argument somebody else falls back TO, never a `||` default
    // and never a value that decides anything on its own.
    ok('‼️ the legacy vault path is spelled in as few places as it has readers',
        // four spellings for four folders (M-51 added the content calendar's) — and
        // the answers one, which has two readers, is spelled ONCE as a named constant.
        (ext.match(/'D:', 'zone', 'know'/g) || []).length === 4
        && (ext.match(/const LEGACY_ANSWER_DIR = path\.join\(/g) || []).length === 1);
    ok('‼️ …and every road to it is a last-resort argument, never a default',
        !/\|\| path\.join\('D:', 'zone', 'know'/.test(ext)
        && !/\|\| LEGACY_ANSWER_DIR/.test(ext)
        && !/LEGACY_ANSWER_DIR \?\?/.test(ext)
        && /'\$\{vault\}\/00_AGENT_AREA\/00_OUTPUT\/01_CEVAPLAR', LEGACY_ANSWER_DIR\)/.test(ext));

    ok('${vault} has a setting behind it, so it need never be reached',
        !!props['agentFarm.vaultDir'] && props['agentFarm.vaultDir'].default === '');
    ok('…and the folder settings say the variables are allowed',
        /\$\{vault\}/.test(props['agentFarm.reportDir'].markdownDescription || '')
        && /\$\{vault\}/.test(props['agentFarm.answerDir'].markdownDescription || ''));
}

console.log(`test_path_vars: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
