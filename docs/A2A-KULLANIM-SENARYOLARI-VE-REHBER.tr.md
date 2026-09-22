# A2A (Agent-to-Agent) Kullanım Alanları ve Gerçek Hayat Senaryoları Rehberi

Bu doküman, Agent Farm bünyesinde kurulan **A2A (Notes & Tasks)** sisteminin neden var olduğunu, hangi pratik ihtiyaçlardan doğduğunu ve hem insan gözetiminde hem de otonom süreçlerde hangi gerçek hayat senaryolarında kullanılacağını açıklar.

---

## 1. Temel Felsefe: "Ajan Neden Başka Ajana Mesaj Bıraksın?"

Tek bir canlı oturumda insan ile ajan arasındaki sohbet doğrusal ve basittir: İnsan ister, ajan yapar, oturum biter. Eğer tüm mimari yalnızca bu tekil sohbetten ibaret olsaydı, ajanlar arası bir panoya ihtiyaç duyulmazdı.

Ancak Agent Farm; **oturum devirleri, kota sınırları, otonom zamanlayıcılar, kolektif misyonlar ve çoklu uzmanlık modelleri** barındıran yaşayan bir filo sistemidir. Bu sistemde iletişim kanalları net bir işbölümüne sahiptir:

```
[ 🔔 Notices (unread) ]  [ 📥 Queue (blocked) ]  |  [ 🤖 A2A Notes ]  [ ⚡ A2A Tasks ]
─────────────────────────────────────────────────┼─────────────────────────────────
       İNSAN ↔ AJAN KANALLARI                    │       AJAN ↔ AJAN KANALLARI
   - Notices: Ajan ➔ İnsan (rapor, soru, haber)   │   - A2A Notes: Ajan ➔ Ajan (teknik hafıza)
   - Queue  : İnsan ➔ Ajan (iş talep havuzu)      │   - A2A Tasks: Ajan ➔ Ajan (görev devri)
```

**Altın Kural:** İnsana duyuru veya soru gidecekse yer **`Notices`**; ajanların kendi aralarında teknik bağlam bırakması veya iş paslaması gerekiyorsa yer **`A2A`** panolarıdır.

---

## 2. Gerçek Hayat Senaryoları

### Senaryo 1: Proje Dışı Çalışma (Backlog'suz Serbest Alan)
- **Problem:** Bir proje içinde çalışırken (`PRS.MuratVural...` gibi) oturmuş bir altyapı vardır: `Backlog.md` vardır, kodlu işler (`K-43`, `S-66`) vardır, `Worklog.md` vardır. Yarım kalan bir şey backlog kalemi olarak açılabilir. Ancak sistem sadece projelerden ibaret değildir. Proje dışı serbest geliştirmelerde, anlık altyapı işlerinde veya genel organizasyonda (`genel` ajanı) **ortada bir backlog yoktur**.
- **A2A Çözümü:** Ajan yarım kalan bir işi, keşfettiği bir engeli veya yapılması gereken bir sonraki adımı havada bırakmamak için ne proje klasörünü kirletir ne de bürokrasi yaratır; işi doğrudan **`A2A Tasks`** panosuna asar.

### Senaryo 2: Kolektif Çalışma — Missions & Workflows Omurgası
- **Problem:** Çoklu ajanın ortak bir hedef için çalıştığı misyonlarda (`missions.start`) orkestratör ajan (`manager`), tüm işi tek bir oturumda yapamaz ve yapmamalıdır.
- **A2A Çözümü:** 
  - Orkestratör hedefi alt parçalara böler ve panoya asar (`targetRole: "developer"`, `targetRole: "explorer"`).
  - İşi üstlenen ajan görevi kilitler (`claim`), kalp atışıyla ilerleme bildirir (`heartbeat`) ve bitince sonucu teknik not olarak bırakır (`category: "result"`).
  - Döngü koruyucusu (`loop guard`) işin 3 kereden fazla el değiştirmesini engeller.
  - A2A, misyon ve iş akışlarının arkasındaki **asenkron merkezi sinir sistemi (bus)** olarak çalışır.

### Senaryo 3: Oturumlar Arası "Teknik Hafıza" (A2A Notes)
- **Problem:** Canlı oturumda geliştirici ajan kod tabanında kritik bir değişiklik yaptı (örneğin SQLite veritabanında yeni bir kilitleme mekanizması kurdu). Oturum kapandı. Yarın açılan yeni bir ajan, dünkü sohbet geçmişini bilmediği için eski senkron yöntemle veritabanına yazmaya kalkabilir ve sistemi kilitleyebilir.
- **A2A Çözümü:** Ajan kapanırken kullanıcıya gereksiz teknik gürültü yapmamak için Notices yerine A2A Notes panosuna teknik bir fısıltı bırakır:
  > *`[A2A Note] AgentFarm/core: Doğrudan db.exec çalıştırmayın, yeni withLock sarmalayıcısını kullanın.`*
  Sonraki oturumda o projede çalışan ajan bu notu okur ve tuzağa düşmez.

