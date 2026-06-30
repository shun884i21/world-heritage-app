// Wikipediaリンクが無いIDを、タイトル直指定で取得してキャッシュする使い捨てスクリプト。
// 使い方: node fetch_wiki_title.mjs <id> <ja|en> <タイトル>
import fs from "node:fs";
import path from "node:path";

const dataDir = path.resolve(import.meta.dirname, "..", "data");
const cacheDir = path.join(dataDir, "wiki_cache");
fs.mkdirSync(cacheDir, { recursive: true });
const sites = JSON.parse(fs.readFileSync(path.join(dataDir, "sites.json"), "utf8"));

const [id, lang, ...titleParts] = process.argv.slice(2);
const title = titleParts.join(" ");
const UA = "WorldHeritageApp/1.0 (shunsukehayashi20@gmail.com)";
const host = `${lang}.wikipedia.org`;

const api = `https://${host}/w/api.php?action=query&format=json&formatversion=2&prop=extracts&explaintext=1&redirects=1&titles=${encodeURIComponent(title)}`;
const r = await fetch(api, { headers: { "User-Agent": UA } });
const j = await r.json();
const page = j.query?.pages?.[0];
const text = (page?.extract || "").slice(0, 3000);
const s = sites.find((x) => x.id === Number(id));
const out = {
  id: Number(id), name: s ? s.name : title, source_lang: lang,
  source_url: `https://${host}/wiki/${encodeURIComponent(title)}`,
  retrieved: new Date().toISOString().slice(0, 10),
  text,
};
fs.writeFileSync(path.join(cacheDir, `${id}.json`), JSON.stringify(out, null, 2));
console.log(`✓ id=${id} title=${title} ${text.length}字`);
