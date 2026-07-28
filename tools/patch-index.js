#!/usr/bin/env node
/**
 * Adapta la portada (index.html):
 *
 *   1. Cada ONG pasa a tener dos enlaces: "Ver presentación" y "Ver speech".
 *   2. La portada se vuelve utilizable en movil.
 *
 *   node tools/patch-index.js [--dry]
 *
 * index.html es un bundle: el HTML vive dentro del JSON de
 * <script type="__bundler/template">, no suelto en el documento. Por eso
 * hay que deserializar, transformar y volver a serializar.
 *
 * Sobre lo de movil: la portada venia con medidas fijas (h1 de 56px, logo
 * de 180px, padding de 64px) sin ninguna media query. En un movil de
 * 390px la pagina se maquetaba a 631px y el titulo salia cortado. Como
 * el generador lo pone todo en atributos style, las reglas responsive
 * necesitan !important para poder ganarles.
 *
 * Es idempotente: las tarjetas solo se reescriben una vez y el bloque de
 * CSS se reemplaza entero en cada pasada.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'index.html');
const DRY = process.argv.includes('--dry');

const SPEECH = {
  'Formación AECC.html':              'speechs/speech_aecc.html',
  'Formación Aldeas Infantiles.html': 'speechs/speech_aldeas.html',
  'Formación Cruz Roja.html':         'speechs/speech_cruzroja.html',
  'Formación FEC.html':               'speechs/speech_fec.html',
  'Formación FJC.html':               'speechs/speech_fjc.html',
  'Formación FPM.html':               'speechs/speech_fpm.html',
  'Formación WWF.html':               'speechs/speech_wwf.html',
};

// Marcas de estilo del generador -> clase con la que engancharlas.
const CLASES = [
  ['pagina',      'style="min-height:100vh;font-family:\'Public Sans\',sans-serif;background:var(--paper-2);padding:80px 64px 100px;"'],
  ['cabecera',    'style="display:flex;align-items:flex-start;justify-content:space-between;gap:32px;"'],
  ['logo-wesser', 'style="flex-shrink:0;margin-top:-16px;"'],
  ['rejilla',     'style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:28px;margin-top:56px;"'],
];

const INICIO = '/* wesser:portada:inicio */';
const FIN = '/* wesser:portada:fin */';

const CSS = `${INICIO}
.ficha{transition:transform .2s ease,box-shadow .2s ease;}
.ficha:hover{transform:translateY(-4px);box-shadow:var(--shadow-card-hover);}
.acciones{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px;}
.acciones a{display:inline-flex;align-items:center;gap:7px;font-family:'Public Sans',sans-serif;font-weight:700;font-size:14.5px;line-height:1;text-decoration:none;padding:12px 18px;border-radius:999px;border:1px solid transparent;transition:background .15s ease,color .15s ease,border-color .15s ease;}
.acciones a.principal{background:var(--acento);color:#fff;}
.acciones a.principal:hover{background:color-mix(in srgb,var(--acento) 85%,#000);}
.acciones a.secundaria{color:var(--acento);border-color:color-mix(in srgb,var(--acento) 32%,var(--border));background:var(--paper);}
.acciones a.secundaria:hover{background:color-mix(in srgb,var(--acento) 9%,var(--paper));border-color:var(--acento);}
.acciones a:focus-visible{outline:2px solid var(--ink);outline-offset:2px;}

/* La portada venia con medidas fijas y sin media queries: en un movil de
   390px se maquetaba a 631px y el titulo salia cortado. El !important es
   necesario porque el generador escribe todo en atributos style. */
.cabecera>div{min-width:0;}
.cabecera h1{font-size:clamp(30px,6.4vw,56px)!important;}
@media (max-width:900px){
  .pagina{padding:52px 28px 68px!important;}
  .cabecera{flex-wrap:wrap!important;gap:24px!important;}
  .logo-wesser{margin-top:0!important;}
  .logo-wesser img{height:104px!important;}
  .rejilla{grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr))!important;margin-top:44px!important;}
}
@media (max-width:560px){
  .pagina{padding:34px 20px 52px!important;}
  .logo-wesser img{height:76px!important;}
  .rejilla{gap:18px!important;margin-top:34px!important;}
  .acciones a{flex:1 1 100%;justify-content:center;}
}
${FIN}`;

