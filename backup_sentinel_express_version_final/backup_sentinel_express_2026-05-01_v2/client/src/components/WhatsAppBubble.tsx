import React from "react";
import { MessageCircle } from "lucide-react";

const WHATSAPP_NUMBER = "524776355734";
const WHATSAPP_MESSAGE = encodeURIComponent(
    "Hola, estoy usando la plataforma Sentinel Express y me gustaría recibir asesoría fiscal sobre mis CFDIs."
);
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${WHATSAPP_MESSAGE}`;

export const WhatsAppBubble = () => {
    return (
        <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="fixed bottom-6 right-6 z-[9999] flex items-center justify-center w-14 h-14 bg-[#25D366] text-white rounded-full shadow-2xl transition-all duration-300 hover:scale-110 hover:bg-[#1ebe5e] group active:scale-95 animate-in fade-in zoom-in duration-500"
            aria-label="Contactar por WhatsApp"
        >
            {/* Tooltip personalizado */}
            <span className="absolute right-full mr-4 px-3 py-1.5 bg-[#0B2340] text-white text-[10px] font-black uppercase tracking-widest rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-xl border border-white/10 hidden md:block">
                Asesoría Fiscal Especializada
            </span>

            <MessageCircle className="w-7 h-7 fill-white" />

            {/* Efecto de pulso discreto */}
            <span className="absolute inset-0 rounded-full bg-[#25D366]/40 animate-ping pointer-events-none" />
        </a>
    );
};
