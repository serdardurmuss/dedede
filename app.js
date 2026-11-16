import { runPipeline, squareLayout } from './auto.js?v=2';

const $ = id => document.getElementById(id);
const done = [];                       // {name, blob}
let busy = false;

function setStageBg() {
  const v = $('bgsel').value;
  for (const s of document.querySelectorAll('.stage')) s.style.background = v === 'white' ? '#fff' : v === 'dark' ? '#15171b' : '';
}
$('bgsel').addEventListener('change', setStageBg);

function addCard(name) {
  const c = document.createElement('div'); c.className = 'card';
  c.innerHTML = `<h2></h2><div class="pair"><div class="stage"></div><div class="stage"></div></div><div class="meta"><span>Sırada…</span></div>`;
  c.querySelector('h2').textContent = name; $('list').append(c); setStageBg();
  const st = c.querySelectorAll('.stage');
  return { orig: st[0], res: st[1], meta: c.querySelector('.meta') };
}
function thumb(canvasOrBmp, w, h, max = 600) {
  const k = Math.min(1, max / Math.max(w, h)), t = document.createElement('canvas');
  t.width = Math.round(w * k); t.height = Math.round(h * k);
  const g = t.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(canvasOrBmp, 0, 0, t.width, t.height); return t;
}

async function processOne(file, ui, strength, bgMode, cvMode) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }), W = bmp.width, H = bmp.height;
  ui.orig.replaceChildren(thumb(bmp, W, H));
  const src = document.createElement('canvas'); src.width = W; src.height = H;
  const sg = src.getContext('2d', { willReadFrequently: true }); sg.drawImage(bmp, 0, 0);
  const k = Math.min(1, 320 / Math.max(W, H)), sw = Math.max(16, Math.round(W * k)), sh = Math.max(16, Math.round(H * k));
  const sc = document.createElement('canvas'); sc.width = sw; sc.height = sh;
  const cg = sc.getContext('2d', { willReadFrequently: true }); cg.imageSmoothingQuality = 'high'; cg.drawImage(src, 0, 0, sw, sh);
  const small = { px: cg.getImageData(0, 0, sw, sh).data, w: sw, h: sh };
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const og = out.getContext('2d');
  const r = await runPipeline({
    W, H, strength, small, keepBg: bgMode === 'koru', bgColor: bgMode === 'beyaz' ? [255, 255, 255] : bgMode === 'krem' ? [252, 244, 235] : null,
    getTile: (x, y, w, h) => sg.getImageData(x, y, w, h).data,
    putTile: (x, y, w, h, rgba) => og.putImageData(new ImageData(rgba, w, h), x, y),
    progress: (label, f) => (ui.meta.firstChild.textContent = `${label}… %${Math.round(f * 100)}`)
  });
  let fin = out;
  if (cvMode === 'kare' && r.bbox[2] > 0) {                           // standart kare tuval: her ürün aynı boyutta ve ortalı
    const S = 2048, L = squareLayout(r.bbox, W, H, S), c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'), px = small.px, n = small.w, m = small.h;
    const fill = bgMode === 'beyaz' ? [255, 255, 255] : bgMode === 'krem' ? [252, 244, 235] : bgMode === 'koru'
      ? [0, 1, 2].map(k => Math.round((px[k] + px[(n - 1) * 4 + k] + px[(m - 1) * n * 4 + k] + px[((m - 1) * n + n - 1) * 4 + k]) / 4)) : null;
    if (fill) { g.fillStyle = `rgb(${fill[0]},${fill[1]},${fill[2]})`; g.fillRect(0, 0, S, S); }
    g.imageSmoothingQuality = 'high'; g.drawImage(out, L.sx, L.sy, L.sw, L.sh, L.dx, L.dy, L.dw, L.dh); fin = c;
  }
  ui.res.replaceChildren(thumb(fin, fin.width, fin.height));
  const blob = await new Promise(res => fin.toBlob(res, 'image/png'));
  if (!blob) throw new Error('Tarayıcı bu boyutta PNG üretemedi.');
  const base = file.name.replace(/\.[^.]+$/, '');
  done.push({ name: base + '_temiz.png', blob });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = base + '_temiz.png'; a.textContent = 'PNG indir';
  ui.meta.replaceChildren(Object.assign(document.createElement('span'), { textContent: `${W}×${H}: ${r.specks} leke, ${r.reflections} siyah yansıma, ${r.marks} yazı/iz temizlendi` }), a);
}

$('file').addEventListener('change', async e => {
  const files = [...e.target.files]; if (!files.length || busy) return; busy = true; e.target.value = '';
  const strength = $('strength').value, bgMode = $('bgmode').value, cvMode = $('cvmode').value, cards = files.map(f => addCard(f.name));
  for (let i = 0; i < files.length; i++) {
    try { await processOne(files[i], cards[i], strength, bgMode, cvMode); }
    catch (err) { console.error(err); cards[i].meta.textContent = 'Hata: ' + (err?.message || err); }
  }
  busy = false; $('zip').disabled = !done.length || typeof JSZip === 'undefined';
});

$('zip').addEventListener('click', async () => {
  $('zip').disabled = true;
  const z = new JSZip(); for (const d of done) z.file(d.name, d.blob);
  const blob = await z.generateAsync({ type: 'blob', compression: 'STORE' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'temiz_urunler.zip'; a.click();
  $('zip').disabled = false;
});
