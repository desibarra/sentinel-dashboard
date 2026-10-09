import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import "express-async-errors";
import cookieParser from "cookie-parser";
import { apiRouter } from "./api.js";
import { functionRoutes } from "./functionRoutes.js";
import { getDB } from "./db.js";
import { createBlacklistSync } from "./blacklistSync.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  // Initialize Database
  await getDB();

  const app = express();
  app.set("trust proxy", 1);
  const server = createServer(app);

  app.use(express.text({ type: ["text/xml", "application/soap+xml"], limit: "1mb" }));
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: false, limit: "50mb" }));
  app.use(cookieParser());

  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  // Listado 69-B actualizado automáticamente junto a la base de datos.
  const blacklistSync = createBlacklistSync({
    dataDir: path.join(path.dirname(process.env.DB_PATH || path.resolve(__dirname, "..", "data", "sentinel.db")), "blacklists"),
    bundledJsonPath: path.join(staticPath, "69b.json"),
  });

  app.use("/api/functions", functionRoutes);
  app.use("/.netlify/functions", functionRoutes);
  app.use("/api/blacklist", blacklistSync.router);
  app.use("/api", apiRouter);

  app.get("/", (_req, res) => {
    res.sendFile(path.join(staticPath, "sentinel-express-landing.html"));
  });
  app.use(express.static(staticPath));

  app.get(/^(?!\/api(?:\/|$)|\/\.netlify\/functions(?:\/|$)).*/, (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 5000;

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    blacklistSync.start();
  });
}

startServer().catch(console.error);
