import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Settings as SettingsIcon, Trash2, ArrowRight, Folder,
  Download, Upload, AlertTriangle, Loader2, Split, Eye, EyeOff, SkipForward,
  Copy, MoveRight
} from "lucide-react";
import { usePlayer, type Track } from "@/store/playerStore";
import { useSettings } from "@/store/settingsStore";
import { useSplitStore } from "@/store/splitStore";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

let idCounter = 0;
const nextId = () => `t_${Date.now()}_${idCounter++}`;
const isBrowser = typeof window !== 'undefined';

const AUDIO_EXTS = new Set([
  "mp3","wav","flac","aac","ogg","m4a","m4b","m4r","m4p",
  "mp4","mpeg","mpga","mp2","mpa","opus","wma","wmv",
  "aiff","aif","aifc","caf","alac","ape","dsf","dff",
  "dvf","gsm","ircam","m3u","mka","mlp","ra","rm",
  "snd","tak","tta","voc","vox","wv","m4v","mkv","mov","3gp","webm"
]);

const SKIP_FILES = new Set(['Thumbs.db','desktop.ini','.localized','Icon\r','.DS_Store']);
function isSystemFile(name: string) { return SKIP_FILES.has(name); }
function isSameFolder(a: string|null, b: string|null) {
  if (!a || !b) return false;
  const n = (p: string) => p.toLowerCase().replace(/\\/g,'/').replace(/\/$/,'');
  return n(a) === n(b);
}
function truncatePath(p: string, max = 35) {
  if (!p || p.length <= max) return p || "";
  const parts = p.split(/[\\/]/);
  return "..." + parts.slice(-2).join('/');
}
function cn(...c: (string|boolean|undefined)[]) { return c.filter(Boolean).join(' '); }

