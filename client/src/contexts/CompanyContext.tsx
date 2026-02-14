import React, { createContext, useContext, useState, useEffect } from 'react';
import { Company, appDB } from '@/db/appDB';
import { nanoid } from 'nanoid';

interface CompanyContextType {
    currentCompany: Company | null;
    companies: Company[];
    setCurrentCompany: (company: Company | null) => void;
    addCompany: (name: string, rfc: string) => Promise<void>;
    deleteCompany: (id: string) => Promise<void>;
    isLoading: boolean;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export function CompanyProvider({ children }: { children: React.ReactNode }) {
    const [currentCompany, setCurrentCompanyState] = useState<Company | null>(null);
    const [companies, setCompanies] = useState<Company[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        loadCompanies();
    }, []);

    const loadCompanies = async () => {
        const data = await appDB.getCompanies();
        setCompanies(data);

        // Load last used company from local storage
        const lastCompanyId = localStorage.getItem('last_company_id');
        if (lastCompanyId) {
            const last = data.find(c => c.id === lastCompanyId);
            if (last) setCurrentCompanyState(last);
        }

        setIsLoading(false);
    };

    const setCurrentCompany = (company: Company | null) => {
        setCurrentCompanyState(company);
        if (company) {
            localStorage.setItem('last_company_id', company.id);
        } else {
            localStorage.removeItem('last_company_id');
        }
    };

    const addCompany = async (name: string, rfc: string) => {
        const newCompany: Company = {
            id: nanoid(),
            name,
            rfc,
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
