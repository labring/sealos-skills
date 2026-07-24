# Sealos Skills

<!-- README-I18N:START -->

[English](../README.md) | [简体中文](./README.zh-CN.md) | [繁體中文](./README.zh-TW.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [Español](./README.es.md) | **Français** | [Deutsch](./README.de.md) | [Português (Brasil)](./README.pt-BR.md) | [Русский](./README.ru.md) | [العربية](./README.ar.md) | [हिन्दी](./README.hi.md) | [Bahasa Indonesia](./README.id.md)

<!-- README-I18N:END -->

Déployez des projets sur [Sealos Cloud](https://sealos.io) depuis votre agent IA.

Sealos Skills est un ensemble de compétences axé sur les plugins pour le développement et le déploiement sur Sealos Cloud. Il aide un agent IA à inspecter un projet, préparer les artefacts de déploiement manquants, connecter les bases de données et le stockage objet Sealos Cloud pour le développement, créer ou réutiliser une image de conteneur, publier l'application sur Sealos Cloud et afficher les ressources déployées dans un canevas local en lecture seule.

La méthode recommandée pour Codex consiste à installer le plugin Codex natif. Les installations de plugins entre différents hôtes, `skills.sh` et les hôtes d'extension qui fournissent uniquement du contexte, comme Gemini CLI et Qwen Code, utilisent tous la même source racine `skills/**`.

## Démarrage rapide

### Recommandé : installer dans Codex

Ajoutez ce dépôt comme Codex marketplace, puis installez le plugin Sealos :

```bash
codex plugin marketplace add labring/sealos-skills
codex plugin add sealos@sealos
```

Un seul plugin Sealos installe depuis la racine `skills/**` les compétences de déploiement, de base de données, de S3, de canevas, de création d'applications et les compétences cloud-native associées : `sealos-deploy`, `sealos-database`, `sealos-s3`, `sealos-canvas`, `sealos-app-builder`, `cloud-native-readiness`, `dockerfile-skill` et `docker-to-sealos`.

Pour la compatibilité et les tests locaux avec Codex, installez le même plugin avec :

```bash
npx plugins add https://github.com/labring/sealos-skills --target codex
```

Après l'installation dans Codex, utilisez le plugin depuis Codex :

- **Codex CLI :** saisissez `$sealos`
- **Codex App :** cliquez sur le bouton **+** en bas à gauche du champ de saisie, choisissez **Plugins**, puis **Sealos**

![Sélectionner le plugin Sealos dans Codex App](../assets/codex-sealos.png)

Exemples Codex :

```text
$sealos deploy this repo to Sealos Cloud
$sealos deploy /path/to/project
$sealos deploy https://github.com/labring-sigs/kite
$sealos create a cloud Postgres database for this repo and wire DATABASE_URL
$sealos create private S3 object storage for uploads and wire env vars
```

### Installer dans Claude Code

Ajoutez ce dépôt comme Claude Code marketplace, puis installez le plugin Sealos :

```bash
claude plugin marketplace add labring/sealos-skills
claude plugin install sealos@sealos
```

Pour la compatibilité avec les installateurs de plugins multi-hôtes, installez le même plugin avec :

```bash
npx plugins add https://github.com/labring/sealos-skills --target claude-code
```

Si un seul outil d'agent est détecté sur la machine, vous pouvez laisser `plugins` choisir la cible :

```bash
npx plugins add https://github.com/labring/sealos-skills
```

Après l'installation dans Claude Code, utilisez `/sealos` :

```text
/sealos deploy this repo to Sealos Cloud
/sealos deploy /path/to/project
/sealos deploy https://github.com/labring-sigs/kite
/sealos create a cloud Postgres database for this repo and wire DATABASE_URL
/sealos create private S3 object storage for uploads and wire env vars
```

### Autres outils IA pris en charge

| Outil | Installation | Utilisation |
| --- | --- | --- |
| Codex CLI / Codex App | `codex plugin marketplace add labring/sealos-skills`, puis `codex plugin add sealos@sealos` | `$sealos` dans Codex CLI, ou **+** → **Plugins** → **Sealos** dans Codex App |
| Claude Code | `claude plugin marketplace add labring/sealos-skills`, puis `claude plugin install sealos@sealos` | `/sealos` |
| Chemin de compatibilité Claude Code | `npx plugins add https://github.com/labring/sealos-skills --target claude-code` | `/sealos` |
| OpenClaw / ClawHub | `clawhub install labring/sealos-skills` | L'exposition des commandes de l'hôte dépend de l'environnement d'exécution ClawHub |
| CodeBuddy | `/plugin marketplace add labring/sealos-skills` | L'exposition des commandes de l'hôte dépend de l'environnement d'exécution CodeBuddy |
| Gemini CLI | `gemini extensions install https://github.com/labring/sealos-skills` | Extension de contexte uniquement ; demandez à Gemini d'utiliser Sealos Skills |
| Qwen Code | `qwen extensions install https://github.com/labring/sealos-skills` | Extension de contexte uniquement ; demandez à Qwen d'utiliser Sealos Skills |
| Amp / Kimi / importateurs de dépôts génériques | Importez `https://github.com/labring/sealos-skills.git` | Dépend de l'hôte |

Les manifestes Gemini CLI et Qwen Code fournissent le contexte du dépôt via `CLAUDE.md` ; ils ne déclarent pas la prise en charge des commandes slash.

### Alternative : installer comme ensemble de compétences `skills.sh`

Si votre agent utilise directement `skills.sh`, installez le même ensemble de compétences avec :

```bash
npx skills add labring/sealos-skills
```

Exécutez ensuite directement la compétence de déploiement :

```text
/sealos-deploy
/sealos-deploy /path/to/project
/sealos-deploy https://github.com/labring-sigs/kite
/sealos-database create a cloud Postgres database for this repo and wire DATABASE_URL
/sealos-s3 create private object storage for uploads and wire env vars
```

Une fois le projet déployé, utilisez la compétence `sealos-canvas` via le point d'entrée du plugin installé.

`/sealos-deploy`, `/sealos-database` et `/sealos-s3` sont des entrées directes de compétences `skills.sh`. Pour le plugin, utilisez `$sealos` dans Codex ou `/sealos` dans Claude Code.

## Pourquoi utiliser le plugin

L'installation du plugin est recommandée pour Codex et Claude Code, car elle :

- installe toutes les compétences Sealos sous forme d'un seul paquet géré
- fournit les mêmes compétences dans tous les outils d'agents pris en charge
- regroupe les métadonnées, le logo, les prompts, les commandes et les capacités du plugin
- évite de maintenir une copie empaquetée distincte des compétences

## Distribution du plugin

L'intégration Codex suit le [guide OpenAI de création de plugins Codex](https://developers.openai.com/codex/plugins/build) :

- `.codex-plugin/plugin.json` contient l'identité du plugin, les métadonnées de découverte, les textes de l'interface, les prompts par défaut, les métadonnées de marque et les chemins des ressources relatifs à la racine du dépôt.
- `.agents/plugins/marketplace.json` enregistre le plugin local de ce dépôt pour les tests locaux de Codex marketplace.
- `.claude-plugin/plugin.json` et `.claude-plugin/marketplace.json` définissent l'interface du plugin compatible avec Claude Code.
- `distribution/platforms.json` consigne les déclarations de prise en charge des plateformes et leurs preuves.
- `marketplaces/README.md` gère les règles du marketplace et empêche de surestimer la prise en charge des commandes.
- `scripts/validate-codex-plugin.py` valide le manifeste Codex, les métadonnées Claude Code, les marketplaces du dépôt, le registre des plateformes et les chemins des ressources.
- `skills/**/SKILL.md` reste l'unique source des compétences ; n'ajoutez pas de seconde copie empaquetée.

Validez les métadonnées du plugin avant de publier ou de pousser des modifications de manifeste :

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

## Fonctionnement de la configuration

Vous avez uniquement besoin d'un agent IA compatible avec les plugins ou `skills.sh` et d'un projet à déployer.

Pendant les workflows de déploiement, de base de données et de stockage objet, Sealos Skills :

- vérifie la disponibilité d'outils tels que Docker et `kubectl`
- guide l'utilisateur dans la connexion à Sealos lorsque cela est nécessaire
- utilise `sealos-cli` pour créer des bases de données Sealos Cloud, récupérer les informations de connexion et effectuer des opérations de base de données
- utilise `sealos-cli s3` pour gérer les buckets de stockage objet Sealos, les identifiants, les contrôles de quota, les opérations sur les objets et les URL présignées
- utilise ou aide à préparer un chemin de registre de conteneurs tel que Docker Hub ou GHCR

Un déploiement réel nécessite un compte Sealos Cloud et l'accès à un registre de conteneurs, mais leur configuration complète peut être effectuée après le démarrage de la compétence. Les opérations de base de données et de stockage objet nécessitent un compte Sealos Cloud et un espace de travail capable de créer les ressources demandées.

## Ce que gère Sealos Deploy

Lors d'un déploiement classique, l'agent :

- évalue la structure du projet et ses besoins d'exécution
- réutilise une image existante ou en crée une si nécessaire
- génère un modèle Sealos
- déploie et vérifie le rollout
- vérifie l'URL réelle de Sealos App, les journaux, le processus de connexion ou de configuration des applications web et l'ensemble des ressources avant d'indiquer que l'application est utilisable

Les exécutions suivantes peuvent passer à un workflow de mise à jour sur place lorsqu'un déploiement existant est détecté.

## Ce que gère Sealos Database

Pour un projet local ou un Devbox qui nécessite une base de données cloud, l'agent :

- détecte les signaux de base de données tels que `DATABASE_URL`, Prisma, Drizzle, MongoDB, MySQL ou Redis
- utilise `sealos-cli database` pour répertorier, créer, inspecter et connecter des bases de données Sealos Cloud
- écrit uniquement la clé d'environnement locale requise sans exposer les secrets dans le chat
- vérifie le chemin réel de la base de données de l'application par des migrations, une introspection ou des contrôles de démarrage
- gère l'accès public uniquement après confirmation

## Ce que gère Sealos S3

Pour un projet local ou un Devbox qui nécessite un stockage objet compatible S3, l'agent :

- détecte les signaux de stockage objet tels que les clés d'environnement S3, l'utilisation d'AWS SDK, MinIO, les chemins d'envoi ou le code d'URL présignée
- utilise `sealos-cli s3` de `zjy365/sealos-cli#28` pour répertorier, créer, inspecter et mettre à jour les buckets de stockage objet
- initialise les identifiants S3 uniquement lorsque cela est nécessaire et garde les clés d'accès hors du chat
- configure le minimum de clés d'environnement locales requises pour le bucket, l'endpoint, la clé d'accès, la clé secrète, la région et les paramètres de type path-style
- vérifie l'envoi, la liste, le téléchargement, la suppression ou les URL présignées avec le chemin de stockage réel du projet
- rend les buckets publics ou renouvelle les identifiants uniquement après confirmation

## Ce que gère Sealos Canvas

Pour un dépôt déjà déployé par Sealos Deploy, l'agent :

1. Lit `.sealos/state.json` pour localiser l'application déployée.
2. Interroge le namespace Sealos avec des commandes `kubectl get` en lecture seule.
3. Démarre une interface de canevas temporaire sur `127.0.0.1`.
4. Affiche et ouvre l'adresse de l'interface locale pour inspection.

Si le projet n'a pas encore été déployé, Sealos Canvas s'arrête et demande à l'utilisateur de déployer d'abord le projet.

## Compétences incluses

Le plugin et le paquet `skills.sh` exposent la même source de compétences :

- `sealos-deploy` — déploie un projet local ou GitHub sur Sealos Cloud
- `sealos-database` — crée, connecte et exploite des bases de données Sealos Cloud pour le développement
- `sealos-s3` — crée des buckets, connecte les identifiants, vérifie le quota et exploite le stockage objet compatible Sealos S3
- `sealos-canvas` — affiche les ressources Sealos déployées dans une interface de canevas locale en lecture seule
- `sealos-app-builder` — crée des applications Sealos Desktop avec l'intégration du SDK
- `cloud-native-readiness` — évalue la préparation au déploiement
- `dockerfile-skill` — génère des Dockerfile prêts pour la production
- `docker-to-sealos` — convertit les services Docker Compose en modèles Sealos

## Dépôt

[`skills/`](../skills) est l'unique source de vérité pour le déploiement Sealos, le canevas Sealos et les compétences associées utilisées pendant le workflow de déploiement. Le même répertoire racine de compétences sert aux installations `skills.sh` et à tous les manifestes de plugins ou d'extensions de ce dépôt.

Fichiers de distribution importants :

- [`.codex-plugin/plugin.json`](../.codex-plugin/plugin.json) — manifeste du plugin Codex
- [`.agents/plugins/marketplace.json`](../.agents/plugins/marketplace.json) — entrée locale Codex marketplace
- [`.claude-plugin/plugin.json`](../.claude-plugin/plugin.json) — manifeste du plugin compatible avec Claude Code
- [`marketplace.json`](../marketplace.json) et [`.claude-plugin/marketplace.json`](../.claude-plugin/marketplace.json) — entrées de marketplace compatibles avec Claude
- [`.codebuddy-plugin/marketplace.json`](../.codebuddy-plugin/marketplace.json) — entrée CodeBuddy marketplace
- [`gemini-extension.json`](../gemini-extension.json) — extension de contexte Gemini CLI
- [`qwen-extension.json`](../qwen-extension.json) — extension de contexte Qwen Code
- [`openclaw.plugin.json`](../openclaw.plugin.json) — pointeur vers le paquet OpenClaw / ClawHub
- [`commands/sealos.md`](../commands/sealos.md) — entrée de commande du plugin `/sealos` pour les hôtes compatibles
- [`distribution/platforms.json`](../distribution/platforms.json) — registre de prise en charge des plateformes
- [`marketplaces/README.md`](../marketplaces/README.md) — règles du marketplace et responsabilité des déclarations de prise en charge
- [`scripts/validate-codex-plugin.py`](../scripts/validate-codex-plugin.py) — script de validation du plugin Codex

N'ajoutez pas de seconde copie empaquetée des compétences. La racine `skills/**` est l'unique source de compétences pour tous les modes d'installation.

## Licence

MIT
