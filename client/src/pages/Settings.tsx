import { BlacklistManager } from "@/components/BlacklistManager";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Users } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";

export default function Settings() {
    const [_, setLocation] = useLocation();
    const { user, logout } = useAuth();

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

                {user?.role === "admin" && (
                    <div className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center">
                        <div>
                            <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                <Users className="w-5 h-5 text-indigo-500" />
                                Control de Accesos
                            </h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400">Ver y administrar los usuarios de la plataforma</p>
                        </div>
                        <Button variant="outline" onClick={() => setLocation("/users")} className="border-indigo-200 text-indigo-600 hover:bg-indigo-50 dark:border-indigo-900 dark:text-indigo-400 dark:hover:bg-indigo-900/30">
                            Administrar Usuarios
                        </Button>
                    </div>
                )}

                <div className="mt-8 pt-8 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center">
                    <div>
                        <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100">Sesión</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Cierra tu sesión en Sentinel</p>
                    </div>
                    <Button variant="destructive" onClick={logout}>
                        Cerrar Sesión
                    </Button>
                </div>
            </div>
        </div>
    );
}
