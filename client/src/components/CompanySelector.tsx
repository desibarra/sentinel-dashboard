import React, { useState } from 'react';
import { useCompany } from '@/contexts/CompanyContext';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    SelectSeparator
} from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building2, Plus, LogOut } from 'lucide-react';
import { toast } from 'sonner';

export const CompanySelector = () => {
    const { currentCompany, companies, setCurrentCompany, addCompany } = useCompany();
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [newName, setNewName] = useState('');
    const [newRfc, setNewRfc] = useState('');

    const handleAddCompany = async () => {
        if (!newName || !newRfc) {
            toast.error('Por favor completa todos los campos');
            return;
        }
        await addCompany(newName, newRfc);
        setNewName('');
        setNewRfc('');
        setIsAddOpen(false);
        toast.success('Empresa registrada correctamente');
    };

    return (
        <div id="company-selector" className="flex items-center gap-2">
            <Select
                value={currentCompany?.id || ""}
                onValueChange={(id) => {
                    const comp = companies.find(c => c.id === id);
                    setCurrentCompany(comp || null);
                }}
            >
                <SelectTrigger className="w-[250px] bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm transition-all focus:ring-primary/20">
                    <div className="flex items-center gap-2 truncate">
                        <Building2 className="w-4 h-4 text-primary" />
                        <SelectValue placeholder="Seleccionar Empresa" />
                    </div>
                </SelectTrigger>
                <SelectContent>
                    {companies.map((company) => (
                        <SelectItem key={company.id} value={company.id}>
                            <div className="flex flex-col">
                                <span className="font-medium">{company.name}</span>
                                <span className="text-[10px] text-slate-500">{company.rfc}</span>
                            </div>
                        </SelectItem>
                    ))}
                    {companies.length > 0 && <SelectSeparator />}
                    <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                        <DialogTrigger asChild>
                            <button className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-primary hover:bg-primary/5 rounded-md transition-colors font-bold">
                                <Plus className="w-4 h-4" />
                                Nueva Empresa
                            </button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Registrar Nueva Razón Social</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Nombre de la Empresa</Label>
                                    <Input
                                        id="name"
                                        placeholder="Ej. Comercializadora SA de CV"
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="rfc">RFC</Label>
                                    <Input
                                        id="rfc"
                                        placeholder="GUR123456789"
                                        value={newRfc}
                                        onChange={(e) => setNewRfc(e.target.value)}
                                    />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancelar</Button>
                                <Button onClick={handleAddCompany} className="bg-primary hover:bg-primary/90">Guardar Empresa</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </SelectContent>
            </Select>

            {currentCompany && (
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setCurrentCompany(null)}
                    className="text-slate-400 hover:text-red-500"
                    title="Cerrar sesión de empresa"
                >
                    <LogOut className="w-4 h-4" />
                </Button>
            )}
        </div>
    );
};
