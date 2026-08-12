# X-35 — MULTI MOTOR ADAPTASYONU · devir notu

> Bu dosya X-35 bitene kadar yaşar. Bittiğinde silinir — geçmiş git'te durur.
> Son güncelleme: 2026-08-12, `d9c3796` üzerinde.

## Görevin gerçek kapsamı

Kullanıcının açıkça hatırlattığı husus: **verdiği örnekler yalnızca örnek.**
Hedef, eklentinin her köşesinde her fonksiyonun dört motorla (claude · codex ·
gemini · agy) doğru çalışması. "Kullanıcının saydığı 4 şeyi düzelttim" bir bitiş
kriteri değil.

## Mimarideki tek kural — bunu bilmeden devam etme

`SessionIndex` yabancı oturumları **bilinçli olarak yan listede** tutar
(`externalList`). İki çağrı vardır ve hangisinin kullanılacağı yüzeyin *ne
olduğuna* bağlıdır:

| Çağrı | Kimin için |
|---|---|
| `index.all()` / `forAgent()` | **ANALİTİK** — cost, cache sağlığı, plan penceresi, kalite, duty uyumu. Claude transkript formatına göre tanımlı; yabancı oturumda ya sıfır ya yanlış okur. |
| `index.allWithExternal()` / `forAgentWithExternal()` | **KAYIT/LOG** — satır kuran her yüzey. Bir tabloya "Sessions" deyip tek motoru göstermek filtrelenmiş tablo değil, konusu hakkında yalan söyleyen tablodur. |

Bu bölünme doğru ve kalacak. **Asıl hata sınıfı**, `this.sessions` üzerinde
dolaşıp yan listeyi unutan setter'lar ve Claude-only bir figürü "filo geneli"
diye sunan başlıklardır.

Bir analitik gerçekten yabancı motorda hesaplanamıyorsa doğru çözüm sessizce
Claude'u göstermek değil, **yüzeyde bunu yazmaktır** (bkz. rapor ve dashboard).

## Yapıldı (3 commit, hepsi testli, 8242 doğrulama geçiyor)

### `d17b0c1` faz 1
- **Rename her motorda çalışıyor.** `setTitleOverrides` yalnız claude haritasını
  dolaşıyordu, `setExternal` her taramada başlığı geri alıyordu. Live Timeline
  artık `index.onDidUpdate` dinliyor — dinlemediği için karttan yapılan rename
  hiçbir şey değiştirmiyor gibi duruyordu.
- **Codex `turn.completed.usage` KÜMÜLATİF** — ölçüldü (codex-cli 0.147.0,
  2026-08-12): bir thread'in iki gerçek turu 12378 → 24774 input. Tur usage'ı
  sanıldığı için Console'un token/maliyet sayacı karesel büyüyor ve
  `contextAfter` oturumun tüm harcamasını pencere boyu sanıp **38M ctx**
  yazıyordu. `codexTurnUsage` artık önceki toplamı `CodexState.spent`'te tutup
  delta yayınlıyor; resume'da baseline transkriptten kuruluyor
  (`CarriedTotals.usage` → `codexTotalsFromUsage`).
- **`reasoning_output_tokens`, `output_tokens`'in İÇİNDE** — ölçüldü, rollout
  kimliği söylüyor: `20766+822 = 21588`, `32705304+95054 = 32800358`.
  `parseCodexFile` ikisini topluyordu → her Codex satırının output'u ve parası
  modelin düşünmesi kadar şişiyordu. Test fixture'ı da aynı yanlış varsayım
  üzerine kuruluymuş, gerçeğe uyduruldu.
- **ctx artık motorun kendi penceresine göre.** Rollout her turda
  `model_context_window` (bu makinede 258400) ve `last_token_usage` söylüyor,
  ikisi de okunmuyordu. `SessionInfo.ctxWindow` eklendi; tablodaki "Of a 200k
  window" satırı dört motorlu bir tabloda Claude'un penceresiydi. Penceresini
  söylemeyen motor yüzde yerine bunu söylüyor. `opus-5` `CONTEXT_WINDOWS`
  tablosunda hiç yoktu (kullanıcının ana modeli, ctx yüzdesi boş çıkıyordu).
