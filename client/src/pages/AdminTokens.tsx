import { useState, useEffect, useMemo } from "react";
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
    const [statusFilter, setStatusFilter] = useState<string>('all');

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
                // Primero activos vs no activos
                if (a.status === 'active' && b.status !== 'active') return -1;
                if (a.status !== 'active' && b.status === 'active') return 1;
                
                // Si ambos tienen el mismo estado (ej. ambos activos), ordenar por mayor actividad
                const activityA = (a.satQueriesCount || 0) + (a.dashboardOpensCount || 0) + (a.loginsCount || 0);
                const activityB = (b.satQueriesCount || 0) + (b.dashboardOpensCount || 0) + (b.loginsCount || 0);
                
                if (activityA !== activityB) return activityB - activityA;
                
                // Si la actividad es igual, más recientes primero
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

    const safeTokens = Array.isArray(tokens) ? tokens : [];

    const filteredTokens = useMemo(() => {
        return safeTokens.filter(t => {
            // Filtro por estado
            if (statusFilter !== 'all') {
                if (statusFilter === 'hot') {
                    if (!(t.dashboardOpensCount && t.dashboardOpensCount > 0 && t.satQueriesCount && t.satQueriesCount > 0)) {
                        return false;
                    }
                } else if (t.status !== statusFilter) {
                    return false;
                }
            }

            // Filtro por búsqueda
            const term = search.toLowerCase();
            return t.name?.toLowerCase().includes(term) ||
                t.company?.toLowerCase().includes(term) ||
                t.email?.toLowerCase().includes(term) ||
                t.phone?.includes(term) ||
                t.id.toLowerCase().includes(term);
        });
    }, [safeTokens, statusFilter, search]);

    const stats = useMemo(() => ({
        total: safeTokens.length,
        pending: safeTokens.filter(t => t.status === 'pending').length,
        active: safeTokens.filter(t => t.status === 'active').length,
        suspended: safeTokens.filter(t => t.status === 'suspended').length,
        expired: safeTokens.filter(t => t.status === 'expired').length,
        urgent: safeTokens.filter(t => t.status === 'active' && daysUntil(t.expiresAt) <= 7 && daysUntil(t.expiresAt) >= 0).length,
    }), [safeTokens]);

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

                <div className="flex flex-wrap gap-2 mb-6">
                    <button onClick={() => setStatusFilter('all')} className={`px-3 py-1.5 text-xs font-bold uppercase rounded-lg border ${statusFilter === 'all' ? 'bg-zinc-100 text-zinc-900 border-zinc-100' : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:bg-zinc-800'}`}>Todos</button>
                    <button onClick={() => setStatusFilter('active')} className={`px-3 py-1.5 text-xs font-bold uppercase rounded-lg border ${statusFilter === 'active' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50' : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:bg-zinc-800'}`}>Activos</button>
                    <button onClick={() => setStatusFilter('pending')} className={`px-3 py-1.5 text-xs font-bold uppercase rounded-lg border ${statusFilter === 'pending' ? 'bg-blue-500/20 text-blue-400 border-blue-500/50' : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:bg-zinc-800'}`}>Pendientes</button>
                    <button onClick={() => setStatusFilter('suspended')} className={`px-3 py-1.5 text-xs font-bold uppercase rounded-lg border ${statusFilter === 'suspended' ? 'bg-orange-500/20 text-orange-400 border-orange-500/50' : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:bg-zinc-800'}`}>Suspendidos</button>
                    <button onClick={() => setStatusFilter('expired')} className={`px-3 py-1.5 text-xs font-bold uppercase rounded-lg border ${statusFilter === 'expired' ? 'bg-red-500/20 text-red-400 border-red-500/50' : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:bg-zinc-800'}`}>Vencidos</button>
                    <button onClick={() => setStatusFilter('hot')} className={`px-3 py-1.5 text-xs font-bold uppercase rounded-lg border flex items-center gap-1 ${statusFilter === 'hot' ? 'bg-amber-500/20 text-amber-400 border-amber-500/50' : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:bg-zinc-800'}`}>🔥 Leads Calientes</button>
                </div>

                {/* ── MÉTRICAS GLOBALES ── */}
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
                        <p className="text-[10px] uppercase font-bold text-zinc-500 mb-1">Total Tokens</p>
                        <p className="text-2xl font-black text-white">{stats.total}</p>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
                        <p className="text-[10px] uppercase font-bold text-blue-500 mb-1">Pendientes</p>
                        <p className="text-2xl font-black text-blue-400">{stats.pending}</p>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
                        <p className="text-[10px] uppercase font-bold text-green-500 mb-1">Activos</p>
                        <p className="text-2xl font-black text-green-400">{stats.active}</p>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
                        <p className="text-[10px] uppercase font-bold text-amber-500 mb-1">Suspendidos</p>
                        <p className="text-2xl font-black text-amber-400">{stats.suspended}</p>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
                        <p className="text-[10px] uppercase font-bold text-red-500 mb-1">Vencidos</p>
                        <p className="text-2xl font-black text-red-400">{stats.expired}</p>
                    </div>
                    <div className="bg-orange-950/30 border border-orange-900/50 rounded-xl p-3 text-center">
                        <p className="text-[10px] uppercase font-bold text-orange-500 mb-1">Por Vencer &lt;7d</p>
                        <p className="text-2xl font-black text-orange-400">{stats.urgent}</p>
                    </div>
                </div>

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
                                            {(token.dashboardOpensCount && token.dashboardOpensCount > 0 && token.satQueriesCount && token.satQueriesCount > 0) ? (
                                                <span className="text-[10px] font-black uppercase tracking-widest bg-red-500/20 text-red-400 border border-red-500/50 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm shadow-red-500/10">🔥 Lead Caliente</span>
                                            ) : null}
                                        </div>
                                        <p className="text-sm font-medium">{token.name || "Sin nombre"} <span className="text-zinc-500">({token.company || "Sin empresa"})</span></p>
                                        <div className="text-xs text-zinc-400 flex items-center gap-2">
                                            <span>{token.email} • {token.phone}</span>
                                            {token.phone && (
                                                <button onClick={() => window.open(`https://wa.me/${token.phone.replace(/\D/g, '')}`, "_blank")} className="text-[#25D366] hover:scale-110 transition-transform" title="Contactar por WhatsApp">
                                                    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
                                                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                                                    </svg>
                                                </button>
                                            )}
                                        </div>
                                        <div className="text-xs text-zinc-600 flex flex-wrap gap-x-4 gap-y-1 mt-2">
                                            <span>Reg: {formatDate(token.createdAt)}</span>
                                            {token.activatedAt && <span>Inició: {formatDate(token.activatedAt)}</span>}
                                            {token.expiresAt && <span>Vence: {formatDate(token.expiresAt)}</span>}
                                        </div>
                                        {/* ── TELEMETRÍA ── */}
                                        <div className="text-[10px] text-zinc-500 flex flex-wrap gap-x-3 gap-y-1 mt-1 bg-zinc-950/50 p-2 rounded-lg border border-zinc-800/50">
                                            <span className="flex items-center gap-1"><Key className="w-3 h-3 text-zinc-600"/> Logins: <strong className="text-zinc-300">{token.loginsCount || 0}</strong></span>
                                            <span className="flex items-center gap-1"><Search className="w-3 h-3 text-zinc-600"/> Dashboard Opens: <strong className="text-zinc-300">{token.dashboardOpensCount || 0}</strong></span>
                                            <span className="flex items-center gap-1"><Check className="w-3 h-3 text-zinc-600"/> Consultas SAT: <strong className="text-zinc-300">{token.satQueriesCount || 0}</strong></span>
                                            {token.lastSatQueryAt && <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-zinc-600"/> Último SAT: <span className="text-zinc-400">{formatDate(token.lastSatQueryAt)}</span></span>}
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
