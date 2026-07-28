#!/usr/bin/env node
/**
 * Parchea index.html y bundled/*.html (los HTML generados por la
 * herramienta de bundles).
 *
 *   node tools/patch-bundles.js [--dry]
 *
 * Anade tres cosas que el generador no pone:
 *   - <html lang="es">   sin esto los lectores de pantalla no saben en
 *                        que idioma leer, y el navegador ofrece traducir
 *   - <title>            la pestana sale sin nombre
 *   - favicon            SVG con PNG de respaldo, ambos como data URI
 *
 * Por que no se puede poner tal cual en el <head> del archivo: el bundle
 * hace document.documentElement.replaceWith(doc.documentElement), o sea
 * sustituye el <html> entero por el que trae dentro. Cualquier cosa que
 * pongas en el head original se descarta al descomprimir. Hay que
 * inyectarlo en la plantilla, que es justo lo que hace este script
 * aprovechando el punto donde el propio bundler inyecta su resourceScript.
 *
 * Es idempotente: aplica solo lo que falte.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DRY = process.argv.includes('--dry');

const svg = fs.readFileSync(path.join(ROOT, 'assets', 'favicon.svg'), 'utf8').trim();
const png = fs.readFileSync(path.join(ROOT, 'assets', 'favicon-64.png')).toString('base64');
const SVG_URI = 'data:image/svg+xml,' + encodeURIComponent(svg);
const PNG_URI = 'data:image/png;base64,' + png;

for (const uri of [SVG_URI, PNG_URI]) {
  if (/['<>]/.test(uri)) { console.error('El data URI del favicon tiene caracteres inseguros.'); process.exit(1); }
}

const ANCLA = `    const headOpen = template.match(/<head[^>]*>/i);
    if (headOpen) {
      const i = headOpen.index + headOpen[0].length;
      template = template.slice(0, i) + resourceScript + template.slice(i);
    }`;

const LANG = `    // El generador no pone lang: sin el, los lectores de pantalla no saben
    // en que idioma leer el contenido.
    template = template.replace(/<html(?![^>]*\\slang=)([^>]*)>/i, '<html lang="es"$1>');
`;

const titulo = (rel) =>
  rel === 'index.html' ? 'Formaciones ONG' : path.basename(rel, '.html');

const objetivos = [
  'index.html',
  ...fs.readdirSync(path.join(ROOT, 'bundled')).filter((f) => f.endsWith('.html')).map((f) => 'bundled/' + f),
];

let tocados = 0, saltados = 0, errores = 0;

for (const rel of objetivos) {
  const file = path.join(ROOT, rel);
  let html = fs.readFileSync(file, 'utf8');
  const original = html;
  const hechos = [];

  const tieneCabecera = html.includes('__pageIcons');
  const tieneLang = html.includes("'<html lang=\"es\"$1>'");

  // --- titulo + favicon (solo si no esta ya)
  if (!tieneCabecera) {
    if (html.split(ANCLA).length - 1 !== 1) {
      console.error(`ERROR ${rel}: no encuentro el punto de inyeccion del bundler.`);
      errores++; continue;
    }
    const bloque =
`    // El swap de documentElement descarta el <head> de este documento, asi que
    // el titulo y el favicon se inyectan en la plantilla junto al resourceScript.
    const __pageIcons =
      '<link rel="icon" type="image/svg+xml" href="${SVG_URI}">' +
      '<link rel="icon" type="image/png" sizes="64x64" href="${PNG_URI}">';
    const __pageTitle = /<title[\\s>]/i.test(template) ? '' : '<title>${titulo(rel)}</title>';

${ANCLA.replace('+ resourceScript +', '+ __pageTitle + __pageIcons + resourceScript +')}`;
    html = html.replace(ANCLA, () => bloque);
    hechos.push('titulo+favicon');
  }

  // --- lang
  if (!tieneLang) {
    const marca = '    const headOpen = template.match(/<head[^>]*>/i);';
    if (!html.includes(marca)) {
      console.error(`ERROR ${rel}: no encuentro donde insertar el lang.`);
      errores++; continue;
    }
    html = html.replace(marca, LANG + marca);
    hechos.push('lang');
  }

  if (!hechos.length) { saltados++; console.log(`=   ${rel.padEnd(42)} ya completo`); continue; }

  if (!DRY) fs.writeFileSync(file, html, 'utf8');
  tocados++;
  console.log(`${DRY ? 'DRY ' : 'OK  '} ${rel.padEnd(42)} ${hechos.join(' + ')}  (+${html.length - original.length} B)`);
}

console.log(`\n${tocados} modificados · ${saltados} ya completos · ${errores} con error`);
process.exit(errores ? 1 : 0);
