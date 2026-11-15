import { useEffect, useState } from 'react';

/**
 * Persists React state in localStorage so browser refreshes preserve active tabs,
 * filters, date ranges, and in-progress selections.
 */
export function usePersistedState(key, defaultValue) {
  const storageKey = `vansales_state_${key}`;

  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw !== null) {
        return JSON.parse(raw);
      }
    } catch {
      // Ignore storage read errors
    }
    return typeof defaultValue === 'function' ? defaultValue() : defaultValue;
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // Ignore storage write errors
    }
  }, [storageKey, state]);

  return [state, setState];
}

