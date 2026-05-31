import { create } from "zustand";
import type { AudioFileEntry } from "@/types/electron";

export type TrackStatus = "pending" | "accepted" | "rejected" | "error" | "played" | "moved";

export interface Track extends AudioFileEntry {
  id: string;
  status: TrackStatus;
  url?: string;
  cover?: string;
}

interface PlayerState {
  tracks: Track[];
  brokenTracks: Track[];
  currentIndex: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  sourceFolder: string | null;
  processedPaths: string[];
  audioResetKey: number;

  setTracks: (tracks: Track[], sourceFolder: string | null) => void;
  setBrokenTracks: (tracks: Track[]) => void;
  clearBrokenTracks: () => void;
  addBrokenTrack: (track: { id: string; name: string; path: string }) => void;
  setStatus: (id: string, status: TrackStatus) => void;
  removeTrack: (id: string) => void;
  addProcessedPath: (path: string) => void;
  isPathProcessed: (path: string) => boolean;
  next: () => void;
  prev: () => void;
  setIndex: (i: number) => void;
  setIsPlaying: (b: boolean) => void;
  setTime: (t: number) => void;
  setDuration: (d: number) => void;
  setVolume: (v: number) => void;
  clearProcessed: () => void;
  skipToNextValid: () => void;
  reset: () => void;
  markCurrentAsPlayed: () => void;
  renameTrack: (id: string, newName: string) => Promise<boolean>;
  setTrackCover: (id: string, cover: string | undefined) => Promise<boolean>;
}

export const usePlayer = create<PlayerState>()((set, get) => ({
  tracks: [],
  brokenTracks: [],
  currentIndex: 0,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 0.85,
  sourceFolder: null,
  processedPaths: [],
  audioResetKey: 0,

  setTracks: (tracks, sourceFolder) => {
    const { isPathProcessed } = get();
    const filtered = tracks.filter(t => !isPathProcessed(t.path));
    set({ tracks: filtered, sourceFolder, currentIndex: 0 });
    return filtered;
  },

  setBrokenTracks: (tracks) => set({ brokenTracks: tracks }),
  clearBrokenTracks: () => set({ brokenTracks: [] }),

  addBrokenTrack: (track) => set((s) => {
    if (s.brokenTracks.some(t => t.id === track.id)) return s;
    const bt: Track = {
      id: track.id, name: track.name, path: track.path,
      size: 0, extension: track.path.split('.').pop()?.toLowerCase() || '',
      status: "error",
    };
    return { brokenTracks: [...s.brokenTracks, bt] };
  }),

  setStatus: (id, status) => set((s) => {
    const track = s.tracks.find(t => t.id === id);
    if (track && status !== "pending" && status !== "error" && status !== "played" && status !== "moved") {
      if (!s.processedPaths.includes(track.path)) s.processedPaths.push(track.path);
    }
    return {
      tracks: s.tracks.map(t => t.id === id ? { ...t, status } : t),
      processedPaths: s.processedPaths,
    };
  }),

  removeTrack: (id) => set((s) => {
    const idx = s.tracks.findIndex(t => t.id === id);
    const newTracks = s.tracks.filter(t => t.id !== id);
    let newIndex = s.currentIndex;
    if (idx < s.currentIndex) newIndex = s.currentIndex - 1;
    else if (idx === s.currentIndex) newIndex = s.currentIndex;
    newIndex = Math.max(0, Math.min(newIndex, newTracks.length - 1));
    return { tracks: newTracks, currentIndex: newIndex, processedPaths: s.processedPaths };
  }),

  addProcessedPath: (path) => set((s) => {
    if (!s.processedPaths.includes(path)) s.processedPaths.push(path);
    return { processedPaths: s.processedPaths };
  }),

  isPathProcessed: (path) => get().processedPaths.includes(path),

  next: () => {
    const { tracks, currentIndex, markCurrentAsPlayed } = get();
    if (tracks[currentIndex]?.status === "pending") markCurrentAsPlayed();
    let next = currentIndex + 1;
    while (next < tracks.length && (tracks[next].status === "error" || tracks[next].status === "moved")) next++;
    if (next < tracks.length) set({ currentIndex: next, currentTime: 0 });
    else set({ isPlaying: false });
  },

  prev: () => {
    const { tracks, currentIndex, markCurrentAsPlayed } = get();
    if (tracks[currentIndex]?.status === "pending") markCurrentAsPlayed();
    let prev = currentIndex - 1;
    while (prev >= 0 && (tracks[prev].status === "error" || tracks[prev].status === "moved")) prev--;
    if (prev >= 0) set({ currentIndex: prev, currentTime: 0 });
  },

  setIndex: (i) => {
    const { tracks } = get();
    if (i >= 0 && i < tracks.length) {
      const t = tracks[i];
      // Не даём перейти к moved или error треку
      if (t.status === "moved" || t.status === "error") return;
      set({ currentIndex: i, currentTime: 0 });
    }
  },

  skipToNextValid: () => {
    const { tracks, currentIndex } = get();
    let next = currentIndex + 1;
    while (next < tracks.length && (tracks[next].status === "error" || tracks[next].status === "moved")) next++;
    if (next < tracks.length) set({ currentIndex: next, currentTime: 0 });
    else set({ isPlaying: false });
  },

  markCurrentAsPlayed: () => {
    const { tracks, currentIndex } = get();
    const t = tracks[currentIndex];
    if (t?.status === "pending") {
      set((s) => ({
        tracks: s.tracks.map((tr, i) => i === currentIndex ? { ...tr, status: "played" } : tr),
      }));
    }
  },

  renameTrack: async (id, newName) => {
    const track = get().tracks.find(t => t.id === id);
    if (!track) return false;
    const api = window.electronAPI;
    if (!api) return false;
    const r = await api.renameFile(track.path, newName);
    if (r.ok) {
      await api.updateTitle(r.newPath, newName);
      set((s) => ({
        tracks: s.tracks.map(t => t.id === id ? { ...t, name: newName, path: r.newPath } : t),
      }));
      return true;
    }
    return false;
  },

  setTrackCover: async (id, coverBase64) => {
    const track = get().tracks.find(t => t.id === id);
    if (!track) return false;
    const api = window.electronAPI;
    if (!api) return false;
    const r = await api.updateCover(track.path, coverBase64 || '');
    if (r.ok) {
      set((s) => ({
        tracks: s.tracks.map(t => t.id === id ? { ...t, cover: coverBase64 } : t),
      }));
      return true;
    }
    return false;
  },

  setIsPlaying: (b) => set({ isPlaying: b }),
  setTime: (t) => set({ currentTime: t }),
  setDuration: (d) => set({ duration: d }),
  setVolume: (v) => set({ volume: Math.max(0, Math.min(1, v)) }),
  clearProcessed: () => set({ processedPaths: [] }),

  reset: () => set((s) => ({
    tracks: [], currentIndex: 0, sourceFolder: null,
    processedPaths: [], brokenTracks: [], isPlaying: false,
    currentTime: 0, duration: 0,
    audioResetKey: s.audioResetKey + 1,
  })),
}));
