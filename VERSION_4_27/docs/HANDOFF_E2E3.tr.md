# Devir Notu — Dalga E2/E3 (Çoklu-CLI Oturum İzleme)

> **Kime:** Fable · **Devreden:** Opus (önceki oturum) · **Tarih:** 2026-07-11
> **Konu:** Agent Farm VS Code eklentisi — medya/çoklu-CLI yol haritasının E dalgasının kalan iki adımı (E2 = canlı olay besleme, E3 = transkript/maliyet adaptörleri).
> **Repo:** `D:\zone\dev\git\miropharm\vsc_AgentFarm` · **Sürüm:** 2.29.0 (kurulu) · **Ana belge:** `docs/ROADMAP.media.tr.md`, `docs/BLUEPRINT.tr.md`

Bu not, işi **hiç bağlam kaybetmeden** devralman için yazıldı. Sırayla oku: §1 (son turda ne yaptım), §2 (proje disiplini), §3 (E2/E3 için KRİTİK mimari dikişler — kod referanslı), §4 (E2 planı), §5 (E3 planı), §6 (her sürümde uygulama/test/paket kontrol listesi), §7 (sınırlar/kurallar).

---

## 0. En önemli tek kural

**Claude yolu kutsaldır — DOKUNMA.** `agentfarm.startSession`, `agentfarm.continueSession`, `agentfarm.resumeSession`, `LiveMonitor.handle`'ın claude hook davranışı, `SessionIndex`'in `~/.claude/projects/*.jsonl` okuması: bunların hiçbiri E2/E3 için **değişmemeli**. Tüm yeni davranış **opt-in ek katman** olarak, ayrı kod yollarıyla, **fail-soft** eklenir. Bu, kullanıcının açık talebidir ("claude ile çok iyi çalışan mevcut sistemi hiç bozmadan") ve bütün E dalgasının tasarım sözleşmesidir.

---

## 1. Son turda yapılan iş: E1 — `Start Session With…` (v2.29.0)

**Amaç:** Kullanıcı, ajan için Claude yerine başka bir CLI (gemini/codex/…) ile interaktif oturum açabilsin — claude yoluna dokunmadan.

**Ne eklendi (hepsi `src/extension.ts` + `package.json`):**

1. **Yeni komut `agentfarm.startSessionWith`** (`continueSession` kaydının hemen ardında, ~satır 1559). Davranış:
   - `resolveAgent(arg)` ile ajanı çözer.
   - `cfg().get<CliProfile[]>('cliProfiles', [])` boşsa → "Open Settings" bilgi mesajı, çıkar.
   - `context.globalState.get(AGENT_CLI_KEY)` → ajan-başı son kullanılan CLI. QuickPick: "Claude Code" (varsayılan, `profile: undefined`) + her `CliProfile`. Son kullanılan üste sıralanır (`sort((a,b) => (a.id===last?-1:0) - (b.id===last?-1:0))`) ve `• last used` etiketi alır.
   - Seçilen profil için komut: `buildCliCommand(profile.interactive ?? profile.headless, '', '')` (boş prompt/args → interaktif launcher; `interactive` alanı sade launcher olmalı, ör. `"gemini"`). Claude için düz `'claude'`.
   - `launchClaudeTerminal(\`${pick.id}: ${agent.name}\`, agent.dir, command)` ile terminal açar (mevcut helper, `agentFarm.externalTerminal` ayarına uyar — bkz. `src/extension.ts` ~satır 1275).
   - Seçimi `globalState`'e yazar: `AGENT_CLI_KEY` = `'agentfarm.agentCli'`, şekil `{ [agentId]: cliId }`.
