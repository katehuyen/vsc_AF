# 02 — Agent Farm Kategorik Mimari ve Derinlik Analizi

Bu doküman; Agent Farm'ın **47 büyük sistemsel yeteneğini** mantıksal, mimari ve işlevsel olarak **11 ana sütun** altında eksiksiz detaylarıyla açıklar.

---

## 1. Oturum Yönetimi, Çoklu Motor & Başlatma Paritesi
* **11 Giriş Noktası Paritesi (Launch Parity):** Konsol, Ağaç Menüsü, Sağ Tık, Başlatma Profilleri, Çok Boyutlu Başlatıcı, Yüzey Seçici, Proje Ağacı, Webview'lar, Komut Paleti, Bridge RPC ve Telegram kapılarının tamamında eşit 8 boyutlu yetenek desteği.
* **Çoklu Motor & Beyin Değişimi (Hot Brain Swapping):** Claude Code CLI, Antigravity (Gemini), Codex ve OpenCode motorlarının aynı terminallere bağlanabilmesi ve canlı sağlık testi (`engineTest.ts`).
* **Akıllı Yeniden Açılış (Reopen Parity):** Oturum kapandığında hangi model, efor ve yetkiyle kapandıysa (`reopenFor`) o ayarlarla ayağa kalkma.
* **Ön-Isınmış Yedek Oturumlar (Spare Sessions):** Hızlı müdahale için sıfır başlatma gecikmesiyle hazır bekleyen pre-warmed yuvalar.

---

## 2. Ajanlar Arası İşbirliği (A2A), Misyonlar & Görev Dağıtımı
* **A2A Mesaj ve Not Panosu (`a2a.notes.*`):** Ajanların birbirine teknik kontrat, uyarı veya sonuç bıraktığı asenkron iletişim bus'ı.
* **A2A Görev ve Kiralama Döngüsü (`a2a.tasks.*`):** 30 dakikalık kiralama (`lease`), kalp atışı (`heartbeat`), iş devri (`handoff`) ve 3. devirde devreye giren döngü muhafızı (`loop guard`).
* **Misyon Motoru & Lider Mimarisi (`missions.start`):**
  - **Salt Planlayıcı Lider (Read-Only Lead):** Liderin yazma araçları kapalıdır; lider sadece planlar ve işi alt ajanlara dağıtır (`delegate`).
  - **Tek Yazıcı Koruması (Single Writer Lock):** İki yazıcı ajanın aynı klasöre aynı anda girmesi yasaktır; paralel işler `readonly: true` olmak zorundadır.
  - **Sert 5'li Tavan:** `maxRounds`, `maxTasks`, `maxCostUSD`, `maxMinutes`, `maxParallel` tavanlarından biri vurulduğunda sistem otomatik `finish-only` moduna geçer.
* **Süpervizör Direktifi (Supervisor Override):** İnsanın verdiği `steer`, `veto` veya `constraint` emrinin ajanın tüm kurallarını anında geçersiz kılıp rotayı düzeltmesi.

---

## 3. Süreklilik, Dayanıklılık & Ouroboros Döngüsü
* **Baton Relay (Bayrak Yarışı):** 5 saatlik kotalar veya 200k bağlam tavanlarında çalışmayı kesmeyip sonraki ajana devretme (`baton.pass` / `baton.legs`).
  - **Zincir Kimliği (`chn_...`):** Bacakların sıralı (`Leg 1/10`) kuyruktan ayağa kalkması.
  - **Zorunlu Başlık Enjeksiyonu (`batonInjectedDirective`):** Devir notunun yeni ajanın promptuna silinmez bir `⚠️ [BATON RELAY DIRECTIVE]` olarak enjekte edilmesi.
  - **Acil Durum Devri & Fren (`batonEmergencyTemplate` / `baton.stop`):** Ani kopmada otomatik ara durum paketi oluşturma ve zinciri tek tıkla durdurabilme güvenliği.
* **Ouroboros Canlı Yeniden Başlatma (Live Revive):** Ajanın kendi çalıştığı VS Code eklentisini kodlayıp paketlemesi, eklentiyi yeniden başlatması ve hiçbir bağlam kaybetmeden yeni sürümde dirilip (`ConsoleHost.reclaim`) testlerine devam etmesi.
* **Sentry (Nöbetçi) Gece Vardiyası:** İnsansız, sert bütçe ve hata tavanı olan gece boyu süren otonom iş koşuları.
* **Sıfır-Tuzak Otomatik İyileşen Bridge (`af.js`):** Kabuk tırnaklama ve UTF-8 bozulmalarını kendi içinde onaran sıfır-hata köprü.

---

