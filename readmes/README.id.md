# Sealos Skills

<!-- README-I18N:START -->

[English](../README.md) | [简体中文](./README.zh-CN.md) | [繁體中文](./README.zh-TW.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [Español](./README.es.md) | [Français](./README.fr.md) | [Deutsch](./README.de.md) | [Português (Brasil)](./README.pt-BR.md) | [Русский](./README.ru.md) | [العربية](./README.ar.md) | [हिन्दी](./README.hi.md) | **Bahasa Indonesia**

<!-- README-I18N:END -->

Deploy proyek ke [Sealos Cloud](https://sealos.io) dari agen AI Anda.

Sealos Skills adalah paket skill berbasis plugin yang berfokus pada pengembangan dan deployment Sealos Cloud. Paket ini membantu agen AI memeriksa proyek, menyiapkan artefak deployment yang belum tersedia, menghubungkan database dan object storage Sealos Cloud untuk pengembangan, membuat atau menggunakan kembali image container, mengirim aplikasi ke Sealos Cloud, dan melihat resource yang telah di-deploy dalam canvas lokal hanya-baca.

Jalur Codex yang direkomendasikan adalah instalasi plugin Codex native. Instalasi plugin lintas host, `skills.sh`, dan host ekstensi khusus konteks seperti Gemini CLI dan Qwen Code menggunakan sumber root `skills/**` yang sama.

## Mulai Cepat

### Direkomendasikan: instal di Codex

Tambahkan repositori ini sebagai Codex marketplace, lalu instal plugin Sealos:

```bash
codex plugin marketplace add labring/sealos-skills
codex plugin add sealos@sealos
```

Satu plugin Sealos menginstal skill deployment, database, S3, canvas, app builder, dan cloud-native pendukung dari root `skills/**`: `sealos-deploy`, `sealos-database`, `sealos-s3`, `sealos-canvas`, `sealos-app-builder`, `cloud-native-readiness`, `dockerfile-skill`, dan `docker-to-sealos`.

Untuk kompatibilitas dan pengujian Codex lokal, instal plugin yang sama dengan:

```bash
npx plugins add https://github.com/labring/sealos-skills --target codex
```

Setelah instalasi di Codex, gunakan plugin dari Codex:

- **Codex CLI:** ketik `$sealos`
- **Codex App:** klik tombol **+** di sudut kiri bawah input chat, pilih **Plugins**, lalu pilih **Sealos**

![Pilih plugin Sealos di Codex App](../assets/codex-sealos.png)

Contoh Codex:

```text
$sealos deploy this repo to Sealos Cloud
$sealos deploy /path/to/project
$sealos deploy https://github.com/labring-sigs/kite
$sealos create a cloud Postgres database for this repo and wire DATABASE_URL
$sealos create private S3 object storage for uploads and wire env vars
```

### Instal di Claude Code

Tambahkan repositori ini sebagai Claude Code marketplace, lalu instal plugin Sealos:

```bash
claude plugin marketplace add labring/sealos-skills
claude plugin install sealos@sealos
```

Untuk kompatibilitas dengan penginstal plugin lintas host, instal plugin yang sama dengan:

```bash
npx plugins add https://github.com/labring/sealos-skills --target claude-code
```

Jika Anda hanya menggunakan satu alat agen yang terdeteksi di mesin, Anda dapat membiarkan `plugins` memilih target:

```bash
npx plugins add https://github.com/labring/sealos-skills
```

Setelah instalasi di Claude Code, gunakan `/sealos`:

```text
/sealos deploy this repo to Sealos Cloud
/sealos deploy /path/to/project
/sealos deploy https://github.com/labring-sigs/kite
/sealos create a cloud Postgres database for this repo and wire DATABASE_URL
/sealos create private S3 object storage for uploads and wire env vars
```

### Alat AI lain yang didukung

| Alat | Instalasi | Penggunaan |
| --- | --- | --- |
| Codex CLI / Codex App | `codex plugin marketplace add labring/sealos-skills` lalu `codex plugin add sealos@sealos` | `$sealos` di Codex CLI, atau **+** → **Plugins** → **Sealos** di Codex App |
| Claude Code | `claude plugin marketplace add labring/sealos-skills` lalu `claude plugin install sealos@sealos` | `/sealos` |
| Jalur kompatibilitas Claude Code | `npx plugins add https://github.com/labring/sealos-skills --target claude-code` | `/sealos` |
| OpenClaw / ClawHub | `clawhub install labring/sealos-skills` | Eksposur perintah host bergantung pada runtime ClawHub |
| CodeBuddy | `/plugin marketplace add labring/sealos-skills` | Eksposur perintah host bergantung pada runtime CodeBuddy |
| Gemini CLI | `gemini extensions install https://github.com/labring/sealos-skills` | Ekstensi khusus konteks; minta Gemini menggunakan Sealos Skills |
| Qwen Code | `qwen extensions install https://github.com/labring/sealos-skills` | Ekstensi khusus konteks; minta Qwen menggunakan Sealos Skills |
| Amp / Kimi / pengimpor repositori generik | Impor `https://github.com/labring/sealos-skills.git` | Bergantung pada host |

Manifest Gemini CLI dan Qwen Code menyediakan konteks repositori melalui `CLAUDE.md`; keduanya tidak menyatakan dukungan slash command.

### Alternatif: instal sebagai paket skill `skills.sh`

Jika agen Anda menggunakan `skills.sh` secara langsung, instal paket skill yang sama dengan:

```bash
npx skills add labring/sealos-skills
```

Kemudian jalankan skill deployment secara langsung:

```text
/sealos-deploy
/sealos-deploy /path/to/project
/sealos-deploy https://github.com/labring-sigs/kite
/sealos-database create a cloud Postgres database for this repo and wire DATABASE_URL
/sealos-s3 create private object storage for uploads and wire env vars
```

Setelah proyek di-deploy, gunakan skill `sealos-canvas` melalui entry point plugin yang telah diinstal.

`/sealos-deploy`, `/sealos-database`, dan `/sealos-s3` adalah entry skill langsung `skills.sh`. Penggunaan plugin dilakukan melalui `$sealos` di Codex atau `/sealos` di Claude Code.

## Mengapa Menggunakan Plugin

Instalasi plugin direkomendasikan untuk Codex dan Claude Code karena:

- menginstal semua skill Sealos sebagai satu paket terkelola
- menyediakan skill yang sama di seluruh alat agen yang didukung
- menyatukan metadata plugin, logo, prompt, perintah, dan kapabilitas
- menghindari pemeliharaan salinan paket skill terpisah

## Distribusi Plugin

Integrasi Codex mengikuti [panduan pembuatan plugin Codex dari OpenAI](https://developers.openai.com/codex/plugins/build):

- `.codex-plugin/plugin.json` berisi identitas plugin, metadata penemuan, teks antarmuka, prompt default, metadata merek, dan path aset yang relatif terhadap root repositori.
- `.agents/plugins/marketplace.json` mendaftarkan plugin lokal repositori ini untuk pengujian Codex marketplace lokal.
- `.claude-plugin/plugin.json` dan `.claude-plugin/marketplace.json` mendefinisikan permukaan plugin yang kompatibel dengan Claude Code.
- `distribution/platforms.json` mencatat klaim dukungan platform dan buktinya.
- `marketplaces/README.md` mengelola aturan marketplace dan mencegah klaim dukungan perintah yang berlebihan.
- `scripts/validate-codex-plugin.py` memvalidasi manifest Codex, metadata Claude Code, marketplace repositori, registri platform, dan path aset.
- `skills/**/SKILL.md` tetap menjadi satu-satunya sumber skill; jangan tambahkan salinan paket kedua.

Validasi metadata plugin sebelum memublikasikan atau mendorong perubahan manifest:

```bash
python3 scripts/validate-codex-plugin.py
python3 -m json.tool .codex-plugin/plugin.json >/dev/null
python3 -m json.tool plugin.json >/dev/null
python3 -m json.tool .agents/plugins/marketplace.json >/dev/null
python3 -m json.tool marketplace.json >/dev/null
python3 -m json.tool .claude-plugin/plugin.json >/dev/null
python3 -m json.tool .claude-plugin/marketplace.json >/dev/null
python3 -m json.tool distribution/platforms.json >/dev/null
```

## Cara Kerja Penyiapan

Anda hanya memerlukan agen AI yang kompatibel dengan plugin atau `skills.sh` dan sebuah proyek untuk di-deploy.

Selama alur deployment, database, dan object storage, Sealos Skills akan:

- memeriksa ketersediaan alat seperti Docker dan `kubectl`
- memandu pengguna melalui login Sealos saat diperlukan
- menggunakan `sealos-cli` untuk membuat database Sealos Cloud, mengambil detail koneksi, dan menjalankan operasi database
- menggunakan `sealos-cli s3` untuk bucket object storage Sealos, kredensial, pemeriksaan kuota, operasi objek, dan URL presigned
- menggunakan atau membantu menyiapkan path registry container seperti Docker Hub atau GHCR

Deployment aktual memerlukan akun Sealos Cloud dan akses ke registry container, tetapi keduanya tidak harus sepenuhnya disiapkan sebelum skill dimulai. Pekerjaan database dan object storage memerlukan akun Sealos Cloud serta workspace yang dapat membuat resource yang diminta.

## Yang Ditangani Sealos Deploy

Dalam deployment umum, agen akan:

- menilai struktur proyek dan kebutuhan runtime
- menggunakan kembali image yang ada atau membuatnya saat diperlukan
- menghasilkan template Sealos
- melakukan deployment dan memverifikasi rollout
- memverifikasi Sealos App URL aktual, log, alur login atau penyiapan untuk aplikasi web, dan seluruh cakupan resource sebelum menyatakan aplikasi siap digunakan

Eksekusi berikutnya dapat beralih ke alur pembaruan in-place saat deployment yang ada terdeteksi.

## Yang Ditangani Sealos Database

Untuk proyek lokal atau Devbox yang membutuhkan database cloud, agen akan:

- mendeteksi sinyal database seperti `DATABASE_URL`, Prisma, Drizzle, MongoDB, MySQL, atau Redis
- menggunakan `sealos-cli database` untuk membuat daftar, membuat, memeriksa, dan menghubungkan database Sealos Cloud
- hanya menulis key env lokal yang diperlukan tanpa menampilkan secret di chat
- memverifikasi jalur database nyata aplikasi melalui migrasi, introspeksi, atau pemeriksaan startup
- mengelola akses publik hanya setelah konfirmasi

## Yang Ditangani Sealos S3

Untuk proyek lokal atau Devbox yang membutuhkan object storage kompatibel S3, agen akan:

- mendeteksi sinyal object storage seperti key env S3, penggunaan AWS SDK, MinIO, path upload, atau kode URL presigned
- menggunakan `sealos-cli s3` dari `zjy365/sealos-cli#28` untuk membuat daftar, membuat, memeriksa, dan memperbarui bucket object storage
- menginisialisasi kredensial S3 hanya saat diperlukan dan menjaga access key agar tidak muncul di chat
- menghubungkan key env lokal minimum untuk bucket, endpoint, access key, secret key, region, dan pengaturan path-style
- memverifikasi perilaku upload, list, download, delete, atau URL presigned menggunakan jalur penyimpanan nyata proyek
- membuat bucket publik atau merotasi kredensial hanya setelah konfirmasi

## Yang Ditangani Sealos Canvas

Untuk repositori yang telah di-deploy oleh Sealos Deploy, agen akan:

1. Membaca `.sealos/state.json` untuk menemukan aplikasi yang di-deploy.
2. Mengueri namespace Sealos dengan perintah `kubectl get` hanya-baca.
3. Memulai UI canvas `127.0.0.1` sementara.
4. Menampilkan dan membuka alamat UI lokal untuk pemeriksaan.

Jika proyek belum di-deploy, Sealos Canvas berhenti dan mengarahkan pengguna untuk men-deploy proyek terlebih dahulu.

## Skill yang Disertakan

Plugin dan paket `skills.sh` menyediakan sumber skill yang sama:

- `sealos-deploy` — deploy proyek lokal atau GitHub ke Sealos Cloud
- `sealos-database` — membuat, menghubungkan, dan mengoperasikan database Sealos Cloud untuk pengembangan
- `sealos-s3` — membuat bucket, menghubungkan kredensial, memeriksa kuota, dan mengoperasikan object storage kompatibel Sealos S3
- `sealos-canvas` — melihat resource Sealos yang di-deploy dalam UI canvas lokal hanya-baca
- `sealos-app-builder` — membuat aplikasi Sealos Desktop dengan integrasi SDK
- `cloud-native-readiness` — menilai kesiapan deployment
- `dockerfile-skill` — menghasilkan Dockerfile siap produksi
- `docker-to-sealos` — mengonversi layanan Docker Compose menjadi template Sealos

## Repositori

[`skills/`](../skills) adalah satu-satunya sumber kebenaran untuk deployment Sealos, canvas Sealos, dan skill pendukung yang digunakan selama alur deployment. Direktori skill tingkat root yang sama melayani instalasi `skills.sh` dan setiap manifest plugin atau ekstensi dalam repositori ini.

File distribusi penting:

- [`.codex-plugin/plugin.json`](../.codex-plugin/plugin.json) — manifest plugin Codex
- [`.agents/plugins/marketplace.json`](../.agents/plugins/marketplace.json) — entri Codex marketplace lokal
- [`.claude-plugin/plugin.json`](../.claude-plugin/plugin.json) — manifest plugin yang kompatibel dengan Claude Code
- [`marketplace.json`](../marketplace.json) dan [`.claude-plugin/marketplace.json`](../.claude-plugin/marketplace.json) — entri marketplace yang kompatibel dengan Claude
- [`.codebuddy-plugin/marketplace.json`](../.codebuddy-plugin/marketplace.json) — entri CodeBuddy marketplace
- [`gemini-extension.json`](../gemini-extension.json) — ekstensi konteks Gemini CLI
- [`qwen-extension.json`](../qwen-extension.json) — ekstensi konteks Qwen Code
- [`openclaw.plugin.json`](../openclaw.plugin.json) — penunjuk bundle OpenClaw / ClawHub
- [`commands/sealos.md`](../commands/sealos.md) — entry perintah plugin `/sealos` untuk host yang kompatibel
- [`distribution/platforms.json`](../distribution/platforms.json) — registri dukungan platform
- [`marketplaces/README.md`](../marketplaces/README.md) — aturan marketplace dan kepemilikan klaim dukungan
- [`scripts/validate-codex-plugin.py`](../scripts/validate-codex-plugin.py) — skrip validasi plugin Codex

Jangan tambahkan salinan paket skill kedua. Root `skills/**` adalah satu-satunya sumber skill untuk semua jalur instalasi.

## Lisensi

MIT
