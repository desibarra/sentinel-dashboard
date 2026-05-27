import fs from 'fs';
let content = fs.readFileSync('client/src/lib/excelExporter.ts', 'utf8');
content = content.replace(/'SI '/g, "'SI'");
content = content.replace(/"SI "/g, '"SI"');
fs.writeFileSync('client/src/lib/excelExporter.ts', content);

let contentEngine = fs.readFileSync('client/src/lib/cfdiEngine.ts', 'utf8');
contentEngine = contentEngine.replace(/'SI '/g, "'SI'");
contentEngine = contentEngine.replace(/"SI "/g, '"SI"');
fs.writeFileSync('client/src/lib/cfdiEngine.ts', contentEngine);
console.log('Fixed SI spaces');
