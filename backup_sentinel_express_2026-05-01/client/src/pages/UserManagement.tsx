import React, { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Trash2, Plus, UserCircle, KeyRound, ShieldAlert, ServerOff } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";

// Base URL del backend. Si VITE_API_URL está definido en .env / Netlify,
// las llamadas van al backend real. Si está vacío, son rutas relativas
// (solo funcionan cuando Express está corriendo en el mismo origen).
const API_BASE = import.meta.env.VITE_API_URL ?? "";

/**
 * Hace fetch y lanza un error descriptivo si el servidor devuelve HTML
 * en lugar de JSON (típico cuando no hay backend o el proxy falla).
 */
async function apiFetch(path: string, options?: RequestInit) {
    const url = `${API_BASE}${path}`;
    const res = await fetch(url, options);
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
        // El servidor devolvió HTML (página de error de Netlify / Express)
        throw new Error(
            `El backend no está disponible (se recibió HTML en lugar de JSON). ` +
            `Verifica que VITE_API_URL apunte al backend correcto o que el servidor esté corriendo.`
        );
    }
    return res;
}

interface SystemUser {
    id: string;
    username: string;
    role: string;
    created_at: number;
}

export default function UserManagement() {
    const { user } = useAuth();
    const [, setLocation] = useLocation();
    const [users, setUsers] = useState<SystemUser[]>([]);
    const [loading, setLoading] = useState(true);

    // Create user form
    const [open, setOpen] = useState(false);
    const [newUsername, setNewUsername] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [newRole, setNewRole] = useState("user");
    const [isCreating, setIsCreating] = useState(false);

    useEffect(() => {
        // Basic protection - although API also protects
        if (user?.role !== "admin") {
            setLocation("/");
            return;
        }

        fetchUsers();
    }, [user]);

    const fetchUsers = async () => {
        try {
            const res = await apiFetch("/api/users");
            if (res.ok) {
                const data = await res.json();
                setUsers(data);
            } else {
                toast.error("Error al obtener usuarios");
            }
        } catch (e: any) {
            console.error("[UserManagement] fetchUsers error:", e);
            toast.error(e?.message ?? "Error de conexión con el backend");
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteUser = async (id: string) => {
        if (!confirm("¿Estás seguro de que deseas eliminar a este usuario? Se borrarán también todas sus empresas y datos asociados.")) return;

        try {
            const res = await apiFetch(`/api/users/${id}`, { method: "DELETE" });
            if (res.ok) {
                toast.success("Usuario eliminado correctamente");
                setUsers(users.filter(u => u.id !== id));
            } else {
                const err = await res.json();
                toast.error(err.error || "No se pudo eliminar al usuario");
            }
        } catch (e: any) {
            console.error("[UserManagement] handleDeleteUser error:", e);
            toast.error(e?.message ?? "Error de conexión con el backend");
        }
    };

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsCreating(true);
        try {
            const res = await apiFetch("/api/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: newUsername, password: newPassword, role: newRole })
            });

            if (res.ok) {
                toast.success("Usuario creado exitosamente");
                setOpen(false);
                setNewUsername("");
                setNewPassword("");
                setNewRole("user");
                fetchUsers();
            } else {
                const data = await res.json();
                toast.error(data.error || "No se pudo crear el usuario");
            }
        } catch (err: any) {
            console.error("[UserManagement] handleCreateUser error:", err);
            toast.error(err?.message ?? "Error al conectar con el servidor");
        } finally {
            setIsCreating(false);
        }
    };

    if (user?.role !== "admin") return null;

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4 md:p-8">
            <div className="max-w-4xl mx-auto">
                <div className="mb-6 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setLocation("/")}
                            className="hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full"
                        >
                            <ArrowLeft className="w-6 h-6 text-slate-700 dark:text-slate-300" />
                        </Button>
                        <div>
                            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                <ShieldAlert className="w-8 h-8 text-indigo-500" />
                                Control de Accesos
                            </h1>
                            <p className="text-slate-500 dark:text-slate-400">Administra los usuarios de Sentinel</p>
                        </div>
                    </div>

                    <Dialog open={open} onOpenChange={setOpen}>
                        <DialogTrigger asChild>
                            <Button className="bg-indigo-600 hover:bg-indigo-700 text-white">
                                <Plus className="w-4 h-4 mr-2" />
                                Nuevo Usuario
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-md">
                            <DialogHeader>
                                <DialogTitle>Crear Nuevo Acceso</DialogTitle>
                                <DialogDescription>
                                    Crea un nuevo usuario de Sentinel. El usuario y la contraseña son requeridos para ingresar al sistema.
                                </DialogDescription>
                            </DialogHeader>
                            <form onSubmit={handleCreateUser} className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <Label htmlFor="username">Nombre de Usuario (Login)</Label>
                                    <Input
                                        id="username"
                                        value={newUsername}
                                        onChange={e => setNewUsername(e.target.value)}
                                        placeholder="ej. juan_perez"
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="password">Contraseña Provisional</Label>
                                    <Input
                                        id="password"
                                        type="text"
                                        value={newPassword}
                                        onChange={e => setNewPassword(e.target.value)}
                                        placeholder="Escribe una contraseña segura"
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="role">Nivel de Privilegios</Label>
                                    <Select value={newRole} onValueChange={setNewRole}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Selecciona un rol" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="user">Usuario Básico (Recomendado)</SelectItem>
                                            <SelectItem value="admin">Administrador (Peligroso)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <Button type="submit" className="w-full mt-6" disabled={isCreating}>
                                    {isCreating ? "Creando..." : "✅ Registrar Usuario en el Sistema"}
                                </Button>
                            </form>
                        </DialogContent>
                    </Dialog>
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden mt-8">
                    <div className="p-6">
                        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
                            <KeyRound className="w-5 h-5 text-indigo-500" />
                            Cuentas Autorizadas ({users.length})
                        </h2>

                        {loading ? (
                            <div className="animate-pulse space-y-4 py-4">
                                {[...Array(3)].map((_, i) => (
                                    <div key={i} className="h-16 bg-slate-100 dark:bg-slate-700 rounded-lg"></div>
                                ))}
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
                                {users.map((sysUser) => (
                                    <div key={sysUser.id} className="py-4 flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className={`p-3 rounded-full ${sysUser.role === 'admin' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30' : 'bg-slate-100 text-slate-600 dark:bg-slate-800'}`}>
                                                <UserCircle className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <p className="font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                                                        {sysUser.username}
                                                    </p>
                                                    {sysUser.role === "admin" && (
                                                        <span className="bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase">
                                                            Admin
                                                        </span>
                                                    )}
                                                    {sysUser.id === user?.id && (
                                                        <span className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-400 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase">
                                                            TÚ
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-slate-500 mt-1">Registrado el {new Date(sysUser.created_at).toLocaleDateString()}</p>
                                            </div>
                                        </div>

                                        {sysUser.id !== user?.id && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                                title="Revocar acceso y eliminar usuario"
                                                onClick={() => handleDeleteUser(sysUser.id)}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        )}
                                    </div>
                                ))}

                                {users.length === 0 && !loading && (
                                    <p className="text-center py-8 text-slate-500">No hay usuarios registrados.</p>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
