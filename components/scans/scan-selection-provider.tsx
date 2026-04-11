'use client';

import React, { createContext, useContext, useState } from 'react';
import { ScanSelectionModal } from './scan-selection-modal';

interface ScanSelectionContextType {
  openModal: () => void;
  closeModal: () => void;
}

const ScanSelectionContext = createContext<ScanSelectionContextType | undefined>(undefined);

export function ScanSelectionProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const openModal = () => setIsOpen(true);
  const closeModal = () => setIsOpen(false);

  return (
    <ScanSelectionContext.Provider value={{ openModal, closeModal }}>
      {children}
      <ScanSelectionModal isOpen={isOpen} onClose={closeModal} />
    </ScanSelectionContext.Provider>
  );
}

export function useScanSelection() {
  const context = useContext(ScanSelectionContext);
  if (context === undefined) {
    throw new Error('useScanSelection must be used within a ScanSelectionProvider');
  }
  return context;
}
