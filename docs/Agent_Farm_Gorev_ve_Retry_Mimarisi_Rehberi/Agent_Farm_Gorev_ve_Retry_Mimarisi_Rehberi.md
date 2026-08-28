# Agent Farm — Görev, Oturum ve Yeniden Deneme (Retry) Mimarisi

**Kapsamlı Mühendislik Kılavuzu:** Oturum Sürekliliği, Kota Yönetimi, Zamanlama Algoritmaları ve Akıllı Kurtarma  
**Modül:** `vsc_AgentFarm/src/core/tasks.ts` · `retry.ts` · `media/tasksPage.js` · **Doküman Versiyonu:** 2.0

---

## 1. Sistemin Genel Mimarisi ve Temel Kavramlar

Agent Farm ortamında bir **Görev (FarmTask)**, arka planda gözetimsiz (unattended) veya etkileşimli olarak bir yapay zeka ajanı (Claude, Codex, Gemini vb.) tarafından koşturulan bir iş birimidir. Görev oluşturma paneli (New Task Form) kullanıcıya son derece zengin kontrol alanları sunar. Bu kontroller **üç ana mimari eksen** üzerinde çalışır:

1. **Oturum / Bağlam Boyutu (Conversation):** Görevin hafıza temeli: Sıfır oturum mu (New Session), yoksa var olan bir konuşmanın sonraki turu mu (Resume)?
2. **Zamanlama & Limit Boyutu (When):** Arıza/kota durumunda bekleme süresi: Limit Reset saati mi, sabit kademeli dakikalar mı, yoksa formül mü?
3. **Davranış & Prompt Boyutu (What to Say):** Yeniden denerken kime ne söylenecek: Sıfır oturumda `Retry Prompt` mu, yoksa yarım kalan oturumda `Continuation Prompt` mu?

---

## 2. Başlangıç Boyutu: Konuşma ve Oturum Yönetimi (S-19)

Formun en üstündeki `Conversation` seçeneği, görevin **daha ilk çalıştığı an** hangi transkript ve bellek üzerine oturacağını tayin eder.

### Şema 1: Başlangıç Oturum Modellerinin Karşılaştırması

| Özellik | Model A: `a new session` (Varsayılan) | Model B: `continue an existing conversation...` |
| :--- | :--- | :--- |
| **Bellek & Bağlam** | Ajan tamamen temiz bir çalışma alanında başlar. | Geçmiş bir oturumun Session ID'si (`--resume <id>`) bağlanır. |
| **Oturum Kimliği** | Yeni ve benzersiz bir Session UUID oluşturulur. | Eski oturumun transkripti, okuduğu dosyalar ve bağlamı korunur. |
| **Görev Rolü** | Bağımsız bir iş başlatır. | O sohbete **yeni bir tur (next turn)** olarak iletilir. |
| **Maliyet Hesabı** | Baştan sona tüm token tüketimi bu göreve yazılır. | **Maliyet İzolasyonu:** `resumeCostBefore` sayesinde geçmiş turların maliyeti bu göreve yazılmaz; sadece bu turun farkı yazılır. |

> ⚠️ **Hayati Soru:** *"Zaten mevcut bir oturumu devam ettiriyorsam (Model B), Retry kutusunun bir anlamı kalır mı?"*  
> **Cevap: Kesinlikle kalır.** Çünkü mevcut oturuma yeni bir tur gönderdiğiniz an 5 saatlik kullanım kotanız dolmuş olabilir veya oturum sırasında anlık bağlantı kopabilir. Retry devrede olmazsa görev anında `failed` olur; devrede olursa kota açılış saatini bekleyip mesajı o konuşmaya sabah iletir.

> 🔒 **Eşzamanlılık ve Kilit Güvenliği (`session:busy`):** Eğer seçilen oturumu o anda Console veya başka bir terminal penceresi kullanıyorsa, sistem iki ajanın aynı transkript dosyasına aynı anda yazıp dosyayı bozmasını engeller. Görev `parked` durumuna alınır ve kilit serbest kalınca otomatik başlatılır.

---

## 3. Zamanlama Boyutu: Bekleme Süreleri Nasıl Hesaplanır? (M-3, M-10)

Bir görev başarısız olduğunda veya kotaya çarptığında, bir sonraki denemenin ne zaman başlayacağı **kesin bir öncelik piramidi** ile hesaplanır:

### Şema 2: Bekleme Süresi Hesaplama ve Karar Ağacı

