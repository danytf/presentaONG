#!/usr/bin/env node
/**
 * Genera los 14 documentos como ficheros HTML independientes.
 *
 *   node tools/empaquetar-sueltos.js
 *
 * Deja en dist/sueltos/ un archivo por ONG y tipo:
 *
 *   AECC - Formacion.html      AECC - Speech.html
 *   Aldeas Infantiles - ...    ... y asi hasta 14
 *
 * Cada uno se abre solo, con doble clic, sin servidor ni internet y sin
 * depender de ninguna carpeta: las fuentes, los logos y los estilos van
 * dentro. Se pueden repartir sueltos, uno a uno, a quien haga falta.
 *
 * Las presentaciones ya venian autocontenidas del generador original, asi
 * que se copian tal cual. El trabajo esta en los speeches, que leian sus
 * tipografias de assets/.
 *
 * Si los 14 se dejan en la misma carpeta, el pie de cada speech enlaza con
 * su presentacion. Si se reparten sueltos, ese enlace no llevara a ningun
 * sitio: es el unico precio de que sean independientes.
 */

const fs = require('fs');
const path = require('path');
const { cssEmpotrado, empotrarSpeech, referenciasColgadas } = require('./lib-empotrar');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist', 'sueltos');

// slug del speech -> [nombre para el archivo, nombre del bundle original]
const ONGS = {
  aecc:     ['AECC',              'Formación AECC.html'],
  aldeas:   ['Aldeas Infantiles', 'Formación Aldeas Infantiles.html'],
  cruzroja: ['Cruz Roja',         'Formación Cruz Roja.html'],
  fec:      ['FEC',               'Formación FEC.html'],
  fjc:      ['FJC',               'Formación FJC.html'],
  fpm:      ['FPM',               'Formación FPM.html'],
  wwf:      ['WWF',               'Formación WWF.html'],
};

const kb = (n) => (n / 1024).toFixed(0).padStart(5) + ' KB';

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

const css = cssEmpotrado();
let total = 0, errores = 0;

for (const [slug, [nombre, bundle]] of Object.entries(ONGS)) {
  /* --- la presentacion: ya es autocontenida, se copia --- */
  const origenPres = path.join(ROOT, 'bundled', bundle);
  if (!fs.existsSync(origenPres)) {
    console.error(`ERROR: falta ${bundle}`); errores++; continue;
  }
  const pres = fs.readFileSync(origenPres, 'utf8');
  const nomPres = `${nombre} - Formación.html`;
  fs.writeFileSync(path.join(DIST, nomPres), pres, 'utf8');

  /* --- el speech: hay que empotrarle todo --- */
  const origenSpeech = path.join(ROOT, 'speechs', `speech_${slug}.html`);
  if (!fs.existsSync(origenSpeech)) {
    console.error(`ERROR: falta speech_${slug}.html`); errores++; continue;
  }
  const speech = empotrarSpeech(fs.readFileSync(origenSpeech, 'utf8'), css, {
    volver: 'quitar',                             // no hay portada al lado
    presentacion: encodeURIComponent(nomPres),    // el hermano, si viajan juntos
  });
  const nomSpeech = `${nombre} - Speech.html`;
  fs.writeFileSync(path.join(DIST, nomSpeech), speech, 'utf8');

  /* --- que no quede nada apuntando fuera --- */
  for (const [n, h] of [[nomPres, pres], [nomSpeech, speech]]) {
    const fuera = referenciasColgadas(h).filter((r) => !r.startsWith('./'));
    if (fuera.length) {
      console.error(`  AVISO ${n}: apunta fuera -> ${[...new Set(fuera)].slice(0, 3).join(', ')}`);
      errores++;
    }
  }

  total += Buffer.byteLength(pres) + Buffer.byteLength(speech);
  console.log(`  ${nomPres.padEnd(34)} ${kb(Buffer.byteLength(pres))}` +
              `     ${nomSpeech.padEnd(32)} ${kb(Buffer.byteLength(speech))}`);
}

const n = fs.readdirSync(DIST).length;
console.log(`\n${n} ficheros en ${path.relative(ROOT, DIST)}   ${(total / 1024 / 1024).toFixed(1)} MB en total`);
if (errores) { console.error(`\n${errores} problema(s).`); process.exit(1); }
