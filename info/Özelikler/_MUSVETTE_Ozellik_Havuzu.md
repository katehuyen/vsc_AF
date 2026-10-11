# 📝 _MUSVETTE — Agent Farm Derin Özellik ve Yetenek Havuzu

Bu dosya; acele etmeden, menülerden, arayüz panellerinden, kod alt sistemlerinden ve ayarlardan keşfedilen **tüm gözden kaçmış, derin ve kritik özellikleri posta posta topladığımız çalışma havuzudur.**

Buradaki maddeler olgunlaştıkça ve zenginleştikçe ana envanter ve tanıtım dosyalarına aktarılacaktır.

---

## 🎬 1. Multimedya & Stüdyo Üretim Boru Hattı (Studio Pipeline & Asset Engine)
> **Kod Dosyaları:** `src/panels/studioPanel.ts`, `src/core/studioBridge.ts`, `src/core/production.ts`, `src/core/premiere.ts`, `src/core/media.ts`, `src/panels/studioBrand.ts`

Agent Farm sadece bir kod yazma aracı değildir; tam teşekküllü bir **multimedya içerik ve prodüksiyon stüdyosudur**.

* **5 Aşamalı İçerik Hattı (Production Pipeline):**
  - `Pipeline` (Sahne yönetimi) $\rightarrow$ `Assets` (Varlık havuzu) $\rightarrow$ `Triage` (Seçim/Ayıklama) $\rightarrow$ `Assemble` (Kurgulama) $\rightarrow$ `Sources` (Kaynak yönetimi).
* **Sahne Matrisi ve Prodüksiyon Dosyası (`PRODUCTION_FILENAME` / `sceneMatrix`):**
  - Bir video/içerik projesinin sahnelerini durumlarına göre (`SCENE_STATUSES`: taslak, üretimde, onaylandı, hazır) matris halinde yönetir.
* **Adobe Premiere / Zaman Çizelgesi Dışa Aktarımı (`sequenceExport.ts` / `premiere.ts`):**
  - Ajanların ürettiği görsel ve ses varlıklarını doğrudan Adobe Premiere veya NLE video kurgu zaman çizelgesi formatında (`writeSequence`) dışa aktarır.
* **Yapay Zeka Medya Sağlayıcıları & Bütçe Yönetimi:**
  - Fal.ai, Replicate gibi görsel/video üretim modellerini doğrudan bağlama; aylık medya bütçesi (`mediaBudget`) ile maliyet kontrolü.
* **İzlenen Klasörler (Ingest Folders) & Galeri Duvarı (`WallReader`):**
  - Belirli klasörleri dinleyip yeni üretilen medya varlıklarını otomatik olarak Galeri Duvarı'na çeker ve ajan geri bildirimi ile eşler (`injectMediaFeedback`).
* **Marka Kitleri ve Önayar Kütüphanesi (`studioBrand.ts` / `FlexPresets`):**
  - Marka renkleri, tipografi, görsel stil rehberleri ajanların görsel üretimlerinde hazır şablon olarak kullanılır.

---

## ⏱️ 2. Canlı Zaman Çizelgesi, Derin Tur & Araç Navigasyonu (Timeline & Turn Navigation)
> **Kod Dosyaları:** `src/panels/timeline.ts`, `src/panels/turnsPanel.ts`, `src/panels/sessionViewer.ts`

Binlerce oturum ve milyonlarca token arasında kaybolmayı engelleyen cerrahi gezinme sistemi.

* **Canlı Zaman Çizelgesi (Live Timeline):**
  - Hangi oturumun hangi süreçte (canlı PID, konsol kartı, arka plan görevi) çalıştığını, anlık token/dolar harcamasını tek bakışta gösterir.
* **Nokta Atışı Tur & Araç Gezgini (Turn & Tool-Call Jumper):**
  - Sadece oturuma değil; oturumun içindeki **belirli bir tura, ajanın spesifik bir düşünce bloğuna (thinking) veya çağırdığı tek bir dosya/terminal aracına** anında zıplama ve inceleme imkanı.
* **Sıkışma & Sessizlik Radarı (`stuckThresholdMinutes`):**
  - Bir ajan komut beklerken, döngüye girdiğinde veya uzun süre sessiz kaldığında zaman çizelgesinde otomatik "Stuck / Sessiz" rozeti yakar.
* **Oturum Bazlı "Sıra Sende" Uyarıları (`SessionAlertPrefs` / `YOUR TURN`):**
  - Ajan insan girdisi beklediğinde pencere/sekme fark etmeksizin odak uyarısı verir.

---

## 🔊 3. Sesli Yönetim, Sesli İkazlar & Ajan Ses Tonları (Sound & Voice Management)
> **Kod Dosyaları:** `src/panels/soundPanel.ts`, `src/panels/soundModel.ts`, `src/core/soundAgents.ts`, `src/core/alertVoices.ts`

Gözünüz ekranda değilken bile ajanın ne yaptığını kulakla takip etmenizi sağlayan işitsel arayüz.

* **Bağımsız Ses Paneli (`sound.js` / `SoundPanel`):**
  - Ses seviyesi, susturma anahtarları ve olay eşleştirmelerini tek bir özel sayfadan yönetme.
* **Olay Bazlı Dinamik Ses Efektleri:**
  - Oturum tamamlandı (`♪ Done`), İnsan müdahalesi gerekiyor (`♪ Ask/Question`), Baton devredildi (`♪ Handover`), Hata oluştu (`♪ Error`).
* **Ajan Başına Özel Ses Tonu ve Seslendirme (`alerts.voice.set scope=agent`):**
  - Farklı ajanlara (örneğin Developer ajanı, Mimar ajanı, Psikolog ajanı) farklı ses tonları/karakterleri atayabilme; kimin konuştuğunu bakmadan anlama.
* **Ekran Dışı / Arka Plan Rehberliği:**
  - Başka bir pencerede çalışırken veya masadan uzaktayken ajanın kritik aşamalarını sesli duyurularla bildirme.

---

## 👤 4. Çoklu Hesap, Slot & Kimlik İdaresi (Multi-Account Slots Engine)
> **Kod Dosyaları:** `src/panels/accountsPanel.ts`, `src/panels/accountsMessages.ts`, `src/core/accountSlots.ts`

Aynı sağlayıcı üzerinde birden fazla hesap veya kota havuzunu yönetme altyapısı.

* **Hesap Yuvaları (Account Slots - `claude-*`):**
  - Birden fazla Anthropic/Google/OpenAI hesabını izole yuvalarda tutma.
* **Kalıcı Slot Sözleşmesi (`accounts.complete` / `accounts.portable`):**
  - Bir hesaba ait yetkiler, tokenlar ve ayarlar taşınabilir şekilde yönetilir; bir hesabın kotası bittiğinde diğer yuvaya geçiş imkanı.
* **Hesap Başına Fatura & Kota Ayrımı (`accountFor`):**
  - Hangi projenin veya oturumun hangi hesabı tükettiğinin faturasal ayrımı.

---

## 📬 5. Asenkron Mesajlaşma & Bildirimlerin İşe Dönüşmesi (Notices $\rightarrow$ Queue Pipeline)
> **Kod Dosyaları:** `src/panels/noticesPanel.ts`, `src/panels/queuePanel.ts`, `src/core/notices.ts`, `src/core/workqueue.ts`

