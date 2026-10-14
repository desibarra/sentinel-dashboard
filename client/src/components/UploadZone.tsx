import { useState, useCallback, useRef } from "react";
import { Upload, X, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { extractXmlFromZip, isXmlName, isZipName, readBytes, sourcesFromDataTransfer, sourcesFromFileList, type IntakeSource } from "@/lib/xmlIntake";

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  status: "pending" | "processing" | "success" | "error";
  error?: string;
  content?: string;
}

interface UploadZoneProps {
  onFilesReady: (files: UploadedFile[]) => void;
  isValidating: boolean;
  hasValidatedResults: boolean;
}

interface FileReadTask {
  file: File;
  uploadedFileId: string;
}

const MAX_CONCURRENT_FILE_READS = 4;

interface ZipStatus {
  opened: string[];
  failed: { path: string; reason: string }[];
  ignoredNested: string[];
}
const EMPTY_ZIP_STATUS: ZipStatus = { opened: [], failed: [], ignoredNested: [] };

export default function UploadZone({ onFilesReady, isValidating, hasValidatedResults }: UploadZoneProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [ignoredCount, setIgnoredCount] = useState(0);
  const [zipStatus, setZipStatus] = useState<ZipStatus>(EMPTY_ZIP_STATUS);
  const [openingZips, setOpeningZips] = useState(0);
  const nextFileIdRef = useRef(0);
  const readQueueRef = useRef<FileReadTask[]>([]);
  const activeReadersRef = useRef(0);
  const pumpReadQueueRef = useRef<() => void>(() => {});

  const pumpReadQueue = useCallback(() => {
    while (
      activeReadersRef.current < MAX_CONCURRENT_FILE_READS &&
      readQueueRef.current.length > 0
    ) {
      const task = readQueueRef.current.shift()!;
      activeReadersRef.current++;
      const reader = new FileReader();

      const finish = (update: (file: UploadedFile) => UploadedFile) => {
        setFiles((prev) =>
          prev.map((file) => file.id === task.uploadedFileId ? update(file) : file)
        );
        activeReadersRef.current--;
        pumpReadQueueRef.current();
      };

      reader.onload = (event) => {
        const content = event.target?.result;
        if (typeof content !== "string") {
          finish((file) => ({ ...file, status: "error", error: "El archivo no se pudo leer como texto" }));
          return;
        }
        finish((file) => ({ ...file, content, status: "pending" }));
      };

      reader.onerror = () => {
        finish((file) => ({ ...file, status: "error", error: "Error al leer el archivo" }));
      };

      reader.onabort = () => {
        finish((file) => ({ ...file, status: "error", error: "Lectura del archivo cancelada" }));
      };

      try {
        reader.readAsText(task.file);
      } catch (error) {
        console.error(`Error al iniciar la lectura de ${task.file.name}:`, error);
        finish((file) => ({ ...file, status: "error", error: "No se pudo iniciar la lectura del archivo" }));
      }
    }
  }, []);
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
      const decoder = new TextDecoder("utf-8");
      const zipFiles: UploadedFile[] = extraction.xmls.map(({ path: xmlPath, bytes }) => ({
        id: `${Date.now()}-${nextFileIdRef.current++}`,
        name: xmlPath,
        size: bytes.length,
        status: "pending",
        content: decoder.decode(bytes),
      }));
      setFiles((prev) => [...prev, ...zipFiles]);
      setIgnoredCount((prev) => prev + extraction.ignoredNonXml);
      setZipStatus((prev) => ({
        opened: [...prev.opened, ...extraction.opened],
        failed: [...prev.failed, ...extraction.failed],
        ignoredNested: [...prev.ignoredNested, ...extraction.ignoredNested],
      }));
      setOpeningZips((prev) => prev - 1);
    }
  }, []);

  // Archivos sueltos, carpetas (con subcarpetas), ZIP o arrastre: solo se leen
  // los .xml (sin importar mayúsculas); lo demás (PDF, TXT…) se ignora y se cuenta.
  const handleFiles = useCallback(
    (sources: IntakeSource[]) => {
      const newFiles: UploadedFile[] = [];
      const readTasks: FileReadTask[] = [];
      let ignored = 0;

      void addZips(sources.filter(({ file }) => isZipName(file.name)));
      for (const { file, path } of sources) {
        if (isZipName(file.name)) continue;
        if (!isXmlName(file.name)) {
          ignored++;
          continue;
        }
        const fileId = `${Date.now()}-${nextFileIdRef.current++}`;
        newFiles.push({
          id: fileId,
          name: path,
          size: file.size,
          status: "pending",
        });
        readTasks.push({ file, uploadedFileId: fileId });
      }

      setIgnoredCount((prev) => prev + ignored);
      setFiles((prev) => [...prev, ...newFiles]);
      readQueueRef.current.push(...readTasks);
      pumpReadQueueRef.current();
    },
    [addZips]
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
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleValidate = () => {
    const pendingFiles = files.filter((f) => f.content && f.status === "pending");
    console.log("UploadZone handleValidate called! pendingFiles length:", pendingFiles.length);
    if (pendingFiles.length > 0) {
      onFilesReady(pendingFiles as UploadedFile[]);
      setIgnoredCount(0);
      setZipStatus(EMPTY_ZIP_STATUS);
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
  const readyToValidate = validFiles.length > 0 && allFilesSettled && openingZips === 0 && !isValidating;
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
          {openingZips > 0 && (
            <p className="text-xs text-slate-500 mt-3">Abriendo {openingZips} ZIP…</p>
          )}
          {zipStatus.opened.length > 0 && (
            <p className="text-xs text-slate-500 mt-3">
              {zipStatus.opened.length.toLocaleString()} ZIP abierto{zipStatus.opened.length !== 1 ? "s" : ""}.
            </p>
          )}
          {zipStatus.failed.length > 0 && (
            <div className="text-xs text-red-700 mt-2">
              {zipStatus.failed.map((zip) => <p key={zip.path}>ZIP con error: {zip.path} — {zip.reason}</p>)}
            </div>
          )}
          {zipStatus.ignoredNested.length > 0 && (
            <p className="text-xs text-amber-700 mt-2">
              {zipStatus.ignoredNested.length} ZIP anidado{zipStatus.ignoredNested.length !== 1 ? "s" : ""} en más de un nivel ignorado{zipStatus.ignoredNested.length !== 1 ? "s" : ""}: {zipStatus.ignoredNested.join(", ")}
            </p>
          )}
          {ignoredCount > 0 && (
            <p className="text-xs text-slate-500 mt-3">
              {ignoredCount.toLocaleString()} archivo{ignoredCount !== 1 ? "s" : ""} no XML (PDF, TXT…) ignorado{ignoredCount !== 1 ? "s" : ""}.
            </p>
          )}
        </div>

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
                  {validFiles.length} válido{validFiles.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto">
              {files.map((file) => (
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
                onClick={() => { setFiles([]); setIgnoredCount(0); setZipStatus(EMPTY_ZIP_STATUS); }}
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
