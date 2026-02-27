export interface Company {
    id: string;
    name: string;
    rfc: string;
    giro?: string;
    createdAt: number;
}

export interface ValidationHistory {
    id: string;
    companyId: string;
    timestamp: number;
    fileName: string;
    xmlCount: number;
    usableCount: number;
    alertCount: number;
    errorCount: number;
    totalAmount: number;
    results: any[];
    globalNotes?: string;
}

export const appDB = {
    // Companies
    async getCompanies(): Promise<Company[]> {
        const res = await fetch('/api/companies');
        if (!res.ok) throw new Error('Failed to fetch companies');
        return res.json();
    },
    async addCompany(company: Company) {
        const res = await fetch('/api/companies', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(company)
        });
        if (!res.ok) throw new Error('Failed to add company');
    },
    async deleteCompany(id: string) {
        const res = await fetch(`/api/companies/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete company');
    },

    // History
    async saveHistory(entry: ValidationHistory) {
        const res = await fetch('/api/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(entry)
        });
        if (!res.ok) throw new Error('Failed to save history');
    },
    async getHistoryByCompany(companyId: string): Promise<ValidationHistory[]> {
        const res = await fetch(`/api/history/${companyId}`);
        if (!res.ok) throw new Error('Failed to fetch history');
        return res.json();
    },
    async deleteHistory(id: string) {
        const res = await fetch(`/api/history/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete history');
    },
    async clearHistory(companyId: string) {
        const res = await fetch(`/api/history/clear/${companyId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to clear history');
    }
};
