// バッチJSONを data/descriptions.json に統合する。
// 使い方: node merge_descriptions.mjs batchA.json batchB.json ...
import fs from "node:fs";
import path from "node:path";

const dataDir = path.resolve(import.meta.dirname, "..", "data");
const target = path.join(dataDir, "descriptions.json");
const current = fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, "utf8")) : {};

let added = 0;
for (const f of process.argv.slice(2)) {
  const batch = JSON.parse(fs.readFileSync(f, "utf8"));
  for (const [id, v] of Object.entries(batch)) {
    if (!current[id]) added++;
    current[id] = v;
  }
}
// IDキーを数値順に並べて保存
const sorted = {};
Object.keys(current).map(Number).sort((a, b) => a - b).forEach((k) => (sorted[k] = current[k]));
fs.writeFileSync(target, JSON.stringify(sorted, null, 2));
console.log(`merged. total=${Object.keys(sorted).length} (+${added})`);
