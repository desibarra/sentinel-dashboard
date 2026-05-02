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
import AdminTokens from "./pages/AdminTokens";
import LeadCapture from "./components/LeadCapture";
import { WhatsAppBubble } from "./components/WhatsAppBubble";
import { useState, useEffect } from "react";
import { persistDemoSession } from "./utils/tokenValidator";
import { appDB } from "./db/appDB";
import { jsonbinService } from "./services/jsonbinService";
import { loadDemoDataIfEmpty } from "./data/demoData";
import { isLeadRegistered, markLeadRegistered } from "./services/leadService";


function Router() {
  const { user, isLoading, isDemoMode, demoTokenData, login } = useAuth();
  const [isCheckingToken, setIsCheckingToken] = useState(false);
  const [tokenInvalid, setTokenInvalid] = useState(false);
  const [tokenExpired, setTokenExpired] = useState(false);
  // Eliminar estado leadReady innecesario ahora que /registro es público.

  // Leer ?token= de la URL al montar el componente y validar contra JSONBin
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenParam = urlParams.get("token");
    if (!tokenParam) return;

    setIsCheckingToken(true);
    jsonbinService.validateToken(tokenParam)
      .then(async (tokenData) => {
        if (!tokenData) {
          // Puede estar expirado o no existir - checar si existe pero expirado
          setTokenInvalid(true);
          return;
        }
        // Token válido: auto-login
        const demoUser = {
          id: "demo-user-" + tokenData.id,
          username: "Demo · " + tokenData.label,
          role: "demo",
        };
        // Convertir ManagedToken a DemoToken para compatibilidad
        const demoToken = {
          token: tokenData.token,
          label: tokenData.label,
          expiresAt: tokenData.expiresAt,
          demoCompanyRFC: tokenData.demoCompanyRFC,
          demoCompanyName: tokenData.demoCompanyName,
        };
        login(demoUser, demoToken);
        persistDemoSession(demoToken);
        // Cargar datos de ejemplo si la BD está vacía
        await loadDemoDataIfEmpty(appDB);
        // Limpiar el token de la URL sin recargar
        window.history.replaceState({}, "", window.location.pathname);
      })
      .catch(() => setTokenInvalid(true))
      .finally(() => setIsCheckingToken(false));
  }, []);

  if (isLoading || isCheckingToken) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-4 border-[#0B2340] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            {isCheckingToken ? "Verificando acceso demo..." : "Cargando..."}
          </p>
        </div>
      </div>
    );
  }

  // Token en URL pero inválido (no existe o desactivado)
  if (tokenInvalid) {
    return <TokenExpired />;
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
          <Route path="/token-expired" component={TokenExpired} />
          <Route path="/admin-tokens" component={AdminTokens} />
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
              <Route path="/404" component={NotFound} />
              <Route component={NotFound} />
            </Switch>
          ) : (
            <Route>
              {() => {
                window.location.replace('/login');
                return null;
              }}
            </Route>
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
