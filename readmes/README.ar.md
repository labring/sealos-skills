# Sealos Skills

<!-- README-I18N:START -->

[English](../README.md) | [简体中文](./README.zh-CN.md) | [繁體中文](./README.zh-TW.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [Español](./README.es.md) | [Français](./README.fr.md) | [Deutsch](./README.de.md) | [Português (Brasil)](./README.pt-BR.md) | [Русский](./README.ru.md) | **العربية** | [हिन्दी](./README.hi.md) | [Bahasa Indonesia](./README.id.md)

<!-- README-I18N:END -->

انشر المشاريع على [Sealos Cloud](https://sealos.io) من خلال وكيل الذكاء الاصطناعي لديك.

Sealos Skills هي حزمة مهارات تعتمد على الإضافات وتركز على التطوير والنشر في Sealos Cloud. تساعد وكيل الذكاء الاصطناعي على فحص المشروع وتجهيز عناصر النشر الناقصة. تربط قواعد بيانات Sealos Cloud وتخزين الكائنات لأغراض التطوير. تبني صورة حاوية أو تعيد استخدامها، وتنشر التطبيق على Sealos Cloud، وتعرض الموارد المنشورة في لوحة محلية للقراءة فقط.

يثبّت أمر واحد `npx plugins add` الإضافة في كل أداة وكيل يتم اكتشافها. تستخدم عمليات التثبيت الأصلية عبر marketplace في Codex وClaude Code المصدر نفسه من المسار الجذري `skills/**`. ويستخدمها أيضًا `skills.sh` ومضيفات الامتدادات التي توفر السياق فقط، مثل Gemini CLI وQwen Code.

## البدء السريع

### TLDR

```bash
npx plugins add https://github.com/labring/sealos-skills
```

يثبّت أمر واحد إضافة Sealos في كل أداة وكيل يتم اكتشافها: Claude Code وCursor وCodex وGrok Build وKimi Code وGitHub Copilot CLI وVS Code. شغّل `npx plugins targets` لعرض الأدوات المكتشفة، أو مرّر `--target <tool>` للتثبيت في أداة واحدة فقط.

### التثبيت الأصلي في Codex

أضف هذا المستودع بوصفه Codex marketplace، ثم ثبّت إضافة Sealos:

```bash
codex plugin marketplace add labring/sealos-skills
codex plugin add sealos@sealos
```

تثبّت الإضافة جميع المهارات الثماني من دليل المسار الجذري `skills/**`. راجع **المهارات المضمنة** أدناه لمعرفة وظيفة كل مهارة.

بعد التثبيت في Codex، استخدم الإضافة من Codex:

- **Codex CLI:** اكتب `$sealos`
- **Codex App:** انقر على الزر **+** في الزاوية السفلية اليسرى من حقل المحادثة، واختر **Plugins**، ثم اختر **Sealos**

![اختيار إضافة Sealos في Codex App](../assets/codex-sealos.png)

أمثلة Codex:

```text
$sealos deploy this repo to Sealos Cloud
$sealos deploy /path/to/project
$sealos deploy https://github.com/labring-sigs/kite
$sealos create a cloud Postgres database for this repo and wire DATABASE_URL
$sealos create private S3 object storage for uploads and wire env vars
```

### التثبيت الأصلي في Claude Code

أضف هذا المستودع بوصفه Claude Code marketplace، ثم ثبّت إضافة Sealos:

```bash
claude plugin marketplace add labring/sealos-skills
claude plugin install sealos@sealos
```

بعد التثبيت في Claude Code، استخدم `/sealos`:

```text
/sealos deploy this repo to Sealos Cloud
/sealos deploy /path/to/project
/sealos deploy https://github.com/labring-sigs/kite
/sealos create a cloud Postgres database for this repo and wire DATABASE_URL
/sealos create private S3 object storage for uploads and wire env vars
```

### أدوات الذكاء الاصطناعي المدعومة

| الأداة | التثبيت | الاستخدام |
| --- | --- | --- |
| Codex CLI / Codex App | `npx plugins add https://github.com/labring/sealos-skills --target codex`، أو راجع **التثبيت الأصلي في Codex** أعلاه | ‏`$sealos` في Codex CLI، أو **+** ← **Plugins** ← **Sealos** في Codex App |
| Claude Code | `npx plugins add https://github.com/labring/sealos-skills --target claude-code`، أو راجع **التثبيت الأصلي في Claude Code** أعلاه | `/sealos` |
| Cursor / Grok Build / Kimi Code / Copilot CLI / VS Code | `npx plugins add https://github.com/labring/sealos-skills` | إدخال أمر المضيف بعد التثبيت |
| OpenClaw / ClawHub | `clawhub install labring/sealos-skills` | يعتمد إظهار أوامر المضيف على بيئة تشغيل ClawHub |
| CodeBuddy | `/plugin marketplace add labring/sealos-skills` | يعتمد إظهار أوامر المضيف على بيئة تشغيل CodeBuddy |
| Gemini CLI | `gemini extensions install https://github.com/labring/sealos-skills` | امتداد للسياق فقط؛ اطلب من Gemini استخدام Sealos Skills |
| Qwen Code | `qwen extensions install https://github.com/labring/sealos-skills` | امتداد للسياق فقط؛ اطلب من Qwen استخدام Sealos Skills |
| Amp / أدوات استيراد المستودعات العامة | استورد `https://github.com/labring/sealos-skills.git` | يعتمد على المضيف |

توفر بيانات Gemini CLI وQwen Code سياق المستودع عبر `CLAUDE.md`؛ ولا تعلن دعم أوامر الشرطة المائلة.

### بديل: التثبيت بوصفه حزمة مهارات `skills.sh`

إذا كان وكيلك يستخدم `skills.sh` مباشرة، فثبّت حزمة المهارات نفسها باستخدام:

```bash
npx skills add labring/sealos-skills
```

ثم شغّل مهارة النشر مباشرة:

```text
/sealos-deploy
/sealos-deploy /path/to/project
/sealos-deploy https://github.com/labring-sigs/kite
/sealos-database create a cloud Postgres database for this repo and wire DATABASE_URL
/sealos-s3 create private object storage for uploads and wire env vars
```

بعد نشر المشروع، استخدم مهارة `sealos-canvas` عبر نقطة دخول الإضافة المثبّتة.

تمثل `/sealos-deploy` و`/sealos-database` و`/sealos-s3` نقاط دخول مباشرة لمهارات `skills.sh`. لاستخدام الإضافة، يجب استخدام `$sealos` في Codex أو `/sealos` في Claude Code.

## ما الذي تعالجه Sealos Deploy

في عملية نشر نموذجية، ينفذ الوكيل ما يلي:

- يقيّم بنية المشروع ومتطلبات بيئة التشغيل
- يعيد استخدام صورة موجودة أو يبني واحدة عند الحاجة
- ينشئ قالب Sealos
- ينشر ويتحقق من rollout
- يتحقق من عنوان Sealos App URL الفعلي والسجلات ومسار تسجيل الدخول أو الإعداد لتطبيقات الويب والنطاق الكامل للموارد قبل الإبلاغ عن جاهزية التطبيق للاستخدام

عند وجود عملية نشر قائمة، تنتقل عمليات التشغيل اللاحقة إلى مسار تحديث في الموضع.

## ما الذي تعالجه Sealos Database

بالنسبة إلى مشروع محلي أو Devbox يحتاج إلى قاعدة بيانات سحابية، ينفذ الوكيل ما يلي:

- يكتشف إشارات قواعد البيانات مثل `DATABASE_URL` وPrisma وDrizzle وMongoDB وMySQL وRedis
- يستخدم `sealos-cli database` لعرض قواعد بيانات Sealos Cloud وإنشائها وفحصها والاتصال بها
- يكتب مفتاح البيئة المحلي المطلوب فقط مع إبقاء الأسرار خارج المحادثة
- يتحقق من المسار الفعلي لقاعدة بيانات التطبيق عبر عمليات الترحيل أو الاستبطان أو فحوصات بدء التشغيل
- يدير الوصول العام بعد الحصول على تأكيد فقط

## ما الذي تعالجه Sealos S3

بالنسبة إلى مشروع محلي أو Devbox يحتاج إلى تخزين كائنات متوافق مع S3، ينفذ الوكيل ما يلي:

- يكتشف إشارات تخزين الكائنات مثل مفاتيح بيئة S3 واستخدام AWS SDK وMinIO ومسارات الرفع أو شيفرة عناوين URL الموقعة مسبقًا
- يستخدم `sealos-cli s3` من `zjy365/sealos-cli#28` لعرض حاويات تخزين الكائنات وإنشائها وفحصها وتحديثها
- يهيئ بيانات اعتماد S3 عند الحاجة فقط ويبقي مفاتيح الوصول خارج المحادثة
- يربط الحد الأدنى المطلوب من مفاتيح البيئة المحلية للحاوية ونقطة النهاية ومفتاح الوصول والمفتاح السري والمنطقة وإعدادات path-style
- يتحقق من الرفع والعرض والتنزيل والحذف أو سلوك عناوين URL الموقعة مسبقًا من خلال مسار التخزين الفعلي للمشروع
- يجعل الحاويات عامة أو يدوّر بيانات الاعتماد بعد الحصول على تأكيد فقط

## ما الذي تعالجه Sealos Canvas

بالنسبة إلى مستودع سبق نشره بواسطة Sealos Deploy، ينفذ الوكيل ما يلي:

1. يقرأ `.sealos/state.json` لتحديد موقع التطبيق المنشور.
2. يستعلم عن namespace في Sealos باستخدام أوامر `kubectl get` للقراءة فقط.
3. يشغّل واجهة لوحة مؤقتة على `127.0.0.1`.
4. يعرض عنوان الواجهة المحلية ويفتحه للفحص.

إذا لم يُنشر المشروع بعد، تتوقف Sealos Canvas وتوجّه المستخدم إلى نشر المشروع أولًا.

## آلية الإعداد

تحتاج فقط إلى وكيل ذكاء اصطناعي متوافق مع الإضافات أو `skills.sh` ومشروع تريد نشره.

أثناء مسارات النشر وقواعد البيانات وتخزين الكائنات، تنفذ Sealos Skills ما يلي:

- تتحقق من توفر أدوات مثل Docker و`kubectl`
- ترشد المستخدم خلال تسجيل الدخول إلى Sealos عند الحاجة
- تستخدم `sealos-cli` لإنشاء قواعد بيانات Sealos Cloud والحصول على تفاصيل الاتصال وتنفيذ عمليات قواعد البيانات
- تستخدم `sealos-cli s3` لإدارة حاويات تخزين الكائنات في Sealos وبيانات الاعتماد وفحوصات الحصة وعمليات الكائنات وعناوين URL الموقعة مسبقًا
- تستخدم مسار سجل حاويات مثل Docker Hub أو GHCR أو تساعد في تجهيزه

يتطلب النشر الفعلي حساب Sealos Cloud وإمكانية الوصول إلى سجل حاويات، ويمكن للمهارة إرشادك خلال هذا الإعداد بعد بدئها. تتطلب أعمال قواعد البيانات وتخزين الكائنات حساب Sealos Cloud ومساحة عمل يمكنها إنشاء الموارد المطلوبة.

## المهارات المضمنة

توفر الإضافة وحزمة `skills.sh` مصدر المهارات نفسه:

- `sealos-deploy` — ينشر مشروعًا محليًا أو مشروع GitHub على Sealos Cloud
- `sealos-database` — ينشئ قواعد بيانات Sealos Cloud للتطوير ويربطها ويشغّلها
- `sealos-s3` — ينشئ الحاويات ويربط بيانات الاعتماد ويتحقق من الحصة ويشغّل تخزين الكائنات المتوافق مع Sealos S3
- `sealos-canvas` — يعرض موارد Sealos المنشورة في واجهة لوحة محلية للقراءة فقط
- `sealos-app-builder` — يبني تطبيقات Sealos Desktop مع تكامل SDK
- `cloud-native-readiness` — يقيّم جاهزية النشر
- `dockerfile-skill` — ينشئ ملفات Dockerfile جاهزة للإنتاج
- `docker-to-sealos` — يحول خدمات Docker Compose إلى قوالب Sealos

## لماذا تستخدم الإضافة

يوصى بتثبيت الإضافة في Codex وClaude Code وأدوات الوكلاء المدعومة الأخرى لأنها:

- تثبّت جميع مهارات Sealos في حزمة مُدارة واحدة
- تتيح المهارات نفسها عبر أدوات الوكلاء المدعومة
- تجمع بيانات الإضافة وشعارها ومطالباتها وأوامرها وقدراتها
- تتجنب صيانة نسخة منفصلة ومجمعة من المهارات

## صيانة هذا المستودع

الأقسام التالية مخصصة لمسؤولي صيانة المستودع وناشري الإضافات. لا يحتاج المستخدمون إليها.

### توزيع الإضافة

يتبع تكامل Codex [دليل OpenAI لبناء إضافات Codex](https://developers.openai.com/codex/plugins/build):

- يحتوي `.codex-plugin/plugin.json` على هوية الإضافة وبيانات الاكتشاف ونصوص الواجهة والمطالبات الافتراضية وبيانات العلامة التجارية ومسارات الموارد النسبية إلى جذر المستودع.
- يسجل `.agents/plugins/marketplace.json` الإضافة المحلية لهذا المستودع لاختبارات Codex marketplace المحلية.
- يحدد `.claude-plugin/plugin.json` و`.claude-plugin/marketplace.json` واجهة الإضافة المتوافقة مع Claude Code.
- يحدد `.qoder-plugin/plugin.json` واجهة إضافة Qoder ويعرض صراحة مهارات Codex الثماني جميعها.
- يوفر `qoder.md` توجيهات التوجيه والسلامة على مستوى Qoder دون نسخ تطبيقات المهارات.
- يسجل `distribution/platforms.json` ادعاءات دعم المنصات وأدلتها.
- يدير `marketplaces/README.md` قواعد marketplace ويمنع المبالغة في ادعاءات دعم الأوامر.
- يتحقق `scripts/validate-codex-plugin.py` من بيان Codex وبيانات Claude Code وmarketplace الخاصة بالمستودع وسجل المنصات ومسارات الموارد.
- يبني `scripts/package-qoder-plugin.py` حزمة ZIP متوافقة مع Qoder مع بيان الإضافة في جذر الأرشيف.
- يظل `skills/**/SKILL.md` مصدر المهارات الوحيد؛ لا تضف نسخة مجمعة ثانية.

تحقق من بيانات الإضافة قبل نشر تغييرات البيان أو دفعها:

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

### بنية المستودع

يمثل [`skills/`](../skills) مصدر الحقيقة الوحيد لنشر Sealos ولوحة Sealos والمهارات الداعمة المستخدمة أثناء مسار النشر. يخدم دليل المهارات نفسه في المستوى الجذري عمليات تثبيت `skills.sh` وجميع بيانات الإضافات أو الامتدادات في هذا المستودع.

ملفات التوزيع المهمة:

- [`.codex-plugin/plugin.json`](../.codex-plugin/plugin.json) — بيان إضافة Codex
- [`.agents/plugins/marketplace.json`](../.agents/plugins/marketplace.json) — إدخال Codex marketplace المحلي
- [`.claude-plugin/plugin.json`](../.claude-plugin/plugin.json) — بيان الإضافة المتوافقة مع Claude Code
- [`.qoder-plugin/plugin.json`](../.qoder-plugin/plugin.json) — بيان إضافة Qoder
- [`qoder.md`](../qoder.md) — توجيهات التوجيه والسلامة لإضافة Qoder
- [`marketplace.json`](../marketplace.json) و[`.claude-plugin/marketplace.json`](../.claude-plugin/marketplace.json) — إدخالات marketplace المتوافقة مع Claude
- [`.codebuddy-plugin/marketplace.json`](../.codebuddy-plugin/marketplace.json) — إدخال CodeBuddy marketplace
- [`gemini-extension.json`](../gemini-extension.json) — امتداد سياق Gemini CLI
- [`qwen-extension.json`](../qwen-extension.json) — امتداد سياق Qwen Code
- [`openclaw.plugin.json`](../openclaw.plugin.json) — مؤشر حزمة OpenClaw / ClawHub
- [`commands/sealos.md`](../commands/sealos.md) — نقطة دخول أمر الإضافة `/sealos` للمضيفات المتوافقة
- [`distribution/platforms.json`](../distribution/platforms.json) — سجل دعم المنصات
- [`marketplaces/README.md`](../marketplaces/README.md) — قواعد marketplace وملكية ادعاءات الدعم
- [`scripts/validate-codex-plugin.py`](../scripts/validate-codex-plugin.py) — برنامج التحقق من إضافة Codex
- [`scripts/package-qoder-plugin.py`](../scripts/package-qoder-plugin.py) — برنامج تجميع حزمة Qoder ZIP

لا تضف نسخة مجمعة ثانية من المهارات. يمثل المسار الجذري `skills/**` مصدر المهارات الوحيد لجميع مسارات التثبيت.

## الترخيص

MIT
