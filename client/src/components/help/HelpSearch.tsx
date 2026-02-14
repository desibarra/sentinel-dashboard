import React, { useState, useEffect, useRef } from 'react';
import { HELP_REGISTRY, HelpArticle } from '../../content/help/registry';
import { Input } from '../ui/input';
import { Search, X, Hash, CornerDownLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HelpSearchProps {
    onSelectArticle: (article: HelpArticle) => void;
}

export const HelpSearch: React.FC<HelpSearchProps> = ({ onSelectArticle }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<HelpArticle[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (query.length < 2) {
            setResults([]);
            return;
        }

        const allArticles = HELP_REGISTRY.flatMap(cat => cat.articles);
        const filtered = allArticles.filter(art =>
            art.title.toLowerCase().includes(query.toLowerCase()) ||
            art.description.toLowerCase().includes(query.toLowerCase())
        );
        setResults(filtered);
    }, [query]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="relative w-full max-w-xl mx-auto mb-8" ref={searchRef}>
            <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                <Input
                    type="text"
                    placeholder="Buscar guía, validación o fundamento fiscal..."
                    className="pl-10 h-12 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-blue-500/20 shadow-sm rounded-xl text-base"
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                />
                {query && (
                    <button
                        onClick={() => { setQuery(''); setResults([]); }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md"
                    >
                        <X className="w-4 h-4 text-slate-400" />
                    </button>
                )}
            </div>

            {isOpen && query.length >= 2 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-xl shadow-xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="p-2">
                        <div className="px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
                            Artículos encontrados ({results.length})
                        </div>
                        {results.length > 0 ? (
                            <div className="space-y-1">
                                {results.map((article) => (
                                    <button
                                        key={article.id}
                                        onClick={() => {
                                            onSelectArticle(article);
                                            setIsOpen(false);
                                            setQuery('');
                                        }}
                                        className="w-full text-left p-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg group transition-colors flex items-start gap-3"
                                    >
                                        <div className="mt-0.5 p-1.5 rounded-md bg-slate-100 dark:bg-slate-800 group-hover:bg-white dark:group-hover:bg-slate-700 transition-colors">
                                            <Hash className="w-4 h-4 text-slate-400 group-hover:text-blue-500" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-0.5">
                                                {article.title}
                                            </div>
                                            <div className="text-xs text-slate-500 truncate">
                                                {article.description}
                                            </div>
                                        </div>
                                        <CornerDownLeft className="w-4 h-4 text-slate-300 group-hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-all mr-2" />
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="p-8 text-center">
                                <p className="text-slate-400 text-sm">No se encontraron resultados para "{query}"</p>
                            </div>
                        )}
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-slate-900/50 border-t dark:border-slate-800 text-[10px] text-slate-400 flex items-center justify-between">
                        <span>Resultados para Sentinel Express Documentation</span>
                        <span className="flex items-center gap-1">Tip: Usa palabras clave como 'Nómina' o 'RFC'</span>
                    </div>
                </div>
            )}
        </div>
    );
};
