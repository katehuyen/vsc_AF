# Agent Farm — Gelişim Planı

> Bu belge, bundan sonraki tüm kodlamanın yol haritasıdır. En önemli/en gerekli olandan başlayarak fazlara ayrılmıştır; her özellik **Ne / Neden / Nasıl / Zorluk** şablonuyla yazıldı. Piyasa hızlı değiştiği için servis ve model adları uygulama anında yeniden doğrulanmalı (özellikle medya modelleri — sürümler aylık değişiyor). Komut paletinden `Agent Farm: Open Development Plan` ile açılır ve her fazın sonunda güncellenir.

## Vizyon

Agent Farm bugün bir **ajan komuta merkezi**: izler, koordine eder, raporlar. Hedef, onu bir **kişisel otomasyon fabrikasına** dönüştürmek: metin ajanların, medya modelleri (video/görsel/ses) ve dış otomasyon platformları (n8n, webhook dünyası) tek panelden birlikte çalışır; işler tetikleyicilerle kendiliğinden başlar, sonuçlar kendiliğinden doğrulanır, her şeyin maliyeti ve kalitesi tek karnede izlenir. Kullanıcı "ne yapılacağını" söyler; ne zaman, hangi modelle, kaça ve ne kalitede yapıldığını fabrika halleder.

Uzun vadeli ölçüt şu cümledir: *"Akşam tek satır niyet yazıyorum; sabah vault'ta sonuçlar, galeri ve karne hazır — ve neyin neden yapıldığını tek bakışta görüyorum."*

## Tasarım İlkeleri (her özellik bunlara uymak zorunda)

1. **Yerel-önce:** Veri makineden çıkmaz; dış servis çağrıları yalnızca kullanıcının açıkça bağladığı API'lere gider ve panelde görünür.
2. **Tek kaynak dosyalar:** DUTIES.md modeli esastır — her yeni kavram (tetikleyici, medya işi) hem ajanın hem insanın okuyabildiği bir dosyada yaşar; panel yönetir, elle düzenleme korunur.
3. **Her şey izlenebilir:** Yeni bir yetenek, maliyeti/durumu/çıktısı Dashboard ve rapora yansımadan "bitti" sayılmaz.
4. **Ucuz model disiplini:** Rutin/mekanik her iş varsayılan olarak ucuz modelle (haiku sınıfı); pahalı model bilinçli seçimdir.
5. **Bozulmadan büyüme:** Yeni özellik eskisini bozamaz; her faz gerçek çalıştırma testiyle kapanır; kılavuz + örnekler eş zamanlı güncellenir.
6. **Onaylı yazma:** Kullanıcı dosyalarına/sistemine yazan her şey ya açık onay ister ya da yedek bırakır.

## Piyasa Fotoğrafı ve Konumlanma (özet)