İnsanın zamanını çalmayan, asenkron ve akıllı çift yönlü iletişim köprüsü.

* **Notices Panosu (Ajan $\rightarrow$ İnsan):**
  - Ajan acil olmayan soruları, mimari tercihleri veya raporları Notices panosuna kart olarak bırakır.
* **Otomatik Göreve Dönüşme (Answer $\rightarrow$ Queue Promotion):**
  - İnsan bir soruya cevap verdiğinde, bu cevap havada kalmaz; otomatik olarak iş kuyruğuna (`queue.*`) **yeni bir yürütülebilir görev** olarak eklenir ve sırası geldiğinde ajan tarafından icra edilir.
* **Zaman Aşımı ve Varsayılan Karar:**
  - Kartın zaman aşımı süresi dolduğunda tanımlanan varsayılan cevap uygulanır; ajan kilitlenip beklemez.

---

## 📋 6. Projeler, Backlog, Plan & Yaşayan İş Akışları (Ölümsüz Döngülerin Yakıtı)
> **Kod Dosyaları:** `src/panels/projectsPanel.ts`, `src/core/workflowLive.ts`, `src/core/workflowMission.ts`, `src/core/workqueue.ts`

Baton Relay ve ölümsüz döngülerin üzerinde koştuğu asıl **gerçek dünya zeminidir**.

* **Backlog ve Plan Çarkı (`Plan.md` / `Backlog.md`):**
  - Ajanlar işleri kafadan uydurmaz; projenin Backlog listesindeki kodları (`projects.backlog.next`) tek tek sırayla çeker, yapar, test eder ve kapatır (`.check`).
* **Ölümsüz Maratonun Yakıtı:**
  - 10 bacaklık bir bayrak yarışında 1. ajan Backlog'un 1-3. maddelerini bitirip devreder; 2. ajan 4. maddeden devralır. Backlog olmasa bayrak yarışı amaçsız kalır.
* **İş Akışı Zincirleri (Workflow Ask & Wake):**
  - Çok adımlı iş akışları birbirine bağlanır; bir adım bittiğinde sıradaki iş akışı otomatik uyandırılır (`workflowWake`).

---

## 🧰 7. Alet Çantası (Toolbox), Web Arama & Canlı Tarayıcı Kokpiti
> **Kod Dosyaları:** `src/panels/toolboxPanel.ts`, `src/panels/toolboxWeb.ts`, `src/panels/toolboxRemote.ts`, `src/core/websnapshot.ts`

* **Web Sayfası Anlık Görüntüleme & Ayrıştırma (`websnapshot.ts`):**
  - Ajanların araştırma yaparken web sayfalarının DOM ve ekran görüntüsü üzerinden anlamsal veri çekmesi.
* **Uzak Alet Çağrıları (`toolboxRemote.ts`):**
  - Farklı bir makinedeki aracı (örneğin GPU sunucusundaki bir scripti) yerel ajanın çağırmasını sağlayan köprü.

---

## 🧪 8. Değerlendirme (Evals) & Yaşayan Sistem Radarı (Living Panel)
> **Kod Dosyaları:** `src/panels/evalsPanel.ts`, `src/panels/livingPanel.ts`

* **Ajan Performans & Eval Paneli (`evalsPanel.ts`):**
  - Ajanların promptlara verdiği yanıtların doğruluğunu, test geçme oranlarını ve regresyonları benchmark testleriyle ölçme.
* **Yaşayan Sistem Paneli (`livingPanel.ts`):**
  - Tüm ajanların, hafıza düğümlerinin ve çalışan süreçlerin canlı bir organizma gibi durumunu haritalayan izleme ekranı.

---

## 🧠 9. Obsidian Yaşayan Bilgi Omurgası (Obsidian Vault as Living Spine)
> **Kod Dosyaları:** `src/core/vaultDiscovery.ts`, `src/panels/openDoc.ts`, `src/core/wiki.ts`

Agent Farm, hafızasını ve sistem kurallarını izole bir veritabanına gömmez; doğrudan **Obsidian Vault (`00_AGENT_AREA`, `99_SYSTEM`, `10_PROJECTS`)** ile canlı bir simbiyoz halinde çalışır.

* **İki Taraflı Tek Gerçek Kaynak (Single Source of Truth):**
  - İnsan tarafı (Obsidian notları, kararlar, LifeOS) ile Ajan tarafı (`AGENTS.md`, `_REF/`, `memory/`) paralel yaşar.
  - Kullanıcı yeni bir kural, tercih veya format belirlediğinde ajan bunu sormadan Obsidian'daki doğru klasöre ve kendi hafızasına işler.
* **Otomatik Karar ve Rapor Köprüsü (`10_REPORT` $\rightarrow$ Notices):**
  - Ajan Obsidian içine bir rapor veya karar yazdığında, sistem bunu otomatik olarak Notices panosuna bir bildirim kartı olarak bağlar. Rapor yazılıp havada kalmaz.
* **Sıfır Çürüme (Zero Rot):**
  - Sistem dokümantasyonu asla eskimaz; ajanlar her yapısal değişiklikte Obsidian'daki insan dokümanlarını da unprompted (kendiliğinden) günceller.

---

## 🌾 10. Ajan Çiftliği ve Gelişim Döngüsü (The Farm & Evolutionary Lifecycle)
> **Kod Dosyaları:** `src/core/agents.ts`, `src/core/duties.ts`, `src/core/crossEngine.ts`

Ürünün adının **"Agent Farm" (Ajan Çiftliği)** olmasının asıl sebebi: Ajanların tek kullanımlık chat pencereleri değil, **çiftlikte yaşayan, öğrenen ve optimize olan uzmanlar** olmasıdır.

* **İzole Ajan Yuvaları (`ajanlar/<agent_name>/`):**
  - Her ajanın kendine ait bir `AGENTS.md` kimliği, `DUTIES.md` izleme hedefleri ve biriken bir `memory/` hafızası vardır.
* **Ajanlar Arası Anayasa Senkronizasyonu (Sync Agent across Engines):**
  - "Sync Agent with Antigravity / Claude" özelliği sayesinde bir ajanın anayasasında yapılan bir iyileştirme, çiftlikteki diğer motorlara ve alt ajanlara anında dağıtılır.
* **Görev Sağlığı ve Nöbet Denetimi (`DUTIES.md` Audit):**
  - Her ajanın `[every-turn]` ve `[session-start]` görevleri Agent Farm tarafından taranır ve nöbetlerin aksamadan yapıldığı denetlenir.

---

## 🧩 11. Yetenekler & MCP Sunucu Matrisi (Capabilities & MCP Matrix)
> **Kod Dosyaları:** `src/panels/capabilities.ts`, `src/core/mcp.ts`, `src/core/skills.ts`

* **İki Boyutlu Etkileşimli Matris:**
  - `Skills × Agents` ve `MCP Servers × Agents` çapraz tablosunda hangi ajanın hangi araçlara (MCP) ve becerilere sahip olduğunu tek bakışta görme.
* **30 Günlük Gerçek Kullanım Analitiği:**
  - Hangi araç gerçekten çağrılmış (`calls`), en son ne zaman kullanılmış (`lastTs`), hangileri sisteme yük olan "ölü ağırlık" (`dead weight`) tespit edilir.
