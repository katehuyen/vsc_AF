// ‼️ RETROSPECTIVE AUDIT — THE CORPUS EXTRACTOR.
//
// A closed session's transcript is 5-8 MB. No agent can read 28 of them, so
// nobody ever re-checked what was shipped and "done" stayed self-declared.
// This turns one transcript into a ~2 KB DOSSIER that fits in a turn:
//
//   · every USER turn VERBATIM — that is the specification, and it is the one
//     thing that must never be summarised. The closing note of the agent that
//     did the work is the defendant's testimony; the user's words are the law.
//   · the agent's CLOSING TEXT per turn — the claim being audited.
//   · the files it wrote, the commits in its window, the item codes it names.
//
// Usage:
//   node tools/audit_extract.js --list [pattern]   corpus, newest first
//   node tools/audit_extract.js <sid|prefix>       dossier to stdout (markdown)
//   node tools/audit_extract.js <sid> --json       same, machine-readable
//   node tools/audit_extract.js <sid> --save       also write dist/audit/<sid>.md
//
// Companion: tools/audit_lint.js (the gate) and _REF/audit.md (the protocol).

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const REPO = path.join(__dirname, '..');

// ---------------------------------------------------------------- the index
// Agent Farm already keeps an index over every CLI transcript it has seen:
// title, model, timings, tool counts and the absolute file path. Reading it
// beats walking ~/.claude, and it is what gives a session its human title.
function indexPath() {
    const appdata = process.env.APPDATA
        || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appdata, 'Code', 'User', 'globalStorage',
        'muvusoft.agent-farm', 'session-index.jsonl');
}

function loadIndex() {
    const p = indexPath();
    if (!fs.existsSync(p)) {
        throw new Error('session index not found: ' + p);
    }
    const byId = new Map();
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        let o;
        try { o = JSON.parse(line); } catch (e) { continue; }
        const i = o.info;
        if (!i || !i.sessionId) continue;
        // Later lines win: the index is append-only and a session is re-indexed
        // every time it grows.
        byId.set(i.sessionId, i);
    }
    return byId;
}

// ------------------------------------------------------------------- corpus
function list(pattern) {
    const re = pattern ? new RegExp(pattern, 'i') : null;
    const rows = [...loadIndex().values()]
        .filter(i => i.title && (!re || re.test(i.title)))
        .sort((a, b) => b.firstTs - a.firstTs);
    for (const i of rows) {
        console.log([
            i.sessionId.slice(0, 8),
            new Date(i.firstTs).toISOString().slice(0, 16).replace('T', ' '),
            (i.models || []).join('/') || '?',
            'turns:' + (i.userTurns || 0),
            'tools:' + (i.toolCalls || 0),
            i.title
        ].join('  '));
    }
    console.log('\n' + rows.length + ' session(s)');
}

function resolve(idOrPrefix) {
    const idx = loadIndex();
    if (idx.has(idOrPrefix)) return idx.get(idOrPrefix);
    const hits = [...idx.values()].filter(i => i.sessionId.startsWith(idOrPrefix));
    if (hits.length === 1) return hits[0];
    if (hits.length === 0) throw new Error('no session matches: ' + idOrPrefix);
    throw new Error('ambiguous prefix "' + idOrPrefix + '" matches '
        + hits.map(h => h.sessionId.slice(0, 8)).join(', '));
}

