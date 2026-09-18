# 04. İşletim Sistemi Bağımsızlığı (Cross-Platform Mimarisi)

> Küresel yazılım pazarında yapay zeka araçlarını ve kodlama asistanlarını kullanan geliştiricilerin **%65'inden fazlası macOS veya Linux** üzerinde çalışmaktadır. Agent Farm'ın ticari başarısı, Windows'taki kusursuzluğunu Mac ve Linux'a eksiksiz taşımasına bağlıdır.

---

## 🔍 1. Mevcut Platform Durumu Analizi

| Katman / Modül | Windows | macOS | Linux | Durum |
|---|:---:|:---:|:---:|---|
| **Çekirdek Eklenti (Host & Webview)** | ✅ | ✅ | ✅ | %100 Uyumlu (Node/VS Code API) |
| **CLI Motor Algılama (Claude, Codex, Gemini)** | ✅ | ✅ | ✅ | %100 Uyumlu (`where` / `which`) |
| **Dosya Yolları ve İzinler** | ✅ | ✅ | ✅ | `path.join`, `os.homedir()` doğru kullanılıyor |
| **Arka Plan Servisi (Headless Service)** | ✅ `schtasks` | ❌ Eksik | ❌ Eksik | **En kritik eksik bu katmandadır** |
| **Terminal Çağrıları (Interrupt / Esc)** | ✅ | ⚠️ | ⚠️ | İşletim sistemi sinyalleri (SIGINT) doğrulanmalı |

---

## 🛠 2. Arka Plan Servisi İçin Çözüm Mimarisi

Agent Farm'ın VS Code kapalıyken bile arka planda nöbet tutabilmesi ve zamanlanmış görevleri (`Tasks`) çalıştırabilmesi için her işletim sistemine özel yerel servis katmanı kurulmalıdır:

```
                  ┌───────────────────────────────┐
                  │   Agent Farm Headless Core    │
                  │        (src/service/af.ts)    │
                  └───────────────┬───────────────┘
                                  │
         ┌────────────────────────┼────────────────────────┐
         ▼                        ▼                        ▼
  [Windows Servisi]        [macOS Servisi]          [Linux Servisi]
   schtasks /create         launchd (.plist)         systemd --user
  onlogon tetikleyicisi    ~/Library/LaunchAgents   ~/.config/systemd/user
```

### A. macOS Desteği (`launchd`)
* Hedef dosya: `~/Library/LaunchAgents/dev.agentfarm.service.plist`
* Komut: `launchctl load ~/Library/LaunchAgents/dev.agentfarm.service.plist`
* `installFarmService` çağrısı `process.platform === 'darwin'` durumunda plist dosyasını otomatik oluşturmalı ve yüklemelidir.

### B. Linux Desteği (`systemd`)
* Hedef dosya: `~/.config/systemd/user/agentfarm.service`
* Komutlar: `systemctl --user enable agentfarm.service && systemctl --user start agentfarm.service`
* `process.platform === 'linux'` durumunda kullanıcı birim servisini devreye almalıdır.

---

## 🧪 3. Çapraz Platform Test ve Doğrulama Matrisi

1. **macOS Sonoma / Sequoia Testi:**
   - Homebrew ile kurulu `claude`, `codex` binary'lerinin doğru algılanması (`/opt/homebrew/bin` ve `/usr/local/bin` PATH kontrolleri).
   - Apple Silicon (M1/M2/M3/M4) mimarisinde ripgrep ikilisinin doğru çalışması (`@vscode/ripgrep` ARM64 uyumu).
2. **Ubuntu / Debian / Fedora Linux Testi:**
   - İzin yönetimi (`chmod +x`), `systemd --user` lingering ayarları.

---

## 📋 Uygulama Görevleri (Checklist)

- [ ] `src/service/serviceManager.ts` içinde platform ayrımını soyutla (`WindowsServiceManager`, `MacServiceManager`, `LinuxServiceManager`).
- [ ] macOS `launchd` plist üreticisini ve kurulum komutlarını ekle.
- [ ] Linux `systemd` servis dosyası üreticisini ve kurulum komutlarını ekle.
- [ ] CI/CD üzerinde (GitHub Actions) macOS ve Ubuntu ortamlarında otomatik test süitini koştur.
