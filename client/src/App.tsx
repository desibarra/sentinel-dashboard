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
import TokenExpired from "./pages/TokenExpired";
import DemoBanner from "./components/DemoBanner";
import AdminTokens from "./pages/AdminTokens";
import { useEffect } from "react";
import { validateURLToken, persistDemoSession } from "./utils/tokenValidator";
import { appDB } from "./db/appDB";
import { loadDemoDataIfEmpty } from "./data/demoData";


function Router() {
  const { user, isLoading, isDemoMode, demoTokenData, login } = useAuth();

  // Leer ?token= de la URL al montar el componente
  useEffect(() => {
    const result = validateURLToken();
    if (result.valid && result.tokenData) {
      if (result.expired) return; // La pantalla de expirado la maneja el render
      // Auto-login en modo demo
      const demoUser = {
        id: "demo-user-" + result.tokenData.token,
        username: "Demo · " + result.tokenData.label,
        role: "demo",
      };
      login(demoUser, result.tokenData);
      persistDemoSession(result.tokenData);
      // Cargar datos de ejemplo si la BD está vacía
      loadDemoDataIfEmpty(appDB);
      // Limpiar el token de la URL sin recargar (para URL limpia)
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, "", cleanUrl);
    }
  }, []);

  // Verificar si hay token en URL y está expirado
  const urlTokenResult = validateURLToken();
  if (urlTokenResult.valid && urlTokenResult.expired) {
    return <TokenExpired />;
  }

  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-4 border-[#0B2340] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Cargando...</p>
        </div>
      </div>
    );
  }

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

          {user ? (
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/settings" component={Settings} />
              <Route path="/payment-audit" component={PaymentAudit} />
              <Route path="/help" component={HelpCenter} />
              <Route path="/manual" component={HelpCenter} />
              <Route path="/users" component={UserManagement} />
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
            </CompanyProvider>
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
