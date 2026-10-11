/**
 * X-536 — PUT THE MANUAL WHERE AN AGENT CAN REACH IT, AND GIVE IT ONE ADDRESS.
 *
 * Two things are written on every activation (each only when its bytes change):
 *
 * 1. `<globalStorage>/bridge/manual.json` — the compiled manual, beside af.js
 *    and manualQuery.js, so af.js answers farm.guide / farm.find / farm.ops
 *    from disk: with VS Code closed, with no toast, in milliseconds.
 *
 * 2. `~/.agentfarm/af.js` + `~/.agentfarm/bridge.json` — a STABLE launcher.
 *    The bridge folder lives under VS Code's globalStorage, whose path differs
 *    per OS, per VS Code flavour (Code, Insiders, VSCodium, Cursor...) and per
 *    portable install. An agent, a skill file or a repo's AGENTS.md cannot be
 *    expected to know which. `node "$HOME/.agentfarm/af.js" <op>` works in
 *    bash, zsh, PowerShell 5.1 and 7 alike, on every machine, and the launcher
 *    forwards to whichever af.js this window staged. AGENT_FARM_HOME moves it.
 *
 * Nothing here is an engine's instruction slot: the folder is Agent Farm's own.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { CompiledManual } from '../service/manualQuery';

export const MANUAL_FILE = 'manual.json';
export const LAUNCHER_DIR = '.agentfarm';

export interface StagePlan {
    /** <globalStorage>/bridge */
    bridgeDir: string;
    /** the af.js stageBridgeCli put there */
    afPath: string;
    /** the user's home (os.homedir()) */
    homeDir: string;
    env?: Record<string, string | undefined>;
    manual: CompiledManual;
    version: string;
    /** the VS Code flavour, for bridge.json — "Visual Studio Code", "Cursor"... */
    appName?: string;
}

export interface StageResult {
    manualPath: string;
    launcherPath?: string;
    /** the command to print in cards and guides: node "<path>" */
    command: string;
    /** files actually written this time */
    wrote: string[];
    problems: string[];
}

export function launcherDir(homeDir: string, env: Record<string, string | undefined> = process.env): string {
    const own = String(env.AGENT_FARM_HOME ?? '').trim();
    return own ? own : path.join(homeDir, LAUNCHER_DIR);
}

/** Forward slashes and double quotes: one spelling every shell on every OS accepts. */
export function afCommand(file: string): string {
    return `node "${file.replace(/\\/g, '/')}"`;
}

/**
 * The launcher itself. Plain CommonJS and Node builtins only: it runs under
 * whatever node the agent's shell finds, long after this extension version.
 */
export function launcherSource(): string {
    return [
        '#!/usr/bin/env node',
        '// Agent Farm launcher. Written by the Agent Farm extension on every start; edits are overwritten.',
        '// Usage: node "$HOME/.agentfarm/af.js" <op> [key=value ...] [@args.json]   (start with: farm.guide)',
        "'use strict';",
        "const fs = require('fs');",
        "const path = require('path');",
        'let target = "";',
        "try { target = JSON.parse(fs.readFileSync(path.join(__dirname, 'bridge.json'), 'utf8')).af || ''; } catch (e) { target = ''; }",
        'if (!target || !fs.existsSync(target)) {',
        "    console.error('Agent Farm has not staged its bridge on this machine yet' + (target ? ' (missing: ' + target + ')' : '')",
        "        + '. Open VS Code with the Agent Farm extension once, then run this again.');",
        '    process.exit(2);',
        '}',
        'require(target).main();',
        ''
    ].join('\n');
}

/** Write only when the bytes differ, so a start that changed nothing touches nothing. */
function writeIfChanged(file: string, text: string, wrote: string[]): void {
    let old: string | undefined;
    try { old = fs.readFileSync(file, 'utf8'); } catch { /* new */ }
    if (old === text) { return; }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, text, 'utf8');
    fs.renameSync(tmp, file);
    wrote.push(file);
}

/**
 * The manual's JSON with a content hash, so `builtAt` moves only when the
 * content does — otherwise every activation would rewrite the file.
 */
export function manualJson(m: CompiledManual, previous?: string): string {
    const { builtAt, ...content } = m;
    const hash = crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex').slice(0, 16);
    if (previous) {
        try {
            const old = JSON.parse(previous) as { contentHash?: string };
            if (old.contentHash === hash) { return previous; }
        } catch { /* rewrite */ }
    }
    return JSON.stringify({ ...content, builtAt, contentHash: hash });
}

export function stageManual(p: StagePlan): StageResult {
    const wrote: string[] = [];
    const problems: string[] = [];
    const manualPath = path.join(p.bridgeDir, MANUAL_FILE);
    try {
        let previous: string | undefined;
        try { previous = fs.readFileSync(manualPath, 'utf8'); } catch { /* first stage */ }
        writeIfChanged(manualPath, manualJson(p.manual, previous), wrote);
    } catch (e) {
        problems.push(`could not write ${manualPath}: ${(e as Error).message}`);
    }
    const dir = launcherDir(p.homeDir, p.env);
    const launcherPath = path.join(dir, 'af.js');
    try {
        writeIfChanged(launcherPath, launcherSource(), wrote);
        writeIfChanged(path.join(dir, 'bridge.json'), JSON.stringify({
            schema: 1,
            af: p.afPath,
            bridgeDir: p.bridgeDir,
            manual: manualPath,
            version: p.version,
            ...(p.appName ? { app: p.appName } : {})
        }, null, 2) + '\n', wrote);
        return { manualPath, launcherPath, command: afCommand(launcherPath), wrote, problems };
    } catch (e) {
        // No launcher (a read-only home, a policy): the absolute path still works on this machine.
        problems.push(`could not write the launcher in ${dir}: ${(e as Error).message}`);
        return { manualPath, command: afCommand(p.afPath), wrote, problems };
    }
}
