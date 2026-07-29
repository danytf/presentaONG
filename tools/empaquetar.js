#!/usr/bin/env node
/**
 * Empaqueta todo el sitio en UN SOLO .html que se abre con doble clic.
 *
 *   node tools/empaquetar.js
 *
 * Genera dist/Formaciones ONG.html (~11 MB) con la portada, las 7
 * presentaciones y los 7 speeches dentro. No necesita servidor, ni
 * internet, ni que se conserve ninguna carpeta: es un unico archivo.
 *
 * Pensado para repartirlo por Teams, correo o USB, y para maquinas donde
 * nadie va a descomprimir un ZIP con cuidado.
 *
 * COMO FUNCIONA
 *
 * El armazon es index.html, que ya es un bundle que se descomprime solo.
 * Los 14 documentos se guardan como JSON en <script> del documento
 * exterior, y un pequeño runtime los lee ANTES de que el bundler haga su
 * document.documentElement.replaceWith(), que destruiria esas etiquetas.
 * Lo leido queda en window, que sobrevive al cambio.
 *
 * Al pulsar una tarjeta, el runtime crea un Blob con el documento y lo
 * abre en un <iframe> a pantalla completa con una barra de "volver". El
 * listener de clic va en document -no en documentElement-, por eso
 * tambien sobrevive al cambio.
 *
 * Los speeches leen sus fuentes y estilos de assets/, que dentro de un
 * archivo unico no existe: se les empotra el CSS con las tipografias en
 * data: URI y el logo, y su enlace de vuelta pasa a avisar al contenedor.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SALIDA = path.join(DIST, 'Formaciones ONG.html');

const leer = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const mb = (n) => (n / 1024 / 1024).toFixed(1) + ' MB';

/* ------------------------------------------------- speeches autocontenidos */

const MIME = { '.woff2': 'font/woff2', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

function dataUri(rel) {
  const abs = path.join(ROOT, 'assets', rel);
  const ext = path.extname(rel).toLowerCase();
  return `data:${MIME[ext] || 'application/octet-stream'};base64,` +
    fs.readFileSync(abs).toString('base64');
}

/** El CSS de los speeches, con las tipografias empotradas. */
function cssEmpotrado() {
  return leer('assets', 'speech.css').replace(
    /url\(['"]?fonts\/([^'")]+)['"]?\)/g,
    (_, f) => `url('${dataUri(path.join('fonts', f))}')`
  );
}

/** Convierte un speech en un documento que no depende de ninguna carpeta. */
function empotrarSpeech(html, css) {
  return html
    // la hoja de estilos, con las fuentes ya dentro
    .replace(/<link rel="stylesheet" href="\.\.\/assets\/speech\.css">/,
      `<style>\n${css}\n</style>`)
    // el logo de la ONG
    .replace(/src="\.\.\/assets\/logos\/([^"]+)"/g,
      (_, f) => `src="${dataUri(path.join('logos', f))}"`)
    // el favicon no pinta nada dentro de un marco
    .replace(/<link rel="icon"[^>]*>/g, '')
    // el enlace de vuelta avisa al contenedor en vez de navegar
    .replace(/<a class="volver" href="\.\.\/index\.html">/,
      '<a class="volver" href="#" onclick="try{parent.postMessage(\'paquete:volver\',\'*\')}catch(e){}return false;">');
}

/* ------------------------------------------------------------ el runtime */

