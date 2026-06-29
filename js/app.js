"use strict";

// ===== 状態 =====
let SITES = [];
let DESCRIPTIONS = {}; // id -> { background, people, highlights }  (AI生成、後から焼き込み)
let filtered = [];
let renderedCount = 0;
const PAGE = 30;

const state = {
  q: "",
  types: new Set(),
  danger: false,
  collected: false,
  wish: false,
  region: "",
  country: "",
  sort: "name",
};

// 地域マッピング（主要国 → 地域）。未登録国は「その他」
const REGION_MAP = {
  "アジア": ["日本","中華人民共和国","中国","大韓民国","韓国","朝鮮民主主義人民共和国","インド","タイ","ベトナム","カンボジア","ラオス","ミャンマー","マレーシア","インドネシア","フィリピン","スリランカ","ネパール","バングラデシュ","パキスタン","モンゴル","ブータン","シンガポール","ウズベキスタン","カザフスタン","トルクメニスタン","キルギス","タジキスタン","アフガニスタン"],
  "中東": ["イラン","イラク","トルコ","サウジアラビア","イスラエル","ヨルダン","レバノン","シリア","イエメン","オマーン","アラブ首長国連邦","バーレーン","カタール","クウェート","パレスチナ"],
  "ヨーロッパ": ["イタリア","フランス","ドイツ","スペイン","イギリス","ロシア","ポルトガル","ギリシャ","オーストリア","スイス","ベルギー","オランダ","ポーランド","チェコ","ハンガリー","スウェーデン","ノルウェー","フィンランド","デンマーク","アイスランド","アイルランド","クロアチア","セルビア","ブルガリア","ルーマニア","ウクライナ","スロバキア","スロベニア","リトアニア","ラトビア","エストニア","ベラルーシ","北マケドニア","アルバニア","ボスニア・ヘルツェゴビナ","モンテネグロ","ルクセンブルク","マルタ","キプロス","ジョージア","アルメニア","アゼルバイジャン","サンマリノ","アンドラ","バチカン"],
  "アフリカ": ["エジプト","モロッコ","チュニジア","アルジェリア","リビア","南アフリカ","エチオピア","ケニア","タンザニア","セネガル","マリ","ガーナ","ナイジェリア","ジンバブエ","ザンビア","ウガンダ","マダガスカル","ボツワナ","ナミビア","モーリタニア","スーダン","コンゴ民主共和国","カメルーン","ベナン","ブルキナファソ","コートジボワール","モザンビーク","マラウイ","セーシェル","モーリシャス","カーボベルデ","トーゴ","ガボン","中央アフリカ共和国","チャド","ニジェール","ガンビア","エリトリア","アンゴラ"],
  "北米・中米": ["アメリカ合衆国","カナダ","メキシコ","キューバ","グアテマラ","パナマ","コスタリカ","ベリーズ","ホンジュラス","エルサルバドル","ニカラグア","ドミニカ共和国","ハイチ","ジャマイカ","セントルシア","ドミニカ国","セントクリストファー・ネイビス","バルバドス"],
  "南米": ["ブラジル","ペルー","アルゼンチン","チリ","コロンビア","ボリビア","エクアドル","ベネズエラ","ウルグアイ","パラグアイ","スリナム"],
  "オセアニア": ["オーストラリア","ニュージーランド","パプアニューギニア","フィジー","ソロモン諸島","バヌアツ","ミクロネシア連邦","パラオ","キリバス","マーシャル諸島"],
};
function regionOf(country) {
  for (const [r, list] of Object.entries(REGION_MAP)) if (list.includes(country)) return r;
  return "その他";
}

// ===== localStorage（コレクション） =====
const LS_KEY = "wh_collection_v1";
let collection = loadCollection();
function loadCollection() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || { done: {}, wish: {} }; }
  catch { return { done: {}, wish: {} }; }
}
function saveCollection() { localStorage.setItem(LS_KEY, JSON.stringify(collection)); }
const isDone = (id) => !!collection.done[id];
const isWish = (id) => !!collection.wish[id];

