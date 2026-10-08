import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { tokenService, type CreateAccessTokenInput, type TokenData, type TokenStatus } from "@/services/tokenService";
import {
    Activity,
    Building2,
    CalendarClock,
    Check,
    CheckCircle2,
    Clock3,
    Copy,
    Flame,
    KeyRound,
    LogOut,
    MessageCircle,
    MoreHorizontal,
    Pause,
    PauseCircle,
    Play,
    Plus,
    RefreshCw,
    Search,
    Shield,
    Trash2,
    Users,
    X,
} from "lucide-react";
import { toast } from "sonner";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

type FilterKey = "all" | TokenStatus | "hot" | "urgent";

function formatDate(dateStr?: string): string {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("es-MX", {
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

function relativeExpiry(dateStr?: string): string {
    if (!dateStr) return "Sin vencimiento";
    const days = daysUntil(dateStr);
    if (days < 0) return `Venció hace ${Math.abs(days)} ${Math.abs(days) === 1 ? "día" : "días"}`;
    if (days === 0) return "Vence hoy";
    return `En ${days} ${days === 1 ? "día" : "días"}`;
}

function tokenName(token: TokenData): string {
    return token.name || token.fullName || token.nombre || "Sin nombre";
}

function tokenCompany(token: TokenData): string {
    return token.company || token.businessName || token.empresa || token.despacho || "Sin empresa";
}

function tokenPhone(token: TokenData): string {
    return token.phone || token.telefono || "";
}

function isHotLead(token: TokenData): boolean {
    return Boolean(token.dashboardOpensCount && token.dashboardOpensCount > 0 && token.satQueriesCount && token.satQueriesCount > 0);
}

const statusStyles: Record<TokenStatus, { label: string; badge: string; dot: string; border: string }> = {
    pending: {
        label: "Pendiente",
        badge: "border-blue-400/20 bg-blue-400/10 text-blue-300",
        dot: "bg-blue-400",
        border: "#60A5FA",
    },
    active: {
        label: "Activo",
        badge: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
        dot: "bg-emerald-400",
        border: "#10B981",
    },
    suspended: {
        label: "Suspendido",
        badge: "border-amber-400/20 bg-amber-400/10 text-amber-300",
        dot: "bg-amber-400",
        border: "#F5C542",
    },
    expired: {
        label: "Vencido",
        badge: "border-rose-400/20 bg-rose-400/10 text-rose-300",
        dot: "bg-rose-400",
        border: "#FB7185",
    },
};

function StatusBadge({ status }: { status: TokenStatus }) {
    const style = statusStyles[status] ?? statusStyles.pending;
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${style.badge}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
            {style.label}
        </span>
    );
}

function MetricCard({
    label,
    value,
    icon,
    color,
    selected,
    warning,
    onClick,
}: {
    label: string;
    value: number;
    icon: ReactNode;
    color: string;
    selected: boolean;
    warning?: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`group relative min-w-0 rounded-xl border border-white/[0.06] border-l-[3px] p-3.5 text-left transition-colors duration-150 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5C542]/60 ${warning && value > 0 ? "bg-amber-400/[0.08]" : "bg-[#0F2340]"}`}
            style={{ borderLeftColor: color }}
            aria-label={`Filtrar por ${label.toLowerCase()}: ${value}`}
            aria-pressed={selected}
        >
            <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</span>
                <span className="shrink-0" style={{ color }}>{icon}</span>
            </div>
            <span className="mt-1 block text-[32px] font-bold leading-none tracking-tight text-white">{value}</span>
        </button>
    );
}

function TokenSkeleton() {
    return (
        <div className="animate-pulse border-b border-white/[0.06] p-4 last:border-0">
            <div className="flex items-start gap-4">
                <div className="hidden h-10 w-10 rounded-lg bg-white/[0.06] sm:block" />
                <div className="min-w-0 flex-1 space-y-3">
                    <div className="h-4 w-2/5 rounded bg-white/[0.07]" />
                    <div className="h-3 w-3/5 rounded bg-white/[0.05]" />
                </div>
                <div className="h-7 w-24 rounded-full bg-white/[0.06]" />
            </div>
        </div>
    );
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
    const [statusFilter, setStatusFilter] = useState<FilterKey>("all");
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [createLoading, setCreateLoading] = useState(false);
    const [createdToken, setCreatedToken] = useState<TokenData | null>(null);
    const [createForm, setCreateForm] = useState<CreateAccessTokenInput>({
        name: "",
        company: "",
        email: "",
        phone: "",
        plan: "Básico",
        days: 30,
    });

    useEffect(() => {
        if (authenticated) void loadTokens();
    }, [authenticated]);

    const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
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
        } catch (error: any) {
            setPwError(true);
            if (error.code === "INVALID_PASSWORD") {
                setLoginErrorMsg("Contraseña incorrecta.");
            } else if (error.code === "MISSING_ADMIN_PASSWORD") {
                setLoginErrorMsg("Falta ADMIN_TOKENS_PASSWORD en el servidor.");
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
            setTokens(data.tokens || []);
        } catch {
            toast.error("Error al conectar con el servidor.");
            setAuthenticated(false);
        } finally {
            setLoading(false);
        }
    };

    const handleAction = async (
        id: string,
        action: "activate" | "suspend" | "reactivate" | "expire" | "extend" | "delete",
        days = 30,
    ) => {
        if (action === "suspend" && !window.confirm("¿Confirmas que deseas suspender este acceso?")) return;
        if (action === "delete" && !window.confirm("¿Eliminar el token permanentemente?")) return;
        try {
            const response = await tokenService.updateTokenAction(id, action, days, password);
            if (action === "delete") {
                setTokens(previous => previous.filter(token => token.id !== id));
                toast.success("Token eliminado.");
            } else if (response.token) {
                setTokens(previous => previous.map(token => token.id === id ? response.token! : token));
                if (action === "activate") toast.success("Acceso aprobado.");
                else if (action === "suspend") toast.success("Acceso suspendido.");
                else if (action === "extend") toast.success(`Acceso extendido ${days} días.`);
                else toast.success("Estado actualizado.");
            }
        } catch {
            toast.error("Error al actualizar el token.");
        }
    };

    const openCreateDialog = () => {
        setCreateForm({ name: "", company: "", email: "", phone: "", plan: "Básico", days: 30 });
        setCreatedToken(null);
        setCreateDialogOpen(true);
    };

    const handleCreateToken = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setCreateLoading(true);
        try {
            const token = await tokenService.createAccessToken(createForm, password);
            setTokens(previous => [token, ...previous]);
            setCreatedToken(token);
            toast.success("Token activo creado.");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "No se pudo crear el token.");
        } finally {
            setCreateLoading(false);
        }
    };

    const copyText = async (text: string, successMessage: string) => {
        try {
            await navigator.clipboard.writeText(text);
            toast.success(successMessage);
        } catch {
            toast.error("No se pudo copiar al portapapeles.");
        }
    };

    const whatsappMessage = createdToken
        ? `Hola ${tokenName(createdToken)}, te damos la bienvenida a Sentinel Express.\n\nIngresa a tu acceso aquí: https://sentinel.wibby.cloud/acceso?token=${encodeURIComponent(createdToken.id)}\n\nTu token de acceso: ${createdToken.id}\nVigente hasta: ${formatDate(createdToken.expiresAt)}.`
        : "";

    const copyLink = (tokenCode: string, id: string) => {
        const url = `${window.location.origin}/acceso?token=${tokenCode}`;
        navigator.clipboard.writeText(url);
        setCopiedId(id);
        window.setTimeout(() => setCopiedId(null), 2000);
        toast.success("Link copiado.");
    };

    const safeTokens = Array.isArray(tokens) ? tokens : [];
    const stats = useMemo(() => ({
        total: safeTokens.length,
        pending: safeTokens.filter(token => token.status === "pending").length,
        active: safeTokens.filter(token => token.status === "active").length,
        suspended: safeTokens.filter(token => token.status === "suspended").length,
        expired: safeTokens.filter(token => token.status === "expired").length,
        urgent: safeTokens.filter(token => token.status === "active" && daysUntil(token.expiresAt) >= 0 && daysUntil(token.expiresAt) < 7).length,
        hot: safeTokens.filter(isHotLead).length,
    }), [safeTokens]);

    const filteredTokens = useMemo(() => {
        const term = search.trim().toLowerCase();
        return safeTokens.filter(token => {
            if (statusFilter === "hot" && !isHotLead(token)) return false;
            if (statusFilter === "urgent" && !(token.status === "active" && daysUntil(token.expiresAt) >= 0 && daysUntil(token.expiresAt) < 7)) return false;
            if (statusFilter !== "all" && statusFilter !== "hot" && statusFilter !== "urgent" && token.status !== statusFilter) return false;

            const name = tokenName(token).toLowerCase();
            const company = tokenCompany(token).toLowerCase();
            const email = (token.email || "").toLowerCase();
            const phone = tokenPhone(token);
            return !term || name.includes(term) || company.includes(term) || email.includes(term) || phone.includes(term) || token.id.toLowerCase().includes(term);
        }).sort((a, b) => {
            if (statusFilter === "hot") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            if (a.status === "pending" && b.status !== "pending") return -1;
            if (a.status !== "pending" && b.status === "pending") return 1;
            const activityA = (a.satQueriesCount || 0) + (a.dashboardOpensCount || 0) + (a.loginsCount || 0);
            const activityB = (b.satQueriesCount || 0) + (b.dashboardOpensCount || 0) + (b.loginsCount || 0);
            if (activityA !== activityB) return activityB - activityA;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
    }, [safeTokens, statusFilter, search]);

    const hotLeads = useMemo(
        () => safeTokens.filter(isHotLead).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
        [safeTokens],
    );

    const filterPills: { key: FilterKey; label: string; count: number; activeClass: string }[] = [
        { key: "all", label: "Todos", count: stats.total, activeClass: "border-[#F5C542]/40 bg-[#F5C542]/10 text-[#F5C542]" },
        { key: "active", label: "Activos", count: stats.active, activeClass: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" },
        { key: "pending", label: "Pendientes", count: stats.pending, activeClass: "border-blue-400/30 bg-blue-400/10 text-blue-300" },
        { key: "suspended", label: "Suspendidos", count: stats.suspended, activeClass: "border-amber-400/30 bg-amber-400/10 text-amber-300" },
        { key: "expired", label: "Vencidos", count: stats.expired, activeClass: "border-rose-400/30 bg-rose-400/10 text-rose-300" },
        { key: "hot", label: "Leads calientes", count: stats.hot, activeClass: "border-orange-400/30 bg-orange-400/10 text-orange-300" },
    ];

    const renderActions = (token: TokenData) => (
        <div className="flex items-center gap-1.5">
            {token.status === "pending" && (
                <button
                    type="button"
                    onClick={() => void handleAction(token.id, "activate")}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-400 px-3 text-xs font-bold text-[#07182C] transition-colors duration-150 hover:bg-emerald-300"
                >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Aprobar
                </button>
            )}
            {token.status === "active" && (
                <button
                    type="button"
                    onClick={() => void handleAction(token.id, "suspend")}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-amber-400/20 bg-amber-400/[0.08] px-3 text-xs font-semibold text-amber-300 transition-colors duration-150 hover:bg-amber-400/[0.16]"
                >
                    <Pause className="h-3.5 w-3.5" />
                    Suspender
                </button>
            )}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button type="button" aria-label={`Más acciones para ${tokenName(token)}`} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.07] text-slate-400 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white">
                        <MoreHorizontal className="h-4 w-4" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="border-white/[0.08] bg-[#0F2340] text-slate-100">
                    {token.status === "pending" && (
                        <DropdownMenuItem onSelect={() => void handleAction(token.id, "activate")} className="focus:bg-emerald-400/10 focus:text-emerald-200">
                            <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Aprobar acceso · 30 días
                        </DropdownMenuItem>
                    )}
                    {token.status === "suspended" && (
                        <DropdownMenuItem onSelect={() => void handleAction(token.id, "reactivate")} className="focus:bg-emerald-400/10 focus:text-emerald-200">
                            <Play className="h-4 w-4 text-emerald-400" /> Reactivar acceso
                        </DropdownMenuItem>
                    )}
                    {(token.status === "active" || token.status === "suspended") && (
                        <>
                            <DropdownMenuItem onSelect={() => void handleAction(token.id, "extend", 15)} className="focus:bg-blue-400/10 focus:text-blue-200">
                                <CalendarClock className="h-4 w-4 text-blue-300" /> Extender 15 días
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => void handleAction(token.id, "expire")} className="focus:bg-white/[0.06]">
                                <Clock3 className="h-4 w-4" /> Marcar como vencido
                            </DropdownMenuItem>
                        </>
                    )}
                    <DropdownMenuSeparator className="bg-white/[0.08]" />
                    <DropdownMenuItem variant="destructive" onSelect={() => void handleAction(token.id, "delete")}>
                        <Trash2 className="h-4 w-4" /> Eliminar token
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );

    if (!authenticated) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-[#0A1628] p-4 font-sans text-white">
                <section className="w-full max-w-md rounded-2xl border border-white/[0.06] bg-[#0F2340] p-8 shadow-2xl shadow-black/20">
                    <div className="mb-7 text-center">
                        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0B1F3A] ring-1 ring-[#F5C542]/20">
                            <Shield className="h-7 w-7 text-[#F5C542]" />
                        </div>
                        <h1 className="text-2xl font-black uppercase tracking-tighter">Panel <span className="text-[#F5C542]">Admin</span></h1>
                        <p className="mt-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Gestión de accesos Sentinel Express</p>
                    </div>
                    <form onSubmit={handleLogin} className="space-y-4">
                        <label htmlFor="admin-token-password" className="block text-[11px] font-bold uppercase tracking-wider text-slate-300">Contraseña maestra</label>
                        <input
                            id="admin-token-password"
                            type="password"
                            value={password}
                            onChange={event => setPassword(event.target.value)}
                            placeholder="Ingresa tu contraseña"
                            autoComplete="current-password"
                            autoFocus
                            className="h-12 w-full rounded-xl border border-white/[0.08] bg-[#0A1628] px-4 text-sm text-white outline-none transition-colors duration-150 placeholder:text-slate-500 focus:border-[#F5C542]/60 focus:ring-2 focus:ring-[#F5C542]/10"
                        />
                        {pwError && <p role="alert" className="text-xs text-rose-300">{loginErrorMsg}</p>}
                        <button type="submit" disabled={loading} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#F5C542] text-sm font-extrabold text-[#0B1F3A] transition-colors duration-150 hover:bg-[#ffda69] disabled:cursor-wait disabled:opacity-60">
                            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                            {loading ? "Verificando…" : "Acceder"}
                        </button>
                    </form>
                </section>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-[#0A1628] font-sans text-slate-100">
            <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-[#0A1628]/95 backdrop-blur">
                <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0B1F3A] ring-1 ring-[#F5C542]/20">
                            <Shield className="h-6 w-6 text-[#F5C542]" />
                        </div>
                        <div className="min-w-0">
                            <h1 className="truncate text-base font-black tracking-tight text-white sm:text-lg">Panel de Accesos</h1>
                            <p className="text-[11px] font-medium tracking-wide text-slate-400">Sentinel Express</p>
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        <button type="button" onClick={openCreateDialog} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#F5C542] px-3.5 text-xs font-extrabold text-[#0B1F3A] transition-colors duration-150 hover:bg-[#ffda69] sm:px-4 sm:text-sm">
                            <Plus className="h-4 w-4" />
                            <span className="hidden sm:inline">Nuevo token</span>
                            <span className="sm:hidden">Nuevo</span>
                        </button>
                        <button type="button" onClick={() => void loadTokens()} disabled={loading} aria-label="Actualizar lista" title="Actualizar lista" className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.07] text-slate-300 transition-colors duration-150 hover:bg-white/[0.05] hover:text-white disabled:opacity-50">
                            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                        </button>
                        <button type="button" onClick={() => setAuthenticated(false)} aria-label="Salir" title="Salir" className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.07] text-slate-300 transition-colors duration-150 hover:border-rose-400/20 hover:bg-rose-400/[0.08] hover:text-rose-300">
                            <LogOut className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </header>

            <div className="mx-auto max-w-[1440px] space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
                <section aria-label="Resumen de accesos" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                    <MetricCard label="Total tokens" value={stats.total} icon={<KeyRound className="h-4 w-4" />} color="#F5C542" selected={statusFilter === "all"} onClick={() => setStatusFilter("all")} />
                    <MetricCard label="Pendientes" value={stats.pending} icon={<Clock3 className="h-4 w-4" />} color="#60A5FA" selected={statusFilter === "pending"} onClick={() => setStatusFilter("pending")} />
                    <MetricCard label="Activos" value={stats.active} icon={<CheckCircle2 className="h-4 w-4" />} color="#10B981" selected={statusFilter === "active"} onClick={() => setStatusFilter("active")} />
                    <MetricCard label="Suspendidos" value={stats.suspended} icon={<PauseCircle className="h-4 w-4" />} color="#F5C542" selected={statusFilter === "suspended"} onClick={() => setStatusFilter("suspended")} />
                    <MetricCard label="Vencidos" value={stats.expired} icon={<X className="h-4 w-4" />} color="#FB7185" selected={statusFilter === "expired"} onClick={() => setStatusFilter("expired")} />
                    <MetricCard label="Por vencer <7d" value={stats.urgent} icon={<CalendarClock className="h-4 w-4" />} color="#F59E0B" selected={statusFilter === "urgent"} warning onClick={() => setStatusFilter("urgent")} />
                </section>

                <section className="flex flex-col gap-3 rounded-2xl border border-white/[0.06] bg-[#0F2340] p-3 sm:p-4 xl:flex-row xl:items-center">
                    <div className="relative w-full shrink-0 xl:max-w-sm">
                        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                        <input
                            type="search"
                            aria-label="Buscar accesos"
                            placeholder="Buscar nombre, empresa, correo o token…"
                            value={search}
                            onChange={event => setSearch(event.target.value)}
                            className="h-10 w-full rounded-xl border border-white/[0.07] bg-[#0A1628] pl-10 pr-4 text-sm text-white outline-none transition-colors duration-150 placeholder:text-slate-500 focus:border-[#F5C542]/50"
                        />
                    </div>
                    <div className="flex min-w-0 flex-wrap gap-2" role="group" aria-label="Filtrar por estado">
                        {filterPills.map(pill => (
                            <button
                                key={pill.key}
                                type="button"
                                onClick={() => setStatusFilter(pill.key)}
                                aria-pressed={statusFilter === pill.key}
                                className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition-colors duration-150 ${statusFilter === pill.key ? pill.activeClass : "border-white/[0.07] bg-transparent text-slate-400 hover:border-white/[0.14] hover:text-white"}`}
                            >
                                {pill.key === "hot" && <Flame className="h-3.5 w-3.5" />}
                                {pill.label}
                                <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${statusFilter === pill.key ? "bg-black/15" : "bg-white/[0.06] text-slate-300"}`}>{pill.count}</span>
                            </button>
                        ))}
                    </div>
                </section>

                {hotLeads.length > 0 && (
                    <section className="overflow-hidden rounded-2xl border border-orange-400/15 bg-gradient-to-br from-orange-400/[0.07] to-[#0F2340]">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3 sm:px-5">
                            <div className="flex items-center gap-2.5">
                                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-400/10 text-orange-300"><Flame className="h-4 w-4" /></span>
                                <div>
                                    <h2 className="text-sm font-bold text-white">Leads calientes</h2>
                                    <p className="text-[11px] text-slate-400">Ordenados por fecha de registro, más recientes primero</p>
                                </div>
                                <span className="rounded-full border border-orange-400/20 bg-orange-400/10 px-2 py-0.5 text-[10px] font-bold text-orange-300">{hotLeads.length}</span>
                            </div>
                            <button type="button" onClick={() => setStatusFilter("hot")} className="text-xs font-semibold text-orange-200 transition-colors duration-150 hover:text-white">Ver todos</button>
                        </div>
                        <div className="grid divide-y divide-white/[0.05] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                            {hotLeads.slice(0, 3).map(token => (
                                <div key={token.id} className="flex min-w-0 items-center gap-3 px-4 py-3 sm:px-5">
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-400/10 text-orange-300"><Activity className="h-4 w-4" /></div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-xs font-semibold text-slate-100">{tokenName(token)}</p>
                                        <p className="truncate text-[11px] text-slate-400">{formatDate(token.createdAt)} · {tokenCompany(token)}</p>
                                    </div>
                                    <StatusBadge status={token.status} />
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                <section className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0F2340]">
                    <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-4 sm:px-5">
                        <div>
                            <h2 className="text-sm font-bold text-white">Solicitudes y accesos</h2>
                            <p className="mt-0.5 text-xs text-slate-400">{loading ? "Actualizando…" : `${filteredTokens.length} ${filteredTokens.length === 1 ? "registro" : "registros"}`}</p>
                        </div>
                        {statusFilter !== "all" && <button type="button" onClick={() => setStatusFilter("all")} className="text-xs font-semibold text-[#F5C542] hover:text-[#ffda69]">Limpiar filtro</button>}
                    </div>

                    {loading ? (
                        <div aria-label="Cargando accesos" aria-busy="true">
                            {Array.from({ length: 4 }, (_, index) => <TokenSkeleton key={index} />)}
                        </div>
                    ) : filteredTokens.length === 0 ? (
                        <div className="flex flex-col items-center px-6 py-14 text-center sm:py-20">
                            <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl border border-[#F5C542]/10 bg-[#0B1F3A] text-[#F5C542]">
                                {safeTokens.length === 0 ? <Users className="h-9 w-9" /> : <Search className="h-9 w-9" />}
                            </div>
                            <h3 className="text-base font-bold text-white">{safeTokens.length === 0 ? "Aún no hay solicitudes de acceso" : "No encontramos resultados"}</h3>
                            <p className="mt-2 max-w-sm text-sm text-slate-400">{safeTokens.length === 0 ? "Cuando llegue una solicitud, podrás revisar y administrar el acceso desde aquí." : "Prueba con otro término o cambia los filtros seleccionados."}</p>
                            {safeTokens.length === 0 ? (
                                <button type="button" onClick={openCreateDialog} className="mt-6 inline-flex h-10 items-center gap-2 rounded-xl bg-[#F5C542] px-4 text-sm font-extrabold text-[#0B1F3A] transition-colors duration-150 hover:bg-[#ffda69]">
                                    <Plus className="h-4 w-4" /> Crear primer token
                                </button>
                            ) : (
                                <button type="button" onClick={() => { setSearch(""); setStatusFilter("all"); }} className="mt-5 text-sm font-semibold text-[#F5C542] hover:text-[#ffda69]">Limpiar búsqueda y filtros</button>
                            )}
                        </div>
                    ) : (
                        <>
                            <div className="hidden overflow-x-auto md:block">
                                <table className="w-full min-w-[920px] text-left">
                                    <thead>
                                        <tr className="border-b border-white/[0.06] text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                                            <th className="px-5 py-3">Nombre / Empresa</th>
                                            <th className="px-4 py-3">Contacto</th>
                                            <th className="px-4 py-3">Token</th>
                                            <th className="px-4 py-3">Estado</th>
                                            <th className="px-4 py-3">Vence</th>
                                            <th className="px-5 py-3 text-right">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredTokens.map(token => {
                                            const phone = tokenPhone(token);
                                            const expiryDays = daysUntil(token.expiresAt);
                                            const urgent = token.status === "active" && expiryDays >= 0 && expiryDays < 7;
                                            return (
                                                <tr key={token.id} className={`group border-b border-white/[0.05] transition-colors duration-150 hover:bg-white/[0.025] ${token.status === "pending" ? "bg-blue-400/[0.025]" : ""}`}>
                                                    <td className="px-5 py-4">
                                                        <div className="flex items-start gap-3">
                                                            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#0A1628] text-slate-400"><Building2 className="h-4 w-4" /></span>
                                                            <div className="min-w-0">
                                                                <p className="max-w-[190px] truncate text-sm font-semibold text-white">{tokenName(token)}</p>
                                                                <p className="mt-0.5 max-w-[190px] truncate text-xs text-slate-400">{tokenCompany(token)}</p>
                                                                {isHotLead(token) && <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-orange-300"><Flame className="h-3 w-3" /> Lead caliente</span>}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <p className="max-w-[200px] truncate text-xs text-slate-200">{token.email || "Sin correo"}</p>
                                                        {phone && <a href={`https://wa.me/${phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-slate-400 transition-colors hover:text-emerald-300">{phone}</a>}
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <div className="flex items-center gap-1.5">
                                                            <code className="max-w-[120px] truncate rounded-md border border-[#F5C542]/10 bg-[#F5C542]/[0.05] px-2 py-1 font-mono text-xs text-[#F5C542]" title={token.id}>{token.id}</code>
                                                            <button type="button" onClick={() => copyLink(token.id, token.id)} aria-label="Copiar enlace de acceso" title="Copiar enlace" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white">
                                                                {copiedId === token.id ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                                                            </button>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-4"><StatusBadge status={token.status} /></td>
                                                    <td className="px-4 py-4">
                                                        <p className={`text-xs font-medium ${urgent ? "text-amber-300" : "text-slate-300"}`}>{relativeExpiry(token.expiresAt)}</p>
                                                        <p className="mt-1 text-[10px] text-slate-500">{formatDate(token.expiresAt)}</p>
                                                    </td>
                                                    <td className="px-5 py-4"><div className="flex justify-end">{renderActions(token)}</div></td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            <div className="space-y-3 p-3 md:hidden">
                                {filteredTokens.map(token => {
                                    const phone = tokenPhone(token);
                                    const expiryDays = daysUntil(token.expiresAt);
                                    const urgent = token.status === "active" && expiryDays >= 0 && expiryDays < 7;
                                    return (
                                        <article key={token.id} className={`rounded-xl border border-white/[0.06] bg-[#0A1628]/60 p-4 transition-colors duration-150 hover:border-white/[0.12] ${token.status === "pending" ? "border-l-2 border-l-blue-400" : ""}`}>
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-semibold text-white">{tokenName(token)}</p>
                                                    <p className="mt-1 truncate text-xs text-slate-400">{tokenCompany(token)}</p>
                                                </div>
                                                <StatusBadge status={token.status} />
                                            </div>
                                            <div className="mt-4 grid grid-cols-2 gap-3">
                                                <div className="min-w-0">
                                                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Contacto</p>
                                                    <p className="mt-1 truncate text-xs text-slate-200">{token.email || "Sin correo"}</p>
                                                    {phone && <a href={`https://wa.me/${phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="mt-1 block text-xs text-slate-400 hover:text-emerald-300">{phone}</a>}
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Vence</p>
                                                    <p className={`mt-1 text-xs font-medium ${urgent ? "text-amber-300" : "text-slate-200"}`}>{relativeExpiry(token.expiresAt)}</p>
                                                    <p className="mt-1 text-[10px] text-slate-500">{formatDate(token.expiresAt)}</p>
                                                </div>
                                            </div>
                                            <div className="mt-4 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
                                                <div className="flex min-w-0 items-center gap-1.5">
                                                    <code className="max-w-[150px] truncate rounded-md border border-[#F5C542]/10 bg-[#F5C542]/[0.05] px-2 py-1 font-mono text-xs text-[#F5C542]">{token.id}</code>
                                                    <button type="button" onClick={() => copyLink(token.id, token.id)} aria-label="Copiar enlace de acceso" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-white/[0.06] hover:text-white">
                                                        {copiedId === token.id ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                                                    </button>
                                                </div>
                                                {renderActions(token)}
                                            </div>
                                            {isHotLead(token) && <p className="mt-3 flex items-center gap-1 text-[10px] font-semibold text-orange-300"><Flame className="h-3 w-3" /> Lead caliente · registrado {formatDate(token.createdAt)}</p>}
                                        </article>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </section>

                <footer className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-slate-500">
                    <span>Sentinel Express · Administración de accesos</span>
                    <span>{stats.pending} solicitudes pendientes de revisión</span>
                </footer>
            </div>

            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                <DialogContent className="max-h-[90vh] overflow-y-auto border-white/[0.08] bg-[#0F2340] text-slate-100 sm:max-w-xl">
                    {createdToken ? (
                        <>
                            <DialogHeader className="pr-8">
                                <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300">
                                    <CheckCircle2 className="h-6 w-6" />
                                </div>
                                <DialogTitle className="text-xl font-bold text-white">Token creado y activo</DialogTitle>
                                <DialogDescription className="text-slate-400">
                                    Comparte este token con {tokenName(createdToken)}. Solo se mostrará completo en este momento.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4">
                                <div className="rounded-xl border border-[#F5C542]/20 bg-[#0A1628] p-4">
                                    <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Token de acceso</p>
                                    <code className="block break-all font-mono text-sm font-bold tracking-wide text-[#F5C542] sm:text-base">{createdToken.id}</code>
                                    <button
                                        type="button"
                                        onClick={() => void copyText(createdToken.id, "Token copiado.")}
                                        className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg border border-white/[0.08] px-3 text-xs font-semibold text-slate-200 transition-colors hover:bg-white/[0.06]"
                                    >
                                        <Copy className="h-3.5 w-3.5" /> Copiar token
                                    </button>
                                </div>
                                <div className="rounded-xl border border-white/[0.06] bg-[#0A1628]/70 p-4 text-xs leading-relaxed text-slate-300">
                                    <p className="mb-2 font-semibold text-white">Mensaje para WhatsApp</p>
                                    <p className="whitespace-pre-wrap break-words">{whatsappMessage}</p>
                                </div>
                            </div>
                            <DialogFooter className="gap-2 sm:gap-2">
                                <button
                                    type="button"
                                    onClick={() => void copyText(whatsappMessage, "Mensaje de WhatsApp copiado.")}
                                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#10B981] px-4 text-sm font-bold text-[#06251D] transition-colors hover:bg-emerald-300"
                                >
                                    <MessageCircle className="h-4 w-4" /> Copiar mensaje de WhatsApp
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCreateDialogOpen(false)}
                                    className="inline-flex h-10 items-center justify-center rounded-xl border border-white/[0.08] px-4 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/[0.06]"
                                >
                                    Cerrar
                                </button>
                            </DialogFooter>
                        </>
                    ) : (
                        <>
                            <DialogHeader className="pr-8">
                                <DialogTitle className="text-xl font-bold text-white">Crear nuevo token</DialogTitle>
                                <DialogDescription className="text-slate-400">
                                    El token se generará de forma segura y quedará activo al crearse.
                                </DialogDescription>
                            </DialogHeader>
                            <form onSubmit={event => void handleCreateToken(event)} className="space-y-4">
                                <div>
                                    <label htmlFor="new-token-name" className="mb-1.5 block text-xs font-semibold text-slate-300">Nombre <span className="text-rose-300">*</span></label>
                                    <input
                                        id="new-token-name"
                                        required
                                        autoFocus
                                        maxLength={160}
                                        value={createForm.name}
                                        onChange={event => setCreateForm(form => ({ ...form, name: event.target.value }))}
                                        className="h-10 w-full rounded-lg border border-white/[0.08] bg-[#0A1628] px-3 text-sm text-white outline-none transition-colors focus:border-[#F5C542]/50"
                                    />
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div>
                                        <label htmlFor="new-token-company" className="mb-1.5 block text-xs font-semibold text-slate-300">Empresa</label>
                                        <input
                                            id="new-token-company"
                                            maxLength={160}
                                            value={createForm.company}
                                            onChange={event => setCreateForm(form => ({ ...form, company: event.target.value }))}
                                            className="h-10 w-full rounded-lg border border-white/[0.08] bg-[#0A1628] px-3 text-sm text-white outline-none transition-colors focus:border-[#F5C542]/50"
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="new-token-email" className="mb-1.5 block text-xs font-semibold text-slate-300">Correo</label>
                                        <input
                                            id="new-token-email"
                                            type="email"
                                            maxLength={254}
                                            value={createForm.email}
                                            onChange={event => setCreateForm(form => ({ ...form, email: event.target.value }))}
                                            className="h-10 w-full rounded-lg border border-white/[0.08] bg-[#0A1628] px-3 text-sm text-white outline-none transition-colors focus:border-[#F5C542]/50"
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="new-token-phone" className="mb-1.5 block text-xs font-semibold text-slate-300">Teléfono</label>
                                        <input
                                            id="new-token-phone"
                                            type="tel"
                                            maxLength={40}
                                            value={createForm.phone}
                                            onChange={event => setCreateForm(form => ({ ...form, phone: event.target.value }))}
                                            className="h-10 w-full rounded-lg border border-white/[0.08] bg-[#0A1628] px-3 text-sm text-white outline-none transition-colors focus:border-[#F5C542]/50"
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="new-token-plan" className="mb-1.5 block text-xs font-semibold text-slate-300">Plan</label>
                                        <select
                                            id="new-token-plan"
                                            value={createForm.plan}
                                            onChange={event => setCreateForm(form => ({ ...form, plan: event.target.value }))}
                                            className="h-10 w-full rounded-lg border border-white/[0.08] bg-[#0A1628] px-3 text-sm text-white outline-none transition-colors focus:border-[#F5C542]/50"
                                        >
                                            <option value="Básico">Básico</option>
                                            <option value="Pro Professional">Pro Professional</option>
                                            <option value="Enterprise">Enterprise</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label htmlFor="new-token-days" className="mb-1.5 block text-xs font-semibold text-slate-300">Vigencia en días</label>
                                        <input
                                            id="new-token-days"
                                            type="number"
                                            min={1}
                                            max={3650}
                                            step={1}
                                            required
                                            value={createForm.days}
                                            onChange={event => setCreateForm(form => ({ ...form, days: Number(event.target.value) }))}
                                            className="h-10 w-full rounded-lg border border-white/[0.08] bg-[#0A1628] px-3 text-sm text-white outline-none transition-colors focus:border-[#F5C542]/50"
                                        />
                                    </div>
                                </div>
                                <DialogFooter className="gap-2 pt-2 sm:gap-2">
                                    <button
                                        type="button"
                                        disabled={createLoading}
                                        onClick={() => setCreateDialogOpen(false)}
                                        className="inline-flex h-10 items-center justify-center rounded-xl border border-white/[0.08] px-4 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/[0.06] disabled:opacity-50"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={createLoading || !createForm.name.trim()}
                                        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#F5C542] px-4 text-sm font-extrabold text-[#0B1F3A] transition-colors hover:bg-[#ffda69] disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {createLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                        {createLoading ? "Creando…" : "Crear token activo"}
                                    </button>
                                </DialogFooter>
                            </form>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </main>
    );
}
