'use client';

import { Button } from '@/components/ui/button';
import { useScanSelection } from './scan-selection-provider';
import { PlusCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StartScanButtonProps {
  className?: string;
  variant?: 'default' | 'outline' | 'glow' | 'ghost' | 'secondary' | 'destructive' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  children: React.ReactNode;
}

export function StartScanButton({ className, variant, size, children }: StartScanButtonProps) {
  const { openModal } = useScanSelection();

  return (
    <Button 
      variant={variant} 
      size={size} 
      className={className}
      onClick={() => openModal()}
    >
      {children}
    </Button>
  );
}
