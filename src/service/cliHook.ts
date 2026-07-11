/**
 * E2b — CLI hook bridge. A tiny standalone script that forwards one event from
 * an external CLI session (gemini/codex/…) to the Agent Farm live listener:
 *
 *   node cliHook.js --event UserPromptSubmit --prompt "fix the login bug"
 *   node cliHook.js --event PreToolUse --tool Bash
 *   node cliHook.js --event Stop
 *   codex-notify-json | node cliHook.js --json     (merges JSON from stdin)
 *
 * Terminals opened by "Start Session With…" carry AGENT_FARM_SESSION /
 * AGENT_FARM_CWD / AGENT_FARM_EVENT_PORT / AGENT_FARM_HOOK env vars, so a hook
 * wired inside that terminal needs no --session/--cwd/--port arguments and its
 * events land on the session's existing timeline lane.
 *
 * Fail-soft by design: any error is a stderr note and exit 0 — the bridge must
 * never break or block the CLI that invoked it.
 */

import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';

function arg(name: string): string | undefined {
    const i = process.argv.indexOf('--' + name);
    return i >= 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : undefined;
}

// Known notify payload types from other CLIs → hook event names. Unverified
// against live installs (formats may drift) — additions are cheap and safe.
const TYPE_MAP: Record<string, string> = {
    'agent-turn-complete': 'Stop',
    'session-start': 'SessionStart',
    'session-end': 'SessionEnd'
};

function main(): void {
    let merged: Record<string, unknown> = {};
    if (process.argv.includes('--json')) {
        try {
            const raw = fs.readFileSync(0, 'utf8').trim();
            if (raw) { merged = JSON.parse(raw) as Record<string, unknown>; }
        } catch (e) { console.error('cliHook: stdin json ignored — ' + String(e)); }
    }

    const cwd = arg('cwd') ?? process.env.AGENT_FARM_CWD ?? process.cwd();
    // Without a session id, fold events from the same folder into one stable lane.
    const session = arg('session') ?? process.env.AGENT_FARM_SESSION
        ?? `cli:external:${path.basename(cwd)}`;
    const port = Number(arg('port') ?? process.env.AGENT_FARM_EVENT_PORT ?? 8377);
    const event = arg('event')
        ?? (typeof merged['hook_event_name'] === 'string' ? merged['hook_event_name'] as string : undefined)
        ?? (typeof merged['type'] === 'string' ? TYPE_MAP[merged['type'] as string] : undefined);
    if (!event) {
        console.error('cliHook: no --event and no recognizable payload type — nothing sent');
        return;
    }

    const payload: Record<string, unknown> = {
        ...merged,
        session_id: session,
        cwd,
        hook_event_name: event
    };
    if (arg('tool')) { payload['tool_name'] = arg('tool'); }
    if (arg('prompt')) { payload['prompt'] = arg('prompt'); }
    if (arg('message')) { payload['message'] = arg('message'); }
    if (arg('reason')) { payload['reason'] = arg('reason'); }

    const body = JSON.stringify(payload);
    const req = http.request({
        host: '127.0.0.1', port, path: '/event', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: 3000
    }, res => { res.resume(); });
    req.on('timeout', () => { req.destroy(); });
    req.on('error', e => { console.error('cliHook: listener unreachable — ' + String(e)); });
    req.end(body);
}

main();
