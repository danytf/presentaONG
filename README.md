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

## Regenerar los speeches

Los `.md` de `speechs/` son la fuente. Tras editarlos:

```bash
node tools/build-speeches.js
```

Reescribe los `speech_*.html` por completo. No requiere dependencias.

Si en algún momento se reexporta `index.html` desde la herramienta que genera
los bundles, hay que volver a aplicar el parche de las tarjetas:

```bash
node tools/patch-index.js
```

Es idempotente: si ya está aplicado, no hace nada.

## Uso

Abre `index.html` en el navegador. No requiere servidor ni instalación.
