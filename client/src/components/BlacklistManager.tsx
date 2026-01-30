import React, { useEffect, useState } from 'react';
import { processBlacklistFile } from "@/utils/blacklistUpdater";
import { getMetadata, BlacklistMetadata } from "@/db/blacklistDB";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, CheckCircle2, Upload, Database, RefreshCw } from "lucide-react";

export function BlacklistManager() {
    const [metadata, setMetadata] = useState<BlacklistMetadata | null>(null);
    const [isUpdating, setIsUpdating] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info', text: string } | null>(null);

    useEffect(() => {
        loadMetadata();
    }, []);

    async function loadMetadata() {
        const meta = await getMetadata();
        setMetadata(meta);
    }

    async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>, tipo: 'EFOS' | '69B') {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUpdating(true);
        setMessage({ type: 'info', text: `Procesando lista ${tipo}...` });

        try {
            const result = await processBlacklistFile(file, tipo);

            if (result.success) {
                setMessage({ type: 'success', text: `✅ ${tipo} actualizado: ${result.totalProcessed} nuevos registros.` });
                await loadMetadata();
            } else {
                setMessage({ type: 'error', text: `❌ Error: ${result.errors.join(', ')}` });
            }
        } catch (error) {
            setMessage({ type: 'error', text: `❌ Error crítico: ${error instanceof Error ? error.message : 'Desconocido'}` });
        } finally {
            setIsUpdating(false);
            // Reset input
            e.target.value = '';
        }
    }

    return (
        <Card className="w-full">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Database className="w-5 h-5 text-blue-600" />
                    Administración de Listas Negras SAT
                </CardTitle>
                <CardDescription>
                    Base de datos local IndexedDB para detección offline de EFOS y 69-B
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
                {/* Status Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                        <h3 className="font-semibold text-slate-700 flex items-center gap-2 mb-2">
                            <AlertCircle className="w-4 h-4 text-orange-500" />
                            Lista EFOS (Factureras)
                        </h3>
                        {metadata ? (
                            <div className="space-y-1 text-sm">
                                <p>Registros: <strong>{metadata.efosCount || 0}</strong></p>
                                <p className="text-slate-500 text-xs text-right">Actualizado: {metadata.efosLastUpdate ? new Date(metadata.efosLastUpdate).toLocaleDateString() : 'Nunca'}</p>
                            </div>
                        ) : <p className="text-sm text-slate-500">Sin datos</p>}
                    </div>

                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                        <h3 className="font-semibold text-slate-700 flex items-center gap-2 mb-2">
                            <AlertCircle className="w-4 h-4 text-red-600" />
                            Lista 69-B (Definitivos)
                        </h3>
                        {metadata ? (
                            <div className="space-y-1 text-sm">
                                <p>Registros: <strong>{metadata.list69BCount || 0}</strong></p>
                                <p className="text-slate-500 text-xs text-right">Actualizado: {metadata.list69BLastUpdate ? new Date(metadata.list69BLastUpdate).toLocaleDateString() : 'Nunca'}</p>
                            </div>
                        ) : <p className="text-sm text-slate-500">Sin datos</p>}
                    </div>
                </div>

                {/* Upload Section */}
                <div className="flex flex-col gap-4 border-t border-slate-100 pt-4">
                    <h4 className="text-sm font-medium text-slate-900 mb-2">Actualizar Listas (Carga Manual)</h4>

                    <div className="flex flex-col sm:flex-row gap-4">
                        <div className="flex-1">
                            <input
                                type="file"
                                id="upload-efos"
                                className="hidden"
                                accept=".txt,.csv"
                                onChange={(e) => handleFileUpload(e, 'EFOS')}
                                disabled={isUpdating}
                            />
                            <label htmlFor="upload-efos">
                                <Button variant="outline" className="w-full cursor-pointer gap-2" asChild disabled={isUpdating}>
                                    <span>
                                        <Upload className="w-4 h-4" />
                                        Cargar Lista EFOS
                                    </span>
                                </Button>
                            </label>
                        </div>

                        <div className="flex-1">
                            <input
                                type="file"
                                id="upload-69b"
                                className="hidden"
                                accept=".txt,.csv"
                                onChange={(e) => handleFileUpload(e, '69B')}
                                disabled={isUpdating}
                            />
                            <label htmlFor="upload-69b">
                                <Button variant="outline" className="w-full cursor-pointer gap-2 hover:bg-red-50 hover:text-red-700 hover:border-red-200" asChild disabled={isUpdating}>
                                    <span>
                                        <Upload className="w-4 h-4" />
                                        Cargar Lista 69-B
                                    </span>
                                </Button>
                            </label>
                        </div>
                    </div>
                </div>

                {/* Message Alert */}
                {message && (
                    <div className={`p-3 rounded-md text-sm font-medium ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' :
                            message.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' :
                                'bg-blue-50 text-blue-700 border border-blue-200'
                        }`}>
                        {message.text}
                    </div>
                )}

                <div className="bg-slate-50 p-3 rounded text-xs text-slate-500">
                    <strong>Nota:</strong> Los archivos deben ser formato CSV o TXT descargados del portal del SAT (Listado Completo). El sistema buscará RFCs automáticamente en el archivo.
                </div>
            </CardContent>
        </Card>
    );
}
