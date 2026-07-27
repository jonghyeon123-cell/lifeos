// 헤더에 쓰는 로고(mark-*.png)의 여백 제거.
//
// 원본 PNG는 글자를 둘러싼 투명 여백 비율이 제각각이라 (글자의 세로 중심이
// home 40.7% / Goal 43.5% / achievement 47.5%) 높이를 똑같이 줘도 글자가 어긋난다.
// 불투명 픽셀의 경계로 잘라내 "이미지 박스 = 글자"로 만들면, 높이 하나로 크기가
// 정해지고 items-center만으로 정렬이 맞는다.
//
// 원본은 건드리지 않는다. mark-face.svg는 SVG라 viewBox로 따로 잘라 두었다.
const fs = require("fs");
const zlib = require("zlib");

function crcTable() {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
}
const TBL = crcTable();
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = TBL[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, c]);
}

function decode(file) {
  const b = fs.readFileSync(file);
  let off = 8, idat = [], w, h, bitDepth, ct;
  while (off < b.length) {
    const len = b.readUInt32BE(off);
    const t = b.toString("ascii", off + 4, off + 8);
    if (t === "IHDR") {
      w = b.readUInt32BE(off + 8); h = b.readUInt32BE(off + 12);
      bitDepth = b[off + 16]; ct = b[off + 17];
    }
    if (t === "IDAT") idat.push(b.slice(off + 8, off + 8 + len));
    off += 12 + len;
  }
  if (bitDepth !== 8 || ct !== 6) throw new Error(`${file}: need 8-bit RGBA, got depth=${bitDepth} type=${ct}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4, stride = w * bpp, px = Buffer.alloc(h * stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const ft = raw[p++];
    for (let x = 0; x < stride; x++) {
      const rv = raw[p + x];
      const a = x >= bpp ? px[y * stride + x - bpp] : 0;
      const up = y > 0 ? px[(y - 1) * stride + x] : 0;
      const ul = x >= bpp && y > 0 ? px[(y - 1) * stride + x - bpp] : 0;
      let v;
      if (ft === 0) v = rv;
      else if (ft === 1) v = rv + a;
      else if (ft === 2) v = rv + up;
      else if (ft === 3) v = rv + ((a + up) >> 1);
      else {
        const pp = a + up - ul, pa = Math.abs(pp - a), pb = Math.abs(pp - up), pc = Math.abs(pp - ul);
        v = rv + (pa <= pb && pa <= pc ? a : pb <= pc ? up : ul);
      }
      px[y * stride + x] = v & 255;
    }
    p += stride;
  }
  return { w, h, px };
}

// alpha > 40 을 "보이는 픽셀"로 본다. 글로우 잔여물이 경계를 부풀리지 않을 만큼의 문턱값.
const ALPHA = 40;

function crop(src, dst) {
  const { w, h, px } = decode(src);
  let top = -1, bot = -1, left = -1, right = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] > ALPHA) {
        if (top < 0) top = y;
        bot = y;
        if (left < 0 || x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  const cw = right - left + 1, ch = bot - top + 1;
  const out = Buffer.alloc(ch * (cw * 4 + 1));
  let q = 0;
  for (let y = 0; y < ch; y++) {
    out[q++] = 0;
    px.copy(out, q, ((top + y) * w + left) * 4, ((top + y) * w + left + cw) * 4);
    q += cw * 4;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(cw, 0);
  ihdr.writeUInt32BE(ch, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  fs.writeFileSync(dst, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(out, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]));
  console.log(`${dst}: ${w}x${h} -> ${cw}x${ch}  (aspect ${(cw / ch).toFixed(3)})`);
}

crop("home.png", "mark-home.png");
crop("Goal.png", "mark-goal.png");
crop("achievement.png", "mark-achievement.png");
crop("Assignment.png", "mark-assignment.png");
crop("Budget.png", "mark-budget.png");
crop("Diary.png", "mark-diary.png");
crop("LifeOS.png", "mark-lifeos.png");
