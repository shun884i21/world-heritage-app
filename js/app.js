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
  measureHeader();
  window.addEventListener("resize", measureHeader);
  setupHistory();
}

// ===== 履歴管理（スマホの戻るボタンでアプリ内を戻れるように） =====
let activeTab = "search";
let suppressHistory = false; // 戻るボタン起因のUI操作では履歴を積まない

function setupHistory() {
  history.replaceState({ tab: "search" }, "");
  window.addEventListener("popstate", (e) => {
    const st = e.state || { tab: "search" };
    suppressHistory = true;
    try {
      if (st.detail != null) {
        // 「進む」で詳細モーダルの状態に戻ってきた場合
        if (st.tab && st.tab !== activeTab) switchTab(st.tab);
        openDetail(st.detail);
      } else {
        hideDetail();
        // 同じタブ内でモーダルを閉じただけなら再描画もスクロールもしない
        if ((st.tab || "search") !== activeTab) switchTab(st.tab || "search");
      }
    } finally {
      suppressHistory = false;
    }
  });
}
function pushUIState(state) {
  if (!suppressHistory) history.pushState(state, "");
}
// タブ移動（ユーザー操作用。履歴を積んでから切替）
function navTab(tab) {
  if (tab !== activeTab) pushUIState({ tab });
  switchTab(tab);
}