* **Tek Tıkla Yetenek Dağıtımı (Actionable Cells):**
  - Matristeki boş bir hücreye tıklandığında, o MCP sunucusu veya beceri anında o ajanın yetki alanına kopyalanır ve yetkilendirilir!

---

## ⚡ 12. Motor Teşhis, Canlı Test & Beyin Değişimi (Engines & Brain Hot-Swapping)
> **Kod Dosyaları:** `src/panels/enginesPanel.ts`, `src/core/engineTest.ts`, `src/core/providerHealth.ts`

* **Canlı Motor Sorgulama & Sağlık Raporu (`EnginesPanel`):**
  - Bu makinede hangi CLI motoru (Claude Code, Antigravity/Gemini, Codex, OpenCode) kurulu, lisansı/yetkisi geçerli mi, çalışıyor mu?
* **Tek Tıkla Gerçek Test Turu (`engineTest.ts`):**
  - Panele tıklandığında motora gerçek canlı bir tur atılır; yanıt süresi, ağ gecikmesi ve sağlığı anında ölçülür.
* **Terminallere Farklı Beyinler Takma (Brain Swapping):**
  - Bir CLI oturumunu kapatmadan veya yeni oturum açarken motor ve model katmanını anında değiştirme özgürlüğü.

---

## 🔍 13. 16 Paneli Birleştiren Evrensel Arama Dili (`afQuery`)
> **Kod Dosyaları:** `media/afQuery.js`, `src/panels/searchPanel.ts`, `src/core/textSearchCorpus.ts`

* **Gelişmiş Mantıksal Sorgu Dili:**
  - `AND`, `OR`, `NOT`, parantezler `( )`, tırnaklı tam kelime öbekleri `"tam kelime"` ve `*` jokerli aramalar.
* **16 Farklı Arama Kutusuna Bağlı Ortak Motor:**
  - Oturum arama, transkript arama, görev arama, log arama ve kütüphane arama kutularının tamamı aynı güçlü gramerle çalışır.

---

## 🕸️ 14. Görsel Hafıza Grafiği (Visual Memory Graph)
> **Kod Dosyaları:** `src/panels/memoryGraph.ts`, `src/core/memusage.ts`

* **İlişkisel Hafıza Haritası:**
  - Ajanların insan tercihleri, proje kararları ve teknik kurallar hakkındaki hafızasını izole metin dosyaları olarak değil; **birbiriyle ilişkili görsel bir node ağı** olarak sunar.
* **Hafıza Kullanım Radarı:**
  - Hangi hafıza dosyasının ne sıklıkla okunduğu ve hangilerinin güncelliğini yitirdiği görselleştirilir.

---

## 🎯 15. Sistemin Nabzı ve İhtiyaç Radarı (Now & Needs Panels)
> **Kod Dosyaları:** `src/panels/nowPanel.ts`, `src/panels/needsPanel.ts`

* **Şimdi Paneli (`NowPanel`):**
  - Sistemin tam o saniyede hangi ajanla, hangi projede, hangi görev üzerinde odaklandığını gösteren canlı odak göstergesi.
* **İhtiyaçlar Radarı (`NeedsPanel`):**
  - Projelerdeki eksik backlog maddelerini, açık soruları ve sistemdeki darboğazları anlık olarak toplayan radar.

---

## 🧰 16. Alet Kutusu & Tek Kapı Araç Üreticisi (Toolbox & Unified Tool Compose)
> **Kod Dosyaları:** `src/panels/toolboxPanel.ts`, `src/core/toolbox.ts`, `src/core/toolboxBridge.ts`

* **Merkezi Görsel Araç Bestecisi (`ToolCompose`):**
  - Tüm araç türleri (`skill`, `subagent`, `command`, `mcp`) için tek ve standart bir görsel form.
  - Yeni oluşturma (`new`), düzenleme (`edit`) veya ajanlar arasında kopyalama (`copy`) tek ekranda yapılır.
* **Canlı MCP Araç Sondajı (Live MCP Probe & Cache):**
  - Bir MCP sunucusunun gerçekten hangi araçları sunduğunu (`tools list`) arka planda canlı probe ederek keşfeder ve diskte önbelleğe alır (`loadProbeCache`).

---

## 🚪 17. Kapıcı (Gatekeeper) — Akıllı Karar ve Filtreleme Kapısı
> **Kod Dosyaları:** `_REF/kapici.md`, `src/core/kapici/`, `src/panels/toolboxPanel.ts`

Gereksiz yere pahalı LLM modellerini uyandırmadan, otomatik kararlar veren 3 kademeli akıllı bekçi.

* **3 Kademeli Eleme Mimarisi:**
  1. `Heuristic` (Yerel regex, tarih, satır, karakter kontrolleri — sıfır maliyet, anlık)
  2. `Jev` (Küçük ve hızlı sınıflandırıcı model)
  3. `LLM` (Büyük yargıç model — sadece gerçekten gerektiğinde)
* **4 Kritik Görev Alanı:**
  - **Gelen İşi Yönlendirme (`dispatch`):** İşi hangi ajanın alacağına karar verme.
  - **Tekrar Deneme (`retry`):** Başarısız görevin tekrar denenip denenmeyeceğine karar verme.
  - **Tetikleyici Önkoşulu (`trigger`):** Bir otomasyonun çalışması için gereken şartları denetleme.
  - **İş Akışı Adımı (`workflow`):** Akıştaki kararları onaylama veya reddetme.
* **Gölge Modu (`shadow`):**
  - Kapıcı'nın kararları canlıya alınmadan önce arka planda sessizce test edilir ve doğruluk oranı (`kapici.audit`) ölçülür.

---

## 🔌 18. Live Hooks Kokpiti ve Port Çakışma Bekçisi
> **Kod Dosyaları:** `src/core/hooksCockpit.ts`, `src/panels/toolboxPanel.ts`

VS Code ile arka planda çalışan CLI oturumları (Claude Code, Codex vb.) arasındaki canlı veri hattının bekçisi.

* **Canlı Dinleyici Durumu (Listener Monitor):**
  - VS Code eklentisi ile oturumlar arasındaki soket hattını gerçek zamanlı izler.
* **Port Çakışma Radarı (`port-in-use` / `PortHolder`):**
  - Dinleyici portu kilitlendiğinde, hangi harici sürecin (PID) portu tuttuğunu anında bulur.
* **Tek Tıkla Port Temizleme ve Yeniden Başlatma (`clearPort` / `restart`):**
  - Kilitlenen portu tek tıkla temizler ve dinleyiciyi sıfırdan ayağa kaldırır.

---

## 📱 19. Mobil Eşleştirme ve Uzak Cihazlar Kokpiti (Remote Pairing)
> **Kod Dosyaları:** `src/panels/toolboxRemote.ts`, `src/core/remote/`

* **Cihaz Eşleştirme Köprüsü (Pairing Link & Addresses):**
  - Cep telefonundaki `and_AgentFarm` uygulamasını veya tarayıcıyı, oluşturulan geçici güvenli eşleştirme linki/QR ile yerel Agent Farm'a bağlama.
* **Çoklu Cihaz Listesi:**
  - Eşleşmiş telefon ve tabletleri panel üzerinden izleme ve yetkilerini yönetme.