```
┌────────────────────────────────────────────────────────────────────────┐
│ AŞAMA 1: Kota / Rate Limit Kontrolü                                    │
│ Hata bir limit hatası mı (isLimitFailure) VE Limit reset açık mı?      │
│                                                                        │
│ ├── EVET (ve attempt == 1): Dakika hesabı yapılmaz!                   │
│ │   CLI çıktısından sıfırlanma saati (05:00) okunur.                   │
│ │   + safetyBufferMin (3 dk) eklenir ──► 05:03'e kadar uyur.          │
│ │                                                                      │
│ └── HAYIR: Aşama 2'ye geçilir.                                        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ AŞAMA 2: İlk Üç Denemenin Özel Kademeleri (1st, 2nd, 3rd wait)         │
│                                                                        │
│ ├── 1. Deneme: "1st wait" (base) uygulanır (Örn: 5 dk).               │
│ ├── 2. Deneme: "2nd wait" doluysa uygulanır (20 dk); BOŞSA Aşama 3.   │
│ └── 3. Deneme: "3rd wait" doluysa uygulanır (60 dk); BOŞSA Aşama 3.   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ AŞAMA 3: 4+ Denemeler veya Boş Kutular için Büyüme Stratejisi (Backoff)│
│                                                                        │
│ ├── "same"    ──► Hep 1st wait süresi kadar sabit bekle                │
│ ├── "double"  ──► Süreyi her seferinde ikiye katla (5, 10, 20, 40 dk)  │
│ ├── "linear"  ──► base × n doğrusal artış (5, 10, 15, 20 dk)          │
│ └── "formula" ──► Kullanıcının yazdığı matematiksel formülü çalıştır  │
│ (Tavan sınır: Never longer than / capMin aşılamaz).                    │
└────────────────────────────────────────────────────────────────────────┘
```

### Neden Limit Reset Sadece 1. Retry İçin Geçerlidir?
**Mühendislik Gerekçesi:** Gece 23:30'da kotaya çarpan görev sabah 05:03'e kadar bekletilir (1. Retry). Sabah 05:03'te görev çalışmaya başladığında **artık 5 saatlik kota DOLU DEĞİLDİR**. Eğer tam o anda anlık bir internet kesintisi veya sunucu hatası (500) olursa, sistemin tekrar 5 saat beklemesi anlamsızdır! İşte bu yüzden 2. ve 3. denemeler için kademeli dakikalar (5 dk, 20 dk vb.) devreye girer.

### Formül (Formula) Motorunun Çalışma Prensibi

`formula` seçeneğinde matematiksel bir ifade yazılır. Bu ifade `eval` ile çalıştırılmaz; güvenli bir ayrıştırıcı (Recursive Descent Parser) ile AST ağacına dönüştürülür.

