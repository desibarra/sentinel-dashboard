import { useState, useCallback } from "react";
import { Upload, X, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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

export default function UploadZone({ onFilesReady, isValidating, hasValidatedResults }: UploadZoneProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [dragActive, setDragActive] = useState(false);

  const handleFiles = useCallback(
    (fileList: FileList) => {
      const newFiles: UploadedFile[] = [];

      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];

        if (!file.name.endsWith(".xml")) {
          newFiles.push({
            id: `${file.name}-${Date.now()}-${i}`,
            name: file.name,
            size: file.size,
            status: "error",
            error: "Solo se aceptan archivos .xml",
          });
          continue;
        }

        const fileId = `${file.name}-${Date.now()}-${i}`;
        const reader = new FileReader();

        reader.onload = (e) => {
          const content = e.target?.result as string;
          setFiles((prev) => {
            return prev.map((f) =>
              f.id === fileId ? { ...f, content, status: "pending" } : f
            );
          });
        };

        reader.onerror = () => {
          setFiles((prev) =>
            prev.map((f) =>
              f.id === fileId
                ? { ...f, status: "error", error: "Error al leer el archivo" }
                : f
            )
          );
        };

        newFiles.push({
          id: fileId,
          name: file.name,
          size: file.size,
          status: "pending",
        });

        reader.readAsText(file);
      }

      setFiles((prev) => [...prev, ...newFiles]);
    },
    []
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

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(e.target.files);
    }
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleValidate = () => {
    const pendingFiles = files.filter((f) => f.content && f.status === "pending");
    if (pendingFiles.length > 0) {
      onFilesReady(pendingFiles as UploadedFile[]);
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
        return <Badge className="bg-blue-100 text-blue-800">Procesando</Badge>;
      default:
        return <Badge className="bg-slate-100 text-slate-800">Pendiente</Badge>;
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
  const readyToValidate = validFiles.length > 0 && !isValidating;
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
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            dragActive
              ? "border-blue-500 bg-blue-50"
              : "border-slate-300 bg-slate-50 hover:border-slate-400"
          } ${isValidating ? "pointer-events-none opacity-50" : ""}`}
        >
          <Upload className="w-12 h-12 mx-auto mb-3 text-slate-400" />
          <p className="text-slate-700 font-medium mb-2">
            {isValidating ? "Procesando XMLs..." : "Arrastra tus archivos XML aquí"}
          </p>
          <p className="text-slate-500 text-sm mb-4">o</p>
          <div>
            <input
              id="xml-upload"
              type="file"
              multiple
              accept=".xml"
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
                <span>Seleccionar archivos XML</span>
              </Button>
            </label>
          </div>
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
              className="flex-1"
              size="lg"
              title={
                hasValidatedResults && files.length === 0
                  ? "Este lote ya fue validado. Carga nuevos XML para validar nuevamente."
                  : ""
              }
            >
              {isValidating ? "Validando XML..." : "Validar XML"}
            </Button>
            {files.length > 0 && (
              <Button
                variant="outline"
                onClick={() => setFiles([])}
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
