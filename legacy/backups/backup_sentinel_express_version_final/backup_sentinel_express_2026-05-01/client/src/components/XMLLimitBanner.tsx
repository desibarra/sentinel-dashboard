import { MessageCircle, TrendingUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

const WHATSAPP_NUMBER = "524776355734";
const WHATSAPP_MESSAGE = encodeURIComponent(
    "Hola, estoy probando la herramienta Sentinel Express para revisar mis CFDI. Me gustar\u00eda conocer m\u00e1s sobre c\u00f3mo interpretar el diagn\u00f3stico que genera la plataforma."
);
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${WHATSAPP_MESSAGE}`;

interface XMLLimitBannerProps {
    /** true = mostrar el modal de límite alcanzado, false = solo el botón comercial */
    limitReached?: boolean;
}

export default function XMLLimitBanner({ limitReached = false }: XMLLimitBannerProps) {
    const [dismissed, setDismissed] = useState(false);

    const handleWhatsApp = () => {
        window.open(WHATSAPP_URL, "_blank", "noopener,noreferrer");
    };

    // ── Botón comercial flotante (siempre visible mientras no se descarte) ──
    if (!limitReached) {
        if (dismissed) return null;
        return (
            <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4 fade-in duration-500">
                <div className="relative bg-[#0B2340] text-white rounded-2xl shadow-2xl border border-white/10 p-4 flex items-center gap-3 max-w-xs">
                    <button
                        onClick={() => setDismissed(true)}
                        className="absolute top-2 right-2 text-white/50 hover:text-white/90 transition-colors"
                        aria-label="Cerrar"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                    <div className="p-2 bg-[#F9C646] rounded-xl flex-shrink-0">
                        <TrendingUp className="w-5 h-5 text-[#0B2340]" />
                    </div>
                    <div>
                        <p className="text-xs font-black uppercase tracking-tight leading-tight">
                            ¿Necesitas un diagnóstico fiscal profesional?
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">Hablemos por WhatsApp</p>
                    </div>
                    <Button
                        onClick={handleWhatsApp}
                        size="sm"
                        className="bg-[#25D366] hover:bg-[#1ebe5e] text-white font-black rounded-xl px-3 py-2 text-[10px] uppercase tracking-tight flex-shrink-0 gap-1.5 shadow-lg"
                    >
                        <MessageCircle className="w-3.5 h-3.5" />
                        Chat
                    </Button>
                </div>
            </div>
        );
    }

    // ── Modal de límite alcanzado ──
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-700 p-8 max-w-md w-full text-center animate-in zoom-in-95 duration-300">
                {/* Icon */}
                <div className="mx-auto w-16 h-16 bg-[#F9C646]/10 rounded-2xl flex items-center justify-center mb-5 border border-[#F9C646]/20">
                    <TrendingUp className="w-8 h-8 text-[#0B2340] dark:text-[#F9C646]" />
                </div>

                <h2 className="text-2xl font-black text-[#0B2340] dark:text-white uppercase tracking-tighter mb-2">
                    Límite gratuito alcanzado
                </h2>

                <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed mb-6">
                    Has alcanzado el límite gratuito de Sentinel Express.
                    Si deseas continuar analizando CFDI o recibir un{" "}
                    <strong>diagnóstico fiscal completo</strong>, contáctanos.
                </p>

                {/* Stats */}
                <div className="bg-[#0B2340]/5 dark:bg-white/5 rounded-2xl p-4 mb-6 border border-[#0B2340]/10 dark:border-white/10">
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1">
                        XMLs procesados
                    </p>
                    <p className="text-3xl font-black text-[#0B2340] dark:text-white">200 / 200</p>
                    <p className="text-[10px] text-slate-400 mt-1">Plan gratuito agotado</p>
                </div>

                {/* CTA WhatsApp */}
                <Button
                    onClick={handleWhatsApp}
                    className="w-full bg-[#25D366] hover:bg-[#1ebe5e] text-white font-black uppercase tracking-tighter py-5 rounded-xl shadow-lg gap-2 text-sm"
                >
                    <MessageCircle className="w-5 h-5" />
                    Solicitar asesoría
                </Button>

                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-4">
                    Mentores Estratégicos · Diagnóstico Fiscal Profesional
                </p>
            </div>
        </div>
    );
}
