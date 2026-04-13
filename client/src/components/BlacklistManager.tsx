import React, { useEffect, useState } from 'react';
import { getMetadata, BlacklistMetadata, addBlacklistRecordsBulk, updateMetadata } from "@/db/blacklistDB";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle, CardHeader } from "@/components/ui/card";
import {
    ShieldCheck,
    Activity,
    RefreshCw,
    Cloud,
    Terminal,
    Settings2,
    Database,
    ShieldAlert,
    BrainCircuit
} from "lucide-react";
import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from "recharts";
import { toast } from 'sonner';

export function BlacklistManager() {
    const [metadata, setMetadata] = useState<BlacklistMetadata | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);

    useEffect(() => {
        loadMetadata();
    }, []);

    async function loadMetadata() {
        const meta = await getMetadata();
        setMetadata(meta);
    }

    async function handleSync() {
        setIsSyncing(true);
        const toastId = toast.loading("Cargando listas oficiales del SAT...");

        try {
            const efosRes = await fetch('/efos.json');
            const efosData = await efosRes.json();

            const b69Res = await fetch('/69b.json');
            const b69Data = await b69Res.json();

            const efosRecords = efosData.map((r: any) => ({
                rfc: r.rfc,
                tipo: 'EFOS' as const,
                situacion: r.situacion || 'Presunto',
                fechaPublicacion: new Date().toISOString()
            }));

            const b69Records = b69Data.map((r: any) => ({
                rfc: r.rfc,
                tipo: '69B' as const,
                situacion: r.situacion || 'Definitivo',
                fechaPublicacion: new Date().toISOString()
            }));

            const totalSAT = efosRecords.length + b69Records.length;

            if (efosRecords.length > 0) {
                await addBlacklistRecordsBulk(efosRecords);
            }
            if (b69Records.length > 0) {
                await addBlacklistRecordsBulk(b69Records);
            }

            const newMeta: BlacklistMetadata = {
                key: 'lastUpdate',
                efosLastUpdate: new Date().toISOString(),
                list69BLastUpdate: new Date().toISOString(),
                efosCount: efosRecords.length,
                list69BCount: b69Records.length
            };

            await updateMetadata(newMeta);
            await loadMetadata();
            
            toast.success(
                `Base SAT actualizada correctamente (${totalSAT.toLocaleString()} registros)`,
                { id: toastId }
            );
        } catch (error) {
            console.error("Error loading blacklist:", error);
            toast.error("No se pudo actualizar. Se mantiene la base local vigente", { id: toastId });
        } finally {
            setIsSyncing(false);
        }
    }

    const dataEfos = metadata?.efosCount || 0;
    const data69b = metadata?.list69BCount || 0;
    const totalRegistros = dataEfos + data69b;
    const hasData = totalRegistros > 0;

    const circleData = [{ value: hasData ? 100 : 0, fill: hasData ? '#10b981' : '#94a3b8' }];

    return (
        <div className="space-y-8 bg-slate-50/50 dark:bg-slate-900/50 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 transition-all duration-500">

            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                <div className="flex items-center gap-5">
                    <div className="relative group">
                        <div className={`absolute inset-0 rounded-2xl blur-xl opacity-20 group-hover:opacity-40 transition-opacity ${hasData ? 'bg-emerald-500' : 'bg-slate-400'} animate-pulse`}></div>
                        <div className={`p-4 rounded-2xl shadow-inner relative z-10 border ${hasData ? 'bg-emerald-950 border-emerald-500/30' : 'bg-slate-800 border-slate-600/30'}`}>
                            <BrainCircuit className={`w-10 h-10 ${hasData ? 'text-emerald-400' : 'text-slate-400'}`} />
                        </div>
                    </div>
                    <div>
                        <h2 className="text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight uppercase">Inteligencia SAT</h2>
                        <div className="flex items-center gap-2 mt-1">
                            <div className={`w-2 h-2 rounded-full ${hasData ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></div>
                            <p className={`text-xs font-bold tracking-widest uppercase ${hasData ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}`}>
                                {hasData ? '🟢 ACTIVO' : '🔴 INACTIVO'}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex gap-3">
                    <div className="flex flex-col items-end">
                        <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Última Actualización</p>
                        <p className="text-xs text-slate-700 dark:text-slate-300 font-mono">
                            {metadata?.efosLastUpdate ? new Date(metadata.efosLastUpdate).toLocaleString() : 'Pendiente cargar'}
                        </p>
                    </div>
                    <Button
                        onClick={handleSync}
                        disabled={isSyncing}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 px-6"
                    >
                        {isSyncing ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                        Sincronizar
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <Card className="lg:col-span-1 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md border border-slate-200/50 dark:border-white/10 shadow-xl rounded-3xl overflow-hidden group">
                    <CardHeader className="text-center pb-2 pt-8">
                        <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400">Estado Base SAT</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center justify-center pb-8 pt-0">
                        <div className="relative w-40 h-40">
                            <ResponsiveContainer width="100%" height="100%">
                                <RadialBarChart
                                    innerRadius="70%"
                                    outerRadius="100%"
                                    data={circleData}
                                    startAngle={225}
                                    endAngle={-45}
                                >
                                    <PolarAngleAxis
                                        type="number"
                                        domain={[0, 100]}
                                        angleAxisId={0}
                                        tick={false}
                                    />
                                    <RadialBar
                                        background
                                        dataKey="value"
                                        cornerRadius={20}
                                        fill={hasData ? "#10b981" : "#94a3b8"}
                                    />
                                </RadialBarChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 flex flex-col items-center justify-center pt-4">
                                <span className="text-4xl font-black text-slate-900 dark:text-slate-100">
                                    {hasData ? "✓" : "—"}
                                </span>
                                <span className="text-[10px] text-slate-500 font-bold uppercase">
                                    {hasData ? "BASE SAT ACTIVA" : "INACTIVO"}
                                </span>
                            </div>
                        </div>
                        <p className="text-[10px] text-center px-4 text-slate-400 dark:text-slate-500 mt-2 font-medium">
                            {hasData 
                                ? `Más de ${totalRegistros.toLocaleString()} registros oficiales del SAT disponibles para validación`
                                : "Base SAT no cargada"}
                        </p>
                    </CardContent>
                </Card>

                <Card className="lg:col-span-3 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md border border-slate-200/50 dark:border-white/10 shadow-xl rounded-2xl p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 h-full">
                        <div className="flex flex-col justify-between">
                            <div>
                                <h3 className="text-sm font-black text-indigo-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                                    <Database className="w-4 h-4" /> Listas Oficiales SAT
                                </h3>
                                <p className="text-[11px] text-slate-500 mb-4 italic">
                                    Validación automática contra EFOS (presuntos) y 69-B (definitivos)
                                </p>
                                <div className="space-y-6">
                                    <div className="flex justify-between items-center group">
                                        <div>
                                            <p className="text-xs font-bold text-slate-400">EFOS (Presuntos)</p>
                                            <p className="text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tighter">
                                                {dataEfos.toLocaleString()}
                                            </p>
                                        </div>
                                        <div className="bg-indigo-50 dark:bg-indigo-900/20 p-2 rounded-lg group-hover:bg-indigo-500 group-hover:text-white transition-all">
                                            <Activity className="w-5 h-5" />
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center group">
                                        <div>
                                            <p className="text-xs font-bold text-slate-400">69-B (Definitivos)</p>
                                            <p className="text-3xl font-black text-rose-600 dark:text-rose-400 tracking-tighter">
                                                {data69b.toLocaleString()}
                                            </p>
                                        </div>
                                        <div className="bg-rose-50 dark:bg-rose-900/20 p-2 rounded-lg group-hover:bg-rose-500 group-hover:text-white transition-all">
                                            <ShieldAlert className="w-5 h-5" />
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
                                    <p className="text-xs font-bold text-slate-500">Total registros SAT:</p>
                                    <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{(dataEfos + data69b).toLocaleString()}</p>
                                </div>
                            </div>

                            <div className="pt-4 flex gap-4">
                                <Button
                                    variant="link"
                                    className="text-[10px] text-slate-400 p-0 h-auto uppercase tracking-tighter font-black hover:text-indigo-500"
                                    onClick={() => setShowAdvanced(!showAdvanced)}
                                >
                                    {showAdvanced ? 'Ocultar Opciones' : 'Carga Manual'}
                                </Button>
                            </div>
                        </div>

                        <div className="bg-slate-950 rounded-2xl border border-white/5 p-5 shadow-2xl relative overflow-hidden flex flex-col h-full min-h-[200px]">
                            <div className="flex gap-1.5 mb-3">
                                <div className="w-2 h-2 rounded-full bg-rose-500/50"></div>
                                <div className="w-2 h-2 rounded-full bg-amber-500/50"></div>
                                <div className="w-2 h-2 rounded-full bg-emerald-500/50"></div>
                                <span className="ml-2 text-[9px] font-mono text-slate-600 tracking-tighter uppercase font-bold flex items-center gap-1">
                                    <Terminal className="w-3 h-3" /> Sentinel Logs
                                </span>
                            </div>
                            <div className="font-mono text-[10px] space-y-2 flex-grow overflow-y-auto text-slate-300">
                                <p className="text-emerald-500/80 leading-tight">
                                    <span className="text-slate-600 mr-2">[00:00:00]</span>
                                    INFO: Listas SAT {hasData ? 'cargadas' : 'no disponibles'}
                                </p>
                                <p className="leading-tight">
                                    <span className="text-slate-600 mr-2">[00:05:12]</span>
                                    RFC_QUERY: {hasData ? `${totalRegistros} registros` : 'vacio'} -- {hasData ? 'READY' : 'EMPTY'}
                                </p>
                                {hasData && (
                                    <p className="leading-tight text-emerald-500 bg-emerald-500/5 p-1 rounded">
                                        <span className="text-slate-600 mr-2">[01:12:44]</span>
                                        INTEL: Base EFOS ({dataEfos}) + 69-B ({data69b}) OK
                                    </p>
                                )}
                                <p className="text-indigo-400/80 leading-tight italic">
                                    <span className="text-slate-600 mr-2">[...]</span>
                                    {hasData ? 'Esperando validación de CFDI...' : 'Ejecuta Sincronizar para cargar listas'}
                                </p>
                            </div>
                            <p className="text-[10px] text-center text-emerald-600 dark:text-emerald-400 mt-3 font-medium">
                                Detección inmediata de proveedores en listas negras del SAT
                            </p>
                        </div>
                    </div>
                </Card>
            </div>

            {showAdvanced && (
                <div className="mt-8 pt-8 border-t border-slate-200 dark:border-slate-800 animate-in fade-in slide-in-from-top-4 duration-500">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <Settings2 className="w-4 h-4" /> Carga Manual de Datos
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <Button variant="outline" className="h-20 flex-col gap-1 border-dashed" onClick={() => toast.warning("Usa el botón Sincronizar principal.")}>
                            <Activity className="w-5 h-5 text-slate-400" />
                            <span className="text-[10px] font-black uppercase">Cargar EFOS</span>
                        </Button>
                        <Button variant="outline" className="h-20 flex-col gap-1 border-dashed" onClick={() => toast.warning("Usa el botón Sincronizar principal.")}>
                            <ShieldAlert className="w-5 h-5 text-slate-400" />
                            <span className="text-[10px] font-black uppercase">Cargar 69-B</span>
                        </Button>
                    </div>
                </div>
            )}

            {!hasData && !isSyncing && (
                <div className="flex flex-col items-center justify-center py-12 opacity-60 grayscale group">
                    <div className="bg-slate-200 dark:bg-slate-800 p-8 rounded-full mb-6 group-hover:scale-110 transition-transform duration-700">
                        <Cloud className="w-16 h-16 text-slate-400" />
                    </div>
                    <p className="text-sm font-black text-slate-500 uppercase tracking-widest">Base de datos vacía</p>
                    <p className="text-xs text-slate-400 mt-2">Ejecuta "Sincronizar" para cargar las listas oficiales del SAT.</p>
                </div>
            )}
        </div>
    );
}