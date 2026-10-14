// Entrada de archivos para el análisis: archivos sueltos, carpetas con
// subcarpetas (selector o arrastre). Todo ocurre en el navegador; nada se
// envía a la red.

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
