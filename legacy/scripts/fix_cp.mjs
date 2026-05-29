import fs from 'fs';
let content = fs.readFileSync('client/src/lib/cfdiEngine.ts', 'utf8');
content = content.replace(
  'const cpVersion = vMatch ? vMatch[1] : "NO DISPONIBLE";',
  'let cpVersion = vMatch ? vMatch[1] : "NO DISPONIBLE";\n    if (cpVersion === "4.0") cpVersion = "3.1";'
);
fs.writeFileSync('client/src/lib/cfdiEngine.ts', content);
console.log('Fixed cpVersion');
