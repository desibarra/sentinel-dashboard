const xmlContent = `Descripcion="Servicios transporte09/06/2025&#xA;DOMESTICO EUA&#xA;Load: 50812383"`;

const tieneDescTransporte = /descripcion="[^"]*(?:servicio de transporte|flete|acarreo|traslado de mercancia|autotransporte)[^"]*"/i.test(xmlContent);

console.log("Resultado regex:", tieneDescTransporte);

// Probar con "servicio" solo
const regex2 = /servicio de transporte/i.test(xmlContent);
console.log("Regex 'servicio de transporte':", regex2);

const regex3 = /servicios transporte/i.test(xmlContent);
console.log("Regex 'servicios transporte':", regex3);

// Verificar si tiene "origen|destino|kilom|ruta"
const tieneReferenciaRuta = /origen|destino|kilom|ruta|via federal/i.test(xmlContent);
console.log("Tiene referencia ruta:", tieneReferenciaRuta);
