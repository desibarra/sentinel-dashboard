import React, { useEffect, useState } from 'react';
import { appDB, ValidationHistory } from '@/db/appDB';
import { useCompany } from '@/contexts/CompanyContext';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { History, Calendar, FileText, Trash2, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';

interface HistorySidebarProps {
    onLoadHistory: (history: ValidationHistory) => void;
}

export const HistorySidebar: React.FC<HistorySidebarProps> = ({ onLoadHistory }) => {
    const { currentCompany } = useCompany();
    const [historyItems, setHistoryItems] = useState<ValidationHistory[]>([]);

    const loadHistory = async () => {
        if (currentCompany) {
            const items = await appDB.getHistoryByCompany(currentCompany.id);
            setHistoryItems(items.sort((a, b) => b.timestamp - a.timestamp));
        }
    };

    useEffect(() => {
        loadHistory();
    }, [currentCompany]);

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm('¿Eliminar este registro del histórico?')) {
            await appDB.deleteHistory(id);
            loadHistory();
            toast.success('Registro eliminado');
        }
    };

    return (
        <Sheet>
            <SheetTrigger asChild>
                <Button variant="outline" size="lg" className="gap-2">
                    <History className="w-4 h-4" />
                    <span className="hidden sm:inline">Historial Lokal</span>
                </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[400px] sm:w-[540px]">
                <SheetHeader>
                    <SheetTitle className="flex items-center gap-2 text-primary font-bold">
                        <History className="w-5 h-5" />
                        Historial de Procesos {currentCompany?.name ? `- ${currentCompany.name}` : ''}
                    </SheetTitle>
                </SheetHeader>

                <div className="mt-8 space-y-4 overflow-y-auto max-h-[calc(100vh-120px)] pr-2">
                    {!currentCompany ? (
                        <div className="text-center py-20 text-slate-500">
                            Selecciona una empresa para ver su historial.
                        </div>
                    ) : historyItems.length === 0 ? (
                        <div className="text-center py-20 text-slate-500">
                            No hay procesos registrados para esta empresa.
                        </div>
                    ) : (
                        historyItems.map((item) => (
                            <div
                                key={item.id}
                                onClick={() => onLoadHistory(item)}
                                className="group p-4 bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-xl hover:border-primary dark:hover:border-primary cursor-pointer transition-all shadow-sm hover:shadow-md"
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                                        <Calendar className="w-3 h-3" />
                                        {format(item.timestamp, "d 'de' MMMM, HH:mm", { locale: es })}
                                    </div>
                                    <button
                                        onClick={(e) => handleDelete(item.id, e)}
                                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 transition-all"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>

                                <h4 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-3">
                                    <FileText className="w-4 h-4 text-primary" />
                                    {item.fileName}
                                </h4>

                                <div className="grid grid-cols-3 gap-2">
                                    <div className="p-2 bg-emerald-50 dark:bg-emerald-900/10 rounded-lg text-center border border-emerald-100 dark:border-emerald-800">
                                        <div className="text-[9px] text-emerald-800 dark:text-emerald-400 font-bold uppercase">Usables</div>
                                        <div className="text-lg font-bold text-emerald-900 dark:text-emerald-500">{item.usableCount}</div>
                                    </div>
                                    <div className="p-2 bg-amber-50 dark:bg-amber-900/10 rounded-lg text-center border border-amber-100 dark:border-amber-800">
                                        <div className="text-[9px] text-amber-800 dark:text-amber-400 font-bold uppercase">Alertas</div>
                                        <div className="text-lg font-bold text-amber-900 dark:text-amber-500">{item.alertCount}</div>
                                    </div>
                                    <div className="p-2 bg-red-50 dark:bg-red-900/10 rounded-lg text-center border border-red-100 dark:border-red-800">
                                        <div className="text-[9px] text-red-800 dark:text-red-400 font-bold uppercase">Riesgo</div>
                                        <div className="text-lg font-bold text-red-900 dark:text-red-500">{item.errorCount}</div>
                                    </div>
                                </div>

                                <div className="mt-4 pt-4 border-t dark:border-slate-800 flex justify-between items-center">
                                    <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                                        {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(item.totalAmount)}
                                    </div>
                                    <div className="text-primary text-xs font-bold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                                        Recargar <ChevronRight className="w-3 h-3" />
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
};
