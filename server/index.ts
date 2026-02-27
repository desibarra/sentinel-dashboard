import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import "express-async-errors";
import cookieParser from "cookie-parser";
import { apiRouter } from "./api.js";
import { getDB } from "./db.js";
import { startSATCrawlerCron } from "./services/satCrawler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  // Initialize Database
  await getDB();

  // Inicia Crawler de listas SAT
  startSATCrawlerCron();

  const app = express();
  const server = createServer(app);

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: false, limit: "50mb" }));
  app.use(cookieParser());

  // Use the API routes
  app.use("/api", apiRouter);

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath));

  // Handle client-side routing - serve index.html for all routes
  // Exclude API routes from this wildcard
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 5000;

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
