import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { CheckCircle2, AlertCircle, XCircle, TrendingUp, FileText, DollarSign, Download, Moon, Sun, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import UploadZone, { UploadedFile } from "@/components/UploadZone";
import { useXMLValidator, ValidationResult } from "@/hooks/useXMLValidator";
import { exportToExcel } from "@/lib/excelExporter";
import { toast } from "sonner";
import { useTheme } from "@/contexts/ThemeContext";

type DashboardResult = ValidationResult;
type SortField = 'fileName' | 'rfcEmisor' | 'total' | 'estatusSAT' | 'resultado' | 'comentarioFiscal';
type SortDirection = 'asc' | 'desc' | null;

export default function Dashboard() {
  const [results, setResults] = useState<ValidationResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasValidatedResults, setHasValidatedResults] = useState(false);
  const { isValidating, validateXMLFiles, progress } = useXMLValidator();
  const { theme, toggleTheme } = useTheme();
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 50;

  // ⚠️ PRODUCCIÓN: No cargar datos automáticamente
  // El dashboard debe iniciar VACÍO hasta que el usuario cargue XMLs reales
  useEffect(() => {
    setLoading(false);
  }, []);

  const handleFilesReady = async (files: UploadedFile[]) => {
    try {
      const validationResults = await validateXMLFiles(files);
      
      // Agregar resultados al dashboard
      setResults((prev) => [...prev, ...validationResults]);
      setHasValidatedResults(true);

      // Mostrar mensaje de éxito
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

  const handleExportToExcel = () => {
    try {
      exportToExcel(results);
      toast.success("Diagnóstico exportado exitosamente");
    } catch (error) {
      toast.error("Error al exportar el diagnóstico");
      console.error("Export error:", error);
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
    { name: "Usable", value: stats.usable, color: "#22c55e" },
    { name: "Alertas", value: stats.alertas, color: "#eab308" },
    { name: "No Usable", value: stats.noUsable, color: "#ef4444" },
  ];

  const trendData = results.map((r, idx) => ({
    index: idx + 1,
    total: r.total,
    iva: r.ivaTraslado,
    subtotal: r.subtotal,
  }));

  const getStatusIcon = (resultado: string) => {
    if (resultado.includes("🟢")) return <CheckCircle2 className="w-5 h-5 text-green-600" />;
    if (resultado.includes("🟡")) return <AlertCircle className="w-5 h-5 text-yellow-600" />;
    return <XCircle className="w-5 h-5 text-red-600" />;
  };

  const getStatusBadge = (resultado: string) => {
    if (resultado.includes("🟢")) return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Usable</Badge>;
    if (resultado.includes("🟡")) return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">Alertas</Badge>;
    return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">No Usable</Badge>;
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
      return <ArrowUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />;
    }
    return <ArrowDown className="w-4 h-4 text-blue-600 dark:text-blue-400" />;
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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Cargando resultados...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4 md:p-8 transition-colors duration-200">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <FileText className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-slate-100">Sentinel Express</h1>
            </div>
            <p className="text-slate-600 dark:text-slate-400">Validador Masivo de CFDI 4.0</p>
          </div>
          <div className="flex gap-2">
            {/* Theme Toggle */}
            <Button
              onClick={toggleTheme}
              variant="outline"
              size="lg"
              className="gap-2"
            >
              {theme === "dark" ? (
                <>
                  <Sun className="w-4 h-4" />
                  <span className="hidden sm:inline">Modo Claro</span>
                </>
              ) : (
                <>
                  <Moon className="w-4 h-4" />
                  <span className="hidden sm:inline">Modo Oscuro</span>
                </>
              )}
            </Button>
            {stats.total > 0 && (
              <Button
                onClick={handleExportToExcel}
                className="gap-2"
                size="lg"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Exportar diagnóstico (Excel)</span>
                <span className="sm:hidden">Excel</span>
              </Button>
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
                  <p className="text-sm font-bold text-blue-600 dark:text-blue-400">
                    {progress.current} / {progress.total}
                  </p>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3 overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
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

          <Card className="border-0 shadow-sm border-l-4 border-l-green-600 dark:bg-slate-800 dark:border-slate-700">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">🟢 Usables</p>
                <p className="text-3xl font-bold text-green-600 dark:text-green-400">{stats.usable}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm border-l-4 border-l-yellow-600 dark:bg-slate-800 dark:border-slate-700">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">🟡 Con Alertas</p>
                <p className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">{stats.alertas}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm border-l-4 border-l-red-600 dark:bg-slate-800 dark:border-slate-700">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">🔴 No Usables</p>
                <p className="text-3xl font-bold text-red-600 dark:text-red-400">{stats.noUsable}</p>
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
                      label={({ name, value }) => `${name}: ${value}`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
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
                          className="group flex items-center gap-2 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        >
                          Archivo
                          {getSortIcon('fileName')}
                        </button>
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">
                        <button
                          onClick={() => handleSort('rfcEmisor')}
                          className="group flex items-center gap-2 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        >
                          RFC Emisor
                          {getSortIcon('rfcEmisor')}
                        </button>
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">
                        <button
                          onClick={() => handleSort('total')}
                          className="group flex items-center gap-2 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        >
                          Total
                          {getSortIcon('total')}
                        </button>
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">
                        <button
                          onClick={() => handleSort('estatusSAT')}
                          className="group flex items-center gap-2 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        >
                          Estatus SAT
                          {getSortIcon('estatusSAT')}
                        </button>
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">
                        <button
                          onClick={() => handleSort('resultado')}
                          className="group flex items-center gap-2 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        >
                          Resultado
                          {getSortIcon('resultado')}
                        </button>
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">
                        <button
                          onClick={() => handleSort('comentarioFiscal')}
                          className="group flex items-center gap-2 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        >
                          Comentario
                          {getSortIcon('comentarioFiscal')}
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedResults.map((result, idx) => (
                      <tr key={idx} className="border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                        <td className="py-3 px-4 text-slate-900 dark:text-slate-100 font-medium truncate max-w-xs">{result.fileName}</td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{result.rfcEmisor}</td>
                        <td className="py-3 px-4 text-slate-900 dark:text-slate-100 font-semibold">${result.total.toFixed(2)}</td>
                        <td className="py-3 px-4">
                          <Badge variant="outline" className="text-xs">
                            {result.estatusSAT}
                          </Badge>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            {getStatusIcon(result.resultado)}
                            {getStatusBadge(result.resultado)}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-400 text-xs max-w-xs truncate" title={result.comentarioFiscal}>
                          {result.comentarioFiscal}
                        </td>
                      </tr>
                    ))}
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
          <p>Sentinel Express © 2024 - Validador de CFDI 4.0 con cumplimiento fiscal</p>
        </div>
      </div>
    </div>
  );
}
