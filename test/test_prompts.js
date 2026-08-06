// S-11: the saved prompts file — a markdown DOCUMENT read as a list of
// snippets. The rule is the user's: only what is inside a ``` fence is offered,
// everything around it is their own notes. What the parser adds is the LABEL,
// because a picker listing eight paragraphs of prose is a picker nobody reads.
'use strict';
const path = require('path');
const { parsePromptSnippets } = require(path.join(__dirname, '..', 'out/core/prompts.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const nl = lines => lines.join('\n');

// ---------------------------------------------------------------- the rule
{
    const r = parsePromptSnippets(nl([
        'These are my standing instructions. This paragraph is a note to myself',
        'and must never be offered as a prompt.',
        '',
        '## Review',
        '',
        'Kod incelemesi:',
        '```',
        'Read the flow before you change it.',
        'Then say how you will verify the change.',
        '```',
        '',
        'Another note that is not a prompt.',
        '',
        '```',
        'Answer in Turkish, code in English.',
        '```'
    ]));
    ok('only fenced blocks are snippets', r.items.length === 2);
    ok('‼️ the prose around them is never in the text',
        r.items.every(i => !i.text.includes('note to myself') && !i.text.includes('not a prompt')));
    ok('the body is verbatim, both lines of it',
        r.items[0].text === 'Read the flow before you change it.\nThen say how you will verify the change.');
    ok('the line above becomes the label, colon dropped', r.items[0].label === 'Kod incelemesi');
    ok('…and the heading becomes the group', r.items[0].group === 'Review');
    ok('a block with nothing above it is named by its own first line',
        r.items[1].label === 'Answer in Turkish, code in English.');
    ok('‼️ the heading is the group, never the label — ten blocks under one '
        + 'heading would otherwise be ten rows with the same name',
        r.items.every(i => i.label !== i.group) && r.items[1].group === 'Review');
    ok('the opening fence line is reported, 1-based', r.items[0].line === 7);
}

// ---------------------------------------------------------------- the label, in order
{
    const r = parsePromptSnippets(nl([
        '# Prompts',
        '```the info string wins',
        'body one',
        '```',
        '- a list bullet above the fence, **emphasised**',
        '```',
        'body two',
        '```',
        '```',
        'body three is its own label because nothing else said anything',
        '```'
    ]));
    ok('1. the fence info string is the label', r.items[0].label === 'the info string wins');
    ok('2. the line above it, stripped of markdown',
        r.items[1].label === 'a list bullet above the fence, emphasised');
    ok('3. failing both, the block\'s own first line',
        r.items[2].label === 'body three is its own label because nothing else said anything');
    ok('every item lands under the heading', r.items.every(i => i.group === 'Prompts'));
}

// ---------------------------------------------------------------- edge cases
{
    const r = parsePromptSnippets(nl([
        'A longer fence carries a ``` inside it, which must not close it early:',
        '````',
        'run ```bash and see',
        '````',
        '',
        '```',
        '',
        '   ',
        '```',
        '```',
        'tail block',
        '```'
    ]));
    ok('a longer fence survives a ``` in its body',
        r.items[0].text === 'run ```bash and see');
    ok('an empty block is counted, not offered', r.empty === 1 && r.items.length === 2);
    ok('…and the block after it is still read', r.items[1].text === 'tail block');
}

{
    ok('an empty file is an empty list, not a crash', parsePromptSnippets('').items.length === 0);
    ok('so is nothing at all', parsePromptSnippets(undefined).items.length === 0);
    // A fence somebody never closed takes the rest of the file, which is what a
    // markdown renderer does too — refusing it would lose the text silently.
    const open = parsePromptSnippets(nl(['```', 'never closed']));
    ok('an unclosed fence still yields its text', open.items.length === 1 && open.items[0].text === 'never closed');
}

{
    // CRLF: the file is edited in Obsidian on Windows.
    const r = parsePromptSnippets('## Bir\r\n\r\nEtiket\r\n```\r\nsatır bir\r\nsatır iki\r\n```\r\n');
    ok('CRLF is read the same way', r.items.length === 1 && r.items[0].text === 'satır bir\nsatır iki');
    ok('…and Turkish labels survive intact', r.items[0].label === 'Etiket' && r.items[0].group === 'Bir');
}

// ---------------------------------------------------------------- the label is never empty
{
    const r = parsePromptSnippets(nl(['```', '   indented body only', '```']));
    ok('a label is always something', !!r.items[0].label);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
