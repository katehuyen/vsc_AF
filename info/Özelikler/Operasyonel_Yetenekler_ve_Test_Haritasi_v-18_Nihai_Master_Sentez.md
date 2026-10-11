# Agent Farm Operasyonel Yetenekler ve Test Haritası (v-18 — Nihai Konsolide Master Sentez & X-436 Simülasyon Şartnamesi)
# Agent Farm Operasyonel Yetenekler ve Test Haritası (v-18 — Nihai Konsolide Master Sentez & X-436 Simülasyon Şartnamesi)

**Doküman Versiyonu:** `v-18` (Final Konsolidasyon ve Optimizasyon Sürümü)  
**Kapsam ve İncelenen Kaynaklar:** 
- `Backlog.md` ve `Backloglog.md` içindeki tüm backlog kalemleri (`S`, `P`, `K`, `U`, `M`, `X`, `B`, `A` serileri; 500+ kalem).
- Çekirdek kaynak kodlar (`src/core/`, `src/service/`, `src/remote/`, `src/panels/`, `media/af*.js`).
- Önceki tüm iterasyonlar (`v-01` .. `v-17`).
- `AgentFarm_Technical_DNA.md` ve ilgili tüm mimari kararlar (`20_Decisions/`).
**Amaç:** Agent Farm'ın tüm alt sistemlerini, operasyonel kabiliyetlerini, kod düzeyi mekaniklerini, invaryant kurallarını ve hata/regresyon sınırlarını tek bir nihai, optimize edilmiş, kullanıcı değeri (Operational Leverage) hiyerarşisine tam uyumlu **Master Test & Simülasyon Şartnamesi (`X-436`)** olarak sunmaktır. Bu nihai sürümde; kavramsal karmaşalar tamamen elenmiş, multimedya ve bilgi tabanı (Wiki) sınırları kusursuz ayrıştırılmış, gereksiz şişkinlikler budanmış ve 19 bağımsız alt sistem doğrulanabilir test invaryantlarıyla mühürlenmiştir.

---

## Nihai Hiyerarşik Yapı ve Kullanıcı Değeri Sıralaması (Master Value Hierarchy)

