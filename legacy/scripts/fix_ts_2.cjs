const fs = require('fs');
let hook = fs.readFileSync('client/src/hooks/useXMLValidator.ts', 'utf8');
hook = hook.replace(/\\s*rawXmlContent,\\r?\\n/, '');
hook = hook.replace(/rawXmlContent:/g, '// rawXmlContent:');
fs.writeFileSync('client/src/hooks/useXMLValidator.ts', hook, 'utf8');

let exp = fs.readFileSync('client/src/lib/excelExporter.ts', 'utf8');
exp = exp.replace(/r\\.trazabilidadInfo\\?\\.cartaPorteDetalle/g, "r.trazabilidadInfo");
exp = exp.replace(/r\\.xmlContent/g, "''");
exp = exp.replace(/\\(m\\) => /g, "(m: any) => ");
exp = exp.replace(/\\(rem\\) => /g, "(rem: any) => ");
fs.writeFileSync('client/src/lib/excelExporter.ts', exp, 'utf8');
