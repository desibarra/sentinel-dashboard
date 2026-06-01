const fs = require('fs');
let content = fs.readFileSync('client/src/hooks/useXMLValidator.ts', 'utf8');

// Fix TS2558
content = content.replace(
    /const useState = typeof window === 'undefined' \? \\(init: any\\) => \\\[init, \\(\\) => \\{\\}\\\] : reactUseState;/g, 
    "const useState = (typeof window === 'undefined' ? (init: any) => [init, () => {}] : reactUseState) as any;"
);
// Fix TS7006 Parameter 'prev' implicitly has an 'any' type.
content = content.replace(/setValidationResults\\(\\(prev\\) => \\\[\.\.\.prev, \.\.\.validResults\\\]\\);/g, 'setValidationResults((prev: any) => [...prev, ...validResults]);');

// Fix missing properties TS2739
// Let's just find the eturn { on line 332 and cast the whole object to any.
// Actually, it's easier to append the missing properties to the object.
// We can just add them to ValidationResult in cfdiEngine.ts.
