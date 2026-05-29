import React from 'react';
import { BlacklistValidation } from "@/utils/blacklistValidator";

interface Props {
    estatusSAT: "No verificado" | "Vigente" | "Cancelado" | "No Encontrado" | "Error Conexión";
    isCheckingSAT?: boolean;
    estatusCancelacion?: string;
    rfcEmisorBlacklist?: BlacklistValidation;
    rfcReceptorBlacklist?: BlacklistValidation;
    compact?: boolean; // Added for table compatibility
}

export function CFDISATStatus({
    estatusSAT,
    isCheckingSAT,
    estatusCancelacion,
    rfcEmisorBlacklist,
    rfcReceptorBlacklist,
    compact = false
}: Props) {

    if (isCheckingSAT) {
        if (compact) {
            return (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200">
                    <span className="w-2 h-2 rounded-full border-2 border-gray-400 border-t-transparent animate-spin"></span>
                    SAT
                </span>
            );
        }
        return (
            <div className="flex items-center gap-2 p-4 bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg">
                <div className="w-4 h-4 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin"></div>
                <span className="text-gray-500 font-medium">Consultando estatus SAT...</span>
            </div>
        );
    }

    // Si no hay status SAT y tampoco listas negras relevantes, retornar null
    // (Aunque si compact es true, mejor mostrar loading o vacío)
    if (!estatusSAT || estatusSAT === "No verificado") {
        if ((rfcEmisorBlacklist && rfcEmisorBlacklist.found) || (rfcReceptorBlacklist && rfcReceptorBlacklist.found)) {
            // Si tenemos listas negras pero no SAT, seguimos
        } else {
            return null;
        }
    }

    // Badges y contenido
    const badges = [];

    // 1. SAT Status
    if (estatusSAT === 'Vigente') {
        badges.push(
            <span key="sat-ok" className={`inline-flex items-center gap-1.5 ${compact ? 'px-2 py-0.5 text-[9px]' : 'px-3 py-1 text-sm'} font-black bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 rounded-lg uppercase tracking-widest`}>
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                Vigente
            </span>
        );
    } else if (estatusSAT === 'Cancelado') {
        badges.push(
            <span key="sat-cancel" className={`inline-flex items-center gap-1.5 ${compact ? 'px-2 py-0.5 text-[9px]' : 'px-3 py-1 text-sm'} font-black bg-rose-500/10 text-rose-600 border border-rose-500/20 rounded-lg uppercase tracking-widest animate-pulse`}>
                Cancelado
            </span>
        );
    } else if (estatusSAT === 'No Encontrado') {
        badges.push(
            <span key="sat-warn" className={`inline-flex items-center gap-1.5 ${compact ? 'px-2 py-0.5 text-[9px]' : 'px-3 py-1 text-sm'} font-black bg-amber-500/10 text-amber-600 border border-amber-500/20 rounded-lg uppercase tracking-widest`}>
                No Hallado
            </span>
        );
    } else if (estatusSAT === 'Error Conexión') {
        badges.push(
            <span key="sat-err" className={`inline-flex items-center gap-1.5 ${compact ? 'px-2 py-0.5 text-[9px]' : 'px-3 py-1 text-sm'} font-black bg-slate-500/10 text-slate-500 border border-slate-500/20 rounded-lg uppercase tracking-widest`}>
                Error SAT
            </span>
        );
    }

    // 2. Blacklists
    if (rfcEmisorBlacklist?.found) {
        if (rfcEmisorBlacklist.is69B) {
            badges.push(
                <span key="efos-69b" className={`inline-flex items-center gap-1.5 ${compact ? 'px-2 py-0.5 text-[9px]' : 'px-3 py-1 text-sm'} font-black bg-indigo-600 text-white rounded-lg uppercase tracking-widest shadow-lg shadow-indigo-500/20`} title={`Emisor en 69-B: ${rfcEmisorBlacklist.situacion}`}>
                    ⚠️ 69-B
                </span>
            );
        } else if (rfcEmisorBlacklist.isEFOS) {
            badges.push(
                <span key="efos-list" className={`inline-flex items-center gap-1.5 ${compact ? 'px-2 py-0.5 text-[9px]' : 'px-3 py-1 text-sm'} font-black bg-orange-500/10 text-orange-600 border border-orange-500/20 rounded-lg uppercase tracking-widest`} title="Emisor en lista EFOS">
                    EFOS
                </span>
            );
        }
    }

    if (rfcReceptorBlacklist?.found && rfcReceptorBlacklist.is69B) {
        badges.push(
            <span key="rec-69b" className={`inline-flex items-center gap-1.5 ${compact ? 'px-2 py-0.5 text-[9px]' : 'px-3 py-1 text-sm'} font-black bg-purple-500/10 text-purple-600 border border-purple-500/20 rounded-lg uppercase tracking-widest`} title="Receptor en 69-B">
                Rec-69B
            </span>
        );
    }

    // Layout Compacto (Tabla)
    if (compact) {
        return <div className="flex flex-wrap gap-1">{badges}</div>;
    }

    // Layout Detallado (Card)
    return (
        <div className="space-y-4">
            {/* Banner Principal de SAT */}
            {estatusSAT === 'Cancelado' ? (
                <div className="flex gap-4 p-4 bg-red-50 border-2 border-red-500 rounded-lg text-red-900 shadow-sm">
                    <div className="text-3xl">🚫</div>
                    <div className="flex-1">
                        <h3 className="text-lg font-bold mb-1">CFDI CANCELADO</h3>
                        <p className="text-xs mb-2">No tiene efectos fiscales.</p>
                        {estatusCancelacion && (
                            <p className="text-xs bg-red-100 p-1.5 rounded inline-block">
                                <strong>Estado:</strong> {estatusCancelacion}
                            </p>
                        )}
                    </div>
                </div>
            ) : estatusSAT === 'No Encontrado' ? (
                <div className="flex items-center gap-3 p-4 bg-yellow-50 border-2 border-yellow-500 rounded-lg text-yellow-900 shadow-sm">
                    <span className="text-xl">⚠️</span>
                    <div>
                        <strong className="block font-bold">No encontrado en SAT</strong>
                        <p className="text-sm opacity-90">Puede ser reciente (tarda hasta 72h) o apócrifo.</p>
                    </div>
                </div>
            ) : estatusSAT === 'Vigente' ? (
                <div className="flex items-center gap-3 p-4 bg-emerald-50 border-2 border-emerald-500 rounded-lg text-emerald-800 font-bold shadow-sm">
                    <span className="text-xl">✅</span>
                    <span>CFDI Vigente en SAT</span>
                </div>
            ) : null}

            {/* Sección de Listas Negras si hay hallazgos */}
            {((rfcEmisorBlacklist?.found) || (rfcReceptorBlacklist?.found)) && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                    <h4 className="text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">Validación de Listas Negras (EFOS / 69-B)</h4>

                    <div className="space-y-2">
                        {rfcEmisorBlacklist?.found && (
                            <div className={`flex items-start gap-3 p-3 rounded-md border ${rfcEmisorBlacklist.is69B ? 'bg-red-50 border-red-200' : 'bg-orange-50 border-orange-200'}`}>
                                <span className="text-lg">{rfcEmisorBlacklist.is69B ? '☢️' : '⚠️'}</span>
                                <div>
                                    <p className="font-bold text-sm text-slate-900">RFC Emisor Detectado: {rfcEmisorBlacklist.rfc}</p>
                                    <p className="text-xs text-slate-700">
                                        {rfcEmisorBlacklist.is69B ? 'LISTADO DEFINITIVO 69-B (Operaciones Inexistentes)' : 'LISTA EFOS (Facturera)'}
                                    </p>
                                    {rfcEmisorBlacklist.situacion && <p className="text-xs font-mono mt-1 text-slate-600 bg-white/50 px-1 rounded inline-block">Situación: {rfcEmisorBlacklist.situacion}</p>}
                                    {rfcEmisorBlacklist.razonSocial && <p className="text-xs text-slate-500 mt-1">{rfcEmisorBlacklist.razonSocial}</p>}
                                </div>
                            </div>
                        )}

                        {rfcReceptorBlacklist?.found && (
                            <div className="flex items-start gap-3 p-3 rounded-md border bg-purple-50 border-purple-200">
                                <span className="text-lg">⚠️</span>
                                <div>
                                    <p className="font-bold text-sm text-slate-900">RFC Receptor en Observación</p>
                                    <p className="text-xs text-slate-700">El receptor ({rfcReceptorBlacklist.rfc}) aparece en listas del SAT.</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
