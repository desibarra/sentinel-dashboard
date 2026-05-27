const fs = require('fs');
let exp = fs.readFileSync('client/src/lib/excelExporter.ts', 'utf8');
exp = exp.replace(/m => m\\.ClaveProdServCP/g, '(m: any) => m.ClaveProdServCP');
exp = exp.replace(/m => m\\.descripcion/g, '(m: any) => m.descripcion');
exp = exp.replace(/rem => rem\\.Placa/g, '(rem: any) => rem.Placa');
fs.writeFileSync('client/src/lib/excelExporter.ts', exp, 'utf8');
