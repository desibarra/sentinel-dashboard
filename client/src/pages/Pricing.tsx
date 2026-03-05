import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Star, Shield, Zap, ArrowLeft, MessageCircle } from "lucide-react";
import { Link } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";

export default function Pricing() {
    const { theme } = useTheme();

    const plans = [
        {
            name: "Básico",
            description: "Para pequeños contribuyentes y freelancers.",
            price: "Gratis",
            features: [
                "Hasta 200 XML por mes",
                "Validación de estructura CFDI 4.0",
                "Diagnóstico fiscal básico",
                "Exportación a Excel",
                "Soporte por comunidad"
            ],
            cta: "Comenzar Gratis",
            popular: false,
            icon: <Shield className="w-5 h-5 text-slate-400" />
        },
        {
            name: "Pro Professional",
            description: "Para contadores y administradores con alto volumen.",
            price: "$499",
            period: "/ mes",
            features: [
                "XML Ilimitados",
                "Estatus SAT en Tiempo Real",
                "Validación Masiva (Lotes >3000)",
                "Detección de RFCs en Listas Negras",
                "Historial de Procesos Ilimitado",
                "Soporte Prioritario WhatsApp"
            ],
            cta: "Obtener Plan Pro",
            popular: true,
            icon: <Zap className="w-5 h-5 text-accent" />,
            highlight: "Más Popular"
        },
        {
            name: "Enterprise",
            description: "Soluciones a medida para grandes corporativos.",
            price: "Personalizado",
            features: [
                "Todo lo del Plan Pro",
                "Multi-empresa sin límites",
                "API de Integración Directa",
                "Reportes Fiscales Personalizados",
                "Capacitación de Equipo",
                "Account Manager Dedicado"
            ],
            cta: "Contactar Ventas",
            popular: false,
            icon: <Star className="w-5 h-5 text-indigo-400" />
        }
    ];

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 transition-colors duration-500 pb-20">
            {/* Header / Navigation */}
            <div className="max-w-7xl mx-auto px-6 pt-8 pb-12">
                <div className="flex justify-between items-center mb-16">
                    <Link href="/">
                        <Button variant="ghost" className="gap-2 text-slate-500 hover:text-[#0B2340] dark:hover:text-white transition-colors">
                            <ArrowLeft className="w-4 h-4" />
                            Volver al Dashboard
                        </Button>
                    </Link>

                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-[#0B2340] rounded-lg">
                            <Zap className="w-4 h-4 text-accent" />
                        </div>
                        <span className="font-black text-slate-900 dark:text-white tracking-widest uppercase text-xs">
                            Sentinel<span className="text-accent">Express</span>
                        </span>
                    </div>
                </div>

                {/* Main Hero Section */}
                <div className="text-center max-w-3xl mx-auto mb-20 animate-in fade-in slide-in-from-bottom-6 duration-1000">
                    <Badge variant="outline" className="mb-4 px-4 py-1 text-accent border-accent/30 bg-accent/5 font-black uppercase tracking-[0.2em] text-[10px]">
                        Planes y Membresías 2026
                    </Badge>
                    <h1 className="text-5xl md:text-6xl font-black text-[#0B2340] dark:text-white tracking-tighter mb-6">
                        Elige tu nivel de <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent to-indigo-400">Protección Fiscal</span>
                    </h1>
                    <p className="text-lg text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                        Analiza tus CFDI con la potencia de Sentinel Express y mantén el control total de tus transacciones ante el SAT. Sin complicaciones, 100% privado.
                    </p>
                </div>

                {/* Pricing Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
                    {plans.map((plan, idx) => (
                        <Card key={idx} className={`relative border-0 shadow-2xl rounded-[2.5rem] overflow-hidden transition-all duration-300 hover:-translate-y-2 group ${plan.popular
                                ? 'bg-[#0B2340] text-white ring-4 ring-accent/20'
                                : 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800'
                            }`}>
                            {plan.popular && (
                                <div className="absolute top-0 right-0 left-0 h-1.5 bg-gradient-to-r from-accent via-indigo-400 to-accent animate-gradient-x" />
                            )}

                            <CardHeader className="pt-10 pb-6 px-8">
                                <div className="flex justify-between items-start mb-4">
                                    <div className={`p-3 rounded-2xl ${plan.popular ? 'bg-white/10' : 'bg-slate-100 dark:bg-white/5'}`}>
                                        {plan.icon}
                                    </div>
                                    {plan.highlight && (
                                        <Badge className="bg-accent text-[#0B2340] font-black uppercase tracking-widest text-[9px] px-3 py-1">
                                            {plan.highlight}
                                        </Badge>
                                    )}
                                </div>
                                <CardTitle className="text-2xl font-black tracking-tight">{plan.name}</CardTitle>
                                <CardDescription className={plan.popular ? 'text-slate-300' : 'text-slate-500'}>
                                    {plan.description}
                                </CardDescription>
                            </CardHeader>

                            <CardContent className="px-8 pb-8 flex-grow">
                                <div className="mb-8 flex items-baseline gap-1">
                                    <span className="text-4xl font-black tracking-tighter">{plan.price}</span>
                                    {plan.period && <span className={`text-sm font-bold ${plan.popular ? 'text-slate-400' : 'text-slate-500'}`}>{plan.period}</span>}
                                </div>

                                <ul className="space-y-4">
                                    {plan.features.map((feature, fIdx) => (
                                        <li key={fIdx} className="flex items-center gap-3 text-sm font-medium">
                                            <CheckCircle2 className={`w-4 h-4 flex-shrink-0 ${plan.popular ? 'text-accent' : 'text-emerald-500'}`} />
                                            <span className={plan.popular ? 'text-slate-200' : 'text-slate-600 dark:text-slate-300'}>
                                                {feature}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </CardContent>

                            <CardFooter className="px-8 pb-10">
                                <Button className={`w-full h-14 rounded-2xl font-black uppercase tracking-widest text-xs transition-all duration-300 shadow-xl ${plan.popular
                                        ? 'bg-accent hover:bg-white text-[#0B2340] shadow-accent/20 hover:shadow-white/20'
                                        : 'bg-[#0B2340] dark:bg-white text-white dark:text-[#0B2340] hover:scale-[1.02]'
                                    }`}>
                                    {plan.cta}
                                </Button>
                            </CardFooter>
                        </Card>
                    ))}
                </div>

                {/* Trust Footer */}
                <div className="mt-24 text-center">
                    <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-400 mb-8">
                        Aceptamos múltiples métodos de pago
                    </p>
                    <div className="flex flex-wrap justify-center items-center gap-10 opacity-30 grayscale hover:grayscale-0 transition-all duration-500">
                        {/* Placeholder icons for payment methods */}
                        <div className="font-extrabold text-2xl h-8 flex items-center">STRIPE</div>
                        <div className="font-extrabold text-2xl h-8 flex items-center">MERCADO PAGO</div>
                        <div className="font-extrabold text-2xl h-8 flex items-center">VISA</div>
                        <div className="font-extrabold text-2xl h-8 flex items-center">MASTERCARD</div>
                    </div>
                </div>

                {/* Floating WhatsApp for custom quotes */}
                <div className="mt-16 bg-white dark:bg-slate-900 p-8 rounded-[2rem] shadow-xl border border-slate-100 dark:border-slate-800 flex flex-col md:flex-row items-center justify-between gap-6 max-w-4xl mx-auto">
                    <div className="flex items-center gap-4 text-center md:text-left">
                        <div className="p-4 bg-[#25D366]/10 rounded-full">
                            <MessageCircle className="w-8 h-8 text-[#25D366]" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold dark:text-white">¿Necesitas un plan personalizado?</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400">Hablamos el mismo idioma. Nuestro equipo fiscal está listo para asesorarte.</p>
                        </div>
                    </div>
                    <Button
                        onClick={() => window.open("https://wa.me/524776355734", "_blank")}
                        className="bg-[#25D366] hover:bg-[#1ebe5e] text-white rounded-xl px-8 h-12 font-black uppercase tracking-tight gap-2"
                    >
                        Chatear con un Experto
                    </Button>
                </div>
            </div>
        </div>
    );
}
