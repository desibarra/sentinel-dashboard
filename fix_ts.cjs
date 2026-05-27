const fs = require('fs');
let hook = fs.readFileSync('client/src/hooks/useXMLValidator.ts', 'utf8');
hook = hook.replace(/rawXmlContent,\\r?\\n/, '');
fs.writeFileSync('client/src/hooks/useXMLValidator.ts', hook, 'utf8');

let exp = fs.readFileSync('client/src/lib/excelExporter.ts', 'utf8');
exp = exp.replace(/r\\.trazabilidadInfo\\?\\.cartaPorteDetalle\\?\\.presente/g, "r.trazabilidadInfo?.tieneCartaPorte");
exp = exp.replace(/r\\.xmlContent \\?/g, "'' ?");
exp = exp.replace(/m => m\\.ClaveProdServCP/g, "(m: any) => m.ClaveProdServCP");
exp = exp.replace(/rem => rem\\.Placa/g, "(rem: any) => rem.Placa");
exp = exp.replace(/fig, index/g, "fig: any, index: any");
exp = exp.replace(/\\(m\\) => \\{/g, "(m: any) => {");
exp = exp.replace(/remolque =>/g, "(remolque: any) =>");
exp = exp.replace(/mercancia, index/g, "mercancia: any, index: any");
fs.writeFileSync('client/src/lib/excelExporter.ts', exp, 'utf8');