// ===== 画像URL（Commons FilePath → https + サムネ幅） =====
function imgUrl(url, width) {
  if (!url) return "";
  let u = url.replace(/^http:\/\//, "https://");
  return u + (u.includes("?") ? "&" : "?") + "width=" + width;
}

const TYPE_LABEL = { cultural: "文化遺産", natural: "自然遺産", mixed: "複合遺産", unknown: "" };

// ===== 初期化 =====
async function init() {
  try {
    SITES = await fetch("data/sites.json").then((r) => r.json());
  } catch (e) {
    document.getElementById("list").innerHTML = '<p class="empty">データの読み込みに失敗しました。</p>';
    return;
  }
  // AI解説（あれば）
  try { DESCRIPTIONS = await fetch("data/descriptions.json").then((r) => (r.ok ? r.json() : {})); }
  catch { DESCRIPTIONS = {}; }

  document.getElementById("totalCount").textContent = SITES.length;
  buildSelects();
  bindUI();
  applyFilters();
  setupInfiniteScroll();
}

function buildSelects() {
  // 地域
  const regions = ["アジア","中東","ヨーロッパ","アフリカ","北米・中米","南米","オセアニア","その他"];
  const rs = document.getElementById("regionSelect");
  regions.forEach((r) => rs.add(new Option(r, r)));
  // 国（出現数つき、多い順）
  const counts = {};
  SITES.forEach((s) => s.countries.forEach((c) => (counts[c] = (counts[c] || 0) + 1)));
  const cs = document.getElementById("countrySelect");
  Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b, "ja"))
    .forEach((c) => cs.add(new Option(`${c} (${counts[c]})`, c)));
}

// ===== フィルタ適用 =====
function applyFilters() {
  const q = state.q.trim().toLowerCase();
  filtered = SITES.filter((s) => {
    if (q) {
      const hay = (s.name + " " + (s.name_en || "") + " " + s.countries.join(" ")).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (state.types.size && !state.types.has(s.type)) return false;
    if (state.danger && !s.danger) return false;
    if (state.collected && !isDone(s.id)) return false;
    if (state.wish && !isWish(s.id)) return false;
    if (state.region && !s.countries.some((c) => regionOf(c) === state.region)) return false;
    if (state.country && !s.countries.includes(state.country)) return false;
    return true;
  });

  filtered.sort((a, b) => {
    if (state.sort === "year_desc") return (b.year || 0) - (a.year || 0);
    if (state.sort === "year_asc") return (a.year || 9999) - (b.year || 9999);
    return a.name.localeCompare(b.name, "ja");
  });

  document.getElementById("resultCount").textContent = filtered.length;
  const list = document.getElementById("list");
  list.innerHTML = "";
  renderedCount = 0;
  renderMore();
}

function renderMore() {
  const list = document.getElementById("list");
  const slice = filtered.slice(renderedCount, renderedCount + PAGE);
  const frag = document.createDocumentFragment();
  slice.forEach((s) => frag.appendChild(cardEl(s)));
  list.appendChild(frag);
  renderedCount += slice.length;
}

function cardEl(s) {
  const el = document.createElement("div");
  el.className = "card";
  el.onclick = () => openDetail(s.id);
  const badges = [];
  if (s.type !== "unknown") badges.push(`<span class="badge ${s.type}">${TYPE_LABEL[s.type]}</span>`);
  if (s.danger) badges.push('<span class="badge danger">危機</span>');
  if (isDone(s.id)) badges.push('<span class="badge done">✓</span>');
  if (isWish(s.id)) badges.push('<span class="badge wish">★</span>');
  const img = s.image
    ? `<img class="thumb" loading="lazy" src="${imgUrl(s.image, 300)}" alt="" onerror="this.removeAttribute('src')" />`
    : '<div class="thumb"></div>';
  el.innerHTML = `${img}
    <div class="meta">
      <div class="name">${esc(s.name)}</div>
      <div class="country">${esc(s.countries.join("・"))}${s.year ? " / " + s.year : ""}</div>
      <div class="badges">${badges.join("")}</div>
    </div>`;
  return el;
}

function setupInfiniteScroll() {
  const io = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && renderedCount < filtered.length) renderMore();
  }, { rootMargin: "300px" });
  io.observe(document.getElementById("sentinel"));
}

