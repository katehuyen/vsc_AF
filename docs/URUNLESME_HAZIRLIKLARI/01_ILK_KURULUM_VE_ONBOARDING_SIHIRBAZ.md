# 01. İlk Kurulum, Onboarding ve Hoş Geldin Sihirbazı

> Bir geliştirici aracı için en kritik an, kullanıcının eklentiyi kurduktan sonraki **ilk 60 saniyesidir**. Kullanıcı bu sürede değer görmezse eklentiyi devre dışı bırakır veya unutur.

---

## 🛑 Mevcut Sorunlar (As-Is Durumu)

1. **Boş Komuta Merkezi Sendromu (Cold Start):**
   Eklenti ilk kurulduğunda hiçbir ajan tanımlı değildir. Sol paneldeki ağaçlar boş gelir, Dashboard boştur. Kullanıcı ne yapacağını bilmez.
2. **Kullanıcıya Özel Sabit Yollar (Hardcoded Defaults):**
   `package.json` içindeki `agentFarm.agentRoots` varsayılan değeri yerel geliştirici yolunu taşımamalıdır; ilk kurulumda temiz başlamalıdır.
3. **Belge Kalabalığı:**
   4.900 satırlık muazzam bir Blueprint vardır, ancak yeni başlayan biri için adım adım 3 adımlı basit bir giriş kapısı yoktur.

---

## 🛠 Çözüm Mimarisi

### 1. Hazır Ajan Şablonları Galerisi (Starter Pack Gallery)

Kullanıcının sıfırdan `CLAUDE.md`, `DUTIES.md` veya bellek mimarisi yazması beklenemez. Eklentiyle birlikte gömülü (veya 1 tıkla çekilebilen) 5 temel uzman ajan şablonu sunulmalıdır:

| Şablon Ajan | Uzmanlık ve Görevi | İçerdiği Dosyalar |
|---|---|---|
| 🔍 **Code Auditor & Reviewer** | PR ve kod kalitesi denetimi, güvenlik taraması, mimari uyumluluk kontrolü. | `CLAUDE.md`, `DUTIES.md` (her commit sonrası kontrol), kurallar |
| 🏗 **System Architect** | Yeni özellik tasarımı, teknik spesifikasyon çıkarma, planlama. | `CLAUDE.md`, planlama şablonları |
| ⚡ **Refactoring Specialist** | Kod sadeleştirme, performans optimizasyonu, debt temizliği. | `CLAUDE.md`, refactoring kılavuzları |
| 🐞 **Bug Hunter & Test Eng** | Hata kök neden analizi, birim/entegrasyon testi üretimi. | `CLAUDE.md`, test yürütme kuralları |
| 📚 **Docs & Wiki Master** | Koddan teknik dokümantasyon, API referansı ve wiki çıkarma. | `CLAUDE.md`, markdown standartları |

---

### 2. Hoş Geldin Sihirbazı (Onboarding Wizard) — Tasarım & Akış

Sihirbazı **hem ilk kurulumun başlangıcı hem de istendiğinde Ayarlar'dan tekrar çağrılabilen** interaktif bir deneyim olarak konumlandırıyoruz:

```
[Adım 1: Motor Taraması] 
 └── Kurulu CLI motorlarını algıla (Claude Code: ✅, Codex: ⚠️, Gemini: ❌)
      ↓
[Adım 2: Çalışma Alanı Seçimi] 
 └── Ajanların yaşayacağı klasörü seç (Örn: ~/my-agents veya mevcut proje altı)
      ↓
[Adım 3: Hazır Filo Kurulumu] 
 └── "Başlangıç Ajan Paketini Kur" (Code Reviewer + Bug Hunter tek tıkla açılsın)
      ↓
[Adım 4: İlk Zafer (First Win)] 
 └── Console'da seçili ajanla 10 saniyelik ilk deneme turu ("Merhaba, bu projeyi analiz et")
```

---

### 3. Teknik Uygulama Seçenekleri

* **Seçenek A — VS Code Native Walkthrough (`contributes.walkthroughs`):**
  - VS Code'un yerel "Get Started" sekmesinde açılır.
  - Çok hafiftir, VS Code standartlarına %100 uyar.
  - Adımlarda doğrudan komut butonları (`agentfarm.wizard.step1` vb.) tetiklenebilir.
* **Seçenek B — Özel Zengin Webview Sihirbazı (`AFWizard`):**
  - Animasyonlu, canlı CLI motor kontrolü yapan, paketleri görsel kartlarla seçtiren modern bir webview arayüzü.
* **Karar / Öneri:**
  Her ikisinin hibrit kullanımı: VS Code'un yerel Walkthrough'u karşılar, "Görsel Kurulum Sihirbazını Aç" düğmesi ile zengin Webview deneyimine yönlendirir.

---

## 📋 Uygulama Görevleri (Checklist)

- [ ] `package.json` içindeki `agentFarm.agentRoots` varsayılanını temizle (`[]` veya `~/.agentfarm/agents`).
- [ ] `starter-packs/` dizini oluşturup 5 temel ajan paketini ekle (`packGallery`).
- [ ] `AFWizard` bileşenini veya `walkthrough` katkısını `package.json`'a ekle.
- [ ] İlk açılışta `agentRoots` boşsa otomatik olarak Sihirbazı tetikleyen akıllı kontrolü ekle (`viewsWelcome`).
