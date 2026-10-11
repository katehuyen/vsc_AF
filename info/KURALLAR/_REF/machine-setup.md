# Machine Setup — Post-Format / New-PC Migration

**Read this BEFORE touching engine data folders, symlinks, or CLI engine installs.**

## What the mechanism is

The agent engines (Claude Code, Antigravity/`agy`, Codex, OpenCode) keep their data in default
folders on `C:`. Those folders are **physically** moved to `D:\zone\agent\_run_folder_move` and the
default locations become **symbolic links**. Result: `C:` stays disposable (format at will), all
agent state lives on `D:`, travels in the agent git repo, and migrates between machines.
Agent Farm reads Claude session history from `%USERPROFILE%\.claude` — that link is critical.

## The four scripts — `D:\zone\agent\_setup\`

| Script | Job |
|---|---|
| `Link-Folders.ps1` | Sets up / repairs / completes the symlinks. 9 targets, table-driven. |
| `Install-Engines.ps1` | Installs the CLI engines, skipping whatever already works. |
| `Restore-GitIdentity.ps1` | Links `%USERPROFILE%\.ssh\config` and `.gitconfig` to their masters in `D:\zone\dev\git\!config!`, seeds `known_hosts`, tests every alias. |
| `Doctor.ps1` | Changes nothing. Answers "did the migration actually work?" across nine areas. |
| `Snapshot-OpencodeDb.js` | Node ≥ 24. Writes `opencode-data/opencode-snapshot.db.gz` (`VACUUM INTO` + gzip) when `opencode.db` changed and the last snapshot is ≥ 7 days old; `--force` / `--check`. The live db is ignored by git (X-153, `_REF/git.md` carve-out 4); the daily backup runs this first. |
| `Sync-Agent.ps1` | Smart Merge (X-340): merges ANOTHER machine's copy of `D:\zone\agent` into this live tree by the class table `_setup\sync-classes.json` (T1 transcripts: missing → copied, prefix → longer kept, diverged → both, `.from-<MACHINE>`; T2 keyed stores: union, newer-else-live; T3 settings: master kept; identity never). Plan by default; `-Apply -Confirmed <SOURCE machine>`; `-Rollback <journal>`. Body `_setup\sync\` (Node); journal/ledger/archive/`machine.json` under `_setup\_state\`; Doctor section `sync`. T2 is deferred while Agent Farm runs (the store owner writes them — X-342). Guard: `_setup\tests\test-sync-engine.js`, `Test-Sync.ps1`. Cockpit panel `sync` (X-341, no GUI code): `-Json` = the panel for the source remembered in `_state\sync-source.json`, `-New <folder>` (browse) remembers one, `-Forget`, `-Apply -Confirmed <SOURCE>` behind the typed gate. |
| `Cockpit.exe` | The GUI over all of the above. Source in `_setup\cockpit\`. |

All are **read-only without `-Apply`** (`Doctor.ps1` has no `-Apply` at all), English-only,
pure ASCII, PS 5.1 compatible, and log to `_setup\_logs\`. The Turkish user-facing guide is
`_setup\BENİ OKU - Göç ve Kurulum Rehberi.md`; keep it in step with this file.

## The cockpit — and the one rule that keeps it from rotting

`Cockpit.exe` is .NET Framework 4.8 + WPF, built by the C# compiler inside Windows and
**committed**, so a bare machine runs it with nothing installed — which is the only reason
a GUI is allowed to be the front door of a migration tool at all.

**The cockpit contains no logic.** Scripts are the brain; the cockpit is the face of their
`-Json` output. Every script gains `-Json`, prints NOTHING but JSON on stdout (the human
log still goes to `_logs\`), and each finding may carry its own fix as an `action` — which
is how a button appears in the GUI with no GUI change. Never move a rule into the cockpit:
a check that lives in two places is the failure this system is built to avoid.

The same rule shapes the **wizard** (`cockpit\wizard.json`, panel `wizard`): the seven
steps, their order, their preconditions and their written confirmations are DATA. A step's
done-ness is DERIVED — `check` names a script's `-Json` section, and no `FAIL` in it means
done. A wizard that ticked its own boxes would skip a step somebody undid by hand between
two runs, which on this system means data staying on C:. The one thing it remembers is
step 7, four things a human re-enters that no script can inspect. A new step is one entry
in that file; the panel does not change.

Facts measured on this machine, not assumed — re-check before fighting them:
`PresentationBuildTasks.dll` is absent, so XAML is **never compiled**; it is parsed at
runtime by `XamlReader`, and `cockpit\ui\*.xaml` is editable text needing no rebuild. The
bundled compiler is **C# 5**: `$""`, `=>` members, `nameof` and `?.` are hard errors.
Build with `cockpit\build.ps1`. Contract, panel list and traps:
`10_Notes/Göç Kokpiti - Teknik Tasarım ve Yol Haritası.md` in the Agent Farm project.

## Why git breaks after a move, and why it is not obvious

Every repo under `D:\zone\dev\git` points at a HOST ALIAS, not at github.com
(`git@github-miropharm:...`). Exactly one file resolves that alias to github.com and to the
right key: `%USERPROFILE%\.ssh\config`. It lives on C:, so a format deletes it and ssh then
**never reaches GitHub at all** — `Could not resolve hostname github-miropharm`, which reads
like a DNS fault rather than a missing config. `%USERPROFILE%\.gitconfig` is the same story
for the commit identity ("who are you"). Both masters live on D: in `!config!`; nothing but
this script ever put them where Windows looks.

## Run order — LINK FIRST, THEN INSTALL

Not a preference. On a clean `C:` the default paths do not exist, so every target is a one-command
link with zero copying. Install first and the engines create empty config dirs, turning every
target into a needless conflict. After linking, the engines start already authenticated with full
history.

The cockpit's `Sihirbaz` panel walks exactly this order and will not let it be skipped.
By hand it is:

```
1) .\Link-Folders.ps1              # report only
2) .\Link-Folders.ps1 -Apply
3) .\Install-Engines.ps1           # report only
4) .\Install-Engines.ps1 -Apply
5) .\Restore-GitIdentity.ps1 -Apply
5b) git -C D:\zone\agent config --local core.longpaths true   # repo-local, does not travel with a clone; `_REF/git.md` B
6) .\Doctor.ps1                    # verify; changes nothing (checks 5b under backup / long paths)
6b) node af.js migration.verify    # once VS Code is up: ONE pass/fail from inside the extension (X-283) —
                                   # roots linked · every slot's birth contract · twins · portable dirs · S-61 stores;
                                   # each failing item names its bridge action (`accounts.complete`, `accounts.portable`, …).
                                   # Doctor.ps1 §9b asks the same gate itself when VS Code is running (8 s timeout, WARN when closed)
