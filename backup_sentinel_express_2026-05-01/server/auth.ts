import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key-change-in-prod";

export function generateToken(userId: string, role: string) {
    return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: "7d" });
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
    const token = req.cookies?.auth_token;

    if (!token) {
        return res.status(401).json({ error: "Unauthorized: No token provided" });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { userId: string, role: string };
        // Attach user to request
        (req as any).user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: "Unauthorized: Invalid token" });
    }
}
