import { create } from 'zustand';

export const useStore = create((set, get) => ({
  currentItem: null,
  setCurrentItem: (item) => set({ currentItem: item }),
  
  originalImage: null,
  setOriginalImage: (src) => set({ originalImage: src }),
  
  processedImage: null,
  setProcessedImage: (src) => set({ processedImage: src }),
  
  ghostOverlay: true,
  setGhostOverlay: (val) => set({ ghostOverlay: val }),
  
  brushSize: 20,
  setBrushSize: (size) => set({ brushSize: size }),
  
  editorMode: 'erase', // 'erase' | 'restore' | 'pan' | 'smart' | 'color' | 'crop'
  setEditorMode: (mode) => set({ editorMode: mode }),
  
  tolerance: 35,
  setTolerance: (val) => set({ tolerance: val }),
  
  zoom: 1,
  setZoom: (z) => set((s) => ({ zoom: typeof z === 'function' ? z(s.zoom) : z })),

  pan: { x: 0, y: 0 },
  setPan: (p) => set((s) => ({ pan: typeof p === 'function' ? p(s.pan) : p })),

  modelMode: 'best', // 'fast' | 'best'
  setModelMode: (mode) => set({ modelMode: mode }),

  ghostBadges: typeof window !== 'undefined' && localStorage.getItem('ipad_br_ghost_badges') === 'true',
  setGhostBadges: (val) => {
    try { if (typeof window !== 'undefined') localStorage.setItem('ipad_br_ghost_badges', String(val)); } catch (_) {}
    set({ ghostBadges: val });
  },

  isSidebarMinimized: false,
  setIsSidebarMinimized: (val) => set({ isSidebarMinimized: val }),

  sidebarPos: null, // { x, y }
  setSidebarPos: (pos) => set((s) => ({ sidebarPos: typeof pos === 'function' ? pos(s.sidebarPos) : pos })),
  
  canUndo: false,
  setCanUndo: (val) => set({ canUndo: val }),
  
  canRedo: false,
  setCanRedo: (val) => set({ canRedo: val }),

  editorUndo: () => {
    window.dispatchEvent(new CustomEvent('editor-undo'));
  },
  
  editorRedo: () => {
    window.dispatchEvent(new CustomEvent('editor-redo'));
  },
  
  clearEditorHistory: () => {
    set({ canUndo: false, canRedo: false });
    window.dispatchEvent(new CustomEvent('editor-clear-history'));
  },

  stripOutlines: () => {
    window.dispatchEvent(new CustomEvent('editor-strip-outlines'));
  },

  activeCropImage: null,
  setActiveCropImage: (src) => set({ activeCropImage: src }),

  cropTray: [],
  setCropTray: (tray) => set((s) => ({ cropTray: typeof tray === 'function' ? tray(s.cropTray) : tray })),

  cropPoints: [],
  setCropPoints: (pts) => set((s) => ({ cropPoints: typeof pts === 'function' ? pts(s.cropPoints) : pts })),

  canCropUndo: false,
  setCanCropUndo: (val) => set({ canCropUndo: val }),

  canCropRedo: false,
  setCanCropRedo: (val) => set({ canCropRedo: val }),

  cropUndo: () => {
    window.dispatchEvent(new CustomEvent('crop-undo'));
  },

  cropRedo: () => {
    window.dispatchEvent(new CustomEvent('crop-redo'));
  },

  clearCropHistory: () => {
    set({ activeCropImage: null, cropPoints: [], cropTray: [], canCropUndo: false, canCropRedo: false, detectedSuggestions: [] });
    window.dispatchEvent(new CustomEvent('crop-clear-history'));
  },

  detectedSuggestions: [],
  setDetectedSuggestions: (suggestions) => set((s) => ({ detectedSuggestions: typeof suggestions === 'function' ? suggestions(s.detectedSuggestions) : suggestions })),

  eagleHost: (typeof window !== 'undefined' && localStorage.getItem('ipad_br_eagle_host')) || '',
  setEagleHost: (host) => {
    try { if (typeof window !== 'undefined') localStorage.setItem('ipad_br_eagle_host', host); } catch (_) {}
    set({ eagleHost: host });
  },

  queue: [],
  setQueue: (q) => set((s) => ({ queue: typeof q === 'function' ? q(s.queue) : q })),

  activeQueueId: null,
  setActiveQueueId: (id) => set({ activeQueueId: id }),
}));
