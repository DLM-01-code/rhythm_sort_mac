// src/components/ui/SplitPanel.tsx
import { useState, useEffect, useRef } from "react";
import { useSplitStore, type SplitBinding } from "@/store/splitStore";
import { FolderPlus, Trash2, X, AlertCircle, GripVertical, Keyboard, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

function cn(...c: (string | boolean | undefined)[]) { return c.filter(Boolean).join(' '); }

export function SplitPanel() {
  const {
    isSplitMode, bindings, isWaitingForBinding,
    pendingFolderPath, pendingFolderName,
    startBindingMode, cancelBindingMode,
    addBinding, removeBinding, clearAllBindings, isReservedKey,
  } = useSplitStore();

  const [showConflict, setShowConflict] = useState(false);
  const [conflictData, setConflictData] = useState<{
    keyCode: string; keyDisplay: string;
    folderPath: string; folderName: string;
    existing: SplitBinding;
  } | null>(null);

  const [position, setPosition] = useState({ x: 120, y: 120 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [collapsed, setCollapsed] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const s = localStorage.getItem('split-panel-pos');
      if (s) setPosition(JSON.parse(s));
    } catch {}
  }, []);

  useEffect(() => {
    if (!isDragging) localStorage.setItem('split-panel-pos', JSON.stringify(position));
  }, [position, isDragging]);

  const onDragStart = (e: React.MouseEvent) => {
    if (!(e.target as HTMLElement).closest('.drag-handle')) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  useEffect(() => {
    if (!isDragging) return;
    const move = (e: MouseEvent) => {
      const pw = panelRef.current?.offsetWidth || 300;
      const ph = panelRef.current?.offsetHeight || 200;
      setPosition({
        x: Math.max(0, Math.min(e.clientX - dragStart.x, window.innerWidth - pw)),
        y: Math.max(0, Math.min(e.clientY - dragStart.y, window.innerHeight - ph)),
      });
    };
    const up = () => setIsDragging(false);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [isDragging, dragStart]);

  useEffect(() => {
    if (!isSplitMode || !isWaitingForBinding) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
      const keyCode = e.code;
      const keyDisplay = e.key.length === 1 ? e.key.toUpperCase()
        : keyCode.replace("Digit", "").replace("Key", "");
      e.preventDefault(); e.stopPropagation();
      if (isReservedKey(keyCode)) {
        toast.error(`❌ Key "${keyDisplay}" is reserved`); return;
      }
      const existing = useSplitStore.getState().getBindingByKey(keyCode);
      if (existing && pendingFolderPath && pendingFolderName) {
        setConflictData({ keyCode, keyDisplay, folderPath: pendingFolderPath, folderName: pendingFolderName, existing });
        setShowConflict(true); return;
      }
      if (pendingFolderPath && pendingFolderName) {
        const r = addBinding(keyCode, keyDisplay, pendingFolderPath, pendingFolderName);
        if (r.success) toast.success(`✅ Bound "${pendingFolderName}" to key ${keyDisplay}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isSplitMode, isWaitingForBinding, pendingFolderPath, pendingFolderName, addBinding, isReservedKey]);

  const handleAddFolder = async () => {
    const api = window.electronAPI;
    if (!api) { toast.error("Electron API not available"); return; }
    const folderPath = await api.selectFolderWithPreview();
    if (!folderPath) return;
    const folderName = folderPath.split(/[/\\]/).pop() || folderPath;
    startBindingMode(folderPath, folderName);
    toast.info(`🔑 Press any key to bind "${folderName}"`, { duration: 5000 });
  };

  if (!isSplitMode) return null;

  return (
    <>
      <div
        ref={panelRef}
        className="fixed z-50 rounded-xl overflow-hidden shadow-2xl"
        style={{
          left: position.x,
          top: position.y,
          width: 320,
          backgroundColor: '#111827',
          border: '1px solid rgba(255,255,255,0.1)',
          cursor: isDragging ? 'grabbing' : 'default',
        }}
        onMouseDown={onDragStart}
      >
        {/* Заголовок */}
        <div
          className="drag-handle flex items-center justify-between px-4 py-3 select-none cursor-grab active:cursor-grabbing"
          style={{ backgroundColor: '#1e3a5f', borderBottom: '1px solid rgba(255,255,255,0.1)' }}
        >
          <div className="flex items-center gap-2 pointer-events-none">
            <GripVertical className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.4)' }} />
            <Keyboard className="w-4 h-4 text-blue-400" />
            <span className="font-bold text-white text-sm">Split Mode</span>
          </div>
          <div className="flex items-center gap-1 pointer-events-auto">
            {/* Add Folder в заголовке */}
            <button
              onClick={handleAddFolder}
              className="text-white/60 hover:text-white transition-colors p-1"
              title="Add folder"
            >
              <FolderPlus className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="text-white/60 hover:text-white transition-colors p-1"
              title={collapsed ? "Expand" : "Collapse"}
            >
              <Minus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {!collapsed && (
          <>
            {/* Ожидание клавиши */}
            {isWaitingForBinding && (
              <div className="mx-3 mt-3 px-3 py-2 rounded-lg flex items-center justify-between gap-2 text-xs animate-pulse"
                style={{ backgroundColor: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.3)', color: '#fbbf24' }}>
                <span>⚡ Press any key to bind «{pendingFolderName}»</span>
                <button onClick={cancelBindingMode} className="hover:text-white">
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Кнопка Add Folder по центру (только когда нет биндингов) */}
            {bindings.length === 0 && !isWaitingForBinding && (
              <div className="py-4 flex justify-center">
                <button
                  onClick={handleAddFolder}
                  className="flex items-center gap-2 text-sm font-medium transition-colors"
                  style={{ color: 'rgba(255,255,255,0.7)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'white')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
                >
                  <FolderPlus className="w-4 h-4" />
                  Add Folder
                </button>
              </div>
            )}

            {/* Список биндингов */}
            {bindings.length > 0 && (
              <div className="px-3 pt-3 pb-1 space-y-2 max-h-64 overflow-y-auto">
                {bindings.map((binding, idx) => (
                  <div
                    key={binding.keyCode}
                    className="flex items-center gap-3 group"
                  >
                    {/* Номер/порядковый кружок */}
                    <div
                      className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
                      style={{ backgroundColor: '#2563eb' }}
                    >
                      {idx + 1}
                    </div>

                    {/* Key + путь */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-blue-400">
                        Key: {binding.keyDisplay}
                      </p>
                      <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.5)' }}>
                        {binding.folderPath}
                      </p>
                    </div>

                    {/* Удалить */}
                    <button
                      className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                      style={{ color: '#ef4444' }}
                      onClick={() => { removeBinding(binding.keyCode); toast.info(`Unbound key ${binding.keyDisplay}`); }}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Кнопка Clear All */}
            {bindings.length > 0 && (
              <div className="px-3 py-3 mt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <button
                  onClick={clearAllBindings}
                  className="w-full flex items-center justify-center gap-2 text-sm font-medium py-1.5 rounded-lg transition-colors"
                  style={{ color: '#ef4444' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.1)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <Trash2 className="w-4 h-4" />
                  Clear All Bindings
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Диалог конфликта */}
      <Dialog open={showConflict} onOpenChange={setShowConflict}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-yellow-500" />
              Key Already Bound
            </DialogTitle>
            <DialogDescription>
              Key «{conflictData?.keyDisplay}» is already bound to «{conflictData?.existing?.folderName}»
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm py-2">Overwrite with «{conflictData?.folderName}»?</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowConflict(false); setConflictData(null); cancelBindingMode(); }}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => {
              if (conflictData) {
                removeBinding(conflictData.existing.keyCode);
                addBinding(conflictData.keyCode, conflictData.keyDisplay, conflictData.folderPath, conflictData.folderName);
                toast.success(`✅ Rebound to ${conflictData.keyDisplay}`);
                setShowConflict(false); setConflictData(null);
              }
            }}>
              Overwrite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