---

## 🛡️ 20. Sentry (Nöbetçi) — Gece Vardiyası ve İnsansız Kampanya Motoru
> **Kod Dosyaları:** `src/core/sentry.ts`, `src/core/settingsops.ts` (`sentry*` ayarları)

Kullanıcı uyurken veya bilgisayar başından uzaktayken devasa hedefleri aşama aşama yürüten **otonom gece vardiyası lideri**.

* **Lider Ajan Tasması (Leader Budget & Leash):**
  - Nöbetçi lidere özel motor (`sentryLeaderEngine`), model (`sentryLeaderModel`) ve sert bütçe (`sentryLeaderBudgetUsd` / `sentryLeaderMaxSeconds`).
* **Hata Tavanı & Durma Koruması (`sentryLeaderFailLimit` / `sentryFailureLimit`):**
  - Arka arkaya belirli sayıda hata alındığında döngüyü zorlamayıp sistemi güvenli parka (`parked`) alma.
* **Boşta Kalma & Tıkanma Radarı (`sentryIdlePollMin` / `sentryStallMin`):**
  - İlerleme durduğunda nöbetçiyi yeniden uyandırıp yeni görev paketi açma.

---

## 📉 21. Maliyet Anomali Dedektörü & Otomatik Model Düşürme (Auto-Downgrade)
> **Kod Dosyaları:** `src/core/pricing.ts`, `src/core/usageGate.ts`, `src/core/settingsops.ts`

* **Maliyet Anomali Radarı (`costAnomalyMinUsd` / `trendAlertFactor`):**
  - Beklenmedik token fırlamalarını, anormal harcama trendlerini anında tespit edip kullanıcıya fren uyarısı verir.
* **Kota Koruma Freni & Otomatik Model Düşürme (`quotaDowngradePercent` / `quotaDowngradeModel`):**
  - Kotanın belirli bir yüzdesine (%80-90) ulaşıldığında işi durdurup iptal etmek yerine; modeli otomatik olarak daha hafif ve ucuz bir modele (örn: Sonnet $\rightarrow$ Haiku) düşürerek görevi tamamlar.
* **Ağırlıklı Kota Hesaplama Modu (`quotaWeights` / `quotaWeightMode`):**
  - Farklı modellerin farklı token çarpanlarını adil bir bütçe havuzunda dengeler.

---

## ⚖️ 22. Yargıç Merdiveni & Çıktı Karşılaştırma (Judge Ladder & Eval)
> **Kod Dosyaları:** `src/core/judge.ts`, `src/core/settingsops.ts`

* **Yargıç Modeli (LLM Judge):**
  - Ajanların ürettiği kod, doküman veya raporların tarafsız bir yargıç model (`judgeArgs`) tarafından kalite ve kabul kriterlerine göre otomatik puanlanması.
* **Yargıç Merdiveni (`judgeLadder`):**
  - Basit işleri hafif yargıçla, kritik mimari işleri büyük yargıç modellerle basamaklı değerlendirme.
* **A/B Karşılaştırma (`judgeCompare`):**
  - Farklı ajanların veya modellerin aynı göreve ürettiği alternatif çözümleri yan yana kıyaslama.

---

## 🤖 23. Konsol Otomatik Cevaplama & Zaman Aşımı (Console Auto-Answer)
> **Kod Dosyaları:** `src/core/consoleAutoAnswer.ts`, `src/core/settingsops.ts`

* **İnsansız Oturum Kurtarma:**
  - Konsolda çalışan ajan bir soru sorduğunda, eğer insan başında değilse `console.autoAnswer.timeoutSeconds` süresi dolunca tanımlı filtre kurallarına (`console.autoAnswer.filter`) göre otomatik varsayılan yanıtı seçerek akışın kilitlenmesini engeller.

---

## 🧬 24. Semantik Arama & Vektörel Hafıza (Embeddings & Semantic Corpus)
> **Kod Dosyaları:** `src/core/embeddings.ts`, `src/panels/searchPanel.ts`

* **Vektör Gömme Motoru (Embeddings):**
  - Geçmiş yüzlerce oturum ve binlerce transkript içinde sadece kelime eşleşmesiyle değil; **anlamsal / kavramsal benzerlikle (semantic search)** arama yapabilme (`embeddingsModel`, `semanticMaxSessions`).

---

## 📤 25. Medya Zenginleştirme, İçerik Takvimi & Yayın Onayı (Publish Pipeline)
> **Kod Dosyaları:** `src/panels/studioPanel.ts`, `src/core/settingsops.ts`

* **İçerik Takvimi Entegrasyonu (`contentCalendarDir`):**
  - Üretilen içeriklerin otomatik olarak yayın takvimine işlenmesi.
* **Çoklu Platform Yayın Onayı (`publishApproval` / `publishPlatforms`):**
  - Ajanların ürettiği içeriklerin insan onayı süzgecinden geçtikten sonra hedef platformlara yönlendirilmesi.
* **Kütüphane Zenginleştirme (`libraryEnrichModel` / `libraryEnrichVideoModel`):**
  - Üretilen ham görsellerin ve videoların yapay zeka modelleriyle otomatik etiketlenmesi, açıklanması ve kategorize edilmesi.

---

## 📦 26. Ajan Karalama Alanı (Work Area) & Kalıp Parçacıklar (Prompt Snippets)
> **Kod Dosyaları:** `src/core/workArea.ts`, `src/core/prompts.ts`

* **Ajan Scratch Karalama Alanı (`workArea`):**
  - Ajanların geçici test dosyalarını, tek seferlik betiklerini ve ara çıktılarını ana proje repolarını kirletmeden güvenle çalıştırabileceği ortak kum havuzu.
* **Kalıp Prompt Parçacıkları (`promptSnippetsFile`):**
  - Konsolda tek tıkla çağrılabilen, sık kullanılan prompt kalıpları ve sistem yönergeleri.

---

## 📊 27. Görev Analitiği & Gelecek Tahmin Motoru (Task Analytics & Forecast)
> **Kod Dosyaları:** `src/panels/taskAnalyticsPanel.ts`, `src/core/taskstats.ts`, `src/core/forecast.ts`, `src/core/accountSpend.ts`

Agent Farm sadece görevleri çalıştırmaz; geçmiş 30 günün istatistiklerini işleyerek **filonun gelecekteki davranışını ve maliyetini tahmin eder**.

* **Gelecek Görev Tahmin Motoru (`forecast.ts`):**
  - "Sırada hangi görev çalışacak, yaklaşık kaç dakika sürecek ve başarı olasılığı nedir?" sorusunu geçmiş medyan süreler (`medianMs`) ve başarı oranları (`successRate`) ile hesaplar.
* **Görev Aileleri ve Kronik Hata Tespiti (`TaskFamily` & `alwaysFails`):**
  - Benzer görevleri otomatik olarak aileler halinde gruplar; her denendiğinde başarısız olan veya takılan kronik görevleri (`alwaysFails`) tespit edip uyarır.
* **Ajan Performans Skor Kartları (Per-Agent Scorecards):**
  - Her ajanın 30 günlük tamamlanan (`done`), başarısız (`failed`), iptal edilen (`cancelled`), tekrar denenen (`retries`) görev sayıları ve ortalama bitirme süreleri ile başarı karnesi.
