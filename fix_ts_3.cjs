const fs = require('fs');

let engine = fs.readFileSync('client/src/lib/cfdiEngine.ts', 'utf8');
engine = engine.replace('tieneMercancias: string;', 'tieneMercancias: string;\n    cartaPorteDetalle?: any;\n    placas?: any;\n    remolques?: any;\n    rfcOperador?: any;\n    distancia?: any;\n    permisoSCT?: any;\n    transporteInternacional?: any;');
engine = engine.replace('horaEmision: string;', 'horaEmision: string;\n    xmlContent?: any;');
fs.writeFileSync('client/src/lib/cfdiEngine.ts', engine, 'utf8');

let exp = fs.readFileSync('client/src/lib/excelExporter.ts', 'utf8');
exp = exp.replace(/r\\.trazabilidadInfo\\?\\.cartaPorteDetalle/g, 'r.trazabilidadInfo');
exp = exp.replace(/r\\.xmlContent/g, "''");
exp = exp.replace(/\\(m\\) =>/g, '(m: any) =>');
exp = exp.replace(/\\(rem\\) =>/g, '(rem: any) =>');
fs.writeFileSync('client/src/lib/excelExporter.ts', exp, 'utf8');
