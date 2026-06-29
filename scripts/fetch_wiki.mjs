// 指定した遺産IDの日本語Wikipedia本文（プレーンテキスト）を取得してキャッシュする。
// 使い方: node fetch_wiki.mjs 661 662 775 ...   （IDを並べる。未指定なら何もしない）
import fs from "node:fs";
import path from "node:path";

const dataDir = path.resolve(import.meta.dirname, "..", "data");
const cacheDir = path.join(dataDir, "wiki_cache");
fs.mkdirSync(cacheDir, { recursive: true });

const sites = JSON.parse(fs.readFileSync(path.join(dataDir, "sites.json"), "utf8"));
const ids = process.argv.slice(2).map(Number);
if (!ids.length) { console.log("IDを指定してください"); process.exit(0); }

const UA = "WorldHeritageApp/1.0 (shunsukehayashi20@gmail.com)";

// ja_wiki / en_wiki URL から (host, title) を取り出す
function parseWiki(url) {
  const m = url.match(/^https:\/\/([a-z]+)\.wikipedia\.org\/wiki\/(.+)$/);
  if (!m) return null;
  return { host: `${m[1]}.wikipedia.org`, lang: m[1], title: decodeURIComponent(m[2]) };
}

async function fetchExtract(host, title) {
  const api = `https://${host}/w/api.php?action=query&format=json&formatversion=2&prop=extracts&explaintext=1&redirects=1&titles=${encodeURIComponent(title)}`;
  const r = await fetch(api, { headers: { "User-Agent": UA } });
  const j = await r.json();
  const page = j.query?.pages?.[0];
  return page?.extract || "";
}

for (const id of ids) {
  const s = sites.find((x) => x.id === id);
  if (!s) { console.log(`x id=${id} なし`); continue; }
  const w = s.ja_wiki ? parseWiki(s.ja_wiki) : (s.en_wiki ? parseWiki(s.en_wiki) : null);
  if (!w) { console.log(`x id=${id} ${s.name} Wikipediaリンクなし`); continue; }
  try {
    let text = await fetchExtract(w.host, w.title);
    text = text.slice(0, 3000); // 冒頭3000字に制限（要約の根拠として十分・効率重視）
    const out = {
      id, name: s.name, source_lang: w.lang,
      source_url: w.lang === "ja" ? s.ja_wiki : s.en_wiki,
      retrieved: new Date().toISOString().slice(0, 10),
      text,
    };
    fs.writeFileSync(path.join(cacheDir, `${id}.json`), JSON.stringify(out, null, 2));
    console.log(`✓ id=${id} ${s.name} (${w.lang}) ${text.length}字`);
  } catch (e) {
    console.log(`x id=${id} ${s.name} ERR ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 300)); // 礼儀的な間隔
}
