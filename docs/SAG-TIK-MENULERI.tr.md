# Agent Farm — Sağ Tık Menüleri: Tasarım ve Yol Haritası

*Başlangıç: 2026-08-06 · Bu belge hem tasarımın kendisi hem de ilerleme defteri. Bir madde bitince kutusu işaretlenir ve karşısına sürüm yazılır. Yarım bırakılan iş "neyi denedim" notuyla birlikte kalır — sonraki ajan buradan devam eder.*

> **✅ SEKİZ FAZ DA BİTTİ — 3.71.0 → 3.77.0 (2026-08-06).** Eklentideki her sayfa,
> her satır türü sağ tık menüsü taşıyor. Sözleşmeyi ayakta tutan üç şey:
> `src/core/ctxmenu.ts` (tek katalog) · `test/test_ctxmenu.js` (katalog ile
> `package.json` ayrışamaz) · `test/test_ctxmenu_reach.js` (menüsü olup da
> söylemeyen satır, katalogda karşılığı olmayan bölüm, sayfası olmayan katalog
> maddesi — üçü de derlemeyi düşürür). Kalanlar için: her fazın altındaki
> **"Bilerek yapılmadı"** notları neden yapılmadığını yazıyor; yeni bir yüzey
> eklerken önce oraya bakılsın.

---

## 1. İlke

Eklentide bugün sağ tık menüsü **sadece oturum satırlarında** var (Konsol kartları, Timeline kulvarları, oturum tabloları, Turns, arama sonuçları). Geri kalan her yerde sağ tık = Kes/Kopyala/Yapıştır. Oysa her satır bir **nesne**: bir backlog maddesi, bir görev, bir bildirim, bir beceri, bir varlık, bir ayar. O nesneyle yapılabilecek her şey ya bir satır düğmesinin arkasında (dar, yer kaplıyor, koşullu görünüyor), ya komut paletinde (207 komut, hangisinin bu satıra uyduğunu kimse bilmiyor), ya da hiçbir yerde.

Üç kural, tasarımın tamamı bunlardan türüyor:

1. **Bir nesneyle yapılabilecek her şey, o nesnenin sağ tık menüsündedir.** Satır düğmeleri menünün yerini tutmaz — düğme "en sık yapılan"dır, menü "yapılabilecek olan"dır.
2. **Aynı nesne nerede görünürse görünsün aynı menüyü taşır.** Oturum satırında bu zaten böyle (`afSessionCtx.js`); kural her nesne türüne genişletiliyor. Bir ajan Dashboard'da, Portfolio'da, Ayarlar'da ve Timeline'da aynı menüyü verir.
3. **Menü, düğmenin yaptığının aynısını yapar.** Menü maddesi işi yeniden yazmaz; sayfanın kendi eylem yolunu çağırır. Tek doğruluk kaynağı, arayüzün kullandığı koddur (`_REF/agentfarm-dev.md` §2).

Ek olarak: **bir menü, varlığı bilinmiyorsa özellik değildir.** Sağ tık menüsü olan her satırın tooltip'i "— right-click for more" kuyruğunu taşır (oturumlarda zaten var: `AFSessionCtx.HINT`).

---

## 2. Mekanizma

VS Code webview'inde sağ tık menüsü **kendi HTML menümüzle değil**, `data-vscode-context` + `package.json`'daki `menus["webview/context"]` ile kurulur. Bu bilinçli: `contextmenu` olayını ele geçirmek sayfanın kendi menüsünü (Kopyala/Yapıştır, yazım denetimi, Inspect) elinden alır. `afSessionCtx.js`'in başındaki not bu kararı zaten yazıyor; genişletme aynı yolu izler.

```
satır HTML'i          data-vscode-context='{"webviewSection":"afBacklogRow","code":"S-6",…}'
        │
        ▼ sağ tık
VS Code   →  webviewSection ve diğer anahtarlar geçici context key olur
        │
        ▼ when eşleşen menü maddeleri çizilir
komut     →  agentfarm.ctx.<id>  (argüman = yukarıdaki JSON nesnesinin tamamı)
        │
        ▼
relay     →  ctx.afPanel ile hangi webview olduğu bulunur → postMessage {type:'afctx', act, ctx}
        │
        ▼
sayfa     →  ctxDo(act, ctx) → düğmenin çağırdığı fonksiyonun aynısı
```

**İki tür menü maddesi var, ikisi de gerekli:**

