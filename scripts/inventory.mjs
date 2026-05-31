import fs from 'fs';
import path from 'path';
import { DOMParser } from '@xmldom/xmldom';

const rootDir = process.cwd();
const docsDir = path.join(rootDir, 'docs');

if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

function findXmlFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      if (!['node_modules', '.git', 'dist', '.netlify', 'legacy'].includes(file)) {
        findXmlFiles(filePath, fileList);
      }
    } else if (filePath.toLowerCase().endsWith('.xml')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

// También buscar explícitamente en la carpeta legacy/backups si hay xmls ahí, pero mejor buscar en todo el repo saltando node_modules
function findXmlFilesGlobal(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      if (fs.statSync(filePath).isDirectory()) {
        if (!['node_modules', '.git', 'dist', '.netlify'].includes(file)) {
            findXmlFilesGlobal(filePath, fileList);
        }
      } else if (filePath.toLowerCase().endsWith('.xml')) {
        fileList.push(filePath);
      }
    }
    return fileList;
}

const allXmlFiles = findXmlFilesGlobal(rootDir);

const results = [];
const stats = {
  v4: 0, v33: 0,
  ingreso: 0, egreso: 0, traslado: 0, rep: 0, nomina: 0,
  cartaPorte: 0,
  monedaExtranjera: 0,
  tasa0: 0, exento: 0, retenciones: 0,
  variosConceptos: 0,
  defectuosos: 0,
  efos: 0
};

const parser = new DOMParser();

allXmlFiles.forEach((filePath, index) => {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const doc = parser.parseFromString(content, 'text/xml');
    
    // Si falla el parseo
    if (doc.getElementsByTagName("parsererror").length > 0) {
        stats.defectuosos++;
        results.push({
            id: index + 1,
            archivo: path.basename(filePath),
            ruta: path.relative(rootDir, filePath),
            año: 'ERROR', version: 'ERROR', tipo: 'ERROR', complemento: 'ERROR', emiRec: 'Desconocido', 
            moneda: 'ERROR', cp: 'NO', rep: 'NO', ret: 'NO', tasa0: 'NO', obs: 'XML Malformado'
        });
        return;
    }

    const comprobante = doc.documentElement;
    if (!comprobante || !comprobante.tagName.includes('Comprobante')) {
       return; // No es un CFDI
    }

    const version = comprobante.getAttribute("Version") || comprobante.getAttribute("version") || "Desconocida";
    const tipoComprobante = comprobante.getAttribute("TipoDeComprobante") || "Desconocido";
    const fecha = comprobante.getAttribute("Fecha") || "";
    const año = fecha.substring(0, 4) || "Desconocido";
    const moneda = comprobante.getAttribute("Moneda") || "MXN";
    
    if (version === "4.0") stats.v4++;
    if (version === "3.3") stats.v33++;
    
    if (tipoComprobante === "I") stats.ingreso++;
    else if (tipoComprobante === "E") stats.egreso++;
    else if (tipoComprobante === "T") stats.traslado++;
    else if (tipoComprobante === "P") stats.rep++;
    else if (tipoComprobante === "N") stats.nomina++;
    
    if (moneda !== "MXN" && moneda !== "XXX") stats.monedaExtranjera++;

    const todosNodos = doc.getElementsByTagName("*");
    let cp = "NO";
    let rep = "NO";
    let ret = "NO";
    let tasa0 = "NO";
    let exento = "NO";
    let conceptos = 0;
    let complementos = [];

    for (let i = 0; i < todosNodos.length; i++) {
        const n = todosNodos[i];
        const tagName = n.localName || n.nodeName;
        
        if (tagName === "CartaPorte") {
            cp = "SÍ";
            complementos.push("CartaPorte");
            stats.cartaPorte++;
        }
        if (tagName === "Pagos") {
            rep = "SÍ";
            complementos.push("Pagos");
        }
        if (tagName === "Nomina") {
            complementos.push("Nómina");
        }
        if (tagName === "Retencion") {
            ret = "SÍ";
        }
        if (tagName === "Traslado") {
            const tasaOCuota = n.getAttribute("TasaOCuota");
            const tipoFactor = n.getAttribute("TipoFactor");
            if (tasaOCuota === "0.000000") tasa0 = "SÍ";
            if (tipoFactor === "Exento") exento = "SÍ";
        }
        if (tagName === "Concepto") {
            conceptos++;
        }
    }

    if (tasa0 === "SÍ") stats.tasa0++;
    if (exento === "SÍ") stats.exento++;
    if (ret === "SÍ") stats.retenciones++;
    if (conceptos > 1) stats.variosConceptos++;

    // Verificar si es defectuoso por Totales
    const total = parseFloat(comprobante.getAttribute("Total") || "0");
    const subtotal = parseFloat(comprobante.getAttribute("SubTotal") || "0");
    if (total === 0 && tipoComprobante !== "P" && tipoComprobante !== "T") {
        stats.defectuosos++;
    }

    const rfcEmisorMatch = content.match(/Emisor[^>]*Rfc="([^"]+)"/i);
    const rfcEmisor = rfcEmisorMatch ? rfcEmisorMatch[1] : "Desconocido";

    // Asumir que si el RFC es de un demo (ej. AAA010101AAA o EKU9003173C9), puede ser propio.
    // Lo dejaremos como Emitido/Recibido heurístico.
    let emitidoRecibido = "Desconocido";
    if (filePath.includes('emitidos')) emitidoRecibido = "Emitido";
    if (filePath.includes('recibidos')) emitidoRecibido = "Recibido";
    if (rfcEmisor === 'EKU9003173C9' || rfcEmisor === 'AAA010101AAA') {
        emitidoRecibido = "Emitido (Demo)";
    }

    // EFOS check simulado
    const isEfos = filePath.toLowerCase().includes('efos') || filePath.toLowerCase().includes('69b') || content.includes('EFOS');
    if (isEfos) stats.efos++;

    results.push({
        id: index + 1,
        archivo: path.basename(filePath),
        ruta: path.relative(rootDir, filePath),
        año,
        version,
        tipo: tipoComprobante,
        complemento: complementos.join(", ") || "Ninguno",
        emiRec: emitidoRecibido,
        moneda,
        cp,
        rep,
        ret,
        tasa0,
        obs: isEfos ? 'Posible EFOS' : (total === 0 && tipoComprobante === 'I' ? 'Total 0' : '')
    });

  } catch (e) {
      // ignore non-xml parsing errors
  }
});

