#!/usr/bin/env node
/**
 * Reescribe las tarjetas de index.html para que cada ONG tenga dos
 * enlaces: "Ver presentación" y "Ver speech".
 *
 *   node tools/patch-index.js [--dry]
 *
 * index.html es un bundle: el HTML de las tarjetas vive dentro del JSON
 * de <script type="__bundler/template">, no suelto en el documento. Por
 * eso hay que deserializar, transformar y volver a serializar.
 *
 * Cada tarjeta era un unico <a> envolviendo todo. Como no se pueden
 * anidar enlaces, pasa a ser un <div> con los dos <a> dentro.
 *
 * Es idempotente: si ya esta parcheado, no hace nada.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'index.html');
const DRY = process.argv.includes('--dry');

// presentacion -> pagina de speech
const SPEECH = {
  'Formación AECC.html':               'speechs/speech_aecc.html',
  'Formación Aldeas Infantiles.html':  'speechs/speech_aldeas.html',
  'Formación Cruz Roja.html':          'speechs/speech_cruzroja.html',
  'Formación FEC.html':                'speechs/speech_fec.html',
  'Formación FJC.html':                'speechs/speech_fjc.html',
  'Formación FPM.html':                'speechs/speech_fpm.html',
  'Formación WWF.html':                'speechs/speech_wwf.html',
};

const CSS = `
.ficha{transition:transform .2s ease,box-shadow .2s ease;}
.ficha:hover{transform:translateY(-4px);box-shadow:var(--shadow-card-hover);}
.acciones{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px;}
.acciones a{display:inline-flex;align-items:center;gap:7px;font-family:'Public Sans',sans-serif;font-weight:700;font-size:14.5px;line-height:1;text-decoration:none;padding:11px 17px;border-radius:999px;border:1px solid transparent;transition:background .15s ease,color .15s ease,border-color .15s ease;}
.acciones a.principal{background:var(--acento);color:#fff;}
.acciones a.principal:hover{background:color-mix(in srgb,var(--acento) 85%,#000);}
.acciones a.secundaria{color:var(--acento);border-color:color-mix(in srgb,var(--acento) 32%,var(--border));background:var(--paper);}
.acciones a.secundaria:hover{background:color-mix(in srgb,var(--acento) 9%,var(--paper));border-color:var(--acento);}
.acciones a:focus-visible{outline:2px solid var(--ink);outline-offset:2px;}
@media (max-width:400px){.acciones a{flex:1 1 100%;justify-content:center;}}
`.trim();

/* ------------------------------------------------------------------ */

const html = fs.readFileSync(FILE, 'utf8');
const OPEN = '<script type="__bundler/template">';
const i = html.indexOf(OPEN);
if (i < 0) { console.error('No se encontro el bloque de plantilla.'); process.exit(1); }
const j = html.indexOf('</script>', i);

let tpl = JSON.parse(html.slice(i + OPEN.length, j));

if (tpl.includes('class="ficha"')) {
  console.log('index.html ya esta parcheado. Nada que hacer.');
  process.exit(0);
}

let n = 0;
const noEncontrados = [];

// Cada tarjeta: <a href="bundled/…"> … </a>  (sin enlaces anidados dentro)
tpl = tpl.replace(/<a href="bundled\/([^"]+)"([^>]*)>([\s\S]*?)<\/a>/g, (todo, archivo, attrs, dentro) => {
  const speech = SPEECH[decodeURIComponent(archivo)];
  if (!speech) { noEncontrados.push(archivo); return todo; }

  const estilo = (attrs.match(/\sstyle="([^"]*)"/) || [])[1] || '';
  // el acento estaba en la fila "Ver formación"; pasa a variable de la tarjeta
  const acento = (dentro.match(/color:(#[0-9a-fA-F]{3,8});margin-top:6px;">\s*Ver formación/) || [])[1] || 'var(--ink)';

  const cuerpo = dentro.replace(
    /<div style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:15px;color:#[0-9a-fA-F]{3,8};margin-top:6px;">\s*Ver formación\s*<span>→<\/span><\/div>/,
    `<div class="acciones">` +
    `<a class="principal" href="bundled/${archivo}">Ver presentación <span aria-hidden="true">→</span></a>` +
    `<a class="secundaria" href="${speech}">Ver speech <span aria-hidden="true">→</span></a>` +
    `</div>`
  );

  if (cuerpo === dentro) { noEncontrados.push(archivo + ' (fila "Ver formación")'); return todo; }

  n++;
  return `<div class="ficha" style="${estilo}--acento:${acento};">${cuerpo}</div>`;
});

// CSS de las tarjetas al final del <style> de la plantilla
const cierre = tpl.lastIndexOf('</style>');
if (cierre < 0) { console.error('No se encontro el bloque <style> de la plantilla.'); process.exit(1); }
tpl = tpl.slice(0, cierre) + '\n' + CSS + '\n' + tpl.slice(cierre);

console.log(`tarjetas reescritas: ${n}/7`);
if (noEncontrados.length) {
  console.error('NO reescritas: ' + noEncontrados.join(', '));
  process.exit(1);
}

// Reserializar. El "\/" evita que un "</" corte el <script> antes de tiempo.
const serial = JSON.stringify(tpl).replace(/<\//g, '<\\/');
const salida = html.slice(0, i + OPEN.length) + serial + html.slice(j);

// comprobacion: el JSON reinsertado tiene que volver a parsear igual
if (JSON.parse(salida.slice(i + OPEN.length, salida.indexOf('</script>', i))) !== tpl) {
  console.error('La reserializacion no cuadra. Abortado sin escribir.');
  process.exit(1);
}

if (DRY) {
  console.log(`(dry) index.html ${html.length} -> ${salida.length} bytes (${salida.length - html.length >= 0 ? '+' : ''}${salida.length - html.length})`);
} else {
  fs.writeFileSync(FILE, salida, 'utf8');
  console.log(`index.html actualizado: ${html.length} -> ${salida.length} bytes`);
}