| Tür | Ne zaman | Nasıl |
|---|---|---|
| **Gerçek komut** | Eylemin zaten host tarafında bir komutu varsa (`agentfarm.pinSession`, `agentfarm.openAgentDetail`, `agentfarm.deleteTask`…) | Menü doğrudan o komutu çağırır. Sayfadan bağımsız çalışır, paletten de erişilir, köprüde zaten vardır. **Tercih edilen yol.** |
| **Relay** | Eylem yalnızca sayfanın içinde varsa (backlog önceliği, bildirim yıldızı, varlık triyajı…) | `agentfarm.ctx.<id>` komutu mesajı sayfaya geri atar; sayfa kendi eylemini çalıştırır. Böylece menü ile düğme **asla ayrışamaz**. |

### 2.1 Relay'in adresi: `afPanel`

`webview/context` komutu host tarafında çalışır ve VS Code hangi webview'den geldiğini söylemez. Bu yüzden `htmlShell` her sayfa örneğine benzersiz bir anahtar verir (`__AFUI__.ctxPanel`), webview'i bir kayıt defterine yazar; `AFCtx` her context nesnesine `afPanel` anahtarını otomatik koyar. Aynı türden birden çok pencere (oturum görüntüleyici, ajan detayı) böylece karışmaz.

### 2.2 Alt menüler

Bazı nesnelerin 15+ eylemi var; düz liste okunmaz. `contributes.submenus` ile gruplar açılır menüye iner: **Priority ▸**, **Effort ▸**, **Copy ▸**, **Open with ▸**, **Project ▸**. Üst seviyede yalnızca en sık kullanılan 5–8 madde kalır.

> ⚠ **Doğrulanacak varsayım:** alt menülerin `webview/context` içinde çizildiği belgelerden okunuyor ama bu depoda hiç denenmedi. Faz 0'da tek bir alt menü ile canlı doğrulanır; çizilmezse tasarım düz gruplara iner (üst seviyede `1_x@n` grup ayraçlarıyla).

### 2.3 Koşullu maddeler

Context nesnesine konan her anahtar `when` içinde okunabilir. "Pin" ile "Unpin" ayrı maddeler değil; satır `afPinned` taşır ve iki madde birbirini dışlar. Aynı şey durum (`afState`), tür (`afKind`), canlılık (`afLive`) için geçerli.

### 2.4 Tek kaynak: katalog

Menü sayısı 250'ye yaklaşıyor; elle üç yerde tutulursa (komut kaydı, `commands`, `menus`) kaçınılmaz olarak ayrışır. Bu yüzden:

- `src/core/ctxmenu.ts` — **katalog**. Her maddenin `id`, `title`, `section`, `group`, `act`/`command`, `when` alanı.
- `test/test_ctxmenu.js` — katalog ile `package.json`'ın aynı olduğunu doğrular; `--fix` ile `package.json`'ı katalogdan yeniden yazar (aynen `test_encoding.js` gibi). `npm run package` ve pre-commit kancası bunu çalıştırır → **sessizce ayrışma imkânsız.**
- Relay komutları `ctxmenu.ts`'ten döngüyle kaydedilir; hiçbiri komut paletinde görünmez (`commandPalette` + `when: false`).

### 2.5 Köprü

Sağ tık, var olan işlevlere yeni bir yol açar — yeni işlev değildir, dolayısıyla çoğu madde için yeni köprü op'u gerekmez. İki istisna:
- Bu iş sırasında **gerçekten yeni** bir eylem doğarsa (bugün hiçbir yerde olmayan), `_REF/agentfarm-dev.md` kuralı aynen işler: aynı commit'te `bridge.register`.
- Katalogun kendisi okunabilir olmalı: `ui.ctxmenu` op'u, "şu nesneye ne yapılabilir" sorusunun ajan tarafındaki cevabı.

---

## 3. Adlandırma

- **Bölüm (webviewSection):** `af` + nesne + rolü → `afBacklogRow`, `afTaskRun`, `afNoticeRow`, `afSkillRow`, `afAssetCard`. Var olan üçü (`afSessionRow`, `afConsoleSession`, `afConsoleResumable`, `afTimelineSession`) korunur.
- **Komut kimliği:** gerçek komutlar mevcut adlarını kullanır; relay komutları `agentfarm.ctx.<nesne><Eylem>` → `agentfarm.ctx.backlogPriorityHigh`.
- **Gruplar:** `1_open` (aç/git) · `2_edit` (değiştir) · `3_move` (sırala/taşı) · `4_link` (proje/kuyruk/ajan bağla) · `5_copy` (kopyala) · `9_danger` (sil/durdur). Sıra her nesnede aynı — kas hafızası menüden menüye taşınır.
- **Başlıklar İngilizce** (arayüz kovası). Sonu `…` olan madde bir soru soracak demektir; bu depoda zaten böyle.

