# Farm Bridge — Agents Drive Agent Farm Themselves

> Codebase development rule: `_REF/agentfarm-dev.md`.

When the user says in chat "set up this task / start this mission / add a schedule", you **do not describe it to them — you do it yourself.** Agent Farm offers two official gateways; both are file-based and usable by any agent from Bash/PowerShell:

## A. Bridge — the general gateway (all functions)

- **Folder:** `$env:APPDATA\Code\User\globalStorage\muvusoft.agent-farm\bridge\`. Use `%APPDATA%` / `$env:APPDATA`; never write an absolute `C:\Users\...` path (portability rule).
  - Windows: `%APPDATA%\Code\User\globalStorage\muvusoft.agent-farm\bridge\`
  - macOS: `~/Library/Application Support/Code/User/globalStorage/muvusoft.agent-farm/bridge/`
  - Linux: `~/.config/Code/User/globalStorage/muvusoft.agent-farm/bridge/`

### 1. Primary & Recommended Method: Official CLI Helper (`af.js`)

Agent Farm automatically provisions `af.js` inside the bridge directory. Calling `af.js` handles request creation, response polling, timeout cleanup, and JSON parsing in a single command. Its shell-safe forms eliminate quote-escaping and mangling bugs.

- **No arguments / catalog discovery:**
  ```powershell
  $b = "$env:APPDATA\Code\User\globalStorage\muvusoft.agent-farm\bridge\af.js"
  node $b farm.ops
  ```
- **Shell-safe scalar arguments (simple ops):**
  ```powershell
  node $b notices.list handled=false limit=5
  ```
  Repeat `key=value` for scalar fields. Boolean, numeric, and `null` values are coerced;
  other values remain strings. Use `@file.json` for nested or long payloads.
- **File arguments via `@file.json` (recommended for reports, tasks, and multi-line markdown):**
  Avoid all shell quote/escaping issues by writing args to a JSON file and passing `@filename.json`:
  ```powershell
  # 1. Write args to JSON file (or temp file)
  Set-Content -Path "args.json" -Value (ConvertTo-Json @{
      title = "Weekly Review"
      report = "# Report Body`n`nDetails..."
  } -Depth 5) -Encoding utf8

  # 2. Invoke bridge helper (quote "@args.json" in PowerShell to prevent splatting)
  node $b notices.post "@args.json"
  ```
- **Stdin support:** use plain `-` only when the calling shell sends UTF-8 bytes. Windows
  PowerShell 5.1 re-encodes strings piped to native processes and can replace non-ASCII
  characters before Node sees them; wrap the UTF-8 JSON bytes in Base64 there:
  ```powershell
  $payload = ConvertTo-Json @{ title = "Türkçe başlık"; text = "Çok satırlı içerik" } -Depth 5
  $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($payload))
  $b64 | node $b tasks.add --stdin-base64
  ```
- **Writing the answer to a file — use `--out`, never a shell redirection:**
  ```powershell
  node $b farm.ops --out docs/farm_ops_catalog.json
  ```
  `node $b <op> > file` hands the bytes to the shell, and PowerShell 5.1 re-encodes them
  (UTF-16LE / ANSI / UTF-8-with-BOM). `--out` writes UTF-8 without a BOM from inside the
  helper, creates missing folders, and prints one summary line instead of the payload —
  so it also keeps a large result out of your context.
- **CLI Options:**
  - `-t, --timeout <ms>` (default: 20000 ms)
  - `-r, --raw` (compact raw JSON output)
  - `-o, --out <file>` (write the response to the file as UTF-8, no BOM)
  - `--stdin-base64` / `--stdin-b64` (decode Base64-wrapped UTF-8 JSON from stdin)

### 2. Alternative / Low-Level Method: Raw File Drop

If invoking Node CLI is not preferred, you can still drop raw request files directly into the bridge directory:

- **Request:** write `<unique-name>.request.json` → `{ "op": "<operation>", "args": { ... } }`. The unique name is your agent name + a timestamp (e.g. `developer-20260719-143210`) so two requests never collide.
- **Response:** appears under the same name as `.response.json` → `{ "ok": true, "result": ... }` or `{ "ok": false, "error": "..." }`. The RUNNER deletes the request file; you read and delete the response.
- **Concrete recipe (PowerShell):**
  ```powershell
  $b = "$env:APPDATA\Code\User\globalStorage\muvusoft.agent-farm\bridge"
  $n = "developer-$(Get-Date -Format yyyyMMdd-HHmmss)"
  '{ "op": "farm.ops" }' | Set-Content "$b\$n.request.json" -Encoding utf8
  $r = "$b\$n.response.json"; $w = 0
  while (-not (Test-Path $r) -and $w -lt 60) { Start-Sleep 1; $w++ }
  if (Test-Path $r) { Get-Content $r -Raw; Remove-Item $r } else { "no response - VS Code may be closed" }
  ```
- **Writing bodies (PowerShell trap):** send multi-line / markdown bodies with a **single-quoted here-string** (`@'…'@`); double quotes let backtick escaping corrupt the markdown. Read the response with `-Encoding UTF8`.

### 3. Rules & Discovery

- **Discovery:** never memorize the operation list — call `farm.ops` first and it returns ALL operations of that version with their contracts (agents.list, tasks.add, schedules.add, workflows.run, missions.start, insights.list, sessions.recent…). New operations appear in the catalog on their own, which is exactly why you **always pull `farm.ops` first**, then choose the right op.
- **‼️ Agent Farm's own data is ASKED OF THE BRIDGE — never dug out of the filesystem.** Sessions, transcripts, turns, tasks, missions, projects, notices, quota: pull `farm.ops`, pick the op. Never search the disk for them and never guess the engine from an id — each engine keeps its transcripts in a different place and format, and the bridge already knows which.
  - A session id (or its 8-character prefix) somebody quoted → `sessions.find q=<id>` — engine and transcript `file` in one call. A relay chain id (`chn_…`) finds every leg.
  - What that session said → `sessions.read session=<id>` — every engine in one shape (`user · assistant · tool · toolResult · system`); `roles`, `turn`, `from`/`limit`/`next`, `maxChars`. Never parse a transcript file yourself.
  - Which session said something → `search.transcripts`.
  - Which session YOU are → `sessions.whoami` (your own id, source `env` or `registry`, and your Console card with its `launchId`) — never infer it from the folder. (In bash, test the registry path with `unset VAR`, never `env -u VAR node …`: MSYS `env` breaks the Windows parent chain.)
  - **Baton relay (S-66):** `baton.pass "@file.json"` leaves your successor's first words — it STARTS NOTHING; the successor opens as a task row (visible on the board) once your session has ended, with a system-written chain header on top of your prompt. `baton.status` = chains and what each waits for; `baton.stop` (baton | chain | session, `why`) = the brake, recorded not deleted; `baton.now` = start the successor at once / ask the pump again for a parked row; `baton.setLegs` (`chain=`|`session=`, `maxLegs=`|`add=`; bare = read) = a running chain's leg ceiling, never below the leg it is on; `baton.legs` (`chain=`|`session=`) = a chain's legs in order and a session's place (prev/next/first/last). Full procedure: `_REF/handover.md`.
  - **What is stuck (S-101):** `farm.cleanup` lists every task row, relay baton and idle Console card waiting 24h or more (`apply=true` cleans, `ids=` picks a subset); rows are cancelled, batons stopped, cards closed — nothing deleted. `farm.health` → `stale` carries the count. Housekeeping starts from this list, never from hand-picked ids.
  - **Held by code on Claude and Codex:** a search tool (Grep, Glob, shell find/grep/rg/ls/dir) carrying a session id is refused at the hook with the line to run instead. A genuine file operation on a transcript: put `af:allow-id` in the command. Refusals and per-engine coverage: `sessions.bridgeGuard`; switch: `agentFarm.bridgeGuard`.
- **Waiting — a timeout says one of TWO things, read `detail.state`:** `unclaimed` — nobody is listening (VS Code closed / extension not active); the request was withdrawn and nothing ran. `running` — the extension TOOK the op and is still on it (most often a confirmation dialog the user has not clicked, e.g. `sessions.end`); it is NOT a failure, the op WILL complete, **never repeat a mutating op on it** — read its answer later from `detail.response` (kept 24h) or call with a longer `--timeout`. Requests run concurrently and each runs at most once (claimed off the disk before dispatch), so one op waiting on a person no longer holds the others.
- Every request raises a notification for the user — no silent work on their behalf. For cost-bearing operations (tasks.add, missions.start) the cost rule applies: do not call them without an explicit instruction from the user.

### 4. Zero-Trap & Self-Healing Gateway Discipline (Fix on Sight)

**User directive:** *"Do not write warnings about traps; eliminate the traps in the system immediately so that subsequent packages are completely trap-free."*

- **Fix immediately on the spot:** If you encounter ANY shell friction, quote-escaping anomaly, character-encoding/BOM corruption, redirection problem, timeout edge case, or parser defect while using `af.js` or the bridge, **do not just bypass it or leave a warning note in handover/memory.**
- **Action:** Fix the root cause in `src/service/af.ts` or `src/core/bridge.ts` immediately on the spot, add an automated test in `test/test_bridge.js`, and package/commit it. The gateway must continually heal, harden, and evolve through real-world usage.

## B. seed-schedules.json — schedule seeding only (the simple path)

`%APPDATA%\Code\User\globalStorage\muvusoft.agent-farm\seed-schedules.json` — an array of `FarmSchedule` fields (no ids). The RUNNER reads it at startup, installs entries de-duplicated by title, and deletes the file. Suitable for one-way setup that expects no response; use the Bridge for everything else.

> Writing `farm-tasks.json` **directly is forbidden** — it races the runner's own writes and loses. The gateways exist for this.

## C. Security exception — Secrets

A secret's **value** never crosses the bridge: storing, reading, renaming or deleting one is done only in the Secrets panel, and typing a route's own key or confirming a key at a moved route's new address only in the Engines page. A secret's **name** does: `secrets.list` returns every name with its metadata and where it is bound (routes, Gatekeeper, MCP servers, workflows), and a held name is bound with `providers.bindSecret` (or `secretRef` on `providers.add` / `providers.set`), `kapici.bindSecret` and `mcp.servers.bindSecret`. A name the vault does not hold is refused, and every bind is announced on Notices with the endpoint it went to. A workflow step refers to a secret by writing `{secret:NAME}`.
