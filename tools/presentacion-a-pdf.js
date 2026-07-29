#!/usr/bin/env node
/**
 * Convierte una presentacion a PDF respetando su formato de diapositiva.
 *
 *   node tools/presentacion-a-pdf.js aecc     una
 *   node tools/presentacion-a-pdf.js          las siete
 *
 * Deja los archivos en dist/pdf/.
 *
 * REQUIERE PLAYWRIGHT (igual que tools/a-pdf.js):
 *   npm install -D playwright && npx playwright install chromium
 *
 * POR QUE ASI Y NO DE OTRA MANERA
 *
 * Las presentaciones son un pase de diapositivas de 1440x900: todas las
 * laminas estan en el DOM pero solo se ve una, y se avanza con la flecha
 * derecha. No se ocultan con display:none, asi que no hay forma fiable de
 * mostrarlas todas a la vez para imprimirlas de golpe.
 *
 * Se recorren con la flecha y se captura cada una. El resultado es un PDF
 * de paginas apaisadas con la proporcion exacta de la diapositiva (16:10),
 * una lamina por pagina.
 *
 * Contrapartida: el texto va como imagen, no se puede seleccionar ni
 * buscar. Es lo normal en un pase exportado asi, y a cambio el resultado
 * es identico a lo que se ve en pantalla. Los speeches, que si llevan
 * texto real, se generan con tools/a-pdf.js.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BUNDLED = path.join(ROOT, 'bundled');
const DIST = path.join(ROOT, 'dist', 'pdf');

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) {
  console.error('Falta playwright, que es lo que genera el PDF.\n');
  console.error('  npm install -D playwright');
  console.error('  npx playwright install chromium\n');
  process.exit(1);
}

const ONGS = {
  aecc: ['AECC', 'Formación AECC.html'],
  aldeas: ['Aldeas Infantiles', 'Formación Aldeas Infantiles.html'],
  cruzroja: ['Cruz Roja', 'Formación Cruz Roja.html'],
  fec: ['FEC', 'Formación FEC.html'],
  fjc: ['FJC', 'Formación FJC.html'],
  fpm: ['FPM', 'Formación FPM.html'],
  wwf: ['WWF', 'Formación WWF.html'],
};

const ANCHO = 1440, ALTO = 900;   // el tamaño nativo de la diapositiva
const MAX_LAMINAS = 60;           // tope de seguridad por si el pase da la vuelta

const soloEste = process.argv[2];
const elegidos = Object.entries(ONGS).filter(([s]) => !soloEste || s === soloEste);
if (!elegidos.length) {
  console.error(`No conozco "${soloEste}". Opciones: ${Object.keys(ONGS).join(', ')}`);
  process.exit(1);
}

fs.mkdirSync(DIST, { recursive: true });

const texto = (page) =>
  page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').trim());

/** Espera a que el texto deje de cambiar: la transicion ha terminado. */
async function asentar(page) {
  let anterior = await texto(page);
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(220);
    const ahora = await texto(page);
    if (ahora === anterior) return ahora;
    anterior = ahora;
  }
  return anterior;
}

/**
 * Recorre el pase y devuelve una captura por lamina.
 *
 * Se guia por el TEXTO, no por la imagen: durante una transicion dos
 * fotogramas seguidos son visualmente distintos aunque sean la misma
 * lamina, y comparando capturas salia una pagina duplicada.
 */
async function capturar(page) {
  const laminas = [];
  let actual = await asentar(page);

  for (let i = 0; i < MAX_LAMINAS; i++) {
    laminas.push(await page.screenshot({ type: 'jpeg', quality: 92 }));

    await page.keyboard.press('ArrowRight');
    const siguiente = await asentar(page);

    // si el texto no cambia, el pase ha terminado
    if (siguiente === actual) break;
    actual = siguiente;
  }
  return laminas;
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  for (const [slug, [nombre, archivo]] of elegidos) {
    const origen = path.join(BUNDLED, archivo);
    if (!fs.existsSync(origen)) { console.error(`  FALLA ${nombre}: falta ${archivo}`); continue; }

    const page = await browser.newPage({
      viewport: { width: ANCHO, height: ALTO }, deviceScaleFactor: 2,
    });
    await page.goto('file:///' + origen.replace(/\\/g, '/').replace(/ /g, '%20'),
      { waitUntil: 'load', timeout: 120000 });
    await page.waitForSelector('#__bundler_thumbnail', { state: 'detached', timeout: 120000 }).catch(() => {});
    await page.waitForTimeout(2500);

    const laminas = await capturar(page);
    await page.close();

    // una imagen por pagina, a sangre y con el tamaño exacto de la diapositiva
    const paginas = laminas.map((b) =>
      `<div class="l"><img src="data:image/jpeg;base64,${b.toString('base64')}"></div>`).join('\n');

    const montaje = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      @page { size: ${ANCHO}px ${ALTO}px; margin: 0; }
      html,body { margin:0; padding:0; background:#fff; }
      .l { width:${ANCHO}px; height:${ALTO}px; overflow:hidden; break-after:page; }
      .l:last-child { break-after:auto; }
      .l img { width:100%; height:100%; display:block; object-fit:cover; }
    </style></head><body>${paginas}</body></html>`;

    const hoja = await browser.newPage();
    await hoja.setContent(montaje, { waitUntil: 'load', timeout: 120000 });
    await hoja.emulateMedia({ media: 'print' });

    const destino = path.join(DIST, `${nombre} - Presentación.pdf`);
    await hoja.pdf({
      path: destino, width: `${ANCHO}px`, height: `${ALTO}px`,
      printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 },
      pageRanges: `1-${laminas.length}`,
    });
    await hoja.close();

    const buf = fs.readFileSync(destino);
    const pags = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    console.log(`  ok  ${(nombre + ' - Presentación.pdf').padEnd(38)} ${String(laminas.length).padStart(2)} láminas` +
                ` -> ${String(pags).padStart(2)} pág   ${(buf.length / 1024 / 1024).toFixed(1)} MB`);
  }

  await browser.close();
  console.log(`\n-> ${path.relative(ROOT, DIST)}`);
})();
