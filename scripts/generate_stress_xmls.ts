import fs from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEMO_DIR = path.resolve(__dirname, '../demo-xmls');
const STRESS_DIR = path.resolve(__dirname, '../stress-xmls');

function generateUUID() {
    // Generate format: XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
    const hex = () => Math.floor(Math.random() * 16).toString(16).toUpperCase();
    const segment = (len) => Array(len).fill(0).map(hex).join('');
    return `${segment(8)}-${segment(4)}-${segment(4)}-${segment(4)}-${segment(12)}`;
}

function getRandomDemoFiles() {
    return fs.readdirSync(DEMO_DIR).filter(f => f.endsWith('.xml'));
}

async function main() {
    const TOTAL_XMLS = 2000;
    
    if (fs.existsSync(STRESS_DIR)) {
        fs.rmSync(STRESS_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(STRESS_DIR, { recursive: true });

    const demoFiles = getRandomDemoFiles();
    if (demoFiles.length === 0) {
        console.error("No demo XMLs found to use as templates.");
        process.exit(1);
    }

    const templates = demoFiles.map(file => {
        return {
            name: file,
            content: fs.readFileSync(path.join(DEMO_DIR, file), 'utf-8')
        };
    });

    console.log(`Loaded ${templates.length} templates. Generating ${TOTAL_XMLS} XMLs...`);

    let errorCount = 0;
    for (let i = 1; i <= TOTAL_XMLS; i++) {
        // Pick a random template
        const template = templates[Math.floor(Math.random() * templates.length)];
        let content = template.content;

        // Mutate UUID
        const newUUID = generateUUID();
        // Replace UUIDs (often found in TimbreFiscalDigital or elsewhere)
        content = content.replace(/UUID="[A-Fa-f0-9\-]+"/g, `UUID="${newUUID}"`);
        
        // Mutate some random attributes to ensure variety
        // Modify SubTotal / Total slightly randomly
        content = content.replace(/Total="(\d+\.?\d*)"/g, (match, p1) => {
            const original = parseFloat(p1);
            const newTotal = (original + Math.random() * 100).toFixed(2);
            return `Total="${newTotal}"`;
        });

        content = content.replace(/SubTotal="(\d+\.?\d*)"/g, (match, p1) => {
            const original = parseFloat(p1);
            const newTotal = (original + Math.random() * 100).toFixed(2);
            return `SubTotal="${newTotal}"`;
        });

        // 5% chance of corrupting the file
        if (Math.random() < 0.05) {
            errorCount++;
            if (Math.random() < 0.5) {
                // Truncate
                content = content.substring(0, Math.floor(content.length / 2));
            } else {
                // Break a tag
                content = content.replace('cfdi:Comprobante', 'cfdi:Comprobante_BROKEN');
            }
        }

        const fileName = `stress_${i.toString().padStart(4, '0')}_${newUUID.substring(0,8)}.xml`;
        fs.writeFileSync(path.join(STRESS_DIR, fileName), content);
    }

    console.log(`Generated ${TOTAL_XMLS} XML files in ${STRESS_DIR}.`);
    console.log(`Corrupted files introduced: ${errorCount}`);
}

main().catch(console.error);
