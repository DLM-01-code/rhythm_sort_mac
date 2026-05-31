import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Image, Upload, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface CoverEditorProps {
  currentCover?: string;
  trackName: string;
  trackId: string;
  onSave: (id: string, cover: string | undefined) => void;
  onClose: () => void;
}

export function CoverEditor({ currentCover, trackName, trackId, onSave, onClose }: CoverEditorProps) {
  const [preview, setPreview] = useState<string | undefined>(currentCover);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) { toast.error("Please select an image file"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5MB"); return; }
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleSave = useCallback(() => {
    onSave(trackId, preview);
    onClose();
  }, [preview, trackId, onSave, onClose]);

  // Обрезаем длинное название — максимум 40 символов
  const shortName = trackName.length > 40
    ? trackName.slice(0, 37) + '...'
    : trackName;

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent
        className="max-w-sm"
        // Фиксированная ширина — не растягивается от длинного названия
        style={{ width: 420, maxWidth: '90vw' }}
      >
        <DialogHeader>
          <DialogTitle
            className="text-sm font-semibold truncate pr-6"
            title={trackName}
          >
            Edit Cover — {shortName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Preview */}
          <div className="flex justify-center">
            {preview ? (
              <div className="relative group">
                <img
                  src={preview}
                  alt="Cover"
                  className="w-40 h-40 rounded-lg object-cover shadow-lg"
                />
                <button
                  onClick={() => setPreview(undefined)}
                  className="absolute top-1.5 right-1.5 p-1 bg-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
            ) : (
              <div className="w-40 h-40 bg-muted rounded-lg flex items-center justify-center">
                <Image className="w-10 h-10 text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Drop zone */}
          <div
            className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-all ${
              isDragging ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
            }`}
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
          >
            <Upload className="w-6 h-6 mx-auto mb-1.5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Click or drag image here</p>
            <p className="text-xs text-muted-foreground/60 mt-0.5">PNG, JPG, GIF up to 5MB</p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
          />

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={handleSave}>Save Cover</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
