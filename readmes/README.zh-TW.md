# Sealos Skills

<!-- README-I18N:START -->

[English](../README.md) | [简体中文](./README.zh-CN.md) | **繁體中文** | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [Español](./README.es.md) | [Français](./README.fr.md) | [Deutsch](./README.de.md) | [Português (Brasil)](./README.pt-BR.md) | [Русский](./README.ru.md) | [العربية](./README.ar.md) | [हिन्दी](./README.hi.md) | [Bahasa Indonesia](./README.id.md)

<!-- README-I18N:END -->

透過 AI 代理程式將專案部署到 [Sealos Cloud](https://sealos.io)。

Sealos Skills 是一套以外掛程式為核心、專注於 Sealos Cloud 開發與部署的技能包。它能協助 AI 代理程式檢查專案並準備缺少的部署產物。它能連接 Sealos Cloud 資料庫與物件儲存以進行開發。它會建置或重複使用容器映像、將應用程式部署到 Sealos Cloud，並在本機唯讀畫布中顯示已部署的資源。

一個 `npx plugins add` 命令即可將外掛程式安裝到所有偵測到的代理工具中。Codex 和 Claude Code 的原生 marketplace 安裝使用相同的根目錄 `skills/**` 來源。`skills.sh` 以及 Gemini CLI、Qwen Code 等僅提供內容的擴充主機也使用它。

## 快速開始

### TLDR

```bash
npx plugins add https://github.com/labring/sealos-skills
```

一個命令即可將 Sealos 外掛程式安裝到所有偵測到的代理工具中：Claude Code、Cursor、Codex、Grok Build、Kimi Code、GitHub Copilot CLI 和 VS Code。執行 `npx plugins targets` 可列出偵測到的工具，或使用 `--target <tool>` 僅安裝到單一工具。

### 在 Codex 中以原生方式安裝

將此儲存庫加入 Codex marketplace，然後安裝 Sealos 外掛程式：

```bash
codex plugin marketplace add labring/sealos-skills
codex plugin add sealos@sealos
```

外掛程式會從根目錄 `skills/**` 安裝全部八個技能。各技能的作用請參閱下方的**包含的技能**。

在 Codex 中完成安裝後，透過以下方式使用外掛程式：

- **Codex CLI：** 輸入 `$sealos`
- **Codex App：** 按一下聊天輸入框左下角的 **+** 按鈕，然後選擇 **Plugins** → **Sealos**

![在 Codex App 中選擇 Sealos 外掛程式](../assets/codex-sealos.png)

Codex 範例：

```text
$sealos deploy this repo to Sealos Cloud
$sealos deploy /path/to/project
$sealos deploy https://github.com/labring-sigs/kite
$sealos create a cloud Postgres database for this repo and wire DATABASE_URL
$sealos create private S3 object storage for uploads and wire env vars
```

### 在 Claude Code 中以原生方式安裝

將此儲存庫加入 Claude Code marketplace，然後安裝 Sealos 外掛程式：

```bash
claude plugin marketplace add labring/sealos-skills
claude plugin install sealos@sealos
```

在 Claude Code 中完成安裝後，使用 `/sealos`：

```text
/sealos deploy this repo to Sealos Cloud
/sealos deploy /path/to/project
/sealos deploy https://github.com/labring-sigs/kite
/sealos create a cloud Postgres database for this repo and wire DATABASE_URL
/sealos create private S3 object storage for uploads and wire env vars
```

### 支援的 AI 工具

| 工具 | 安裝 | 用法 |
| --- | --- | --- |
| Codex CLI / Codex App | `npx plugins add https://github.com/labring/sealos-skills --target codex`，或參閱上文**在 Codex 中以原生方式安裝** | 在 Codex CLI 中使用 `$sealos`，或在 Codex App 中依序選擇 **+** → **Plugins** → **Sealos** |
| Claude Code | `npx plugins add https://github.com/labring/sealos-skills --target claude-code`，或參閱上文**在 Claude Code 中以原生方式安裝** | `/sealos` |
| Cursor / Grok Build / Kimi Code / Copilot CLI / VS Code | `npx plugins add https://github.com/labring/sealos-skills` | 安裝後透過主機命令進入點使用 |
| OpenClaw / ClawHub | `clawhub install labring/sealos-skills` | 主機命令的公開方式取決於 ClawHub 執行階段 |
| CodeBuddy | `/plugin marketplace add labring/sealos-skills` | 主機命令的公開方式取決於 CodeBuddy 執行階段 |
| Gemini CLI | `gemini extensions install https://github.com/labring/sealos-skills` | 僅提供內容的擴充功能；請 Gemini 使用 Sealos Skills |
| Qwen Code | `qwen extensions install https://github.com/labring/sealos-skills` | 僅提供內容的擴充功能；請 Qwen 使用 Sealos Skills |
| Amp / 通用儲存庫匯入器 | 匯入 `https://github.com/labring/sealos-skills.git` | 取決於主機 |

Gemini CLI 和 Qwen Code 資訊清單透過 `CLAUDE.md` 提供儲存庫內容；它們不宣稱支援斜線命令。

### 替代方式：安裝為 `skills.sh` 技能包

如果你的代理程式直接使用 `skills.sh`，可透過以下命令安裝相同的技能包：

```bash
npx skills add labring/sealos-skills
```

接著直接執行部署技能：

```text
/sealos-deploy
/sealos-deploy /path/to/project
/sealos-deploy https://github.com/labring-sigs/kite
/sealos-database create a cloud Postgres database for this repo and wire DATABASE_URL
/sealos-s3 create private object storage for uploads and wire env vars
```

專案部署完成後，透過已安裝的外掛程式進入點使用 `sealos-canvas` 技能。

`/sealos-deploy`、`/sealos-database` 和 `/sealos-s3` 是 `skills.sh` 的直接技能進入點。外掛程式使用應透過 Codex 中的 `$sealos` 或 Claude Code 中的 `/sealos` 進行。

## Sealos Deploy 的處理範圍

在一般部署中，代理程式將：

- 評估專案結構和執行階段需求
- 重複使用現有映像，或在需要時建置映像
- 產生 Sealos 範本
- 部署並驗證推出狀態
- 在回報應用程式可用前，驗證實際的 Sealos App URL、日誌、Web 應用程式的登入或設定流程，以及完整資源範圍

存在既有部署時，後續執行會切換為原地更新流程。

## Sealos Database 的處理範圍

對於需要雲端資料庫的本機專案或 Devbox，代理程式將：

- 偵測 `DATABASE_URL`、Prisma、Drizzle、MongoDB、MySQL 或 Redis 等資料庫訊號
- 使用 `sealos-cli database` 列出、建立、檢查和連接 Sealos Cloud 資料庫
- 僅寫入所需的本機環境變數鍵，並避免在聊天中公開密鑰
- 透過移轉、內省或啟動檢查驗證應用程式的實際資料庫路徑
- 僅在取得確認後管理公用存取

## Sealos S3 的處理範圍

對於需要 S3 相容物件儲存的本機專案或 Devbox，代理程式將：

- 偵測 S3 環境變數鍵、AWS SDK 使用情況、MinIO、上傳路徑或預先簽署 URL 程式碼等物件儲存訊號
- 使用 `zjy365/sealos-cli#28` 中的 `sealos-cli s3` 列出、建立、檢查和更新物件儲存貯體
- 僅在需要時初始化 S3 憑證，並避免在聊天中公開存取金鑰
- 寫入所需的最少本機環境變數鍵，包括儲存貯體、端點、存取金鑰、密鑰、區域和路徑樣式設定
- 透過專案的實際儲存路徑驗證上傳、列出、下載、刪除或預先簽署 URL 行為
- 僅在取得確認後公開儲存貯體或輪替憑證

## Sealos Canvas 的處理範圍

對於已由 Sealos Deploy 部署的儲存庫，代理程式將：

1. 讀取 `.sealos/state.json` 以找出已部署的應用程式。
2. 使用唯讀 `kubectl get` 命令查詢 Sealos 命名空間。
3. 啟動暫時的 `127.0.0.1` 畫布 UI。
4. 輸出並開啟本機 UI 位址供檢查。

如果專案尚未部署，Sealos Canvas 會停止並引導使用者先部署專案。

## 設定流程

你只需要一個相容外掛程式或相容 `skills.sh` 的 AI 代理程式，以及一個要部署的專案。

在部署、資料庫和物件儲存流程中，Sealos Skills 將：

- 檢查 Docker 和 `kubectl` 等工具是否可用
- 在需要時引導使用者登入 Sealos
- 使用 `sealos-cli` 建立 Sealos Cloud 資料庫、取得連線詳細資料並執行資料庫操作
- 使用 `sealos-cli s3` 管理 Sealos 物件儲存貯體、憑證、配額檢查、物件操作和預先簽署 URL
- 使用或協助準備 Docker Hub、GHCR 等容器登錄路徑

實際部署仍需要 Sealos Cloud 帳戶和容器登錄存取權，這些項目可以在技能啟動後再完成設定。資料庫和物件儲存工作需要 Sealos Cloud 帳戶，以及具備建立所需資源權限的工作區。

## 包含的技能

外掛程式和 `skills.sh` 技能包公開相同的技能來源：

- `sealos-deploy` — 將本機或 GitHub 專案部署到 Sealos Cloud
- `sealos-database` — 為開發建立、連接和操作 Sealos Cloud 資料庫
- `sealos-s3` — 建立儲存貯體、連接憑證、檢查配額並操作 Sealos S3 相容物件儲存
- `sealos-canvas` — 在本機唯讀畫布 UI 中查看已部署的 Sealos 資源
- `sealos-app-builder` — 使用 SDK 整合建置 Sealos Desktop 應用程式
- `cloud-native-readiness` — 評估部署準備程度
- `dockerfile-skill` — 產生適用於生產環境的 Dockerfile
- `docker-to-sealos` — 將 Docker Compose 服務轉換為 Sealos 範本

## 為何使用外掛程式

建議在 Codex、Claude Code 和其他支援的代理工具中使用外掛程式安裝，因為它可以：

- 將所有 Sealos 技能安裝為一個受管理的套件
- 在支援的代理工具中公開相同的技能
- 集中管理外掛程式中繼資料、標誌、提示、命令和功能
- 省去維護另一份技能包副本的工作

## 維護本儲存庫

以下小節面向儲存庫維護者和外掛程式發布者，使用者無需閱讀。

### 外掛程式發布

Codex 整合遵循 [OpenAI Codex 外掛程式建置指南](https://developers.openai.com/codex/plugins/build)：

- `.codex-plugin/plugin.json` 包含外掛程式識別資訊、探索中繼資料、介面文案、預設提示、品牌中繼資料，以及相對於儲存庫根目錄的資源路徑。
- `.agents/plugins/marketplace.json` 註冊此儲存庫的本機外掛程式，用於本機 Codex marketplace 測試。
- `.claude-plugin/plugin.json` 和 `.claude-plugin/marketplace.json` 定義與 Claude Code 相容的外掛程式介面。
- `.qoder-plugin/plugin.json` 定義 Qoder 外掛程式介面，並明確公開全部八個 Codex 技能。
- `qoder.md` 提供 Qoder 層級的路由和安全說明，不複製技能實作。
- `distribution/platforms.json` 記錄平台支援聲明和證據。
- `marketplaces/README.md` 維護 marketplace 規則，避免誇大命令支援範圍。
- `scripts/validate-codex-plugin.py` 驗證 Codex 資訊清單、Claude Code 中繼資料、儲存庫 marketplace、平台登錄和資源路徑。
- `scripts/package-qoder-plugin.py` 建置外掛程式資訊清單位於封存根目錄的 Qoder 相容 ZIP 套件。
- `skills/**/SKILL.md` 始終是唯一的技能來源；請勿新增第二份封裝副本。

發布或推送資訊清單變更前，請驗證外掛程式中繼資料：

```bash
python3 scripts/validate-codex-plugin.py
python3 -m json.tool .codex-plugin/plugin.json >/dev/null
python3 -m json.tool plugin.json >/dev/null
python3 -m json.tool .agents/plugins/marketplace.json >/dev/null
python3 -m json.tool marketplace.json >/dev/null
python3 -m json.tool .claude-plugin/plugin.json >/dev/null
python3 -m json.tool .claude-plugin/marketplace.json >/dev/null
python3 -m json.tool .qoder-plugin/plugin.json >/dev/null
python3 -m json.tool distribution/platforms.json >/dev/null
```

### 儲存庫結構

[`skills/`](../skills) 是 Sealos 部署、Sealos 畫布和部署流程配套技能的唯一事實來源。相同的根層級技能目錄同時服務 `skills.sh` 安裝和此儲存庫中的所有外掛程式或擴充功能資訊清單。

重要發布檔案：

- [`.codex-plugin/plugin.json`](../.codex-plugin/plugin.json) — Codex 外掛程式資訊清單
- [`.agents/plugins/marketplace.json`](../.agents/plugins/marketplace.json) — 本機 Codex marketplace 項目
- [`.claude-plugin/plugin.json`](../.claude-plugin/plugin.json) — 與 Claude Code 相容的外掛程式資訊清單
- [`.qoder-plugin/plugin.json`](../.qoder-plugin/plugin.json) — Qoder 外掛程式資訊清單
- [`qoder.md`](../qoder.md) — Qoder 外掛程式路由和安全說明
- [`marketplace.json`](../marketplace.json) 和 [`.claude-plugin/marketplace.json`](../.claude-plugin/marketplace.json) — 與 Claude 相容的 marketplace 項目
- [`.codebuddy-plugin/marketplace.json`](../.codebuddy-plugin/marketplace.json) — CodeBuddy marketplace 項目
- [`gemini-extension.json`](../gemini-extension.json) — Gemini CLI 內容擴充功能
- [`qwen-extension.json`](../qwen-extension.json) — Qwen Code 內容擴充功能
- [`openclaw.plugin.json`](../openclaw.plugin.json) — OpenClaw / ClawHub 套件指標
- [`commands/sealos.md`](../commands/sealos.md) — 相容主機的 `/sealos` 外掛程式命令進入點
- [`distribution/platforms.json`](../distribution/platforms.json) — 平台支援登錄
- [`marketplaces/README.md`](../marketplaces/README.md) — marketplace 規則和支援聲明歸屬
- [`scripts/validate-codex-plugin.py`](../scripts/validate-codex-plugin.py) — Codex 外掛程式驗證指令碼
- [`scripts/package-qoder-plugin.py`](../scripts/package-qoder-plugin.py) — Qoder ZIP 封裝指令碼

請勿新增第二份封裝技能副本。根目錄 `skills/**` 是所有安裝路徑的唯一技能來源。

## 授權

MIT
