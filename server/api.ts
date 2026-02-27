import express, { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { getDB } from "./db.js";
import { generateToken, authMiddleware } from "./auth.js";
import { nanoid } from "nanoid";

import axios from "axios";
export const apiRouter = express.Router();

// -- AUTH ROUTES --
apiRouter.post("/auth/login", async (req: Request, res: Response) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Missing fields" });

    const db = await getDB();
    const user = await db.get("SELECT * FROM users WHERE username = ?", [username]);

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
        return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = generateToken(user.id, user.role);
    res.cookie("auth_token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({ id: user.id, username: user.username, role: user.role });
});

apiRouter.post("/auth/logout", (_req: Request, res: Response) => {
    res.clearCookie("auth_token");
    res.json({ success: true });
});

apiRouter.get("/auth/me", authMiddleware, async (req: Request, res: Response) => {
    const userReq = (req as any).user;
    const db = await getDB();
    const user = await db.get("SELECT id, username, role FROM users WHERE id = ?", [userReq.userId]);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
});

// All routes below require auth
apiRouter.use(authMiddleware);

// -- USERS ROUTES (ADMIN ONLY) --
apiRouter.get("/users", async (req: Request, res: Response) => {
    const userReq = (req as any).user;
    if (userReq.role !== "admin") return res.status(403).json({ error: "Forbidden" });

    const db = await getDB();
    const users = await db.all("SELECT id, username, role, created_at FROM users");
    res.json(users);
});

apiRouter.post("/users", async (req: Request, res: Response) => {
    const userReq = (req as any).user;
    if (userReq.role !== "admin") return res.status(403).json({ error: "Forbidden" });

    const { username, password, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Missing fields" });

    const db = await getDB();
    const existing = await db.get("SELECT id FROM users WHERE username = ?", [username]);
    if (existing) return res.status(409).json({ error: "Username already exists" });

    const passwordHash = await bcrypt.hash(password, 10);
    const newId = nanoid();

    await db.run(
        "INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
        [newId, username, passwordHash, role || "user", Date.now()]
    );

    res.json({ success: true, user: { id: newId, username, role: role || "user" } });
});

apiRouter.delete("/users/:id", async (req: Request, res: Response) => {
    const userReq = (req as any).user;
    if (userReq.role !== "admin") return res.status(403).json({ error: "Forbidden" });

    const { id } = req.params;
    if (id === userReq.userId) return res.status(400).json({ error: "Cannot delete yourself" });

    const db = await getDB();
    await db.run("DELETE FROM users WHERE id = ?", [id]);
    res.json({ success: true });
});

// -- COMPANIES ROUTES --
apiRouter.get("/companies", async (req: Request, res: Response) => {
    const userReq = (req as any).user;
    const db = await getDB();
    const companies = await db.all("SELECT * FROM companies WHERE user_id = ?", [userReq.userId]);
    // Convert timestamps back to numbers and create app-friendly format
    res.json(companies.map(c => ({
        id: c.id,
        name: c.name,
        rfc: c.rfc,
        giro: c.giro,
        createdAt: c.created_at
    })));
});

apiRouter.post("/companies", async (req: Request, res: Response) => {
    const userReq = (req as any).user;
    const { id, name, rfc, giro, createdAt } = req.body;
    const db = await getDB();

    await db.run(
        "INSERT INTO companies (id, user_id, name, rfc, giro, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        [id || nanoid(), userReq.userId, name, rfc, giro, createdAt || Date.now()]
    );

    res.json({ success: true });
});

apiRouter.delete("/companies/:id", async (req: Request, res: Response) => {
    const userReq = (req as any).user;
    const { id } = req.params;
    const db = await getDB();

    const company = await db.get("SELECT * FROM companies WHERE id = ? AND user_id = ?", [id, userReq.userId]);
    if (!company) return res.status(404).json({ error: "Company not found" });

    await db.run("DELETE FROM companies WHERE id = ?", [id]);
    res.json({ success: true });
});

// -- HISTORY ROUTES --
apiRouter.get("/history/:companyId", async (req: Request, res: Response) => {
    const userReq = (req as any).user;
    const { companyId } = req.params;
    const db = await getDB();

    // Verify company belongs to user
    const company = await db.get("SELECT id FROM companies WHERE id = ? AND user_id = ?", [companyId, userReq.userId]);
    if (!company) return res.status(404).json({ error: "Company not found" });

    const history = await db.all("SELECT * FROM history WHERE company_id = ?", [companyId]);

    res.json(history.map(h => ({
        id: h.id,
        companyId: h.company_id,
        timestamp: h.timestamp,
        fileName: h.file_name,
        xmlCount: h.xml_count,
        usableCount: h.usable_count,
        alertCount: h.alert_count,
        errorCount: h.error_count,
        totalAmount: h.total_amount,
        results: JSON.parse(h.results || "[]"),
        globalNotes: h.global_notes
    })));
});

apiRouter.post("/history", async (req: Request, res: Response) => {
    const userReq = (req as any).user;
    const {
        id, companyId, timestamp, fileName, xmlCount, usableCount,
        alertCount, errorCount, totalAmount, results, globalNotes
    } = req.body;
    const db = await getDB();

    // Verify company belongs to user
    const company = await db.get("SELECT id FROM companies WHERE id = ? AND user_id = ?", [companyId, userReq.userId]);
    if (!company) return res.status(404).json({ error: "Company not found" });

    await db.run(
        `INSERT INTO history (id, user_id, company_id, timestamp, file_name, xml_count,
      usable_count, alert_count, error_count, total_amount, results, global_notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            id || nanoid(), userReq.userId, companyId, timestamp, fileName, xmlCount,
            usableCount, alertCount, errorCount, totalAmount, JSON.stringify(results || []), globalNotes
        ]
    );

    res.json({ success: true });
});

apiRouter.delete("/history/:id", async (req: Request, res: Response) => {
    const userReq = (req as any).user;
    const { id } = req.params;
    const db = await getDB();

    const history = await db.get("SELECT * FROM history WHERE id = ? AND user_id = ?", [id, userReq.userId]);
    if (!history) return res.status(404).json({ error: "History record not found" });

    await db.run("DELETE FROM history WHERE id = ?", [id]);
    res.json({ success: true });
});

apiRouter.delete("/history/clear/:companyId", async (req: Request, res: Response) => {
    const userReq = (req as any).user;
    const { companyId } = req.params;
    const db = await getDB();

    const company = await db.get("SELECT id FROM companies WHERE id = ? AND user_id = ?", [companyId, userReq.userId]);
    if (!company) return res.status(404).json({ error: "Company not found" });

    await db.run("DELETE FROM history WHERE company_id = ?", [companyId]);
    res.json({ success: true });
});

// -- BLACKLIST SYNC ROUTES --
apiRouter.get("/blacklist/metadata", async (_req: Request, res: Response) => {
    const db = await getDB();
    const metadata = await db.all("SELECT * FROM blacklist_metadata");
    res.json(metadata);
});

apiRouter.get("/blacklist/data/:tipo", async (req: Request, res: Response) => {
    const { tipo } = req.params;
    const db = await getDB();
    const data = await db.all("SELECT rfc FROM blacklist_data WHERE tipo = ?", [tipo]);
    res.json(data.map(d => d.rfc));
});

// -- SAT CFDI STATUS PROXY --
apiRouter.post("/sat/validate", async (req: Request, res: Response) => {
    const { uuid, rfcEmisor, rfcReceptor, total } = req.body;

    if (!uuid || !rfcEmisor || !rfcReceptor || total == null) {
        return res.status(400).json({
            error: "BAD_REQUEST",
            message: "Faltan parámetros requeridos para la validación SAT",
        });
    }

    console.log(
        `[SAT_PROXY] Iniciando consulta - UUID: ${uuid} | Emisor: ${rfcEmisor} | Receptor: ${rfcReceptor} | Total: ${total}`
    );

    const totalFormatted = Number(total).toFixed(6);

    const soapRequest = `
    <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">
       <soapenv:Header/>
       <soapenv:Body>
          <tem:Consulta>
             <tem:expresionImpresa><![CDATA[?re=${rfcEmisor}&rr=${rfcReceptor}&tt=${totalFormatted}&id=${uuid}]]></tem:expresionImpresa>
          </tem:Consulta>
       </soapenv:Body>
    </soapenv:Envelope>
  `;

    try {
        const response = await axios.post(
            "https://consultaqr.facturaelectronica.sat.gob.mx/ConsultaCFDIService.svc",
            soapRequest,
            {
                headers: {
                    "Content-Type": "text/xml; charset=utf-8",
                    "SOAPAction": "http://tempuri.org/IConsultaCFDIService/Consulta"
                },
                timeout: 8000 // 8s timeout for SAT
            }
        );

        console.log(
            `[SAT_PROXY] SAT Response OK | UUID: ${uuid} | HTTP: ${response.status}`
        );
        res.set("Content-Type", "text/xml");
        return res.send(response.data);
    } catch (error: any) {
        const status = error.response?.status || 500;
        console.error(
            `[SAT_PROXY] Error HTTP ${status}: ${error.message} | UUID: ${uuid}`
        );

        if (error.code === 'ECONNABORTED') {
            return res.status(504).json({ error: "SAT_TIMEOUT", message: "SAT Service Timeout" });
        }

        return res.status(status).json({
            error: "SAT_CONNECTION_FAILED",
            message: "No se pudo conectar con el servicio del SAT",
            details: error.message,
        });
    }
});
