// Entrada de archivos para el análisis: archivos sueltos, carpetas con
// subcarpetas (selector o arrastre) y ZIP. Todo ocurre en el navegador; nada
// se envía a la red.
import { unzip, unzipSync } from 'fflate';

/** Archivo encontrado en la selección, con su ruta relativa (carpeta/subcarpeta/archivo). */
export interface IntakeSource {
  file: File;
  path: string;
}

export const isXmlName = (name: string) => /\.xml$/i.test(name);

/** Archivos de un <input type="file"> (con o sin webkitdirectory). */
export function sourcesFromFileList(list: FileList | File[]): IntakeSource[] {
  return Array.from(list).map(file => ({
    file,
    path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
  }));
}

// Subconjunto de la File and Directory Entries API que se usa aquí.
interface EntryLike {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath?: string;
  file?: (success: (file: File) => void, error?: (err: unknown) => void) => void;
  createReader?: () => { readEntries: (success: (entries: EntryLike[]) => void, error?: (err: unknown) => void) => void };
}

const fileOf = (entry: EntryLike) =>
  new Promise<File>((resolve, reject) => entry.file!(resolve, reject));

// readEntries devuelve los hijos por bloques (Chrome: 100); se llama hasta que regrese vacío.
async function childrenOf(entry: EntryLike): Promise<EntryLike[]> {
  const reader = entry.createReader!();
  const all: EntryLike[] = [];
  for (;;) {
    const batch = await new Promise<EntryLike[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) return all;
    all.push(...batch);
  }
}

async function walk(entry: EntryLike, prefix: string, out: IntakeSource[], errors: string[]): Promise<void> {
  const path = prefix ? `${prefix}/${entry.name}` : entry.name;
  try {
    if (entry.isFile) out.push({ file: await fileOf(entry), path });
    else if (entry.isDirectory) for (const child of await childrenOf(entry)) await walk(child, path, out, errors);
  } catch {
    errors.push(path);
  }
}

/**
 * Archivos de un arrastre, recorriendo carpetas a cualquier profundidad.
 * Las entradas se toman de forma síncrona: el DataTransfer deja de ser
 * accesible en cuanto termina el evento drop.
 */
export async function sourcesFromDataTransfer(dt: DataTransfer): Promise<{ sources: IntakeSource[]; unreadable: string[] }> {
  const items = Array.from(dt.items || []);
  const entries = items
    .filter(item => item.kind === 'file')
    .map(item => (item as DataTransferItem & { webkitGetAsEntry?: () => EntryLike | null }).webkitGetAsEntry?.() ?? null);
  // Sin la API de entradas (o en navegadores que no la exponen) se usan los archivos planos.
  if (!entries.length || entries.some(entry => !entry)) return { sources: sourcesFromFileList(dt.files), unreadable: [] };
  const sources: IntakeSource[] = [];
  const unreadable: string[] = [];
  for (const entry of entries) await walk(entry!, '', sources, unreadable);
  return { sources, unreadable };
}

export const isZipName = (name: string) => /\.zip$/i.test(name);

/** Bytes de un archivo; usa FileReader donde Blob.arrayBuffer no existe. */
export function readBytes(file: Blob): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer().then(buffer => new Uint8Array(buffer));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

/** true si alguna entrada del directorio central tiene el bit de cifrado (ZIP con contraseña). */
export function zipIsEncrypted(bytes: Uint8Array): boolean {
  const u16 = (i: number) => bytes[i] | (bytes[i + 1] << 8);
  const u32 = (i: number) => (u16(i) | (u16(i + 2) << 16)) >>> 0;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (u32(i) !== 0x06054b50) continue;
    let p = u32(i + 16);
    for (let n = u16(i + 10); n > 0 && p + 46 <= bytes.length && u32(p) === 0x02014b50; n--) {
      if (u16(p + 8) & 1) return true;
      p += 46 + u16(p + 28) + u16(p + 30) + u16(p + 32);
    }
    return false;
  }
  return false;
}

