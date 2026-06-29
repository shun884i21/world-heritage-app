// 依存なしで世界遺産アプリ用アイコンPNGを生成（緑背景＋地球儀）
import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";

const outDir = path.resolve(import.meta.dirname, "..", "icons");
fs.mkdirSync(outDir, { recursive: true });

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function png(size, draw) {
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const [r, g, b, a] = draw(x, y);
    const o = (y * size + x) * 4;
    px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = a;
  }
  // フィルタバイト(0)を各行頭に
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8bit, RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

function draw(size) {
  const cx = size / 2, cy = size / 2, R = size * 0.34;
  return (x, y) => {
    // 背景：緑グラデ
    const t = y / size;
    let bg = [Math.round(31 + 0 * t), Math.round(111 - 30 * t), Math.round(84 - 25 * t), 255];
    const dx = x - cx, dy = y - cy, dist = Math.hypot(dx, dy);
    if (dist <= R) {
      // 地球儀：海（青）＋大陸（金）を簡易ノイズで
      const lat = dy / R, lon = dx / R;
      const land = Math.sin(lon * 6 + lat * 3) + Math.cos(lat * 7 - lon * 2) + Math.sin((lon + lat) * 9);
      if (land > 0.7) return [199, 154, 58, 255]; // 大陸=金
      // 球の陰影
      const sh = 1 - dist / R * 0.35;
      return [Math.round(70 * sh), Math.round(120 * sh), Math.round(150 * sh), 255];
    }
    // 地球の輪郭リング
    if (dist <= R + size * 0.012) return [247, 240, 220, 255];
    return bg;
  };
}

for (const size of [192, 512]) {
  fs.writeFileSync(path.join(outDir, `icon-${size}.png`), png(size, draw(size)));
  console.log("wrote icon-" + size + ".png");
}
