#!/usr/bin/env node
/**
 * Convierte un SPEECH *.docx al markdown que espera tools/build-speeches.js
 *
 *   node docx-a-md.js "<ruta al .docx>"      -> escribe .md por stdout
 *
 * Reglas:
 *   - Conserva las negritas del Word (runs con <w:b/>) como **...**
 *   - Rotulos 🚦 🗣️ 🤝  ->  ##        Titulo con otro emoji  ->  #
 *   - 🔄 RESPIRO N y lo que le sigue (preguntas «...» y acotaciones)  ->  cita >
 *   - Acotaciones sueltas (...)  ->  *(...)*
 *   - Bloques de «...» seguidos fuera de un respiro  ->  cita >
 */
const fs = require('fs');
const { execFileSync } = require('child_process');

const xml = execFileSync('unzip', ['-p', process.argv[2], 'word/document.xml'], {
  maxBuffer: 64 * 1024 * 1024,
}).toString('utf8');

const des = (s) => s.replace(/&lt;/g,'<').replace(/&gt;/g,'>')
  .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');

// Un parrafo por <w:p>, y dentro un tramo por <w:r>; la negrita vive en <w:rPr>
const parrafos = [];
for (const p of xml.split(/<w:p[ >]/).slice(1)) {
  let t = '';
  for (const r of p.split(/<w:r[ >]/).slice(1)) {
    const props = (r.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/) || [, ''])[1];
    const negrita = /<w:b\/>|<w:b [^>]*\/>/.test(props);
    let txt = [...r.matchAll(/(<w:br\/>)|<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g)]
      .map(m => (m[1] ? '\u0000' : des(m[2]))).join('');
    if (!txt) continue;
    t += negrita ? `**${txt}**` : txt;
  }
  t = t.replace(/\*\*\s*\*\*/g, '');
  t = t.replace(/\*\*(\s*)([^*]+?)(\s*)\*\*/g, (m,a,b,c) => a + '**' + b + '**' + c);
  for (const trozo of t.split('\u0000')) if (trozo.trim()) parrafos.push(trozo.trim());
}

const limpio  = (s) => s.replace(/\*\*/g, '').trim();
const esAcot  = (s) => /^\(.*\)$/.test(limpio(s));
const esCita  = (s) => /^«/.test(limpio(s));
const esResp  = (s) => /^🔄/.test(limpio(s));
// una rama es una instruccion del respiro: «Si dice que no: ...», con o sin negrita
const esRama  = (s) => /^\*{0,2}Si\b/.test(limpio(s)) || /→/.test(s);
// un rotulo de bloque: parrafo entero en negrita que empieza por un simbolo
// (🕗 8:00 · TELEASISTENCIA, 🕸️ LA RED). Son señales de estructura para el
// captador, no texto hablado: van como ### para que el auditor no los cuente.
const esSub   = (s) => /^\*\*[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(s.trim()) &&
                       /\*\*$/.test(s.trim()) && limpio(s).length < 60;
const esSec   = (s) => /^(🚦|🗣️|🤝)/.test(limpio(s));
const esTit   = (s) => /^(🎯|🔴|❤️|🧠|🐾|🩹|🩸|🏠|🏡)/.test(limpio(s));

const out = [];
for (let i = 0; i < parrafos.length; i++) {
  const l = parrafos[i];

  if (esTit(l)) { out.push('# ' + limpio(l), ''); continue; }
  if (esSec(l)) { out.push('---', '', '## ' + limpio(l), ''); continue; }

  if (esResp(l)) {                                   // respiro completo
    const cuerpo = ['> 🔄 **' + limpio(l).replace(/^🔄\s*/, '') + '**'];
    let j = i + 1;
    for (; j < parrafos.length; j++) {
      const s = parrafos[j];
      if (esAcot(s))      { cuerpo.push('>', '> *' + s + '*'); continue; }
      if (esCita(s))      { cuerpo.push('>', '> **' + limpio(s) + '**'); continue; }
      if (esRama(s))      { cuerpo.push('>', '> ' + s); continue; }
      break;
    }
    i = j - 1;
    out.push(...cuerpo, '');
    continue;
  }

  if (esSub(l))  { out.push('### ' + limpio(l), ''); continue; }
  if (esAcot(l)) { out.push('*' + l + '*', ''); continue; }

  if (esCita(l)) {                                   // bloque de citas seguidas
    const grupo = [];
    let j = i;
    for (; j < parrafos.length && esCita(parrafos[j]); j++) grupo.push(parrafos[j]);
    i = j - 1;
    out.push(grupo.map((g) => '> ' + g).join('\n>\n'), '');
    continue;
  }

  out.push(l, '');
}

process.stdout.write(out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '') + '\n');
