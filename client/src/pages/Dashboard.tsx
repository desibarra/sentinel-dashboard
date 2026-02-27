
import { useEffect, useState } from "react";
import { CFDISATStatus } from "@/components/CFDISATStatus";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { CheckCircle2, AlertCircle, XCircle, TrendingUp, FileText, DollarSign, Download, Moon, Sun, ArrowUpDown, ArrowUp, ArrowDown, Trash2, Settings, BookOpen, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import UploadZone, { UploadedFile } from "@/components/UploadZone";
import { useXMLValidator } from "@/hooks/useXMLValidator";
import { ValidationResult } from "@/lib/cfdiEngine";
import { exportToExcel } from "@/lib/excelExporter";
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

type DashboardResult = ValidationResult;
type SortField = 'fileName' | 'uuid' | 'fechaEmision' | 'rfcEmisor' | 'total' | 'estatusSAT' | 'resultado' | 'comentarioFiscal';
type SortDirection = 'asc' | 'desc' | null;

export default function Dashboard() {
  const [results, setResults] = useState<ValidationResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasValidatedResults, setHasValidatedResults] = useState(false);
  const { isValidating, validateXMLFiles, progress } = useXMLValidator();
  const { theme, toggleTheme } = useTheme();
  const { currentCompany } = useCompany();
  const [sortField, setSortField] = useState<SortField | null>('fechaEmision');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 50;

  // Onboarding
  useEffect(() => {
    setLoading(false);
    const hasSeenTour = localStorage.getItem('has_seen_main_tour');
    if (!hasSeenTour) {
      setTimeout(() => {
        startMainTour();
        localStorage.setItem('has_seen_main_tour', 'true');
      }, 1000);
    }
  }, []);

  // Limpiar dashboard si cambia la empresa
  useEffect(() => {
    setResults([]);
    setHasValidatedResults(false);
  }, [currentCompany?.id]);

  const handleFilesReady = async (files: UploadedFile[]) => {
    if (!currentCompany) {
      toast.error("Selecciona una empresa antes de cargar XMLs");
      return;
    }
    try {
      const validationResults = await validateXMLFiles(files, currentCompany.giro);
      const newResults = [...results, ...validationResults];
      setResults(newResults);
      setHasValidatedResults(true);

      // Guardar en histórico automáticamente
      await saveToHistory(newResults);

      const usable = validationResults.filter((r) => r.resultado.includes("🟢")).length;
      const alertas = validationResults.filter((r) => r.resultado.includes("🟡")).length;
      const noUsable = validationResults.filter((r) => r.resultado.includes("🔴")).length;

      toast.success(
        `Validación completada: ${usable} usables, ${alertas} con alertas, ${noUsable} no usables`,
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

  const handleLoadHistory = (history: ValidationHistory) => {
    setResults(history.results);
    setHasValidatedResults(true);
    toast.success("Proceso cargado desde el historial");
  };

  const handleNoteUpdate = (index: number, note: string) => {
    const newResults = [...results];
    newResults[index].observacionesContador = note;
    setResults(newResults);
  };

  const handleExportToExcel = () => {
    try {
      exportToExcel(results);
      toast.success("Diagnóstico exportado exitosamente");
    } catch (error) {
      toast.error("Error al exportar el diagnóstico");
      console.error("Export error:", error);
    }
  };

  const handleClearData = () => {
    if (window.confirm("¿Estás seguro de eliminar todos los resultados actuales?")) {
      setResults([]);
      setHasValidatedResults(false);
      setSortField(null);
      setSortDirection(null);
      setCurrentPage(1);
      toast.info("Tablero limpiado correctamente");
    }
  };

  // Calcular estadísticas
  const stats = {
    total: results.length,
    usable: results.filter((r) => r.resultado.includes("🟢")).length,
    alertas: results.filter((r) => r.resultado.includes("🟡")).length,
    noUsable: results.filter((r) => r.resultado.includes("🔴")).length,
    totalMonto: results.reduce((sum, r) => sum + r.total, 0),
    totalIVA: results.reduce((sum, r) => sum + r.ivaTraslado, 0),
  };

  // Datos para gráficos
  const statusData = [
    { name: "Usable", value: stats.usable, color: "#166534" },
    { name: "Alertas", value: stats.alertas, color: "#B45309" },
    { name: "No Usable", value: stats.noUsable, color: "#991B1B" },
  ];

  const trendData = results.map((r, idx) => ({
    index: idx + 1,
    total: r.total,
    iva: r.ivaTraslado,
    subtotal: r.subtotal,
  }));

  const getStatusIcon = (resultado: string) => {
    if (resultado.includes("🟢")) return <CheckCircle2 className="w-5 h-5 text-emerald-800" />;
    if (resultado.includes("🟡")) return <AlertCircle className="w-5 h-5 text-amber-700" />;
    return <XCircle className="w-5 h-5 text-red-800" />;
  };

  const getStatusBadge = (resultado: string) => {
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
  const sortedResults = [...results].sort((a, b) => {
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

  const handleRevalidateSAT = async (index: number) => {
    const result = sortedResults[index];
    if (!result || result.uuid === "NO DISPONIBLE") return;

    // Encontrar el índice original en la lista de 'results' si estamos usando sortedResults filtrados
    // Pero aquí index parece ser del State results o paginated. 
    // En el render: {paginatedResults.map((result, idx) => { const absoluteIndex = (currentPage - 1) * ITEMS_PER_PAGE + idx; ... handleRevalidateSAT(absoluteIndex)
    // Así que 'index' es el índice absoluto en 'results'.

    toast.loading("Revalidando estatus SAT...", { id: `rev-${index}` });
    try {
      const status = await checkCFDIStatusSAT(result.uuid, result.rfcEmisor, result.rfcReceptor, result.total);

      // Si ya no podemos confiar en el índice por filtros concurrentes, buscar por UUID
      const targetIdx = results.findIndex(r => r.uuid === result.uuid);
      if (targetIdx === -1) {
        toast.error("No se pudo localizar el registro para actualizar", { id: `rev-${index}` });
        return;
      }

      const newResults = [...results];
      const item = { ...newResults[targetIdx] };

      // Actualizar campos base de SAT
      item.estatusSAT = status.estado;
      item.fechaCancelacion = status.estatusCancelacion || "";
      item.ultimoRefrescoSAT = status.validatedAt.toISOString();
      item.giroEmpresa = currentCompany?.giro || item.giroEmpresa;

      // Re-aplicar reglas de negocio usando los fallbacks del motor
      const resBase = item.resultadoMotor || item.resultado;
      const comBase = item.comentarioMotor || item.comentarioFiscal;

      if (status.estado === "Cancelado") {
        item.resultado = "🔴 NO DISPONIBLE (CANCELADO)";
        item.comentarioFiscal = `[CRÍTICO] CFDI CANCELADO en SAT. ${item.fechaCancelacion}. No tiene efectos fiscales. ` + comBase;
      } else if (status.estado === "No Encontrado") {
        item.resultado = resBase;
        item.comentarioFiscal = `[ALERTA] UUID no encontrado en SAT (puede ser muy reciente o apócrifo). ` + comBase;
      } else if (status.estado === "Error Conexión") {
        // Si falló la conexión, mantenemos el resultado previo pero avisamos en el comentario
        item.resultado = resBase;
        item.comentarioFiscal = `[AVISO] No se pudo actualizar el estatus en SAT (Timeout). ` + comBase;

        toast.error("No se pudo conectar con el SAT (Timeout)", { id: `rev-${index}` });
      } else {
        // Vigente
        item.resultado = resBase;
        item.comentarioFiscal = comBase;
        toast.success("Estatus actualizado exitosamente", { id: `rev-${index}` });
      }

      newResults[targetIdx] = item;
      setResults(newResults);
    } catch (error) {
      console.error("Revalidation error:", error);
      toast.error("Error inesperado al revalidar", { id: `rev-${index}` });
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

            <HistorySidebar onLoadHistory={(history: ValidationHistory) => setResults(history.results || [])}>
              <Button
                variant="ghost"
                className="text-white hover:bg-white/10 gap-2 border border-white/20 hover:border-white/40 px-4 rounded-xl"
              >
                <History className="w-4 h-4 text-accent" />
                <span className="text-xs font-bold uppercase tracking-wider">Historial</span>
              </Button>
            </HistorySidebar>

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

        {/* System Health / Main Panel Grid */}
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
                    strokeDashoffset={452.4 * (1 - (results.length > 0 ? (stats.usable / Math.max(stats.total, 1)) : 1))}
                    className="text-[#059669] transition-all duration-1000 ease-out"
                    strokeLinecap="round"
                    style={{ filter: 'drop-shadow(0 0 8px rgba(5,150,105,0.3))' }}
                  />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-4xl font-black text-[#0B2340] dark:text-white tracking-tighter">
                    {results.length > 0 ? Math.round((stats.usable / Math.max(stats.total, 1)) * 100) : 100}%
                  </span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Salud</span>
                </div>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl border border-emerald-100 dark:border-emerald-900/30">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">SISTEMA PROTEGIDO</span>
              </div>
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

        {/* ✅ PRODUCCIÓN: Indicador de progreso durante procesamiento */}
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
                        Analizando Lote de XML
                      </p>
                      <p className="text-xs text-slate-500 font-medium">Verificando cumplimiento fiscal y listas SAT...</p>
                    </div>
                  </div>
                  <Badge className="bg-[#0B2340] text-white text-xl px-6 py-2 rounded-2xl shadow-lg shadow-black/10">
                    {progress.current} / {progress.total}
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
                    {Math.round((progress.current / progress.total) * 100)}% de seguridad verificada
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
                <p className="text-4xl font-black text-emerald-800 dark:text-emerald-300 tracking-tighter">{stats.usable}</p>
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
                onClick={handleExportToExcel}
                className="bg-primary hover:bg-primary/90 text-white font-black shadow-lg shadow-primary/20 gap-2 rounded-xl"
                size="sm"
              >
                <Download className="w-4 h-4" />
                Exportar Reporte
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                      <th className="text-left py-4 px-4 font-black text-[10px] uppercase tracking-widest text-slate-400">
                        <button
                          onClick={() => handleSort('fileName')}
                          className="group flex items-center gap-2 hover:text-indigo-500 transition-colors"
                        >
                          Archivo
                          {getSortIcon('fileName')}
                        </button>
                      </th>
                      <th className="text-left py-4 px-4 font-black text-[10px] uppercase tracking-widest text-slate-400">
                        <button
                          onClick={() => handleSort('uuid')}
                          className="group flex items-center gap-2 hover:text-indigo-500 transition-colors"
                        >
                          UUID
                          {getSortIcon('uuid')}
                        </button>
                      </th>
                      <th className="text-left py-4 px-4 font-black text-[10px] uppercase tracking-widest text-slate-400">
                        <button
                          onClick={() => handleSort('fechaEmision')}
                          className="group flex items-center gap-2 hover:text-indigo-500 transition-colors"
                        >
                          Fecha
                          {getSortIcon('fechaEmision')}
                        </button>
                      </th>
                      <th className="text-left py-4 px-4 font-black text-[10px] uppercase tracking-widest text-slate-400">
                        <button
                          onClick={() => handleSort('rfcEmisor')}
                          className="group flex items-center gap-2 hover:text-indigo-500 transition-colors"
                        >
                          Emisor
                          {getSortIcon('rfcEmisor')}
                        </button>
                      </th>
                      <th className="text-left py-4 px-4 font-black text-[10px] uppercase tracking-widest text-slate-400">
                        <button
                          onClick={() => handleSort('total')}
                          className="group flex items-center gap-2 hover:text-indigo-500 transition-colors"
                        >
                          Total
                          {getSortIcon('total')}
                        </button>
                      </th>
                      <th className="text-left py-4 px-4 font-black text-[10px] uppercase tracking-widest text-slate-400">
                        <button
                          onClick={() => handleSort('estatusSAT')}
                          className="group flex items-center gap-2 hover:text-indigo-500 transition-colors"
                        >
                          Estatus SAT
                          {getSortIcon('estatusSAT')}
                        </button>
                      </th>
                      <th className="text-left py-4 px-4 font-black text-[10px] uppercase tracking-widest text-slate-400">
                        <button
                          onClick={() => handleSort('resultado')}
                          className="group flex items-center gap-2 hover:text-indigo-500 transition-colors"
                        >
                          Resultado
                          {getSortIcon('resultado')}
                        </button>
                      </th>
                      <th className="text-left py-4 px-4 font-black text-[10px] uppercase tracking-widest text-slate-400">
                        Diagnóstico
                      </th>
                      <th className="text-left py-4 px-4 font-black text-[10px] uppercase tracking-widest text-slate-400">
                        {/* Actions */}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedResults.map((result, idx) => {
                      const absoluteIndex = (currentPage - 1) * ITEMS_PER_PAGE + idx;
                      return (
                        <tr key={idx} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition-colors group">
                          <td className="py-4 px-4 text-slate-900 dark:text-slate-100 font-bold truncate max-w-[150px] group-hover:text-indigo-600 transition-colors" title={result.fileName}>{result.fileName}</td>
                          <td className="py-4 px-4">
                            <div className="flex flex-col gap-0.5 max-w-[220px]">
                              <span className="font-mono text-[10px] text-slate-500 dark:text-slate-300 break-all leading-tight select-all">
                                {result.uuid}
                              </span>
                              <span className="text-[9px] uppercase tracking-widest text-slate-400 font-black">Identificador Fiscal</span>
                            </div>
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
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRevalidateSAT(absoluteIndex)}
                              disabled={!result.uuid || result.uuid === "NO DISPONIBLE"}
                              className="text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-full h-8 w-8 p-0"
                              title={!result.uuid || result.uuid === "NO DISPONIBLE" ? "No se puede revalidar sin UUID" : "Actualizar estatus SAT"}
                            >
                              <RefreshCcw className="w-4 h-4" />
                            </Button>
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
        )}

        {/* Empty State */}
        {stats.total === 0 && !loading && (
          <Card className="border-0 shadow-sm text-center py-12">
            <CardContent>
              <FileText className="w-16 h-16 mx-auto text-slate-300 mb-4" />
              <p className="text-slate-600 mb-2">No hay CFDI procesados aún</p>
              <p className="text-slate-500 text-sm">Carga archivos XML en la sección superior para comenzar</p>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <div className="mt-8 text-center text-slate-600 text-sm">
          <p>Motor Fiscal Sentinel Express v1.2.1 © 2026 - Validador de CFDI 4.0 con cumplimiento fiscal</p>
        </div>
      </div>
    </div>
  );
}