```
                                  KULLANICI DEĞERİ & OPERASYONEL KALDIRAÇ
                                                     ▲
  ┌──────────────────────────────────────────────────┴──────────────────────────────────────────────────┐
  │ 1. Baton Relay & Otonom Zincir Sürekliliği (S-129, S-120, S-128, S-102, batonInjectedDirective)    │
  │ 2. Çoklu Hesap Havuzu, Slot Yönetimi & Kota Kalkanı (@emptiest, 1h-TTL cacheWrite1h, OAuth)         │
  │ 3. Canlı Konsol, HITL Soru Yönetimi & Anlık İnsan Etkileşimi (ConsoleHost, K-43, K-42, S-54)        │
  │ 4. Ses Sistemi, SAPI Okuma Çekirdeği & İşitsel Kokpit (reader.ts, SAPI SpVoice, speechShapes)       │
  │ 5. Kullanıcı Arayüzü, DENSITY Standartları, Akıllı Formlar & Navigasyon (afRepaint, afTip, i18n)   │
  │ 6. Görev Yöneticisi, Akıllı Retry Süpervizörü, ForEach & Git Worktrees (WorkQueue, M-13, B-17)      │
  │ 7. Stüdyo, Multimedya, Premiere XML & Airtable Medya Hattı (9 Reçete, source➔semi➔final, enrich)   │
  │ 8. Gatekeeper / Kapıcı Otonom Karar Kapısı (heuristic➔jev➔llm, 4 Tüketici, Shadow Denetimi)       │
  │ 9. Uzaktan Erişim, Android Host, TLS WebSocket & Telegram Kokpiti (7443 TLS, QR, afAsk, Digest)    │
  │ 10. Özel Sağlayıcı Rotaları, Model Alias Haritası & Endpoint İzolasyonu (routeModels, ProviderKeys) │
  │ 11. Ouroboros Eklenti Evrimi, Otonom Dirilme & Sıfır Blokajlı Disk Mimarisi (selfRestart, QueuedFile)│
  │ 12. Güvenlik, ShellGuard, İzin Sözleşmesi & Koruma Kalkanı (shellGuard 4 Kural, bypassPermissions)  │
  │ 13. Köprü (Bridge) IPC & JSON Dosya Protokolü (bridgeBusy Tekil Kilit, af.js CLI, 100+ Op)          │
  │ 14. Arama Motoru (afQuery), Filo İndeksi & LLM Yargıç Merdiveni (afQuery Gramer, judgeLadder A-27)  │
  │ 15. Bilgi Tabanı, LLM Wiki Derleme & Aday Havuzu (wiki_candidates, excludeTurns X-58, -ANAYASA-)    │
  │ 16. Telemetri, Token Fiyatlandırması, 1-Saatlik Önbellek & Maliyet Tahmini (contextAfter, forecast) │
  │ 17. Misyonlar Motoru & Çoklu Ajan İş Akışları (Lider/İşçi, finish-only, Fan-Out/Fan-In)            │
  │ 18. Projeler, Yaşayan Belgeler, Akıllı Backlog, Karar Kütüğü & İz Defteri (6 Rol, safeWriteDoc)     │
  │ 19. X-436 Otonom Simülasyon, Stres Testi & Master Doğrulama Tezgahı (Chaos Testing, Regresyon)     │
  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Baton Relay & Otonom Zincir Sürekliliği (Baton Relay & Chains)

1. **Kotaya & Bağlama Dayalı Otomatik Devir Tetikleyicisi (`contextGuard.ts`):**
   - 5 saatlik kota (%90), haftalık kota (%98) veya bağlam penceresi (%40) eşiklerine ulaşıldığında ajana `CONTEXT/QUOTA CONVERGE` ve `HANDOVER` sinyallerinin enjeksiyonu.
   - Oturum kapandığında (`SessionEnd` hook'u veya terminal çıkışı) `batonRunner.ts` tarafından bir sonraki bacağın `tasks.add` ile anında sıraya alınması.
2. **Zincir Kimliği & Zorunlu Direktif Enjeksiyonu (`batonInjectedDirective`):**
   - Bacak sırasının (`Leg 1/10`), devir gerekçelerinin (`passCause.ts`) ve zincir kimliğinin (`chn_...`) korunması.
   - Devir notunun yeni ajanın ilk promptuna silinmez bir `⚠️ [BATON RELAY DIRECTIVE]` başlığı ile enjekte edilmesi.
3. **5 İlgi Sinyali & Zincir Masası (`chainBoard.ts`, `chains.list`, S-120):**
   - Diskteki kayıttan ölçülen 5 kritik sinyal:
     1. `askıda` (started ama oturum sessiz/ölü),
     2. `kapanamayan bekleyiş` (waiting-end süresi aşılmış),
     3. `kesilmiş halka` (kurtarma döngüsü),
     4. `motor arızası` (`engineFault`),
     5. `fren reddi` (tavan/barren freni).
   - Bu sinyallerin Living sayfasına ve bildirim ziline tekilleştirilerek (`S-124`) iletilmesi.
4. **Eşzamanlı İki Zincir İzolasyonu (S-129 Mekaniği):**
   - Aynı ajanda iki zincir çalıştığında, halef bacağın `agent busy` parkında kilitlenmesini engelleyen kural: **"Zincirin devamı yalnız KENDİ zincirinin öncülünü bekler."**
5. **Chains (⑂) Yönetim Sayfası & Görsel Semantik (`chainsPanel.ts`, S-122, S-128):**
   - Renk semantiği: Done (■ yeşil), Running (▶ mavi/mor), Waiting/Parked (⏳/🅿 kehribar), Attention/Hanging (⚠ turuncu), Stopped/Refused (✕ gri).
   - Orijinal `⑂⊣` Last Leg sembol birliği, mini etap hattı stepper'ı (`[● Leg 1] ➔ [● Leg 2] ➔ [▶ Leg 3] ... [○ 6]`), `Show: N` limiti ve tek tıkla `🧹 Clean All Hanging` toplu temizliği.
6. **24 Saatlik StaleScan Takılı Zincir Temizliği (`staleScan.ts`, S-127):**
   - 24 saati geçmiş sahipsiz `started` durumundaki ölü zincirlerin taranıp tek tıkla `done` kapanış kaydı ile güvenle arşive kaldırılması.
7. **Baton Güvenlik Frenleri & Failsafe (`batonBrake.ts`, `batonFailsafe.ts`):**
   - Maksimum bacak sayısı tavanı (`maxLegs`), verimsiz/kısır döngü (barren) freni ve kaza kurtarma (`batonFailsafe.ts`).

---

## 2. Çoklu Hesap Havuzu, Slot Yönetimi & Kota Kalkanı

1. **Hesap Kuralı Bellek Disiplini (S-102 Mekaniği):**
   - Kullanıcının hesap bazlı kurallarının (örn. *"Rotam hesabında test yapma, yalnızca prod kod yaz"*) hafızada tutulması ve oturum açılışında ilgili kuralın prompta mühürlenmesi.
2. **`@emptiest` Akıllı Rotasyon & Kesintisiz Akış:**
   - Görevlerin ve baton bacaklarının otomatik olarak en boş kota yüzdesine sahip hesaba atanması.
3. **1-Saatlik TTL Önbellek Takibi (`pricing.ts`, `cacheWrite1h`):**
   - Claude API'sindeki 5 dakikalık (1.25x) ile 1 saatlik (2.0x) önbellek yazma arasındaki 1.6 kat fiyat farkının transkriptlerdeki `ephemeral_1h_input_tokens` ayrımıyla tam doğrulukla hesaplanması.
4. **OAuth Otomatik Yenileme (`oauthRefresh.ts`):**
   - Süresi dolan oturum anahtarlarının arka planda sessizce yenilenmesi, görevin kesintiye uğramaması.

---

## 3. Canlı Konsol, HITL Soru Yönetimi & Anlık İnsan Etkileşimi

1. **ConsoleHost 5 Motor İndirgemesi (`consoleHost.ts`):**
   - 5 farklı CLI motorunun (`Claude`, `Codex`, `Gemini`, `OpenCode`, `Antigravity`) tek tip konsol arayüzüne standartlaştırılması.
2. **K-43 Otonom Soru Cevaplayıcı (`consoleproto.ts`):**
   - Soru kartlarında geri sayım sayacı (`countdown timer`); süre bittiğinde otomatik varsayılan yanıtın verilmesi.
3. **K-42 Sabit 4 Satırlı Kart Mimarisi:**
   - Konsol kartlarında metin uzadıkça kartın zıplamasını engelleyen sabit 4 satırlı düzen ve dahili kaydırma çubuğu.
4. **S-54 Interrupt Sırası Temizliği & S-62 Arka Plan Durdurma:**
   - Kullanıcı `Interrupt` verdiğinde yürütülmemiş tüm kuyruk isteklerinin anında boşaltılması; arka planda asılı kalan komutların kademeli olarak durdurulması.

---

## 4. Ses Sistemi, SAPI Okuma Çekirdeği & İşitsel Kokpit

1. **`reader.ts` İsteğe Bağlı Tam Metin Okuyucu (U-197):**
   - Konsol, Living, Notlar ve Sohbet ekranlarında metinleri sesli dinleme yeteneği.
2. **SAPI SpVoice Uzun Ömürlü Asenkron Süreç (U-198):**
   - Windows SAPI SpVoice motorunun tek seferlik aç-kapa yapmak yerine kalıcı bir arka plan sürecinde sıfır gecikmeyle çalışması.
3. **`speechLang.ts` Dinamik Dil Tespiti (U-203):**
   - Okunacak metnin dilini (Türkçe / İngilizce) otomatik analiz edip doğru ses motorunu (Tolga / David / Zira) seçmesi.
4. **`speechShapes.ts` Kod, JSON ve Hash Temizleyici (U-204):**
   - Metin içindeki uzun hash'leri, URL'leri, JSON bloklarını ve kod parçacıklarını süzerek dinlenebilir akıcı konuşmaya dönüştürmesi.
5. **`askSpoken.ts` Soru ve İzin Seslendirme (U-208, U-214) & Arbiter Çakışma Hakemi:**
   - Agent soru sorduğunda sesli anons yapılması; birden fazla ses isteği geldiğinde 500ms kuyrukla sıraya konması.
6. **Android TTS Mobil Köprüsü (U-209, U-217):**
   - Mobil PanelHost üzerinden telefona sesli okuma komutu iletilmesi.

---

## 5. Kullanıcı Arayüzü, DENSITY Standartları, Akıllı Formlar & Navigasyon

1. **`afRepaint.js` Form Veri Koruması (U-218, U-219):**
   - Sayfa arka planda yenilendiğinde (polling/refresh) kullanıcının form kutularına yazdığı taslak metinlerin silinmesini engelleyen DOM koruması.
2. **`afTip.js` Taşma ve Çevirme Kuralları (K-44):**
   - Tooltip kutularının ekran sınırlarına çarptığında otomatik olarak yön değiştirmesi (flip) ve görünür alanda kalması.
3. **360px Mobil Düzen & DENSITY Tablo Mimarisi (U-192, U-193):**
   - Masaüstünde sıkıştırılmış yüksek bilgi yoğunluğu (DENSITY); mobilde 360px ekranlarda formların kırılmadan (`FLOOR_EM`) yatay kaydırılabilmesi.
4. **Tek Dosya `afI18n.js` Çeviri Motoru (U-189, U-196):**
   - UI arayüz metinlerinin tek bir sözlük dosyasından sıfır runtime maliyetiyle dinamik çevrilmesi.

---

## 6. Görev Yöneticisi, Akıllı Retry Süpervizörü, ForEach & Git Worktrees

1. **WorkQueue Durum Makinesi:**
   - `queued ➔ assigned ➔ running ➔ done | failed` yaşam döngüsünün atomik takibi.
2. **M-13 LLM Retry Süpervizörü (`retrySupervisor.ts`):**
   - Görev hata aldığında körü körüne yeniden denemek yerine hatanın kök nedenini analiz edip strateji değiştirerek yeniden denemesi.
3. **`parallel.run` & Git Worktrees (B-17):**
   - Eşzamanlı görevlerin bağımsız git worktree'lerinde izole çalışması, ana dalın kirlenmemesi.
4. **`forEachStep.ts` Paralel Fan-Out / Fan-In (M-40) & `runContext.ts` (M-39):**
   - Dinamik veri listelerinin paralel alt görevlere dağıtılması ve sonuçların tek bir adımda toplanması.
5. **`checkpointStep.ts` (M-43) & `workflowLive.ts` (M-46):**
   - Uzun iş akışlarında kontrol noktaları oluşturulması; çalışan akışa canlı müdahale edilebilmesi.

---

## 7. Stüdyo, Multimedya, Premiere XML & Airtable Medya Hattı

1. **9 FFmpeg Medya Reçetesi (`mediaRecipes.ts`, `toolRun.ts`):**
   - Video kesme, ses birleştirme, altyazı yakma, format dönüştürme ve görsel optimizasyon reçetelerinin CLI üzerinden standart yürütülmesi.
2. **Premiere Pro XML Zaman Çizelgesi İhracı (`sequenceExport.ts`):**
   - Üretilen medya parçalarının doğrudan Adobe Premiere Pro uyumlu XML sekanslarına dönüştürülmesi.
3. **Airtable Ders Motoru 4 Aşamalı Varlık Döngüsü (X-416..X-426):**
   - `source ➔ semi ➔ final ➔ asset` durum akışı, causal bağıntı grafiği.
4. **`mediaEnrich.ts` Yapay Zekâ Form Doldurucu (X-419) & `all_in/` Medya Ayrıştırıcı (X-422):**
   - Medya dosyalarından 40+ meta veri alanının otonom çıkarılması; gelen medya havuzunun otomatik sınıflandırılması.
5. **Stüdyo Galeri Duvarı & Moderasyon (X-424, X-425) & Aylık Medya Bütçe Tavanı.**

---

## 8. Gatekeeper / Kapıcı Otonom Karar Kapısı

1. **3 Kademeli Sağlayıcı Hiyerarşisi (`heuristic ➔ jev ➔ llm`):**
   - Kararların önce sıfır maliyetli sezgisel kurallarla, ardından yerel mantıkla, en son LLM ile çözülmesi.
2. **4 Sistem Tüketicisi:**
   - `dispatch` (Görev atama), `retry` (Hata telafisi), `trigger` (Olay tetikleme), `workflow` (Akış yönlendirme).
3. **Shadow Gölge Uyuşma Denetimi:**
   - Canlı kararların arka planda kurallarla tutarlılığının denetlenmesi ve sapma raporu üretilmesi.
4. **Secret Maskeleme & Farm-Only Anahtar Koruması:**
   - Karar loglarında ve transkriptlerde gizli anahtarların asla düz metin görünmemesi.

---

## 9. Uzaktan Erişim, Android Host, TLS WebSocket & Telegram Kokpiti

1. **7443 TLS WebSocket Sunucusu (`src/remote/server/host.ts`):**
   - Yerel ağda güvenli TLS üzerinden mobil istemci bağlantısı.
2. **ECDSA P-256 Otomatik Sertifika Üretimi (`cert.ts`) & QR Eşleştirme (`devices.ts`):**
   - Cihaz bazlı token yetkilendirme ve tek tıkla cihaz erişim iptali.
3. **Mobil PanelHost & `afAsk.js` Yerel Modal Sorular:**
   - Telefonda masaüstü odağını bozmadan yerel alt-çekmece (bottom sheet) soru onayları.
4. **Telegram Kokpiti (`telegramCockpit.ts`, `telegramDigest.ts`):**
   - 4096 karakter temiz diyalog kartları, inline keyboard onayları, busy mesaj kuyruğu ve bütçe kalkanı.
5. **11. Başlatma Kapısı Paritesi (`telegramLaunch.ts`, `U-138`):**
   - Masaüstündeki tüm başlatma yeteneklerinin Telegram üzerinden tam yetkiyle çalıştırılabilmesi.

---

## 10. Özel Sağlayıcı Rotaları, Model Alias Haritası & Endpoint İzolasyonu

1. **Model Kademelerinin CLI Alias'larına Eşlenmesi (`routeModels.ts`, `X-491`):**
   - `opus/sonnet/haiku/fable` kademelerinin `ANTHROPIC_DEFAULT_*_MODEL` ve `ANTHROPIC_SMALL_FAST_MODEL` değişkenlerine dinamik haritalanması.
2. **3. Parti Rotalarda Ham ID Filtresi (`routedModel()`, `X-495`):**
   - Ham Anthropic ID'lerinin filtrelenerek rotanın kendi model alias'ına dönüştürülmesi.
3. **Varsayılan Kademe Enjeksiyonu (`routeDefaultTier()`, `X-496`):**
   - Model seçilmediğinde CLI'ın `settings.json` içindeki Anthropic ID'sini üçüncü partiye göndermesinin önlenmesi.
4. **ProviderKeys OS Keychain & Endpoint Bağlama (`X-488`, `X-492`):**
   - Anahtarların `baseUrl` adresine mühürlenmesi (`KeyBind`); rota adresi değiştiğinde anahtarın devre dışı kalması.
5. **Kaskadlı Farm Secret Güncellemesi (`followRename`, `X-488`) & Bağımlılık Taraması (`secretReaders.ts`, `X-487`).**

---

## 11. Ouroboros Eklenti Evrimi, Otonom Dirilme & Sıfır Blokajlı Disk Mimarisi

1. **Ouroboros Gece Vardiyası Dirilme Döngüsü (`selfRestart.ts`, `X-230`):**
   - Gece vardiyasında `.vsix` paketleme, kurma ve insan müdahalesiz eklenti yeniden başlatma döngüsü.
2. **5 Ölçülmüş Gerçek Kuralı:**
   - Köprü yanıt gecikmesi ve disk soğuma damgası (`cooldown stamp`) ile sonsuz boot döngüsü koruması.
   - Konsol hafıza ölümü vs Entegre Terminal hayatta kalma asimetrisi.
   - Sıfır köprü blokajı (`farm.health` telemetrisi).
   - Yeni paketin yüklenmesi için `workbench.action.reloadWindow` zorunluluğu (`X-230`).
   - Tekil oturum rıza prensibi (`askedBy`, `X-310`).
3. **HDD Korumalı Asenkron Dosya Yazıcı Kuyruğu (`QueuedFile`, `X-500`):**
   - Yavaş disklerde (WD20EARX) 20 saniyelik donmaları engelleyen `tail/next` Promise kuyruğu, `.tmp` atomik kaydı ve `renameRetrying` ile Windows `EBUSY`/`EPERM` kilit direnci.
4. **44k+ Satırlık Monolitik `extension.ts` Parçalanması (`X-499`):**
   - 11k satır tembel op tabloları ve 5.7k satır komut kayıtçılarına ayrıştırma; getter enjeksiyonu.

---

## 12. Güvenlik, ShellGuard, İzin Sözleşmesi & Koruma Kalkanı

1. **ShellGuard & Komut İçi Veri Yasağı (`shellGuard.ts`, `X-439`):**
   - 4 Katı Red Kuralı: `non-ascii` karakterler, `backtick` (Claude Git Bash), tehlikeli/uzun `heredoc`, `long-literal` (>600 karakter).
   - Kaçış İstisnası: `# af:allow-shell`.
   - Kurtarma Yönergesi: *"Metni Write ile dosyaya yaz ve komutta yalnız dosya adını çağır."*