// ===== 詳細 =====
function openDetail(id) {
  const s = SITES.find((x) => x.id === id);
  if (!s) return;
  const d = DESCRIPTIONS[id];
  const facts = [];
  if (s.type !== "unknown") facts.push(`<span class="badge ${s.type}">${TYPE_LABEL[s.type]}</span>`);
  facts.push(`<span class="badge">${esc(s.countries.join("・"))}</span>`);
  if (s.year) facts.push(`<span class="badge">${s.year}年登録</span>`);
  if (s.criteria) facts.push(`<span class="badge">登録基準 ${esc(s.criteria)}</span>`);
  if (s.danger) facts.push('<span class="badge danger">⚠️ 危機遺産</span>');

  const hero = s.image
    ? `<img class="detail-hero" src="${imgUrl(s.image, 800)}" alt="" onerror="this.style.display='none'" />`
    : "";

  const aiSection = d
    ? `<div class="section-title">歴史的背景</div><p>${esc(d.background)}</p>
       <div class="section-title">関わった人々</div><p>${esc(d.people)}</p>
       <div class="section-title">見どころ</div><p>${esc(d.highlights)}</p>
       ${d.source_url ? `<p class="src-note">出典: <a href="${d.source_url}" target="_blank" rel="noopener">${esc(d.source_label || "Wikipedia")}</a>（${esc(d.retrieved || "")} 取得）に基づき作成</p>` : ""}`
    : `<div class="section-title">解説</div><p class="ai-pending">この遺産の解説（歴史的背景・関わった人物・見どころ）は準備中です。</p>`;

  const mapSection = (s.lat != null)
    ? `<div class="section-title">場所</div><div id="detailMap" class="detail-map"></div>`
    : "";

  document.getElementById("detailBody").innerHTML = `
    ${hero}
    <div class="detail-inner">
      <h2>${esc(s.name)}</h2>
      <div class="en">${esc(s.name_en || "")}</div>
      <div class="detail-facts">${facts.join("")}</div>
      <div class="detail-actions">
        <button class="btn primary ${isDone(s.id) ? "on" : ""}" id="doneBtn">${isDone(s.id) ? "✓ 閲覧済み" : "閲覧済みにする"}</button>
        <button class="btn gold ${isWish(s.id) ? "on" : ""}" id="wishBtn">${isWish(s.id) ? "★ 行きたい" : "⭐ 行きたい"}</button>
      </div>
      ${aiSection}
      ${mapSection}
      ${s.ja_wiki || s.en_wiki ? `<a class="wiki-link" href="${s.ja_wiki || s.en_wiki}" target="_blank" rel="noopener">Wikipediaで詳しく見る →</a>` : ""}
    </div>`;

  document.getElementById("doneBtn").onclick = () => {
    if (isDone(s.id)) delete collection.done[s.id]; else collection.done[s.id] = 1;
    saveCollection(); openDetail(id);
  };
  document.getElementById("wishBtn").onclick = () => {
    if (isWish(s.id)) delete collection.wish[s.id]; else collection.wish[s.id] = 1;
    saveCollection(); openDetail(id);
  };

  document.getElementById("detail").hidden = false;
  if (s.lat != null) initMap(s);
}

let leafletLoaded = false;
function initMap(s) {
  loadLeaflet().then(() => {
    const el = document.getElementById("detailMap");
    if (!el || !window.L) return;
    const map = L.map(el, { attributionControl: false, zoomControl: false }).setView([s.lat, s.lon], 6);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18 }).addTo(map);
    L.marker([s.lat, s.lon]).addTo(map);
    setTimeout(() => map.invalidateSize(), 200);
  }).catch(() => {});
}
function loadLeaflet() {
  if (leafletLoaded) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(css);
    const js = document.createElement("script");
    js.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    js.onload = () => { leafletLoaded = true; resolve(); };
    js.onerror = reject;
    document.head.appendChild(js);
  });
}

