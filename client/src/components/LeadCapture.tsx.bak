import React, { useState } from "react";
import { saveLeadToServer, markLeadRegistered, Lead } from "@/services/leadService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, CheckCircle2, FileText, TrendingUp, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface LeadCaptureProps {
    onComplete: () => void;
}

interface FormData {
    nombre: string;
    empresa: string;
    email: string;
    telefono: string;
    cfdi_mensuales: string;
}

interface FormErrors {
    nombre?: string;
    empresa?: string;
    email?: string;
    telefono?: string;
}

function validate(form: FormData): FormErrors {
    const errors: FormErrors = {};
    if (!form.nombre.trim()) errors.nombre = "El nombre es requerido";
    if (!form.empresa.trim()) errors.empresa = "La empresa es requerida";
    if (!form.email.trim()) {
        errors.email = "El email es requerido";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
        errors.email = "Ingresa un email válido";
    }
    if (!form.telefono.trim()) {
        errors.telefono = "El teléfono es requerido";
    } else if (form.telefono.replace(/\D/g, "").length < 8) {
        errors.telefono = "El teléfono debe tener al menos 8 dígitos";
    }
    return errors;
}

const CFDI_OPTIONS = [
    { value: "menos_100", label: "Menos de 100 CFDI / mes" },
    { value: "100_500", label: "100 – 500 CFDI / mes" },
    { value: "500_2000", label: "500 – 2,000 CFDI / mes" },
    { value: "mas_2000", label: "Más de 2,000 CFDI / mes" },
];

