
import { useEffect, useState } from "react";
import { CFDISATStatus } from "@/components/CFDISATStatus";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { CheckCircle2, AlertCircle, XCircle, TrendingUp, FileText, DollarSign, Download, Moon, Sun, ArrowUpDown, ArrowUp, ArrowDown, Trash2, Settings, BookOpen } from "lucide-react";
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
type SortField = 'fileName' | 'fechaEmision' | 'rfcEmisor' | 'total' | 'estatusSAT' | 'resultado' | 'comentarioFiscal';
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
      const validationResults = await validateXMLFiles(files);
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

  const handleRevalidateSAT = async (index: number) => {
    const result = results[index];
    if (result.uuid === "NO DISPONIBLE") return;

    toast.loading("Revalidando estatus SAT...", { id: `rev-${index}` });
    try {
      const status = await checkCFDIStatusSAT(result.uuid, result.rfcEmisor, result.rfcReceptor, result.total);
      const newResults = [...results];
      newResults[index].estatusSAT = status.estado;
      newResults[index].fechaCancelacion = status.estatusCancelacion || "";
      setResults(newResults);
      toast.success("Estatus actualizado", { id: `rev-${index}` });
    } catch (error) {
      toast.error("Error al conectar con SAT", { id: `rev-${index}` });
    }
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
    if (resultado.includes("🟢")) return <Badge className="bg-emerald-50 text-emerald-900 border-emerald-100 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-200">Usable</Badge>;
    if (resultado.includes("🟡")) return <Badge className="bg-amber-50 text-amber-900 border-amber-100 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-200">Alertas</Badge>;
    return <Badge className="bg-red-50 text-red-900 border-red-100 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-200">No Usable</Badge>;
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
        {/* Header */}
        <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border dark:border-slate-800">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <img src="/assets/logo.png" alt="Mentores Logo" className="w-10 h-10 object-contain" />
              <h1 className="text-2xl md:text-3xl font-bold text-primary tracking-tight uppercase">SENTINEL<span className="text-accent font-black">EXPRESS</span></h1>
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-widest">Daily Accounting Compliance Engine</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <CompanySelector />

            <div className="h-8 w-[1px] bg-slate-200 dark:bg-slate-800 hidden md:block mx-2" />

            <HistorySidebar onLoadHistory={handleLoadHistory} />

            <Link href="/help">
              <Button variant="ghost" size="sm" className="gap-2 text-slate-600 dark:text-slate-400" id="help-center-btn">
                <BookOpen className="w-4 h-4" />
                Ayuda
              </Button>
            </Link>

            <Button
              onClick={toggleTheme}
              variant="ghost"
              size="icon"
              className="text-slate-600 dark:text-slate-400"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>

            {stats.total > 0 && (
              <div className="flex gap-2 ml-2">
                <Button
                  onClick={handleClearData}
                  variant="outline"
                  size="sm"
                  className="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 border-red-200 dark:border-red-900/30"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
                <Button
                  onClick={handleExportToExcel}
                  className="bg-accent hover:bg-accent/90 text-primary font-bold shadow-accent/20 shadow-lg gap-2 border-none"
                  size="sm"
                  id="export-excel"
                >
                  <Download className="w-4 h-4" />
                  Excel
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Upload Zone */}
        <UploadZone
          onFilesReady={handleFilesReady}
          isValidating={isValidating}
          hasValidatedResults={hasValidatedResults}
        />

        {/* ✅ PRODUCCIÓN: Indicador de progreso durante procesamiento */}
        {isValidating && progress.total > 0 && (
          <Card className="border-0 shadow-sm mb-8 dark:bg-slate-800 dark:border-slate-700">
            <CardContent className="pt-6">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Procesando XMLs...
                  </p>
                  <p className="text-sm font-bold text-primary">
                    {progress.current} / {progress.total}
                  </p>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-primary to-accent h-3 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${(progress.current / progress.total) * 100}% ` }}
                  />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                  {Math.round((progress.current / progress.total) * 100)}% completado
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <Card className="border-0 shadow-sm dark:bg-slate-800 dark:border-slate-700">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Total Procesados</p>
                <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">{stats.total}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-none shadow-[0_4px_20px_rgba(0,0,0,0.05)] dark:bg-slate-800">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">🟢 Usables</p>
                <p className="text-3xl font-bold text-emerald-800 dark:text-emerald-400">{stats.usable}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white border-none shadow-[0_4px_20px_rgba(0,0,0,0.05)] dark:bg-slate-800">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">🟡 Alertas</p>
                <p className="text-3xl font-bold text-amber-700 dark:text-amber-400">{stats.alertas}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white border-none shadow-[0_4px_20px_rgba(0,0,0,0.05)] dark:bg-slate-800">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">🔴 No Usables</p>
                <p className="text-3xl font-bold text-red-800 dark:text-red-400">{stats.noUsable}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm dark:bg-slate-800 dark:border-slate-700">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-2 flex items-center justify-center gap-1">
                  <DollarSign className="w-4 h-4" /> Total
                </p>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">${(stats.totalMonto / 1000).toFixed(1)}K</p>
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
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg dark:text-slate-100">Detalle de Validaciones</CardTitle>
                <CardDescription className="dark:text-slate-400">Información completa de cada CFDI procesado</CardDescription>
              </div>
              <Button
                onClick={handleExportToExcel}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                <Download className="w-4 h-4" />
                Exportar
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700">
                      <th className="text-left py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">
                        <button
                          onClick={() => handleSort('fileName')}
                          className="group flex items-center gap-2 hover:text-primary transition-colors"
                        >
                          Archivo
                          {getSortIcon('fileName')}
                        </button>
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">
                        <button
                          onClick={() => handleSort('fechaEmision')}
                          className="group flex items-center gap-2 hover:text-primary transition-colors"
                        >
                          Fecha Emisión
                          {getSortIcon('fechaEmision')}
                        </button>
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">
                        <button
                          onClick={() => handleSort('rfcEmisor')}
                          className="group flex items-center gap-2 hover:text-primary transition-colors"
                        >
                          RFC Emisor
                          {getSortIcon('rfcEmisor')}
                        </button>
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">
                        <button
                          onClick={() => handleSort('total')}
                          className="group flex items-center gap-2 hover:text-primary transition-colors"
                        >
                          Total
                          {getSortIcon('total')}
                        </button>
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">
                        <button
                          onClick={() => handleSort('estatusSAT')}
                          className="group flex items-center gap-2 hover:text-primary transition-colors"
                        >
                          Estatus SAT
                          {getSortIcon('estatusSAT')}
                        </button>
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">
                        <button
                          onClick={() => handleSort('resultado')}
                          className="group flex items-center gap-2 hover:text-primary transition-colors"
                        >
                          Resultado
                          {getSortIcon('resultado')}
                        </button>
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedResults.map((result, idx) => {
                      const absoluteIndex = (currentPage - 1) * ITEMS_PER_PAGE + idx;
                      return (
                        <tr key={idx} className="border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                          <td className="py-3 px-4 text-slate-900 dark:text-slate-100 font-medium truncate max-w-[150px]" title={result.fileName}>{result.fileName}</td>
                          <td className="py-3 px-4 text-slate-900 dark:text-slate-100 whitespace-nowrap">{formatDate(result.fechaEmision)}</td>
                          <td className="py-3 px-4 text-slate-600 dark:text-slate-400 font-mono text-xs">{result.rfcEmisor}</td>
                          <td className="py-3 px-4 text-slate-900 dark:text-slate-100 font-bold">${result.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                          <td className="py-3 px-4">
                            <CFDISATStatus
                              estatusSAT={result.estatusSAT as any}
                              estatusCancelacion={result.fechaCancelacion}
                              rfcEmisorBlacklist={result.rfcEmisorBlacklist}
                              rfcReceptorBlacklist={result.rfcReceptorBlacklist}
                              compact={true}
                            />
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                {getStatusIcon(result.resultado)}
                                {getStatusBadge(result.resultado)}
                              </div>
                              <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{result.nivelValidacion}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-slate-600 dark:text-slate-400 text-xs max-w-[200px] leading-relaxed" title={result.comentarioFiscal}>
                            {result.comentarioFiscal}
                          </td>
                          <td className="py-3 px-4">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRevalidateSAT(absoluteIndex)}
                              className="text-primary hover:text-primary/80 hover:bg-primary/5"
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
          <p>Sentinel Express © 2026 - Validador de CFDI 4.0 con cumplimiento fiscal</p>
        </div>
      </div>
    </div>
  );
}
