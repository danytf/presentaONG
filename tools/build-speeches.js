#!/usr/bin/env node
/**
 * Genera speechs/*.html a partir de speechs/*.md
 *
 *   node tools/build-speeches.js
 *
 * Los .md son la fuente. Este script se puede relanzar cuantas veces
 * haga falta: reescribe los .html por completo.
 *
 * El Markdown de los speeches usa un subconjunto acotado (encabezados,
 * ---, citas, listas, tablas, negrita y cursiva), asi que el conversor
 * cubre exactamente eso y avisa si aparece algo que no reconoce.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'speechs');

/* ------------------------------------------------------------------ datos */

const ONGS = {
  aecc:     { nombre: 'AECC',                  completo: 'Asociación Española Contra el Cáncer', band: '#0d2f18', accent: '#149133', logo: 'aecc.png',     pres: 'Formación AECC.html' },
  aldeas:   { nombre: 'Aldeas Infantiles SOS', completo: 'Aldeas Infantiles SOS',                band: '#0a1e2e', accent: '#222D6B', logo: 'aldeas.png',   pres: 'Formación Aldeas Infantiles.html' },
  cruzroja: { nombre: 'Cruz Roja',             completo: 'Cruz Roja Española',                   band: '#011E41', accent: '#CC0A16', logo: 'cruzroja.png', pres: 'Formación Cruz Roja.html' },
  fec:      { nombre: 'FEC',                   completo: 'Fundación Española del Corazón',       band: '#1c0a12', accent: '#990033', logo: 'fec.png',      pres: 'Formación FEC.html' },
  fjc:      { nombre: 'FJC',                   completo: 'Fundación Josep Carreras',             band: '#180a02', accent: '#A64400', logo: 'fjc.png',      pres: 'Formación FJC.html' },
  fpm:      { nombre: 'FPM',                   completo: 'Fundación Pasqual Maragall',           band: '#4C7A28', accent: '#3F6620', logo: 'fpm.png',      pres: 'Formación FPM.html' },
  wwf:      { nombre: 'WWF',                   completo: 'WWF España',                           band: '#0F2E1F', accent: '#C96600', logo: 'wwf.png',      pres: 'Formación WWF.html' },
};

// Etiqueta corta para el navegador de secciones.
const NAV = [
  [/parada/i,        'Parada'],
  [/discurso/i,      'Discurso'],
  [/cierre/i,        'Cierre'],
  [/objecion/i,      'Objeciones'],
  [/respiro/i,       'Respiros'],
  [/autoauditor/i,   'Autoauditoría'],
  [/notas/i,         'Notas'],
];

// Secciones que son material de apoyo, no texto hablado.
const INTERNA = /notas para|autoauditor/i;

/* ---------------------------------------------------------------- utilidades */

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu;

function inline(s) {
  s = esc(s);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  return s;
}

