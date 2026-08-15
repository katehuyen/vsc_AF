
**USER** (11:19 AM (04:19 UTC))

bir de Tasks  kısmında bir takım düzeltmeler iyileştirmeler yaptık mesela eskiden 5 saatlik limite takıldığı zaman daha önceden ayarlanmış olan sabit bir süre boyunca bekleyip ondan sonra tekrar deniyordu ve tekrar denemesi de aynı ilk gönderdiği promtu bir kere daha göndermek oluyordu şimdi kullanıcıya ikinci gönderdiğini artık farklı bir prompt  olarak gönderme şansı tanıdık ama da çok daha önemlisi de artık sabit bekleme sonrasında tekrar denemek yerine körlemesine akıllıca limit süresi ne kadar kalmış ne kadar sonra limit resetlenecek buna bakıyor buna baktıktan sonra o sürenin sonunda üzerine belki birkaç dakika ekleyerek ne zaman tekrar deneyeceğini o zaman denemek için ayarlıyor gibi bir şey yapmaya çalıştık ama bu gerçekten olmuş mu kodlama tarafında bakarsan bunu görebiliyor musun doğru ve başarılı bir şekilde yapılmış mı bir buna bak önce var mı gerçekten ve başarılı mı diye bak çünkü bir de ikinci olarak kullanınca ara yüzü tarafında bu özellik nereden nasıl kullanılıyor ben onu da anlamadım yani ben daha önce zannediyordum ki ya otomatik ayarla gibi bir seçenek olacak onu seçtiği zaman kendisi artık sabit süre girilmiş olsa bile sonraki denemeler için bu seçtiği limite göre otomatik olmasını istediği seçenek ile sabit süre bekleme uygulamasını kendisi ezecek diye düşünüyordum ama kullanıcı arıyorsun da ben bu tür bir şey de görmedim yani acaba gerçekten bunun sistemi getirildi mi getirilme ne kadar getirildi getirildiği ise tam getirildiysek o zaman kullanıcı arayüzünde bunun kullanım şekli nedir bütün bunları bir bilmek istiyorum

**GEMINI** (▸ reply · 11:21 AM (04:21 UTC) · gemini-3.7-flash)

Evet, bahsettiğiniz sistem **Agent Farm kod tabanında (özellikle M-3, M-10 ve M-12 geliştirmeleri kapsamında) tam ve eksiksiz bir şekilde inşa edilmiştir ve çalışmaktadır.**

Aşağıda hem kodlama tarafındaki teknik kanıtı hem de bu özelliğin kullanıcı arayüzünde (UI) nerede ve nasıl kullanıldığını adım adım bulabilirsiniz:

---

### 1. Kodlama Tarafı: Sistem Gerçekten Var mı ve Nasıl Çalışıyor?

