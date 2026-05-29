const fs = require('fs');
let exp = fs.readFileSync('client/src/lib/excelExporter.ts', 'utf8');

// Fix Concepto syntax errors
exp = exp.replace(/Concepto: r.desglosePorConcepto \\? Array\\.from\\(new Set\\(r\\.desglosePorConcepto\\.map\\(c => c\\.descripcion\\)\\)\\)\\.join\\(' \\| '\\) :\\r?\\n\\s*Subtotal:/g, 
"Concepto: r.desglosePorConcepto ? Array.from(new Set(r.desglosePorConcepto.map(c => c.descripcion))).join(' | ') : 'NO VIENE EN XML',\\n    Subtotal:");

exp = exp.replace(/Concepto: r.desglosePorConcepto \\? Array\\.from\\(new Set\\(r\\.desglosePorConcepto\\.map\\(c => c\\.descripcion\\)\\)\\)\\.join\\(' \\| '\\) :\\r?\\n\\s*IVA_Acreditable:/g, 
"Concepto: r.desglosePorConcepto ? Array.from(new Set(r.desglosePorConcepto.map(c => c.descripcion))).join(' | ') : 'NO VIENE EN XML',\\n    IVA_Acreditable:");

// Remove duplicates in dataTasa0
exp = exp.replace(/Origen: r\\.trazabilidadInfo\\?\\.tieneOrigen \\|\\| 'NO VIENE EN XML',\\r?\\n\\s*Destino: r\\.trazabilidadInfo\\?\\.tieneDestino \\|\\| 'NO VIENE EN XML',/g, "");

fs.writeFileSync('client/src/lib/excelExporter.ts', exp, 'utf8');