---

## 4. Envanter ve menü tasarımı

Aşağıdaki tablolarda ✔ = bugün var, + = eklenecek.

### 4.1 Oturum satırı — `afSessionRow` (ve Konsol/Timeline varyantları) ✔ *büyük ölçüde tamam*
Dashboard · Sessions tablosu · Turns · Arama · Konsol · Timeline · Missions akışı · Proje Sessions sekmesi.
Mevcut 14 madde: Open Transcript · Resume in Terminal/Console · Focus Terminal · Rename · Pin · Label · Copy Session ID · Interrupt · End · Clear · Project (3 madde).
**+ Eklenecek:** Copy transcript path · Export MD · Open in Turns page · Open folder (cwd) in Explorer · Copy cwd · Add to Queue (bu oturum hakkında iş) · Open the agent behind it.

### 4.2 Projeler sayfası (`projects.js`) — **en yoğun sayfa, ilk faz**

| Nesne | Bölüm | Menü |
|---|---|---|
| Proje kartı (liste) | `afProjectRow` | Open · Set Active · Open Sessions · Reveal Folder · Rename… · Rescan folders · Start Session here… · Copy ▸ (id · folder path · name) · 9: Delete |
| Plan maddesi | `afPlanItem` | Tick / Untick · Open in Obsidian at line · Open in VS Code at line · Add item below… · Move to Backlog… · Copy ▸ (text · line link) |
| Backlog satırı | `afBacklogRow` | Start work on this… · State ▸ (open · doing · done · cancelled) · Priority ▸ (⏫🔼🔽⏬ · clear) · Effort ▸ (XS…XL · clear) · Type ▸ · Move ▸ (front · back · up · down) · Open at line ▸ (Obsidian · VS Code) · Track history · Add to Queue · Edit text… · Copy ▸ (code · text · code+text) · 9: Archive |
| Track satırı | `afTrackRow` | Open that turn · Open transcript · Copy session id · Copy turn link |
| Doküman satırı | `afDocRow` | Open ▸ (Obsidian · VS Code · beside) · Reveal in Explorer · Copy path · New document here… |
| Kişi satırı | `afPersonRow` | Edit… · Remove · Copy name · Copy role |
| Timeline olayı | `afFeedEvent` | Open what it points at · Show only this kind · Hide this kind · Copy line |
| Kod kökü (Settings sekmesi) | `afCodeRoot` | Open folder · Reveal · Remove · Copy path |

### 4.3 Görevler (`tasksPage.js`)

| Nesne | Bölüm | Menü |
|---|---|---|
| Plan satırı (schedule/trigger/workflow/template) | `afPlanRow` | Run Now · Edit… · Enable / Disable · Rename… (workflow) · Add Step (workflow) · Export as Windows Scheduled Task… · Open Task History · Copy ▸ (prompt · id) · 9: Delete |
| Workflow adımı | `afWorkflowStep` | Edit Step… · Move Up · Move Down · Resume workflow from here · Copy step prompt · 9: Delete Step |
| Koşu satırı | `afTaskRun` | Start · Run Next · Reveal Terminal · Open Output · Open Transcript · Re-run · Retry with edited prompt… · Save as Template · Copy ▸ (prompt · id · output path) · 9: Cancel · Delete |
| Şablon | `afTemplateRow` | New Task from Template · Copy prompt · 9: Delete Template |

### 4.4 Görevler (Missions, `missions.js`)

| Nesne | Bölüm | Menü |
|---|---|---|
| Mission koşusu | `afMissionRow` | Approve Round · Reject Round · Answer Question… · Pause · Resume · Run Again · Open latest output · Copy ▸ (id · brief) · 9: Cancel · Delete Run |
| Adım | `afMissionStep` | Open Delegation Output · Open transcript · Copy step prompt · Copy step result |
| Tur kartı | `afMissionRound` | Approve · Reject · Copy round summary |
| Takım üyesi | `afMissionTeam` | Open agent · Talk in Console… · Copy role+model |

### 4.5 Bildirimler (`notices.js`)

`afNoticeRow`: Mark read / unread · Pin / Unpin · Stars ▸ (0–3) · Answer… (soru) · Decline… (soru) · Hand to agent · Add to Queue · Open full report · Edit… · Show original · Export MD · Filter ▸ (only this agent · only this type) · Copy ▸ (title · body · id) · 9: Dismiss / Delete.

### 4.6 İş kuyruğu (`queue.js`)

