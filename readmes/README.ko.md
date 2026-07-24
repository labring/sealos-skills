# Sealos Skills

<!-- README-I18N:START -->

[English](../README.md) | [简体中文](./README.zh-CN.md) | [繁體中文](./README.zh-TW.md) | [日本語](./README.ja.md) | **한국어** | [Español](./README.es.md) | [Français](./README.fr.md) | [Deutsch](./README.de.md) | [Português (Brasil)](./README.pt-BR.md) | [Русский](./README.ru.md) | [العربية](./README.ar.md) | [हिन्दी](./README.hi.md) | [Bahasa Indonesia](./README.id.md)

<!-- README-I18N:END -->

AI 에이전트에서 [Sealos Cloud](https://sealos.io)로 프로젝트를 배포하세요.

Sealos Skills는 Sealos Cloud 개발 및 배포를 중심으로 하는 플러그인 우선 스킬 팩입니다. AI 에이전트가 프로젝트를 검사하고, 누락된 배포 산출물을 준비하고, 개발용 Sealos Cloud 데이터베이스와 객체 스토리지를 연결하고, 컨테이너 이미지를 빌드하거나 재사용하고, 앱을 Sealos Cloud에 배포하고, 로컬 읽기 전용 캔버스에서 배포된 리소스를 확인하도록 지원합니다.

Codex에서는 네이티브 Codex 플러그인 설치를 권장합니다. 교차 호스트 플러그인 설치, `skills.sh`, Gemini CLI 및 Qwen Code와 같은 컨텍스트 전용 확장 호스트는 동일한 루트 `skills/**` 소스를 사용합니다.

## 빠른 시작

### 권장: Codex에 설치

이 저장소를 Codex marketplace로 추가한 다음 Sealos 플러그인을 설치합니다.

```bash
codex plugin marketplace add labring/sealos-skills
codex plugin add sealos@sealos
```

하나의 Sealos 플러그인이 루트 `skills/**`에서 배포, 데이터베이스, S3, 캔버스, 앱 빌더 및 관련 클라우드 네이티브 스킬을 설치합니다: `sealos-deploy`, `sealos-database`, `sealos-s3`, `sealos-canvas`, `sealos-app-builder`, `cloud-native-readiness`, `dockerfile-skill`, `docker-to-sealos`.

호환성과 로컬 Codex 테스트를 위해 다음 명령으로 동일한 플러그인을 설치할 수도 있습니다.

```bash
npx plugins add https://github.com/labring/sealos-skills --target codex
```

Codex에 설치한 후 다음 방식으로 플러그인을 사용합니다.

- **Codex CLI:** `$sealos` 입력
- **Codex App:** 채팅 입력창 왼쪽 아래의 **+** 버튼을 클릭하고 **Plugins**를 선택한 다음 **Sealos** 선택

![Codex App에서 Sealos 플러그인 선택](../assets/codex-sealos.png)

Codex 예시:

```text
$sealos deploy this repo to Sealos Cloud
$sealos deploy /path/to/project
$sealos deploy https://github.com/labring-sigs/kite
$sealos create a cloud Postgres database for this repo and wire DATABASE_URL
$sealos create private S3 object storage for uploads and wire env vars
```

### Claude Code에 설치

이 저장소를 Claude Code marketplace로 추가한 다음 Sealos 플러그인을 설치합니다.

```bash
claude plugin marketplace add labring/sealos-skills
claude plugin install sealos@sealos
```

교차 호스트 플러그인 설치 프로그램과의 호환성을 위해 다음 명령으로 동일한 플러그인을 설치할 수 있습니다.

```bash
npx plugins add https://github.com/labring/sealos-skills --target claude-code
```

시스템에서 감지된 에이전트 도구가 하나뿐이라면 `plugins`가 대상을 선택하도록 할 수 있습니다.

```bash
npx plugins add https://github.com/labring/sealos-skills
```

Claude Code에 설치한 후 `/sealos`를 사용합니다.

```text
/sealos deploy this repo to Sealos Cloud
/sealos deploy /path/to/project
/sealos deploy https://github.com/labring-sigs/kite
/sealos create a cloud Postgres database for this repo and wire DATABASE_URL
/sealos create private S3 object storage for uploads and wire env vars
```

### 지원되는 기타 AI 도구

| 도구 | 설치 | 사용법 |
| --- | --- | --- |
| Codex CLI / Codex App | `codex plugin marketplace add labring/sealos-skills` 실행 후 `codex plugin add sealos@sealos` 실행 | Codex CLI에서 `$sealos`, Codex App에서 **+** → **Plugins** → **Sealos** |
| Claude Code | `claude plugin marketplace add labring/sealos-skills` 실행 후 `claude plugin install sealos@sealos` 실행 | `/sealos` |
| Claude Code 호환 경로 | `npx plugins add https://github.com/labring/sealos-skills --target claude-code` | `/sealos` |
| OpenClaw / ClawHub | `clawhub install labring/sealos-skills` | 호스트 명령 노출 방식은 ClawHub 런타임에 따라 달라집니다 |
| CodeBuddy | `/plugin marketplace add labring/sealos-skills` | 호스트 명령 노출 방식은 CodeBuddy 런타임에 따라 달라집니다 |
| Gemini CLI | `gemini extensions install https://github.com/labring/sealos-skills` | 컨텍스트 전용 확장 프로그램. Gemini에 Sealos Skills 사용 요청 |
| Qwen Code | `qwen extensions install https://github.com/labring/sealos-skills` | 컨텍스트 전용 확장 프로그램. Qwen에 Sealos Skills 사용 요청 |
| Amp / Kimi / 일반 저장소 가져오기 도구 | `https://github.com/labring/sealos-skills.git` 가져오기 | 호스트에 따라 달라집니다 |

Gemini CLI와 Qwen Code 매니페스트는 `CLAUDE.md`를 통해 저장소 컨텍스트를 제공합니다. 슬래시 명령 지원은 선언하지 않습니다.

### 대안: `skills.sh` 스킬 팩으로 설치

에이전트가 `skills.sh`를 직접 사용한다면 다음 명령으로 동일한 스킬 팩을 설치합니다.

```bash
npx skills add labring/sealos-skills
```

그런 다음 배포 스킬을 직접 실행합니다.

```text
/sealos-deploy
/sealos-deploy /path/to/project
/sealos-deploy https://github.com/labring-sigs/kite
/sealos-database create a cloud Postgres database for this repo and wire DATABASE_URL
/sealos-s3 create private object storage for uploads and wire env vars
```

프로젝트를 배포한 후 설치된 플러그인 진입점을 통해 `sealos-canvas` 스킬을 사용합니다.

`/sealos-deploy`, `/sealos-database`, `/sealos-s3`는 직접 사용하는 `skills.sh` 스킬 진입점입니다. 플러그인은 Codex의 `$sealos` 또는 Claude Code의 `/sealos`를 통해 사용합니다.

## 플러그인을 사용하는 이유

Codex와 Claude Code에서는 다음 이유로 플러그인 설치를 권장합니다.

- 모든 Sealos 스킬을 하나의 관리형 패키지로 설치
- 지원되는 에이전트 도구 전반에 동일한 스킬 제공
- 플러그인 메타데이터, 로고, 프롬프트, 명령 및 기능을 함께 관리
- 별도의 스킬 패키지 복사본을 유지하는 작업 제거

## 플러그인 배포

Codex 통합은 [OpenAI의 Codex 플러그인 빌드 가이드](https://developers.openai.com/codex/plugins/build)를 따릅니다.

- `.codex-plugin/plugin.json`에는 플러그인 ID, 검색 메타데이터, 인터페이스 문구, 기본 프롬프트, 브랜드 메타데이터 및 저장소 루트 기준 자산 경로가 포함됩니다.
- `.agents/plugins/marketplace.json`은 로컬 Codex marketplace 테스트를 위해 이 저장소의 로컬 플러그인을 등록합니다.
- `.claude-plugin/plugin.json`과 `.claude-plugin/marketplace.json`은 Claude Code 호환 플러그인 인터페이스를 정의합니다.
- `distribution/platforms.json`은 플랫폼 지원 명세와 근거를 기록합니다.
- `marketplaces/README.md`는 marketplace 규칙을 관리하고 명령 지원 범위가 과장되는 것을 방지합니다.
- `scripts/validate-codex-plugin.py`는 Codex 매니페스트, Claude Code 메타데이터, 저장소 marketplace, 플랫폼 레지스트리 및 자산 경로를 검증합니다.
- `skills/**/SKILL.md`는 항상 유일한 스킬 소스입니다. 두 번째 패키지 복사본을 추가하지 마세요.

매니페스트 변경 사항을 게시하거나 푸시하기 전에 플러그인 메타데이터를 검증합니다.

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

## 설정 작동 방식

플러그인 또는 `skills.sh` 호환 AI 에이전트와 배포할 프로젝트만 있으면 됩니다.

배포, 데이터베이스 및 객체 스토리지 흐름에서 Sealos Skills는 다음을 수행합니다.

- Docker 및 `kubectl` 같은 도구의 사용 가능 여부 확인
- 필요할 때 사용자에게 Sealos 로그인 안내
- `sealos-cli`를 사용하여 Sealos Cloud 데이터베이스를 생성하고 연결 세부 정보를 가져오며 데이터베이스 작업 수행
- `sealos-cli s3`를 사용하여 Sealos 객체 스토리지 버킷, 자격 증명, 할당량 확인, 객체 작업 및 미리 서명된 URL 관리
- Docker Hub 또는 GHCR과 같은 컨테이너 레지스트리 경로를 사용하거나 준비 지원

실제 배포에는 Sealos Cloud 계정과 컨테이너 레지스트리 접근 권한이 필요하며, 스킬 시작 전에 모두 설정할 필요는 없습니다. 데이터베이스 및 객체 스토리지 작업에는 Sealos Cloud 계정과 요청한 리소스를 생성할 수 있는 워크스페이스가 필요합니다.

## Sealos Deploy 처리 범위

일반적인 배포에서 에이전트는 다음을 수행합니다.

- 프로젝트 구조와 런타임 요구 사항 평가
- 기존 이미지 재사용 또는 필요할 때 새 이미지 빌드
- Sealos 템플릿 생성
- 배포 후 롤아웃 검증
- 앱을 사용할 수 있다고 보고하기 전에 실제 Sealos App URL, 로그, 웹 앱의 로그인 또는 설정 흐름, 전체 리소스 범위 검증

기존 배포가 감지되면 이후 실행에서 인플레이스 업데이트 흐름으로 전환할 수 있습니다.

## Sealos Database 처리 범위

클라우드 데이터베이스가 필요한 로컬 프로젝트 또는 Devbox에서 에이전트는 다음을 수행합니다.

- `DATABASE_URL`, Prisma, Drizzle, MongoDB, MySQL 또는 Redis 같은 데이터베이스 신호 감지
- `sealos-cli database`를 사용하여 Sealos Cloud 데이터베이스 목록 조회, 생성, 검사 및 연결
- 채팅에 비밀을 노출하지 않고 필요한 로컬 환경 변수 키만 작성
- 마이그레이션, 인트로스펙션 또는 시작 검사를 통해 앱의 실제 데이터베이스 경로 검증
- 확인을 받은 후 공개 접근 관리

## Sealos S3 처리 범위

S3 호환 객체 스토리지가 필요한 로컬 프로젝트 또는 Devbox에서 에이전트는 다음을 수행합니다.

- S3 환경 변수 키, AWS SDK 사용, MinIO, 업로드 경로 또는 미리 서명된 URL 코드 같은 객체 스토리지 신호 감지
- `zjy365/sealos-cli#28`의 `sealos-cli s3`를 사용하여 객체 스토리지 버킷 목록 조회, 생성, 검사 및 업데이트
- 필요할 때만 S3 자격 증명을 초기화하고 접근 키를 채팅에 노출하지 않음
- 버킷, 엔드포인트, 접근 키, 비밀 키, 리전 및 경로 스타일 설정에 필요한 최소 로컬 환경 변수 키 연결
- 프로젝트의 실제 스토리지 경로로 업로드, 목록 조회, 다운로드, 삭제 또는 미리 서명된 URL 동작 검증
- 확인을 받은 후 버킷 공개 또는 자격 증명 교체

## Sealos Canvas 처리 범위

Sealos Deploy로 이미 배포된 저장소에서 에이전트는 다음을 수행합니다.

1. `.sealos/state.json`을 읽어 배포된 앱을 찾습니다.
2. 읽기 전용 `kubectl get` 명령으로 Sealos 네임스페이스를 조회합니다.
3. 임시 `127.0.0.1` 캔버스 UI를 시작합니다.
4. 검사를 위해 로컬 UI 주소를 출력하고 엽니다.

프로젝트가 아직 배포되지 않았다면 Sealos Canvas가 중지되고 먼저 프로젝트를 배포하도록 안내합니다.

## 포함된 스킬

플러그인과 `skills.sh` 팩은 동일한 스킬 소스를 제공합니다.

- `sealos-deploy` — 로컬 또는 GitHub 프로젝트를 Sealos Cloud에 배포
- `sealos-database` — 개발용 Sealos Cloud 데이터베이스 생성, 연결 및 운영
- `sealos-s3` — 버킷 생성, 자격 증명 연결, 할당량 확인 및 Sealos S3 호환 객체 스토리지 운영
- `sealos-canvas` — 로컬 읽기 전용 캔버스 UI에서 배포된 Sealos 리소스 확인
- `sealos-app-builder` — SDK 통합으로 Sealos Desktop 앱 빌드
- `cloud-native-readiness` — 배포 준비 상태 평가
- `dockerfile-skill` — 프로덕션용 Dockerfile 생성
- `docker-to-sealos` — Docker Compose 서비스를 Sealos 템플릿으로 변환

## 저장소

[`skills/`](../skills)는 Sealos 배포, Sealos 캔버스 및 배포 흐름에서 사용하는 관련 스킬의 단일 소스입니다. 동일한 루트 수준 스킬 디렉터리가 `skills.sh` 설치와 이 저장소의 모든 플러그인 또는 확장 매니페스트에 사용됩니다.

주요 배포 파일:

- [`.codex-plugin/plugin.json`](../.codex-plugin/plugin.json) — Codex 플러그인 매니페스트
- [`.agents/plugins/marketplace.json`](../.agents/plugins/marketplace.json) — 로컬 Codex marketplace 항목
- [`.claude-plugin/plugin.json`](../.claude-plugin/plugin.json) — Claude Code 호환 플러그인 매니페스트
- [`marketplace.json`](../marketplace.json) 및 [`.claude-plugin/marketplace.json`](../.claude-plugin/marketplace.json) — Claude 호환 marketplace 항목
- [`.codebuddy-plugin/marketplace.json`](../.codebuddy-plugin/marketplace.json) — CodeBuddy marketplace 항목
- [`gemini-extension.json`](../gemini-extension.json) — Gemini CLI 컨텍스트 확장
- [`qwen-extension.json`](../qwen-extension.json) — Qwen Code 컨텍스트 확장
- [`openclaw.plugin.json`](../openclaw.plugin.json) — OpenClaw / ClawHub 번들 포인터
- [`commands/sealos.md`](../commands/sealos.md) — 호환 호스트용 `/sealos` 플러그인 명령 진입점
- [`distribution/platforms.json`](../distribution/platforms.json) — 플랫폼 지원 레지스트리
- [`marketplaces/README.md`](../marketplaces/README.md) — marketplace 규칙 및 지원 명세 관리
- [`scripts/validate-codex-plugin.py`](../scripts/validate-codex-plugin.py) — Codex 플러그인 검증 스크립트

두 번째 스킬 패키지 복사본을 추가하지 마세요. 루트 `skills/**`가 모든 설치 경로의 유일한 스킬 소스입니다.

## 라이선스

MIT
