# Sealos Skills

<!-- README-I18N:START -->

[English](../README.md) | [简体中文](./README.zh-CN.md) | [繁體中文](./README.zh-TW.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [Español](./README.es.md) | **Français** | [Deutsch](./README.de.md) | [Português (Brasil)](./README.pt-BR.md) | [Русский](./README.ru.md) | [العربية](./README.ar.md) | [हिन्दी](./README.hi.md) | [Bahasa Indonesia](./README.id.md)

<!-- README-I18N:END -->

Déployez des projets sur [Sealos Cloud](https://sealos.io) depuis votre agent IA.

Sealos Skills est un ensemble de compétences axé sur les plugins pour le développement et le déploiement sur Sealos Cloud. Il aide un agent IA à inspecter un projet et à préparer les artefacts de déploiement manquants. Il connecte les bases de données et le stockage objet Sealos Cloud pour le développement. Il crée ou réutilise une image de conteneur, déploie l'application sur Sealos Cloud et affiche les ressources déployées dans un canevas local en lecture seule.

Une seule commande `npx plugins add` installe le plugin dans tous les outils d'agent détectés. Les installations natives via le marketplace de Codex et Claude Code utilisent la même source racine `skills/**`. `skills.sh` et les hôtes d'extension qui fournissent uniquement du contexte, comme Gemini CLI et Qwen Code, l'utilisent également.

## Démarrage rapide

### TLDR

```bash
npx plugins add https://github.com/labring/sealos-skills
```

Une seule commande installe le plugin Sealos dans tous les outils d'agent détectés : Claude Code, Cursor, Codex, Grok Build, Kimi Code, GitHub Copilot CLI et VS Code. Exécutez `npx plugins targets` pour lister les outils détectés, ou passez `--target <tool>` pour n'installer que dans un seul outil.

### Installer nativement dans Codex

Ajoutez ce dépôt comme Codex marketplace, puis installez le plugin Sealos :

```bash
codex plugin marketplace add labring/sealos-skills
codex plugin add sealos@sealos
```

Le plugin installe les huit compétences depuis le répertoire racine `skills/**`. Consultez **Compétences incluses** ci-dessous pour connaître le rôle de chacune.

Après l'installation dans Codex, utilisez le plugin depuis Codex :

- **Codex CLI :** saisissez `$sealos`
- **Codex App :** cliquez sur le bouton **+** dans le coin inférieur gauche de la zone de saisie, puis choisissez **Plugins** → **Sealos**

![Sélectionner le plugin Sealos dans Codex App](../assets/codex-sealos.png)

Exemples Codex :

```text
$sealos deploy this repo to Sealos Cloud
$sealos deploy /path/to/project
$sealos deploy https://github.com/labring-sigs/kite
$sealos create a cloud Postgres database for this repo and wire DATABASE_URL
$sealos create private S3 object storage for uploads and wire env vars
```

### Installer nativement dans Claude Code

Ajoutez ce dépôt comme Claude Code marketplace, puis installez le plugin Sealos :

```bash
claude plugin marketplace add labring/sealos-skills
claude plugin install sealos@sealos
```

Après l'installation dans Claude Code, utilisez `/sealos` :

```text
/sealos deploy this repo to Sealos Cloud
/sealos deploy /path/to/project
/sealos deploy https://github.com/labring-sigs/kite
/sealos create a cloud Postgres database for this repo and wire DATABASE_URL
/sealos create private S3 object storage for uploads and wire env vars
```

### Outils IA pris en charge

| Outil | Installation | Utilisation |
| --- | --- | --- |
| Codex CLI / Codex App | `npx plugins add https://github.com/labring/sealos-skills --target codex`, ou voir **Installer nativement dans Codex** ci-dessus | `$sealos` dans Codex CLI, ou **+** → **Plugins** → **Sealos** dans Codex App |
| Claude Code | `npx plugins add https://github.com/labring/sealos-skills --target claude-code`, ou voir **Installer nativement dans Claude Code** ci-dessus | `/sealos` |
| Cursor / Grok Build / Kimi Code / Copilot CLI / VS Code | `npx plugins add https://github.com/labring/sealos-skills` | Point d'entrée des commandes de l'hôte après l'installation |
| OpenClaw / ClawHub | `clawhub install labring/sealos-skills` | L'exposition des commandes de l'hôte dépend du runtime ClawHub |
| CodeBuddy | `/plugin marketplace add labring/sealos-skills` | L'exposition des commandes de l'hôte dépend du runtime CodeBuddy |
| Gemini CLI | `gemini extensions install https://github.com/labring/sealos-skills` | Extension de contexte uniquement. Demandez à Gemini d'utiliser Sealos Skills |
| Qwen Code | `qwen extensions install https://github.com/labring/sealos-skills` | Extension de contexte uniquement. Demandez à Qwen d'utiliser Sealos Skills |
| Amp / importateurs de dépôts génériques | Importez `https://github.com/labring/sealos-skills.git` | Dépend de l'hôte |

Les manifestes de Gemini CLI et Qwen Code fournissent le contexte du dépôt via `CLAUDE.md`. Ils ne déclarent pas la prise en charge des commandes slash.

### Alternative : installer comme ensemble de compétences `skills.sh`

Si votre agent utilise directement `skills.sh`, installez le même ensemble de compétences avec :

```bash
npx skills add labring/sealos-skills
```

Puis exécutez directement la compétence de déploiement :

```text
/sealos-deploy
/sealos-deploy /path/to/project
/sealos-deploy https://github.com/labring-sigs/kite
/sealos-database create a cloud Postgres database for this repo and wire DATABASE_URL
/sealos-s3 create private object storage for uploads and wire env vars
```

Si le projet est déployé, utilisez la compétence `sealos-canvas` via le point d'entrée du plugin installé.

`/sealos-deploy`, `/sealos-database` et `/sealos-s3` sont des entrées directes de compétences `skills.sh`. Pour utiliser le plugin, vous devez utiliser `$sealos` dans Codex ou `/sealos` dans Claude Code.

## Ce que Sealos Deploy gère

Lors d'un déploiement typique, l'agent :

- évalue la structure du projet et ses besoins d'exécution
- réutilise une image existante ou en crée une si nécessaire
- génère un modèle Sealos
- déploie et vérifie le rollout
- vérifie l'URL réelle de Sealos App, les journaux, le flux de connexion/configuration des applications web et l'empreinte des ressources avant de déclarer l'application utilisable

Lorsqu'un déploiement existe, les exécutions suivantes basculent vers un flux de mise à jour sur place.

## Ce que Sealos Database gère

Pour un projet local ou un Devbox qui a besoin d'une base de données cloud, l'agent :

- détecte les signaux de base de données tels que `DATABASE_URL`, Prisma, Drizzle, MongoDB, MySQL ou Redis
- utilise `sealos-cli database` pour lister, créer, inspecter et connecter les bases de données Sealos Cloud
- n'écrit que la clé d'environnement locale requise sans exposer de secrets dans le chat
- vérifie le chemin réel de la base de données de l'application via des migrations, une introspection ou des vérifications de démarrage
- ne gère l'accès public qu'après confirmation

## Ce que Sealos S3 gère

Pour un projet local ou un Devbox qui a besoin d'un stockage objet compatible S3, l'agent :

- détecte les signaux de stockage objet tels que les clés d'environnement S3, l'utilisation d'AWS SDK, MinIO, les chemins d'upload ou le code d'URL présignées
- utilise `sealos-cli s3` de `zjy365/sealos-cli#28` pour lister, créer, inspecter et mettre à jour les buckets de stockage objet
- n'initialise les identifiants S3 qu'en cas de besoin et garde les clés d'accès hors du chat
- configure le minimum de clés d'environnement locales requises pour le bucket, l'endpoint, la clé d'accès, la clé secrète, la région et le style de chemin
- vérifie le comportement d'upload, de listage, de téléchargement, de suppression ou d'URL présignées avec le chemin de stockage réel du projet
- ne rend les buckets publics ou ne renouvelle les identifiants qu'après confirmation

## Ce que Sealos Canvas gère

Pour un dépôt déjà déployé par Sealos Deploy, l'agent :

1. Lit `.sealos/state.json` pour localiser l'application déployée.
2. Interroge le namespace Sealos avec des commandes `kubectl get` en lecture seule.
3. Démarre une interface de canevas temporaire sur `127.0.0.1`.
4. Affiche et ouvre l'adresse de l'interface locale pour inspection.

Si le projet n'est pas déployé, Sealos Canvas s'arrête et indique à l'utilisateur de déployer d'abord le projet.

## Fonctionnement de la configuration

Vous avez seulement besoin d'un agent IA compatible avec les plugins ou avec `skills.sh` et d'un projet à déployer.

Pendant les flux de déploiement, de base de données et de stockage objet, Sealos Skills :

- vérifie la disponibilité d'outils tels que Docker et `kubectl`
- guide l'utilisateur dans la connexion à Sealos si nécessaire
- utilise `sealos-cli` pour la création de bases de données Sealos Cloud, les détails de connexion et les opérations de base de données
- utilise `sealos-cli s3` pour les buckets de stockage objet Sealos, les identifiants, les vérifications de quota, les opérations sur les objets et les URL présignées
- utilise ou aide à préparer un chemin de registre de conteneurs tel que Docker Hub ou GHCR

Pour un déploiement réel, vous avez besoin d'un compte Sealos Cloud et d'un accès à un registre de conteneurs. La compétence peut vous guider dans cette configuration après son démarrage. Pour le travail sur les bases de données et le stockage objet, vous avez besoin d'un compte Sealos Cloud et d'un espace de travail capable de créer les ressources demandées.

## Compétences incluses

Le plugin et l'ensemble `skills.sh` exposent la même source de compétences :

- `sealos-deploy` — déploie un projet local ou GitHub sur Sealos Cloud
- `sealos-database` — crée, connecte et exploite des bases de données Sealos Cloud pour le développement
- `sealos-s3` — crée des buckets, connecte les identifiants, vérifie les quotas et exploite le stockage objet compatible Sealos S3
- `sealos-canvas` — affiche les ressources Sealos déployées dans une interface de canevas locale en lecture seule
- `sealos-app-builder` — crée des applications Sealos Desktop avec intégration du SDK
- `cloud-native-readiness` — évalue la préparation au déploiement
- `dockerfile-skill` — génère des Dockerfiles prêts pour la production
- `docker-to-sealos` — convertit les services Docker Compose en modèles Sealos

## Pourquoi utiliser le plugin

Privilégiez l'installation du plugin pour Codex, Claude Code et les autres outils d'agent pris en charge, car elle :

- installe toutes les compétences Sealos comme un seul paquet géré
- expose les mêmes compétences dans tous les outils d'agent pris en charge
- regroupe les métadonnées du plugin, le logo, les prompts, les commandes et les capacités
- évite de maintenir une copie empaquetée distincte des compétences

## Maintenance de ce dépôt

Les sections ci-dessous s'adressent aux mainteneurs du dépôt et aux éditeurs du plugin. Les utilisateurs n'en ont pas besoin.

### Distribution du plugin

L'intégration Codex suit le [guide de création de plugins Codex d'OpenAI](https://developers.openai.com/codex/plugins/build) :

- `.codex-plugin/plugin.json` contient l'identité du plugin, les métadonnées de découverte, les textes d'interface, les prompts par défaut, les métadonnées de marque et les chemins des ressources relatifs à la racine du dépôt.
- `.agents/plugins/marketplace.json` enregistre le plugin local de ce dépôt pour les tests locaux du Codex marketplace.
- `.claude-plugin/plugin.json` et `.claude-plugin/marketplace.json` définissent la surface du plugin compatible avec Claude Code.
- `.qoder-plugin/plugin.json` définit la surface du plugin Qoder et expose explicitement les huit compétences Codex.
- `qoder.md` fournit des instructions de routage et de sécurité au niveau Qoder sans copier les implémentations des compétences.
- `distribution/platforms.json` consigne les déclarations de prise en charge des plateformes et leurs preuves.
- `marketplaces/README.md` gère les règles du marketplace et empêche toute exagération sur la prise en charge des commandes.
- `scripts/validate-codex-plugin.py` valide le manifeste Codex, les métadonnées Claude Code, les marketplaces du dépôt, le registre des plateformes et les chemins des ressources.
- `scripts/package-qoder-plugin.py` construit un ZIP compatible Qoder avec le manifeste du plugin à la racine de l'archive.
- `skills/**/SKILL.md` reste la seule source de compétences. N'ajoutez pas de seconde copie empaquetée des compétences.

Validez les métadonnées du plugin avant de publier ou de pousser des modifications des manifestes :

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

### Structure du dépôt

[`skills/`](../skills) est la source de vérité unique pour le déploiement Sealos, le canevas Sealos et les compétences de support utilisées pendant le flux de déploiement. Le même répertoire racine de compétences sert aux installations `skills.sh` et à tous les manifestes de plugins ou d'extensions de ce dépôt.

Fichiers de distribution importants :

- [`.codex-plugin/plugin.json`](../.codex-plugin/plugin.json) — manifeste du plugin Codex
- [`.agents/plugins/marketplace.json`](../.agents/plugins/marketplace.json) — entrée locale du Codex marketplace
- [`.claude-plugin/plugin.json`](../.claude-plugin/plugin.json) — manifeste du plugin compatible avec Claude Code
- [`.qoder-plugin/plugin.json`](../.qoder-plugin/plugin.json) — manifeste du plugin Qoder
- [`qoder.md`](../qoder.md) — instructions de routage et de sécurité du plugin Qoder
- [`marketplace.json`](../marketplace.json) et [`.claude-plugin/marketplace.json`](../.claude-plugin/marketplace.json) — entrées de marketplace compatibles avec Claude
- [`.codebuddy-plugin/marketplace.json`](../.codebuddy-plugin/marketplace.json) — entrée du CodeBuddy marketplace
- [`gemini-extension.json`](../gemini-extension.json) — extension de contexte Gemini CLI
- [`qwen-extension.json`](../qwen-extension.json) — extension de contexte Qwen Code
- [`openclaw.plugin.json`](../openclaw.plugin.json) — pointeur vers le paquet OpenClaw / ClawHub
- [`commands/sealos.md`](../commands/sealos.md) — entrée de la commande de plugin `/sealos` pour les hôtes compatibles
- [`distribution/platforms.json`](../distribution/platforms.json) — registre de prise en charge des plateformes
- [`marketplaces/README.md`](../marketplaces/README.md) — règles du marketplace et responsabilité des déclarations de prise en charge
- [`scripts/validate-codex-plugin.py`](../scripts/validate-codex-plugin.py) — script de validation du plugin Codex
- [`scripts/package-qoder-plugin.py`](../scripts/package-qoder-plugin.py) — empaqueteur ZIP Qoder

N'ajoutez pas de seconde copie empaquetée des compétences. La racine `skills/**` est la seule source de compétences pour tous les chemins d'installation.

## Licence

MIT
