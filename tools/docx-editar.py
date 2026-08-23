# -*- coding: utf-8 -*-
"""
Edita un .docx conservando todo lo demas: reescribe word/document.xml y
vuelve a empaquetar el zip con el resto de piezas intactas.

  insertar   <docx> despues "<texto ancla>" "<texto nuevo>" [cursiva|negrita]
  sustituir  <docx> "<texto viejo>" "<texto nuevo>"
  borrar     <docx> "<texto del parrafo>"
"""
import io, os, re, shutil, sys, zipfile

def leer(ruta):
    with zipfile.ZipFile(ruta) as z:
        return {n: z.read(n) for n in z.namelist()}, list(z.namelist())

def escribir(ruta, piezas, orden, xml):
    piezas['word/document.xml'] = xml.encode('utf-8')
    shutil.copy2(ruta, ruta + '.bak')
    with zipfile.ZipFile(ruta, 'w', zipfile.ZIP_DEFLATED) as z:
        for n in orden:
            z.writestr(n, piezas[n])

def texto(p):
    return ''.join(re.findall(r'<w:t(?:[^>]*)?>(.*?)</w:t>', p, re.S))

def esc(s):
    return s.replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')

def parrafo(txt, estilo=None):
    rpr = ''
    if estilo == 'cursiva': rpr = '<w:rPr><w:i/><w:iCs/></w:rPr>'
    if estilo == 'negrita': rpr = '<w:rPr><w:b/><w:bCs/></w:rPr>'
    return ('<w:p w:rsidR="003352F1" w:rsidRPr="003352F1" w:rsidRDefault="003352F1" '
            'w:rsidP="003352F1"><w:r w:rsidRPr="003352F1">' + rpr +
            '<w:t xml:space="preserve">' + esc(txt) + '</w:t></w:r></w:p>')

accion, ruta = sys.argv[1], sys.argv[2]
piezas, orden = leer(ruta)
xml = piezas['word/document.xml'].decode('utf-8')
ps = re.findall(r'<w:p[ >].*?</w:p>', xml, re.S)

def localiza(aguja):
    hits = [q for q in ps if aguja in texto(q)]
    if len(hits) != 1:
        sys.exit('  ERROR: "%s" aparece %d veces (debe aparecer 1)' % (aguja[:40], len(hits)))
    return hits[0]

if accion == 'insertar':
    ancla, nuevo = sys.argv[4], sys.argv[5]
    estilo = sys.argv[6] if len(sys.argv) > 6 and sys.argv[6] != '-' else None
    salto  = int(sys.argv[7]) if len(sys.argv) > 7 else 0
    diana = ps[ps.index(localiza(ancla)) + salto]
    xml = xml.replace(diana, diana + parrafo(nuevo, estilo), 1)
    print('  insertado despues de: %s' % texto(diana)[:60])

elif accion == 'sustituir':
    viejo, nuevo = sys.argv[3], sys.argv[4]
    diana = localiza(viejo)
    # se conserva el formato del primer run y se colapsa el parrafo a texto plano
    estilo = 'cursiva' if '<w:i/>' in diana else ('negrita' if '<w:b/>' in diana else None)
    xml = xml.replace(diana, parrafo(nuevo, estilo), 1)
    print('  sustituido: %s' % texto(diana)[:60])

elif accion == 'borrar':
    diana = localiza(sys.argv[3])
    xml = xml.replace(diana, '', 1)
    print('  borrado: %s' % texto(diana)[:60])

else:
    sys.exit('  accion desconocida')

escribir(ruta, piezas, orden, xml)
print('  guardado (copia previa en .bak)')
