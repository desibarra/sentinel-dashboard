const fs = require('fs');
let c = fs.readFileSync('client/src/lib/excelExporter.ts', 'utf8');
c = c.replace(/Tipo relaci.n CFDI/g, 'Tipo relacion CFDI');
c = c.replace(/\? 'S[^']+' : 'NO'/g, "? 'SI' : 'NO'");
c = c.replace(/Versi.n Carta Porte/g, 'Version Carta Porte');
c = c.replace(/Observaci.n t.cnica/g, 'Observacion tecnica');
fs.writeFileSync('client/src/lib/excelExporter.ts', c, 'utf8');
