import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Edit2, Trash2, Check, X, Settings2, Package, Layers, Ruler, ArrowLeft, ChevronDown } from 'lucide-react';
import { useSettings } from '../SettingsContext';
import { auth, db, doc, updateDoc, arrayUnion, arrayRemove, collection, query, where, getDocs, OperationType, handleFirestoreError, sanitizeData } from '../lib/firebase';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';

interface CategoryManagerProps {
  onBack: () => void;
}

const SECTIONS = [
  { key: 'kategori_hpp',    label: 'Kategori HPP',    icon: Layers },
  { key: 'kategori_produk', label: 'Kategori Produk', icon: Package },
  { key: 'satuan_unit',     label: 'Satuan Unit',     icon: Ruler },
] as const;

type SectionKey = typeof SECTIONS[number]['key'];

export default function CategoryManager({ onBack }: CategoryManagerProps) {
  const { settings } = useSettings();
  const [openSection, setOpenSection] = useState<SectionKey | null>('kategori_hpp');
  const [editingItem, setEditingItem] = useState<{ field: string; value: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [newValues, setNewValues] = useState<Record<string, string>>({
    kategori_hpp: '',
    kategori_produk: '',
    satuan_unit: '',
  });
  const [savingField, setSavingField] = useState<string | null>(null);

  if (!settings) return null;

  const setNewValue = (field: string, val: string) =>
    setNewValues((prev) => ({ ...prev, [field]: val }));

  const handleAddItem = async (field: string) => {
    const value = newValues[field]?.trim();
    if (!value) return;
    if ((settings[field as keyof typeof settings] as string[]).includes(value)) {
      toast.error('Nama sudah ada!');
      return;
    }
    const user = auth.currentUser;
    if (!user) return;

    setSavingField(field);
    try {
      const ref = doc(db, `users/${user.uid}/settings/kategori`);
      await updateDoc(ref, sanitizeData({ [field]: arrayUnion(value) }));
      setNewValue(field, '');
      toast.success('Berhasil ditambahkan ✓');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/settings/kategori`);
    } finally {
      setSavingField(null);
    }
  };

  const handleDeleteItem = async (field: string, value: string) => {
    const user = auth.currentUser;
    if (!user) return;

    try {
      if (field === 'kategori_hpp') {
        const hppSnap = await getDocs(query(collection(db, `users/${user.uid}/hpp`), where('kategori', '==', value)));
        if (!hppSnap.empty) { toast.error('Kategori masih digunakan di HPP!'); return; }
        const stokSnap = await getDocs(query(collection(db, `users/${user.uid}/stok`), where('category', '==', value)));
        if (!stokSnap.empty) { toast.error('Kategori masih digunakan di Stok!'); return; }
      }
      const ref = doc(db, `users/${user.uid}/settings/kategori`);
      await updateDoc(ref, sanitizeData({ [field]: arrayRemove(value) }));
      toast.success('Berhasil dihapus');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/settings/kategori`);
    }
  };

  const handleUpdateItem = async (field: string, oldValue: string) => {
    if (!editValue.trim() || editValue === oldValue) { setEditingItem(null); return; }
    const user = auth.currentUser;
    if (!user) return;

    setSavingField(field);
    try {
      const ref = doc(db, `users/${user.uid}/settings/kategori`);
      await updateDoc(ref, sanitizeData({ [field]: arrayRemove(oldValue) }));
      await updateDoc(ref, sanitizeData({ [field]: arrayUnion(editValue.trim()) }));
      setEditingItem(null);
      toast.success('Berhasil diperbarui ✓');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/settings/kategori`);
    } finally {
      setSavingField(null);
    }
  };

  const toggle = (key: SectionKey) => {
    setOpenSection((prev) => (prev === key ? null : key));
    setEditingItem(null);
  };

  return (
    <div className="flex flex-col pb-28">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full h-9 w-9 shrink-0 -ml-1">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="p-2 bg-brand-50 rounded-xl text-primary shrink-0">
          <Settings2 className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-black text-[#1A1A2E] leading-tight">Kelola Kategori & Label</h2>
          <p className="text-xs font-medium text-gray-400">Kustomisasi label untuk HPP, Produk, dan Satuan.</p>
        </div>
      </div>

      {/* Accordion sections */}
      <div className="space-y-3">
        {SECTIONS.map(({ key, label, icon: Icon }) => {
          const isOpen = openSection === key;
          const items = (settings[key as keyof typeof settings] as string[]) ?? [];
          const isSaving = savingField === key;

          return (
            <div key={key} className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
              {/* Accordion header */}
              <button
                onClick={() => toggle(key)}
                className="w-full flex items-center gap-3 px-4 py-4 text-left"
              >
                <div className={`p-2 rounded-xl shrink-0 transition-colors ${isOpen ? 'bg-brand-50 text-primary' : 'bg-gray-50 text-gray-400'}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <span className={`font-black flex-1 text-sm transition-colors ${isOpen ? 'text-primary' : 'text-gray-700'}`}>
                  {label}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] font-bold text-gray-400 bg-gray-50 rounded-full px-2 py-0.5">
                    {items.length}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                  />
                </div>
              </button>

              {/* Accordion body */}
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    key="body"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4 space-y-3 border-t border-gray-50 pt-3">
                      {/* Add input row */}
                      <div className="flex gap-2">
                        <Input
                          placeholder={`Tambah ${label.toLowerCase()}…`}
                          value={newValues[key]}
                          onChange={(e) => setNewValue(key, e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleAddItem(key)}
                          className="flex-1 min-w-0 rounded-2xl h-11"
                        />
                        <Button
                          onClick={() => handleAddItem(key)}
                          disabled={isSaving}
                          className="shrink-0 w-11 h-11 p-0 rounded-2xl bg-primary hover:bg-primary/90 text-white"
                        >
                          {isSaving
                            ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            : <Plus className="w-4 h-4" />}
                        </Button>
                      </div>

                      {/* Item list */}
                      {items.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-3">Belum ada item. Tambahkan di atas.</p>
                      ) : (
                        <div className="space-y-2">
                          {items.map((item) => (
                            <div
                              key={item}
                              className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 rounded-2xl"
                            >
                              {editingItem?.field === key && editingItem?.value === item ? (
                                <>
                                  <Input
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleUpdateItem(key, item)}
                                    className="flex-1 min-w-0 h-8 rounded-xl text-sm"
                                    autoFocus
                                  />
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    disabled={isSaving}
                                    onClick={() => handleUpdateItem(key, item)}
                                    className="h-8 w-8 shrink-0 text-green-500 hover:text-green-600"
                                  >
                                    {isSaving
                                      ? <div className="w-3.5 h-3.5 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                                      : <Check className="w-3.5 h-3.5" />}
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => setEditingItem(null)}
                                    className="h-8 w-8 shrink-0 text-red-400 hover:text-red-600"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <span className="flex-1 min-w-0 text-sm font-semibold text-gray-700 break-words">
                                    {item}
                                  </span>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => { setEditingItem({ field: key, value: item }); setEditValue(item); }}
                                      className="h-8 w-8 text-blue-400 hover:text-blue-600"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => handleDeleteItem(key, item)}
                                      className="h-8 w-8 text-red-400 hover:text-red-600"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                  </div>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}