`afQueueRow`: Answer… · Hand to agent · Urgency ▸ (normal · ⏫ · 🔼 · 🔽) · Edit… · Open source notice · Open delegation output · Copy ▸ (text · id) · 9: Drop · Delete.
`afQueueLane`: Collapse / Expand · Show dropped · Copy lane as Markdown.

### 4.7 Alet çantası (`toolbox.js`)

| Nesne | Bölüm | Menü |
|---|---|---|
| Beceri | `afSkillRow` | Open file · Reveal folder · Copy Skill to Agent… · Move Between Scope… · Copy invocation (`/name`) · 9: Remove |
| Subagent | `afSubagentRow` | Open · Reveal · Copy name · 9: Remove |
| Komut | `afCommandRow` | Open · Reveal · Copy `/name` · 9: Remove |
| MCP sunucusu | `afMcpRow` | Probe · Edit… · Enable / Disable for this agent · Copy to Agent… · Open config file · Copy name · 9: Remove |
| Kanca | `afHookRow` | Open settings.json · Copy command · 9: Remove |
| Eklenti | `afPluginRow` | Enable / Disable · Open homepage · Open manifest · Reveal · Copy key |
| Stil | `afStyleRow` | Open · Reveal · 9: Remove |
| Dosya (Files sekmesi) | `afFileRow` | Open · Reveal · Copy path |

### 4.8 Ayarlar (`settings.js`)

`afSettingRow`: Reset to default · Copy setting key · Copy current value · Open in settings.json · What is this? (kılavuz bağlantısı).
`afAgentRoot`: Reveal · Add Agent Root… · 9: Remove root · Copy path.
`afAgentChip`: (ortak `afAgentRow`).

### 4.9 Kasa (`secrets.js`)

`afSecretRow`: Set Value… · Edit Description… · Edit Scope… · Copy name · 9: Delete…
**Değer asla menüden kopyalanmaz** — kasa istisnası (`_REF/bridge.md`) aynı gerekçeyle burada da geçerli.

### 4.10 Timeline (`timeline.js`)

`afTimelineSession` ✔ (11 madde). **+** `afTimelineAgent`: Open Agent Detail · Start Session… · Talk in Console… · Interrupt all its sessions · End all its sessions · Reveal in Explorer · Copy agent name.
**+** `afTimelineEvent`: Open transcript at this moment · Copy timestamp · Copy event line.

### 4.11 Turns (`turns.js`) ve Oturum Görüntüleyici (`sessionViewer.js`)

| Nesne | Bölüm | Menü |
|---|---|---|
| Tur satırı | `afTurnRow` | Open this turn in the viewer · Copy ▸ (prompt · response · whole turn · turn link) · Export this turn as MD · Fold / Unfold (+ oturum menüsünün tamamı ✔) |
| Görüntüleyicide tur | `afViewerTurn` | Jump here · Fold / Unfold · Select from here · Copy ▸ (prompt · response · turn) · Export from here… · Open in Turns page |
| Adım | `afViewerStep` | Copy step · Copy tool input · Copy tool output · Open the file it touched · Only this kind |
| Dosya rozeti | `afFileRow` | Open File · Open Diff · Reveal · Copy path |
| Diff parçası | `afDiffHunk` | Copy hunk · Open file at this line |

### 4.12 Konsol (`console.js`)

`afConsoleSession` / `afConsoleResumable` ✔ (5+8). **+** Export MD · Open in Session Viewer · Copy transcript path · Project ▸.
**+** `afConsoleQueued` (sıradaki mesaj): Send now · Edit… · Move up · Move down · Copy text · 9: Drop.
**+** `afConsoleAsk` (izin isteği): Grant · Deny · Always allow… · Copy the request.

### 4.13 Arama (`search.js`)

`afSearchHit`: Open at this moment · Copy matching line · Copy with context · Search only this agent · Search only this session (+ oturum menüsü ✔).

### 4.14 Yetkinlik matrisi (`capabilities.js`)

`afCapCell`: Copy to this agent · Remove from this agent · Open the defining file · Reveal.
`afDutyCell`: Add Standing Duty · Edit Duty… · Pause / Resume · Copy Duty to Agent… · Open DUTIES.md.

### 4.15 Ajan detayı (`agentDetail.js`) · Bellek grafiği (`memgraph.js`)

