// Codex cross-engine extras: .mcp.json → config.toml [mcp_servers.*] emitter,
// and syncCodexExtras additive behavior (never touches CLAUDE.md/AGENTS.md).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const { mcpJsonToCodexToml, syncCodexExtras, CODEX_MCP_SUGGESTED_REL } =
    require(path.join(ROOT, 'out/core/codex.js'));
const { syncToAntigravity } = require(path.join(ROOT, 'out/core/antigravity.js'));

let pass = 0, fail = 0;
const check = (n, c) => { if (c) { pass++; } else { fail++; console.log('FAIL  ' + n); } };

// --- 1) TOML emitter: stdio server with Windows path + args + env ---
const stdioToml = mcpJsonToCodexToml({
    node_repl: {
        command: 'C:\\Users\\rotam\\bin\\node_repl.exe',
        args: ['--flag', 'x'],
        env: { CODEX_HOME: 'C:\\Users\\rotam\\.codex' }
    }
});
check('stdio: table header', stdioToml.includes('[mcp_servers.node_repl]'));
check('stdio: windows path as TOML literal (single quotes, no escaping)',
    stdioToml.includes("command = 'C:\\Users\\rotam\\bin\\node_repl.exe'"));
check('stdio: args array', stdioToml.includes("args = ['--flag', 'x']"));
check('stdio: env sub-table', stdioToml.includes('[mcp_servers.node_repl.env]') &&
    stdioToml.includes("CODEX_HOME = 'C:\\Users\\rotam\\.codex'"));

// --- 2) TOML emitter: http server with url + headers → http_headers ---
const httpToml = mcpJsonToCodexToml({
    obsidian: { type: 'http', url: 'http://127.0.0.1:27123/mcp', headers: { Authorization: 'Bearer abc' } }
});
check('http: url line', httpToml.includes("url = 'http://127.0.0.1:27123/mcp'"));
check('http: http_headers sub-table', httpToml.includes('[mcp_servers.obsidian.http_headers]') &&
    httpToml.includes("Authorization = 'Bearer abc'"));
check('http: no command/args for url server', !httpToml.includes('command ='));

// --- 3) TOML emitter: value containing a single quote falls back to basic string ---
const quoteToml = mcpJsonToCodexToml({ s: { command: "a'b" } });
check('quote value → basic string with escaping', quoteToml.includes('command = "a\'b"') || quoteToml.includes("command = \"a'b\""));

// --- 4) key needing quoting ---
const keyToml = mcpJsonToCodexToml({ 'my server': { command: 'x' } });
check('non-bare key quoted (literal or basic string, both valid TOML)',
    keyToml.includes("[mcp_servers.'my server']") || keyToml.includes('[mcp_servers."my server"]'));

// --- 5) syncCodexExtras: no .mcp.json → no toml written, still notes AGENTS.md ---
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-codex-'));
fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# Ajan\n\nBkz. CLAUDE.md.\n');
syncToAntigravity(dir, []); // create the shared AGENTS.md first (the Antigravity core owns it)
const claudeBefore = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
const r1 = syncCodexExtras(dir);
check('no .mcp.json → no suggested toml written', !fs.existsSync(path.join(dir, CODEX_MCP_SUGGESTED_REL)));
check('notes that Codex reads the shared AGENTS.md', r1.notes.some(n => /Codex/.test(n) && /AGENTS\.md/.test(n)));
check('syncCodexExtras did NOT modify CLAUDE.md', fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8') === claudeBefore);

// --- 6) syncCodexExtras: with .mcp.json → writes merge-ready toml snippet ---
fs.writeFileSync(path.join(dir, '.mcp.json'), JSON.stringify({
    mcpServers: { obsidian: { type: 'http', url: 'http://127.0.0.1:27123/mcp' } }
}));
const r2 = syncCodexExtras(dir);
const snippetPath = path.join(dir, CODEX_MCP_SUGGESTED_REL);
check('.mcp.json → suggested toml written', fs.existsSync(snippetPath));
check('written list reports the snippet', r2.written.includes(CODEX_MCP_SUGGESTED_REL));
const snippet = fs.existsSync(snippetPath) ? fs.readFileSync(snippetPath, 'utf8') : '';
check('snippet has a merge header comment', snippet.startsWith('#'));
check('snippet contains the obsidian block', snippet.includes('[mcp_servers.obsidian]'));
check('snippet dropped under .agents/codex/', snippetPath.includes(path.join('.agents', 'codex')));

// --- 7) AGENTS.md untouched by Codex extras (Antigravity owns it) ---
const agentsBefore = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
syncCodexExtras(dir);
check('AGENTS.md unchanged by Codex extras', fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8') === agentsBefore);

try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
