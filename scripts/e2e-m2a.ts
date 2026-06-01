import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import * as xlsx from 'xlsx';

const XMLS = [
    '01_FACTURA_CORRECTA.xml',
    '02_ALERTA_EFOS_LISTA_NEGRA.xml',
    '03_ALERTA_FALTA_CARTA_PORTE.xml'
];

const FIXTURES_DIR = 'c:/Users/desib/Documents/sentinel-express/tests/fixtures/demo-xmls';
const SCRATCH_DIR = 'c:/Users/desib/Documents/sentinel-express/scripts/e2e-output';

if (!fs.existsSync(SCRATCH_DIR)) {
    fs.mkdirSync(SCRATCH_DIR);
}

async function run() {
    console.log('Iniciando navegador Playwright...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();

    try {
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        
        await page.goto('http://localhost:5173/login');
        await page.evaluate(() => {
            localStorage.setItem("sentinel_user", JSON.stringify({ id: "admin", username: "admin", role: "admin" }));
            localStorage.setItem('has_seen_main_tour', 'true');
            localStorage.setItem("sentinel_onboarding_completed", "true");
        });

        await page.goto('http://localhost:5173/dashboard');
        await page.waitForTimeout(2000);

        console.log('Subiendo archivos XML...');
        const filePaths = XMLS.map(f => path.join(FIXTURES_DIR, f));
        
        const fileInput = await page.$('input[type="file"]');
        if (fileInput) {
            await fileInput.setInputFiles(filePaths);
            await page.waitForTimeout(1000);
            
            const validateBtn = await page.waitForSelector('button:has-text("Iniciar Validación"):not([disabled])', { state: 'visible', timeout: 10000 }).catch(() => null);
            
            if (validateBtn) {
                await validateBtn.click();
            } else {
                console.error('No se encontró el botón Iniciar Validación o estaba deshabilitado!');
                return;
            }
        }

        console.log('Esperando procesamiento...');
        await page.waitForTimeout(5000);

        // Interact with Módulo 2A UI
        console.log('Buscando sugerencia de RFC...');
        // The suggestion button is like: variant="outline" ... Sugerencia: XYZ
        const sugerenciaBtn = await page.waitForSelector('button:has-text("Sugerencia:")', { timeout: 5000 }).catch(() => null);
        if (sugerenciaBtn) {
            const text = await sugerenciaBtn.textContent();
            console.log('RFC Sugerido encontrado:', text);
            await sugerenciaBtn.click();
            console.log('Sugerencia clickeada');
            await page.waitForTimeout(500);
        } else {
            console.log('No se encontró botón de sugerencia');
        }

        console.log('Confirmando RFC Base...');
        const rfcInput = await page.$('input[placeholder="Ej. XAXX010101000"]');
        if (rfcInput) {
            await rfcInput.fill('LAN7008173R5'); // Emisor común
            console.log('RFC escrito');
        }
        const confirmarBtn = await page.waitForSelector('button:has-text("Confirmar RFC")', { timeout: 5000 }).catch(() => null);
        if (confirmarBtn) {
            await confirmarBtn.click();
            console.log('RFC Base confirmado');
            await page.waitForTimeout(1000);
        }

        // Leer conteos
        const getCount = async (label: string) => {
            const el = await page.waitForSelector(`p:has-text("${label}") + p`, { timeout: 2000 }).catch(() => null);
            return el ? await el.textContent() : 'N/A';
        };

        const emitidos = await getCount('Emitidos');
        const recibidos = await getCount('Recibidos');
        const ajenos = await getCount('Ajenos');
        const ambiguos = await getCount('Ambiguos');

        console.log(`Conteos -> Emitidos: ${emitidos}, Recibidos: ${recibidos}, Ajenos: ${ajenos}, Ambiguos: ${ambiguos}`);

        // Verificando columna clasificación
        const thClasificacion = await page.$('th:has-text("Clasificación")');
        console.log('Columna Clasificación presente:', !!thClasificacion);

        // Exportar Excel
        console.log('Descargando Excel...');
        const exportButton = await page.waitForSelector('button:has-text("Exportar Reporte")', { state: 'visible', timeout: 5000 }).catch(() => null);
        
        if (exportButton) {
            const downloadPromise = page.waitForEvent('download');
            await exportButton.click({ force: true });
            
            const download = await downloadPromise;
            const downloadPath = path.join(SCRATCH_DIR, download.suggestedFilename());
            await download.saveAs(downloadPath);
            
            console.log(`Excel guardado en: ${downloadPath}`);

            // Leer excel y headers
            const workbook = xlsx.readFile(downloadPath);
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const jsonData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
            
            if (jsonData.length > 9) {
                const headers = jsonData[9] as string[]; // Fila 10 de Excel (índice 9) es donde suelen estar las cabeceras en Sentinel
                const hasClasif = headers.includes('Clasificacion_M2A');
                const hasRFCBase = headers.includes('RFC_Base_M2A');
                const hasRFCContra = headers.includes('RFC_Contraparte_M2A');
                const hasRol = headers.includes('Rol_Contraparte_M2A');
                const hasTipo = headers.includes('Tipo_Financiero_M2A');
                
                console.log('Headers M2A en Excel:', { hasClasif, hasRFCBase, hasRFCContra, hasRol, hasTipo });
            } else {
                console.log('No se pudieron leer las cabeceras del Excel.');
            }
        } else {
            console.error('No se encontró el botón de exportar!');
        }

    } catch (e) {
        console.error('Error durante la prueba M2A:', e);
    } finally {
        await browser.close();
    }
}

run();
