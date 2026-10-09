import fs from "fs";
import path from "path";
import { Router } from "express";

// Actualización automática del listado 69-B (art. 69-B CFF) publicado por el SAT.
// El servidor lo descarga periódicamente, lo valida y lo publica en
// /api/blacklist/69b; cada navegador lo carga en su IndexedDB cuando el corte
// oficial cambia. Si la descarga falla se conserva la última copia válida.

const SAT_69B_PATH = "omawww.sat.gob.mx/cifras_sat/Documents/Listado_Completo_69-B.csv";
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const STALE_AFTER_MS = 12 * 60 * 60 * 1000;
const DOWNLOAD_TIMEOUT_MS = 120_000;
const MINIMUM_VALID_RECORDS = 1000;
const RFC_PATTERN = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};
// Columnas (Pub. SAT, Pub. DOF) con la fecha de publicación de cada situación.
const STATUS_DATE_COLS: [string, [number, number]][] = [
  ["presunto", [5, 7]], ["definitivo", [13, 15]], ["desvirtuado", [9, 11]], ["sentencia", [17, 19]],
];

export type Blacklist69BMeta = {
  fechaOficial: string | null;
  verificadoEl: string | null;
  descargadoEl: string | null;
  origen: string;
  registros: number;
  rfcUnicos: number;
  ultimoError: string | null;
};
type Registro = { rfc: string; tipo: "69B"; razonSocial: string; situacion: string; fechaPublicacion?: string };

