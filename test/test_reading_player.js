// U-198 — the reading player: paragraphs, the line protocol, both engines and the one channel. No test speaks: every process is a stand-in.
//
//   node test/test_reading_player.js
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };
const OUT = path.resolve(__dirname, '..', 'out', 'core');
const S = require(path.join(OUT, 'speech.js'));
const P = require(path.join(OUT, 'readingPlayer.js'));
const B = require(path.join(OUT, 'readingPlayback.js'));
const T = require(path.join(OUT, 'turnAlerts.js'));
const tick = () => new Promise(r => setTimeout(r, 0));
const wait = ms => new Promise(r => setTimeout(r, ms));

/** A player process that never runs: lines go in through `say`, commands come out in `wrote`. */
function fakeChild() {
    const h = {};
    const c = {
        wrote: [], killed: 0,
        stdin: { write: s => { c.wrote.push(s.trim()); } },
        stdout: { on: (_e, f) => { h.data = f; } },
        stderr: { on: (_e, f) => { h.err = f; } },
        on: (e, f) => { h[e] = f; },
        kill: () => { c.killed++; setTimeout(() => h.exit && h.exit(1), 0); },
        say: s => h.data(Buffer.from(s)),
        exit: code => h.exit(code),
        error: e => h.error(e)
    };
    return c;
}
const cfg = S.speakConfig({ voice: 'Tolga', rate: 0, volume: 80 });
const base = backend => ({ backend, ok: false, startedAt: 0, durationMs: 0, exitCode: null, stderr: '' });