// サブナビをヘッダー直下に固定するため、ヘッダーの実高さをCSS変数に反映
function measureHeader() {
  const h = document.querySelector(".app-header");
  if (h) document.documentElement.style.setProperty("--header-h", h.offsetHeight + "px");
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
  const img = s.image
    ? `<img class="thumb" loading="lazy" src="${imgUrl(s.image, 300)}" alt="" onerror="this.removeAttribute('src')" />`
    : '<div class="thumb noimg"></div>';
  const typeBadge = s.type !== "unknown" ? `<span class="fbadge ${s.type}">${TYPE_LABEL[s.type]}</span>` : "";
  const dangerBadge = s.danger ? '<span class="fbadge danger">⚠ 危機</span>' : "";
  const marks = [];
  if (isDone(s.id)) marks.push('<span class="mark done">✓</span>');
  if (isWish(s.id)) marks.push('<span class="mark wish">★</span>');
  const descDot = DESCRIPTIONS[s.id] ? '<span class="desc-dot" title="解説あり"></span>' : "";
  el.innerHTML = `
    <div class="thumb-wrap">
      ${img}
      <div class="thumb-grad"></div>
      <div class="fbadges">${typeBadge}${dangerBadge}</div>
      ${marks.length ? `<div class="marks">${marks.join("")}</div>` : ""}
    </div>
    <div class="meta">
      <div class="name">${descDot}${esc(s.name)}</div>
      <div class="country"><span class="pin">📍</span>${esc(s.countries.join("・"))}${s.year ? `<span class="yr">${s.year}</span>` : ""}</div>
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

  const overlay = document.getElementById("detail");
  const wasHidden = overlay.hidden;
  overlay.hidden = false;
  if (wasHidden) pushUIState({ tab: activeTab, detail: s.id }); // 戻るボタンでモーダルを閉じられるように
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

// ×ボタン等での閉じ：履歴に積んだ状態なら back() で戻す（履歴とUIのズレを防ぐ）
function closeDetail() {
  if (history.state && history.state.detail != null) { history.back(); return; }
  hideDetail();
}
function hideDetail() { document.getElementById("detail").hidden = true; }

// ===== 統計・うんちく =====
const TYPE_COLOR = { cultural: "#2c5b88", natural: "#2f6b3c", mixed: "#c79a3a", unknown: "#a8a293" };
const REGION_COLORS = ["#1f6f54", "#2c5b88", "#c79a3a", "#c0492f", "#7b5ea7", "#3a8fa3", "#8a6d3b", "#a8a293"];

// 日付シード乱数（毎日変わる「今日の◯◯」用）
function daySeed() {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}
function seededIndex(seed, len) {
  let x = seed % 2147483647;
  x = (x * 48271) % 2147483647;
  x = (x * 48271) % 2147483647;
  return x % len;
}

// SVGドーナツグラフ
function donutSVG(segments, centerLabel, centerSub) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  const R = 15.9155; // 円周がちょうど100になる半径
  let offset = 25;   // 12時の位置から開始
  const circles = segments.map((seg) => {
    const pct = (seg.value / total) * 100;
    const c = `<circle r="${R}" cx="21" cy="21" fill="transparent" stroke="${seg.color}" stroke-width="6"
      stroke-dasharray="${pct} ${100 - pct}" stroke-dashoffset="${offset}"></circle>`;
    offset -= pct;
    return c;
  }).join("");
  const legend = segments.map((seg) =>
    `<div class="lg-row"><span class="lg-dot" style="background:${seg.color}"></span>
     <span class="lg-name">${esc(seg.label)}</span>
     <span class="lg-val">${seg.value}<small>（${(seg.value / total * 100).toFixed(1)}%）</small></span></div>`
  ).join("");
  return `<div class="donut-wrap">
    <div class="donut-svg">
      <svg viewBox="0 0 42 42">${circles}</svg>
      <div class="donut-center"><div class="dc-num">${centerLabel}</div><div class="dc-lbl">${centerSub}</div></div>
    </div>
    <div class="donut-legend">${legend}</div>
  </div>`;
}

// 年代別 登録数チャート
function decadeChartHTML() {
  const bins = {};
  SITES.forEach((s) => { if (s.year) { const d = Math.floor(s.year / 10) * 10; bins[d] = (bins[d] || 0) + 1; } });
  const decades = Object.keys(bins).map(Number).sort((a, b) => a - b);
  const max = Math.max(...decades.map((d) => bins[d]));
  // 最多登録年
  const byYear = {};
  SITES.forEach((s) => { if (s.year) byYear[s.year] = (byYear[s.year] || 0) + 1; });
  const peak = Object.entries(byYear).sort((a, b) => b[1] - a[1])[0];
  const cols = decades.map((d) => {
    const h = Math.max(4, Math.round(bins[d] / max * 100));
    return `<div class="dc-col"><div class="dc-count">${bins[d]}</div>
      <div class="dc-bar-outer"><div class="dc-bar" style="height:${h}%"></div></div>
      <div class="dc-x">${String(d).slice(2)}s</div></div>`;
  }).join("");
  return `<div class="decade-chart">${cols}</div>
    <p class="chart-note">年代別の登録数。1年で最も多かったのは <b>${peak[0]}年の${peak[1]}件</b> です。</p>`;
}

let statsSection = "overview"; // 表示中のセクション（切替式・スクロール削減）

function renderStats() {
  const el = document.getElementById("statsContent");
  const total = SITES.length;
  const byType = { cultural: 0, natural: 0, mixed: 0, unknown: 0 };
  SITES.forEach((s) => byType[s.type] = (byType[s.type] || 0) + 1);
  const dgr = SITES.filter((s) => s.danger).length;
  const descCount = Object.keys(DESCRIPTIONS).length;

  // 国別TOP15
  const counts = {};
  SITES.forEach((s) => s.countries.forEach((c) => (counts[c] = (counts[c] || 0) + 1)));
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 15);
  const maxC = top[0][1];

  // 地域別
  const regionCounts = {};
  SITES.forEach((s) => { const r = regionOf(s.countries[0] || ""); regionCounts[r] = (regionCounts[r] || 0) + 1; });
  const regionSegs = Object.entries(regionCounts).sort((a, b) => b[1] - a[1])
    .map(([r, n], i) => ({ label: r, value: n, color: REGION_COLORS[i % REGION_COLORS.length] }));

  // 今日の1件（解説つきの遺産から日替わり）
  const described = SITES.filter((s) => DESCRIPTIONS[s.id]);
  const todaysSite = described.length ? described[seededIndex(daySeed(), described.length)] : null;
  const todaysTrivia = TRIVIA[daySeed() % TRIVIA.length];

  // 記録コーナー
  const oldest = SITES.filter((s) => s.year).sort((a, b) => a.year - b.year);
  const newestYear = Math.max(...SITES.map((s) => s.year || 0));
  const newestCount = SITES.filter((s) => s.year === newestYear).length;
  const multi = [...SITES].sort((a, b) => b.countries.length - a.countries.length)[0];
  const withLat = SITES.filter((s) => s.lat != null);
  const north = withLat.reduce((a, b) => (a.lat > b.lat ? a : b));
  const south = withLat.reduce((a, b) => (a.lat < b.lat ? a : b));
  const longName = [...SITES].sort((a, b) => b.name.length - a.name.length)[0];
  const records = [
    { i: "📜", h: "いちばん古い登録", t: `${oldest[0].year}年。最初の年には${SITES.filter((s) => s.year === oldest[0].year).length}件が一気に登録されました。`, id: oldest[0].id, n: oldest[0].name },
    { i: "🆕", h: "いちばん新しい登録", t: `${newestYear}年に${newestCount}件が仲間入りしました。` },
    { i: "🤝", h: "最多の国にまたがる遺産", t: `${multi.countries.length}か国で共有されています。`, id: multi.id, n: multi.name },
    { i: "🧊", h: "最北端の世界遺産", t: `北緯${north.lat.toFixed(1)}度（${esc(north.countries.join("・"))}）`, id: north.id, n: north.name },
    { i: "🐧", h: "最南端の世界遺産", t: `南緯${Math.abs(south.lat).toFixed(1)}度（${esc(south.countries.join("・"))}）`, id: south.id, n: south.name },
    { i: "✍️", h: "いちばん長い名前", t: `${longName.name.length}文字あります。`, id: longName.id, n: longName.name },
  ];

  const SEC = {
    overview: `
      <div class="today-box" ${todaysSite ? `onclick="openDetail(${todaysSite.id})"` : ""}>
        <div class="today-label">🎁 今日の世界遺産（毎日変わります）</div>
        ${todaysSite ? `
          <div class="today-body">
            ${todaysSite.image ? `<img class="today-img" src="${imgUrl(todaysSite.image, 300)}" alt="" onerror="this.style.display='none'">` : ""}
            <div>
              <div class="today-name">${esc(todaysSite.name)}</div>
              <div class="today-sub">${esc(todaysSite.countries.join("・"))}${todaysSite.year ? " / " + todaysSite.year + "年登録" : ""}</div>
              <div class="today-hint">タップして解説を読む →</div>
            </div>
          </div>` : ""}
      </div>
      <h2>📊 全体の数字</h2>
      <div class="stat-cards">
        <div class="stat-cell"><div class="num">${total}</div><div class="lbl">総物件数</div></div>
        <div class="stat-cell"><div class="num">${Object.keys(counts).length}</div><div class="lbl">国・地域</div></div>
        <div class="stat-cell"><div class="num">${dgr}</div><div class="lbl">危機遺産</div></div>
        <div class="stat-cell"><div class="num">${byType.cultural}</div><div class="lbl">文化遺産</div></div>
        <div class="stat-cell"><div class="num">${byType.natural}</div><div class="lbl">自然遺産</div></div>
        <div class="stat-cell"><div class="num">${descCount}</div><div class="lbl">解説収録</div></div>
      </div>
      <h2>💡 今日のうんちく</h2>
      <div class="trivia today-trivia"><div class="h">${todaysTrivia.h}</div><div class="t">${todaysTrivia.t}</div></div>`,
    charts: `
      <h2>🥧 分類の内訳</h2>
      ${donutSVG([
        { label: "文化遺産", value: byType.cultural, color: TYPE_COLOR.cultural },
        { label: "自然遺産", value: byType.natural, color: TYPE_COLOR.natural },
        { label: "複合遺産", value: byType.mixed, color: TYPE_COLOR.mixed },
        { label: "分類不明", value: byType.unknown, color: TYPE_COLOR.unknown },
      ].filter((s) => s.value > 0), total, "件")}
      <h2>🗺 地域別の分布</h2>
      ${donutSVG(regionSegs, Object.keys(regionCounts).length, "地域")}
      <h2>📈 登録数のあゆみ</h2>
      ${decadeChartHTML()}`,
    ranking: `
      <h2>🏆 国別 保有数ランキング</h2>
      <p class="chart-note">タップするとその国の遺産一覧にジャンプします。</p>
      ${top.map(([c, n], i) => bar(c, n, maxC, { rank: i + 1, country: c })).join("")}`,
    records: `
      <h2>🎖 記録コーナー</h2>
      ${records.map((r) => `<div class="trivia ${r.id ? "clickable" : ""}" ${r.id ? `onclick="openDetail(${r.id})"` : ""}>
        <div class="h">${r.i} ${r.h}</div>
        ${r.n ? `<div class="t"><b>${esc(r.n)}</b></div>` : ""}
        <div class="t">${r.t}</div></div>`).join("")}`,
    trivia: triviaCarouselHTML(),
  };
  const NAV = [
    ["overview", "🎁 きょう"],
    ["charts", "🥧 グラフ"],
    ["ranking", "🏆 ランキング"],
    ["records", "🎖 記録"],
    ["trivia", "💡 うんちく"],
  ];

  el.innerHTML = `
    <div class="subnav">${NAV.map(([k, lbl]) => `<button class="subnav-btn ${statsSection === k ? "on" : ""}" data-sec="${k}">${lbl}</button>`).join("")}</div>
    <div class="sec-body">${SEC[statsSection]}</div>`;

  el.querySelectorAll(".subnav-btn").forEach((b) => {
    b.onclick = () => { statsSection = b.dataset.sec; renderStats(); window.scrollTo(0, 0); };
  });
  el.querySelectorAll("[data-country]").forEach((r) => { r.onclick = () => gotoCountry(r.dataset.country); });
  if (statsSection === "trivia") bindTriviaCarousel(el);
}

// うんちくカルーセル（横スワイプ1枚ずつ・スクロール不要で全部読める）
function triviaCarouselHTML() {
  const idx = daySeed() % TRIVIA.length;
  const ordered = [...TRIVIA.slice(idx), ...TRIVIA.slice(0, idx)]; // 今日のうんちくを先頭に
  const cards = ordered.map((t, i) => `
    <div class="tcard ${i === 0 ? "today" : ""}">
      <div class="tc-tag">${i === 0 ? "☀️ 今日のうんちく" : `うんちく No.${(idx + i) % TRIVIA.length + 1}`}</div>
      <div class="tc-h">${t.h}</div>
      <div class="tc-t">${t.t}</div>
    </div>`).join("");
  return `
    <h2>💡 うんちく図鑑（全${TRIVIA.length}話）</h2>
    <p class="chart-note">横にスワイプするか、ボタンでめくれます。</p>
    <div class="tcarousel" id="tcar">${cards}</div>
    <div class="tc-controls">
      <button class="tc-btn" id="tcPrev">←</button>
      <span class="tc-counter" id="tcCounter">1 / ${TRIVIA.length}</span>
      <button class="tc-btn" id="tcNext">→</button>
      <button class="tc-btn gold" id="tcRandom">🎲 ランダム</button>
    </div>`;
}
function bindTriviaCarousel(root) {
  const car = root.querySelector("#tcar");
  const counter = root.querySelector("#tcCounter");
  if (!car) return;
  const N = TRIVIA.length;
  const cardW = () => car.firstElementChild ? car.firstElementChild.offsetWidth + 10 : car.clientWidth;
  let cur = 0;
  const show = () => { counter.textContent = `${cur + 1} / ${N}`; };
  const go = (i) => {
    cur = Math.max(0, Math.min(N - 1, i));
    car.scrollTo({ left: cur * cardW(), behavior: "smooth" });
    show();
  };
  // 指スワイプで送った場合もカウンターを同期
  car.addEventListener("scroll", () => {
    const i = Math.round(car.scrollLeft / cardW());
    if (i !== cur) { cur = Math.max(0, Math.min(N - 1, i)); show(); }
  }, { passive: true });
  root.querySelector("#tcPrev").onclick = () => go(cur - 1);
  root.querySelector("#tcNext").onclick = () => go(cur + 1);
  root.querySelector("#tcRandom").onclick = () => {
    let r = Math.floor(Math.random() * N);
    if (r === cur) r = (r + 1) % N;
    go(r);
  };
  show();
}
function bar(name, val, max, opt) {
  const pct = (val / max * 100).toFixed(0);
  const rank = opt && opt.rank ? `<span class="brank">${opt.rank}</span>` : "";
  const attrs = opt && opt.country
    ? ` class="bar-row clickable" data-country="${esc(opt.country)}"`
    : ' class="bar-row"';
  return `<div${attrs}>${rank}<span class="bname">${esc(name)}</span>
    <span class="btrack"><span class="bfill" style="width:${pct}%"></span></span>
    <span class="bval">${val}</span></div>`;
}
// 国別ランキング → 検索タブへジャンプ
function gotoCountry(c) {
  state.q = ""; state.types.clear(); state.danger = state.collected = state.wish = false;
  state.region = ""; state.country = c; state.sort = "name";
  document.getElementById("q").value = "";
  document.querySelectorAll(".chip").forEach((x) => x.classList.remove("on"));
  document.getElementById("regionSelect").value = "";
  document.getElementById("countrySelect").value = c;
  document.getElementById("sortSelect").value = "name";
  navTab("search");
  applyFilters();
}
const TRIVIA = [
  { h: "世界遺産のはじまり", t: "世界遺産条約は1972年に採択。1978年に最初の12件が登録されました。" },
  { h: "日本の最初", t: "日本初の登録は1993年。法隆寺地域の仏教建造物・姫路城（文化）と、屋久島・白神山地（自然）の4件です。" },
  { h: "3つの分類", t: "文化遺産・自然遺産、その両方の価値を持つ複合遺産の3種類。登録基準(i)〜(vi)が文化、(vii)〜(x)が自然です。" },
  { h: "危機遺産とは", t: "紛争・開発・災害などで価値が脅かされ、緊急の保護が必要と判断された遺産。リストは毎年見直されます。" },
  { h: "優劣はない", t: "すべての世界遺産は『顕著な普遍的価値』を持つものとして対等。公式な人気順位は存在しません。" },
  { h: "登録までの道のり", t: "まず各国が暫定リストに記載し、推薦書を提出。ICOMOS（文化）やIUCN（自然）といった諮問機関の審査を経て、年1回の世界遺産委員会で決まります。" },
  { h: "登録が消えることも", t: "価値が失われたと判断されると登録抹消されることも。これまでにアラビアオリックスの保護区（オマーン）などの例があります。" },
  { h: "国境を越える遺産", t: "複数の国が共同で持つ世界遺産もあります。シュトルーヴェの測地弧はなんと10か国にまたがっています。" },
  { h: "複合遺産はレア", t: "文化と自然の両方の価値を持つ複合遺産は全体のわずか3%ほど。とても貴重な存在です。" },
  { h: "無形文化遺産は別モノ", t: "和食やお祭りなどの「無形文化遺産」は世界遺産とは別の制度。世界遺産は不動産（建物や自然）が対象です。" },
  { h: "委員会は年に1回", t: "世界遺産委員会は毎年1回開催され、新規登録・危機遺産・登録抹消などを審議します。開催地は毎年変わります。" },
  { h: "暫定リストという待合室", t: "世界遺産を目指す物件は、まず各国の暫定リストに載る必要があります。日本にも登録を待つ候補があります。" },
];

// ===== コレクション =====
// 称号（閲覧数に応じてレベルアップ）
const RANKS = [
  { need: 0, icon: "🌱", name: "冒険前夜" },
  { need: 1, icon: "👟", name: "見習いトラベラー" },
  { need: 10, icon: "🎒", name: "かけだし探検家" },
  { need: 30, icon: "🧭", name: "世界を歩く人" },
  { need: 60, icon: "⛺", name: "ベテラン探検家" },
  { need: 100, icon: "🗺", name: "世界遺産ハンター" },
  { need: 200, icon: "🏺", name: "遺産マイスター" },
  { need: 400, icon: "🦉", name: "世界の賢者" },
  { need: 700, icon: "🌟", name: "レジェンド探検家" },
  { need: 1171, icon: "👑", name: "世界遺産マスター" },
];
function currentRank(n) {
  let cur = RANKS[0], next = null;
  for (const r of RANKS) { if (n >= r.need) cur = r; else { next = r; break; } }
  return { cur, next };
}

function renderCollection() {
  const el = document.getElementById("collectionContent");
  const total = SITES.length;
  const wishIds = Object.keys(collection.wish).map(Number);
  const doneSites = SITES.filter((s) => isDone(s.id));
  const wishSites = SITES.filter((s) => isWish(s.id));
  const doneCount = doneSites.length;
  const pct = total ? (doneCount / total * 100) : 0;

  // 称号
  const { cur, next } = currentRank(doneCount);
  const rankProg = next ? ((doneCount - cur.need) / (next.need - cur.need) * 100) : 100;

  // 訪れた国・地域
  const doneCountries = new Set(), doneRegions = new Set();
  doneSites.forEach((s) => s.countries.forEach((c) => { doneCountries.add(c); doneRegions.add(regionOf(c)); }));
  const allRegions = new Set(SITES.map((s) => regionOf(s.countries[0] || "")));

  // 地域別・分類別の制覇率
  const regionTotals = {}, regionDone = {};
  SITES.forEach((s) => {
    const r = regionOf(s.countries[0] || "");
    regionTotals[r] = (regionTotals[r] || 0) + 1;
    if (isDone(s.id)) regionDone[r] = (regionDone[r] || 0) + 1;
  });
  const typeTotals = {}, typeDone = {};
  SITES.forEach((s) => {
    typeTotals[s.type] = (typeTotals[s.type] || 0) + 1;
    if (isDone(s.id)) typeDone[s.type] = (typeDone[s.type] || 0) + 1;
  });

  // 実績バッジ
  const doneOf = (pred) => doneSites.filter(pred).length;
  const jpTotal = SITES.filter((s) => s.countries.includes("日本")).length;
  const ACHIEVEMENTS = [
    { icon: "🎌", name: "はじめの一歩", desc: "1件を閲覧する", now: doneCount, need: 1 },
    { icon: "🔟", name: "コレクター", desc: "10件を閲覧する", now: doneCount, need: 10 },
    { icon: "🎖", name: "半世紀", desc: "50件を閲覧する", now: doneCount, need: 50 },
    { icon: "💯", name: "3ケタの人", desc: "100件を閲覧する", now: doneCount, need: 100 },
    { icon: "🏛", name: "文化通", desc: "文化遺産を30件", now: doneOf((s) => s.type === "cultural"), need: 30 },
    { icon: "🌋", name: "自然派", desc: "自然遺産を10件", now: doneOf((s) => s.type === "natural"), need: 10 },
    { icon: "🔆", name: "いいとこどり", desc: "複合遺産を5件", now: doneOf((s) => s.type === "mixed"), need: 5 },
    { icon: "⚠️", name: "見守る人", desc: "危機遺産を5件", now: doneOf((s) => s.danger), need: 5 },
    { icon: "🗾", name: "日本制覇", desc: `日本の${jpTotal}件すべて`, now: doneOf((s) => s.countries.includes("日本")), need: jpTotal },
    { icon: "🧳", name: "10か国めぐり", desc: "10か国の遺産を閲覧", now: doneCountries.size, need: 10 },
    { icon: "🌍", name: "世界一周", desc: `全${allRegions.size}地域で1件ずつ`, now: doneRegions.size, need: allRegions.size },
    { icon: "⭐", name: "夢見る人", desc: "行きたいを10件登録", now: wishIds.length, need: 10 },
  ];
  const earned = ACHIEVEMENTS.filter((a) => a.now >= a.need).length;

  const SEC = {
    status: `
      <div class="rank-card">
        <div class="rank-icon">${cur.icon}</div>
        <div class="rank-body">
          <div class="rank-label">いまの称号</div>
          <div class="rank-name">${cur.name}</div>
          ${next
            ? `<div class="rank-track"><div class="rank-fill" style="width:${rankProg.toFixed(0)}%"></div></div>
               <div class="rank-next">あと <b>${next.need - doneCount}件</b> で ${next.icon} ${next.name}</div>`
            : `<div class="rank-next">全制覇おめでとうございます！</div>`}
        </div>
      </div>
      <h2>🏆 制覇状況</h2>
      <div class="ratio-wrap">
        <div class="ratio-num">${doneCount} <span style="font-size:16px;color:var(--muted)">/ ${total}</span></div>
        <div class="ratio-track"><div class="ratio-fill" style="width:${pct.toFixed(1)}%"></div></div>
        <div style="font-size:13px;color:var(--muted)">制覇率 ${pct.toFixed(1)}%</div>
        <div class="mini-stats">
          <div class="mini-cell"><div class="num">${doneCountries.size}</div><div class="lbl">訪れた国</div></div>
          <div class="mini-cell"><div class="num">${doneRegions.size}<small>/${allRegions.size}</small></div><div class="lbl">訪れた地域</div></div>
          <div class="mini-cell"><div class="num">${wishIds.length}</div><div class="lbl">行きたい</div></div>
          <div class="mini-cell"><div class="num">${earned}<small>/${ACHIEVEMENTS.length}</small></div><div class="lbl">実績</div></div>
        </div>
      </div>
      <h2>📈 地域別の制覇率</h2>
      ${Object.keys(regionTotals).sort((a, b) => regionTotals[b] - regionTotals[a])
        .map((r) => pctBar(r, regionDone[r] || 0, regionTotals[r])).join("")}
      <h2>🥧 分類別の制覇率</h2>
      ${["cultural", "natural", "mixed"].filter((t) => typeTotals[t])
        .map((t) => pctBar(TYPE_LABEL[t], typeDone[t] || 0, typeTotals[t])).join("")}`,
    badges: `
      <h2>🏅 実績バッジ（${earned}/${ACHIEVEMENTS.length}）</h2>
      <div class="ach-grid">
        ${ACHIEVEMENTS.map((a) => {
          const ok = a.now >= a.need;
          const prog = Math.min(100, a.now / a.need * 100);
          return `<div class="ach ${ok ? "earned" : ""}">
            <div class="ach-icon">${a.icon}</div>
            <div class="ach-name">${a.name}</div>
            <div class="ach-desc">${a.desc}</div>
            ${ok ? `<div class="ach-got">達成！</div>`
                 : `<div class="ach-track"><div class="ach-fill" style="width:${prog.toFixed(0)}%"></div></div>
                    <div class="ach-prog">${a.now}/${a.need}</div>`}
          </div>`;
        }).join("")}
      </div>`,
    done: `
      <h2>✅ 閲覧済み（${doneCount}）</h2>
      ${doneCount ? `<div class="card-grid" id="colDone"></div>` : '<p class="empty">まだありません。遺産の詳細から「閲覧済み」を押そう。</p>'}`,
    wish: `
      <h2>⭐ 行きたい（${wishIds.length}）</h2>
      ${wishIds.length ? `<div class="card-grid" id="colWish"></div>` : '<p class="empty">まだありません。</p>'}`,
  };
  const NAV = [
    ["status", "🏆 制覇状況"],
    ["badges", `🏅 実績 ${earned}/${ACHIEVEMENTS.length}`],
    ["done", `✅ 閲覧済み ${doneCount}`],
    ["wish", `⭐ 行きたい ${wishIds.length}`],
  ];

  el.innerHTML = `
    <div class="subnav">${NAV.map(([k, lbl]) => `<button class="subnav-btn ${collSection === k ? "on" : ""}" data-sec="${k}">${lbl}</button>`).join("")}</div>
    <div class="sec-body">${SEC[collSection]}</div>`;

  el.querySelectorAll(".subnav-btn").forEach((b) => {
    b.onclick = () => { collSection = b.dataset.sec; renderCollection(); window.scrollTo(0, 0); };
  });
  if (collSection === "done" && doneCount) { const g = document.getElementById("colDone"); doneSites.forEach((s) => g.appendChild(cardEl(s))); }
  if (collSection === "wish" && wishIds.length) { const g = document.getElementById("colWish"); wishSites.forEach((s) => g.appendChild(cardEl(s))); }
}
let collSection = "status"; // コレクションの表示セクション
// 進捗バー（n/total と % を表示）
function pctBar(name, val, max) {
  const pct = max ? (val / max * 100) : 0;
  return `<div class="bar-row"><span class="bname">${esc(name)}</span>
    <span class="btrack"><span class="bfill" style="width:${pct.toFixed(0)}%"></span></span>
    <span class="bval wide">${val}/${max}<small>（${pct.toFixed(0)}%）</small></span></div>`;
}

// ===== UI バインド =====
function bindUI() {
  const qEl = document.getElementById("q");
  let t;
  qEl.oninput = () => { clearTimeout(t); t = setTimeout(() => { state.q = qEl.value; applyFilters(); }, 200); };

  document.querySelectorAll("#typeFilters .chip[data-type]").forEach((c) => {
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

  // タブ切替（履歴を積む＝戻るボタンで前のタブへ戻れる）
  document.querySelectorAll(".tabbtn").forEach((b) => {
    b.onclick = () => navTab(b.dataset.tab);
  });

  document.getElementById("detailClose").onclick = closeDetail;
  document.getElementById("detail").onclick = (e) => { if (e.target.id === "detail") closeDetail(); };
}

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll(".tabbtn").forEach((x) => x.classList.toggle("active", x.dataset.tab === tab));
  document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  document.getElementById("tab-" + tab).classList.add("active");
  if (tab === "stats") renderStats();
  if (tab === "collection") renderCollection();
  window.scrollTo(0, 0);
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

// SW登録
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

init();
