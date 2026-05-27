import React from 'react';
import { HELP_REGISTRY, HelpCategory, HelpArticle } from '../../content/help/registry';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';
import { cn } from '@/lib/utils';
import * as Icons from 'lucide-react';

interface HelpSidebarProps {
    onSelectArticle: (article: HelpArticle) => void;
    selectedArticleId?: string;
}

export const HelpSidebar: React.FC<HelpSidebarProps> = ({ onSelectArticle, selectedArticleId }) => {
    return (
        <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 border-r dark:border-slate-800">
            <div className="p-6 border-b dark:border-slate-800">
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Icons.Book className="w-5 h-5 text-blue-600" />
                    Centro de Ayuda
                </h2>
                <p className="text-xs text-slate-500 mt-1">Sentinel Express v1.0.2</p>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
                <Accordion type="multiple" defaultValue={['general']} className="space-y-2">
                    {HELP_REGISTRY.map((category) => {
                        const IconComponent = (Icons as any)[category.icon] || Icons.HelpCircle;

                        return (
                            <AccordionItem key={category.id} value={category.id} className="border-none">
                                <AccordionTrigger className="hover:no-underline py-2 px-3 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group">
                                    <div className="flex items-center gap-3">
                                        <div className="p-1.5 rounded-md bg-white dark:bg-slate-800 border dark:border-slate-700 shadow-sm group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 transition-colors">
                                            <IconComponent className="w-4 h-4 text-slate-600 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400" />
                                        </div>
                                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                                            {category.title}
                                        </span>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent className="pt-1 pb-2 pl-12 pr-2">
                                    <ul className="space-y-1 border-l dark:border-slate-800 ml-1">
                                        {category.articles.map((article) => (
                                            <li key={article.id}>
                                                <button
                                                    onClick={() => onSelectArticle(article)}
                                                    className={cn(
                                                        "w-full text-left py-2 px-4 text-sm rounded-md transition-all relative",
                                                        selectedArticleId === article.id
                                                            ? "text-blue-600 dark:text-blue-400 font-medium bg-blue-50 dark:bg-blue-900/20"
                                                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                                                    )}
                                                >
                                                    {selectedArticleId === article.id && (
                                                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-blue-600 dark:bg-blue-400 rounded-full" />
                                                    )}
                                                    {article.title}
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                </AccordionContent>
                            </AccordionItem>
                        );
                    })}
                </Accordion>
            </div>
        </div>
    );
};