`afAgentRow` (ortak, her yerde aynı): Open Agent Detail · Open in New Window · Start Session… · Talk in Console… · Continue Latest Session · Assign to Project… · Open DUTIES.md · Add Standing Duty · New Memory File… · Open Memory Graph · Export Agent Pack… · Sync with Antigravity + Codex… · Reveal in File Explorer · Copy ▸ (name · folder path).
`afMemoryRow`: Open · Archive · Copy to Agent… · Distill Memory File… · Fix Memory Index… · Copy path.
`afDutyRow`: Pause / Resume · Edit… · Automate (create trigger)… · Copy to Agent… · Move Up · Move Down · Open DUTIES.md · 9: Delete.

### 4.16 Dashboard (`dashboard.js`) · Portfolio (`portfolio.js`)

`afAgentRow` ✔ (ortak) · `afSessionRow` ✔.
**+** `afStatTile`: Open the page behind this number · Copy value · What is this? (kılavuz).
**+** `afPlanUsage`: Check Plan Usage Now · Reset Token Lap · Clear Token Lap · Copy the figures.
**+** `afInsightRow`: Fix Insight · Delegate to Agent… · Insight History… · Dismiss… · Restore Dismissed… · Copy insight.
**+** `afChartCard`: Copy data as Markdown table · Copy as CSV · Change range ▸.

### 4.17 İhtiyaçlar (`needs.js`) · Canlı (`livingPage.js`)

`afNeedRow`: (satırın kendi birincil eylemi) · Open the session behind it · Dismiss · Copy.
`afLivingSignal`: Go to it · Configure Living Checks… · Copy the signal line.

### 4.18 Stüdyo (`studio.js`) · Airtable (`airtablePage.js`) · Görev analitiği (`taskAnalytics.js`)

`afSceneRow`: Generate · Triage · Set status ▸ · Assign asset… · Re-run · Copy scene id.
`afAssetCard`: Open · Keep · Drop · Make a variation · Feedback… · Assign to scene ▸ · Re-run Media Job · Reveal · Copy path.
`afProviderRow`: Open settings · Enable / Disable · Copy name.
`afAirtableInstance`: Set as default · Reveal key · Open UI · Open config · Copy base id · 9: Remove.
`afAnalyticsRow`: Open the tasks behind this · Copy row · Export digest.

---

## 5. Fazlar

Her faz: katalog + sayfanın `ctxDo` bağlantısı + `data-vscode-context` işaretlemesi + tooltip kuyruğu + test + sürüm. Faz sonunda commit.