* **Hesap Başına 30 Günlük Harcama Analizi (`AccountSpendReport`):**
  - Hangi sağlayıcı hesabının ve girişinin (Google vs Anthropic) daha ekonomik veya daha pahalı olduğunu geçmişe dönük net harcama eğrileriyle ortaya koyma.
* **Tetikleyici ve Görev Sağlık Alarmları (`taskAlerts` / `triggerAlerts`):**
  - Görev sürelerinde veya tetikleyici döngülerinde olağandışı sapmalar olduğunda otomatik üretilen sağlık alarmları.
* **Tek Tıkla Markdown Rapor Dışa Aktarımı:**
  - Tüm analitik verilerini tek tıkla Obsidian ve raporlar için temiz Markdown tablolarına (`markdownTable`) dönüştürme.

---

## 🖱️ 28. "Sağ Tık Her Yerde" (Omnipresent Context Menus)
> **Kod Dosyaları:** `src/extension.ts`, `docs/SAG-TIK-MENULERI.tr.md`, `BLUEPRINT.tr.md` (§Sağ Tık)

Kullanıcının IDE içinde nerede olursa olsun klavye ve fare akışını bozmadan ajana bağlanmasını sağlayan zengin bağlam menüleri.

* **Editör İçi Sağ Tık:** Seçili kodu anında ajana gönderme, "Bu fonksiyonu açıkla / test yaz / refactor et", anında odak paneline aktarma.
* **Dosya Gezgini Sağ Tık:** "Bu klasörü ajan kökü yap", "Bu dosyayı Wiki adayı yap", "Bu projede oturum aç".
* **Oturum & Tur Satırları Sağ Tık:** "Tur çıktısını panoya kopyala", "Bunu A2A notu yap", "Buradan yeni oturum çatalla (fork/branch)", "Transkripti indir".
* **Ajan Ağacı Sağ Tık:** "Ajan anayasasını aç", "Görevlerini denetle", "Modelini değiştir", "Konsolu bu ajan için aç".

---

## 🧭 29. Doğal Dil Komuta & Akıllı İş Dağıtıcı (Natural Language Dispatcher)
> **Kod Dosyaları:** `src/core/dispatcher.ts`, `BLUEPRINT.tr.md` (§Dispatcher)

* **Serbest Metin İş Yönlendirme:**
  - Kullanıcının sadece *"TalkScribe projesinde mikrofon izin hatasını çöz"* yazması yeterlidir.
  - Dispatcher talebin semantiğini çözerek: Doğru ajanı (`developer`), doğru çalışma dizinini (`muvu_talkScribe`), uygun modeli ve yetki modunu otomatik belirleyip işi başlatır.

---

## 🪝 30. Webhook Köprüsü & Dış Olay Dinleyicisi (Webhook Ingest Bridge)
> **Kod Dosyaları:** `src/core/webserver.ts`, `BLUEPRINT.tr.md` (§Webhook Köprüsü)

* **Dış Dünya Olaylarını Filoya Bağlama:**
  - GitHub commit/push olayları, CI/CD pipeline hataları, sunucu alarmları veya harici SaaS webhook'ları Agent Farm'ın yerel portuna gelir.
  - Gelen webhook payload'ı anında bir A2A görevine veya acil durum ajan oturumuna dönüştürülerek otonom müdahale başlatılır.

---

## 🌐 31. Tarayıcı Otomasyon Adımları & Sandbox Gezintisi (Browser Steps)
> **Kod Dosyaları:** `src/core/browser.ts`, `_REF/web.md`, `BLUEPRINT.tr.md` (§Tarayıcı Adımları)

* **Güvenli Web Etkileşimi:**
  - Ajanların harici web sitelerinde form doldurma, test çalıştırma, dokümantasyon çekme ve ekran görüntüsü alma süreçlerini izole Playwright/headless tarayıcı katmanında yürütmesi.

---

## 📑 32. Airtable Engine & Çift Yönlü Veri Senkronizasyonu
> **Kod Dosyaları:** `src/panels/airtablePanel.ts`, `src/core/airtable.ts`, `BLUEPRINT.tr.md` (§Airtable Engine)

* **No-Code Tablolarla Ajan Filosu Entegrasyonu:**
  - Airtable'daki proje, görev veya içerik kayıtlarının ajanlar tarafından otomatik okunması; üretilen sonuçların ve medya linklerinin Airtable tablosuna geri yazılması.

---

## ⚡ 33. Ön-Isınmış Yedek Oturum Yuvaları (Spare / Pre-Warmed Sessions)
> **Kod Dosyaları:** `src/core/spareSessions.ts`, `BLUEPRINT.tr.md` (§spare-oturumlar)

* **Sıfır Başlatma Gecikmesi:**
  - Hızlı müdahale gerektiren anlar için arka planda motoru ve temel anayasası hazır bekletilen "yedek" (spare) yuvalar; kullanıcı komutu verdiği anda başlatma gecikmesi olmadan anında yanıt üretir.

---

## 📚 34. LLM Wiki — Oturumlardan Damıtılan Yaşayan Bilgi Tabanı (`00_WIKI`)
> **Kod Dosyaları:** `src/core/wiki.ts`, `src/panels/wikiPanel.ts`, `src/core/wikiCategory.ts`, `_REF/wiki.md`

Agent Farm'ın en özgün felsefelerinden biri: **"Obsidian IDE'dir, LLM programcıdır, Wiki ise üretilen kod tabanıdır."** Kullanıcı Wiki makalelerini elle yazmaz; ajanlar konuşmalardan ve araştırmalardan süzülen bilgileri otomatik derler.

* **3 Katmanlı Bilgi Mimarisi:**
  1. `RAW` (Değiştirilemez ham transkriptler, turlar ve dışarıdan bırakılan dosyalar).
  2. `WIKI` (`00_WIKI/<Kategori>/<Kavram>.md` — Ajanların sentezlediği tek gerçek kaynak).
  3. `SCHEMA` (`-WIKI-ANAYASA-.md` — İnsanın belirlediği değişmez derleme kuralları).
* **Aday Havuzu & Cerrahi Tur İşaretleme (`wiki.candidates.*`):**
  - Tüm oturumu değil; sadece en değerli turları (örn: `turn: "3-7"`) veya belirli adımları hariç tutarak (`excludeTurns: [14, 15]`) tek tıkla Wiki Adayı olarak işaretleme.
* **Sihirli Bırakma Kutusu (`_RAW_/` Drop Box):**
  - ChatGPT, Claude Web veya tarayıcıdan kaydedilen herhangi bir `.txt` / `.md` dosyasını `_RAW_/` klasörüne atmak, **hiçbir komut çalıştırmadan onu kendiliğinden bir Wiki Adayı yapar!** Derlenen dosyalar otomatik olarak `_RAW_/_DONE_/` arşivine kaldırılır.
* **Otomasyonlu Headless Derleme Motoru (`wiki.compile.run`):**
  - İnsanı meşgul etmeden, arka planda özel bir Wiki Ajanı (`wikiAgent` / `wikiModel`) çalışarak:
    1. Aday turlardaki teknik kararları okur.
    2. Mevcut `index.md` fihristini ve kavram sayfalarını inceler.
    3. Sayfayı günceller veya atomik yeni bir kavram sayfası açar (`[[Kavram_Adi]]`).
    4. `00_WIKI/log.md` günlüğüne tarihli derleme kaydını işler.
