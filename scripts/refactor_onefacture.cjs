const fs = require('fs');

function refactorFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf-8');
    
    // replacements
    content = content.replace(/OneFacture/g, 'Externa');
    content = content.replace(/oneFacture/g, 'externa');
    content = content.replace(/onefacture/g, 'externa');
    content = content.replace(/ofLeidos/g, 'extLeidos');
    content = content.replace(/ofUnicos/g, 'extUnicos');
    content = content.replace(/ofPrincipal/g, 'extPrincipal');
    content = content.replace(/ofRelacionado/g, 'extRelacionado');
    content = content.replace(/ofNoLocalizado/g, 'extNoLocalizado');
    content = content.replace(/ofUuid/g, 'extUuid');
    content = content.replace(/Homologacion_Externa/g, 'Homologacion_Externa'); // case preserved
    content = content.replace(/Cruce_Externa/g, 'Cruce_XML_Referencia');
    content = content.replace(/Validacion_Externa/g, 'Validacion_Tecnica_Externa');
    content = content.replace(/ONEFACTURE/g, 'EXTERNA');

    fs.writeFileSync(filePath, content, 'utf-8');
    console.log('Refactored ' + filePath);
}

refactorFile('client/src/lib/excelExporter.ts');
refactorFile('client/src/pages/Dashboard.tsx');
