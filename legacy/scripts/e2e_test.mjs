import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import * as XLSX from 'xlsx';
import { spawn } from 'child_process';
import jwt from 'jsonwebtoken';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import { nanoid } from 'nanoid';
import bcrypt from 'bcryptjs';

const delay = ms => new Promise(res => setTimeout(res, ms));

async function runTest() {
    console.log("=== SEEDING DB ===");
    fs.mkdirSync(path.resolve('./data'), { recursive: true });
    const dbPath = path.resolve('./data/sentinel.db');
    const db = await open({ filename: dbPath, driver: sqlite3.Database });
    
    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        created_at INTEGER
      );
    `);
    await db.run(`DELETE FROM users WHERE username = 'admin'`);
    const hash = await bcrypt.hash('admin123', 10);
    const adminId = 'admin-e2e-id';
    await db.run(`INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)`,
       [adminId, 'admin', hash, 'admin', Date.now()]
    );
    await db.run(`DELETE FROM companies WHERE user_id = ?`, [adminId]);
    await db.run(`INSERT INTO companies (id, user_id, name, rfc, giro, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
       ['company-e2e-id', adminId, 'Empresa Demo S.A. de C.V.', 'DEMO123456789', 'Tecnología', Date.now()]
    );
    await db.close();

    console.log("=== STARTING SERVER ===");
    // Generate valid admin token
    const token = jwt.sign({ userId: 'admin-e2e-id', role: 'admin' }, 'supersecret', { expiresIn: '1h' });

    // Start express server with secret
    const server = spawn('node', ['dist/index.js'], {
        stdio: 'pipe',
        shell: true,
        env: { ...process.env, JWT_SECRET: 'supersecret', PORT: '5000' }
    });

    server.stdout.on('data', data => console.log(`[SERVER]: ${data}`));
    server.stderr.on('data', data => console.log(`[SERVER ERR]: ${data}`));

    // Wait for server to be ready
    console.log("Waiting for server to start (5 seconds)...");
    await delay(5000);

    console.log("=== LAUNCHING BROWSER ===");
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();

    try {
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

        console.log("Injecting auth to bypass login...");
        await context.addCookies([
            {
                name: 'auth_token',
                value: token,
                domain: 'localhost',
                path: '/'
            }
        ]);
        
        await page.goto('http://localhost:5000/login', { waitUntil: 'load' });
        await page.evaluate(() => {
            localStorage.setItem('sentinel_user', JSON.stringify({ id: "admin-e2e-id", username: "admin", role: "admin" }));
            localStorage.setItem('has_seen_main_tour', 'true');
            localStorage.setItem('last_company_id', 'company-e2e-id');
        });

        await page.evaluate(async () => {
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
                        id: 'company-e2e-id',
                        name: 'Empresa Demo S.A. de C.V.',
                        rfc: 'DEMO123456789',
                        giro: 'Tecnología',
                        createdAt: Date.now()
                    });
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => reject(tx.error);
                };
            });
        });

        console.log("Navigating to Dashboard...");
        await page.goto('http://localhost:5000/', { waitUntil: 'networkidle' });

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

        // Collect files to upload
        const filesDir = './demo-xmls';
        const fileNames = fs.readdirSync(filesDir).filter(f => f.endsWith('.xml'));
        const filePaths = fileNames.map(f => path.join(filesDir, f));

        console.log(`Uploading ${filePaths.length} files...`);

        // Upload
        const fileInput = await page.locator('input[type="file"]');
        await fileInput.setInputFiles(filePaths);

        console.log("Waiting for files to be processed by FileReader...");
        await delay(2000);

        console.log("Waiting for button to be enabled...");
        await page.waitForFunction(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const btn = btns.find(b => b.textContent && b.textContent.includes('Iniciar Validación'));
            return btn && !btn.disabled;
        }, { timeout: 10000 });

        await page.screenshot({ path: 'debug_enabled.png' });

        console.log("Clicking Iniciar Validación...");
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const btn = btns.find(b => b.textContent && b.textContent.includes('Iniciar Validación'));
            if (btn) btn.click();
        });

        console.log("Waiting for validation to finish...");
        // Wait for a text that indicates completion.
        const exportBtn = page.getByRole('button', { name: /Exportar Reporte/i });
        await exportBtn.waitFor({ state: 'visible', timeout: 30000 });

        console.log("Validation finished! Downloading Excel...");
        const downloadPromise = page.waitForEvent('download');
        await exportBtn.click({ force: true });
        const download = await downloadPromise;

        const downloadPath = path.resolve('./dashboard_real_export.xlsx');
        await download.saveAs(downloadPath);
        console.log(`Excel downloaded to ${downloadPath}`);

        console.log("=== VERIFYING EXCEL ===");
        const wb = XLSX.read(fs.readFileSync(downloadPath), { type: 'buffer' });
        console.log("Hojas presentes:", wb.SheetNames.join(", "));

        const forenseData = XLSX.utils.sheet_to_json(wb.Sheets['DETALLE FORENSE POR CFDI'] || wb.Sheets[wb.SheetNames[0]]);
        console.log("\\nFilas en hoja Forense:");
        forenseData.forEach(r => {
            console.log(`- UUID: ${r.UUID}, Tipo: ${r.Tipo_CFDI}, Descuento_Global: ${r.Descuento_Global}, Descuento_Conceptos: ${r.Descuento_Conceptos}, Diff: ${r.Diferencia_Descuento}, CondPago: ${r.CondicionesDePago}, Total: ${r.Total}, EstatusSAT: ${r.Estatus_SAT}, Resultado: ${r.Resultado}`);
        });

        const conceptosData = XLSX.utils.sheet_to_json(wb.Sheets['DETALLE CONCEPTOS XML']);
        if (conceptosData) {
            console.log("\\nMuestra Conceptos:");
            conceptosData.slice(0, 3).forEach(r => console.log(`- UUID: ${r.UUID}, Concepto: ${r.Concepto}, Importe: ${r.Importe}`));
        } else {
            console.log("No se encontró DETALLE CONCEPTOS XML");
        }

        console.log("\\n=== TEST FINALIZADO CORRECTAMENTE ===");

    } catch (e) {
        console.error("Test failed!", e);
    } finally {
        await browser.close();
        server.kill();
        process.exit(0);
    }
}

runTest();
