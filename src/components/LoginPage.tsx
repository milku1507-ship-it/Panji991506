import React from 'react';
import { Button } from '@/components/ui/button';
import { auth, googleProvider, signInWithPopup } from '../lib/firebase';
import { toast } from 'sonner';
import { ExternalLink, Info, RefreshCw } from 'lucide-react';
import { StoreSettings } from '../types';

interface LoginPageProps {
  settings: StoreSettings;
}

/**
 * Wipe every piece of OAuth flow state the browser may have cached
 * (nonces, state params, etc.) so that a fresh login attempt starts
 * with a completely clean slate.
 *
 * We deliberately target ONLY auth-flow state here — not the user's
 * own app data or the persisted Firebase auth token.  The persisted
 * token lives in IndexedDB under the "firebaseLocalStorageDb" database
 * and is managed entirely by the Firebase SDK; we leave that alone.
 */
function clearOAuthFlowState() {
  // sessionStorage holds the short-lived OAuth state/nonce during a
  // signInWithRedirect round-trip.  Clearing it removes stale params
  // that produce the "missing initial state" error on the next attempt.
  try { sessionStorage.clear(); } catch (_) {}

  // Also clear any Firebase auth redirect-state keys from localStorage.
  try {
    Object.keys(localStorage).forEach(key => {
      // Firebase stores redirect state under keys like:
      // "firebase:pendingRedirect:...", "firebase:authEvent:...", etc.
      if (key.startsWith('firebase:pending') || key.startsWith('firebase:authEvent')) {
        localStorage.removeItem(key);
      }
    });
  } catch (_) {}
}

export default function LoginPage({ settings }: LoginPageProps) {
  const [isLoading, setIsLoading] = React.useState(false);
  const [isInIframe, setIsInIframe] = React.useState(false);

  React.useEffect(() => {
    // Detect iframe (Replit preview pane).
    // In this context Google's popup cannot post its message back to the opener
    // because of COOP/COEP restrictions, so we guide the user to open a real tab.
    try {
      setIsInIframe(window.self !== window.top);
    } catch {
      // Cross-origin access throws — strong signal we're in a sandboxed iframe.
      setIsInIframe(true);
    }

    // NOTE: We intentionally do NOT call getRedirectResult() here.
    // We no longer use signInWithRedirect at all, so there is no redirect
    // result to handle.  Calling getRedirectResult() on every mount was
    // interfering with fresh popup flows and surfacing stale errors.
  }, []);

  const handleOpenInNewTab = () => {
    window.open(window.location.href, '_blank', 'noopener,noreferrer');
  };

  const handleGoogleLogin = async () => {
    if (isLoading) return;

    // Inside Replit's preview iframe third-party storage is partitioned,
    // so the popup cannot communicate its result back.  Direct the user to a
    // real top-level tab instead.
    if (isInIframe) {
      handleOpenInNewTab();
      toast.info('Login dibuka di tab baru', {
        description: 'Selesaikan login Google di tab baru, lalu kembali ke sini.',
      });
      return;
    }

    // Wipe stale OAuth state from a previous (possibly incomplete) flow
    // before starting a fresh one. This is the primary prevention for the
    // "unable to process request due to missing initial state" error.
    clearOAuthFlowState();

    setIsLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      // onAuthStateChanged in App.tsx picks up the new user automatically.
      // No need to do anything else here — the app will re-render.
    } catch (error: any) {
      // User closed the popup — not an error, just reset the button.
      if (
        error?.code === 'auth/popup-closed-by-user' ||
        error?.code === 'auth/cancelled-popup-request'
      ) {
        return;
      }

      console.error('[LoginPage] signInWithPopup error:', error?.code, error?.message);

      if (error?.code === 'auth/popup-blocked') {
        toast.error('Popup diblokir oleh browser.', {
          description: 'Izinkan popup untuk domain ini atau buka aplikasi di tab baru.',
          action: { label: 'Buka Tab Baru', onClick: handleOpenInNewTab },
        });
      } else if (error?.code === 'auth/unauthorized-domain') {
        toast.error('Domain ini belum diizinkan di Firebase.', {
          description: 'Tambahkan domain ini ke Firebase Console → Authentication → Settings → Authorized domains.',
        });
      } else if (error?.code === 'auth/operation-not-allowed') {
        toast.error('Provider Google belum aktif di Firebase.', {
          description: 'Aktifkan di Firebase Console → Authentication → Sign-in method → Google.',
        });
      } else if (error?.code === 'auth/network-request-failed') {
        toast.error('Koneksi gagal.', {
          description: 'Periksa koneksi internet Anda dan pastikan tidak ada ad-blocker yang memblokir request ke Google.',
          action: { label: 'Coba Lagi', onClick: handleGoogleLogin },
        });
      } else if (
        error?.code === 'auth/web-storage-unsupported' ||
        error?.code === 'auth/internal-error' ||
        /Cross-Origin-Opener-Policy|window\.closed/i.test(error?.message || '')
      ) {
        // Browser with aggressive cross-origin isolation — popup channel severed.
        toast.error('Browser memblokir komunikasi popup.', {
          description: 'Coba buka aplikasi di tab baru dan login dari sana.',
          action: { label: 'Buka Tab Baru', onClick: handleOpenInNewTab },
        });
      } else {
        toast.error('Login gagal. Silakan coba lagi.', {
          description: error?.message || error?.code || undefined,
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F5F7FA] p-6">
      <div className="w-full max-w-md space-y-8 text-center">
        <div className="space-y-4">
          <div className="flex justify-center">
            <div className="bg-white rounded-[2rem] shadow-lg shadow-gray-200 border border-gray-100 p-4 inline-flex items-center justify-center">
              <img
                src="/logo.png"
                alt={settings.name}
                className="w-36 h-36 object-contain"
              />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-black text-[#1A1A2E]">{settings.name}</h1>
            <p className="text-gray-500 font-medium">Manajemen HPP & Stok Jadi Lebih Mudah</p>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-50 space-y-6">
          {isInIframe && (
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex items-start gap-3 text-left">
              <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-blue-800">Login Google butuh tab baru</p>
                <p className="text-[11px] text-blue-700 leading-relaxed mt-1">
                  Preview Replit berjalan di dalam frame sehingga popup Google tidak bisa
                  mengirim hasilnya kembali. Klik tombol di bawah untuk membuka aplikasi di
                  tab baru, lalu login seperti biasa.
                </p>
              </div>
            </div>
          )}

          <Button
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full h-14 rounded-2xl orange-gradient text-white font-bold flex items-center justify-center gap-3 shadow-lg shadow-brand-200 hover:scale-[1.02] active:scale-95 transition-all"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : isInIframe ? (
              <>
                <ExternalLink className="w-5 h-5" />
                Buka di Tab Baru untuk Login
              </>
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Masuk ke {settings.name}
              </>
            )}
          </Button>

          <p className="text-xs text-gray-400 font-medium">
            Data kamu tersimpan aman dan bisa diakses di perangkat manapun
          </p>
        </div>

        <p className="text-xs text-gray-400">
          Dibuat oleh <span className="font-semibold text-gray-500">Panji Abdillah Al-gipari</span>
        </p>
      </div>
    </div>
  );
}
