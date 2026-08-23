#!/usr/bin/env node
/**
 * Audita los speeches: erratas, duracion, repeticiones y estilo.
 *
 *   node tools/auditar-speech.js          los siete
 *   node tools/auditar-speech.js aecc     solo uno
 *
 * Trabaja sobre los .md, que son la fuente. No modifica nada.
 *
 * OJO — lo que esto NO detecta, y es lo que mas duele:
 *
 *   Los "fosiles": frases que dependian de una premisa que se elimino al
 *   reescribir y sobreviven contradiciendo el relato. En AECC quedaron dos
 *   ("mas oportunidades de las que tuvo", "que encuentren mas respuestas de
 *   las que encontre yo") despues de que la protagonista pasara a encontrar
 *   una red completa. Eso solo se ve siguiendo la logica frase a frase, o
 *   leyendo el guion en voz alta. Ninguna herramienta lo sustituye.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'speechs');

const soloEste = process.argv[2];
const archivos = fs.readdirSync(SRC)
  .filter((f) => f.endsWith('.md'))
  .filter((f) => !soloEste || f === `speech_${soloEste}.md`)
  .sort();

if (!archivos.length) {
  console.error(`No hay ningun speech que encaje con "${soloEste}".`);
  process.exit(1);
}

/* ------------------------------------------------------------ utilidades */

const VACIAS = new Set(['de', 'la', 'el', 'que', 'y', 'a', 'en', 'los', 'las', 'un',
  'una', 'por', 'con', 'no', 'se', 'lo', 'su', 'del', 'al', 'es', 'para', 'mas',
  'más', 'como', 'te', 'le', 'me', 'si', 'ya', 'o', 'pero', 'sus', 'esa', 'ese']);

// Palabras que empiezan por mayuscula pero no son personajes.
const NO_PERSONAJES = new Set(['Asociación', 'Fundación', 'España', 'Española',
  'Europa', 'Cáncer', 'Cruz', 'Roja', 'Aldeas', 'Infantiles', 'Alzheimer',
  'Doñana', 'Gobierno', 'Infocáncer', 'Contra', 'Josep', 'Carreras', 'Maragall',
  'Pasqual', 'Corazón', 'Nacional', 'Estado', 'Ministerio', 'Navidad',
  'Estudio', 'Nature', 'Memoria', 'Informe', 'Registro', 'Cátedra', 'Barcelona',
  'Madrid', 'Valencia', 'Medicine', 'Sanidad', 'Europa', 'Reino', 'Unido', 'Alemania']);

const esComentario = (t) => /^<!--/.test(t);   // marcas internas del .md
const esAcotacion = (t) => /^\*\(.*\)\*$/.test(t);
const esEncabezado = (t) => /^#{1,6} /.test(t);
const esSeparador = (t) => /^---+$/.test(t);
const esCita = (t) => /^>/.test(t);

// Secciones que son material de consulta: no se dicen en voz alta y por
// tanto no cuentan para la duracion.
const SECCION_INTERNA = /objecion|notas para|autoauditor|puntos de respiro/i;