function closeDetail() { document.getElementById("detail").hidden = true; }

// ===== 統計・うんちく =====
function renderStats() {
  const el = document.getElementById("statsContent");
  const total = SITES.length;
  const cul = SITES.filter((s) => s.type === "cultural").length;
  const nat = SITES.filter((s) => s.type === "natural").length;
  const mix = SITES.filter((s) => s.type === "mixed").length;
  const dgr = SITES.filter((s) => s.danger).length;

  // 国別TOP15
  const counts = {};
  SITES.forEach((s) => s.countries.forEach((c) => (counts[c] = (counts[c] || 0) + 1)));
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 15);
  const maxC = top[0][1];

  // 登録が古い順TOP5
  const oldest = SITES.filter((s) => s.year).sort((a, b) => a.year - b.year).slice(0, 5);

  el.innerHTML = `
    <h2>📊 全体の数字</h2>
    <div class="stat-cards">
      <div class="stat-cell"><div class="num">${total}</div><div class="lbl">総物件数</div></div>
      <div class="stat-cell"><div class="num">${cul}</div><div class="lbl">文化遺産</div></div>
      <div class="stat-cell"><div class="num">${nat}</div><div class="lbl">自然遺産</div></div>
      <div class="stat-cell"><div class="num">${mix}</div><div class="lbl">複合遺産</div></div>
      <div class="stat-cell"><div class="num">${dgr}</div><div class="lbl">危機遺産</div></div>
      <div class="stat-cell"><div class="num">${Object.keys(counts).length}</div><div class="lbl">国・地域</div></div>
    </div>

    <h2>🏆 国別 保有数ランキング</h2>
    ${top.map(([c, n]) => bar(c, n, maxC)).join("")}

    <h2>📜 登録が古い世界遺産</h2>
    ${oldest.map((s) => `<div class="trivia"><div class="h">${s.year}年</div><div class="t">${esc(s.name)}（${esc(s.countries.join("・"))}）</div></div>`).join("")}

    <h2>💡 世界遺産うんちく</h2>
    ${TRIVIA.map((t) => `<div class="trivia"><div class="h">${t.h}</div><div class="t">${t.t}</div></div>`).join("")}
  `;
}
function bar(name, val, max) {
  return `<div class="bar-row"><span class="bname">${esc(name)}</span>
    <span class="btrack"><span class="bfill" style="width:${(val / max * 100).toFixed(0)}%"></span></span>
    <span class="bval">${val}</span></div>`;
}
const TRIVIA = [
  { h: "世界遺産のはじまり", t: "世界遺産条約は1972年に採択。1978年に最初の12件が登録されました。" },
  { h: "日本の最初", t: "日本初の登録は1993年。法隆寺地域の仏教建造物・姫路城（文化）と、屋久島・白神山地（自然）の4件です。" },
  { h: "3つの分類", t: "文化遺産・自然遺産、その両方の価値を持つ複合遺産の3種類。登録基準(i)〜(vi)が文化、(vii)〜(x)が自然です。" },
  { h: "危機遺産とは", t: "紛争・開発・災害などで価値が脅かされ、緊急の保護が必要と判断された遺産。リストは毎年見直されます。" },
  { h: "優劣はない", t: "すべての世界遺産は『顕著な普遍的価値』を持つものとして対等。公式な人気順位は存在しません。" },
];

