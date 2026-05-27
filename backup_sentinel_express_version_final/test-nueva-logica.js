import fs from 'fs';

const xmlPath = './test-xmls/693957F0-2141-4116-A373-C4EDEC85AF82.xml';
const xmlContent = fs.readFileSync(xmlPath, 'utf-8');

console.log('🔍 PRUEBA CON NUEVA LÓGICA ULTRA ESTRICTA\n');
console.log('='.repeat(60));

// Nueva lógica: Claves muy específicas
const tieneCveTransporte = /ClaveProdServ="78101[78]\d{2}|78102\d{3}|80101[78]\d{2}|81101[78]\d{2}"/i.test(xmlContent);
console.log('\n1️⃣ Clave específica de transporte físico:', tieneCveTransporte);

// Extraer clave real
const matchCve = xmlContent.match(/ClaveProdServ="(\d+)"/);
if (matchCve) {
  console.log('   Clave encontrada:', matchCve[1]);
  console.log('   78101806 coincide con 78101[78]\\d{2}:', /78101[78]\d{2}/.test(matchCve[1]));
}

// Nueva lógica: Palabras completas con \\b
const tieneDescTransporte = /Descripcion="[^"]*\b(?:servicio\s+de\s+transporte|servicios?\s+de\s+transporte|flete|acarreo|traslado\s+de\s+mercancia|autotransporte)\b[^"]*"/i.test(xmlContent);
console.log('\n2️⃣ Descripción de transporte (palabras completas):', tieneDescTransporte);

// Nueva lógica: Palabras completas con \\b
const tieneReferenciaRuta = /\b(?:origen|destino|kilometros?|ruta|via\s+federal|carretera)\b/i.test(xmlContent);
console.log('\n3️⃣ Referencia de ruta (palabras completas):', tieneReferenciaRuta);

console.log('\n' + '='.repeat(60));
console.log('RESULTADO FINAL:\n');

if (tieneCveTransporte && tieneDescTransporte && tieneReferenciaRuta) {
  console.log('❌ Requiere Carta Porte: SÍ (cumple las 3 condiciones)');
} else {
  console.log('✅ Requiere Carta Porte: NO');
  if (!tieneCveTransporte) console.log('   - NO cumple: Clave de producto específica');
  if (!tieneDescTransporte) console.log('   - NO cumple: Descripción de transporte');
  if (!tieneReferenciaRuta) console.log('   - NO cumple: Referencia de ruta');
}

console.log('\n' + '='.repeat(60));
