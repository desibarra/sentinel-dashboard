import { useState, useCallback, useRef } from "react";
import { Upload, X, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { decodeXml, extractXmlFromZip, inspectXml, isXmlName, isZipName, readBytes, sourcesFromDataTransfer, sourcesFromFileList, type IntakeSource } from "@/lib/xmlIntake";

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  status: "pending" | "processing" | "success" | "error";
  error?: string;
  content?: string;
  /** UUID del TimbreFiscalDigital (si se pudo leer). */
  uuid?: string;
  /** XML mal formado o sin UUID: se analiza igual y se reporta en el resumen. */
  warning?: string;
}

interface UploadZoneProps {
  onFilesReady: (files: UploadedFile[]) => void;
  isValidating: boolean;
  hasValidatedResults: boolean;
}

interface FileReadTask {
  file: File;
  uploadedFileId: string;
  path: string;
}

const MAX_CONCURRENT_FILE_READS = 4;
// Hasta este tamaño la lista se actualiza en cada archivo; arriba, en bloques
// (cada 100 ms) para que 10,000+ XML no congelen la pantalla.
const IMMEDIATE_UPDATE_LIMIT = 200;
const VISIBLE_ROWS = 200;

/** Resumen de la carga: cada archivo encontrado cae en exactamente una categoría. */
export interface IntakeSummary {
  found: number;
  valid: number;
  duplicates: string[];
  ignoredNonXml: number;
  readErrors: { path: string; reason: string }[];
  zipOpened: string[];
  zipFailed: { path: string; reason: string }[];
  zipNested: string[];
}
const emptySummary = (): IntakeSummary => ({ found: 0, valid: 0, duplicates: [], ignoredNonXml: 0, readErrors: [], zipOpened: [], zipFailed: [], zipNested: [] });

