import { useState, useEffect } from 'react';
import { HelpSidebar } from '@/components/help/HelpSidebar';
import { HelpArticle } from '@/components/help/HelpArticle';
import { HelpSearch } from '@/components/help/HelpSearch';
import { HELP_REGISTRY, HelpArticle as HelpArticleType } from '@/content/help/registry';
import { Button } from '@/components/ui/button';
import { ArrowLeft, BookOpen, Globe, MessageCircle } from 'lucide-react';
import { Link } from 'wouter';

export default function HelpCenter() {
    const [selectedArticle, setSelectedArticle] = useState<HelpArticleType>(HELP_REGISTRY[0].articles[0]);

    // Manejar el artículo seleccionado desde el buscador o sidebar
    const handleSelectArticle = (article: HelpArticleType) => {
        setSelectedArticle(article);
        // Podríamos añadir pushState aquí si queremos URLs amigables para cada artículo
    };

    return (
        <div className="flex h-screen bg-white dark:bg-slate-950 overflow-hidden">
            {/* Sidebar Navigation */}
            <aside className="w-80 flex-shrink-0 h-full">
                <HelpSidebar
                    onSelectArticle={handleSelectArticle}
                    selectedArticleId={selectedArticle.id}
                />
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col h-full overflow-hidden relative">
                {/* Top Header / Breadcrumbs */}
                <header className="h-16 flex-shrink-0 border-b dark:border-slate-800 flex items-center justify-between px-8 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md z-10">
                    <div className="flex items-center gap-4">
                        <Link href="/">
                            <Button variant="ghost" size="sm" className="gap-2 text-slate-500 hover:text-slate-900">
                                <ArrowLeft className="w-4 h-4" />
                                <span className="hidden sm:inline">Volver al Dashboard</span>
                            </Button>
                        </Link>
                        <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 hidden sm:block" />
                        <nav className="hidden md:flex items-center gap-2 text-sm text-slate-400">
                            <BookOpen className="w-4 h-4" />
                            <span>Documentación</span>
                            <span>/</span>
                            <span className="text-slate-900 dark:text-slate-100 font-medium">
                                {selectedArticle.title}
                            </span>
                        </nav>
                    </div>

                    <div className="flex items-center gap-3">
                        <Button variant="outline" size="sm" className="gap-2">
                            <Globe className="w-3.5 h-3.5" />
                            <span className="hidden lg:inline">Base de Conocimientos Online</span>
                        </Button>
                        <Button size="sm" className="gap-2 bg-blue-600 hover:bg-blue-700 text-white border-none shadow-md shadow-blue-500/20">
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span className="hidden lg:inline">Soporte Express</span>
                        </Button>
                    </div>
                </header>

                {/* Content Body */}
                <div className="flex-1 p-8 lg:p-12 overflow-hidden bg-slate-50/50 dark:bg-slate-950/50">
                    {/* Search Bar - Centered at top of content */}
                    <HelpSearch onSelectArticle={handleSelectArticle} />

                    {/* Article Render */}
                    <div className="h-[calc(100%-100px)] animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <HelpArticle article={selectedArticle} />
                    </div>
                </div>

                {/* Floating Help Badge (Enterprise feel) */}
                <div className="absolute bottom-8 right-8">
                    <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-full shadow-lg border-blue-100 dark:border-blue-900/30">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                            Soporte Fiscal en línea
                        </span>
                    </div>
                </div>
            </main>
        </div>
    );
}
