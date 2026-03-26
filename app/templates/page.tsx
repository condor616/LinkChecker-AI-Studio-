'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LayoutTemplate, Trash2, Play, Plus, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const fetchTemplates = async () => {
    try {
      const res = await fetch('/api/templates');
      if (res.ok) {
        const data = await res.json();
        setTemplates(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const deleteTemplate = async (id: string) => {
    try {
      const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setTemplates(templates.filter(t => t.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const useTemplate = (template: any) => {
    // Store in session storage to be picked up by the new scan page
    // or just pass as a query param (though JSON config might be long)
    // For now, let's use localStorage to pass the config
    localStorage.setItem('selected_template_config', template.config);
    router.push('/scans/new');
  };

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
            <h1 className="text-3xl font-bold tracking-tight">Configuration Templates</h1>
            <p className="text-muted-foreground mt-1">Manage and reuse your professional scan parameters.</p>
        </div>
        <Button onClick={() => router.push('/scans/new')}>
            <Plus className="mr-2 h-4 w-4" /> New Template
        </Button>
      </motion.div>

      {loading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map(i => (
                <Card key={i} className="animate-pulse">
                    <CardHeader className="h-24 bg-muted/50" />
                    <CardContent className="h-32" />
                </Card>
            ))}
        </div>
      ) : templates.length === 0 ? (
        <Card className="p-20 text-center space-y-4 border-dashed">
            <div className="flex justify-center">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center">
                    <LayoutTemplate className="h-8 w-8 text-muted-foreground" />
                </div>
            </div>
            <div className="space-y-2">
                <h3 className="text-xl font-bold">No templates found</h3>
                <p className="text-muted-foreground max-w-xs mx-auto">
                    Save your scan configurations as templates to see them here and reuse them later.
                </p>
            </div>
            <Button variant="outline" onClick={() => router.push('/scans/new')}>
                Create Your First Template
            </Button>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((template, i) => (
            <motion.div 
                key={template.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
            >
              <Card className="group hover:border-primary/50 transition-all shadow-md hover:shadow-xl flex flex-col h-full">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2">
                    <span className="truncate">{template.name}</span>
                    <LayoutTemplate className="h-4 w-4 text-primary shrink-0" />
                  </CardTitle>
                  <CardDescription className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Saved {new Date(template.createdAt).toLocaleDateString()}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 space-y-4">
                  <div className="bg-accent/30 rounded-lg p-4 space-y-2 text-sm border">
                    <div className="flex justify-between items-center gap-4">
                        <span className="text-muted-foreground font-semibold uppercase text-[10px] tracking-wider">Start URL</span>
                        <span className="truncate flex-1 text-right font-medium">{(() => {
                            try {
                                const cfg = typeof template.config === 'string' ? JSON.parse(template.config || '{}') : template.config;
                                return cfg.startUrl || 'N/A';
                            } catch (e) {
                                return 'N/A';
                            }
                        })()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-muted-foreground font-semibold uppercase text-[10px] tracking-wider">Max Depth</span>
                        <span className="font-medium">{(() => {
                            try {
                                const cfg = typeof template.config === 'string' ? JSON.parse(template.config || '{}') : template.config;
                                return cfg.maxDepth === 0 ? '∞ (Unlimited)' : cfg.maxDepth;
                            } catch (e) {
                                return 'N/A';
                            }
                        })()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-muted-foreground font-semibold uppercase text-[10px] tracking-wider">Rate Limit</span>
                        <span className="font-medium">{(() => {
                            try {
                                const cfg = typeof template.config === 'string' ? JSON.parse(template.config || '{}') : template.config;
                                return `${cfg.rateLimit || 60} req/min`;
                            } catch (e) {
                                return '60 req/min';
                            }
                        })()}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button 
                        className="flex-1 h-10 shadow-sm" 
                        onClick={() => useTemplate(template)}
                    >
                        <Play className="mr-2 h-4 w-4" /> Use
                    </Button>
                    <Button 
                        variant="outline"
                        size="sm"
                        className="h-10 px-4 shadow-sm"
                        onClick={() => router.push(`/scans/new?edit=${template.id}`)}
                    >
                        Edit
                    </Button>
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-10 w-10 text-destructive hover:bg-destructive/10"
                        onClick={() => deleteTemplate(template.id)}
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