let md = `# Inventario de XMLs para Certificación

**Total de XMLs disponibles en repositorio:** ${results.length}

## Clasificación de Categorías Encontradas

- **CFDI 4.0:** ${stats.v4}
- **CFDI 3.3:** ${stats.v33}
- **Ingreso:** ${stats.ingreso}
- **Egreso:** ${stats.egreso}
- **Traslado:** ${stats.traslado}
- **Pago (REP):** ${stats.rep}
- **Nómina:** ${stats.nomina}
- **Carta Porte:** ${stats.cartaPorte}
- **Moneda Extranjera:** ${stats.monedaExtranjera}
- **Tasa 0%:** ${stats.tasa0}
- **Exento:** ${stats.exento}
- **Retenciones:** ${stats.retenciones}
- **Varios Conceptos:** ${stats.variosConceptos}
- **Defectuosos / Totales Inválidos:** ${stats.defectuosos}
- **EFOS / Lista Negra simulada:** ${stats.efos}

## Inventario Detallado

| # | Archivo | Ruta | Año | Versión CFDI | Tipo CFDI | Complemento | Emitido/Recibido | Moneda | Tiene Carta Porte | Tiene REP | Tiene Retenciones | Tiene Tasa 0 | Observaciones |
| - | ------- | ---- | --- | ------------ | --------- | ----------- | ---------------- | ------ | ----------------- | --------- | ----------------- | ------------ | ------------- |
`;

results.forEach(r => {
    md += `| ${r.id} | ${r.archivo} | \`${r.ruta}\` | ${r.año} | ${r.version} | ${r.tipo} | ${r.complemento} | ${r.emiRec} | ${r.moneda} | ${r.cp} | ${r.rep} | ${r.ret} | ${r.tasa0} | ${r.obs} |\n`;
});

md += `
## Conclusión y Diagnóstico

* **Total de XMLs disponibles:** ${results.length}
* **Sirven para certificación real (4.0):** ${stats.v4}
* **Se alcanzó la meta de 100 XMLs:** ${results.length >= 100 ? 'SÍ' : 'NO'}

*(Análisis generado automáticamente el ${new Date().toISOString()})*
`;

fs.writeFileSync(path.join(docsDir, 'INVENTARIO_XMLS_CERTIFICACION.md'), md);
console.log('Inventario generado correctamente en docs/INVENTARIO_XMLS_CERTIFICACION.md');
