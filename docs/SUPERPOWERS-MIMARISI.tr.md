# Superpowers Mühendislik Disiplini — Mimari, İşleyiş ve Bakım Kılavuzu

Bu belge, Agent Farm'ın **X-55** kapsamında entegre ettiği **Superpowers (v6.3.0)** yazılım mühendisliği disiplinleri kütüphanesinin mimarisini, çalışma prensiplerini, dosya yapısını, taşınabilirlik kurallarını ve ileride nasıl güncelleneceğini/özelleştirileceğini ayrıntılarıyla açıklar.

---

## 1. Temel Felsefe: "Diskte Uyuyan Yetenekler" (Sleep on Disk)

### Problem
Superpowers; Test Güdümlü Geliştirme (TDD), Sistematik Kök Neden Hata Ayıklama, Adım Adım Planlama, Beyin Fırtınası, Doğrulama ve Kod İncelemesi gibi 14 adet derin disiplini içeren zengin bir kütüphanedir. Bu 14 yeteneğin tüm markdown metinlerini her oturumda baştan sistem promptuna yüklemek:
1. Her turda devasa bir token maliyeti yaratır.
2. Basit veya mühendislik gerektirmeyen işlerde (örneğin sadece not alan veya dosya listeleyen bir ajanda) modeli gereksiz bürokrasiye sokar ve yavaşlatır.

### Çözüm Mimarisi
Agent Farm bu sorunu **üç katmanlı hafif mimari** ile çözer:
```
┌────────────────────────────────────────────────────────┐
│ 1. Arayüz Anahtarı (Console Toggle: [⚡ Superpowers])    │
│    Oturum bazında açılıp kapatılabilir;               │
│    developer ajanı için varsayılan olarak AÇIKTIR.     │
└──────────────────────────┬─────────────────────────────┘
                           │ (Açıkken)
                           ▼
┌────────────────────────────────────────────────────────┐
│ 2. Kök Kanca & Dizin Enjeksiyonu (Root Hook & Index)   │
│    Sistem promptuna yalnızca ~2.5 KB'lık Kök Kanca ve  │
│    diskteki 14 yeteneğin ad+açıklama+yol fihristi gider│
│    (Diskteki yetenekler 0 token ile uyur).             │
└──────────────────────────┬─────────────────────────────┘
                           │ (Model ihtiyaç duyduğunda)
                           ▼
┌────────────────────────────────────────────────────────┐
│ 3. Talep Anında Okuma (On-Demand Reading)              │
│    Model bir hata çözerken veya kod yazarken fihriste  │
│    bakar; dosya okuma aracıyla yalnızca ilgili         │
│    SKILL.md dosyasını diskten okur ve disipline girer. │
└────────────────────────────────────────────────────────┘
```

---

## 2. Dosya Yapısı ve Nerede Saklandığı

