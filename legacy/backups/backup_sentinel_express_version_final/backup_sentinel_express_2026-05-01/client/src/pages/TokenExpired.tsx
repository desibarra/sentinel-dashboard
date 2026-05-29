import { ShieldOff, ArrowLeft } from "lucide-react";

export default function TokenExpired() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4">
            <div className="w-full max-w-md text-center space-y-6 bg-white dark:bg-zinc-900 p-10 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800">
                <div className="mx-auto w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                    <ShieldOff className="w-8 h-8 text-red-500" />
                </div>

                <div>
                    <h1 className="text-2xl font-black text-[#0B2340] dark:text-zinc-50 uppercase tracking-tighter">
                        Acceso Expirado
                    </h1>
                    <p className="mt-3 text-sm text-slate-500 dark:text-zinc-400 leading-relaxed">
                        El período de prueba para este enlace ha concluido.
                        Para continuar usando Sentinel Express Pro, contacta a tu asesor de Mentores Estratégicos.
                    </p>
                </div>

                <div className="bg-[#0B2340]/5 dark:bg-white/5 rounded-xl p-4 text-left space-y-1">
                    <p className="text-xs font-black uppercase tracking-widest text-[#0B2340] dark:text-zinc-300">
                        ¿Listo para la versión completa?
                    </p>
                    <p className="text-xs text-slate-500 dark:text-zinc-400">
                        📧 contacto@mentoresestrategicos.com<br />
                        💼 Sentinel Express Pro — Auditoría Fiscal Avanzada
                    </p>
                </div>

                <a
                    href="/login"
                    className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-[#0B2340] dark:hover:text-white transition-colors uppercase tracking-widest"
                >
                    <ArrowLeft className="w-3 h-3" />
                    Ir al login
                </a>
            </div>
        </div>
    );
}
