import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import * as xlsx from 'xlsx';

const XMLS = [
    '01_FACTURA_CORRECTA.xml',
    '02_ALERTA_EFOS_LISTA_NEGRA.xml',
    '03_ALERTA_FALTA_CARTA_PORTE.xml',
    '04_FACTURA_CON_CARTA_PORTE_OK.xml',
    '05_ERROR_TOTALES_DESCUADRE.xml',
    '06_COMPLEMENTO_PAGO_REP.xml'
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
        
        console.log('Navegando a la app local (login)...');
        await page.goto('http://localhost:5173/login');
        
        // Inject localStorage to bypass login and tour
        await page.evaluate(() => {
            localStorage.setItem("sentinel_user", JSON.stringify({ id: "admin", username: "admin", role: "admin" }));
            localStorage.setItem('has_seen_main_tour', 'true');
            localStorage.setItem("sentinel_onboarding_completed", "true");
        });

        console.log('Navegando al dashboard...');
        await page.goto('http://localhost:5173/dashboard');

        console.log('Esperando renderizado inicial...');
        await page.waitForTimeout(2000);
        
        console.log('Agregando empresa de prueba...');
        // El trigger del select dice "Seleccionar Empresa"
        await page.click('text="Seleccionar Empresa"', { force: true }).catch(() => console.log('Quizá ya hay empresa seleccionada'));
        await page.waitForTimeout(500);
        await page.click('button:has-text("Nueva Empresa")', { force: true }).catch(() => console.log('No se encontró Nueva Empresa'));
        await page.waitForTimeout(500);
        await page.fill('input#name', 'Empresa E2E').catch(() => null);
        await page.fill('input#rfc', 'E2E123456789').catch(() => null);
        await page.fill('input#giro', 'Servicios').catch(() => null);
        await page.click('button:has-text("Guardar Empresa")', { force: true }).catch(() => null);
        await page.waitForTimeout(1000);

        await page.screenshot({ path: path.join(SCRATCH_DIR, '01_pantalla_inicial.png') });

        console.log('Subiendo archivos XML...');
        const filePaths = XMLS.map(f => path.join(FIXTURES_DIR, f));
        
        // Find file input and upload
        const fileInput = await page.$('input[type="file"]');
        if (fileInput) {
            await fileInput.setInputFiles(filePaths);
            await page.waitForTimeout(1000);
            
            // Clic en "Iniciar Validación" cuando no esté deshabilitado
            const validateBtn = await page.waitForSelector('button:has-text("Iniciar Validación"):not([disabled])', { state: 'visible', timeout: 10000 }).catch(() => null);
            
            if (validateBtn) {
                await validateBtn.click();
                console.log('Botón Iniciar Validación clickeado.');
            } else {
                console.error('No se encontró el botón Iniciar Validación o estaba deshabilitado!');
                return;
            }
        } else {
            console.error('No se encontró el input de archivo!');
            return;
        }

        console.log('Esperando procesamiento...');
        await page.waitForTimeout(10000); // Dar más tiempo al procesamiento y SAT

        await page.screenshot({ path: path.join(SCRATCH_DIR, '02_resultados_visibles.png'), fullPage: true });

        console.log('Descargando Excel...');
        // Esperamos el botón de exportar (puede decir "Exportar" o "Excel")
        const exportButton = await page.waitForSelector('button:has-text("Exportar Reporte")', { state: 'visible', timeout: 45000 }).catch(async (e) => {
            console.error('Error waiting for export button. Dumping HTML...');
            const html = await page.content();
            fs.writeFileSync(path.join(SCRATCH_DIR, 'page_dump.html'), html);
            throw e;
        });
        
        if (exportButton) {
            // Empezamos a esperar la descarga antes de clickear
            const downloadPromise = page.waitForEvent('download');
            await exportButton.click({ force: true });
            
            const download = await downloadPromise;
            const downloadPath = path.join(SCRATCH_DIR, download.suggestedFilename());
            await download.saveAs(downloadPath);
            
            console.log(`Excel guardado en: ${downloadPath}`);

            // Leer excel
            const workbook = xlsx.readFile(downloadPath);
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const jsonData = xlsx.utils.sheet_to_json(sheet);

            fs.writeFileSync(path.join(SCRATCH_DIR, 'excel_data.json'), JSON.stringify(jsonData, null, 2));
            console.log(`Excel convertido a JSON. Total registros: ${jsonData.length}`);
        } else {
            console.error('No se encontró el botón de exportar!');
        }

    } catch (e) {
        console.error('Error durante la prueba E2E:', e);
    } finally {
        await browser.close();
    }
}

run();