- **Live Timeline'ın asıl kör noktası.** Sayfa tek kaynaktan — hook akışından —
  çiziliyor. Per-turn motorların hook'u yok ve olmayacak, dolayısıyla Console'da
  barındırılan bir Codex/Antigravity konuşması çalışıp bitiyor ve sayfada hiçbir
  şey olmuyordu. Agent Farm host olduğu için yaşam döngüsünü kendisi aynalıyor
  (`mirrorConsoleToLive`, extension.ts; Claude asla aynalanmaz). Motor artık
  `LiveEvent.engine`/`HookPayload.engine` ile taşınıyor, çünkü barındırılan
  thread id'sini motor üretir ve içinden ayrıştırılamaz. Kartlar paylaşılan
  `AFEngine` rozetini takıyor, lane satırları motorun rengini nokta olarak
  taşıyor, sayfaya motor filtresi geldi, "lifecycle only" ifadesi yalnızca hâlâ
  doğru olduğu satırda. Barındırılan oturum Console üzerinden kesiliyor.
  Görsel: `dist/render/timeline.png` + `.light.png`, fixture
  `test/fixtures/timeline.js`.

### `7dda4e7` faz 2
- **Turns sayfası hiçbir Codex turunu göstermiyormuş.** `buildTurnRows`
  `SessionInfo.turns` üzerinden gider, o alanı yalnız Claude ayrıştırması
  doldururdu — dış listeye açmak tek başına bir şey eklemezdi, satırlar hiç
  yoktu. Codex rollout'u her sınırı söylüyor, artık gerçek tur satırları
  kuruluyor. `TurnRow.engine`, Agent yanında Engine sütunu, panelde Engines
  filtresi, `turns.list` op'una `engine` argümanı.
  Görsel: `dist/render/turns.png` + `.light.png`, fixture `test/fixtures/turns.js`.
- **Resume yanlış motoru açıyordu.** Her şey `claude --resume <id>` idi; bir
  Codex thread id'si Claude Code'a verilince ya hata ya da **yepyeni bir Claude
  oturumu** açılıyordu. Artık oturumun kendi motorunda; terminalden devam
  edilemeyen motor bunu söylüyor ve transkripti öneriyor; kurulu olmayan motor
  için `engineRefusal`. Filo geneli model/efor başka motora taşınmıyor (opus-5'i
  codex'e vermek reddedilir; X-30'daki efor hatası tam bu).
- **`cliViewer`'da reasoning ikinci kez ekleniyordu** — session viewer'daki her
  Codex TURUNUN output'u/maliyeti şişiyordu. Viewer'ın ctx'i yalnız
  `input_tokens` okuyordu, aynı oturumun tablodaki Ctx hücresiyle çelişiyordu.
- `sessions.interrupt` op'u yalnız terminale Esc yazıyordu → artık Console
  üzerinden, her motorda. `sessions.files` Claude'a özgü ve bunu söylüyor (boş
  liste değil, motor + gerekçe). Live Timeline'da barındırılan oturumlar için End
  düğmesi geri geldi (`hostedIds`).