function slug(text) {
  return text.replace(EMOJI, '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'seccion';
}

function etiqueta(titulo) {
  for (const [re, label] of NAV) if (re.test(titulo)) return label;
  const limpio = titulo.replace(EMOJI, '').replace(/[(—-].*$/, '').trim();
  return limpio.length > 24 ? limpio.slice(0, 22).trim() + '…' : limpio;
}

/* ------------------------------------------------------------------ parser */

const avisos = [];

function bloques(lines, ctx) {
  const out = [];
  let i = 0;

  const esLista   = (l) => /^\s*[-*+] /.test(l);
  const esNumero  = (l) => /^\s*\d+[.)] /.test(l);
  const esTabla   = (l) => /^\s*\|/.test(l);
  const esCita    = (l) => /^\s*>/.test(l);
  const esCorte   = (l) => /^\s*---+\s*$/.test(l);
  const esTitulo  = (l) => /^#{1,6} /.test(l);

  while (i < lines.length) {
    const l = lines[i];

    if (!l.trim()) { i++; continue; }

    // encabezados
    if (esTitulo(l)) {
      const m = l.match(/^(#{1,6}) (.*)$/);
      const n = Math.min(m[1].length, 6);
      out.push(`<h${n}>${inline(m[2].trim())}</h${n}>`);
      i++; continue;
    }

    // separador: se omite si solo antecede a un encabezado (seria redundante)
    if (esCorte(l)) {
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      if (j >= lines.length || esTitulo(lines[j])) { i++; continue; }
      out.push('<hr>');
      i++; continue;
    }

    // cita
    if (esCita(l)) {
      const buf = [];
      while (i < lines.length && (esCita(lines[i]) || (buf.length && !lines[i].trim() && esCita(lines[i + 1] || '')))) {
        buf.push(lines[i].replace(/^\s*> ?/, ''));
        i++;
      }
      const crudo = buf.join('\n');
      const clase = /🔄/.test(crudo) ? 'respiro' : /⚠️|⚠/.test(crudo) ? 'aviso' : 'dicho';
      out.push(`<blockquote class="${clase}">${bloques(buf, ctx)}</blockquote>`);
      continue;
    }

    // tabla
    if (esTabla(l)) {
      const filas = [];
      while (i < lines.length && esTabla(lines[i])) { filas.push(lines[i].trim()); i++; }
      const celdas = (f) => f.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const cabecera = celdas(filas[0]);
      const cuerpo = filas.slice(/^\|[\s:|-]+\|$/.test(filas[1]) ? 2 : 1).map(celdas);
      out.push(
        '<div class="tabla-scroll"><table><thead><tr>' +
        cabecera.map((c) => `<th>${inline(c)}</th>`).join('') +
        '</tr></thead><tbody>' +
        cuerpo.map((f) => '<tr>' + f.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') +
        '</tbody></table></div>'
      );
      continue;
    }

    // listas
    if (esLista(l) || esNumero(l)) {
      const orden = esNumero(l);
      const tag = orden ? 'ol' : 'ul';
      const items = [];
      while (i < lines.length && (esLista(lines[i]) || esNumero(lines[i]))) {
        let texto = lines[i].replace(/^\s*(?:[-*+]|\d+[.)]) /, '');
        i++;
        // continuacion indentada del mismo item
        while (i < lines.length && lines[i].trim() && !esLista(lines[i]) && !esNumero(lines[i])
               && !esTitulo(lines[i]) && !esCorte(lines[i]) && !esCita(lines[i]) && !esTabla(lines[i])) {
          texto += ' ' + lines[i].trim();
          i++;
        }
        items.push(`<li>${inline(texto)}</li>`);
      }
      out.push(`<${tag}>${items.join('')}</${tag}>`);
      continue;
    }

    // parrafo
    const buf = [];
    while (i < lines.length && lines[i].trim() && !esTitulo(lines[i]) && !esCorte(lines[i])
           && !esCita(lines[i]) && !esTabla(lines[i]) && !esLista(lines[i]) && !esNumero(lines[i])) {
      buf.push(lines[i].trim());
      i++;
    }
    const texto = buf.join(' ');
    // parrafo entero en cursiva -> acotacion escenica
    const acotacion = /^\*\(?[^*]+\)?\*$/.test(texto);
    // Estos .md no van justificados a mano: las lineas son largas y cada
    // salto es intencionado (un beat del discurso), asi que se respeta.
    out.push(`<p${acotacion ? ' class="acotacion"' : ''}>${buf.map(inline).join('<br>')}</p>`);
  }

  return out.join('\n');
}

/* -------------------------------------------------------------- plantilla */

function pagina({ ong, titulo, meta, secciones, slugName }) {
  const nav = secciones.map((s) => `<li><a href="#${s.id}">${esc(s.label)}</a></li>`).join('');
  const cuerpo = secciones.map((s) =>
    `<section id="${s.id}"${s.interna ? ' class="interna"' : ''}>\n<h2>${inline(s.titulo)}</h2>\n${s.html}\n</section>`
  ).join('\n\n');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Speech ${esc(ong.nombre)}</title>
<meta name="robots" content="noindex, nofollow">
<link rel="icon" type="image/svg+xml" href="../assets/favicon.svg">
<link rel="stylesheet" href="../assets/speech.css">
</head>
<body style="--accent:${ong.accent};--band:${ong.band};">

<div class="topbar">
  <a class="volver" href="../index.html"><span aria-hidden="true">←</span> Formaciones ONG</a>
  <span class="marca">Speech · ${esc(ong.nombre)}</span>
</div>

<header class="hero">
  <div class="interior">
    <div class="logo"><img src="../assets/logos/${ong.logo}" alt="${esc(ong.completo)}"></div>
    <div class="kicker">Speech de captación cara a cara</div>
    <h1>${esc(ong.completo)}</h1>
    ${meta ? `<div class="meta">${meta}</div>` : ''}
  </div>
</header>

<nav class="secciones" aria-label="Secciones del speech">
  <ol>${nav}</ol>
</nav>

<main>
${cuerpo}
</main>

<footer class="pie">
  <span>Departamento de Formación Wesser</span>
  <span>
    <a href="../bundled/${encodeURIComponent(ong.pres)}">Ver presentación de ${esc(ong.nombre)} →</a>
  </span>
</footer>

<script>
// Resalta en el navegador la seccion visible.
(function () {
  var enlaces = [].slice.call(document.querySelectorAll('.secciones a'));
  var secciones = enlaces.map(function (a) { return document.getElementById(a.hash.slice(1)); });
  if (!('IntersectionObserver' in window) || !secciones.length) return;

  var visibles = new Set();
  var obs = new IntersectionObserver(function (entradas) {
    entradas.forEach(function (e) {
      if (e.isIntersecting) visibles.add(e.target); else visibles.delete(e.target);
    });
    var activa = secciones.find(function (s) { return visibles.has(s); });
    enlaces.forEach(function (a, n) { a.classList.toggle('activa', secciones[n] === activa); });
  }, { rootMargin: '-135px 0px -65% 0px' });

  secciones.forEach(function (s) { if (s) obs.observe(s); });
})();
</script>

</body>
</html>
`;
}

/* ------------------------------------------------------------------ build */

function construir(slugName) {
  const ong = ONGS[slugName];
  const md = fs.readFileSync(path.join(SRC, `speech_${slugName}.md`), 'utf8');
  const lines = md.split(/\r?\n/);

  // H1 y bloque de metadatos (todo lo anterior al primer ## o ---)
  let i = 0;
  while (i < lines.length && !/^# /.test(lines[i])) i++;
  const h1 = (lines[i] || '').replace(/^# /, '').trim();
  i++;

  const metaLines = [];
  while (i < lines.length && !/^##? /.test(lines[i]) && !/^---+\s*$/.test(lines[i].trim())) {
    metaLines.push(lines[i]); i++;
  }
  const meta = bloques(metaLines, {});

  // Secciones por ##
  const secciones = [];
  let actual = null;
  const usados = new Set();
  for (; i < lines.length; i++) {
    const m = lines[i].match(/^## (.*)$/);
    if (m) {
      if (actual) secciones.push(actual);
      const titulo = m[1].trim();
      let id = slug(titulo), n = 2;
      while (usados.has(id)) id = slug(titulo) + '-' + n++;
      usados.add(id);
      actual = { titulo, id, label: etiqueta(titulo), interna: INTERNA.test(titulo), lines: [] };
    } else if (actual) {
      actual.lines.push(lines[i]);
    } else if (lines[i].trim() && !/^---+\s*$/.test(lines[i].trim())) {
      avisos.push(`${slugName}: linea fuera de seccion -> ${lines[i].slice(0, 60)}`);
    }
  }
  if (actual) secciones.push(actual);
  for (const s of secciones) s.html = bloques(s.lines, {});

  const html = pagina({ ong, titulo: h1, meta, secciones, slugName });
  const dest = path.join(SRC, `speech_${slugName}.html`);
  fs.writeFileSync(dest, html, 'utf8');

  return { dest, secciones, bytes: Buffer.byteLength(html) };
}

let total = 0;
for (const slugName of Object.keys(ONGS)) {
  const r = construir(slugName);
  console.log(
    `OK  speech_${slugName}.html`.padEnd(30) +
    `${String(Math.round(r.bytes / 1024)).padStart(4)} KB  ` +
    `${r.secciones.length} secciones: ` +
    r.secciones.map((s) => s.label + (s.interna ? '*' : '')).join(' · ')
  );
  total += r.bytes;
}
console.log(`\n${Object.keys(ONGS).length} paginas · ${Math.round(total / 1024)} KB  (* = seccion interna)`);
if (avisos.length) {
  console.log('\nAVISOS:');
  avisos.forEach((a) => console.log('  ! ' + a));
}