## 4. Gelişmiş Görev Sistemi, Çok Turlu Koşular & Akıllı Retry
* **Gelişmiş Durum Makinesi:** `queued` $\rightarrow$ `claimed` $\rightarrow$ `running` $\rightarrow$ `done` | `failed` | `blocked` | `cancelled` | `parked`.
* **Kapasite Tavanları & Otomatik İlerleme:** `maxConcurrentTasks`, `maxConcurrentPerAgent` ve biten işin ardından sıradakini başlatan `queueAutoAdvance`.
* **Üstel Gecikmeli Retry (Exponential Backoff):** Hatalı işi artan aralıklarla (1, 5, 15 dk) yeniden deneme; `maxRetries` aşılınca güvenli parka çekme.
* **Çok Turlu Görevler (Multi-Round Tasks — M-27):** Büyük işleri turlara bölme, ara durum anlık görüntülerini (snapshot) saklama ve sonraki turu otomatik besleme.
* **Çoklu Çalışma Yüzeyi:** Görevin Headless (arka plan), Canlı Konsol veya Harici Terminalde (`externalTerminal`) çalıştırılabilmesi.

---

## 5. İş Akışları (Workflows) & Fan-In / Fan-Out Mimarisi
* **Paralel Adımlar ve Toplanma (Fan-Out / Fan-In):** Birden fazla ajanın paralel adımları aynı anda koşması ve sonuçların tek bir birleştirme adımında toplanması.
* **İnsan Onay Kapıları (`workflowAsk`):** Kritik adımlarda akışı durdurup insan onayını bekleme, onay gelince kaldığı yerden devam etme.
* **Zincirleme Uyandırma (`workflowWake`):** Bir akışın çıktısının bağımlı diğer akışları otomatik tetiklemesi.
* **Akış Harcama Tavanı (`workflowSpendCap`):** İş akışına özel bağımsız bütçe limiti.

---

## 6. Projeler, Yaşayan Belgeler & İş Takip Ekosistemi
* **Dinamik Proje Bağlamı Enjeksiyonu:** Oturum açılışında `=== AGENT FARM PROJECT CONTEXT ===` ile 6 temel rol dosyasının (`Charter`, `Plan`, `Backlog`, `Backloglog`, `People`, `Worklog`) sıfır token israfıyla ajana enjekte edilmesi.
* **Deneme Geçmişi ve Dokunuş Takibi (`projects.track`):** Bir iş bitirilemediğinde (`touch`) deneme notunun kalıcı saklanması; 3 ay sonra gelen ajanın tekerleği yeniden icat etmesini önleme.
* **Soğuk Başlangıç Devir Mektubu (`projects.handover`):** Bir projeyi devrederken veya alırken nelerin açık kaldığını özetleyen otomatik brifing.
* **Akıllı Backlog Dağıtıcısı (`projects.backlog.next`):** Engellenmiş ve devasa işleri eleyerek sıradaki en uygun maddeyi ajana sunma.
* **Genel Portföy Radarı (`portfolioPanel.ts`):** Çoklu projelerin faz ve backlog durumlarını tek ekranda izleme.

---

## 7. Görsel Arayüz, Konsol & DENSITY Tasarım Sistemi
* **DENSITY İlkesi:** Maksimum bilgi yoğunluğu, minimum alan, sıfır gereksiz tıklama; tüm türetilmiş metriklerin ekranda hazır bulunması.
* **AFTip Akıllı Hover Paneli (`media/afTip.js`):** Zengin, kaydırılabilir, kopyalanabilir ve fare/klavye dokunuşunda ele anında yol veren hover sistemi.
* **Dinamik Konsol Renk Dili:** Kartların o saniyedeki durumuna göre canlı renk değiştirmesi (Mavi: Düşünüyor, Mor: Test koşuyor, Sarı: Soru soruyor, Yeşil: Tamamlandı, Kırmızı: Hata).
* **Geri Sayımlı Soru Modalı & Otomatik Öneri:** Soru kartındaki sayacın durdurulabilmesi veya süre bitince `(Recommended)` seçeneğin otonom seçilerek akışın kilitlenmesini engellemesi.
* **9 Adım Türü Harcama Dökümü (`stepkind.ts`):** Token ve dolar harcamasının 9 alt kategoriye ayrılarak şeffaf gösterilmesi.

---

## 8. Navigasyon, Zaman Çizelgesi & Cerrahi Teşhis
* **Canlı Zaman Çizelgesi (`TimelinePanel`):** Canlı süreçleri, PID'leri ve anlık harcamaları tek eksende gösterme.
* **Tur & Araç Gezgini (`TurnsPanel`):** Binlerce tur arasından ajanın spesifik bir düşünce bloğuna veya çağırdığı tek bir dosya/terminal aracına tek tıkla zıplama.
* **Sıkışma & Sessizlik Radarı (`stuckThresholdMinutes`):** Ajan takıldığında zaman çizelgesinde yanan otomatik uyarı rozeti.
* **"Sağ Tık Her Yerde" Bağlam Menüleri:** Editörde, dosya gezgininde, oturum kartlarında ve ajan ağacında zengin sağ tık eylemleri.

