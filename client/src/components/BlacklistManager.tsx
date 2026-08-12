import React, { useEffect, useState } from 'react';
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
    BrainCircuit,
    AlertTriangle,
    Download
} from "lucide-react";
import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from "recharts";
import { toast } from 'sonner';
import {
    getMetadata,
    updateMetadata,
    replaceBlacklistRecordsBulk,
    BlacklistRecord,
    BlacklistMetadata,
} from "@/db/blacklistDB";

// Nota honesta: los archivos vienen incluidos en la app, sin timestamp oficial comprobado
const DATA_SOURCE_NOTE = "Versión local: fecha oficial no verificada";
const STALE_THRESHOLD_DAYS = 30;

interface LocalMetadata {
    presuntos: number;
    definitivos: number;
    desvirtuados: number;
    sentenciaFavorable: number;
    total: number; // RFC únicos cargados
    cargadoEl: string | null; // Fecha de carga en este dispositivo (ISO)
    fechaOficial: string | null; // Fecha oficial del listado SAT (null = no verificada)
}

export function BlacklistManager() {
    const [localMeta, setLocalMeta] = useState<LocalMetadata>({
        presuntos: 0, definitivos: 0, desvirtuados: 0, sentenciaFavorable: 0, total: 0, cargadoEl: null, fechaOficial: null,
    });
    const [isLoading, setIsLoading] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [logLines, setLogLines] = useState<{ text: string; color?: string }[]>([
        { text: "INFO: Base local no cargada — carga las listas para validar RFC." },
    ]);

    useEffect(() => {
        loadLocalMetadata();
    }, []);

    function addLog(text: string, color?: string) {
        setLogLines(prev => [...prev.slice(-20), { text, color }]);
    }

    async function loadLocalMetadata() {
        try {
            const meta = await getMetadata();
            if (meta && (meta.efosCount || meta.list69BCount)) {
                const total = meta.totalRFC && meta.totalRFC > 0
                    ? meta.totalRFC
                    : (meta.efosCount || 0) + (meta.list69BCount || 0);
                setLocalMeta({
                    presuntos: meta.presuntos ?? 0,
                    definitivos: meta.definitivos ?? 0,
                    desvirtuados: meta.desvirtuados ?? 0,
                    sentenciaFavorable: meta.sentenciaFavorable ?? 0,
                    total,
                    cargadoEl: meta.cargadoEl || meta.list69BLastUpdate || meta.efosLastUpdate || null,
                    fechaOficial: meta.fechaOficial ?? null,
                });
                addLog(`INFO: Base local detectada — ${(total).toLocaleString()} RFC únicos.`, "#10b981");
            }
        } catch (e) {
            console.error("[BlacklistManager] Error leyendo metadata local:", e);
        }
    }

    async function handleLoadLocal() {
        setIsLoading(true);
        const toastId = toast.loading("Cargando listas en este dispositivo...");
        addLog("INFO: Iniciando carga desde archivos locales…");

        // Guardar copia de la metadata anterior para informar en caso de fallo
        let previousMeta: BlacklistMetadata | null = null;
        try {
            previousMeta = await getMetadata();
        } catch { /* sin metadata previa */ }

        try {
            // 1. Descargar /69b.json — fuente única de verdad (contiene todos los registros 69-B)
            addLog("FETCH: /69b.json …");
            const res69b = await fetch('/69b.json');

            if (!res69b.ok) {
                throw new Error(`HTTP ${res69b.status} al obtener /69b.json`);
            }

            const contentType = res69b.headers.get('content-type') || '';
            if (!contentType.includes('application/json') && !contentType.includes('text/')) {
                throw new Error(`Respuesta inesperada de /69b.json (${contentType}). Se esperaba JSON.`);
            }

            let raw69b: any[];
            let fechaOficialRaw: string | null = null;
            try {
                const parsed = await res69b.json();
                if (Array.isArray(parsed)) {
                    // Formato antiguo: arreglo de registros
                    raw69b = parsed;
                } else if (parsed && Array.isArray(parsed.registros)) {
                    // Formato actual: { fechaOficial, fuente, registros }
                    raw69b = parsed.registros;
                    fechaOficialRaw = typeof parsed.fechaOficial === 'string' && parsed.fechaOficial ? parsed.fechaOficial : null;
                } else {
                    throw new Error("El archivo /69b.json no tiene la estructura esperada (se requiere un arreglo de registros).");
                }
            } catch (e: any) {
                if (e?.message?.includes('no es JSON válido') || e instanceof SyntaxError) {
                    throw new Error("El archivo /69b.json no es JSON válido o está corrupto.");
                }
                throw e;
            }

            if (raw69b.length === 0) {
                throw new Error("El archivo /69b.json está vacío o tiene estructura incorrecta.");
            }

            addLog(`OK: ${raw69b.length.toLocaleString()} líneas leídas de /69b.json`);

            // 2. Validar y normalizar registros. Se conservan múltiples filas por RFC
            //    cuando hay distintas situaciones (para detectar "Situación múltiple").
            const rfcPattern = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
            const seenPair = new Set<string>(); // rfc + situacion
            const rfcSet = new Set<string>();   // RFC únicos
            const records: BlacklistRecord[] = [];
            let skipped = 0;

            // Contadores por situación (una sola vez por RFC, aunque repita estado)
            const conPresunto = new Set<string>();
            const conDefinitivo = new Set<string>();
            const conDesvirtuado = new Set<string>();
            const conSentencia = new Set<string>();

            const clasificar = (rfc: string, situacion: string) => {
                const sit = situacion.toLowerCase();
                if (sit.includes('presunto')) conPresunto.add(rfc);
                else if (sit.includes('definitivo')) conDefinitivo.add(rfc);
                else if (sit.includes('desvirtuado')) conDesvirtuado.add(rfc);
                else if (sit.includes('sentencia')) conSentencia.add(rfc);
            };

            for (const row of raw69b) {
                if (!row || typeof row.rfc !== 'string') { skipped++; continue; }

                const rfcNorm = row.rfc.trim().toUpperCase();
                if (!rfcPattern.test(rfcNorm)) { skipped++; continue; }

                const situacion = (row.situacion || '').trim();
                const pairKey = `${rfcNorm}::${situacion.toUpperCase()}`;
                if (seenPair.has(pairKey)) { skipped++; continue; }
                seenPair.add(pairKey);

                rfcSet.add(rfcNorm);
                clasificar(rfcNorm, situacion);

                const tipo: 'EFOS' | '69B' = row.tipo === 'EFOS' ? 'EFOS' : '69B';

                records.push({
                    rfc: rfcNorm,
                    tipo,
                    razonSocial: row.razonSocial || undefined,
                    situacion: situacion || undefined,
                    fechaPublicacion: row.fechaPublicacion || undefined,
                });
            }

            addLog(`NORM: ${records.length.toLocaleString()} registros válidos (${rfcSet.size.toLocaleString()} RFC únicos). ${skipped} omitidos.`);

            if (records.length === 0) {
                throw new Error("Ningún registro pasó la validación de formato. El archivo puede estar corrupto.");
            }

            // 3. Reemplazo atómico en IndexedDB: si algo falla, se conserva la copia anterior válida
            addLog("DB: Reemplazando registros en IndexedDB (transacción atómica)…");
            const inserted = await replaceBlacklistRecordsBulk(records);

            // 4. Guardar metadata: fecha de carga del dispositivo + fecha oficial si el archivo la trae
            const now = new Date().toISOString();
            await updateMetadata({
                key: 'lastUpdate',
                cargadoEl: now,
                fechaOficial: fechaOficialRaw,
                efosCount: 0,
                list69BCount: records.length,
                totalRFC: rfcSet.size,
                presuntos: conPresunto.size,
                definitivos: conDefinitivo.size,
                desvirtuados: conDesvirtuado.size,
                sentenciaFavorable: conSentencia.size,
            });

            addLog(`OK: ${inserted.toLocaleString()} registros cargados correctamente.`, "#10b981");
            addLog(`OK: Presuntos: ${conPresunto.size} | Definitivos: ${conDefinitivo.size} | Desvirtuados: ${conDesvirtuado.size} | Sentencia favorable: ${conSentencia.size}`, "#10b981");

            // 5. Actualizar UI
            setLocalMeta({
                presuntos: conPresunto.size,
                definitivos: conDefinitivo.size,
                desvirtuados: conDesvirtuado.size,
                sentenciaFavorable: conSentencia.size,
                total: rfcSet.size,
                cargadoEl: now,
                fechaOficial: fechaOficialRaw,
            });

            toast.success(
                `${rfcSet.size.toLocaleString()} RFC únicos cargados en este dispositivo`,
                { id: toastId }
            );

        } catch (error: any) {
            addLog(`ERROR: ${error.message}`, "#f87171");
            console.error("[BlacklistManager] Error al cargar listas:", error);

            // Rollback: si había datos válidos previos, la transacción atómica los conserva
            if (previousMeta && (previousMeta.efosCount || previousMeta.list69BCount)) {
                addLog("INFO: Se conserva la copia anterior válida.", "#fbbf24");
                toast.error(
                    `Error al cargar: ${error.message}. Se conservan los datos anteriores.`,
                    { id: toastId, duration: 6000 }
                );
            } else {
                toast.error(`Error al cargar listas: ${error.message}`, { id: toastId, duration: 6000 });
            }
        } finally {
            setIsLoading(false);
        }
    }

    const hasData = localMeta.total > 0;
    const circleData = [{ value: hasData ? 100 : 0, fill: hasData ? '#10b981' : '#94a3b8' }];

    // Verificar si los datos tienen más de STALE_THRESHOLD_DAYS días
    const isStale = (() => {
        if (!localMeta.cargadoEl) return false;
        const diffDays = (Date.now() - new Date(localMeta.cargadoEl).getTime()) / (1000 * 60 * 60 * 24);
        return diffDays > STALE_THRESHOLD_DAYS;
    })();

    // Verificar si la fecha oficial de la lista SAT está obsoleta
    const isOfficiallyStale = (() => {
        if (!localMeta.fechaOficial) return false;
        const diffDays = (Date.now() - new Date(localMeta.fechaOficial + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24);
        return diffDays > 45; // umbral de 45 días para avisar que la fuente está desactualizada
    })();

    return (
        <div className="space-y-8 bg-slate-50/50 dark:bg-slate-900/50 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 transition-all duration-500">

            {/* Header */}
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
                            <div className={`w-2 h-2 rounded-full ${hasData ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500 animate-pulse'}`}></div>
                            <p className={`text-xs font-bold tracking-widest uppercase ${hasData ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-500'}`}>
                                {hasData ? '🟢 LISTAS CARGADAS LOCALMENTE' : '🟡 SIN DATOS — REQUIERE CARGA'}
                            </p>
                        </div>
                        {!hasData && (
                            <p className="text-[10px] text-slate-500 mt-2 max-w-sm italic leading-tight">
                                Sin listas cargadas, los XML mostrarán "No validado" en lugar de "Sin coincidencias".
                            </p>
                        )}
                    </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                    {/* Metadatos honestos */}
                    <div className="text-right space-y-0.5">
                        <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">
                            Fuente: Archivos locales incluidos en la app
                        </p>
                        {hasData && !localMeta.fechaOficial && (
                            <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold italic">
                                {DATA_SOURCE_NOTE}
                            </p>
                        )}
                        {hasData && (
                            <p className="text-[10px] text-slate-600 dark:text-slate-400 font-mono">
                                Fecha oficial: {localMeta.fechaOficial ? new Date(localMeta.fechaOficial + 'T00:00:00').toLocaleDateString('es-MX') : 'No verificada'}
                            </p>
                        )}
                        {localMeta.cargadoEl ? (
                            <p className="text-[10px] text-slate-600 dark:text-slate-400 font-mono">
                                Cargado en este dispositivo: {new Date(localMeta.cargadoEl).toLocaleString('es-MX')}
                            </p>
                        ) : (
                            <p className="text-[10px] text-slate-500 font-mono">No cargado en este dispositivo</p>
                        )}
                    </div>

                    <Button
                        onClick={handleLoadLocal}
                        disabled={isLoading}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 px-6"
                    >
                        {isLoading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
                        Cargar listas en este dispositivo
                    </Button>
                </div>
            </div>

            {/* Advertencia de datos desactualizados */}
            {isStale && (
                <div className="flex items-center gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3">
                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                    <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                        Las listas fueron cargadas hace más de {STALE_THRESHOLD_DAYS} días. <strong>Se recomienda actualizar</strong> los archivos desde la fuente oficial del SAT y volver a cargar.
                    </p>
                </div>
            )}

            {/* Advertencia de fecha de corte oficial desactualizada */}
            {isOfficiallyStale && (
                <div className="flex items-center gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3">
                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                    <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                        La fuente oficial disponible tiene fecha de corte <strong>{localMeta.fechaOficial ? new Date(localMeta.fechaOficial + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''}</strong>.
                    </p>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Indicador circular */}
                <Card className="lg:col-span-1 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md border border-slate-200/50 dark:border-white/10 shadow-xl rounded-3xl overflow-hidden group">
                    <CardHeader className="text-center pb-2 pt-8">
                        <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400">Estado Base Local</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center justify-center pb-8 pt-0">
                        <div className="relative w-40 h-40">
                            <ResponsiveContainer width="100%" height="100%">
                                <RadialBarChart innerRadius="70%" outerRadius="100%" data={circleData} startAngle={225} endAngle={-45}>
                                    <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                                    <RadialBar background dataKey="value" cornerRadius={20} fill={hasData ? "#10b981" : "#94a3b8"} />
                                </RadialBarChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 flex flex-col items-center justify-center pt-4">
                                <span className="text-4xl font-black text-slate-900 dark:text-slate-100">
                                    {hasData ? "✓" : "—"}
                                </span>
                                <span className="text-[10px] text-slate-500 font-bold uppercase">
                                    {hasData ? "BASE CARGADA" : "BASE VACÍA"}
                                </span>
                            </div>
                        </div>
                        <p className="text-[10px] text-center px-4 text-slate-400 dark:text-slate-500 mt-2 font-medium">
                            {hasData
                                ? `${localMeta.total.toLocaleString()} RFC en lista 69-B disponibles en este dispositivo`
                                : "Sin datos — XML se marcarán como No validado"}
                        </p>
                    </CardContent>
                </Card>

                {/* Métricas + Terminal */}
                <Card className="lg:col-span-3 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md border border-slate-200/50 dark:border-white/10 shadow-xl rounded-2xl p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 h-full">
                        <div className="flex flex-col justify-between">
                            <div>
                                <h3 className="text-sm font-black text-indigo-500 uppercase tracking-widest mb-1 flex items-center gap-2">
                                    <Database className="w-4 h-4" /> Listas Cargadas Localmente
                                </h3>
                                <p className="text-[10px] text-slate-500 mb-4 italic font-medium">
                                    {localMeta.fechaOficial
                                        ? `Fecha oficial del listado SAT: ${new Date(localMeta.fechaOficial + 'T00:00:00').toLocaleDateString('es-MX')}`
                                        : DATA_SOURCE_NOTE}
                                </p>

                                {hasData ? (
                                    <div className="space-y-3">
                                        <div className="flex justify-between items-center">
                                            <p className="text-xs font-bold text-slate-400">Presuntos</p>
                                            <p className="text-2xl font-black text-orange-500 tracking-tighter">{localMeta.presuntos.toLocaleString()}</p>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <p className="text-xs font-bold text-slate-400">69-B Definitivos</p>
                                            <p className="text-2xl font-black text-rose-600 dark:text-rose-400 tracking-tighter">{localMeta.definitivos.toLocaleString()}</p>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <p className="text-xs font-bold text-slate-400">Desvirtuados</p>
                                            <p className="text-xl font-black text-slate-500 tracking-tighter">{localMeta.desvirtuados.toLocaleString()}</p>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <p className="text-xs font-bold text-slate-400">Sentencia Favorable</p>
                                            <p className="text-xl font-black text-slate-500 tracking-tighter">{localMeta.sentenciaFavorable.toLocaleString()}</p>
                                        </div>
                                        <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700">
                                            <p className="text-xs font-bold text-slate-500">Total RFC únicos:</p>
                                            <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{localMeta.total.toLocaleString()}</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-sm text-slate-400 italic py-4">
                                        Sin datos cargados en este navegador.<br />
                                        Al procesar XML, los RFC aparecerán como <strong>"No validado"</strong>.
                                    </div>
                                )}
                            </div>

                            <div className="pt-4 flex gap-4">
                                <Button
                                    variant="link"
                                    className="text-[10px] text-slate-400 p-0 h-auto uppercase tracking-tighter font-black hover:text-indigo-500"
                                    onClick={() => setShowAdvanced(!showAdvanced)}
                                >
                                    {showAdvanced ? 'Ocultar' : 'Cómo actualizar'}
                                </Button>
                            </div>
                        </div>

                        {/* Terminal */}
                        <div className="bg-slate-950 rounded-2xl border border-white/5 p-5 shadow-2xl relative overflow-hidden flex flex-col h-full min-h-[200px]">
                            <div className="flex gap-1.5 mb-3">
                                <div className="w-2 h-2 rounded-full bg-rose-500/50"></div>
                                <div className="w-2 h-2 rounded-full bg-amber-500/50"></div>
                                <div className="w-2 h-2 rounded-full bg-emerald-500/50"></div>
                                <span className="ml-2 text-[9px] font-mono text-slate-600 tracking-tighter uppercase font-bold flex items-center gap-1">
                                    <Terminal className="w-3 h-3" /> Sentinel Logs
                                </span>
                            </div>
                            <div className="font-mono text-[10px] space-y-1.5 flex-grow overflow-y-auto text-slate-300 max-h-48">
                                {logLines.map((line, i) => (
                                    <p key={i} className="leading-tight" style={line.color ? { color: line.color } : {}}>
                                        <span className="text-slate-600 mr-2">[{new Date().toLocaleTimeString('es-MX', { hour12: false })}]</span>
                                        {line.text}
                                    </p>
                                ))}
                            </div>
                            <p className="text-[10px] text-center text-slate-500 mt-3 font-medium italic">
                                Validación local. Los datos no salen de este dispositivo.
                            </p>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Panel "Cómo actualizar" */}
            {showAdvanced && (
                <div className="mt-8 pt-8 border-t border-slate-200 dark:border-slate-800 animate-in fade-in slide-in-from-top-4 duration-500">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <Settings2 className="w-4 h-4" /> Cómo actualizar las listas
                    </h4>
                    <div className="bg-slate-900 rounded-xl p-4 space-y-2 text-xs text-slate-300">
                        <p className="font-bold text-amber-400">⚠️ Los archivos incluidos en la app no se actualizan automáticamente.</p>
                        <p>Para obtener una versión más reciente:</p>
                        <ol className="list-decimal list-inside space-y-1 text-slate-400">
                            <li>Ejecuta el script <span className="font-mono text-indigo-400">scripts/update_efos_blacklist.py</span></li>
                            <li>El script descarga el listado oficial del SAT, extrae la fecha oficial del propio encabezado y regenera <span className="font-mono text-indigo-400">client/public/69b.json</span> conservando múltiples situaciones por RFC</li>
                            <li>Deja un respaldo automático en <span className="font-mono text-indigo-400">scripts/backups/</span></li>
                            <li>Redeploy a Netlify y vuelve a dar clic a "Cargar listas en este dispositivo"</li>
                        </ol>
                        <p className="text-slate-500 italic pt-2">
                            Fuente oficial SAT (69-B): <span className="font-mono">omawww.sat.gob.mx/cifras_sat/Documents/Listado_Completo_69-B.csv</span>
                        </p>
                    </div>
                </div>
            )}

            {!hasData && !isLoading && (
                <div className="flex flex-col items-center justify-center py-12 opacity-60 grayscale group">
                    <div className="bg-slate-200 dark:bg-slate-800 p-8 rounded-full mb-6 group-hover:scale-110 transition-transform duration-700">
                        <Cloud className="w-16 h-16 text-slate-400" />
                    </div>
                    <p className="text-sm font-black text-slate-500 uppercase tracking-widest">Base de datos vacía</p>
                    <p className="text-xs text-slate-400 mt-2">Da clic en "Cargar listas en este dispositivo" para habilitar la validación.</p>
                </div>
            )}
        </div>
    );
}