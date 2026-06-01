const fs = require('fs');
let content = fs.readFileSync('client/src/hooks/useXMLValidator.ts', 'utf8');

content = content.replace(/useState<ValidationResult\\[\\]>\\(\\[\\]\\)/g, 'useState([])');

fs.writeFileSync('client/src/hooks/useXMLValidator.ts', content, 'utf8');