Kodlama tarafında [`src/core/retry.ts`](file:///D:/zone/dev/git/miropharm/vsc_AgentFarm/src/core/retry.ts) ve [`src/core/tasks.ts`](file:///D:/zone/dev/git/miropharm/vsc_AgentFarm/src/core/tasks.ts) içinde üç ana mekanizma kurulmuştur:

1. **Akıllı Limit Reset Yakalama ([`parseLimitReset`](file:///D:/zone/dev/git/miropharm/vsc_AgentFarm/src/core/retry.ts#L767-L847) & [`planLimitReset`](file:///D:/zone/dev/git/miropharm/vsc_AgentFarm/src/core/retry.ts#L874-L906)):**
   * Motorun kendi kullanım kotası verisine bakar (`engineResetAt`).
   * Eğer orada yoksa, CLI çıktısının son satırlarını tarar (`resets 5am`, `resets at 17:30`, `resets in 45 minutes`, `resets_at 173...` gibi tüm formatları ayrıştırır).
   * Bulduğu reset saatine kullanıcının belirlediği emniyet payını (`safetyBufferMin`, varsayılan **3 dakika**) ekler.
   * Görevi kuyruğa `resetAt: notBefore` damgasıyla koyar ve sabit süreyi ezerek o saate kadar bekletir. Ekranda satır üzerinde `waiting until 17:33 (limit reset 17:30 + 3 min)` şeklinde gerekçesiyle yazar.

2. **Smart Continuation (Kaldığı Yerden Akıllı Devam - [`classifyFailure`](file:///D:/zone/dev/git/miropharm/vsc_AgentFarm/src/core/retry.ts#L634)):**
   * Bir görev başarısız olduğunda sistem transkripti inceler:
     * Eğer hiç iş yapamadan çöktüyse (`not_started`): Normal retry yapar (ilk promptu tekrar yollar).
     * Eğer 40 dakika çalışıp dosyalara dokunmuş ama limite takılıp yarıda kesildiyse (`interrupted`): İlk promptu körlemesine baştan yollamak yerine **o konuşmayı kaldığı yerden resume eder** ve bir sonraki tur olarak **`Continuation prompt`** ("kaldığın yerden devam et, transkripti oku ve bitir") gönderir.

3. **Farklı / Özel Prompt İmkânı (`retryPrompt` & `continuationPrompt`):**
   * Normal retry için orijinal prompt yerine geçecek özel bir prompt tanımlanabilir.
   * Smart devam için de `{taskTitle}`, `{attempt}`, `{failureReason}`, `{resetAt}` değişkenlerini içeren devam promptları kullanılabilir.

---

### 2. Kullanıcı Arayüzünde (UI) Nereden ve Nasıl Kullanılıyor?

Bu özellik kullanıcı arayüzünde **2 farklı yerde** mevcuttur:

#### A) Tasks Sayfasında Görev Oluştururken ([`Tasks -> Run / New Task`](file:///D:/zone/dev/git/miropharm/vsc_AgentFarm/media/tasksPage.js#L896-L1005))
Tasks sekmesinde yeni bir görev (Headless modda) tanımlarken formun alt kısmına bakın:

1. **`If it fails`** açılır kutusu bulunur. Varsayılan olarak `use my default` (ayarlarımdaki genel politikayı uygula) seçilidir.
2. Bu kutuyu **`set it here`** (bu görev için özel ayarla) olarak değiştirdiğinizde formun altına tüm bu gelişmiş ayarlar açılır:
   * **`Tries`:** Kaç kez deneneceği (örn. 3 veya 6).
   * **`1st wait` / `2nd wait` / `3rd wait`:** 1., 2. ve 3. denemeler için ayrı dakika süreleri.
   * **`Limit reset` (Checkbox):** **`wait for the window to reopen instead of guessing (1st retry)`**
     * 👉 **İşte aradığınız seçenek tam olarak bu onay kutusudur.** Bu kutu işaretlendiğinde, sabit dakika beklemesi yerine motorun bildirdiği limit saatini (`resets 5am` vb.) esas alır.
   * **`Safety buffer`:** Reset saatinin üzerine eklenecek dakika payı (varsayılan `3` dk).
   * **`Retry prompt`:** Başarısız olursa orijinal prompt yerine gönderilecek metin (boş bırakılırsa aynı prompt gider).
   * **`What a retry is`:**
     * `simple (a fresh run)`: Temiz yeni oturum açar.
     * `smart (continue it)`: Yarıda kesilmişse o oturumu resume edip devam ettirir.
   * **`Continuation prompt`:** `smart` seçildiğinde devam turunda ajana ne söyleneceği (boş bırakılırsa yerleşik "kaldığın yerden devam et" talimatını gönderir).

---

#### B) VS Code Genel Ayarlarında (`Settings -> Agent Farm -> Task Retry`)
Her seferinde formda `set it here` ile tek tek ayarlamak istemiyorsanız, bu davranışı tüm filonuz için **varsayılan** yapabilirsiniz:

VS Code Ayarlarını açıp (`Ctrl+,`) `agentFarm.taskRetry` araması yaptığınızda (veya `settings.json` dosyanızda) şu ayarları kaydedebilirsiniz:

```json
"agentFarm.taskRetry": {
  "max": 5,
  "resetAware": true,
  "safetyBufferMin": 3,
  "behavior": "smart",
  "when": "limit"
}
```

Bu ayarı bir kez yaptığınızda, Tasks formunda **`use my default`** seçili kalsa bile sistem otomatik olarak:
1. 5 saatlik limite takılınca CLI'ın reset saatine bakar,
2. Sabit süreyi ezip `reset saati + 3 dakika` sonrasına görevi erteler,
3. Zamanı gelince eski oturumu resume ederek ajanı kaldığı yerden devam ettirir.