/** Texto que el captador dice en voz alta. */
function palabrasHabladas(lineas) {
  let n = 0;
  let contando = true;
  for (const l of lineas) {
    const t = l.trim();
    if (/^## /.test(t)) contando = !SECCION_INTERNA.test(t);
    if (!contando) continue;
    if (!t || esEncabezado(t) || esSeparador(t) || esAcotacion(t)) continue;
    if (esCita(t)) {
      const dentro = t.replace(/^>\s?/, '').trim();
      // dentro de un respiro solo se dice la pregunta; el rotulo y la
      // instruccion son para el captador
      // las ramas ("Si dice que no: ...", con o sin negrita) son alternativas:
      // solo se dice una, y no siempre, asi que no cuentan para la duracion
      const esRama = /^[*]{0,2}Si\b/.test(dentro) || /^Este respiro/.test(dentro);
      if (/^🔄/.test(dentro) || esAcotacion(dentro) || esRama || !dentro) continue;
      n += dentro.replace(/[*_«»"]/g, '').split(/\s+/).filter(Boolean).length;
      continue;
    }
    n += t.replace(/[*_#]/g, '').split(/\s+/).filter(Boolean).length;
  }
  return n;
}

/* -------------------------------------------------------------- auditoria */

const personajes = {};
let totalAvisos = 0;

for (const archivo of archivos) {
  const slug = archivo.replace(/^speech_|\.md$/g, '');
  const lineas = fs.readFileSync(path.join(SRC, archivo), 'utf8').split(/\r?\n/);
  const avisos = [];
  const add = (n, txt) => avisos.push({ n, txt });

  /* --- erratas --- */
  let dentroDelTitulo = true;
  lineas.forEach((l, i) => {
    const t = l.trim();
    const num = i + 1;

    if ((l.match(/\*\*/g) || []).length % 2) {
      add(num, `negrita sin cerrar — saldran asteriscos crudos en la pagina`);
    }
    if (/^# /.test(t)) {
      if (!dentroDelTitulo) add(num, `"${t.slice(0, 40)}" usa # en vez de ##: no sera una seccion`);
      dentroDelTitulo = false;
    }
    // el punto suele ir dentro de la negrita ("...llamadas.**"), asi que hay
    // que quitar los cierres de formato antes de mirar el final de la linea
    const sinFormato = t.replace(/[*_]+$/, '');
    if (t && !esEncabezado(t) && !esSeparador(t) && !esComentario(t) && !/^[>*\-|]/.test(t) && !/[.?!:»")]$/.test(sinFormato)) {
      add(num, `sin puntuacion final — "${t.slice(0, 55)}"`);
    }
    const rep = t.match(/\b(\w{2,})\s+\1\b/i);
    if (rep) add(num, `palabra repetida: "${rep[0]}"`);
  });

  /* --- voces pintadas como instrucciones, y al reves --- */
  lineas.forEach((l, i) => {
    const t = l.trim();
    if (/^\*"[^*]+"\*$/.test(t) || /^\*«[^*]+»\*$/.test(t)) {
      add(i + 1, `cita en cursiva: se pintara en gris como acotacion. Usa > "..." si se dice en voz alta`);
    }
    if (/^\(.*\)$/.test(t) && !esAcotacion(t)) {
      add(i + 1, `acotacion sin asteriscos: saldra como texto hablado — "${t.slice(0, 40)}"`);
    }
  });

  /* --- verbos que restan fuerza --- */
  lineas.forEach((l, i) => {
    const m = l.match(/\b(intenta|intentamos|trata de|tratamos de|procura|procuramos)\s+\w+/i);
    if (m && !esCita(l.trim())) add(i + 1, `verbo que se disculpa: "${m[0]}"`);
  });

  /* --- duracion frente al rotulo --- */
  const palabras = palabrasHabladas(lineas);
  const min = palabras / 130;
  const rotulo = (lineas.find((l) => /^## .*[Dd]iscurso/.test(l.trim())) || '').match(/(\d+(?:[.,]\d+)?)\s*min/i);
  const dice = rotulo ? parseFloat(rotulo[1].replace(',', '.')) : null;
  const desfase = dice !== null && Math.abs(min - dice) > 1;

  /* --- repeticiones de 4 palabras --- */
  const cuerpo = lineas
    .filter((l) => { const t = l.trim(); return t && !esEncabezado(t) && !esSeparador(t); })
    .join(' ').toLowerCase()
    .replace(/[*_>«»"()¿?¡!.,;:]/g, ' ').replace(/\s+/g, ' ');
  const tok = cuerpo.split(' ').filter(Boolean);
  const grupos = {};
  for (let i = 0; i + 4 <= tok.length; i++) {
    const g = tok.slice(i, i + 4);
    if (g.every((w) => VACIAS.has(w))) continue;
    const k = g.join(' ');
    (grupos[k] = grupos[k] || []).push(i);
  }
  const repes = Object.entries(grupos).filter(([, v]) => v.length > 1)
    .sort((a, b) => b[1].length - a[1].length).slice(0, 6);

  /* --- personaje --- */
  // Solo cuentan las mayusculas que NO abren frase: si no, se cuelan
  // "Porque", "Cuando" y demas conectores.
  const nombres = {};
  for (const l of lineas) {
    if (/^\s*\|/.test(l)) continue;        // las tablas meten ruido
    const t = l.trim().replace(/^[>*#\s]+/, '');
    if (!t) continue;
    for (const frase of t.split(/(?<=[.?!:])\s+/)) {
      const tok = frase.replace(/[,;()«»"¿¡]/g, ' ').split(/\s+/).filter(Boolean);
      tok.slice(1).forEach((w) => {          // slice(1): fuera la primera palabra
        const limpio = w.replace(/[*_.]/g, '');
        if (/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}$/.test(limpio) && !NO_PERSONAJES.has(limpio)) {
          nombres[limpio] = (nombres[limpio] || 0) + 1;
        }
      });
    }
  }
  const top = Object.entries(nombres).sort((a, b) => b[1] - a[1]).slice(0, 2)
    .filter(([, c]) => c >= 4);
  if (top.length) personajes[slug] = top.map(([n]) => n);

  /* --- informe --- */
  const secciones = lineas.filter((l) => /^## /.test(l.trim())).length;
  console.log(`\n${'='.repeat(64)}`);
  console.log(`  ${archivo}`);
  console.log('='.repeat(64));
  console.log(`  secciones: ${secciones}   respiros: ${lineas.filter((l) => /🔄/.test(l)).length}   ` +
              `protagonista: ${(personajes[slug] || ['—']).join(', ')}`);
  console.log(`  duracion : ${palabras} palabras · ${min.toFixed(1)} min a ritmo de calle` +
              (dice !== null ? `   (el rotulo dice ~${dice})${desfase ? '  <-- NO CUADRA' : ''}` : ''));

  if (avisos.length) {
    console.log(`\n  AVISOS (${avisos.length}):`);
    avisos.sort((a, b) => a.n - b.n).forEach((a) => console.log(`    linea ${String(a.n).padStart(3)}: ${a.txt}`));
  } else {
    console.log('\n  sin avisos mecanicos');
  }
  if (desfase) totalAvisos++;
  totalAvisos += avisos.length;

  if (repes.length) {
    console.log('\n  EXPRESIONES REPETIDAS:');
    repes.forEach(([k, v]) => console.log(`    ${v.length}x  "${k}"`));
  }
}

/* --- choque de nombres entre speeches --- */
const usos = {};
for (const [slug, ns] of Object.entries(personajes)) {
  for (const n of ns) (usos[n] = usos[n] || []).push(slug);
}
const choques = Object.entries(usos).filter(([, v]) => v.length > 1);

console.log(`\n${'='.repeat(64)}`);
console.log('  PROTAGONISTAS');
console.log('='.repeat(64));
for (const [slug, ns] of Object.entries(personajes)) console.log(`  ${slug.padEnd(10)} ${ns.join(', ')}`);
if (choques.length) {
  console.log('\n  CHOQUES — el mismo nombre en varios guiones:');
  choques.forEach(([n, v]) => console.log(`    "${n}" en ${v.join(' y ')}`));
} else if (Object.keys(personajes).length > 1) {
  console.log('\n  sin choques de nombre');
}

console.log(`\n${totalAvisos ? totalAvisos + ' aviso(s) mecanico(s)' : 'sin avisos mecanicos'}` +
            `\nRecuerda: los fosiles y las contradicciones no salen aqui. Leelo en voz alta.\n`);
