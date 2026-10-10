/**
 * ‼️ DOES THIS COMMAND LINE START A BATCH FILE — asked the way cmd.exe finds a program.
 *
 * Measured: a batch script that runs another batch file without `call` hands
 * control over and never gets it back, so every line after it is dead. A CLI
 * installed by npm IS a batch file (`opencode.cmd`), which is how an OS-window
 * run of one never wrote its exit code and its task stayed running for ever.
 * The launcher asks here and gives such a command a cmd of its own
 * (extTerminal.ts); a program that is an executable is left exactly as it was.
 *
 * The search is cmd's: the folder the script runs in, then PATH in order, and in
 * each folder PATHEXT in order — so an `.exe` beside a `.cmd` wins, as it does there.
 */
import * as fs from 'fs';
import * as path from 'path';

const isFile = (file: string): boolean => { try { return fs.statSync(file).isFile(); } catch { return false; } };

/** The program a command line names: its first quoted string, else its first word. */
export function programOf(command: string): string {
    const m = /^\s*(?:"([^"]+)"|(\S+))/.exec(String(command ?? ''));
    return m ? (m[1] ?? m[2] ?? '') : '';
}

export function startsBatchFile(
    command: string, cwd: string | undefined,
    env: { PATH?: string; PATHEXT?: string } = { PATH: process.env.PATH, PATHEXT: process.env.PATHEXT },
    exists: (file: string) => boolean = isFile
): boolean {
    const prog = programOf(command);
    if (!prog) { return false; }
    const exts = (env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').map(e => e.trim().toLowerCase()).filter(Boolean);
    const names = exts.includes(path.win32.extname(prog).toLowerCase()) ? [prog] : exts.map(e => prog + e);
    const here = cwd || '.';
    const dirs = /[\\/]/.test(prog) ? [here] : [here, ...(env.PATH || '').split(';').map(d => d.trim()).filter(Boolean)];
    for (const dir of dirs) {
        for (const name of names) {
            const file = path.win32.resolve(dir, name);
            if (exists(file)) { return /\.(cmd|bat)$/i.test(file); }
        }
    }
    return false;
}