---

## 9. LLM Wiki, Multimedya & Yayın Boru Hattı
* **Obsidian Yaşayan Bilgi Omurgası:** İnsan tarafı (Vault `99_SYSTEM`) ve Ajan tarafı (`AGENTS.md`) arasında sıfır çürüme ile paralel yaşam.
* **LLM Wiki Derleme Motoru (`wiki.compile.run`):** Ajanların oturumlardaki teknik kararları `00_WIKI` içine otomatik kavram sayfaları (`[[Kavram_Adi]]`) olarak derlemesi.
* **Sihirli Bırakma Kutusu (`_RAW_/` Drop Box):** Dışarıdan kopyalanan herhangi bir metin dosyasının klasöre atıldığı anda komutsuz Wiki Adayı olması.
* **5 Aşamalı Prodüksiyon Hattı & Adobe Premiere Export:** Sahne matrisinden doğrudan Adobe Premiere sekansına yapay zeka video/içerik kurgu ihracı.
* **İçerik Takvimi & Onaylı Yayınlama:** Üretilen içeriklerin otomatik takvime işlenmesi ve insan onaylı yayınlanması.

---

## 10. Görev Analitiği, Mobil, Güvenlik & Superpowers Disiplinleri
* **Gelecek Tahmin Motoru (`forecast.ts`):** Geçmiş 30 günün medyan süreleri ve başarı oranlarıyla sıradaki görevlerin ne kadar süreceğini ve başarı ihtimalini tahmin etme.
* **Görev Aileleri ve Kronik Hata Dedektörü (`alwaysFails`):** Sürekli çöken veya takılan görevleri erkenden yakalama.
* **Kapıcı (Gatekeeper) 3 Kademeli Filtre:** Heuristic $\rightarrow$ Jev $\rightarrow$ LLM süzgeciyle ucuz, hızlı ve otonom karar verme.
* **Android Companion (`and_AgentFarm`) & Telegram Kokpiti:** Telefondan tek komutla oturum başlatma, butonlu onay verme ve filo durumunu cepten izleme.
* **Format-Proof Makine Göçü & LAN Eşleşmesi (`_REF/machine-setup.md`):** Sembolik linkler ve `Cockpit.exe` ile format sonrası saniyeler içinde ayağa kalkma; yerel ağdaki iki PC arasında akıllı transkript birleştirme (`Smart Merge`).
* **Superpowers Disiplinleri:** Diskte uyuyan 14 kıdemli mühendislik kuralı (TDD, Sistematik Hata Ayıklama) ve Anti-Monolith / Parity kalite kapıları.

---

## 11. Harici Ajan Onboarding & Dinamik Platform Keşfi (Platform-to-Agent Protocol — AP-OS)
* **İki Katmanlı Hibrit Ağ Geçidi (MCP & CLI Bridge):** Harici modelin türüne göre doğrudan `stdio JSON-RPC 2.0` (Native MCP Server) veya shell-safe `%APPDATA%/.../af.js` CLI köprüsü üzerinden Agent Farm ile konuşması.
* **Sıfır-Token Çevre Deklarasyonu & El Sıkışma (Zero-Token Handshake):** Oturum açılışında token harcamaksızın OS ortam değişkenleri (`AGENTFARM_*`) ve sistem bağlamına ~50 tokenlık tek satır yönlendirme enjekte edilmesi (`X-536`).
* **İsteğe Bağlı Dinamik Yetenek Keşfi (`af.capabilities` / Introspection):** Ajanın ezbere kod veya statik metin okumak yerine, o anki eklenti sürümünün canlı yetenek ve girdi şemalarını (`capabilities.list`, `capabilities.get`) JSON olarak sorgulaması.
* **Proje İskeleleme & Ajan Rolü Kurulumu (`af.project.init`):** Yabancı repolara tek komutla `.agentfarm/` dizinini ve 6 temel rol belgesini yerleştirerek repoyu anında Agent Farm disiplinine sokma yeteneği.
* **Rehberlik Eden Hata Protokolü (Actionable Error Payloads):** Hatalı parametre veya kural ihlallerinde kuru hata kodu yerine ajanı eğiten ve doğru sözdizimini bildiren akıllı hata gövdeleri (Self-Healing Loop).
* **Kör Ajan E2E Doğrulama Matrisi (`TST-ONBOARD-01..04`):** Kaynak kodu görmeyen yalıtılmış harici modellerin platformu hatasız orkestre edebildiğinin otomatik testi ([[A-PLN - Harici Ajan Onboarding ve Dinamik Platform Keşfi Mimarisi - X-536 - 261010]]).