export default function UploadZone({ onFilesReady, isValidating, hasValidatedResults }: UploadZoneProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [summary, setSummary] = useState<IntakeSummary>(emptySummary);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [openingZips, setOpeningZips] = useState(0);
  const nextFileIdRef = useRef(0);
  const readQueueRef = useRef<FileReadTask[]>([]);
  const activeReadersRef = useRef(0);
  const pumpReadQueueRef = useRef<() => void>(() => {});
  // Estado de la carga en curso: se actualiza por archivo en refs y se publica en bloque.
  const summaryRef = useRef<IntakeSummary>(emptySummary());
  const seenUuidsRef = useRef(new Map<string, string>()); // UUID → id del archivo que se conserva
  const progressRef = useRef({ done: 0, total: 0 });
  const updatesRef = useRef(new Map<string, Partial<UploadedFile> | "remove">());
  const addedRef = useRef<UploadedFile[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deliveredRef = useRef(false);

  const flush = useCallback(() => {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = null;
    const updates = updatesRef.current;
    const added = addedRef.current;
    updatesRef.current = new Map();
    addedRef.current = [];
    if (updates.size || added.length) {
      setFiles((prev) => {
        const next: UploadedFile[] = [];
        for (const file of prev.concat(added)) {
          const update = updates.get(file.id);
          if (update === "remove") continue;
          next.push(update ? { ...file, ...update } : file);
        }
        return next;
      });
    }
    const current = summaryRef.current;
    setSummary({ ...current, duplicates: [...current.duplicates], readErrors: [...current.readErrors], zipOpened: [...current.zipOpened], zipFailed: [...current.zipFailed], zipNested: [...current.zipNested] });
    setProgress({ ...progressRef.current });
  }, []);

  const scheduleFlush = useCallback(() => {
    if (progressRef.current.total <= IMMEDIATE_UPDATE_LIMIT) flush();
    else if (!flushTimerRef.current) flushTimerRef.current = setTimeout(flush, 100);
  }, [flush]);

  // Una nueva selección después de validar empieza un resumen nuevo.
  const startIntake = useCallback(() => {
    if (!deliveredRef.current) return;
    deliveredRef.current = false;
    summaryRef.current = emptySummary();
    progressRef.current = { done: 0, total: 0 };
    seenUuidsRef.current.clear();
  }, []);

  /**
   * Clasifica un XML ya decodificado: duplicado por UUID del timbre (se omite),
   * válido, o con error de lectura (se cuenta con su nombre y se envía igual al
   * análisis para que figure en la hoja "Errores de lectura" del reporte).
   */
  const classify = useCallback((id: string, path: string, content: string): Partial<UploadedFile> | "remove" => {
    const info = inspectXml(content);
    if ("error" in info) {
      summaryRef.current.readErrors.push({ path, reason: info.error });
      return { content, status: "pending", warning: info.error };
    }
    const kept = seenUuidsRef.current.get(info.uuid);
    if (kept && kept !== id) {
      summaryRef.current.duplicates.push(path);
      return "remove";
    }
    seenUuidsRef.current.set(info.uuid, id);
    summaryRef.current.valid++;
    return { content, status: "pending", uuid: info.uuid };
  }, []);

  const pumpReadQueue = useCallback(() => {
    while (
      activeReadersRef.current < MAX_CONCURRENT_FILE_READS &&
      readQueueRef.current.length > 0
    ) {
      const task = readQueueRef.current.shift()!;
      activeReadersRef.current++;
      const reader = new FileReader();

      const finish = (update: Partial<UploadedFile> | "remove") => {
        updatesRef.current.set(task.uploadedFileId, update);
        progressRef.current.done++;
        activeReadersRef.current--;
        // Al vaciarse la cola se publica todo de inmediato.
        if (activeReadersRef.current === 0 && readQueueRef.current.length === 0) flush();
        else scheduleFlush();
        pumpReadQueueRef.current();
      };
      const fail = (error: string) => {
        summaryRef.current.readErrors.push({ path: task.path, reason: error });
        finish({ status: "error", error });
      };

      reader.onload = (event) => {
        const bytes = event.target?.result;
        if (!bytes || typeof bytes === "string") {
          fail("El archivo no se pudo leer");
          return;
        }
        finish(classify(task.uploadedFileId, task.path, decodeXml(new Uint8Array(bytes as ArrayBuffer))));
      };

      reader.onerror = () => fail("Error al leer el archivo");
      reader.onabort = () => fail("Lectura del archivo cancelada");

      try {
        reader.readAsArrayBuffer(task.file);
      } catch (error) {
        console.error(`Error al iniciar la lectura de ${task.file.name}:`, error);
        fail("No se pudo iniciar la lectura del archivo");
      }
    }
  }, [classify, flush, scheduleFlush]);
  pumpReadQueueRef.current = pumpReadQueue;

  // Abre cada ZIP en el navegador y agrega sus XML ya leídos a la lista.
  const addZips = useCallback(async (zips: IntakeSource[]) => {
    if (!zips.length) return;
    setOpeningZips((prev) => prev + zips.length);
    for (const { file, path } of zips) {
      let extraction;
      try {
        extraction = await extractXmlFromZip(await readBytes(file), path);
      } catch (error) {
        extraction = { xmls: [], opened: [], failed: [{ path, reason: `No se pudo leer el ZIP (${(error as Error)?.message || "error desconocido"})` }], ignoredNested: [], ignoredNonXml: 0 };
      }
      const current = summaryRef.current;
      // Encontrados: cada ZIP (abierto o con error, incluidos los internos), sus XML,
      // lo que no es XML dentro y los ZIP anidados ignorados.
      current.found += extraction.opened.length + extraction.failed.length + extraction.xmls.length
        + extraction.ignoredNonXml + extraction.ignoredNested.length;
      current.ignoredNonXml += extraction.ignoredNonXml;
      current.zipOpened.push(...extraction.opened);
      current.zipFailed.push(...extraction.failed);
      current.zipNested.push(...extraction.ignoredNested);
      progressRef.current.total += extraction.xmls.length;
      for (const { path: xmlPath, bytes } of extraction.xmls) {
        const id = `${Date.now()}-${nextFileIdRef.current++}`;
        const update = classify(id, xmlPath, decodeXml(bytes));
        progressRef.current.done++;
        if (update !== "remove") addedRef.current.push({ id, name: xmlPath, size: bytes.length, status: "pending", ...update });
        // Cede el hilo cada 200 XML para que la barra de progreso avance.
        if (progressRef.current.done % 200 === 0) {
          scheduleFlush();
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
      flush();
      setOpeningZips((prev) => prev - 1);
    }
  }, [classify, flush, scheduleFlush]);

  // Archivos sueltos, carpetas (con subcarpetas), ZIP o arrastre: solo se leen
  // los .xml (sin importar mayúsculas); lo demás (PDF, TXT…) se ignora y se cuenta.
  const handleFiles = useCallback(
    (sources: IntakeSource[]) => {
      startIntake();
      const newFiles: UploadedFile[] = [];
      const readTasks: FileReadTask[] = [];
      const current = summaryRef.current;

      for (const { file, path } of sources) {
        if (isZipName(file.name)) continue;
        current.found++;
        if (!isXmlName(file.name)) {
          current.ignoredNonXml++;
          continue;
        }
        const fileId = `${Date.now()}-${nextFileIdRef.current++}`;
        newFiles.push({
          id: fileId,
          name: path,
          size: file.size,
          status: "pending",
        });
        readTasks.push({ file, uploadedFileId: fileId, path });
      }

      progressRef.current.total += readTasks.length;
      addedRef.current.push(...newFiles);
      flush();
      readQueueRef.current.push(...readTasks);
      pumpReadQueueRef.current();
      void addZips(sources.filter(({ file }) => isZipName(file.name)));
    },
    [addZips, flush, startIntake]
  );

  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    // Recorre carpetas arrastradas a cualquier profundidad.
    const { sources } = await sourcesFromDataTransfer(e.dataTransfer);
    handleFiles(sources);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(sourcesFromFileList(e.target.files));
    }
    e.target.value = ""; // permite volver a elegir la misma carpeta o archivo
  };

  const removeFile = (id: string) => {
    const removed = files.find((f) => f.id === id);
    if (removed?.uuid && seenUuidsRef.current.get(removed.uuid) === id) {
      seenUuidsRef.current.delete(removed.uuid);
      summaryRef.current.valid--;
      setSummary((prev) => ({ ...prev, valid: prev.valid - 1 }));
    }
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const resetIntake = () => {
    summaryRef.current = emptySummary();
    progressRef.current = { done: 0, total: 0 };
    seenUuidsRef.current.clear();
    deliveredRef.current = false;
    setSummary(emptySummary());
    setProgress({ done: 0, total: 0 });
    setFiles([]);
  };

  const handleValidate = () => {
    const pendingFiles = files.filter((f) => f.content && f.status === "pending");
    console.log("UploadZone handleValidate called! pendingFiles length:", pendingFiles.length);
    if (pendingFiles.length > 0) {
      onFilesReady(pendingFiles as UploadedFile[]);
      // El resumen queda visible hasta la siguiente selección.
      deliveredRef.current = true;
      // ✅ PRODUCCIÓN: Limpiar archivos después de enviarlos para liberar memoria
      // No mantener XMLs completos en memoria después de procesarlos
      setFiles([]);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case "error":
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      case "processing":
        return <Clock className="w-5 h-5 text-blue-600 animate-spin" />;
      default:
        return <Clock className="w-5 h-5 text-slate-400" />;
    }
  };

  const getStatusBadge = (status: string, error?: string) => {
    switch (status) {
      case "success":
        return <Badge className="bg-green-100 text-green-800">Validado</Badge>;
      case "error":
        return (
          <Badge className="bg-red-100 text-red-800" title={error}>
            Error
          </Badge>
        );
      case "processing":
        return <Badge className="bg-primary/10 text-primary border-primary/20">Procesando</Badge>;
      default:
        return <Badge className="bg-slate-100 text-slate-800 border-slate-200">Pendiente</Badge>;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const validFiles = files.filter((f) => f.status !== "error" && f.content);
  // Diagnóstico de memoria escalonado (Fase 4): con lotes grandes, el botón
  // se habilitaba en cuanto el PRIMER archivo terminaba de leerse (FileReader
  // es asíncrono por archivo), no cuando TODOS terminaban. Un clic en ese
  // punto intermedio (real o automatizado) llamaba a handleValidate(), que
  // solo envía los archivos con status==="pending" && content ya listo, y
  // luego hace setFiles([]) incondicionalmente — descartando en silencio
  // cualquier archivo cuyo FileReader aún no hubiera terminado. Se reprodujo
  // de forma controlada: 1000 XML → solo 700 procesados; 1500 XML → solo 600.
  // Ahora se exige que TODOS los archivos hayan terminado de leerse (contenido
  // listo o marcados en error) antes de habilitar el botón.
  const allFilesSettled = files.every((f) => f.status === "error" || !!f.content);
  const readyToValidate = validFiles.length > 0 && allFilesSettled && openingZips === 0 && progress.done >= progress.total && !isValidating;
  const shouldDisableValidate = !readyToValidate || (hasValidatedResults && files.length === 0);

  return (
    <Card className="border-0 shadow-sm mb-8">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="w-5 h-5" />
          Carga de CFDI (XML)
        </CardTitle>
        <CardDescription>
          Selecciona o arrastra tus archivos XML CFDI 4.0 para validarlos
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Dropzone */}
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${dragActive
              ? "border-accent bg-accent/10 scale-[1.01]"
              : "border-slate-300 bg-white hover:border-primary hover:bg-slate-50"
            } ${isValidating ? "pointer-events-none opacity-50" : "shadow-sm"}`}
        >
          <Upload className="w-12 h-12 mx-auto mb-3 text-slate-400" />
          <p className="text-slate-700 font-medium mb-2">
            {isValidating ? "Procesando XMLs..." : "Arrastra tus archivos XML, ZIP o carpetas aquí"}
          </p>
          <p className="text-slate-500 text-sm mb-4">o</p>
          <div className="flex flex-wrap justify-center gap-3">
            <input
              id="xml-upload"
              type="file"
              multiple
              accept=".xml,.zip"
              onChange={handleFileInput}
              className="hidden"
              disabled={isValidating}
            />
            <label htmlFor="xml-upload">
              <Button
                variant="outline"
                className="cursor-pointer"
                asChild
                disabled={isValidating}
              >
                <span>Seleccionar archivos XML o ZIP</span>
              </Button>
            </label>
            <input
              id="xml-folder-upload"
              type="file"
              multiple
              {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
              onChange={handleFileInput}
              className="hidden"
              disabled={isValidating}
            />
            <label htmlFor="xml-folder-upload">
              <Button
                variant="outline"
                className="cursor-pointer"
                asChild
                disabled={isValidating}
              >
                <span>Seleccionar carpeta</span>
              </Button>
            </label>
          </div>
        </div>

        {/* Progreso de lectura */}
        {(progress.total > 0 && progress.done < progress.total) || openingZips > 0 ? (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-slate-600">
              <span>{openingZips > 0 ? `Abriendo ${openingZips} ZIP…` : "Leyendo XML…"}</span>
              <span>{progress.done.toLocaleString()} de {progress.total.toLocaleString()}</span>
            </div>
            <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} />
            </div>
          </div>
        ) : null}

        {/* Resumen de carga */}
        {summary.found > 0 && <IntakeSummaryPanel summary={summary} />}

        {/* Mensaje de idempotencia */}
        {hasValidatedResults && files.length === 0 && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-900">
              ✓ Este lote ya fue validado. Carga nuevos XML para validar nuevamente.
            </p>
          </div>
        )}

        {/* Lista de archivos */}
        {files.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">
                Archivos cargados ({files.length})
              </h3>
              {files.length > 0 && (
                <span className="text-xs text-slate-500">
                  {validFiles.length.toLocaleString()} listo{validFiles.length !== 1 ? "s" : ""} para analizar
                </span>
              )}
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto">
              {files.slice(0, VISIBLE_ROWS).map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {getStatusIcon(file.status)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {file.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatFileSize(file.size)}
                        {file.error && ` • ${file.error}`}
                        {file.warning && ` • ${file.warning}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {getStatusBadge(file.status, file.error)}
                    {file.status !== "processing" && (
                      <button
                        onClick={() => removeFile(file.id)}
                        className="p-1 hover:bg-slate-200 rounded transition-colors"
                        title="Eliminar archivo"
                      >
                        <X className="w-4 h-4 text-slate-500" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {files.length > VISIBLE_ROWS && (
              <p className="text-xs text-slate-500">
                Se muestran los primeros {VISIBLE_ROWS} de {files.length.toLocaleString()} XML; el resumen cuenta todos.
              </p>
            )}
          </div>
        )}

        {/* Botón de validación */}
        {files.length > 0 && (
          <div className="flex gap-3 pt-4 border-t border-slate-200">
            <Button
              onClick={handleValidate}
              disabled={shouldDisableValidate}
              className="flex-1 bg-primary hover:bg-primary/90 text-white font-bold shadow-lg shadow-primary/20 transition-all active:scale-[0.98]"
              size="lg"
              title={
                hasValidatedResults && files.length === 0
                  ? "Este lote ya fue validado. Carga nuevos XML para validar nuevamente."
                  : ""
              }
            >
              {isValidating ? "Validando XML..." : "Iniciar Validación"}
            </Button>
            {files.length > 0 && (
              <Button
                variant="outline"
                onClick={resetIntake}
                disabled={isValidating}
              >
                Limpiar
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function IntakeSummaryPanel({ summary }: { summary: IntakeSummary }) {
  const zipCount = summary.zipOpened.length + summary.zipFailed.length;
  const accounted = summary.valid + summary.duplicates.length + summary.ignoredNonXml + summary.readErrors.length + zipCount + summary.zipNested.length;
  const rows: [string, number, string?][] = [
    ["Archivos encontrados", summary.found],
    ["XML válidos", summary.valid],
    ["Duplicados omitidos (mismo UUID)", summary.duplicates.length],
    ["No-XML ignorados", summary.ignoredNonXml],
    ["XML con error de lectura", summary.readErrors.length, summary.readErrors.length ? "text-red-700" : undefined],
    ["ZIP abiertos", summary.zipOpened.length],
    ["ZIP con error", summary.zipFailed.length, summary.zipFailed.length ? "text-red-700" : undefined],
  ];
  if (summary.zipNested.length) rows.push(["ZIP anidados ignorados (más de 1 nivel)", summary.zipNested.length, "text-amber-700"]);
  const details = [
    ...summary.readErrors.map((e) => `Error de lectura: ${e.path} — ${e.reason}`),
    ...summary.zipFailed.map((z) => `ZIP con error: ${z.path} — ${z.reason}`),
    ...summary.zipNested.map((z) => `ZIP anidado ignorado: ${z}`),
    ...summary.duplicates.map((d) => `Duplicado omitido: ${d}`),
  ];
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4" data-testid="intake-summary">
      <h3 className="font-semibold text-slate-900 mb-2">Resumen de carga</h3>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
        {rows.map(([label, value, tone]) => (
          <div key={label} className="rounded bg-white border border-slate-200 p-2">
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className={`font-bold ${tone || "text-slate-900"}`}>{value.toLocaleString()}</dd>
          </div>
        ))}
      </dl>
      {accounted !== summary.found && (
        <p className="text-xs text-amber-700 mt-2">Leyendo… {(summary.found - accounted).toLocaleString()} por clasificar.</p>
      )}
      {details.length > 0 && (
        <details className="mt-3 text-xs text-slate-700">
          <summary className="cursor-pointer">Ver detalle ({details.length.toLocaleString()})</summary>
          <ul className="mt-2 max-h-40 overflow-y-auto space-y-0.5">
            {details.slice(0, 500).map((line, i) => <li key={i}>{line}</li>)}
            {details.length > 500 && <li>… y {(details.length - 500).toLocaleString()} más</li>}
          </ul>
        </details>
      )}
    </div>
  );
}
