// Robot de noticias — Vibras Noticias · Vibras Positivas HM
// Lo ejecuta GitHub Actions cada 30 minutos. Trae:
//   1. Titulares de Colombia por tema (Google Noticias)
//   2. Noticias con FOTO real de los medios colombianos (sus RSS públicos)
//   3. Fotos de las notas que no traen foto en el RSS (la imagen que el medio publica para compartir)
//   4. Los VIDEOS más recientes de los noticieros colombianos en YouTube
// Escribe noticias.json solo si algo cambió.
import { readFile, writeFile } from 'node:fs/promises';

const ARCHIVO = 'noticias.json';
const MAX_NOTICIAS = 260;
const DIAS_MAX = 7;
const MAX_VIDEOS = 48;
const DIAS_VIDEOS = 5;
const MAX_FOTOS_POR_CORRIDA = 60;

// 1. Google Noticias Colombia por tema
const TEMAS = [
  { tema: 'Última hora', url: 'https://news.google.com/rss?hl=es-419&gl=CO&ceid=CO:es-419' },
  { tema: 'Gobierno', q: '"Abelardo de la Espriella" OR "Casa de Nariño" OR ministro Colombia' },
  { tema: 'Congreso', q: 'Senado OR "Cámara de Representantes" Colombia' },
  { tema: 'Orden público', q: '"Policía Nacional" OR Ejército OR "Fuerzas Militares" Colombia' },
  { tema: 'Justicia', q: 'Fiscalía OR "Corte Suprema" OR Procuraduría OR "Corte Constitucional" Colombia' },
  { tema: 'Economía', q: 'dólar OR economía OR DANE OR "Banco de la República" Colombia' },
  { tema: 'Regiones', q: 'Antioquia OR Córdoba OR Sucre OR "Bajo Cauca" OR Urabá gobernador alcalde' },
  { tema: 'Deportes', q: '"Selección Colombia" OR "Liga BetPlay" OR ciclismo Colombia' },
];

// 2. Medios colombianos con foto en su RSS. Si alguno falla, el robot sigue con los demás.
const MEDIOS = [
  { medio: 'Infobae Colombia', url: 'https://www.infobae.com/arc/outboundfeeds/rss/category/colombia/' },
  { medio: 'Semana', url: 'https://www.semana.com/arc/outboundfeeds/rss/?outputType=xml' },
  { medio: 'El Tiempo', url: 'https://www.eltiempo.com/arc/outboundfeeds/rss/?outputType=xml' },
  { medio: 'El Tiempo', url: 'https://www.eltiempo.com/rss/colombia.xml' },
  { medio: 'El Espectador', url: 'https://www.elespectador.com/arc/outboundfeeds/rss/?outputType=xml' },
  { medio: 'Noticias Caracol', url: 'https://www.noticiascaracol.com/arc/outboundfeeds/rss/?outputType=xml' },
  { medio: 'Caracol Radio', url: 'https://caracol.com.co/arc/outboundfeeds/rss/?outputType=xml' },
  { medio: 'Blu Radio', url: 'https://www.bluradio.com/arc/outboundfeeds/rss/?outputType=xml' },
  { medio: 'La FM', url: 'https://www.lafm.com.co/arc/outboundfeeds/rss/?outputType=xml' },
  { medio: 'El Colombiano', url: 'https://www.elcolombiano.com/arc/outboundfeeds/rss/?outputType=xml' },
  { medio: 'El Colombiano', url: 'https://www.elcolombiano.com/rss/colombia.xml' },
  { medio: 'Pulzo', url: 'https://www.pulzo.com/rss' },
  { medio: 'El Heraldo', url: 'https://www.elheraldo.co/rss.xml' },
  { medio: 'El Universal', url: 'https://www.eluniversal.com.co/arc/outboundfeeds/rss/?outputType=xml' },
  { medio: 'La Silla Vacía', url: 'https://www.lasillavacia.com/feed/' },
  { medio: 'Kienyke', url: 'https://www.kienyke.com/feed' },
  { medio: 'Cambio', url: 'https://cambiocolombia.com/rss.xml' },
];

