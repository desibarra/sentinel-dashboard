import { randomBytes, randomInt } from "node:crypto";
import express, { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { deleteStoredToken, getStoredToken, insertStoredToken, listStoredTokens, saveStoredToken, updateStoredToken } from "./tokenStore.js";

const ACCESS_STORE = "sentinel-tokens";
const MANAGED_STORE = "jsonbin-tokens";
export const SAT_TOKEN_RATE_LIMIT_PER_MINUTE = 600;
export const SAT_TOKEN_RATE_LIMIT_PER_DAY = 50_000;
const SAT_PROXY_MINUTE_WINDOW_MS = 60_000;
const SAT_PROXY_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
const router = express.Router();

const leadCaptureRateLimit = rateLimit({
    windowMs: 60_000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: "Demasiados registros. Intenta de nuevo en un minuto." })
});
function sendRateLimitResponse(req: Request, res: Response, message: string, windowMs: number): void {
    const rateLimitInfo = (req as Request & { rateLimit?: { resetTime?: Date } }).rateLimit;
    const resetTime = rateLimitInfo?.resetTime?.getTime() ?? Date.now() + windowMs;
    const retryAfterSeconds = Math.max(1, Math.ceil((resetTime - Date.now()) / 1000));
    res.setHeader("Retry-After", String(retryAfterSeconds));
    res.status(429).json({ error: message, retryAfter: retryAfterSeconds });
}

const satProxyInvalidTokenRateLimit = rateLimit({
    windowMs: SAT_PROXY_MINUTE_WINDOW_MS,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => sendRateLimitResponse(req, res, "Demasiados intentos de autorización. Intenta de nuevo en un minuto.", SAT_PROXY_MINUTE_WINDOW_MS)
});
export const satProxyTokenMinuteRateLimit = rateLimit({
    windowMs: SAT_PROXY_MINUTE_WINDOW_MS,
    limit: SAT_TOKEN_RATE_LIMIT_PER_MINUTE,
    keyGenerator: (_req, res) => `sat-token:${res.locals.satProxyTokenId}`,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => sendRateLimitResponse(req, res, "Límite de 600 consultas al SAT por minuto alcanzado.", SAT_PROXY_MINUTE_WINDOW_MS)
});
const satProxyTokenDailyRateLimit = rateLimit({
    windowMs: SAT_PROXY_DAILY_WINDOW_MS,
    limit: SAT_TOKEN_RATE_LIMIT_PER_DAY,
    keyGenerator: (_req, res) => `sat-token:${res.locals.satProxyTokenId}`,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => sendRateLimitResponse(req, res, "Límite diario de 50,000 consultas al SAT alcanzado.", SAT_PROXY_DAILY_WINDOW_MS)
});

function rejectSatToken(req: Request, res: Response, status: number, error: string): void {
    satProxyInvalidTokenRateLimit(req, res, () => {
        res.status(status).json({ error });
    });
}

async function authenticateSatProxyToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    const token = req.get("x-sentinel-token");
    if (!token) {
        rejectSatToken(req, res, 401, "No autorizado. Token faltante.");
        return;
    }

    const tokenData = await getStoredToken(ACCESS_STORE, token);
    if (!tokenData) {
        rejectSatToken(req, res, 401, "Acceso denegado. Token inválido.");
        return;
    }
    if (tokenData.status !== "active") {
        rejectSatToken(req, res, 401, "Acceso denegado. Token inactivo.");
        return;
    }

    const expiry = tokenData.expiresAt ? new Date(tokenData.expiresAt) : null;
    if (!expiry || Number.isNaN(expiry.getTime()) || Date.now() > expiry.getTime()) {
        rejectSatToken(req, res, 401, "Acceso denegado. El periodo de acceso ha finalizado.");
        return;
    }

    res.locals.satProxyTokenId = token;
    next();
}

function requireAdminPassword(req: Request, res: Response): boolean {
    const expectedPassword = process.env.ADMIN_TOKENS_PASSWORD;
    if (!expectedPassword) {
        res.status(500).json({
            code: "MISSING_ADMIN_PASSWORD",
            error: "Falta ADMIN_TOKENS_PASSWORD en el servidor"
        });
        return false;
    }

    const providedPassword = req.get("x-admin-password") || "";
    if (!providedPassword) {
        res.status(401).json({ error: "No autorizado. Credenciales faltantes." });
        return false;
    }
    if (providedPassword !== expectedPassword) {
        res.status(403).json({ code: "INVALID_PASSWORD", error: "Acceso denegado. Credenciales incorrectas." });
        return false;
    }
    return true;
}