// ------------------------------------------------------- transcript reading
// Noise that is not the user talking: injected reminders, slash-command
// plumbing, and the harness's own stdout echoed back as a user message.
const NOISE = [
    /^<system-reminder>/,
    /^<command-name>/,
    /^<local-command-stdout>/,
    /^<command-message>/,
    /^Caveat: The messages below/,
    /^\[Request interrupted/
];

function isNoise(t) {
    const s = t.trim();
    if (!s) return true;
    return NOISE.some(re => re.test(s));
}

function stripReminders(t) {
    // A genuine user turn often carries a reminder block appended to it.
    return t.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim();
}

function readTranscript(info) {
    const file = info.file;
    if (!file || !fs.existsSync(file)) {
        throw new Error('transcript missing on disk: ' + file);
    }
    const turns = [];      // { ts, text }
    const replies = [];    // { ts, text }  assistant prose, in order
    const files = new Map();
    const bashCommits = [];
    let cwd = null;

    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        let o;
        try { o = JSON.parse(line); } catch (e) { continue; }
        if (o.isSidechain) continue;          // subagents are not the record
        if (o.cwd && !cwd) cwd = o.cwd;
        const content = o.message && o.message.content;
        if (!Array.isArray(content)) continue;

        if (o.type === 'user' && !o.isMeta) {
            for (const c of content) {
                if (c.type !== 'text' || typeof c.text !== 'string') continue;
                if (isNoise(c.text)) continue;
                const text = stripReminders(c.text);
                if (text) turns.push({ ts: o.timestamp, text });
            }
        }

        if (o.type === 'assistant') {
            for (const c of content) {
                if (c.type === 'text' && c.text && c.text.trim()) {
                    replies.push({ ts: o.timestamp, text: c.text.trim() });
                }
                if (c.type === 'tool_use') {
                    const inp = c.input || {};
                    if ((c.name === 'Edit' || c.name === 'Write'
                        || c.name === 'NotebookEdit') && inp.file_path) {
                        const k = inp.file_path;
                        files.set(k, (files.get(k) || 0) + 1);
                    }
                    if (c.name === 'Bash' && typeof inp.command === 'string'
                        && /git\s+commit/.test(inp.command)) {
                        bashCommits.push(inp.command.slice(0, 200));
                    }
                }
            }
        }
    }
    return { turns, replies, files, bashCommits, cwd };
}

