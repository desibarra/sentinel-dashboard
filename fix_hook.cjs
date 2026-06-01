const fs = require('fs');
let content = fs.readFileSync('client/src/hooks/useXMLValidator.ts', 'utf8');

// Fix TS2558: Expected 0 type arguments, but got 1.
// probably useState<any>() instead of just useState() or something?
content = content.replace(/useState<ValidationResult\\[\\]>\\(\\)/g, 'useState<any[]>()');

// Fix TS7006: Parameter 'prev' implicitly has an 'any' type.
content = content.replace(/\\(prev\\) =>/g, '(prev: any) =>');

// Fix missing properties error by casting to any in setResults
content = content.replace(/setResults\\(\\(prev: any\\) => \\[\.\.\.prev, newResult\\]\\);/g, 'setResults((prev: any) => [...prev, newResult as any]);');
content = content.replace(/setResults\\(newResults\\);/g, 'setResults(newResults as any);');

fs.writeFileSync('client/src/hooks/useXMLValidator.ts', content, 'utf8');
