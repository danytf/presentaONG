/**
 * Convierte un speech en un documento que no depende de ninguna carpeta:
 * le empotra el CSS con las tipografias en data: URI, el logo de la ONG y
 * resuelve sus enlaces a index.html y a la presentacion, que fuera del
 * sitio no existen.
 *
 * Lo usan tools/empaquetar.js (archivo unico) y tools/empaquetar-sueltos.js
 * (14 ficheros). Vive aparte para que no se separen: si cambia la hoja de
 * estilos o la plantilla, los dos se enteran a la vez.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const MIME = {
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
};

/** assets/<rel> como data: URI. */
function dataUri(rel) {
  const abs = path.join(ROOT, 'assets', rel);
  const ext = path.extname(rel).toLowerCase();
  return `data:${MIME[ext] || 'application/octet-stream'};base64,` +
    fs.readFileSync(abs).toString('base64');
}

/** El CSS de los speeches, con las tipografias ya dentro. */
function cssEmpotrado() {
  return fs.readFileSync(path.join(ROOT, 'assets', 'speech.css'), 'utf8')
    .replace(/url\(['"]?fonts\/([^'")]+)['"]?\)/g,
      (_, f) => `url('${dataUri(path.join('fonts', f))}')`);
}

/**
 * @param {string} html   el speech tal cual sale de build-speeches.js
 * @param {string} css    resultado de cssEmpotrado(), para no releerlo 7 veces
 * @param {object} op
 *   op.volver      'avisar'  -> postMessage al contenedor (archivo unico)
 *                  'quitar'  -> se elimina el enlace (ficheros sueltos)
 *   op.presentacion  ruta nueva para el enlace del pie, o null para quitarlo
 */
function empotrarSpeech(html, css, op = {}) {
  let out = html
    .replace(/<link rel="stylesheet" href="\.\.\/assets\/speech\.css">/,
      `<style>\n${css}\n</style>`)
    .replace(/src="\.\.\/assets\/logos\/([^"]+)"/g,
      (_, f) => `src="${dataUri(path.join('logos', f))}"`)
    .replace(/<link rel="icon"[^>]*>/g, '');

  if (op.volver === 'avisar') {
    out = out.replace(/<a class="volver" href="\.\.\/index\.html">/,
      '<a class="volver" href="#" onclick="try{parent.postMessage(\'paquete:volver\',\'*\')}catch(e){}return false;">');
  } else if (op.volver === 'quitar') {
    // fuera el enlace entero: sin portada al lado, no lleva a ningun sitio
    out = out.replace(/<a class="volver"[\s\S]*?<\/a>\s*/, '');
  }

  if (op.presentacion === null) {
    out = out.replace(/<span>\s*<a href="\.\.\/bundled\/[^"]*">[^<]*<\/a>\s*<\/span>/, '<span></span>');
  } else if (typeof op.presentacion === 'string') {
    out = out.replace(/href="\.\.\/bundled\/[^"]*"/, `href="${op.presentacion}"`);
  }

  return out;
}

/** Avisa si queda alguna referencia a una carpeta que ya no estara. */
function referenciasColgadas(html) {
  return [...html.matchAll(/(?:src|href)="(\.\.?\/[^"]+)"/g)].map((m) => m[1]);
}

module.exports = { dataUri, cssEmpotrado, empotrarSpeech, referenciasColgadas };