// ------------------------------------------------------------------ commits
// The transcript's own `git commit` calls are unreliable (heredocs, scripts,
// hooks), so the truth is the repo's log over the session's own window.
function commitsInWindow(repo, fromTs, toTs) {
    try {
        const out = execFileSync('git', [
            '-C', repo, 'log', '--no-merges',
            '--since', new Date(fromTs - 60000).toISOString(),
            '--until', new Date(toTs + 300000).toISOString(),
            '--format=%h %ad %s', '--date=format:%Y-%m-%d %H:%M'
        ], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
        return out.split('\n').filter(Boolean);
    } catch (e) {
        return ['(git log failed: ' + e.message.split('\n')[0] + ')'];
    }
}

// -------------------------------------------------------------- item codes
function codesIn(texts) {
    const found = new Set();
    for (const t of texts) {
        const m = t.match(/\b[A-Z]{1,3}-\d{1,4}(?:\.\d+)?\b/g);
        if (m) m.forEach(c => found.add(c));
    }
    return [...found].sort();
}

// ------------------------------------------------------------------ dossier
function build(info) {
    const t = readTranscript(info);
    const repo = t.cwd && fs.existsSync(path.join(REPO, '.git')) ? REPO : REPO;
    const commits = commitsInWindow(repo, info.firstTs, info.lastTs);
    return {
        sessionId: info.sessionId,
        title: info.title,
        started: new Date(info.firstTs).toISOString(),
        ended: new Date(info.lastTs).toISOString(),
        models: info.models || [],
        toolCalls: info.toolCalls || 0,
        cwd: t.cwd,
        userTurns: t.turns.map(x => x.text),
        closingTexts: closings(t),
        handoverNotes: handoverNotes(t.files),
        filesWritten: [...t.files.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([f, n]) => ({ file: rel(f), writes: n })),
        commits,
        codes: codesIn([...t.turns.map(x => x.text),
        ...t.replies.map(x => x.text)])
    };
}

// The claim is what the agent said LAST — the summary the user read and
// believed. Take the final prose blocks before each subsequent user turn, and
// the final ones of the session.
//
// ‼️ The literal last message is often the harness talking, not the agent
// ("You've hit your session limit"), and the block before it is the summary
// being audited. So harness lines are dropped and the last TWO substantive
// blocks of each turn are kept.
const HARNESS = [
    /^You've hit your (session|usage) limit/i,
    /^\[Request interrupted/,
    /^API Error/i,
    /^Credit balance is too low/i
];

function isHarness(s) {
    return HARNESS.some(re => re.test(s.trim()));
}

function closings(t) {
    const out = [];
    const bounds = t.turns.map(x => x.ts).slice(1).concat([null]);
    let bi = 0;
    let tail = [];
    const flush = () => {
        if (tail.length) out.push(tail.join('\n\n---\n\n'));
        tail = [];
    };
    for (const r of t.replies) {
        while (bounds[bi] !== null && bounds[bi] !== undefined
            && r.ts >= bounds[bi]) { flush(); bi++; }
        if (isHarness(r.text)) continue;
        tail.push(r.text);
        if (tail.length > 2) tail.shift();
    }
    flush();
    return out;
}

// The handover note IS the claim in written form — the document the next agent
// read and trusted. Surface it by name so the auditor reads the source, not a
// paraphrase of it.
function handoverNotes(files) {
    return [...files.keys()]
        .filter(f => /_devir_/i.test(f) || /01_CEVAPLAR/i.test(f))
        .map(f => f.replace(/\\/g, '/'));
}

function rel(f) {
    const n = f.replace(/\\/g, '/');
    const r = REPO.replace(/\\/g, '/');
    return n.startsWith(r) ? n.slice(r.length + 1) : n;
}

// -------------------------------------------------------------- rendering
function clip(s, n) {
    if (s.length <= n) return s;
    return s.slice(0, n) + '\n… [' + (s.length - n) + ' karakter daha]';
}

function toMarkdown(d, opts) {
    const wide = opts && opts.full;
    const L = [];
    L.push('# Dosya — ' + d.title);
    L.push('');
    L.push('- **Oturum:** `' + d.sessionId + '`');
    L.push('- **Pencere:** ' + d.started.slice(0, 16).replace('T', ' ')
        + ' → ' + d.ended.slice(0, 16).replace('T', ' '));
    L.push('- **Motor:** ' + d.models.join('/') + ' · **tool:** ' + d.toolCalls);
    L.push('- **Geçen kodlar:** ' + (d.codes.join(' ') || '—'));
    L.push('');
    L.push('## 1. ŞARTNAME — kullanıcının kendi sözleri (aynen)');
    d.userTurns.forEach((t, i) => {
        L.push('');
        L.push('### Tur ' + (i + 1));
        L.push('');
        L.push('> ' + (wide ? t : clip(t, 4000)).split('\n').join('\n> '));
    });
    L.push('');
    L.push('## 2. İDDİA — ajanın kapanış beyanı');
    d.closingTexts.forEach((t, i) => {
        L.push('');
        L.push('### Kapanış ' + (i + 1));
        L.push('');
        L.push(wide ? t : clip(t, 3000));
    });
    if (d.handoverNotes.length) {
        L.push('');
        L.push('**Devir notu (iddianın yazılı hâli — kaynağı oku):**');
        d.handoverNotes.forEach(f => L.push('- `' + f + '`'));
    }
    L.push('');
    L.push('## 3. GERÇEKTE NE YAZILDI');
    L.push('');
    L.push('**Yazılan dosyalar (' + d.filesWritten.length + '):**');
    d.filesWritten.forEach(f => L.push('- `' + f.file + '` ×' + f.writes));
    L.push('');
    L.push('**Penceredeki commit\'ler (' + d.commits.length + '):**');
    d.commits.forEach(c => L.push('- ' + c));
    L.push('');
    return L.join('\n');
}

// ------------------------------------------------------------------- main
function main() {
    const argv = process.argv.slice(2);
    if (!argv.length || argv[0] === '--help' || argv[0] === '-h') {
        console.log(fs.readFileSync(__filename, 'utf8')
            .split('\n').filter(l => l.startsWith('//')).slice(0, 22)
            .map(l => l.replace(/^\/\/ ?/, '')).join('\n'));
        return;
    }
    if (argv[0] === '--list') { list(argv[1]); return; }

    const info = resolve(argv[0]);
    const d = build(info);
    if (argv.includes('--json')) {
        console.log(JSON.stringify(d, null, 2));
        return;
    }
    const md = toMarkdown(d, { full: argv.includes('--full') });
    if (argv.includes('--save')) {
        const dir = path.join(REPO, 'dist', 'audit');
        fs.mkdirSync(dir, { recursive: true });
        const out = path.join(dir, info.sessionId.slice(0, 8) + '.md');
        fs.writeFileSync(out, md, 'utf8');
        console.error('saved ' + out);
    }
    console.log(md);
}

if (require.main === module) main();
module.exports = { loadIndex, resolve, build, toMarkdown };
