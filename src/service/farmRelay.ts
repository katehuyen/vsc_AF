/**
 * J2 — Farm Relay (remote half). A tiny standalone node process that runs on
 * ANOTHER machine and turns its local Claude Code activity into a compact
 * event feed file:
 *
 *   node farmRelay.js --claude C:\Users\me\.claude --out D:\Sync\relay-laptop.jsonl --machine laptop
 *
 * The output file lives in a folder the user already syncs (Syncthing /
 * OneDrive / …). On the main machine, Agent Farm tails the synced copy
 * (`agentFarm.relayFeeds`) and feeds the events into the live monitor — the
 * "live" counterpart of the E1 folder-sync approach. No sockets, no listener
 * changes: transport is the user's own file sync, locality preserved.
 */

import * as fs from 'fs';
import * as path from 'path';

function arg(name: string, fallback?: string): string | undefined {
    const i = process.argv.indexOf('--' + name);
    return i >= 0 ? process.argv[i + 1] : fallback;
}

const claudeDir = arg('claude') ?? path.join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.claude');
const outFile = arg('out') ?? '';
const machine = arg('machine') ?? 'remote';
const projectsDir = path.join(claudeDir, 'projects');

if (!outFile || !fs.existsSync(projectsDir)) {
    console.error('usage: node farmRelay.js --claude <dir-with-projects> --out <synced-file.jsonl> [--machine name]');
    process.exit(2);
}

const MAX_OUT_BYTES = 2 * 1024 * 1024;
const offsets = new Map<string, number>();

function log(msg: string): void {
    console.log(`[${new Date().toISOString()}] ${msg}`);
}

interface RelayEvent {
    ts: number;
    machine: string;
    sessionId: string;
    cwd?: string;
    kind: 'prompt' | 'tool' | 'working' | 'stop';
    tool?: string;
    detail?: string;
}

function emit(events: RelayEvent[]): void {
    if (!events.length) { return; }
    try {
        fs.appendFileSync(outFile, events.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf8');
        const st = fs.statSync(outFile);
        if (st.size > MAX_OUT_BYTES) {
            // keep the tail: sync tools handle small rewrites fine
            const lines = fs.readFileSync(outFile, 'utf8').trim().split('\n');
            fs.writeFileSync(outFile, lines.slice(-2000).join('\n') + '\n', 'utf8');
        }
    } catch (e) { log('emit failed: ' + String(e)); }
}

function eventsFromLines(sessionId: string, lines: string[]): RelayEvent[] {
    const out: RelayEvent[] = [];
    for (const lineText of lines) {
        if (!lineText.trim()) { continue; }
        let line: {
            type?: string; isMeta?: boolean; cwd?: string; timestamp?: string;
            message?: { content?: unknown };
        };
        try { line = JSON.parse(lineText); } catch { continue; }
        const base = {
            ts: line.timestamp ? Date.parse(line.timestamp) || Date.now() : Date.now(),
            machine, sessionId, cwd: line.cwd
        };
        if (line.type === 'user' && !line.isMeta && typeof line.message?.content === 'string' &&
            !line.message.content.startsWith('<')) {
            out.push({ ...base, kind: 'prompt', detail: line.message.content.slice(0, 4000) });
        } else if (line.type === 'assistant' && Array.isArray(line.message?.content)) {
            for (const b of line.message!.content as { type?: string; name?: string; text?: string }[]) {
                if (b?.type === 'tool_use' && b.name) {
                    out.push({ ...base, kind: 'tool', tool: b.name });
                } else if (b?.type === 'text' && b.text?.trim()) {
                    out.push({ ...base, kind: 'working' });
                }
            }
        }
    }
    // collapse bursts: at most 5 events per read
    return out.slice(-5);
}

function scan(): void {
    let files: string[] = [];
    const walk = (dir: string, depth: number) => {
        let entries: fs.Dirent[] = [];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) { if (depth < 4) { walk(p, depth + 1); } }
            else if (e.name.endsWith('.jsonl')) { files.push(p); }
        }
    };
    walk(projectsDir, 0);
    // only recently-touched transcripts matter for liveness
    const cutoff = Date.now() - 10 * 60_000;
    files = files.filter(f => {
        try { return fs.statSync(f).mtimeMs >= cutoff; } catch { return false; }
    });
    const events: RelayEvent[] = [];
    for (const f of files) {
        try {
            const size = fs.statSync(f).size;
            const prev = offsets.get(f) ?? size; // first sight: start at end (no history replay)
            if (size <= prev) { offsets.set(f, size); continue; }
            const fd = fs.openSync(f, 'r');
            const buf = Buffer.alloc(Math.min(size - prev, 512 * 1024));
            fs.readSync(fd, buf, 0, buf.length, prev);
            fs.closeSync(fd);
            offsets.set(f, size);
            events.push(...eventsFromLines(path.basename(f, '.jsonl'), buf.toString('utf8').split('\n')));
        } catch { /* file rotated/locked — next tick */ }
    }
    emit(events);
}

log(`Farm relay up — machine "${machine}", watching ${projectsDir} → ${outFile}`);
setInterval(scan, 3000);
scan();