/* ------------------------------------------------------------------ */

const html = fs.readFileSync(FILE, 'utf8');
const OPEN = '<script type="__bundler/template">';
const i = html.indexOf(OPEN);
if (i < 0) { console.error('No se encontro el bloque de plantilla.'); process.exit(1); }
const j = html.indexOf('</script>', i);

let tpl = JSON.parse(html.slice(i + OPEN.length, j));
const hechos = [];

/* --- 1. tarjetas con dos enlaces ---------------------------------- */

if (tpl.includes('class="ficha"')) {
  hechos.push('tarjetas: ya estaban');
} else {
  let n = 0;
  const fallidas = [];
  tpl = tpl.replace(/<a href="bundled\/([^"]+)"([^>]*)>([\s\S]*?)<\/a>/g, (todo, archivo, attrs, dentro) => {
    const speech = SPEECH[decodeURIComponent(archivo)];
    if (!speech) { fallidas.push(archivo); return todo; }

    const estilo = (attrs.match(/\sstyle="([^"]*)"/) || [])[1] || '';
    const acento = (dentro.match(/color:(#[0-9a-fA-F]{3,8});margin-top:6px;">\s*Ver formación/) || [])[1] || 'var(--ink)';

    const cuerpo = dentro.replace(
      /<div style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:15px;color:#[0-9a-fA-F]{3,8};margin-top:6px;">\s*Ver formación\s*<span>→<\/span><\/div>/,
      '<div class="acciones">' +
      `<a class="principal" href="bundled/${archivo}">Ver presentación <span aria-hidden="true">→</span></a>` +
      `<a class="secundaria" href="${speech}">Ver speech <span aria-hidden="true">→</span></a>` +
      '</div>'
    );
    if (cuerpo === dentro) { fallidas.push(archivo + ' (fila "Ver formación")'); return todo; }
    n++;
    return `<div class="ficha" style="${estilo}--acento:${acento};">${cuerpo}</div>`;
  });

  if (fallidas.length) { console.error('NO reescritas: ' + fallidas.join(', ')); process.exit(1); }
  hechos.push(`tarjetas reescritas: ${n}/7`);
  if (n !== 7) { console.error('Se esperaban 7 tarjetas.'); process.exit(1); }
}

/* --- 2. clases para poder enganchar el CSS ------------------------- */

for (const [clase, marca] of CLASES) {
  if (tpl.includes(`class="${clase}"`)) continue;
  if (!tpl.includes(marca)) {
    console.error(`ERROR: no encuentro el elemento para la clase "${clase}".`);
    console.error(`       buscaba: ${marca.slice(0, 80)}…`);
    process.exit(1);
  }
  tpl = tpl.replace(marca, `class="${clase}" ${marca}`);
  hechos.push(`clase .${clase}`);
}

/* --- 3. bloque de CSS (se reemplaza entero) ------------------------ */

const a = tpl.indexOf(INICIO), b = tpl.indexOf(FIN);
if (a >= 0 && b > a) {
  tpl = tpl.slice(0, a) + CSS + tpl.slice(b + FIN.length);
  hechos.push('CSS actualizado');
} else {
  const cierre = tpl.lastIndexOf('</style>');
  if (cierre < 0) { console.error('No se encontro el <style> de la plantilla.'); process.exit(1); }
  tpl = tpl.slice(0, cierre) + '\n' + CSS + '\n' + tpl.slice(cierre);
  hechos.push('CSS insertado');
}

/* --- 4. reserializar ---------------------------------------------- */

const serial = JSON.stringify(tpl).replace(/<\//g, '<\\/');
const salida = html.slice(0, i + OPEN.length) + serial + html.slice(j);

if (JSON.parse(salida.slice(i + OPEN.length, salida.indexOf('</script>', i))) !== tpl) {
  console.error('La reserializacion no cuadra. Abortado sin escribir.');
  process.exit(1);
}

hechos.forEach((h) => console.log('  · ' + h));
if (DRY) {
  console.log(`(dry) ${html.length} -> ${salida.length} bytes`);
} else {
  fs.writeFileSync(FILE, salida, 'utf8');
  console.log(`index.html actualizado: ${html.length} -> ${salida.length} bytes`);
}
