# Sealos Skills

<!-- README-I18N:START -->

[English](../README.md) | [简体中文](./README.zh-CN.md) | [繁體中文](./README.zh-TW.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | **Español** | [Français](./README.fr.md) | [Deutsch](./README.de.md) | [Português (Brasil)](./README.pt-BR.md) | [Русский](./README.ru.md) | [العربية](./README.ar.md) | [हिन्दी](./README.hi.md) | [Bahasa Indonesia](./README.id.md)

<!-- README-I18N:END -->

Despliega proyectos en [Sealos Cloud](https://sealos.io) desde tu agente de IA.

Sealos Skills es un paquete de habilidades centrado en plugins para el desarrollo y el despliegue en Sealos Cloud. Ayuda a un agente de IA a inspeccionar un proyecto y preparar los artefactos de despliegue que falten. Conecta bases de datos y almacenamiento de objetos de Sealos Cloud para el desarrollo. Crea o reutiliza una imagen de contenedor, despliega la aplicación en Sealos Cloud y muestra los recursos desplegados en un lienzo local de solo lectura.

Un único comando `npx plugins add` instala el plugin en todas las herramientas de agente detectadas. Las instalaciones nativas desde el marketplace de Codex y Claude Code usan la misma fuente raíz `skills/**`. `skills.sh` y los hosts de extensiones que solo aportan contexto, como Gemini CLI y Qwen Code, también la usan.

## Inicio rápido

### TLDR

```bash
npx plugins add https://github.com/labring/sealos-skills
```

Un solo comando instala el plugin de Sealos en todas las herramientas de agente detectadas: Claude Code, Cursor, Codex, Grok Build, Kimi Code, GitHub Copilot CLI y VS Code. Ejecuta `npx plugins targets` para listar las herramientas detectadas, o pasa `--target <tool>` para instalar solo en una.

### Instalar de forma nativa en Codex

Añade este repositorio como Codex marketplace y después instala el plugin de Sealos:

```bash
codex plugin marketplace add labring/sealos-skills
codex plugin add sealos@sealos
```

El plugin instala las ocho habilidades desde el directorio raíz `skills/**`. Consulta **Habilidades incluidas** más abajo para ver qué hace cada una.

Después de instalarlo en Codex, usa el plugin desde Codex:

- **Codex CLI:** escribe `$sealos`
- **Codex App:** haz clic en el botón **+** de la esquina inferior izquierda del cuadro de chat y elige **Plugins** → **Sealos**

![Seleccionar el plugin de Sealos en Codex App](../assets/codex-sealos.png)

Ejemplos de Codex:

```text
$sealos deploy this repo to Sealos Cloud
$sealos deploy /path/to/project
$sealos deploy https://github.com/labring-sigs/kite
$sealos create a cloud Postgres database for this repo and wire DATABASE_URL
$sealos create private S3 object storage for uploads and wire env vars
```

### Instalar de forma nativa en Claude Code

Añade este repositorio como Claude Code marketplace y después instala el plugin de Sealos:

```bash
claude plugin marketplace add labring/sealos-skills
claude plugin install sealos@sealos
```

Después de instalarlo en Claude Code, usa `/sealos`:

```text
/sealos deploy this repo to Sealos Cloud
/sealos deploy /path/to/project
/sealos deploy https://github.com/labring-sigs/kite
/sealos create a cloud Postgres database for this repo and wire DATABASE_URL
/sealos create private S3 object storage for uploads and wire env vars
```

### Herramientas de IA compatibles

| Herramienta | Instalación | Uso |
| --- | --- | --- |
| Codex CLI / Codex App | `npx plugins add https://github.com/labring/sealos-skills --target codex`, o consulta **Instalar de forma nativa en Codex** más arriba | `$sealos` en Codex CLI, o **+** → **Plugins** → **Sealos** en Codex App |
| Claude Code | `npx plugins add https://github.com/labring/sealos-skills --target claude-code`, o consulta **Instalar de forma nativa en Claude Code** más arriba | `/sealos` |
| Cursor / Grok Build / Kimi Code / Copilot CLI / VS Code | `npx plugins add https://github.com/labring/sealos-skills` | Punto de entrada de comandos del host tras la instalación |
| OpenClaw / ClawHub | `clawhub install labring/sealos-skills` | La exposición de comandos del host depende del entorno de ejecución de ClawHub |
| CodeBuddy | `/plugin marketplace add labring/sealos-skills` | La exposición de comandos del host depende del entorno de ejecución de CodeBuddy |
| Gemini CLI | `gemini extensions install https://github.com/labring/sealos-skills` | Extensión solo de contexto; pide a Gemini que use Sealos Skills |
| Qwen Code | `qwen extensions install https://github.com/labring/sealos-skills` | Extensión solo de contexto; pide a Qwen que use Sealos Skills |
| Amp / importadores genéricos de repositorios | Importa `https://github.com/labring/sealos-skills.git` | Depende del host |

Los manifiestos de Gemini CLI y Qwen Code proporcionan contexto del repositorio mediante `CLAUDE.md`; no declaran compatibilidad con comandos de barra.

### Alternativa: instalar como paquete de habilidades de `skills.sh`

Si tu agente usa `skills.sh` directamente, instala el mismo paquete de habilidades con:

```bash
npx skills add labring/sealos-skills
```

Después ejecuta directamente la habilidad de despliegue:

```text
/sealos-deploy
/sealos-deploy /path/to/project
/sealos-deploy https://github.com/labring-sigs/kite
/sealos-database create a cloud Postgres database for this repo and wire DATABASE_URL
/sealos-s3 create private object storage for uploads and wire env vars
```

Si el proyecto ya está desplegado, usa la habilidad `sealos-canvas` mediante el punto de entrada del plugin instalado.

`/sealos-deploy`, `/sealos-database` y `/sealos-s3` son entradas directas de habilidades de `skills.sh`. Para usar el plugin, debes usar `$sealos` en Codex o `/sealos` en Claude Code.

## Qué gestiona Sealos Deploy

En un despliegue habitual, el agente:

- evalúa la estructura del proyecto y sus necesidades de ejecución
- reutiliza una imagen existente o crea una cuando sea necesario
- genera una plantilla de Sealos
- despliega y verifica el rollout
- verifica la URL real de Sealos App, los registros, el flujo de inicio de sesión o configuración de las aplicaciones web y el conjunto de recursos antes de declarar que la aplicación está disponible

Cuando ya existe un despliegue, las ejecuciones posteriores cambian a un flujo de actualización in situ.

## Qué gestiona Sealos Database

Para un proyecto local o un Devbox que necesita una base de datos en la nube, el agente:

- detecta señales de base de datos como `DATABASE_URL`, Prisma, Drizzle, MongoDB, MySQL o Redis
- usa `sealos-cli database` para listar, crear, inspeccionar y conectar bases de datos de Sealos Cloud
- escribe únicamente la clave de entorno local necesaria sin revelar secretos en el chat
- verifica la ruta real de la base de datos de la aplicación mediante migraciones, introspección o comprobaciones de inicio
- gestiona el acceso público solo después de recibir confirmación

## Qué gestiona Sealos S3

Para un proyecto local o un Devbox que necesita almacenamiento de objetos compatible con S3, el agente:

- detecta señales de almacenamiento de objetos como claves de entorno de S3, uso de AWS SDK, MinIO, rutas de carga o código de URL prefirmadas
- usa `sealos-cli s3` de `zjy365/sealos-cli#28` para listar, crear, inspeccionar y actualizar buckets de almacenamiento de objetos
- inicializa las credenciales de S3 solo cuando son necesarias y mantiene las claves de acceso fuera del chat
- configura el conjunto mínimo de claves de entorno locales para el bucket, el endpoint, la clave de acceso, la clave secreta, la región y el estilo de ruta
- verifica la carga, el listado, la descarga, la eliminación o el comportamiento de las URL prefirmadas mediante la ruta real de almacenamiento del proyecto
- hace públicos los buckets o rota las credenciales solo después de recibir confirmación

## Qué gestiona Sealos Canvas

Para un repositorio ya desplegado mediante Sealos Deploy, el agente:

1. Lee `.sealos/state.json` para localizar la aplicación desplegada.
2. Consulta el namespace de Sealos con comandos `kubectl get` de solo lectura.
3. Inicia una interfaz de lienzo temporal en `127.0.0.1`.
4. Muestra y abre la dirección de la interfaz local para inspeccionarla.

Si el proyecto no está desplegado, Sealos Canvas se detiene e indica al usuario que despliegue primero el proyecto.

## Cómo funciona la configuración

Solo necesitas un agente de IA compatible con plugins o con `skills.sh` y un proyecto que desplegar.

Durante los flujos de despliegue, base de datos y almacenamiento de objetos, Sealos Skills:

- comprueba si están disponibles herramientas como Docker y `kubectl`
- guía al usuario durante el inicio de sesión en Sealos cuando sea necesario
- usa `sealos-cli` para crear bases de datos de Sealos Cloud, obtener los datos de conexión y realizar operaciones de base de datos
- usa `sealos-cli s3` para gestionar buckets de almacenamiento de objetos de Sealos, credenciales, comprobaciones de cuota, operaciones con objetos y URL prefirmadas
- usa o ayuda a preparar una ruta de registro de contenedores como Docker Hub o GHCR

Un despliegue real requiere una cuenta de Sealos Cloud y acceso a un registro de contenedores. La habilidad puede guiarte durante esta configuración una vez iniciada. El trabajo con bases de datos y almacenamiento de objetos requiere una cuenta de Sealos Cloud y un espacio de trabajo que pueda crear los recursos solicitados.

## Habilidades incluidas

El plugin y el paquete de `skills.sh` ofrecen la misma fuente de habilidades:

- `sealos-deploy` — despliega un proyecto local o de GitHub en Sealos Cloud
- `sealos-database` — crea, conecta y opera bases de datos de Sealos Cloud para el desarrollo
- `sealos-s3` — crea buckets, conecta credenciales, comprueba la cuota y opera almacenamiento de objetos compatible con Sealos S3
- `sealos-canvas` — consulta recursos desplegados de Sealos en una interfaz de lienzo local de solo lectura
- `sealos-app-builder` — crea aplicaciones de Sealos Desktop con integración del SDK
- `cloud-native-readiness` — evalúa la preparación para el despliegue
- `dockerfile-skill` — genera Dockerfile preparados para producción
- `docker-to-sealos` — convierte servicios de Docker Compose en plantillas de Sealos

## Por qué usar el plugin

La instalación mediante plugin es la opción preferida para Codex, Claude Code y el resto de herramientas de agente compatibles porque:

- instala todas las habilidades de Sealos como un único paquete administrado
- ofrece las mismas habilidades en todas las herramientas de agentes compatibles
- mantiene juntos los metadatos, el logotipo, los prompts, los comandos y las capacidades del plugin
- evita mantener una copia empaquetada independiente de las habilidades

## Mantenimiento de este repositorio

Las secciones siguientes están dirigidas a los mantenedores del repositorio y a quienes publican el plugin. Los usuarios no las necesitan.

### Distribución del plugin

La integración con Codex sigue la [guía de OpenAI para crear plugins de Codex](https://developers.openai.com/codex/plugins/build):

- `.codex-plugin/plugin.json` contiene la identidad del plugin, los metadatos de descubrimiento, los textos de la interfaz, los prompts predeterminados, los metadatos de marca y las rutas de recursos relativas a la raíz del repositorio.
- `.agents/plugins/marketplace.json` registra el plugin local de este repositorio para las pruebas locales de Codex marketplace.
- `.claude-plugin/plugin.json` y `.claude-plugin/marketplace.json` definen la interfaz del plugin compatible con Claude Code.
- `.qoder-plugin/plugin.json` define la interfaz del plugin de Qoder y expone explícitamente las ocho habilidades de Codex.
- `qoder.md` proporciona instrucciones de enrutamiento y seguridad a nivel de Qoder sin copiar las implementaciones de las habilidades.
- `distribution/platforms.json` registra las declaraciones de compatibilidad con plataformas y sus evidencias.
- `marketplaces/README.md` mantiene las reglas del marketplace y evita exagerar la compatibilidad con comandos.
- `scripts/validate-codex-plugin.py` valida el manifiesto de Codex, los metadatos de Claude Code, los marketplaces del repositorio, el registro de plataformas y las rutas de recursos.
- `scripts/package-qoder-plugin.py` genera un ZIP compatible con Qoder con el manifiesto del plugin en la raíz del archivo.
- `skills/**/SKILL.md` continúa siendo la única fuente de habilidades; no añadas una segunda copia empaquetada de las habilidades.

Valida los metadatos del plugin antes de publicar o enviar cambios en los manifiestos:

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

### Estructura del repositorio

[`skills/`](../skills) es la única fuente de verdad para el despliegue de Sealos, el lienzo de Sealos y las habilidades auxiliares que se usan durante el flujo de despliegue. El mismo directorio raíz de habilidades sirve para las instalaciones de `skills.sh` y para todos los manifiestos de plugins o extensiones de este repositorio.

Archivos de distribución importantes:

- [`.codex-plugin/plugin.json`](../.codex-plugin/plugin.json) — manifiesto del plugin de Codex
- [`.agents/plugins/marketplace.json`](../.agents/plugins/marketplace.json) — entrada local de Codex marketplace
- [`.claude-plugin/plugin.json`](../.claude-plugin/plugin.json) — manifiesto del plugin compatible con Claude Code
- [`.qoder-plugin/plugin.json`](../.qoder-plugin/plugin.json) — manifiesto del plugin de Qoder
- [`qoder.md`](../qoder.md) — instrucciones de enrutamiento y seguridad del plugin de Qoder
- [`marketplace.json`](../marketplace.json) y [`.claude-plugin/marketplace.json`](../.claude-plugin/marketplace.json) — entradas de marketplace compatibles con Claude
- [`.codebuddy-plugin/marketplace.json`](../.codebuddy-plugin/marketplace.json) — entrada de CodeBuddy marketplace
- [`gemini-extension.json`](../gemini-extension.json) — extensión de contexto de Gemini CLI
- [`qwen-extension.json`](../qwen-extension.json) — extensión de contexto de Qwen Code
- [`openclaw.plugin.json`](../openclaw.plugin.json) — referencia al paquete de OpenClaw / ClawHub
- [`commands/sealos.md`](../commands/sealos.md) — entrada del comando de plugin `/sealos` para hosts compatibles
- [`distribution/platforms.json`](../distribution/platforms.json) — registro de compatibilidad con plataformas
- [`marketplaces/README.md`](../marketplaces/README.md) — reglas del marketplace y titularidad de las declaraciones de compatibilidad
- [`scripts/validate-codex-plugin.py`](../scripts/validate-codex-plugin.py) — script de validación del plugin de Codex
- [`scripts/package-qoder-plugin.py`](../scripts/package-qoder-plugin.py) — empaquetador ZIP de Qoder

No añadas una segunda copia empaquetada de las habilidades. La raíz `skills/**` es la única fuente de habilidades para todas las rutas de instalación.

## Licencia

MIT