2. **Sabit:** `const AGENT_CLI_KEY = 'agentfarm.agentCli';` (`TURN_ACTIONS_KEY` yanında, activate içinde).
3. **Import:** `buildCliCommand` `./core/tasks`'tan eklendi.
4. **package.json:** komut bildirimi (`agentfarm.startSessionWith`, ikon `$(run-all)`) + agent context menüsü (`view/item/context` `viewItem == agent`, grup `1_actions@3`; `openAgentDetail` `@3`→`@4`'e kaydı).
5. **Belgeler:** BLUEPRINT'e "Farklı bir modelle sezon aç" paragrafı (Çoklu-Ajan İş Akışları/CLI bölümü); ROADMAP Dalga E ◐ (E1✅); CHANGELOG 2.29.0.
6. **Test:** `scratchpad/test_cli_session.js` (7/7) — `buildCliCommand` boş-prompt davranışı (bare/subcommand/prompt-collapse/args-strip) + last-used sort mantığı.

**E1'in bilinçli sınırı:** Bu komut sadece oturumu **açar**. Açılan claude-dışı oturum **izlenmez** (canlı durum, maliyet yok). İzleme = senin işin (E2/E3).

**E1 kodunu genişletmen gereken yer:** `startSessionWith`, `launchClaudeTerminal`'i çağırıyor ama dönen `vscode.Terminal`'i **tutmuyor**. E2 için buraya dokunacaksın (§4).

---

## 2. Proje disiplini (her turda uygulanır)

- **Dil:** Kullanıcı Türkçe konuşur, kısa ve doğrudan; gereksiz özet/başlık istemez. Belgeler (BLUEPRINT/ROADMAP/CHANGELOG-TR notları) Türkçe, teknik terimler İngilizce kalır.
- **Canlı ürün değil ama kullanıcının günlük aracı:** küçük, izole, geri alınabilir değişiklikler. Kök neden anlaşılmadan patch yazma.
- **Her özellik → sürüm:** `package.json` `version` bump (semver minor), **CHANGELOG.md** başına giriş, **BLUEPRINT.tr.md** ilgili bölüm, **ROADMAP.media.tr.md** ilgili kutu (☐/◐/☑).
- **Test = scratchpad'de fake-vscode ile node script.** Repo'da resmi test runner yok; desen: `Module._load` ile `'vscode'` require'ını sahte nesneyle değiştir, `out/core/*.js` derlenmiş dosyayı require et. Webview testleri: `vm.createContext` + DOM-stub. Örnekler: `scratchpad/test_*.js` (bkz. §8). Her yeni özellikte ad-hoc test yaz, **tüm suite'i** koştur, yeşil olmadan "bitti" deme.
- **Derle + paketle + kur akışı:** `npm run compile` (tsc) → `npm run package` (vsce → .vsix) → `code --install-extension <vsix> --force`. Kurulumdan sonra **reload gerekir** (kullanıcı yapar). Commit'i kullanıcı yapar — sen commit etme (istenmedikçe).
- **Hafıza:** ajan hafızan `C:\Users\rotam\.claude\projects\D--zone-agent\memory\`. Proje durumu: `project_agentfarm.md` (her sürümde tek satırlık yoğun kayıt ekle, en üste). `MEMORY.md` indeks.

---

## 3. E2/E3 için KRİTİK mimari dikişler

### 3.1 LiveMonitor — canlı olay motoru (`src/core/live.ts`)

- 127.0.0.1:`<livePort=8377>` üzerinde HTTP dinler. `POST /event` → `handle(JSON.parse(body))`; `POST /trigger/<token>` → tetik.
- `handle(payload: HookPayload)` `payload.hook_event_name`'e göre `LiveSession.status` geçişi yapar + `push(event)` ile olay günlüğüne yazar. **`HookPayload` şekli:**
  ```ts
  { session_id?, transcript_path?, cwd?, hook_event_name?, tool_name?, tool_input?,
    tool_response?, prompt?, message?, trigger?, source?, reason? }
  ```
- `hook_event_name` değerleri ve etkisi: `SessionStart`(→idle), `UserPromptSubmit`(→working, prompts++), `PreToolUse`(→tool), `PostToolUse`(→working), `Notification`(izin/waiting ayrımı), `Stop`(→waiting-input = "YOUR TURN"), `SubagentStop`, `PreCompact`, `SessionEnd`(→ended).
- **Ajan atama:** ctor'un 2. argümanı `resolveAgent(cwd)` — `payload.cwd`'yi ajan köküne eşler. **Yani beslediğin payload'da `cwd` = ajan dizini olmalı**, yoksa satır "unknown" olur.
- **`waiting-input` kenarı** `fireTurnReady` (2.22) + swim-lane bildirimlerini tetikler; ve reload'da `rebuildSessions()` (2.23) olay günlüğünden oturum kartlarını yeniden kurar.
- **`sessions(): LiveSession[]`** timeline panelini besler (`src/panels/timeline.ts` `buildData`). `LiveSession` şekli `live.ts` başında.

### 3.2 RelayTailer — E2 İÇİN BİREBİR KOPYALANACAK DESEN (`src/core/relay.ts` + wiring `src/extension.ts` ~372)

Bu, "yabancı bir kaynağın olaylarını canlı monitöre nasıl sokarsın"ın kanıtlanmış cevabıdır. Başka makinenin feed dosyasını tail'ler, her satırı **sentetik HookPayload'a** çevirip **`live.handle(payload)`** çağırır:

```ts
// src/extension.ts ~372
const relayTailer = new RelayTailer(
  () => cfg().get('relayFeeds', []).filter(...).map(...),
  (feedName, ev) => {
    const payload = {
      session_id: `${feedName}:${ev.sessionId}`,   // NAMESPACE'li id (çakışma yok)
      cwd: ev.cwd,                                  // ajan ataması için ŞART
      hook_event_name:
        ev.kind === 'prompt' ? 'UserPromptSubmit' :
        ev.kind === 'tool'   ? 'PreToolUse' :
        ev.kind === 'stop'   ? 'Stop' : 'PostToolUse',
      prompt: ev.detail, tool_name: ev.tool
    };
    live.handle(payload);   // ← canlı monitör kaynağı bilmez; her şey bedavaya çalışır
  });
relayTailer.start();
context.subscriptions.push(relayTailer);
```

**Ders:** `live.handle(...)` public'tir ve kaynağın claude olup olmadığını umursamaz. Timeline swim lanes, durum makinesi, bildirimler, yoğunluk görünümü — hepsi bu tek çağrıyla otomatik gelir. E2'nin özü budur.

### 3.3 SessionIndex / SessionInfo — E3 İÇİN (`src/core/sessions.ts`)

- `SessionIndex` `~/.claude/projects/*/*.jsonl` (+ `extraClaudeDirs`, her biri bir `machine` etiketiyle) transkriptlerini okuyup `SessionInfo[]` üretir. `index.all()`, `index.forAgent(id)`, `index.windowUsage()` vb. dashboard/trees/viewer'ı besler.
- **`SessionInfo`** (sessions.ts ~30) zaten `machine?` ve `parentSessionId?` gibi "yabancı kaynak" alanları taşıyor. E3'te yeni CLI'ların oturumları bu şekle normalize edilmeli. Kritik alanlar: `models: string[]`, `usage: Usage`, `cost`, `toolCalls`, `tools`, `daily`, `heat[168]`, `firstTs/lastTs/mtime`, `agentId/agentName` (cwd'den atanır).
- **Ajan ataması** `index.reassignAgents()` ile `cwd` → ajan kökü eşlemesiyle yapılır (claude ile aynı mantık).

### 3.4 PricingEngine — E3 maliyet dürüstlüğü (`src/core/pricing.ts`)

- Kural tabanlı. Bilinmeyen model → **maliyet 0** + `pricing.unknownModels` set'ine eklenir → UI "pricing kuralı ekle" uyarısı gösterir (dashboard `buildData.unknownModels`). `contextWindowFor(model)` bağlam tavanı; bilinmeyen → yüzde gösterme.
- **E3 kuralı:** yabancı CLI modelleri için kullanıcı `agentFarm.pricing`'e kural eklemezse maliyet dürüstçe 0 + uyarı — **asla uydurma**. Bu mekanizma zaten var, sadece yabancı SessionInfo'ları index'e katman yeter.

---

## 4. E2 PLANI — Canlı olay besleme (çoklu-CLI oturum durumu)

**Hedef:** `Start Session With…` ile açılan claude-dışı oturum, timeline swim lanes + Live sessions'ta **canlı görünsün**.

**Gerçekçilik katmanları (dürüst sıralama):**

### E2a — Terminal yaşam döngüsü (garanti, düşük risk, ÖNCE BUNU YAP)
Claude-dışı CLI'ler genelde hook/notify yaymaz. Ama VS Code terminal aç/kapa olayı bize "oturum var/yok" verir. Bu tek başına kullanıcının "sezonlarını izle" ihtiyacının görünür kısmını karşılar.

**Uygulama:**
1. `startSessionWith` (ve istersen `launchClaudeTerminal`) açılan `vscode.Terminal`'i **tut**. Şu an `launchClaudeTerminal` referansı atmıyor — orayı, terminal nesnesini döndürecek/saklayacak şekilde güncelle (external terminal modunda terminal nesnesi olmaz; o durumda yaşam döngüsü izlenemez — dürüstçe atla).
2. Oturum açılınca `live.handle({ session_id: \`cli:${agent.id}:${Date.now()}\`, cwd: agent.dir, hook_event_name: 'SessionStart', source: cliId })` besle → swim lane'de idle satır belirir. `session_id`'yi **namespace'le** (`cli:` öneki) ki claude oturumlarıyla çakışmasın.
3. `vscode.window.onDidCloseTerminal(t => …)`: kapanan terminal bu oturumsa `live.handle({ session_id, cwd, hook_event_name: 'SessionEnd', reason: 'terminal closed' })` → satır ended olur. Map ile `terminal → sessionId` tut; `context.subscriptions`'a ekle.
4. **agentName gösterimi:** `live.ts` `resolveAgent(cwd)` `agent.dir`'i ajan adına çevirir — otomatik. Ama kaynağın CLI olduğunu belli etmek için: `LiveSession`'a opsiyonel `source?: string` (cliId) ekleyip timeline kartında rozet göstermeyi düşün (küçük, opsiyonel; `push`/event'e `source` taşımak gerekir — dikkatli, geriye uyumlu).

**Sınır:** E2a "çalışıyor/araç" gibi ara durumları göstermez (CLI olay yaymadığı için). Sadece açık/kapalı. Bunu UI'da dürüstçe söyle (kart alt yazısı "external CLI — lifecycle only").

### E2b — Zengin olaylar (CLI destekliyorsa)
Bazı CLI'ler bir "notify"/"hook"/"log" mekanizması sunar. Varsa:
- **Yöntem A (wrapper):** `cliProfiles.interactive` komutunu, olay yayan küçük bir wrapper script ile sar (RelayTailer'daki `farmRelay.js` deseni gibi ama yerel). Wrapper stdout/lifecycle'ı yakalar ve `POST http://127.0.0.1:8377/event` ile HookPayload gönderir (dış process olduğu için in-process `live.handle` yerine HTTP POST kullanır — endpoint zaten var).
- **Yöntem B (log tail):** CLI kendi oturum log'unu bir dosyaya yazıyorsa, RelayTailer benzeri bir tailer yaz (`core/cliFeed.ts`), her satırı HookPayload'a map edip `live.handle` çağır. RelayTailer'ı neredeyse birebir kopyalayabilirsin.
- Her iki yöntemde de **CLI başına bir adaptör**; hangi CLI'nin ne yaydığı araştırılmalı (gemini-cli, codex vb. dokümantasyonu). Adaptör yoksa E2a lifecycle'ıyla yetin.

**Test yaklaşımı (E2):** `live.handle` senaryolarını fake-vscode ile sür (bkz. `test_turnready.js`, `test_session_rebuild.js` desenleri): sentetik `cli:` payload'ları besleyip `live.sessions()` çıktısını doğrula (satır belirir, SessionEnd'te düşer, agent adı cwd'den atanır). Terminal olayları için `onDidCloseTerminal` stub'ı.

---

## 5. E3 PLANI — Transkript & maliyet adaptörleri

**Hedef:** Claude-dışı oturumların geçmişi/maliyeti dashboard'a, viewer'a, trees'e girsin; kaynak rozetiyle; claude analitiğine karışmadan.

**Önerilen mimari (tasarım kararları senin):**

1. **`SessionSource` arayüzü** (yeni `core/sessionSource.ts`):
   ```ts
   interface SessionSource {
     id: string;                         // 'claude' | 'gemini' | 'codex'
     scan(): Promise<SessionInfo[]>;     // o kaynağın log'larını SessionInfo'ya normalize eder
   }
   ```
   Claude'un mevcut okuması ilk `SessionSource` olarak arkaya alınabilir (ama **davranışı değiştirme**; sadece arayüz uyumu). Yeni CLI'lar kendi parser'larını yazar.
2. **Normalize:** her CLI'nin oturum kaydını `SessionInfo` şekline çevir (§3.3). Bilinmeyen alanlar boş/0. `models` = CLI'nin bildirdiği model id; **maliyet için PricingEngine'e bırak** (unknown → 0 + uyarı, §3.4). `agentId/agentName` cwd'den (varsa) atanır; yoksa boş.
3. **Merge noktası:** `index.all()` tüketicileri (dashboard `buildData`, trees, viewer) yabancı SessionInfo'ları da görsün. En temizi: `SessionIndex`'e yan bir "ek kaynaklar" listesi ekleyip `all()`'da birleştirmek — ama **claude tarama yolunu bozmadan**; ayrı liste + `source` etiketiyle. Alternatif: ayrı bir panel/sekme (daha izole ama daha az entegre).
4. **Kaynak rozeti:** SessionInfo'ya `source?: string` ekle (zaten `machine?` var, kalıbı taklit et). UI'da (dashboard satırı, viewer başlığı, sessions tree) `source !== 'claude'` ise rozet göster. **Claude-özel analitikleri** (context health, cache verimi, distill, recall, duty compliance) yabancı kaynaklardan **filtreyle dışta tut** — onlar claude transkript alanlarına dayanır.
5. **fail-soft:** parse edilemeyen kayıt sessizce atlanır; ana tarama asla yabancı parser hatasıyla düşmez (relay/pricing'de kanıtlı).

**Test yaklaşımı (E3):** sahte CLI log dizini + parser'ı SessionInfo'ya map ettiğini doğrula (alan alan); unknown-model → cost 0 + unknownModels'a düştüğünü doğrula; claude-özel analitiğin yabancı kaynağı görmediğini doğrula.

**Not:** Gemini/codex'in gerçek oturum-log formatları araştırma gerektirir; canlı test edemeden düşük güven. Önce **bir** CLI için uçtan uca (gerçek log örneğiyle) yap, sonra ikinciyi ekle. Format kayması riskine karşı adaptörler opsiyonel ve fail-soft olmalı.

---

## 6. Her sürümde kontrol listesi

1. Kod değişikliği (küçük, izole; claude yolu dokunulmaz).
2. `npm run compile` — hata yok.
3. `scratchpad/test_*.js` — yeni test yaz + **tüm suite** koştur (§8), hepsi yeşil.
4. `package.json` version bump.
5. `CHANGELOG.md` + `BLUEPRINT.tr.md` + `ROADMAP.media.tr.md` güncelle.
6. `npm run package` → `code --install-extension agent-farm-<ver>.vsix --force`.
7. Hafıza: `project_agentfarm.md`'ye yoğun tek-satır sürüm kaydı (en üste).
8. Kullanıcıya: ne yaptın + **manuel test adımları** (senin koşamadığın çalışma-zamanı davranışı) + "reload gerek, commit sende".

---

## 7. Sınırlar ve değişmez kurallar

- **Claude yolu değişmez** (§0). E2/E3 ayrı kod yolları, opt-in, fail-soft.
- **Namespace'li session_id** (`cli:`/feed adı öneki) — claude oturumlarıyla çakışma yok.
- **cwd zorunlu** beslediğin payload'da (ajan ataması için).
- **Maliyet uydurma yok** — unknown model → 0 + uyarı (mevcut PricingEngine).
- **Yabancı kaynak rozetlenir** ve claude-özel analitiğe karışmaz.
- **external terminal modunda** yaşam döngüsü izlenemez — dürüstçe atla/söyle.
- **Doğrulayamadığın şeyi "bitti" deme** — manuel test adımlarını listele (gerçek gemini/codex kurulu değilse E2/E3'ün canlı ucu ancak kullanıcıda test edilir).

---

## 8. Dosya haritası + mevcut test suite

**Bu turda dokunulan/oluşturulan çekirdek (medya + E1):**
- `src/core/production.ts` (A: manifest/sahne), `src/core/ingest.ts` (A: asset ingest + D: resolveScene), `src/core/media.ts` (A/B: meta+asset+selection+injectFeedback; C: jsonFetch export), `src/core/mediaProviders.ts` (C: MediaProvider/providerFor/runReplicateJob + webhook poll: jsonPath/pollWebhookResult), `src/core/premiere.ts` (D: buildFcpXml/buildEdl/pickSequenceAssets/detectSceneId).
- `src/core/tasks.ts` (WorkflowStep.select/media.projectId/webhook.headers+poll; runSelectStep, verifyMediaThenAdvance/runVisionJudge, runMediaStep provider'lı + retry).
- `src/panels/gallery.ts` + `media/gallery.js` (A/B/D UI), `src/panels/selectionPanel.ts` + `media/selection.js` (B1).
- `src/extension.ts` (tüm komut wiring + E1 startSessionWith).

**E2/E3 için okuyacağın:** `src/core/live.ts` (handle/HookPayload/LiveSession/sessions), `src/core/relay.ts` (E2 deseni), `src/core/sessions.ts` (SessionInfo/SessionIndex), `src/core/pricing.ts` (unknown model), `src/panels/timeline.ts` (buildData), `src/views/trees.ts` (sessions tree), `src/panels/dashboard.ts` (buildData tüketimi).

**Scratchpad test suite (hepsi yeşil olmalı — `C:\Users\rotam\AppData\Local\Temp\claude\D--zone-agent-ajanlar-developer\<oturum>\scratchpad\`):**
`test_premiere.js` 28 · `test_webhook_poll.js` 11 · `test_media_providers.js` 21 · `test_vision_verify.js` 17 · `test_select_step.js` 19 · `test_production_media.js` 36 · `test_gallery_webview.js` 15 · `test_selection_webview.js` 11 · `test_session_rebuild.js` 11 · `test_turnready.js` 6 · `test_timeline_toggles.js` 8 · `test_cli_session.js` 7. **(Toplam 190.)**
Not: scratchpad oturuma özeldir; senin oturumunun scratchpad'i farklı olacak — testleri oradan yeniden oluştur/kopyala. Desenler yukarıda; `Module._load` fake-vscode + `out/core/*.js` require + mock http server (providers/webhook için).

**Medya yol haritası durumu:** A ☑ · B ☑ · C ☑ · D ☑ · **E ◐ (E1 bitti, E2/E3 senin)** · F ☐ (uzun iş dayanıklılığı: workflow run state persist+resume, media jobId reattach — E'den sonra).

Başarılar. Önce E2a (terminal lifecycle — garanti değer, düşük risk), sonra CLI başına E2b/E3 adaptörleri. Her adım kendi başına teslim edilebilir.
