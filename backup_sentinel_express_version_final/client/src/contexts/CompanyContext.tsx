import React, { createContext, useContext, useState, useEffect } from 'react';
import { Company, appDB } from '@/db/appDB';
import { nanoid } from 'nanoid';
import { useAuth } from './AuthContext';

interface CompanyContextType {
    currentCompany: Company | null;
    companies: Company[];
    setCurrentCompany: (company: Company | null) => void;
    addCompany: (name: string, rfc: string, giro?: string) => Promise<void>;
    deleteCompany: (id: string) => Promise<void>;
    isLoading: boolean;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export function CompanyProvider({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();
    const [currentCompany, setCurrentCompanyState] = useState<Company | null>(null);
    const [companies, setCompanies] = useState<Company[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (user) {
            loadCompanies();
        } else {
            setCompanies([]);
            setCurrentCompanyState(null);
            setIsLoading(false);
        }
    }, [user]);

    const loadCompanies = async () => {
        setIsLoading(true);
        try {
            const data = await appDB.getCompanies();
            setCompanies(data);

            const lastCompanyId = localStorage.getItem('last_company_id');
            if (lastCompanyId) {
                const last = data.find(c => c.id === lastCompanyId);
                if (last) setCurrentCompanyState(last);
            }
        } catch (error) {
            console.error('Failed to load companies:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const setCurrentCompany = (company: Company | null) => {
        setCurrentCompanyState(company);
        if (company) {
            localStorage.setItem('last_company_id', company.id);
        } else {
            localStorage.removeItem('last_company_id');
        }
    };

    const addCompany = async (name: string, rfc: string, giro?: string) => {
        const newCompany: Company = {
            id: nanoid(),
            name,
            rfc,
            giro,
            createdAt: Date.now()
        };
        await appDB.addCompany(newCompany);
        await loadCompanies();
        if (!currentCompany) setCurrentCompany(newCompany);
    };

    const deleteCompany = async (id: string) => {
        await appDB.deleteCompany(id);
        if (currentCompany?.id === id) setCurrentCompany(null);
        await loadCompanies();
    };

    return (
        <CompanyContext.Provider value={{
            currentCompany,
            companies,
            setCurrentCompany,
            addCompany,
            deleteCompany,
            isLoading
        }}>
            {children}
        </CompanyContext.Provider>
    );
}

export function useCompany() {
    const context = useContext(CompanyContext);
    if (context === undefined) {
        throw new Error('useCompany must be used within a CompanyProvider');
    }
    return context;
}