// ===== コレクション =====
function renderCollection() {
  const el = document.getElementById("collectionContent");
  const total = SITES.length;
  const doneIds = Object.keys(collection.done).map(Number);
  const wishIds = Object.keys(collection.wish).map(Number);
  const doneCount = doneIds.length;
  const pct = total ? (doneCount / total * 100) : 0;

  // 地域別の制覇率
  const regionTotals = {}, regionDone = {};
  SITES.forEach((s) => {
    const r = regionOf(s.countries[0] || "");
    regionTotals[r] = (regionTotals[r] || 0) + 1;
    if (isDone(s.id)) regionDone[r] = (regionDone[r] || 0) + 1;
  });

  const doneSites = SITES.filter((s) => isDone(s.id));
  const wishSites = SITES.filter((s) => isWish(s.id));

  el.innerHTML = `
    <h2>🏆 制覇状況</h2>
    <div class="ratio-wrap">
      <div class="ratio-num">${doneCount} <span style="font-size:16px;color:var(--muted)">/ ${total}</span></div>
      <div class="ratio-track"><div class="ratio-fill" style="width:${pct.toFixed(1)}%"></div></div>
      <div style="font-size:13px;color:var(--muted)">制覇率 ${pct.toFixed(1)}% ・ 行きたい ${wishIds.length}件</div>
    </div>

    <h2>🗺 地域別の制覇率</h2>
    ${Object.keys(regionTotals).sort().map((r) => bar(r, regionDone[r] || 0, regionTotals[r])).join("")}

    <h2>✅ 閲覧済み（${doneCount}）</h2>
    ${doneCount ? `<div class="card-grid" id="colDone"></div>` : '<p class="empty">まだありません。遺産の詳細から「閲覧済み」を押そう。</p>'}

    <h2>⭐ 行きたい（${wishIds.length}）</h2>
    ${wishIds.length ? `<div class="card-grid" id="colWish"></div>` : '<p class="empty">まだありません。</p>'}
  `;
  if (doneCount) { const g = document.getElementById("colDone"); doneSites.forEach((s) => g.appendChild(cardEl(s))); }
  if (wishIds.length) { const g = document.getElementById("colWish"); wishSites.forEach((s) => g.appendChild(cardEl(s))); }
}

// ===== UI バインド =====
function bindUI() {
  const qEl = document.getElementById("q");
  let t;
  qEl.oninput = () => { clearTimeout(t); t = setTimeout(() => { state.q = qEl.value; applyFilters(); }, 200); };

  document.querySelectorAll("#typeFilters .chip").forEach((c) => {
    c.onclick = () => {
      const ty = c.dataset.type;
      if (state.types.has(ty)) { state.types.delete(ty); c.classList.remove("on"); }
      else { state.types.add(ty); c.classList.add("on"); }
      applyFilters();
    };
  });
  const toggleChip = (id, key) => {
    const c = document.getElementById(id);
    c.onclick = () => { state[key] = !state[key]; c.classList.toggle("on", state[key]); applyFilters(); };
  };
  toggleChip("dangerChip", "danger");
  toggleChip("collectedChip", "collected");
  toggleChip("wishChip", "wish");

  document.getElementById("regionSelect").onchange = (e) => { state.region = e.target.value; applyFilters(); };
  document.getElementById("countrySelect").onchange = (e) => { state.country = e.target.value; applyFilters(); };
  document.getElementById("sortSelect").onchange = (e) => { state.sort = e.target.value; applyFilters(); };

  document.getElementById("resetBtn").onclick = () => {
    state.q = ""; state.types.clear(); state.danger = state.collected = state.wish = false;
    state.region = state.country = ""; state.sort = "name";
    qEl.value = "";
    document.querySelectorAll(".chip").forEach((c) => c.classList.remove("on"));
    document.getElementById("regionSelect").value = "";
    document.getElementById("countrySelect").value = "";
    document.getElementById("sortSelect").value = "name";
    applyFilters();
  };

  // タブ切替
  document.querySelectorAll(".tabbtn").forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll(".tabbtn").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      const tab = b.dataset.tab;
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      document.getElementById("tab-" + tab).classList.add("active");
      if (tab === "stats") renderStats();
      if (tab === "collection") renderCollection();
      window.scrollTo(0, 0);
    };
  });

  document.getElementById("detailClose").onclick = closeDetail;
  document.getElementById("detail").onclick = (e) => { if (e.target.id === "detail") closeDetail(); };
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

// SW登録
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

init();
