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
        page.on('console', msg => {
            console.log('PAGE LOG:', msg.text())
        });
        
        await page.goto('http://localhost:5173/login');
        await page.evaluate(() => {
            localStorage.setItem("sentinel_user", JSON.stringify({ id: "admin", username: "admin", role: "admin" }));
            localStorage.setItem('has_seen_main_tour', 'true');
            localStorage.setItem("sentinel_onboarding_completed", "true");
        });

        await page.goto('http://localhost:5173/dashboard');
        await page.waitForTimeout(2000);

        console.log('Agregando empresa de prueba...');
        await page.click('text="Seleccionar Empresa"', { force: true }).catch(() => console.log('Quizá ya hay empresa seleccionada'));
        await page.waitForTimeout(500);
        await page.click('button:has-text("Nueva Empresa")', { force: true }).catch(() => console.log('No se encontró Nueva Empresa'));
        await page.waitForTimeout(500);
        await page.fill('input#name', 'Empresa E2E').catch(() => null);
        await page.fill('input#rfc', 'E2E123456789').catch(() => null);
        await page.fill('input#giro', 'Servicios').catch(() => null);
        await page.click('button:has-text("Guardar Empresa")', { force: true }).catch(() => null);
        await page.waitForTimeout(1000);

        console.log('Subiendo archivos XML...');
        const xmlFilesOnly = [
            '06_COMPLEMENTO_PAGO_REP.xml'
        ];
        const filePaths = xmlFilesOnly.map(f => path.join(FIXTURES_DIR, f));
        
        const fileInput = await page.$('input[type="file"]');
        if (fileInput) {
            await fileInput.setInputFiles(filePaths);
            await page.waitForTimeout(1000);
            
            const validateBtn = await page.waitForSelector('button:has-text("Iniciar Validación"):not([disabled])', { state: 'visible', timeout: 10000 }).catch(() => null);
            
            if (validateBtn) {
                // Evitar problemas de overlays
                await page.evaluate(() => {
                    const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Iniciar Validación'));
                    if(btn) btn.click();
                });
            } else {
                console.error('No se encontró el botón Iniciar Validación o estaba deshabilitado!');
                return;
            }
        }

        console.log('Esperando procesamiento...');
        await page.waitForTimeout(5000);

        console.log('Confirmando RFC Base (Módulo 2A)...');
        const rfcInput = await page.$('input[placeholder="Ej. XAXX010101000"]');
        if (rfcInput) {
            await rfcInput.fill('LAN7008173R5'); // Emisor común
        }
        await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Confirmar RFC'));
            if(btn) btn.click();
        });
        await page.waitForTimeout(1000);

        console.log('Descargando Excel...');
        const exportButton = await page.waitForSelector('button:has-text("Exportar Reporte")', { state: 'visible', timeout: 5000 }).catch(() => null);
        
        if (exportButton) {
            const downloadPromise = page.waitForEvent('download');
            await page.evaluate(() => {
                const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Exportar Reporte'));
                if(btn) btn.click();
            });
            
            const download = await downloadPromise;
            const downloadPath = path.join(SCRATCH_DIR, 'sentinel_export_test.xlsx');
            if(fs.existsSync(downloadPath)) fs.unlinkSync(downloadPath);
            await download.saveAs(downloadPath);
            
            console.log(`Excel guardado en: ${downloadPath}`);

            // Validar Excel
            const workbook = xlsx.readFile(downloadPath);
            console.log(`Hojas en Excel (${workbook.SheetNames.length}):`, workbook.SheetNames);
            
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const jsonData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
            
            if (jsonData.length > 9) {
                const headers = jsonData[9] as string[]; // Fila 10
                const colChecks = [
                    'Descuento_Global',
                    'Descuento_Conceptos',
                    'Diferencia_Descuento',
                    'CondicionesDePago'
                ];
                
                console.log('Verificando columnas principales:');
                colChecks.forEach(c => {
                    console.log(` - ${c}: ${headers.includes(c) ? 'PRESENTE' : 'AUSENTE'}`);
                });

            } else {
                console.log('No se pudieron leer las cabeceras del Excel.');
            }

            // check rows
            const rows = xlsx.utils.sheet_to_json(sheet, { range: 9 }) as any[];
            console.log(`Filas de datos extraídas: ${rows.length}`);
            
            rows.forEach((r, idx) => {
                if (r.Tipo_CFDI === 'P') {
                    console.log(`- Fila ${idx+1} [REP]: Estatus_SAT = ${r.Estatus_SAT} (Debe decir NO APLICA / no Vigente si no fue checkeado)`);
                }
                if (r.Tipo_CFDI === 'E') {
                    console.log(`- Fila ${idx+1} [Egreso]: Accion_Recomendada = ${r.Accion_Recomendada}`);
                }
            });

        } else {
            const bodyText = await page.evaluate(() => document.body.innerText);
            console.error('No se encontró el botón de exportar! Texto actual:', bodyText.substring(0, 500));
        }

    } catch (e) {
        console.error('Error durante la prueba M2A:', e);
    } finally {
        await browser.close();
    }
}

run();