- **Ajan çalıştırma katmanı:** Claude Code (bizim zeminimiz) + Agent SDK; rakip CLI'lar (Codex, Gemini CLI) — uzak hedefte çoklu-CLI desteği düşünülebilir ama odak Claude.
- **Entegrasyon katmanı:** **MCP fiilen standart** — binlerce sunucu (dosya, tarayıcı, DB, SaaS). n8n/Make/Zapier webhook dünyası hâlâ en pratik "her şeye köprü".
- **Medya modelleri:** Video: Kling, Seedance (ByteDance), Veo (Google), Sora (OpenAI), Runway. Görsel: Nano Banana (Gemini görsel), Flux, Ideogram, Midjourney (API'siz). Ses: ElevenLabs (TTS), Whisper/Deepgram (STT), Suno/Udio (müzik — API durumu değişken). **Kritik içgörü:** bunların çoğuna **fal.ai / Replicate** gibi tek-kapı API'lerden erişilir — tek entegrasyonla onlarca model.
- **Gözlemlenebilirlik:** OTel/Grafana kurumsal tarafta; bizim farkımız sıfır-kurulum yerel panel + operasyonel katman (nöbet, kuyruk, zincir). Bu farkı koruyacağız.

---

# FAZ A — Otomasyon Çekirdeği: "Kendiliğinden Başlayan İş" — ✅ TAMAMLANDI (0.8.0, 2026-07-09)

> Beş özellik de gerçek çalıştırma testleriyle kapandı. Çıkış ölçütü kanıtı: inbox'a bırakılan dosya, watch tetikleyicisi→workflow→haiku tasnifi→hakem PASS→arşiv döngüsünü elle dokunmadan tamamladı. Gerçek testin yakalattığı ders: modellerin JSON'u markdown çitine sarması — ayrıştırıcı toleranslı yazıldı.

Bugün her şey ya elle ya saatle tetikleniyor. Gerçek otomasyonun temeli **olay tetikleyicileri** ve **güvenilir yürütme**dir. Bu faz bitmeden entegrasyon fazlarına geçilmez, çünkü hepsi bunun üstüne oturur.

### A1. Tetikleyiciler (Triggers) — dosya/olay → görev [Zorluk: M] ⭐ en kritik özellik

- **Ne:** Görev/workflow'ların yalnızca zamanla değil, olaylarla başlaması: (a) **watch tetikleyici** — izlenen dosya/klasör değişince (nöbet sisteminin eyleme köprüsü: FAST_NOTE'a dosya düşer düşmez tasnif zinciri başlar, ajan oturumu beklemeden); (b) **hook tetikleyici** — canlı olaydan (örn. bir ajanın oturumu bitince rapor görevi koşsun); (c) mevcut zamanlayıcı bu modelin bir tetikleyici tipi olur.
- **Neden:** Kullanıcının hayatındaki en büyük fark: "ajan açıkken bakar" sınırı kalkar. Inbox'a not at → 30 sn içinde tasnif edilmiş. LifeOS'un "uyku mesajı = plan tetiği" deseni panelde birinci sınıf kavram olur.
- **Nasıl:** `TriggerManager` (core/triggers.ts): tanım {id, type: watch|hook|schedule, source, debounceSec, action: task|workflow ref, cooldownSec, enabled}. Watch için mevcut fs.watch altyapısı; hook için LiveMonitor olay aboneliği. Tanımlar farm-tasks.json'a; Tasks görünümüne "Triggers" bölümü; tetiklenme geçmişi (son 20) izlenebilir. Fırtına koruması: debounce + cooldown + saatlik tavan.
- **Bağımlılık:** yok. **Bu fazın ilk işi.**

### A2. Doğrulayıcı Adım ve Yeniden Deneme (Verifier & Retry) [M]

- **Ne:** Workflow adımına opsiyonel `verify` alanı: adım bitince **ucuz bir judge çağrısı** (haiku) çıktıyı ölçüte göre PASS/FAIL değerlendirir; FAIL'de yapılandırılabilir retry (n deneme, düzeltme talimatı eklenerek) → yine FAIL'se onFail yoluna düşer.
- **Neden:** Otomasyona güvenin anahtarı. "Gece koştu ama saçmalamış" riskini panel kendisi yakalar; kullanıcı sabah yalnızca gerçek sorunları görür.
- **Nasıl:** verify: {criteria: string, judgeArgs?: string, retries: number}. Judge promptu şablon: ölçüt + çıktı gövdesi (archivedOutputBody) → tek kelime PASS/FAIL + kısa gerekçe; gerekçe arşive eklenir. Maliyet: judge çağrıları da task olarak kaydedilir (izlenebilirlik ilkesi).
- **Bağımlılık:** yok.

### A3. Yapılandırılmış Devir (Structured Handoff) [M]

