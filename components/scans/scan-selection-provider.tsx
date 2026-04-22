'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { ScanSelectionModal } from './scan-selection-modal';

interface ScanSelectionContextType {
  openModal: (forceWizard?: boolean) => void;
  closeModal: () => void;
  showWizard: boolean;
  setShowWizard: (show: boolean) => void;
  preferences: UserPreferences;
  updatePreferences: (prefs: Partial<UserPreferences>) => Promise<void>;
}

interface UserPreferences {
  skipWizard?: boolean;
}

const ScanSelectionContext = createContext<ScanSelectionContextType | undefined>(undefined);

export function ScanSelectionProvider({ children, hasSession }: { children: React.ReactNode, hasSession: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [preferences, setPreferences] = useState<UserPreferences>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (hasSession) {
      fetchPreferences();
    } else {
      setLoading(false);
    }
  }, [hasSession]);

  const fetchPreferences = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/user/preferences');
      if (res.ok) {
        const data = await res.json();
        setPreferences(data.preferences || {});
      }
    } catch (err) {
      console.error('Failed to fetch preferences:', err);
    } finally {
      setLoading(false);
    }
  };

  const updatePreferences = async (newPrefs: Partial<UserPreferences>) => {
    try {
      const res = await fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences: newPrefs }),
      });
      if (res.ok) {
        setPreferences(prev => ({ ...prev, ...newPrefs }));
      }
    } catch (err) {
      console.error('Failed to update preferences:', err);
    }
  };

  const openModal = (forceWizard = false) => {
    setIsOpen(true);
    if (forceWizard) {
      setShowWizard(true);
    } else {
      // If still loading, default to showing wizard (safe default)
      // If loaded, respect the skipWizard preference
      setShowWizard(loading ? true : !preferences?.skipWizard);
    }
  };
  
  const closeModal = () => {
    setIsOpen(false);
    setShowWizard(false);
  };

  return (
    <ScanSelectionContext.Provider value={{ 
      openModal, 
      closeModal, 
      showWizard, 
      setShowWizard, 
      preferences, 
      updatePreferences 
    }}>
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