export function Toolbar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const setTracks      = usePlayer((s) => s.setTracks);
  const clearBroken    = usePlayer((s) => s.clearBrokenTracks);
  const resetPlayer    = usePlayer((s) => s.reset);
  const sourceFolder   = usePlayer((s) => s.sourceFolder);
  const clearProcessed = usePlayer((s) => s.clearProcessed);
  const targetFolder   = useSettings((s) => s.targetFolder);
  const autoPlayAfterLoad = useSettings((s) => s.autoPlayAfterLoad);
  const autoPlayNext   = useSettings((s) => s.autoPlayNext);
  const vizEnabled     = useSettings((s) => s.vizEnabled);
  const acceptMode     = useSettings((s) => s.acceptMode);
  const set            = useSettings((s) => s.set);
  const clearFolders   = useSettings((s) => s.clearFolders);
  const { isSplitMode, setSplitMode } = useSplitStore();

  const [scanning, setScanning]         = useState(false);
  const [showBroken, setShowBroken]     = useState(false);
  const [brokenList, setBrokenList]     = useState<Track[]>([]);
  const [scanTotal, setScanTotal]       = useState(0);
  const [showProgress, setShowProgress] = useState(false);

  const pickSource = useCallback(async () => {
    if (scanning) return;
    setScanning(true);
    try {
      const api = isBrowser ? window.electronAPI : null;
      if (!api) return;
      const folder = await api.selectFolderWithPreview();
      if (!folder) return;
      if (isSameFolder(folder, targetFolder)) {
        toast.error("Source folder cannot be the same as Target folder!"); return;
      }
      clearProcessed(); clearBroken(); idCounter = 0;
      const files = await api.scanFolder(folder);
      const audio = files.filter((f: any) => {
        if (isSystemFile(f.name)) return false;
        const ext = (f.ext || f.name.split('.').pop() || '').toLowerCase();
        return AUDIO_EXTS.has(ext);
      });
      const tracks: Track[] = audio.map((f: any) => ({ ...f, id: nextId(), status: "pending" }));
      setScanTotal(tracks.length);
      setShowProgress(true);
      setTimeout(() => setShowProgress(false), 600);
      if (!tracks.length) { toast.error("No audio files found"); return; }
      setTracks(tracks, folder);
      toast.success(`Loaded ${tracks.length} tracks`);
      if (autoPlayAfterLoad) {
        setTimeout(() => {
          const { tracks: t, setIndex, setIsPlaying } = usePlayer.getState();
          if (t.length) { setIndex(0); setIsPlaying(true); document.querySelector('audio')?.play().catch(()=>{}); }
        }, 100);
      }
    } catch (e) { console.error(e); toast.error("Failed to load folder"); }
    finally { setScanning(false); }
  }, [scanning, targetFolder, clearProcessed, clearBroken, autoPlayAfterLoad, setTracks]);

  const pickTarget = useCallback(async () => {
    const api = isBrowser ? window.electronAPI : null;
    if (!api) { toast.info("Requires desktop app"); return; }
    const folder = await api.selectFolderWithPreview();
    if (!folder) return;
    if (isSameFolder(folder, sourceFolder)) { toast.error("Target = Source!"); return; }
    const ok = await api.checkFolderExists(folder);
    if (!ok) { toast.error("Folder not found"); return; }
    set("targetFolder", folder);
    toast.success(`Target: ${folder}`);
  }, [set, sourceFolder]);

  const handleReset = useCallback(() => {
    resetPlayer(); clearFolders(); clearProcessed(); clearBroken();
    idCounter = 0; setShowBroken(false); setBrokenList([]);
    setScanTotal(0); setShowProgress(false);
    toast.success("Everything reset!");
  }, [resetPlayer, clearFolders, clearProcessed, clearBroken]);

  // Переключение режима Copy/Move
  const toggleAcceptMode = () => {
    const next = acceptMode === 'copy' ? 'move' : 'copy';
    set("acceptMode", next);
    toast.info(next === 'copy' ? "Mode: Copy" : "Mode: Move");
  };

  const isMoveMode = acceptMode === 'move';

  return (
    <>
      <div className="flex flex-col border-b border-border bg-card/60 backdrop-blur">
        <div className="mac-titlebar-spacer" />

        <div
          className="flex items-center justify-between px-4 h-14"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <div
            className="mac-toolbar-left flex items-center gap-3"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0 bg-primary/15 flex items-center justify-center">
              <img
                src="./icon.png"
                alt=""
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  const fb = e.currentTarget.parentElement?.querySelector('.icon-fallback') as HTMLElement;
                  if (fb) fb.style.display = 'flex';
                }}
              />
              <span className="icon-fallback text-primary text-sm font-bold hidden w-full h-full items-center justify-center">♪</span>
            </div>
            <span className="font-semibold tracking-tight select-none">Sortify</span>
            <Button
              size="sm"
              variant={isSplitMode ? "default" : "secondary"}
              onClick={() => {
                setSplitMode(!isSplitMode);
                toast.info(isSplitMode ? "Split Mode OFF" : "Split Mode ON", { duration: 2000 });
              }}
              className="gap-2 ml-4 font-medium"
              disabled={scanning}
            >
              <Split className="w-4 h-4" />
              Split
            </Button>
          </div>

          <div
            className="flex items-center gap-2"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <Button
              size="sm" variant="destructive"
              onClick={handleReset}
              className="gap-1 font-medium" disabled={scanning}
            >
              <Trash2 className="w-4 h-4" /> Reset All
            </Button>

            {/* Кнопка переключения Copy/Move — между Reset All и AutoPlay */}
            <Button
              size="sm"
              variant={isMoveMode ? "default" : "secondary"}
              onClick={toggleAcceptMode}
              title={isMoveMode ? "Mode: Move (click to switch to Copy)" : "Mode: Copy (click to switch to Move)"}
              className={cn(
                "gap-1 font-medium font-mono min-w-[48px]",
                isMoveMode && "bg-orange-600 hover:bg-orange-700 text-white border-orange-600"
              )}
            >
              {isMoveMode ? "M" : "C"}
            </Button>

            <Button
              size="sm"
              variant={autoPlayNext ? "default" : "secondary"}
              onClick={() => { set("autoPlayNext", !autoPlayNext); toast.info(autoPlayNext ? "Auto-play OFF" : "Auto-play ON"); }}
              title={autoPlayNext ? "Auto-play ON" : "Auto-play OFF"}
            >
              <SkipForward className="w-4 h-4" />
            </Button>

            <Button
              size="sm"
              variant={vizEnabled ? "default" : "secondary"}
              onClick={() => { set("vizEnabled", !vizEnabled); toast.info(vizEnabled ? "Visualizer OFF" : "Visualizer ON"); }}
            >
              {vizEnabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </Button>

            <Button size="sm" variant="secondary" onClick={onOpenSettings}>
              <SettingsIcon className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {showProgress && (
          <div className="px-4 py-2 bg-muted/30">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Loading...</span><span>{scanTotal} files</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div className="bg-primary h-2 rounded-full w-full" />
            </div>
          </div>
        )}

        <div
          className="flex items-center justify-center gap-6 px-4 py-4 bg-muted/20"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <div
            onClick={pickSource}
            className={cn(
              "flex-1 max-w-sm rounded-xl border-2 transition-all cursor-pointer",
              scanning ? "opacity-50 cursor-wait" : "",
              sourceFolder ? "border-solid border-primary/50 bg-card" : "border-dashed border-border bg-card hover:border-primary/50"
            )}
          >
            <div className="p-4 text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                {scanning ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  : <Upload className={cn("w-5 h-5", sourceFolder ? "text-primary" : "text-muted-foreground")} />}
                <span className="text-sm font-medium">Source Folder</span>
              </div>
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Folder className="w-4 h-4" />
                <span className="truncate max-w-[250px]">{sourceFolder ? truncatePath(sourceFolder) : "Click to select folder"}</span>
              </div>
              {sourceFolder && <div className="mt-2 text-[10px] text-primary/70">📁 Ready to import</div>}
            </div>
          </div>

          <ArrowRight className="w-6 h-6 text-muted-foreground flex-shrink-0" />

          <div
            onClick={pickTarget}
            className={cn(
              "flex-1 max-w-sm rounded-xl border-2 transition-all cursor-pointer",
              targetFolder ? "border-solid border-green-500/50 bg-card" : "border-dashed border-border bg-card hover:border-primary/50"
            )}
          >
            <div className="p-4 text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Download className={cn("w-5 h-5", targetFolder ? "text-green-500" : "text-muted-foreground")} />
                <span className="text-sm font-medium">Target Folder</span>
              </div>
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Folder className="w-4 h-4" />
                <span className="truncate max-w-[250px]">{targetFolder ? truncatePath(targetFolder) : "Click to select folder"}</span>
              </div>
              {targetFolder && <div className="mt-2 text-[10px] text-green-500/70">✓ Ready to accept tracks</div>}
            </div>
          </div>
        </div>
      </div>

      <Dialog open={showBroken} onOpenChange={setShowBroken}>
        <DialogContent className="max-w-lg max-h-[60vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-yellow-500">
              <AlertTriangle className="w-5 h-5" /> Broken Files
            </DialogTitle>
            <DialogDescription>These files are corrupted or unreadable:</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 mt-4 max-h-[300px] overflow-y-auto">
            {brokenList.map((f, i) => (
              <div key={i} className="flex items-center gap-2 p-2 bg-muted/30 rounded text-xs">
                <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0" />
                <span className="break-all">{f.name}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-4">
            <Button variant="outline" className="flex-1"
              onClick={() => { navigator.clipboard.writeText(brokenList.map(f=>f.name).join('\n')); toast.success("Copied"); }}>
              Copy List
            </Button>
            <Button className="flex-1" onClick={() => setShowBroken(false)}>Continue</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
