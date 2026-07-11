// Wikipediaリンクが無いIDを、タイトル候補から一括取得してキャッシュする。
// 使い方: node fetch_wiki_titles.mjs <targets.json>
//   targets.json = { "84": ["ja", "ヴェズレーの教会と丘"], ... }
// タイトルが外れて本文が取れない場合は、同じ語で検索APIを引いて先頭記事にフォールバックする。
import fs from "node:fs";
import path from "node:path";

const dataDir = path.resolve(import.meta.dirname, "..", "data");
const cacheDir = path.join(dataDir, "wiki_cache");
fs.mkdirSync(cacheDir, { recursive: true });
const sites = JSON.parse(fs.readFileSync(path.join(dataDir, "sites.json"), "utf8"));

const targets = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const UA = "WorldHeritageApp/1.0 (shunsukehayashi20@gmail.com)";
const MIN_LEN = 200; // これ未満は「取れなかった」とみなす
const MAX_LEN = Number(process.env.MAXLEN || 3000); // 冒頭が前置きばかりの記事は MAXLEN=6000 等で伸ばす

async function extract(host, title) {
  const api = `https://${host}/w/api.php?action=query&format=json&formatversion=2&prop=extracts&explaintext=1&redirects=1&titles=${encodeURIComponent(title)}`;
  const j = await (await fetch(api, { headers: { "User-Agent": UA } })).json();
  return j.query?.pages?.[0]?.extract || "";
}

async function search(host, q) {
  const api = `https://${host}/w/api.php?action=query&format=json&formatversion=2&list=search&srlimit=1&srsearch=${encodeURIComponent(q)}`;
  const j = await (await fetch(api, { headers: { "User-Agent": UA } })).json();
  return j.query?.search?.[0]?.title || null;
}

for (const [id, [lang, title]] of Object.entries(targets)) {
  const host = `${lang}.wikipedia.org`;
  let used = title;
  let text = await extract(host, title);
  if (text.length < MIN_LEN) {
    const hit = await search(host, title);
    if (hit) { used = hit; text = await extract(host, hit); }
  }
  if (text.length < MIN_LEN) { console.log(`x id=${id} "${title}" 取得失敗 (${text.length}字)`); continue; }
  const s = sites.find((x) => x.id === Number(id));
  const out = {
    id: Number(id), name: s ? s.name : used, source_lang: lang,
    source_url: `https://${host}/wiki/${encodeURIComponent(used)}`,
    retrieved: new Date().toISOString().slice(0, 10),
    text: text.slice(0, MAX_LEN),
  };
  fs.writeFileSync(path.join(cacheDir, `${id}.json`), JSON.stringify(out, null, 2));
  console.log(`✓ id=${id} title=${used} ${out.text.length}字${used !== title ? " (検索で解決)" : ""}`);
  await new Promise((r) => setTimeout(r, 300));
}
