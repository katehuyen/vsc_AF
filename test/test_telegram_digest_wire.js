// U-114 — THE WIRE: who hears a card, what a tap does, and the two ops.
//
// The card and the taps are pure (test_telegram_digest.js). What is pinned
// here is that the extension really connects them: the host's change event
// runs the memo and sends to the audience the routing layer would route a
// reply from; a callback_query goes to the tap handler BEFORE the command
// parser; every tap is acknowledged; an option answers through the same
// `consoleHost.answer` the panel uses; and the working-tree summary the 📄
// button sends is measurable with an injected git.
'use strict';
const fs = require('fs');
const path = require('path');
const W = require(path.join(__dirname, '..', 'out', 'core', 'workdirChanges.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

// ---------- the working-tree summary ----------
(async () => {
    const git = (answers) => async (args) => {
        const key = args.join(' ');
        if (key in answers) { const a = answers[key]; if (a instanceof Error) { throw a; } return a; }
        return '';
    };
    let c = await W.changesSummary('D:/repo', git({
        'rev-parse --is-inside-work-tree': 'true\n',
        'status --short': ' M src/a.ts\n?? new.txt\n',
        'diff --stat': ' src/a.ts | 4 ++--\n 1 file changed\n',
        'diff --stat --cached': ''
    }));
    ok('status and unstaged stat, trimmed', c.status === ' M src/a.ts\n?? new.txt' && /1 file changed/.test(c.stat) && !c.note);
    ok('…as one message under the label', /^📄 developer\n M src\/a\.ts\n\?\? new\.txt\n\n src\/a\.ts/.test(W.changesText('developer', c)));
    c = await W.changesSummary('D:/repo', git({
        'rev-parse --is-inside-work-tree': 'true\n', 'diff --stat --cached': ' b.ts | 1 +\n'
    }));
    ok('a staged stat is labelled as staged', /^staged:\n b\.ts/.test(c.stat) && c.status === '');
    c = await W.changesSummary('D:/repo', git({ 'rev-parse --is-inside-work-tree': 'true\n' }));
    ok('clean tree says so', /Working tree clean/.test(W.changesText('x', c)));
    c = await W.changesSummary('D:/nowhere', git({ 'rev-parse --is-inside-work-tree': new Error('fatal: not a git repository') }));
    ok('not a repository is a sentence, not a throw', c.note === 'Not a git repository.' && /Not a git repository/.test(W.changesText('x', c)));
    c = await W.changesSummary('D:/x', git({ 'rev-parse --is-inside-work-tree': Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' }) }));
    ok('no git is its own sentence', c.note === 'git is not installed here.');
    c = await W.changesSummary('', git({}));
    ok('no working folder is its own sentence', /no working folder/.test(c.note));

    // ---------- the wire, read off the source ----------
    const ext = read('src', 'extension.ts');
    const chat = ext.slice(ext.indexOf('const chatStatusLine'), ext.indexOf('const applyChatBridge'));
    ok('the host\'s change event runs the memo and sends the card to the audience',
        /consoleHost\.onChange\(id => \{[\s\S]*?digestEvents\(chatDigestMemo, s\)[\s\S]*?chatAudience\(id, chatRoutable\(\)\.length\)[\s\S]*?chatSend\(chat, text, id, keyboard\)/.test(chat));
    ok('‼️ the memo runs even while the bridge is off, so switching it on announces nothing old',
        /chatDigestMemo = r\.memo;[\s\S]{0,300}if \(!r\.events\.length \|\| !poller\) \{ return; \}/.test(chat));
    ok('the audience is the routing layer read backwards: focus, or the only live one; never outside the allowlist',
        /c\.allow\.filter\(chat => c\.digest === 'all' \|\| focus\[String\(chat\)\] === sessionId \|\| liveCount === 1\)/.test(chat)
        && /if \(c\.digest === 'off' \|\| !c\.allow\.length\) \{ return \[\]; \}/.test(chat));
    ok('a tap goes to the tap handler before the command parser',
        /if \(msg\.callback\) \{ await chatTap\(msg, msg\.callback\); return; \}\s*\n\s*const \{ st, live \} = await chatPruned\(\);/.test(chat));
    ok('every tap is acknowledged — the phone spins until it is',
        (chat.match(/await ack\(/g) || []).length >= 10 && /answerCallbackQuery\(token, cb\.id, text\)/.test(chat));
    ok('an option answers through consoleHost.answer, the panel\'s own door, only when the question is still the one pending',
        /const a = tapAnswer\(s\.pendingAsk, tap\);\s*\n\s*if \('refused' in a\) \{ await ack\(a\.refused\); return; \}\s*\n\s*const ok = consoleHost\.answer\(tap\.id, \{ kind: 'answer', answers: a\.answers \}\)/.test(chat));
    ok('a permission is answered only while that request is open',
        /if \(!ask \|\| ask\.requestId\.slice\(0, 8\) !== tap\.rid\) \{ await ack\('That request is no longer open\.'\); return; \}/.test(chat));
    ok('Continue is a routed message with its own why (button)', /chatSay\(msg\.chatId, tap\.id, 'Continue\.', 'button'\)/.test(chat)
        && /'only-one' \| 'button'/.test(read('src', 'core', 'telegramRouting.ts')));
    ok('Cancel is consoleHost.interrupt, the same act as console.interrupt', /case 'cancel': \{\s*\n\s*const ok = consoleHost\.interrupt\(tap\.id\);/.test(chat));
    ok('Diff is the working-tree summary of the session\'s own cwd', /changesText\(label, await changesSummary\(s\.cwd\)\)/.test(chat));
    ok('the card is sent with its keyboard through chatSend, remembered against the session',
        /const chatSend = async \(chatId: number, text: string, forSession\?: string, keyboard\?: DigestKeyboard\)/.test(ext)
        && /sendMessage\(token, chatId, clipForChat\(text\), threadId, undefined, keyboard\)/.test(ext));

    // ---------- the ops ----------
    ok('telegram.digest is on the bridge, read-only, naming the audience and the mode',
        /op: 'telegram\.digest'/.test(ext) && /text: digestText\(s!, chatDigestCtx\(s!\)\), keyboard: keyboardFor\(s!\),\s*\n\s*audience: chatAudience\(id, chatRoutable\(\)\.length\), mode: chatCfg\(\)\.digest/.test(ext));
    ok('console.changes is on the bridge over the same summary the button sends',
        /op: 'console\.changes'/.test(ext) && /const c = await changesSummary\(s!\.cwd\);\s*\n\s*return \{ id, \.\.\.c, text: changesText\(s!\.agentName, c\) \};/.test(ext));

    // ---------- the setting ----------
    const pkg = JSON.parse(read('package.json'));
    const setting = pkg.contributes.configuration.properties['agentFarm.telegram.digest']
        ?? (Array.isArray(pkg.contributes.configuration) ? pkg.contributes.configuration.map(c => c.properties?.['agentFarm.telegram.digest']).find(Boolean) : undefined);
    ok('agentFarm.telegram.digest: focused | all | off, default focused',
        !!setting && setting.default === 'focused' && setting.enum.join() === 'focused,all,off');
    ok('…and the extension reads it with that default', /cfg\(\)\.get<'focused' \| 'all' \| 'off'>\('telegram\.digest', 'focused'\)/.test(ext));

    console.log(`test_telegram_digest_wire: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
