import fs from 'fs';

const xmlPath = './test-xmls/693957F0-2141-4116-A373-C4EDEC85AF82.xml';
const xmlContent = fs.readFileSync(xmlPath, 'utf-8');

console.log('🔍 ANÁLISIS DETALLADO DEL XML 693957F0\n');
console.log('='.repeat(60));

// 1. Verificar clave de producto
const tieneCveTransporte = /ClaveProdServ="78\d{5}|80\d{5}|81\d{5}"/i.test(xmlContent);
console.log('\n1️⃣ Tiene clave de transporte (78, 80, 81):', tieneCveTransporte);
const matchCve = xmlContent.match(/ClaveProdServ="(\d+)"/);
if (matchCve) console.log('   Clave encontrada:', matchCve[1]);

// 2. Verificar descripción de transporte
const tieneDescTransporte = /descripcion="[^"]*(?:servicio de transporte|flete|acarreo|traslado de mercancia|autotransporte)[^"]*"/i.test(xmlContent);
console.log('\n2️⃣ Tiene descripción de transporte (regex actual):', tieneDescTransporte);

// Extraer la descripción completa
const matchDesc = xmlContent.match(/Descripcion="([^"]+)"/i);
if (matchDesc) {
  console.log('   Descripción encontrada:', matchDesc[1].substring(0, 100) + '...');
  console.log('   Contiene "servicio de transporte":', /servicio de transporte/i.test(matchDesc[1]));
  console.log('   Contiene "servicios transporte":', /servicios transporte/i.test(matchDesc[1]));
  console.log('   Contiene "flete":', /flete/i.test(matchDesc[1]));
}

// 3. Verificar referencia a ruta
const tieneReferenciaRuta = /origen|destino|kilom|ruta|via federal/i.test(xmlContent);
console.log('\n3️⃣ Tiene referencia de ruta (regex actual):', tieneReferenciaRuta);
console.log('   Contiene "route":', /route/i.test(xmlContent));
console.log('   Contiene "load":', /load/i.test(xmlContent));

// 4. Verificar si ya tiene Carta Porte
const yaTieneCartaPorte = xmlContent.includes("CartaPorte") && xmlContent.includes("Ubicacion");
console.log('\n4️⃣ Ya tiene complemento Carta Porte:', yaTieneCartaPorte);

// 5. Tipo de CFDI
const tipoMatch = xmlContent.match(/TipoDeComprobante="([^"]+)"/);
const tipoCFDI = tipoMatch ? tipoMatch[1] : 'NO ENCONTRADO';
console.log('\n5️⃣ Tipo de CFDI:', tipoCFDI);

// RESULTADO FINAL SEGÚN LÓGICA ACTUAL
console.log('\n' + '='.repeat(60));
console.log('EVALUACIÓN SEGÚN LÓGICA ACTUAL:\n');

let requiere = "NO";
const esIngreso = tipoCFDI === "I";

if (esIngreso) {
  if (tieneCveTransporte && tieneDescTransporte && tieneReferenciaRuta) {
    requiere = "SÍ";
    console.log('❌ Requiere Carta Porte: SÍ (cumple las 3 condiciones)');
  } else {
    requiere = "NO";
    console.log('✅ Requiere Carta Porte: NO');
    if (!tieneCveTransporte) console.log('   - Falta: Clave de transporte');
    if (!tieneDescTransporte) console.log('   - Falta: Descripción de transporte');
    if (!tieneReferenciaRuta) console.log('   - Falta: Referencia de ruta');
  }
}

console.log('\n' + '='.repeat(60));
