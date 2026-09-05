'use client';

import { 
    DropdownMenu, 
    DropdownMenuContent, 
    DropdownMenuItem, 
    DropdownMenuLabel, 
    DropdownMenuSeparator, 
    DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Download, FileJson, FileText, Globe, Loader2 } from "lucide-react";
import { useState } from "react";

export function ExportButton({ scanId, scanName }: { scanId: string, scanName: string }) {
    const [isExporting, setIsExporting] = useState<string | null>(null);

    const handleExport = async (format: string, filter: string = 'all') => {
        setIsExporting(format);
        try {
            const url = `/api/scans/${scanId}/export?format=${format}&filter=${filter}`;
            
            // Trigger download by creating a hidden link
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', '');
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
        } catch (error) {
            console.error('Export failed:', error);
        } finally {
            // Delay slightly to show the loading state
            setTimeout(() => setIsExporting(null), 1000);
        }
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-10 cursor-pointer gap-2 px-2.5 sm:px-4 border-primary/50 bg-background text-foreground hover:border-primary hover:bg-primary/10 dark:border-primary/25 dark:hover:border-primary/50 dark:hover:bg-primary/5 transition-all">
                    {isExporting ? (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : (
                        <Download className="h-4 w-4 text-primary" />
                    )}
                    <span className="sm:hidden">Export</span>
                    <span className="hidden sm:inline">Export Data</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 glass-vibrant border-border text-foreground">
                <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Export Format
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-border" />
                
                <DropdownMenuItem 
                    className="gap-2 focus:bg-primary/20 cursor-pointer"
                    onClick={() => handleExport('json')}
                >
                    <FileJson className="h-4 w-4 text-blue-400" />
                    <span>Raw JSON Data</span>
                </DropdownMenuItem>
                
                <DropdownMenuItem 
                    className="gap-2 focus:bg-primary/20 cursor-pointer"
                    onClick={() => handleExport('csv')}
                >
                    <FileText className="h-4 w-4 text-emerald-400" />
                    <span>CSV (Spreadsheet)</span>
                </DropdownMenuItem>
                
                <DropdownMenuItem 
                    className="gap-2 focus:bg-primary/20 cursor-pointer"
                    onClick={() => handleExport('html')}
                >
                    <Globe className="h-4 w-4 text-purple-400" />
                    <span>Interactive HTML Report</span>
                </DropdownMenuItem>

                <DropdownMenuSeparator className="bg-white/5" />
                <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Quick Filters
                </DropdownMenuLabel>
                <DropdownMenuItem 
                    className="gap-2 focus:bg-destructive/20 cursor-pointer text-destructive"
                    onClick={() => handleExport('csv', 'broken')}
                >
                    <FileText className="h-4 w-4" />
                    <span>Only Broken Links (CSV)</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
