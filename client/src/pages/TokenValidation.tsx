import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { tokenService } from "@/services/tokenService";
import { useAuth } from "@/contexts/AuthContext";
import { loadDemoDataIfEmpty } from "@/data/demoData";
import { appDB } from "@/db/appDB";
import { ShieldAlert, Clock, PauseCircle, KeyRound, CheckCircle2 } from "lucide-react";

export default function TokenValidation() {
    const [, setLocation] = useLocation();
    const { login } = useAuth();
    const [status, setStatus] = useState<'checking' | 'pending' | 'suspended' | 'expired' | 'not_found' | 'error' | 'success'>('checking');
    
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const tokenParam = urlParams.get("token");
        
        if (!tokenParam) {
            setStatus('not_found');
            return;
        }

        validate(tokenParam);
    }, []);

    const validate = async (token: string) => {
        try {
            const res = await tokenService.validateToken(token);
            if (!res.valid) {
                setStatus(res.reason as any);
                return;
            }
            
            setStatus('success');
            
            // Login user
            const demoUser = {
                id: "demo-user-" + res.token,
                username: "Demo · " + res.label,
                role: "demo",
            };
            
            const demoToken = {
                token: res.token,
                label: res.label,
                expiresAt: res.expiresAt,
                demoCompanyRFC: res.demoCompanyRFC,
                demoCompanyName: res.demoCompanyName,
            };
            
            login(demoUser, demoToken);
            await loadDemoDataIfEmpty(appDB);
            
            // Redirect to dashboard after a brief delay
            setTimeout(() => {
                setLocation("/dashboard");
            }, 1000);
            
        } catch (err) {
            setStatus('error');
        }
    };

    const StatusContent = () => {
        switch (status) {
            case 'checking':
                return (
                    <div className="space-y-4">
                        <div className="w-12 h-12 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto" />
                        <h2 className="text-xl font-bold text-white">Verificando acceso...</h2>
                        <p className="text-zinc-400">Por favor espera un momento.</p>
                    </div>
                );
            case 'pending':
                return (
                    <div className="space-y-4">
                        <Clock className="w-16 h-16 text-blue-400 mx-auto" />
                        <h2 className="text-2xl font-bold text-white">Acceso en revisión</h2>
                        <p className="text-zinc-400">Tu solicitud fue recibida. Te contactaremos pronto para activar tu prueba de 30 días.</p>
                        <button onClick={() => window.location.href = '/'} className="mt-4 px-6 py-2 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 transition-colors">Regresar al inicio</button>
                    </div>
                );
            case 'suspended':
                return (
                    <div className="space-y-4">
                        <PauseCircle className="w-16 h-16 text-amber-500 mx-auto" />
                        <h2 className="text-2xl font-bold text-white">Acceso suspendido</h2>
                        <p className="text-zinc-400">Tu prueba ha sido pausada temporalmente. Contacta a soporte para más detalles.</p>
                    </div>
                );
            case 'expired':
                return (
                    <div className="space-y-4">
                        <ShieldAlert className="w-16 h-16 text-red-500 mx-auto" />
                        <h2 className="text-2xl font-bold text-white">Prueba finalizada</h2>
                        <p className="text-zinc-400">Tu periodo de 30 días ha concluido. Contacta a tu asesor para continuar usando Sentinel.</p>
                    </div>
                );
            case 'success':
                return (
                    <div className="space-y-4">
                        <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" />
                        <h2 className="text-2xl font-bold text-white">Acceso concedido</h2>
                        <p className="text-zinc-400">Redirigiendo a tu analizador CFDI...</p>
                    </div>
                );
            case 'not_found':
            default:
                return (
                    <div className="space-y-4">
                        <KeyRound className="w-16 h-16 text-zinc-600 mx-auto" />
                        <h2 className="text-2xl font-bold text-white">Token inválido</h2>
                        <p className="text-zinc-400">El enlace proporcionado no es válido o no existe en el sistema.</p>
                        <button onClick={() => window.location.href = '/'} className="mt-4 px-6 py-2 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 transition-colors">Solicitar prueba</button>
                    </div>
                );
        }
    };

    return (
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-8 text-center shadow-2xl">
                <StatusContent />
            </div>
        </div>
    );
}