2. **BypassPermissions Mutlak İzin Sözleşmesi (`permissionmode.ts`, `K-22`):**
   - Kartta bypass seçilmişse asla HITL modalı açılamaz.
   - 4 Seviyeli Ayar Hiyerarşisi (`managed` > `local` > `project` > `user`).
   - Yönetilen politika engellerse oturum başlatılmadan reddedilir (`blocked`).
3. **Superpowers Tembel Yüklü Beceri Çekirdeği (`superpowers.ts`, `X-136`):**
   - 14 becerinin diskte **0 token** maliyetle uyutulması; kök kanca + dinamik frontmatter indeksi (≤8 KB).
   - Taşınabilir kök çözümü (`superpowersFallbackRoot`).
4. **V8 Bytecode Derlemesi (`bytenode`) & Donanım Kilitli Lisanslama.**

---

## 13. Köprü (Bridge) IPC & JSON Dosya Protokolü

1. **Tekil Uçuş Kilidi (`bridgeBusy`, `B-1`):**
   - Eşzamanlı op çağrılarının sıraya alınması, yarış durumlarının sıfırlanması.
2. **3 Aşamalı Atomik İstek/Yanıt Yaşam Döngüsü:**
   - `<id>.request.json` oku ➔ Handler çalıştır ➔ `<id>.response.json` mühürle ➔ İstek dosyasını sil (`unlink`).