* **Tarihli Çelişki ve Geçersiz Kılma Yönetimi (Superseding):**
  - Yeni bir teknik karar eskisini yalanladığında eski metin asla sessizce silinmez. Tarihli bir blokla (`> **[Tarih Güncellemesi]:** Eski karar X yerine artık Y geçerlidir`) evrimsel tarih korunur.
* **Otomatik Wiki Sağlık ve Bağlantı Denetimi (`wiki.lint`):**
  - Yetim kalmış (hiçbir sayfanın link vermediği), kırık bağlantı içeren (`[[Olmayan_Sayfa]]`) veya fihristte unutulan sayfaları tarayan linter.
* **Güvenli Kategori Birleştirme & Taşıma (`wiki.category.rename`):**
  - Kategori adı değiştiğinde; klasör, `index.md` başlıkları ve aday havuzundaki tüm etiketler 3 yerde birden atomik olarak taşınır ve birleştirilir.
* **Çökme ve Kilit Koruması (Crash-Proof Pipeline):**
  - Derleme sırasında ajan çökerse veya kota biterse turlar asla kilitli kalmaz; kilit serbest bırakılır, `lastError` kaydedilir ve aday güvenle havuza döner.

---

## 🏗️ 35. Projeler, Yaşayan Belgeler ve İş Takip Ekosistemi (`10_PROJECTS`)
> **Kod Dosyaları:** `src/panels/projectsPanel.ts`, `src/panels/portfolioPanel.ts`, `src/core/projects.ts`, `src/core/projectContext.ts`, `_REF/project-session.md`

Agent Farm'ın en olgun omurgalarından biri: Projelerin sadece bir klasör değil; **kendi anayasası, backlog'u, deneme geçmişi ve yaşayan belgeleri olan otonom bir ekosistem** olmasıdır.

* **Dinamik Proje Bağlamı Enjeksiyonu (Zero-Token Context Injection):**
  - Bir oturum açıldığında `=== AGENT FARM PROJECT CONTEXT ===` bloğu otomatik üretilir ve ajanın önüne gelir.
  - Ajan proje klasöründeki dosyaları tek tek açıp binlerce token yakarak "oryantasyon" aramak zorunda kalmaz; projenin kapsamı, anti-kapsamı, kod kökleri ve mimari kapıları anında sistem promptuna enjekte edilir.
* **6 Temel Rol Belgesi Mimarisi:**
  1. `Charter.md` (`af-role: charter` — Kapsam, Anti-Kapsam, Mimari İnvariantlar, Doğrulama Kapısı).
  2. `Plan.md` (`af-role: plan` — Faz bazlı yol haritası).
  3. `Backlog.md` (`af-role: backlog` — Alanlara bölünmüş kodlu iş yığını: `P-5`, `U-12`, `K-3`).
  4. `Backloglog.md` (`af-role: backloglog` — Her işin tüm dokunuşları, deneme notları ve kapanış gerekçesi).
  5. `People.md` (`af-role: people` — Paydaşlar, roller ve sorumluluklar).
  6. `Worklog.md` (`af-role: log` — Her oturumun kronolojik aksiyon günlüğü).
* **Deneme Geçmişi ve Dokunuş Takibi (`projects.track` & `projects.tracks`):**
  - Bir ajan kodlu bir işe dokunup bitiremediğinde (`touch`): *"Baktım, kök neden X dosyasındaydı ama vaktim yetmedi"* notunu kalıcı olarak `Backloglog.md`'ye işler.
  - 3 ay sonra gelen yeni bir ajan `projects.tracks { code: "U-12" }` dediğinde, o iş üzerinde daha önce kimin ne denediğini, nerede tıkandığını anında öğrenir; **tekerleği asla yeniden icat etmez**.
* **Soğuk Başlangıç Devir Mektubu (`projects.handover`):**
  - Bir projeyi devrederken veya yeni bir projeyi devralırken; belgelerin nerede olduğunu, nelerin açık kaldığını, kimin neyle savaştığını özetleyen otomatik **Soğuk Başlangıç Mektubu**.
* **Akıllı Backlog Dağıtıcısı (`projects.backlog.next`):**
  - Rastgele iş seçmez; engellenmiş (⛔ `blockedBy`) maddeleri eler, aşırı büyük (XL) işleri bölmeden almaz, efor ve öncelik matrisine göre en ideal sıradaki işi ajanın önüne sunar.
* **Ebeveyn-Çocuk Görev Hiyerarşisi (`parent: "<code>"`):**
  - Büyük bir maddeyi alt görevlere (`P-5.1`, `P-5.2`) bölme; son alt parça kapandığında ana ebeveyn görevi otomatik kapatma mantığı.
* **Köken Etiketi Ayrımı (`#byAI` vs `#byREQ`):**
  - Bir işi ajan kendisi mi keşfetti (`#byAI`), yoksa kullanıcı mı istedi (`#byREQ`) ayrımı.
* **Kararlar ve Teslimatlar Kütüğü (`20_Decisions/` & `30_Deliverables/`):**
  - İleride *"Bu mimari neden böyle kuruldu?"* denebilecek her karar `projects.decision.add` ile tarihli gerekçesiyle arşivlenir.
  - Üretilen her sürüm ve paket `projects.deliver` ile teslimat kütüğüne işlenir.
* **Genel Portföy Radarı (`portfolioPanel.ts`):**
  - Tüm projelerin faz ilerlemelerini, açık backlog sayılarını ve son etkinlik tarihlerini tek bir yönetimsel gösterge panelinde görme.

---

## 🎨 36. Dinamik Konsol Renk Durumları ve Canlı Görsel Göstergeler
> **Kod Dosyaları:** `src/panels/consolePanel.ts`, `media/console.js`, `src/core/turnRuntime.ts`

Konsol kartları statik kutular değildir; ajanın o saniyedeki zihinsel ve teknik durumuna göre **canlı renk ve animasyon durumlarına (State Cues)** bürünür.

* **Durum Bazlı Renk Dili:**
  - 🔵 **Mavi / Cyan (Thinking / Planning):** Ajanın düşünce zincirini (thought stream) ördüğü an.
  - 🟣 **Mor (Tool / Test Running):** Terminal komutu, test veya dosya işlemi çalıştırdığı an.
  - 🟡 **Sarı / Amber (Interactive Question / Waiting):** Ajanın insana soru sorduğu ve girdi beklediği an.
  - 🟢 **Yeşil (Verified / Done):** Testlerin başarıyla geçtiği ve görevin tamamlandığı an.
  - 🔴 **Kırmızı (Blocked / Error):** Hata alındığı veya bir engelle karşılaşıldığı an.
* **Tek Bakışta Filo Durumu:**
  - Kullanıcı ekrandaki 10 kartın sadece renklerine bakarak hangisinin düşündüğünü, hangisinin test koştuğunu ve hangisinin onay beklediğini 1 saniyede anlar.

---

## ⏳ 37. Geri Sayımlı Soru Modalı ve Otomatik Öneri Seçimi (Auto-Pick Countdown)
> **Kod Dosyaları:** `src/panels/panelAsk.ts`, `src/core/workflowAsk.ts`, `src/core/consoleAutoAnswer.ts`

