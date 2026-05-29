import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";
import PaymentAudit from "./pages/PaymentAudit";
import HelpCenter from "./pages/HelpCenter";
import { CompanyProvider } from "./contexts/CompanyContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import UserManagement from "./pages/UserManagement";
import Login from "./pages/Login";
import Pricing from "./pages/Pricing";
import TokenExpired from "./pages/TokenExpired";
import DemoBanner from "./components/DemoBanner";
import TokenValidation from "./pages/TokenValidation";
import AdminTokens from "./pages/AdminTokens";
import LeadCapture from "./components/LeadCapture";
import { WhatsAppBubble } from "./components/WhatsAppBubble";
import { useEffect } from "react";


function Router() {
  const { user, isLoading, isDemoMode, demoTokenData } = useAuth();

  // Backward compatibility: Redirigir /?token= a /acceso?token=
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenParam = urlParams.get("token");
    if (tokenParam && window.location.pathname !== "/acceso") {
      window.location.href = `/acceso?token=${tokenParam}`;
    }
  }, []);

  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-4 border-[#0B2340] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            Cargando...
          </p>
        </div>
      </div>
    );
  }

  // La página de captura de leads ahora es pública en /registro

  return (
    <>
      {/* Banner de modo demo - visible en todas las rutas protegidas */}
      {isDemoMode && demoTokenData && (
        <DemoBanner
          tokenData={demoTokenData}
          daysRemaining={Math.ceil(
            (new Date(demoTokenData.expiresAt + "T00:00:00").getTime() - Date.now()) /
            (1000 * 60 * 60 * 24)
          )}
          expiryDateFormatted={new Date(demoTokenData.expiresAt + "T00:00:00").toLocaleDateString("es-MX", {
            weekday: "long", year: "numeric", month: "long", day: "numeric",
          })}
        />
      )}

      {/* Espaciado para el banner en modo demo */}
      <div className={isDemoMode ? "pt-10" : ""}>
        <Switch>
          <Route path="/login" component={Login} />
          <Route path="/acceso" component={TokenValidation} />
          <Route path="/token-expired" component={TokenExpired} />
          <Route path="/registro" component={() => <LeadCapture onComplete={() => {}} />} />

          {user ? (
            <Switch>
              <Route path="/dashboard" component={Dashboard} />
              <Route path="/" component={() => { window.location.replace('/dashboard'); return null; }} />
              <Route path="/settings" component={Settings} />
              <Route path="/payment-audit" component={PaymentAudit} />
              <Route path="/help" component={HelpCenter} />
              <Route path="/manual" component={HelpCenter} />
              <Route path="/users" component={UserManagement} />
              <Route path="/pricing" component={Pricing} />
              {/* ✅ AUDIT FIX: /admin-tokens movido al bloque autenticado - era accesible sin login */}
              <Route path="/admin-tokens" component={AdminTokens} />
              <Route path="/404" component={NotFound} />
              <Route component={NotFound} />
            </Switch>
          ) : (
            <Switch>
              <Route path="/">
                {() => {
                  // Si React intenta navegar a /, forzamos recarga para que Netlify sirva la landing
                  window.location.href = '/';
                  return null;
                }}
              </Route>
              <Route>
                {() => {
                  window.location.replace('/login');
                  return null;
                }}
              </Route>
            </Switch>
          )}
        </Switch>
      </div>
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        switchable
      >
        <TooltipProvider>
          <AuthProvider>
            <CompanyProvider>
              <Toaster />
              <Router />
              <WhatsAppBubble />
            </CompanyProvider>
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
