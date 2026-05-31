import { useSettings, type CoverApplyMode, type VizMode } from "@/store/settingsStore";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useState } from "react";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Общий className для всех SelectContent — непрозрачный тёмный фон поверх всего
const selectContentClass = "bg-popover border border-border shadow-xl z-[9999]";

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const {
    theme,
    acceptMode,
    rejectMode,
    seekStep,
    autoPlayNext,
    autoPlayAfterLoad,
    coverApplyMode,
    vizEnabled,
    vizMode,
    vizSensitivity,
    performanceMode,
    keys,
    set,
    setKeys,
  } = useSettings();

  const [waitingForKey, setWaitingForKey] = useState<keyof typeof keys | null>(null);

  const startKeyChange = (keyName: keyof typeof keys) => {
    setWaitingForKey(keyName);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (waitingForKey) {
      e.preventDefault();
      e.stopPropagation();
      const code = e.code;
      if (code) {
        setKeys({ [waitingForKey]: code });
      }
      setWaitingForKey(null);
    }
  };

  const getKeyDisplay = (keyCode: string, keyName: keyof typeof keys): string => {
    if (waitingForKey === keyName) return "Press any key...";
    if (keyCode === "ArrowRight") return "→";
    if (keyCode === "ArrowLeft") return "←";
    if (keyCode === "ArrowUp") return "↑";
    if (keyCode === "ArrowDown") return "↓";
    if (keyCode === "Space") return "␣";
    if (keyCode === "KeyW") return "W";
    if (keyCode === "KeyS") return "S";
    if (keyCode === "KeyA") return "A";
    if (keyCode === "KeyD") return "D";
    return keyCode.replace("Key", "");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-card" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Configure Sortify to your liking</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="general" className="mt-4">
          <TabsList className="grid w-full grid-cols-4 bg-muted">
            <TabsTrigger value="general" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">General</TabsTrigger>
            <TabsTrigger value="audio" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Audio</TabsTrigger>
            <TabsTrigger value="visualizer" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Visualizer</TabsTrigger>
            <TabsTrigger value="hotkeys" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Hotkeys</TabsTrigger>
          </TabsList>

          {/* General */}
          <TabsContent value="general" className="space-y-4 mt-4">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle>Appearance</CardTitle>
                <CardDescription>Theme and display settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-foreground">Dark Mode</Label>
                  <Switch
                    checked={theme === "dark"}
                    onCheckedChange={(checked) => set("theme", checked ? "dark" : "light")}
                    className="data-[state=checked]:bg-primary"
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle>File Operations</CardTitle>
                <CardDescription>How tracks are handled</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">

                <div className="flex items-center justify-between">
                  <Label className="text-foreground">Accept Mode</Label>
                  <Select value={acceptMode} onValueChange={(v) => set("acceptMode", v as any)}>
                    <SelectTrigger className="w-32 bg-background border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className={selectContentClass}>
                      <SelectItem value="copy">Copy</SelectItem>
                      <SelectItem value="move">Move</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-foreground">Reject Mode</Label>
                  <span className="text-sm text-muted-foreground px-3 py-2 rounded-md border border-border bg-background">Skip Only</span>
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-foreground">Auto-play next track</Label>
                  <Switch
                    checked={autoPlayNext}
                    onCheckedChange={(checked) => set("autoPlayNext", checked)}
                    className="data-[state=checked]:bg-primary"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-foreground">Auto-play after folder load</Label>
                  <Switch
                    checked={autoPlayAfterLoad}
                    onCheckedChange={(checked) => set("autoPlayAfterLoad", checked)}
                    className="data-[state=checked]:bg-primary"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-foreground">Auto-apply cover</Label>
                  <Select value={coverApplyMode} onValueChange={(v) => set("coverApplyMode", v as CoverApplyMode)}>
                    <SelectTrigger className="w-40 bg-background border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className={selectContentClass}>
                      <SelectItem value="off">Off</SelectItem>
                      <SelectItem value="onAccept">On Accept</SelectItem>
                      <SelectItem value="onFolderLoad">On Folder Load</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

              </CardContent>
            </Card>
          </TabsContent>

          {/* Audio */}
          <TabsContent value="audio" className="space-y-4 mt-4">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle>Playback</CardTitle>
                <CardDescription>Audio playback settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-foreground">Seek Step: {seekStep} seconds</Label>
                  <Slider
                    value={[seekStep]}
                    min={5} max={30} step={5}
                    onValueChange={([value]) => set("seekStep", value)}
                    className="[&_[role=slider]]:bg-primary"
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Visualizer */}
          <TabsContent value="visualizer" className="space-y-4 mt-4">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle>Visualizer</CardTitle>
                <CardDescription>Audio visualization settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                  <div>
                    <Label htmlFor="viz-enabled" className="text-base font-semibold text-foreground">
                      Enable Visualizer
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      Show/hide audio visualization on player screen
                    </p>
                  </div>
                  <Switch
                    id="viz-enabled"
                    checked={vizEnabled}
                    onCheckedChange={(checked) => set("vizEnabled", checked)}
                    className="data-[state=checked]:bg-primary scale-110"
                  />
                </div>

                {vizEnabled && (
                  <div className="pt-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-foreground">Visualization Mode</Label>
                      <Select value={vizMode} onValueChange={(v) => set("vizMode", v as VizMode)}>
                        <SelectTrigger className="w-48 bg-background border-border">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className={selectContentClass}>
                          <SelectItem value="particle_flow">✨ Particle Flow</SelectItem>
                          <SelectItem value="dna_helix">🧬 DNA Helix</SelectItem>
                          <SelectItem value="ink_drop">🖋 Ink Drop</SelectItem>
                          <SelectItem value="city_lights">🌃 City Lights</SelectItem>
                          <SelectItem value="neon_ring">💠 Neon Ring</SelectItem>
                          <SelectItem value="mirror_bars">🪞 Mirror Bars</SelectItem>
                          <SelectItem value="plasma">🔮 Plasma</SelectItem>
                          <SelectItem value="oscilloscope">📟 Oscilloscope</SelectItem>
                          <SelectItem value="dual_waveform">🎛️ Dual Waveform</SelectItem>
                          <SelectItem value="rms_meter">📏 RMS Meter</SelectItem>
                          <SelectItem value="aurora">🌌 Aurora</SelectItem>
                          <SelectItem value="vu_meter">💡 VU Meter</SelectItem>
                          <SelectItem value="lissajous">🎯 Lissajous</SelectItem>
                          <SelectItem value="wave">🌊 Wave</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-foreground">Sensitivity: {vizSensitivity.toFixed(1)}</Label>
                      <Slider
                        value={[vizSensitivity]}
                        min={0.5} max={2} step={0.1}
                        onValueChange={([value]) => set("vizSensitivity", value)}
                        className="[&_[role=slider]]:bg-primary"
                      />
                      <p className="text-xs text-muted-foreground">
                        Controls the intensity/height of the visualization
                      </p>
                    </div>

                    <div className="flex items-center justify-between">
                      <Label className="text-foreground">Performance Mode</Label>
                      <Switch
                        checked={performanceMode}
                        onCheckedChange={(checked) => set("performanceMode", checked)}
                        className="data-[state=checked]:bg-primary"
                      />
                      <p className="text-xs text-muted-foreground ml-2">
                        Reduces FPS for better performance
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Hotkeys */}
          <TabsContent value="hotkeys" className="space-y-4 mt-4">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle>Keyboard Shortcuts</CardTitle>
                <CardDescription>Customize your hotkeys</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {(
                    [
                      ["accept", "Accept Track"],
                      ["reject", "Reject/Skip Track"],
                      ["playPause", "Play/Pause"],
                      ["prevTrack", "Previous Track"],
                      ["nextTrack", "Next Track"],
                      ["volumeUp", "Volume Up"],
                      ["volumeDown", "Volume Down"],
                      ["seekBack", "Seek Backward"],
                      ["seekForward", "Seek Forward"],
                    ] as [keyof typeof keys, string][]
                  ).map(([keyName, label]) => (
                    <div key={keyName} className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{label}</Label>
                      <div
                        className={`p-2 border rounded-md text-center font-mono text-sm cursor-pointer transition-all ${
                          waitingForKey === keyName
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted/50 hover:bg-muted border-border text-foreground"
                        }`}
                        onClick={() => startKeyChange(keyName)}
                      >
                        {getKeyDisplay(keys[keyName], keyName)}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-4">
                  Click on any key box and press a key to change its binding.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