router.get("/admin-proxy", async (req: Request, res: Response) => {
    if (!requireAdminPassword(req, res)) return;
    const storeName = req.get("x-token-store") === MANAGED_STORE ? MANAGED_STORE : ACCESS_STORE;
    res.json({
        authenticated: true,
        blobError: false,
        tokens: await listStoredTokens(storeName)
    });
});

router.post("/admin-proxy", async (req: Request, res: Response) => {
    if (!requireAdminPassword(req, res)) return;
    const { action, tokenId, days, payload } = req.body ?? {};

    if (action === "create-access") {
        const name = typeof payload?.name === "string" ? payload.name.trim() : "";
        const company = typeof payload?.company === "string" ? payload.company.trim() : "";
        const email = typeof payload?.email === "string" ? payload.email.trim() : "";
        const phone = typeof payload?.phone === "string" ? payload.phone.trim() : "";
        const plan = typeof payload?.plan === "string" ? payload.plan : "";
        const validPlans = new Set(["Básico", "Pro Professional", "Enterprise"]);
        const requestedDays = payload?.days === undefined ? 30 : Number(payload.days);

        if (!name || name.length > 160) {
            res.status(400).json({ error: "El nombre es obligatorio." });
            return;
        }
        if (company.length > 160 || email.length > 254 || phone.length > 40) {
            res.status(400).json({ error: "Uno o más campos exceden la longitud permitida." });
            return;
        }
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            res.status(400).json({ error: "El correo no tiene un formato válido." });
            return;
        }
        if (!validPlans.has(plan)) {
            res.status(400).json({ error: "El plan seleccionado no es válido." });
            return;
        }
        if (!Number.isInteger(requestedDays) || requestedDays < 1 || requestedDays > 3650) {
            res.status(400).json({ error: "La vigencia debe ser un número entero entre 1 y 3650 días." });
            return;
        }

        const createdAt = new Date();
        const expiresAt = new Date(createdAt.getTime() + requestedDays * 86_400_000);
        const tokenId = randomBytes(24).toString("hex");
        const accessToken = {
            id: tokenId,
            name,
            company,
            email,
            phone,
            cfdiVolume: "No especificado",
            plan,
            status: "active",
            createdAt: createdAt.toISOString(),
            activatedAt: createdAt.toISOString(),
            expiresAt: expiresAt.toISOString()
        };

        if (!await insertStoredToken(ACCESS_STORE, tokenId, accessToken)) {
            res.status(409).json({ error: "No se pudo crear un token único. Intenta de nuevo." });
            return;
        }
        res.status(201).json({ success: true, token: accessToken });
        return;
    }

    if (action === "create" || action === "toggle" || (action === "delete" && payload)) {
        const data = payload ?? {};
        const id = typeof data.id === "string" ? data.id : "";
        if (action === "create") {
            const managedToken = {
                ...data,
                id: id || `tok_${Date.now()}_${randomInt(1_000_000)}`,
                createdAt: data.createdAt || new Date().toISOString()
            };
            if (!managedToken.token) {
                res.status(400).json({ error: "Token value required" });
                return;
            }
            const inserted = await insertStoredToken(MANAGED_STORE, managedToken.id, managedToken);
            if (!inserted) {
                res.status(409).json({ error: "Token ID already exists" });
                return;
            }
            res.json(managedToken);
            return;
        }
        if (!id) {
            res.status(400).json({ error: "Token ID required" });
            return;
        }
        if (action === "delete") {
            if (!await deleteStoredToken(MANAGED_STORE, id)) {
                res.status(404).json({ error: "Token not found" });
                return;
            }
            res.json({ success: true });
            return;
        }
        const updated = await updateStoredToken(MANAGED_STORE, id, token => ({
            ...token,
            active: Boolean(data.active)
        }));
        if (!updated) {
            res.status(404).json({ error: "Token not found" });
            return;
        }
        res.json({ success: true });
        return;
    }

    if (!tokenId || typeof tokenId !== "string") {
        res.status(400).json({ error: "Token ID required" });
        return;
    }

    if (action === "delete") {
        if (!await deleteStoredToken(ACCESS_STORE, tokenId)) {
            res.status(404).json({ error: "Token not found" });
            return;
        }
        res.json({ success: true, deleted: true });
        return;
    }

    const validActions = new Set(["activate", "suspend", "reactivate", "expire", "extend"]);
    if (!validActions.has(action)) {
        res.status(400).json({ error: "Unknown action" });
        return;
    }

    const durationDays = Number.isFinite(Number(days)) && Number(days) > 0 ? Number(days) : 30;
    let missingExpiry = false;
    const updated = await updateStoredToken(ACCESS_STORE, tokenId, token => {
        const now = new Date();
        if (action === "activate") {
            token.status = "active";
            token.activatedAt = now.toISOString();
            token.expiresAt = new Date(now.getTime() + durationDays * 86_400_000).toISOString();
        } else if (action === "suspend") {
            token.status = "suspended";
        } else if (action === "reactivate") {
            token.status = "active";
        } else if (action === "expire") {
            token.status = "expired";
        } else if (action === "extend") {
            if (!token.expiresAt) {
                missingExpiry = true;
                return token;
            }
            token.expiresAt = new Date(new Date(token.expiresAt).getTime() + durationDays * 86_400_000).toISOString();
        }
        return token;
    });

    if (!updated) {
        res.status(404).json({ error: "Token not found" });
        return;
    }
    if (missingExpiry) {
        res.status(400).json({ error: "Token was never activated" });
        return;
    }
    res.json({ success: true, token: updated });
});