3. **Ajan CLI Köprüsü (`af.js` & `af.ts`):**
   - 100+ kayıtlı köprü op'unun CLI üzerinden doğrudan çalıştırılabilmesi.
4. **Kayıtçı Mimarisi & Hata İzolasyonu (`BridgeRegistry`):**
   - Tip güvenli argüman kontrolleri (`need`, `argStr`); op hatalarında köprünün kilitlenmemesi.

---

## 14. Arama Motoru (afQuery), Filo İndeksi & LLM Yargıç Merdiveni

1. **Tekil Dilbilgisi İlkesi (`media/afQuery.js`, `query.ts`):**
   - Node.js ve Webview ortamlarında tek kaynaklı ortak arama motoru.
2. **Operatörler & Çıplak Kelime Sabitleme (`wholeWord`, `X-24`):**
   - `+zorunlu`, `-hariç`, `"tam cümle"`, `regex:`, tam kelime sınırları.
3. **`QueryPrefilter` Hızlı Dosya Eleme Motoru (`X-42`):**
   - Değişmez harf dizileri içermeyen transkriptlerin disk okuma aşamasında elenmesi.
4. **LLM Yargıç Merdiveni (`judgeLadder.ts`, `A-27`):**
   - Ucuzdan pahalıya tırmanma (`haiku ➔ sonnet ➔ opus`).
   - Alt model FAIL derse üst modele sorulması; üst model PASS derse FAIL kararının ezilmesi (`overturned`) ve yeniden deneme maliyetinin sıfırlanması.

