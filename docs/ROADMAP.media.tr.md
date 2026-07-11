# Agent Farm — Medya/Video Üretim İş Akışları: Durum Raporu ve Gelişim Yol Haritası

> **Bu belge canlı bir yol haritasıdır.** Sahne-sahne ilerleyen video üretimi (storyboard → görsel üretim → video üretim → kurgu) gibi çok-platformlu, çok-modelli iş akışlarında ajanların **etkili ve otonom** kullanımı için eklentinin bugün ne sağladığını, ne sağlayamadığını ve hangi sırayla güçlendirileceğini tanımlar. Her dalga bittiğinde buradaki kutusu işaretlenir ve sürüm notu düşülür.
>
> İlk yazım: 2026-07-11 (v2.22.0 dönemi). İlgili teknik kılavuz: [BLUEPRINT.tr.md](BLUEPRINT.tr.md).

---

## 1. Hedef İş Akışının Anatomisi

Kastedilen üretim tipi — örnek platformlarla:

| Aşama | Tipik araçlar | Karakter |
| --- | --- | --- |
| Fikir / senaryo / shot list | LLM (Claude) | Metin, iteratif |
| Storyboard + kare görselleri | Nano Banana (Gemini image), Flux, Midjourney | Görsel üretim, **çok aday → seçim** |
| Video klipler (sahne başına) | Seedance, Kling, Veo (Google Flow), Higgsfield, Topview | Uzun süren işler, kuyruk/kredi, **deneme-yanılma** |
| Ses / müzik / dublaj | ElevenLabs, Suno vb. | API'li servisler |
| Kurgu / montaj | Adobe Premiere | Yerel dosyalar, zaman çizelgesi, insan ağırlıklı |
| Yayın / varyant | Platform yüklemeleri | Tekrarlayan, otomasyona uygun |

Bu akışın ajan yönetimi açısından üç zor özelliği var:

