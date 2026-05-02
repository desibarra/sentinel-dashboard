import React, { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield } from "lucide-react";
import { toast } from "sonner";

export default function Login() {
    const [, setLocation] = useLocation();
    const { login } = useAuth();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        // Simulamos un retraso de red para mejor UX
        await new Promise(resolve => setTimeout(resolve, 800));

        try {
            // MOCK LOGIN: Solo admin/admin123
            if (username === "admin" && password === "admin123") {
                const mockUser = {
                    id: "local-admin-id",
                    username: "admin",
                    role: "admin"
                };
                login(mockUser);
                setLocation("/dashboard");
                toast.success("¡Bienvenido a Sentinel Express (Modo Local)!");
            } else {
                toast.error("Credenciales incorrectas (Solo admin/admin123 en este modo)");
            }
        } catch (error) {
            toast.error("Error al iniciar sesión local");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4">
            <div className="w-full max-w-md space-y-8 bg-white dark:bg-zinc-900 p-8 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800">
                <div className="text-center">
                    <div className="mx-auto w-12 h-12 bg-[#0B2340] dark:bg-indigo-900/50 rounded-full flex items-center justify-center mb-4">
                        <Shield className="w-6 h-6 text-accent" />
                    </div>
                    <h1 className="text-3xl font-black tracking-tighter text-[#0B2340] dark:text-zinc-50 uppercase">
                        SENTINEL<span className="text-accent">AUTH</span>
                    </h1>
                    <p className="mt-2 text-xs font-bold text-slate-400 dark:text-zinc-400 uppercase tracking-widest">
                        Ingresa a tu dashboard de auditoría fiscal
                    </p>
                </div>

                <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="username" className="text-[10px] font-black uppercase tracking-widest text-slate-500">Usuario</Label>
                            <Input
                                id="username"
                                name="username"
                                type="text"
                                required
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                autoComplete="username"
                                autoFocus
                                className="rounded-xl border-slate-200 focus:ring-accent"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="password" className="text-[10px] font-black uppercase tracking-widest text-slate-500">Contraseña</Label>
                            <Input
                                id="password"
                                name="password"
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoComplete="current-password"
                                className="rounded-xl border-slate-200 focus:ring-accent"
                            />
                        </div>
                    </div>

                    <Button type="submit" className="w-full bg-[#0B2340] hover:bg-[#1E3A8A] text-white font-black uppercase tracking-tighter py-6 rounded-xl shadow-lg ring-offset-2 focus:ring-2 focus:ring-[#0B2340]" disabled={loading}>
                        {loading ? "Verificando..." : "Ingresar al Tablero"}
                    </Button>

                    <div className="mt-4 text-center">
                        <p className="text-[9px] font-medium text-slate-400 uppercase tracking-widest">
                            © 2026 Mentores Estratégicos | Seguridad Local Activa
                        </p>
                    </div>
                </form>
            </div>
        </div>
    );
}