---

## 15. Bilgi Tabanı, LLM Wiki Derleme & Aday Havuzu (00_WIKI)

1. **İki Aşamalı Wiki Mimarisi (`wiki.ts`, `B-14`):**
   - **İşaretleme (Marking - 0 Maliyet):** Turların `wiki_candidates.json` havuzuna hızlıca kaydedilmesi; vault'a yazılmaması ve geri alınabilir olması.
   - **Derleme (Compiling - LLM Sentezi):** Eklentinin transkriptleri toplayıp özet (Brief) sunması (`wiki.compile`); LLM'in sayfaları yazması (`-WIKI-ANAYASA-.md`).
2. **Gürültülü Tur Dışlama (`excludeTurns`, `X-58`):**
   - İşaretlenen aralıktaki selamlaşma ve commit gibi gürültü turlarının derlemeden çıkarılması.
3. **Eşzamanlı Derleme Kilidi & Stale Temizliği (`compileTaskId`, `releaseStaleClaims`).**

---

## 16. Telemetri, Token Fiyatlandırması & Maliyet Tahmini

1. **1-Saatlik TTL Önbellek Takibi (`cacheWrite1h`):**
   - 1 saatlik önbellek yazımlarının 2.0x çarpanla (%100 doğrulukla) hesaplanması.
