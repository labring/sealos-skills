# Sealos Skills

<!-- README-I18N:START -->

[English](../README.md) | [简体中文](./README.zh-CN.md) | [繁體中文](./README.zh-TW.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [Español](./README.es.md) | [Français](./README.fr.md) | [Deutsch](./README.de.md) | [Português (Brasil)](./README.pt-BR.md) | **Русский** | [العربية](./README.ar.md) | [हिन्दी](./README.hi.md) | [Bahasa Indonesia](./README.id.md)

<!-- README-I18N:END -->

Развёртывайте проекты в [Sealos Cloud](https://sealos.io) с помощью ИИ-агента.

Sealos Skills — это набор навыков с приоритетом плагина, предназначенный для разработки и развёртывания в Sealos Cloud. Он помогает ИИ-агенту исследовать проект и подготавливать недостающие артефакты развёртывания. Он подключает базы данных и объектное хранилище Sealos Cloud для разработки. Он создаёт или повторно использует образ контейнера, развёртывает приложение в Sealos Cloud и показывает развёрнутые ресурсы на локальном холсте только для чтения.

Одна команда `npx plugins add` устанавливает плагин во все обнаруженные инструменты агентов. Нативная установка через marketplace для Codex и Claude Code использует тот же исходный каталог `skills/**` в корне репозитория. Его же используют `skills.sh` и хосты расширений только с контекстом, такие как Gemini CLI и Qwen Code.

## Быстрый старт

### TLDR

```bash
npx plugins add https://github.com/labring/sealos-skills
```

Одна команда устанавливает плагин Sealos во все обнаруженные инструменты агентов: Claude Code, Cursor, Codex, Grok Build, Kimi Code, GitHub Copilot CLI и VS Code. Выполните `npx plugins targets`, чтобы увидеть список обнаруженных инструментов, или передайте `--target <tool>`, чтобы установить плагин только в один инструмент.

### Нативная установка в Codex

Добавьте этот репозиторий как Codex marketplace, затем установите плагин Sealos:

```bash
codex plugin marketplace add labring/sealos-skills
codex plugin add sealos@sealos
```

Плагин устанавливает все восемь навыков из корневого каталога `skills/**`. О назначении каждого навыка см. раздел **Включённые навыки** ниже.

После установки в Codex используйте плагин через Codex:

- **Codex CLI:** введите `$sealos`
- **Codex App:** нажмите кнопку **+** в левом нижнем углу поля чата, затем выберите **Plugins** → **Sealos**

![Выбор плагина Sealos в Codex App](../assets/codex-sealos.png)

Примеры для Codex:

```text
$sealos deploy this repo to Sealos Cloud
$sealos deploy /path/to/project
$sealos deploy https://github.com/labring-sigs/kite
$sealos create a cloud Postgres database for this repo and wire DATABASE_URL
$sealos create private S3 object storage for uploads and wire env vars
```

### Нативная установка в Claude Code

Добавьте этот репозиторий как Claude Code marketplace, затем установите плагин Sealos:

```bash
claude plugin marketplace add labring/sealos-skills
claude plugin install sealos@sealos
```

После установки в Claude Code используйте `/sealos`:

```text
/sealos deploy this repo to Sealos Cloud
/sealos deploy /path/to/project
/sealos deploy https://github.com/labring-sigs/kite
/sealos create a cloud Postgres database for this repo and wire DATABASE_URL
/sealos create private S3 object storage for uploads and wire env vars
```

### Поддерживаемые инструменты ИИ

| Инструмент | Установка | Использование |
| --- | --- | --- |
| Codex CLI / Codex App | `npx plugins add https://github.com/labring/sealos-skills --target codex` или см. **Нативная установка в Codex** выше | `$sealos` в Codex CLI или **+** → **Plugins** → **Sealos** в Codex App |
| Claude Code | `npx plugins add https://github.com/labring/sealos-skills --target claude-code` или см. **Нативная установка в Claude Code** выше | `/sealos` |
| Cursor / Grok Build / Kimi Code / Copilot CLI / VS Code | `npx plugins add https://github.com/labring/sealos-skills` | Точка входа команды хоста после установки |
| OpenClaw / ClawHub | `clawhub install labring/sealos-skills` | Доступность команд хоста зависит от среды выполнения ClawHub |
| CodeBuddy | `/plugin marketplace add labring/sealos-skills` | Доступность команд хоста зависит от среды выполнения CodeBuddy |
| Gemini CLI | `gemini extensions install https://github.com/labring/sealos-skills` | Расширение только с контекстом; попросите Gemini использовать Sealos Skills |
| Qwen Code | `qwen extensions install https://github.com/labring/sealos-skills` | Расширение только с контекстом; попросите Qwen использовать Sealos Skills |
| Amp / универсальные импортёры репозиториев | Импортируйте `https://github.com/labring/sealos-skills.git` | Зависит от хоста |

Манифесты Gemini CLI и Qwen Code предоставляют контекст репозитория через `CLAUDE.md`. Они не заявляют поддержку slash-команд.

### Альтернатива: установка как пакета навыков `skills.sh`

Если ваш агент напрямую использует `skills.sh`, установите тот же пакет навыков следующей командой:

```bash
npx skills add labring/sealos-skills
```

Затем запустите навык развёртывания напрямую:

```text
/sealos-deploy
/sealos-deploy /path/to/project
/sealos-deploy https://github.com/labring-sigs/kite
/sealos-database create a cloud Postgres database for this repo and wire DATABASE_URL
/sealos-s3 create private object storage for uploads and wire env vars
```

Если проект развёрнут, используйте навык `sealos-canvas` через точку входа установленного плагина.

`/sealos-deploy`, `/sealos-database` и `/sealos-s3` — это прямые точки входа навыков `skills.sh`. Для использования плагина необходимо использовать `$sealos` в Codex или `/sealos` в Claude Code.

## Что выполняет Sealos Deploy

При обычном развёртывании агент:

- оценивает структуру проекта и требования среды выполнения
- повторно использует существующий образ или создаёт новый при необходимости
- генерирует шаблон Sealos
- выполняет развёртывание и проверяет rollout
- проверяет фактический URL Sealos App, журналы, процесс входа или настройки веб-приложений и набор ресурсов, прежде чем сообщить о готовности приложения

Если развёртывание уже существует, последующие запуски переходят к процессу обновления на месте.

## Что выполняет Sealos Database

Для локального проекта или Devbox, которому нужна облачная база данных, агент:

- обнаруживает признаки базы данных, такие как `DATABASE_URL`, Prisma, Drizzle, MongoDB, MySQL или Redis
- использует `sealos-cli database` для просмотра списка, создания, исследования и подключения баз данных Sealos Cloud
- записывает только необходимый локальный ключ переменной окружения, не раскрывая секреты в чате
- проверяет реальный путь приложения к базе данных с помощью миграций, интроспекции или проверок запуска
- управляет публичным доступом только после подтверждения

## Что выполняет Sealos S3

Для локального проекта или Devbox, которому нужно S3-совместимое объектное хранилище, агент:

- обнаруживает признаки объектного хранилища, такие как переменные окружения S3, использование AWS SDK, MinIO, пути загрузки или код предварительно подписанных URL
- использует `sealos-cli s3` из `zjy365/sealos-cli#28` для просмотра списка, создания, исследования и обновления бакетов объектного хранилища
- инициализирует учётные данные S3 только при необходимости и не показывает ключи доступа в чате
- задаёт минимально необходимые локальные переменные окружения для бакета, конечной точки, ключа доступа, секретного ключа, региона и настроек path-style
- проверяет загрузку, получение списка, скачивание, удаление или работу предварительно подписанных URL через реальный путь хранения проекта
- открывает публичный доступ к бакетам или меняет учётные данные только после подтверждения

## Что выполняет Sealos Canvas

Для репозитория, уже развёрнутого с помощью Sealos Deploy, агент:

1. Читает `.sealos/state.json`, чтобы найти развёрнутое приложение.
2. Запрашивает namespace Sealos с помощью команд `kubectl get` только для чтения.
3. Запускает временный интерфейс холста на `127.0.0.1`.
4. Выводит и открывает адрес локального интерфейса для проверки.

Если проект не развёрнут, Sealos Canvas останавливается и предлагает пользователю сначала развернуть проект.

## Как работает настройка

Вам нужен только ИИ-агент, совместимый с плагинами или `skills.sh`, и проект для развёртывания.

В процессах развёртывания, работы с базами данных и объектным хранилищем Sealos Skills:

- проверяет доступность таких инструментов, как Docker и `kubectl`
- при необходимости помогает пользователю войти в Sealos
- использует `sealos-cli` для создания баз данных Sealos Cloud, получения сведений о подключении и выполнения операций с базами данных
- использует `sealos-cli s3` для управления бакетами объектного хранилища Sealos, учётными данными, проверками квот, операциями с объектами и предварительно подписанными URL
- использует или помогает подготовить путь к реестру контейнеров, например Docker Hub или GHCR

Для фактического развёртывания нужны учётная запись Sealos Cloud и доступ к реестру контейнеров. Навык может помочь с этой настройкой после запуска. Для работы с базами данных и объектным хранилищем необходимы учётная запись Sealos Cloud и рабочее пространство с правом создавать запрошенные ресурсы.

## Включённые навыки

Плагин и пакет `skills.sh` предоставляют один и тот же источник навыков:

- `sealos-deploy` — развёртывает локальный проект или проект GitHub в Sealos Cloud
- `sealos-database` — создаёт, подключает и обслуживает базы данных Sealos Cloud для разработки
- `sealos-s3` — создаёт бакеты, подключает учётные данные, проверяет квоты и работает с S3-совместимым объектным хранилищем Sealos
- `sealos-canvas` — отображает развёрнутые ресурсы Sealos в локальном интерфейсе холста только для чтения
- `sealos-app-builder` — создаёт приложения Sealos Desktop с интеграцией SDK
- `cloud-native-readiness` — оценивает готовность к развёртыванию
- `dockerfile-skill` — генерирует Dockerfile, готовые к эксплуатации
- `docker-to-sealos` — преобразует сервисы Docker Compose в шаблоны Sealos

## Зачем использовать плагин

Установка плагина предпочтительна для Codex, Claude Code и других поддерживаемых инструментов агентов, поскольку она:

- устанавливает все навыки Sealos как единый управляемый пакет
- предоставляет одинаковые навыки во всех поддерживаемых инструментах агентов
- объединяет метаданные, логотип, подсказки, команды и возможности плагина
- избавляет от сопровождения отдельной упакованной копии навыков

## Сопровождение этого репозитория

Разделы ниже предназначены для сопровождающих репозиторий и издателей плагина. Пользователям они не нужны.

### Распространение плагина

Интеграция Codex соответствует [руководству OpenAI по созданию плагинов Codex](https://developers.openai.com/codex/plugins/build):

- `.codex-plugin/plugin.json` содержит идентификатор плагина, метаданные обнаружения, тексты интерфейса, подсказки по умолчанию, метаданные бренда и пути к ресурсам относительно корня репозитория.
- `.agents/plugins/marketplace.json` регистрирует локальный плагин этого репозитория для локального тестирования Codex marketplace.
- `.claude-plugin/plugin.json` и `.claude-plugin/marketplace.json` определяют интерфейс плагина, совместимый с Claude Code.
- `.qoder-plugin/plugin.json` определяет интерфейс плагина Qoder и явно предоставляет все восемь навыков Codex.
- `qoder.md` содержит инструкции маршрутизации и безопасности уровня Qoder без копирования реализаций навыков.
- `distribution/platforms.json` фиксирует заявления о поддержке платформ и подтверждающие данные.
- `marketplaces/README.md` определяет правила marketplace и предотвращает завышенные заявления о поддержке команд.
- `scripts/validate-codex-plugin.py` проверяет манифест Codex, метаданные Claude Code, marketplace репозитория, реестр платформ и пути к ресурсам.
- `scripts/package-qoder-plugin.py` собирает ZIP, совместимый с Qoder, с манифестом плагина в корне архива.
- `skills/**/SKILL.md` остаётся единственным источником навыков; не добавляйте вторую упакованную копию навыков.

Проверяйте метаданные плагина перед публикацией или отправкой изменений манифеста:

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

### Структура репозитория

[`skills/`](../skills) — единственный источник истины для Sealos Deploy, Sealos Canvas и вспомогательных навыков, используемых в процессе развёртывания. Один и тот же корневой каталог навыков обслуживает установки `skills.sh` и все манифесты плагинов или расширений в этом репозитории.

Важные файлы распространения:

- [`.codex-plugin/plugin.json`](../.codex-plugin/plugin.json) — манифест плагина Codex
- [`.agents/plugins/marketplace.json`](../.agents/plugins/marketplace.json) — локальная запись Codex marketplace
- [`.claude-plugin/plugin.json`](../.claude-plugin/plugin.json) — манифест плагина, совместимого с Claude Code
- [`.qoder-plugin/plugin.json`](../.qoder-plugin/plugin.json) — манифест плагина Qoder
- [`qoder.md`](../qoder.md) — инструкции маршрутизации и безопасности плагина Qoder
- [`marketplace.json`](../marketplace.json) и [`.claude-plugin/marketplace.json`](../.claude-plugin/marketplace.json) — записи marketplace, совместимые с Claude
- [`.codebuddy-plugin/marketplace.json`](../.codebuddy-plugin/marketplace.json) — запись CodeBuddy marketplace
- [`gemini-extension.json`](../gemini-extension.json) — контекстное расширение Gemini CLI
- [`qwen-extension.json`](../qwen-extension.json) — контекстное расширение Qwen Code
- [`openclaw.plugin.json`](../openclaw.plugin.json) — указатель на пакет OpenClaw / ClawHub
- [`commands/sealos.md`](../commands/sealos.md) — точка входа команды плагина `/sealos` для совместимых хостов
- [`distribution/platforms.json`](../distribution/platforms.json) — реестр поддержки платформ
- [`marketplaces/README.md`](../marketplaces/README.md) — правила marketplace и ответственность за заявления о поддержке
- [`scripts/validate-codex-plugin.py`](../scripts/validate-codex-plugin.py) — скрипт проверки плагина Codex
- [`scripts/package-qoder-plugin.py`](../scripts/package-qoder-plugin.py) — упаковщик ZIP для Qoder

Не добавляйте вторую упакованную копию навыков. Корневой каталог `skills/**` — единственный источник навыков для всех способов установки.

## Лицензия

MIT
