# Web Access — Layered System

Rule: **climb from the bottom up — move to a higher layer only when the one below is not enough.** Getting stuck is **forbidden**; a working lower layer always exists.

**Layer 1 — WebSearch + WebFetch (DEFAULT REFLEX, no browser).**
No setup, no conflicts, instant. Most "find something on the internet / read a page / fetch a fact" work is handled **here**. **Start every web task with this.** Limit: static content only; not enough for JS-rendered pages, pages requiring login or interaction, and some bot-protected sites → Layer 2.

**Layer 2 — Playwright MCP (`mcp__playwright__*`), isolated Chromium, headed.**
Brings its own Chromium (`--isolated --browser=chromium`, no `--headless`); it **never touches** the user's Chrome, and a profile lock is **structurally impossible**. The **primary browser path** for all JS-heavy scraping/automation — including flows needing a one-time interactive login, since the window is real and visible and the user can complete a password/2FA/CAPTCHA step directly in it. Opening Playwright needs **no approval**; it is not a debug/CDP connection. Chromium is already downloaded: `%LOCALAPPDATA%\ms-playwright`. Limit: `--isolated` means no session survives **between** separate runs (a login done today is gone tomorrow) → reach for Layer 3 only if a site is bot-walled against Playwright's Chromium specifically, or a login must persist across many future runs without repeating.

**Layer 3 — Agent Chrome / Persistent Browser (`mcp__chrome-devtools__*` / CDP), port 9222, SEPARATE profile.**
**Ask the user before starting this connection (constitution rule) — and never close/kill the user's Chrome: the separate profile means you never need to.** Rare fallback, not the default login path (headed Playwright covers ordinary interactive logins now) — only when a site is bot-walled against Playwright's Chromium specifically, or a login/session needs to persist across many future runs without repeating:
1. Bring the bridge up (idempotent): `powershell -ExecutionPolicy Bypass -File D:\zone\agent\ajanlar\developer\tools\launch-agent-chrome.ps1` — if 9222 is alive it does nothing, otherwise it starts Chrome/Chromium with a separate persistent profile (`%LOCALAPPDATA%\ms-playwright\persistent_profile`). Because the profile is separate, it **never conflicts** with normal Chrome.
2. Connect via CDP / devtools MCP (`http://127.0.0.1:9222`).
3. The first Google/Flow login **belongs to the user** (headed window); the session persists in the profile. If there is a reCAPTCHA, the user clicks the final button.

---

## Engine-Specific Execution & Traps (Antigravity CLI vs Claude Code)

* **Claude Code Engine:** Uses built-in persistent stdio MCP daemon. Stdio MCP connections persist natively throughout the entire session.
* **Antigravity CLI Engine (Pitfalls & Required Fixes):**
  1. **Trap 1 — Windows Job Object process kill:** Antigravity wraps tool runs in Windows Job Objects (`KILL_ON_JOB_CLOSE`). Any browser spawned as a direct child of a command will terminate the moment the tool turn finishes. **Fix:** Use WMI (`Win32_Process.Create`) inside `launch-agent-chrome.ps1` to break out of the Job Object.
  2. **Trap 2 — Windows Sandbox Access Denied (0x5):** AppData Chromium execution hits Windows sandbox permission blocks on older architectures/profiles. **Fix:** Always supply `--no-sandbox --disable-gpu`.
  3. **Trap 3 — Verification Rule:** Never assume a browser window opened successfully at `t=0`. Always sleep 3 seconds and verify endpoint `http://127.0.0.1:9222/json/version` before confirming to the user.