async function validateAccessToken(tokenCode: string, res: Response): Promise<void> {
    const tokenData = await getStoredToken(ACCESS_STORE, tokenCode);
    if (!tokenData) {
        res.status(404).json({ valid: false, reason: "not_found" });
        return;
    }
    if (tokenData.status === "pending" || tokenData.status === "suspended") {
        res.json({ valid: false, reason: tokenData.status });
        return;
    }
    const expiry = tokenData.expiresAt ? new Date(tokenData.expiresAt) : null;
    if (tokenData.status === "expired" || (expiry && Date.now() > expiry.getTime())) {
        res.json({ valid: false, reason: "expired" });
        return;
    }
    if (tokenData.status !== "active" || !tokenData.expiresAt || !expiry || Number.isNaN(expiry.getTime())) {
        res.status(500).json({ error: "Invalid token state" });
        return;
    }

    const updated = await updateStoredToken(ACCESS_STORE, tokenCode, current => ({
        ...current,
        loginsCount: (current.loginsCount || 0) + 1,
        lastLoginAt: new Date().toISOString()
    }));
    if (!updated) {
        res.status(404).json({ valid: false, reason: "not_found" });
        return;
    }
    res.json({
        valid: true,
        token: updated.id,
        label: updated.company || updated.name,
        expiresAt: updated.expiresAt.split("T")[0],
        demoCompanyName: updated.company,
        demoCompanyRFC: "XAXX010101000"
    });
}

router.get("/validate-token", async (req: Request, res: Response) => {
    const tokenCode = typeof req.query.token === "string" ? req.query.token : "";
    if (!tokenCode) {
        res.status(400).json({ error: "Token required" });
        return;
    }
    await validateAccessToken(tokenCode, res);
});

router.post("/validate-token", async (req: Request, res: Response) => {
    const tokenCode = typeof req.body?.token === "string" ? req.body.token : "";
    if (!tokenCode) {
        res.status(400).json({ error: "Token required" });
        return;
    }
    await validateAccessToken(tokenCode, res);
});

router.post("/track-event", async (req: Request, res: Response) => {
    const token = req.get("x-sentinel-token");
    const { eventName } = req.body ?? {};
    if (!token) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    if (!eventName) {
        res.status(400).json({ error: "Bad Request" });
        return;
    }
    const tokenData = await getStoredToken(ACCESS_STORE, token);
    if (!tokenData) {
        res.status(404).json({ error: "Not Found" });
        return;
    }
    if (eventName === "dashboard_opened") {
        await updateStoredToken(ACCESS_STORE, token, current => ({
            ...current,
            dashboardOpensCount: (current.dashboardOpensCount || 0) + 1
        }));
    }
    res.json({ success: true });
});

