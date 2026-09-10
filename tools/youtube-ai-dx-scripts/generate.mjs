import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";

const DIR = path.dirname(new URL(import.meta.url).pathname);
const TOPICS_PATH = path.join(DIR, "topics.json");
const OUTPUT_DIR = path.join(DIR, "output");
const MODEL = process.env.GITHUB_MODEL || "openai/gpt-4o-mini";
const GITHUB_MODELS_ENDPOINT = "https://models.github.ai/inference";

const SYSTEM_PROMPT = `あなたは「やまちゃん｜YSTUDIO」のYouTube台本づくりを手伝う思考パートナーです。
以下の原則を必ず守ってください。

# 最重要原則：盛らずに、掘る
- 具体的な数字、事例、クライアント名、実績、日時、資格、肩書きなどを勝手に作り出さない。
- 与えられたテーマ・角度（angle）以上の「事実らしきもの」を創作しない。
- 台本の中で実例・データ・数字が必要な箇所には、本文をでっち上げる代わりに
  必ず "[FACT:要確認]" というプレースホルダーを入れ、山ちゃん本人が後で埋められるようにする。
- これは台本の「下書き（PLAN/IDEA段階）」であり、完成品ではないことを前提にする。

# 出力構成（Markdown）
1. タイトル案（3つ、フック重視）
2. 冒頭フック（最初の15秒で何を言うか）
3. 本編構成（章立て、3〜5章）
4. 台本本文（章ごとに書く。話し言葉。事実が必要な箇所は [FACT:要確認] を挿入）
5. まとめ・CTA（説明欄やコメント誘導に使える一言）
6. FACT要確認リスト（この動画を撮る前に本人が確認・準備すべき事実・具体例を箇条書き）

トーンは、経営者・実務者向けにやさしく語りかける形。専門用語は最小限、結論から話す構成にしてください。`;

function slugify(text) {
  return text
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

async function main() {
  const apiKey = process.env.GITHUB_MODELS_TOKEN || process.env.GITHUB_TOKEN;
  if (!apiKey) {
    throw new Error(
      "GITHUB_MODELS_TOKEN（または GITHUB_TOKEN）が設定されていません。GitHub Actions では permissions.models: read を指定すれば GITHUB_TOKEN が自動で使えます。ローカル実行時は models:read 権限を持つ Personal Access Token を GITHUB_MODELS_TOKEN として渡してください。"
    );
  }

  const topicsFile = JSON.parse(await readFile(TOPICS_PATH, "utf-8"));
  const topic = topicsFile.topics.find((t) => t.status === "pending");

  if (!topic) {
    console.log("保留中（pending）のトピックがありません。topics.json に新しい企画を追加してください。");
    return;
  }

  const client = new OpenAI({ baseURL: GITHUB_MODELS_ENDPOINT, apiKey });
  const userPrompt = `テーマ: ${topic.topic}\n切り口（angle）: ${topic.angle || "（指定なし）"}\n\nこのテーマでYouTube動画の台本ドラフトを作成してください。`;

  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
  });

  const scriptBody = response.choices[0].message.content;

  const today = new Date().toISOString().slice(0, 10);
  const slug = slugify(topic.topic);
  const filename = `${today}-${topic.id}-${slug}.md`;
  const outputPath = path.join(OUTPUT_DIR, filename);

  const fileContent = `# ${topic.topic}

- 生成日: ${today}
- テーマID: ${topic.id}
- 切り口: ${topic.angle || "（指定なし）"}
- ステータス: DRAFT（未レビュー。撮影前に必ず本人がFACTを確認すること）

---

${scriptBody}
`;

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(outputPath, fileContent, "utf-8");

  topic.status = "done";
  topic.generatedAt = today;
  topic.outputFile = path.relative(DIR, outputPath);

  await writeFile(TOPICS_PATH, JSON.stringify(topicsFile, null, 2) + "\n", "utf-8");

  console.log(`台本ドラフトを生成しました: ${topic.outputFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
