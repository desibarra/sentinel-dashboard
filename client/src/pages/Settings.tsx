import { BlacklistManager } from "@/components/BlacklistManager";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";

export default function Settings() {
    const [_, setLocation] = useLocation();

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4 md:p-8">
            <div className="max-w-4xl mx-auto">
                <div className="mb-6 flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setLocation("/")}
                        className="hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full"
                    >
                        <ArrowLeft className="w-6 h-6 text-slate-700 dark:text-slate-300" />
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Configuración</h1>
                        <p className="text-slate-500 dark:text-slate-400">Verificar y actualizar listas negras del SAT</p>
                    </div>
                </div>

                <BlacklistManager />
            </div>
        </div>
    );
}
