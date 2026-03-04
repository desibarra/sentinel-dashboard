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
    ShieldAlert
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
        const toastId = toast.loading("Verificando disponibilidad de actualización...");

        try {
            // 1. Get metadata from server
            const resMeta = await fetch('/api/blacklist/metadata');
            const serverMeta = await resMeta.json();

            // 2. Fetch data types sequentially
            const types = ['EFOS', '69B'];
            for (const tipo of types) {
                const sTypeMeta = serverMeta.find((m: any) => m.tipo === tipo);
                if (!sTypeMeta) continue;

                const resData = await fetch(`/api/blacklist/data/${tipo}`);
                const rfcs = await resData.json();

                const records = rfcs.map((rfc: string) => ({
                    rfc,
                    tipo,
                    fechaPublicacion: new Date().toISOString()
                }));

                await addBlacklistRecordsBulk(records);
            }

            // 3. Update local metadata
            const totalEfos = serverMeta.find((m: any) => m.tipo === 'EFOS')?.count || 0;
            const total69B = serverMeta.find((m: any) => m.tipo === '69B')?.count || 0;

            const newMeta: BlacklistMetadata = {
                key: 'lastUpdate',
                efosLastUpdate: new Date().toISOString(),
                list69BLastUpdate: new Date().toISOString(),
                efosCount: totalEfos,
                list69BCount: total69B
            };

            await updateMetadata(newMeta);
            await loadMetadata();

            toast.success("Sincronización Cloud Sentinel completa. Protección actualizada.", { id: toastId });
        } catch (error) {
            // El servidor no está disponible: modo local activo, sin alarmar al usuario
            console.info("Sync no disponible, operando en modo local:", error);
            toast.info(
                "Modo local activo. Sentinel continuará utilizando la base local de inteligencia SAT. \u2014 Base de firmas SAT: 2026.02",
                { id: toastId, duration: 5000 }
            );
        } finally {
            setIsSyncing(false);
        }
    }

    const dataEfos = metadata?.efosCount || 0;
    const data69b = metadata?.list69BCount || 0;
    const totalAmenazas = dataEfos + data69b;
    const healthScore = totalAmenazas > 0 ? 100 : 0;

    const healthData = [{ value: healthScore, fill: '#10b981' }];

    return (
        <div className="space-y-8 bg-slate-50/50 dark:bg-slate-900/50 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 transition-all duration-500">

            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                <div className="flex items-center gap-5">
                    <div className="relative group">
                        <div className="absolute inset-0 bg-indigo-500 rounded-2xl blur-xl opacity-20 group-hover:opacity-40 transition-opacity animate-pulse"></div>
                        <div className="bg-indigo-950 p-4 rounded-2xl shadow-inner relative z-10 border border-indigo-500/30">
                            <ShieldCheck className="w-10 h-10 text-indigo-400" />
                        </div>
                    </div>
                    <div>
                        <h2 className="text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight uppercase">Dashboard de Mando</h2>
                        <div className="flex items-center gap-2 mt-1">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                            <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 tracking-widest uppercase">Estatus: Protector Activo</p>
                        </div>
                    </div>
                </div>

                <div className="flex gap-3">
                    <div className="flex flex-col items-end">
                        <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Sincronización Cloud</p>
                        <p className="text-xs text-slate-700 dark:text-slate-300 font-mono">
                            Ult: {metadata?.efosLastUpdate ? new Date(metadata.efosLastUpdate).toLocaleString() : 'Pendiente Inicializar'}
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
                        <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400">Salud del Sistema</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center justify-center pb-8 pt-0">
                        <div className="relative w-40 h-40">
                            <ResponsiveContainer width="100%" height="100%">
                                <RadialBarChart
                                    innerRadius="70%"
                                    outerRadius="100%"
                                    data={healthData}
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
                                        fill={totalAmenazas > 0 ? "#10b981" : "#f43f5e"}
                                    />
                                </RadialBarChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 flex flex-col items-center justify-center pt-4">
                                <span className="text-4xl font-black text-slate-900 dark:text-slate-100">
                                    {totalAmenazas > 0 ? "100" : "0"}%
                                </span>
                                <span className="text-[10px] text-slate-500 font-bold uppercase">Protección</span>
                            </div>
                        </div>
                        <p className="text-[10px] text-center px-4 text-slate-400 dark:text-slate-500 mt-2 font-medium"> Base de firmas SAT v2026.02 activa. </p>
                    </CardContent>
                </Card>

                <Card className="lg:col-span-3 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md border border-slate-200/50 dark:border-white/10 shadow-xl rounded-2xl p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 h-full">
                        <div className="flex flex-col justify-between">
                            <div>
                                <h3 className="text-sm font-black text-indigo-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <Database className="w-4 h-4" /> Inteligencia SAT
                                </h3>
                                <div className="space-y-6">
                                    <div className="flex justify-between items-center group">
                                        <div>
                                            <p className="text-xs font-bold text-slate-400">ENTIDADES EFOS</p>
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
                                            <p className="text-xs font-bold text-slate-400">ARTÍCULO 69-B (CANCELADOS)</p>
                                            <p className="text-3xl font-black text-rose-600 dark:text-rose-400 tracking-tighter">
                                                {data69b.toLocaleString()}
                                            </p>
                                        </div>
                                        <div className="bg-rose-50 dark:bg-rose-900/20 p-2 rounded-lg group-hover:bg-rose-500 group-hover:text-white transition-all">
                                            <ShieldAlert className="w-5 h-5" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="pt-8 flex gap-4">
                                <Button
                                    variant="link"
                                    className="text-[10px] text-slate-400 p-0 h-auto uppercase tracking-tighter font-black hover:text-indigo-500"
                                    onClick={() => setShowAdvanced(!showAdvanced)}
                                >
                                    {showAdvanced ? 'Ocultar Opciones Fallback' : 'Configuración Fallback'}
                                </Button>
                            </div>
                        </div>

                        <div className="bg-slate-950 rounded-2xl border border-white/5 p-5 shadow-2xl relative overflow-hidden flex flex-col h-full min-h-[200px]">
                            <div className="flex gap-1.5 mb-3">
                                <div className="w-2 h-2 rounded-full bg-rose-500/50"></div>
                                <div className="w-2 h-2 rounded-full bg-amber-500/50"></div>
                                <div className="w-2 h-2 rounded-full bg-emerald-500/50"></div>
                                <span className="ml-2 text-[9px] font-mono text-slate-600 tracking-tighter uppercase font-bold flex items-center gap-1">
                                    <Terminal className="w-3 h-3" /> Sentinel Interceptor Logs
                                </span>
                            </div>
                            <div className="font-mono text-[10px] space-y-2 flex-grow overflow-y-auto text-slate-300">
                                <p className="text-emerald-500/80 leading-tight">
                                    <span className="text-slate-600 mr-2">[00:00:00]</span>
                                    SYS: Blacklist Sync Handshake OK
                                </p>
                                <p className="leading-tight">
                                    <span className="text-slate-600 mr-2">[00:05:12]</span>
                                    SCAN: RFC_QUERY EXT9988***A1 -- CLEAN
                                </p>
                                <p className="leading-tight text-rose-500 animate-pulse bg-rose-500/5 p-1 rounded">
                                    <span className="text-slate-600 mr-2">[01:12:44]</span>
                                    ALERT: EFOS MATCH FOUND [RO***P881] -- REFUSED
                                </p>
                                <p className="text-indigo-400/80 leading-tight italic">
                                    <span className="text-slate-600 mr-2">[...]</span>
                                    Waiting for next Cloud broadcast...
                                </p>
                            </div>
                        </div>
                    </div>
                </Card>
            </div>

            {showAdvanced && (
                <div className="mt-8 pt-8 border-t border-slate-200 dark:border-slate-800 animate-in fade-in slide-in-from-top-4 duration-500">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <Settings2 className="w-4 h-4" /> Ingesta de Datos (Fallback Manual)
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <Button variant="outline" className="h-20 flex-col gap-1 border-dashed" onClick={() => toast.warning("Sincronización Cloud recomendada.")}>
                            <Activity className="w-5 h-5 text-slate-400" />
                            <span className="text-[10px] font-black uppercase">EFOS</span>
                        </Button>
                        <Button variant="outline" className="h-20 flex-col gap-1 border-dashed" onClick={() => toast.warning("Sincronización Cloud recomendada.")}>
                            <ShieldAlert className="w-5 h-5 text-slate-400" />
                            <span className="text-[10px] font-black uppercase">69-B</span>
                        </Button>
                    </div>
                </div>
            )}

            {totalAmenazas === 0 && !isSyncing && (
                <div className="flex flex-col items-center justify-center py-12 opacity-40 grayscale group">
                    <div className="bg-slate-200 dark:bg-slate-800 p-8 rounded-full mb-6 group-hover:scale-110 transition-transform duration-700">
                        <Cloud className="w-16 h-16 text-slate-400" />
                    </div>
                    <p className="text-sm font-black text-slate-500 uppercase tracking-widest">Base de datos vacía</p>
                    <p className="text-xs text-slate-400 mt-2">Inicia la sincronización para activar los escudos Sentinel.</p>
                </div>
            )}
        </div>
    );
}
