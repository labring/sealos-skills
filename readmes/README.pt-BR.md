# Sealos Skills

<!-- README-I18N:START -->

[English](../README.md) | [简体中文](./README.zh-CN.md) | [繁體中文](./README.zh-TW.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [Español](./README.es.md) | [Français](./README.fr.md) | [Deutsch](./README.de.md) | **Português (Brasil)** | [Русский](./README.ru.md) | [العربية](./README.ar.md) | [हिन्दी](./README.hi.md) | [Bahasa Indonesia](./README.id.md)

<!-- README-I18N:END -->

Implante projetos no [Sealos Cloud](https://sealos.io) a partir do seu agente de IA.

Sealos Skills é um pacote de habilidades orientado a plugins e focado no desenvolvimento e na implantação no Sealos Cloud. Ele ajuda um agente de IA a inspecionar um projeto e preparar artefatos de implantação ausentes. Ele conecta bancos de dados e armazenamento de objetos do Sealos Cloud para desenvolvimento. Ele cria ou reutiliza uma imagem de contêiner, implanta o aplicativo no Sealos Cloud e mostra os recursos implantados em um canvas local somente para leitura.

Um único comando `npx plugins add` instala o plugin em todas as ferramentas de agente detectadas. As instalações nativas por marketplace para Codex e Claude Code usam a mesma fonte raiz `skills/**`. O `skills.sh` e hosts de extensão que fornecem apenas contexto, como Gemini CLI e Qwen Code, também a utilizam.

## Início rápido

### TLDR

```bash
npx plugins add https://github.com/labring/sealos-skills
```

Um único comando instala o plugin Sealos em todas as ferramentas de agente detectadas: Claude Code, Cursor, Codex, Grok Build, Kimi Code, GitHub Copilot CLI e VS Code. Execute `npx plugins targets` para listar as ferramentas detectadas ou passe `--target <tool>` para instalar em apenas uma ferramenta.

### Instalar nativamente no Codex

Adicione este repositório como um Codex marketplace e depois instale o plugin Sealos:

```bash
codex plugin marketplace add labring/sealos-skills
codex plugin add sealos@sealos
```

O plugin instala as oito habilidades a partir do diretório raiz `skills/**`. Consulte **Habilidades incluídas** abaixo para saber o que cada habilidade faz.

Após a instalação no Codex, use o plugin pelo Codex:

- **Codex CLI:** digite `$sealos`
- **Codex App:** clique no botão **+** no canto inferior esquerdo da caixa de chat, depois escolha **Plugins** → **Sealos**

![Selecionar o plugin Sealos no Codex App](../assets/codex-sealos.png)

Exemplos no Codex:

```text
$sealos deploy this repo to Sealos Cloud
$sealos deploy /path/to/project
$sealos deploy https://github.com/labring-sigs/kite
$sealos create a cloud Postgres database for this repo and wire DATABASE_URL
$sealos create private S3 object storage for uploads and wire env vars
```

### Instalar nativamente no Claude Code

Adicione este repositório como um Claude Code marketplace e depois instale o plugin Sealos:

```bash
claude plugin marketplace add labring/sealos-skills
claude plugin install sealos@sealos
```

Após a instalação no Claude Code, use `/sealos`:

```text
/sealos deploy this repo to Sealos Cloud
/sealos deploy /path/to/project
/sealos deploy https://github.com/labring-sigs/kite
/sealos create a cloud Postgres database for this repo and wire DATABASE_URL
/sealos create private S3 object storage for uploads and wire env vars
```

### Ferramentas de IA compatíveis

| Ferramenta | Instalação | Uso |
| --- | --- | --- |
| Codex CLI / Codex App | `npx plugins add https://github.com/labring/sealos-skills --target codex` ou veja **Instalar nativamente no Codex** acima | `$sealos` no Codex CLI ou **+** → **Plugins** → **Sealos** no Codex App |
| Claude Code | `npx plugins add https://github.com/labring/sealos-skills --target claude-code` ou veja **Instalar nativamente no Claude Code** acima | `/sealos` |
| Cursor / Grok Build / Kimi Code / Copilot CLI / VS Code | `npx plugins add https://github.com/labring/sealos-skills` | Entrada de comando do host após a instalação |
| OpenClaw / ClawHub | `clawhub install labring/sealos-skills` | A exposição de comandos do host depende do runtime do ClawHub |
| CodeBuddy | `/plugin marketplace add labring/sealos-skills` | A exposição de comandos do host depende do runtime do CodeBuddy |
| Gemini CLI | `gemini extensions install https://github.com/labring/sealos-skills` | Extensão apenas de contexto; peça ao Gemini para usar Sealos Skills |
| Qwen Code | `qwen extensions install https://github.com/labring/sealos-skills` | Extensão apenas de contexto; peça ao Qwen para usar Sealos Skills |
| Amp / importadores genéricos de repositório | Importe `https://github.com/labring/sealos-skills.git` | Depende do host |

Os manifestos do Gemini CLI e do Qwen Code fornecem o contexto do repositório por meio de `CLAUDE.md`. Eles não declaram suporte a comandos com barra.

### Alternativa: instalar como pacote de habilidades do `skills.sh`

Se o seu agente usa `skills.sh` diretamente, instale o mesmo pacote de habilidades com:

```bash
npx skills add labring/sealos-skills
```

Depois execute diretamente a habilidade de implantação:

```text
/sealos-deploy
/sealos-deploy /path/to/project
/sealos-deploy https://github.com/labring-sigs/kite
/sealos-database create a cloud Postgres database for this repo and wire DATABASE_URL
/sealos-s3 create private object storage for uploads and wire env vars
```

Se o projeto estiver implantado, use a habilidade `sealos-canvas` pelo ponto de entrada do plugin instalado.

`/sealos-deploy`, `/sealos-database` e `/sealos-s3` são entradas diretas de habilidades do `skills.sh`. Para usar o plugin, você deve usar `$sealos` no Codex ou `/sealos` no Claude Code.

## O que o Sealos Deploy gerencia

Em uma implantação típica, o agente:

- avalia a estrutura do projeto e os requisitos de runtime
- reutiliza uma imagem existente ou cria uma quando necessário
- gera um template Sealos
- implanta e verifica o rollout
- verifica a URL real do Sealos App, os logs, o fluxo de login ou configuração de aplicativos web e o conjunto de recursos antes de informar que o aplicativo está disponível

Quando já existe uma implantação, as execuções seguintes mudam para um fluxo de atualização no local.

## O que o Sealos Database gerencia

Para um projeto local ou Devbox que precisa de um banco de dados em nuvem, o agente:

- detecta sinais de banco de dados como `DATABASE_URL`, Prisma, Drizzle, MongoDB, MySQL ou Redis
- usa `sealos-cli database` para listar, criar, inspecionar e conectar bancos de dados Sealos Cloud
- grava somente a chave de ambiente local necessária sem expor segredos no chat
- verifica o caminho real do banco de dados do aplicativo por meio de migrações, introspecção ou verificações de inicialização
- gerencia o acesso público somente após confirmação

## O que o Sealos S3 gerencia

Para um projeto local ou Devbox que precisa de armazenamento de objetos compatível com S3, o agente:

- detecta sinais de armazenamento de objetos como chaves de ambiente S3, uso do AWS SDK, MinIO, caminhos de upload ou código de URL pré-assinada
- usa `sealos-cli s3` de `zjy365/sealos-cli#28` para listar, criar, inspecionar e atualizar buckets de armazenamento de objetos
- inicializa as credenciais S3 somente quando necessário e mantém as chaves de acesso fora do chat
- configura o conjunto mínimo de chaves de ambiente locais para bucket, endpoint, chave de acesso, chave secreta, região e definições de path-style
- verifica upload, listagem, download, exclusão ou URLs pré-assinadas usando o caminho real de armazenamento do projeto
- torna buckets públicos ou alterna credenciais somente após confirmação

## O que o Sealos Canvas gerencia

Para um repositório já implantado pelo Sealos Deploy, o agente:

1. Lê `.sealos/state.json` para localizar o aplicativo implantado.
2. Consulta o namespace do Sealos com comandos `kubectl get` somente para leitura.
3. Inicia uma interface de canvas temporária em `127.0.0.1`.
4. Exibe e abre o endereço da interface local para inspeção.

Se o projeto não estiver implantado, o Sealos Canvas interrompe o fluxo e orienta o usuário a implantar o projeto primeiro.

## Como funciona a configuração

Você precisa apenas de um agente de IA compatível com plugins ou com `skills.sh` e de um projeto para implantar.

Durante os fluxos de implantação, banco de dados e armazenamento de objetos, o Sealos Skills:

- verifica se ferramentas como Docker e `kubectl` estão disponíveis
- orienta o usuário durante o login no Sealos quando necessário
- usa `sealos-cli` para criar bancos de dados Sealos Cloud, obter detalhes de conexão e executar operações de banco de dados
- usa `sealos-cli s3` para gerenciar buckets de armazenamento de objetos Sealos, credenciais, verificações de cota, operações com objetos e URLs pré-assinadas
- usa ou ajuda a preparar um caminho de registry de contêineres, como Docker Hub ou GHCR

Para uma implantação real, você precisa de uma conta no Sealos Cloud e de acesso a um registry de contêineres. A habilidade pode orientar você nessa configuração depois de iniciada. Para o trabalho com banco de dados e armazenamento de objetos, você precisa de uma conta no Sealos Cloud e de um workspace capaz de criar os recursos solicitados.

## Habilidades incluídas

O plugin e o pacote `skills.sh` oferecem a mesma fonte de habilidades:

- `sealos-deploy` — implanta um projeto local ou do GitHub no Sealos Cloud
- `sealos-database` — cria, conecta e opera bancos de dados Sealos Cloud para desenvolvimento
- `sealos-s3` — cria buckets, conecta credenciais, verifica cotas e opera armazenamento de objetos compatível com Sealos S3
- `sealos-canvas` — visualiza recursos Sealos implantados em uma interface de canvas local somente para leitura
- `sealos-app-builder` — cria aplicativos Sealos Desktop com integração do SDK
- `cloud-native-readiness` — avalia a prontidão para implantação
- `dockerfile-skill` — gera Dockerfiles prontos para produção
- `docker-to-sealos` — converte serviços do Docker Compose em templates Sealos

## Por que usar o plugin

Prefira a instalação por plugin para Codex, Claude Code e as outras ferramentas de agente compatíveis porque ela:

- instala todas as habilidades Sealos como um único pacote gerenciado
- oferece as mesmas habilidades em todas as ferramentas de agentes compatíveis
- mantém juntos os metadados, o logotipo, os prompts, os comandos e os recursos do plugin
- evita a manutenção de uma cópia empacotada separada das habilidades

## Manutenção deste repositório

As seções abaixo são destinadas aos mantenedores do repositório e aos publicadores do plugin. Os usuários não precisam delas.

### Distribuição do plugin

A integração com o Codex segue o [guia da OpenAI para criação de plugins do Codex](https://developers.openai.com/codex/plugins/build):

- `.codex-plugin/plugin.json` contém a identidade do plugin, os metadados de descoberta, os textos da interface, os prompts padrão, os metadados da marca e os caminhos de recursos relativos à raiz do repositório.
- `.agents/plugins/marketplace.json` registra o plugin local deste repositório para testes locais do Codex marketplace.
- `.claude-plugin/plugin.json` e `.claude-plugin/marketplace.json` definem a interface do plugin compatível com Claude Code.
- `.qoder-plugin/plugin.json` define a interface do plugin Qoder e expõe explicitamente as oito habilidades do Codex.
- `qoder.md` fornece instruções de roteamento e segurança no nível do Qoder sem copiar as implementações das habilidades.
- `distribution/platforms.json` registra as declarações de suporte a plataformas e suas evidências.
- `marketplaces/README.md` mantém as regras do marketplace e evita declarações exageradas de suporte a comandos.
- `scripts/validate-codex-plugin.py` valida o manifesto do Codex, os metadados do Claude Code, os marketplaces do repositório, o registro de plataformas e os caminhos de recursos.
- `scripts/package-qoder-plugin.py` cria um ZIP compatível com o Qoder com o manifesto do plugin na raiz do arquivo.
- `skills/**/SKILL.md` continua sendo a única fonte das habilidades; não adicione uma segunda cópia empacotada das habilidades.

Valide os metadados do plugin antes de publicar ou enviar alterações de manifesto:

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

### Layout do repositório

[`skills/`](../skills) é a única fonte de verdade para o Sealos Deploy, o Sealos Canvas e as habilidades auxiliares usadas durante o fluxo de implantação. O mesmo diretório de habilidades na raiz atende às instalações do `skills.sh` e a todos os manifestos de plugins ou extensões deste repositório.

Arquivos de distribuição importantes:

- [`.codex-plugin/plugin.json`](../.codex-plugin/plugin.json) — manifesto do plugin Codex
- [`.agents/plugins/marketplace.json`](../.agents/plugins/marketplace.json) — entrada local do Codex marketplace
- [`.claude-plugin/plugin.json`](../.claude-plugin/plugin.json) — manifesto do plugin compatível com Claude Code
- [`.qoder-plugin/plugin.json`](../.qoder-plugin/plugin.json) — manifesto do plugin Qoder
- [`qoder.md`](../qoder.md) — instruções de roteamento e segurança do plugin Qoder
- [`marketplace.json`](../marketplace.json) e [`.claude-plugin/marketplace.json`](../.claude-plugin/marketplace.json) — entradas de marketplace compatíveis com Claude
- [`.codebuddy-plugin/marketplace.json`](../.codebuddy-plugin/marketplace.json) — entrada do CodeBuddy marketplace
- [`gemini-extension.json`](../gemini-extension.json) — extensão de contexto do Gemini CLI
- [`qwen-extension.json`](../qwen-extension.json) — extensão de contexto do Qwen Code
- [`openclaw.plugin.json`](../openclaw.plugin.json) — referência ao pacote OpenClaw / ClawHub
- [`commands/sealos.md`](../commands/sealos.md) — entrada de comando do plugin `/sealos` para hosts compatíveis
- [`distribution/platforms.json`](../distribution/platforms.json) — registro de suporte a plataformas
- [`marketplaces/README.md`](../marketplaces/README.md) — regras do marketplace e responsabilidade pelas declarações de suporte
- [`scripts/validate-codex-plugin.py`](../scripts/validate-codex-plugin.py) — script de validação do plugin Codex
- [`scripts/package-qoder-plugin.py`](../scripts/package-qoder-plugin.py) — empacotador ZIP do Qoder

Não adicione uma segunda cópia empacotada das habilidades. A raiz `skills/**` é a única fonte de habilidades para todos os caminhos de instalação.

## Licença

MIT
