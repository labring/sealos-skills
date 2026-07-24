# Sealos Skills

<!-- README-I18N:START -->

[English](../README.md) | [简体中文](./README.zh-CN.md) | [繁體中文](./README.zh-TW.md) | **日本語** | [한국어](./README.ko.md) | [Español](./README.es.md) | [Français](./README.fr.md) | [Deutsch](./README.de.md) | [Português (Brasil)](./README.pt-BR.md) | [Русский](./README.ru.md) | [العربية](./README.ar.md) | [हिन्दी](./README.hi.md) | [Bahasa Indonesia](./README.id.md)

<!-- README-I18N:END -->

AI エージェントからプロジェクトを [Sealos Cloud](https://sealos.io) にデプロイします。

Sealos Skills は、Sealos Cloud での開発とデプロイを中心としたプラグインファーストのスキルパックです。AI エージェントによるプロジェクトの調査、不足しているデプロイ成果物の準備、開発用 Sealos Cloud データベースとオブジェクトストレージへの接続、コンテナイメージのビルドまたは再利用、Sealos Cloud へのアプリの公開、ローカルの読み取り専用キャンバスでのデプロイ済みリソースの表示を支援します。

Codex では、ネイティブ Codex プラグインのインストールを推奨します。クロスホストのプラグインインストール、`skills.sh`、Gemini CLI や Qwen Code などのコンテキスト専用拡張ホストは、同じルート `skills/**` ソースを使用します。

## クイックスタート

### 推奨：Codex にインストール

このリポジトリを Codex marketplace として追加し、Sealos プラグインをインストールします。

```bash
codex plugin marketplace add labring/sealos-skills
codex plugin add sealos@sealos
```

1 つの Sealos プラグインが、ルート `skills/**` からデプロイ、データベース、S3、キャンバス、アプリビルダー、および関連するクラウドネイティブスキルをインストールします：`sealos-deploy`、`sealos-database`、`sealos-s3`、`sealos-canvas`、`sealos-app-builder`、`cloud-native-readiness`、`dockerfile-skill`、`docker-to-sealos`。

互換性の確保とローカルでの Codex テストには、次のコマンドで同じプラグインをインストールします。

```bash
npx plugins add https://github.com/labring/sealos-skills --target codex
```

Codex にインストールしたら、次の方法でプラグインを使用します。

- **Codex CLI：** `$sealos` と入力
- **Codex App：** チャット入力欄の左下にある **+** ボタンをクリックし、**Plugins**、**Sealos** の順に選択

![Codex App で Sealos プラグインを選択](../assets/codex-sealos.png)

Codex の例：

```text
$sealos deploy this repo to Sealos Cloud
$sealos deploy /path/to/project
$sealos deploy https://github.com/labring-sigs/kite
$sealos create a cloud Postgres database for this repo and wire DATABASE_URL
$sealos create private S3 object storage for uploads and wire env vars
```

### Claude Code にインストール

このリポジトリを Claude Code marketplace として追加し、Sealos プラグインをインストールします。

```bash
claude plugin marketplace add labring/sealos-skills
claude plugin install sealos@sealos
```

クロスホストのプラグインインストーラーとの互換性には、次のコマンドで同じプラグインをインストールします。

```bash
npx plugins add https://github.com/labring/sealos-skills --target claude-code
```

マシン上で検出されたエージェントツールが 1 つだけの場合、`plugins` にターゲットを選択させることができます。

```bash
npx plugins add https://github.com/labring/sealos-skills
```

Claude Code にインストールしたら、`/sealos` を使用します。

```text
/sealos deploy this repo to Sealos Cloud
/sealos deploy /path/to/project
/sealos deploy https://github.com/labring-sigs/kite
/sealos create a cloud Postgres database for this repo and wire DATABASE_URL
/sealos create private S3 object storage for uploads and wire env vars
```

### その他の対応 AI ツール

| ツール | インストール | 使用方法 |
| --- | --- | --- |
| Codex CLI / Codex App | `codex plugin marketplace add labring/sealos-skills`、続けて `codex plugin add sealos@sealos` | Codex CLI では `$sealos`、Codex App では **+** → **Plugins** → **Sealos** |
| Claude Code | `claude plugin marketplace add labring/sealos-skills`、続けて `claude plugin install sealos@sealos` | `/sealos` |
| Claude Code 互換パス | `npx plugins add https://github.com/labring/sealos-skills --target claude-code` | `/sealos` |
| OpenClaw / ClawHub | `clawhub install labring/sealos-skills` | ホストコマンドの公開方法は ClawHub ランタイムに依存します |
| CodeBuddy | `/plugin marketplace add labring/sealos-skills` | ホストコマンドの公開方法は CodeBuddy ランタイムに依存します |
| Gemini CLI | `gemini extensions install https://github.com/labring/sealos-skills` | コンテキスト専用拡張。Gemini に Sealos Skills の使用を指示します |
| Qwen Code | `qwen extensions install https://github.com/labring/sealos-skills` | コンテキスト専用拡張。Qwen に Sealos Skills の使用を指示します |
| Amp / Kimi / 汎用リポジトリインポーター | `https://github.com/labring/sealos-skills.git` をインポート | ホストに依存します |

Gemini CLI と Qwen Code のマニフェストは、`CLAUDE.md` を通じてリポジトリのコンテキストを提供します。スラッシュコマンドのサポートは宣言しません。

### 代替：`skills.sh` スキルパックとしてインストール

エージェントが `skills.sh` を直接使用する場合、次のコマンドで同じスキルパックをインストールします。

```bash
npx skills add labring/sealos-skills
```

その後、デプロイスキルを直接実行します。

```text
/sealos-deploy
/sealos-deploy /path/to/project
/sealos-deploy https://github.com/labring-sigs/kite
/sealos-database create a cloud Postgres database for this repo and wire DATABASE_URL
/sealos-s3 create private object storage for uploads and wire env vars
```

プロジェクトのデプロイ後は、インストール済みプラグインのエントリポイントから `sealos-canvas` スキルを使用します。

`/sealos-deploy`、`/sealos-database`、`/sealos-s3` は、`skills.sh` の直接スキルエントリです。プラグインは Codex の `$sealos` または Claude Code の `/sealos` から使用します。

## プラグインを使用する理由

Codex と Claude Code では、次の理由からプラグインのインストールを推奨します。

- すべての Sealos スキルを 1 つの管理対象パッケージとしてインストール
- 対応エージェントツールで同じスキルを公開
- プラグインのメタデータ、ロゴ、プロンプト、コマンド、機能を一元管理
- スキルのパッケージコピーを別途保守する作業を削減

## プラグイン配布

Codex 統合は [OpenAI の Codex プラグイン構築ガイド](https://developers.openai.com/codex/plugins/build)に準拠します。

- `.codex-plugin/plugin.json` には、プラグイン ID、検出メタデータ、インターフェース文言、デフォルトプロンプト、ブランドメタデータ、リポジトリルートからの相対アセットパスが含まれます。
- `.agents/plugins/marketplace.json` は、ローカル Codex marketplace テスト用にこのリポジトリローカルのプラグインを登録します。
- `.claude-plugin/plugin.json` と `.claude-plugin/marketplace.json` は、Claude Code 互換のプラグインインターフェースを定義します。
- `distribution/platforms.json` は、プラットフォームのサポート宣言と根拠を記録します。
- `marketplaces/README.md` は marketplace のルールを管理し、コマンドサポートの過剰な宣言を防ぎます。
- `scripts/validate-codex-plugin.py` は Codex マニフェスト、Claude Code メタデータ、リポジトリの marketplace、プラットフォームレジストリ、アセットパスを検証します。
- `skills/**/SKILL.md` は常に唯一のスキルソースです。2 つ目のパッケージコピーは追加しないでください。

マニフェストの変更を公開またはプッシュする前に、プラグインメタデータを検証します。

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

## セットアップの仕組み

必要なのは、プラグインまたは `skills.sh` に対応する AI エージェントと、デプロイするプロジェクトだけです。

デプロイ、データベース、オブジェクトストレージの各フローで、Sealos Skills は次を実行します。

- Docker や `kubectl` などのツールが利用可能か確認
- 必要に応じて Sealos へのログインを案内
- `sealos-cli` を使用した Sealos Cloud データベースの作成、接続情報の取得、データベース操作
- `sealos-cli s3` を使用した Sealos オブジェクトストレージのバケット、認証情報、クォータ確認、オブジェクト操作、署名付き URL の管理
- Docker Hub や GHCR などのコンテナレジストリパスを使用または準備

実際のデプロイには Sealos Cloud アカウントとコンテナレジストリへのアクセスが必要ですが、スキル開始前にすべてを設定しておく必要はありません。データベースとオブジェクトストレージの作業には、Sealos Cloud アカウントと、必要なリソースを作成できるワークスペースが必要です。

## Sealos Deploy が処理する内容

一般的なデプロイでは、エージェントは次を実行します。

- プロジェクト構造とランタイム要件を評価
- 既存のイメージを再利用、または必要に応じてビルド
- Sealos テンプレートを生成
- デプロイしてロールアウトを検証
- アプリを利用可能と報告する前に、実際の Sealos App URL、ログ、Web アプリのログインまたはセットアップフロー、リソース全体を検証

既存のデプロイが検出されると、以降の実行はインプレース更新フローに切り替えられます。

## Sealos Database が処理する内容

クラウドデータベースを必要とするローカルプロジェクトまたは Devbox では、エージェントは次を実行します。

- `DATABASE_URL`、Prisma、Drizzle、MongoDB、MySQL、Redis などのデータベースシグナルを検出
- `sealos-cli database` を使用して Sealos Cloud データベースを一覧表示、作成、調査、接続
- チャットにシークレットを公開せず、必要なローカル環境変数キーだけを書き込み
- マイグレーション、イントロスペクション、起動チェックを通じてアプリの実際のデータベース経路を検証
- 確認を得てからパブリックアクセスを管理

## Sealos S3 が処理する内容

S3 互換オブジェクトストレージを必要とするローカルプロジェクトまたは Devbox では、エージェントは次を実行します。

- S3 環境変数キー、AWS SDK の使用、MinIO、アップロードパス、署名付き URL コードなどのオブジェクトストレージシグナルを検出
- `zjy365/sealos-cli#28` の `sealos-cli s3` を使用してオブジェクトストレージバケットを一覧表示、作成、調査、更新
- 必要な場合だけ S3 認証情報を初期化し、アクセスキーをチャットに公開しない
- バケット、エンドポイント、アクセスキー、シークレットキー、リージョン、パススタイル設定に必要な最小限のローカル環境変数キーを設定
- プロジェクトの実際のストレージ経路で、アップロード、一覧表示、ダウンロード、削除、署名付き URL の動作を検証
- 確認を得てからバケットの公開や認証情報のローテーションを実施

## Sealos Canvas が処理する内容

Sealos Deploy でデプロイ済みのリポジトリに対して、エージェントは次を実行します。

1. `.sealos/state.json` を読み取り、デプロイ済みアプリを特定します。
2. 読み取り専用の `kubectl get` コマンドで Sealos 名前空間を照会します。
3. 一時的な `127.0.0.1` キャンバス UI を起動します。
4. 確認用のローカル UI アドレスを出力して開きます。

プロジェクトがまだデプロイされていない場合、Sealos Canvas は停止し、先にプロジェクトをデプロイするよう案内します。

## 含まれるスキル

プラグインと `skills.sh` パックは、同じスキルソースを公開します。

- `sealos-deploy` — ローカルまたは GitHub プロジェクトを Sealos Cloud にデプロイ
- `sealos-database` — 開発用 Sealos Cloud データベースの作成、接続、操作
- `sealos-s3` — バケットの作成、認証情報の接続、クォータ確認、Sealos S3 互換オブジェクトストレージの操作
- `sealos-canvas` — ローカルの読み取り専用キャンバス UI でデプロイ済み Sealos リソースを表示
- `sealos-app-builder` — SDK 統合を使用して Sealos Desktop アプリを構築
- `cloud-native-readiness` — デプロイ準備状況を評価
- `dockerfile-skill` — 本番環境対応の Dockerfile を生成
- `docker-to-sealos` — Docker Compose サービスを Sealos テンプレートに変換

## リポジトリ

[`skills/`](../skills) は、Sealos デプロイ、Sealos キャンバス、デプロイフローで使用する関連スキルの信頼できる唯一のソースです。同じルートレベルのスキルディレクトリが、`skills.sh` のインストールと、このリポジトリ内のすべてのプラグインまたは拡張マニフェストに使用されます。

重要な配布ファイル：

- [`.codex-plugin/plugin.json`](../.codex-plugin/plugin.json) — Codex プラグインマニフェスト
- [`.agents/plugins/marketplace.json`](../.agents/plugins/marketplace.json) — ローカル Codex marketplace エントリ
- [`.claude-plugin/plugin.json`](../.claude-plugin/plugin.json) — Claude Code 互換プラグインマニフェスト
- [`marketplace.json`](../marketplace.json) と [`.claude-plugin/marketplace.json`](../.claude-plugin/marketplace.json) — Claude 互換 marketplace エントリ
- [`.codebuddy-plugin/marketplace.json`](../.codebuddy-plugin/marketplace.json) — CodeBuddy marketplace エントリ
- [`gemini-extension.json`](../gemini-extension.json) — Gemini CLI コンテキスト拡張
- [`qwen-extension.json`](../qwen-extension.json) — Qwen Code コンテキスト拡張
- [`openclaw.plugin.json`](../openclaw.plugin.json) — OpenClaw / ClawHub バンドルポインター
- [`commands/sealos.md`](../commands/sealos.md) — 互換ホスト向け `/sealos` プラグインコマンドエントリ
- [`distribution/platforms.json`](../distribution/platforms.json) — プラットフォームサポートレジストリ
- [`marketplaces/README.md`](../marketplaces/README.md) — marketplace のルールとサポート宣言の管理元
- [`scripts/validate-codex-plugin.py`](../scripts/validate-codex-plugin.py) — Codex プラグイン検証スクリプト

スキルのパッケージコピーを追加しないでください。ルート `skills/**` がすべてのインストール方法における唯一のスキルソースです。

## ライセンス

MIT
