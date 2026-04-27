import React from 'react';

type BackHandler = () => void;
interface BackStackEntry {
  id: string;
  fn: BackHandler;
}

interface BackStackContextValue {
  push: (fn: BackHandler) => string;
  pop: (id: string) => void;
  back: () => void;
}

const noop = () => {};
const BackStackContext = React.createContext<BackStackContextValue>({
  push: () => '',
  pop: noop,
  back: noop,
});

export function BackStackProvider({ children }: { children: React.ReactNode }) {
  const stackRef = React.useRef<BackStackEntry[]>([]);
  const isPoppingRef = React.useRef(false);

  React.useEffect(() => {
    const onPop = (_e: PopStateEvent) => {
      isPoppingRef.current = true;
      const top = stackRef.current.pop();
      if (top) {
        try {
          top.fn();
        } catch (err) {
          console.error('[backStack] handler error:', err);
        }
      }
      // Reset after the React commit so the next push() done as a result
      // of state changes uses replaceState instead of pushState (avoids
      // history bloat when a deeper screen pops back to a still-deep one).
      setTimeout(() => {
        isPoppingRef.current = false;
      }, 0);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const value = React.useMemo<BackStackContextValue>(() => ({
    push: (fn) => {
      const id = `bs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      stackRef.current.push({ id, fn });
      try {
        if (isPoppingRef.current) {
          window.history.replaceState({ backStackId: id }, '');
        } else {
          window.history.pushState({ backStackId: id }, '');
        }
      } catch {
        // Some sandboxed iframes block history mutation — silently no-op.
      }
      return id;
    },
    pop: (id) => {
      const idx = stackRef.current.findIndex(e => e.id === id);
      if (idx >= 0) {
        stackRef.current.splice(idx, 1);
      }
      // Note: we intentionally don't call history.back() here. Components
      // call pop only on cleanup when they have already navigated away
      // through normal in-app means (e.g. clicking the in-app back arrow
      // which itself calls window.history.back()).
    },
    back: () => {
      try {
        window.history.back();
      } catch {
        // Fallback: directly invoke top handler.
        const top = stackRef.current.pop();
        top?.fn();
      }
    },
  }), []);

  return React.createElement(BackStackContext.Provider, { value }, children);
}

export function useBackStack() {
  return React.useContext(BackStackContext);
}

/**
 * Register a handler that runs when the user presses the device/browser back
 * button while `active` is true. Handler is automatically removed when `active`
 * becomes false or the component unmounts.
 *
 * Use this to wire any "deeper" UI state (sub-views, modals, drilldowns) to
 * the platform back gesture so users don't accidentally exit the app.
 */
export function useBackHandler(active: boolean, handler: BackHandler) {
  const { push, pop } = useBackStack();
  const handlerRef = React.useRef(handler);
  handlerRef.current = handler;

  React.useEffect(() => {
    if (!active) return;
    const id = push(() => handlerRef.current());
    return () => pop(id);
  }, [active, push, pop]);
}
