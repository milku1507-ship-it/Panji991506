import React from 'react';
import {
  RangePreset,
  DEFAULT_PRESET,
  getPresetRange,
  formatRangeLabel,
} from './transactionStats';

/**
 * Context periode bersama untuk halaman Transaksi & Laporan.
 *
 * Tujuan: kedua halaman PASTI pakai parameter filter yang sama
 * (preset, startDate, endDate). Ini bagian dari aturan
 * "Single Source of Truth" — angka pemasukan/pengeluaran/saldo
 * di Transaksi dan Laporan wajib identik.
 *
 * Default: bulan berjalan ("Bulan Ini").
 */

interface DateFilterContextValue {
  preset: RangePreset;
  startDate: string;
  endDate: string;
  applyPreset: (p: RangePreset) => void;
  setStartDate: (s: string) => void;
  setEndDate: (s: string) => void;
  rangeLabel: string;
}

const DateFilterContext = React.createContext<DateFilterContextValue | null>(null);

export function DateFilterProvider({ children }: { children: React.ReactNode }) {
  const initial = React.useMemo(() => getPresetRange(DEFAULT_PRESET), []);
  const [preset, setPreset] = React.useState<RangePreset>(DEFAULT_PRESET);
  const [startDate, setStartDateRaw] = React.useState<string>(initial.start);
  const [endDate, setEndDateRaw] = React.useState<string>(initial.end);

  const applyPreset = React.useCallback((p: RangePreset) => {
    setPreset(p);
    if (p !== 'Custom') {
      const r = getPresetRange(p);
      setStartDateRaw(r.start);
      setEndDateRaw(r.end);
    }
  }, []);

  const setStartDate = React.useCallback((s: string) => {
    setStartDateRaw(s);
    setPreset('Custom');
  }, []);

  const setEndDate = React.useCallback((s: string) => {
    setEndDateRaw(s);
    setPreset('Custom');
  }, []);

  const rangeLabel = React.useMemo(
    () => (preset === 'Custom' ? formatRangeLabel(startDate, endDate) : preset),
    [preset, startDate, endDate]
  );

  const value = React.useMemo<DateFilterContextValue>(
    () => ({ preset, startDate, endDate, applyPreset, setStartDate, setEndDate, rangeLabel }),
    [preset, startDate, endDate, applyPreset, setStartDate, setEndDate, rangeLabel]
  );

  return <DateFilterContext.Provider value={value}>{children}</DateFilterContext.Provider>;
}

export function useDateFilter(): DateFilterContextValue {
  const ctx = React.useContext(DateFilterContext);
  if (!ctx) throw new Error('useDateFilter must be used inside <DateFilterProvider>');
  return ctx;
}