2. **Sentetik Sıfır-Kullanım Satır Koruması (`contextAfter`):**
   - Interrupt ve cancel sonrası gelen `0` token'lı satırların oturumun gerçek bağlam sayısını silmesinin engellenmesi.
3. **Tarihli Fiyat Sürümleri (`PricingVersion`) & Görev Maliyet Kütüğü (`taskcost.ts`, `forecast.ts`).**

---

## 17. Misyonlar Motoru & Çoklu Ajan İş Akışları

1. **Lider / İşçi Mimarisi & Sert 5'li Misyon Tavanı:**
   - Ana hedeflerin alt işçilere delege edilmesi; kaynak tükenmesini önleyen sert eşzamanlılık tavanı.
2. **`finish-only` Toparlanma Modu:**
   - Hata durumunda yeni iş almayıp mevcut işleri güvenle tamamlayarak kapanma.
3. **Fan-Out / Fan-In İş Akışları & `workflowWake` Canlı Müdahale.**

---

## 18. Projeler, Yaşayan Belgeler, Akıllı Backlog & İz Defteri

1. **6 Rol Belgesi Mimarisi:**
   - `BRIEF`, `SPEC`, `ARCH`, `TASK`, `TEST`, `AUDIT` rol belgelerinin standart yapısı.
2. **`safeWriteDoc` + `.bak` Otomatik Yedekleme & 16 MB `DOC_EDIT_CAP`:**
   - Belge güncellemelerinde veri kaybı koruması.