### Senaryo 4: Kota ve Bağlam Duvarında İş Devri (Session Handoff & Baton)
- **Problem:** 5 saatlik kota %90'a dayandığında veya bağlam penceresi %35-40 eşiğine ulaştığında oturum kural gereği durmak ve devredilmek zorundadır. Ajanın o an üzerinde çalıştığı işin bir adımı kalmış olabilir.
- **A2A Çözümü:** Ajan tamamlayamadığı adımı havada bırakmaz; `A2A Tasks` panosuna talimatları, değiştirilecek dosyaları ve kabul kriterlerini içeren bir devir görevi (`handoff`) bırakır. Yeni oturum açıldığında veya kullanıcı görev panelinden tıkladığında iş kaldığı yerden devam eder.

### Senaryo 5: Başsız (Headless) / Zamanlanmış Ajanların Otonom Koordinasyonu
- **Problem:** Gece veya sabah erken saatte zamanlanmış bir nöbetçi ajan (örneğin sabah 05:00'te çalışan `manager`) iş kuyruğunu tarar ve sistemde acil bir kod düzeltmesi gerektiğini fark eder. Başında canlı bir insan yoktur ve manager kod yazma yetkisine sahip değildir.
- **A2A Çözümü:** Manager görevi `A2A Tasks` panosuna asar (`targetRole: "developer"`). Kullanıcı sabah VS Code'u açtığında görev panoda hazır bekler; ister tek tıkla (`⚡ Run Now`) anında çalıştırır, ister ilk açılan developer oturumu işi otomatik çeker.

### Senaryo 6: Rol ve Model Ekonomisi (Uzmanlık Ayrımı)
- **Problem:** Kullanıcı developer ajanına (Opus) kod yazdırırken araya derin bir dokümantasyon araştırması veya rakip incelemesi girer. Pahalı bir kodlama modelinin tarayıcı arama turlarıyla kotayı tüketmesi verimsizdir.
- **A2A Çözümü:** Developer araştırma kısmını `targetRole: "explorer"` (Sonnet) olarak panoya bırakır. Explorer araştırmayı yapıp sonucu rapora bağlar. Developer sadece çıkan temiz sonuca göre kodunu yazar.

### Senaryo 7: Süpervizör Kokpiti — İnsanın Müdahale ve Hızlandırma Noktası
- **Kullanıcı Gücü:** A2A sistemi sadece ajanların kapalı devresi değildir. Kullanıcı VS Code'daki A2A panosundan tüm bu trafiği izler:
  - **`+` butonu:** Bekleyen herhangi bir göreve anında kısıt (`constraint`), yönlendirme (`steer`) veya veto (`veto`) ekleyebilir. Bu direktif ajana `⚠️ [HUMAN SUPERVISOR DIRECTIVE]` olarak enjekte edilir ve tüm ajan kararlarını ezer.
  - **`Re-route`:** Yanlış ajana giden işi tek tıkla başka ajana yönlendirebilir.
  - **`⚡ Run Now`:** Panoda bekleyen bir işi zamanlayıcıyı beklemeden, hemen o an başlatabilir.

---

## 3. Karar ve Eylem Matrisi (Nereye Yazmalı?)

| Durum / İhtiyaç | Doğru Kanal | Yanlış Kanal | Neden? |
|---|---|---|---|
| Kullanıcıya rapor, özet, durum veya soru iletmek | **`🔔 Notices`** | `🤖 A2A Notes` | Kullanıcı A2A'yı günlük mesajlaşma yeri olarak okumak zorunda kalmamalı. |
| Kullanıcının ajana yapılması için iş bırakması | **`📥 Work Queue`** | `⚡ A2A Tasks` | İnsanın iş kuyruğu ile ajanların iç görev devri birbirine karışmamalı. |
| Bir projenin kalıcı, resmi geliştirme adımları | **`Backlog.md`** | `⚡ A2A Tasks` | Proje kapsamı resmi kodlarla (`P-1`, `X-10`) kendi dosyasında yaşamalıdır. |
| Proje dışı serbest alanda yarım kalan bir teknik iş | **`⚡ A2A Tasks`** | `Backlog.md` | Ortada bir proje yokken sahte backlog yaratılmaz. |
| Oturumlar arası teknik uyarı, kural, mimari keşif | **`🤖 A2A Notes`** | `🔔 Notices` | Kullanıcıyı ilgilendirmeyen teknik kod detaylarıyla bildirim çanı kirletilmez. |
| Misyon/workflow içi alt adımların diğer ajanlara devri | **`⚡ A2A Tasks`** | Serbest Prompt | Sahiplik (claim/lease), döngü koruması ve bütçe tavanı mekanik güvenceye alınır. |
