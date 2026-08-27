import React from 'react';
import { Camera, Loader2, ImageOff, Trash2, Upload, Link, Check, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { storage, db, ref, uploadBytes, getDownloadURL, setDoc, doc } from '../lib/firebase';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface ProductPhotoUploadProps {
  productId?: string;
  userId: string;
  currentFoto?: string;
  size?: 'sm' | 'md' | 'lg' | 'auto';
  className?: string;
  onUploaded?: (url: string) => void;
  onRemove?: () => void;
  showActions?: boolean;
}

export default function ProductPhotoUpload({
  productId,
  userId,
  currentFoto,
  size = 'md',
  className,
  onUploaded,
  onRemove,
  showActions = false,
}: ProductPhotoUploadProps) {
  const [uploading, setUploading] = React.useState(false);
  const [progressText, setProgressText] = React.useState('');
  const [localUrl, setLocalUrl] = React.useState<string | undefined>(currentFoto);
  const [showUrlDialog, setShowUrlDialog] = React.useState(false);
  const [inputUrl, setInputUrl] = React.useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setLocalUrl(currentFoto);
  }, [currentFoto]);

  const sizeMap = {
    sm: 'w-14 h-14 rounded-xl',
    md: 'w-20 h-20 rounded-2xl',
    lg: 'w-full aspect-square rounded-2xl',
    auto: 'w-full h-full rounded-2xl',
  };

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Pilih file gambar (JPG, PNG, WebP, dll)');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error('Ukuran foto maksimal 15MB');
      return;
    }

    setUploading(true);
    setProgressText('Mengompres foto...');

    try {
      // 1. Compress image to high quality lightweight JPEG (max 800px, ~30-50KB)
      const { blob, dataUrl } = await compressImage(file, 800, 0.75);
      
      let finalUrl = dataUrl;
      const targetId = productId || `temp_${Date.now()}`;

      // 2. Try uploading to Firebase Storage first
      try {
        setProgressText('Mengunggah...');
        const storageRef = ref(storage, `users/${userId}/product-photos/${targetId}.jpg`);
        
        // Use uploadBytes with timeout guarantee
        const uploadPromise = uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
        const timeoutPromise = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Storage timeout')), 7000)
        );

        const snapshot = await Promise.race([uploadPromise, timeoutPromise]);
        const storageDownloadUrl = await getDownloadURL(snapshot.ref);
        if (storageDownloadUrl) {
          finalUrl = storageDownloadUrl;
        }
      } catch (storageErr) {
        console.warn('[PhotoUpload] Firebase Storage upload skipped or failed, using optimized Data URL fallback:', storageErr);
        // Fallback to high-efficiency compressed Data URL directly
        finalUrl = dataUrl;
      }

      // 3. Save to Firestore if productId is already assigned
      if (productId) {
        try {
          await setDoc(doc(db, `users/${userId}/hpp/${productId}`), { foto: finalUrl }, { merge: true });
        } catch (dbErr) {
          console.warn('[PhotoUpload] Firestore direct doc update error:', dbErr);
        }
      }

      setLocalUrl(finalUrl);
      if (onUploaded) onUploaded(finalUrl);
      toast.success('Foto produk berhasil disimpan ✓');
    } catch (err) {
      console.error('[PhotoUpload] Process error:', err);
      toast.error('Gagal memproses foto produk');
    } finally {
      setUploading(false);
      setProgressText('');
    }
  };

  const handleApplyUrl = async () => {
    const trimmed = inputUrl.trim();
    if (!trimmed) {
      toast.error('Masukkan URL foto yang valid');
      return;
    }

    setUploading(true);
    try {
      if (productId) {
        await setDoc(doc(db, `users/${userId}/hpp/${productId}`), { foto: trimmed }, { merge: true });
      }
      setLocalUrl(trimmed);
      if (onUploaded) onUploaded(trimmed);
      setShowUrlDialog(false);
      setInputUrl('');
      toast.success('Foto produk dari tautan berhasil disimpan ✓');
    } catch (err) {
      toast.error('Gagal menyimpan URL foto');
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePhoto = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      if (productId) {
        await setDoc(doc(db, `users/${userId}/hpp/${productId}`), { foto: '' }, { merge: true });
      }
      setLocalUrl('');
      if (onUploaded) onUploaded('');
      if (onRemove) onRemove();
      toast.success('Foto produk dihapus');
    } catch (err) {
      toast.error('Gagal menghapus foto');
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className={cn('relative group cursor-pointer flex-shrink-0 select-none overflow-hidden', sizeMap[size], className)}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = '';
          }}
        />

        {/* Photo view or placeholder */}
        <div
          onClick={() => !uploading && fileInputRef.current?.click()}
          className={cn(
            'w-full h-full overflow-hidden flex items-center justify-center bg-gray-100/80 transition-colors',
            sizeMap[size]
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
            <div className="flex flex-col items-center justify-center gap-1 text-gray-400 p-2">
              <Camera className="w-6 h-6 opacity-60" />
              <span className="text-[10px] font-bold text-center leading-tight">Pilih Foto</span>
            </div>
          )}
        </div>

        {/* Uploading indicator */}
        {uploading && (
          <div className={cn(
            'absolute inset-0 bg-black/60 backdrop-blur-[2px] flex flex-col items-center justify-center gap-1.5 z-20',
            sizeMap[size]
          )}>
            <Loader2 className="w-6 h-6 text-white animate-spin" />
            <span className="text-white text-[10px] font-bold text-center px-1">
              {progressText || 'Memproses...'}
            </span>
          </div>
        )}

        {/* Action overlay on hover / click */}
        {!uploading && (
          <div
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all z-10',
              sizeMap[size]
            )}
          >
            <div className="w-8 h-8 rounded-full bg-white/95 text-gray-800 flex items-center justify-center shadow-lg transform group-hover:scale-105 transition-transform">
              <Camera className="w-4 h-4 text-primary" />
            </div>
          </div>
        )}
      </div>

      {/* Optional action buttons under image or in dialog */}
      {showActions && (
        <div className="flex items-center gap-2 flex-wrap pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="rounded-xl h-8 text-xs font-bold gap-1.5 border-gray-200 hover:border-primary text-gray-700 hover:text-primary"
          >
            <Upload className="w-3.5 h-3.5" />
            {localUrl ? 'Ganti Foto' : 'Upload Foto'}
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowUrlDialog(!showUrlDialog)}
            disabled={uploading}
            className="rounded-xl h-8 text-xs font-bold gap-1.5 border-gray-200 text-gray-600 hover:text-gray-900"
          >
            <Link className="w-3.5 h-3.5" />
            Link URL
          </Button>

          {localUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRemovePhoto}
              disabled={uploading}
              className="rounded-xl h-8 text-xs font-bold gap-1 text-red-500 hover:text-red-600 hover:bg-red-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Hapus
            </Button>
          )}
        </div>
      )}

      {/* URL Link Input Box if toggled */}
      {showUrlDialog && (
        <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-2 text-xs">
          <label className="font-bold text-gray-700 block">Masukkan Tautan URL Foto:</label>
          <div className="flex gap-2">
            <input
              type="url"
              placeholder="https://example.com/foto-produk.jpg"
              value={inputUrl}
              onChange={e => setInputUrl(e.target.value)}
              className="flex-1 px-3 py-1.5 rounded-lg border border-gray-300 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <Button
              type="button"
              size="sm"
              onClick={handleApplyUrl}
              className="rounded-lg h-8 px-3 text-xs font-bold bg-primary text-white"
            >
              <Check className="w-3.5 h-3.5 mr-1" />
              Pasang
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Image compression helper ─────────────────────────────────────────────────
async function compressImage(
  file: File,
  maxDimension: number,
  quality: number
): Promise<{ blob: Blob; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Canvas 2D context not available');
        }

        // Fill white background in case of transparent PNG/WebP conversion to JPEG
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', quality);

        canvas.toBlob(
          blob => {
            if (blob) {
              resolve({ blob, dataUrl });
            } else {
              resolve({ blob: file, dataUrl });
            }
          },
          'image/jpeg',
          quality
        );
      } catch (err) {
        console.error('Image compression error:', err);
        // Fallback: read directly as dataUrl
        const reader = new FileReader();
        reader.onload = () => {
          resolve({ blob: file, dataUrl: reader.result as string });
        };
        reader.onerror = () => reject(err);
        reader.readAsDataURL(file);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      // Fallback
      const reader = new FileReader();
      reader.onload = () => {
        resolve({ blob: file, dataUrl: reader.result as string });
      };
      reader.onerror = () => reject(new Error('Failed to load image file'));
      reader.readAsDataURL(file);
    };

    img.src = url;
  });
}