const RUNTIME = String.raw`
(function () {
  // Se lee el almacen AHORA, durante el parseo: el bundler de la portada
  // sustituye el <html> entero y se llevaria por delante estas etiquetas.
  var docs = {};
  var nodos = document.querySelectorAll('script[type="application/json"][data-doc]');
  for (var i = 0; i < nodos.length; i++) {
    docs[nodos[i].getAttribute('data-doc')] = JSON.parse(nodos[i].textContent);
  }
  window.__paquete = docs;

  var capa = null, url = null;

  function cerrar() {
    if (!capa) return;
    capa.remove(); capa = null;
    if (url) { URL.revokeObjectURL(url); url = null; }
    document.documentElement.style.overflow = '';
  }

  function abrir(html, titulo) {
    cerrar();
    url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));

    capa = document.createElement('div');
    capa.setAttribute('style', 'position:fixed;inset:0;z-index:2147483647;' +
      'background:#F3F0E6;display:flex;flex-direction:column');

    var barra = document.createElement('div');
    barra.setAttribute('style', 'flex:0 0 auto;display:flex;align-items:center;gap:14px;' +
      'padding:10px 18px;background:#26251f;color:#fff;' +
      "font:600 14px/1.4 'Public Sans',-apple-system,BlinkMacSystemFont,sans-serif");

    var volver = document.createElement('button');
    volver.textContent = '← Volver';
    volver.setAttribute('style', 'cursor:pointer;border:0;border-radius:999px;' +
      'padding:8px 16px;background:#fff;color:#26251f;font:inherit');
    volver.onclick = cerrar;

    var nombre = document.createElement('span');
    nombre.textContent = titulo || '';
    nombre.setAttribute('style', 'opacity:.75');

    barra.appendChild(volver);
    barra.appendChild(nombre);

    var marco = document.createElement('iframe');
    marco.setAttribute('style', 'flex:1 1 auto;width:100%;border:0');
    marco.src = url;

    capa.appendChild(barra);
    capa.appendChild(marco);
    document.body.appendChild(capa);
    document.documentElement.style.overflow = 'hidden';
  }

  // En document, no en documentElement: asi sobrevive al cambio del bundler.
  document.addEventListener('click', function (e) {
    var n = e.target;
    while (n && n.nodeType === 1 && n.tagName !== 'A') n = n.parentNode;
    if (!n || n.nodeType !== 1) return;

    var href = n.getAttribute('href') || '';
    var doc = window.__paquete[href];
    if (!doc) { try { doc = window.__paquete[decodeURIComponent(href)]; } catch (x) {} }
    if (!doc) return;

    e.preventDefault();
    abrir(doc, n.textContent.replace(/\s+/g, ' ').trim().replace(/\s*→$/, ''));
  }, true);

  window.addEventListener('message', function (e) {
    if (e.data === 'paquete:volver') cerrar();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') cerrar();
  });
})();
`;

/* ------------------------------------------------------------------ build */

const css = cssEmpotrado();
const documentos = {};

for (const f of fs.readdirSync(path.join(ROOT, 'bundled')).filter((x) => x.endsWith('.html'))) {
  documentos[`bundled/${f}`] = leer('bundled', f);
}
for (const f of fs.readdirSync(path.join(ROOT, 'speechs')).filter((x) => x.endsWith('.html'))) {
  documentos[`speechs/${f}`] = empotrarSpeech(leer('speechs', f), css);
}

// comprobacion: que no quede ninguna referencia a la carpeta assets
const colgados = Object.entries(documentos)
  .filter(([, h]) => /\.\.\/assets\//.test(h))
  .map(([k]) => k);
if (colgados.length) {
  console.error('ERROR: estos documentos siguen apuntando a assets/:');
  colgados.forEach((k) => console.error('  ' + k));
  process.exit(1);
}

const almacen = Object.entries(documentos).map(([clave, html]) =>
  `<script type="application/json" data-doc="${clave.replace(/"/g, '&quot;')}">` +
  JSON.stringify(html).replace(/<\//g, '<\\/') +
  '</' + 'script>'
).join('\n');

let salida = leer('index.html');
const cierre = salida.lastIndexOf('</body>');
if (cierre < 0) { console.error('ERROR: index.html no tiene </body>.'); process.exit(1); }

salida = salida.slice(0, cierre) +
  '\n<!-- documentos empaquetados -->\n' + almacen +
  '\n<script>' + RUNTIME + '</' + 'script>\n' +
  salida.slice(cierre);

fs.mkdirSync(DIST, { recursive: true });
fs.writeFileSync(SALIDA, salida, 'utf8');

console.log(`${Object.keys(documentos).length} documentos empaquetados:`);
for (const [k, v] of Object.entries(documentos)) {
  console.log(`  ${k.padEnd(42)} ${(Buffer.byteLength(v) / 1024).toFixed(0).padStart(5)} KB`);
}
console.log(`\n-> ${path.relative(ROOT, SALIDA)}   ${mb(Buffer.byteLength(salida))}`);
