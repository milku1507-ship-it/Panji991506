import React from 'react';
import { Camera, Loader2, ImageOff } from 'lucide-react';
import { toast } from 'sonner';
import { storage, db, ref, uploadBytesResumable, getDownloadURL, updateDoc, doc } from '../lib/firebase';
import { cn } from '@/lib/utils';

interface ProductPhotoUploadProps {
  productId: string;
  userId: string;
  currentFoto?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  onUploaded?: (url: string) => void;
}

export default function ProductPhotoUpload({
  productId,
  userId,
  currentFoto,
  size = 'md',
  className,
  onUploaded,
}: ProductPhotoUploadProps) {
  const [uploading, setUploading] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [localUrl, setLocalUrl] = React.useState<string | undefined>(currentFoto);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setLocalUrl(currentFoto);
  }, [currentFoto]);

  const sizeMap = {
    sm: 'w-14 h-14 rounded-xl',
    md: 'w-20 h-20 rounded-2xl',
    lg: 'w-full aspect-square rounded-2xl',
  };

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Pilih file gambar (JPG, PNG, dll)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Ukuran foto maksimal 5MB');
      return;
    }

    setUploading(true);
    setProgress(0);

    try {
      // Compress image before upload using canvas
      const compressed = await compressImage(file, 800, 0.75);
      const storageRef = ref(storage, `users/${userId}/product-photos/${productId}.jpg`);
      const uploadTask = uploadBytesResumable(storageRef, compressed, { contentType: 'image/jpeg' });

      uploadTask.on(
        'state_changed',
        snap => setProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
        err => {
          console.error('[PhotoUpload] upload error:', err);
          toast.error('Gagal upload foto');
          setUploading(false);
        },
        async () => {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          // Save to Firestore
          await updateDoc(doc(db, `users/${userId}/hpp/${productId}`), { foto: url });
          setLocalUrl(url);
          onUploaded?.(url);
          toast.success('Foto produk diperbarui');
          setUploading(false);
        }
      );
    } catch {
      toast.error('Gagal memproses foto');
      setUploading(false);
    }
  };

  return (
    <div className={cn('relative group cursor-pointer flex-shrink-0', sizeMap[size], className)}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />

      {/* Photo or placeholder */}
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        className={cn(
          'w-full h-full overflow-hidden flex items-center justify-center bg-gray-100',
          sizeMap[size],
        )}
      >
        {localUrl ? (
          <img
            src={localUrl}
            alt="Foto produk"
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <ImageOff className="w-1/3 h-1/3 text-gray-300" />
        )}
      </div>

      {/* Upload progress overlay */}
      {uploading && (
        <div className={cn(
          'absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-1',
          sizeMap[size],
        )}>
          <Loader2 className="w-5 h-5 text-white animate-spin" />
          <span className="text-white text-[10px] font-bold">{progress}%</span>
        </div>
      )}

      {/* Camera hover overlay */}
      {!uploading && (
        <div
          onClick={() => inputRef.current?.click()}
          className={cn(
            'absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-pointer',
            sizeMap[size],
          )}
        >
          <div className="w-7 h-7 rounded-full bg-white/90 flex items-center justify-center shadow">
            <Camera className="w-4 h-4 text-gray-700" />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Image compression helper ─────────────────────────────────────────────────
async function compressImage(file: File, maxSize: number, quality: number): Promise<Blob> {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => resolve(blob || file), 'image/jpeg', quality);
    };
    img.onerror = () => resolve(file);
    img.src = url;
  });
}
