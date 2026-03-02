import { useState, useEffect } from "react";
import { jsonbinService, ManagedToken } from "@/services/jsonbinService";
import { Shield, Plus, Trash2, ToggleLeft, ToggleRight, Copy, Check, LogOut, RefreshCw, AlertTriangle, Key } from "lucide-react";
import { toast } from "sonner";

const MASTER_PASSWORD = import.meta.env.VITE_ADMIN_TOKENS_PASSWORD || "Mentores2026!";

function formatDate(dateStr: string): string {
    return new Date(dateStr + "T00:00:00").toLocaleDateString("es-MX", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

function daysUntil(dateStr: string): number {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const expiry = new Date(dateStr + "T00:00:00");
    return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export default function AdminTokens() {
    const [authenticated, setAuthenticated] = useState(false);
    const [password, setPassword] = useState("");
    const [pwError, setPwError] = useState(false);

    const [tokens, setTokens] = useState<ManagedToken[]>([]);
    const [loading, setLoading] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    // Form para nuevo token
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({
        token: "",
        label: "",
        expiresAt: "",
        demoCompanyName: "Empresa Demo SA de CV",
        demoCompanyRFC: "AAA010101AAA",
    });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (authenticated) loadTokens();
    }, [authenticated]);

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        if (password === MASTER_PASSWORD) {
            setAuthenticated(true);
            setPwError(false);
        } else {
            setPwError(true);
        }
    };

    const loadTokens = async () => {
        setLoading(true);
        try {
            const tokens = await jsonbinService.getTokens();
            setTokens(tokens);
        } catch (err) {
            toast.error("Error al conectar con JSONBin. Verifica la API Key.");
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.token || !form.label || !form.expiresAt) {
            toast.error("Completa todos los campos requeridos.");
            return;
        }
        setSaving(true);
        try {
            const newToken = await jsonbinService.createToken({
                ...form,
                active: true,
            });
            setTokens(prev => [...prev, newToken]);
            setForm({ token: "", label: "", expiresAt: "", demoCompanyName: "Empresa Demo SA de CV", demoCompanyRFC: "AAA010101AAA" });
            setShowForm(false);
            toast.success("¡Token creado exitosamente!");
        } catch (err) {
            toast.error("Error al crear el token. Intenta de nuevo.");
        } finally {
            setSaving(false);
        }
    };

    const handleToggle = async (id: string, currentActive: boolean) => {
        try {
            await jsonbinService.toggleToken(id, !currentActive);
            setTokens(prev => prev.map(t => t.id === id ? { ...t, active: !currentActive } : t));
            toast.success(currentActive ? "Token desactivado." : "Token activado.");
        } catch {
            toast.error("Error al cambiar el estado del token.");
        }
    };

    const handleDelete = async (id: string, tokenCode: string) => {
        if (!confirm(`¿Eliminar el token "${tokenCode}" permanentemente?`)) return;
        try {
            await jsonbinService.deleteToken(id);
            setTokens(prev => prev.filter(t => t.id !== id));
            toast.success("Token eliminado.");
        } catch {
            toast.error("Error al eliminar el token.");
        }
    };

    const copyLink = (tokenCode: string, id: string) => {
        const url = `${window.location.origin}/?token=${tokenCode}`;
        navigator.clipboard.writeText(url);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
        toast.success("Link copiado al portapapeles.");
    };

    const generateTokenCode = () => {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        const code = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
        setForm(f => ({ ...f, token: code }));
    };

    // --- PANTALLA DE LOGIN ---
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
                        <p className="text-xs text-zinc-400 uppercase tracking-widest">Acceso restringido · Tokens de Demo</p>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                            <input
                                type="password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="Contraseña maestra"
                                autoFocus
                                className={`w-full px-4 py-3 rounded-xl bg-zinc-800 border text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-yellow-400 ${pwError ? "border-red-500" : "border-zinc-700"
                                    }`}
                            />
                            {pwError && <p className="text-xs text-red-400 mt-1">Contraseña incorrecta.</p>}
                        </div>
                        <button
                            type="submit"
                            className="w-full py-3 bg-yellow-400 hover:bg-yellow-300 text-zinc-950 font-black uppercase tracking-tighter rounded-xl transition-all"
                        >
                            Acceder al Panel
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    // --- PANEL PRINCIPAL ---
    return (
        <div className="min-h-screen bg-zinc-950 text-white">
            {/* Header */}
            <div className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur sticky top-0 z-10">
                <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Shield className="w-5 h-5 text-yellow-400" />
                        <div>
                            <h1 className="text-sm font-black uppercase tracking-tighter text-white">Panel de Tokens de Demo</h1>
                            <p className="text-xs text-zinc-400">Sentinel Express Pro · Mentores Estratégicos</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={loadTokens}
                            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
                            title="Recargar"
                        >
                            <RefreshCw className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setAuthenticated(false)}
                            className="p-2 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition-all"
                            title="Cerrar sesión"
                        >
                            <LogOut className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
                {/* Botón crear */}
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm text-zinc-400">{tokens.length} token{tokens.length !== 1 ? "s" : ""} registrado{tokens.length !== 1 ? "s" : ""}</p>
                    </div>
                    <button
                        onClick={() => setShowForm(!showForm)}
                        className="flex items-center gap-2 px-4 py-2 bg-yellow-400 hover:bg-yellow-300 text-zinc-950 font-black uppercase text-xs tracking-tighter rounded-xl transition-all"
                    >
                        <Plus className="w-4 h-4" />
                        Nuevo Token
                    </button>
                </div>

                {/* Formulario nuevo token */}
                {showForm && (
                    <form onSubmit={handleCreate} className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 space-y-4">
                        <h2 className="text-sm font-black uppercase text-yellow-400 tracking-widest">Crear Nuevo Token</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-xs text-zinc-400 uppercase tracking-widest">Código del token *</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={form.token}
                                        onChange={e => setForm(f => ({ ...f, token: e.target.value.toUpperCase().replace(/\s/g, "") }))}
                                        placeholder="Ej: CLIENTE2026"
                                        required
                                        className="flex-1 px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-yellow-400 font-mono"
                                    />
                                    <button type="button" onClick={generateTokenCode} className="px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white text-xs transition-all" title="Generar aleatorio">
                                        🎲
                                    </button>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-zinc-400 uppercase tracking-widest">Etiqueta / Cliente *</label>
                                <input
                                    type="text"
                                    value={form.label}
                                    onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                                    placeholder="Ej: Empresa ABC - Demo"
                                    required
                                    className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-zinc-400 uppercase tracking-widest">Fecha de expiración *</label>
                                <input
                                    type="date"
                                    value={form.expiresAt}
                                    onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))}
                                    required
                                    min={new Date().toISOString().split("T")[0]}
                                    className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-zinc-400 uppercase tracking-widest">Empresa de demo</label>
                                <input
                                    type="text"
                                    value={form.demoCompanyName}
                                    onChange={e => setForm(f => ({ ...f, demoCompanyName: e.target.value }))}
                                    className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
                                />
                            </div>
                        </div>
                        {form.token && (
                            <div className="bg-zinc-800/50 rounded-lg px-4 py-2 text-xs text-zinc-400">
                                Link generado: <span className="text-yellow-300 font-mono">{window.location.origin}/?token={form.token}</span>
                            </div>
                        )}
                        <div className="flex justify-end gap-3">
                            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-xs text-zinc-400 hover:text-white transition-all">Cancelar</button>
                            <button type="submit" disabled={saving} className="px-5 py-2 bg-yellow-400 hover:bg-yellow-300 text-zinc-950 font-black uppercase text-xs tracking-tighter rounded-xl transition-all disabled:opacity-50">
                                {saving ? "Guardando..." : "Crear Token"}
                            </button>
                        </div>
                    </form>
                )}

                {/* Lista de tokens */}
                {loading ? (
                    <div className="text-center py-16 text-zinc-500">
                        <div className="w-8 h-8 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                        <p className="text-xs uppercase tracking-widest">Cargando tokens...</p>
                    </div>
                ) : tokens.length === 0 ? (
                    <div className="text-center py-16 space-y-3 border-2 border-dashed border-zinc-800 rounded-2xl">
                        <Key className="w-10 h-10 text-zinc-700 mx-auto" />
                        <p className="text-sm text-zinc-500">No hay tokens creados todavía.</p>
                        <button onClick={() => setShowForm(true)} className="text-xs text-yellow-400 hover:underline">+ Crear el primero</button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {tokens.map(token => {
                            const days = daysUntil(token.expiresAt);
                            const expired = days < 0;
                            const urgent = days >= 0 && days <= 5;
                            return (
                                <div key={token.id} className={`bg-zinc-900 border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-4 transition-all ${!token.active ? "border-zinc-800 opacity-50" : expired ? "border-red-900" : urgent ? "border-amber-800" : "border-zinc-700"
                                    }`}>
                                    {/* Info */}
                                    <div className="flex-1 min-w-0 space-y-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-mono font-black text-yellow-300 text-sm">{token.token}</span>
                                            {!token.active && <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">Inactivo</span>}
                                            {expired && <span className="text-xs bg-red-900/50 text-red-400 px-2 py-0.5 rounded-full flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Expirado</span>}
                                            {!expired && urgent && <span className="text-xs bg-amber-900/50 text-amber-400 px-2 py-0.5 rounded-full">⚠️ Expira en {days}d</span>}
                                            {!expired && !urgent && token.active && <span className="text-xs bg-green-900/30 text-green-400 px-2 py-0.5 rounded-full">✓ {days}d restantes</span>}
                                        </div>
                                        <p className="text-sm text-white font-medium truncate">{token.label}</p>
                                        <p className="text-xs text-zinc-500">Expira: {formatDate(token.expiresAt)} · Creado: {new Date(token.createdAt).toLocaleDateString("es-MX")}</p>
                                    </div>

                                    {/* Acciones */}
                                    <div className="flex items-center gap-2 shrink-0">
                                        <button
                                            onClick={() => copyLink(token.token, token.id)}
                                            title="Copiar link"
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs text-zinc-300 hover:text-white transition-all"
                                        >
                                            {copiedId === token.id ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                                            {copiedId === token.id ? "Copiado" : "Link"}
                                        </button>
                                        <button
                                            onClick={() => handleToggle(token.id, token.active)}
                                            title={token.active ? "Desactivar" : "Activar"}
                                            className="p-1.5 rounded-lg hover:bg-zinc-800 transition-all"
                                        >
                                            {token.active
                                                ? <ToggleRight className="w-5 h-5 text-green-400" />
                                                : <ToggleLeft className="w-5 h-5 text-zinc-500" />
                                            }
                                        </button>
                                        <button
                                            onClick={() => handleDelete(token.id, token.token)}
                                            title="Eliminar"
                                            className="p-1.5 rounded-lg hover:bg-red-900/30 text-zinc-500 hover:text-red-400 transition-all"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
