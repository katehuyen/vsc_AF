// S-33 — OpenCode's history, read through the two commands it publishes.
//
// ‼️ EVERY FIXTURE BELOW IS A CAPTURE, taken 2026-08-15 from opencode 1.18.18 on
// this machine's own six conversations (`session list --format json`, `export`).
// Three of them contradict what A-16's table-parsing reader assumed, and each
// would have failed without an error:
//
//   * `session list` HAS a `--format json`, and it carries real epoch-ms
//     `created`/`updated`, `projectId` and `directory` — the drawn table gives a
//     local clock time with no date, which is why A-16 forbade deriving one;
//   * `Exporting session: ses_…` goes to STDERR, not stdout (A-16 recorded it
//     the other way round; the skip-to-`{` reader is right either way);
//   * the listing is cwd-SCOPED — six rows in the project, none one folder away.
//
// What is asserted is the part a regex over the source cannot see: that the
// export's per-message tokens are NOT cumulative, that `reasoning` is not inside
// `output`, that a tool's arguments and result live one level down in `state`,
// and that a message with no parts is still a message.
const path = require('path');
const H = require(path.join(__dirname, '..', 'out', 'core', 'opencodehistory.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const DIR = 'D:\\zone\\dev\\git\\miropharm\\vsc_AgentFarm';
const SES = 'ses_ffae93e06ffe3OOx0X42HLDzT2';

// ---------- `opencode session list --format json`, verbatim ----------
const LIST = JSON.stringify([
    {
        id: SES, title: 'NONCE değeri yazma',
        updated: 1786791781550, created: 1786791772666,
        projectId: '52088de5024b6df70ef5d4580dceb7ae22e324e3', directory: DIR
    },
    {
        id: 'ses_ffae75e03ffeBj6k710dZB0Bml', title: 'New session - 2026-08-15T11:04:55.548Z',
        updated: 1786791895548, created: 1786791895548,
        projectId: '52088de5024b6df70ef5d4580dceb7ae22e324e3', directory: DIR
    }
]);

{
    const rows = H.opencodeListJson(LIST);
    ok('the JSON listing is read', rows.length === 2 && rows[0].id === SES);
    ok('‼️ the times are the engine\'s own epoch ms, not a rendered clock',
        rows[0].updated === 1786791781550 && rows[0].created === 1786791772666);
    ok('…and the folder comes with them — that is what attributes the session',
        rows[0].directory === DIR);
    ok('an empty folder prints NOTHING at all (measured), which is no rows and no error',
        H.opencodeListJson('').length === 0);
    ok('…and so does a half-written document', H.opencodeListJson('[{"id":').length === 0);
    ok('a plugin\'s warning line above the JSON does not hide it',
        H.opencodeListJson('warn: plugin x skipped\n' + LIST).length === 2);
    ok('a session never spoken to reads `updated` from `created` rather than 0',
        H.opencodeListJson('[{"id":"ses_a","created":7}]')[0].updated === 7);
    ok('‼️ the export calls the same field `projectID` — both spellings are read',
        H.opencodeListJson('[{"id":"ses_a","projectID":"p"}]')[0].projectId === 'p');
    ok('a row with no id is not a row', H.opencodeListJson('[{"title":"x"}]').length === 0);
}

// ---------- one conversation, reached from two folders, is one conversation ----------
{
    const a = H.opencodeListJson(LIST);
    const b = [{ id: SES, title: 'NONCE değeri yazma', updated: 1786791999999, created: 1, projectId: '', directory: DIR }];
    const merged = H.opencodeMergeRows([a, b]);
    ok('‼️ the store is machine-wide, so two roots answer with the same ids — merged, not repeated',
        merged.length === 2);
    ok('…and the newest reading of a row wins',
        merged.find(r => r.id === SES).updated === 1786791999999);
    ok('the merge is newest-first, which is the order somebody looking for a session wants',
        merged[0].updated >= merged[1].updated);
}

// ---------- which conversations are worth spending a process on ----------
{
    const rows = H.opencodeListJson(LIST);
    const fresh = new Map([[SES, 1786791781550 + 5]]);   // written AFTER it last moved
    ok('‼️ an unchanged conversation is never exported twice',
        !H.opencodeExportsToRefresh(rows, fresh, 10).includes(SES));
    const stale = new Map([[SES, 1786791781550 - 5]]);   // it has moved since we read it
    ok('…and one that has moved since we read it is',
        H.opencodeExportsToRefresh(rows, stale, 10).includes(SES));
    ok('a conversation we have never read is always wanted',
        H.opencodeExportsToRefresh(rows, new Map(), 10).length === 2);
    const many = [];
    for (let i = 0; i < 50; i++) { many.push({ id: 'ses_x' + i, updated: i, created: i, title: '', projectId: '', directory: '' }); }
    const capped = H.opencodeExportsToRefresh(many, new Map(), 12);
    ok('‼️ a first run on a long history is capped — the rest come on the next pass',
        capped.length === 12);
    ok('…newest first, so the catching-up happens in the order a reader cares about',
        capped[0] === 'ses_x49');
    ok('exactly-equal stamps count as fresh (our write is never before the engine\'s update)',
        !H.opencodeExportsToRefresh(rows, new Map([[SES, 1786791781550]]), 10).includes(SES));
}

// ---------- `opencode export <id>` — the real two-turn document ----------
const EXPORT = {
    info: {
        id: SES, slug: 'shiny-planet', projectID: '52088de5024b6df70ef5d4580dceb7ae22e324e3',
        directory: DIR, path: '', title: 'NONCE değeri yazma', agent: 'build',
        model: { id: 'big-pickle', providerID: 'opencode' }, version: '1.18.18',
        summary: { additions: 0, deletions: 0, files: 0 }, cost: 0,
        // ‼️ the CONVERSATION's cumulative spend: 6196 + 36 = 6232 input
        tokens: { input: 6232, output: 26, reasoning: 63, cache: { read: 10112, write: 0 } },
        time: { created: 1786791772666, updated: 1786791781550 }
    },
    messages: [
        {
            info: {
                role: 'user', time: { created: 1786791772767 }, agent: 'build',
                model: { providerID: 'opencode', modelID: 'big-pickle' },
                id: 'msg_1', sessionID: SES
            },
            parts: [{ type: 'text', text: 'Sadece şunu yaz ve başka hiçbir şey yazma: NONCE=af-msu9oo6n', id: 'prt_1' }]
        },
        {
            info: {
                parentID: 'msg_1', role: 'assistant', mode: 'build', agent: 'build',
                cost: 0,
                tokens: { total: 8192, input: 6196, output: 13, reasoning: 63, cache: { write: 0, read: 1920 } },
                modelID: 'big-pickle', providerID: 'opencode',
                time: { created: 1786791772817, completed: 1786791778453 },
                finish: 'stop', id: 'msg_2', sessionID: SES
            },
            parts: [
                { type: 'step-start', snapshot: '4b825dc', id: 'prt_2' },
                { type: 'reasoning', text: 'The user says … I should just output that.', time: { start: 1786791777208, end: 1786791777601 }, id: 'prt_3' },
                { type: 'text', text: 'NONCE=af-msu9oo6n', time: { start: 1786791777606, end: 1786791777649 }, id: 'prt_4' },
                { type: 'step-finish', reason: 'stop', tokens: { total: 8192, input: 6196, output: 13, reasoning: 63, cache: { write: 0, read: 1920 } }, cost: 0, id: 'prt_5' }
            ]
        },
        {
            info: { role: 'user', time: { created: 1786791778567 }, agent: 'build', id: 'msg_3', sessionID: SES },
            parts: [{ type: 'text', text: 'Az önce yazdığın NONCE değerini tekrar yaz, başka hiçbir şey yazma.', id: 'prt_6' }]
        },
        {
            info: {
                parentID: 'msg_3', role: 'assistant', mode: 'build', agent: 'build', cost: 0,
                // ‼️ TURN 2's input is 36 against turn 1's 6196 — a running total
                // cannot go DOWN, which is what proves this is per-turn.
                tokens: { total: 8241, input: 36, output: 13, reasoning: 0, cache: { write: 0, read: 8192 } },
                modelID: 'big-pickle', providerID: 'opencode',
                time: { created: 1786791778599, completed: 1786791781540 },
                finish: 'stop', id: 'msg_4', sessionID: SES
            },
            parts: [
                { type: 'step-start', snapshot: '4b825dc', id: 'prt_7' },
                { type: 'text', text: 'NONCE=af-msu9oo6n', time: { start: 1786791780677, end: 1786791780752 }, id: 'prt_8' },
                { type: 'step-finish', reason: 'stop', tokens: { total: 8241, input: 36, output: 13, reasoning: 0, cache: { write: 0, read: 8192 } }, cost: 0, id: 'prt_9' }
            ]
        }
    ]
};

{
    const doc = H.opencodeExport(JSON.stringify(EXPORT));
    ok('the export document is read', !!doc && doc.id === SES);
    ok('the conversation\'s folder and project come with it',
        doc.directory === DIR && doc.projectId === '52088de5024b6df70ef5d4580dceb7ae22e324e3');
    ok('the model is the flat id, not the {id,providerID} object', doc.model === 'big-pickle');
    ok('both turns and both answers are there', doc.messages.length === 4);
    ok('‼️ `info.tokens` is the CONVERSATION\'s cumulative spend — 6196 + 36 = 6232',
        doc.tokens.input === 6232 && doc.tokens.cacheRead === 10112);
    ok('‼️ …and reasoning is NOT inside output: 6232 + 26 + 63 + 10112 = the engine\'s own total',
        doc.tokens.total === 6232 + 26 + 63 + 10112);
    const t1 = doc.messages[1].tokens, t2 = doc.messages[3].tokens;
    ok('‼️ per-message spend is per TURN, not cumulative — 36 after 6196 is the proof',
        t1.input === 6196 && t2.input === 36);
    ok('…and each turn\'s own total is the engine\'s: 6196+13+63+1920 = 8192',
        t1.total === 8192 && t1.input + t1.output + t1.reasoning + t1.cacheRead === 8192);
    ok('a turn that ended normally says so', doc.messages[1].finish === 'stop');
    const parts = doc.messages[1].parts;
    ok('the reasoning part keeps its TEXT — it is content, not a tally',
        parts.some(p => p.kind === 'reasoning' && /I should just output that/.test(p.text)));
    ok('…and its own start/end times', parts.find(p => p.kind === 'reasoning').ts === 1786791777208);
    ok('the step markers survive as themselves', parts.filter(p => p.kind.startsWith('step-')).length === 2);
    ok('…and step-finish carries what that model call cost',
        parts.find(p => p.kind === 'step-finish').tokens.total === 8192);
    ok('the banner a build might print above the JSON does not hide it',
        !!H.opencodeExport('Exporting session: ' + SES + '\n' + JSON.stringify(EXPORT)));
}

// ---------- the tool part: everything is one level down, in `state` ----------
{
    const TOOL = {
        info: { id: SES, title: 't', time: { created: 1, updated: 2 } },
        messages: [{
            info: { role: 'assistant', id: 'm', time: { created: 10 } },
            parts: [
                {
                    type: 'tool', tool: 'glob', callID: 'call-cd50',
                    state: {
                        status: 'completed',
                        input: { path: DIR, pattern: '**/package.json' },
                        output: DIR + '\\package.json',
                        metadata: { count: 1, truncated: false }, title: '',
                        time: { start: 1786791837741, end: 1786791837816 }
                    },
                    id: 'prt_t'
                },
                {
                    type: 'tool', tool: 'write', callID: 'call-bad',
                    state: { status: 'error', input: { filePath: 'x' }, error: 'permission denied' },
                    id: 'prt_e'
                },
                {
                    type: 'tool', tool: 'bash', callID: 'call-run',
                    state: { status: 'running', input: { command: 'npm test' } },
                    id: 'prt_r'
                }
            ]
        }]
    };
    const doc = H.opencodeExport(JSON.stringify(TOOL));
    const [good, bad, running] = doc.messages[0].parts;
    ok('‼️ the tool\'s NAME is on the part, its arguments and result one level down in `state`',
        good.tool === 'glob' && good.input.pattern === '**/package.json' && /package\.json$/.test(good.output));
    ok('…and the call id, so a result can be tied to its call', good.callId === 'call-cd50');
    ok('the tool\'s own start time wins over the part\'s', good.ts === 1786791837741);
    ok('‼️ a failed call is named by its STATUS, not by sniffing its text for "error"',
        bad.isError === true && bad.output === 'permission denied');
    ok('…and a tool whose output merely says "error" is not marked failed',
        H.opencodeExport(JSON.stringify({
            info: { id: SES, time: {} },
            messages: [{ info: { role: 'assistant', id: 'm', time: {} }, parts: [{ type: 'tool', tool: 'bash', state: { status: 'completed', output: 'error: none found' } }] }]
        })).messages[0].parts[0].isError === undefined);
    ok('a call still running when the export was taken keeps its status and has no output',
        running.status === 'running' && running.output === undefined);
}

// ---------- the shapes that would otherwise vanish ----------
{
    ok('‼️ a message with NO parts is still a message — measured on a cancelled turn',
        H.opencodeExport(JSON.stringify({
            info: { id: SES, time: {} },
            messages: [{ info: { role: 'assistant', id: 'm', time: { created: 5 } }, parts: [] }]
        })).messages.length === 1);
    const unknown = H.opencodeExport(JSON.stringify({
        info: { id: SES, time: {} },
        messages: [{ info: { role: 'assistant', id: 'm', time: {} }, parts: [{ type: 'patch', text: 'x' }] }]
    })).messages[0].parts[0];
    ok('a part type this build has never heard of arrives WITH ITS OWN NAME, not dropped',
        unknown.kind === 'other' && unknown.type === 'patch');
    ok('an empty text part is not a row', H.opencodeExport(JSON.stringify({
        info: { id: SES, time: {} },
        messages: [{ info: { role: 'user', id: 'm', time: {} }, parts: [{ type: 'text', text: '   ' }] }]
    })).messages[0].parts.length === 0);
    ok('a role that is neither user nor assistant is not conversation',
        H.opencodeExport(JSON.stringify({
            info: { id: SES, time: {} },
            messages: [{ info: { role: 'system', id: 'm', time: {} }, parts: [] }]
        })).messages.length === 0);
}

// ---------- it must identify itself, or it steals another reader's file ----------
{
    ok('nothing is not an export', H.opencodeExport('') === undefined);
    ok('a truncated document is not an export', H.opencodeExport('{"info":{"id":"ses_a"') === undefined);
    ok('‼️ a document with an `info` key but no `ses_` id is NOT stolen',
        H.opencodeExport(JSON.stringify({ info: { id: 'rollout-2026' }, messages: [] })) === undefined);
    ok('…nor is the Console\'s own snapshot, which also has messages[]',
        H.opencodeExport(JSON.stringify({ format: 'agent-farm-console-v1', engine: 'agy', sessionId: 'x', messages: [] })) === undefined);
}

// ---------- the placeholder title, and the empty conversation ----------
{
    const doc = H.opencodeExport(JSON.stringify(EXPORT));
    ok('a real title is kept as the engine wrote it',
        H.opencodeTitle(doc, t => 'DERIVED:' + t) === 'NONCE değeri yazma');
    const placeholder = H.opencodeExport(JSON.stringify({
        ...EXPORT, info: { ...EXPORT.info, title: 'New session - 2026-08-15T11:05:06.224Z' }
    }));
    ok('‼️ `New session - <ISO>` is a placeholder, not a name — the first prompt is used instead',
        H.opencodeTitle(placeholder, t => 'DERIVED:' + t).startsWith('DERIVED:Sadece'));
    const bare = H.opencodeExport(JSON.stringify({
        info: { id: SES, title: 'New session - 2026-08-15T11:04:55.548Z', time: {} }, messages: []
    }));
    ok('…and a conversation with no prompt at all keeps the placeholder rather than inventing one',
        H.opencodeTitle(bare, t => 'DERIVED:' + t) === 'New session - 2026-08-15T11:04:55.548Z');
    ok('‼️ three of six measured sessions were opened and never spoken to — they read as empty',
        H.opencodeSessionIsEmpty(bare) === true);
    ok('…and a real conversation does not', H.opencodeSessionIsEmpty(doc) === false);
    ok('a conversation that only ran tools is not empty either',
        H.opencodeSessionIsEmpty(H.opencodeExport(JSON.stringify({
            info: { id: SES, time: {} },
            messages: [{ info: { role: 'assistant', id: 'm', time: {} }, parts: [{ type: 'tool', tool: 'glob', state: { status: 'completed' } }] }]
        }))) === false);
}

// ---------- one writer at a time, and the honest limit of the answer ----------
{
    ok('no owner is no refusal', H.opencodeWriterRefusal(SES, undefined) === '');
    const console_ = H.opencodeWriterRefusal(SES, { kind: 'console', label: 'developer · big-pickle' });
    ok('a held conversation is refused BY NAME, pointing at what holds it',
        /Console card/.test(console_) && /developer · big-pickle/.test(console_) && console_.includes(SES));
    ok('…and the refusal offers the three real ways out rather than just saying no',
        /wait/.test(console_) && /fork/.test(console_));
    ok('a task holding it reads as a task, not as a card',
        /running task/.test(H.opencodeWriterRefusal(SES, { kind: 'task', label: 'nightly' })));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
