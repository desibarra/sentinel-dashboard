import React, { createContext, useContext, useState, useEffect } from "react";
import { useLocation } from "wouter";
import { DemoToken } from "@/config/tokenConfig";

interface User {
    id: string;
    username: string;
    role: string;
}

interface AuthContextType {
    user: User | null;
    isLoading: boolean;
    isDemoMode: boolean;
    demoTokenData: DemoToken | null;
    login: (user: User, demoToken?: DemoToken) => void;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isDemoMode, setIsDemoMode] = useState(false);
    const [demoTokenData, setDemoTokenData] = useState<DemoToken | null>(null);
    const [, setLocation] = useLocation();

    useEffect(() => {
        checkAuth();
    }, []);

    const checkAuth = async () => {
        try {
            // Verificar sesión normal
            const storedUser = localStorage.getItem("sentinel_user");
            if (storedUser) {
                setUser(JSON.parse(storedUser));
            }
            // Verificar sesión de demo
            const storedDemo = sessionStorage.getItem("demo_token");
            if (storedDemo) {
                const tokenData: DemoToken = JSON.parse(storedDemo);
                setDemoTokenData(tokenData);
                setIsDemoMode(true);
                // Si no hay usuario normal, crear uno demo
                if (!storedUser) {
                    setUser({ id: "demo-user", username: "Demo", role: "demo" });
                }
            }
        } catch (e) {
            setUser(null);
        } finally {
            setIsLoading(false);
        }
    };

    const login = (userData: User, demoToken?: DemoToken) => {
        setUser(userData);
        if (demoToken) {
            setIsDemoMode(true);
            setDemoTokenData(demoToken);
            sessionStorage.setItem("demo_token", JSON.stringify(demoToken));
        } else {
            localStorage.setItem("sentinel_user", JSON.stringify(userData));
        }
    };

    const logout = async () => {
        localStorage.removeItem("sentinel_user");
        sessionStorage.removeItem("demo_token");
        setUser(null);
        setIsDemoMode(false);
        setDemoTokenData(null);
        setLocation("/login");
    };

    return (
        <AuthContext.Provider value={{ user, isLoading, isDemoMode, demoTokenData, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}

