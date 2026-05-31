import { useRef, useEffect, useState, useCallback, lazy, Suspense } from "react";
import { usePlayer } from "@/store/playerStore";
import { useSettings } from "@/store/settingsStore";
import { useSplitStore } from "@/store/splitStore";
import { useAudioEngine, useTrackUrl, useKeyboardControls } from "@/hooks/useAudioEngine";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Heart, X, RotateCcw, Pencil, Image as ImageIcon } from "lucide-react";
import { Visualizer } from "@/components/Visualizer";
import { CoverEditor } from "@/components/CoverEditor";
import { toast } from "sonner";

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

const WelcomeMessage = lazy(() => new Promise<{ default: () => JSX.Element }>((resolve) => {
  resolve({
    default: () => (
      <h2 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
        Hi, Music Lover!
      </h2>
    )
  });
}));

export function PlayerView() {
  const audioRef = useRef<HTMLAudioElement>(null);
  // Трекаем какие треки уже обработаны как ошибки — чтобы не вызывать skip дважды
  const errorHandledRef = useRef<Set<string>>(new Set());
  const [isClient, setIsClient] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [showCoverEditor, setShowCoverEditor] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    tracks,
    currentIndex,
    isPlaying,
    currentTime,
    duration,
    volume,
    audioResetKey,
    setStatus,
    addProcessedPath,
    next,
    prev,
    setIsPlaying,
    setTime,
    setDuration,
    setVolume,
    skipToNextValid,
    markCurrentAsPlayed,
    renameTrack,
    setTrackCover,
    addBrokenTrack,
  } = usePlayer();

  const {
    seekStep,
    acceptMode,
    rejectMode,
    rejectedFolder,
    targetFolder,
    autoPlayNext,
    vizEnabled,
    vizMode,
    vizSensitivity,
    performanceMode,
    coverApplyMode,
  } = useSettings();

  const { isSplitMode, getBindingByKey, isWaitingForBinding } = useSplitStore();

  const currentTrack = tracks[currentIndex];
  const trackWithId = currentTrack ? { ...currentTrack, id: currentTrack.id } : undefined;
  const { url: trackUrl, error: trackError } = useTrackUrl(trackWithId);
  const { analyser, ensureAudioContext, resetAudioContext } = useAudioEngine(audioRef);

  // Слушаем audioResetKey — когда он меняется (Reset All), сбрасываем AudioContext и визуализатор
  useEffect(() => {
    if (audioResetKey === 0) return; // Пропускаем начальное значение
    console.log('🔄 audioResetKey changed, resetting AudioContext');
    
    // Останавливаем аудио
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current.load();
    }
    
    // Сбрасываем AudioContext — это обнулит analyser → Visualizer получит null
    resetAudioContext();
    
    // Сбрасываем список обработанных ошибок
    errorHandledRef.current.clear();
  }, [audioResetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setIsClient(true); }, []);

  // Обработка ошибки загрузки трека из useTrackUrl
  // useTrackUrl помечает трек как error, здесь вызываем skip и чистим аудио
  useEffect(() => {
    if (trackError && currentTrack && currentTrack.status !== "error" && !errorHandledRef.current.has(currentTrack.id)) {
      errorHandledRef.current.add(currentTrack.id);
      console.log(`⚠️ Track error from useTrackUrl: ${currentTrack.name}`);
      toast.error(`Cannot play: ${currentTrack.name}`);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current.load();
      }
      resetAudioContext();
      // Единственное место где вызываем skip для ошибок из useTrackUrl
      setTimeout(() => skipToNextValid(), 150);
    }
  }, [trackError, currentTrack]); // eslint-disable-line react-hooks/exhaustive-deps

  // Автоплей при смене трека
  useEffect(() => {
    if (audioRef.current && trackUrl && currentTrack?.status !== "error" && isPlaying) {
      const playTrack = async () => {
        try {
          await ensureAudioContext();
          await new Promise(resolve => setTimeout(resolve, 10));
          await audioRef.current?.play();
        } catch (err) {
          console.error("❌ Auto-play failed:", err);
        }
      };
      playTrack();
    }
  }, [currentIndex, trackUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Split mode
  useEffect(() => {
    if (!isSplitMode || isWaitingForBinding) return;
    const handleSplitKey = async (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      const binding = getBindingByKey(e.code);
      if (binding && currentTrack && currentTrack.status !== "error") {
        e.preventDefault();
        e.stopPropagation();
        const api = window.electronAPI;
        if (api) {
          setIsLoading(true);
          try {
            const result = await api.acceptTrack(currentTrack.path, binding.folderPath, "copy");
            if (result.ok) {
              addProcessedPath(currentTrack.path);
              setStatus(currentTrack.id, acceptMode === "move" ? "moved" : "accepted");
              toast.success(`✅ Sent to ${binding.folderName}`);
              setTimeout(() => {
                const { tracks, currentIndex } = usePlayer.getState();
                if (currentIndex < tracks.length - 1) next();
              }, 100);
            } else {
              throw new Error(result.error || "Failed to send track");
            }
          } catch (err) {
            toast.error(`Failed to send: ${err instanceof Error ? err.message : "Unknown error"}`);
          } finally {
            setIsLoading(false);
          }
        }
      }
    };
    window.addEventListener("keydown", handleSplitKey);
    return () => window.removeEventListener("keydown", handleSplitKey);
  }, [isSplitMode, isWaitingForBinding, getBindingByKey, currentTrack, setStatus, addProcessedPath, next]);

  const keys = useSettings((s) => s.keys);

  useKeyboardControls(
    {
      reject: () => handleReject(),
      accept: () => handleAccept(),
      playPause: () => togglePlay(),
      volumeUp: () => setVolume(Math.min(1, volume + 0.1)),
      volumeDown: () => setVolume(Math.max(0, volume - 0.1)),
      seekBack: () => seekRelative(-seekStep),
      seekForward: () => seekRelative(seekStep),
      prevTrack: () => prev(),
      nextTrack: () => next(),
    },
    keys,
    !isEditing // Отключаем хоткеи пока редактируем название
  );

  const togglePlay = async () => {
    if (!trackUrl || currentTrack?.status === "error") {
      if (currentTrack?.status === "error") toast.error("This track is broken, please skip it");
      return;
    }
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        try {
          await ensureAudioContext();
          await new Promise(resolve => setTimeout(resolve, 10));
          await audioRef.current.play();
          setIsPlaying(true);
        } catch (err) {
          console.error("❌ Play failed:", err);
          toast.error("Cannot play: " + (err as Error).message);
          if (currentTrack && !errorHandledRef.current.has(currentTrack.id)) {
            errorHandledRef.current.add(currentTrack.id);
            setStatus(currentTrack.id, "error");
            addBrokenTrack({ id: currentTrack.id, name: currentTrack.name, path: currentTrack.path });
          }
        }
      }
    }
  };

  const seekRelative = (seconds: number) => {
    const newTime = Math.max(0, Math.min(duration, currentTime + seconds));
    if (audioRef.current) audioRef.current.currentTime = newTime;
    setTime(newTime);
  };

  const handleAccept = useCallback(async () => {
    if (!currentTrack || currentTrack.status === "error") return;
    if (!targetFolder) { toast.error("Please set a target folder first"); return; }
    setIsLoading(true);
    setError(null);
    try {
      const api = window.electronAPI;
      if (api) {
        const result = await api.acceptTrack(currentTrack.path, targetFolder, acceptMode);
        if (result.ok) {
          addProcessedPath(currentTrack.path);
          setStatus(currentTrack.id, acceptMode === "move" ? "moved" : "accepted");
          if (coverApplyMode === "onAccept" && currentTrack.cover) {
            await api.updateCoverOnAccept(targetFolder, currentTrack.name, currentTrack.cover);
          }
          if (result.skipped) {
            toast.warning(`⚠️ File already exists, skipped: ${currentTrack.name}`);
          } else {
            toast.success(`✅ Accepted: ${currentTrack.name}`);
          }
          setTimeout(() => {
            const { tracks, currentIndex } = usePlayer.getState();
            if (currentIndex < tracks.length - 1) next();
          }, 100);
        } else {
          throw new Error(result.error || "Failed to accept track");
        }
      } else {
        addProcessedPath(currentTrack.path);
        setStatus(currentTrack.id, acceptMode === "move" ? "moved" : "accepted");
        toast.success(`✅ Accepted (demo): ${currentTrack.name}`);
        setTimeout(() => {
          const { tracks, currentIndex } = usePlayer.getState();
          if (currentIndex < tracks.length - 1) next();
        }, 100);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
      toast.error(`Failed to accept: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  }, [currentTrack, targetFolder, acceptMode, setStatus, addProcessedPath, next, coverApplyMode]);

  const handleReject = useCallback(async () => {
    if (!currentTrack || currentTrack.status === "error") return;
    setIsLoading(true);
    setError(null);
    try {
      const api = window.electronAPI;
      if (api) {
        const result = await api.rejectTrack(
          currentTrack.path, rejectMode,
          rejectMode === "move" ? rejectedFolder || undefined : undefined
        );
        if (result.ok) {
          addProcessedPath(currentTrack.path);
          setStatus(currentTrack.id, "rejected");
          toast.warning(`❌ Skipped: ${currentTrack.name}`);
          setTimeout(() => {
            const { tracks, currentIndex } = usePlayer.getState();
            if (currentIndex < tracks.length - 1) next();
          }, 100);
        } else {
          throw new Error(result.error || "Failed to skip track");
        }
      } else {
        addProcessedPath(currentTrack.path);
        setStatus(currentTrack.id, "rejected");
        toast.warning(`❌ Skipped (demo): ${currentTrack.name}`);
        setTimeout(() => {
          const { tracks, currentIndex } = usePlayer.getState();
          if (currentIndex < tracks.length - 1) next();
        }, 100);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
      toast.error(`Failed to skip: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  }, [currentTrack, rejectMode, rejectedFolder, setStatus, addProcessedPath, next]);

  const handleReset = useCallback(() => {
    if (currentTrack && currentTrack.status !== "error") {
      setStatus(currentTrack.id, "pending");
      toast.info(`Reset: ${currentTrack.name}`);
    }
  }, [currentTrack, setStatus]);

  const handleRename = useCallback(async () => {
    if (!currentTrack || !editName.trim()) return;
    setIsSaving(true);
    try {
      const success = await renameTrack(currentTrack.id, editName.trim());
      if (success) {
        toast.success("Track renamed");
        setIsEditing(false);
      } else {
        toast.error("Failed to rename track");
      }
    } finally {
      setIsSaving(false);
    }
  }, [currentTrack, editName, renameTrack]);

  const onTimeUpdate = () => { if (audioRef.current) setTime(audioRef.current.currentTime); };
  const onLoadedMetadata = () => { if (audioRef.current) setDuration(audioRef.current.duration); };
  const onPlay = () => setIsPlaying(true);
  const onPause = () => setIsPlaying(false);

  const onEnded = () => {
    markCurrentAsPlayed();
    if (autoPlayNext) {
      const { tracks, currentIndex } = usePlayer.getState();
      if (currentIndex < tracks.length - 1) {
        next();
        setTimeout(() => {
          if (audioRef.current) audioRef.current.play().catch(() => {});
        }, 50);
      } else {
        setIsPlaying(false);
      }
    } else {
      setIsPlaying(false);
    }
  };

  // onError от <audio> тега — файл повреждён на уровне декодера браузера
  // Вызываем только если trackError эффект ещё не обработал этот трек
  const onError = () => {
    if (currentTrack && currentTrack.status !== "error" && !errorHandledRef.current.has(currentTrack.id)) {
      errorHandledRef.current.add(currentTrack.id);
      setStatus(currentTrack.id, "error");
      addBrokenTrack({ id: currentTrack.id, name: currentTrack.name, path: currentTrack.path });
      toast.error(`Failed to load: ${currentTrack.name}`);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current.load();
      }
      resetAudioContext();
      setTimeout(() => skipToNextValid(), 150);
    }
  };

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  if (tracks.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center w-full p-8">
        <div className="text-center space-y-4 w-full max-w-[400px]">
          <div className="text-8xl animate-bounce">🎵</div>
          {!isClient ? (
            <h2 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              Hi, Music Lover!
            </h2>
          ) : (
            <Suspense fallback={
              <h2 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                Hi, Music Lover!
              </h2>
            }>
              <WelcomeMessage />
            </Suspense>
          )}
          <p className="text-xl font-semibold mt-4">No tracks loaded</p>
          <p className="text-sm text-muted-foreground break-words">
            Click <span className="font-mono bg-muted px-2 py-0.5 rounded">"Source folder"</span> to load your music library
          </p>
          <div className="pt-8 text-muted-foreground">
            <p className="text-sm">✨ Ready to sort your music collection ✨</p>
            <p className="text-xs mt-2">🎧 Have a nice day 🎧 </p>
          </div>
        </div>
      </div>
    );
  }

  if (!currentTrack && tracks.length > 0) {
    const firstValidIndex = tracks.findIndex(t => t.status !== "error");
    if (firstValidIndex !== -1) {
      usePlayer.getState().setIndex(firstValidIndex);
    }
    return null;
  }

  return (
    <div className="flex-1 flex flex-col p-4 md:p-6 overflow-auto min-h-0">
      {/* Visualizer — analyser становится null после resetAudioContext, что корректно останавливает анимацию */}
      {vizEnabled && (
        <div className="mb-4 md:mb-6 flex-shrink-0">
          <Visualizer
            analyser={analyser}
            mode={vizMode}
            enabled={isPlaying && !!analyser}
            sensitivity={vizSensitivity}
            perfMode={performanceMode}
            onSeek={(progress) => {
              if (audioRef.current && duration) {
                audioRef.current.currentTime = progress * duration;
              }
            }}
          />
        </div>
      )}

      {/* Название трека / режим редактирования */}
      <div className="text-center mb-4 md:mb-6 flex-shrink-0">
        {isEditing ? (
          // Оверлей чтобы форма была поверх всего и не блокировала клики на фон
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={(e) => {
              // Клик на фон закрывает редактирование
              if (e.target === e.currentTarget) setIsEditing(false);
            }}
          >
            <div className="bg-card border border-border rounded-xl p-6 shadow-2xl w-full max-w-lg mx-4">
              <p className="text-sm text-muted-foreground mb-3">Rename track</p>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename();
                  if (e.key === 'Escape') setIsEditing(false);
                }}
                className="w-full text-lg font-bold bg-background border border-border rounded-lg px-4 py-2 text-center focus:outline-none focus:ring-2 focus:ring-primary mb-4"
                autoFocus
                disabled={isSaving}
              />
              <div className="flex gap-2 justify-center">
                <Button size="sm" variant="outline" onClick={() => setIsEditing(false)} disabled={isSaving}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleRename} disabled={isSaving || !editName.trim()}>
                  {isSaving ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 group">
            <h2 className={cn(
              "text-xl md:text-2xl font-bold mb-1 md:mb-2 transition-all break-words px-2",
              currentTrack?.status === "error" && "text-muted-foreground line-through",
              isPlaying && "text-primary"
            )}>
              {currentTrack?.name || "Unknown"}
            </h2>
            {currentTrack && currentTrack.status !== "error" && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 p-0"
                  onClick={() => {
                    setEditName(currentTrack.name);
                    setIsEditing(true);
                  }}
                  title="Rename track"
                  disabled={isSaving}
                >
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 p-0"
                  onClick={() => setShowCoverEditor(true)}
                  title="Edit cover"
                  disabled={isSaving}
                >
                  <ImageIcon className="w-4 h-4" />
                </Button>
              </>
            )}
          </div>
        )}
        <p className="text-xs md:text-sm text-muted-foreground">
          Track {currentIndex + 1} of {tracks.length}
        </p>
        {currentTrack?.status === "error" && (
          <p className="text-destructive text-xs md:text-sm mt-2 animate-pulse">
            ⚠️ File not found or inaccessible
          </p>
        )}
        {error && <p className="text-destructive text-xs md:text-sm mt-2">{error}</p>}
      </div>

      {currentTrack?.status !== "error" && (
        <audio
          ref={audioRef}
          src={trackUrl}
          onTimeUpdate={onTimeUpdate}
          onLoadedMetadata={onLoadedMetadata}
          onPlay={onPlay}
          onPause={onPause}
          onEnded={onEnded}
          onError={onError}
        />
      )}

      <div className="mb-4 md:mb-6 flex-shrink-0">
        <Slider
          value={[currentTime]}
          max={duration || 100}
          step={0.1}
          onValueChange={([value]) => {
            if (audioRef.current) audioRef.current.currentTime = value;
            setTime(value);
          }}
          className="cursor-pointer"
          disabled={currentTrack?.status === "error"}
        />
        <div className="flex justify-between text-xs md:text-sm text-muted-foreground mt-1">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <div className="flex flex-col items-center gap-3 md:gap-4 mb-4 md:mb-6 flex-shrink-0">
        <div className="flex justify-center gap-2 md:gap-4">
          <Button
            variant="outline" size="default"
            onClick={() => seekRelative(-seekStep)}
            disabled={isLoading || currentTrack?.status === "error"}
            className="px-3 md:px-4"
          >
            <SkipBack className="w-4 h-4 md:w-5 md:h-5" />
            <span className="ml-1 md:ml-2 text-xs md:text-sm">-{seekStep}s</span>
          </Button>
          <Button
            size="default" onClick={togglePlay}
            disabled={!trackUrl || isLoading || currentTrack?.status === "error"}
            className="w-12 h-12 md:w-16 md:h-16 rounded-full"
          >
            {isPlaying ? <Pause className="w-6 h-6 md:w-8 md:h-8" /> : <Play className="w-6 h-6 md:w-8 md:h-8" />}
          </Button>
          <Button
            variant="outline" size="default"
            onClick={() => seekRelative(seekStep)}
            disabled={isLoading || currentTrack?.status === "error"}
            className="px-3 md:px-4"
          >
            <SkipForward className="w-4 h-4 md:w-5 md:h-5" />
            <span className="ml-1 md:ml-2 text-xs md:text-sm">+{seekStep}s</span>
          </Button>
        </div>
        <div className="flex items-center gap-2 w-32 md:w-48">
          <Button
            variant="ghost" size="sm"
            onClick={() => setVolume(volume === 0 ? 0.85 : 0)}
            className="p-1 md:p-2"
          >
            {volume === 0 ? <VolumeX className="w-3 h-3 md:w-4 md:h-4" /> : <Volume2 className="w-3 h-3 md:w-4 md:h-4" />}
          </Button>
          <Slider
            value={[volume]} max={1} step={0.01}
            onValueChange={([value]) => setVolume(value)}
            className="cursor-pointer"
          />
        </div>
      </div>

      <div className="flex justify-center gap-3 md:gap-6 flex-shrink-0 pb-2">
        <Button
          variant="destructive" size="default" onClick={handleReject}
          disabled={isLoading || currentTrack?.status === "error"}
          className="w-24 md:w-32 text-xs md:text-sm"
        >
          <X className="w-4 h-4 md:w-5 md:h-5 mr-1 md:mr-2" /> Skip
        </Button>
        <Button
          variant="outline" size="default" onClick={handleReset}
          disabled={isLoading || currentTrack?.status === "pending" || currentTrack?.status === "error"}
          className="w-24 md:w-32 text-xs md:text-sm"
        >
          <RotateCcw className="w-4 h-4 md:w-5 md:h-5 mr-1 md:mr-2" /> Reset
        </Button>
        <Button
          variant="default" size="default" onClick={handleAccept}
          disabled={isLoading || currentTrack?.status === "error"}
          className="w-24 md:w-32 bg-green-600 hover:bg-green-700 text-xs md:text-sm"
        >
          <Heart className="w-4 h-4 md:w-5 md:h-5 mr-1 md:mr-2" /> Accept
        </Button>
      </div>

      {showCoverEditor && currentTrack && (
        <CoverEditor
          currentCover={currentTrack.cover}
          trackName={currentTrack.name}
          trackId={currentTrack.id}
          onSave={async (id, cover) => {
            setIsSaving(true);
            const success = await setTrackCover(id, cover);
            if (success) toast.success("Cover updated");
            else toast.error("Failed to update cover");
            setIsSaving(false);
          }}
          onClose={() => setShowCoverEditor(false)}
        />
      )}
    </div>
  );
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
