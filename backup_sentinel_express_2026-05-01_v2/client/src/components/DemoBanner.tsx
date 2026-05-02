import { AlertTriangle, Clock, X } from "lucide-react";
import { useState } from "react";
import { DemoToken } from "@/config/tokenConfig";
import { clearDemoSession } from "@/utils/tokenValidator";

interface DemoBannerProps {
    tokenData: DemoToken;
    daysRemaining: number;
    expiryDateFormatted: string;
    onExit?: () => void;
}

export default function DemoBanner({ tokenData, daysRemaining, expiryDateFormatted, onExit }: DemoBannerProps) {
    const [dismissed, setDismissed] = useState(false);

    if (dismissed) return null;

    const isUrgent = daysRemaining <= 5;
    const isExpiringSoon = daysRemaining <= 15;

    const handleExit = () => {
        clearDemoSession();
        if (onExit) onExit();
        window.location.href = "/login";
    };

    return (
        <div
            className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between gap-4 px-4 py-2.5 text-sm font-medium shadow-lg ${isUrgent
                    ? "bg-red-600 text-white"
                    : isExpiringSoon
                        ? "bg-amber-500 text-amber-950"
                        : "bg-[#0B2340] text-white"
                }`}
            style={{ backdropFilter: "blur(8px)" }}
        >
            {/* Icono + Texto principal */}
            <div className="flex items-center gap-3 min-w-0">
                {isUrgent ? (
                    <AlertTriangle className="h-4 w-4 shrink-0 animate-pulse" />
                ) : (
                    <Clock className="h-4 w-4 shrink-0" />
                )}
                <span className="font-black uppercase tracking-wider text-xs">
                    MODO DEMO
                </span>
                <span className="hidden sm:inline text-xs opacity-80">|</span>
                <span className="hidden sm:inline text-xs truncate">
                    {isUrgent
                        ? `⚠️ ¡Acceso expira en ${daysRemaining} día${daysRemaining !== 1 ? "s" : ""}!`
                        : daysRemaining === 0
                            ? "⚠️ ¡El acceso expira HOY!"
                            : `Válido hasta: ${expiryDateFormatted} · ${daysRemaining} días restantes`}
                </span>
            </div>

            {/* Info del cliente en mobile */}
            <span className="sm:hidden text-xs opacity-80 truncate">
                {daysRemaining <= 0 ? "Expira HOY" : `${daysRemaining}d restantes`}
            </span>

            {/* Acciones */}
            <div className="flex items-center gap-3 shrink-0">
                <span className="hidden md:inline text-xs opacity-70">
                    Licencia: {tokenData.label}
                </span>
                <button
                    onClick={handleExit}
                    title="Salir del modo demo"
                    className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs opacity-70 hover:opacity-100 hover:bg-white/20 transition-all"
                >
                    <X className="h-3 w-3" />
                    <span className="hidden sm:inline">Salir</span>
                </button>
                <button
                    onClick={() => setDismissed(true)}
                    title="Ocultar banner"
                    className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs opacity-70 hover:opacity-100 hover:bg-white/20 transition-all"
                >
                    <span>×</span>
                </button>
            </div>
        </div>
    );
}