router.post("/sat-proxy", authenticateSatProxyToken, satProxyTokenMinuteRateLimit, satProxyTokenDailyRateLimit, async (req: Request, res: Response) => {
    const satResponse = await fetch("https://consultaqr.facturaelectronica.sat.gob.mx/ConsultaCFDIService.svc", {
        method: "POST",
        headers: {
            "Content-Type": "text/xml; charset=utf-8",
            "SOAPAction": "http://tempuri.org/IConsultaCFDIService/Consulta"
        },
        body: typeof req.body === "string" ? req.body : ""
    });
    if (!satResponse.ok) {
        if (satResponse.status === 429) {
            const retryAfter = satResponse.headers.get("retry-after");
            if (retryAfter) res.setHeader("Retry-After", retryAfter);
            res.status(429).json({ error: "El servicio del SAT solicitó reducir la frecuencia de consultas." });
            return;
        }
        res.status(502).json({ error: `El servicio del SAT no está disponible (HTTP ${satResponse.status}).` });
        return;
    }

    const xmlText = await satResponse.text();
    const token = res.locals.satProxyTokenId as string;
    await updateStoredToken(ACCESS_STORE, token, current => ({
        ...current,
        satQueriesCount: (current.satQueriesCount || 0) + 1,
        lastSatQueryAt: new Date().toISOString()
    }));
    res.type("text/xml; charset=utf-8").send(xmlText);
});

router.post("/lead-capture", leadCaptureRateLimit, async (req: Request, res: Response) => {
    const body = req.body ?? {};
    const data = body.payload?.data ?? body;
    const nombre = data.nombre || data.name || data.fullName || data.nombreCompleto || "";
    const empresa = data.empresa || data.company || data.businessName || data.despacho || "";
    const email = data.email || data.correo || data.mail;
    const telefono = data.telefono || data.phone || data.celular;
    const cfdiVolume = data.cfdi_mensuales || data.cfdiVolume || data.cfdi || "No especificado";
    if (!email || !telefono) {
        res.status(400).json({ error: "Faltan datos requeridos" });
        return;
    }

    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let token = typeof data.token === "string" && data.token ? data.token : "";
    if (!token) {
        token = Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join("");
    }
    const newToken = {
        id: token,
        name: nombre,
        company: empresa,
        email,
        phone: telefono,
        cfdiVolume,
        status: "pending",
        createdAt: new Date().toISOString()
    };
    if (!await insertStoredToken(ACCESS_STORE, token, newToken)) {
        res.status(409).json({ error: "El token generado ya existe. Intenta nuevamente." });
        return;
    }
    res.json({
        success: true,
        saved: true,
        token,
        events: ["lead_registered", "token_generated_pending"]
    });
});

router.post("/token-validate", async (req: Request, res: Response) => {
    const { action, payload } = req.body ?? {};
    if (action !== "validate" && action !== "track") {
        res.status(400).send("Bad Request");
        return;
    }
    if (!payload || typeof payload !== "object") {
        res.status(400).send("Bad Request");
        return;
    }
    if (action === "validate") {
        const tokenCode = typeof payload.tokenCode === "string" ? payload.tokenCode : "";
        if (!tokenCode) {
            res.status(400).send("Bad Request");
            return;
        }
        const tokens = await listStoredTokens(MANAGED_STORE);
        const found = tokens.find(token => typeof token.token === "string"
            && token.token.toLowerCase() === tokenCode.toLowerCase() && token.active);
        if (!found) {
            res.json(null);
            return;
        }
        const expiry = new Date(`${found.expiresAt}T23:59:59`);
        if (Number.isNaN(expiry.getTime()) || Date.now() > expiry.getTime()) {
            res.json(null);
            return;
        }
        const updated = await updateStoredToken(MANAGED_STORE, found.id, token => ({
            ...token,
            accessCount: (token.accessCount || 0) + 1,
            lastAccessed: new Date().toISOString()
        }));
        res.json(updated);
        return;
    }

    const id = typeof payload.id === "string" ? payload.id : "";
    if (!id) {
        res.status(400).send("Bad Request");
        return;
    }
    const updated = await updateStoredToken(MANAGED_STORE, id, token => ({
        ...token,
        accessCount: (token.accessCount || 0) + 1,
        lastAccessed: new Date().toISOString()
    }));
    if (!updated) {
        res.status(404).send("Not Found");
        return;
    }
    res.json({ success: true });
});

export const functionRoutes = router;