Tüm yetenekler kalıcı olarak şu sistem klasöründe saklanır:
📂 **Dizin:** `D:\zone\agent\ajanlar\_SKILLS\superpowers\` (veya `agentFarm.superpowersPath` ayarındaki yol).

### Klasör İçeriği ve 14 Disiplin
Klasör altında 14 alt klasör ve her birinde bir `SKILL.md` bulunur:

| Disiplin / Klasör | Görevi ve Ne Zaman Devreye Girdiği |
|---|---|
| **`using-superpowers`** | **KÖK KANCA (Root Hook):** Modele enjekte edilen ana direktif. Modele diğer yetenekleri ne zaman ve nasıl çağıracağını söyler. |
| **`systematic-debugging`** | **Sistematik Hata Ayıklama:** Kök neden bulunmadan yama yazılmasını yasaklar; 4 adımlı kök neden analizi işletir. |
| **`test-driven-development`** | **TDD Disiplini:** Kod yazmadan önce başarısız olan testi yazma (Red-Green-Refactor) kuralını uygulatır. |
| **`writing-plans`** | **Plan Hazırlama:** Karmaşık işleri 2-5 dakikalık atomik adımlara ve testlere böler. |
| **`executing-plans`** | **Plan Yürütme:** Hazırlanan planı adım adım, doğrulayarak işletir. |
| **`verification-before-completion`** | **Tamamlama Öncesi Doğrulama:** Test ve kanıt görmeden "bitti" denilmesini engeller. |
| **`brainstorming`** | **Tasarım & Beyin Fırtınası:** Kodlamaya geçmeden önce gereksinim ve tasarım alternatiflerini netleştirir. |
| **`subagent-driven-development`** | **Alt Ajan Yönetimi:** İşleri bağımsız alt ajanlara görev dağıtarak yürütür. |
| **`requesting-code-review`** | **Kod İncelemesi İsteme:** Yapılan işi özetleyip incelemeye sunar. |
| **`receiving-code-review`** | **İnceleme Geri Bildirimi:** Gelen eleştirileri ve düzeltmeleri değerlendirir. |
| **`dispatching-parallel-agents`** | **Paralel Dağıtım:** Bağımsız işleri paralel iş parçacıklarına böler. |
| **`using-git-worktrees`** | **Git Worktree:** İzole geliştirme dalları açar. |
| **`finishing-a-development-branch`** | **Dal Tamamlama:** Geliştirme dalını merge ve temizlik aşamasına getirir. |
| **`writing-skills`** | **Yetenek Yazma:** Sisteme yeni bir yetenek ekleme standartlarını belirler. |

---

## 3. Klasördeki Markdown Dışı (.sh, .ts, .dot, .html) Dosyalar Neden Var?

Klasör incelendiğinde `SKILL.md` dışında bazı kod ve betik dosyaları görülür:
- `systematic-debugging/condition-based-waiting-example.ts`
- `systematic-debugging/find-polluter.sh`
- `writing-skills/graphviz-conventions.dot` & `render-graphs.js`
- `brainstorming/scripts/` (`frame-template.html`, `helper.js`, `start-server.sh`, vb.)
- `subagent-driven-development/scripts/` (`task-brief`, `review-package`, `sdd-workspace`)

### Bunlar Çöp / Artık Dosya mıdır?
**Hayır, kesinlikle çöp değildir.**
Bu dosyalar, markdown rehberlerinin içinde modele ve geliştiriciye **somut şablon, örnek kod veya yardımcı araç** olarak sunulan dosyalardır:
1. **Somut Kod Örnekleri:** Örneğin model `systematic-debugging` disiplinini okurken asenkron testlerde yarış durumunu (race condition) çözmek istediğinde rehber ona `condition-based-waiting-example.ts` dosyasındaki TypeScript tasarım desenini örnek almasını söyler.
2. **Mimari Şablonlar:** `writing-skills` disiplininde durum makineleri ve akış diyagramları çizilirken `graphviz-conventions.dot` dosyası referans alınır.
3. **Görsel Tasarım Şablonları:** `brainstorming` yaparken kullanıcıya HTML arayüz mock-up'ı sunulmak istendiğinde `frame-template.html` şablonu kullanılır.

Model bu disiplinleri uygularken yalnızca metin okumaz; ihtiyaç anında yanındaki bu yardımcı araç ve şablonları da doğrudan referans alır.

---

## 4. Taşınabilirlik (Portability) ve Ortam Değişkenleri

Sistem farklı makinelerde (Windows, Mac, Linux veya farklı disk dizilimlerinde) sorunsuz çalışacak şekilde tasarlanmıştır:

### A) Yol Değişkenleri Desteği (`expandUserPath`)
Ayarlar dosyasında (`settings.json`) veya arayüzde sabit yol yazmak yerine şu değişkenler kullanılabilir:
- `%USERPROFILE%` / `~` $\rightarrow$ Kullanıcının ev dizini
- `${workspaceRoot}` $\rightarrow$ O an açık olan VS Code çalışma alanı kökü
- `${env:VAR_NAME}` $\rightarrow$ Herhangi bir ortam değişkeni

Örnek:
`"agentFarm.superpowersPath": "%USERPROFILE%/agent/ajanlar/_SKILLS/superpowers"`
veya
`"agentFarm.superpowersPath": "${workspaceRoot}/ajanlar/_SKILLS/superpowers"`

### B) Dinamik Ajan Kökü Fallback'i
Eğer kullanıcı hiçbir ayar girmezse (`superpowersPath: ""`), sistem sabit bir `D:\...` yoluna düşmek yerine eklentinin o an keşfettiği aktif `ajanlar` klasörünün altındaki `_SKILLS/superpowers` dizinine bağlanır. Böylece `ajanlar` klasörü nereye taşınırsa Superpowers da otomatik olarak oradan çalışır.

---

## 5. İleride Güncelleme, Ekleme ve Bakım Nasıl Yapılır?

Sistem **dinamik ve sıfır kod bağımlı (zero hardcoded)** tasarlandığı için dosya güncellemelerinde eklenti kodunu yeniden derlemek gerekmez:

1. **Mevcut Bir Disiplini Değiştirmek / İyileştirmek:**
   İlgili klasördeki `SKILL.md` dosyasını açıp düzenleyin ve kaydedin. Model bir sonraki okumasında güncel metni görecektir.
2. **Kök Kancayı Değiştirmek:**
   `using-superpowers/SKILL.md` dosyasını düzenleyin. Agent Farm önbelleğini her 15 saniyede bir tazelediği için değişiklik anında yeni oturumlara yansır.
3. **Tamamen Yeni Bir Yetenek / Disiplin Eklemek:**
   `_SKILLS/superpowers/` altına yeni bir klasör açın (örn: `guvenlik-denetimi`), içine `SKILL.md` koyun ve başına YAML frontmatter ekleyin:
   ```markdown
   ---
   name: Güvenlik Denetimi
   description: Güvenlik açığı taraması ve OWASP standartları denetimi yaparken kullanın.
   ---
   # Güvenlik Denetimi Kuralları...
   ```
   Agent Farm'ın `readSkills` tarayıcısı bu yeni klasörü otomatik keşfeder ve kanca fihristine ekler.
4. **Superpowers'ın Yeni Bir Sürümü (v7.0 vb.) Çıktığında:**
   Yeni sürüm klasörlerini `_SKILLS/superpowers/` içine kopyalamanız yeterlidir.

---

## 6. Köprü (Bridge) Komutları

Ajanlar ve harici scriptler Superpowers durumunu şu köprü op'ları ile yönetebilir:
- `superpowers.status`: Klasörün yolunu, sağlık durumunu (kaç yetenek var, kanca bulundu mu) ve hangi ajanlarda varsayılan açık olduğunu döner.
- `superpowers.set { agent: "developer", on: true }`: Belirli bir ajan için Superpowers'ın varsayılan açık/kapalı durumunu değiştirir.
- `superpowers.hook`: Modele enjekte edilen güncel kanca ve fihrist metnini döner.