/** CSV con comillas (RFC 4180). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const ddmmyyyy = (value: string | undefined) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((value || "").trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : undefined;
};

/** "Información actualizada al 31 de diciembre de 2025" → 2025-12-31 */
export function extractOfficialDate(text: string): string | null {
  const m = /actualiza(?:da|do)?\s+al\s+(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+de\s+(\d{4})/i.exec(text.slice(0, 4000));
  const month = m && MONTHS[m[2].toLowerCase()];
  if (!m || !month) return null;
  const date = new Date(Date.UTC(Number(m[3]), month - 1, Number(m[1])));
  return Number.isNaN(date.getTime()) || date.getUTCDate() !== Number(m[1]) ? null : date.toISOString().slice(0, 10);
}

/** Valida y normaliza el CSV oficial; lanza si no parece el listado completo. */
export function parseOfficial69B(text: string, today = new Date()): { fechaOficial: string; registros: Registro[] } {
  const fechaOficial = extractOfficialDate(text);
  if (!fechaOficial) throw new Error("No se detectó la fecha oficial de actualización en el listado del SAT.");
  if (fechaOficial > today.toISOString().slice(0, 10)) throw new Error(`La fecha oficial ${fechaOficial} está en el futuro.`);
  const seen = new Set<string>();
  const registros: Registro[] = [];
  for (const parts of parseCsv(text)) {
    if (parts.length < 4) continue;
    const rfc = parts[1].trim().toUpperCase();
    const situacion = parts[3].trim();
    if (!RFC_PATTERN.test(rfc) || !situacion) continue;
    const key = `${rfc}|${situacion.toUpperCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const cols = STATUS_DATE_COLS.find(([word]) => situacion.toLowerCase().includes(word))?.[1];
    const fechaPublicacion = cols ? ddmmyyyy(parts[cols[0]]) || ddmmyyyy(parts[cols[1]]) : undefined;
    registros.push({ rfc, tipo: "69B", razonSocial: parts[2].trim(), situacion, ...(fechaPublicacion ? { fechaPublicacion } : {}) });
  }
  if (registros.length < MINIMUM_VALID_RECORDS) {
    throw new Error(`El listado trae ${registros.length} registros válidos; se esperan al menos ${MINIMUM_VALID_RECORDS}.`);
  }
  return { fechaOficial, registros };
}

export function createBlacklistSync(options: { dataDir: string; bundledJsonPath: string; fetchImpl?: typeof fetch }) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const listPath = path.join(options.dataDir, "69b.json");
  const metaPath = path.join(options.dataDir, "69b.meta.json");
  let running: Promise<Blacklist69BMeta> | null = null;

  const readJson = <T>(file: string): T | null => {
    try { return JSON.parse(fs.readFileSync(file, "utf8")) as T; } catch { return null; }
  };
  const writeAtomic = (file: string, content: string) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, content, "utf8");
    fs.renameSync(tmp, file);
  };
  const bundledMeta = (): Blacklist69BMeta => {
    const bundled = readJson<{ fechaOficial?: string; registros?: Registro[] }>(options.bundledJsonPath);
    const registros = bundled?.registros || [];
    return {
      fechaOficial: bundled?.fechaOficial || null, verificadoEl: null, descargadoEl: null, origen: "incluida en la aplicación",
      registros: registros.length, rfcUnicos: new Set(registros.map(r => r.rfc)).size, ultimoError: null,
    };
  };
  const getMeta = (): Blacklist69BMeta => (fs.existsSync(listPath) && readJson<Blacklist69BMeta>(metaPath)) || bundledMeta();

  // El SAT publica el archivo en omawww; se intenta HTTPS y, si ese puerto no
  // responde (ocurre con frecuencia), HTTP. El contenido se valida igual en ambos casos.
  const download = async (): Promise<{ text: string; origen: string }> => {
    const errors: string[] = [];
    for (const scheme of ["https", "http"]) {
      try {
        const response = await fetchImpl(`${scheme}://${SAT_69B_PATH}`, {
          headers: { "User-Agent": "Mozilla/5.0 (SentinelExpress listado 69-B)" },
          signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = new TextDecoder("latin1").decode(new Uint8Array(await response.arrayBuffer()));
        return { text, origen: `${scheme}://${SAT_69B_PATH}` };
      } catch (error) {
        errors.push(`${scheme}: ${(error as any)?.cause?.code || (error as Error).message}`);
      }
    }
    throw new Error(`No se pudo descargar el listado del SAT (${errors.join("; ")}).`);
  };

  const check = async (): Promise<Blacklist69BMeta> => {
    const previous = getMeta();
    try {
      const { text, origen } = await download();
      const { fechaOficial, registros } = parseOfficial69B(text);
      const now = new Date().toISOString();
      // Nunca se reemplaza por un corte anterior al que ya se tiene.
      if (previous.fechaOficial && fechaOficial < previous.fechaOficial) {
        throw new Error(`El SAT devolvió un corte ${fechaOficial} anterior al vigente ${previous.fechaOficial}.`);
      }
      if (fechaOficial !== previous.fechaOficial || !fs.existsSync(listPath)) {
        writeAtomic(listPath, JSON.stringify({ fechaOficial, fuente: "SAT - Listado 69-B (Art. 69-B CFF)", registros }));
      }
      const meta: Blacklist69BMeta = {
        fechaOficial, verificadoEl: now, descargadoEl: now, origen, registros: registros.length,
        rfcUnicos: new Set(registros.map(r => r.rfc)).size, ultimoError: null,
      };
      writeAtomic(metaPath, JSON.stringify(meta));
      console.log(`[69-B] Listado verificado: corte ${fechaOficial}, ${meta.rfcUnicos} RFC (${origen}).`);
      return meta;
    } catch (error) {
      const message = (error as Error).message;
      console.warn(`[69-B] Actualización fallida; se conserva la copia anterior. ${message}`);
      const meta = { ...previous, ultimoError: `${new Date().toISOString()}: ${message}` };
      if (fs.existsSync(listPath)) writeAtomic(metaPath, JSON.stringify(meta));
      return meta;
    }
  };

  const checkIfStale = () => {
    const verified = Date.parse(getMeta().verificadoEl || "");
    if (Number.isFinite(verified) && Date.now() - verified < STALE_AFTER_MS) return Promise.resolve(getMeta());
    running ??= check().finally(() => { running = null; });
    return running;
  };

  const router = Router();
  router.get("/69b/meta", (_req, res) => {
    res.set("Cache-Control", "no-store").json(getMeta());
  });
  router.get("/69b", (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.sendFile(fs.existsSync(listPath) ? listPath : options.bundledJsonPath);
  });

  const start = () => {
    setTimeout(() => void checkIfStale(), 15_000).unref();
    setInterval(() => void checkIfStale(), CHECK_INTERVAL_MS).unref();
  };

  return { router, start, check, checkIfStale, getMeta };
}
