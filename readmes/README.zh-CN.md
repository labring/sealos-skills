# Sealos Skills

<!-- README-I18N:START -->

[English](../README.md) | **简体中文** | [繁體中文](./README.zh-TW.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [Español](./README.es.md) | [Français](./README.fr.md) | [Deutsch](./README.de.md) | [Português (Brasil)](./README.pt-BR.md) | [Русский](./README.ru.md) | [العربية](./README.ar.md) | [हिन्दी](./README.hi.md) | [Bahasa Indonesia](./README.id.md)

<!-- README-I18N:END -->

通过 AI 智能体将项目部署到 [Sealos Cloud](https://sealos.io)。

Sealos Skills 是一个以插件为先、专注于 Sealos Cloud 开发和部署的技能包。它可以帮助 AI 智能体检查项目、补齐缺失的部署产物、连接 Sealos Cloud 数据库和对象存储用于开发、构建或复用容器镜像、将应用发布到 Sealos Cloud，并在本地只读画布中查看已部署的资源。

Codex 的推荐方式是安装原生 Codex 插件。跨主机插件安装、`skills.sh` 以及 Gemini CLI 和 Qwen Code 等仅提供上下文的扩展主机，都使用同一个根目录 `skills/**` 源。

## 快速开始

### 推荐：在 Codex 中安装

将此仓库添加为 Codex marketplace，然后安装 Sealos 插件：

```bash
codex plugin marketplace add labring/sealos-skills
codex plugin add sealos@sealos
```

一个 Sealos 插件会从根目录 `skills/**` 安装部署、数据库、S3、画布、应用构建器和配套的云原生技能：`sealos-deploy`、`sealos-database`、`sealos-s3`、`sealos-canvas`、`sealos-app-builder`、`cloud-native-readiness`、`dockerfile-skill` 和 `docker-to-sealos`。

为了兼容其他安装方式并进行本地 Codex 测试，也可以使用以下命令安装同一插件：

```bash
npx plugins add https://github.com/labring/sealos-skills --target codex
```

在 Codex 中完成安装后，通过以下方式使用插件：

- **Codex CLI：** 输入 `$sealos`
- **Codex App：** 点击聊天输入框左下角的 **+** 按钮，选择 **Plugins**，再选择 **Sealos**

![在 Codex App 中选择 Sealos 插件](../assets/codex-sealos.png)

Codex 示例：

```text
$sealos deploy this repo to Sealos Cloud
$sealos deploy /path/to/project
$sealos deploy https://github.com/labring-sigs/kite
$sealos create a cloud Postgres database for this repo and wire DATABASE_URL
$sealos create private S3 object storage for uploads and wire env vars
```

### 在 Claude Code 中安装

将此仓库添加为 Claude Code marketplace，然后安装 Sealos 插件：

```bash
claude plugin marketplace add labring/sealos-skills
claude plugin install sealos@sealos
```

为了兼容跨主机插件安装器，也可以使用以下命令安装同一插件：

```bash
npx plugins add https://github.com/labring/sealos-skills --target claude-code
```

如果机器上只检测到一个智能体工具，可以让 `plugins` 自动选择目标：

```bash
npx plugins add https://github.com/labring/sealos-skills
```

在 Claude Code 中完成安装后，使用 `/sealos`：

```text
/sealos deploy this repo to Sealos Cloud
/sealos deploy /path/to/project
/sealos deploy https://github.com/labring-sigs/kite
/sealos create a cloud Postgres database for this repo and wire DATABASE_URL
/sealos create private S3 object storage for uploads and wire env vars
```

### 其他受支持的 AI 工具

| 工具 | 安装 | 用法 |
| --- | --- | --- |
| Codex CLI / Codex App | 先运行 `codex plugin marketplace add labring/sealos-skills`，再运行 `codex plugin add sealos@sealos` | 在 Codex CLI 中使用 `$sealos`，或在 Codex App 中依次选择 **+** → **Plugins** → **Sealos** |
| Claude Code | 先运行 `claude plugin marketplace add labring/sealos-skills`，再运行 `claude plugin install sealos@sealos` | `/sealos` |
| Claude Code 兼容路径 | `npx plugins add https://github.com/labring/sealos-skills --target claude-code` | `/sealos` |
| OpenClaw / ClawHub | `clawhub install labring/sealos-skills` | 主机命令的暴露方式取决于 ClawHub 运行时 |
| CodeBuddy | `/plugin marketplace add labring/sealos-skills` | 主机命令的暴露方式取决于 CodeBuddy 运行时 |
| Gemini CLI | `gemini extensions install https://github.com/labring/sealos-skills` | 仅提供上下文的扩展；让 Gemini 使用 Sealos Skills |
| Qwen Code | `qwen extensions install https://github.com/labring/sealos-skills` | 仅提供上下文的扩展；让 Qwen 使用 Sealos Skills |
| Amp / Kimi / 通用仓库导入器 | 导入 `https://github.com/labring/sealos-skills.git` | 取决于主机 |

Gemini CLI 和 Qwen Code 清单通过 `CLAUDE.md` 提供仓库上下文；它们不声明对斜杠命令的支持。

### 备选方式：作为 `skills.sh` 技能包安装

如果你的智能体直接使用 `skills.sh`，可通过以下命令安装同一技能包：

```bash
npx skills add labring/sealos-skills
```

然后直接运行部署技能：

```text
/sealos-deploy
/sealos-deploy /path/to/project
/sealos-deploy https://github.com/labring-sigs/kite
/sealos-database create a cloud Postgres database for this repo and wire DATABASE_URL
/sealos-s3 create private object storage for uploads and wire env vars
```

项目部署完成后，通过已安装的插件入口使用 `sealos-canvas` 技能。

`/sealos-deploy`、`/sealos-database` 和 `/sealos-s3` 是 `skills.sh` 的直接技能入口。插件使用应通过 Codex 中的 `$sealos` 或 Claude Code 中的 `/sealos` 进行。

## 为什么使用插件

Codex 和 Claude Code 推荐使用插件安装，因为它可以：

- 将所有 Sealos 技能作为一个托管包安装
- 在受支持的智能体工具中暴露同一组技能
- 统一管理插件元数据、徽标、提示词、命令和能力
- 省去维护单独技能包副本的工作

## 插件分发

Codex 集成遵循 [OpenAI Codex 插件构建指南](https://developers.openai.com/codex/plugins/build)：

- `.codex-plugin/plugin.json` 包含插件标识、发现元数据、界面文案、默认提示词、品牌元数据，以及相对于仓库根目录的资源路径。
- `.agents/plugins/marketplace.json` 注册此仓库的本地插件，用于本地 Codex marketplace 测试。
- `.claude-plugin/plugin.json` 和 `.claude-plugin/marketplace.json` 定义与 Claude Code 兼容的插件界面。
- `distribution/platforms.json` 记录平台支持声明和证据。
- `marketplaces/README.md` 维护 marketplace 规则，避免夸大命令支持范围。
- `scripts/validate-codex-plugin.py` 验证 Codex 清单、Claude Code 元数据、仓库 marketplace、平台注册表和资源路径。
- `skills/**/SKILL.md` 始终是唯一的技能源；不要添加第二份打包副本。

发布或推送清单变更前，请验证插件元数据：

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

## 设置流程

你只需要一个兼容插件或兼容 `skills.sh` 的 AI 智能体，以及一个待部署项目。

在部署、数据库和对象存储流程中，Sealos Skills 将：

- 检查 Docker 和 `kubectl` 等工具是否可用
- 在需要时引导用户登录 Sealos
- 使用 `sealos-cli` 创建 Sealos Cloud 数据库、获取连接详情并执行数据库操作
- 使用 `sealos-cli s3` 管理 Sealos 对象存储桶、凭据、配额检查、对象操作和预签名 URL
- 使用或协助准备 Docker Hub、GHCR 等容器镜像仓库路径

实际部署仍需 Sealos Cloud 账户和容器镜像仓库访问权限，这些内容可以在技能启动后再完成设置。数据库和对象存储工作需要 Sealos Cloud 账户，以及具备创建所需资源权限的工作区。

## Sealos Deploy 的处理范围

在典型部署中，智能体将：

- 评估项目结构和运行时需求
- 复用现有镜像，或在需要时构建镜像
- 生成 Sealos 模板
- 部署并验证发布状态
- 在报告应用可用前，验证真实的 Sealos App URL、日志、Web 应用的登录或设置流程，以及完整资源范围

后续运行在检测到现有部署时可以切换为原地更新流程。

## Sealos Database 的处理范围

对于需要云数据库的本地项目或 Devbox，智能体将：

- 检测 `DATABASE_URL`、Prisma、Drizzle、MongoDB、MySQL 或 Redis 等数据库信号
- 使用 `sealos-cli database` 列出、创建、检查和连接 Sealos Cloud 数据库
- 仅写入所需的本地环境变量键，并避免在聊天中暴露密钥
- 通过迁移、内省或启动检查验证应用的真实数据库路径
- 仅在获得确认后管理公网访问

## Sealos S3 的处理范围

对于需要 S3 兼容对象存储的本地项目或 Devbox，智能体将：

- 检测 S3 环境变量键、AWS SDK 使用情况、MinIO、上传路径或预签名 URL 代码等对象存储信号
- 使用 `zjy365/sealos-cli#28` 中的 `sealos-cli s3` 列出、创建、检查和更新对象存储桶
- 仅在需要时初始化 S3 凭据，并避免在聊天中暴露访问密钥
- 写入所需的最少本地环境变量键，包括存储桶、端点、访问密钥、私钥、区域和路径样式设置
- 通过项目的真实存储路径验证上传、列出、下载、删除或预签名 URL 行为
- 仅在获得确认后公开存储桶或轮换凭据

## Sealos Canvas 的处理范围

对于已由 Sealos Deploy 部署的仓库，智能体将：

1. 读取 `.sealos/state.json` 以定位已部署的应用。
2. 使用只读 `kubectl get` 命令查询 Sealos 命名空间。
3. 启动临时的 `127.0.0.1` 画布 UI。
4. 输出并打开本地 UI 地址供检查。

如果项目尚未部署，Sealos Canvas 会停止并引导用户先部署项目。

## 包含的技能

插件和 `skills.sh` 技能包暴露同一技能源：

- `sealos-deploy` — 将本地或 GitHub 项目部署到 Sealos Cloud
- `sealos-database` — 为开发创建、连接和操作 Sealos Cloud 数据库
- `sealos-s3` — 创建存储桶、连接凭据、检查配额并操作 Sealos S3 兼容对象存储
- `sealos-canvas` — 在本地只读画布 UI 中查看已部署的 Sealos 资源
- `sealos-app-builder` — 使用 SDK 集成构建 Sealos Desktop 应用
- `cloud-native-readiness` — 评估部署准备度
- `dockerfile-skill` — 生成可用于生产环境的 Dockerfile
- `docker-to-sealos` — 将 Docker Compose 服务转换为 Sealos 模板

## 仓库

[`skills/`](../skills) 是 Sealos 部署、Sealos 画布和部署流程配套技能的唯一事实来源。同一个根级技能目录同时服务于 `skills.sh` 安装和本仓库中的所有插件或扩展清单。

重要分发文件：

- [`.codex-plugin/plugin.json`](../.codex-plugin/plugin.json) — Codex 插件清单
- [`.agents/plugins/marketplace.json`](../.agents/plugins/marketplace.json) — 本地 Codex marketplace 入口
- [`.claude-plugin/plugin.json`](../.claude-plugin/plugin.json) — 与 Claude Code 兼容的插件清单
- [`marketplace.json`](../marketplace.json) 和 [`.claude-plugin/marketplace.json`](../.claude-plugin/marketplace.json) — 与 Claude 兼容的 marketplace 入口
- [`.codebuddy-plugin/marketplace.json`](../.codebuddy-plugin/marketplace.json) — CodeBuddy marketplace 入口
- [`gemini-extension.json`](../gemini-extension.json) — Gemini CLI 上下文扩展
- [`qwen-extension.json`](../qwen-extension.json) — Qwen Code 上下文扩展
- [`openclaw.plugin.json`](../openclaw.plugin.json) — OpenClaw / ClawHub 包指针
- [`commands/sealos.md`](../commands/sealos.md) — 兼容主机的 `/sealos` 插件命令入口
- [`distribution/platforms.json`](../distribution/platforms.json) — 平台支持注册表
- [`marketplaces/README.md`](../marketplaces/README.md) — marketplace 规则和支持声明归属
- [`scripts/validate-codex-plugin.py`](../scripts/validate-codex-plugin.py) — Codex 插件验证脚本

不要添加第二份技能包副本。根目录 `skills/**` 是所有安装路径的唯一技能源。

## 许可证

MIT
