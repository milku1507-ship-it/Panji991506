import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { auth, db, doc, onSnapshot, setDoc, sanitizeData } from './lib/firebase';
import { KategoriSettings } from './types';

interface SettingsContextType {
  settings: KategoriSettings | null;
  isLoading: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const DEFAULT_KATEGORI: KategoriSettings = {
  kategori_hpp: ["Material Utama", "Material Pendukung", "Kemasan", "Overhead"],
  kategori_produk: ["Makanan", "Fashion", "Digital", "Jasa", "Lainnya"],
  satuan_unit: ["Gram", "Pcs", "Box", "Liter", "Kg", "Lembar", "Meter", "Set"]
};

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<KategoriSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Use a ref to hold the current Firestore snapshot unsubscribe function.
  // A ref is used (not state) because we need to call the old cleanup
  // synchronously inside the onAuthStateChanged callback without triggering
  // extra re-renders.
  const unsubSnapshotRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const cleanupSnapshot = () => {
      if (unsubSnapshotRef.current) {
        unsubSnapshotRef.current();
        unsubSnapshotRef.current = null;
      }
    };

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      // Always tear down the previous snapshot listener first, regardless of
      // whether the new state is logged-in or logged-out. This is the key fix:
      // without this, zombie listeners keep running after logout and fire
      // permission errors (or stale state updates) when the user logs back in.
      cleanupSnapshot();

      if (user) {
        const ref = doc(db, `users/${user.uid}/settings/kategori`);

        unsubSnapshotRef.current = onSnapshot(
          ref,
          (snap) => {
            if (snap.exists()) {
              setSettings(snap.data() as KategoriSettings);
            } else {
              // Initialise with defaults — use console.error (not handleFirestoreError)
              // because handleFirestoreError throws, which would become an unhandled
              // promise rejection inside .catch() and crash the app.
              setDoc(ref, sanitizeData(DEFAULT_KATEGORI)).catch((err) => {
                console.error('Failed to initialise kategori settings:', err);
              });
              setSettings(DEFAULT_KATEGORI);
            }
            setIsLoading(false);
          },
          (error) => {
            console.error('Settings snapshot error:', error);
            setSettings(DEFAULT_KATEGORI);
            setIsLoading(false);
          }
        );
      } else {
        setSettings(null);
        setIsLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      cleanupSnapshot();
    };
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, isLoading }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
