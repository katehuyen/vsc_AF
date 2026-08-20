// U-76: COPY WHAT THAT POINT SAID, WITHOUT OPENING THE TRANSCRIPT.
//
// The gesture that existed was: left-click a dot, the viewer opens on that
// exact moment, find the step's copy button, press it. Two clicks and a lost
// place for one line of text somebody wanted to paste into a message. The
// point's own right-click menu now does it in one.
//
// Two things this defends, and they are the two ways a shortcut goes wrong:
//   · it must copy the SAME thing the button it replaces copies — a second,
//     quieter answer to the same question is worse than no shortcut;
//   · it must copy the WHOLE thing. The chart's own event text is shortened and
//     has had its newlines flattened (`truncate`), so copying that would hand
//     over a clipped one-line prompt while looking like the real one.
'use strict';
const fs = require('fs');
const path = require('path');

const { stepWords, corpusAt } = require(path.resolve(__dirname, '../out/core/corpus.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// ---- the words of one step -------------------------------------------------
{
    ok('a tool step answers with its input, not its commentary',
        stepWords({ role: 'tool', tool: 'Bash', input: 'npm run package', text: 'ran a command' }) === 'npm run package');
    ok('everything else answers with its text',
        stepWords({ role: 'user', text: 'do the thing' }) === 'do the thing');
    ok('a step with nothing to say says nothing',
        stepWords({ role: 'toolResult' }) === '' && stepWords(undefined) === '');
    ok('‼️ newlines survive — that is half the point of reading the file',
        stepWords({ role: 'assistant', text: 'line one\n\nline two' }) === 'line one\n\nline two');
}

// ---- which step a moment on the chart stands for ---------------------------
{
    const msgs = [
        { role: 'user', ts: 1000, text: 'first prompt' },
        { role: 'toolResult', ts: 1500 },                       // real step, no words
        { role: 'tool', ts: 2000, tool: 'Read', input: 'src/core/live.ts' },
        { role: 'assistant', ts: 3000, text: 'done' }
    ];
    ok('the step at the moment that was pointed at',
        corpusAt(msgs, 2000).text === 'src/core/live.ts');
    ok('…and it says what it is', corpusAt(msgs, 2000).role === 'tool'
        && corpusAt(msgs, 2000).tool === 'Read');
    ok('a moment slightly off still finds its step, and says how far',
        corpusAt(msgs, 2400).text === 'src/core/live.ts' && corpusAt(msgs, 2400).offBy === 400);
    ok('‼️ a step with no words is never the answer — a copy that lands on one is silence',
        corpusAt(msgs, 1500).text === 'first prompt');
    ok('nothing to read is undefined rather than an empty copy',
        corpusAt([], 1) === undefined && corpusAt(undefined, 1) === undefined);
    ok('a transcript with only wordless steps answers nothing at all',
        corpusAt([{ role: 'toolResult', ts: 1 }], 1) === undefined);
}
{
    // Two steps the same distance away: the EARLIER one is the one whose event
    // fired the mark.
    const msgs = [
        { role: 'user', ts: 1000, text: 'earlier' },
        { role: 'assistant', ts: 3000, text: 'later' }
    ];
    ok('a tie goes to the earlier step', corpusAt(msgs, 2000).text === 'earlier');
}

// ---- the page half: a point carries what it stands for ---------------------
{
    const tl = fs.readFileSync(path.resolve(__dirname, '..', 'media', 'timeline.js'), 'utf8');
    ok('‼️ a point states the file and the instant it stands for',
        /afCorpus:\s*true/.test(tl) && /afCorpusFile/.test(tl) && /afCorpusTs/.test(tl));
    ok('…only when it HAS a transcript — a lane with no file offers no copy',
        /item && item\.file/.test(tl));
    ok('‼️ both kinds of point carry it: a dot and a tool bar',
        (tl.match(/laneCtx\([^)]*\{\s*file:/g) || []).length >= 2
        || (tl.match(/laneCtx\((?:[^()]|\([^()]*\))*item|laneCtx\([^;]*\{ file:/g) || []).length >= 2);
    // ‼️ AND THE TEXT ITSELF IS NOT IN THERE. A context attribute is HTML on
    // every dot on the page; a four-thousand-character prompt on each of them
    // is a page nobody can afford, and it would be the SHORTENED one anyway.
    ok('‼️ the words are not stuffed into every dot\'s attribute',
        !/afCorpusText/.test(tl) && !/afCorpus:\s*m\.detail/.test(tl));
}

// ---- the two copies must be one rule ---------------------------------------
{
    const viewer = fs.readFileSync(path.resolve(__dirname, '..', 'media', 'sessionViewer.js'), 'utf8');
    const core = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'core', 'corpus.ts'), 'utf8');
    const rule = /role === 'tool'\s*\?\s*m?\.?input\s*:\s*m?\.?text/;
    ok('‼️ the viewer\'s copy button and this one apply the SAME rule',
        rule.test(viewer.replace(/\s+/g, ' ')) && rule.test(core.replace(/\s+/g, ' ')));
}

// ---- the door and its bridge op --------------------------------------------
{
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'));
    const cmd = pkg.contributes.commands.find(c => c.command === 'agentfarm.copyCorpus');
    ok('the command exists and is named for what it does', !!cmd && cmd.title === 'Copy Corpus');
    const menu = (pkg.contributes.menus['webview/context'] || [])
        .find(m => m.command === 'agentfarm.copyCorpus');
    ok('‼️ it is on the timeline point\'s menu, and only where there is something to copy',
        !!menu && /afCorpus/.test(menu.when) && /afTimelineSession/.test(menu.when));
    ok('…first in the menu — it is what the pointer is on, not what the row is',
        !!menu && /^0_/.test(menu.group));

    const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'parity.manifest.json'), 'utf8'));
    const ent = manifest.entries.find(e => e.capability === 'copyCorpus');
    ok('‼️ and it reaches the bridge in the same commit (agentfarm-dev rule)',
        !!ent && (ent.ops || []).includes('timeline.corpus'));

    const ext = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    // Both doors call it; nobody re-parses a transcript of their own.
    ok('the op and the menu item go through one function, not two reads',
        (ext.match(/corpusFor\(/g) || []).length === 2 && /const corpusFor = /.test(ext));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
