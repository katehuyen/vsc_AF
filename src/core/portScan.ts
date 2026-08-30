/**
 * U-86 — WHO HOLDS A PORT, asked of the operating system.
 *
 * ‼️ THE SHELL LIVES HERE AND THE JUDGEMENT LIVES IN `hooksCockpit.ts`. The
 * parsing and the classification are the parts that can be wrong in a way that
 * matters — a card offering to stop pid 0, or to stop the window it is drawn in
 * — so they are pure and tested against the bytes this machine really produced.
 * This file is the two lines that cannot be: running the command, and looking
 * the pid up in the process table the repo already reads.
 *
 * ‼️ AND IT IS ONLY EVER CALLED IN ONE STATE. `LiveMonitor.listenerState`
 * already knows whether the bind failed, because it watched its own
 * `server.on('error')`. Scanning to answer a question we already know would be
 * slower and less true; the scan adds exactly one fact — WHO — and it is asked
 * for only when the answer to WHETHER is already "it is taken".
 */
import * as cp from 'child_process';
import { classifyHolder, listeningPidPosix, listeningPidWindows, PortHolder } from './hooksCockpit';
import { ancestorsOf, readProcessTable } from './processTree';

/** Run the platform's own "who is listening" command. Empty on failure — which
 *  the classifier reports as `unknown` rather than as a free port. */
function scan(port: number): { out: string; ok: boolean } {
    try {
        if (process.platform === 'win32') {
            const r = cp.spawnSync('netstat', ['-ano', '-p', 'TCP'], {
                encoding: 'utf8', windowsHide: true, timeout: 15_000, maxBuffer: 8 * 1024 * 1024
            });
            return { out: r.stdout || '', ok: r.status === 0 && !!r.stdout };
        }
        const r = cp.spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], {
            encoding: 'utf8', windowsHide: true, timeout: 15_000, maxBuffer: 8 * 1024 * 1024
        });
        // ‼️ lsof EXITS 1 WHEN NOTHING MATCHES, which is an answer and not a
        // failure. Treating it as one would report `unknown` for every free
        // port on macOS and Linux.
        return { out: r.stdout || '', ok: r.error === undefined };
    } catch {
        return { out: '', ok: false };
    }
}

/** Who holds `port` right now, already classified against our own process. */
export function portHolder(port: number, ownPid = process.pid): PortHolder {
    const r = scan(port);
    if (!r.ok) { return classifyHolder({ ownPid, port, scanFailed: true }); }
    const pid = process.platform === 'win32'
        ? listeningPidWindows(r.out, port)
        : listeningPidPosix(r.out);
    if (!pid) { return classifyHolder({ ownPid, port }); }
    const table = readProcessTable();
    const name = table.find(p => p.pid === pid)?.name ?? '';
    return classifyHolder({
        pid, name, ownPid, port,
        ownAncestors: [...ancestorsOf(ownPid, table)]
    });
}

/**
 * Stop the process holding the port — ONLY when the classifier said it may be
 * offered. The guard is repeated here on purpose: this function is reachable
 * from the bridge, so "the page would not have drawn the button" is not a
 * safety property.
 */
export function clearPort(port: number, ownPid = process.pid):
    { ok: boolean; stopped?: number; error?: string } {
    const holder = portHolder(port, ownPid);
    if (!holder.canStop || !holder.pid) {
        return { ok: false, error: holder.detail };
    }
    try {
        if (process.platform === 'win32') {
            const r = cp.spawnSync('taskkill', ['/PID', String(holder.pid), '/T', '/F'], {
                encoding: 'utf8', windowsHide: true, timeout: 15_000
            });
            if (r.status !== 0) {
                return { ok: false, error: (r.stderr || r.stdout || 'taskkill refused').trim().slice(0, 300) };
            }
        } else {
            process.kill(holder.pid, 'SIGTERM');
        }
        return { ok: true, stopped: holder.pid };
    } catch (e) {
        return { ok: false, error: String((e as Error).message ?? e) };
    }
}
