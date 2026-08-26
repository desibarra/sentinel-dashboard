
import { useEffect, useRef, useState } from "react";
import { CFDISATStatus } from "@/components/CFDISATStatus";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { CheckCircle2, AlertCircle, XCircle, TrendingUp, FileText, DollarSign, Download, Moon, Sun, ArrowUpDown, ArrowUp, ArrowDown, Trash2, Settings, BookOpen, Clock, MessageCircle, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import UploadZone, { UploadedFile } from "@/components/UploadZone";
import { useXMLValidator } from "@/hooks/useXMLValidator";
import { ValidationResult, contarEstatusSAT, aplicarConciliacionPagos, reconciliarPagosPPD, mergeAndReconcileResults } from "@/lib/cfdiEngine";
import { exportToExcel, planExportChunks, ExportProgressEvent, ExportCancelToken, ExportChunkPlan, MinimalFileSystemDirectoryHandle } from "@/lib/excelExporter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { resolverClasificacionDireccion } from "@/lib/direccionCFDI";
import { toast } from "sonner";
import { useTheme } from "@/contexts/ThemeContext";
import { Link } from "wouter";
import { useCompany } from "@/contexts/CompanyContext";
import { CompanySelector } from "@/components/CompanySelector";
import { HistorySidebar } from "@/components/HistorySidebar";
import { appDB, ValidationHistory } from "@/db/appDB";
import { startMainTour } from "@/utils/tourScript";
import { Input } from "@/components/ui/input";
import { History, RefreshCcw, Save } from "lucide-react";
import { checkCFDIStatusSAT } from "@/utils/satStatusValidator";
import { satQueue, SatQueueCounts } from "@/lib/satQueue";
import { incrementXMLCount, getXMLCount } from "@/services/leadService";
import { saveSessionCache, loadSessionCache, clearSessionCache, getCacheAge } from "@/hooks/useSessionCache";
import { useAuth } from "@/contexts/AuthContext";
import { tokenService } from "@/services/tokenService";
import { isBlacklistSynced } from "@/utils/blacklistValidator";
import { sentinelStageLog } from "@/lib/stageLog";


type DashboardResult = ValidationResult;
type SortField = 'fileName' | 'uuid' | 'tipoCFDI' | 'fechaEmision' | 'rfcEmisor' | 'total' | 'estatusSAT' | 'resultado' | 'comentarioFiscal';
type SortDirection = 'asc' | 'desc' | null;

// Transformación pura del reintento SAT para una fila (extraída del handler para
// reutilización y pruebas). No altera reglas: reproduce fielmente la lógica previa inline.
// El handler handleRevalidateSAT la aplica vía setResults(...map por UUID) para
// actualizar SOLO la fila correspondiente y dejar el resto intactas.
export type SATRevalidationStatus = {
  estado: 'Vigente' | 'Cancelado' | 'No Encontrado' | 'Error Conexión';
  estatusCancelacion?: string;
  validatedAt: Date;
};

export function revalidarFilaSAT(
  row: DashboardResult,
  status: SATRevalidationStatus,
  giroEmpresa: string,
  rfcEmpresa?: string
): DashboardResult {
  const resBase = row.resultadoMotor || row.resultado;
  const comBase = row.comentarioMotor || row.comentarioFiscal;

  let nuevoResultado = resBase;
  let nuevoComentario = comBase;

  if (status.estado === "Cancelado") {
    nuevoResultado = "🔴 NO USABLE";
    nuevoComentario = `[CRÍTICO] CFDI CANCELADO en SAT. ${status.estatusCancelacion || ""}. No tiene efectos fiscales. ` + comBase;
  } else if (status.estado === "No Encontrado") {
    nuevoResultado = "No validado SAT";
    nuevoComentario = `No validado: UUID no encontrado en SAT (puede ser muy reciente o apócrifo). Reintenta la consulta. ` + comBase;
  } else if (status.estado === "Error Conexión") {
    nuevoResultado = "No validado SAT";
    nuevoComentario = `No validado: no se pudo confirmar el estatus del CFDI ante el SAT. Reintenta la consulta. ` + comBase;
  }

  // ✅ Recalcular la dirección del CFDI tras revalidar (usa el RFC de la empresa,
  // nunca un valor hardcodeado) para mantener la coherencia de las cédulas.
  const dir = resolverClasificacionDireccion(
    { rfcEmisor: row.rfcEmisor, rfcReceptor: row.rfcReceptor },
    rfcEmpresa || row.rfcEmpresaEvaluada || '',
    row.tipoCFDI,
    (row.esNomina || '').toUpperCase() === 'SÍ'
  );

  // ✅ Coherencia de riesgo: un hallazgo (NO USABLE / no validado) nunca queda VERDE.
  const nuevoRiskLevel: 'VERDE' | 'AMARILLO' | 'ROJO' =
    nuevoResultado.includes('NO USABLE') ? 'ROJO'
    : nuevoResultado === 'No validado SAT' ? 'AMARILLO'
    : (row.fiscalRiskLevel || 'VERDE');

  return {
    ...row,
    estatusSAT: status.estado,
    fechaCancelacion: status.estatusCancelacion || row.fechaCancelacion || "",
    ultimoRefrescoSAT: status.validatedAt.toISOString(),
    giroEmpresa,
    resultado: nuevoResultado,
    comentarioFiscal: nuevoComentario,
    fiscalRiskLevel: nuevoRiskLevel,
    ...dir,
  };
}

export default function Dashboard() {
  const { theme, toggleTheme } = useTheme();
  const { currentCompany } = useCompany();
  const { demoTokenData } = useAuth();
  const [results, setResults] = useState<ValidationResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasValidatedResults, setHasValidatedResults] = useState(false);
  const { isValidating, validateXMLFiles, progress } = useXMLValidator();
  const [sortField, setSortField] = useState<SortField | null>('fechaEmision');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  // P0-A: progreso de exportación por hoja + bloqueo de doble ejecución
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ sheet: string; sheetIndex: number; totalSheets: number; fileIndex?: number; fileTotal?: number; fileName?: string } | null>(null);
  // Exportación cancelable (lotes grandes, paquete de varios archivos): se
  // crea un token nuevo por cada exportación; cancelar nunca borra archivos
  // ya descargados ni la sesión guardada (`results` no se toca aquí).
  const exportCancelTokenRef = useRef<ExportCancelToken | null>(null);
  // Pantalla previa (instrucción 5): antes de exportar un lote grande se
  // informa cuántos archivos se generarán y se ofrece elegir una carpeta
  // real (File System Access API, escritura confirmada) o descargar uno por
  // uno (mecanismo de navegador de siempre, que el navegador puede bloquear
  // sin que JS se entere).
  const [exportPrecheck, setExportPrecheck] = useState<{ plan: ExportChunkPlan; basePrefix: string } | null>(null);
  // Reintento dirigido: recuerda el último intento fallido/cancelado para
  // poder ofrecer "reanudar desde el archivo N" en vez de regenerar todo.
  const lastExportAttemptRef = useRef<{
    basePrefix: string; failedAtFile?: number; directoryHandle?: MinimalFileSystemDirectoryHandle;
  } | null>(null);
  // P0-C: reintento masivo de CFDI "No validado SAT" + contadores en vivo de la cola SAT
  const [isBulkRevalidating, setIsBulkRevalidating] = useState(false);
  const [satBulkCounts, setSatBulkCounts] = useState<SatQueueCounts | null>(null);
  const ITEMS_PER_PAGE = 50;

  // ── Contador de XMLs procesados (informativo, sin límite visible) ──
  const [xmlCount, setXmlCount] = useState<number>(getXMLCount());

  // ── Contadores de dirección del CFDI (corrección de espejos contables) ──
  // Emitidos (la empresa vende) vs Recibidos (la empresa compra) vs sin clasificar.
  const contadoresDireccion = (() => {
    const total = results.length;
    const emitidos = results.filter(r => r.direccionCFDI === 'EMITIDO').length;
    const recibidos = results.filter(r => r.direccionCFDI === 'RECIBIDO').length;
    const revision = results.filter(r => !r.direccionCFDI || r.direccionCFDI === 'REQUIERE_REVISION').length;
    const vigentes = results.filter(r => /vigente/i.test(r.estatusSAT || '')).length;
    const cancelados = results.filter(r => /cancelado/i.test(r.estatusSAT || '')).length;
    const con69B = results.filter(r => {
      const bl = r.direccionCFDI === 'EMITIDO' ? r.rfcReceptorBlacklist : r.rfcEmisorBlacklist;
      return !!bl?.found;
    }).length;
    return { total, emitidos, recibidos, revision, vigentes, cancelados, con69B };
  })();

  // ── UUIDs que están siendo revalidados en este momento (para deshabilitar su botón) ──
  const [revalidatingUUIDs, setRevalidatingUUIDs] = useState<Set<string>>(new Set());

  // ── Estado de sincronización de listas 69-B/EFOS en IndexedDB ──
  const [listasNoSincronizadas, setListasNoSincronizadas] = useState<boolean>(false);

  useEffect(() => {
    isBlacklistSynced().then((synced) => {
      setListasNoSincronizadas(!synced);
    }).catch(() => setListasNoSincronizadas(true));
  }, []);


  // WhatsApp CTA constants
  const WHATSAPP_NUMBER = "524776355734";
  const WHATSAPP_MESSAGE = encodeURIComponent(
    `Hola, estoy usando la herramienta Sentinel Express (Token: ${demoTokenData?.token || 'N/A'}). Solicito un diagnóstico fiscal profesional y asesoría sobre mis resultados.`
  );
  const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${WHATSAPP_MESSAGE}`;

  // ── Progreso de procesamiento masivo ──
  const [processingPhase, setProcessingPhase] = useState<string | null>(null);

  // FIX 2: ref para detectar primer mount y no borrar caché en la carga inicial
  const isFirstMount = useRef(true);
  // P0-B: empresa anterior, para limpiar SOLO su caché de sesión al cambiar de empresa
  // (cada empresa tiene su propia entrada en IndexedDB — appDB.ts "sessionCache").
  const prevCompanyIdRef = useRef<string | undefined>(undefined);

  // Calcular días restantes de prueba
  const getDaysLeft = () => {
    if (!demoTokenData?.expiresAt) return null;
    const expiry = new Date(demoTokenData.expiresAt);
    const now = new Date();
    const diffTime = expiry.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };
  const daysLeft = getDaysLeft();

  // Onboarding y Telemetría
  useEffect(() => {
    setLoading(false);
    
    // -- TELEMETRÍA MÍNIMA VENDIBLE --
    if (demoTokenData?.token) {
       tokenService.trackEvent(demoTokenData.token, 'dashboard_opened');
    }

    const hasSeenTour = localStorage.getItem('has_seen_main_tour');
    if (!hasSeenTour) {
      setTimeout(() => {
        startMainTour();
        localStorage.setItem('has_seen_main_tour', 'true');
      }, 1000);
    }
  }, [demoTokenData?.token]);



  // FIX 2: Restaurar análisis previo de la sesión (TTL 30 min, por empresa)
  // Se ejecuta ANTES del cleanup para que los datos restaurados no sean borrados.
  // P0-B: loadSessionCache ahora lee de IndexedDB (async) — cada empresa tiene su
  // propia entrada, así que ya no depende de que sea "la última empresa guardada".
  useEffect(() => {
    if (!currentCompany) return;
    let cancelled = false;

    (async () => {
      const cached = await loadSessionCache(currentCompany.id);
      if (cancelled || !cached || cached.results.length === 0) return;

      // Se re-ejecuta la conciliación central sobre el acumulado restaurado:
      // garantiza que el estado de pago (PPD↔REP) sea el mismo que vería el
      // usuario si acabara de terminar de cargar estos mismos XML, incluso si
      // la sesión guardada es de antes de un cambio en las reglas.
      const resultadosConciliados = aplicarConciliacionPagos(cached.results);
      setResults(resultadosConciliados);
      setHasValidatedResults(true);
      setXmlCount(resultadosConciliados.length);

      const age = await getCacheAge(currentCompany.id);
      if (cancelled) return;
      toast.info(
        `Se restauró el análisis previo de esta sesión (${cached.results.length.toLocaleString()} CFDI, hace ${age} min).`,
        { duration: 6000 }
      );
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCompany?.id]);



  // FIX 2: Limpiar dashboard SOLO cuando la empresa cambia (no en el primer mount).
  // isFirstMount evita que este efecto borre lo que el efecto anterior acaba de restaurar.
  // P0-B: se limpia únicamente la caché de la empresa que se abandona — la nueva
  // empresa conserva su propia caché de sesión (por eso el efecto de arriba sí
  // puede restaurarla al volver a seleccionarla dentro del TTL de 30 min).
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      prevCompanyIdRef.current = currentCompany?.id;
      return;
    }

    setResults([]);
    setHasValidatedResults(false);

    const leavingCompanyId = prevCompanyIdRef.current;
    if (leavingCompanyId) {
      clearSessionCache(leavingCompanyId);
    }
    prevCompanyIdRef.current = currentCompany?.id;
  }, [currentCompany?.id]);



  const handleFilesReady = async (files: any[]) => {
    console.log("Dashboard handleFilesReady called! Files length:", files?.length);
    // Si no hay archivos, no hacer nada
    if (!files || files.length === 0) return;
    if (!currentCompany) {

      toast.error("Selecciona una empresa antes de cargar XMLs");

      return;

    }



    // Aviso informativo para volumen alto (> 3000), sin bloquear

    if (files.length > 3000) {

      toast.info(

        `Sentinel está procesando un volumen alto de CFDI (${files.length.toLocaleString()}). El análisis se realizará en varias fases. Puedes continuar trabajando mientras el sistema procesa la información.`,

        { duration: 8000 }

      );

    }



    // Actualizar fase de progreso visible

    setProcessingPhase(`Procesando ${files.length.toLocaleString()} CFDI...`);



    try {

      // Callback para actualizar la fase de progreso por lotes de 200

      const onBatchProgress = (current: number, total: number) => {

        if (total > 200) {

          const from = Math.max(1, current - 199);

          setProcessingPhase(`Analizando CFDI ${from.toLocaleString()}–${current.toLocaleString()} de ${total.toLocaleString()}`);

        }

        sentinelStageLog("validacion_lote", { current, total });

      };



        sentinelStageLog("validacion_inicio", { total: files.length });
        const validationResults = await validateXMLFiles(files, currentCompany.giro, currentCompany.rfc, onBatchProgress);
        sentinelStageLog("validacion_fin", { count: validationResults.length });
      setProcessingPhase(null);

      // --- FILTRO DE DESDUPLICACIÓN + CONCILIACIÓN CENTRAL (cargas sucesivas) ---
      // mergeAndReconcileResults (cfdiEngine.ts) deduplica por UUID contra la
      // vista actual y luego ejecuta la conciliación central UNA sola vez
      // sobre el acumulado COMPLETO: esto actualiza retroactivamente facturas
      // PPD cargadas en lotes anteriores cuando su REP llega en este lote (y
      // viceversa). No existen dos motores con estados contradictorios — es
      // la MISMA función que usa el Excel y los resúmenes.
      const { combinado: newResults, agregados, omitidosPorDuplicado: skippedCount } = mergeAndReconcileResults(results, validationResults);
      setResults(newResults);
      setHasValidatedResults(true);

      // Actualizar contador informativo solo con los nuevos reales
      const newCount = incrementXMLCount(agregados);
      setXmlCount(newCount);



      // Persistir en sesión (sin XML crudos) — ya con la conciliación aplicada.

      sentinelStageLog("persistencia_indexeddb_inicio", { count: newResults.length });
      saveSessionCache(currentCompany.id, newResults).then(status => {
        sentinelStageLog("persistencia_indexeddb_fin", { status });
      });



      // Guardar en histórico automáticamente

      await saveToHistory(newResults);



      const usable = validationResults.filter((r) => r.resultado.includes("🟢")).length;

      const alertas = validationResults.filter((r) => r.resultado.includes("🟡")).length;

      const noUsable = validationResults.filter((r) => r.resultado.includes("🔴")).length;

      const noValidadosSAT = contarEstatusSAT(validationResults).noConfirmados;



      toast.success(

        `Validación completada: ${usable} usables, ${alertas} con alertas, ${noUsable} no usables, ${noValidadosSAT} no validados SAT`,

        { duration: 5000 }

      );

    } catch (error) {

      toast.error("Error al validar los archivos XML");

      console.error("Validation error:", error);

    }

  };



  const saveToHistory = async (validationResults: ValidationResult[]) => {

    if (!currentCompany || validationResults.length === 0) return;



    const historyEntry: ValidationHistory = {

      id: crypto.randomUUID(),

      companyId: currentCompany.id,

      timestamp: Date.now(),

      fileName: `Proceso ${new Date().toLocaleDateString()}`,

      xmlCount: validationResults.length,

      usableCount: validationResults.filter((r) => r.resultado.includes("🟢")).length,

      alertCount: validationResults.filter((r) => r.resultado.includes("🟡")).length,

      errorCount: validationResults.filter((r) => r.resultado.includes("🔴")).length,

      totalAmount: validationResults.reduce((sum, r) => sum + r.total, 0),

      results: validationResults

    };



    await appDB.saveHistory(historyEntry);

  };



  // FIX 1 + FIX 3: Restaura resultados, activa sección de resultados,

  // sincroniza el contador de XML y muestra confirmación al usuario

  const handleLoadHistory = (history: ValidationHistory) => {

    // Se recalcula con la función central al restaurar un histórico, para
    // que refleje siempre el mismo resultado que vería una carga nueva.
    setResults(aplicarConciliacionPagos(history.results || []));

    setHasValidatedResults(true);

    setXmlCount(history.xmlCount);   // FIX 3: sincroniza contador del header

    setCurrentPage(1);               // regresa a la primera página de la tabla

    toast.success(`Proceso restaurado: ${(history.xmlCount || 0).toLocaleString()} CFDI · ${history.fileName}`, { duration: 4000 });

  };



  const handleNoteUpdate = (index: number, note: string) => {

    const newResults = [...results];

    newResults[index].observacionesContador = note;

    setResults(newResults);

  };



  // Punto de entrada del botón "Exportar Reporte". Para lotes pequeños
  // exporta directamente (comportamiento de siempre). Para lotes grandes
  // (paquete de varios archivos) muestra primero la pantalla previa
  // (instrucción 5) — o, si el intento anterior quedó a medias, ofrece
  // reanudar en vez de volver a mostrar la pantalla previa desde cero.
  const handleExportToExcel = () => {
    if (isExporting) return; // P0-A (requisito 12): evitar doble ejecución.

    const plan = planExportChunks(results);
    if (plan.singleFile) {
      runExport({});
      return;
    }

    const pendiente = lastExportAttemptRef.current;
    if (pendiente?.failedAtFile) {
      const reanudar = window.confirm(
        `La exportación anterior se detuvo en el archivo ${pendiente.failedAtFile} de ${plan.chunks.length + 1}. ` +
        `¿Reanudar desde ahí (los archivos ya generados no se repiten)? Cancelar para empezar de nuevo.`
      );
      if (reanudar) {
        runExport({ resumeFromFile: pendiente.failedAtFile, basePrefix: pendiente.basePrefix, directoryHandle: pendiente.directoryHandle });
        return;
      }
      lastExportAttemptRef.current = null; // el usuario eligió empezar de nuevo
    }

    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    setExportPrecheck({ plan, basePrefix: `SentinelExpress_Diagnostico_${today}_${Date.now()}` });
  };

  const supportsFileSystemAccess = typeof window !== 'undefined' && typeof (window as any).showDirectoryPicker === 'function';

  const handleChooseFolder = async () => {
    if (!exportPrecheck) return;
    const { basePrefix } = exportPrecheck;
    setExportPrecheck(null);
    try {
      const directoryHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
      runExport({ basePrefix, directoryHandle });
    } catch (err) {
      // El usuario cerró el selector de carpeta sin elegir una — no se afirma
      // ningún guardado; simplemente no se exporta nada todavía.
      toast.info('No se eligió ninguna carpeta. La exportación no se inició.');
    }
  };

  const handleDownloadIndividually = () => {
    if (!exportPrecheck) return;
    const { basePrefix } = exportPrecheck;
    setExportPrecheck(null);
    runExport({ basePrefix });
  };

  const runExport = async (opts: { basePrefix?: string; directoryHandle?: MinimalFileSystemDirectoryHandle; resumeFromFile?: number }) => {
    const cancelToken: ExportCancelToken = { cancelled: false };
    exportCancelTokenRef.current = cancelToken;

    setIsExporting(true);
    setExportProgress({ sheet: 'Preparando...', sheetIndex: 0, totalSheets: 0 });

    try {
      const onProgress = (event: ExportProgressEvent) => {
        setExportProgress({
          sheet: event.sheet, sheetIndex: event.sheetIndex, totalSheets: event.totalSheets,
          fileIndex: event.fileIndex, fileTotal: event.fileTotal, fileName: event.fileName,
        });
        sentinelStageLog("export_hoja", { sheet: event.sheet, sheetIndex: event.sheetIndex, totalSheets: event.totalSheets, stage: (event as any).stage, affectedRows: (event as any).affectedRows, fileIndex: event.fileIndex, fileTotal: event.fileTotal });
      };

      // exportToExcel cede el hilo principal entre cada hoja (P0-A requisito 10):
      // el progreso se pinta en tiempo real y la interfaz no se congela durante
      // la exportación de lotes grandes. Para lotes muy grandes, exportToExcel
      // decide internamente generar un paquete de varios archivos en vez de un
      // único XLSX — ver ExportStatusInfo.isMultiFile.
      sentinelStageLog("export_inicio", { count: results.length });
      const wb = await exportToExcel(results, opts.basePrefix, onProgress, {
        cancelToken, directoryHandle: opts.directoryHandle, resumeFromFile: opts.resumeFromFile,
      });
      sentinelStageLog("export_fin_workbook", { count: results.length });

      // Reportes parciales (requisito 3): el estado real de la exportación viene
      // del workbook, no solo de si exportToExcel lanzó o no — un archivo puede
      // "tener éxito" técnicamente y aun así estar incompleto.
      const status = (wb as any).__sentinelExportStatus as {
        status: 'complete' | 'partial' | 'critical_failure' | 'cancelled';
        failures: { sheet: string; error: string; critical: boolean }[];
        isMultiFile?: boolean;
        filesWritten?: string[];
        totalFiles?: number;
        failedAtFile?: number;
        writesConfirmed?: boolean;
        reconciliacion?: { totalProcesados: number; uuidExportados: number; erroresLectura: number; duplicadosControlados: number; cuadra: boolean };
      } | undefined;

      // Redacción honesta (instrucción 5): sin File System Access API, JS NO
      // puede confirmar que el navegador no bloqueó una descarga múltiple —
      // nunca se afirma "guardado", solo "enviado a descarga".
      const verboGuardado = status?.writesConfirmed ? 'guardado' : 'enviado a descarga';
      const avisoNoConfirmado = status?.isMultiFile && !status?.writesConfirmed
        ? ' Si tu navegador bloqueó alguna descarga, verás un aviso de "descargas bloqueadas" en la barra de direcciones — revísalo y permite descargas múltiples para este sitio antes de reintentar.'
        : '';

      // Punto de reanudación unificado: para una falla, exportToExcel ya
      // indica exactamente cuál archivo falló (failedAtFile); para una
      // cancelación, se infiere del número de archivos de BLOQUE ya escritos
      // (la cancelación siempre ocurre antes de intentar el resumen global,
      // que solo se genera al final) — instrucción 6: "cancela después del
      // archivo 3" debe poder reanudar exactamente en el archivo 4.
      const resumePoint = status?.status === 'critical_failure'
        ? status.failedAtFile
        : status?.status === 'cancelled'
          ? (status.filesWritten?.length || 0) + 1
          : undefined;

      if (status?.isMultiFile && opts.basePrefix) {
        lastExportAttemptRef.current = resumePoint !== undefined
          ? { basePrefix: opts.basePrefix, failedAtFile: resumePoint, directoryHandle: opts.directoryHandle }
          : null; // completo o parcial (sin fallas críticas de archivo) — nada que reanudar
      }

      if (status?.status === 'cancelled') {
        toast.warning(
          `Exportación cancelada. ${status.filesWritten?.length || 0} archivo(s) ya se habían ${verboGuardado} antes de cancelar y se conservan; la sesión cargada no se vio afectada. Puede reanudar desde el botón "Exportar Reporte".`,
          { duration: 10000 }
        );
      } else if (status?.isMultiFile && status.status === 'critical_failure') {
        toast.error(
          `EXPORTACIÓN INCOMPLETA: falló la generación del archivo ${status.failedAtFile} de ${status.totalFiles}. Los ${status.filesWritten?.length || 0} archivo(s) anteriores ya ${verboGuardado} se conservan intactos. Vuelva a pulsar "Exportar Reporte" para reanudar solo los pendientes.`,
          { duration: 15000 }
        );
      } else if (status?.isMultiFile) {
        const rec = status.reconciliacion;
        const recTexto = rec
          ? ` Reconciliación: ${rec.totalProcesados} procesados = ${rec.uuidExportados} exportados + ${rec.erroresLectura} errores + ${rec.duplicadosControlados} duplicados (${rec.cuadra ? 'cuadra exactamente' : 'REVISAR — no cuadra'}).`
          : '';
        if (status.status === 'partial') {
          toast.warning(
            `Diagnóstico ${verboGuardado} como paquete de ${status.totalFiles} archivos (lote grande). Algunas hojas de detalle no se pudieron generar en uno o más bloques.${recTexto}${avisoNoConfirmado}`,
            { duration: 14000 }
          );
        } else {
          toast.success(`Diagnóstico ${verboGuardado} como paquete de ${status.totalFiles} archivos (00_Resumen_Global + ${status.totalFiles! - 1} bloques).${recTexto}${avisoNoConfirmado}`, { duration: 12000 });
        }
      } else if (status?.status === 'critical_failure') {
        toast.error(
          `EXPORTACIÓN INCOMPLETA: una hoja fiscal crítica (${status.failures.filter(f => f.critical).map(f => f.sheet).join(', ')}) no se pudo generar. Se descargó únicamente un reporte de diagnóstico (archivo "DIAGNOSTICO_INCOMPLETO_..."), no el reporte completo. Revise la primera hoja del archivo para el detalle.`,
          { duration: 15000 }
        );
      } else if (status?.status === 'partial') {
        toast.warning(
          `EXPORTACIÓN INCOMPLETA: ${status.failures.length} hoja(s) de detalle no se pudieron generar (las hojas fiscales críticas sí se generaron). El archivo se descargó como "INCOMPLETO_...". Revise la primera hoja para el detalle.`,
          { duration: 12000 }
        );
      } else {
        toast.success("Diagnóstico exportado exitosamente");
      }
    } catch (error) {
      toast.error("Error al exportar el diagnóstico");
      console.error("Export error:", error);
    } finally {
      setIsExporting(false);
      setExportProgress(null);
      exportCancelTokenRef.current = null;
    }
  };

  const handleCancelExport = () => {
    if (exportCancelTokenRef.current) {
      exportCancelTokenRef.current.cancelled = true;
      toast.info("Cancelando exportación… se conservarán los archivos ya generados.");
    }
  };



  const handleClearData = () => {
    if (window.confirm("¿Deseas eliminar el análisis actual? Esta acción no se puede deshacer.")) {
      // 1. Borrar estado React
      setResults([]);
      setHasValidatedResults(false);
      setSortField(null);
      setSortDirection(null);
      setCurrentPage(1);
      setXmlCount(0);

      // 2. Limpiar almacenamiento local
      if (currentCompany) {
        clearSessionCache(currentCompany.id);
      }
      localStorage.removeItem("sentinel_xml_count");
      localStorage.removeItem("xmlAnalysis");
      localStorage.removeItem("xmlResults");

      // 3. Limpiar IndexedDB si existe
      if (window.indexedDB) {
        indexedDB.deleteDatabase("SentinelAnalysis");
      }

      toast.info("Análisis limpiado correctamente");

      // 4. Refrescar dashboard
      setTimeout(() => {
        window.location.reload();
      }, 500);
    }
  };



  // Filtrar XML eliminados (Soft delete)
  const visibleResults = results.filter(r => !r.deleted);

  // Calcular estadísticas

  const stats = (() => {
    const total = visibleResults.length;
    const usables = visibleResults.filter(r => r.resultado.includes("🟢")).length;
    const alertas = visibleResults.filter(r => r.resultado.includes("🟡")).length;
    const noUsable = visibleResults.filter(r => r.resultado.includes("🔴")).length;
    const conteoSAT = contarEstatusSAT(visibleResults);
    const noValidadosSAT = conteoSAT.noConfirmados;
    // Salud ponderada: 🟢 = 100%, 🟡 = 50%, 🔴 = 0%, No validado excluido
    const totalClasificados = usables + alertas + noUsable;
    const salud = totalClasificados > 0 ? Math.round(((usables + alertas * 0.5) / totalClasificados) * 100) : 100;
    // Monto en riesgo: suma de totales con 🔴 o 🟡
    const montoRiesgo = visibleResults
      .filter(r => r.resultado.includes("🔴") || r.resultado.includes("🟡"))
      .reduce((sum, r) => sum + r.total, 0);
    return {
      total,
      usables,
      alertas,
      noUsable,
      noValidadosSAT,
      repExcluidosSAT: conteoSAT.repExcluidos,
      salud,
      montoRiesgo,
      totalMonto: visibleResults.reduce((sum, r) => sum + r.total, 0),
      totalIVA: visibleResults.reduce((sum, r) => sum + r.ivaTraslado, 0),
    };
  })();

  // Conciliación PPD↔REP — MISMA función central que usan Resumen, RESUMEN
  // EJECUTIVO y Excel (reconciliarPagosPPD, cfdiEngine.ts). La pantalla nunca
  // calcula sus propios totales de forma independiente.
  const conciliacionPPD = (() => {
    const { facturas, reps } = reconciliarPagosPPD(visibleResults);
    const porEstado = {
      PUE: facturas.filter(f => f.estado === 'PUE').length,
      SIN_EVIDENCIA_REP: facturas.filter(f => f.estado === 'SIN_EVIDENCIA_REP').length,
      PARCIAL: facturas.filter(f => f.estado === 'PARCIAL').length,
      LIQUIDADA: facturas.filter(f => f.estado === 'LIQUIDADA').length,
      REQUIERE_REVISION_MONEDA: facturas.filter(f => f.estado === 'REQUIERE_REVISION_MONEDA').length,
      REQUIERE_REVISION_FECHA: facturas.filter(f => f.estado === 'REQUIERE_REVISION_FECHA').length,
    };
    // Informativo, NUNCA un estado de pago propio: REP con FechaPago
    // comprobada anterior al 01/09/2018 (evaluarObligacionREP). El documento
    // sigue contando como LIQUIDADA/PARCIAL según el dinero reconciliado.
    const pagosHistoricamenteExentos = facturas.filter(f => f.pagoHistoricamenteExento).length;
    const repsPorEstado = {
      RELACIONADO: reps.filter(r => r.estado === 'RELACIONADO').length,
      SIN_FACTURA_RELACIONADA: reps.filter(r => r.estado === 'SIN_FACTURA_RELACIONADA').length,
      RECHAZADO_ERROR: reps.filter(r => r.estado === 'RECHAZADO_ERROR').length,
      DUPLICADO: reps.filter(r => r.estado === 'DUPLICADO').length,
    };
    const requiereRevision = porEstado.REQUIERE_REVISION_MONEDA + porEstado.REQUIERE_REVISION_FECHA;
    return {
      porEstado,
      repsPorEstado,
      pagosHistoricamenteExentos,
      // "Facturas PPD = sin evidencia + parciales + liquidadas + requieren revisión"
      totalFacturasPPD: porEstado.SIN_EVIDENCIA_REP + porEstado.PARCIAL + porEstado.LIQUIDADA + requiereRevision,
      // "REP cargados = relacionados + huérfanos + rechazados + duplicados"
      totalREPCargados: repsPorEstado.RELACIONADO + repsPorEstado.SIN_FACTURA_RELACIONADA + repsPorEstado.RECHAZADO_ERROR + repsPorEstado.DUPLICADO,
    };
  })();



  // Datos para gráficos

  const statusData = [

    { name: "Usable", value: stats.usables, color: "#166534" },

    { name: "Alertas", value: stats.alertas, color: "#B45309" },

    { name: "No Usable", value: stats.noUsable, color: "#991B1B" },

    { name: "No Validados SAT", value: stats.noValidadosSAT, color: "#64748B" },

  ];



  const trendData = visibleResults.map((r, idx) => ({

    index: idx + 1,

    total: r.total,

    iva: r.ivaTraslado,

    subtotal: r.subtotal,

  }));



  const getStatusIcon = (resultado: string) => {

    if (resultado.startsWith("No validado")) return <AlertCircle className="w-5 h-5 text-slate-500" />;

    if (resultado.includes("🟢")) return <CheckCircle2 className="w-5 h-5 text-emerald-800" />;

    if (resultado.includes("🟡")) return <AlertCircle className="w-5 h-5 text-amber-700" />;

    return <XCircle className="w-5 h-5 text-red-800" />;

  };



  const getStatusBadge = (resultado: string) => {

    if (resultado.startsWith("No validado")) return <Badge className="bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20 hover:bg-slate-500/20 px-3 py-1 font-black uppercase tracking-tighter">No Validado</Badge>;

    if (resultado.includes("🟢")) return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/20 px-3 py-1 font-black uppercase tracking-tighter animate-in fade-in zoom-in duration-500">Usable</Badge>;

    if (resultado.includes("🟡")) return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 hover:bg-amber-500/20 px-3 py-1 font-black uppercase tracking-tighter">Alertas</Badge>;

    return <Badge className="bg-rose-500/10 text-rose-600 border-rose-500/20 hover:bg-rose-500/20 px-3 py-1 font-black uppercase tracking-tighter animate-pulse">No Usable</Badge>;

  };



  const formatDate = (dateStr: string) => {

    if (!dateStr || dateStr === "NO DISPONIBLE") return "Sin fecha";

    const date = new Date(dateStr);

    if (isNaN(date.getTime())) return "Sin fecha";

    return date.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });

  };




  const handleDeleteXML = async (uuid: string) => {
    if (!window.confirm("¿Estás seguro de que deseas eliminar este XML del tablero?")) return;

    try {
      // 1) Enviar la solicitud DELETE al backend para marcarlo como eliminado (Soft Delete)
      const res = await fetch(`/api/xml/${uuid}`, { method: 'DELETE' });
      if (!res.ok) {
        console.warn(`Endpoint de backend temporalmente no disponible (${res.status}). Ocultando localmente.`);
      }

      // 2) Actualizar el estado local (Soft delete en frontend)
      const newResults = results.map(r =>
        r.uuid === uuid ? { ...r, deleted: true, deletedAt: new Date().toISOString() } : r
      );

      setResults(newResults);

      // 3) Persistir en sesión para que no reaparezca 
      if (currentCompany) {
        saveSessionCache(currentCompany.id, newResults);
        // Nota: Idealmente actualizaríamos el historial remoto aquí también
      }

      toast.success("XML eliminado correctamente");
    } catch (error) {
      console.error("Error al eliminar XML:", error);
      toast.error("Error al comunicarse con el servidor");
    }
  };

  // Función de ordenamiento


  const handleSort = (field: SortField) => {

    let newDirection: SortDirection = 'asc';



    if (sortField === field) {

      if (sortDirection === 'asc') {

        newDirection = 'desc';

      } else if (sortDirection === 'desc') {

        newDirection = null;

      }

    }



    setSortField(newDirection === null ? null : field);

    setSortDirection(newDirection);

  };



  // Obtener icono de ordenamiento

  const getSortIcon = (field: SortField) => {

    if (sortField !== field) {

      return <ArrowUpDown className="w-4 h-4 opacity-40 group-hover:opacity-100 transition-opacity" />;

    }

    if (sortDirection === 'asc') {

      return <ArrowUp className="w-4 h-4 text-primary" />;

    }

    return <ArrowDown className="w-4 h-4 text-primary" />;

  };



  // Aplicar ordenamiento a los resultados

  const sortedResults = [...visibleResults].sort((a, b) => {

    if (!sortField || !sortDirection) return 0;



    let comparison = 0;



    switch (sortField) {

      case 'fileName':

        comparison = a.fileName.localeCompare(b.fileName);

        break;

      case 'uuid':

        comparison = (a.uuid || '').localeCompare(b.uuid || '');

        break;

      case 'rfcEmisor':

        comparison = a.rfcEmisor.localeCompare(b.rfcEmisor);

        break;

      case 'total':

        comparison = a.total - b.total;

        break;

      case 'estatusSAT':

        comparison = a.estatusSAT.localeCompare(b.estatusSAT);

        break;

      case 'tipoCFDI':

        comparison = (a.tipoCFDI || '').localeCompare(b.tipoCFDI || '');

        break;

      case 'resultado':

        comparison = a.resultado.localeCompare(b.resultado);

        break;

      case 'comentarioFiscal':

        comparison = a.comentarioFiscal.localeCompare(b.comentarioFiscal);

        break;

      case 'fechaEmision':

        comparison = new Date(a.fechaEmision || '').getTime() - new Date(b.fechaEmision || '').getTime();

        break;

    }



    return sortDirection === 'asc' ? comparison : -comparison;

  });



  /**

   * handleRevalidateSAT

   * Recibe el UUID de la fila — NUNCA índices.

   * Usa setResults con .map por UUID para garantizar que solo esa fila se modifique,

   * sin importar el orden actual del sort ni la página visible.

   */

  const handleRevalidateSAT = async (uuid: string) => {

    if (!uuid || uuid === "NO DISPONIBLE") return;

    if (revalidatingUUIDs.has(uuid)) return; // evita múltiples solicitudes simultáneas



    // Obtener datos de la fila desde el estado, buscando por UUID

    const result = results.find(r => r.uuid === uuid);

    if (!result) return;



    // Marcar como en progreso

    setRevalidatingUUIDs(prev => new Set(prev).add(uuid));

    toast.loading("Consultando SAT...", { id: `rev-${uuid}` });



    try {

      const status = await checkCFDIStatusSAT(result.uuid, result.rfcEmisor, result.rfcReceptor, result.total);



      // Actualizar SOLO la fila cuyo UUID coincide — inmune al sort y la páginación

      setResults(prev => prev.map(row => {

        if (row.uuid !== uuid) return row; // todas las demas filas: sin tocar

        // Logica de revalidacion delegada a funcion pura reutilizable (revalidarFilaSAT)
        return revalidarFilaSAT(row, status, currentCompany?.giro || row.giroEmpresa || '', currentCompany?.rfc || row.rfcEmpresaEvaluada);

      }));



      if (status.estado === "Error Conexión") {

        toast.error("No se pudo conectar con el SAT (Timeout)", { id: `rev-${uuid}` });

      } else {

        toast.success(`Estatus SAT actualizado: ${status.estado}`, { id: `rev-${uuid}` });

      }

    } catch (error) {

      console.error("Revalidation error:", error);

      toast.error("Error inesperado al revalidar", { id: `rev-${uuid}` });

    } finally {

      // Siempre liberar el bloqueo, incluso si falla

      setRevalidatingUUIDs(prev => {

        const next = new Set(prev);

        next.delete(uuid);

        return next;

      });

    }

  };

  // P0-C: reintento masivo de SAT. Objetivo explícito: un timeout/error SAT no
  // debe dejar un CFDI huérfano esperando un reintento manual fila por fila.
  // Solo toca registros en estado NO concluyente ("No validado SAT" — cubre
  // Timeout, Error de conexión y No Encontrado); Vigente y Cancelado NUNCA se
  // tocan aquí. Las llamadas reales pasan por satQueue (useXMLValidator.ts /
  // satStatusValidator.ts), que ya acota la concurrencia — por eso es seguro
  // lanzarlas todas juntas en vez de trocearlas manualmente aquí.
  const handleRevalidateAllPending = async () => {
    if (isBulkRevalidating) return; // evita doble ejecución

    const pendientes = results.filter(r =>
      r.uuid && r.uuid !== 'NO DISPONIBLE' &&
      String(r.resultado || '').startsWith('No validado')
    );
    if (pendientes.length === 0) {
      toast.info('No hay CFDI pendientes de validar con el SAT.');
      return;
    }

    setIsBulkRevalidating(true);
    satQueue.resetCounts(pendientes.length);
    const unsubscribe = satQueue.onCountsChange(counts => setSatBulkCounts({ ...counts }));
    toast.loading(`Reintentando ${pendientes.length.toLocaleString()} CFDI pendientes ante el SAT...`, { id: 'bulk-sat-retry' });

    try {
      const outcomes = await Promise.all(pendientes.map(async (row) => {
        const status = await checkCFDIStatusSAT(row.uuid, row.rfcEmisor, row.rfcReceptor, row.total);
        return { uuid: row.uuid, status };
      }));

      const byUuid = new Map(outcomes.map(o => [o.uuid, o.status]));
      setResults(prev => prev.map(row => {
        const status = byUuid.get(row.uuid);
        if (!status) return row; // fila no incluida en el reintento: sin tocar
        return revalidarFilaSAT(row, status, currentCompany?.giro || row.giroEmpresa || '', currentCompany?.rfc || row.rfcEmpresaEvaluada);
      }));

      const resueltos = outcomes.filter(o => o.status.estado === 'Vigente' || o.status.estado === 'Cancelado').length;
      toast.success(`Reintento completado: ${resueltos}/${pendientes.length} CFDI obtuvieron un estatus definitivo del SAT.`, { id: 'bulk-sat-retry', duration: 8000 });
    } catch (error) {
      console.error('Bulk SAT revalidation error:', error);
      toast.error('Error inesperado durante el reintento masivo.', { id: 'bulk-sat-retry' });
    } finally {
      unsubscribe();
      setIsBulkRevalidating(false);
      setSatBulkCounts(null);
    }

  };



  // ✅ PRODUCCIÓN: Paginación para evitar render masivo

  const totalPages = Math.ceil(sortedResults.length / ITEMS_PER_PAGE);

  const paginatedResults = sortedResults.slice(

    (currentPage - 1) * ITEMS_PER_PAGE,

    currentPage * ITEMS_PER_PAGE

  );



  // Resetear a página 1 cuando cambia el ordenamiento

  useEffect(() => {

    setCurrentPage(1);

  }, [sortField, sortDirection]);



  if (loading && results.length === 0) {

    return (

      <div className="min-h-screen bg-background flex items-center justify-center">

        <div className="text-center">

          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>

          <p className="text-slate-600">Cargando resultados de Sentinel Express...</p>

        </div>

      </div>

    );

  }



  return (

    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4 md:p-8 transition-colors duration-200">

      {/* ── Botón flotante WhatsApp (Siempre visible) ── */}
      <button
        onClick={() => window.open(WHATSAPP_URL, "_blank", "noopener,noreferrer")}
        title="Solicitar diagnóstico fiscal"
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-[#25D366] hover:bg-[#1ebe5e] text-white rounded-full shadow-2xl shadow-[#25D366]/40 flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95"
        aria-label="Contactar por WhatsApp"
      >
        <svg viewBox="0 0 24 24" className="w-7 h-7 fill-white">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
        </svg>
      </button>

      <div className="max-w-7xl mx-auto">

        {/* Header de Autoridad - Navy Style */}

        <div className="bg-[#0B2340] dark:bg-slate-900 -mx-4 -mt-8 mb-8 px-6 py-8 rounded-b-3xl shadow-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-white/10 relative overflow-hidden">

          {/* Subtle pattern overlay */}

          <div className="absolute inset-0 opacity-10 pointer-events-none bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:20px_20px]"></div>



          <div className="relative z-10">

            <div className="flex items-center gap-3 mb-1">

              <div className="p-2 bg-accent rounded-xl shadow-lg shadow-accent/20">

                <TrendingUp className="w-6 h-6 text-[#0B2340]" />

              </div>

              <h1 className="text-3xl font-black text-white tracking-tighter uppercase">

                SENTINEL<span className="text-accent">EXPRESS</span>

              </h1>

            </div>

            <p className="text-slate-400 mt-1 font-medium tracking-widest text-[10px] uppercase opacity-80">

              Mando y Control de Riesgos Fiscales CFDI 4.0

            </p>

          </div>



          <div className="flex flex-wrap items-center gap-4 relative z-10">

            <CompanySelector />



            <div className="h-8 w-[1px] bg-white/10 hidden md:block" />



            {/* ── Contador informativo XML (sin límite visible) ── */}

            {xmlCount > 0 && (

              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5">

                <FileText className="w-3.5 h-3.5 text-[#F9C646]" />

                <span className="text-[10px] font-black text-white/70 uppercase tracking-widest">

                  XML detectados: {xmlCount.toLocaleString()}

                </span>

              </div>

            )}


            {/* ── Contadores de dirección del CFDI (emitidos vs recibidos) ── */}
            {contadoresDireccion.total > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-black text-white/50 uppercase tracking-widest">Dirección:</span>
                <div className="flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2 py-1">
                  <span className="text-[10px] font-black text-emerald-300 uppercase">Emitidos {contadoresDireccion.emitidos}</span>
                </div>
                <div className="flex items-center gap-1 bg-sky-500/10 border border-sky-500/20 rounded-lg px-2 py-1">
                  <span className="text-[10px] font-black text-sky-300 uppercase">Recibidos {contadoresDireccion.recibidos}</span>
                </div>
                <div className="flex items-center gap-1 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2 py-1">
                  <span className="text-[10px] font-black text-amber-300 uppercase">Revisión {contadoresDireccion.revision}</span>
                </div>
                <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1">
                  <span className="text-[10px] font-black text-white/70 uppercase">Vig {contadoresDireccion.vigentes} · Cancel {contadoresDireccion.cancelados}</span>
                </div>
                <div className="flex items-center gap-1 bg-rose-500/10 border border-rose-500/20 rounded-lg px-2 py-1">
                  <span className="text-[10px] font-black text-rose-300 uppercase">69-B {contadoresDireccion.con69B}</span>
                </div>
              </div>
            )}



            {/* ── Botón comercial WhatsApp (header) ── */}

            <button

              onClick={() => window.open(WHATSAPP_URL, "_blank", "noopener,noreferrer")}

              className="flex items-center gap-2 bg-[#25D366] hover:bg-[#1ebe5e] text-white text-[10px] font-black uppercase tracking-tight px-3 py-2 rounded-xl shadow-lg transition-all duration-200 hover:scale-105 active:scale-95"

            >

              <MessageCircle className="w-3.5 h-3.5" />

              Solicitar diagnóstico fiscal

            </button>



            <div className="h-8 w-[1px] bg-white/10 hidden md:block" />



            <HistorySidebar onLoadHistory={handleLoadHistory}>
              <Button
                variant="ghost"
                className="text-white hover:bg-white/10 gap-2 border border-white/20 hover:border-white/40 px-4 rounded-xl"
              >
                <History className="w-4 h-4 text-accent" />
                <span className="text-xs font-bold uppercase tracking-wider">Historial</span>
              </Button>
            </HistorySidebar>

            <Link href="/pricing">
              <Button
                variant="ghost"
                className="text-white hover:bg-white/10 gap-2 border border-white/20 hover:border-white/40 px-4 rounded-xl h-10"
              >
                <Zap className="w-4 h-4 text-accent" />
                <span className="text-xs font-bold uppercase tracking-wider">Planes</span>
              </Button>
            </Link>

            <Button
              variant="outline"
              onClick={handleClearData}
              className="text-white hover:bg-rose-500/20 border-white/20 hover:border-rose-500/50 px-4 rounded-xl gap-2 h-10"
              title="Limpiar análisis actual y resetear contadores"
            >
              <Trash2 className="w-4 h-4 text-rose-400" />
              <span className="text-xs font-bold uppercase tracking-wider">Limpiar análisis</span>
            </Button>



            <Link href="/manual">

              <Button

                variant="ghost"

                className="text-white hover:bg-white/10 gap-2 border border-white/20 hover:border-white/40 px-4 rounded-xl"

              >

                <BookOpen className="w-4 h-4 text-accent" />

                <span className="text-xs font-bold uppercase tracking-wider">Ayuda</span>

              </Button>

            </Link>



            <div className="flex items-center gap-2 bg-white/5 p-1.5 rounded-2xl border border-white/10 backdrop-blur-sm">

              <Button

                onClick={toggleTheme}

                variant="ghost"

                size="icon"

                className="text-white hover:bg-white/15 rounded-xl w-8 h-8"

              >

                {theme === "dark" ? <Sun className="w-4 h-4 text-accent" /> : <Moon className="w-4 h-4 text-accent" />}

              </Button>



              <Link href="/settings">

                <Button variant="ghost" size="icon" className="text-white hover:bg-white/15 rounded-xl w-8 h-8">

                  <Settings className="w-4 h-4 text-accent" />

                </Button>

              </Link>

            </div>

          </div>

        </div>



        {/* ── Banners Inteligentes Comerciales ── */}
        {daysLeft !== null && (
          <div className="mb-6">
            {daysLeft > 3 ? (
              <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800/40 rounded-2xl px-5 py-3 text-blue-800 dark:text-blue-300">
                <p className="text-[12px] font-semibold">
                  <span className="font-black uppercase">Prueba Activa.</span> Te quedan {daysLeft} días de evaluación completa.
                </p>
                <Button onClick={() => window.open(WHATSAPP_URL, "_blank")} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] uppercase font-bold h-7 rounded-lg">
                  Actualizar Plan
                </Button>
              </div>
            ) : daysLeft > 0 ? (
              <div className="flex items-center justify-between bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800/40 rounded-2xl px-5 py-3 text-orange-800 dark:text-orange-300">
                <p className="text-[12px] font-semibold">
                  <span className="font-black uppercase text-orange-600">¡Tu prueba expira pronto!</span> Solo te quedan {daysLeft} días de acceso.
                </p>
                <Button onClick={() => window.open(WHATSAPP_URL, "_blank")} size="sm" className="bg-orange-600 hover:bg-orange-700 text-white text-[10px] uppercase font-bold h-7 rounded-lg shadow-md shadow-orange-500/20">
                  Renovar Acceso
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800/40 rounded-2xl px-5 py-3 text-red-800 dark:text-red-300">
                <p className="text-[12px] font-semibold">
                  <span className="font-black uppercase text-red-600">Prueba Finalizada.</span> Tu periodo de prueba ha expirado. Por favor contacta a soporte para continuar.
                </p>
                <Button onClick={() => window.open(WHATSAPP_URL, "_blank")} size="sm" className="bg-red-600 hover:bg-red-700 text-white text-[10px] uppercase font-bold h-7 rounded-lg shadow-md shadow-red-500/20">
                  Contactar Soporte
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── Banner de privacidad / confianza ── */}

        <div className="flex items-center gap-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 rounded-2xl px-5 py-3 mb-6 text-emerald-800 dark:text-emerald-300">

          <svg className="w-4 h-4 flex-shrink-0 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>

            <path strokeLinecap="round" strokeLinejoin="round" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />

          </svg>

          <p className="text-[11px] font-semibold leading-tight">

            <strong className="font-black uppercase tracking-tight">Tus XML se analizan localmente en tu navegador.</strong>

            {" "}La plataforma no almacena ni transmite tus CFDI a ningún servidor.

          </p>

        </div>

        {/* ── Banner: Listas 69-B no cargadas ── */}
        {listasNoSincronizadas && (
          <div className="flex items-center justify-between gap-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700/50 rounded-2xl px-5 py-3 mb-6">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-[11px] font-black uppercase tracking-tight text-amber-800 dark:text-amber-300">
                  Validación 69-B pendiente
                </p>
                <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-tight mt-0.5">
                  Las listas oficiales del SAT no están cargadas en este dispositivo.
                  Los resultados no incluyen verificación contra lista 69-B / EFOS.
                </p>
              </div>
            </div>
            <Link href="/settings">
              <Button
                size="sm"
                className="flex-shrink-0 bg-amber-500 hover:bg-amber-600 text-white text-[10px] uppercase font-black h-7 px-3 rounded-lg shadow-md shadow-amber-500/20 whitespace-nowrap"
              >
                <Settings className="w-3 h-3 mr-1" />
                Cargar listas
              </Button>
            </Link>
          </div>
        )}


        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">

          {/* Salud del Sistema - Radial Progress / KPI */}

          <Card className="lg:col-span-1 border-0 shadow-xl bg-white dark:bg-slate-800 overflow-hidden relative group rounded-3xl">

            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform duration-700">

              <CheckCircle2 className="w-32 h-32 text-[#0B2340]" />

            </div>

            <CardHeader className="pb-2">

              <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">

                Estatus de Protección

              </CardTitle>

            </CardHeader>

            <CardContent className="flex flex-col items-center justify-center pt-2 pb-8">

              <div className="relative w-40 h-40 flex items-center justify-center mb-6">

                <svg className="w-full h-full transform -rotate-90">

                  <circle

                    cx="80"

                    cy="80"

                    r="72"

                    stroke="currentColor"

                    strokeWidth="10"

                    fill="transparent"

                    className="text-slate-100 dark:text-slate-700"

                  />

                  <circle

                    cx="80"

                    cy="80"

                    r="72"

                    stroke="currentColor"

                    strokeWidth="10"

                    fill="transparent"

                    strokeDasharray={452.4}

                    strokeDashoffset={452.4 * (1 - stats.salud / 100)}

                    className={
                      stats.salud >= 70
                        ? "text-[#059669] transition-all duration-1000 ease-out"
                        : stats.salud >= 40
                        ? "text-[#D97706] transition-all duration-1000 ease-out"
                        : "text-[#DC2626] transition-all duration-1000 ease-out"
                    }

                    strokeLinecap="round"

                    style={{
                      filter: stats.salud >= 70
                        ? 'drop-shadow(0 0 8px rgba(5,150,105,0.3))'
                        : stats.salud >= 40
                        ? 'drop-shadow(0 0 8px rgba(217,119,6,0.3))'
                        : 'drop-shadow(0 0 8px rgba(220,38,38,0.3))'
                    }}

                  />

                </svg>

                <div className="absolute flex flex-col items-center">

                  <span className="text-4xl font-black text-[#0B2340] dark:text-white tracking-tighter">

                    {stats.salud}%

                  </span>

                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Salud</span>

                </div>

              </div>

              {/* Mensaje de nivel de riesgo dinámico */}
              {stats.total === 0 ? (
                <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl border border-emerald-100 dark:border-emerald-900/30">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                  <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">SISTEMA LISTO</span>
                </div>
              ) : stats.salud >= 80 ? (
                <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl border border-emerald-100 dark:border-emerald-900/30">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                  <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">RIESGO BAJO</span>
                </div>
              ) : stats.salud >= 60 ? (
                <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-100 dark:border-amber-900/30">
                  <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></div>
                  <span className="text-[10px] font-black text-amber-700 dark:text-amber-400 uppercase tracking-widest">REVISIÓN RECOMENDADA</span>
                </div>
              ) : stats.salud >= 40 ? (
                <div className="flex items-center gap-2 px-4 py-2 bg-orange-50 dark:bg-orange-900/20 rounded-2xl border border-orange-100 dark:border-orange-900/30">
                  <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></div>
                  <span className="text-[10px] font-black text-orange-700 dark:text-orange-400 uppercase tracking-widest">RIESGO MODERADO</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/20 rounded-2xl border border-red-100 dark:border-red-900/30">
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                  <span className="text-[10px] font-black text-red-700 dark:text-red-400 uppercase tracking-widest">ALTO RIESGO FISCAL</span>
                </div>
              )}

            </CardContent>

          </Card>



          {/* Upload Zone / Main Action */}

          <div className="lg:col-span-2">

            <UploadZone

              onFilesReady={handleFilesReady}

              isValidating={isValidating}

              hasValidatedResults={hasValidatedResults}

            />

          </div>

        </div>



        {/* ── Indicador de progreso masivo ── */}

        {isValidating && progress.total > 0 && (

          <Card className="border-0 shadow-2xl mb-8 border-l-8 border-accent animate-in fade-in slide-in-from-top-6 duration-700 rounded-3xl bg-white dark:bg-slate-800">

            <CardContent className="pt-8 pb-8">

              <div className="space-y-6">

                <div className="flex justify-between items-center">

                  <div className="flex items-center gap-4">

                    <div className="p-3 bg-primary/10 rounded-2xl">

                      <RefreshCcw className="w-6 h-6 text-primary animate-spin" />

                    </div>

                    <div>

                      <p className="text-xl font-black text-[#0B2340] dark:text-white tracking-tight">

                        {processingPhase ?? `Procesando ${progress.total.toLocaleString()} CFDI...`}

                      </p>

                      <p className="text-xs text-slate-500 font-medium">Analizando estructura fiscal en tu navegador · sin enviar datos al servidor.</p>

                    </div>

                  </div>

                  <Badge className="bg-[#0B2340] text-white text-xl px-6 py-2 rounded-2xl shadow-lg shadow-black/10">

                    {progress.current.toLocaleString()} / {progress.total.toLocaleString()}

                  </Badge>

                </div>

                <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-5 overflow-hidden border border-slate-200 dark:border-slate-600 shadow-inner p-1">

                  <div

                    className="bg-gradient-to-r from-[#0B2340] via-[#1E3A8A] to-accent h-3 rounded-full transition-all duration-300 ease-out border-r-2 border-white/30 shadow-lg"

                    style={{ width: `${(progress.current / progress.total) * 100}%` }}

                  />

                </div>

                <div className="flex justify-center">

                  <p className="text-xs font-black text-slate-400 dark:text-slate-500 tracking-[0.3em] uppercase">

                    {Math.round((progress.current / progress.total) * 100)}% completado

                  </p>

                </div>

              </div>

            </CardContent>

          </Card>

        )}



        {/* KPI Cards Modernos - Grid Glassmorphism */}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-10">

          <Card className="border-0 shadow-xl bg-white dark:bg-slate-800 rounded-3xl border-b-8 border-slate-300 dark:border-slate-700 hover:-translate-y-1 transition-transform duration-300">

            <CardContent className="pt-8 pb-8">

              <div className="flex flex-col items-center">

                <div className="p-4 bg-slate-50 dark:bg-slate-700 rounded-2xl mb-4 shadow-inner">

                  <FileText className="w-7 h-7 text-slate-600 dark:text-slate-400" />

                </div>

                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">Total Procesados</p>

                <p className="text-4xl font-black text-slate-900 dark:text-slate-100 tracking-tighter">{stats.total}</p>

              </div>

            </CardContent>

          </Card>



          <Card className="border-0 shadow-xl bg-white dark:bg-slate-800 rounded-3xl border-b-8 border-emerald-500 hover:-translate-y-1 transition-transform duration-300">

            <CardContent className="pt-8 pb-8">

              <div className="flex flex-col items-center">

                <div className="p-4 bg-emerald-50 dark:bg-emerald-900/10 rounded-2xl mb-4 shadow-inner">

                  <CheckCircle2 className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />

                </div>

                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600 mb-2">🟢 Usables</p>

                <p className="text-4xl font-black text-emerald-800 dark:text-emerald-300 tracking-tighter">{stats.usables}</p>

              </div>

            </CardContent>

          </Card>



          <Card className="border-0 shadow-xl bg-white dark:bg-slate-800 rounded-3xl border-b-8 border-amber-500 hover:-translate-y-1 transition-transform duration-300">

            <CardContent className="pt-8 pb-8">

              <div className="flex flex-col items-center">

                <div className="p-4 bg-amber-50 dark:bg-amber-900/10 rounded-2xl mb-4 shadow-inner">

                  <AlertCircle className="w-7 h-7 text-amber-600 dark:text-amber-400" />

                </div>

                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-600 mb-2">🟡 Alertas</p>

                <p className="text-4xl font-black text-amber-800 dark:text-amber-300 tracking-tighter">{stats.alertas}</p>

              </div>

            </CardContent>

          </Card>



          <Card className="border-0 shadow-xl bg-white dark:bg-slate-800 rounded-3xl border-b-8 border-red-500 hover:-translate-y-1 transition-transform duration-300">

            <CardContent className="pt-8 pb-8">

              <div className="flex flex-col items-center">

                <div className="p-4 bg-red-50 dark:bg-red-900/10 rounded-2xl mb-4 shadow-inner">

                  <XCircle className="w-7 h-7 text-red-600 dark:text-red-400" />

                </div>

                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-600 mb-2">🔴 No Usables</p>

                <p className="text-4xl font-black text-red-800 dark:text-red-300 tracking-tighter">{stats.noUsable}</p>

              </div>

            </CardContent>

          </Card>



          {/* KPI: No Validados SAT */}
          <Card className="border-0 shadow-xl bg-white dark:bg-slate-800 rounded-3xl border-b-8 border-slate-500 hover:-translate-y-1 transition-transform duration-300">

            <CardContent className="pt-8 pb-8">

              <div className="flex flex-col items-center">

                <div className="p-4 bg-slate-100 dark:bg-slate-900/10 rounded-2xl mb-4 shadow-inner">

                  <AlertCircle className="w-7 h-7 text-slate-600 dark:text-slate-400" />

                </div>

                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600 dark:text-slate-400 mb-2">⏳ No Validados SAT</p>

                <p className="text-4xl font-black text-slate-700 dark:text-slate-300 tracking-tighter">{stats.noValidadosSAT}</p>

              </div>

            </CardContent>

          </Card>



          {/* KPI: Monto en Riesgo */}
          <Card className="border-0 shadow-xl bg-white dark:bg-slate-800 rounded-3xl border-b-8 border-orange-500 hover:-translate-y-1 transition-transform duration-300">

            <CardContent className="pt-8 pb-8">

              <div className="flex flex-col items-center">

                <div className="p-4 bg-orange-50 dark:bg-orange-900/10 rounded-2xl mb-4 shadow-inner">

                  <AlertCircle className="w-7 h-7 text-orange-600 dark:text-orange-400" />

                </div>

                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-600 mb-2">⚠️ Monto en Riesgo</p>

                <div className="flex items-baseline gap-1">

                  <span className="text-xs font-bold text-orange-700 dark:text-orange-400">$</span>

                  <p className="text-4xl font-black text-orange-800 dark:text-orange-300 tracking-tighter">

                    {stats.montoRiesgo >= 1000
                      ? `${(stats.montoRiesgo / 1000).toFixed(1)}K`
                      : stats.montoRiesgo.toFixed(0)}

                  </p>

                </div>

                <p className="text-[9px] text-orange-400 dark:text-orange-500 uppercase tracking-wider mt-1">🔴 + 🟡 CFDI</p>

              </div>

            </CardContent>

          </Card>



          <Card className="border-0 shadow-xl bg-[#0F172A] rounded-3xl border-b-8 border-accent hover:-translate-y-1 transition-transform duration-300 overflow-hidden relative">

            <div className="absolute top-0 right-0 p-2 opacity-10">

              <DollarSign className="w-16 h-16 text-white" />

            </div>

            <CardContent className="pt-8 pb-8 relative z-10">

              <div className="flex flex-col items-center">

                <div className="p-4 bg-white/10 rounded-2xl mb-4">

                  <TrendingUp className="w-7 h-7 text-accent" />

                </div>

                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-accent mb-2">$ Monto Total</p>

                <div className="flex items-baseline gap-1">

                  <span className="text-xs font-bold text-accent">$</span>

                  <p className="text-4xl font-black text-white tracking-tighter">

                    {(stats.totalMonto / 1000).toFixed(1)}K

                  </p>

                </div>

              </div>

            </CardContent>

          </Card>

        </div>



        {/* Conciliación PPD ↔ REP — mismo resultado central que Resumen, RESUMEN EJECUTIVO y Excel */}
        {stats.total > 0 && (
          <Card className="border-0 shadow-sm dark:bg-slate-800 dark:border-slate-700 mb-8">
            <CardHeader>
              <CardTitle className="text-lg dark:text-slate-100">Conciliación de Pagos PPD ↔ REP</CardTitle>
              <CardDescription className="dark:text-slate-400">
                Facturas PPD = sin evidencia + parciales + liquidadas + requieren revisión = <strong>{conciliacionPPD.totalFacturasPPD}</strong>
                {' · '}
                REP cargados = relacionados + huérfanos + rechazados + duplicados = <strong>{conciliacionPPD.totalREPCargados}</strong>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                <div className="rounded-xl border p-3 text-center dark:border-slate-700">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">PUE</p>
                  <p className="text-2xl font-black text-slate-800 dark:text-slate-100">{conciliacionPPD.porEstado.PUE}</p>
                </div>
                <div className="rounded-xl border p-3 text-center dark:border-slate-700">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">PPD sin evidencia</p>
                  <p className="text-2xl font-black text-amber-700 dark:text-amber-400">{conciliacionPPD.porEstado.SIN_EVIDENCIA_REP}</p>
                </div>
                <div className="rounded-xl border p-3 text-center dark:border-slate-700">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Pago parcial</p>
                  <p className="text-2xl font-black text-amber-700 dark:text-amber-400">{conciliacionPPD.porEstado.PARCIAL}</p>
                </div>
                <div className="rounded-xl border p-3 text-center dark:border-slate-700">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Liquidada</p>
                  <p className="text-2xl font-black text-emerald-700 dark:text-emerald-400">{conciliacionPPD.porEstado.LIQUIDADA}</p>
                </div>
                <div className="rounded-xl border p-3 text-center dark:border-slate-700">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Requiere revisión (moneda)</p>
                  <p className="text-2xl font-black text-orange-700 dark:text-orange-400">{conciliacionPPD.porEstado.REQUIERE_REVISION_MONEDA}</p>
                </div>
                <div className="rounded-xl border p-3 text-center dark:border-slate-700">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Requiere revisión (fecha)</p>
                  <p className="text-2xl font-black text-orange-700 dark:text-orange-400">{conciliacionPPD.porEstado.REQUIERE_REVISION_FECHA}</p>
                </div>
                <div className="rounded-xl border p-3 text-center dark:border-slate-700" title="Pago recibido antes de la obligatoriedad general del REP (01/09/2018) — informativo. No cambia el estado de pago (ya contado como Liquidada/Parcial).">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Pago antes de la obligatoriedad del REP (informativo)</p>
                  <p className="text-2xl font-black text-slate-500 dark:text-slate-400">{conciliacionPPD.pagosHistoricamenteExentos}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                <div className="rounded-xl border p-3 text-center dark:border-slate-700">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">REP relacionados</p>
                  <p className="text-2xl font-black text-emerald-700 dark:text-emerald-400">{conciliacionPPD.repsPorEstado.RELACIONADO}</p>
                </div>
                <div className="rounded-xl border p-3 text-center dark:border-slate-700">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">REP sin factura en este análisis</p>
                  <p className="text-2xl font-black text-amber-700 dark:text-amber-400">{conciliacionPPD.repsPorEstado.SIN_FACTURA_RELACIONADA}</p>
                </div>
                <div className="rounded-xl border p-3 text-center dark:border-slate-700">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">REP rechazados (error)</p>
                  <p className="text-2xl font-black text-red-700 dark:text-red-400">{conciliacionPPD.repsPorEstado.RECHAZADO_ERROR}</p>
                </div>
                <div className="rounded-xl border p-3 text-center dark:border-slate-700">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">REP duplicados</p>
                  <p className="text-2xl font-black text-slate-500 dark:text-slate-400">{conciliacionPPD.repsPorEstado.DUPLICADO}</p>
                </div>
                <div className="rounded-xl border p-3 text-center dark:border-slate-700">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">REP excluido de consulta SAT</p>
                  <p className="text-2xl font-black text-slate-500 dark:text-slate-400">{stats.repExcluidosSAT}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}



        {/* Charts */}

        {stats.total > 0 && (

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">

            {/* Status Distribution */}

            <Card className="border-0 shadow-sm dark:bg-slate-800 dark:border-slate-700">

              <CardHeader>

                <CardTitle className="text-lg dark:text-slate-100">Distribución de Estados</CardTitle>

                <CardDescription className="dark:text-slate-400">Porcentaje de CFDI por estado fiscal</CardDescription>

              </CardHeader>

              <CardContent>

                <ResponsiveContainer width="100%" height={300}>

                  <PieChart>

                    <Pie

                      data={statusData}

                      cx="50%"

                      cy="50%"

                      labelLine={false}

                      label={({ name, value }) => `${name}: ${value} `}

                      outerRadius={100}

                      fill="#8884d8"

                      dataKey="value"

                    >

                      {statusData.map((entry, index) => (

                        <Cell key={`cell - ${index} `} fill={entry.color} />

                      ))}

                    </Pie>

                    <Tooltip />

                  </PieChart>

                </ResponsiveContainer>

              </CardContent>

            </Card>



            {/* Trend Analysis */}

            <Card className="border-0 shadow-sm dark:bg-slate-800 dark:border-slate-700">

              <CardHeader>

                <CardTitle className="text-lg dark:text-slate-100 flex items-center gap-2">

                  <TrendingUp className="w-5 h-5" /> Análisis de Montos

                </CardTitle>

                <CardDescription className="dark:text-slate-400">Evolución de subtotal, IVA y total</CardDescription>

              </CardHeader>

              <CardContent>

                <ResponsiveContainer width="100%" height={300}>

                  <LineChart data={trendData}>

                    <CartesianGrid strokeDasharray="3 3" />

                    <XAxis dataKey="index" />

                    <YAxis />

                    <Tooltip />

                    <Legend />

                    <Line type="monotone" dataKey="subtotal" stroke="#3b82f6" strokeWidth={2} />

                    <Line type="monotone" dataKey="iva" stroke="#f59e0b" strokeWidth={2} />

                    <Line type="monotone" dataKey="total" stroke="#10b981" strokeWidth={2} />

                  </LineChart>

                </ResponsiveContainer>

              </CardContent>

            </Card>

          </div>

        )}



        {/* Detailed Table */}

        {stats.total > 0 && (

          <Card className="border-0 shadow-sm dark:bg-slate-800 dark:border-slate-700">

            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-6">

              <div>

                <CardTitle className="text-xl font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight">Detalle de Validaciones</CardTitle>

                <CardDescription className="dark:text-slate-400 font-medium">Análisis exhaustivo de cumplimiento y riesgo fiscal</CardDescription>

              </div>

              <Button
                onClick={handleRevalidateAllPending}
                disabled={isBulkRevalidating || isValidating}
                variant="outline"
                className="gap-2 rounded-xl disabled:opacity-60 disabled:cursor-not-allowed"
                size="sm"
                title={
                  satBulkCounts
                    ? `Procesados ${satBulkCounts.processed}/${satBulkCounts.total} — Vigentes: ${satBulkCounts.vigentes}, Cancelados: ${satBulkCounts.cancelados}, No encontrados: ${satBulkCounts.noEncontrados}, Timeout/Error: ${satBulkCounts.timeoutOrError}, Reintentos: ${satBulkCounts.reintentos}`
                    : 'Reintenta ante el SAT únicamente los CFDI en estado "No validado SAT" (Timeout, Error o No Encontrado). Vigente y Cancelado nunca se tocan.'
                }
              >
                <RefreshCcw className={`w-4 h-4 ${isBulkRevalidating ? 'animate-spin' : ''}`} />
                {isBulkRevalidating && satBulkCounts
                  ? `Reintentando SAT (${satBulkCounts.processed}/${satBulkCounts.total})`
                  : 'Reintentar No Validados SAT'}
              </Button>

              <Button
                onClick={handleExportToExcel}
                disabled={isExporting}
                className="bg-primary hover:bg-primary/90 text-white font-black shadow-lg shadow-primary/20 gap-2 rounded-xl disabled:opacity-60 disabled:cursor-not-allowed"
                size="sm"
                title={isExporting && exportProgress
                  ? (exportProgress.fileTotal
                    ? `Preparando archivo ${exportProgress.fileIndex} de ${exportProgress.fileTotal}${exportProgress.fileName ? ` (${exportProgress.fileName})` : ''} — hoja "${exportProgress.sheet}"${exportProgress.totalSheets ? ` (${exportProgress.sheetIndex}/${exportProgress.totalSheets})` : ''}...`
                    : `Generando "${exportProgress.sheet}"${exportProgress.totalSheets ? ` (${exportProgress.sheetIndex}/${exportProgress.totalSheets})` : ''}...`)
                  : undefined}
              >
                <Download className="w-4 h-4" />
                {isExporting
                  ? (exportProgress?.fileTotal
                    ? `Preparando archivo ${exportProgress.fileIndex} de ${exportProgress.fileTotal}`
                    : `Exportando${exportProgress?.totalSheets ? ` (${exportProgress.sheetIndex}/${exportProgress.totalSheets})` : '...'}`)
                  : 'Exportar Reporte'}
              </Button>
              {isExporting && (
                <Button
                  onClick={handleCancelExport}
                  variant="outline"
                  className="gap-2 rounded-xl"
                  size="sm"
                  title="Cancela la exportación. Los archivos ya descargados y la sesión cargada se conservan."
                >
                  Cancelar exportación
                </Button>
              )}

              {/* Pantalla previa (instrucción 5): lotes grandes generan varios
                  archivos — se informa cuántos ANTES de empezar y se ofrece
                  elegir una carpeta real (escritura confirmada) o descargar
                  uno por uno (el navegador puede bloquear descargas múltiples). */}
              <Dialog open={!!exportPrecheck} onOpenChange={(open) => { if (!open) setExportPrecheck(null); }}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Este lote generará varios archivos</DialogTitle>
                    <DialogDescription>
                      {exportPrecheck && (
                        <>
                          Se generarán <strong>{exportPrecheck.plan.chunks.length + 1} archivos</strong> (1 resumen global
                          "00_Resumen_Global.xlsx" + {exportPrecheck.plan.chunks.length} bloques "Diagnostico_00N.xlsx"),
                          uno a la vez, para no agotar la memoria del navegador con {results.length.toLocaleString()} CFDI en un solo archivo.
                        </>
                      )}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="text-sm text-slate-600 dark:text-slate-400 space-y-2">
                    {supportsFileSystemAccess ? (
                      <p>
                        <strong>Recomendado:</strong> elige una carpeta y los {exportPrecheck ? exportPrecheck.plan.chunks.length + 1 : ''} archivos
                        se guardan ahí directamente, con confirmación real de escritura (nunca se afirma un guardado que no ocurrió).
                      </p>
                    ) : (
                      <p>
                        Tu navegador no soporta elegir una carpeta directamente. Los archivos se enviarán como descargas individuales —
                        si tu navegador bloquea descargas múltiples, deberás permitirlas desde el aviso que aparecerá en la barra de direcciones.
                      </p>
                    )}
                  </div>
                  <DialogFooter className="flex-col sm:flex-col gap-2">
                    {supportsFileSystemAccess && (
                      <Button onClick={handleChooseFolder} className="w-full gap-2">
                        Elegir carpeta (recomendado)
                      </Button>
                    )}
                    <Button onClick={handleDownloadIndividually} variant={supportsFileSystemAccess ? 'outline' : 'default'} className="w-full gap-2">
                      Descargar archivos individualmente
                    </Button>
                    <Button onClick={() => setExportPrecheck(null)} variant="ghost" className="w-full">
                      Cancelar
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Button
                variant="destructive"
                onClick={handleClearData}
                className="ml-3 bg-rose-600 hover:bg-rose-700 text-white font-black shadow-lg shadow-rose-900/20 gap-2 rounded-xl"
                size="sm"
              >
                <Trash2 className="w-4 h-4" />
                Limpiar análisis
              </Button>

            </CardHeader>

            <CardContent>

              <div className="max-h-[600px] overflow-y-auto overflow-x-auto relative scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700">

                <table className="w-full text-sm border-separate border-spacing-0">

                  <thead className="sticky top-0 z-20">

                    <tr className="bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-sm shadow-sm transition-shadow">

                      <th className="text-left py-4 px-4 font-black text-[10px] uppercase tracking-widest text-slate-400 border-b border-slate-200 dark:border-slate-800 bg-inherit">

                        <button

                          onClick={() => handleSort('fileName')}

                          className="group flex items-center gap-2 hover:text-indigo-500 transition-colors"

                        >

                          Archivo

                          {getSortIcon('fileName')}

                        </button>

                      </th>

                      <th className="text-left py-4 px-4 font-black text-[10px] uppercase tracking-widest text-slate-400 border-b border-slate-200 dark:border-slate-800 bg-inherit">

                        <button

                          onClick={() => handleSort('uuid')}

                          className="group flex items-center gap-2 hover:text-indigo-500 transition-colors"

                        >

                          UUID

                          {getSortIcon('uuid')}

                        </button>

                      </th>

                      <th className="text-left py-4 px-4 font-black text-[10px] uppercase tracking-widest text-slate-400 border-b border-slate-200 dark:border-slate-800 bg-inherit">

                        <button
                          onClick={() => handleSort('tipoCFDI')}
                          className="group flex items-center gap-2 hover:text-indigo-500 transition-colors"
                        >
                          Tipo CFDI
                          {getSortIcon('tipoCFDI')}
                        </button>

                      </th>

                      <th className="text-left py-4 px-4 font-black text-[10px] uppercase tracking-widest text-slate-400 border-b border-slate-200 dark:border-slate-800 bg-inherit">

                        <button

                          onClick={() => handleSort('fechaEmision')}

                          className="group flex items-center gap-2 hover:text-indigo-500 transition-colors"

                        >

                          Fecha

                          {getSortIcon('fechaEmision')}

                        </button>

                      </th>

                      <th className="text-left py-4 px-4 font-black text-[10px] uppercase tracking-widest text-slate-400 border-b border-slate-200 dark:border-slate-800 bg-inherit">

                        <button

                          onClick={() => handleSort('rfcEmisor')}

                          className="group flex items-center gap-2 hover:text-indigo-500 transition-colors"

                        >

                          Emisor

                          {getSortIcon('rfcEmisor')}

                        </button>

                      </th>

                      <th className="text-left py-4 px-4 font-black text-[10px] uppercase tracking-widest text-slate-400 border-b border-slate-200 dark:border-slate-800 bg-inherit">

                        <button

                          onClick={() => handleSort('total')}

                          className="group flex items-center gap-2 hover:text-indigo-500 transition-colors"

                        >

                          Total

                          {getSortIcon('total')}

                        </button>

                      </th>

                      <th className="text-left py-4 px-4 font-black text-[10px] uppercase tracking-widest text-slate-400 border-b border-slate-200 dark:border-slate-800 bg-inherit">

                        <button

                          onClick={() => handleSort('estatusSAT')}

                          className="group flex items-center gap-2 hover:text-indigo-500 transition-colors"

                        >

                          Estatus SAT

                          {getSortIcon('estatusSAT')}

                        </button>

                      </th>

                      <th className="text-left py-4 px-4 font-black text-[10px] uppercase tracking-widest text-slate-400 border-b border-slate-200 dark:border-slate-800 bg-inherit">

                        <button

                          onClick={() => handleSort('resultado')}

                          className="group flex items-center gap-2 hover:text-indigo-500 transition-colors"

                        >

                          Resultado

                          {getSortIcon('resultado')}

                        </button>

                      </th>

                      <th className="text-left py-4 px-4 font-black text-[10px] uppercase tracking-widest text-slate-400 border-b border-slate-200 dark:border-slate-800 bg-inherit">

                        Diagnóstico

                      </th>

                      <th className="text-left py-4 px-4 font-black text-[10px] uppercase tracking-widest text-slate-400 border-b border-slate-200 dark:border-slate-800 bg-inherit">

                        Acciones
                      </th>

                    </tr>

                  </thead>

                  <tbody>

                    {paginatedResults.map((result, idx) => {

                      const absoluteIndex = (currentPage - 1) * ITEMS_PER_PAGE + idx;

                      void absoluteIndex; // ya no se usa para refresh; se mantiene por si acaso

                      const isRevalidating = revalidatingUUIDs.has(result.uuid);

                      return (

                        <tr key={result.uuid || idx} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition-colors group">

                          <td className="py-4 px-4 text-slate-900 dark:text-slate-100 font-bold truncate max-w-[150px] group-hover:text-indigo-600 transition-colors" title={result.fileName}>{result.fileName}</td>

                          <td className="py-4 px-4">

                            <div className="flex flex-col gap-1 max-w-[220px]">

                              <button

                                type="button"

                                title="Click para copiar UUID"

                                className="font-mono text-[10px] text-slate-500 dark:text-slate-300 break-all leading-tight text-left cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline transition-colors duration-150 focus:outline-none focus:ring-1 focus:ring-indigo-400 rounded"

                                onClick={() => {

                                  if (!result.uuid || result.uuid === "NO DISPONIBLE") return;

                                  navigator.clipboard.writeText(result.uuid).then(() => {

                                    toast.success("UUID copiado al portapapeles", { duration: 2000 });

                                  }).catch(() => {

                                    toast.error("No se pudo copiar el UUID");

                                  });

                                }}

                              >

                                {result.uuid}

                              </button>

                              {/* Acciones UUID */}

                              <div className="flex items-center gap-2 mt-0.5">

                                <span className="text-[8px] uppercase tracking-widest text-slate-400 font-black">📋 copiar</span>

                                {result.uuid && result.uuid !== "NO DISPONIBLE" && (

                                  <a

                                    href={`https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?id=${result.uuid}`}

                                    target="_blank"

                                    rel="noopener noreferrer"

                                    title="Verificar este CFDI en el portal del SAT"

                                    onClick={() => toast.info("Abriendo portal SAT...", { duration: 1500 })}

                                    className="flex items-center gap-0.5 text-[8px] font-black uppercase tracking-widest text-[#c41e3a] hover:text-[#a01830] dark:text-red-400 dark:hover:text-red-300 hover:underline transition-colors duration-150"

                                  >

                                    🔎 Ver en SAT

                                  </a>

                                )}

                              </div>

                            </div>

                          </td>

                          {/* ── Tipo CFDI badge ── */}

                          <td className="py-4 px-4 whitespace-nowrap">

                            {(() => {

                              const tipo = result.tipoCFDI || "";

                              const map: Record<string, { label: string; cls: string }> = {

                                I: { label: "Ingreso", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700" },

                                E: { label: "Egreso", cls: "bg-red-100    text-red-800    dark:bg-red-900/40    dark:text-red-300    border-red-200    dark:border-red-700" },

                                P: { label: "Pago", cls: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border-purple-200 dark:border-purple-700" },

                                T: { label: "Traslado", cls: "bg-amber-100  text-amber-800  dark:bg-amber-900/40  dark:text-amber-300  border-amber-200  dark:border-amber-700" },

                                N: { label: "Nómina", cls: "bg-blue-100   text-blue-800   dark:bg-blue-900/40   dark:text-blue-300   border-blue-200   dark:border-blue-700" },

                              };

                              const info = map[tipo] ?? { label: tipo || "—", cls: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700" };

                              return (

                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${info.cls}`}>

                                  {info.label}

                                </span>

                              );

                            })()}

                          </td>

                          <td className="py-4 px-4 text-slate-600 dark:text-slate-300 whitespace-nowrap font-medium">{formatDate(result.fechaEmision)}</td>

                          <td className="py-4 px-4 text-slate-600 dark:text-slate-400 font-mono text-xs font-bold bg-slate-50/50 dark:bg-slate-900/50 rounded-lg">{result.rfcEmisor}</td>

                          <td className="py-4 px-4 text-slate-900 dark:text-slate-100 font-black tracking-tighter text-base">${result.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>

                          <td className="py-4 px-4">

                            <CFDISATStatus

                              estatusSAT={result.estatusSAT as any}

                              estatusCancelacion={result.fechaCancelacion}

                              rfcEmisorBlacklist={result.rfcEmisorBlacklist}

                              rfcReceptorBlacklist={result.rfcReceptorBlacklist}

                              compact={true}

                            />

                            {result.ultimoRefrescoSAT && (

                              <div className="mt-1.5 text-[8px] text-slate-400 dark:text-slate-500 flex items-center gap-1 font-black uppercase tracking-widest" title={`Última validación: ${new Date(result.ultimoRefrescoSAT).toLocaleString()}`}>

                                <Clock className="w-2.5 h-2.5" />

                                SCAN: {new Date(result.ultimoRefrescoSAT).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}

                              </div>

                            )}

                          </td>

                          <td className="py-4 px-4">

                            <div className="flex flex-col gap-1">

                              <div className="flex items-center gap-2">

                                {getStatusBadge(result.resultado)}

                              </div>

                              <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest">{result.nivelValidacion}</span>

                            </div>

                          </td>

                          <td className="py-4 px-4 text-slate-500 dark:text-slate-400 text-[11px] max-w-[250px] leading-relaxed italic" title={result.comentarioFiscal}>

                            <div className="line-clamp-2">

                              {result.comentarioFiscal}

                            </div>

                          </td>

                          <td className="py-4 px-4">

                            <div className="flex flex-col gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteXML(result.uuid)}
                                className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-full h-8 w-8 p-0"
                                title="Eliminar XML del tablero (Soft Delete)"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRevalidateSAT(result.uuid)}

                                disabled={!result.uuid || result.uuid === "NO DISPONIBLE" || isRevalidating}

                                className="text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-full h-8 w-8 p-0"

                                title={

                                  isRevalidating

                                    ? "Consultando SAT..."

                                    : !result.uuid || result.uuid === "NO DISPONIBLE"

                                      ? "No se puede revalidar sin UUID"

                                      : "Actualizar estatus SAT"

                                }

                              >

                                <RefreshCcw className={`w-4 h-4 ${isRevalidating ? "animate-spin text-indigo-400" : ""}`} />

                              </Button>
                            </div>

                          </td>

                        </tr>

                      );

                    })}

                  </tbody>

                </table>

              </div>



              {/* ✅ PRODUCCIÓN: Controles de paginación */}

              {totalPages > 1 && (

                <div className="mt-6 flex items-center justify-between border-t border-slate-200 dark:border-slate-700 pt-4">

                  <div className="text-sm text-slate-600 dark:text-slate-400">

                    Mostrando {(currentPage - 1) * ITEMS_PER_PAGE + 1} a {Math.min(currentPage * ITEMS_PER_PAGE, sortedResults.length)} de {sortedResults.length} registros

                  </div>

                  <div className="flex gap-2">

                    <Button

                      variant="outline"

                      size="sm"

                      onClick={() => setCurrentPage(1)}

                      disabled={currentPage === 1}

                    >

                      Primera

                    </Button>

                    <Button

                      variant="outline"

                      size="sm"

                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}

                      disabled={currentPage === 1}

                    >

                      Anterior

                    </Button>

                    <div className="flex items-center px-3 text-sm font-medium text-slate-700 dark:text-slate-300">

                      Página {currentPage} de {totalPages}

                    </div>

                    <Button

                      variant="outline"

                      size="sm"

                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}

                      disabled={currentPage === totalPages}

                    >

                      Siguiente

                    </Button>

                    <Button

                      variant="outline"

                      size="sm"

                      onClick={() => setCurrentPage(totalPages)}

                      disabled={currentPage === totalPages}

                    >

                      Última

                    </Button>

                  </div>

                </div>

              )}

            </CardContent>

          </Card>

        )
        }



        {/* Empty State */}

        {
          stats.total === 0 && !loading && (

            <Card className="border-0 shadow-sm text-center py-12">

              <CardContent>

                <FileText className="w-16 h-16 mx-auto text-slate-300 mb-4" />

                <p className="text-slate-600 mb-2">No hay CFDI procesados aún</p>

                <p className="text-slate-500 text-sm">Carga archivos XML en la sección superior para comenzar</p>

              </CardContent>

            </Card>

          )
        }





        {/* ── Footer de Autoridad + Redes Sociales ── */}

        <div className="mt-12 border-t border-slate-200 dark:border-slate-700 pt-8 pb-4">



          {/* CTA post-análisis (solo si hay resultados) */}

          {stats.total > 0 && (

            <div className="mb-8 bg-gradient-to-r from-[#0B2340] to-[#1E3A8A] rounded-3xl px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-2xl">

              <div>

                <p className="text-white font-black text-base tracking-tight">Análisis básico completado.</p>

                <p className="text-slate-300 text-xs mt-1 max-w-md leading-relaxed">

                  Sentinel ha detectado posibles áreas de revisión fiscal. Si deseas un diagnóstico profesional más profundo, puedes solicitar una revisión especializada.

                </p>

              </div>

              <button

                onClick={() => window.open(WHATSAPP_URL, "_blank", "noopener,noreferrer")}

                className="shrink-0 flex items-center gap-2 bg-[#25D366] hover:bg-[#1ebe5e] text-white text-xs font-black uppercase tracking-tight px-5 py-3 rounded-2xl shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 whitespace-nowrap"

              >

                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white">

                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />

                </svg>

                Solicitar diagnóstico fiscal

              </button>

            </div>

          )}



          {/* Redes sociales + autoridad */}

          <div className="flex flex-col items-center gap-4">

            <div className="flex items-center gap-3 flex-wrap justify-center">

              {/* LinkedIn */}

              <a href="https://www.linkedin.com/in/crecesonline/" target="_blank" rel="noopener noreferrer"

                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0A66C2]/10 hover:bg-[#0A66C2]/20 text-[#0A66C2] dark:text-[#5b9bd5] text-[11px] font-bold transition-all duration-200 hover:scale-105">

                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" /></svg>

                LinkedIn

              </a>

              {/* Facebook */}

              <a href="https://www.facebook.com/estrategicosm" target="_blank" rel="noopener noreferrer"

                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1877F2]/10 hover:bg-[#1877F2]/20 text-[#1877F2] dark:text-[#6ba3f5] text-[11px] font-bold transition-all duration-200 hover:scale-105">

                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>

                Facebook

              </a>

              {/* Instagram */}

              <a href="https://www.instagram.com/estrategicosm" target="_blank" rel="noopener noreferrer"

                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#E1306C]/10 hover:bg-[#E1306C]/20 text-[#E1306C] dark:text-[#f06090] text-[11px] font-bold transition-all duration-200 hover:scale-105">

                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" /></svg>

                Instagram

              </a>

              {/* TikTok */}

              <a href="https://www.tiktok.com/@mentores.estrateg" target="_blank" rel="noopener noreferrer"

                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 text-[11px] font-bold transition-all duration-200 hover:scale-105">

                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" /></svg>

                TikTok

              </a>

            </div>



            <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium text-center">

              Creado por{" "}

              <a href="https://www.linkedin.com/in/crecesonline/" target="_blank" rel="noopener noreferrer"

                className="text-[#0A66C2] dark:text-[#5b9bd5] hover:underline font-bold">

                Mentores Estratégicos

              </a>{" "}

              — Inteligencia fiscal aplicada a CFDI.

            </p>

            <p className="text-[10px] text-slate-300 dark:text-slate-600 font-medium tracking-widest uppercase">
              Motor Fiscal Sentinel Express v1.2.1 | © 2026 Derechos Reservados | CFDI 4.0
            </p>

          </div>

        </div>

      </div>
    </div>
  );
}