export interface ZipExtraction {
  xmls: { path: string; bytes: Uint8Array }[];
  opened: string[];
  failed: { path: string; reason: string }[];
  ignoredNested: string[];
  ignoredNonXml: number;
}

const unzipEntries = (bytes: Uint8Array, filter: (file: { name: string }) => boolean) =>
  // Asíncrono (Worker interno de fflate) para no congelar la pantalla; síncrono donde no hay Worker.
  typeof Worker === 'undefined'
    ? Promise.resolve(unzipSync(bytes, { filter }))
    : new Promise<Record<string, Uint8Array>>((resolve, reject) => unzip(bytes, { filter }, (err, data) => (err ? reject(err) : resolve(data))));

/**
 * XML de un ZIP, incluidas sus subcarpetas internas. Un ZIP dentro del ZIP se
 * abre un nivel más; más profundo se reporta como ignorado. Un ZIP dañado o
 * cifrado no detiene la carga: queda en `failed` con el motivo.
 */
export async function extractXmlFromZip(bytes: Uint8Array, zipPath: string, depth = 0, out?: ZipExtraction): Promise<ZipExtraction> {
  const result = out ?? { xmls: [], opened: [], failed: [], ignoredNested: [], ignoredNonXml: 0 };
  if (zipIsEncrypted(bytes)) {
    result.failed.push({ path: zipPath, reason: 'ZIP protegido con contraseña' });
    return result;
  }
  let entries: Record<string, Uint8Array>;
  try {
    entries = await unzipEntries(bytes, file => {
      if (file.name.endsWith('/')) return false;
      if (isXmlName(file.name)) return true;
      if (isZipName(file.name)) {
        if (depth === 0) return true;
        result.ignoredNested.push(`${zipPath}/${file.name}`);
        return false;
      }
      result.ignoredNonXml++;
      return false;
    });
  } catch (error) {
    result.failed.push({ path: zipPath, reason: `ZIP dañado o ilegible (${(error as Error)?.message || 'error desconocido'})` });
    return result;
  }
  result.opened.push(zipPath);
  for (const [name, data] of Object.entries(entries).sort(([a], [b]) => a.localeCompare(b))) {
    if (isXmlName(name)) result.xmls.push({ path: `${zipPath}/${name}`, bytes: data });
    else await extractXmlFromZip(data, `${zipPath}/${name}`, depth + 1, result);
  }
  return result;
}

/**
 * Texto de un XML a partir de sus bytes: UTF-8 con o sin BOM, UTF-16 con BOM,
 * e ISO-8859-1 / Windows-1252 cuando así lo declara el encabezado <?xml ...?>.
 */
export function decodeXml(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  const prolog = new TextDecoder('latin1').decode(bytes.subarray(0, 200));
  const declared = /<\?xml[^>]*encoding\s*=\s*["']([^"']+)["']/i.exec(prolog)?.[1].toLowerCase().replace(/[\s_]/g, '-');
  const latin = declared && ['iso-8859-1', 'latin1', 'latin-1', 'windows-1252', 'cp1252'].includes(declared);
  // TextDecoder quita el BOM de UTF-8 por omisión.
  return new TextDecoder(latin ? 'windows-1252' : 'utf-8').decode(bytes);
}

const TFD_UUID = /<(?:[\w-]+:)?TimbreFiscalDigital\b[^>]*?\sUUID\s*=\s*["']([0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})["']/;

/** UUID del TimbreFiscalDigital si el XML está bien formado; si no, el motivo del error. */
export function inspectXml(text: string): { uuid: string } | { error: string } {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (!doc.documentElement || doc.getElementsByTagName('parsererror').length) return { error: 'XML mal formado o incompleto' };
  const uuid = TFD_UUID.exec(text)?.[1];
  return uuid ? { uuid: uuid.toUpperCase() } : { error: 'Sin UUID de TimbreFiscalDigital' };
}