- Kenar çubuğu oturum satırları motoru söylüyor (istisna satırda, hepsi
  tooltip'te). `ENGINE_LABELS` host tarafı için `SPECS`'ten üretiliyor ve
  `afEngine.js` ile aynı motor kümesini adlandırdığı testle sabitlendi — ham
  `agy` yazan yüzeyler için.
- **Filo raporu** "Fleet totals / Sessions: N" derken sessizce üç motoru
  dışarıda bırakıyordu; sayımlar ve dışlama artık yazılı, para figürlerine
  karıştırılmıyor. Dashboard alt notu ham id yerine rozet basıyor, "data: local
  Claude Code transcripts" iddiası düzeltildi.

### `d9c3796` faz 3 (kısmi)
- Ajan sayfasındaki Sessions kartı yalnız Claude oturumlarını sayıyordu →
  çoğunlukla Codex ile sürülen bir ajan, dolu tablonun yanında hiç çalışmamış
  gibi görünüyordu. Kart her oturumu sayıyor, altında motor dağılımı ve
  "figürlerin kapsamadığı N oturum" yazıyor.

### Bu turda kurulan kalıcı test
`test/test_engine_parity.js` (20 doğrulama) — X-35'in davranış sözleşmesi.
Rename, codex delta/ctx aritmetiği, host↔webview motor adı uyumu, tur satırı
motoru. **Yeni her düzeltme buraya bir doğrulama eklemeli.**

## KALAN — sıradaki turun işi

### 1. Sürüm + paket + kurulum (henüz YAPILMADI)
`package.json` hâlâ **3.118.0**. Yapılacak: sürüm bump, `CHANGELOG.md` girdisi,
`npm run package` (asla çıplak `vsce package` — VSIX `dist/vsix/`'e gider),
`code --install-extension dist/vsix/agent-farm-<v>.vsix --force`, sonra
`%USERPROFILE%\.vscode\extensions\extensions.json` içinde `muvusoft.agent-farm`
sürümünü **okuyarak** kurulumun gerçekten geçtiğini doğrula (klasörün varlığı
kanıt değil). Kullanıcı yalnızca VS Code'u yeniden başlatır.

### 2. Denetlenmemiş yüzeyler (`grep` ile bulundu, incelenmedi)
- **`portfolioPanel.ts`** — `index.forAgent(a.id)` (Claude-only), sayfada hiçbir
  not yok. Ajan sayfasındakiyle aynı sınıf hata; aynı çözüm uygulanabilir.
- **`livingPanel.ts` / `media/livingPage.js`** — motor ekseni hiç yok, ne olduğu
  incelenmedi.
- **`consolehistory.ts`** (Console'un resume listesi) — motor gösteriyor mu?
- **`insighthistory` / `health.ts` / `anomaly` / `forecast` / `quality` /
  `evals` / `distill` / `semantic` / `memquery`** — hepsi `index.all()` analitiği.
  Doğru olan bunları yabancı motora açmak DEĞİL; sundukları yerde kapsamı
  söylemek. Hangileri "filo geneli" gibi sunuluyor, tek tek bakılmalı.
- **`otel.ts`** — telemetri span'lerinde motor attribute'u yok.
- **`taskcost.ts` / `taskstats.ts` / `engineUsage.ts` / `planusage.ts`** —
  görev maliyeti ve plan penceresi motor başına doğru mu? (`planUsageEngines`
  U-27'de yapılmış görünüyor, doğrulanmadı.)
- **`search.ts` / `searchPanel.ts`** — `allWithExternal` ✔ ve `engineOf` var;
  sonuç tablosunda rozet/filtre var mı diye bakılmadı.
- **`ctxmenu.ts`** — yabancı oturum satırında hangi menü kalemleri anlamsız?
  (Resume artık doğru; "Open transcript" `file` boşsa ne yapıyor?)
- **`hooksInstaller` / `agentpack` / `claudesettings`** — Claude'a özgü,
  muhtemelen doğru; yüzeyde bunu söylüyorlar mı?

### 3. Bilinen, dokunulmamış küçük şeyler
- `agySessionsSource` token/cost'u dürüstçe 0 (protobuf okunamıyor) — bu doğru,
  ama Antigravity'yi Console'da barındırdığımızda `farmConsoleSource` gerçek
  figürleri veriyor. İki kaynağın aynı konuşma için çakışıp çakışmadığı
  (`dedupeExternal`) X-35 kapsamında doğrulanmadı.
- `gemini` için `parseGeminiTokens` "thoughts" ayrı sayıyor — Gemini API'de
  `thoughtsTokenCount` gerçekten `candidatesTokenCount`'tan ayrı, yani bu
  doğru. Codex'le karıştırma.

### 4. Kapatırken
`projects.backlog.check X-35` **note ile** (Backloglog'a düşecek kapanış notu),
`projects.log` satırı, gerekiyorsa `projects.decision.add` (analitik/log
bölünmesi kararı üç ay sonra "neden böyle?" sorusunu hak ediyor).

## Çalışma disiplini hatırlatmaları (bu iş için geçerli olanlar)
- Görsel değişiklik **bakılmadan** bitmiş sayılmaz: `node test/render_page.js <f>`
  → `node test/shoot_page.js <f>`, `--light` de. Bu turda iki fixture eklendi;
  ikisi de **gerçek saate göre** (`Date.now()`), çünkü bu sayfalar canlı saate
  göre çiziyor — sabit tarih boş grafik ve "-13317s ago" üretiyor.
- `package.json`'ı asla PowerShell `Get-Content`/`Set-Content` ile yazma.
- Kullanıcıya her şey Türkçe; kod ve yorumlar İngilizce.
