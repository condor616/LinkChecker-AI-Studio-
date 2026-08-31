'use client';

import { Button } from '@/components/ui/button';
import { Slot } from '@radix-ui/react-slot';
import { useScanSelection } from './scan-selection-provider';

interface StartScanButtonProps {
  className?: string;
  variant?: 'default' | 'outline' | 'ghost' | 'secondary' | 'destructive' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  asChild?: boolean;
  children: React.ReactNode;
}

export function StartScanButton({ className, variant, size, asChild, children }: StartScanButtonProps) {
  const { openModal } = useScanSelection();

  if (asChild) {
    return (
      <Slot className={className} onClick={() => openModal()}>
        {children}
      </Slot>
    );
  }

  return (
    <Button variant={variant} size={size} className={className} onClick={() => openModal()}>
      {children}
    </Button>
  );
}
