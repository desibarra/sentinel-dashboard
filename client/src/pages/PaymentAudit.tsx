
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import UploadZone, { UploadedFile } from "@/components/UploadZone";
import { toast } from "sonner";
import { useTheme } from "@/contexts/ThemeContext";
import { FileText, Download, Trash2, Sun, Moon, DollarSign, CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import * as XLSX from "xlsx";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";

// Interfaces for our specific Audit logic
interface PaymentRelation {
    idDocumento: string; // UUID of the related invoice
    monedaDR: string;
    metodoDePagoDR: string;
    numParcialidad: string;
    impSaldoAnt: number;
    impPagado: number;
    impSaldoInsoluto: number;
    serie?: string;
    folio?: string;
    // New fields for auditing
    fechaPago?: string; // Date of the payment complement
    uuidPago?: string; // UUID of the payment complement
}

interface PaymentDoc {
    uuid: string;
    fecha: string;
    moneda: string;
    montoTotal: number;
    relacionados: PaymentRelation[];
    xmlContent: string;
    fileName: string;
}

interface InvoiceDoc {
    uuid: string;
    serie: string;
    folio: string;
    fecha: string;
    moneda: string;
    total: number;
    metodoPago: string; // PUE vs PPD
    xmlContent: string;
    fileName: string;

    // Calculated fields
    pagosRelacionados: PaymentRelation[];
    saldoCalculado: number;
    montoPagadoCalculado: number; // Sum of impPagado from related documents
    estadoPago: "Pagado" | "Parcial" | "Pendiente";
}

export default function PaymentAudit() {
    const { theme, toggleTheme } = useTheme();
    const [invoices, setInvoices] = useState<InvoiceDoc[]>([]);
    const [payments, setPayments] = useState<PaymentDoc[]>([]);
    const [loading, setLoading] = useState(false);
    const [processedCount, setProcessedCount] = useState({ current: 0, total: 0 });

    // Custom parser for audit needs
    const parseFiles = async (files: UploadedFile[]) => {
        setLoading(true);
        setProcessedCount({ current: 0, total: files.length });

        const newInvoices: InvoiceDoc[] = [];
        const newPayments: PaymentDoc[] = [];
        const processedUUIDs = new Set<string>(); // Check duplicates in current batch

        const parser = new DOMParser();

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (!file.content) continue;

            try {
                const xmlDoc = parser.parseFromString(file.content, "text/xml");
                const comprobante = xmlDoc.getElementsByTagName("cfdi:Comprobante")[0] || xmlDoc.getElementsByTagName("Comprobante")[0];

                if (!comprobante) continue;

                // Get UUID early for duplicate check
                const timbre = xmlDoc.getElementsByTagName("tfd:TimbreFiscalDigital")[0] || xmlDoc.getElementsByTagName("TimbreFiscalDigital")[0];
                const uuid = timbre?.getAttribute("UUID")?.toUpperCase() || "";

                if (!uuid || processedUUIDs.has(uuid)) {
                    // Duplicate in batch, skip
                    continue;
                }

                // Check against existing UUIDs (simple check)
                if (invoices.some(inv => inv.uuid === uuid) || payments.some(pay => pay.uuid === uuid)) {
                    // Already loaded
                    continue;
                }

                processedUUIDs.add(uuid);

                const tipoDeComprobante = comprobante.getAttribute("TipoDeComprobante");
                const fecha = comprobante.getAttribute("Fecha") || "";
                const serie = comprobante.getAttribute("Serie") || "";
                const folio = comprobante.getAttribute("Folio") || "";
                const moneda = comprobante.getAttribute("Moneda") || "MXN";
                const total = parseFloat(comprobante.getAttribute("Total") || "0");

                if (tipoDeComprobante === "I" || tipoDeComprobante === "E") {
                    if (tipoDeComprobante === "I") {
                        newInvoices.push({
                            uuid,
                            serie,
                            folio,
                            fecha,
                            moneda,
                            total,
                            metodoPago: comprobante.getAttribute("MetodoPago") || "",
                            xmlContent: file.content,
                            fileName: file.name,
                            pagosRelacionados: [],
                            saldoCalculado: total,
                            montoPagadoCalculado: 0,
                            estadoPago: "Pendiente"
                        });
                    }
                } else if (tipoDeComprobante === "P") {
                    // Payment Complement
                    const pagosNode = xmlDoc.getElementsByTagName("pago10:Pagos")[0] || xmlDoc.getElementsByTagName("pago20:Pagos")[0] || xmlDoc.getElementsByTagName("Pagos")[0];

                    if (pagosNode) {
                        const pagos = pagosNode.getElementsByTagName("pago10:Pago");
                        const pagos20 = pagosNode.getElementsByTagName("pago20:Pago");
                        const genericPagos = pagosNode.getElementsByTagName("Pago"); // Fallback

                        const allPagoNodes = [...Array.from(pagos), ...Array.from(pagos20), ...Array.from(genericPagos)];

                        const paymentRelations: PaymentRelation[] = [];
                        let montoTotalPago = 0;

                        for (const pago of allPagoNodes) {
                            montoTotalPago += parseFloat(pago.getAttribute("Monto") || "0");
                            const fechaPago = pago.getAttribute("FechaPago") || fecha; // Fallback to Document Date

                            // Extract DoctoRelacionado
                            const doctos = pago.getElementsByTagName("pago10:DoctoRelacionado");
                            const doctos20 = pago.getElementsByTagName("pago20:DoctoRelacionado");
                            const doctosGeneric = pago.getElementsByTagName("DoctoRelacionado");

                            const allDoctos = [...Array.from(doctos), ...Array.from(doctos20), ...Array.from(doctosGeneric)];

                            for (const doc of allDoctos) {
                                paymentRelations.push({
                                    idDocumento: (doc.getAttribute("IdDocumento") || "").toUpperCase(),
                                    monedaDR: doc.getAttribute("MonedaDR") || "",
                                    metodoDePagoDR: doc.getAttribute("MetodoDePagoDR") || "",
                                    numParcialidad: doc.getAttribute("NumParcialidad") || "",
                                    impSaldoAnt: parseFloat(doc.getAttribute("ImpSaldoAnt") || "0"),
                                    impPagado: parseFloat(doc.getAttribute("ImpPagado") || "0"),
                                    impSaldoInsoluto: parseFloat(doc.getAttribute("ImpSaldoInsoluto") || "0"),
                                    serie: doc.getAttribute("Serie") || "",
                                    folio: doc.getAttribute("Folio") || "",
                                    fechaPago: fechaPago,
                                    uuidPago: uuid
                                });
                            }
                        }

                        newPayments.push({
                            uuid,
                            fecha,
                            moneda,
                            montoTotal: montoTotalPago,
                            relacionados: paymentRelations,
                            xmlContent: file.content,
                            fileName: file.name
                        });
                    }
                }
            } catch (e) {
                console.error("Error parsing file " + file.name, e);
            }

            setProcessedCount({ current: i + 1, total: files.length });
        }

        // MATCHING LOGIC (Using strict ImpSaldoInsoluto logic when possible)
        const combinedInvoices = [...invoices, ...newInvoices];
        const combinedPayments = [...payments, ...newPayments];

        // Reset state
        const processedInvoices = combinedInvoices.map(inv => ({
            ...inv,
            pagosRelacionados: [] as PaymentRelation[],
            saldoCalculado: inv.total,
            montoPagadoCalculado: 0,
            estadoPago: "Pendiente" as "Pendiente" | "Pagado" | "Parcial"
        }));

        // Flatten all payment relations from all loaded payments
        const allRelations: PaymentRelation[] = [];
        combinedPayments.forEach(pay => {
            allRelations.push(...pay.relacionados);
        });

        // Assign relations to invoices
        processedInvoices.forEach(inv => {
            // Find all payments related to this invoice
            const relations = allRelations.filter(rel => rel.idDocumento === inv.uuid);

            // Sort by Date (descending) to find the LATEST payment
            // If dates are equal (same day), assume newer implies less balance? Or sort by ImpSaldoInsoluto ascending (safer)
            relations.sort((a, b) => {
                const dateA = new Date(a.fechaPago || "");
                const dateB = new Date(b.fechaPago || "");
                if (dateA.getTime() !== dateB.getTime()) {
                    return dateB.getTime() - dateA.getTime(); // Newest first
                }
                // If same date, the one with lower ImpSaldoInsoluto is likely the later one
                return a.impSaldoInsoluto - b.impSaldoInsoluto;
            });

            inv.pagosRelacionados = relations;

            // Sum of payments evidence loaded in this session
            const totalPaidEvidence = relations.reduce((acc, curr) => acc + curr.impPagado, 0);
            inv.montoPagadoCalculado = totalPaidEvidence;

            // Balance Logic:
            // If we have payments, the "Real Balance" is the ImpSaldoInsoluto of the LATEST payment.
            // Why? Because historical payments might be missing from the load, but the latest XML tells the truth about the balance at that moment.
            if (relations.length > 0) {
                // Latest payment is index 0 after sort
                inv.saldoCalculado = relations[0].impSaldoInsoluto;
            } else {
                // No payments loaded -> Balance is Total
                inv.saldoCalculado = inv.total;
            }

            // Status Logic
            if (inv.saldoCalculado <= 0.10) { // Tolerance
                inv.estadoPago = "Pagado";
                inv.saldoCalculado = 0;
            } else if (inv.saldoCalculado < inv.total - 0.10) {
                // If existing balance is significantly less than total
                inv.estadoPago = "Parcial";
            } else {
                inv.estadoPago = "Pendiente";
            }
        });

        setInvoices(processedInvoices);
        setPayments(combinedPayments);
        setLoading(false);
        toast.success(`Procesados: ${newInvoices.length} Facturas, ${newPayments.length} Pagos`);
    };

    const handleClearData = () => {
        if (confirm("¿Limpiar todos los datos?")) {
            setInvoices([]);
            setPayments([]);
        }
    };

    const handleExportExcel = () => {
        const data = invoices.map(inv => ({
            "UUID Factura": inv.uuid,
            "Serie": inv.serie,
            "Folio": inv.folio,
            "Fecha Emisión": inv.fecha,
            "Moneda": inv.moneda,
            "Total Factura": inv.total,
            "Método Pago": inv.metodoPago,
            "Estado Pago": inv.estadoPago,
            "Saldo Pendiente (S. Insoluto)": inv.saldoCalculado,
            "Monto Pagado (Evidencia)": inv.montoPagadoCalculado,
            "Pagos Relacionados": inv.pagosRelacionados.map(p => `$${p.impPagado} (${p.numParcialidad})`).join(", "),
            "Ultima Fecha Pago": inv.pagosRelacionados.length > 0 ? (inv.pagosRelacionados[0].fechaPago || "") : ""
        }));

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Auditoría Pagos");
        XLSX.writeFile(wb, "Reporte_Auditoria_Pagos.xlsx");
        toast.success("Excel generado exitosamente");
    };

    const handleExportCSV = () => {
        // Simple CSV export
        const headers = ['UUID Factura', 'Folio', 'Total', 'Monto Pagado', 'Saldo Pendiente', 'Estado'];
        const rows = invoices.map(f => [
            f.uuid,
            `${f.serie}${f.folio}`,
            f.total.toFixed(2),
            f.montoPagadoCalculado.toFixed(2),
            f.saldoCalculado.toFixed(2),
            f.estadoPago
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(r => r.join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `auditoria_pagos_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success("CSV generado exitosamente");
    };

    // Stats
    const totalFacturado = invoices.reduce((acc, curr) => acc + curr.total, 0);
    const totalPendiente = invoices.reduce((acc, curr) => acc + curr.saldoCalculado, 0);
    // Paid is Total - Pending (Global view) implies strict matching. 
    // Or we can sum montoPagadoCalculado for "Evidence Loaded".
    // Let's use the Balance view for consistency with audit.
    // Actually, TotalFacturado - TotalPendiente = TotalAmortizado (Real Paid acc to SAT)
    const totalAmortizado = totalFacturado - totalPendiente;

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4 md:p-8 transition-colors duration-200">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="mb-8 flex items-start justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">Auditoría de Pagos</h1>
                        <p className="text-slate-600 dark:text-slate-400">Cruce automático de Facturas vs Complementos de Pago</p>
                    </div>
                    <div className="flex gap-2">
                        <Link href="/">
                            <Button variant="outline" size="icon" title="Volver al Dashboard">
                                <FileText className="w-4 h-4" />
                            </Button>
                        </Link>
                        <Button onClick={toggleTheme} variant="outline" size="icon">
                            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                        </Button>
                        {invoices.length > 0 && (
                            <>
                                <Button onClick={handleClearData} variant="destructive">
                                    <Trash2 className="w-4 h-4 mr-2" /> Limpiar
                                </Button>
                                <Button onClick={handleExportExcel}>
                                    <Download className="w-4 h-4 mr-2" /> Excel
                                </Button>
                                <Button onClick={handleExportCSV} variant="outline">
                                    <FileText className="w-4 h-4 mr-2" /> CSV
                                </Button>
                            </>
                        )}
                    </div>
                </div>

                {/* Upload */}
                <div className="mb-8">
                    <UploadZone
                        onFilesReady={parseFiles}
                        isValidating={loading}
                        hasValidatedResults={invoices.length > 0}
                    />
                    {loading && (
                        <div className="text-center mt-2 text-sm text-slate-500">
                            Procesando {processedCount.current} de {processedCount.total}...
                        </div>
                    )}
                </div>

                {/* Stats */}
                {invoices.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                        <Card className="dark:bg-slate-800">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-slate-500">Total Facturas</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{invoices.length}</div>
                                <p className="text-xs text-slate-500">Documentos Tipo I</p>
                            </CardContent>
                        </Card>
                        <Card className="dark:bg-slate-800">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-slate-500">Total Facturado</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-blue-600">${totalFacturado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div>
                            </CardContent>
                        </Card>
                        <Card className="dark:bg-slate-800">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-slate-500">Amortizado (SAT)</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-green-600">${totalAmortizado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div>
                                <p className="text-xs text-slate-500">Según Saldos Insolutos</p>
                            </CardContent>
                        </Card>
                        <Card className="dark:bg-slate-800">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-slate-500">Saldo Pendiente</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-red-600">${totalPendiente.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* Tables */}
                {invoices.length > 0 && (
                    <Card className="dark:bg-slate-800">
                        <CardHeader>
                            <CardTitle>Detalle de Conciliación</CardTitle>
                            <CardDescription>Comparativa Facturas vs Pagos detectados</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-700 dark:text-slate-400">
                                        <tr>
                                            <th className="px-6 py-3">UUID</th>
                                            <th className="px-6 py-3">Folio</th>
                                            <th className="px-6 py-3">Total</th>
                                            <th className="px-6 py-3">Amortizado</th>
                                            <th className="px-6 py-3">Saldo</th>
                                            <th className="px-6 py-3">Estado</th>
                                            <th className="px-6 py-3">Pagos (Evidencia)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {invoices.map((inv) => (
                                            <tr key={inv.uuid} className="bg-white border-b dark:bg-slate-800 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700">
                                                <td className="px-6 py-4 font-mono text-xs max-w-[150px] truncate" title={inv.uuid}>{inv.uuid}</td>
                                                <td className="px-6 py-4">{inv.serie}{inv.folio}</td>
                                                <td className="px-6 py-4 font-bold text-slate-900 dark:text-white">${inv.total.toFixed(2)}</td>
                                                <td className="px-6 py-4 text-green-600">${(inv.total - inv.saldoCalculado).toFixed(2)}</td>
                                                <td className="px-6 py-4 text-red-600">${inv.saldoCalculado.toFixed(2)}</td>
                                                <td className="px-6 py-4">
                                                    {inv.estadoPago === "Pagado" && <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Pagado</Badge>}
                                                    {inv.estadoPago === "Parcial" && <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Parcial</Badge>}
                                                    {inv.estadoPago === "Pendiente" && <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Pendiente</Badge>}
                                                </td>
                                                <td className="px-6 py-4 text-xs">
                                                    {inv.pagosRelacionados.length === 0 ? (
                                                        <span className="text-slate-400">Sin evidencia</span>
                                                    ) : (
                                                        <ul className="list-disc pl-4">
                                                            {inv.pagosRelacionados.map((p, idx) => (
                                                                <li key={idx}>
                                                                    ${p.impPagado.toFixed(2)} (Parc. {p.numParcialidad}) - {p.fechaPago}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