- **Ne:** `{prev_output}` (dosya yolu) yanına `{prev_json.alan}` desteği: adım `claude -p --output-format json` ile koşturulup çıktı JSON'u ayrıştırılır; sonraki adım prompt'una alan bazlı değer enjekte edilir. Ayrıca `{prev_text}` (gövde metni, kırpılmış) kısayolu.
- **Neden:** Zincirler kırılganlıktan kurtulur: "analizdeki risk_seviyesi=yüksek ise..." gibi runIf koşulları alan üstünden, metin tesadüflerine takılmadan çalışır (0.7.2'deki runIf dersinin devamı).
- **Nasıl:** step.outputContract?: 'text'|'json'; json ise `--output-format json` eklenir, `result` alanı gövde sayılır; ayrıştırılan obje run-state'te taşınır. runIf'e `json:alan~regex` sözdizimi.
- **Bağımlılık:** yok; A2 ile birlikte tasarlanmalı (judge de JSON kullansın).

### A4. Kota Bekçisi ve Eşzamanlılık [S-M]

- **Ne:** (a) Ajan başına ve global eşzamanlı görev limiti (kuyruk gerçek kuyruk olur); (b) **pencere-duyarlı erteleme:** 5 saatlik pencere doluluk eşiğini (örn. %85) aşınca yeni otomatik görevler "pencere açılınca koş" durumuna düşer ve bildirilir.
- **Neden:** Tetikleyiciler gelince (A1) işler çoğalacak; abonelik kotasını bir gece görevi yüzünden sabah kilitli bulmak kabul edilemez. Otomasyonun freni de otomasyon olmalı.
- **Nasıl:** TaskManager'a scheduler kuyruğu: running sayacı, maxConcurrent ayarları; windowUsage() zaten var → threshold ayarı `quotaGuardPercent`. Ertelenen görevler Tasks'ta "deferred (quota)" rozetiyle.
- **Bağımlılık:** A1 ile eş zamanlı çıkmalı.

### A5. Görev Geçmişi ve Arşiv Sağlamlığı [S]

- **Ne:** 300 görev tavanı yerine dönemsel arşiv: biten görevler aylık JSONL dosyalarına taşınır (`task-history/2026-07.jsonl`); panelde "History" araması; çıktı arşivine toplam boyut tavanı + eski çıktı temizliği politikası.
- **Neden:** Fabrika çalışmaya başlayınca (A1) tarihçe değerlenir: "geçen ay bu zincir kaç kez koştu, kaç kez FAIL etti" raporun hammaddesi.
- **Nasıl:** Saf dosya (SQLite'a native bağımlılık getirmeden); rapor motoru history'yi de okur.

**Faz A çıkış ölçütü:** "Inbox'a dosya at → tetikleyici zinciri başlatır → doğrulayıcı onaylar → sonuç arşivde, karne güncel" akışı gerçek testle kanıtlanır.

---

# FAZ B — MCP ve Dış Dünya Köprüsü — ✅ TAMAMLANDI (0.9.0, 2026-07-09)

> Dört özellik de gerçek HTTP mekanikleriyle test edilerek kapandı: sır kasası (OS anahtarlığı + env + {secret:} şablonu), MCP envanteri (gerçek kullanım: obsidian=394 çağrı/30g), webhook adımı (yanıt→devir), /trigger ucu (token+payload), bildirim yönlendirme. n8n ile saha kurulumu Örnekler S14'te reçete olarak duruyor.

**Stratejik karar:** Tek tek servis entegrasyonu yazmak çıkmaz sokak. İki evrensel kapı var: **MCP** (ajanın araçları) ve **webhook** (platformların dili). İkisini birinci sınıf yapınca "diğer servislerle çalışma" sorunu bir kere ve kalıcı çözülür.

### B1. MCP Yönetim Paneli [M] ⭐

- **Ne:** Ajan başına tanımlı MCP sunucularının envanteri (`.mcp.json` + settings kaynaklarından), panelde görünür: hangi ajan hangi dış yeteneğe bağlı (Obsidian, tarayıcı, DB…), sunucu ekle/kaldır sihirbazı, transcript'lerden **gerçek kullanım istatistiği** (mcp__ araç sayımları zaten toplanıyor — ajan detayına "MCP usage" tablosu).
- **Neden:** Kullanıcının Obsidian MCP'si gibi bağlantılar bugün görünmez yapılandırma; panelde envanter + kullanım = hem güvenlik hem optimizasyon ("bu sunucu 3 haftadır hiç kullanılmamış, kaldır").
- **Nasıl:** Konfig ayrıştırıcı (mcpServers şeması), Agents ağacına "MCP" bölümü, Insights'a "tanımlı ama hiç kullanılmamış sunucu" ve "yetim referans" kuralları.

### B2. Sır Kasası (Secrets) [S]

- **Ne:** API anahtarlarının VS Code **SecretStorage**'da tutulması; görev/medya adımlarına env olarak enjeksiyon; ayar dosyalarında düz metin anahtar uyarısı (Insight).
- **Neden:** B3/C fazlarının ön koşulu; anahtarların settings.json'da gezmesi kabul edilemez.
- **Nasıl:** `agentfarm.secrets` komut seti (set/list/remove — değer asla gösterilmez); TaskManager spawn env'ine seçili anahtarlar.

### B3. Webhook Köprüsü: n8n / Make / Zapier (iki yön) [M] ⭐

- **Ne:** (a) **Dışarı:** yeni adım tipi `webhook` — zincirin bir adımı claude değil, HTTP çağrısıdır (URL, method, body şablonu `{prev_*}` değişkenli, bekleme/polling opsiyonu). (b) **İçeri:** yerel dinleyiciye `/trigger/<token>` ucu — n8n'den gelen çağrı, tanımlı görevi/workflow'u parametreyle başlatır (A1 tetikleyici tipine "webhook" eklenir).
- **Neden:** n8n'in yüzlerce entegrasyonu (Gmail, Telegram, Sheets, Drive, sosyal medya) tek köprüyle ajan zincirlerine bağlanır: "Gmail'e fatura düşünce n8n → Agent Farm 'faturayı işle' zinciri → sonuç Sheets'e webhook'la geri". Kullanıcının hayatındaki karşılık: dış dünya olayları ajan fabrikasını tetikler, fabrika sonuçları dış dünyaya teslim eder.
- **Nasıl:** Dışarı adım: Node fetch, timeout, yanıtı arşive yaz (devir zincirde sürer). İçeri: token üretimi + doğrulama, yalnızca 127.0.0.1 dinlenir — LAN erişimi gerekiyorsa kullanıcı bilinçli olarak reverse-proxy kurar (kılavuzda anlatılır); rate-limit.
- **Bağımlılık:** A1 (tetikleyici çatısı), B2 (dış URL'lere giden gizli değerler).

### B4. Bildirim Yönlendirme: cebe düşen filo [S-M]

- **Ne:** LiveMonitor olaylarının (izin bekliyor / takıldı / zincir bitti / bütçe aşıldı) seçilebilir alt kümesini bir webhook'a POST etme — n8n üzerinden Telegram/WhatsApp/mail'e.
- **Neden:** "Ajan izinde bekliyor" bildirimi sen mutfaktayken telefona düşerse otomasyon gerçek olur. VS Code'a bakma zorunluluğu kalkar.
- **Nasıl:** `agentFarm.notifyWebhook` + olay filtresi ayarı; payload standart JSON; B3'ün dışarı kanalını yeniden kullanır.

**Faz B çıkış ölçütü:** Gerçek bir n8n akışıyla çift yönlü test: Telegram mesajı → n8n → zincir koşar → sonuç Telegram'a döner; izin bekleyen ajan bildirimi telefonda görünür.

---

# FAZ C — Multimedya Üretim Hattı — ✅ TAMAMLANDI (1.0.0, 2026-07-09) — "İçerik Fabrikası"

> Dört özellik kapandı: medya adımları (fal kuyruk API'si, varlık indirme+arşiv, yanıt→devir), galeri (Re-run/Vary), maliyet entegrasyonu (Dashboard kartı), üç reçete. Testler: sahte fal sunucusuyla tam hat uçtan uca; gerçek fal.ai'de kimlik doğrulama ve hata yolu doğrulandı (kullanıcının anahtarı tanındı, "Exhausted balance" zarifçe yakalandı). **Gerçek üretim koşusu, hesaba kredi yüklendiğinde S15 reçetesiyle yapılacak.** Fiyat tablosu yer tutucu — fal.ai'den doğrulanmalı.

Metin ajanları + medya modelleri aynı zincirde. Burada 1.0 deriz çünkü eklenti bu noktada kategori değiştirir: ajan monitöründen üretim hattına.

### C1. Medya Adımları (Media Steps) [L] ⭐

- **Ne:** Workflow adım tipleri: `image`, `video`, `tts`, `stt` (ve ileride `music`). Adım claude yerine bir medya API'sini çağırır; prompt'u önceki adımdan devralabilir (`{prev_text}` → görsel prompt'u), çıktı dosyası (png/mp4/mp3) arşive iner ve `{prev_output}` olarak sonraki adıma devredilir.
- **Neden:** Kullanıcının somut hayali: *psikolog metni yazar → Nano Banana kapak görselini üretir → Kling/Seedance 10 saniyelik videoyu çıkarır → asistan hepsini Obsidian'a/paylaşım klasörüne paketler* — tek zincir, gece koşar. İçerik üretiminin mekanik yarısı sıfır ele iner.
- **Nasıl:** **Tek-kapı stratejisi:** ilk sürümde yalnızca **fal.ai** (ve/veya Replicate) sağlayıcısı — tek REST deseniyle Kling, Seedance, Veo, Flux, Nano Banana sınıfı modellere erişim; model adı adımda serbest metin (piyasa değişince kod değişmez). Asenkron iş: submit → job id → polling (uzun video işleri dakikalar sürer; task 'running' kalır, timeline'da görünür). Sağlayıcı arayüzü soyut tutulur ki ileride doğrudan Google/OpenAI uçları eklenebilsin. API anahtarı B2 kasasından. **Uygulama anında doğrula:** güncel model adları/fiyatları ve fal-Replicate kapsamı.
- **Bağımlılık:** B2; A3 (prompt devri için).

### C2. Medya Galerisi [M]

- **Ne:** Üretilen tüm görsel/videoların panel galerisi: küçük önizleme, prompt, model, süre, maliyet, hangi zincir/görevden geldiği; tıkla → büyüt/dosyayı aç; **Re-run** (aynı parametrelerle yeniden üret) ve **Vary** (prompt'u düzenleyip üret) düğmeleri.
- **Neden:** "Takibi nasıl daha iyi yaptırır" sorusunun medya cevabı: neyi, neyle, kaça ürettiğini unutmazsın; beğenmediğini tek tıkla yeniden denersin.
- **Nasıl:** Webview galeri (mevcut panel altyapısı); metadata `task-outputs`'taki yan-dosyalardan (`.meta.json`); localResourceRoots ile yerel medya gösterimi.

### C3. Medya Maliyet Entegrasyonu [S-M]

- **Ne:** Medya API harcamalarının (görüntü başına / video-saniyesi başına, `agentFarm.mediaPricing` tablosu) Dashboard'a ayrı seri olarak eklenmesi: metin + medya = **tüm AI harcaması tek karnede**; bütçe/trend kuralları medyayı da kapsar.
- **Neden:** Video modelleri pahalıdır; fabrika kurulunca maliyet takibi hayati. Tek panel farkımızın devamı.

### C4. Hazır Reçeteler (Recipes) [S]

- **Ne:** İçerik fabrikası şablonları: "Blog→Kapak→Kısa video", "Sesli not→metin→özet→vault" (NoteScribe sinerjisi: STT adımı), "Haftalık rapor→infografik" — tek tıkla kurulan örnek workflow'lar + Örnekler belgesine test edilmiş senaryolar.
- **Neden:** Boş sayfa problemi; kullanıcı ilk beş dakikada değer görür.

**Faz C çıkış ölçütü:** Gerçek uçtan uca içerik fabrikası koşusu: metin (haiku) → görsel (gerçek API) → video (gerçek API, kısa/ucuz) → paketleme; galeri + karne doğru; toplam maliyet raporda.

---

# FAZ D — Zeki Gözetim ve Öz-İyileştirme — ✅ TAMAMLANDI (1.1.0, 2026-07-09)

Fabrika çalışırken kalitenin bekçiliğini de fabrika yapsın.

> **Uygulama notu (1.1.0):** D1-D4'ün tamamı gerçekleştirildi; D4'te metin/regex arama tamam, opsiyonel semantik katman (yerel embedding) SQLite kararı gibi ihtiyaç doğarsa yeniden değerlendirilecek. Otomatik döngüler (qualitySample, suggestScan, weeklySummary) varsayılan **kapalı** gelir — ucuz modelle de olsa API harcaması kullanıcı onayıyla başlar; elle komutlar her zaman açık.

### D1. Kalite Karnesi [M]
- **Ne:** A2 judge altyapısıyla dönemsel örnekleme: ajan başına çıktı kalite skoru (1-5), karneye "Quality" kolonu, düşüş trendi uyarısı.
- **Neden:** Maliyet düşük ama kalite de düşükse otomasyon zarar; ikisini yan yana görmek gerek.

### D2. Talimat Öneri Motoru [M-L]
- **Ne:** Transcript'lerde tekrarlanan kullanıcı düzeltmelerini (aynı türden "hayır, şöyle yap" kalıpları) ucuz modelle dönemsel tarayıp "CLAUDE.md'ye şu kural eklensin" önerileri üretme (Insight olarak; tek tıkla uygula-onaylı).
- **Neden:** Ajanların kendini iyileştirme döngüsü — bugün elle yapılan hafıza bakımının yarı-otomasyonu. Nöbet sistemiyle birleşince: "ajan kendi talimat açığını raporlar".

### D3. Haftalık Sağlık Özeti Bildirimi [S]
- **Ne:** Haftada bir tek bildirim/rapor bölümü: bütçe-trend-nöbet ihmali-hata oranı-kalite başlıklarının insan diliyle üç cümlelik özeti (ucuz modelle yazdırılır).
- **Neden:** Sinyal yorgunluğuna karşı: on ayrı uyarı yerine bir akıllı özet.

### D4. Transcript Arama [M metin / L semantik]
- **Ne:** Tüm oturum kayıtlarında arama paneli: önce hızlı metin/regex (M); sonra opsiyonel yerel embedding indeksiyle anlamsal arama (L, tamamen yerel model veya kullanıcı API'siyle).
- **Neden:** "Bunu bir ajanla konuşmuştum ama hangisiyle?" — filo büyüdükçe hafıza panelin işi olur.

---

# FAZ E — Ölçek ve Taşınabilirlik — ✅ TAMAMLANDI (1.2.0, 2026-07-09)

> **Uygulama notu (1.2.0):** E1 klasör-senkron yaklaşımıyla yapıldı (`extraClaudeDirs` — relay script'e gerek kalmadı; ihtiyaç doğarsa eklenir). E2 günlük digest kartı + mevcut webhook hattı. E3 `.agentpack` tek JSON dosyası (zip yerine — bağımlılıksız kalma kararıyla uyumlu). E4 hazırlık tamam (LICENSE/CHANGELOG/README/gizlilik beyanı); Marketplace/Open VSX **yayın kararı kullanıcıda** — adımlar README "Publishing" bölümünde.

### E1. Çoklu Makine [L]
- **Ne:** İkinci makinenin filosunu aynı panelde izleme: hafif "farm relay" (uzak makinede çalışan küçük script, transcript özetlerini ve hook olaylarını güvenli kanaldan iletir) veya salt-okunur klasör senkronu (Syncthing/SSH) üzerinden ikinci `claudeDir`.
- **Neden:** Fabrika büyüyünce işler makinelere dağılır; komuta merkezi tek kalmalı.

### E2. Panel-dışı Takip (Mobil) [M]
- **Ne:** B4 bildirimlerinin üstüne: günlük karnenin statik HTML/MD olarak vault'a (zaten var) + Telegram'a özet kartı; kritik onaylar için "cevapla → n8n → /trigger" yarım-döngüsü.
- **Neden:** VS Code açık olmadan da filo cepte.

### E3. Ajan Paketleri (dışa/içe aktarım) [S-M]
- **Ne:** Ajanı şablonlaştırıp paylaşma: CLAUDE.md + DUTIES.md + workflow'lar + tetikleyiciler tek `.agentpack` (zip); içe aktarırken yol/isim uyarlama sihirbazı. Sır ve kişisel hafıza asla pakete girmez.
- **Neden:** Kendi ajanlarını makineler arası taşımak + toplulukla paylaşmak (Doruk örneğindeki topluluk değeri, açık versiyonu).

### E4. Marketplace Yayını [S emek / süreç işi]
- **Ne:** LICENSE, repo, CHANGELOG, CI, ekran görüntüleri, "telemetri yok" beyanı; Marketplace + Open VSX yayını.
- **Neden:** İstenirse; eklenti zaten yayın kalitesinde ama bu bir ürünleşme kararıdır — kullanıcıya ait.

---

# FAZ F — Vizyoner / Ar-Ge (2.x ufku)

### F1. Doğal Dil Komuta Çubuğu [L] ⭐ (uzak ama dönüştürücü)
- **Ne:** Panelde tek satır: *"yarın 09:00'da psikolog haftalık analizi koşsun, ALARM varsa asistan planlasın, çıktı vault'a"* → ucuz model bunu yapılandırılmış schedule+workflow tanımına çevirir, önizleme onayıyla kurulur.
- **Neden:** Kurulum arayüzünün tamamen ortadan kalkışı; "niyet → fabrika ayarı".

### F2. Dispatcher Ajan (dinamik iş dağıtımı) [L]
- **Ne:** Gelen işi (tetikleyici/webhook) hangi ajanın alacağına karar veren yönlendirici katman — kurallı başlar (regex/etiket), ucuz model sınıflandırıcıya evrilir.
- **Neden:** Filo büyüyünce "hangi ajana?" sorusu da otomatikleşmeli.

### F3. Bilgisayar Kullanımı Adımları [L]
- **Ne:** Tarayıcı otomasyon adımı (Playwright/tarayıcı MCP üzerinden): "siteye gir, raporu indir, zincire devret". API'si olmayan servislerin kapısı.
- **Güvenlik:** yalnızca allowlist'li siteler + adım başı onay modu.

### F4. Ses Döngüsü — NoteScribe Sinerjisi [M-L]
- **Ne:** Sesli not → (C1 STT adımı) → inbox → tetikleyici → tasnif/eylem zinciri; yanıtın TTS ile sesli özeti. Kullanıcının kendi ürünüyle (NoteScribe) doğal kenetlenme: telefondan konuş, fabrika işlesin.

### F5. Çoklu-CLI Desteği [L, düşük öncelik]
- **Ne:** Görev yürütücünün Claude dışındaki CLI ajanlarını da (komut şablonu soyutlamasıyla) koşturabilmesi. Ancak izleme derinliği (transcript/hook) Claude'a özgü kalır — beklentiyi kılavuz net çizer.

---

## Öncelik Matrisi (özet)

| # | Özellik | Etki | Zorluk | Bağımlılık | Hedef |
| --- | --- | --- | --- | --- | --- |
| A1 | Tetikleyiciler | ⭐⭐⭐ | M | — | 0.8 |
| A4 | Kota bekçisi/eşzamanlılık | ⭐⭐⭐ | S-M | A1 | 0.8 |
| A2 | Doğrulayıcı + retry | ⭐⭐⭐ | M | — | 0.8 |
| A3 | Yapılandırılmış devir | ⭐⭐ | M | — | 0.8 |
| A5 | Görev tarihçesi | ⭐⭐ | S | — | 0.8 |
| B1 | MCP paneli | ⭐⭐⭐ | M | — | 0.9 |
| B2 | Sır kasası | ⭐⭐⭐ (ön koşul) | S | — | 0.9 |
| B3 | Webhook köprüsü (n8n) | ⭐⭐⭐ | M | A1,B2 | 0.9 |
| B4 | Bildirim yönlendirme | ⭐⭐ | S-M | B3 | 0.9 |
| C1 | Medya adımları | ⭐⭐⭐ | L | B2,A3 | 1.0 |
| C2 | Medya galerisi | ⭐⭐ | M | C1 | 1.0 |
| C3 | Medya maliyeti | ⭐⭐ | S-M | C1 | 1.0 |
| C4 | Reçeteler | ⭐⭐ | S | C1 | 1.0 |
| D1-D4 | Zeki gözetim seti | ⭐⭐ | M-L | A2 | 1.1 |
| E1-E4 | Ölçek seti | ⭐-⭐⭐ | M-L | B | 1.2 |
| F1-F5 | Vizyoner | ⭐⭐⭐ (uzak) | L | hepsi | 2.x |

## Açık Sorular / Karar Günlüğü

1. **fal.ai mi Replicate mı, ikisi mi?** — C1 başlangıcında güncel model kapsamı ve fiyatlarına bakılıp seçilecek; arayüz soyut tutulacak. *(karar bekliyor)*
2. **Sora/Veo doğrudan API'leri:** erişim/fiyat politikaları değişken; tek-kapı sağlayıcıda yoksa doğrudan uç eklenir. *(uygulamada doğrula)*
3. **Suno/Udio müzik API'si:** resmi API durumu belirsiz — music adımı "varsa" fazına bırakıldı.
4. **SQLite bağımlılığı:** native modül paketleme yükü nedeniyle şimdilik hayır; dosya-tabanlı tarihçe (A5) yeterli, D4 semantik arama gerektirirse yeniden değerlendirilir.
5. **Webhook güvenliği:** içeri kanal varsayılan 127.0.0.1 + token; LAN/dış erişim yalnızca kılavuzdaki bilinçli kurulum yoluyla. Bu ilke pazarlığa kapalı.
6. **Effort/model politikası:** tüm iç yardımcı çağrılar (judge, özetleyici, komuta çubuğu) daima ucuz model — kullanıcı politikası (haiku-önce) kod varsayılanıdır.

## Sürüm Disiplini

Her faz: özellikler → gerçek çalıştırma testleri (ucuz model) → BLUEPRINT + ORNEKLER güncellemesi → paket → bu belgede fazın işaretlenmesi. Bir faz kapanmadan bir sonrakine geçilmez; faz içinde sıralama matristeki önceliğe uyar.

---

*Bu belge yaşayan yol haritasıdır: her önemli karar ve tamamlanan iş buraya işlenir. Bir fikri tartışmak istediğinde ilgili maddenin numarasını söylemen yeter (örn. "B3'ü öne alalım").*