Ajan insan kararına ihtiyaç duyduğunda akışı kilitlemeden yöneten interaktif soru motoru.

* **Canlı Geri Sayım Zamanlayıcısı (Countdown Timer):**
  - Soru kartı açıldığında belirlenen süre (örn: 60 sn) canlı olarak geri sayar.
* **İnsanın Zamanı Durdurabilmesi (Pause Timer):**
  - Kullanıcı soruyu derinlemesine düşünmek isterse tek tıkla sayacı durdurur (`Pause Timer`).
* **Önerilenden Otonom Devam Etme (`(Recommended)` Auto-Pick):**
  - Kullanıcı ekran başında değilse, süre bittiğinde sistem ajanın önerdiği en makul seçeneği `(Recommended)` otomatik olarak onaylayarak görevin kilitlenmesini engeller.

---

## 🧬 38. Beliren Ajan Taktikleri & Sıfır-Token Bekleme Deseni (Emergent Zero-Token Wait)
> **Kod Dosyaları:** `docs/MONITOR-ILE-ASENKRON-SORU-BEKLEME-PATTERNI.tr.md`, `src/core/waits.ts`

Agent Farm'ın temel yapı taşlarının esnekliği sayesinde ajanların kendi kendine keşfettiği ileri düzey orkestrasyon örneği.

* **Sıfır-Token ile İnsan Bekleme Keşfi:**
  - Ajanın terminali kilitlemek yerine; soruyu `Notices` panosuna kart olarak bırakıp, yerel köprüyü dinleyen hafif bir izleyiciyle (`Monitor`) **sıfır token harcayarak uyku moduna geçmesi** ve insan yanıtladığında uyanması.
* **Sistemin Beliren Davranışı Disipline Etmesi:**
  - Bu tür beliren otonom taktiklerin sistem tarafından zaman aşımı (timeout) ve anayasal kurallarla güvenli çerçeveye oturtulması.

---

## 🐍 39. Ouroboros Döngüsü: Canlı Eklenti Yeniden Başlatma ve Oturum Diriltme (Live Revive)
> **Kod Dosyaları:** `src/core/consoleHost.ts`, `src/core/reviveIntent.ts`, `_REF/agentfarm-dev.md` (S-59 / X-266)

VS Code eklenti geliştirme dünyasında **eşine rastlanmamış, kendi kendini derleyip kesintisiz yeniden doğuran (Ouroboros)** canlı geliştirme protokolü.

* **Kendi Kendini Canlı Güncelleyen Ajan:**
  - Bir ajan `vsc_AgentFarm` kodunda yeni bir özellik yazar, testleri koşturur, `npm run package` ile VSIX paketini üretir ve `code --install-extension` ile sisteme kurar.
* **Oturumu Öldürmeyen Extension Host Yeniden Başlatması (`farm.restartExtensionHost resume=true`):**
  - Normalde VS Code eklentisi güncellendiğinde pencere yeniden yüklenir ve çalışan tüm AI oturumları ölür.
  - Agent Farm'da ise ajan `resume=true` ile eklenti host'unu yeniden başlatır; VS Code yeni sürümü belleğe yükler.
* **Koltuk Geri Kazanımı ve Dirilme Dürtmesi (`ConsoleHost.reclaim` & Revive Nudge):**
  - Yeni açılan host, ajanın çalışan oturumunu anında sahiplenir (`reclaim`).
  - Ajana son yazdığı doğrulama talimatını içeren bir "Dirilme Dürtmesi" (Revive Nudge) verilir.
  - Ajan, **yeni kurduğu sürümün üzerinde tam kaldığı yerden, hiçbir bağlam kaybetmeden uyanır** ve geliştirdiği özelliği canlı test etmeye devam eder!
* **İkiz Süreç ve Hayalet Koruması (`sessions.twins` / `sessions.leftovers`):**
  - Yeniden başlatma sırasında eski sürecin arkada askıda kalarak kaynak tüketmesini veya çift işlem yapmasını engelleyen süreç bekçisi.

---

## 💎 40. DENSITY Tasarım Sistemi, AFTip ve Yüksek Bilgi Yoğunluklu Kokpit
> **Kod Dosyaları:** `media/afTip.js`, `_REF/ui-conventions.md`, `_REF/ui-patterns.md`, `src/core/stepkind.ts`

Agent Farm'ın arayüzü süslü boşluklarla dolu oyuncak bir arayüz değil; **profesyonel bir uçak kokpiti gibi her pikselinde derin bilgi taşıyan DENSITY tasarım felsefesine** dayanır.

* **DENSITY İlkesi (Maksimum Bilgi, Minimum Alan, Sıfır Gereksiz Tıklama):**
  - Ekranda gereksiz devasa beyaz boşluklar veya içi boş kartlar yer almaz.
  - Kullanıcının merak ettiği tüm türetilmiş metrikler (anlık token tüketimi, 9 adım türü kırılımı, bağlam penceresi yüzdesi `% ctx`, 5 saatlik kota doluluğu, model adı, çalışma süresi) ekranda hazır bulunur.
* **AFTip — Zengin ve Ele Yol Veren Akıllı Hover Sistemi (`media/afTip.js`):**
  - HTML'in kesilen, kaydırılamayan ilkel `title` tooltip'leri yerine; zengin, biçimlendirilmiş, kaydırılabilir ve kopyalanabilir özel hover paneli.
  - **Ele Yol Verme İlkesi (Yields to the Hand):** Fareyle bir butona basıldığında veya klavyeden yazıldığında AFTip anında saydamlaşır ve kapanır; kullanıcının basmak istediği düğmenin üzerini asla kapatmaz.
* **SHORTHAND & MIRROR Kuralı:**
  - Tablo satırında kısa ve temiz rozet (`R3`, `P-5`, `%88 ctx`); üzerine gelindiğinde ise uzun tanım ve o saniyedeki canlı değer (`Mirror`).
* **9 Adım Türü Harcama Dökümü (`stepkind.ts`):**
  - Harcanan token ve maliyet tek bir kör sayı değildir; 9 farklı kategoriye (düşünce zinciri, dosya okuma, dosya yazma, terminal komutu, web araması, MCP çağrısı, prompt, sistem yönergesi, alt-ajan) ayrılarak cerrahi şeffaflık sağlar.
* **Görsel Doğrulama Kapısı (Visual Gate):**
  - Arayüze eklenen her piksel, headless Chrome ve Playwright ile hem açık hem koyu temada (ve mobil ekran boyutunda) fotoğraflanıp (`test/shoot_page.js`) ölçülmeden sisteme kabul edilmez.

---

## ⚡ 41. Superpowers: Diskte Uyuyan 14 Mühendislik Disiplini (Sleep on Disk)
> **Kod Dosyaları:** `src/core/superpowers.ts`, `docs/SUPERPOWERS-MIMARISI.tr.md`, `_SKILLS/superpowers/`

Agent Farm'ın ajanları acemi birer kod yazarı gibi değil; **Silikon Vadisi kıdemli mühendisi standartlarında TDD, Sistematik Hata Ayıklama ve Doğrulama disipliniyle** çalıştırır.

