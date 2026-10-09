import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { AddressInfo } from "node:net";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import express from "express";
import { afterAll, beforeAll, describe, it } from "vitest";
import { open } from "sqlite";
import sqlite3 from "sqlite3";

describe("Express auth and public-route rate limits", () => {
    const originalFetch = globalThis.fetch;
    const tempDirectory = mkdtempSync(path.join(os.tmpdir(), "sentinel-rate-limit-test-"));
    let server: ReturnType<express.Application["listen"]> | undefined;
    let baseUrl = "";
    let closeDB: (() => Promise<void>) | undefined;
    let resetSatProxyMinuteWindow: ((token: string) => void) | undefined;

    beforeAll(async () => {
        process.env.DB_PATH = path.join(tempDirectory, "test.db");
        process.env.JWT_SECRET = "temporary-test-jwt-secret";
        process.env.ADMIN_TOKENS_PASSWORD = "temporary-test-admin-password";
        process.env.NODE_ENV = "production";

        const { apiRouter } = await import("../../../server/api.js");
        const { functionRoutes, satProxyTokenMinuteRateLimit } = await import("../../../server/functionRoutes.js");
        resetSatProxyMinuteWindow = token => satProxyTokenMinuteRateLimit.resetKey(`sat-token:${token}`);
        const { getDB } = await import("../../../server/db.js");
        const db = await getDB();
        closeDB = () => db.close();
        await db.run(
            "INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
            "rate-limit-test-admin",
            "admin",
            await bcrypt.hash("temporary-test-password", 10),
            "admin",
            Date.now()
        );

        const app = express();
        app.set("trust proxy", 1);
        app.use(express.text({ type: ["text/xml", "application/soap+xml"] }));
        app.use(express.json());
        app.use(cookieParser());
        app.use("/api/functions", functionRoutes);
        app.use("/api", apiRouter);
        const testServer = app.listen(0, "127.0.0.1");
        server = testServer;
        await new Promise<void>(resolve => testServer.once("listening", resolve));
        const address = testServer.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}`;
    });

    afterAll(async () => {
        globalThis.fetch = originalFetch;
        const testServer = server;
        if (testServer) {
            await new Promise<void>((resolve, reject) => {
                testServer.close(error => error ? reject(error) : resolve());
            });
        }
        await closeDB?.();
        rmSync(tempDirectory, { recursive: true, force: true });
        delete process.env.DB_PATH;
        delete process.env.JWT_SECRET;
        delete process.env.ADMIN_TOKENS_PASSWORD;
        delete process.env.NODE_ENV;
    });

    it("sets a secure login cookie, limits login and lead attempts, and rejects invalid SAT tokens before upstream fetch", async () => {
        const login = await originalFetch(`${baseUrl}/api/auth/login`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ username: "admin", password: "temporary-test-password" })
        });
        assert.equal(login.status, 200);
        const cookie = login.headers.get("set-cookie") ?? "";
        assert.match(cookie, /HttpOnly/i);
        assert.match(cookie, /Secure/i);
        assert.match(cookie, /SameSite=Lax/i);

        for (let attempt = 0; attempt < 4; attempt += 1) {
            const invalid = await originalFetch(`${baseUrl}/api/auth/login`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ username: "admin", password: "incorrect" })
            });
            assert.equal(invalid.status, 401);
        }
        const rateLimitedLogin = await originalFetch(`${baseUrl}/api/auth/login`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ username: "admin", password: "incorrect" })
        });
        assert.equal(rateLimitedLogin.status, 429);

        for (let attempt = 0; attempt < 10; attempt += 1) {
            const lead = await originalFetch(`${baseUrl}/api/functions/lead-capture`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({})
            });
            assert.equal(lead.status, 400);
        }
        const rateLimitedLead = await originalFetch(`${baseUrl}/api/functions/lead-capture`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({})
        });
        assert.equal(rateLimitedLead.status, 429);

        let satUpstreamCalls = 0;
        let upstreamSatStatus = 200;
        globalThis.fetch = async () => {
            satUpstreamCalls += 1;
            return new Response("<soap/>", {
                status: upstreamSatStatus,
                headers: upstreamSatStatus === 429 ? { "Retry-After": "2" } : undefined
            });
        };
        for (let attempt = 0; attempt < 30; attempt += 1) {
            const response = await originalFetch(`${baseUrl}/api/functions/sat-proxy`, {
                method: "POST",
                headers: {
                    "content-type": "text/xml; charset=utf-8",
                    ...(attempt % 2 === 0 ? { "x-sentinel-token": "NOT-A-VALID-TOKEN" } : {})
                },
                body: "<soap-request/>"
            });
            assert.equal(response.status, 401);
        }
        const rateLimitedSat = await originalFetch(`${baseUrl}/api/functions/sat-proxy`, {
            method: "POST",
            headers: { "content-type": "text/xml; charset=utf-8" },
            body: "<soap-request/>"
        });
        assert.equal(rateLimitedSat.status, 429);
        assert.match(rateLimitedSat.headers.get("retry-after") ?? "", /^\d+$/);
        assert.equal(satUpstreamCalls, 0);

        const createdTokenResponse = await originalFetch(`${baseUrl}/api/functions/admin-proxy`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-admin-password": "temporary-test-admin-password"
            },
            body: JSON.stringify({
                action: "create-access",
                payload: { name: "SAT rate limit integration", plan: "Básico", days: 30 }
            })
        });
        assert.equal(createdTokenResponse.status, 201);
        const createdTokenBody = await createdTokenResponse.json() as { token: { id: string } };
        const token = createdTokenBody.token.id;

        const sendValidQueries = async (count: number) => {
            const responses = await Promise.all(Array.from({ length: count }, () => originalFetch(`${baseUrl}/api/functions/sat-proxy`, {
                method: "POST",
                headers: {
                    "content-type": "text/xml; charset=utf-8",
                    "x-sentinel-token": token
                },
                body: "<soap-request/>"
            })));
            assert.ok(
                responses.every(response => response.status === 200),
                `Unexpected SAT response statuses: ${responses.map(response => response.status).filter(status => status !== 200).join(", ")}`
            );
        };

        let remaining = 4_000;
        while (remaining > 0) {
            const windowQueries = Math.min(600, remaining);
            for (let sent = 0; sent < windowQueries; sent += 100) {
                await sendValidQueries(Math.min(100, windowQueries - sent));
            }
            remaining -= windowQueries;
            if (remaining > 0) resetSatProxyMinuteWindow?.(token);
        }

        resetSatProxyMinuteWindow?.(token);
        for (let sent = 0; sent < 600; sent += 100) await sendValidQueries(100);
        const overLimit = await originalFetch(`${baseUrl}/api/functions/sat-proxy`, {
            method: "POST",
            headers: {
                "content-type": "text/xml; charset=utf-8",
                "x-sentinel-token": token
            },
            body: "<soap-request/>"
        });
        assert.equal(overLimit.status, 429);
        assert.match(overLimit.headers.get("retry-after") ?? "", /^\d+$/);

        const secondTokenResponse = await originalFetch(`${baseUrl}/api/functions/admin-proxy`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-admin-password": "temporary-test-admin-password"
            },
            body: JSON.stringify({
                action: "create-access",
                payload: { name: "SAT upstream 429 integration", plan: "Básico", days: 30 }
            })
        });
        const secondTokenBody = await secondTokenResponse.json() as { token: { id: string } };
        upstreamSatStatus = 429;
        const upstreamLimited = await originalFetch(`${baseUrl}/api/functions/sat-proxy`, {
            method: "POST",
            headers: {
                "content-type": "text/xml; charset=utf-8",
                "x-sentinel-token": secondTokenBody.token.id
            },
            body: "<soap-request/>"
        });
        assert.equal(upstreamLimited.status, 429);
        assert.equal(upstreamLimited.headers.get("retry-after"), "2");
        assert.equal(satUpstreamCalls, 4_601);
    }, 120_000);

    it("rejects access-token creation without the admin password and creates active tokens server-side when authorized", async () => {
        const payload = {
            name: "Integration Test",
            company: "Sentinel QA",
            email: "integration@example.test",
            phone: "+52 477 000 0000",
            plan: "Pro Professional",
            days: 30,
            id: "client-supplied-id",
            token: "client-supplied-token"
        };
        const unauthorized = await originalFetch(`${baseUrl}/api/functions/admin-proxy`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "create-access", payload })
        });
        assert.equal(unauthorized.status, 401);

        const createdResponse = await originalFetch(`${baseUrl}/api/functions/admin-proxy`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-admin-password": "temporary-test-admin-password"
            },
            body: JSON.stringify({ action: "create-access", payload })
        });
        assert.equal(createdResponse.status, 201);
        const createdBody = await createdResponse.json() as { token: Record<string, unknown> };
        const createdToken = createdBody.token;
        assert.equal(typeof createdToken.id, "string");
        assert.match(createdToken.id as string, /^[a-f0-9]{48}$/);
        assert.equal(createdToken.status, "active");
        assert.equal(createdToken.name, payload.name);
        assert.equal(createdToken.company, payload.company);
        assert.equal(createdToken.plan, payload.plan);
        assert.equal(typeof createdToken.expiresAt, "string");

        const stored = await originalFetch(`${baseUrl}/api/functions/admin-proxy`, {
            headers: { "x-admin-password": "temporary-test-admin-password" }
        });
        assert.equal(stored.status, 200);
        const storedBody = await stored.json() as { tokens: Array<{ id: string }> };
        assert.ok(storedBody.tokens.some(token => token.id === createdToken.id));
    });
});