// The player's own clock is unref'd (it must never hold the host open), so the test holds the loop itself.
const alive = setInterval(() => undefined, 60_000);
(async () => {
    {
        const text = '# Title\n\nThe first paragraph. It has two sentences.\n\nThe second one.\n\n- a bullet\n- another';
        const paras = S.speechParagraphs(text, 0);
        ok('the cleaned text keeps its paragraphs', paras.length === 4 && paras[0] === 'Title.' && paras[2] === 'The second one.');
        ok('‼️ and sanitizeForSpeech is exactly those paragraphs joined — one cleaner, two shapes', S.sanitizeForSpeech(text, 0) === paras.join(' '));
        const long = Array.from({ length: 30 }, (_, i) => `Paragraph ${i + 1} has a sentence in it.`).join('\n\n');
        const cut = S.speechParagraphs(long, 200);
        ok('a cut reading keeps whole paragraphs, then the cut and "There is more."',
            cut.length >= 4 && cut.slice(0, -1).every(p => /^Paragraph \d+ has a sentence in it\.$/.test(p)) && /There is more\.$/.test(cut[cut.length - 1])
            && cut.join(' ') === S.sanitizeForSpeech(long, 200) && S.sanitizeForSpeech(long, 200).length <= 200 + 20);
        ok('nothing speakable is no paragraphs', S.speechParagraphs('   ').length === 0 && S.sanitizeForSpeech('  ') === '');
    }
    {
        ok('the protocol lines parse', P.parsePlayerLine('ready 3').paragraphs === 3
            && JSON.stringify(P.parsePlayerLine('at 1 30 41 9')) === JSON.stringify({ kind: 'at', paragraph: 1, sentence: 30, word: 41, wordLen: 9 })
            && P.parsePlayerLine('rate -4').rate === -4 && P.parsePlayerLine('paused').kind === 'paused' && P.parsePlayerLine('done').kind === 'done');
        ok('…and anything else is nothing', P.parsePlayerLine('at 1 x 2 3') === null && P.parsePlayerLine('hello') === null && P.parsePlayerLine('') === null);
        const st = { paragraph: 1, paragraphs: 3, sentence: 0 };
        ok('next is the following paragraph, none after the last', P.stepTarget(st, 'next') === 2 && P.stepTarget({ ...st, paragraph: 2 }, 'next') === null);
        ok('⏮ restarts a paragraph past its first sentence, else goes back one (never below the first)',
            P.stepTarget({ ...st, sentence: 12 }, 'prev') === 1 && P.stepTarget(st, 'prev') === 0 && P.stepTarget({ ...st, paragraph: 0 }, 'prev') === 0);
        ok('a rate is clamped to the SAPI scale; a non-number is no rate', P.clampRate(25) === 10 && P.clampRate('-3.4') === -3 && P.clampRate('fast') === null);
        ok('the player finds its voice with the announcement\'s own code and splits on the record separator',
            P.READING_PLAYER_SCRIPT.includes(S.SPVOICE_PICK) && P.PLAYER_SEP === '\u001e' && /-split \[char\]30/.test(P.READING_PLAYER_SCRIPT)
            && /ReadLineAsync/.test(P.READING_PLAYER_SCRIPT) && /\$v\.Pause\(\)/.test(P.READING_PLAYER_SCRIPT));
    }
    {
        let spawned = null, changes = 0;
        const pb = B.persistentPlayback(['One.', 'Two.', 'Three.'], cfg, {
            spawn: (file, args, opts) => { spawned = { file, args, opts }; return (spawned.child = fakeChild()); },
            now: () => Date.now(), base, onChange: () => { changes++; }
        });
        const c = spawned.child;
        ok('the player is ONE powershell for the whole reading, the paragraphs in one value',
            spawned.file === 'powershell' && spawned.args.includes(P.READING_PLAYER_SCRIPT) && spawned.opts.env.AF_SPEAK_TEXT === 'One.\u001eTwo.\u001eThree.'
            && spawned.opts.env.AF_SPEAK_VOICE === 'Tolga' && spawned.opts.env.AF_SPEAK_VOLUME === '80' && spawned.opts.windowsHide === true);
        c.say('ready 3\nat 0 0 0 3\n');
        const c0 = changes;
        c.say('at 0 0 4 5\nat 1 0');
        c.say(' 0 3\n');
        const s1 = pb.state();
        ok('position follows the player — a line split across two chunks too', s1.paragraph === 1 && s1.word === 0 && s1.paragraphs === 3 && s1.live === true);
        ok('a surface is told when the paragraph moves, not on every word', changes === c0 + 1);
        ok('pause and resume go to the player', pb.act('pause') && pb.state().paused && pb.act('toggle') && !pb.state().paused
            && c.wrote.join('|') === 'pause|resume');
        c.say('at 1 6 9 4\n');
        ok('⏮ past the first sentence restarts the paragraph', pb.act('prev') && c.wrote[2] === 'goto 1 0' && pb.state().sentence === 0);
        ok('⏭ goes to the next', pb.act('next') && c.wrote[3] === 'goto 2 0' && pb.state().paragraph === 2);
        ok('…and there is nothing after the last', pb.act('next') === false && c.wrote.length === 4);
        ok('a rate is sent clamped; a non-number is refused', pb.setRate(15) && c.wrote[4] === 'rate 10' && pb.setRate('x') === false);
        c.say('rate 10\n');
        ok('the player\'s answer is the rate', pb.state().rate === 10);
        c.say('done\n'); c.exit(0);
        const r = await pb.done;
        ok('a reading that ends ends well', r.ok === true && r.exitCode === 0 && !r.early);
        ok('…and takes no more commands', pb.act('pause') === false);
    }
    {
        const mk = () => { const o = {}; o.pb = B.persistentPlayback(['A.'], cfg, { spawn: () => (o.c = fakeChild()), now: () => Date.now(), base }); return o; };
        const cut = mk(); cut.c.say('ready 1\n'); cut.pb.kill();
        const r1 = await cut.pb.done;
        ok('a reading cut short says stopped, not failed', r1.ok === false && r1.skipped === 'stopped' && cut.c.killed === 1);
        const early = mk(); early.c.exit(1);
        const r2 = await early.pb.done;
        ok('‼️ a player that never got to speak is EARLY — the one-shot path takes over', r2.early === true && /code 1/.test(r2.error));
        const voice = mk(); voice.c.exit(5);
        const r3 = await voice.pb.done;
        ok('a voice nobody answers is said by name and is not retried', r3.early === false && /no installed voice matched/.test(r3.error));
        const gone = mk(); gone.c.error(Object.assign(new Error('spawn powershell ENOENT'), { code: 'ENOENT' }));
        const r4 = await gone.pb.done;
        ok('no powershell at all is early and missing', r4.early === true && r4.missing === true);
        ok('a spawn that throws is no player', B.persistentPlayback(['A.'], cfg, { spawn: () => { throw new Error('no'); }, now: Date.now, base }) === null);
        let c;
        const stall = B.persistentPlayback(['A.'], cfg, { spawn: () => (c = fakeChild()), now: () => Date.now(), base, stallMs: 30, tickMs: 5 });
        c.say('ready 1\n');
        const r5 = await stall.done;
        ok('a player that says nothing while not paused is ended as hung', r5.timedOut === true && c.killed === 1 && /said nothing/.test(r5.error));
        let c2;
        const held = B.persistentPlayback(['A.'], cfg, { spawn: () => (c2 = fakeChild()), now: () => Date.now(), base, stallMs: 30, tickMs: 5 });
        c2.say('ready 1\n'); held.act('pause'); c2.say('paused\n');
        await wait(80);
        ok('…but a paused reading is left alone', c2.killed === 0);
        held.kill(); await held.done;
    }
    {
        const runs = [];
        let kills = 0;
        const oneShot = (text, c, onSpawn) => {
            const child = { text };
            let end;
            const p = new Promise(r => { end = r; });
            runs.push({ text, rate: c.rate, end: okd => end({ ...base('spd-say'), ok: okd }), child });
            onSpawn(child);
            return p;
        };
        const kill = ch => { kills++; const r = runs.find(x => x.child === ch); if (r) { r.end(false); } };
        const pb = B.stepwisePlayback(['One.', 'Two.', 'Three.'], cfg, { oneShot, kill, now: () => Date.now(), base });
        ok('the paragraph path speaks the first paragraph at once', runs.length === 1 && runs[0].text === 'One.' && pb.state().live === false);
        runs[0].end(true); await tick(); await tick();
        ok('…and the next when it ends', runs.length === 2 && runs[1].text === 'Two.' && pb.state().paragraph === 1);
        ok('pause ends the paragraph\'s player', pb.act('pause') && kills === 1 && pb.state().paused);
        await tick(); await tick();
        ok('…and nothing plays while paused', runs.length === 2);
        pb.act('resume'); await tick(); await tick();
        ok('resume restarts that paragraph', runs.length === 3 && runs[2].text === 'Two.');
        ok('a rate restarts it at the new rate', pb.setRate(4) && kills === 2);
        await tick(); await tick();
        ok('…which the next run carries', runs[3].text === 'Two.' && runs[3].rate === 4);
        ok('⏭ jumps', pb.act('next') && kills === 3);
        await tick(); await tick();
        ok('…to the paragraph after', runs[4].text === 'Three.');
        runs[4].end(true);
        const r = await pb.done;
        ok('the last paragraph ends the reading well', r.ok === true);
        const pb2 = B.stepwisePlayback(['A.', 'B.'], cfg, { oneShot, kill, now: () => Date.now(), base });
        runs[runs.length - 1].end(false);
        ok('a player that fails on its own ends the reading with its failure', (await pb2.done).ok === false);
        const pb3 = B.stepwisePlayback(['A.', 'B.'], cfg, { oneShot, kill, now: () => Date.now(), base });
        pb3.kill();
        const r3 = await pb3.done;
        ok('a stopped reading says stopped', r3.ok === false && r3.skipped === 'stopped');
    }
    {
        let child;
        const sp = new T.DialogueSpeaker();
        const run = sp.speak(['First.', 'Second.'], cfg, { platform: 'win32', spawn: () => (child = fakeChild()), execFile: () => { throw new Error('not this path'); } });
        ok('on Windows the channel plays through the player', sp.speaking && child.wrote.length === 0);
        child.say('ready 2\nat 1 0 0 3\n');
        ok('…and answers where it is and takes its controls', sp.state.paragraph === 1 && sp.act('pause') && child.wrote[0] === 'pause' && sp.setRate(2));
        let second;
        const run2 = sp.speak('The next answer.', cfg, { platform: 'win32', spawn: () => (second = fakeChild()) });
        ok('‼️ the newest reading still cuts the older one', child.killed === 1 && second && sp.speaking);
        const r1 = await run;
        ok('…which says it was replaced', r1.ok === false && /newer turn/.test(r1.skipped || ''));
        second.say('ready 1\n'); second.say('done\n'); second.exit(0);
        const r2 = await run2;
        ok('the newest one reports success and nothing is held after it', r2.ok === true && !sp.speaking && sp.state === null && !('early' in r2));
        ok('with nothing being read the controls answer false', sp.act('next') === false && sp.setRate(1) === false && sp.stop() === false);
        const shots = [];
        const execFile = (file, args, opts, cb) => { shots.push(opts.env.AF_SPEAK_TEXT); setTimeout(() => cb(null, '', ''), 0); return {}; };
        let early;
        const sp2 = new T.DialogueSpeaker();
        const run3 = sp2.speak(['Alpha.', 'Beta.'], cfg, { platform: 'win32', spawn: () => (early = fakeChild()), execFile });
        early.exit(1);
        const r3 = await run3;
        ok('‼️ a Windows player that cannot start falls back to the one-shot voice, paragraph by paragraph', r3.ok === true && shots.join('|') === 'Alpha.|Beta.');
        const linux = [];
        const sp3 = new T.DialogueSpeaker();
        const r4 = await sp3.speak(['Uno.', 'Dos.'], cfg, { platform: 'linux', execFile: (file, args, o, cb) => { linux.push(file + ':' + args[args.length - 1]); setTimeout(() => cb(null, '', ''), 0); return {}; } });
        ok('elsewhere it reads a paragraph at a time with the platform\'s player', r4.ok === true && linux.join('|') === 'spd-say:Uno.|spd-say:Dos.');
    }
    clearInterval(alive);
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
