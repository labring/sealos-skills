# Sealos Skills

<!-- README-I18N:START -->

[English](../README.md) | [简体中文](./README.zh-CN.md) | [繁體中文](./README.zh-TW.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [Español](./README.es.md) | [Français](./README.fr.md) | [Deutsch](./README.de.md) | [Português (Brasil)](./README.pt-BR.md) | [Русский](./README.ru.md) | [العربية](./README.ar.md) | **हिन्दी** | [Bahasa Indonesia](./README.id.md)

<!-- README-I18N:END -->

अपने AI एजेंट से [Sealos Cloud](https://sealos.io) डिप्लॉयमेंट YAML तैयार करें।

Sealos Skills एक प्लगइन-प्रथम स्किल पैक है जो Sealos Cloud डेवलपमेंट पर केंद्रित है। यह AI एजेंट को प्रोजेक्ट का निरीक्षण करने, डिप्लॉयमेंट आर्टिफ़ैक्ट और YAML तैयार करने, डेवलपमेंट के लिए Sealos Cloud डेटाबेस और ऑब्जेक्ट स्टोरेज जोड़ने, कंटेनर इमेज बनाने या दोबारा उपयोग करने और डिप्लॉय किए गए संसाधनों को स्थानीय केवल-पढ़ने योग्य कैनवास में देखने में मदद करता है। `sealos-deploy` केवल YAML तैयार करता है। यह Phase 4 के बाद रुकता है और वर्कलोड को डिप्लॉय या अपडेट नहीं करता।

Codex के लिए अनुशंसित तरीका मूल Codex प्लगइन इंस्टॉल करना है। अलग-अलग होस्ट पर प्लगइन इंस्टॉलेशन, `skills.sh`, और Gemini CLI तथा Qwen Code जैसे केवल-कॉन्टेक्स्ट एक्सटेंशन होस्ट एक ही रूट `skills/**` स्रोत का उपयोग करते हैं।

## तुरंत शुरू करें

### अनुशंसित: Codex में इंस्टॉल करें

इस रिपॉज़िटरी को Codex marketplace के रूप में जोड़ें, फिर Sealos प्लगइन इंस्टॉल करें:

```bash
codex plugin marketplace add labring/sealos-skills
codex plugin add sealos@sealos
```

एक Sealos प्लगइन रूट `skills/**` से डिप्लॉयमेंट, डेटाबेस, S3, कैनवास, ऐप-बिल्डर और सहायक cloud-native स्किल इंस्टॉल करता है: `sealos-deploy`, `sealos-database`, `sealos-s3`, `sealos-canvas`, `sealos-app-builder`, `cloud-native-readiness`, `dockerfile-skill`, और `docker-to-sealos`।

अनुकूलता और स्थानीय Codex परीक्षण के लिए यही प्लगइन इस कमांड से इंस्टॉल करें:

```bash
npx plugins add https://github.com/labring/sealos-skills --target codex
```

Codex में इंस्टॉल करने के बाद प्लगइन का उपयोग इस प्रकार करें:

- **Codex CLI:** `$sealos` टाइप करें
- **Codex App:** चैट इनपुट के नीचे-बाएँ कोने में **+** बटन क्लिक करें, **Plugins** चुनें, फिर **Sealos** चुनें

![Codex App में Sealos प्लगइन चुनें](../assets/codex-sealos.png)

Codex उदाहरण:

```text
$sealos prepare a Sealos deployment YAML for this repo
$sealos prepare a Sealos deployment YAML for /path/to/project
$sealos prepare a Sealos deployment YAML for https://github.com/labring-sigs/kite
$sealos create a cloud Postgres database for this repo and wire DATABASE_URL
$sealos create private S3 object storage for uploads and wire env vars
```

### Claude Code में इंस्टॉल करें

इस रिपॉज़िटरी को Claude Code marketplace के रूप में जोड़ें, फिर Sealos प्लगइन इंस्टॉल करें:

```bash
claude plugin marketplace add labring/sealos-skills
claude plugin install sealos@sealos
```

अलग-अलग होस्ट के प्लगइन इंस्टॉलर के साथ अनुकूलता के लिए यही प्लगइन इस कमांड से इंस्टॉल करें:

```bash
npx plugins add https://github.com/labring/sealos-skills --target claude-code
```

अगर मशीन पर केवल एक एजेंट टूल मिलता है, तो `plugins` को लक्ष्य चुनने दें:

```bash
npx plugins add https://github.com/labring/sealos-skills
```

Claude Code में इंस्टॉल करने के बाद `/sealos` का उपयोग करें:

```text
/sealos prepare a Sealos deployment YAML for this repo
/sealos prepare a Sealos deployment YAML for /path/to/project
/sealos prepare a Sealos deployment YAML for https://github.com/labring-sigs/kite
/sealos create a cloud Postgres database for this repo and wire DATABASE_URL
/sealos create private S3 object storage for uploads and wire env vars
```

### अन्य समर्थित AI टूल

| टूल | इंस्टॉलेशन | उपयोग |
| --- | --- | --- |
| Codex CLI / Codex App | `codex plugin marketplace add labring/sealos-skills`, फिर `codex plugin add sealos@sealos` | Codex CLI में `$sealos`, या Codex App में **+** → **Plugins** → **Sealos** |
| Claude Code | `claude plugin marketplace add labring/sealos-skills`, फिर `claude plugin install sealos@sealos` | `/sealos` |
| Claude Code अनुकूलता पथ | `npx plugins add https://github.com/labring/sealos-skills --target claude-code` | `/sealos` |
| OpenClaw / ClawHub | `clawhub install labring/sealos-skills` | होस्ट कमांड की उपलब्धता ClawHub रनटाइम पर निर्भर करती है |
| CodeBuddy | `/plugin marketplace add labring/sealos-skills` | होस्ट कमांड की उपलब्धता CodeBuddy रनटाइम पर निर्भर करती है |
| Gemini CLI | `gemini extensions install https://github.com/labring/sealos-skills` | केवल-कॉन्टेक्स्ट एक्सटेंशन; Gemini से Sealos Skills उपयोग करने को कहें |
| Qwen Code | `qwen extensions install https://github.com/labring/sealos-skills` | केवल-कॉन्टेक्स्ट एक्सटेंशन; Qwen से Sealos Skills उपयोग करने को कहें |
| Amp / Kimi / सामान्य रिपॉज़िटरी इंपोर्टर | `https://github.com/labring/sealos-skills.git` इंपोर्ट करें | होस्ट पर निर्भर |

Gemini CLI और Qwen Code मैनिफ़ेस्ट `CLAUDE.md` के माध्यम से रिपॉज़िटरी कॉन्टेक्स्ट देते हैं; वे slash command समर्थन का दावा नहीं करते।

### विकल्प: `skills.sh` स्किल पैक के रूप में इंस्टॉल करें

अगर आपका एजेंट सीधे `skills.sh` उपयोग करता है, तो यही स्किल पैक इस कमांड से इंस्टॉल करें:

```bash
npx skills add labring/sealos-skills
```

फिर डिप्लॉयमेंट स्किल सीधे चलाएँ:

```text
/sealos-deploy
/sealos-deploy /path/to/project
/sealos-deploy https://github.com/labring-sigs/kite
/sealos-database create a cloud Postgres database for this repo and wire DATABASE_URL
/sealos-s3 create private object storage for uploads and wire env vars
```

प्रोजेक्ट डिप्लॉय होने के बाद इंस्टॉल किए गए प्लगइन एंट्री पॉइंट के माध्यम से `sealos-canvas` स्किल उपयोग करें।

`/sealos-deploy`, `/sealos-database`, और `/sealos-s3`, `skills.sh` की सीधी स्किल एंट्री हैं। प्लगइन का उपयोग Codex में `$sealos` या Claude Code में `/sealos` के माध्यम से करें।

## प्लगइन का उपयोग क्यों करें

Codex और Claude Code के लिए प्लगइन इंस्टॉलेशन अनुशंसित है क्योंकि यह:

- सभी Sealos स्किल को एक प्रबंधित पैकेज के रूप में इंस्टॉल करता है
- समर्थित एजेंट टूल में समान स्किल उपलब्ध कराता है
- प्लगइन मेटाडेटा, लोगो, प्रॉम्प्ट, कमांड और क्षमताओं को एक साथ रखता है
- स्किल की अलग पैकेज कॉपी बनाए रखने की आवश्यकता समाप्त करता है

## प्लगइन वितरण

Codex इंटीग्रेशन [OpenAI की Codex प्लगइन निर्माण गाइड](https://developers.openai.com/codex/plugins/build) का पालन करता है:

- `.codex-plugin/plugin.json` में प्लगइन पहचान, डिस्कवरी मेटाडेटा, इंटरफ़ेस टेक्स्ट, डिफ़ॉल्ट प्रॉम्प्ट, ब्रांड मेटाडेटा और रिपॉज़िटरी रूट के सापेक्ष एसेट पथ होते हैं।
- `.agents/plugins/marketplace.json` स्थानीय Codex marketplace परीक्षण के लिए इस रिपॉज़िटरी के स्थानीय प्लगइन को पंजीकृत करता है।
- `.claude-plugin/plugin.json` और `.claude-plugin/marketplace.json` Claude Code-संगत प्लगइन सतह परिभाषित करते हैं।
- `distribution/platforms.json` प्लेटफ़ॉर्म समर्थन दावे और प्रमाण दर्ज करता है।
- `marketplaces/README.md` marketplace नियमों का स्वामी है और कमांड समर्थन के बढ़े हुए दावों को रोकता है।
- `scripts/validate-codex-plugin.py` Codex मैनिफ़ेस्ट, Claude Code मेटाडेटा, रिपॉज़िटरी marketplace, प्लेटफ़ॉर्म रजिस्ट्री और एसेट पथ का सत्यापन करता है।
- `skills/**/SKILL.md` एकमात्र स्किल स्रोत बना रहता है; दूसरी पैकेज कॉपी न जोड़ें।

मैनिफ़ेस्ट बदलाव प्रकाशित या पुश करने से पहले प्लगइन मेटाडेटा सत्यापित करें:

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

## सेटअप कैसे काम करता है

आपको केवल प्लगइन या skills.sh के साथ संगत AI एजेंट और YAML तैयार करने के लिए एक प्रोजेक्ट चाहिए।

YAML तैयारी, डेटाबेस और ऑब्जेक्ट स्टोरेज कार्यों में Sealos Skills यह करता है:

- Docker और kubectl जैसे टूल को सत्यापित करता है
- आवश्यकता होने पर उपयोगकर्ता को Sealos लॉगिन में मार्गदर्शन देता है
- Sealos Cloud डेटाबेस के लिए sealos-cli उपयोग करता है
- Sealos ऑब्जेक्ट स्टोरेज के लिए sealos-cli s3 उपयोग करता है
- आवश्यक linux/amd64 इमेज को GHCR में भेजता है और उनके digest को YAML में उपयोग करता है

स्थानीय YAML तैयारी के लिए Sealos Cloud खाता चाहिए। नई इमेज बनाने और भेजने पर ही GitHub CLI प्रमाणीकरण चाहिए। बाद का स्वीकृत डिप्लॉयमेंट वर्कफ़्लो YAML लागू करता है।

## Sealos Deploy क्या संभालता है

YAML तैयारी अनुरोध के लिए एजेंट यह करता है:

- केवल Phase 0 से Phase 4 चलाता है
- स्रोत को तैयार करता है और चरण अनुबंध लिखता है
- वर्तमान kb-0.9 निर्देशिका में सटीक आधिकारिक मिलान खोजता है
- Phase 4 में YAML बनाता या materialize करता है और deployment gate चलाता है
- .sealos/template/index.yaml लिखकर रुकता है

Sealos Deploy डिप्लॉयमेंट इनपुट नहीं लेता। यह क्लस्टर dry-run नहीं चलाता। यह संसाधन डिप्लॉय नहीं करता, workloads अपडेट नहीं करता और runtime जाँच नहीं करता।

## Sealos Database क्या संभालता है

क्लाउड डेटाबेस की आवश्यकता वाले स्थानीय प्रोजेक्ट या Devbox के लिए एजेंट:

- `DATABASE_URL`, Prisma, Drizzle, MongoDB, MySQL या Redis जैसे डेटाबेस संकेत पहचानता है
- Sealos Cloud डेटाबेस सूचीबद्ध करने, बनाने, निरीक्षण करने और जोड़ने के लिए `sealos-cli database` का उपयोग करता है
- चैट में रहस्य उजागर किए बिना केवल आवश्यक स्थानीय env key लिखता है
- माइग्रेशन, इंट्रोस्पेक्शन या स्टार्टअप जाँच के माध्यम से ऐप के वास्तविक डेटाबेस पथ की पुष्टि करता है
- पुष्टि मिलने के बाद सार्वजनिक एक्सेस प्रबंधित करता है

## Sealos S3 क्या संभालता है

S3-संगत ऑब्जेक्ट स्टोरेज की आवश्यकता वाले स्थानीय प्रोजेक्ट या Devbox के लिए एजेंट:

- S3 env key, AWS SDK उपयोग, MinIO, अपलोड पथ या पहले से साइन किए गए URL कोड जैसे ऑब्जेक्ट स्टोरेज संकेत पहचानता है
- ऑब्जेक्ट स्टोरेज बकेट सूचीबद्ध करने, बनाने, निरीक्षण करने और अपडेट करने के लिए `zjy365/sealos-cli#28` से `sealos-cli s3` का उपयोग करता है
- केवल आवश्यकता होने पर S3 क्रेडेंशियल शुरू करता है और access key को चैट से बाहर रखता है
- बकेट, endpoint, access key, secret key, region और path-style सेटिंग के लिए न्यूनतम आवश्यक स्थानीय env key जोड़ता है
- प्रोजेक्ट के वास्तविक स्टोरेज पथ के साथ अपलोड, सूची, डाउनलोड, डिलीट या पहले से साइन किए गए URL के व्यवहार की पुष्टि करता है
- पुष्टि मिलने के बाद बकेट सार्वजनिक करता है या क्रेडेंशियल बदलता है

## Sealos Canvas क्या संभालता है

Sealos पर पहले से डिप्लॉय किए गए रिपॉज़िटरी के लिए एजेंट यह करता है:

1. डिप्लॉय किए गए ऐप को खोजने के लिए .sealos/state.json पढ़ता है।
2. केवल-पठन kubectl get कमांड से Sealos namespace पढ़ता है।
3. 127.0.0.1 पर अस्थायी canvas UI चलाता है।
4. निरीक्षण के लिए स्थानीय UI पता दिखाता और खोलता है।

डिप्लॉयमेंट स्थिति न होने पर Sealos Canvas रुकता है। YAML लागू करने के लिए स्वीकृत डिप्लॉयमेंट वर्कफ़्लो उपयोग करें। sealos-deploy केवल YAML तैयार करता है।

## शामिल स्किल

प्लगइन और `skills.sh` पैक एक ही स्किल स्रोत उपलब्ध कराते हैं:

- `sealos-deploy` — स्थानीय या GitHub प्रोजेक्ट से Sealos डिप्लॉयमेंट YAML तैयार करता है
- `sealos-database` — डेवलपमेंट के लिए Sealos Cloud डेटाबेस बनाता, जोड़ता और संचालित करता है
- `sealos-s3` — बकेट बनाता, क्रेडेंशियल जोड़ता, कोटा जाँचता और Sealos S3-संगत ऑब्जेक्ट स्टोरेज संचालित करता है
- `sealos-canvas` — स्थानीय केवल-पढ़ने योग्य कैनवास UI में डिप्लॉय किए गए Sealos संसाधन दिखाता है
- `sealos-app-builder` — SDK इंटीग्रेशन के साथ Sealos Desktop ऐप बनाता है
- `cloud-native-readiness` — डिप्लॉयमेंट की तैयारी का आकलन करता है
- `dockerfile-skill` — उत्पादन के लिए तैयार Dockerfile बनाता है
- `docker-to-sealos` — Docker Compose सेवाओं को Sealos टेम्पलेट में बदलता है

## रिपॉज़िटरी

[`skills/`](../skills) Sealos डिप्लॉयमेंट, Sealos कैनवास और डिप्लॉयमेंट प्रवाह में उपयोग होने वाली सहायक स्किल के लिए एकमात्र सत्य स्रोत है। वही रूट-स्तरीय स्किल डायरेक्टरी `skills.sh` इंस्टॉलेशन और इस रिपॉज़िटरी के हर प्लगइन या एक्सटेंशन मैनिफ़ेस्ट को सेवा देती है।

महत्वपूर्ण वितरण फ़ाइलें:

- [`.codex-plugin/plugin.json`](../.codex-plugin/plugin.json) — Codex प्लगइन मैनिफ़ेस्ट
- [`.agents/plugins/marketplace.json`](../.agents/plugins/marketplace.json) — स्थानीय Codex marketplace एंट्री
- [`.claude-plugin/plugin.json`](../.claude-plugin/plugin.json) — Claude Code-संगत प्लगइन मैनिफ़ेस्ट
- [`marketplace.json`](../marketplace.json) और [`.claude-plugin/marketplace.json`](../.claude-plugin/marketplace.json) — Claude-संगत marketplace एंट्री
- [`.codebuddy-plugin/marketplace.json`](../.codebuddy-plugin/marketplace.json) — CodeBuddy marketplace एंट्री
- [`gemini-extension.json`](../gemini-extension.json) — Gemini CLI कॉन्टेक्स्ट एक्सटेंशन
- [`qwen-extension.json`](../qwen-extension.json) — Qwen Code कॉन्टेक्स्ट एक्सटेंशन
- [`openclaw.plugin.json`](../openclaw.plugin.json) — OpenClaw / ClawHub बंडल पॉइंटर
- [`commands/sealos.md`](../commands/sealos.md) — संगत होस्ट के लिए `/sealos` प्लगइन कमांड एंट्री
- [`distribution/platforms.json`](../distribution/platforms.json) — प्लेटफ़ॉर्म समर्थन रजिस्ट्री
- [`marketplaces/README.md`](../marketplaces/README.md) — marketplace नियम और समर्थन-दावा स्वामित्व
- [`scripts/validate-codex-plugin.py`](../scripts/validate-codex-plugin.py) — Codex प्लगइन सत्यापन स्क्रिप्ट

दूसरी पैकेज स्किल कॉपी न जोड़ें। रूट `skills/**` सभी इंस्टॉलेशन पथों के लिए एकमात्र स्किल स्रोत है।

## लाइसेंस

MIT