3. **Girinti Korumalı Arşivleme (`X-460`) & `projects.backlog.next` Akıllı Seçim.**
4. **`[round:: N]` Tarihçesi, `[parent:: KOD]` Kaskadı & `P-18` Renk Rozetleri.**

---

## 19. X-436 Otonom Simülasyon, Stres Testi & Master Doğrulama Tezgahı (Sim Bench)

```
                       ┌───────────────────────────────────────────────────────────┐
                       │          X-436 MASTER OTONOM SİMÜLASYON VE STRES TEZGAHI   │
                       └─────────────────────────────┬─────────────────────────────┘
                                                     │
         ┌───────────────────┬───────────────────────┼───────────────────────┬───────────────────┐
         ▼                   ▼                       ▼                       ▼                   ▼
┌─────────────────┐ ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐ ┌─────────────────┐
│ 100+ GÖREV YÜKÜ │ │ CHAOS DISK KİLİT│     │ TLS AĞ KOPMASI  │     │ KOTA AŞIM DEVİR │ │ MERDİVEN VE HAKEM│
│ - Deadlock Testi│ │ - EBUSY / EPERM │     │ - 7443 Kopması  │     │ - %90 Kota Eşiği│ │ - False-Fail Ezme│
│ - Fan-Out Dağıtım│ │ - QueuedFile 4x │     │ - Reconnect Sync│     │ - Baton Devri   │ │ - Yargıç Tasarrufu│
└─────────────────┘ └─────────────────┘     └─────────────────┘     └─────────────────┘ └─────────────────┘
```

### X-436 Master Doğrulama Matrisi

