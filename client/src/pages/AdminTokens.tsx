import { useState, useEffect } from "react";
import { tokenService, TokenData, TokenStatus } from "@/services/tokenService";
import { Shield, Search, Copy, Check, LogOut, RefreshCw, AlertTriangle, Key, Play, Pause, Clock, Trash2 } from "lucide-react";
import { toast } from "sonner";

function formatDate(dateStr?: string): string {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("es-MX", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

function daysUntil(dateStr?: string): number {
    if (!dateStr) return 0;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const expiry = new Date(dateStr);
    return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export default function AdminTokens() {
    const [authenticated, setAuthenticated] = useState(false);
    const [password, setPassword] = useState("");
    const [pwError, setPwError] = useState(false);
    const [loginErrorMsg, setLoginErrorMsg] = useState("");

    const [tokens, setTokens] = useState<TokenData[]>([]);
    const [loading, setLoading] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [search, setSearch] = useState("");

    useEffect(() => {
        if (authenticated) loadTokens();
    }, [authenticated]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setPwError(false);
        setLoginErrorMsg("");
        try {
            const data = await tokenService.getTokens(password);
            setAuthenticated(true);
            if (data.blobError) {
                toast.error("Error al conectar con la base de accesos (Blobs).");
            }
            setTokens(data.tokens || []);
        } catch (err: any) {
            setPwError(true);
            if (err.code === "INVALID_PASSWORD") {
                setLoginErrorMsg("Contraseña incorrecta.");
            } else if (err.code === "MISSING_ADMIN_PASSWORD") {
                setLoginErrorMsg("Falta ADMIN_TOKENS_PASSWORD en Netlify.");
            } else {
                setLoginErrorMsg("Error de conexión al verificar credenciales.");
            }
        } finally {
            setLoading(false);
        }
    };

    const loadTokens = async () => {
        setLoading(true);
        try {
            const data = await tokenService.getTokens(password);
            if (data.blobError) {
                toast.error("Error de conexión con la base de accesos de Blobs.");
            }
            // Ordenar pendientes primero, luego activos
            const tokensList = data.tokens || [];
            const sorted = tokensList.sort((a, b) => {
                if (a.status === 'pending' && b.status !== 'pending') return -1;
                if (a.status !== 'pending' && b.status === 'pending') return 1;
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            });
            setTokens(sorted);
        } catch (err) {
            toast.error("Error al conectar con el servidor.");
            setAuthenticated(false);
        } finally {
            setLoading(false);
        }
    };

    const handleAction = async (id: string, action: 'activate' | 'suspend' | 'reactivate' | 'expire' | 'extend' | 'delete', days: number = 30) => {
        if (action === 'delete' && !confirm(`¿Eliminar el token permanentemente?`)) return;
        try {
            const res = await tokenService.updateTokenAction(id, action, days, password);
            if (action === 'delete') {
                setTokens(prev => prev.filter(t => t.id !== id));
                toast.success("Token eliminado.");
            } else if (res.token) {
                setTokens(prev => prev.map(t => t.id === id ? res.token! : t));
                toast.success("Estado actualizado.");
            }
        } catch (e: any) {
            toast.error("Error al actualizar el token.");
        }
    };

    const copyLink = (tokenCode: string, id: string) => {
        const url = `${window.location.origin}/acceso?token=${tokenCode}`;
        navigator.clipboard.writeText(url);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
        toast.success("Link copiado.");
    };

    if (!authenticated) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-4">
                <div className="w-full max-w-sm space-y-6 bg-zinc-900 p-8 rounded-2xl shadow-2xl border border-zinc-800">
                    <div className="text-center space-y-2">
                        <div className="mx-auto w-12 h-12 bg-yellow-500/10 rounded-full flex items-center justify-center">
                            <Key className="w-6 h-6 text-yellow-400" />
                        </div>
                        <h1 className="text-xl font-black text-white uppercase tracking-tighter">
                            Panel <span className="text-yellow-400">Admin</span>
                        </h1>
                        <p className="text-xs text-zinc-400 uppercase tracking-widest">Gestión de Accesos Reales</p>
                    </div>
                    <form onSubmit={handleLogin} className="space-y-4">
                        <input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="Contraseña maestra"
                            autoFocus
                            className="w-full px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm"
                        />
                        {pwError && <p className="text-xs text-red-400 mt-1">{loginErrorMsg}</p>}
                        <button type="submit" disabled={loading} className="w-full py-3 bg-yellow-400 hover:bg-yellow-300 text-zinc-950 font-black uppercase tracking-tighter rounded-xl">
                            {loading ? "Verificando..." : "Acceder"}
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    const filteredTokens = tokens.filter(t => {
        const term = search.toLowerCase();
        return t.name?.toLowerCase().includes(term) ||
            t.company?.toLowerCase().includes(term) ||
            t.email?.toLowerCase().includes(term) ||
            t.phone?.includes(term) ||
            t.id.toLowerCase().includes(term);
    });

    const getStatusChip = (status: TokenStatus) => {
        const styles = {
            pending: "bg-blue-900/50 text-blue-400 border border-blue-800/50",
            active: "bg-green-900/50 text-green-400 border border-green-800/50",
            suspended: "bg-amber-900/50 text-amber-400 border border-amber-800/50",
            expired: "bg-red-900/50 text-red-400 border border-red-800/50",
        };
        const labels = {
            pending: "Pendiente",
            active: "Activo",
            suspended: "Suspendido",
            expired: "Vencido"
        };
        return <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${styles[status]}`}>{labels[status]}</span>;
    };

    return (
        <div className="min-h-screen bg-zinc-950 text-white">
            <div className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur sticky top-0 z-10">
                <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Shield className="w-5 h-5 text-yellow-400" />
                        <div>
                            <h1 className="text-sm font-black uppercase tracking-tighter">Panel de Accesos (Netlify Blobs)</h1>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={loadTokens} className="p-2 rounded-lg text-zinc-400 hover:text-white transition-all"><RefreshCw className="w-4 h-4" /></button>
                        <button onClick={() => setAuthenticated(false)} className="p-2 rounded-lg text-zinc-400 hover:text-red-400 transition-all"><LogOut className="w-4 h-4" /></button>
                    </div>
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
                <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-3 text-zinc-500" />
                    <input 
                        type="text" 
                        placeholder="Buscar por nombre, empresa, correo, teléfono o token..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-yellow-400 focus:outline-none text-white placeholder-zinc-500"
                    />
                </div>

                <div className="space-y-3">
                    {filteredTokens.length === 0 ? (
                        <p className="text-center text-zinc-500 py-10">No hay tokens encontrados.</p>
                    ) : (
                        filteredTokens.map(token => {
                            const days = daysUntil(token.expiresAt);
                            const isUrgent = days >= 0 && days <= 5;
                            return (
                                <div key={token.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-4 hover:border-zinc-700 transition-colors">
                                    <div className="flex-1 space-y-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap mb-1">
                                            <span className="font-mono font-black text-yellow-300 text-sm tracking-widest bg-yellow-400/10 px-2 py-0.5 rounded">{token.id}</span>
                                            {getStatusChip(token.status)}
                                            {token.status === 'active' && <span className={`text-xs px-2 py-0.5 rounded-full ${isUrgent ? 'bg-amber-900/50 text-amber-400' : 'bg-green-900/30 text-green-400'}`}>{days}d restantes</span>}
                                        </div>
                                        <p className="text-sm font-medium">{token.name || "Sin nombre"} <span className="text-zinc-500">({token.company || "Sin empresa"})</span></p>
                                        <p className="text-xs text-zinc-400">{token.email} · {token.phone}</p>
                                        <div className="text-xs text-zinc-600 flex flex-wrap gap-x-4 gap-y-1 mt-2">
                                            <span>Reg: {formatDate(token.createdAt)}</span>
                                            {token.activatedAt && <span>Inició: {formatDate(token.activatedAt)}</span>}
                                            {token.expiresAt && <span>Vence: {formatDate(token.expiresAt)}</span>}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                                        <button onClick={() => copyLink(token.id, token.id)} className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 rounded-lg text-xs hover:bg-zinc-700 transition-colors">
                                            {copiedId === token.id ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />} Link
                                        </button>
                                        
                                        {token.status === 'pending' && (
                                            <button onClick={() => handleAction(token.id, 'activate')} className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 text-zinc-950 font-bold rounded-lg text-xs hover:bg-green-400 transition-colors shadow-[0_0_15px_rgba(34,197,94,0.2)]">
                                                <Play className="w-3 h-3" /> Activar 30d
                                            </button>
                                        )}
                                        {token.status === 'active' && (
                                            <>
                                                <button onClick={() => handleAction(token.id, 'suspend')} className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-900/30 text-amber-400 rounded-lg text-xs hover:bg-amber-900/50 transition-colors">
                                                    <Pause className="w-3 h-3" /> Suspender
                                                </button>
                                                <button onClick={() => handleAction(token.id, 'extend', 15)} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-900/30 text-blue-400 rounded-lg text-xs hover:bg-blue-900/50 transition-colors">
                                                    <Clock className="w-3 h-3" /> +15d
                                                </button>
                                            </>
                                        )}
                                        {token.status === 'suspended' && (
                                            <button onClick={() => handleAction(token.id, 'reactivate')} className="flex items-center gap-1.5 px-3 py-1.5 bg-green-900/30 text-green-400 rounded-lg text-xs hover:bg-green-900/50 transition-colors">
                                                <Play className="w-3 h-3" /> Reactivar
                                            </button>
                                        )}
                                        {(token.status === 'active' || token.status === 'suspended') && (
                                            <button onClick={() => handleAction(token.id, 'expire')} className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 text-zinc-400 rounded-lg text-xs hover:bg-zinc-700 transition-colors">
                                                Vencer
                                            </button>
                                        )}
                                        
                                        <button onClick={() => handleAction(token.id, 'delete')} className="p-1.5 rounded-lg hover:bg-red-900/30 text-zinc-500 hover:text-red-400 transition-colors">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
