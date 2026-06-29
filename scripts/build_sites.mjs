// Wikidataの生データを名寄せ・整形して sites.json を生成する
import fs from "node:fs";
import path from "node:path";

const dataDir = path.resolve(import.meta.dirname, "..", "data");
const raw = JSON.parse(fs.readFileSync(path.join(dataDir, "wikidata_raw.json"), "utf8"));
const rows = raw.results.bindings;

// 現役の危機遺産リスト（UNESCO参照番号）。実在IDとの突合でノイズは自動除外される
const dangerRefs = new Set(JSON.parse(fs.readFileSync(path.join(dataDir, "danger_refs.json"), "utf8")));

const v = (b, k) => (b[k] && b[k].value) || "";

// ローマ数字(i..x) → 数値
const roman = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };
function deriveType(critStr) {
  const nums = [...critStr.matchAll(/\(([ivx]+)\)/g)].map((m) => roman[m[1]] || 0);
  const cultural = nums.some((n) => n >= 1 && n <= 6);
  const natural = nums.some((n) => n >= 7 && n <= 10);
  if (cultural && natural) return "mixed";
  if (natural) return "natural";
  if (cultural) return "cultural";
  return "unknown";
}

// 歴史上の国家（P17に混入する。現代国フィルタから除外）
const HISTORICAL = new Set([
  "ローマ帝国","東ローマ帝国","オスマン帝国","ロシア帝国","ソビエト連邦","共和政ローマ",
  "アケメネス朝","セレウコス朝","プトレマイオス王国","ペルガモン王国","大セルジューク朝",
  "清","中華民国","フランス第三共和政","ポルトガル海上帝国","マフラ首長国","南イエメン","チベット",
]);
function cleanCountries(list) {
  const modern = list.filter((c) => !HISTORICAL.has(c));
  return modern.length ? modern : list; // 全部歴史国なら元のまま残す
}

// "Point(lon lat)" → {lat, lon}
function parseCoord(s) {
  const m = s.match(/Point\(([-\d.]+)\s+([-\d.]+)\)/);
  return m ? { lon: parseFloat(m[1]), lat: parseFloat(m[2]) } : null;
}

// 日本語名がWikidataに無い著名サイトの表示名上書き（id → 日本語名）
const NAME_OVERRIDE = {
  438: "万里の長城",
  1: "ガラパゴス諸島",
  86: "メンフィスとその墓地遺跡（ギザのピラミッド地帯）",
  83: "ヴェルサイユ宮殿と庭園",
};

// id ごとに最良の1アイテムを選ぶ
const byId = new Map();
for (const b of rows) {
  const id = v(b, "id");
  if (!id) continue;
  const item = {
    qid: v(b, "item").split("/").pop(),
    name_ja: v(b, "name_ja"),
    name_en: v(b, "name_en"),
    year: v(b, "year"),
    image: v(b, "image"),
    coord: v(b, "coord"),
    ja_wiki: v(b, "ja_wiki"),
    en_wiki: v(b, "en_wiki"),
    criteria: v(b, "criteria"),
    countries: v(b, "countries"),
    danger: v(b, "danger") === "1",
  };
  const score =
    (item.criteria ? 8 : 0) +
    (item.year ? 4 : 0) +
    (item.name_ja ? 2 : 0) +
    (item.image ? 1 : 0) +
    (item.ja_wiki ? 1 : 0);
  const cur = byId.get(id);
  if (!cur || score > cur._score) byId.set(id, { ...item, _score: score });
}

const sites = [];
for (const [id, it] of byId) {
  const coord = parseCoord(it.coord);
  sites.push({
    id: parseInt(id, 10),
    name: NAME_OVERRIDE[id] || it.name_ja || it.name_en || `世界遺産 No.${id}`,
    name_en: it.name_en,
    type: deriveType(it.criteria),
    criteria: it.criteria,
    year: it.year ? parseInt(it.year, 10) : null,
    countries: cleanCountries(it.countries ? it.countries.split("|") : []),
    danger: dangerRefs.has(parseInt(id, 10)),
    lat: coord ? coord.lat : null,
    lon: coord ? coord.lon : null,
    image: it.image || null,
    ja_wiki: it.ja_wiki || null,
    en_wiki: it.en_wiki || null,
    qid: it.qid,
  });
}
sites.sort((a, b) => a.id - b.id);

fs.writeFileSync(path.join(dataDir, "sites.json"), JSON.stringify(sites));

// 統計サマリ
const stat = (f) => sites.filter(f).length;
const byType = { cultural: stat((s) => s.type === "cultural"), natural: stat((s) => s.type === "natural"), mixed: stat((s) => s.type === "mixed"), unknown: stat((s) => s.type === "unknown") };
const countryCount = {};
for (const s of sites) for (const c of s.countries) countryCount[c] = (countryCount[c] || 0) + 1;
const topCountries = Object.entries(countryCount).sort((a, b) => b[1] - a[1]).slice(0, 10);

console.log("総物件数:", sites.length);
console.log("分類:", byType);
console.log("危機遺産:", stat((s) => s.danger));
console.log("写真あり:", stat((s) => s.image));
console.log("日本語名あり:", stat((s) => s.name && /[぀-ヿ一-鿿]/.test(s.name)));
console.log("日本語Wikipediaあり:", stat((s) => s.ja_wiki));
console.log("座標あり:", stat((s) => s.lat !== null));
console.log("登録年あり:", stat((s) => s.year !== null));
console.log("国別TOP10:", topCountries.map(([c, n]) => `${c}:${n}`).join(", "));
console.log("type=unknownの例:", sites.filter((s) => s.type === "unknown").slice(0, 5).map((s) => `${s.id}/${s.name}`).join(", "));
