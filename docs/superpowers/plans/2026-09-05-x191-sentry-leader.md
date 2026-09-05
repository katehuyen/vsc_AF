# X-191 — Sentry Leader Round + Cost Governance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a sentry condition fires, wake a leader for ONE bounded headless turn that writes the next session's opening words itself — and never let that turn become a bill nobody authorised.

**Architecture:** A pure module (`src/core/sentryLeader.ts`) owns the brief, the reply parsing and every spending decision; it has no `fs`, no `child_process` and no model. The host owns the one impure act — running the turn — and hands it in as a `LeaderRunner` port, so a second engine is a second port rather than a second design. The leader is not a daemon and not a service: it does not exist until it is called (X-167 decision 3).

**Tech Stack:** TypeScript, no new dependencies. Model call reuses the `claude --output-format json` envelope pattern already proven in `src/core/distill.ts` (`runJudge`) — a model call that cannot say what it cost is a bill with no line.

**Spec:** `00_AGENT_AREA/10_PROJECTS/PRS.MuratVural_DEV_VSC.AgentFarm/10_Notes/A-PLN - Nöbet Kurtarma - Hibrit Karar Hattı ve Lider Ajan - X-167 - 260905.md` — sections **K1** and **4.4**. BINDING: a decision written there is changed only by asking the user first.

## Global Constraints