export default function LeadCapture({ onComplete }: LeadCaptureProps) {
    const [form, setForm] = useState<FormData>({
        nombre: "",
        empresa: "",
        email: "",
        telefono: "",
        cfdi_mensuales: "",
    });
    const [errors, setErrors] = useState<FormErrors>({});
    const [loading, setLoading] = useState(false);
    const [generatedToken, setGeneratedToken] = useState<string | null>(null);

    const trackEvent = (eventName: string, data?: any) => {
        console.log(`[Event Tracker] ${eventName}`, data || "");
        if (typeof window !== "undefined" && (window as any).umami) {
            (window as any).umami.track(eventName, data);
        }
    };

    const handleChange = (field: keyof FormData, value: string) => {
        setForm((prev) => ({ ...prev, [field]: value }));
        if (errors[field as keyof FormErrors]) {
            setErrors((prev) => ({ ...prev, [field]: undefined }));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const validation = validate(form);
        if (Object.keys(validation).length > 0) {
            setErrors(validation);
            return;
        }

        setLoading(true);
        try {
            const lead: Lead = {
                nombre: form.nombre.trim(),
                empresa: form.empresa.trim(),
                email: form.email.trim().toLowerCase(),
                telefono: form.telefono.trim(),
                cfdi_mensuales: form.cfdi_mensuales || "No especificado",
                fecha_registro: new Date().toISOString(),
                origen: "sentinel_express",
            };

            const result = await saveLeadToServer(lead);

            if (!result.ok || !result.token) {
                console.warn("[LeadCapture] Error en backend:", result.error);
                toast.warning("Hubo un problema procesando tu acceso, por favor contacta soporte.");
                return;
            }

            // Track events
            if (result.events) {
                result.events.forEach(ev => trackEvent(ev, { email: lead.email }));
            }

            markLeadRegistered();
            setGeneratedToken(result.token);
            toast.success("¡Acceso generado con éxito!");

        } catch (err) {
            console.error("[LeadCapture] Error inesperado:", err);
            toast.error("Ocurrió un error de red. Intenta nuevamente.");
        } finally {
            setLoading(false);
        }
    };

    const handleWhatsAppRedirect = () => {
        trackEvent("whatsapp_redirect_clicked", { token: generatedToken });
        const whatsappNumber = "524776355734";
        const text = `Hola, acabo de registrarme. El sistema me asignó el token ${generatedToken}. Vengo a iniciar mi prueba.`;
        const encodedText = encodeURIComponent(text);
        const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodedText}`;
        window.location.href = whatsappUrl;
        onComplete();
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-[#0B2340] via-[#0f2d50] to-[#071929] flex items-center justify-center p-4 relative overflow-hidden">
            {/* Background pattern */}
            <div className="absolute inset-0 opacity-5 pointer-events-none bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:24px_24px]" />

            {/* Accent glow */}
            <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-[#F9C646]/5 blur-3xl pointer-events-none" />
            <div className="absolute bottom-[-20%] left-[-10%] w-[400px] h-[400px] rounded-full bg-[#F9C646]/5 blur-3xl pointer-events-none" />

            <div className="relative z-10 w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-0 rounded-3xl overflow-hidden shadow-2xl border border-white/10">

                {/* ── Left panel – Branding ── */}
                <div className="bg-white/5 backdrop-blur-sm p-8 lg:p-12 flex flex-col justify-between border-r border-white/10">
                    <div>
                        {/* Logo */}
                        <div className="flex items-center gap-3 mb-8">
                            <div className="p-2.5 bg-[#F9C646] rounded-xl shadow-lg">
                                <TrendingUp className="w-6 h-6 text-[#0B2340]" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-black text-white tracking-tighter uppercase">
                                    SENTINEL<span className="text-[#F9C646]">EXPRESS</span>
                                </h1>
                                <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
                                    Diagnóstico Fiscal CFDI
                                </p>
                            </div>
                        </div>

                        {/* Headline */}
                        <h2 className="text-3xl lg:text-4xl font-black text-white leading-tight mb-4">
                            Acceso a Sentinel Express –
                            <span className="text-[#F9C646] block">Diagnóstico Fiscal de CFDI</span>
                        </h2>
                        <p className="text-slate-300 text-sm leading-relaxed mb-8">
                            Esta herramienta permite analizar CFDI para detectar inconsistencias fiscales antes
                            de presentar declaraciones.
                        </p>

                        {/* Feature list */}
                        <div className="space-y-3">
                            {[
                                "Valida errores de totales e impuestos",
                                "Detecta CFDIs cancelados o no encontrados en el SAT",
                                "Revisa listas EFOS y 69-B en tiempo real",
                                "Exporta diagnóstico completo a Excel",
                            ].map((feat) => (
                                <div key={feat} className="flex items-start gap-3">
                                    <CheckCircle2 className="w-4 h-4 text-[#F9C646] mt-0.5 flex-shrink-0" />
                                    <span className="text-slate-300 text-sm">{feat}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Bottom badge */}
                    <div className="mt-8 flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                        <Shield className="w-5 h-5 text-[#F9C646]" />
                        <div>
                            <p className="text-white text-xs font-bold">100% Privado y Seguro</p>
                            <p className="text-slate-400 text-[10px]">Los XML nunca salen de tu computadora</p>
                        </div>
                    </div>
                </div>

                {/* ── Right panel – Form ── */}
                <div className="bg-white dark:bg-slate-900 p-8 lg:p-12">
                    <div className="mb-6">
                        <div className="flex items-center gap-2 mb-2">
                            <FileText className="w-5 h-5 text-[#0B2340] dark:text-[#F9C646]" />
                            <h3 className="text-xl font-black text-[#0B2340] dark:text-white uppercase tracking-tight">
                                Registro de Acceso
                            </h3>
                        </div>
                        <p className="text-slate-500 dark:text-slate-400 text-sm">
                            Completa tu información para acceder al analizador de CFDI.
                        </p>
                    </div>

                    {generatedToken ? (
                        <div className="space-y-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-6 rounded-2xl">
                                <h4 className="text-green-800 dark:text-green-400 font-bold uppercase tracking-widest text-xs mb-2">
                                    Tu Token Automático Es:
                                </h4>
                                <div className="text-3xl font-black font-mono text-slate-800 dark:text-white tracking-widest">
                                    {generatedToken}
                                </div>
                                <p className="text-xs text-green-700 dark:text-green-500 mt-3">
                                    Cópialo o guárdalo, es tu llave de acceso privado.
                                </p>
                            </div>
                            
                            <Button
                                onClick={handleWhatsAppRedirect}
                                className="w-full bg-[#25D366] hover:bg-[#128C7E] text-white font-black uppercase tracking-tighter py-6 rounded-xl shadow-lg text-sm transition-all duration-200 hover:scale-[1.01]"
                            >
                                <span className="flex items-center gap-2">
                                    Continuar a WhatsApp
                                </span>
                            </Button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                            {/* Nombre */}
                            <div className="space-y-1.5">
                                <Label htmlFor="lc-nombre" className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                                    Nombre completo *
                                </Label>
                                <Input
                                    id="lc-nombre"
                                    value={form.nombre}
                                    onChange={(e) => handleChange("nombre", e.target.value)}
                                    placeholder="Ej. Juan Pérez López"
                                    className={`rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 ${errors.nombre ? "border-red-400 focus-visible:ring-red-300" : ""}`}
                                />
                                {errors.nombre && (
                                    <p className="text-red-500 text-xs flex items-center gap-1">
                                        <AlertTriangle className="w-3 h-3" /> {errors.nombre}
                                    </p>
                                )}
                            </div>

                            {/* Empresa */}
                            <div className="space-y-1.5">
                                <Label htmlFor="lc-empresa" className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                                    Empresa / Despacho *
                                </Label>
                                <Input
                                    id="lc-empresa"
                                    value={form.empresa}
                                    onChange={(e) => handleChange("empresa", e.target.value)}
                                    placeholder="Ej. Corporativo XYZ SA de CV"
                                    className={`rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 ${errors.empresa ? "border-red-400 focus-visible:ring-red-300" : ""}`}
                                />
                                {errors.empresa && (
                                    <p className="text-red-500 text-xs flex items-center gap-1">
                                        <AlertTriangle className="w-3 h-3" /> {errors.empresa}
                                    </p>
                                )}
                            </div>

                            {/* Email */}
                            <div className="space-y-1.5">
                                <Label htmlFor="lc-email" className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                                    Correo electrónico *
                                </Label>
                                <Input
                                    id="lc-email"
                                    type="email"
                                    value={form.email}
                                    onChange={(e) => handleChange("email", e.target.value)}
                                    placeholder="correo@empresa.com"
                                    className={`rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 ${errors.email ? "border-red-400 focus-visible:ring-red-300" : ""}`}
                                />
                                {errors.email && (
                                    <p className="text-red-500 text-xs flex items-center gap-1">
                                        <AlertTriangle className="w-3 h-3" /> {errors.email}
                                    </p>
                                )}
                            </div>

                            {/* Teléfono */}
                            <div className="space-y-1.5">
                                <Label htmlFor="lc-tel" className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                                    Teléfono *
                                </Label>
                                <Input
                                    id="lc-tel"
                                    type="tel"
                                    value={form.telefono}
                                    onChange={(e) => handleChange("telefono", e.target.value)}
                                    placeholder="Ej. 81 1234 5678"
                                    className={`rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 ${errors.telefono ? "border-red-400 focus-visible:ring-red-300" : ""}`}
                                />
                                {errors.telefono && (
                                    <p className="text-red-500 text-xs flex items-center gap-1">
                                        <AlertTriangle className="w-3 h-3" /> {errors.telefono}
                                    </p>
                                )}
                            </div>

                            {/* CFDI mensuales (opcional) */}
                            <div className="space-y-1.5">
                                <Label htmlFor="lc-cfdi" className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                                    ¿Cuántos CFDI procesas al mes? <span className="normal-case font-normal">(opcional)</span>
                                </Label>
                                <Select value={form.cfdi_mensuales} onValueChange={(val) => handleChange("cfdi_mensuales", val)}>
                                    <SelectTrigger id="lc-cfdi" className="rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                                        <SelectValue placeholder="Selecciona un rango..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {CFDI_OPTIONS.map((opt) => (
                                            <SelectItem key={opt.value} value={opt.value}>
                                                {opt.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Submit */}
                            <Button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-[#0B2340] hover:bg-[#1a3a6e] text-white font-black uppercase tracking-tighter py-6 rounded-xl shadow-lg mt-2 text-sm transition-all duration-200 hover:scale-[1.01] active:scale-95"
                            >
                                {loading ? (
                                    <span className="flex items-center gap-2">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Procesando...
                                    </span>
                                ) : (
                                    "Probar Sentinel Express"
                                )}
                            </Button>

                            <div className="flex flex-col items-center gap-1.5 py-2 mt-2">
                                <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 font-medium tracking-tight">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-[#F9C646]" />
                                    <span>Sin instalación</span>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 font-medium tracking-tight">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-[#F9C646]" />
                                    <span>Resultados en menos de 2 minutos</span>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 font-medium tracking-tight">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-[#F9C646]" />
                                    <span>Hasta 500 CFDI en la prueba gratuita</span>
                                </div>
                            </div>

                            <p className="text-center text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                                Al continuar, aceptas que tus datos sean utilizados para darte seguimiento comercial.
                                <br />
                                Tu información fiscal permanece privada en tu dispositivo.
                            </p>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
