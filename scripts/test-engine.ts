import fs from 'fs';
import path from 'path';
import { parseXMLAndGetSummary, CFDISummary } from '../client/src/lib/cfdiEngine';

const demoDir = path.join(__dirname, '../tests/fixtures/demo-xmls');
const files = fs.readdirSync(demoDir).filter(f => f.endsWith('.xml'));

console.log('--- SENTINEL EXPRESS CFDI ENGINE TEST ---');

for (const file of files) {
  const filePath = path.join(demoDir, file);
  const content = fs.readFileSync(filePath, 'utf-8');
  console.log(`\nArchivo: ${file}`);
  try {
    const summary = parseXMLAndGetSummary(content, file);
    console.log(`- RFC Emisor: ${summary.rfcEmisor} | RFC Receptor: ${summary.rfcReceptor}`);
    console.log(`- UUID: ${summary.uuid}`);
    console.log(`- Subtotal: ${summary.subtotal} | Total: ${summary.total} | IVA: ${summary.ivaTraslado}`);
    console.log(`- Moneda: ${summary.moneda} | Método Pago: ${summary.metodoPago} | Forma Pago: ${summary.formaPago}`);
    console.log(`- Tipo: ${summary.tipoDeComprobante} | Uso CFDI: ${summary.usoCFDI}`);
    console.log(`- Conceptos: ${summary.conceptos?.length}`);
    console.log(`- Complemento Pago (REP): ${summary.pagos?.length > 0 ? 'Sí' : 'No'}`);
    if (summary.pagos && summary.pagos.length > 0) {
      console.log(`  - REP UUID Relacionado: ${summary.pagos[0].uuidRelacionado}`);
      console.log(`  - REP Monto Pagado: ${summary.pagos[0].montoPagado}`);
    }
    console.log(`- Carta Porte: ${summary.cartaPorte ? 'Sí' : 'No'}`);
    if (summary.cartaPorte) {
      console.log(`  - CP Version: ${summary.cartaPorte.version}`);
      console.log(`  - Transporte Int: ${summary.cartaPorte.transporteInternacional}`);
    }
  } catch (err) {
    console.error(`Error procesando ${file}:`, err.message);
  }
}