1. **Asset-merkezli**dir: birim iş "metin çıktısı" değil, **dosyadır** (görsel, klip, ses). Sahne 3'ün 4 görsel adayı, seçilen 1'i, ondan üretilen 2 video denemesi… hepsi izlenmek zorunda.
2. **Heterojen platformlar**: kimi API sunar (fal.ai, Gemini API, ElevenLabs), kimi yalnız web arayüzüdür (Google Flow, Higgsfield/Topview'un bazı modları). Tek tip "API çağır" yaklaşımı yetmez.
3. **İnsan seçimi döngünün içindedir**: "8 adaydan 2'sini beğendim, onlarla devam et" kararı otomatikleştirilemez ama **beklemesi ve akışı** otomatikleştirilebilir.

---

## 2. Eklentinin BUGÜN Sağladığı Avantajlar

Aşağıdakilerin hepsi mevcut ve çalışıyor (v2.22.0):

### 2.1 Çok-ajanlı rol organizasyonu
Her ajan bir klasör: kendi `CLAUDE.md`'si, kalıcı hafızası (`memory/`), skill'leri, MCP sunucuları, nöbetleri (duties). Video üretimi için doğal rol dağılımı kurulabilir: **senarist ajan**, **prompt mühendisi ajan** (görsel/video prompt'ları üretir), **üretim operatörü ajan** (media adımlarını, kuyrukları yönetir), **kurgu asistanı ajan** (dosya organizasyonu, Premiere hazırlığı). Capability Matrix hangi ajanın hangi skill/MCP/hafızaya sahip olduğunu tek ekranda gösterir; skill/hafıza kopyalama tek tıktır.

### 2.2 İş akışı motoru (workflow) — üretim hattının omurgası
- **Zincir adımları:** her adım bir ajana, webhook'a, medya modeline veya tarayıcıya gider; önceki adımın çıktısı `{prev_output}` / `{prev_text}` / `{prev_json.x}` ile sonrakine akar.
- **Paralel fan-out/fan-in (2.20):** ardışık adımlar paralel işaretlenirse hepsi aynı anda koşar, çıktıları birleşip sonraki adıma tek handoff olarak geçer → *"sahne 1-2-3'ün görsellerini aynı anda üret, hepsi bitince storyboard belgesini derle"* bugün kurulabiliyor.
- **Onay kapıları (2.19):** zincir insan onayı bekleyip durur; onayda önceki çıktı bozulmadan akar. *"Video üretimine para harcamadan önce bana sor"* kapısı.
- **Koşul (`runIf`), JSON kontratı, ucuz-model doğrulama (`verify`), hata rotası (`onFail`), retry / adımdan devam (2.18), öncelik + yaşlanma, kuyruk dedup.**
- **Görev analitiği + öngörü (2.17/2.21):** aile bazında başarı oranı, medyan süre; zamanlanmış işlerin 7 günlük projeksiyonu.

### 2.3 Medya adımları — fal.ai entegrasyonu (bugün çalışan üretim yolu)
Workflow'a **media adımı** eklenir: model id + JSON girdi şablonu (`{prev_*}` ve `{secret:}` ikamesiyle). Eklenti fal.ai kuyruğuna gönderir, bekler, **asset'leri indirip arşive koyar**, yanıt JSON'u sonraki adımın handoff'u olur. fal.ai tek anahtarla Seedance, Kling, Veo, Flux, nano-banana ailesi dahil çok geniş bir görüntü/video/ses model kataloğu sunduğundan, **"storyboard metni → görsel → video klip" zincirinin API'li kısmı bugün uçtan uca kurulabilir.** Maliyet kuralları (`agentFarm.mediaPricing`) ile asset başına tahmini USD yazılır.

### 2.4 Medya Galerisi
Üretilen tüm asset'ler (görsel/video/ses) model, prompt girdisi, tahmini maliyet ve workflow adıyla tek panelde. Toplam medya maliyeti Dashboard'da bugün/ay olarak görünür.

### 2.5 API'li platformlar için webhook adımları
Şablonlu HTTP çağrıları (`{secret:NAME}` ile anahtar enjeksiyonu) — Higgsfield gibi API sunan platformlara, ElevenLabs'e, kendi n8n akışlarına adım olarak bağlanılır; yanıt zincire akar.

### 2.6 API'siz platformlar için tarayıcı adımları (F3)
Adımın ajanı kendi browser-MCP'siyle verilen URL'de verilen hedefi gerçekleştirir. Host allowlist zorunlu + isteğe bağlı çalıştırma onayı. Google Flow / Topview gibi yalnız-web platformlar için **yarı-otomasyon** kapısı bugün var (sınırları için §3.4).

### 2.7 Tetikleyiciler ve zamanlama — otonomluk katmanı
- **Watch trigger:** klasör/dosya değişince görev/workflow ateşlenir → *"render klasörüne yeni mp4 düştü → sonraki sahneyi başlat / kurgu ajanına haber ver"* bugün kurulabilir.
- **Webhook trigger (inbound):** dış sistem (n8n, telefon) `POST /trigger/<token>` ile farm'ı tetikler.
- **Hook trigger:** ajan olayları (tur bitti, izin bekliyor…) başka görevleri tetikler.
- **Zamanlama:** günlük/haftalık/tek seferlik; kota-farkındalı erteleme (quota window doluysa otomatik iş beklemeye geçer).

### 2.8 Gözlem ve müdahale — "sürekli kullanım"ın bel kemiği
- **Live Timeline:** ajan başına kulvar; kim çalışıyor, kim takıldı, kim izin bekliyor.
- **Sıra-sende bildirimleri (2.22):** ajan başına ses/odak/modal/toast — uzun üretim koşusunda başka işe geçip, ajan girdi beklediği anda yakalanırsın.
- **Needs You kuyruğu:** tüm bekleyen onaylar/izinler tek yerde.
- **Takılma tespiti + dış iletim (B4):** stalled/permission olayları webhook'a (n8n → Telegram) iletilir; masadan uzaktayken de haber gelir.
- **Uzak makine relay (J2):** başka makinedeki claude oturumlarının olayları feed dosyasıyla buradaki timeline'a akar.

### 2.9 Maliyet ve bütçe disiplini
Token maliyeti oturum/ajan/model kırılımıyla; medya maliyeti asset bazında; ajan başına ve filo geneli bütçe uyarıları. Çok-platformlu üretimde "bu video bölümü bize ne yazdı" sorusunun altyapısı (asset tarafı) mevcut.

### 2.10 Görevlerde alternatif CLI'lar (J5 — kısmi)
`agentFarm.cliProfiles` ile **farm görevleri** claude yerine başka bir CLI ile koşturulabilir (`gemini -p "{prompt}"` gibi şablon). Çıktı arşivleme ve exit-code durumu çalışır. (Oturumlar ve derin izleme henüz değil — bkz. §5.)

---

## 3. Bugün YAPAMADIKLARI — dürüst eksik listesi

### 3.1 Asset hattı birinci-sınıf değil
Handoff'lar metin/JSON-merkezli. Media adımı asset indirir ama **"proje → sahne → çekim → deneme → seçilen"** hiyerarşisi yok. Galeri düz bir liste; sahne 3'ün nerede olduğu, hangi sahnelerin görselinin onaylanıp videosunun eksik olduğu görünmüyor. Sahne durum panosu (storyboard matrisi) yok.

### 3.2 Yerel/harici asset'ler sisteme girmiyor
Yalnız fal.ai adımının indirdikleri galeriye düşer. Higgsfield web'den elle indirilen klip, Premiere'in export'u, ComfyUI çıktısı — **görünmezdir**. "Watch klasörü → asset olarak kaydet (meta sidecar ile)" mekanizması yok.

### 3.3 Tek medya sağlayıcısı: fal.ai
Replicate, Gemini API (Imagen/Veo doğrudan), Runway, ElevenLabs vb. için kuyruk/poll/indirme/maliyet semantiği olan yerleşik sağlayıcı yok. Webhook adımıyla taklit edilebilir ama: poll döngüsü yok (tek istek), asset otomatik inmez, maliyet kuralı bağlanmaz.

### 3.4 Görsel insan-seçimi yok
Onay kapısı metin-modal'dır ve handoff'u **değiştirmeden** geçirir. Oysa üretimin kalbi şu: *"8 aday görselden 2'sini seç → yalnız seçilenler video adımına aksın."* Bugün bu ancak elle dosya kopyalayarak yapılır. Galeri-tabanlı **seçmeli onay adımı** (checkbox'lı görsel picker → seçim handoff'a yazılır) yok.

### 3.5 Medya kalite kontrolü (QA) metin-körü
`verify` ucuz-model **metin** yargıcıdır. "Üretilen görsel storyboard tarifine uyuyor mu, elde 6 parmak var mı" tipi görsel doğrulama adımı yok. (Claude vision ile yapılabilir — ajan asset dosyasını Read edip kritere göre PASS/FAIL verebilir; kurulmadı.)

### 3.6 Premiere köprüsü yok
Kurguya giden çıktı "klasörde dosyalar"dan ibaret. Sahne metadata'sından **Premiere'e import edilebilir sekans** (FCP7 XML / EDL) üretimi, bin/adlandırma konvansiyonu, export klasörünü izleyip workflow'u ilerletme reçetesi yok. (Watch trigger var ama kurgu-farkındalı değil.)

### 3.7 Tarayıcı adımlarının pratik menzili dar
Login-duvarlı platformlarda kalıcı tarayıcı profili/oturum yönetimi, indirme yakalama (download'ı galeriye bağlama) ve platform-başına test edilmiş "reçete" (skill) kütüphanesi yok. Browser adımı iskelet olarak güçlü, tarif kitabı boş.

### 3.8 Uzun işlerde dayanıklılık sınırlı
Media timeout var; ama VS Code kapanırsa **koşan workflow'un bellek-içi durumu** (paralel grup fan-in dahil) kaybolur (bilinen, dokümante sınır). Saatlik render'lar için kalıcı iş kaydı + kaldığı yerden devam yok.

### 3.9 Medya bütçe uyarısı yok
Token bütçe uyarıları var; medya maliyeti gösteriliyor ama **eşik aşımında uyarı** üretmiyor.

### 3.10 Oturumlar (sezonlar) yalnız Claude Code
"Start/Continue session" `claude`'a sabit; başka CLI ile oturum açma, izleme, maliyetlendirme yok (ayrıntılı analiz §5).

---

## 4. Gelişim Yol Haritası — Dalgalar

> Sıralama ilkesi: önce **bugünkü fal.ai yolunu uçtan uca güçlendir** (asset hattı + görsel seçim — en yüksek değer/emek oranı), sonra sağlayıcı genişlet, sonra kurgu köprüsü, en son platform-özel reçeteler. Çoklu-CLI (Dalga E) bağımsızdır, araya alınabilir.

### ☑ Dalga A — Asset hattı temelleri (proje/sahne modeli + ingest) — TAMAM (2.23.0)
**Hedef:** Üretilen ve dışarıdan gelen her asset'in proje/sahne bağlamıyla izlenmesi.
- ✅ `production.json` proje manifesti (proje → sahneler; her sahnede durum: `draft/generating/review/approved`). Konum: ajanın klasörü; `core/production.ts` okur-yazar, fail-soft; `Agent Farm: New Production` sihirbazı.
- ✅ **Asset ingest watcher** (`core/ingest.ts`, `agentFarm.ingestFolders`): klasörler 30 sn'de bir taranır; yeni medya dosyası galeriye **yerinde** kaydedilir (kopya yok), `.media.json` sidecar + `source: external:<label>`, boyut-stabilite kontrolü (yarım indirme atlanır), 48 saat backfill sınırı. Elle indirilen çıktılar böylece girer. `Register Media Asset(s)…` komutuyla elle kayıt da var.
- ✅ Galeri: proje/sahne/kaynak filtreleri + **sahne durum panosu** (satır=sahne, sütun=varlık türü; hücre tık→süz, durum rozeti tık→durum değiştir).
- ✅ Media adımı meta'sına `projectId/sceneId/source` alanları (workflow media adımı + adhoc re-run/vary link taşır; sihirbazda opsiyonel sahne bağlama).
- ✅ **Medya bütçe uyarısı** (`agentFarm.mediaBudgetMonthUSD`, aylık eşik → toast + forward).
- *Gerçekleşen dokunma riski: düşük — media meta formatı geriye uyumlu genişledi (eski sidecar'lar okunuyor, testle sabit).*
- *Testler: 36/36 core (production/media/ingest) + 15/15 galeri webview DOM-stub.*

### ☑ Dalga B — Görsel onay, seçim ve medya QA — TAMAM (B1 2.24.0, B2 2.25.0)
**Hedef:** İnsan seçimini akışın vatandaşı yapmak.
- ✅ **B1 — Seçmeli görsel onay adımı** (`select` step): adım, run'ın o ana kadarki media asset'lerini galeri-picker panelinde (`SelectionPanel` + `media/selection.js`) açar; kullanıcı min-max aralığında seçer; **seçilen asset URL'leri handoff olur** (`{prev_json.selected.N}` / `{prev_text}`) → sonraki media/agent adımı yalnız seçilenlerle çalışır. KRİTİK: yerel dosya değil remote URL akar (downstream fal adımı tüketebilsin) — bunun için MediaMeta'ya `assetUrls` eklendi. Seçilen/reddedilen galeride `✓ kept`/`✗ dropped` rozetli (`recordSelection` → meta `selectedUrls`/`rejectedUrls`). Cancel → onFail. UI yoksa hepsi tutulur. Sihirbazda **Select assets (visual pick)** adımı. *Test: 19/19 core (mediaCandidates/recordSelection/runSelectStep handoff+cancel+auto+empty) + 11/11 selection webview (min/max/confirm/cancel).*
- ✅ **B2 — Media verify adımı (vision QA, 2.25.0):** media adımına `verify:{criteria,retries}` → üretim sonrası `runVisionJudge` (ucuz vision model, asset dosyasını Read ile açar) PASS/FAIL. FAIL → `verifyMediaThenAdvance` aynı media adımını `injectMediaFeedback` ile (gerekçe input.prompt'a eklenir) yeniden üretir (attempt takipli), tükenince onFail. finish()'te media+verify → vision yolu (metin yolu media'da agentId'siz retry'da çökerdi — düzeltildi). Fail-open. Sihirbazda media adımına QA ölçütü + deneme sayısı sorusu. *Test: 17/17 (injectMediaFeedback + PASS/FAIL-retry/exhausted/no-asset/finish-routing).*
- ☐ "Regenerate with feedback" hızlı aksiyonu galeri kartında. KODLANMADI (küçük UI eklentisi — Dalga C öncesi/sonrası eklenebilir).
- *Gerçekleşen dokunma riski: orta — B1 startWorkflowStep'e tek dispatch dalı + runSelectStep; B2 finish()'e media-verify dallanması + runMediaStep retry param; klasik approval/handoff/text-verify aynen; media meta geriye uyumlu.*

### ☐ Dalga C — Medya sağlayıcı soyutlaması
**Hedef:** fal.ai tekelini kırmak, API'li platformları eşit vatandaş yapmak.
- `MediaProvider` arayüzü: `submit(model, input) → jobId`, `poll(jobId)`, `assets(response)`, `estimateCost(...)`. Mevcut fal yolu ilk provider olarak arkasına alınır (davranış birebir korunur).
- İlk yeni sağlayıcılar: **Replicate** ve **Gemini API** (Imagen/Veo); anahtarlar mevcut Secrets vault'tan.
- Webhook adımına opsiyonel **poll modu** (`pollUrl`/`until` regex + timeout) — sağlayıcı yazılmadan da kuyruklu API'lerle çalışabilme.
- Sağlayıcı-bazlı maliyet kuralları ve galeri rozetleri.
- *Dokunma riski: orta — runMediaStep'in içi refactor edilir ama tek çağrı noktası var; fal round-trip'i mevcut testle sabitlenir.*

### ☐ Dalga D — Kurgu köprüsü (Premiere)
**Hedef:** "Klasördeki klipler"den "Premiere'de açılır sekans"a.
- **Sekans üretici görev tipi:** proje manifestindeki sahne sırası + seçili asset'lerden **FCP7 XML** (Premiere import eder) ve **EDL** üretimi; bin yapısı = sahne yapısı. (Saf dosya üretimi — ajan görevi olarak da koşabilir, deterministik üretici olarak core'da da.)
- Adlandırma konvansiyonu: `P01_S03_T02_approved.mp4` deseni; ingest watcher bu deseni tanıyıp sahneye otomatik bağlar.
- Premiere export klasörü için hazır watch-trigger şablonu ("export düştü → sonraki bölüm/yayın görevi").
- (Sonraki faz, ayrı karar: UXP paneli — maliyetli, XML yolu doyduktan sonra değerlendirilecek.)
- *Dokunma riski: düşük — tamamen ekleme.*

### ☐ Dalga E — Çoklu-CLI oturumları (ayrıntı §5)
**Hedef:** Kullanıcının seçtiği başka bir CLI/modelle sezon açıp aynı panelden izleyebilmesi — **claude yoluna dokunmadan**.
- E1: `Start Session With…` (CLI profili QuickPick) + ajan-başına varsayılan CLI ayarı; terminal yaşam döngüsünden `session-open/closed` durumu.
- E2: Canlı izleme adaptörleri — CLI'ın hook/notify imkânı varsa mevcut listener'a POST eden mini feeder (RelayTailer deseni); yoksa yalnız yaşam-döngüsü durumu (dürüst kısıt).
- E3: Transkript adaptörleri — `SessionSource` arayüzü; diğer CLI'ların oturum kayıtlarını SessionInfo'ya normalize eden opsiyonel parser'lar; kaynak rozeti (`claude` / `codex` / `gemini`); bilinmeyen modelde maliyet=0 + "pricing kuralı ekle" uyarısı (mevcut unknown-model mekanizması).
- *Dokunma riski: E1 sıfıra yakın; E2-E3 ekleme, fail-soft.*

### ☐ Dalga F — Uzun iş dayanıklılığı
**Hedef:** Saatlik render'lar ve gece koşuları VS Code yeniden başlatmalarına dayansın.
- Workflow run durumunun (aktif adım, paralel grup fan-in beklemeleri, media jobId'leri) diske yazılması; açılışta **resume** teklifi.
- Media job'ları için "reattach": jobId kalıcıysa poll kaldığı yerden sürer.
- Sağlayıcı retry/backoff politikaları.
- *Dokunma riski: yüksek dikkat — tasks.ts'in kalbi; küçük, izole PR'lar + mevcut 4 test takımı (lifecycle/approval/parallel/taskstats) yeşil kalmak zorunda.*

---

## 5. Çoklu-CLI Oturumları — Analiz: Temiz Genişler mi, Bozar mı?

**Soru:** "Sezon aç" bugün doğrudan Claude Code açıyor. Kullanıcı, seçtiği başka bir CLI/modelle sezon açıp bunları da aynı eklentiyle izleyip yönetebilir mi — mevcut, iyi çalışan Claude sistemini hiç bozmadan?

**Kısa cevap: Evet, temiz genişler — çünkü gereken dikiş yerleri mimaride zaten var.** Kanıtlar:

1. **`CliProfile` (J5) zaten mevcut:** Görev katmanı `{prompt}/{args}` şablonlu alternatif CLI'ları bugün destekliyor (`agentFarm.cliProfiles`); headless görevlerde çıktı arşivleme + exit-code durumu **CLI'dan bağımsız** çalışıyor. Oturum açmaya genişletmek, `startSession` komutunun yanına profil seçmeli bir kardeş komut eklemekten ibaret — mevcut `claude` yolu **tek karakter değişmeden** kalır.
2. **`RelayTailer` (J2) normalizasyon desenini kanıtladı:** Yabancı kaynaklı olaylar (başka makinenin feed dosyası) zaten hook-payload biçimine map edilip `LiveMonitor.handle()`'a basılıyor. LiveMonitor kaynağın Claude olup olmadığını bilmiyor — **herhangi bir şey** bu biçime map edilirse timeline/durum makinesi/bildirimler bedavaya çalışır.
3. **PricingEngine kural tabanlı:** bilinmeyen model = maliyet 0 + görünür uyarı (uydurma yok). Yabancı CLI'ların modelleri için kural eklenirse maliyet de akar; eklenmezse sistem dürüstçe "bilmiyorum" der. Context-tavan kuralı da aynı felsefede (bilinmeyen model → yüzde gösterme).

**Katmanlı gerçekçilik** (ne, ne kadar derin izlenebilir):

| Katman | Ne verir | Nasıl | Kısıt |
| --- | --- | --- | --- |
| **E1 — Yaşam döngüsü** | oturum açık/kapalı, hangi ajan, hangi CLI | Terminal onDidClose + profil etiketi | "ne yapıyor" bilinmez; sadece var/yok |
| **E2 — Canlı olaylar** | prompt/tool/turn olayları timeline'da | CLI hook/notify desteği varsa 127.0.0.1 listener'a POST eden feeder script (hooksInstaller'ın kardeşi) | CLI başına bir adaptör; hook'suz CLI'da yok |
| **E3 — Transkript/maliyet** | oturum geçmişi, token/maliyet, viewer | `SessionSource` arayüzü + CLI-özel parser (ör. yerel oturum JSONL'leri) → SessionInfo'ya normalize | format kayması riski; adaptörler fail-soft ve opsiyonel olmalı |

**Bozulmama garantileri (tasarım kuralları):**
- Claude yolu **varsayılan ve dokunulmaz**: yeni davranışların tümü opt-in (yeni komut, yeni ayar); `startSession/continueSession` aynen kalır.
- Yabancı kaynaklar **etiketlenir** (kaynak rozeti) ve Claude-özel analitiğe (context health, cache verimi, distill vb.) **karışmaz** — filtreyle dışta tutulur.
- Adaptörler **fail-soft**: parse edilemeyen kayıt sessizce atlanır, ana akış asla adaptör hatasıyla düşmez (relay ve pricing'de kanıtlanmış yaklaşım).
- Her katman **bağımsız değerli**: E1 tek başına bile "farklı modelle sezon aç + panelden yönet" ihtiyacının görünür kısmını karşılar.

**Sonuç:** Genişleme programı bozmaz; tersine mevcut desenlerin (CliProfile, RelayTailer, PricingEngine kuralları) doğal uzantısıdır. Yol: **E1 → E2 → E3** sırasıyla, her adım kendi başına teslim edilebilir.

---

## 6. Takip Disiplini

- Her dalga bir sürüme bağlanır; bitince bu dosyada kutusu ☑ yapılır, CHANGELOG ve BLUEPRINT'e bölüm eklenir.
- Dalga içi kapsam değişirse bu belge **önce** güncellenir (belge = sözleşme).
- Öncelik değişiklikleri kullanıcı kararıdır; varsayılan sıra: **A → B → C → D → E → F** (E, kullanıcı isterse öne çekilebilir — bağımsızdır).
- Her dalganın doğrulaması: mevcut test takımları yeşil + dalgaya özel ad-hoc test + gerçek bir mini-üretim senaryosu (1 proje, 2 sahne) ile uçtan uca deneme.