- [x] **Faz 0 — altyapı.** ✅ `media/afCtx.js` (genel yardımcı; `afSessionCtx.js` bunun üstüne oturdu) · `htmlShell` içinde panel kayıt defteri + `__AFUI__.ctxPanel` + `postCtx` · `src/core/ctxmenu.ts` katalog (mevcut 36 madde taşındı, davranış değişmedi) · extension.ts relay kayıt döngüsü · `test/test_ctxmenu.js` (`--fix` `package.json`'ı **yeniden biçimlendirmeden**, yalnız dizi elemanlarını yerinden değiştirerek yazar; yazmadan önce sonucu ayrıştırıp doğrular) · pre-commit ve `npm run package` bu testi koşuyor. **Alt menü canlı doğrulaması Faz 1'e taşındı** — ilk alt menü orada çiziliyor.
- [x] **Faz 1 — Projeler.** ✅ 3.71.0 — `afBacklogRow` (7 alt menü: açma modu · durum · öncelik · boyut · tür · kuyrukta taşıma · kopyala) · `afPlanItem` · `afDocRow` · `afProjectRow` · `afFeedEvent` · izlenen koşu satırı artık oturum menüsünü taşıyor. Testler: `test_backlog_page.js` (menü ile düğmenin **aynı mesajı** ürettiği karakterine kadar doğrulanıyor), `test_projects_tabs.js`.
  - **Bilerek yapılmadı:** `afPersonRow` — satır zaten `<input>` dizisi, oradaki sağ tık metin menüsü daha değerli. `afCodeRoot` — Settings sekmesinde, tek eylemi zaten görünür.
  - **Ertelenmişti, Faz 3'te kapandı:** backlog satırından "kuyruğa ekle".
  - ⚠ **Kullanıcı doğrulaması bekliyor:** alt menülerin (▸) gerçekten çizilip çizilmediği. Çizilmiyorsa yalnızca `src/core/ctxmenu.ts` değişir — maddeler üst seviyeye düzleşir.
- [x] **Faz 2 — Görevler + Missions.** ✅ 3.72.0 — `afPlanRow` (dört türü de taşıyor; `Copy ▸`) · `afWorkflowStep` (dört adım komutu ilk kez sayfadan erişilebilir) · `afTaskRun` (`Copy ▸`) · `afMissionRow` (`Copy ▸`) · `afMissionStep` (`Copy ▸`) · `afMissionRound` · `afMissionTeam`. Testler: `test_tasks_webview.js`, `test_missions_webview.js` — her ikisinde de menü ile düğmenin **aynı mesajı** ürettiği karakterine kadar doğrulanıyor.
  - **`afTemplateRow` ayrı bir bölüm olarak yapılmadı — tasarım hatası düzeltildi:** şablon, Plan tablosunda `kind: 'template'` olan bir satır; ayrı bir bölüm adı aynı satıra iki menü çizerdi. `afPlanRow` + `afKind == 'template'` koşulu aynı işi tek yerde yapıyor.
  - **Yeni host yolu:** `tasksPanel` `wfstep` mesajını ve `plan:export` · `task:up/down/retryEdit/resumeWorkflow/saveTemplate` eylemlerini karşılıyor; her biri var olan komutu **çağırıyor**, yeniden yazmıyor. `missionsPanel` `rerun` · `delete` · `consoleAgent` aldı; ilk ikisi `missionsPanelDeps` üzerinden ağaç menüsünün komutunu düğümüyle çalıştırıyor.
  - **Ortak kopyalama:** `AFCtx.copy(text, say)` — panoya yazan tek uygulama. Kendi flash satırı olan sayfa onu veriyor, olmayan sağ altta sönen bir satır alıyor. `projects.js`'in `copyOut`'u da buna indi.
- [x] **Faz 3 — Bildirimler + Kuyruk + İhtiyaçlar.** ✅ 3.73.0 — `afNoticeRow` (`Stars ▸` · `Show only ▸` · `Copy ▸`) · `afQueueRow` (`Urgency ▸` · `Copy ▸`) · `afQueueLane` · `afNeedRow` / `afNeedSession`. Yeni test: `test_boards_ctxmenu.js` (bu üç sayfanın ilk webview testi).
  - **‼️ Bir satır aynı anda iki nesne olabilir.** İhtiyaçlar sayfasında bir izin beklemesi hem *engel* hem *oturum*. Bir öğe tek `data-vscode-context` taşır, o yüzden **bölüm adı karar veriyor**: transkript bilen satır kendini `afNeedSession` diye ilan ediyor ve iki menüyü birden çiziyor; bilmeyen `afNeedRow` kalıyor ve yapamayacağı hiçbir şey teklif edilmiyor. Oturum maddelerinin `when`'i artık tek bir bölüm değil bir **aile**: `webviewSection =~ /^(afSessionRow|afNeedSession)$/`. Faz 5 ve 6 aynı yoldan genişleyecek.
  - **Bilerek yapılmadı:** İhtiyaçlar satırının kendi düğmeleri (Approve · Reject · Resume · Reconcile) engelden türeyen **veri**; statik katalogda yerleri yok. Menü engelin *etrafını* veriyor.
  - **Faz 1'den ertelenen iş kapandı:** `agentfarm.queueAdd` artık tohum metin alıyor; backlog satırında **Put it in the work queue…** kutuyu kod ve metin yazılmış hâlde açıyor.
- [x] **Faz 4 — Alet çantası + Yetkinlikler + Ayarlar + Kasa.** ✅ 3.74.0 — `afToolRow` (`Copy ▸`) · `afCapCell` · `afCapRow` · `afSettingRow` · `afAgentRoot` · `afSecretRow`. Yeni test: `test_workbench_ctxmenu.js`.
  - **‼️ Sekiz bölüm yerine bir tane — tasarım hatası düzeltildi.** Bu belgede `afSkillRow` · `afSubagentRow` · `afCommandRow` · `afMcpRow` · `afHookRow` · `afPluginRow` · `afStyleRow` · `afFileRow` diye sekiz bölüm yazılıydı. Oysa alet çantasındaki her satır **aynı nesne**: tek envanterde bir kayıt — türü, kapsamı ve kaynak dosyası olan. Sekiz ad, `open/reveal/copy/remove`ın sekiz kopyası demekti ve biri unutulduğunda hiçbir şey söylemezdi. Tek `afToolRow`, farkı `afKind` taşıyor; yalnız gerçekten türe özgü olan maddeler (MCP yoklaması, eklenti anahtarı) türü adıyla anıyor. Aynı düzeltme `afDutyCell` için de: görev hücresi ile beceri hücresi aynı sözleşme → tek `afCapCell`, `capKind` ile.
  - **Bilerek yapılmadı:** eklenti ve ayar dosyası satırında "remove" yok — eklenti açılıp kapanır, ayar dosyası buradan silinmez. `afRemovable` bunu satırda söylüyor.
  - **‼️ Kasa istisnası koda değil teste yazıldı:** `test_workbench_ctxmenu.js` katalogu okuyup "değer kopyalayan bir madde var mı" diye soruyor. Biri eklerse test düşer. Kopyalanabilen tek şey ad ve `{secret:NAME}` referansı.
  - **Test altyapısı:** `test/lib_page_dom.js` — sayfa betiğini DOM taklidinde koşturan **tek** yardımcı (virgüllü ve iç içe seçiciyi anlıyor; sağ tık rölesini yakalıyor). `test_boards_ctxmenu.js` de buna indi. Kendi listesini elle taşıyan üç eski test (`test_claudesettings` · `test_settingsops` · `test_taskstats`) `lib_shared_media.js`'e bağlandı.
- [x] **Faz 5 — Okuma yüzeyleri.** ✅ 3.75.0 — `afTurnRow` (`Copy this turn ▸`) · `afSearchHit` (`Copy the match ▸`) · `afViewerTurn` (`Copy ▸`) · `afViewerStep` (`Copy ▸`) · `afViewerFile` · `afDiffHunk` · `afConsoleQueued` · `afConsoleAsk`. Yeni test: `test_reading_ctxmenu.js`.
  - **Oturum ailesi büyüdü:** `webviewSection =~ /^(afSessionRow|afNeedSession|afTurnRow|afSearchHit)$/`. Tur satırı ve arama sonucu **aynı anda oturum**; tek sağ tık ikisinin menüsünü birden veriyor. Katalog testinde bu aile ayrıca doğrulanıyor — aileden düşerse test söyler.
  - **Oturum menüsüne beş yeni madde:** transkript yolu · çalışma klasörü (kopyala + göster) · arkasındaki ajanı aç · iş kuyruğuna ekle. Yeni komutlar `extension.ts`'te; klasör maddeleri yalnız `cwd` bilinen satırda çiziliyor.
  - **`afViewerFile` belgede yoktu, eklendi:** değişen dosya satırının kendisi bir nesne (aç · HEAD ile karşılaştır · hunk'ları göster · göster · yolu kopyala). `afDiffHunk` onun içinde.
  - **Bilerek yapılmadı:** "Open in Turns page" — `TurnsPanel.show` oturum süzgeci almıyor; sayfayı süzgeçsiz açan bir madde yanıltıcı olurdu.
  - **Test altyapısı:** `lib_page_dom.js` artık **gerçek `charts.js`**'i yüklüyor (stub tahmini yerine), her öğe `innerHTML` tutuyor (parça parça çizen sayfalar için) ve öğe düzeyinde seçici sorgusu var. Üç görüntüleyici testi tek dinleyici tutuyordu — sayfa artık iki kez dinlediği için liste oldular.
- [x] **Faz 6 — Filo yüzeyleri.** ✅ 3.76.0 — `afAgentRow` (Dashboard kartları + karşılaştırma tablosu · Portfolio · Timeline kulvar etiketi · ajan detayı · bellek grafiği seçicisi) · `afMemoryRow` · `afDutyRow` · `afInsightRow` · `afStatTile` · `afPlanUsage` · `afTimelineAgent` · `afLivingSignal`. Yeni test: `test_fleet_ctxmenu.js`.
  - **‼️ Ajan menüsünün tamamı host komutu.** `resolveAgent` tek anahtar istiyor, o yüzden sayfa satırı yayımlıyor ve on altı maddeyi bedava alıyor — hiçbir sayfa `ctxDo` yazmıyor. Yedinci yüzey de bedava olacak. Test bunu ayrıca doğruluyor: listede `agentfarm.ctx.*` çıkarsa düşer.
  - **`resolveAgent` artık `agentName` de kabul ediyor.** Timeline kulvarı ajanın **adını** biliyor, kimliğini değil; bu olmadan menü seçiciye düşerdi — bir sağ tık menüsünün yapmaması gereken tek şey.
  - **Kulvar etiketi hem oturum hem ajan:** `afTimelineAgent` iki ailede birden. Oturum yarısı olduğu gibi duruyor.
  - **Bilerek yapılmadı — `afChartCard`:** grafik kartlarının verisi `charts.js` içinde çizim anında üretiliyor; menüden "CSV kopyala" demek o veriyi ikinci kez üretmek olurdu. Kartın altındaki tablo zaten kopyalanabilir.
  - **Bilerek yapılmadı — `afTimelineEvent`:** noktalar zaten kulvarın oturum bağlamının içinde ve sol tık onları kendi anına açıyor; ikinci bir bölüm oturum menüsünü elinden alırdı. **`afTimelineAgent`'ın kulvar süzgeci maddeleri de yok:** sayfada süzgeç yok, menü ardına süzgeç icat etmek kimsenin bulamayacağı bir özellik olurdu.
  - **Bilerek yapılmadı — bulgu satırında Fix / Delegate / Dismiss:** bu üç komut `Insight` nesnesinin tamamını alıyor; satır çizilmiş bir metin taşıyor. Benzerini uydurmak yanlış bulgu üzerinde çalışmak olurdu ve bunu kimseye söylemezdi. Testte de yazılı.
- [x] **Faz 7 — Üretim yüzeyleri.** ✅ 3.77.0 — `afSceneRow` (`Status ▸`) · `afAssetCard` (`Copy ▸`) · `afProviderRow` · `afAirtableInstance` · `afAnalyticsTable`. Yeni test: `test_production_ctxmenu.js`.
  - **Sahne durumu artık menüden doğrudan seçiliyor:** rozet hâlâ seçiciyi açıyor, menü ise adı söylüyor. `studioPanel` tek yerde karşılıyor — `status` verilmişse onu, verilmemişse seçiciyi kullanıyor.
  - **‼️ İzlenen klasörden kaydedilmiş varlık "burada üretilmedim" diyor** (`asExternal`); yeniden üret · varyasyon · geri bildirim maddeleri ona hiç çizilmiyor. Triyaj kararı (tut/at) ilk kez Triyaj sekmesi dışından erişilebiliyor.
  - **`afAnalyticsRow` yerine `afAnalyticsTable` — tasarım hatası düzeltildi:** o satırlar toplulaştırılmış (bir görev ailesi, bir ajan karnesi); üzerinde işlem yapılacak kimlikleri yok, olsa uydurmak gerekirdi. Tablonun kendisinin yapabilecekleri gerçek. Testte de yazılı.
- [x] **Faz 8 — Cila.** ✅ 3.77.0
  - **Tooltip kuyruğu denetimi + tersi:** `test/test_ctxmenu_reach.js` iki yönü birden tutuyor — sayfanın yayımladığı her bölümün katalogda maddesi var mı, katalogdaki her bölümü bir sayfa yayımlıyor mu, **ve menüsü olup da söylemeyen sayfa var mı**. Üçü de sessizce çürüyen türden.
  - **`ui.ctxmenu` köprü op'u:** bölümsüz çağrı satır türlerini, `section` ile o türe ne yapılabileceğini veriyor. Host komutunun sözcükleri manifesto'dan okunuyor — ikinci kopya yok.
  - **BLUEPRINT iki dilde:** "Sağ Tık Her Yerde" / "Right-Click Everywhere" bölümü (üç kural · nasıl bulunur · iki nesne olan satırlar · kasa istisnası). Kılavuz BLUEPRINT'in kendisi olduğu için kılavuz da güncellendi.

---

## 6. Karar defteri

| Karar | Gerekçe |
|---|---|
| Kendi HTML menümüz **yok**, VS Code'un `webview/context`'i kullanılıyor | `contextmenu` olayını ele geçirmek sayfanın kendi menüsünü (kopyala/yapıştır, yazım denetimi) öldürür. `afSessionCtx.js` bu kararı zaten vermişti. |
| Relay (sayfaya geri mesaj) tercih ediliyor, host tarafında ikinci uygulama değil | Menü ile düğme aynı kodu çağırınca ayrışamaz. Host komutu ancak eylemin zaten host komutu varsa kullanılır. |
| Katalog + senkron testi | Üç yerde elle tutulan liste ayrışır ve bu **sessizce** olur (Prensip 1). Test `npm run package` ve pre-commit'te koşar. |
| Relay komutları paletten gizli | 150 iç komut, paletin kullanılabilirliğini bitirir. |
| Kasada değer kopyalama yok | Sırların panele/panoya sızması, kasanın varlık sebebine aykırı. |
| Menü başlıkları İngilizce | Arayüz kovası — bkz. dil kuralı. Bu belge ise dev-içi, Türkçe. |

---

## 7. Açık sorular

- Alt menü (`submenu`) `webview/context` içinde çiziliyor mu? → Faz 0'da canlı doğrulanacak; çizilmiyorsa gruplar düzleşir ve en çok kullanılan 8 madde üstte kalır.
- Çoklu seçim: oturum tablosunda toplu seçim menüye taşınıyor (`afSelectedSessions`). Aynı sözleşme backlog ve bildirimler için de kurulmalı mı? → Faz 1 ve 3'te değerlendirilecek; ilk turda tek satır.
