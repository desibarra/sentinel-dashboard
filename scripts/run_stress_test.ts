import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STRESS_DIR = path.resolve(__dirname, '../stress-xmls');

import { spawn } from 'child_process';
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runTest() {
    console.log("=== STARTING SERVER ===");
    const serverProcess = spawn('npm', ['run', 'dev'], {
        stdio: 'pipe',
        shell: true
    });

    let serverReady = false;
    serverProcess.stdout.on('data', (data) => {
        const msg = data.toString();
        if (msg.includes('Local:') || msg.includes('localhost:5000')) {
            serverReady = true;
        }
    });
    
    serverProcess.stderr.on('data', (data) => {
        console.error(`[SERVER ERR]: ${data}`);
    });

    console.log("Waiting for server to start...");
    let waits = 0;
    while (!serverReady && waits < 10) {
        await delay(1000);
        waits++;
    }

    console.log("=== STARTING STRESS TEST ===");
    
    const filesDir = STRESS_DIR;
    if (!fs.existsSync(filesDir)) {
        console.error("Stress directory not found. Please run generate_stress_xmls.ts first.");
        process.exit(1);
    }
    const fileNames = fs.readdirSync(filesDir).filter(f => f.endsWith('.xml'));
    console.log(`Found ${fileNames.length} XML files for stress testing.`);

    const filePaths = fileNames.map(f => path.join(filesDir, f));

    console.log("=== LAUNCHING BROWSER ===");
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        acceptDownloads: true
    });
    
    const page = await context.newPage();
    
    // Auth bypass
    const jwtModule = await import('jsonwebtoken');
    const jwt = jwtModule.default || jwtModule;
    const token = jwt.sign({ id: "stress-test-user", username: "admin", role: "admin" }, "sentinel-super-secret-key-2024", { expiresIn: '1h' });
    await context.addCookies([
        {
            name: 'auth_token',
            value: token,
            domain: 'localhost',
            path: '/'
        }
    ]);
    
    await page.goto('http://localhost:5000/login', { waitUntil: 'load' });
    
    await page.evaluate(async () => {
        localStorage.setItem('sentinel_user', JSON.stringify({ id: "stress-test-user", username: "admin", role: "admin" }));
        localStorage.setItem('has_seen_main_tour', 'true');
        localStorage.setItem('last_company_id', 'company-stress');
        return new Promise((resolve, reject) => {
            const req = indexedDB.open('SentinelAppLocalDB', 1);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('companies')) db.createObjectStore('companies', { keyPath: 'id' });
                if (!db.objectStoreNames.contains('history')) {
                    const historyStore = db.createObjectStore('history', { keyPath: 'id' });
                    historyStore.createIndex('by-company', 'companyId');
                }
            };
            req.onsuccess = (e) => {
                const db = e.target.result;
                const tx = db.transaction('companies', 'readwrite');
                tx.objectStore('companies').put({
                    id: 'company-stress',
                    name: 'Empresa Stress Test S.A. de C.V.',
                    rfc: 'STR123456789',
                    giro: 'Pruebas',
                    createdAt: Date.now()
                });
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            };
        });
    });

    console.log("Navigating to Dashboard...");
    await page.goto('http://localhost:5000/', { waitUntil: 'networkidle' });
    
    // UI selection
    console.log("Selecting company...");
    await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const trigger = btns.find(b => b.textContent && b.textContent.includes('Seleccionar Empresa'));
        if (trigger) trigger.click();
    });
    await delay(500);
    await page.evaluate(() => {
        const options = Array.from(document.querySelectorAll('[role="option"]'));
        if (options.length > 0) options[0].click();
    });
    await delay(1000);

    const fileInput = await page.$('input[type="file"]');
    if (!fileInput) {
        console.error("File input not found!");
        await browser.close();
        process.exit(1);
    }

    console.log(`Uploading ${filePaths.length} files... This might take a while.`);
    
    // Chunk the uploads to avoid crashing the browser IPC immediately
    const chunkSize = 500;
    for (let i = 0; i < filePaths.length; i += chunkSize) {
        const chunk = filePaths.slice(i, i + chunkSize);
        console.log(`Uploading chunk ${i / chunkSize + 1} (${chunk.length} files)...`);
        await fileInput.setInputFiles(chunk);
        await delay(2000); // Wait for the chunk to be processed by dropzone
    }
    
    console.log("Waiting for files to be parsed (FileReader)...");
    
    let isButtonEnabled = false;
    let retries = 0;
    while (!isButtonEnabled && retries < 300) {
        isButtonEnabled = await page.evaluate(() => {
            const btn = document.querySelector('button.bg-green-600');
            return btn && !btn.disabled && btn.textContent.includes('Iniciar Validación');
        });
        if (!isButtonEnabled) {
            await delay(2000);
            retries++;
            // Monitor memory occasionally
            const perfMemory = await page.evaluate(() => {
                if (performance.memory) return performance.memory.usedJSHeapSize / 1024 / 1024;
                return 0;
            });
            console.log(`Waiting for parsing to finish... Browser JS Heap roughly: ${perfMemory.toFixed(2)} MB`);
        }
    }

    if (!isButtonEnabled) {
        console.error("Timeout waiting for 'Iniciar Validación' button.");
        await browser.close();
        process.exit(1);
    }

    console.log("Clicking Iniciar Validación...");
    const startTime = Date.now();
    await page.evaluate(() => {
        const btn = document.querySelector('button.bg-green-600');
        if (btn && btn.textContent.includes('Iniciar Validación')) {
            btn.click();
        }
    });

    console.log("Waiting for validation to finish (Exportar Reporte visible)...");
    const exportBtnLocator = page.getByRole('button', { name: /Exportar Reporte/i });
    
    try {
        await exportBtnLocator.waitFor({ state: 'visible', timeout: 300000 }); // 5 minutes timeout for 2000 XMLs
        const validationTime = Date.now() - startTime;
        console.log(`Validation finished in ${validationTime}ms!`);
        
        console.log("Downloading Excel...");
        const downloadPromise = page.waitForEvent('download');
        await exportBtnLocator.click();
        const download = await downloadPromise;
        const finalPath = path.resolve(__dirname, '../stress_test_export.xlsx');
        await download.saveAs(finalPath);
        
        const stats = fs.statSync(finalPath);
        console.log(`Excel downloaded to ${finalPath} (Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
        
        console.log("=== STRESS TEST COMPLETED SUCCESSFULLY ===");
    } catch (e) {
        console.error("Test failed!", e);
    }

    await browser.close();
}

runTest().catch(console.error);
