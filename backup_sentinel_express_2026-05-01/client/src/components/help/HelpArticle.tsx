import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { HelpArticle as HelpArticleType } from '../../content/help/registry';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import { Loader2, BookOpen, Shield, Settings, FileText } from 'lucide-react';

interface HelpArticleProps {
    article: HelpArticleType;
}

const typeIcons = {
    fiscal: <Shield className="w-4 h-4 text-orange-500" />,
    tecnico: <Settings className="w-4 h-4 text-blue-500" />,
    operativo: <BookOpen className="w-4 h-4 text-green-500" />,
    legal: <FileText className="w-4 h-4 text-purple-500" />
};

const typeLabels = {
    fiscal: 'Fiscal',
    tecnico: 'Técnico',
    operativo: 'Operativo',
    legal: 'Legal'
};

export const HelpArticle: React.FC<HelpArticleProps> = ({ article }) => {
    const [content, setContent] = useState<string>('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchContent = async () => {
            setLoading(true);
            try {
                // Usar importaciones dinámicas de Vite con ?raw para obtener el contenido como string
                // Esto garantiza que funcione tanto en dev como en build de producción
                const modules = import.meta.glob('../../content/help/*.md', { query: '?raw', import: 'default' });
                const contentLoader = modules[`../../content/help/${article.contentPath}`];

                if (contentLoader) {
                    const text = await contentLoader() as string;
                    setContent(text);
                } else {
                    throw new Error('Artículo no encontrado');
                }
            } catch (error) {
                console.error("Error loading help content:", error);
                setContent("# Error\nNo se pudo cargar el contenido de este artículo.");
            } finally {
                setLoading(false);
            }
        };

        fetchContent();
    }, [article.contentPath]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
                <p className="text-slate-500 text-sm">Cargando documentación...</p>
            </div>
        );
    }

    return (
        <ScrollArea className="h-full pr-4">
            <div className="max-w-3xl mx-auto pb-20">
                <div className="mb-8 border-b pb-6 dark:border-slate-800">
                    <div className="flex items-center gap-2 mb-4">
                        <Badge variant="outline" className="gap-1 px-2 py-0.5 font-normal">
                            {typeIcons[article.type]}
                            <span className="capitalize">{typeLabels[article.type]}</span>
                        </Badge>
                        <span className="text-slate-400 text-sm">•</span>
                        <span className="text-slate-400 text-sm">{article.description}</span>
                    </div>
                    <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100 mb-2">
                        {article.title}
                    </h1>
                </div>

                <div className="prose prose-slate dark:prose-invert max-w-none 
          prose-headings:font-bold prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl
          prose-p:text-slate-600 dark:prose-p:text-slate-400 prose-p:leading-relaxed
          prose-strong:text-slate-900 dark:prose-strong:text-slate-200
          prose-code:bg-slate-100 dark:prose-code:bg-slate-800 prose-code:rounded prose-code:px-1
          prose-table:border prose-table:rounded-lg prose-th:bg-slate-50 dark:prose-th:bg-slate-900
          prose-img:rounded-xl prose-img:shadow-lg">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {content}
                    </ReactMarkdown>
                </div>
            </div>
        </ScrollArea>
    );
};
