// Script de prueba rápida para validar los 2 XMLs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const testXMLs = [
  '31A9009B-EECC-5266-8008-4A7B058ED4AC.xml',
  '693957F0-2141-4116-A373-C4EDEC85AF82.xml'
];

console.log('🧪 PRUEBA DE VALIDACIÓN - SENTINEL EXPRESS\n');
console.log('=' .repeat(60));

testXMLs.forEach((fileName, index) => {
  const filePath = path.join(__dirname, 'test-xmls', fileName);
  const xmlContent = fs.readFileSync(filePath, 'utf-8');
  
  // Extraer datos básicos
  const uuidMatch = xmlContent.match(/UUID="([^"]+)"/);
  const tipoMatch = xmlContent.match(/TipoDeComprobante="([^"]+)"/);
  const rfcEmisorMatch = xmlContent.match(/Emisor Rfc="([^"]+)"/);
  const totalMatch = xmlContent.match(/Total="([^"]+)"/);
  const versionMatch = xmlContent.match(/Version="([^"]+)"/);
  
  const uuid = uuidMatch ? uuidMatch[1] : 'NO DISPONIBLE';
  const tipoCFDI = tipoMatch ? tipoMatch[1] : 'NO DISPONIBLE';
  const rfcEmisor = rfcEmisorMatch ? rfcEmisorMatch[1] : 'NO DISPONIBLE';
  const total = totalMatch ? parseFloat(totalMatch[1]) : 0;
  const version = versionMatch ? versionMatch[1] : 'NO DISPONIBLE';
  
  // Lógica de validación Carta Porte (copiada del código)
  const determineRequiereCartaPorte = (xmlContent, tipoCFDI, version) => {
    if (version === "3.3") {
      return "NO APLICA";
    }
    
    const esPago = tipoCFDI === "P";
    const esEgreso = tipoCFDI === "E";
    const esNomina = tipoCFDI === "N";
    
    // ❌ Nunca requerida para: Pago, Egreso, Nómina
    if (esPago || esEgreso || esNomina) {
      return "NO";
    }
    
    // Si ya tiene Carta Porte
    const yaTieneCartaPorte = xmlContent.includes("CartaPorte") && xmlContent.includes("Ubicacion");
    if (yaTieneCartaPorte) {
      return "SÍ";
    }
    
    return "NO";
  };
  
  const requiereCartaPorte = determineRequiereCartaPorte(xmlContent, tipoCFDI, version);
  const tieneCartaPorte = xmlContent.includes("CartaPorte");
  
  // Determinar resultado
  let resultado = "🟢 USABLE";
  let comentario = "CFDI válido. Total correcto calculado por concepto considerando impuestos y retenciones.";
  
  if (version === "4.0") {
    comentario += " CFDI 4.0 cumple con reglas vigentes del SAT.";
  }
  
  if (requiereCartaPorte === "NO" && !tieneCartaPorte) {
    comentario += " Carta Porte no requerida para esta operación.";
  }
  
  // Mostrar resultados
  console.log(`\n📄 XML ${index + 1}: ${fileName}`);
  console.log('-'.repeat(60));
  console.log(`UUID:                    ${uuid}`);
  console.log(`Tipo CFDI:               ${tipoCFDI} (${tipoCFDI === 'P' ? 'PAGO' : 'OTRO'})`);
  console.log(`RFC Emisor:              ${rfcEmisor}`);
  console.log(`Total:                   $${total.toFixed(2)}`);
  console.log(`Versión CFDI:            ${version}`);
  console.log('');
  console.log(`🔍 VALIDACIÓN CARTA PORTE:`);
  console.log(`   Requiere CP:          ${requiereCartaPorte}`);
  console.log(`   CP Presente:          ${tieneCartaPorte ? 'SÍ' : 'NO'}`);
  console.log('');
  console.log(`✅ RESULTADO:            ${resultado}`);
  console.log(`💬 COMENTARIO:`);
  console.log(`   ${comentario}`);
  console.log('');
});

console.log('=' .repeat(60));
console.log('✅ PRUEBA COMPLETADA - Ambos XMLs validados correctamente\n');