// 4. Noticieros colombianos en YouTube (el robot averigua solo el código de cada canal)
const CANALES = [
  { nombre: 'Noticias Caracol', handle: 'NoticiasCaracol', id: 'UC2Xq2PK-got3Rtz9ZJ32hLQ' },
  { nombre: 'Noticias RCN', handle: 'NoticiasRCN' },
  { nombre: 'Semana', handle: 'RevistaSemana' },
  { nombre: 'El Tiempo', handle: 'ElTiempo' },
  { nombre: 'El Espectador', handle: 'elespectador' },
  { nombre: 'Caracol Radio', handle: 'CaracolRadio' },
  { nombre: 'Blu Radio', handle: 'BluRadioCo' },
  { nombre: 'Noticias Uno', handle: 'NoticiasUnoColombia' },
  { nombre: 'Canal 1', handle: 'CanalUnoTV' },
  { nombre: 'Teleantioquia Noticias', handle: 'TeleantioquiaNoticias' },
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const CABECERAS = { 'User-Agent': UA, 'Accept-Language': 'es-CO,es;q=0.9,en;q=0.6', Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' };

const decodificar = t => (t || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'").replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
const etiqueta = (xml, tag) => decodificar((xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`)) || [])[1]);
const atributo = (tagXml, attr) => decodificar((tagXml.match(new RegExp(`\\s${attr}=["']([^"']+)["']`)) || [])[1]);
const sinHtml = t => decodificar(t).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const clave = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 70);
const corto = (t, n = 180) => t.length > n ? t.slice(0, t.lastIndexOf(' ', n)) + '…' : t;

function imagenValida(u) {
  if (!u) return '';
  u = decodificar(u).replace(/^\/\//, 'https://');
  if (!/^https?:\/\//.test(u)) return '';
  if (/logo|favicon|avatar|placeholder|pixel|1x1|blank\.|default-image|og-default/i.test(u)) return '';
  return u.replace(/^http:/, 'https:');
}

function imagenDe(bloque) {
  const cands = [];
  for (const m of bloque.matchAll(/<media:content\b[^>]*>/g)) {
    const tipo = atributo(m[0], 'type'), medio = atributo(m[0], 'medium');
    if (!tipo || tipo.startsWith('image') || medio === 'image') cands.push(atributo(m[0], 'url'));
  }
  for (const m of bloque.matchAll(/<media:thumbnail\b[^>]*>/g)) cands.push(atributo(m[0], 'url'));
  for (const m of bloque.matchAll(/<enclosure\b[^>]*>/g)) if ((atributo(m[0], 'type') || 'image').startsWith('image')) cands.push(atributo(m[0], 'url'));
  const html = decodificar(etiqueta(bloque, 'content:encoded') + ' ' + etiqueta(bloque, 'description'));
  for (const m of html.matchAll(/<img\b[^>]*\ssrc=["']([^"']+)["']/g)) cands.push(m[1]);
  return cands.map(imagenValida).find(Boolean) || '';
}

export function parsearRSS(xml, extra = {}) {
  const items = xml.includes('<item') ? xml.split(/<item[\s>]/).slice(1) : xml.split(/<entry[\s>]/).slice(1);
  return items.map(b => {
    const fuente = extra.fuente || etiqueta(b, 'source');
    let titulo = sinHtml(etiqueta(b, 'title'));
    if (fuente && titulo.endsWith(' - ' + fuente)) titulo = titulo.slice(0, -(fuente.length + 3));
    let enlace = etiqueta(b, 'link') || atributo((b.match(/<link\b[^>]*>/) || [''])[0], 'href') || etiqueta(b, 'guid');
    const fecha = new Date(etiqueta(b, 'pubDate') || etiqueta(b, 'published') || etiqueta(b, 'updated') || etiqueta(b, 'dc:date'));
    const n = { titulo, enlace: enlace.trim(), fuente, fecha: isNaN(fecha) ? null : fecha.toISOString(), tema: extra.tema || '' };
    if (extra.conFoto) {
      const img = imagenDe(b); if (img) n.imagen = img;
      const res = corto(sinHtml(etiqueta(b, 'description')));
      if (res && res.length > 30 && clave(res) !== clave(titulo)) n.resumen = res;
    }
    return n;
  }).filter(n => n.titulo && /^https?:\/\//.test(n.enlace) && n.fecha);
}

export function parsearVideos(xml, canal) {
  return xml.split('<entry>').slice(1).map(b => {
    const enlace = atributo((b.match(/<link\b[^>]*rel=["']alternate["'][^>]*>/) || [''])[0], 'href');
    return {
      id: etiqueta(b, 'yt:videoId'),
      titulo: sinHtml(etiqueta(b, 'title')),
      fecha: etiqueta(b, 'published'),
      canal,
      ...(enlace.includes('/shorts/') ? { corto: true } : {}),
    };
  }).filter(v => v.id && v.titulo);
}

async function traer(url, ms = 20000, extra = {}) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { headers: { ...CABECERAS, ...extra }, signal: ctl.signal, redirect: 'follow' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally { clearTimeout(t); }
}

async function enParalelo(lista, n, fn) {
  const res = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < lista.length) { const k = i++; res[k] = await fn(lista[k], k); } }));
  return res;
}

const reporte = {};

async function titularesGoogle() {
  const res = await enParalelo(TEMAS, 4, async t => {
    const url = t.url || `https://news.google.com/rss/search?q=${encodeURIComponent(t.q + ' when:2d')}&hl=es-419&gl=CO&ceid=CO:es-419`;
    try { const l = parsearRSS(await traer(url), { tema: t.tema }).slice(0, 40); reporte['google:' + t.tema] = l.length; return l; }
    catch (e) { reporte['google:' + t.tema] = e.message; return []; }
  });
  return res.flat();
}

async function noticiasConFoto() {
  const res = await enParalelo(MEDIOS, 5, async m => {
    try {
      const l = parsearRSS(await traer(m.url), { fuente: m.medio, conFoto: true }).slice(0, 30);
      reporte['medio:' + m.medio + ' ' + new URL(m.url).pathname.slice(0, 30)] = `${l.length} notas, ${l.filter(n => n.imagen).length} con foto`;
      return l;
    } catch (e) { reporte['medio:' + m.medio + ' ' + new URL(m.url).pathname.slice(0, 30)] = e.message; return []; }
  });
  return res.flat();
}

// Foto que el medio publica para compartir la nota (og:image)
async function fotoDeLaNota(url) {
  try {
    const html = (await traer(url, 9000)).slice(0, 400000);
    const metas = html.match(/<meta\b[^>]+>/gi) || [];
    for (const nombre of ['og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image', 'twitter:image:src']) {
      const m = metas.find(x => new RegExp(`(property|name)=["']${nombre}["']`, 'i').test(x));
      const u = m && imagenValida(atributo(m, 'content'));
      if (u) return u;
    }
  } catch {}
  return '';
}

async function codigoCanal(c, previo) {
  if (c.id) return c.id;
  if (previo[c.handle]) return previo[c.handle];
  try {
    const html = await traer(`https://www.youtube.com/@${c.handle}`, 15000, { Cookie: 'CONSENT=YES+1; SOCS=CAI' });
    return (html.match(/"externalId":"(UC[\w-]{22})"/) || html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/)
      || html.match(/channel_id=(UC[\w-]{22})/) || html.match(/"browseId":"(UC[\w-]{22})"/) || [])[1] || '';
  } catch (e) { reporte['canal:' + c.nombre] = 'sin código: ' + e.message; return ''; }
}

async function videosNoticieros(previoCanales) {
  const canales = {};
  const res = await enParalelo(CANALES, 4, async c => {
    const id = await codigoCanal(c, previoCanales);
    if (!id) { reporte['canal:' + c.nombre] ??= 'sin código'; return []; }
    canales[c.handle] = id;
    try {
      const l = parsearVideos(await traer(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`), c.nombre).slice(0, 8);
      reporte['canal:' + c.nombre] = l.length + ' videos';
      return l;
    } catch (e) { reporte['canal:' + c.nombre] = e.message; return []; }
  });
  return { videos: res.flat(), canales };
}

async function main() {
  let previo = { noticias: [], videos: [], canales: {} };
  try { previo = JSON.parse(await readFile(ARCHIVO, 'utf8')); } catch {}

  const [google, medios, yt] = await Promise.all([titularesGoogle(), noticiasConFoto(), videosNoticieros(previo.canales || {})]);

  // Unir noticias: las de medios (con foto) primero para que ganen en los duplicados
  const limite = Date.now() - DIAS_MAX * 86400000;
  const fotoPrevia = new Map((previo.noticias || []).filter(n => n.imagen || n.sinFoto).map(n => [n.enlace, n]));
  const mapa = new Map();
  for (const n of [...medios, ...google, ...(previo.noticias || [])]) {
    if (new Date(n.fecha).getTime() < limite || new Date(n.fecha).getTime() > Date.now() + 3600000) continue;
    const k = clave(n.titulo);
    const ya = mapa.get(k);
    if (!ya) {
      const p = fotoPrevia.get(n.enlace);
      mapa.set(k, { ...n, ...(p?.imagen && !n.imagen ? { imagen: p.imagen } : {}), ...(p?.sinFoto && !n.imagen ? { sinFoto: true } : {}) });
    } else {
      if (!ya.imagen && n.imagen) ya.imagen = n.imagen;
      if (!ya.tema && n.tema) ya.tema = n.tema;
      if (!ya.resumen && n.resumen) ya.resumen = n.resumen;
    }
  }
  const noticias = [...mapa.values()].sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, MAX_NOTICIAS);

  // 3. Buscar la foto de las notas recientes que no la traen (solo enlaces directos al medio)
  const faltan = noticias.filter(n => !n.imagen && !n.sinFoto && !n.enlace.includes('news.google.com')).slice(0, MAX_FOTOS_POR_CORRIDA);
  let halladas = 0;
  await enParalelo(faltan, 6, async n => {
    const img = await fotoDeLaNota(n.enlace);
    if (img) { n.imagen = img; halladas++; } else n.sinFoto = true;
  });
  reporte.fotosBuscadas = `${halladas} de ${faltan.length}`;

  // Videos: últimos días, sin repetir, los más nuevos primero (máximo 8 por canal)
  const limV = Date.now() - DIAS_VIDEOS * 86400000;
  const vm = new Map();
  for (const v of [...yt.videos, ...(previo.videos || [])]) if (new Date(v.fecha).getTime() > limV && !vm.has(v.id)) vm.set(v.id, v);
  const porCanal = {};
  const videos = [...vm.values()].sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
    .filter(v => (porCanal[v.canal] = (porCanal[v.canal] || 0) + 1) <= 8).slice(0, MAX_VIDEOS);

  const contenido = { canales: { ...(previo.canales || {}), ...yt.canales }, noticias, videos };
  reporte.total = `${noticias.length} noticias (${noticias.filter(n => n.imagen).length} con foto), ${videos.length} videos`;
  console.log(JSON.stringify(reporte, null, 1));

  const { actualizado, ...previoSinFecha } = previo;
  if (JSON.stringify(contenido) === JSON.stringify(previoSinFecha)) { console.log('Sin cambios.'); return; }
  await writeFile(ARCHIVO, JSON.stringify({ actualizado: new Date().toISOString(), ...contenido }) + '\n');
  console.log('Guardado.');
}

if (import.meta.url === `file://${process.argv[1]}`) main();
