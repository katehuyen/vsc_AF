'use strict';
const fs = require('fs');

const entry = [
'## 3.228.0 — M-19: a speaker knows who it is talking to, and the same turn cannot be bought twice (2026-08-22)',
'',
'**A speaker was never told who else was in the room, or which of them the turn was for.** `to` is the record\'s own field — empty means everyone, and one-to-many is the ordinary case here rather than a mode — and it reached the transcript, the row and the journal but never the speaker itself. A turn the lead addressed to one participant was written to the room, and the row reading `Ada → Rev, Cy` was describing an address nobody had been given. Neither fact is inferable from the exchange on a first turn, because there is no exchange yet. Every speaking prompt now names the cast (with the speaker marked, so it does not address itself) and names who this turn is for, saying plainly that the others read it too because the record is shared.',
'',
'**Ordering the identical turn again, with nothing said since, is now refused by name.** The planning-loop guard hashes agent + prompt, and a repeated speaking turn builds a *different* prompt — the second one carries a resumed lane\'s preamble and a record that has grown — so the strings never matched and a lead could re-order the same turn round after round, paying for each. What makes it a loop is a fact of the record rather than of the prompt, so it is refused where every other refusal already lives, naming the message that already is that turn and saying what to do instead. Once somebody else has spoken it is allowed again (the speaker now sees new words), and a retry after a **failed** turn was never a repeat at all — nothing was delivered.',
'',
'**And a turn that came back clean with nothing in it now fails its step, not only its message.** The message was correctly marked `failed` and given a classified failure, but the step stayed `done` — one event with two answers, and the wrong one was on the surface that matters: the round message is built from step status, so a lead whose speaker said nothing was shown a successful round and never offered **retry · revise · replan · skip · ask_user · partial**. It would then have planned its next turn on a discussion that did not happen, which is the exact failure M-19 exists to refuse.',
'',
''
].join('\n');

let s = fs.readFileSync('CHANGELOG.md', 'utf8');
if (s.indexOf('## 3.228.0') !== -1) { console.log('changelog already has 3.228.0'); }
else {
    s = s.replace('## 3.227.0 —', entry + '## 3.227.0 —');
    fs.writeFileSync('CHANGELOG.md', s, 'utf8');
}
let j = fs.readFileSync('package.json', 'utf8');
j = j.replace('"version": "3.227.0"', '"version": "3.228.0"');
fs.writeFileSync('package.json', j, 'utf8');
console.log('version now', JSON.parse(j).version);
