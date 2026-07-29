#!/usr/bin/env node
/**
 * Convierte los speeches a PDF, listos para imprimir o repartir.
 *
 *   node tools/a-pdf.js          los siete
 *   node tools/a-pdf.js aecc     solo uno
 *
 * Deja los archivos en dist/pdf/.
 *
 * REQUIERE PLAYWRIGHT. Es la unica herramienta del proyecto con
 * dependencias: generar un PDF necesita un navegador de verdad. Si no
 * esta instalado:
 *
 *   npm install -D playwright
 *   npx playwright install chromium
 *
 * Parte de dist/sueltos/, que ya lleva las tipografias dentro. Si esa
 * carpeta no existe, la genera antes.
 *
 * El resultado usa la hoja de impresion que ya traen los speeches: sin
 * barra superior ni navegador de secciones, el encabezado en blanco en
 * vez de la banda de color, y los bloques sin partirse entre paginas.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SUELTOS = path.join(ROOT, 'dist', 'sueltos');
const DIST = path.join(ROOT, 'dist', 'pdf');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  console.error('Falta playwright, que es lo que genera el PDF.\n');
  console.error('  npm install -D playwright');
  console.error('  npx playwright install chromium\n');
  process.exit(1);
}

const ONGS = {
  aecc: 'AECC', aldeas: 'Aldeas Infantiles', cruzroja: 'Cruz Roja',
  fec: 'FEC', fjc: 'FJC', fpm: 'FPM', wwf: 'WWF',
};

const soloEste = process.argv[2];
const elegidos = Object.entries(ONGS).filter(([slug]) => !soloEste || slug === soloEste);
if (!elegidos.length) {
  console.error(`No conozco "${soloEste}". Opciones: ${Object.keys(ONGS).join(', ')}`);
  process.exit(1);
}

// los sueltos son la fuente: ya tienen las fuentes empotradas
if (!fs.existsSync(SUELTOS)) {
  console.log('No hay dist/sueltos, lo genero primero...\n');
  execFileSync(process.execPath, [path.join(__dirname, 'empaquetar-sueltos.js')], { stdio: 'inherit' });
}

fs.mkdirSync(DIST, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  let fallos = 0;

  for (const [slug, nombre] of elegidos) {
    const origen = path.join(SUELTOS, `${nombre} - Speech.html`);
    if (!fs.existsSync(origen)) {
      console.error(`  FALLA ${nombre}: no existe ${path.basename(origen)}`);
      fallos++; continue;
    }

    const page = await browser.newPage();
    await page.goto('file:///' + origen.replace(/\\/g, '/').replace(/ /g, '%20'),
      { waitUntil: 'load', timeout: 90000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(800);
    await page.emulateMedia({ media: 'print' });

    const destino = path.join(DIST, `${nombre} - Speech.pdf`);
    await page.pdf({
      path: destino,
      format: 'A4',
      printBackground: true,
      margin: { top: '16mm', bottom: '16mm', left: '16mm', right: '16mm' },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate:
        `<div style="width:100%;font:9px Helvetica,sans-serif;color:#928d81;` +
        `padding:0 16mm;display:flex;justify-content:space-between">` +
        `<span>Speech ${nombre} · Departamento de Formación Wesser</span>` +
        `<span><span class="pageNumber"></span>/<span class="totalPages"></span></span></div>`,
    });
    await page.close();

    const buf = fs.readFileSync(destino);
    const paginas = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    console.log(`  ok  ${(nombre + ' - Speech.pdf').padEnd(34)} ${String(paginas).padStart(2)} pag  ` +
                `${(buf.length / 1024).toFixed(0).padStart(4)} KB`);
  }

  await browser.close();
  console.log(`\n-> ${path.relative(ROOT, DIST)}`);
  if (fallos) process.exit(1);
})();