- **The leader wakes only when a condition fires.** A routine round is free. (Spec 4.4/1)
- **Default model is cheap:** `agentFarm.sentryLeaderModel`, default `haiku`. (Spec 4.4/2, and the constitution's test/cost policy.)
- **Per-round ceiling:** a time cap and a cost cap; exceeded ⇒ cut, fall to mechanical. (Spec 4.4/3)
- **Daily budget per campaign:** `agentFarm.sentryLeaderBudgetUsd`; exhausted ⇒ the leader sleeps, the campaign runs mechanically, and Notices is told. (Spec 4.4/4)
- **Every leader turn is recorded as `ModelAssist`** (model, ms, $, ok) — the type already exists in `sentryPrompt.ts` and is finally used. (Spec 4.4/5)
- **Consecutive-failure ceiling:** after N failed leader turns in a row the mode drops to mechanical AND SAYS SO. (Spec 4.4/6)
- **‼️ Unparseable output falls to the mechanical path and is recorded as a fault. The leader NEVER stops the campaign.** (Spec 4.4)
- **‼️ No second daemon.** "Sleeping" means not existing until called. (X-167 decision 3)
- **`operator`, never `op`** as an object key in any new data shape — `discoverOps` scans every source file for `op:` and would read it as an unregistered bridge operation (X-190's measured trap).
- Bridge parity in the SAME commit + `parity.manifest.json`; `npm run package` → `code --install-extension` → `npm run verify`.
- Purity line held: the pure module is tested without a machine in any particular state.

---

### Task 1: The leader's brief and its reply (`src/core/sentryLeader.ts`)

**Files:**
- Create: `src/core/sentryLeader.ts`
- Test: `test/test_sentry_leader.js`

**Interfaces:**
- Consumes: `SessionDiagnosis` (`./sessionDiagnosis`), `PolicyVerdict` (`./sentryPolicy`), `ModelAssist` (`./sentryPrompt`).
- Produces:
  ```ts
  export interface LeaderBriefInput {
      diagnosis: SessionDiagnosis;
      verdict: PolicyVerdict;                       // which conditions fired
      next?: { code: string; text: string; effort?: string };
      handover?: { path: string; head: string };    // the note's path and first N lines
      diffStat?: string;                            // `git diff --stat` summary
      project?: string;
      repos?: string[];
      accounts?: { slotId: string; percent: number; usable: boolean }[];
      instructions?: { label: string; text: string; when?: string }[];  // X-192 fills this
      budget?: LeaderBudgetState;
  }
  export function buildLeaderBrief(i: LeaderBriefInput): string;

  export interface LeaderDecision {
      prompt: string;
      account: string | null;
      hold: boolean;
      why: string;
  }
  export interface LeaderReply {
      ok: boolean;
      decision?: LeaderDecision;
      /** why it could not be read — '' when it could */
      why: string;
  }
  export function parseLeaderReply(text: string): LeaderReply;
  ```

- [ ] **Step 1: Write the failing test** — `test/test_sentry_leader.js`, requiring `../out/core/sentryLeader.js`. Cases:
  - the brief NAMES the conditions that fired (`verdict.fired` ids appear in the text)
  - the brief carries the handover note's path AND its head, not just the path
  - the brief asks for the exact JSON shape and says an unparseable answer costs the leader its turn
  - a fact that was NOT measured is stated as unmeasured, never as absent (X-174's law survives into the prompt)
  - the brief never contains a hard-coded machine path
  - `parseLeaderReply` reads a bare JSON object
  - …reads JSON inside a ```json fence, because a model will fence it
  - …reads the LAST JSON object when the model narrated first
  - …refuses prose with no JSON, and says so in one sentence
  - …refuses JSON with no `prompt`, because an empty opening is an empty session
  - …coerces `account: ""` to `null` rather than to a slot called empty-string
  - …`hold: true` is carried through
  - …a `prompt` longer than the cap is refused rather than truncated silently

- [ ] **Step 2: Run it and watch it fail** — `node test/test_sentry_leader.js`; expect `Cannot find module .../sentryLeader.js`.

- [ ] **Step 3: Implement `buildLeaderBrief` and `parseLeaderReply`** — minimal, pure, no `fs`.

- [ ] **Step 4: Run tests** — `npx tsc -p ./ && node test/test_sentry_leader.js`, 0 failed.

---

### Task 2: The spending decision (same file, own test block)

**Files:**
- Modify: `src/core/sentryLeader.ts`
- Test: `test/test_sentry_leader.js` (second block)

**Interfaces:**
- Produces:
  ```ts
  export interface LeaderCaps {
      /** the model the turn runs on; '' = the campaign never set one */
      model: string;
      /** seconds one turn may take before it is cut */
      maxSeconds: number;
      /** dollars one turn may cost before it is refused next time */
      maxUsd: number;
      /** dollars per calendar day, per campaign */
      dailyUsd: number;
      /** failed leader turns in a row that drop the campaign to mechanical */
      failLimit: number;
  }
  export const DEFAULT_LEADER_CAPS: LeaderCaps;   // haiku · 120s · $0.25 · $2.00 · 3

  /** What one campaign has already spent. Lives on the campaign record. */
  export interface LeaderBudgetState {
      /** the calendar day (YYYY-MM-DD) `spentUsd` is about */
      day?: string;
      spentUsd?: number;
      turns?: number;
      failStreak?: number;
      /** the last N turns, newest last, for the transparency surface (X-195) */
      log?: ModelAssist[];
  }

  export interface LeaderAllowance {
      allowed: boolean;
      /** one sentence, always — a refusal with no cause is the bill again */
      why: string;
      /** true when the campaign should be TOLD, not merely skipped */
      announce: boolean;
      /** what is left today, for a surface to draw */
      remainingUsd: number;
  }
  export function leaderAllowed(
      state: LeaderBudgetState | undefined, caps: LeaderCaps, today: string
  ): LeaderAllowance;

  /** The ledger after a turn. Pure: returns a new state, never mutates. */
  export function recordLeaderTurn(
      state: LeaderBudgetState | undefined, assist: ModelAssist, today: string, keep?: number
  ): LeaderBudgetState;
  ```

- [ ] **Step 1: Write the failing test** — cases:
  - with no state at all the leader is allowed, and `remainingUsd` is the whole daily budget
  - spending rolls over at midnight: a state from yesterday does not hold today's budget down
  - at the daily budget the leader is refused, `announce` is true ONCE (the second refusal on the same day does not re-announce)
  - a campaign refused for budget is refused for BUDGET in the sentence, not "unknown"
  - `failStreak >= failLimit` refuses, and says the mode has dropped to mechanical
  - `failLimit: 0` switches the brake off, matching `SentryRecord.failLimit`'s existing convention
  - a successful turn clears the fail streak; a failed one increases it
  - `recordLeaderTurn` adds the cost to today and never mutates the state handed in
  - the log is capped and keeps the NEWEST turns
  - a turn that cost nothing (the runner never started) is still recorded as a failure, because an invisible failure is how a streak never trips

- [ ] **Step 2: Run and watch it fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run tests, 0 failed.**
- [ ] **Step 5: Commit Tasks 1–2** — the pure module is a self-contained deliverable.

---

### Task 3: The turn itself — the port, and the fall to mechanical

**Files:**
- Modify: `src/core/sentryLeader.ts` (the orchestration, still pure — the model is a port)
- Test: `test/test_sentry_leader.js` (third block, with a fake runner)

**Interfaces:**
- Produces:
  ```ts
  /** The one impure act, injected. A second engine is a second port. */
  export type LeaderRunner = (o: {
      prompt: string; model: string; timeoutMs: number;
  }) => Promise<{ text: string; costUsd?: number; error?: string }>;

  export interface LeaderOutcome {
      /** 'leader' = its words are being used · 'mechanical' = the template is */
      path: 'leader' | 'mechanical';
      decision?: LeaderDecision;
      assist?: ModelAssist;
      /** one sentence for the round's row and for Notices */
      why: string;
      /** the budget state AFTER the turn, to be persisted by the caller */
      budget: LeaderBudgetState;
      /** true when the user should be told (budget spent, brake tripped) */
      announce: boolean;
  }
  export async function runLeaderTurn(
      i: LeaderBriefInput, caps: LeaderCaps, run: LeaderRunner,
      o: { today: string; now: () => number }
  ): Promise<LeaderOutcome>;
  ```

- [ ] **Step 1: Write the failing test** — with a fake `LeaderRunner`:
  - a runner returning good JSON gives `path: 'leader'` and the decision
  - ‼️ a runner returning prose gives `path: 'mechanical'`, records the turn as a FAULT, and the campaign is not stopped
  - ‼️ a runner that throws gives `path: 'mechanical'` and does not propagate
  - a runner that exceeds `maxSeconds` is cut, and the cut is the recorded reason
  - a turn over `maxUsd` is recorded and refuses the NEXT turn (a cap cannot un-spend the money already spent)
  - budget exhausted ⇒ the runner is NEVER CALLED (measured by the fake counting calls), `path: 'mechanical'`, `announce: true`
  - `hold: true` is carried out of the decision untouched — the leader may say "wait"
  - every path returns a `budget` the caller can persist, including the refusal paths

- [ ] **Step 2: Run and watch it fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run tests, 0 failed.**
- [ ] **Step 5: Commit Task 3.**

---

### Task 4: Host wiring, settings, and the bridge

**Files:**
- Modify: `src/extension.ts` — the `LeaderRunner` implementation (reusing the `--output-format json` envelope, per `src/core/distill.ts:33`), the call site in `sentryTick` beside `sentryStep(...)`, the `ModelAssist` into `sentryStep({ assist })`, Notices on budget/brake, and the `sentry.leader` bridge op.
- Modify: `src/core/sentryCampaign.ts` — `SentryRecord.leader?: LeaderBudgetState` and `SentryCampaign.policy?: SentryPolicy` / `leaderCaps?: Partial<LeaderCaps>`.
- Modify: `package.json` — `agentFarm.sentryLeaderModel`, `agentFarm.sentryLeaderBudgetUsd`, `agentFarm.sentryLeaderMaxSeconds`, `agentFarm.sentryLeaderMaxUsd`, `agentFarm.sentryLeaderFailLimit`.
- Modify: `src/core/settingsops.ts` — the five settings filed under `tasks`, with the campaign's other brakes (ONE SUBJECT).
- Modify: `parity.manifest.json` — only if a user-triggerable action is added; a bridge op alone needs none.
- Test: `test/test_sentry_bridge.js` (dispatch test for `sentry.leader`).

**Interfaces:**
- Consumes: everything from Tasks 1–3.
- Produces: bridge op `sentry.leader` — **read-only and free**: says what the leader WOULD be asked, whether the budget allows a turn today, what it has spent, and the last turns. It does NOT run one; running belongs to the campaign, and an op that spends money on being *asked a question* is exactly the `automation.ts` bill.

- [ ] **Step 1: Write the failing dispatch test** in `test/test_sentry_bridge.js`, mirroring the extension shape:
  - the op is in the catalogue with `args:` in its `describe`
  - it refuses with no campaign, by the name of what is missing
  - it reports `allowed`, `remainingUsd`, `spentUsd` and the caps in force
  - ‼️ it never calls a runner (the registry passes a fake that would throw)
- [ ] **Step 2: Run and watch it fail.**
- [ ] **Step 3: Implement the op, the settings and the host runner.**
- [ ] **Step 4: `npm test`** — every suite, 0 failed. `test_settingsops.js` proves no new setting leaks into "Other"; `test_parity.js` proves the gate is clean.
- [ ] **Step 5: `npm run package` → `code --install-extension` → `npm run verify`**, and read the installed `version` back out of `extensions.json`.
- [ ] **Step 6: Commit** with the counter title `v#.# - x-191: …` and the body being the summary given to the user.

---

## Self-Review

**Spec coverage (4.4, item by item):** input list → Task 1 `LeaderBriefInput` (instructions field reserved for X-192, deliberately). Output JSON `{prompt, account, hold, why}` → Task 1 `LeaderDecision`. Unparseable ⇒ mechanical + recorded fault, never stops the campaign → Task 3, two cases. Cost governance 1 (fires only on a condition) → the call site in Task 4 sits behind `PolicyVerdict.verdict === 'leader'`, which X-190 already decides. 2 (cheap default) → `DEFAULT_LEADER_CAPS.model = 'haiku'` + setting. 3 (per-round ceiling) → `maxSeconds` / `maxUsd`. 4 (daily budget + Notices + mechanical) → `leaderAllowed` + Task 4 Notices. 5 (`ModelAssist` recorded) → `recordLeaderTurn`, and `sentryStep({ assist })` finally filled, which is K1's actual defect. 6 (consecutive-failure ceiling) → `failStreak` / `failLimit`. "No second daemon" → nothing here schedules anything; `runLeaderTurn` is called from the existing tick.

**Not in this item, on purpose:** the Missions mode selector and condition editor are X-194; the settings page section is X-193; the round-by-round transparency surface is X-195; the instruction pool that fills `LeaderBriefInput.instructions` is X-192. The field exists here so X-192 is a fill rather than a redesign.

**Placeholder scan:** no TBDs; every interface is named with its types; every test step names the cases rather than saying "write tests".

**Type consistency:** `LeaderBudgetState` is the one budget shape, produced by `recordLeaderTurn`, read by `leaderAllowed`, returned by `runLeaderTurn`, persisted as `SentryRecord.leader`, reported by `sentry.leader`. `ModelAssist` is `sentryPrompt.ts`'s existing type, not a second one. `LeaderCaps.failLimit: 0` means "no brake", the same convention `SentryRecord.failLimit` already uses.
