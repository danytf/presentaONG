# Formaciones ONG

Programa de formación · Captación de socios.

Para cada organización hay dos materiales:

- **Presentación** — historia, programas y cifras de impacto.
- **Speech** — guion de captación cara a cara, con objeciones y notas para el captador.

## Organizaciones

AECC · Aldeas Infantiles SOS · Cruz Roja · FEC · FJC · FPM · WWF

## Estructura

```
index.html          portada con las dos entradas de cada organización
bundled/            una presentación autocontenida por organización
speechs/            speech_*.md   fuente de cada guion
                    speech_*.html página generada a partir del .md
assets/             tipografías, logos y hoja de estilos de los speeches
tools/              scripts de generación
```

## Cambiar un speech

Los `.md` de `speechs/` son la fuente; el `.html` se genera a partir de ellos.

**La forma rápida, sin instalar nada:**

1. Abre el `.md` en GitHub, por ejemplo
   [speechs/speech_aecc.md](speechs/speech_aecc.md)
2. Pulsa el icono del lápiz (*Edit this file*)
3. Escribe y pulsa **Commit changes**

A partir de ahí es automático: un GitHub Action regenera el HTML y la web se
actualiza en 1-2 minutos. Funciona también desde el móvil. El progreso se ve
en la pestaña **Actions** del repositorio.

**Si prefieres trabajar en local**, edita el `.md` con tu editor y lanza:

```bash
node tools/build-speeches.js
```

Reescribe los `speech_*.html` por completo. No requiere dependencias.

### Ocultar secciones de un speech

En `tools/build-speeches.js`, cada ONG admite un array `ocultar` con las
secciones que no se publican (el texto sigue en el `.md`):

```js
aecc: { …, ocultar: ['Objeciones', 'Respiros', 'Notas'] },
```

Afecta solo a secciones de primer nivel (`##`). Las llamadas 🔄 intercaladas
dentro del Discurso se mantienen: son parte del guion hablado.

Si en algún momento se reexporta `index.html` desde la herramienta que genera
los bundles, hay que volver a aplicar el parche de las tarjetas:

```bash
node tools/patch-index.js
```

Es idempotente: si ya está aplicado, no hace nada.

## Uso

Abre `index.html` en el navegador. No requiere servidor ni instalación.