7) .\Link-Folders.ps1 -Cleanup     # only once everything is verified working
```

Run from a **plain elevated PowerShell**, never from inside a Claude Code session or with VS Code
open — those processes hold the very folders being relinked, and the scripts will (correctly)
skip those targets.

## Core policy — the repo is read-only and always wins

- Nothing is written into, or deleted from, `_run_folder_move` in the default flow.
- Both sides populated -> repo kept, the `C:` copy is **renamed** to `*.PRELINK_<timestamp>`,
  never deleted. The conflict is explained in full (counts, sizes, the files that exist only on
  the live side) and requires typing the target key to confirm.
- Writing to the repo (seeding from `C:`) needs the separate `-AllowSeed` switch plus its own
  confirmation. This is only reachable when the repo side is genuinely empty.
- `-Rollback` replays the journal in `_setup\_state\` backwards.

## The environment layer — "installed" is not "opens"

`Install-Engines.ps1` treats these as two separate facts and only the second one
counts. Every verdict is taken against the **persisted** PATH (registry Machine+User)
through a child `cmd.exe`, because the script's own reordered session PATH would give
a false all-clear. It runs for all four engines, including ones skipped as already
installed — installed-but-unreachable is exactly the case that needs it. It:

- renames dead shims that shadow the real binary (`*.DEADSHIM_<stamp>`, never deletes);
- prepends a missing bin directory to the persisted **user** PATH, written through the
  registry with the value kind preserved (`SetEnvironmentVariable()` rewrites a
  REG_EXPAND_SZ PATH as REG_SZ and breaks every `%VAR%` in it), backing the old value
  up to `_logs` first, then broadcasting `WM_SETTINGCHANGE`;
- edits **machine** PATH only to drop a too-old runtime, because Windows searches
  machine PATH before user PATH — a machine entry cannot be out-ranked from user scope;
- reports PATH entries that do not exist or that are files rather than directories.

## ‼️ The Claude system prompt must stay FULL — `CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT=0`

Anthropic ships a **simplified** system prompt by default. The user's standing decision is the
**full** one; the opt-out is the env var `CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT` set to `"0"` in a
settings `env` block. It is read **at process start**, so it decides the prompt of the session
being launched and can never be changed inside a running one.

It has to be in **three** places, because a session can be launched three ways:

| File | Covers |
|---|---|
| `%USERPROFILE%\.claude\settings.json` | a plain terminal session on this machine |
| `<CLAUDE_CONFIG_DIR>\settings.json` — every `…\muvusoft.agent-farm\accounts\claude-*\` slot | every Agent Farm session started on an account slot |
| `D:\zone\agent\.claude\settings.json` | project settings; travels with the repo, so a new machine has it before anything is configured |

**The slot copy is not yours to maintain — Agent Farm REPRODUCES it.** The slot file is
rendered out of the home file plus the fleet's own contract (`requiredEnv` on the engine
adapter) at three moments: every activation, at capture, and before a launch is handed a
slot. So it is a single-use output with nothing to go stale, capturing a new account needs
no hand-patching, and forgetting one takes no setting with it. What you still own is the
**home** file and the **project** file in the table above.

Reading and repairing it, when a slot was changed by another hand:

| Where | What it says |
|---|---|
| Engines page → account card | `full` / `simple` badge, with `Fix prompt` beside a slot that drifted |
| `node af.js accounts.repairSettings dryRun=true` | every slot, what it is missing, what would be written |
| `Doctor.ps1` → `engines / claude slot prompt` | migration-time proof; its one-click action is `_setup\Repair-SlotSettings.ps1` |

Verifying it inside a session is still the only end-to-end proof: `env | grep SIMPLE` must answer.

**The system prompt is ONE clause of the slot's contract (X-284).** Everything a
slot must carry is one list derived from the engine adapter's own shape, so a
clause added later is asked by every door instead of by whoever remembers. Ask
for the whole thing rather than clause by clause:

| Where | What it says |
|---|---|
| Engines page → account card | `complete` / `n missing`, every absent clause named in its panel, `Complete` beside `Fix prompt` |
| `node af.js accounts.complete` | every slot, every clause; a QUESTION by default (`dryRun` is true unless you pass `dryRun=false`) |
| `Doctor.ps1` → `engines / claude slot contract` | migration-time proof, offline: file presence only, and it names `accounts.complete` as the authority rather than keeping a second list |

The slot never has to be repaired by hand: activation, capture and every launch
ask the contract. The acceptance test is the promise itself — delete a slot
folder, capture the account again, and nothing but the sign-in is gone.

## Locked targets — finding and closing the holder

A target whose owning process is running is skipped, never forced. The plan prints
each holder's **name, PID, start time and image path**, and marks the one the script
is running inside. Two things trip people up:

- **Task Manager's Processes tab hides them** (they are grouped under a terminal or
  VS Code entry). They only show as `claude.exe` under the **Details** tab.
- Running inside Claude Code counts as holding the `.claude` targets even when no
  separate `claude.exe` is visible: that session reads and writes them itself.

`-StopHolders` asks each holder to close, then kills what is left. It **refuses to stop
a process in this script's own ancestor chain**, so it can never resolve `.claude` from
inside Claude Code — that one has to be run from a plain administrator PowerShell with
every Claude Code session closed and VS Code shut down.

## Node.js

`Test-NodeReady` checks the **version** (>= v20), not mere presence: a fossil Node 0.12
satisfied `Get-Command` on a real machine and then failed every modern package with an
unreadable npm error. `Install-NodeLts` tries winget, then falls back to the official
MSI resolved from `nodejs.org/dist/index.json` (winget returned `0x80072efd` there).

## Engines that install into their own data dir

Per-engine flags `InstallsIntoDataDir` / `DataDirForBinaries` / `BinaryArtifacts`.
Windows `tar.exe` refuses to extract through a symlink, so the data link is detached for
the install and restored in a `finally` block, with the new binaries promoted onto the
repo side; existing repo data is never touched. Codex is the current case: binaries land
in `~\.codex\packages\...` and `%LOCALAPPDATA%\Programs\OpenAI\Codex\bin` is a symlink
into `~\.codex\packages\standalone\current\bin`, so the whole `packages` tree is the
artifact — promoting a narrower set leaves that launcher dangling. That payload is
gitignored: it is reinstallable and carries no information.

## Traps these scripts already handle — do not re-solve them by hand

- **Never** remove a directory symlink with `Remove-Item -Recurse`; it can follow the link and
  destroy the real data. Use `cmd rmdir` without `/S`.
- robocopy exit codes: **0-7 success, >=8 failure**. `/XJ` is mandatory or it recurses into
  junctions forever. Never parse its localized summary.
- Turkish locale: `.ToUpper()` maps `i` to `I-with-dot`. Use `ToUpperInvariant()` / `ToLowerInvariant()`.
- PowerShell variables are case-insensitive: `$O` and `$o` are the same variable.
- `continue` inside a `switch` does not reliably continue the enclosing `foreach`. Use if/elseif.
- Stale npm shims (`%APPDATA%\npm\claude.cmd`) can shadow a working native binary. Probe **all**
  `Get-Command -All` candidates, and put known-good bin dirs first on PATH.
- File targets must be real symlinks. A hardlink fallback is unsafe: VS Code and Claude Code save
  by write-temp-then-rename, which silently breaks the hardlink.
- `%APPDATA%\Code\User\globalStorage` may not exist on a fresh machine; create parents first.

## Adding a folder or an engine

Each script starts with a data table (`$Targets` / `$Engines`). A new folder or engine is **one
row**; the logic never changes. Update the human-side note in the same turn (below).

## Human-side twin

`45_AI/60_Sistem ve Verimlilik/A-REF - AI-Windows Sembolik Link Klasörleri SIFIRDAN KURULUM
KOMUTLARI.md` — folder table, `mklink` list, and an `OTOMASYON` section. The two sides must never
disagree; changing one without the other is how the system rots.

## Out of scope of this backup — say it out loud, do not let it surprise anybody

- VS Code `globalState` (`state.vscdb`) and Windows DPAPI secrets (webhook / media keys) are
  **not** in the repo and must be re-entered by hand. **Exception since Agent Farm 3.464.0
  (S-61):** session names, pins, tags and colours live in `session-titles.json` /
  `session-marks.json` under the extension's `globalStorage` (junctioned, in the repo) and
  travel. Names left in an OLD machine's `state.vscdb` are recovered with
  `node tools/adopt_state_vscdb.js <state.vscdb>` in `vsc_AgentFarm` (dry run; `--apply` adds
  only what is missing; a conflict is listed and left to the user — `--prefer incoming` takes
  it). Copy the `.vscdb` with VS Code fully closed.
- **Agent Farm's Secret vault does not travel** — values live in VS Code SecretStorage (the OS
  keychain), their metadata in `globalState`. After a move open Agent Farm's **Secrets** page and
  re-enter each one with the same name and scope. Kapıcı's key is one of them:
  `TYPESAFE_API_KEY` (or `AI_GATEWAY_API_KEY`, or the name `agentFarm.kapici.keyName` gives),
  **Farm only** ticked; `kapici.status` must then say `present`. Until it does, every Kapıcı
  question takes its rule's failure path — nothing breaks, nothing is asked (`_REF/kapici.md`).
- **The host apps on C: do not migrate — only their data does.** An app older than the one the
  data was configured on looks like corrupted data. Measured case: the Obsidian vault, its
  settings and every plugin arrived intact, and two Commander buttons still said "This command
  is not available on this device" — the two command ids simply do not exist in the older
  Obsidian binary on the new machine. `Doctor.ps1` diffs the Commander bindings against the
  live command list and names the dead ones.
- **An OAuth token cannot be relied on to travel.** Refresh tokens rotate: two machines sharing
  one account invalidate each other. Claude's `.credentials.json` was committed daily until the
  move and was simply gone by the first backup on the new machine. Budget for one `/login`
  after a migration; `Doctor.ps1` reports each engine's token and its expiry.
- **Anything done BEFORE the links exist lands in a `*.PRELINK_*` archive**, and `-Cleanup`
  deletes those. It is not only a sign-in: on this move the archive held two Claude session
  transcripts (1.9 MB) that existed nowhere else — real work, written after the repo was
  cloned but before the links were in place. `Doctor.ps1` now diffs each archive against its
  live twin by information-bearing name (`*.jsonl`, `.credentials.json`, `auth.json`,
  excluding caches and rolling backups) and refuses to call the migration clean while an
  orphan is sitting there. **Never run `-Cleanup` before Doctor is quiet.**