| Değişken / Fonk. | Anlamı | Örnek Kullanım ve Sonuç |
| :--- | :--- | :--- |
| `n` | Kaçıncı deneme olduğu (4, 5, 6...). | **Örnek 1:** `min(prev * 1.5, 120)`<br>*(Süreyi her adımda %50 artırır ama asla 2 saati / 120 dk'yı geçmez)* |
| `prev` | Bir önceki denemede beklenen dakika. | **Örnek 2:** `min(prev + 15, 60)`<br>*(Her denemede bekleme süresine sabit 15 dk ekler, tavanı 60 dk'dır)* |
| `base` | `1st wait` alanına yazılan taban dakika. | **Örnek 3:** `base * (n - 2)^2`<br>*(Karesel olarak arayı hızla açar)* |
| `min(a,b)`, `max(a,b)` | En küçük / en büyük değeri seçer. | Tavan veya taban sınır koymak için kullanılır. |

---

## 4. Davranış & Prompt Boyutu: Ne Söylenecek ve Nerede Söylenecek? (M-10, M-12)

Agent Farm arayüzündeki üç farklı prompt alanı birbirinin kopyası değildir; görev yaşam döngüsünün tamamen farklı aşamalarında devreye girerler:

### Şema 3: Arıza Evreleri ve Prompt Yönlendirme Algoritması

```
                              [GÖREV BAŞLATILDI]
                                      │
                         (İlk denemede ne söylenecek?)
                                      ▼
                            ┌──────────────────┐
                            │ 1. ANA PROMPT    │
                            └──────────────────┘
                                      │
                         (Görev Başarısız Oldu / Kesildi)
                                      │
           ┌──────────────────────────┴──────────────────────────┐
           ▼                                                     ▼
    [DAVRANIŞ: SIMPLE]                                    [DAVRANIŞ: SMART]
  (Sıfırdan YENİ Oturum)                                (Kaldığı Yerden DEVAM)
           │                                                     │
(Eski oturum çöpe atılır,                             (Transkript incelenir:
 sıfır hafızayla yeni oturum)                          İş yapılmışsa AYNI oturum sürdürülür)
           │                                                     │
           ▼                                                     ▼
┌─────────────────────────────┐                       ┌─────────────────────────────┐
│ 2. RETRY PROMPT             │                       │ 3. CONTINUATION PROMPT      │
│ &bull; Doluysa: Retry Prompt │                       │ &bull; Doluysa: Özel Talimat │
│ &bull; Boşsa: Ana Prompt     │                       │ &bull; Boşsa: Standart Devam │
└─────────────────────────────┘                       └─────────────────────────────┘
```

### Prompt Alanlarının Tam Özeti

| Prompt Alanı | Ne Zaman Devreye Girer? | Boş Bırakılırsa Ne Olur? |
| :--- | :--- | :--- |
| **1. `Prompt` (Ana Prompt)** | Görevin ilk çalıştığı anda iletilen asıl ana talimattır. | **Boş bırakılamaz (Zorunlu).** |
| **2. `Retry prompt`** | `Simple` modda veya sıfırdan yeni oturum açıldığında orijinal yerine gönderilir. | **Ana Promptun aynısını** baştan gönderir. |
| **3. `Continuation prompt`** | `Smart` modda ve görev kotaya takılıp yarıda kaldığında aynı oturuma iletilir. | Yerleşik varsayılanı kullanır: *"Kaldığın yerden devam et. Transkripti ve çalışma klasörünü oku, yapılmış işleri tekrar etmeden orijinal görevi tamamla."* |

---

## 5. Güvenlik Freni: "If it cannot tell" Nedir?

Bu ayar sadece `What a retry is: smart` seçildiğinde görünür. Bir görev çöktüğünde transkript dosyası henüz diske tam yazılmamışsa veya motor çıktı vermeden process sonlanmışsa (`unknown` evresi), sistem iş yapılıp yapılmadığını kesin olarak bilemez.

| Ayar Değeri | Sistemin Eylemi | Risk / Güvenlik Analizi |
| :--- | :--- | :--- |
| **`park`** *(Önerilen)* | Görevi beklemeye alır (`parked`). Arka plan izleyicisi transkripti bağlayıp gerçeği öğrenene kadar bekler; ardından doğru kararı (devam mı, sıfırdan mı) verir. | **En güvenli seçenektir.** Hiçbir kod kaybı veya mükerrer çalışma yaşanmaz. |
| **`simple`** | Beklemez; iş yapılmamış varsayarak sıfırdan yeni oturum açar ve promptu gönderir. | **Riskli:** Aslında dosyalar değiştirilmişse, onları görmeden baştan yapmaya çalışabilir. |
| **`ask`** | Görevi durdurur ve kullanıcıya bildirim (Notice) göndererek ne yapılacağını sorar. | Kullanıcı tam kontrol istediğinde uygundur. |
| **`stop`** | Belirsizlik varsa görevi direkt başarısız (failed) bırakır, tekrar denemez. | Hata toleransı sıfır olan kritik otomasyonlar için. |

---

## 6. Kullanıcı Arayüzü (UI) Değerlendirmesi ve Sadeleştirme

Kullanıcıların bu formda kafa karışıklığı yaşamasının temel sebebi, **nadiren kullanılan parametrelerin sık kullanılanlarla aynı hizada sergilenmesidir**.

### Pratik Formül (Kullanıcı Kılavuzu)
* Kullanıcıların %95'i için `Retry prompt` ve `Continuation prompt` alanlarını **BOŞ BIRAKMAK** en doğru yoldur. Sistem zaten boş bırakıldığında en kusursuz kararları verir.
* `Limit reset` kutucuğunu işaretlemek, gece bırakılan tüm uzun görevleri otomatik olarak korur.
* `If it cannot tell` seçeneğini varsayılan `park` olarak bırakmak en güvenli limandır.

### Gelecek UI Tasarım Önerisi
Form varsayılan olarak yalnızca **Tries**, **1st Wait** ve **Limit Reset** onay kutusunu göstermeli; `2nd/3rd wait`, `Formula`, `Retry Prompt` ve `If it cannot tell` gibi ince mühendislik ayarları *"Gelişmiş Kurtarma Ayarları (Advanced)..."* akordeonu altında toplanmalıdır.

---

## 7. Hızlı Karar Matrisi

| Uygulamak İstediğiniz Senaryo | Seçilmesi Gereken İdeal Parametreler |
| :--- | :--- |
| **1. Gece uzun kodlama / refactor görevi** (Kota biterse sabah devam etsin) | • `Conversation: a new session`<br>• `Limit reset:` ☑️ İşaretli<br>• `What a retry is: smart`<br>• *Prompt kutuları: BOŞ* |
| **2. Gündüz Console'da konuşulan işi arka planda bitirme** | • `Conversation: continue an existing conversation...` (Listeden seç)<br>• `Prompt:` "Tartıştığımız adımları tamamla."<br>• `Limit reset:` ☑️ İşaretli |
| **3. Hata olursa sıfırdan farklı bir talimatla deneme** | • `What a retry is: simple`<br>• `Retry prompt:` "İlk denemede hata aldın, şimdi şu yöntemle baştan yap..." |
| **4. Çok Adımlı Otomatik Süreç** (Analiz ➔ Kodlama ➔ Test ➔ Rapor) | • `Prompt:` "1. Adım: Kod tabanını analiz et."<br>• `+ another prompt (R2):` "2. Adım: Analiz raporuna göre refactor et." (wait: 0 dk)<br>• `+ another prompt (R3):` "3. Adım: Testleri çalıştır." (wait: 2 dk)<br>• `Mode: headless` |

---

## 8. Çok Turlu Görevler ve Otomatik Tur Zinciri (Multi-Round Tasks — M-27 & M-30)

Gözetimsiz arka plan işlerinin en kritik ihtiyacı, **tek bir konuşma içinde sırayla birden fazla aşamayı yürütmektir**. Klasik sistemde "Önce tara, sonra kodu yaz, sonra testleri koş" işi için 3 ayrı görev açmak gerekiyordu; bu da 2. ve 3. görevlerin 1. görevin yaptıklarından tamamen habersiz, sıfır hafızayla uyanmasına yol açıyordu.

**M-27 ile gelen Çok Turlu Görev Zinciri (Round Chain)** mimarisi bu sorunu kökten çözer:

```
[1. Tur Promptu] ──(Cevap Bitti)──► [2. Tur Promptu (R2)] ──(wait: N dk)──► [3. Tur Promptu (R3)]
       │                                     │                                      │
  (Yeni Oturum)                     (AYNI Konuşmaya Devam)                 (AYNI Konuşmaya Devam)
```

### Temel Çalışma Prensipleri

1. **Ana Prompt = 1. Tur:** Formun en üstündeki standart `Prompt` kutusu zincirin başlangıcıdır.
2. **Dinamik Tur Ekleme (`+ another prompt` / `+ Yeni Tur Ekle`):**
   * Butona her basıldığında `R2`, `R3`, `R4`... şeklinde yeni tur satırları açılır.
   * Her satırda o tura özel prompt metin kutusu, `wait: [N] min` gecikme süresi ve `✕` silme butonu yer alır.
3. **Bağlamın Kesintisiz Korunması (`resumeSessionId`):**
   * 1. tur tamamlandığı an sistem oturumun transkript kimliğini (`runSessionId`) yakalar.
   * 2. tur, **aynı oturumu kaldığı yerden resume ederek** ajana iletilir. Ajan 1. turda okuduğu dosyaları, planladığı adımları ve hafızayı aynen bilerek çalışır.
4. **Zamanlayıcı Değil Gerçek Görev Satırı (`notBefore`):**
   * Turlar arasındaki bekleme süreleri (örneğin 10 dakika gecikme), bellekte uçucu bir `setTimeout` ile değil; kuyrukta `notBefore` zaman damgası taşıyan gerçek bir görev satırı (`Görev Adı · R2`) olarak yaşar.
   * Bu sayede VS Code kapansa veya bilgisayar yeniden başlasa bile turlar kaybolmaz; vakti geldiğinde kaldığı dakikadan otomatik tetiklenir ve istenirse kullanıcı tarafından iptal edilebilir.
5. **Retry ile Tur Ayrımı (Mühendislik Kuralı):**
   * **Bir retry ASLA tur sayılmaz.** 2. tur çalışırken kota biter veya hata oluşursa, yapılan yeniden denemeler yine 2. turun sınırları içinde kalır ve turları tüketmez. Yalnızca başarıyla tamamlanan tur bir sonraki turun kapısını açar.
6. **Zamanlanmış Görevler (Schedules) ve Şablon Entegrasyonu:**
   * Çok turlu prompt zincirleri yalnızca anlık görevlerde değil; Daily (Günlük), Weekly (Haftalık) ve OnceAt (Belirli Tarih/Saat) Zamanlayıcılarında ve Görev Şablonlarında (Templates) da birebir desteklenir.
7. **Runs Tablosunda Durum Göstergesi:**
   * Zincirleme görevler Runs tablosunda `R1/4`, `R2/4`, `R3/4` şeklinde rozet taşır; üzerine gelindiğinde kalan turların süreleri ve durumları detaylı olarak okunur.
8. **⚡ Superpowers Mühendislik Disiplini Seçimi (M-30):**
   * Task ve Schedule oluştururken ajanın genel varsayılanına (`agentFarm.superpowersDefaults`) bağımlı kalmadan, göreve özel olarak **Superpowers** (TDD, sistematik hata ayıklama, kök neden analizi disiplin kancası) açılıp kapatılabilir.

