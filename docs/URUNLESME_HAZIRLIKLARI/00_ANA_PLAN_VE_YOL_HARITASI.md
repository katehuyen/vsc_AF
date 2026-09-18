# Agent Farm — Ürünleştirme ve Ticarileştirme Ana Planı

> Bu klasör ve altındaki belgeler, Agent Farm'ın yerel bir geliştirme aracından **dünya çapında satılabilir, sürdürülebilir gelir üreten ticari bir VS Code ürününe** dönüştürülmesi sürecindeki tüm mimari, finansal, teknik ve pazarlama kararlarını yönetir.

---

## 🧭 Vizyon ve Temel Konumlandırma

**Agent Farm nedir?**
Tek bir modele veya araca kilitli olmayan; Claude Code, Codex, Gemini CLI, Antigravity ve OpenCode motorlarını tek çatı altında toplayan, otonom nöbet tutabilen, akıllı çoklu hesap rotasyonu yapabilen, çoklu-ajan misyonları koordine eden ve geliştiricinin terminal bağımlılığını kaldıran **Dünyanın İlk Yerel Yapay Zeka Ajan Filosu Komuta Merkezi**.

**Rakiplerden Temel Farkı:**
- **Cursor / Windsurf:** IDE'nin kendisini değiştirmeye zorlar, kapalı modellere kilitler.
- **Roo Code / Cline / Claude Dev:** Tekil oturum odaklıdır, filo yönetimi, bütçe optimizasyonu, kota kurtarma ve otonom nöbet tutma yetenekleri yoktur.
- **Agent Farm:** Geliştiricinin mevcut terminal/CLI aboneliklerini (Claude, ChatGPT Plus/Team, Gemini vb.) doğrudan bağlar, sıfır ek API marjı ile çalışır, arka planda gece nöbetleri tutar ve geliştiriciye tam mülkiyet verir.

---

## 📂 Belge Modül Haritası

Bu klasördeki her alt belge, ürünleşmenin bağımsız bir cephesini ele alır:

| Belge | Kapsam ve Odak Alanı |
|---|---|
| **[01_ILK_KURULUM_VE_ONBOARDING_SIHIRBAZ.md](01_ILK_KURULUM_VE_ONBOARDING_SIHIRBAZ.md)** | Sıfırdan kurulum (Zero-to-One), varsayılan ayarların temizlenmesi, hazır ajan paketleri (Fleet Gallery / Templates) ve 60 saniyelik karşılama sihirbazı (Welcome Wizard). |
| **[02_MONETIZATION_VE_LISANSLAMA_MODELLERI.md](02_MONETIZATION_VE_LISANSLAMA_MODELLERI.md)** | Gelir modelleri (Freemium, Pro, Team/Enterprise), Hangi özelliklerin Pro kapısına alınacağı (Sentry, multi-account, missions vs.), lisans anahtarı doğrulama mimarisi ve ödeme entegrasyonları. |
| **[03_MARKETPLACE_VITRINI_VE_PAZARLAMA.md](03_MARKETPLACE_VITRINI_VE_PAZARLAMA.md)** | VS Code Marketplace vitrini, `package.json` etiket ve meta verileri, ekran görüntüleri/GIF'ler, video rehberler, konumlandırma ve lansman taktiği. |
| **[04_ISLETIM_SISTEMI_BAGIMSIZLIGI_CROSS_PLATFORM.md](04_ISLETIM_SISTEMI_BAGIMSIZLIGI_CROSS_PLATFORM.md)** | Windows dışındaki dünyayı (macOS `launchd`, Linux `systemd`) kapsama, yol taşınabilirliği, platform bağımsız arka plan servisleri. |
| **[05_VSCODE_SURUM_UYUMU_VE_GUNCELLEME_STRATEJISI.md](05_VSCODE_SURUM_UYUMU_VE_GUNCELLEME_STRATEJISI.md)** | VS Code çekirdek motor sürümü (`engines.vscode`) uyumu, en güncel sürümlerle testler, olası kırılmalar, Language Model/Chat API entegrasyon fırsatları. |

---

## 📊 Durum ve Öncelik Matrisi

```
[1. Adım: Temizlik & Vitrin]
 ├── Sıfır kullanıcı hardcode'u (agentRoots: [])
 ├── Marketplace meta verileri & README vitrini
 └── 60 saniyelik Hoş Geldin Sihirbazı (Walkthrough)

[2. Adım: Hazır Değer (Pack Gallery)]
 ├── 5 Adet Tak-Çalıştır Temel Ajan Şablonu
 └── Tek Tıkla Ajan İçe Aktarma & Başlatma

[3. Adım: Gelir Motoru (Monetization Engine)]
 ├── Free vs Pro Özellik Ayrımının Netleştirilmesi
 ├── Hafif & Çevrimdışı Lisans Doğrulama Katmanı
 └── Lemon Squeezy / Polar / Stripe Ödeme Sayfası

[4. Adım: Ekosistem & Platform Genişlemesi]
 ├── macOS / Linux Arka Plan Servisleri
 └── VS Code Güncel Sürüm Doğrulama & Regresyon Testleri
```

---

## 🎯 Karar Alma İlkeleri

1. **Kullanıcının Yerel Güvenliği Asla Bozulamaz:** Lisans kontrolü veya telemetri hiçbir zaman kullanıcının kodunu veya konuşmalarını sunucuya göndermez. Yerellik ilkesi (Local-First) ürünün en büyük satış vaadidir.
2. **Kendi Başına Çalışabilirlik:** İlk kuran kullanıcı hiçbir şey bilmese bile 1 dakika içinde hazır bir ajanın çalıştığını görüp "Aha!" anını yaşamalıdır.
3. **Şeffaf Fiyatlandırma:** Kullanıcıları sürpriz API faturalarıyla boğmayan, var olan hesaplarını maksimize eden net ve adil bir model.
