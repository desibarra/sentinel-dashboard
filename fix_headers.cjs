const fs = require('fs');
let c = fs.readFileSync('client/src/lib/excelExporter.ts', 'utf8');
c = c.replace(/'Tipo relacion CFDI':/g, 'Tipo relacion':);
c = c.replace(/'Tiene Carta Porte principal':/g, 'Tiene Complemento Carta Porte principal':);
c = c.replace(/'Version Carta Porte principal':/g, 'Version Carta Porte':);
c = c.replace(/'Tiene Carta Porte relacionada':/g, 'Tiene Complemento Carta Porte relacionado':);
c = c.replace(/con Carta Porte/g, con Complemento Carta Porte);
c = c.replace(/sin Carta Porte/g, sin Complemento Carta Porte);
fs.writeFileSync('client/src/lib/excelExporter.ts', c, 'utf8');
