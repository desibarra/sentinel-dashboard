import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// ✅ AUDIT FIX: Fallar explícitamente si JWT_SECRET no está configurado en variables de entorno.
// El fallback "super-secret-key-change-in-prod" permitía forjar tokens en producción.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("[SEGURIDAD CRÍTICA] JWT_SECRET no configurado. Configura la variable de entorno antes de arrancar.");
  // En producción, lanzar error; en desarrollo, usar fallback con advertencia
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET es requerido en producción.");
  }
}

export function generateToken(userId: string, role: string) {
    return jwt.sign({ userId, role }, JWT_SECRET || "dev-only-secret", { expiresIn: "7d" });
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
    const token = req.cookies?.auth_token;

    if (!token) {
        return res.status(401).json({ error: "Unauthorized: No token provided" });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET || "dev-only-secret") as { userId: string, role: string };
        // Attach user to request
        (req as any).user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: "Unauthorized: Invalid token" });
    }
}

export function requireRole(role: string) {
    return (req: Request, res: Response, next: NextFunction) => {
        const user = (req as any).user;
        if (!user || user.role !== role) {
            return res.status(403).json({ error: "Forbidden: Insufficient role" });
        }
        next();
    };
}