| Alt Sistem | Test Kodu | Doğrulama Kriteri / İnvaryant Kuralı | Başarısızlık / Regresyon Durumu |
|---|---|---|---|
| **Baton Relay** | **TST-01** | %90 kotada `batonRunner`'ın sonraki hesaba devir bacağını `tasks.add` ile açması; direktif enjeksiyonunun korunması. | Devir yapılamayıp oturumun kota hatasıyla donması; direktifin kaybolması. |
| **Baton İzolasyon** | **TST-02** | Aynı ajanda iki zincir varken, halef bacağın yalnız kendi öncülünü beklemesi (S-129). | Zincirlerin birbirini kilitleyip dead-lock oluşturması. |
| **Konsol & HITL** | **TST-03** | Soru kartında süre bitince K-43 otonom cevaplayıcısının varsayılan yanıtı vermesi. | Kartın süresiz asılı kalması ve akışın tıkanması. |
| **Ses Sistemi** | **TST-04** | Metindeki JSON ve URL'lerin `speechShapes` ile filtrelenerek SAPI SpVoice sürecine aktarılması. | Ses motorunun kod bloklarını okuyarak konuşmayı anlaşılmaz kılması. |
| **Arayüz Koruması** | **TST-05** | Sayfa yenilendiğinde `afRepaint`'in form girdilerini koruması; `afTip`'in ekran sınırında yön değiştirmesi. | Form metinlerinin silinmesi veya tooltip'lerin ekran dışına taşması. |
| **Retry & Worktree** | **TST-06** | M-13 süpervizörünün hatayı analiz edip `parallel.run` worktree'sinde izole yeniden deneme yapması. | Hatalı adımın aynı şekilde tekrarlanması veya ana çalışma alanının bozulması. |
| **Multimedya** | **TST-07** | `mediaRecipes` ile 9 FFmpeg reçetesinin ve Premiere XML zaman çizelgesinin hatasız üretilmesi. | XML çıktısının Premiere Pro tarafından reddedilmesi. |
| **Kapıcı (Gatekeeper)**| **TST-08** | Secret anahtarlarının loglarda maskelenmesi; `heuristic➔jev➔llm` hiyerarşisinin korunması. | Gizli anahtarların transkripte sızması veya gereksiz LLM maliyeti. |
| **Uzaktan Erişim** | **TST-09** | 7443 TLS WebSocket sunucusunun anlık kopmasında mobil istemcinin veri kaybetmeden yeniden bağlanması. | Mobil oturumun kilitlenmesi veya yetkilendirmenin düşmesi. |
| **Özel Rotalar** | **TST-10** | 3. parti rotada `routedModel`'in ham Anthropic ID'lerini filtreleyip `TIER_ENV` alias'larını ataması. | 3. parti sağlayıcının 400 Bad Request dönmesi. |
| **Ouroboros Dirilme** | **TST-11** | Eklenti güncellemesinde `reloadWindow` kullanılması; `QueuedFile`'ın yavaş diskte sıfır blokajla yazması. | Eklentinin eski kodda kalması veya 20 saniyelik VS Code donması. |
| **ShellGuard** | **TST-12** | Komutta Türkçe harf, backtick veya >600 karakter literal olduğunda anında reddedilip `Write` aracına yönlendirilmesi. | Komut verisinin shell tarafından sessizce bozulması. |
| **Köprü IPC** | **TST-13** | Eşzamanlı köprü çağrılarında `bridgeBusy` kilidinin yarış durumlarını sıfırlaması. | Dosya yazma çakışması ve köprünün kilitlenmesi. |
| **Arama & Yargıç** | **TST-14** | `judgeLadder`'da Haiku FAIL dediğinde Sonnet'in PASS vererek kararı ezmesi (`overturned`). | Sahte-FAIL yüzünden pahalı adımların boş yere yeniden çalıştırılması. |
| **Bilgi Tabanı (Wiki)**| **TST-15** | `wiki_candidates` işaretlemesinin anında kaydedilmesi; `excludeTurns` ile gürültü turlarının brief'ten çıkarılması. | Bilgi tabanına commit veya selamlaşma gürültüsünün girmesi. |
| **Telemetri & Fiyat** | **TST-16** | 1 saatlik önbelleğin 2x çarpanla hesaplanması; `contextAfter`'ın sıfır satırlarda bağlamı koruması. | Maliyetin 1.6 kat eksik hesaplanması veya bağlam sayacının sıfırlanması. |
| **Proje & Belgeler** | **TST-17** | `safeWriteDoc`'un `.bak` yedeği alması ve `X-460` girinti korumasının bozulmaması. | Dosya yazımında veri kaybı veya girintilerin düzleşmesi. |
| **Master Simülasyon** | **TST-18** | 100 eşzamanlı sentetik görevin ve kaos enjeksiyonunun sıfır kilitlenme (zero-deadlock) ile tamamlanması. | İş parçacığı havuzunun kilitlenmesi veya hafıza sızıntısı. |

---

## 20. Nihai Sonuç ve Sistem Durumu

Bu doküman (`v-18`), Agent Farm'ın geliştirilmeye başlandığı ilk günden bugüne kadar üretilmiş tüm mekanizmaları, kullanıcı kararlarını, teknik invaryantları ve hata kurtarma yollarını kapsayan **tek ve nihai operasyonel doğruluk kaynağıdır (Single Source of Truth).**
