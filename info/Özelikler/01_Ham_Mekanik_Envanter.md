# 01 — Agent Farm Ham Mekanik Özellik Envanteri

Bu dosya, `vsc_AgentFarm` kod tabanından doğrudan kod, kayıt defterleri (`package.json`, `parity.manifest.json`, `src/extension.ts`, `src/panels/`, `src/core/`) taranarak mekanik olarak üretilmiştir. Hiçbir varsayım veya eksiltme yapılmamıştır.

**Oluşturulma Tarihi:** 2026-10-02 19:36:36

---

## 1. VS Code Komutları (`contributes.commands`) — Toplam: 585

| # | Komut ID | Başlık / Açıklama | Kategori |
|---|---|---|---|
| 1 | `agentfarm.openDashboard` | Open Dashboard | Agent Farm |
| 2 | `agentfarm.openLiving` | Open Living (is the system alive today?) | Agent Farm |
| 3 | `agentfarm.configureLivingChecks` | Configure Living Checks… | Agent Farm |
| 4 | `agentfarm.openMissions` | Missions | Agent Farm |
| 5 | `agentfarm.newMission` | New Mission… | Agent Farm |
| 6 | `agentfarm.missionApprove` | Approve Round | Agent Farm |
| 7 | `agentfarm.missionReject` | Reject Round | Agent Farm |
| 8 | `agentfarm.missionAnswer` | Answer Mission Question… | Agent Farm |
| 9 | `agentfarm.missionGuide` | Guide an Objective… | Agent Farm |
| 10 | `agentfarm.missionPause` | Pause Mission | Agent Farm |
| 11 | `agentfarm.missionResume` | Resume Mission | Agent Farm |
| 12 | `agentfarm.missionCancel` | Cancel Mission | Agent Farm |
| 13 | `agentfarm.missionRerun` | Run Mission Again | Agent Farm |
| 14 | `agentfarm.missionDelete` | Delete Mission Run | Agent Farm |
| 15 | `agentfarm.missionStepOutput` | Open Delegation Output | Agent Farm |
| 16 | `agentfarm.setupExample` | Set Up Example Automation… | Agent Farm |
| 17 | `agentfarm.delegateInsight` | Delegate Insight(s) to Agent… | Agent Farm |
| 18 | `agentfarm.fixInsight` | Fix Insight | Agent Farm |
| 19 | `agentfarm.dismissInsight` | Dismiss Insight… | Agent Farm |
| 20 | `agentfarm.restoreInsights` | Restore Dismissed Insights… | Agent Farm |
| 21 | `agentfarm.editSchedule` | Edit Schedule… | Agent Farm |
| 22 | `agentfarm.lapReset` | Reset Token Lap (start counting from now) | Agent Farm |
| 23 | `agentfarm.lapClear` | Clear Token Lap | Agent Farm |
| 24 | `agentfarm.openGuide` | Open Guide | Agent Farm |
| 25 | `agentfarm.openTimeline` | Open Live Timeline | Agent Farm |
| 26 | `agentfarm.planUsageRefresh` | Check Plan Usage Now (session 5h + weekly %) | Agent Farm |
| 27 | `agentfarm.setUsageEngine` | Show Another Engine's Limit in the Status Bar | Agent Farm |
| 28 | `agentfarm.installHooks` | Install Live Hooks | Agent Farm |
| 29 | `agentfarm.removeHooks` | Remove Live Hooks | Agent Farm |
| 30 | `agentfarm.refresh` | Refresh | Agent Farm |
| 31 | `agentfarm.newAgent` | New Agent | Agent Farm |
| 32 | `agentfarm.addAgentRoot` | Add Agent Root Folder | Agent Farm |
| 33 | `agentfarm.startSession` | Start Session (your default engine) | Agent Farm |
| 34 | `agentfarm.startSessionRow` | Start Session for this agent (your default engine) | Agent Farm |
| 35 | `agentfarm.continueSession` | Continue Latest Session | Agent Farm |
| 36 | `agentfarm.openConsole` | Open Console (talk to an agent inside the panel) | Agent Farm |
| 37 | `agentfarm.consoleForAgent` | Talk in Console… | Agent Farm |
| 38 | `agentfarm.resumeInConsole` | Resume in Console | Agent Farm |
| 39 | `agentfarm.launchSession` | Start Session… (model · effort · permissions · first prompt) | Agent Farm |
| 40 | `agentfarm.startSessionWith` | Start Session With… (custom CLI profile) | Agent Farm |
| 41 | `agentfarm.quickMenu` | Quick Menu (everything, one key) | Agent Farm |
| 42 | `agentfarm.manageProjects` | Manage Projects (open the projects page) | Agent Farm |
| 43 | `agentfarm.assignProject` | Assign Agent to Project… | Agent Farm |
| 44 | `agentfarm.assignSessionProject` | Project: file this session… (attach · move · take off · leave to the rules) | Agent Farm |
| 45 | `agentfarm.projectFromSession` | Project: new project from this session… | Agent Farm |
| 46 | `agentfarm.addSessionFolderToProject` | Project: add this session's folder as a code root… | Agent Farm |
| 47 | `agentfarm.openProjects` | Open Projects | Agent Farm |
| 48 | `agentfarm.openProject` | Open Project | Agent Farm |
| 49 | `agentfarm.newProject` | New Project… (name it, and say where its documents live) | Agent Farm |
| 50 | `agentfarm.setActiveProject` | Set Active Project (sessions started here are filed under it) | Agent Farm |
| 51 | `agentfarm.rescanProjects` | Rescan Project Folders (pick up renames made in Obsidian) | Agent Farm |
| 52 | `agentfarm.opencodeRefreshHistory` | Refresh OpenCode History (read its CLI now instead of waiting for the slow beat) | Agent Farm |
| 53 | `agentfarm.opencodeExportSession` | Export OpenCode Conversation (full JSON, or redacted with --sanitize) | Agent Farm |
| 54 | `agentfarm.opencodeDeleteSession` | Delete OpenCode Conversation (permanently, from the engine's own store) | Agent Farm |
| 55 | `agentfarm.projectHandover` | Write Project Handover (the letter to whoever picks this up in three months) | Agent Farm |
| 56 | `agentfarm.archiveProject` | Archive Project Folder… (move it to its archive counterpart) | Agent Farm |
| 57 | `agentfarm.saveProjectTemplate` | Save Project as Template… (you pick what travels) | Agent Farm |
| 58 | `agentfarm.openPortfolio` | Open Agent Portfolio (the whole fleet on one screen) | Agent Farm |
| 59 | `agentfarm.openEditedFile` | Open File the Agent Edited | Agent Farm |
| 60 | `agentfarm.insightHistory` | Insight History… (what keeps coming back, and did the fix hold) | Agent Farm |
| 61 | `agentfarm.openWebView` | Open Web View… (read-only, phone-friendly) | Agent Farm |
| 62 | `agentfarm.connectTelegram` | Connect Telegram… (message an agent from your phone) | Agent Farm |
| 63 | `agentfarm.openAgentDetail` | Open Agent Detail | Agent Farm |
| 64 | `agentfarm.openAgentInNewWindow` | Open Agent in New Window | Agent Farm |
| 65 | `agentfarm.revealAgent` | Reveal in File Explorer | Agent Farm |
| 66 | `agentfarm.openSession` | Open Transcript | Agent Farm |
| 67 | `agentfarm.resumeSession` | Resume in Terminal | Agent Farm |
| 68 | `agentfarm.renameSession` | Rename Session… | Agent Farm |
| 69 | `agentfarm.pinSession` | Pin / Unpin Session | Agent Farm |
| 70 | `agentfarm.tagSession` | Label Session… | Agent Farm |
| 71 | `agentfarm.setSessionAlertVoice` | Sound: This Session… | Agent Farm |
| 72 | `agentfarm.toggleMute` | Sound: Mute All / Unmute | Agent Farm |
| 73 | `agentfarm.sessionToWiki` | Add to Wiki Candidates… | Agent Farm |
| 74 | `agentfarm.compileWiki` | Compile Wiki Candidates… | Agent Farm |
| 75 | `agentfarm.copySessionId` | Copy Session ID | Agent Farm |
| 76 | `agentfarm.copyCorpus` | Copy Corpus | Agent Farm |
| 77 | `agentfarm.copyAgentName` | Copy Agent Name | Agent Farm |
| 78 | `agentfarm.copyAgentFolder` | Copy Agent Folder | Agent Farm |
| 79 | `agentfarm.copyChainId` | Copy Chain ID | Agent Farm |
| 80 | `agentfarm.showChain` | Show This Chain | Agent Farm |
| 81 | `agentfarm.copySessionPath` | Copy Transcript Path | Agent Farm |
| 82 | `agentfarm.copySessionCwd` | Copy Working Folder | Agent Farm |
| 83 | `agentfarm.revealSessionFolder` | Reveal Working Folder | Agent Farm |
| 84 | `agentfarm.sessionToQueue` | Add to Work Queue… | Agent Farm |
| 85 | `agentfarm.openSessionAgent` | Open Its Agent | Agent Farm |
| 86 | `agentfarm.sessionShelf` | Session Shelf… (pinned + recent) | Agent Farm |
| 87 | `agentfarm.interruptSession` | Interrupt Session | Agent Farm |
| 88 | `agentfarm.endSession` | End Session (stop its process) | Agent Farm |
| 89 | `agentfarm.forceKillSession` | Force Kill Session Tree (stop the daemon too) | Agent Farm |
| 90 | `agentfarm.dismissSession` | Clear Session From Live Timeline | Agent Farm |
| 91 | `agentfarm.consoleInterruptTurn` | Interrupt Turn | Agent Farm |
| 92 | `agentfarm.consoleEndSession` | End Session | Agent Farm |
| 93 | `agentfarm.consoleEndAndRemove` | End & Remove Session | Agent Farm |
| 94 | `agentfarm.consoleForgetSession` | Remove From List | Agent Farm |
| 95 | `agentfarm.consoleResumeSession` | Continue This Session Here | Agent Farm |
| 96 | `agentfarm.openFile` | Open File | Agent Farm |
| 97 | `agentfarm.addTask` | Add Task | Agent Farm |
| 98 | `agentfarm.addSchedule` | Add Scheduled Task | Agent Farm |
| 99 | `agentfarm.startTask` | Start Task | Agent Farm |
| 100 | `agentfarm.completeTask` | Mark Done | Agent Farm |
| 101 | `agentfarm.cancelTask` | Cancel Task | Agent Farm |
| 102 | `agentfarm.deleteTask` | Delete Task | Agent Farm |
| 103 | `agentfarm.retryTask` | Retry | Agent Farm |
| 104 | `agentfarm.retryTaskEdit` | Retry with edited prompt… | Agent Farm |
| 105 | `agentfarm.resumeWorkflow` | Resume workflow from this step | Agent Farm |
| 106 | `agentfarm.workflowLive` | Steer a Running Workflow… | Agent Farm |
| 107 | `agentfarm.cleanupStuck` | Clean Up Stuck Items… | Agent Farm |
| 108 | `agentfarm.batonLegs` | Chain Legs… | Agent Farm |
| 109 | `agentfarm.runTaskNext` | Run Next | Agent Farm |
| 110 | `agentfarm.taskUp` | Move Up | Agent Farm |
| 111 | `agentfarm.taskDown` | Move Down | Agent Farm |
| 112 | `agentfarm.clearDoneTasks` | Clear Finished Tasks | Agent Farm |
| 113 | `agentfarm.toggleSchedule` | Enable/Disable Schedule | Agent Farm |
| 114 | `agentfarm.pauseAutomations` | Pause All Automations (master switch) | Agent Farm |
| 115 | `agentfarm.resumeAutomations` | Resume All Automations | Agent Farm |
| 116 | `agentfarm.setQuietHours` | Set Quiet Hours (no unattended wake-ups) | Agent Farm |
| 117 | `agentfarm.runScheduleNow` | Run Now | Agent Farm |
| 118 | `agentfarm.deleteSchedule` | Delete Schedule | Agent Farm |
| 119 | `agentfarm.revealTaskTerminal` | Reveal Task Terminal | Agent Farm |
| 120 | `agentfarm.saveTaskTemplate` | Save as Template | Agent Farm |
| 121 | `agentfarm.runTemplate` | New Task from Template | Agent Farm |
| 122 | `agentfarm.deleteTemplate` | Delete Template | Agent Farm |
| 123 | `agentfarm.newWorkflow` | New Multi-Agent Workflow… | Agent Farm |
| 124 | `agentfarm.runWorkflow` | Run Workflow | Agent Farm |
| 125 | `agentfarm.deleteWorkflow` | Delete Workflow | Agent Farm |
| 126 | `agentfarm.openTaskOutput` | Open Task Output | Agent Farm |
| 127 | `agentfarm.exportSchtask` | Export as Windows Scheduled Task… | Agent Farm |
| 128 | `agentfarm.syncMemory` | Sync Shared Memory… | Agent Farm |
| 129 | `agentfarm.exportReport` | Export Fleet Report (Markdown) | Agent Farm |
| 130 | `agentfarm.exportOutputsDigest` | Export Task Outputs Digest (Markdown) | Agent Farm |
| 131 | `agentfarm.applyMergedMemory` | Apply Merged Memory | Agent Farm |
| 132 | `agentfarm.quickStart` | Quick Start | Agent Farm |
| 133 | `agentfarm.openExamples` | Open Examples | Agent Farm |
| 134 | `agentfarm.openRoadmap` | Open Development Plan | Agent Farm |
| 135 | `agentfarm.addDuty` | Add Standing Duty | Agent Farm |
| 136 | `agentfarm.toggleDuty` | Pause/Resume Duty | Agent Farm |
| 137 | `agentfarm.editDuty` | Edit Duty… | Agent Farm |
| 138 | `agentfarm.addMemory` | New Memory File… | Agent Farm |
| 139 | `agentfarm.archiveMemory` | Archive Memory File | Agent Farm |
| 140 | `agentfarm.openMemoryGraph` | Open Memory Graph | Agent Farm |
| 141 | `agentfarm.fixMemoryIndex` | Fix Memory Index… | Agent Farm |
| 142 | `agentfarm.copyMemory` | Copy Memory File to Agent… | Agent Farm |
| 143 | `agentfarm.scanMemoryContradictions` | Scan Memory Contradictions… (cheap model) | Agent Farm |
| 144 | `agentfarm.addDutyFromTemplate` | Add Duty from Template… | Agent Farm |
| 145 | `agentfarm.automateDuty` | Automate Duty (create trigger)… | Agent Farm |
| 146 | `agentfarm.copyDuty` | Copy Duty to Agent… | Agent Farm |
| 147 | `agentfarm.moveDutyUp` | Move Duty Up | Agent Farm |
| 148 | `agentfarm.moveDutyDown` | Move Duty Down | Agent Farm |
| 149 | `agentfarm.deleteDuty` | Delete Duty | Agent Farm |
| 150 | `agentfarm.openDuties` | Open DUTIES.md | Agent Farm |
| 151 | `agentfarm.renameWorkflow` | Rename Workflow | Agent Farm |
| 152 | `agentfarm.addWorkflowStep` | Add Step | Agent Farm |
| 153 | `agentfarm.editWorkflowStep` | Edit Step… | Agent Farm |
| 154 | `agentfarm.moveWorkflowStepUp` | Move Step Up | Agent Farm |
| 155 | `agentfarm.moveWorkflowStepDown` | Move Step Down | Agent Farm |
| 156 | `agentfarm.deleteWorkflowStep` | Delete Step | Agent Farm |
| 157 | `agentfarm.addTrigger` | Add Trigger | Agent Farm |
| 158 | `agentfarm.toggleTrigger` | Enable/Disable Trigger | Agent Farm |
| 159 | `agentfarm.deleteTrigger` | Delete Trigger | Agent Farm |
| 160 | `agentfarm.fireTrigger` | Fire Now | Agent Farm |
| 161 | `agentfarm.editTrigger` | Edit Trigger (prompt, agent, timing) | Agent Farm |
| 162 | `agentfarm.terminalRenderFix` | Terminal Rendering Fix (ghost spaces / lost lines)… | Agent Farm |
| 163 | `agentfarm.openTaskHistory` | Open Task History | Agent Farm |
| 164 | `agentfarm.openForecast` | Task Forecast | Agent Farm |
| 165 | `agentfarm.setSecret` | Set Secret… | Agent Farm |
| 166 | `agentfarm.deleteSecret` | Delete Secret… | Agent Farm |
| 167 | `agentfarm.listSecrets` | List Secrets | Agent Farm |
| 168 | `agentfarm.addMcpServer` | Add MCP Server… | Agent Farm |
| 169 | `agentfarm.removeMcpServer` | Remove MCP Server | Agent Farm |
| 170 | `agentfarm.addSkill` | Add Skill… | Agent Farm |
| 171 | `agentfarm.removeSkill` | Remove Skill | Agent Farm |
| 172 | `agentfarm.duplicateSkill` | Copy Skill to Agent… | Agent Farm |
| 173 | `agentfarm.shareSkill` | Move Skill Between Agent/User Scope… | Agent Farm |
| 174 | `agentfarm.revealSkill` | Reveal Skill Folder | Agent Farm |
| 175 | `agentfarm.editMcpServer` | Edit MCP Server… | Agent Farm |
| 176 | `agentfarm.disableMcpServer` | Disable MCP Server (this agent) | Agent Farm |
| 177 | `agentfarm.enableMcpServer` | Enable MCP Server (this agent) | Agent Farm |
| 178 | `agentfarm.copyMcpServer` | Copy MCP Server to Agent… | Agent Farm |
| 179 | `agentfarm.openCapabilities` | Open Capability Matrix (Skills × MCP × Agents) | Agent Farm |
| 180 | `agentfarm.openBacklog` | Open Backlog (the active project's standing pile of work) | Agent Farm |
| 181 | `agentfarm.openToolbox` | Open Toolbox (Skills · Subagents · Commands · MCP · Hooks · Plugins) | Agent Farm |
| 182 | `agentfarm.openAirtable` | Open Airtable Engine (instances · folders · agent tools) | Agent Farm |
| 183 | `agentfarm.openSecrets` | Manage Secrets (keychain vault) | Agent Farm |
| 184 | `agentfarm.openEngines` | Open Engines (which CLI can run, and how it is paid for) | Agent Farm |
| 185 | `agentfarm.openAccounts` | Open Accounts (every captured sign-in, and how much of its plan is left) | Agent Farm |
| 186 | `agentfarm.openTurns` | Open Turns (every turn across the farm) | Agent Farm |
| 187 | `agentfarm.openSessions` | Open Sessions (every conversation, on its own page) | Agent Farm |
| 188 | `agentfarm.copyWebhookUrl` | Copy Webhook URL | Agent Farm |
| 189 | `agentfarm.openStudio` | Open Studio (content production: pipeline · assets · triage · assemble) | Agent Farm |
| 190 | `agentfarm.openGallery` | Open Media Gallery (the Studio's Assets tab) | Agent Farm |
| 191 | `agentfarm.newProduction` | New Production (scene manifest) | Agent Farm |
| 192 | `agentfarm.registerAsset` | Register Media Asset(s)… | Agent Farm |
| 193 | `agentfarm.exportSequence` | Export Premiere Sequence (XML + EDL)… | Agent Farm |
| 194 | `agentfarm.rerunMedia` | Re-run Media Job | Agent Farm |
| 195 | `agentfarm.addRecipe` | New Recipe Workflow… | Agent Farm |
| 196 | `agentfarm.searchTranscripts` | Search Transcripts… | Agent Farm |
| 197 | `agentfarm.findSession` | Find Session by ID… | Agent Farm |
| 198 | `agentfarm.openFarmSettings` | Farm Settings (all settings, setting sets) | Agent Farm |
| 199 | `agentfarm.openSound` | Sound: Open | Agent Farm |
| 200 | `agentfarm.stopReading` | Sound: Stop Reading | Agent Farm |
| 201 | `agentfarm.focusSessionTerminal` | Focus Session Terminal | Agent Farm |
| 202 | `agentfarm.sampleQualityNow` | Sample Output Quality Now | Agent Farm |
| 203 | `agentfarm.scanSuggestionsNow` | Scan for Instruction Suggestions… | Agent Farm |
| 204 | `agentfarm.reviewSuggestions` | Review Instruction Suggestions… | Agent Farm |
| 205 | `agentfarm.weeklySummaryNow` | Generate Weekly Summary Now | Agent Farm |
| 206 | `agentfarm.sendDigestNow` | Send Daily Digest Now | Agent Farm |
| 207 | `agentfarm.exportAgentPack` | Export Agent Pack… | Agent Farm |
| 208 | `agentfarm.importAgentPack` | Import Agent Pack… | Agent Farm |
| 209 | `agentfarm.syncAntigravity` | Sync Agent with the Other Engines… | Agent Farm |
| 210 | `agentfarm.syncConstitution` | Sync Shared Constitution with the Other Engines… | Agent Farm |
| 211 | `agentfarm.commandBar` | Natural Language Command… | Agent Farm |
| 212 | `agentfarm.testDispatch` | Test Dispatcher… | Agent Farm |
| 213 | `agentfarm.buildSemanticIndex` | Build Semantic Index | Agent Farm |
| 214 | `agentfarm.openUltraRoadmap` | Open Ultra Roadmap | Agent Farm |
| 215 | `agentfarm.openNow` | Open Now (what waits, what runs, today) | Agent Farm |
| 216 | `agentfarm.openNeeds` | Open Needs You (Approval Queue) | Agent Farm |
| 217 | `agentfarm.openNotices` | Open Notices (Agent → You message board) | Agent Farm |
| 218 | `agentfarm.openQueue` | Open Work Queue (You → Agent async work channel) | Agent Farm |
| 219 | `agentfarm.openA2ANotes` | Open A2A Notes (what agents leave for each other) | Agent Farm |
| 220 | `agentfarm.openA2ATasks` | Open A2A Tasks (work agents hand to each other) | Agent Farm |
| 221 | `agentfarm.queueAdd` | Add to Queue | Agent Farm |
| 222 | `agentfarm.openWiki` | Open Wiki (candidate pool + the vault's own pages) | Agent Farm |
| 223 | `agentfarm.backlogAdd` | Add to Backlog | Agent Farm |
| 224 | `agentfarm.configureDocOpen` | Configure Which Editor Documents Open In | Agent Farm |
| 225 | `agentfarm.openTasks` | Open Tasks (Board · Automations · Reusables · Analytics) | Agent Farm |
| 226 | `agentfarm.openTaskAnalytics` | Open Task Analytics (30d throughput, scorecards, forecast) | Agent Farm |
| 227 | `agentfarm.openBoard` | Open Task Board (Kanban) | Agent Farm |
| 228 | `agentfarm.costReport` | Cost Anomaly Report | Agent Farm |
| 229 | `agentfarm.addEvalCase` | Add Eval Case… | Agent Farm |
| 230 | `agentfarm.runEvals` | Run Eval Set… | Agent Farm |
| 231 | `agentfarm.reviewEvalCases` | Review Eval Cases… | Agent Farm |
| 232 | `agentfarm.runPulseNow` | Run Pulse Check Now | Agent Farm |
| 233 | `agentfarm.triggerReport` | Trigger Reliability Report | Agent Farm |
| 234 | `agentfarm.installFarmService` | Install Headless Service (Windows)… | Agent Farm |
| 235 | `agentfarm.removeFarmService` | Remove Headless Service | Agent Farm |
| 236 | `agentfarm.farmServiceStatus` | Headless Service Status | Agent Farm |
| 237 | `agentfarm.instructionHistory` | Instruction History & Impact… | Agent Farm |
| 238 | `agentfarm.abTest` | A/B Instruction Experiment… | Agent Farm |
| 239 | `agentfarm.distillMemory` | Distill Memory File… | Agent Farm |
| 240 | `agentfarm.askMemory` | Ask Fleet Memory… (Semantic) | Agent Farm |
| 241 | `agentfarm.runParallel` | Run Parallel Worktrees… | Agent Farm |
| 242 | `agentfarm.worktreeRuns` | Worktree Runs… (Merge / Discard) | Agent Farm |
| 243 | `agentfarm.exportOtel` | Export Traces (OpenTelemetry JSON)… | Agent Farm |
| 244 | `agentfarm.browsePackGallery` | Browse Agent Pack Gallery… | Agent Farm |
| 245 | `agentfarm.speakDigest` | Sound: Speak Daily Briefing | Agent Farm |
| 246 | `agentfarm.exportRelayScript` | Save Relay Script for Another Machine… | Agent Farm |
| 247 | `agentfarm.copyCliHookCommand` | Copy CLI Hook Bridge Command (external CLI events) | Agent Farm |
| 248 | `agentfarm.ctx.backlogGo` | Open at this line | Agent Farm |
| 249 | `agentfarm.ctx.backlogTrack` | Where has this been worked? | Agent Farm |
| 250 | `agentfarm.ctx.backlogEdit` | Edit the words… | Agent Farm |
| 251 | `agentfarm.ctx.backlogFile` | File it under an area… | Agent Farm |
| 252 | `agentfarm.ctx.backlogQueue` | Put it in the work queue… | Agent Farm |
| 253 | `agentfarm.ctx.backlogGather` | Gather its parts under it | Agent Farm |
| 254 | `agentfarm.ctx.backlogJoinParent` | Send it under its parent | Agent Farm |
| 255 | `agentfarm.ctx.blGoVscode` | Editor | Agent Farm |
| 256 | `agentfarm.ctx.blGoPreview` | Preview | Agent Farm |
| 257 | `agentfarm.ctx.blGoObsidian` | Obsidian | Agent Farm |
| 258 | `agentfarm.ctx.blGoCustom` | Your app | Agent Farm |
| 259 | `agentfarm.ctx.blStateOpen` | Open — not started | Agent Farm |
| 260 | `agentfarm.ctx.blStateDoing` | Started ▶ | Agent Farm |
| 261 | `agentfarm.ctx.blStateDone` | Done | Agent Farm |
| 262 | `agentfarm.ctx.blStateCancelled` | Cancelled | Agent Farm |
| 263 | `agentfarm.ctx.blPrioHighest` | 🔺 highest | Agent Farm |
| 264 | `agentfarm.ctx.blPrioHigh` | ⏫ high | Agent Farm |
| 265 | `agentfarm.ctx.blPrioMedium` | 🔼 medium | Agent Farm |
| 266 | `agentfarm.ctx.blPrioNormal` | normal — no icon on the line | Agent Farm |
| 267 | `agentfarm.ctx.blPrioLow` | 🔽 low | Agent Farm |
| 268 | `agentfarm.ctx.blPrioLowest` | ⏬ lowest | Agent Farm |
| 269 | `agentfarm.ctx.blEffortNone` | not sized | Agent Farm |
| 270 | `agentfarm.ctx.blEffortXS` | XS — five minutes | Agent Farm |
| 271 | `agentfarm.ctx.blEffortS` | S — half an hour | Agent Farm |
| 272 | `agentfarm.ctx.blEffortM` | M — half a day | Agent Farm |
| 273 | `agentfarm.ctx.blEffortL` | L — a day | Agent Farm |
| 274 | `agentfarm.ctx.blEffortXL` | XL — split it before anybody starts | Agent Farm |
| 275 | `agentfarm.ctx.blTypeNone` | no type — your own tags stay | Agent Farm |
| 276 | `agentfarm.ctx.blTypeBug` | #bug — bug fix | Agent Farm |
| 277 | `agentfarm.ctx.blTypeResearch` | #research — research / measure | Agent Farm |
| 278 | `agentfarm.ctx.blTypeFeat` | #feat — development | Agent Farm |
| 279 | `agentfarm.ctx.blTypeUx` | #ux — UI / UX | Agent Farm |
| 280 | `agentfarm.ctx.blTypeChore` | #chore — chore | Agent Farm |
| 281 | `agentfarm.ctx.blTypeDebt` | #debt — tech debt | Agent Farm |
| 282 | `agentfarm.ctx.blTypeDoc` | #doc — docs | Agent Farm |
| 283 | `agentfarm.ctx.blTypeIdea` | #idea — idea | Agent Farm |
| 284 | `agentfarm.ctx.blMoveTop` | To the front of the queue | Agent Farm |
| 285 | `agentfarm.ctx.blMoveUp5` | Up 5 | Agent Farm |
| 286 | `agentfarm.ctx.blMoveUp1` | Up 1 | Agent Farm |
| 287 | `agentfarm.ctx.blMoveDown1` | Down 1 | Agent Farm |
| 288 | `agentfarm.ctx.blMoveDown5` | Down 5 | Agent Farm |
| 289 | `agentfarm.ctx.blMoveBottom` | To the back of the queue | Agent Farm |
| 290 | `agentfarm.ctx.blCopyCode` | The code, on its own | Agent Farm |
| 291 | `agentfarm.ctx.blCopyText` | The words | Agent Farm |
| 292 | `agentfarm.ctx.blCopyBoth` | Code and words | Agent Farm |
| 293 | `agentfarm.ctx.trackOnly` | Show only this item's history | Agent Farm |
| 294 | `agentfarm.ctx.trackOpen` | Open the backlog document at this item's line | Agent Farm |
| 295 | `agentfarm.ctx.trackRecord` | Record an event against it… | Agent Farm |
| 296 | `agentfarm.ctx.trackFillOne` | Reconstruct its history… | Agent Farm |
| 297 | `agentfarm.ctx.trkCopyCode` | The code | Agent Farm |
| 298 | `agentfarm.ctx.trkCopyStamp` | Where it was closed — session#turn | Agent Farm |
| 299 | `agentfarm.ctx.trkCopySessions` | Every session id that worked it | Agent Farm |
| 300 | `agentfarm.ctx.trkCopyReport` | The whole history, as text | Agent Farm |
| 301 | `agentfarm.ctx.planTick` | Tick it — mark it done | Agent Farm |
| 302 | `agentfarm.ctx.planUntick` | Untick it — put it back to open | Agent Farm |
| 303 | `agentfarm.ctx.planOpen` | Open the plan document | Agent Farm |
| 304 | `agentfarm.ctx.planOpenVscode` | Editor | Agent Farm |
| 305 | `agentfarm.ctx.planOpenPreview` | Preview | Agent Farm |
| 306 | `agentfarm.ctx.planOpenObsidian` | Obsidian | Agent Farm |
| 307 | `agentfarm.ctx.planOpenCustom` | Your app | Agent Farm |
| 308 | `agentfarm.ctx.planCopyText` | Copy the words | Agent Farm |
| 309 | `agentfarm.ctx.planCopyId` | Copy its 🆔 id | Agent Farm |
| 310 | `agentfarm.ctx.docOpen` | Open | Agent Farm |
| 311 | `agentfarm.ctx.docOpenVscode` | Editor | Agent Farm |
| 312 | `agentfarm.ctx.docOpenPreview` | Preview | Agent Farm |
| 313 | `agentfarm.ctx.docOpenObsidian` | Obsidian | Agent Farm |
| 314 | `agentfarm.ctx.docOpenCustom` | Your app | Agent Farm |
| 315 | `agentfarm.ctx.docShow` | Show it in the pane | Agent Farm |
| 316 | `agentfarm.ctx.docCopyPath` | Copy its path | Agent Farm |
| 317 | `agentfarm.ctx.docCopyFull` | Copy its full path | Agent Farm |
| 318 | `agentfarm.ctx.projOpen` | Open this project | Agent Farm |
| 319 | `agentfarm.ctx.projSessions` | Show its sessions | Agent Farm |
| 320 | `agentfarm.ctx.projBacklog` | Open its backlog | Agent Farm |
| 321 | `agentfarm.ctx.projActive` | Make it the active project | Agent Farm |
| 322 | `agentfarm.ctx.projInactive` | It is the active project — clear that | Agent Farm |
| 323 | `agentfarm.ctx.projSettings` | Edit it… | Agent Farm |
| 324 | `agentfarm.ctx.projReveal` | Reveal its folder | Agent Farm |
| 325 | `agentfarm.ctx.projCopyName` | Its name | Agent Farm |
| 326 | `agentfarm.ctx.projCopyId` | Its id — what an agent quotes | Agent Farm |
| 327 | `agentfarm.ctx.projCopyFolder` | Its folder path | Agent Farm |
| 328 | `agentfarm.ctx.feedOpen` | Open what this points at | Agent Farm |
| 329 | `agentfarm.ctx.feedOnly` | Show only this kind of line | Agent Farm |
| 330 | `agentfarm.ctx.feedHide` | Hide this kind of line | Agent Farm |
| 331 | `agentfarm.ctx.feedCopy` | Copy the line | Agent Farm |
| 332 | `agentfarm.ctx.planRun` | Run it now | Agent Farm |
| 333 | `agentfarm.ctx.planRuns` | Show what it has run | Agent Farm |
| 334 | `agentfarm.ctx.planDetail` | Show its prompt and timing here | Agent Farm |
| 335 | `agentfarm.ctx.planOn` | Switch it on | Agent Farm |
| 336 | `agentfarm.ctx.planOff` | Switch it off | Agent Farm |
| 337 | `agentfarm.ctx.planEdit` | Edit it… | Agent Farm |
| 338 | `agentfarm.ctx.planExport` | Export as a Windows Scheduled Task… | Agent Farm |
| 339 | `agentfarm.ctx.planHistory` | Open the task history | Agent Farm |
| 340 | `agentfarm.ctx.plCopyTitle` | Its name | Agent Farm |
| 341 | `agentfarm.ctx.plCopyPrompt` | The prompt it runs | Agent Farm |
| 342 | `agentfarm.ctx.plCopyWhen` | When it runs | Agent Farm |
| 343 | `agentfarm.ctx.plCopyId` | Its id — what an agent quotes | Agent Farm |
| 344 | `agentfarm.ctx.planDelete` | Delete it… | Agent Farm |
| 345 | `agentfarm.ctx.wfStepEdit` | Edit this step… | Agent Farm |
| 346 | `agentfarm.ctx.wfStepUp` | Move it up | Agent Farm |
| 347 | `agentfarm.ctx.wfStepDown` | Move it down | Agent Farm |
| 348 | `agentfarm.ctx.wfStepCopy` | Copy the step | Agent Farm |
| 349 | `agentfarm.ctx.wfStepDelete` | Delete this step… | Agent Farm |
| 350 | `agentfarm.ctx.runOutput` | Open its output | Agent Farm |
| 351 | `agentfarm.ctx.runTranscript` | Open the transcript | Agent Farm |
| 352 | `agentfarm.ctx.runTerminal` | Reveal its terminal | Agent Farm |
| 353 | `agentfarm.ctx.runDetail` | Show the prompt and where it came from | Agent Farm |
| 354 | `agentfarm.ctx.runSource` | Show what started it | Agent Farm |
| 355 | `agentfarm.ctx.runStart` | Start it now | Agent Farm |
| 356 | `agentfarm.ctx.runUnpark` | Try to start it again | Agent Farm |
| 357 | `agentfarm.ctx.runAgain` | Run it again | Agent Farm |
| 358 | `agentfarm.ctx.runRetryEdit` | Run it again, with changes… | Agent Farm |
| 359 | `agentfarm.ctx.runClone` | New task like this one… | Agent Farm |
| 360 | `agentfarm.ctx.runResumeWf` | Resume the workflow from this step | Agent Farm |
| 361 | `agentfarm.ctx.runNext` | To the front of the queue | Agent Farm |
| 362 | `agentfarm.ctx.runUp` | Up one | Agent Farm |
| 363 | `agentfarm.ctx.runDown` | Down one | Agent Farm |
| 364 | `agentfarm.ctx.runTemplate` | Save the prompt as a template… | Agent Farm |
| 365 | `agentfarm.ctx.tkCopyPrompt` | The prompt it ran | Agent Farm |
| 366 | `agentfarm.ctx.tkCopyTitle` | Its name | Agent Farm |
| 367 | `agentfarm.ctx.tkCopyId` | Its id | Agent Farm |
| 368 | `agentfarm.ctx.tkCopyOutput` | The output file path | Agent Farm |
| 369 | `agentfarm.ctx.runCancel` | Cancel it | Agent Farm |
| 370 | `agentfarm.ctx.runDelete` | Delete this run | Agent Farm |
| 371 | `agentfarm.ctx.msnOpen` | Open this run | Agent Farm |
| 372 | `agentfarm.ctx.msnFold` | Fold it back to a row | Agent Farm |
| 373 | `agentfarm.ctx.msnPlanner` | Open the lead's planner transcript | Agent Farm |
| 374 | `agentfarm.ctx.msnApprove` | Approve this round | Agent Farm |
| 375 | `agentfarm.ctx.msnReject` | Reject this round | Agent Farm |
| 376 | `agentfarm.ctx.msnAnswer` | Answer its question… | Agent Farm |
| 377 | `agentfarm.ctx.msnPause` | Pause it | Agent Farm |
| 378 | `agentfarm.ctx.msnUnpause` | Withdraw the pause — keep it running | Agent Farm |
| 379 | `agentfarm.ctx.msnResume` | Resume it | Agent Farm |
| 380 | `agentfarm.ctx.msnRerun` | Run this mission again… | Agent Farm |
| 381 | `agentfarm.ctx.msCopyGoal` | The goal it was given | Agent Farm |
| 382 | `agentfarm.ctx.msCopyVerdict` | The verdict and its summary | Agent Farm |
| 383 | `agentfarm.ctx.msCopyLedger` | The ledger — one line per round | Agent Farm |
| 384 | `agentfarm.ctx.msCopyId` | The run id | Agent Farm |
| 385 | `agentfarm.ctx.msnCancel` | Cancel the mission… | Agent Farm |
| 386 | `agentfarm.ctx.msnDelete` | Delete this run from the history… | Agent Farm |
| 387 | `agentfarm.ctx.msStepOpen` | Show its prompt and output here | Agent Farm |
| 388 | `agentfarm.ctx.msStepOut` | Open the delegation output | Agent Farm |
| 389 | `agentfarm.ctx.msStepSession` | Open the session it ran in | Agent Farm |
| 390 | `agentfarm.ctx.msStepAgent` | Open the agent that ran it | Agent Farm |
| 391 | `agentfarm.ctx.mstCopyPrompt` | The prompt it was given | Agent Farm |
| 392 | `agentfarm.ctx.mstCopyTitle` | The task title | Agent Farm |
| 393 | `agentfarm.ctx.mstCopyOutput` | The output file path | Agent Farm |
| 394 | `agentfarm.ctx.msRoundOpen` | Expand this round | Agent Farm |
| 395 | `agentfarm.ctx.msRoundClose` | Fold this round | Agent Farm |
| 396 | `agentfarm.ctx.msRoundOnly` | Only this round open | Agent Farm |
| 397 | `agentfarm.ctx.msRoundCopy` | Copy the round — the planner's thought and its steps | Agent Farm |
| 398 | `agentfarm.ctx.msTeamOpen` | Open this agent | Agent Farm |
| 399 | `agentfarm.ctx.msTeamTalk` | Talk to it in the Console… | Agent Farm |
| 400 | `agentfarm.ctx.msTeamCopy` | Copy its name, role and model | Agent Farm |
| 401 | `agentfarm.ctx.ntOpen` | Open it here | Agent Farm |
| 402 | `agentfarm.ctx.ntFold` | Fold it back to a line | Agent Farm |
| 403 | `agentfarm.ctx.ntReport` | Open the full report | Agent Farm |
| 404 | `agentfarm.ctx.ntOrig` | Show what it said before it was edited | Agent Farm |
| 405 | `agentfarm.ctx.ntRead` | Mark it read | Agent Farm |
| 406 | `agentfarm.ctx.ntUnread` | Mark it unread | Agent Farm |
| 407 | `agentfarm.ctx.ntPin` | Pin it to the top | Agent Farm |
| 408 | `agentfarm.ctx.ntUnpin` | Unpin it | Agent Farm |
| 409 | `agentfarm.ctx.ntStars0` | none | Agent Farm |
| 410 | `agentfarm.ctx.ntStars1` | ★ | Agent Farm |
| 411 | `agentfarm.ctx.ntStars2` | ★★ | Agent Farm |
| 412 | `agentfarm.ctx.ntStars3` | ★★★ | Agent Farm |
| 413 | `agentfarm.ctx.ntEdit` | Edit it… | Agent Farm |
| 414 | `agentfarm.ctx.ntAnswer` | Answer it… | Agent Farm |
| 415 | `agentfarm.ctx.ntDecline` | Pass it over without answering | Agent Farm |
| 416 | `agentfarm.ctx.ntHand` | Hand it to its agent | Agent Farm |
| 417 | `agentfarm.ctx.ntQueue` | Add it to the work queue… | Agent Farm |
| 418 | `agentfarm.ctx.ntExport` | Export it as Markdown | Agent Farm |
| 419 | `agentfarm.ctx.ntOnlyAgent` | What this agent has said | Agent Farm |
| 420 | `agentfarm.ctx.ntOnlyType` | This kind of message | Agent Farm |
| 421 | `agentfarm.ctx.ntOnlyLevel` | This level and nothing else | Agent Farm |
| 422 | `agentfarm.ctx.ntCopyTitle` | Its title | Agent Farm |
| 423 | `agentfarm.ctx.ntCopyBody` | Its whole text | Agent Farm |
| 424 | `agentfarm.ctx.ntCopyId` | Its id — what an agent quotes | Agent Farm |
| 425 | `agentfarm.ctx.ntDismiss` | Dismiss it | Agent Farm |
| 426 | `agentfarm.ctx.ntDelete` | Delete this question | Agent Farm |
| 427 | `agentfarm.ctx.qOpen` | Open it here | Agent Farm |
| 428 | `agentfarm.ctx.qFold` | Fold it back to a line | Agent Farm |
| 429 | `agentfarm.ctx.qNotice` | Open the notice it came from | Agent Farm |
| 430 | `agentfarm.ctx.qReport` | Open the report it produced | Agent Farm |
| 431 | `agentfarm.ctx.qAnswerFile` | Open the answer that was written | Agent Farm |
| 432 | `agentfarm.ctx.qAnswer` | Answer it — it is waiting on you… | Agent Farm |
| 433 | `agentfarm.ctx.qEdit` | Edit it… | Agent Farm |
| 434 | `agentfarm.ctx.qUrgNormal` | normal | Agent Farm |
| 435 | `agentfarm.ctx.qUrgSoon` | 🔼 soon | Agent Farm |
| 436 | `agentfarm.ctx.qUrgUrgent` | ⏫ urgent | Agent Farm |
| 437 | `agentfarm.ctx.qHand` | Hand it to an agent | Agent Farm |
| 438 | `agentfarm.ctx.qCopyText` | What it says | Agent Farm |
| 439 | `agentfarm.ctx.qCopyId` | Its id | Agent Farm |
| 440 | `agentfarm.ctx.a2nCopyId` | Its id — what an agent quotes | Agent Farm |
| 441 | `agentfarm.ctx.a2nCopyText` | Its title and text | Agent Farm |
| 442 | `agentfarm.ctx.a2tCopyId` | Its id — what an agent claims it by | Agent Farm |
| 443 | `agentfarm.ctx.a2tCopyText` | Its title and instructions | Agent Farm |
| 444 | `agentfarm.ctx.qDrop` | Drop it — void this capture | Agent Farm |
| 445 | `agentfarm.ctx.qRemove` | Delete it permanently | Agent Farm |
| 446 | `agentfarm.ctx.qlDropShow` | Show the dropped lane | Agent Farm |
| 447 | `agentfarm.ctx.qlDropHide` | Hide the dropped lane | Agent Farm |
| 448 | `agentfarm.ctx.qlCopy` | Copy this lane as Markdown | Agent Farm |
| 449 | `agentfarm.ctx.ndAgent` | Open the agent that is stuck | Agent Farm |
| 450 | `agentfarm.ctx.ndClear` | Clear this row — it comes back if it happens again | Agent Farm |
| 451 | `agentfarm.ctx.ndCopy` | Copy the row | Agent Farm |
| 452 | `agentfarm.ctx.tbOpen` | Open its file | Agent Farm |
| 453 | `agentfarm.ctx.tbReveal` | Reveal it in the file explorer | Agent Farm |
| 454 | `agentfarm.ctx.tbHome` | Open its homepage | Agent Farm |
| 455 | `agentfarm.ctx.tbProbe` | Ask it for its tool list | Agent Farm |
| 456 | `agentfarm.ctx.tbTools` | Show the tools it answered with | Agent Farm |
| 457 | `agentfarm.ctx.tbMcpOff` | Disable it for this agent | Agent Farm |
| 458 | `agentfarm.ctx.tbMcpOn` | Enable it for this agent | Agent Farm |
| 459 | `agentfarm.ctx.tbMcpEdit` | Edit its definition… | Agent Farm |
| 460 | `agentfarm.ctx.tbPlugOn` | Enable it — for every new claude session | Agent Farm |
| 461 | `agentfarm.ctx.tbPlugOff` | Disable it | Agent Farm |
| 462 | `agentfarm.ctx.tbCopyAgent` | Copy it to another agent… | Agent Farm |
| 463 | `agentfarm.ctx.tbScope` | Move it between user and agent scope… | Agent Farm |
| 464 | `agentfarm.ctx.tbCopyName` | Its name | Agent Farm |
| 465 | `agentfarm.ctx.tbCopyPath` | Its file path | Agent Farm |
| 466 | `agentfarm.ctx.tbCopyInvoke` | How you invoke it — /name | Agent Farm |
| 467 | `agentfarm.ctx.tbRemove` | Remove it — a backup is kept beside it | Agent Farm |
| 468 | `agentfarm.ctx.capOpen` | Open the file behind it | Agent Farm |
| 469 | `agentfarm.ctx.capTasks` | Open the full task history | Agent Farm |
| 470 | `agentfarm.ctx.capCopy` | Copy it to this agent… | Agent Farm |
| 471 | `agentfarm.ctx.capPath` | Copy its path | Agent Farm |
| 472 | `agentfarm.ctx.capRowOpen` | Open the file that defines it | Agent Farm |
| 473 | `agentfarm.ctx.capRowTasks` | Open the full task history | Agent Farm |
| 474 | `agentfarm.ctx.capRowName` | Copy its name | Agent Farm |
| 475 | `agentfarm.ctx.stOpenUi` | Open it in VS Code's settings editor | Agent Farm |
| 476 | `agentfarm.ctx.stReset` | Reset it to its default | Agent Farm |
| 477 | `agentfarm.ctx.stCopyKey` | Copy its setting key | Agent Farm |
| 478 | `agentfarm.ctx.stCopyValue` | Copy what it is set to | Agent Farm |
| 479 | `agentfarm.ctx.wvOpen` | Open it in the editor | Agent Farm |
| 480 | `agentfarm.ctx.wvReveal` | Show it in the folder | Agent Farm |
| 481 | `agentfarm.ctx.wvSettings` | Open Wiki settings | Agent Farm |
| 482 | `agentfarm.ctx.wvCopy` | Copy the absolute path | Agent Farm |
| 483 | `agentfarm.ctx.rtReveal` | Show the folder | Agent Farm |
| 484 | `agentfarm.ctx.rtAdd` | Add another root… | Agent Farm |
| 485 | `agentfarm.ctx.rtCopy` | Copy its path | Agent Farm |
| 486 | `agentfarm.ctx.rtRemove` | Stop scanning this root | Agent Farm |
| 487 | `agentfarm.ctx.scValue` | Replace its value… | Agent Farm |
| 488 | `agentfarm.ctx.scDesc` | Edit its description… | Agent Farm |
| 489 | `agentfarm.ctx.scScope` | Choose which agents may use it… | Agent Farm |
| 490 | `agentfarm.ctx.scCopyName` | Copy its name | Agent Farm |
| 491 | `agentfarm.ctx.scCopyRef` | Copy how a prompt refers to it — {secret:NAME} | Agent Farm |
| 492 | `agentfarm.ctx.scDelete` | Delete it from the keychain… | Agent Farm |
| 493 | `agentfarm.ctx.tnOpen` | Open the transcript at this turn | Agent Farm |
| 494 | `agentfarm.ctx.tnFold` | Show this turn's content here | Agent Farm |
| 495 | `agentfarm.ctx.tnWiki` | Keep this turn for the wiki… | Agent Farm |
| 496 | `agentfarm.ctx.tnCopyPrompt` | What was asked | Agent Farm |
| 497 | `agentfarm.ctx.tnCopyAnswer` | What came back | Agent Farm |
| 498 | `agentfarm.ctx.tnCopyAll` | The whole turn | Agent Farm |
| 499 | `agentfarm.ctx.tnCopyWhere` | Where it is — session id and turn number | Agent Farm |
| 500 | `agentfarm.ctx.shOpen` | Open the transcript at this moment | Agent Farm |
| 501 | `agentfarm.ctx.shOnlySession` | Search only this session | Agent Farm |
| 502 | `agentfarm.ctx.shOnlyAgent` | Search only this agent | Agent Farm |
| 503 | `agentfarm.ctx.shCopyLine` | The matching line | Agent Farm |
| 504 | `agentfarm.ctx.shCopyContext` | The line with what is around it | Agent Farm |
| 505 | `agentfarm.ctx.scOnly` | Choose only this | Agent Farm |
| 506 | `agentfarm.ctx.vtFold` | Fold this turn | Agent Farm |
| 507 | `agentfarm.ctx.vtUnfold` | Unfold this turn | Agent Farm |
| 508 | `agentfarm.ctx.vtOnly` | Only this turn open | Agent Farm |
| 509 | `agentfarm.ctx.vtJump` | Jump to it | Agent Farm |
| 510 | `agentfarm.ctx.vtWiki` | Keep this turn for the wiki… | Agent Farm |
| 511 | `agentfarm.ctx.vtExportOn` | Include it in Export MD | Agent Farm |
| 512 | `agentfarm.ctx.vtExportOff` | Leave it out of Export MD | Agent Farm |
| 513 | `agentfarm.ctx.vtExportOnly` | Export only this turn | Agent Farm |
| 514 | `agentfarm.ctx.vtCopyPrompt` | What was asked | Agent Farm |
| 515 | `agentfarm.ctx.vtCopyAnswer` | What came back | Agent Farm |
| 516 | `agentfarm.ctx.vtCopyAll` | The whole turn | Agent Farm |
| 517 | `agentfarm.ctx.vsFile` | Open the file it touched | Agent Farm |
| 518 | `agentfarm.ctx.vsOnlyKind` | Show only this kind of step | Agent Farm |
| 519 | `agentfarm.ctx.vsCopyText` | What it says | Agent Farm |
| 520 | `agentfarm.ctx.vsCopyTool` | What was sent to the tool | Agent Farm |
| 521 | `agentfarm.ctx.vsCopyResult` | What came back | Agent Farm |
| 522 | `agentfarm.ctx.vfOpen` | Open the file | Agent Farm |
| 523 | `agentfarm.ctx.vfDiff` | Diff it against git HEAD | Agent Farm |
| 524 | `agentfarm.ctx.vfHunks` | Show what this session changed in it | Agent Farm |
| 525 | `agentfarm.ctx.vfReveal` | Reveal it in the file explorer | Agent Farm |
| 526 | `agentfarm.ctx.vfCopy` | Copy its path | Agent Farm |
| 527 | `agentfarm.ctx.dhCopyNew` | Copy what it became | Agent Farm |
| 528 | `agentfarm.ctx.dhCopyOld` | Copy what it replaced | Agent Farm |
| 529 | `agentfarm.ctx.dhOpen` | Open the file at this change | Agent Farm |
| 530 | `agentfarm.ctx.cqNow` | Say it now, into the running turn | Agent Farm |
| 531 | `agentfarm.ctx.cqEdit` | Bring it back into the box to change it | Agent Farm |
| 532 | `agentfarm.ctx.cqCopy` | Copy what it says | Agent Farm |
| 533 | `agentfarm.ctx.cqDrop` | Drop it — it is never said | Agent Farm |
| 534 | `agentfarm.ctx.caAllow` | Allow it, once | Agent Farm |
| 535 | `agentfarm.ctx.caDeny` | Deny it | Agent Farm |
| 536 | `agentfarm.ctx.caSkip` | Skip the question — the turn carries on | Agent Farm |
| 537 | `agentfarm.ctx.caCopy` | Copy what it is asking | Agent Farm |
| 538 | `agentfarm.ctx.stOpen` | Open the page behind this number | Agent Farm |
| 539 | `agentfarm.ctx.stCopyVal` | Copy the figure | Agent Farm |
| 540 | `agentfarm.ctx.puCopy` | Copy the figures | Agent Farm |
| 541 | `agentfarm.ctx.insOpen` | Open the file it is about | Agent Farm |
| 542 | `agentfarm.ctx.insGuide` | What is this? — the guide entry | Agent Farm |
| 543 | `agentfarm.ctx.insCopy` | Copy what it says | Agent Farm |
| 544 | `agentfarm.ctx.lvGo` | Go to what it is about | Agent Farm |
| 545 | `agentfarm.ctx.lvCopy` | Copy the signal line | Agent Farm |
| 546 | `agentfarm.ctx.memOpen` | Open it | Agent Farm |
| 547 | `agentfarm.ctx.memGraph` | Show it in the memory graph | Agent Farm |
| 548 | `agentfarm.ctx.memCopyTo` | Copy it to another agent… | Agent Farm |
| 549 | `agentfarm.ctx.memDistil` | Distil it — shorter, with a diff first | Agent Farm |
| 550 | `agentfarm.ctx.memCopyPath` | Copy its path | Agent Farm |
| 551 | `agentfarm.ctx.evCopyInput` | Copy its input — the prompt that is replayed | Agent Farm |
| 552 | `agentfarm.ctx.evCopyTitle` | Copy its title | Agent Farm |
| 553 | `agentfarm.ctx.evDelete` | Delete this case | Agent Farm |
| 554 | `agentfarm.ctx.dutyOpen` | Open DUTIES.md | Agent Farm |
| 555 | `agentfarm.ctx.dutyEdit` | Edit it — title, cadence, watch, what to do | Agent Farm |
| 556 | `agentfarm.ctx.dutyTo` | Copy it to another agent… | Agent Farm |
| 557 | `agentfarm.ctx.dutyPause` | Pause / resume it | Agent Farm |
| 558 | `agentfarm.ctx.dutyDel` | Delete it from DUTIES.md | Agent Farm |
| 559 | `agentfarm.ctx.dutyCopy` | Copy the duty — watch, and what to do | Agent Farm |
| 560 | `agentfarm.ctx.scAssets` | Show its assets | Agent Farm |
| 561 | `agentfarm.ctx.scNext` | Do the next thing this scene is waiting for | Agent Farm |
| 562 | `agentfarm.ctx.scStatusDraft` | draft | Agent Farm |
| 563 | `agentfarm.ctx.scStatusGenerating` | generating | Agent Farm |
| 564 | `agentfarm.ctx.scStatusReview` | review | Agent Farm |
| 565 | `agentfarm.ctx.scStatusApproved` | approved — goes into the export | Agent Farm |
| 566 | `agentfarm.ctx.scCopyId` | Copy its scene id | Agent Farm |
| 567 | `agentfarm.ctx.asOpen` | Open the file | Agent Farm |
| 568 | `agentfarm.ctx.asRerun` | Make it again | Agent Farm |
| 569 | `agentfarm.ctx.asVary` | Make a variation… | Agent Farm |
| 570 | `agentfarm.ctx.asFeedback` | Say what was wrong, and make it again… | Agent Farm |
| 571 | `agentfarm.ctx.asKeep` | Keep it | Agent Farm |
| 572 | `agentfarm.ctx.asDrop` | Drop it | Agent Farm |
| 573 | `agentfarm.ctx.asAssign` | Assign it to a scene… | Agent Farm |
| 574 | `agentfarm.ctx.asCopyPath` | Its file path | Agent Farm |
| 575 | `agentfarm.ctx.asCopyInput` | What it was asked for | Agent Farm |
| 576 | `agentfarm.ctx.asCopyModel` | The model that made it | Agent Farm |
| 577 | `agentfarm.ctx.pvSetting` | Open its setting | Agent Farm |
| 578 | `agentfarm.ctx.pvVault` | Open the key vault | Agent Farm |
| 579 | `agentfarm.ctx.pvCopy` | Copy its name | Agent Farm |
| 580 | `agentfarm.ctx.atDefault` | Use this one when a tool call names none | Agent Farm |
| 581 | `agentfarm.ctx.atReveal` | Reveal its folder | Agent Farm |
| 582 | `agentfarm.ctx.atCopyName` | Copy its name | Agent Farm |
| 583 | `agentfarm.ctx.atCopyDir` | Copy its folder path | Agent Farm |
| 584 | `agentfarm.ctx.anExport` | Export the rows you can see as Markdown | Agent Farm |
| 585 | `agentfarm.ctx.anReset` | Clear its search, filters and sort | Agent Farm |

---

## 2. Arayüz Panelleri ve Webview Ekranları (`src/panels/` & `media/`)

### A. Panel Sınıfları (`src/panels/`) — Toplam: 52
- `a2aNotesPanel.ts`
- `a2aTasksPanel.ts`
- `accountsMessages.ts`
- `accountsPanel.ts`
- `agentDetail.ts`
- `airtablePanel.ts`
- `alertMessages.ts`
- `base.ts`
- `capabilities.ts`
- `consolePanel.ts`
- `dashboard.ts`
- `enginesPanel.ts`
- `evalsPanel.ts`
- `guide.ts`
- `livingPanel.ts`
- `memoryGraph.ts`
- `missionsPanel.ts`
- `needsPanel.ts`
- `noticesPanel.ts`
- `nowPanel.ts`
- `openDoc.ts`
- `panelAsk.ts`
- `panelHost.ts`
- `policyMessages.ts`
- `portfolioPanel.ts`
- `projectsPanel.ts`
- `queuePanel.ts`
- `remotePages.ts`
- `remoteViews.ts`
- `searchPanel.ts`
- `secretsPanel.ts`
- `selectionPanel.ts`
- `sessionsPanel.ts`
- `sessionViewer.ts`
- `settingsFlex.ts`
- `settingsPanel.ts`
- `soundModel.ts`
- `soundPanel.ts`
- `studioBrand.ts`
- `studioLibraryActions.ts`
- `studioLibraryView.ts`
- `studioPanel.ts`
- `taskAnalyticsPanel.ts`
- `tasksPanel.ts`
- `timeline.ts`
- `toolboxPanel.ts`
- `toolboxRemote.ts`
- `toolboxWeb.ts`
- `turnsPanel.ts`
- `uiLanguage.ts`
- `wikiCategoryPrompt.ts`
- `wikiPanel.ts`

### B. Webview İstemci Betikleri (`media/`) — Toplam: 106
- `a2aNotes.js`
- `a2aTasks.js`
- `accounts.js`
- `afA2A.js`
- `afAccount.js`
- `afAccounts.js`
- `afAirtableInput.js`
- `afAsk.js`
- `afBrand.js`
- `afBulk.js`
- `afChainNav.js`
- `afCheckpoint.js`
- `afColFit.js`
- `afCombo.js`
- `afCtx.js`
- `afDimensions.js`
- `afEngine.js`
- `afFilters.js`
- `afFlex.js`
- `afFlexForms.js`
- `afFlexPromote.js`
- `afFlexSettings.js`
- `afForm.js`
- `afI18n.js`
- `afI18n.tr.js`
- `afKapici.js`
- `afKapiciStep.js`
- `afLaunch.js`
- `afLibrary.js`
- `afMetrics.js`
- `afMobile.js`
- `afPhoneApp.js`
- `afPolicies.js`
- `afProject.js`
- `afProvider.js`
- `afPublish.js`
- `afQuery.js`
- `afRecipes.js`
- `afRemote.js`
- `afRepaint.js`
- `afRoles.js`
- `afRunCategory.js`
- `afRunFilter.js`
- `afRunWith.js`
- `afSessionCtx.js`
- `afSlashPicker.js`
- `afSnippets.js`
- `afSoundAgents.js`
- `afSoundCard.js`
- `afSoundPop.js`
- `afSoundSessions.js`
- `afSoundStrips.js`
- `afSoundVoice.js`
- `afSoundWhy.js`
- `afSoundWire.js`
- `afStudioLibrary.js`
- `afSupervisor.js`
- `afSupervisorStrip.js`
- `afTelegram.js`
- `afTextTools.js`
- `afTime.js`
- `afTip.js`
- `afTipEdge.js`
- `afTool.js`
- `afVoice.js`
- `afWake.js`
- `afWeb.js`
- `afWiki.js`
- `afWorkflowInputs.js`
- `agentDetail.js`
- `agentfarm.svg`
- `airtablePage.js`
- `capabilities.js`
- `charts.js`
- `common.css`
- `console.js`
- `dashboard.js`
- `engines.js`
- `evals.js`
- `icon.png`
- `livingPage.js`
- `memgraph.js`
- `missions.js`
- `needs.js`
- `notices.js`
- `now.js`
- `pageHeader.js`
- `portfolio.js`
- `projects.js`
- `queue.js`
- `search.js`
- `secrets.js`
- `selection.js`
- `sessionsPage.js`
- `sessionsTable.js`
- `sessionViewer.js`
- `settings.js`
- `sound.js`
- `sounds`
- `studio.js`
- `taskAnalytics.js`
- `tasksPage.js`
- `timeline.js`
- `toolbox.js`
- `turns.js`
- `wiki.js`

### C. VS Code Görünüm Konteynerleri & Ağaçları (`viewsContainers` & `views`)
```json
{
  "viewsContainers": {
    "activitybar": [
      {
        "id": "agentFarm",
        "title": "Agent Farm",
        "icon": "media/agentfarm.svg"
      }
    ]
  },
  "views": {
    "agentFarm": [
      {
        "id": "agentfarm.agents",
        "name": "Agents",
        "icon": "media/agentfarm.svg"
      },
      {
        "id": "agentfarm.projects",
        "name": "Projects",
        "icon": "media/agentfarm.svg"
      },
      {
        "id": "agentfarm.tasks",
        "name": "Tasks",
        "icon": "media/agentfarm.svg"
      },
      {
        "id": "agentfarm.missions",
        "name": "Missions",
        "icon": "media/agentfarm.svg"
      },
      {
        "id": "agentfarm.toolbox",
        "name": "Toolbox",
        "icon": "media/agentfarm.svg"
      },
      {
        "id": "agentfarm.sessions",
        "name": "Recent Sessions",
        "icon": "media/agentfarm.svg"
      },
      {
        "id": "agentfarm.insights",
        "name": "Insights",
        "icon": "media/agentfarm.svg"
      },
      {
        "id": "agentfarm.feed",
        "name": "Live Feed",
        "icon": "media/agentfarm.svg"
      }
    ]
  }
}
```

---

## 3. Sistem Ayarları (`contributes.configuration`) — Toplam: 238

| # | Ayar Anahtarı | Tip | Varsayılan | Açıklama |
|---|---|---|---|---|
| 1 | `agentFarm.guideLanguage` | `string` | `"en"` | Language for the in-app help surfaces (Guide, Quick Start, Examples). English by default; choose Türkçe for Turkish. You can also switch from the language toggle inside the guide panel. More languages can be added over time. |
| 2 | `agentFarm.language` | `string` | `"auto"` | Language of the Agent Farm pages. Translations are added one surface at a time; anything not translated yet is shown in English. Choosing a language also formats dates and times in it. Pages pick up a change the next time they are drawn (Refresh or reopen). |
| 3 | `agentFarm.agentRoots` | `array` | `["D:/zone/agent/ajanlar"]` | Root folders scanned for agent directories. Subfolders containing CLAUDE.md, .claude or memory/ become agents. A root whose subfolders are agents is a nest — its own CLAUDE.md counts as shared instructions, not an agent; a root with no agent-like subfolders is one agent itself. Manage this comfortably in the Agent folders section of Farm Settings. |
| 4 | `agentFarm.excludeAgentDirs` | `array` | `[]` | Folders that are never treated as agents, even when they look like one. Compared case- and slash-insensitively. Easiest managed via Exclude/Include in the Agent folders section of Farm Settings. |
| 5 | `agentFarm.newAgentModel` | `string` | `"sonnet"` | Default model written into a new agent's .claude/settings.local.json when the agent is created via Agent Farm — an alias (haiku, sonnet, opus, fable) or a full model id. Empty = write no model, the Claude CLI default applies. Existing agents' models are managed per agent in the Agent folders section of Farm Settings. |
| 6 | `agentFarm.modelAliases` | `array` | `["haiku","sonnet","opus","fable"]` | Your model name knowledge base: the names/ids offered in every model picker (the per-agent model dropdown in Agent folders, the mission model suggestions, the Start Session… launcher). Add a new model name here ONCE and it appears in every picker permanently — model names change over time, this list is yours to keep current. Every picker also accepts a custom free-text entry for anything not listed. |
| 7 | `agentFarm.web.enabled` | `boolean` | `false` |  |
| 8 | `agentFarm.web.port` | `number` | `8378` | Port for the read-only web view (the live-hook listener uses agentFarm.livePort, 8377, and must stay separate). |
| 9 | `agentFarm.web.bind` | `string` | `"local"` |  |
| 10 | `agentFarm.web.token` | `string` | `""` | Access token for the web view. Generated for you the first time you enable it; anyone with this token can READ the farm's dashboard, so treat it like a password. Empty = the server refuses to start. |
| 11 | `agentFarm.remote.listen` | `string` | `"off"` |  |
| 12 | `agentFarm.remote.port` | `number` | `7443` | Port the phone app connects to (TLS). Must differ from the web view and live-hook ports. |
| 13 | `agentFarm.telegram.enabled` | `boolean` | `false` |  |
| 14 | `agentFarm.telegram.allowedChats` | `array` | `[]` | Telegram chat ids allowed to drive the farm. EMPTY = nobody can (the bridge answers every message with a refusal and its own chat id). This is the access list for something that spends money — keep it to your own chats. |
| 15 | `agentFarm.telegram.maxDailyUSD` | `number` | `1` | Ceiling on what chat-started runs may cost per day (API-equivalent). 0 = no runs from chat at all; commands like /status keep working. |
| 16 | `agentFarm.telegram.defaultAgent` | `string` | `""` | Agent a new chat talks to before it picks one with /agent. Empty = a chat must bind an agent first. |
| 17 | `agentFarm.telegram.digest` | `string` | `"focused"` |  |
| 18 | `agentFarm.telegram.whenBusy` | `string` | `"queue"` |  |
| 19 | `agentFarm.a2a.preferredGraceHours` | `number` | `2` |  |
| 20 | `agentFarm.accounts` | `array` | `[]` |  |
| 21 | `agentFarm.activeAccounts` | `object` | `{}` |  |
| 22 | `agentFarm.providerProfiles` | `array` | `[]` |  |
| 23 | `agentFarm.launchDefaults` | `object` | `{}` |  |
| 24 | `agentFarm.flexOverrides` | `object` | `{}` |  |
| 25 | `agentFarm.flexPresets` | `array` | `[]` |  |
| 26 | `agentFarm.launchProfiles` | `array` | `[]` |  |
| 27 | `agentFarm.console.autoAnswer.enabled` | `boolean` | `true` |  |
| 28 | `agentFarm.console.autoAnswer.timeoutSeconds` | `number` | `300` |  |
| 29 | `agentFarm.console.autoAnswer.filter` | `string` | `"recommended"` |  |
| 30 | `agentFarm.console.autoAnswer.words` | `array` | `["delete","deleting","deletion","drop table","drop the table","drop database","drop schema","drop index","force push","force-push","push --force","--force-with-lease","reset --hard","rm -rf","wipe","purge","destroy","overwrite","overwriting","overwritten","truncate","truncating","irreversible","cannot be undone","permanently","revoke","uninstall","kill process","kill the process","kill session","kill the session","kill task","kill the task","/\\bsil\\b/","silmek","silme","siler","silin","silecek","kaldır","geri alınamaz","kalıcı olarak","üzerine yaz","sıfırla"]` |  |
| 31 | `agentFarm.notifyConsoleTurnEnd` | `boolean` | `true` |  |
| 32 | `agentFarm.speakerLabelTemplate` | `string` | `"{ai}"` |  |
| 33 | `agentFarm.speakerLabelCase` | `string` | `"page"` | Case applied to the AI speaker label (see agentFarm.speakerLabelTemplate). |
| 34 | `agentFarm.speakerLabelFallback` | `string` | `"agent"` | AI speaker label shown when the model id yields nothing to fill the template (unknown engine, <synthetic>, or missing). Never 'assistant' — this is an agent. |
| 35 | `agentFarm.claudeDir` | `string` | `""` | Path to the Claude Code data directory. Leave empty to use ~/.claude. |
| 36 | `agentFarm.extraClaudeDirs` | `array` | `[]` | Additional (read-only, synced) Claude data folders from other machines — e.g. a Syncthing/OneDrive copy of the laptop's ~/.claude. Their sessions appear with a ⇄ machine badge. |
| 37 | `agentFarm.activeThresholdSeconds` | `number` | `150` | A session is considered ACTIVE if its transcript changed within this many seconds. |
| 38 | `agentFarm.staleMemoryDays` | `number` | `45` | Memory files untouched for more than this many days are flagged as stale. |
| 39 | `agentFarm.contextBudgetTokens` | `number` | `8000` | Warn when an agent's fixed context load (CLAUDE.md + MEMORY.md + AGENTS.md) exceeds this estimated token budget. |
| 40 | `agentFarm.forecastDays` | `number` | `7` | How many days ahead the Task Forecast projects scheduled runs. |
| 41 | `agentFarm.windowTokenLimit` | `number` | `0` | Optional token limit for the rolling 5-hour usage window (subscription plans). 0 hides the progress bar and shows raw totals. |
| 42 | `agentFarm.quotaWeightMode` | `string` | `"model-aware"` | How the ⚖ figure (what work costs the plan's rolling limit, as opposed to how many tokens moved) is derived. Calibrated against the real endpoint on 2026-08-04 by sampling utilization twice inside one window: 29% → 82% over 28 minutes and 96 API calls cost 38.13M raw / 24.86M weighted-model-aware / 4.97M weighted-model-flat, i.e. a full 5-hour limit of about 72M raw, 47M model-aware or 9.4M model-flat FOR THAT WORKLOAD. Almost all of it ran on Opus, so that sample cannot tell model-aware and model-flat apart — sample a day with real haiku or sonnet work to separate them. |
| 43 | `agentFarm.quotaWeights` | `array` | `[]` | Override the ⚖ weight table. Empty = use the built-in one. Each entry: { match (regex on the model id), input, output, cacheWrite (5-minute TTL), cacheWrite1h (1-hour TTL), cacheRead } — all relative to ONE SONNET INPUT TOKEN = 1. Built in: opus and fable { input 5, output 25, cacheWrite 6.25, cacheWrite1h 10, cacheRead 0.5 }, sonnet { 1, 5, 1.25, 2, 0.1 }, haiku { 0.333, 1.667, 0.417, 0.667, 0.033 }. ‼️ CACHE WRITES ARE PRICED BY TTL AND THE 1-HOUR RATE IS THE ONE THAT APPLIES HERE: measured on this machine, 17 923 938 of 17 923 938 cache-creation tokens were 1-hour and none were 5-minute. A usage block that reports no split is charged at the 1-hour rate. Deliberately separate from agentFarm.pricing: correcting a billing rate must not silently move the limit gauge. First matching rule wins; an unmatched model falls back to the sonnet row, never to zero. |
| 44 | `agentFarm.quotaBrakeBasis` | `string` | `"whichever"` | Which figure the quota guard (quotaGuardPercent) and the model-downgrade rule (quotaDowngradePercent) read when deciding how full the 5-hour window is. A ceiling that is not configured is simply not consulted, whatever this says — set windowTokenLimit and/or windowWeightedTokenLimit first. |
| 45 | `agentFarm.windowWeightedTokenLimit` | `number` | `0` | Optional limit for the rolling 5-hour window measured in WEIGHTED tokens (⚖) instead of raw ones. A cache-read token is a tenth of a fresh input token and an output token is five, while 94-99% of a raw total is cache reads — so the raw total of a full window ranges 111M-175M across days that hit the very same wall, and the weighted total of those same windows sits at 18-21M. Set this to what your plan actually allows (watch the ⚖ figure in the status bar for a window where you hit the limit) and the quota guard and the model-downgrade rule brake on it. 0 = off; the raw windowTokenLimit keeps working exactly as before, and setting both brakes on whichever is further along. |
| 46 | `agentFarm.planUsageRefreshMinutes` | `number` | `5` | How often your Claude subscription limits are re-read from Anthropic while the fleet is IDLE, in minutes — nothing is running, so they can only change by the clock. While an agent is actually mid-turn the faster planUsageActiveRefreshSeconds beat takes over. One beat is shared by the status-bar indicator, the Dashboard's "Plan usage" card and the usage.plan bridge op — they never make separate requests. 0 turns the automatic refresh off in BOTH windows; the card's ⟳ and the indicator's "Check now" still work. Only the OAuth session Claude Code stores locally is read; it is never written to. |
| 47 | `agentFarm.planUsageActiveRefreshSeconds` | `number` | `60` | How often the same figures are re-read while at least one agent is mid-turn, in seconds — that is when they are actually moving, and when you are watching them. A session that is open but waiting for your next prompt is idle and uses the minutes setting above. The switch is instant in both directions: a turn starting and a turn ending each trigger one immediate read. Minimum 30 seconds, and that floor is enforced in code: the endpoint is undocumented and answers a too-frequent poller with a persistent HTTP 429, so a fast setting is not a preference it will honour. A 429 is met with an automatic backoff (3 → 6 → 12 → 15 min) that one success clears; the ⟳ button asks anyway. Ignored when planUsageRefreshMinutes is 0 (automatic refresh off). |
| 48 | `agentFarm.agyUsageRefreshMinutes` | `number` | `240` | How often Antigravity's quota is re-read while NO Antigravity turn is running, in minutes. Reading it runs agy -p /usage in the background (no tokens), which briefly flashes a terminal on screen. Other engines' turns (Claude, Codex…) do not count: they spend none of Antigravity's quota. It is read once when the window opens and once right after each Antigravity run ends; after that, every this many minutes. 0 = never while Antigravity is idle — only the reads above, and Check now. Separate from Claude's planUsageRefreshMinutes. |
| 49 | `agentFarm.agyUsageActiveRefreshSeconds` | `number` | `60` | How often Antigravity's quota is re-read while an Antigravity turn is running, in seconds, counted from the run's start (a turn that has just begun has spent nothing yet). Only Antigravity's own turns switch this on; Claude or Codex working does not. Minimum 30 seconds. Separate from Claude's planUsageActiveRefreshSeconds. |
| 50 | `agentFarm.planUsageMinIntervalSeconds` | `number` | `10` | The shortest gap between two usage requests for ONE sign-in, in seconds, counted across everything that reads it — the background beat, the status-bar indicator, the turn-boundary read, an account card's ⟳ and the bridge. Anthropic limits this endpoint per account token, and until this existed each reader kept its own clock: whichever account was standing had two of them, so it alone could be asked twice within a second and it alone kept hitting the limit while the others stayed clean. Raise it if an account still gets rate limited; the floor is 5 seconds and is enforced in code. This is a SPACING rule, not a beat — it never causes an extra read. A read that arrives too early is answered with the figure taken moments ago instead of spending a second request, and the one triggered by a turn ending waits and then happens. |
| 51 | `agentFarm.planUsageStatusBar` | `boolean` | `true` | Keep your plan's session countdown and usage percentages in the VS Code status bar — "3h 49m - 86% / wk 41%": time left in the current session window, how much of it is gone, and how much of the week. Visible while you work without opening anything. Hover for every limit with its reset time and the beat it is running on, click for the Dashboard card. Hidden automatically on a machine with no Claude subscription login (API key / Bedrock / Vertex). |
| 52 | `agentFarm.accountsAutoRefresh` | `boolean` | `true` | Re-read every captured sign-in's window figures in the background, page open or not — each sign-in on its own beat: planUsageActiveRefreshSeconds while a turn is running on it, planUsageRefreshMinutes while nothing is, and never all at once (one request per five seconds across the machine; a 429 pauses the whole fleet). Off costs nothing: the ⟳ on a card, the "Refresh all" line and the turn-boundary read still work. The Engines page's Auto-refresh button and the accounts.autoRefresh bridge op flip this same setting. |
| 53 | `agentFarm.planUsageEngine` | `string` | `"claude"` | Which engine's remaining limit the status bar shows. Every engine reports differently and only Claude has an endpoint to ask — hover the indicator to see them all at once and switch between them, or use the mini tabs on the Dashboard's Plan usage card. Both write this setting, so the two surfaces always agree. |
| 54 | `agentFarm.planUsageWarnPercent` | `number` | `80` | The status-bar usage indicator turns yellow once any of your plan's limits reaches this percentage. |
| 55 | `agentFarm.planUsageDangerPercent` | `number` | `95` | …and red at this one. Set it to 101 to never go red. |
| 56 | `agentFarm.maxTranscriptMessages` | `number` | `1500` | Maximum number of messages rendered in the session viewer. |
| 57 | `agentFarm.contextWindowTokens` | `number` | `0` | Context-window ceiling for every 'Context now' figure — the session viewer's gauge and the Ctx column's hover. 0 = ask the session: the window the engine itself stated (Codex reports one per turn), else the model's known window. A session whose window nobody states shows the raw token count without a percent rather than a percentage of Claude's. Set a value to force one ceiling everywhere. |
| 58 | `agentFarm.contextConvergePct` | `number` | `35` | Context discipline: when a running session's window is this full, it is told once — CONTEXT CONVERGE — to start nothing new and finish the step in flight. Delivered through the live hook's answer (PostToolUse additionalContext) on Claude Code; an engine whose hooks carry no such channel records the crossing as undelivered. 0 = off. Read and set from the bridge: sessions.contextGuard / sessions.contextGuard.set. |
| 59 | `agentFarm.contextHandoverPct` | `number` | `40` | Context discipline: when a running session's window is this full, it is told once — CONTEXT HANDOVER — to stop, commit, write the handover note and end the run. A converge line above this one is folded down onto it. 0 = off. |
| 60 | `agentFarm.quotaConvergePct` | `number` | `0` | Quota discipline: when the 5-hour window of the account a running session is signed in as is this full, the session is told once — QUOTA CONVERGE — to start nothing new. Off by default: the handover law has no quota converge line — below the handover line a run works at full capacity; set a figure only if you want that earlier warning. Read from that session's OWN sign-in (a Console card's or its launch manifest's account slot), never from the home folder; a session whose sign-in is not known is not told. Same channel and rules as the context lines. 0 = off. |
| 61 | `agentFarm.quotaHandoverPct` | `number` | `90` | Quota discipline: when the session's own account window is this full, it is told once — QUOTA HANDOVER — to stop, commit, write the handover note and end the run (the handover law's 90%). A converge line above this one is folded down onto it. 0 = off. |
| 62 | `agentFarm.quotaWeeklyHandoverPct` | `number` | `98` | Quota discipline: when the session's own account has used this much of its WEEKLY window, it is told once — QUOTA HANDOVER, naming the weekly window — to stop, commit, write the handover note (or pass the baton) and end the run, and the relay's successor never stays on that account. Kept apart from the five-hour line: each window has its own line and each is said once until it turns over. 0 turns the weekly line off. |
| 63 | `agentFarm.disciplineOrders` | `object` | `{}` | Handover discipline: WHAT the two lines actually order the running session to do. The lead words (CONTEXT CONVERGE / CONTEXT HANDOVER / QUOTA CONVERGE / QUOTA HANDOVER) and the reading in front of them are fixed — the handover law waits for exactly those — and this is the instruction that follows. Six branches, because a run in a baton relay is told to pass the baton rather than to write a note. Leave a field empty and its built-in sentence stays in charge; {chain} is replaced by the relay's own chain and hop. Read and set from the bridge: sessions.contextGuard / sessions.contextGuard.set orders=. |
| 64 | `agentFarm.batonMaxHops` | `number` | `6` | Baton relay: the most legs one chain may run — the run that started it is leg 1. A pass from the last leg opens nothing: the baton is kept as stopped with the reason, the runner is told to write a handover note instead, and Notices says so once. 0 = no ceiling. The other automatic brake needs no setting: two legs in a row that end on the same git HEAD stop the chain too. |
| 65 | `agentFarm.batonInjectedDirective` | `string` | `""` | Baton relay: a standing rule said to EVERY leg of every chain, above the predecessor's own words — for example "run npm test before you pass the baton". Empty = nothing is added. In your own handover template it goes where {userDirective} stands; a template that does not name it still gets it, on its own line above the predecessor's words. |
| 66 | `agentFarm.batonHandoverTemplate` | `string` | `""` | Baton relay: your own first message for every leg, instead of the built-in "=== BATON RELAY — chain … ===" header. Variables: {fromSessionId} (the predecessor's session), {agentId} (the agent's name), {chain}, {leg} (the leg this run is — hop + 1, the number the card and the status bar show), {hop} (handovers so far), {maxHops} (the chain's leg ceiling, "none" when it has none), {why} (what opened this leg), {userDirective} (agentFarm.batonInjectedDirective), {agentPrompt} (the predecessor's own words), {relayRules} (the relay rules every leg is told; a template that does not name them still gets them, above the directive). An unknown {name} is left as typed. The predecessor's words are never lost: a template without {agentPrompt} gets them appended under a --- line. Empty = the built-in header stays in charge. |
| 67 | `agentFarm.batonEmergencyTemplate` | `string` | `""` | Baton relay: your own first message for a leg the FAILSAFE opens — when a leg ends without passing the baton although it was cut off (a QUOTA/CONTEXT HANDOVER had reached it, it wrote a handover note in its last two minutes, it exited with an error, or it left uncommitted work). Empty = the built-in "=== BATON RELAY — … · EMERGENCY HANDOVER ===" header, which names the predecessor and how to read its last turns. Variables: {fromSessionId} (the ended session, in full), {agentId}, {chain}, {leg} (the leg this run is — hop + 1), {hop} (handovers so far), {maxHops} (the leg ceiling, "none" when the chain has none), {why} (why it was rescued), {evidence} (its handover note's Durum/Kalan/İlk 5 dakika sections, or its uncommitted state), {userDirective} (agentFarm.batonInjectedDirective), {relayRules} (the relay rules every leg is told; a template that does not name them still gets them). A template that does not name {evidence} still gets it, last, under a ---. A leg that finished cleanly, or that you ended yourself, is never rescued: the chain simply ends, and a successor that dies within 30 seconds without a tool call stops it (crash-loop guard). |
| 68 | `agentFarm.batonFaultWaitHours` | `number` | `24` | Baton relay: when a running leg's turn fails because the ENGINE is down, overloaded, unreachable, rate limited or refuses the sign-in, no new leg is opened (it would fail the same way) — the same session is asked to continue at growing intervals (1 min, 2, 4 … up to one hour apart). Past this many hours without a working turn Agent Farm stops asking and Needs You gets a row. 0 = keep asking hourly with no ceiling. |
| 69 | `agentFarm.batonFlaggedPasses` | `number` | `3` | Baton relay: when the engine FLAGS a running leg's conversation ("safeguards flagged this message … can't respond"), nothing said in that session is answered again, so Agent Farm passes the baton for it: the successor opens from what the leg left, through the same brakes as any pass, and the flagged card is closed. This is how many such passes may come in a row before the chain holds for you (Needs You). 0 = no cap of its own — the chain's leg ceiling still applies. |
| 70 | `agentFarm.batonFlaggedModel` | `string` | `""` | Baton relay: the model a successor opens on when the leg before it was ALSO opened by a flagged pass — the engine's own advice is a new session first, then another model. Empty = the chain keeps its own model. The chain carries on with whatever model its successor opened on. |
| 71 | `agentFarm.defaultAccountCeiling` | `number` | `70` | Account ceiling: the wall every unattended start obeys — a sign-in at or past this share of its five-hour window is passed over (its all-models week has its own wall, defaultAccountWeeklyCeiling). Every built-in policy (@emptiest, @round-robin, @standing, @pool) and every rule step that names none, a relay successor staying on its account, a sentry round whose campaign names no ceiling, a run carried to another account after a limit, and accounts.status when asked without a ceiling. A campaign, rule, step or caller may name its own wall instead, but nothing — this box included — ever acts above quotaHandoverPct: a slot past the quota handover line would be told to hand over on its first reading, so lowering the handover line lowers every wall with it. The Account Policies table, the campaign's Ceiling box and sentry.status show the wall in force and why. |
| 72 | `agentFarm.defaultAccountWeeklyCeiling` | `number` | `95` | Weekly Account ceiling: the wall every unattended start obeys on the all-models WEEK — a sign-in at or past this share of its weekly window is passed over, while its five-hour window is judged by the Account ceiling (defaultAccountCeiling). Kept apart so an account whose week is past the Account ceiling is still used for days instead of sitting idle; the emptiest account still leads, and a week at its limit is never picked. Every place the Account ceiling binds (the built-in policies and rule steps, a relay successor staying on its account, a sentry round, a run carried to another account, accounts.status) judges the week here. Never acts above quotaWeeklyHandoverPct: a session started past the weekly handover line would be told to hand over on its first reading. |
| 73 | `agentFarm.contextHandoverStayAccountPct` | `number` | `70` | Handover discipline: when a run hands over for any reason other than QUOTA — its context window filled up, or it passed on its own — and its account has used less than this percentage of its five-hour window, the successor opens on the SAME account instead of the pool's pick, so one account's window is used up before another is started. At or above the line, or when the handover was the quota's, the pool picks as before. A stay is a start, so it never stands above the wall every start obeys (defaultAccountCeiling, itself never above quotaHandoverPct): a line set higher acts at that wall. Applies to a baton relay's next leg (the chain's pool is kept for later legs) and to the sentry's next round. 0 = off. Default 70. |
| 74 | `agentFarm.bridgeGuard` | `boolean` | `true` | Stops an agent that searches the disk for a session's files by its id, and has it ask Agent Farm instead — Agent Farm knows where every session is, and the engines move their files. Only a real session id triggers it. Works on Claude and Codex; the other engines only have the rule written in their instructions. A Console card shows an orange dot when one of its searches was stopped. Turn off to let such searches run. |
| 75 | `agentFarm.shellGuard` | `boolean` | `true` | Stops an agent's shell command that carries text the shell would silently damage: a non-ASCII letter, a backtick, a heredoc with backslashes, or a long piece of inline text. The agent is told to write the text to a file and have the command name the file. Works on Claude and Codex; the other engines only have the rule written in their instructions. Turn off to let such commands run. |
| 76 | `agentFarm.liveMonitor` | `boolean` | `true` | Run the local live-event listener (127.0.0.1) that receives Claude Code hook events. |
| 77 | `agentFarm.livePort` | `number` | `8377` | Port for the local live-event listener. Re-run 'Install Live Hooks' after changing it. |
| 78 | `agentFarm.stuckThresholdSeconds` | `number` | `240` | Stuck warning — WHEN: a working session with no hook events for this many seconds is marked STALLED (its card says so and Needs You gets a row, whether or not notifyStuck is on). A session waiting on its own work is not: a wait the Console shows in purple, or a command still inside the time limit it was given. Any value you like; 0 = never: no session is ever marked stalled, so notifyStuck has nothing to announce. |
| 79 | `agentFarm.quotaStyle.percent` | `string` | `""` | How a quota's PERCENT is drawn on every page — CSS declarations, e.g. `color: #ff79c6; font-weight: 700`. Empty = the default (purple, semibold). At 75% and 90% the page's own warning colours still win. |
| 80 | `agentFarm.quotaStyle.left` | `string` | `""` | How a quota's TIME LEFT is drawn on every page — CSS declarations, e.g. `color: #89d185; font-weight: 700`. Empty = the default (green, semibold). |
| 81 | `agentFarm.quotaStyle.reset` | `string` | `""` | How a quota's RESET TIME is drawn on every page — CSS declarations, e.g. `color: #75beff; font-style: italic`. Empty = the default (blue). |
| 82 | `agentFarm.notifyPermission` | `boolean` | `true` | Show a notification when an agent is waiting for a permission approval. |
| 83 | `agentFarm.notifyStuck` | `boolean` | `true` | Stuck warning — HOW: also pop up a notification when a session is marked stalled. Off, the stalled mark and the Needs You row still appear, without the pop-up. Nothing to announce while stuckThresholdSeconds is 0. |
| 84 | `agentFarm.notifyTurnEnd` | `boolean` | `false` | Show a notification every time an agent finishes its turn. |
| 85 | `agentFarm.permissionAnswerKeys` | `object` | `{}` | What Allow / Reject actually TYPE into a session's terminal when you answer a permission prompt from Needs You. Leave a field empty for the built-in. ‼️ What a permission prompt accepts belongs to the CLI, not to Agent Farm, and it has worn more than one shape — so it is a setting rather than a constant: if the prompt does not move when you press Allow, put the key your CLI wants here instead of waiting for a release. Nothing here can read the prompt back, so the message you get says which keys were sent and never that the tool was allowed. Escape sequences are literal characters: use \u001b for ESC and \r for Enter. |
| 86 | `agentFarm.alerts.on` | `object` | `{}` | Play the alert SOUND on these events, for every session. This is not the same switch as notifyTurnEnd / notifyPermission above: those are VS Code notifications, these are sounds — a sound you turned off here would still leave a notification arriving, and the two are kept apart so that complaint cannot happen. Every entry is off out of the box; a single session can also be armed on its own from the ♪ control in its Live Timeline row, and the two add up rather than overriding each other. |
| 87 | `agentFarm.alerts.muted` | `boolean` | `false` | Mute every alert SOUND, across the whole farm. This is the 🔇 in the status bar — one click, and the setting is here so it survives a restart and every VS Code window sees it. It clears nothing: the events you armed and the tones you chose stay exactly as they are, so unmuting brings back the setup rather than the defaults. Sounds only — the notifications, the modal and the focus jump are separate switches and keep working. A single session can also be muted on its own from its Live Timeline row. |
| 88 | `agentFarm.alerts.quietHours` | `object` | `{"on":false,"from":"23:00","to":"08:00"}` | The hours the farm makes no noise in. The window WRAPS MIDNIGHT — 23:00 to 08:00 means quiet from 23:00 through 07:59 the next morning, which is the only shape anybody actually sets. A time that is not HH:MM leaves quiet hours OFF and says so on the Settings card, rather than silencing the fleet on a guess; a start equal to the end is an empty window, never all day. Sounds only, exactly like the mute above. |
| 89 | `agentFarm.alerts.speak` | `object` | `{"on":false,"events":["question"],"template":"{agent}, {event}","rate":0,"volume":100,"voice":""}` | Say WHICH agent out loud. A tone answers 'what kind of news is this?' and nothing else; with eight lanes running, the question from the next room is which one — and no palette of tones can carry a name. This is local and free: Windows System.Speech, macOS `say`, Linux `spd-say`. No network, no account, no model. It rides BEHIND the tone in the same queue slot, so nothing plays between a chime and the sentence explaining it, and it follows the same mute, quiet hours and per-session mute. ‼️ A sentence in your own language needs a voice for that language, and an en-US voice reading Turkish is not accented, it is unintelligible. Windows keeps TWO separate sets of voices: the SAPI 5 set this player uses (usually just David and Zira) and the modern `Speech_OneCore` set, which is where every language pack you have ever installed from Settings actually goes. This engine cannot reach the second one — so if your language is missing from the list, it is very likely already installed and simply invisible here. `alerts.speak` lists what this player can select and says so. |
| 90 | `agentFarm.alerts.nudge` | `object` | `{"minutes":3,"repeat":2,"voice":"af_subtle_alert"}` | The second tap on the shoulder. When an agent stops to ASK you something and the question is still unanswered N minutes later, a light reminder tone plays. Only that event: reminding you about a finished turn would be pestering you about news that needs nothing from you. It follows the mute and the quiet hours above, and it stops by itself after `repeat` reminders — a chime that never ends is one you mute for good. Set `minutes` to 0 to switch it off. |
| 91 | `agentFarm.alerts.voices` | `object` | `{}` | Which sound each event plays. Leave one empty and it uses its built-in default — 'turn-ready' and 'question' deliberately differ, so the two can be told apart from another room without configuring anything. Twenty built-ins in two families: the modern ten, each built from a different physical object and the ones the defaults come from — af_crystal_turn · af_intercom_knock · af_zen_chime · af_deep_sonar · af_lullaby_sleep · af_marimba_success · af_pop_advance · af_subtle_alert · af_bell_urgent · af_pulse_start; and the earlier ten, kept so that nobody who chose one loses it — chime-soft · chime-bright · ask-double · ask-rise · low-pulse · tick-dry · bell-far · close-fall · error-buzz · alarm-urgent. Plus any of your own (`u-…`). A voice whose file is missing does not silence the alert: it falls through to the next answer and reports the step it passed over. |
| 92 | `agentFarm.alerts.agentVoices` | `object` | `{}` |  |
| 93 | `agentFarm.taskExtraArgs` | `string` | `""` | Extra CLI arguments appended to a task's claude command, e.g. "--model haiku" to run routine automation on a cheaper model. These are Claude Code's flag vocabulary, so a task queued on another engine (Codex / Gemini / Antigravity / OpenCode) ignores them — set that task's model and effort on the task itself. |
| 94 | `agentFarm.externalTerminal` | `boolean` | `false` | Open claude session terminals (Start/Continue/Resume) in the OS terminal — Windows Terminal when available — instead of the integrated terminal. Avoids xterm.js rendering glitches (ghost spaces, lost lines) in long TUI sessions. Farm tasks stay in the integrated terminal so their status can be tracked. Toggle via 'Terminal Rendering Fix…'. |
| 95 | `agentFarm.judgeArgs` | `string` | `"--model claude-haiku-4-5-20251001"` | CLI arguments for internal verification (judge) calls — keep this on a cheap model. |
| 96 | `agentFarm.judgeUnjudged` | `string` | `"ask"` | When a quality gate cannot judge an asset — the judge cannot open a video or audio file, or it could not run — what happens. It is never counted as a pass. |
| 97 | `agentFarm.judgeCompare` | `string` | `"auto"` | Whether an edit's quality check is shown what it started from. Without it, a judge can take something already in the source for an unwanted addition and fail a correct edit. |
| 98 | `agentFarm.kapici.rulesDir` | `string` | `""` | Folder of your own Gatekeeper rules (one JSON file per rule). Empty = a _KAPICI folder inside every agent root. A project's .kapici folder is read too and wins over this one; the shipped rules come first. |
| 99 | `agentFarm.kapici.timeoutMs` | `number` | `3000` | How long Gatekeeper waits for the classifier before handing the decision back to the usual path (milliseconds). A rule may set its own. The language-model judge, when used, waits at least a minute. |
| 100 | `agentFarm.kapici.providers` | `array` | `["heuristic","jev"]` | Who Gatekeeper asks, in order, when a rule names no one: heuristic (local checks — numbers, dates, counts, patterns — never sent anywhere), jev (the small classifier; needs its key in the Secret vault), llm (the judge model — slower, costs a model call). A sensitive rule never goes to jev. |
| 101 | `agentFarm.kapici.route` | `string` | `"auto"` | Which road Gatekeeper takes to the classifier. |
| 102 | `agentFarm.kapici.keyName` | `string` | `""` | The Secret vault name of the classifier's key. Empty = TYPESAFE_API_KEY, else AI_GATEWAY_API_KEY, else OPENROUTER_API_KEY, whichever the vault holds. A name containing openrouter / vercel / gateway picks that road when the road is auto. Mark it Farm only on the Secrets page so no agent receives it. |
| 103 | `agentFarm.kapici.dispatch` | `string` | `"off"` | Whether Gatekeeper helps decide which agent takes incoming work. Try shadow for a week or two before switching it on. |
| 104 | `agentFarm.kapici.retry` | `string` | `"off"` | Whether Gatekeeper helps decide what happens to a task whose retry is held for a supervisor. Try shadow for a week or two before switching it on. |
| 105 | `agentFarm.kapici.trigger` | `string` | `"off"` | Whether a trigger's Gatekeeper precondition is asked before it wakes an agent — so a change that is only noise (an auto-save, a lock file, a formatting-only edit) costs no run. Try shadow for a week or two before switching it on. |
| 106 | `agentFarm.kapici.workflow` | `string` | `"off"` | Whether a workflow's Gatekeeper steps are asked. A Gatekeeper step reads what the run has made so far and decides, without a model, whether the chain goes on. Try shadow for a week or two before switching it on. |
| 107 | `agentFarm.mediaUploadAuto` | `string` | `"ask"` |  |
| 108 | `agentFarm.mediaUploadProvider` | `string` | `"auto"` | Where a local file in a media input is uploaded. |
| 109 | `agentFarm.mediaUploadRetentionDays` | `number` | `7` |  |
| 110 | `agentFarm.workflowPrevTextChars` | `number` | `1500` |  |
| 111 | `agentFarm.toolOutDir` | `string` | `""` |  |
| 112 | `agentFarm.toolOverwrite` | `string` | `"never"` |  |
| 113 | `agentFarm.showrunner` | `string` | `"youtuber"` |  |
| 114 | `agentFarm.judgeLadder` | `string` | `""` |  |
| 115 | `agentFarm.workflowSpendCap` | `number` | `0` |  |
| 116 | `agentFarm.airtableInputStages` | `string` | `"asset, final"` |  |
| 117 | `agentFarm.airtableInputLimit` | `number` | `20` |  |
| 118 | `agentFarm.airtableInputSort` | `string` | `"newest"` |  |
| 119 | `agentFarm.studioLibraryBase` | `string` | `""` |  |
| 120 | `agentFarm.studioLibraryStages` | `string` | `""` |  |
| 121 | `agentFarm.studioLibraryKind` | `string` | `""` |  |
| 122 | `agentFarm.studioLibrarySuccess` | `string` | `""` |  |
| 123 | `agentFarm.studioLibraryPromote` | `string` | `"ask"` |  |
| 124 | `agentFarm.allInUnsure` | `string` | `"ask"` |  |
| 125 | `agentFarm.allInWhen` | `string` | `"daily"` |  |
| 126 | `agentFarm.libraryEnrich` | `string` | `"end"` |  |
| 127 | `agentFarm.libraryEnrichScope` | `string` | `"final-failed"` |  |
| 128 | `agentFarm.libraryEnrichModel` | `string` | `"sonnet"` |  |
| 129 | `agentFarm.libraryEnrichVideoModel` | `string` | `"gemini-3.8-flash-low"` |  |
| 130 | `agentFarm.libraryEnrichEffort` | `string` | `"low"` |  |
| 131 | `agentFarm.libraryEnrichSections` | `string` | `""` |  |
| 132 | `agentFarm.libraryEnrichCap` | `number` | `0` |  |
| 133 | `agentFarm.workflowAskEscalation` | `string` | `"leader-then-human"` |  |
| 134 | `agentFarm.taskRetry` | `object` | `{}` |  |
| 135 | `agentFarm.maxConcurrentTasks` | `number` | `2` | Maximum tasks running at once across the whole farm (0 = unlimited). Excess starts are deferred and launched automatically. |
| 136 | `agentFarm.maxConcurrentPerAgent` | `number` | `1` | Maximum tasks running at once per agent (0 = unlimited). |
| 137 | `agentFarm.quotaGuardPercent` | `number` | `0` | Defer automatic task starts when the 5h window reaches this percent of windowTokenLimit (0 = off; requires windowTokenLimit). Separately, and even at 0, a task that names an account whose own 5h window is at or past the quota handover line waits for that window instead of starting only to hand over at once. |
| 138 | `agentFarm.outputsMaxMB` | `number` | `200` | Size cap for the archived task outputs folder; oldest unreferenced outputs are pruned (0 = unlimited). |
| 139 | `agentFarm.mediaAuthSecret` | `string` | `"FAL_KEY"` | Name of the vault secret holding your fal.ai key (store it via 'Agent Farm: Set Secret…'). |
| 140 | `agentFarm.replicateAuthSecret` | `string` | `"REPLICATE_API_TOKEN"` | Name of the vault secret holding your Replicate API token (store it via 'Agent Farm: Set Secret…'). Used for media models with a 'replicate:' prefix. |
| 141 | `agentFarm.replicateBaseUrl` | `string` | `""` | Override the Replicate API base URL (testing / self-hosted proxy). Empty = https://api.replicate.com. |
| 142 | `agentFarm.codexHome` | `string` | `""` | Codex CLI home whose sessions/ rollout transcripts feed the external-session history. Empty = ~/.codex. |
| 143 | `agentFarm.geminiDir` | `string` | `""` | Gemini CLI tmp dir whose chat files feed the external-session history. Empty = ~/.gemini/tmp. |
| 144 | `agentFarm.agentEngineDefaults` | `object` | `{}` | Per-agent default model and effort, PER ENGINE — `{ "d:/zone/agent/ajanlar/developer": { "codex": { "model": "gpt-5.6-terra", "effort": "high" } } }`. Claude's own default is not here: it goes in that agent's .claude/settings.local.json, which Claude Code reads itself, so it applies to a terminal session too. The other engines have no per-folder settings file, so Agent Farm keeps their defaults here and passes them as --model / --effort when it starts the session. Edited from Farm Settings → Agent folders, where each box also says what "Default" resolves to on the selected engine. ‼️ A Claude row may also carry `providerId` (the id of a route in agentFarm.providerProfiles) and `tier` (opus / sonnet / …). That pair is a different kind of answer from model and effort: it is not a flag but an environment ISOLATION — the chosen route's base url, key and tier model are injected and every inherited ANTHROPIC_* / route-bearing CLAUDE_* variable is cleared first, so a base url left in the user's shell cannot answer the same question twice. With no providerId set nothing is cleared and nothing is injected, which is what every engine without a provider axis does permanently. Ask `providers.runtime` on the bridge to see exactly what a launch would run on. |
| 145 | `agentFarm.agyHome` | `string` | `""` | Antigravity CLI home whose conversation index feeds the external-session history. Its own transcripts are protobuf inside per-conversation SQLite files and are not read; the index gives the title, the time and the workspace. Empty = ~/.gemini/antigravity-cli. |
| 146 | `agentFarm.opencodeHistory` | `boolean` | `true` | Read OpenCode's own history into the sessions tables. OpenCode keeps its conversations in SQLite and publishes no transcript file, so this is the one history source that has to run its CLI (`session list`, then `export` for whatever has moved) — on a slow beat, in the background, never while a panel draws. Turn it off and OpenCode conversations simply stop appearing; nothing else changes and nothing is deleted. |
| 147 | `agentFarm.mediaBaseUrl` | `string` | `""` | Override the fal.ai queue base URL (testing / self-hosted proxy). Empty = https://queue.fal.run. |
| 148 | `agentFarm.vaultDir` | `string` | `""` |  |
| 149 | `agentFarm.workArea` | `string` | `"${temp}/agent_farm"` |  |
| 150 | `agentFarm.publishApproval` | `string` | `"ask"` |  |
| 151 | `agentFarm.publishPlatforms` | `array` | `["youtube","instagram","tiktok"]` |  |
| 152 | `agentFarm.metricsFields` | `array` | `["views","watchSeconds","engagement"]` |  |
| 153 | `agentFarm.performanceBrief` | `boolean` | `true` |  |
| 154 | `agentFarm.contentCalendarDir` | `string` | `""` |  |
| 155 | `agentFarm.reportDir` | `string` | `""` |  |
| 156 | `agentFarm.answerDir` | `string` | `""` |  |
| 157 | `agentFarm.queue.targets` | `array` | `[]` | Optional routing-target suggestions (repos/areas) offered in the work queue's add form and filter, in addition to the discovered agent names. Empty by default — free text, nothing hardcoded. |
| 158 | `agentFarm.queue.groupSize` | `number` | `3` | Work queue batching: a group of same-target items FIRES for delegation once it reaches this many items (mechanical threshold; the manager also fires on age/urgency). |
| 159 | `agentFarm.queue.maxAgeHours` | `number` | `24` | Work queue batching: the oldest item in a group forces the group to fire after this many hours, so nothing starves (anti-starvation cap). |
| 160 | `agentFarm.ingestFolders` | `array` | `[]` | Media ingest folders (downloads, render exports…): scanned every 30s; new image/video/audio files are registered into the Media Gallery in place (no copy). Files older than 48h at scan time are ignored. |
| 161 | `agentFarm.mediaBudgetMonthUSD` | `number` | `0` | Warn once per month when estimated media cost over the last 30 days exceeds this amount (USD). 0 = off. |
| 162 | `agentFarm.mediaPricing` | `array` | `[{"match":"flux.*schnell","usd":0.003,"per":"image"},{"match":"flux","usd":0.025,"per":"image"},{"match":"gemini-omni-flash/v1\\.1/edit","usd":0.03,"per":"second"},{"match":"gemini-omni","usd":0.13,"per":"second"},{"match":"nano-banana|gemini.*image","usd":0.04,"per":"image"},{"match":"kling","usd":0.1,"per":"second"},{"match":"seedance","usd":0.06,"per":"second"},{"match":"veo","usd":0.4,"per":"second"},{"match":"whisper|speech-to-text","usd":0.005,"per":"request"},{"match":"tts|text-to-speech|elevenlabs","usd":0.01,"per":"request"}]` | Estimated media pricing rules (USD): {match, usd, per: request\|image\|second}. Verify against fal.ai pricing. |
| 163 | `agentFarm.notifyWebhookUrl` | `string` | `""` | Forward farm notifications (permission, stalled, budget, workflow done/failed) to this webhook URL as JSON — e.g. an n8n webhook that relays to Telegram. Supports {secret:NAME}. |
| 164 | `agentFarm.notifyWebhookEvents` | `array` | `["permission","stalled","budget","workflow-done","workflow-failed","summary","digest"]` | Which notification types are forwarded to notifyWebhookUrl. |
| 165 | `agentFarm.dailyDigest` | `string` | `"off"` | Send a compact daily fleet scorecard to notifyWebhookUrl after this local time (HH:MM, e.g. "21:30"); "off" disables. No model call — plain data. Manual: 'Send Daily Digest Now'. |
| 166 | `agentFarm.dispatchRules` | `array` | `[]` | Dispatcher routing rules for 'dispatch' triggers — first matching regex wins. Example: [{"match": "invoice\|billing", "agent": "agent_one"}]. |
| 167 | `agentFarm.dispatchClassifier` | `boolean` | `true` | When no dispatch rule matches, let the cheap model (judgeArgs) pick the agent from CLAUDE.md role hints. |
| 168 | `agentFarm.embeddingsProvider` | `string` | `"off"` | Semantic search embeddings: 'gemini' (Google API, GEMINI_API_KEY secret) or 'openai' (any OpenAI-compatible /embeddings endpoint — incl. fully local Ollama/LM Studio via embeddingsBaseUrl, no key needed). |
| 169 | `agentFarm.embeddingsModel` | `string` | `""` | Embedding model id. Empty = provider default (gemini-embedding-001 / text-embedding-3-small; for Ollama e.g. nomic-embed-text). |
| 170 | `agentFarm.embeddingsBaseUrl` | `string` | `""` | Override the embeddings endpoint base URL. For local Ollama: http://127.0.0.1:11434/v1 |
| 171 | `agentFarm.embeddingsSecret` | `string` | `""` | Vault secret name holding the embeddings API key. Empty = GEMINI_API_KEY or OPENAI_API_KEY by provider; local endpoints may need none. |
| 172 | `agentFarm.semanticMaxSessions` | `number` | `300` | How many most-recent sessions the semantic index covers. |
| 173 | `agentFarm.searchToolTrailDays` | `number` | `60` | How many days after a session's last activity its TOOL TRAIL (what each tool was asked and what it answered) stays in the text-search index, on disk. The trail is 92% of the index by measurement and only an 'Everything' search reads it; the default You+Agent search never does. Past this horizon a session keeps its dialogue in the index and drops its trail, which is what keeps the index from growing 1:1 with your transcripts (measured 254 MB after 977 sessions, 2.6 GB projected at 10 000; ~300 MB with this). Nothing is lost: an Everything search that reaches an older session re-reads that transcript on the spot — slower, and the results say how many it re-read. 0 keeps every trail for ever. Applied on the first search of each window. |
| 174 | `agentFarm.browserAllowHosts` | `array` | `[]` | Global host allowlist for browser steps (subdomains included). A browser step refuses to run if neither this nor its own allowHosts covers the URL. |
| 175 | `agentFarm.browserApproval` | `string` | `"ask"` | 'ask' = confirm every browser step before it runs (recommended); 'auto' = run allowlisted browser steps without asking. |
| 176 | `agentFarm.cliProfiles` | `array` | `[]` | Alternative CLI executors for tasks — an arbitrary command line, for a CLI Agent Farm knows nothing else about. A profile task gets output archiving and exit-code status, and nothing more: no transcript, no cost, no live events. This is a DIFFERENT axis from a task's engine — Codex, Gemini, Antigravity and OpenCode are first-class engines with their own transcripts and token counts, so pick one of those on the task instead of writing a profile for it. Live hooks remain Claude Code's alone, whichever route you take. |
| 177 | `agentFarm.relayFeeds` | `array` | `[]` | Live relay feeds from other machines (J2): run farmRelay.js there ('Save Relay Script for Another Machine…'), sync its output file here, list it in this setting. |
| 178 | `agentFarm.packGalleryRepos` | `array` | `[]` | Agent pack gallery sources: git URLs (shallow-cloned into extension storage) or local folders containing .agentpack files. |
| 179 | `agentFarm.digestTtsModel` | `string` | `""` | fal.ai TTS model id for the spoken daily briefing (e.g. an ElevenLabs TTS endpoint on fal — verify the exact id on fal.ai). Empty disables 'Speak Daily Briefing'. |
| 180 | `agentFarm.digestTtsFolder` | `string` | `""` | Folder the spoken briefing mp3 is saved into (e.g. a phone-synced folder). Empty = autoReportFolder. |
| 181 | `agentFarm.modelPolicy` | `array` | `[]` | Rule-based model routing for farm-launched tasks; first match wins. Example: [{"source": "trigger", "model": "haiku"}] runs all trigger-born work on a cheap model. |
| 182 | `agentFarm.accountPolicies` | `array` | `[]` |  |
| 183 | `agentFarm.quotaDowngradePercent` | `number` | `0` | When the 5h window reaches this percent of windowTokenLimit, farm-launched tasks are forced onto quotaDowngradeModel (0 = off). |
| 184 | `agentFarm.quotaDowngradeModel` | `string` | `"claude-haiku-4-5-20251001"` | Model forced when the quota downgrade kicks in. |
| 185 | `agentFarm.permissionLint` | `boolean` | `true` | Audit each agent's permission rules (blanket allows, dangerous patterns, unused broad rules) and surface findings in Insights. |
| 186 | `agentFarm.pulse` | `string` | `"off"` | Synthetic pulse checks: a fixed cheap prompt per agent + cheap judge verifies the answer matches the agent's identity (uses judgeArgs; small API cost per agent). Manual: 'Run Pulse Check Now'. |
| 187 | `agentFarm.insightAutoDelegate` | `array` | `[]` |  |
| 188 | `agentFarm.qualitySample` | `string` | `"off"` | Automatically sample recent session outputs and score them 1-5 with the cheap-model judge (uses judgeArgs; small API cost per sample). Manual: 'Sample Output Quality Now'. |
| 189 | `agentFarm.qualitySamplesPerAgent` | `number` | `2` | How many not-yet-scored recent sessions per agent each quality sampling run scores. |
| 190 | `agentFarm.suggestScan` | `string` | `"off"` | Weekly cheap-model scan of your follow-up messages for repeated corrections, proposing CLAUDE.md rules (Insights view). Manual: 'Scan for Instruction Suggestions…'. |
| 191 | `agentFarm.weeklySummary` | `boolean` | `false` | Once per ISO week, write a three-sentence human-language fleet summary (cheap model) as a notification — and into autoReportFolder if set. |
| 192 | `agentFarm.queueAutoAdvance` | `boolean` | `false` | When a task finishes (its terminal closes), automatically start the next queued task for that agent. |
| 193 | `agentFarm.autoReport` | `string` | `"off"` | Automatically write a fleet report into autoReportFolder (checked hourly while VS Code is open). |
| 194 | `agentFarm.autoReportFolder` | `string` | `""` | Folder for automatic fleet reports (e.g. a folder inside your Obsidian vault). |
| 195 | `agentFarm.autoReportDays` | `number` | `7` | Period (in days) covered by automatic fleet reports. |
| 196 | `agentFarm.trendAlertFactor` | `number` | `2` | Warn when an agent's 7-day cost reaches this multiple of the previous 7 days. 0 disables trend alerts. |
| 197 | `agentFarm.costAnomalyMinUsd` | `number` | `1` | Statistical cost-anomaly detector (median + MAD over 14 days): ignore days below this USD level. 0 disables the detector. |
| 198 | `agentFarm.agentRowCostUnit` | `string` | `"tokens"` | Unit for the daily-usage suffix shown on each agent's row in the Agents view. Tokens by default since cost reads $0 until an agentFarm.pricing rule matches the model. |
| 199 | `agentFarm.evalRunArgs` | `string` | `"--model claude-haiku-4-5-20251001"` | CLI arguments for eval-set replay calls. Keep a cheap model for routine regression checks; empty = the agent's default model (more faithful, more expensive). |
| 200 | `agentFarm.autoReportIncludeOutputs` | `boolean` | `true` | Append the archived task-outputs digest to automatic fleet reports. |
| 201 | `agentFarm.budgets` | `object` | `{}` | Daily USD budgets by agent name (API-equivalent value). Use "*" for a fleet-wide budget. Example: {"agent_one": 20, "*": 50}. Warns at 80%, alerts when exceeded. A figure of 0 means NO CAP on that name, so {"*": 0} lifts the fleet ceiling while every per-agent figure stays in force. Tick 'budgetsUnlimited' to suspend every budget at once without losing the figures. |
| 202 | `agentFarm.budgetsUnlimited` | `boolean` | `false` | Suspend every daily budget: while this is on, no agent has a cap and nothing warns or blocks on spend, whatever 'budgets' says. The figures are kept, not cleared — turn it off and the budgets you set are back in force, unchanged. |
| 203 | `agentFarm.includeUnmatchedProjects` | `boolean` | `false` | Also include sessions whose working directory is outside the configured agent roots (shown under 'Other projects'). Applies to every engine — a Codex or Antigravity conversation in a stray folder is governed by this switch exactly like a Claude one. |
| 204 | `agentFarm.pricing` | `array` | `[{"match":"opus","input":15,"output":75,"cacheWrite":18.75,"cacheRead":1.5},{"match":"fable|mythos","input":15,"output":75,"cacheWrite":18.75,"cacheRead":1.5},{"match":"sonnet","input":3,"output":15,"cacheWrite":3.75,"cacheRead":0.3},{"match":"haiku","input":1,"output":5,"cacheWrite":1.25,"cacheRead":0.1}]` | Model pricing rules in USD per million tokens. First regex match wins. |
| 205 | `agentFarm.livingChecks` | `array` | `[]` | Living page checks. Each entry is {label, when:{kind,path,except,minCount,hours,recursive}, level:info\|warn\|alert, hint?}. The precondition is read as "TRUE = needs attention" - e.g. kind:fileMissing on today's diary file, or kind:folderHasFiles on an inbox that should be empty. Paths support {today} / {yesterday}. |
| 206 | `agentFarm.superpowersPath` | `string` | `""` | Folder that holds the Superpowers engineering-discipline skills (one folder per skill, each with a SKILL.md, plus using-superpowers/SKILL.md — the root hook). ‼️ Nothing here is loaded into a session by default: the files sleep on disk at zero tokens, and only the hook is put in front of a model when a session has Superpowers switched on. Portable: %USERPROFILE%, ~, $HOME, ${env:VAR} and ${workspaceRoot} are expanded when the folder is opened — what you type is kept exactly as typed. Empty = found next to your agents: _SKILLS/superpowers under each folder in agentFarm.agentRoots (or beside it, when a root names a single agent), first one holding the root hook. |
| 207 | `agentFarm.superpowersDefaults` | `object` | `{}` |  |
| 208 | `agentFarm.wikiRoot` | `string` | `""` | Folder that holds the LLM wiki — one folder per category, a page per concept, plus index.md, log.md and _KURALLAR_/-WIKI-ANAYASA-.md. wiki.compile and wiki.lint read it. Portable: %USERPROFILE%, ~, $HOME, ${env:VAR} and ${workspaceRoot} are expanded when the folder is opened, so the same settings.json works on another machine — what you type is kept exactly as typed. Empty = D:\zone\know\note\obsidian\00_WIKI. |
| 209 | `agentFarm.wikiAgent` | `string` | `""` | Which agent writes the wiki. wiki.compile.run starts a headless run under this agent unless one is named in the call — the synthesis belongs to an agent, so a compile needs somebody to be one. Empty = the first agent the farm knows. |
| 210 | `agentFarm.wikiEngine` | `string` | `""` | Which engine a wiki compile runs on when the call does not name one. Empty = Claude Code. A compile reads whole transcripts and writes pages under the vault's own law, so it is worth choosing deliberately rather than inheriting whatever the last session used. |
| 211 | `agentFarm.wikiModel` | `string` | `""` | --model for a wiki compile (alias or full id) when the call does not name one. Empty = the agent's own default. Synthesis is the expensive half of the wiki: this is where you decide it is worth a capable model. |
| 212 | `agentFarm.wikiEffort` | `string` | `""` | --effort for a wiki compile when the call does not name one. Empty = no flag. |
| 213 | `agentFarm.projectsRoot` | `string` | `""` | Folder that holds your project folders. A new project is offered a folder inside it, and Rescan Project Folders walks it. Leave empty to choose a folder by hand for every project. |
| 214 | `agentFarm.projectSkeleton` | `array` | `[]` | What a new project folder is built out of. Empty = the shipped default (Charter / Plan / Backlog / Backloglog / People / Worklog, plus 10_Notes, 20_Decisions, 30_Deliverables, 40_Resources, 90_Archive, 90_Archive/_tracks, _AF). Set your own to follow a vault naming convention: a path ending in / is a folder; {project} {id} {status} {date} {yymmdd} expand; "role" is what Agent Farm looks a document up by — never its file name, so you can rename anything afterwards; and "holds" is how a FOLDER is found for the same reason (decisions are one file each, and the backlog track ledger is not a note). |
| 215 | `agentFarm.projectsArchiveRoot` | `string` | `""` | Where an archived project's FOLDER is moved to. Empty derives it next to the projects root, the way a vault already mirrors its own folders: <parent>/99_ARCHIVE/<root name>_ARCHIVE. Archiving is never automatic and never happens as a side effect of setting a project's status — it is its own confirmed action, it shows both paths first, it refuses to land on anything that already exists, and Restore is the exact inverse. |
| 216 | `agentFarm.projectTemplates` | `array` | `[]` | Project templates — "another one like that". The list starts EMPTY on purpose: a template is a claim about how you work, so the way in is Save as Template on a project that already proved itself (⚙ Settings on its page), which asks what should travel. Each entry is {name, description?, kind?, status?, summary?, tags?, repos?, agents?, budgetUSD?, budgetTotalUSD?, color?, icon?, people?, plan?, backlog?, skeleton?}; plan and backlog items may be plain strings. A template never carries an id, a folder or a parent — those are identity, not shape. |
| 217 | `agentFarm.projectStaleDays` | `number` | `21` | Days of silence after which a project still marked active is flagged as quiet. 0 turns the check off. A project list without this becomes a graveyard nobody dares tidy. |
| 218 | `agentFarm.projectDigestDay` | `number` | `-1` | Which weekday to post each open project's weekly digest on: 0 Sunday … 6 Saturday. -1 (the default) is off — a digest nobody asked for is one more unread notice. The summary lands on the Notices board with the full report attached as its second leg, stamped with the project so it also appears on that project's Work tab and timeline. Posted once per project per week; the guard is the board itself, so two open windows cannot double-post. |
| 219 | `agentFarm.projectDigestHour` | `number` | `9` | The hour (local) after which the weekly project digest may be posted. It exists so a Monday digest is not written at 00:05 about a week that, in your head, ended eight hours ago. |
| 220 | `agentFarm.projectContextExtra` | `string` | `""` | One line of your own added to the project context every session gets (see the ◧ chip above the Console composer). This is where an installation points its agents at its own rules — e.g. "Your constitution's _REF/project-session.md applies to this session." Empty by default: Agent Farm ships general, and what an agent should DO with a project is yours to say. |
| 221 | `agentFarm.noticeStaleHours` | `number` | `24` | Hours after which an UNREAD level-3+ notice counts as ignored: it escalates on the Living page and in the status bar. A board nobody reads is the same as one nobody wrote to. |
| 222 | `agentFarm.idleSessionNoticeMinutes` | `number` | `30` | Minutes a session may sit waiting for your input before ONE notice is posted about it (0 disables). An idle session never blocks the farm, so it is not a Needs You row — but one left waiting all afternoon is a loop that quietly never closed. |
| 223 | `agentFarm.consoleDropZone` | `boolean` | `true` | Whether the Console page listens for a file dropped anywhere on it. Turn this off if drag-and-drop misbehaves on your machine; 📎 (Attach) and pasting a screenshot are unaffected either way. |
| 224 | `agentFarm.handoverSources` | `array` | `[]` |  |
| 225 | `agentFarm.handoverFolders` | `array` | `[]` |  |
| 226 | `agentFarm.sentryTemplatesFile` | `string` | `""` | A markdown file holding the words a sentry campaign starts the NEXT session with, when you want your own instead of the built-in ones. Same shape as Saved prompts: a heading names the verdict the block answers — item-done, clean-handover, nothing-to-continue, hit-the-wall, or * for any — and only text inside ``` fences is used. Placeholders like {nextCode}, {handoverPath}, {evidence} and {assist} are filled in; one nothing answers is left visible rather than blanked. A block replaces just that verdict, so every verdict you do not write keeps its built-in wording and this can stay empty for ever without anything being missing. A path named here that is not on disk is reported, never cleared. `sentry.templates` on the bridge shows what was read and what was refused, and it is the FIRST file of the pool rather than the whole of it: `agentFarm.sentryInstructionFiles` lists the rest, and a heading of your own that names no verdict is no longer discarded — it becomes material the sentry leader blends (`sentry.instructions`). |
| 227 | `agentFarm.sentryInstructionFiles` | `array` | `[]` |  |
| 228 | `agentFarm.sentryLeaderEngine` | `string` | `""` |  |
| 229 | `agentFarm.sentryLeaderModel` | `string` | `""` |  |
| 230 | `agentFarm.sentryLeaderBudgetUsd` | `number` | `2` |  |
| 231 | `agentFarm.sentryLeaderMaxSeconds` | `number` | `120` |  |
| 232 | `agentFarm.sentryLeaderMaxUsd` | `number` | `0.25` |  |
| 233 | `agentFarm.sentryLeaderFailLimit` | `number` | `3` |  |
| 234 | `agentFarm.sentryFailureLimit` | `number` | `3` | How many BARREN rounds in a row switch a sentry campaign off. A round is barren when the run failed, or when it "succeeded" and left nothing behind at all. This is not a round budget — a campaign that is WORKING runs until you stop it — it is an alarm for the case no quota can catch: a broken setup opening empty sessions all night, each one failing instantly and therefore spending nothing. The streak is wiped by the first round that achieves something. 0 switches the brake off entirely. A campaign may carry its own limit (sentry.start { failLimit }). |
| 235 | `agentFarm.sentryIdlePollMin` | `number` | `10` | How often, in minutes, an IDLING sentry campaign looks at the backlog again. An empty backlog is a wait rather than a finish, so something has to notice the item you write tomorrow morning — and that something is the beat the farm already keeps, not a timer of the sentry's own. It does not apply while a round is on the board (that round ending is what drives the next one) and it never shortens a measured sleep: a three-hour quota wall is waited out, not poked every ten minutes. |
| 236 | `agentFarm.sentryStallMin` | `number` | `45` | How long, in minutes, a sentry round may say nothing before the watchdog ends it. The campaign's loop is driven by rounds ENDING, so a round that never ends holds it for ever — and an unattended session parked on a permission prompt is exactly that: it spends nothing, so the quota never breaks the deadlock either. Silence is measured from the run's own output, so a thinking turn is never touched. The round is ended as FAILED (which counts against the failure brake), never as cancelled (which is your hand and would stop the campaign), and it is not retried. 0 switches the watchdog off. |
| 237 | `agentFarm.sessionBreakMin` | `number` | `30` | How long, in minutes, a pause between two turns has to run before the session counts as PUT DOWN rather than thinking. A conversation you resume the next morning is one session with a night inside it, and the Duration column measured first message to last — so it read as a day and a half, and cost per hour was divided by your sleep. Only the stretch BETWEEN turns is taken off; a long round is the work itself and is never called absence. The wall clock is still on the cell, next to what was actually run. 0 switches the split off and Duration goes back to being first-to-last. |
| 238 | `agentFarm.promptSnippetsFile` | `string` | `""` | The markdown file holding the phrases you say to an agent over and over. Farm Settings → Saved prompts is where you pick it, see what was read out of it, and open it. Right-click any button that SENDS text in the Console — Send · Send into turn · Send after turn · Start session — and those blocks are offered to paste into the message box. Only text inside ``` fences is offered; everything around them is your own notes. Left empty, Agent Farm falls back to a built-in path in the vault while that file exists — so this stays empty on a machine where it does not, and nothing has to be cleared. |

---

## 4. Bridge RPC Operasyonları (`farm.ops`) — Toplam: 344

1. `accounts.activate`
2. `accounts.attribution`
3. `accounts.autoRefresh`
4. `accounts.capture`
5. `accounts.complete`
6. `accounts.forget`
7. `accounts.list`
8. `accounts.portable`
9. `accounts.promotions`
10. `accounts.reauth`
11. `accounts.refresh`
12. `accounts.repairLinks`
13. `accounts.repairSettings`
14. `accounts.repairs`
15. `accounts.status`
16. `agents.create`
17. `agents.defaults`
18. `agents.list`
19. `agents.pack.import`
20. `agents.roots`
21. `agents.sync`
22. `airtable.config.get`
23. `airtable.config.set`
24. `airtable.folders.add`
25. `airtable.folders.remove`
26. `airtable.instances`
27. `airtable.register`
28. `airtable.start`
29. `airtable.status`
30. `airtable.unregister`
31. `alerts.gate`
32. `alerts.mute`
33. `alerts.nudge`
34. `alerts.on`
35. `alerts.play`
36. `alerts.quiet`
37. `alerts.read`
38. `alerts.resolve`
39. `alerts.session`
40. `alerts.speak`
41. `alerts.status`
42. `alerts.voice.add`
43. `alerts.voice.remove`
44. `alerts.voice.rename`
45. `alerts.voice.set`
46. `alerts.voices`
47. `automations.bulk`
48. `automations.pause`
49. `automations.quietHours`
50. `automations.resume`
51. `automations.status`
52. `browser.login`
53. `browser.recipes`
54. `calendar.add`
55. `calendar.list`
56. `calendar.set`
57. `console.answer`
58. `console.changes`
59. `console.close`
60. `console.continueFromHandover`
61. `console.forgetWindow`
62. `console.interrupt`
63. `console.older`
64. `console.permissionMode`
65. `console.queue`
66. `console.send`
67. `console.sessions`
68. `console.setAccount`
69. `console.setEffort`
70. `console.setModel`
71. `console.start`
72. `console.stopTask`
73. `console.switch`
74. `constitution.sync`
75. `dispatch.test`
76. `duties.add`
77. `duties.automate`
78. `duties.delete`
79. `duties.list`
80. `duties.move`
81. `duties.togglePause`
82. `duties.update`
83. `engines.models`
84. `engines.status`
85. `engines.test`
86. `evals.add`
87. `evals.delete`
88. `evals.list`
89. `evals.runs`
90. `farm.health`
91. `farm.reloadWindow`
92. `farm.restartExtensionHost`
93. `farm.waits`
94. `farm.workArea`
95. `insights.delegate`
96. `insights.dismiss`
97. `insights.dismissed`
98. `insights.history`
99. `insights.list`
100. `insights.restore`
101. `launch.manifests`
102. `launch.permission`
103. `launch.profile.delete`
104. `launch.profile.rename`
105. `launch.profile.set`
106. `launch.profiles`
107. `launch.runtime`
108. `live.alerts.get`
109. `live.alerts.set`
110. `live.alerts.test`
111. `live.versions`
112. `living.check.add`
113. `living.check.remove`
114. `living.checks`
115. `living.pulse`
116. `media.enrich`
117. `media.find`
118. `media.library`
119. `media.library.file`
120. `media.library.plan`
121. `media.pending`
122. `media.pending.flush`
123. `media.record`
124. `media.restage`
125. `migration.verify`
126. `missions.answer`
127. `missions.approve`
128. `missions.cancel`
129. `missions.conversation`
130. `missions.council`
131. `missions.guide`
132. `missions.list`
133. `missions.outcomes`
134. `missions.pause`
135. `missions.preview`
136. `missions.rerun`
137. `missions.resume`
138. `missions.run.delete`
139. `missions.start`
140. `missions.status`
141. `missions.store`
142. `missions.trace`
143. `needs.act`
144. `needs.clear`
145. `needs.list`
146. `needs.restore`
147. `now.get`
148. `packs.gallery`
149. `parallel.run`
150. `performance.summary`
151. `plan.delete`
152. `policies.delete`
153. `policies.list`
154. `policies.save`
155. `projects.analysis`
156. `projects.archive`
157. `projects.archived`
158. `projects.assign`
159. `projects.backlog`
160. `projects.backlog.add`
161. `projects.backlog.archive`
162. `projects.backlog.check`
163. `projects.backlog.code`
164. `projects.backlog.gather`
165. `projects.backlog.hold`
166. `projects.backlog.move`
167. `projects.backlog.next`
168. `projects.backlog.open`
169. `projects.backlog.promote`
170. `projects.backlog.queue`
171. `projects.backlog.reorder`
172. `projects.backlog.set`
173. `projects.backlog.tidy`
174. `projects.backlog.under`
175. `projects.backloglog`
176. `projects.brief`
177. `projects.code`
178. `projects.cost`
179. `projects.create`
180. `projects.current`
181. `projects.decision.add`
182. `projects.deliver`
183. `projects.doc.backups`
184. `projects.doc.list`
185. `projects.doc.read`
186. `projects.doc.write`
187. `projects.get`
188. `projects.handover`
189. `projects.health`
190. `projects.list`
191. `projects.log`
192. `projects.people.set`
193. `projects.plan`
194. `projects.plan.add`
195. `projects.plan.check`
196. `projects.rename`
197. `projects.report`
198. `projects.rescan`
199. `projects.sessions`
200. `projects.set`
201. `projects.suggest`
202. `projects.suggest.apply`
203. `projects.template.delete`
204. `projects.template.save`
205. `projects.templates`
206. `projects.timeline`
207. `projects.track`
208. `projects.track.note.restore`
209. `projects.track.rebuild`
210. `projects.track.restore`
211. `projects.tracks`
212. `projects.tracks.backfill`
213. `projects.work`
214. `prompts.list`
215. `prompts.setFile`
216. `providers.add`
217. `providers.copy`
218. `providers.list`
219. `providers.ownership`
220. `providers.remove`
221. `providers.runtime`
222. `providers.set`
223. `providers.status`
224. `providers.test`
225. `quality.sample`
226. `schedules.add`
227. `schedules.delete`
228. `schedules.edit`
229. `schedules.forecast`
230. `schedules.list`
231. `schedules.runNow`
232. `schedules.toggle`
233. `search.index.build`
234. `search.transcripts`
235. `sentry.handover`
236. `sentry.instructions`
237. `sentry.leader`
238. `sentry.pause`
239. `sentry.probe`
240. `sentry.prompt`
241. `sentry.resume`
242. `sentry.start`
243. `sentry.status`
244. `sentry.stop`
245. `sentry.templates`
246. `sessions.answerPermission`
247. `sessions.bindings`
248. `sessions.bridgeGuard`
249. `sessions.color`
250. `sessions.contextGuard`
251. `sessions.contextGuard.set`
252. `sessions.dismiss`
253. `sessions.end`
254. `sessions.export`
255. `sessions.files`
256. `sessions.find`
257. `sessions.forceKill`
258. `sessions.interrupt`
259. `sessions.lastLaunch`
260. `sessions.live`
261. `sessions.opencodeExport`
262. `sessions.opencodeSync`
263. `sessions.page`
264. `sessions.pin`
265. `sessions.read`
266. `sessions.recent`
267. `sessions.rename`
268. `sessions.rescan`
269. `sessions.resumeRoute`
270. `sessions.shelf`
271. `sessions.shellGuard`
272. `sessions.start`
273. `sessions.tag`
274. `sessions.whoami`
275. `suggestions.apply`
276. `suggestions.dismiss`
277. `suggestions.list`
278. `suggestions.scan`
279. `tasks.add`
280. `tasks.cancel`
281. `tasks.clearFinished`
282. `tasks.complete`
283. `tasks.delete`
284. `tasks.export`
285. `tasks.get`
286. `tasks.history`
287. `tasks.historyOpen`
288. `tasks.list`
289. `tasks.move`
290. `tasks.rerun`
291. `tasks.restore`
292. `tasks.runNext`
293. `tasks.start`
294. `tasks.supervision`
295. `tasks.unpark`
296. `telegram.commands`
297. `telegram.digest`
298. `telegram.focus`
299. `telegram.inbox`
300. `telegram.routing`
301. `telegram.status`
302. `templates.add`
303. `templates.delete`
304. `templates.list`
305. `templates.run`
306. `timeline.corpus`
307. `tools.recipes`
308. `tools.run`
309. `triggers.add`
310. `triggers.delete`
311. `triggers.edit`
312. `triggers.fire`
313. `triggers.list`
314. `triggers.toggle`
315. `ui.ctxmenu`
316. `usage.engines`
317. `usage.plan`
318. `usage.window`
319. `web.bind`
320. `web.enable`
321. `web.status`
322. `web.stop`
323. `web.token.new`
324. `workflows.add`
325. `workflows.addRecipe`
326. `workflows.answer`
327. `workflows.decide`
328. `workflows.delete`
329. `workflows.list`
330. `workflows.live`
331. `workflows.recipes`
332. `workflows.resume`
333. `workflows.roles`
334. `workflows.run`
335. `workflows.select`
336. `workflows.status`
337. `workflows.steer`
338. `workflows.step.add`
339. `workflows.step.delete`
340. `workflows.step.move`
341. `workflows.step.update`
342. `workflows.supervisor.status`
343. `workflows.update`
344. `workflows.wakeFields`

---

## 5. Çekirdek Alt Sistem Modülleri (`src/core/`) — Toplam: 438

- `a2aBridge.ts`
- `a2aHygiene.ts`
- `a2aMatch.ts`
- `a2aNotes.ts`
- `a2aStore.ts`
- `a2aSupervisor.ts`
- `a2aTasks.ts`
- `abtest.ts`
- `accountAttribution.ts`
- `accountEvidence.ts`
- `accountPolicy.ts`
- `accountQueue.ts`
- `accountSpend.ts`
- `accountStore.ts`
- `accountUsage.ts`
- `aflaunch.ts`
- `aftime.ts`
- `agentArg.ts`
- `agentDefaults.ts`
- `agentpack.ts`
- `agents.ts`
- `agy.ts`
- `agyproto.ts`
- `agyUsageBeat.ts`
- `airtable.ts`
- `airtableInput.ts`
- `airtableStart.ts`
- `alertGate.ts`
- `alertVoices.ts`
- `allInIntake.ts`
- `allInOps.ts`
- `anomaly.ts`
- `antigravity.ts`
- `appliedTurn.ts`
- `atomicFile.ts`
- `authorship.ts`
- `autoAnswer.ts`
- `autoAnswerFilter.ts`
- `autoAnswerPicks.ts`
- `autoAnswerTimers.ts`
- `automation.ts`
- `backlogBirth.ts`
- `backlogBlock.ts`
- `backlogEdits.ts`
- `backlogSanitize.ts`
- `backlogTrack.ts`
- `baton.ts`
- `batonAttach.ts`
- `batonBoard.ts`
- `batonBrake.ts`
- `batonBridge.ts`
- `batonDoor.ts`
- `batonEnd.ts`
- `batonFailsafe.ts`
- `batonLastLeg.ts`
- `batonLastLegOp.ts`
- `batonLegEnd.ts`
- `batonLegFacts.ts`
- `batonLegs.ts`
- `batonLegsOp.ts`
- `batonRules.ts`
- `batonRunner.ts`
- `batonSeal.ts`
- `batonStore.ts`
- `batonView.ts`
- `billing.ts`
- `bindingReach.ts`
- `brandBridge.ts`
- `brandKit.ts`
- `brandPresets.ts`
- `bridge.ts`
- `bridgeGuard.ts`
- `bridgeGuardLog.ts`
- `briefing.ts`
- `browser.ts`
- `browserDownloads.ts`
- `browserLogin.ts`
- `browserRecipes.ts`
- `calendarSignals.ts`
- `chainMembership.ts`
- `chainOps.ts`
- `charterGaps.ts`
- `charterHealth.ts`
- `checkpointStep.ts`
- `claudesettings.ts`
- `cliSessions.ts`
- `cliTranscripts.ts`
- `cliViewer.ts`
- `closingSetup.ts`
- `closingSetupStore.ts`
- `codeedits.ts`
- `codex.ts`
- `codexctx.ts`
- `codexHooks.ts`
- `codexproto.ts`
- `commandbar.ts`
- `consoleEngine.ts`
- `consolehistory.ts`
- `consolehost.ts`
- `consoleNeeds.ts`
- `consoleproto.ts`
- `consoleRegistry.ts`
- `consoleresume.ts`
- `consoleRevive.ts`
- `consoleTaskRevive.ts`
- `contentCalendar.ts`
- `contentMetrics.ts`
- `contentRecipes.ts`
- `contextGuard.ts`
- `corpus.ts`
- `credentialCarry.ts`
- `ctxmenu.ts`
- `decisionCore.ts`
- `dispatch.ts`
- `distill.ts`
- `docBackup.ts`
- `docopen.ts`
- `duties.ts`
- `embeddings.ts`
- `engineAccounts.ts`
- `engineConfigDiagnosis.ts`
- `engineFault.ts`
- `engineFaultOps.ts`
- `engineFaultWatch.ts`
- `engines.ts`
- `engineTest.ts`
- `engineUsage.ts`
- `enrichSpec.ts`
- `evals.ts`
- `examples.ts`
- `exportDoc.ts`
- `externalImports.ts`
- `extTerminal.ts`
- `farmstatus.ts`
- `firewallVerdict.ts`
- `firewallWin.ts`
- `flexActions.ts`
- `flexBridge.ts`
- `flexForms.ts`
- `flexOverrides.ts`
- `flexPoints.ts`
- `flexPresets.ts`
- `flexResolve.ts`
- `flexWorkflow.ts`
- `forEachStep.ts`
- `forecast.ts`
- `gemini.ts`
- `geminiproto.ts`
- `gitfile.ts`
- `handoffLine.ts`
- `handoverDiscovery.ts`
- `health.ts`
- `hooksCockpit.ts`
- `hooksInstaller.ts`
- `humanAsk.ts`
- `i18n.ts`
- `infraBridge.ts`
- `ingest.ts`
- `insighthistory.ts`
- `insightops.ts`
- `instrhistory.ts`
- `interrupt.ts`
- `jsoncPatch.ts`
- `jsonJournal.ts`
- `jsonTemplate.ts`
- `judgeCompare.ts`
- `judgeDecision.ts`
- `judgeEngines.ts`
- `judgeLadder.ts`
- `kapici`
- `kapiciBridge.ts`
- `kapiciChip.ts`
- `kapiciMcp.ts`
- `kapiciStep.ts`
- `kapiciSupervisor.ts`
- `kapiciTrigger.ts`
- `keyOwnership.ts`
- `launch.ts`
- `launchBinding.ts`
- `launchDimensions.ts`
- `launchManifest.ts`
- `launchProfiles.ts`
- `launchProvider.ts`
- `legRoots.ts`
- `lineBreaks.ts`
- `live.ts`
- `liveChoice.ts`
- `liveWait.ts`
- `living.ts`
- `mcp.ts`
- `mcpProbe.ts`
- `mdTable.ts`
- `media.ts`
- `mediaBackfill.ts`
- `mediaCandidates.ts`
- `mediaEnrich.ts`
- `mediaEnricher.ts`
- `mediaLibrary.ts`
- `mediaPending.ts`
- `mediaProbe.ts`
- `mediaProviders.ts`
- `mediaRecipes.ts`
- `mediaRecorder.ts`
- `mediaRecordFields.ts`
- `mediaStepResult.ts`
- `mediaUpload.ts`
- `mediaUploadBridge.ts`
- `memgraph.ts`
- `memoryBridge.ts`
- `memorySync.ts`
- `memquery.ts`
- `memusage.ts`
- `messaging.ts`
- `migrationGate.ts`
- `misplaced.ts`
- `missionConversation.ts`
- `missionCouncil.ts`
- `missionEvaluation.ts`
- `missionFailure.ts`
- `missionMode.ts`
- `missionOutcomes.ts`
- `missionPrimitives.ts`
- `missions.ts`
- `missionTrace.ts`
- `modelpolicy.ts`
- `models.ts`
- `needs.ts`
- `needsAct.ts`
- `notices.ts`
- `noticeToQueue.ts`
- `nowPage.ts`
- `oauthRefresh.ts`
- `oneShot.ts`
- `opencode.ts`
- `opencodeacp.ts`
- `opencodeharvest.ts`
- `opencodehistory.ts`
- `opencodeLockRetry.ts`
- `opencodeproto.ts`
- `opencoderun.ts`
- `opencodesync.ts`
- `opencodeVariant.ts`
- `otel.ts`
- `owner.ts`
- `packgallery.ts`
- `parallelRuns.ts`
- `parity.ts`
- `passCause.ts`
- `pathVars.ts`
- `permissionmode.ts`
- `permlint.ts`
- `plannerLaunch.ts`
- `planusage.ts`
- `policyEngine.ts`
- `portablePaths.ts`
- `portableState.ts`
- `portScan.ts`
- `premiere.ts`
- `pricing.ts`
- `processTree.ts`
- `production.ts`
- `projectAnalysis.ts`
- `projectArchive.ts`
- `projectBacklog.ts`
- `projectContext.ts`
- `projectDocs.ts`
- `projectFeed.ts`
- `projectHandover.ts`
- `projectPlan.ts`
- `projectReport.ts`
- `projects.ts`
- `projectStore.ts`
- `projectSuggest.ts`
- `projectTemplates.ts`
- `prompts.ts`
- `providerAdapter.ts`
- `providerCatalog.ts`
- `providerHealth.ts`
- `providerIdentity.ts`
- `providerOwnership.ts`
- `providerProfiles.ts`
- `providerRegistry.ts`
- `providerRuntime.ts`
- `providerSwitch.ts`
- `publishStep.ts`
- `pulse.ts`
- `qr.ts`
- `qrTables.ts`
- `quality.ts`
- `query.ts`
- `queueHygiene.ts`
- `quickmenu.ts`
- `quotaBrake.ts`
- `quotaStyle.ts`
- `quotaView.ts`
- `quotaWeek.ts`
- `relay.ts`
- `relayTitle.ts`
- `remoteCard.ts`
- `remoteEvents.ts`
- `remoteListen.ts`
- `remoteOps.ts`
- `report.ts`
- `reportBridge.ts`
- `reportedIdentity.ts`
- `repoWeight.ts`
- `resumeGate.ts`
- `retry.ts`
- `retryIncident.ts`
- `retrySupervision.ts`
- `retrySupervisor.ts`
- `reveal.ts`
- `runContext.ts`
- `runEnrich.ts`
- `runFilter.ts`
- `runLibrary.ts`
- `runLibrarySpec.ts`
- `runSpendCap.ts`
- `runWithTask.ts`
- `savedRoutes.ts`
- `search.ts`
- `secrets.ts`
- `secretScrub.ts`
- `selectionWaits.ts`
- `selfRestart.ts`
- `semantic.ts`
- `sentryCampaign.ts`
- `sentryDriver.ts`
- `sentryLeader.ts`
- `sentryMeasure.ts`
- `sentryPolicy.ts`
- `sentryPrompt.ts`
- `sentryRun.ts`
- `sentryWatch.ts`
- `sentryWhy.ts`
- `sequenceExport.ts`
- `sessionDiagnosis.ts`
- `sessionExport.ts`
- `sessionFind.ts`
- `sessionmarks.ts`
- `sessionRead.ts`
- `sessionResident.ts`
- `sessions.ts`
- `sessionSource.ts`
- `sessionSpan.ts`
- `sessionStore.ts`
- `settingsBridge.ts`
- `settingsDoor.ts`
- `settingShape.ts`
- `settingsops.ts`
- `shellGuard.ts`
- `shellReady.ts`
- `skills.ts`
- `slashCommands.ts`
- `slotCompleteness.ts`
- `slotPromote.ts`
- `slotRepairs.ts`
- `slotSettings.ts`
- `slotWatch.ts`
- `soundAgents.ts`
- `soundCard.ts`
- `soundHeader.ts`
- `soundSession.ts`
- `soundWhy.ts`
- `speaker.ts`
- `speech.ts`
- `staleOp.ts`
- `staleScan.ts`
- `stallJudge.ts`
- `startRoom.ts`
- `stayAccount.ts`
- `stepkind.ts`
- `studio.ts`
- `studioBridge.ts`
- `studioLibrary.ts`
- `studioLibraryOps.ts`
- `studioLibraryWrite.ts`
- `suggest.ts`
- `summary.ts`
- `superpowers.ts`
- `supervisorBrief.ts`
- `supervisorDecision.ts`
- `supervisorRun.ts`
- `supervisorRunner.ts`
- `supervisorTrail.ts`
- `supervisorWire.ts`
- `syncMerge.ts`
- `syncMergeOps.ts`
- `taskcost.ts`
- `taskRounds.ts`
- `tasks.ts`
- `taskstats.ts`
- `telegram.ts`
- `telegramCockpit.ts`
- `telegramCommands.ts`
- `telegramDigest.ts`
- `telegramExecution.ts`
- `telegramLaunch.ts`
- `telegramRouting.ts`
- `terminalRender.ts`
- `textSearchCorpus.ts`
- `toolbox.ts`
- `toolboxBridge.ts`
- `toolCall.ts`
- `toolRun.ts`
- `transcriptRead.ts`
- `triggers.ts`
- `triggerstats.ts`
- `turnAlerts.ts`
- `turnRuntime.ts`
- `turns.ts`
- `turnWait.ts`
- `usageFloor.ts`
- `usageFloorFile.ts`
- `usageGate.ts`
- `usageShelf.ts`
- `util.ts`
- `vaultDiscovery.ts`
- `waits.ts`
- `wall.ts`
- `webCockpit.ts`
- `webpage.ts`
- `webserver.ts`
- `websnapshot.ts`
- `whoami.ts`
- `wiki.ts`
- `wikiCategory.ts`
- `workArea.ts`
- `workdirChanges.ts`
- `workflowAsk.ts`
- `workflowInputs.ts`
- `workflowLive.ts`
- `workflowMission.ts`
- `workflowPolicy.ts`
- `workflowRoles.ts`
- `workflowWake.ts`
- `workqueue.ts`
- `worktree.ts`