* **"Diskte Uyuyan Yetenekler" (Sleep-on-Disk) Mimarisi:**
  - 14 derin mühendislik disiplini (TDD, Kök Neden Hata Ayıklama, Atomik Planlama, Doğrulama, Kod İnceleme) her oturumda baştan prompta yüklenip token yakmaz.
  - Sisteme yalnızca ~2.5 KB'lık hafif bir Kök Kanca (Root Hook) fihristi verilir.
  - Ajan kod yazarken veya hata ararken **yalnızca ihtiyaç duyduğu disiplini diskten okur** ve o disipline girer.
* **Katı Mühendislik Kuralları:**
  - **Kök Neden Bulunmadan Yama Yazılamaz:** 4 adımlı sistematik hata ayıklama işletilir.
  - **Kanıt Görmeden "Bitti" Denilemez:** Test komutunun başarılı çıktısı görülmeden görev kapatılamaz.

---

## 🛡️ 42. Katı Mühendislik Kapıları: Anti-Monolith, Parity ve UTF-8 Muhafızı
> **Kod Dosyaları:** `test/test_parity.js`, `test/test_encoding.js`, `.githooks/`, `_REF/engineering.md`

Agent Farm'ın kendi kaynak kodunu ve projelerini koruyan otomatik yazılım kapıları.

* **Anti-Monolith Kuralı (Dosyalar < 300 Satır):**
  - Dosyaların devasa monolitlere dönüşmesini yasaklar; büyüyen dosyaların modüllere bölünmesini zorunlu kılar.
* **Eşitlik Kapısı (The Parity Gate - `test_parity.js`):**
  - Arayüze eklenen her komut veya menü seçeneğinin Bridge üzerinde bir karşılığı (`farm.ops`) olmak zorundadır; aksi takdirde derleme hata verir.
* **UTF-8 & CP1252 Karakter Muhafızı (`test_encoding.js`):**
  - Windows PowerShell veya harici editörlerin UTF-8 dosyalarını CP1252 ANSI'ye çevirip Türkçe karakterleri ve tırnakları bozmasını engelleyen pre-commit güvenlik ağı.

---

## 📋 43. Gelişmiş Görev Sistemi, Çok Turlu Koşular & Akıllı Retry (Task Lifecycle & Backoff)
> **Kod Dosyaları:** `src/core/tasks.ts`, `src/panels/tasksPanel.ts`, `src/core/taskRounds.ts`

* **Gelişmiş Durum Makinesi:** `queued` $\rightarrow$ `claimed` $\rightarrow$ `running` $\rightarrow$ `done` | `failed` | `blocked` | `cancelled` | `parked`.
* **Kapasite ve Eşzamanlılık Tavanları:** `maxConcurrentTasks` (tüm çiftlik tavanı), `maxConcurrentPerAgent` (ajan başına paralel iş limiti), `queueAutoAdvance` (biten işin ardından sıradakini otomatik başlatma).
* **Üstel Gecikmeli Retry (Exponential Backoff):** Hatalı işi anında tekrar edip sistemi tıkamak yerine 1, 5, 15 dakikalık artan aralıklarla yeniden deneme; `maxRetries` aşılınca güvenli `parked` moduna alma.
* **Çok Turlu Görev Zinciri (Multi-Round Tasks — M-27):** Büyük işleri turlara (`Round 1`, `Round 2`...) bölme, her turun durum anlık görüntüsünü (snapshot) saklama ve sonraki turu otomatik besleme.
* **Çoklu Çalışma Yüzeyi:** Görevin Headless (arka plan), Canlı Konsol veya Harici OS Terminalinde (`externalTerminal`) çalıştırılabilmesi.

---

## ⚡ 44. İş Akışları & Misyon Orkestrasyonu (Workflows & Adaptive Missions)
> **Kod Dosyaları:** `src/core/workflowLive.ts`, `src/core/workflowMission.ts`, `src/core/missions.ts`

* **Paralel Adımlar ve Toplanma (Fan-Out / Fan-In):** Birden fazla ajanın paralel adımları aynı anda koşması ve sonuçların tek bir birleştirme adımında toplanması.
* **İnsan Onay Kapıları (`workflowAsk`):** Kritik adımlarda akışı durdurup insan onayını bekleme, onay gelince kaldığı yerden devam etme.
* **Zincirleme Uyandırma (`workflowWake`):** Bir akışın çıktısının bağımlı diğer akışları otomatik tetiklemesi.
* **Liderin Salt Planlayıcı Olması (Read-Only Lead):** Misyon liderinin yazma araçlarının kapatılması; liderin sadece strateji kurup işleri alt ajanlara dağıtması (`delegate`).
* **Tek Yazıcı Koruması (Single Writer Lock) & Döngü Muhafızı (Loop Guard):** İki yazıcının aynı klasöre aynı anda girmesini ve aynı işin aynı ajana kısır döngüde verilmesini engelleme.
* **Sert 5'li Misyon Tavanı:** `maxRounds`, `maxTasks`, `maxCostUSD`, `maxMinutes`, `maxParallel` limitlerinden biri vurulduğunda sistemin otomatik `finish-only` moduna geçmesi.

---

## 🛡️ 45. Nöbet Sistemi & Görev Disiplini (Duties, Watches & Sentry Engine)
> **Kod Dosyaları:** `src/core/duties.ts`, `DUTIES.md`, `src/core/sentry.ts`

* **`[every-turn]` ve `[session-start]` Rutinleri:** Her açılışta ve tur sonunda A2A, Notices ve Worklog nöbetlerinin sormadan icra edilmesi.
* **Nöbet Denetimi (`DUTIES.md` Audit):** Çiftlik genelindeki tüm nöbetlerin sağlık ve aksama durumlarının taranması.
* **Otonom Gece Nöbetçisi (Sentry Engine):** Lider bütçesi (`sentryLeaderBudgetUsd`), arıza limiti (`sentryLeaderFailLimit`) ve takılma dedektörü (`sentryStallMin`) ile insansız güvenli operasyon.
* **Nöbetçi Hesap Rotasyonu:** Nöbetteki ajanın tek bir kotayı tüketmemek için hesap yuvaları arasında otomatik rotasyon yapabilmesi.

---

## 🚩 46. Bayrak Yarışı & Kesintisiz Devir Zinciri (Baton Relay Deep Mechanics)
> **Kod Dosyaları:** `src/core/baton.ts`, `_REF/handover.md`

* **Zincir Kimliği ve Bacak Sıralaması (`chn_...` & `Legs`):** Devredilen işlerin rastgele değil, bacak sırasıyla (`Leg 1/10`, `Leg 2/10`) sıralı kuyruktan ayağa kalkması.
* **Zorunlu Devir Başlığı Enjeksiyonu (`batonInjectedDirective`):** Önceki ajanın devir notunun yeni ajanın sistem promptunun en tepesine silinmez bir `⚠️ [BATON RELAY DIRECTIVE]` olarak enjekte edilmesi.
* **Acil Durum Devri (`batonEmergencyTemplate`):** Ani kota bitişinde veya kopmada sistemin otomatik acil durum özetiyle bayrağı devretmesi.
* **Zıplama Tavanı ve Freni (`batonMaxHops` & `baton.stop`):** Sonsuz zincirleri engelleyen maksimum sıçrama tavanı ve anında fren koyma güvenliği.
