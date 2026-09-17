import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useStore } from '../store';
import { detectElementsFromCanvas } from '../services/elementDetector';

// ─── Shared Fast Outline & Stray Line Detection Helpers ───
const AXES_4 = [
  [1, 0],   // Horizontal
  [0, 1],   // Vertical
  [1, 1],   // Diagonal 45°
  [1, -1],  // Diagonal 135°
];

const isOutlineColorFast = (r, g, b, a, minBrightness, maxChroma) => {
  if (a < 10) return false;
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);
  const brightness = (r + g + b) / 3;
  return brightness >= minBrightness && chroma <= maxChroma;
};

// Fast BFS distance map from transparent background (only propagates up to maxDist)
const computeBgDistanceMap = (data, w, h, maxDist) => {
  const dist = new Int8Array(w * h);
  dist.fill(-1);

  const qX = new Int32Array(w * h);
  const qY = new Int32Array(w * h);
  let head = 0;
  let tail = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      if (data[idx + 3] < 10) continue;

      let touchesBg = false;
      if (x === 0 || x === w - 1 || y === 0 || y === h - 1) {
        touchesBg = true;
      } else {
        if (data[((y) * w + (x - 1)) * 4 + 3] < 10 ||
            data[((y) * w + (x + 1)) * 4 + 3] < 10 ||
            data[((y - 1) * w + (x)) * 4 + 3] < 10 ||
            data[((y + 1) * w + (x)) * 4 + 3] < 10) {
          touchesBg = true;
        }
      }

      if (touchesBg) {
        dist[y * w + x] = 1;
        qX[tail] = x;
        qY[tail] = y;
        tail++;
      }
    }
  }

  while (head < tail) {
    const cx = qX[head];
    const cy = qY[head];
    const cd = dist[cy * w + cx];
    head++;

    if (cd >= maxDist) continue;

    const nbs = [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1]
    ];

    for (let i = 0; i < 4; i++) {
      const nx = nbs[i][0];
      const ny = nbs[i][1];
      if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
        const nPos = ny * w + nx;
        if (data[nPos * 4 + 3] >= 10 && dist[nPos] === -1) {
          dist[nPos] = cd + 1;
          qX[tail] = nx;
          qY[tail] = ny;
          tail++;
        }
      }
    }
  }

  return dist;
};

export default function BackgroundEditor() {
  const canvasRef = useRef(null);
  const ghostCanvasRef = useRef(null);
  const containerRef = useRef(null);
  const originalImgRef = useRef(null);
  const workingImgRef = useRef(null);
  const cursorRef = useRef(null);
  const cropCanvasRef = useRef(null);
  const lastDetectedRef = useRef(null);
  const isDrawingRef = useRef(false);
  const drawingPointerId = useRef(null);
  const activePenId = useRef(null);
  const activeLassoPointsRef = useRef([]);

  const processedImage = useStore((s) => s.processedImage);
  const originalImage = useStore((s) => s.originalImage);
  const ghostOverlay = useStore((s) => s.ghostOverlay);
  const editorMode = useStore((s) => s.editorMode);
  const brushSize = useStore((s) => s.brushSize);
  const tolerance = useStore((s) => s.tolerance);
  const setCanUndo = useStore((s) => s.setCanUndo);
  const setCanRedo = useStore((s) => s.setCanRedo);

  const cropPoints = useStore((s) => s.cropPoints);
  const setCropPoints = useStore((s) => s.setCropPoints);
  const cropTray = useStore((s) => s.cropTray);
  const setCropTray = useStore((s) => s.setCropTray);
  const activeCropImage = useStore((s) => s.activeCropImage);
  const setActiveCropImage = useStore((s) => s.setActiveCropImage);
  const setCanCropUndo = useStore((s) => s.setCanCropUndo);
  const setCanCropRedo = useStore((s) => s.setCanCropRedo);
  const detectedSuggestions = useStore((s) => s.detectedSuggestions);
  const setDetectedSuggestions = useStore((s) => s.setDetectedSuggestions);
  const ghostBadges = useStore((s) => s.ghostBadges);
  const setGhostBadges = useStore((s) => s.setGhostBadges);

  const [canvasSize, setCanvasSize] = useState({ width: 100, height: 100 });
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [hoveredSuggestionId, setHoveredSuggestionId] = useState(null);
  const [hasFitted, setHasFitted] = useState(false);

  const zoom = useStore((s) => s.zoom);
  const setZoom = useStore((s) => s.setZoom);
  const pan = useStore((s) => s.pan);
  const setPan = useStore((s) => s.setPan);
  const [isPanning, setIsPanning] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);

  // Viewport tracking state for scrolling bars
  const [viewportSize, setViewportSize] = useState({ width: 800, height: 600 });

  // Setup ResizeObserver to track container viewport dimensions
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setViewportSize({
          width: Math.round(entry.contentRect.width),
          height: Math.round(entry.contentRect.height)
        });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const W = viewportSize.width;
  const H = viewportSize.height;
  const contentW = canvasSize.width * zoom;
  const contentH = canvasSize.height * zoom;

  const limitX = Math.max(100, Math.round((canvasSize.width * zoom) / 2 + W / 2 - 50));
  const limitY = Math.max(100, Math.round((canvasSize.height * zoom) / 2 + H / 2 - 50));

  const showHScroll = contentW > W;
  const showVScroll = contentH > H;

  const scrollbarPadding = 4;
  const trackW = W - scrollbarPadding * 2;
  const trackH = H - scrollbarPadding * 2;

  const thumbW = Math.max(40, Math.round((W / Math.max(1, contentW)) * trackW));
  const thumbH = Math.max(40, Math.round((H / Math.max(1, contentH)) * trackH));

  const hPercent = limitX > 0 ? (limitX - pan.x) / (2 * limitX) : 0.5;
  const thumbLeft = Math.max(0, Math.min(trackW - thumbW, hPercent * (trackW - thumbW)));

  const vPercent = limitY > 0 ? (limitY - pan.y) / (2 * limitY) : 0.5;
  const thumbTop = Math.max(0, Math.min(trackH - thumbH, vPercent * (trackH - thumbH)));

  // Scrollbar Dragging Refs & Handlers
  const hScrollDrag = useRef(null);
  const vScrollDrag = useRef(null);

  const handleHScrollStart = (e) => {
    e.stopPropagation();
    e.preventDefault();
    try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
    hScrollDrag.current = {
      startX: e.clientX,
      startPanX: pan.x
    };
  };

  const handleHScrollMove = (e) => {
    if (!hScrollDrag.current) return;
    e.stopPropagation();
    const { startX, startPanX } = hScrollDrag.current;
    const deltaX = e.clientX - startX;
    const trackSize = trackW - thumbW;
    if (trackSize <= 0) return;
    const deltaPercent = deltaX / trackSize;
    const newPanX = startPanX - deltaPercent * (2 * limitX);
    setPan(p => ({ ...p, x: Math.max(-limitX, Math.min(limitX, Math.round(newPanX))) }));
  };

  const handleHScrollEnd = (e) => {
    if (!hScrollDrag.current) return;
    e.stopPropagation();
    try { e.target.releasePointerCapture(e.pointerId); } catch (_) {}
    hScrollDrag.current = null;
  };

  const handleVScrollStart = (e) => {
    e.stopPropagation();
    e.preventDefault();
    try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
    vScrollDrag.current = {
      startY: e.clientY,
      startPanY: pan.y
    };
  };

  const handleVScrollMove = (e) => {
    if (!vScrollDrag.current) return;
    e.stopPropagation();
    const { startY, startPanY } = vScrollDrag.current;
    const deltaY = e.clientY - startY;
    const trackSize = trackH - thumbH;
    if (trackSize <= 0) return;
    const deltaPercent = deltaY / trackSize;
    const newPanY = startPanY - deltaPercent * (2 * limitY);
    setPan(p => ({ ...p, y: Math.max(-limitY, Math.min(limitY, Math.round(newPanY))) }));
  };

  const handleVScrollEnd = (e) => {
    if (!vScrollDrag.current) return;
    e.stopPropagation();
    try { e.target.releasePointerCapture(e.pointerId); } catch (_) {}
    vScrollDrag.current = null;
  };

  const handleHTrackClick = (e) => {
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left - thumbW / 2;
    const trackSize = trackW - thumbW;
    if (trackSize <= 0) return;
    const clickPercent = Math.max(0, Math.min(1, clickX / trackSize));
    const newPanX = limitX - clickPercent * (2 * limitX);
    setPan(p => ({ ...p, x: Math.round(newPanX) }));
  };

  const handleVTrackClick = (e) => {
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickY = e.clientY - rect.top - thumbH / 2;
    const trackSize = trackH - thumbH;
    if (trackSize <= 0) return;
    const clickPercent = Math.max(0, Math.min(1, clickY / trackSize));
    const newPanY = limitY - clickPercent * (2 * limitY);
    setPan(p => ({ ...p, y: Math.round(newPanY) }));
  };

  // Smart brush state
  const smartColorSample = useRef(null);
  const lastDrawPos = useRef(null);

  // Undo/Redo stacks containing physical ImageData objects (extremely fast, zero React rendering overhead)
  const undoStack = useRef([]);
  const redoStack = useRef([]);

  // Multitouch gesture tracking
  const activePointers = useRef(new Map());
  const initialDistance = useRef(null);
  const initialMidpoint = useRef(null);
  const initialZoom = useRef(1);
  const initialPan = useRef({ x: 0, y: 0 });

  // Separate Crop Undo/Redo stacks
  const cropUndoStack = useRef([]);
  const cropRedoStack = useRef([]);

  // ─── Bind getCanvasDataUrl for App.jsx saving ───
  useEffect(() => {
    window.getCanvasDataUrl = () => {
      return canvasRef.current ? canvasRef.current.toDataURL('image/png') : null;
    };
    return () => {
      window.getCanvasDataUrl = null;
    };
  }, []);

  // ─── Setup Event Listeners for Undo/Redo/Clear ───
  useEffect(() => {
    const handleUndo = () => {
      const canvas = canvasRef.current;
      if (!canvas || undoStack.current.length === 0) return;
      const ctx = canvas.getContext('2d');
      
      // Save current state to redo stack
      const currentSnap = ctx.getImageData(0, 0, canvas.width, canvas.height);
      redoStack.current.push(currentSnap);
      if (redoStack.current.length > 30) {
        redoStack.current.shift();
      }
      
      // Apply previous state from undo stack
      const prevSnap = undoStack.current.pop();
      ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);
      ctx.putImageData(prevSnap, 0, 0);
      
      setCanUndo(undoStack.current.length > 0);
      setCanRedo(true);
    };

    const handleRedo = () => {
      const canvas = canvasRef.current;
      if (!canvas || redoStack.current.length === 0) return;
      const ctx = canvas.getContext('2d');
      
      // Save current state to undo stack
      const currentSnap = ctx.getImageData(0, 0, canvas.width, canvas.height);
      undoStack.current.push(currentSnap);
      if (undoStack.current.length > 30) {
        undoStack.current.shift();
      }
      
      // Apply next state from redo stack
      const nextSnap = redoStack.current.pop();
      ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);
      ctx.putImageData(nextSnap, 0, 0);
      
      setCanUndo(true);
      setCanRedo(redoStack.current.length > 0);
    };

    const handleClear = () => {
      undoStack.current = [];
      redoStack.current = [];
      setCanUndo(false);
      setCanRedo(false);
    };

    const handleFit = () => {
      const container = containerRef.current;
      if (!container) return;
      const containerW = container.clientWidth;
      const containerH = container.clientHeight;
      if (containerW > 0 && containerH > 0) {
        const imgW = canvasSize.width;
        const imgH = canvasSize.height;
        const scale = Math.min((containerW - 30) / imgW, (containerH - 30) / imgH, 1.5);
        setZoom(scale);
        setPan({ x: 0, y: 0 });
      }
    };

    const handleCropUndo = () => {
      const currentPoints = useStore.getState().cropPoints;
      const currentTray = useStore.getState().cropTray;

      if (currentPoints.length > 0) {
        // Tier 1: Lasso in progress - clear points
        const currentSnap = {
          points: [...currentPoints],
          tray: [...currentTray]
        };
        cropRedoStack.current.push(currentSnap);
        setCropPoints([]);
        
        setCanCropUndo(cropUndoStack.current.length > 0);
        setCanCropRedo(true);
      } else {
        // Tier 2: No lasso in progress - undo last crop tray action
        if (cropUndoStack.current.length === 0) return;
        const currentSnap = {
          points: [...currentPoints],
          tray: [...currentTray]
        };
        cropRedoStack.current.push(currentSnap);
        
        const prevSnap = cropUndoStack.current.pop();
        setCropPoints(prevSnap.points || []);
        setCropTray(prevSnap.tray || []);
        
        setCanCropUndo(cropUndoStack.current.length > 0);
        setCanCropRedo(true);
      }
    };

    const handleCropRedo = () => {
      if (cropRedoStack.current.length === 0) return;
      const currentPoints = useStore.getState().cropPoints;
      const currentTray = useStore.getState().cropTray;
      
      const currentSnap = {
        points: [...currentPoints],
        tray: [...currentTray]
      };
      cropUndoStack.current.push(currentSnap);
      
      const nextSnap = cropRedoStack.current.pop();
      setCropPoints(nextSnap.points || []);
      setCropTray(nextSnap.tray || []);
      
      setCanCropUndo(true);
      setCanCropRedo(cropRedoStack.current.length > 0);
    };

    const handleCropClear = () => {
      cropUndoStack.current = [];
      cropRedoStack.current = [];
      setCanCropUndo(false);
      setCanCropRedo(false);
    };

    window.addEventListener('editor-undo', handleUndo);
    window.addEventListener('editor-redo', handleRedo);
    window.addEventListener('editor-clear-history', handleClear);
    window.addEventListener('editor-fit-content', handleFit);
    window.addEventListener('crop-undo', handleCropUndo);
    window.addEventListener('crop-redo', handleCropRedo);
    window.addEventListener('crop-clear-history', handleCropClear);
    
    return () => {
      window.removeEventListener('editor-undo', handleUndo);
      window.removeEventListener('editor-redo', handleRedo);
      window.removeEventListener('editor-clear-history', handleClear);
      window.removeEventListener('editor-fit-content', handleFit);
      window.removeEventListener('crop-undo', handleCropUndo);
      window.removeEventListener('crop-redo', handleCropRedo);
      window.removeEventListener('crop-clear-history', handleCropClear);
    };
  }, [canvasSize, setCanUndo, setCanRedo, setZoom, setPan, setCropPoints, setCropTray, setActiveCropImage, setCanCropUndo, setCanCropRedo]);

  // ─── Extract Crop from Canvas Points Shared Helper ───
  const finalizeCropFromPoints = useCallback((pts) => {
    if (!pts || pts.length < 3) return null;
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = canvasSize.width;
    tmpCanvas.height = canvasSize.height;
    const tmpCtx = tmpCanvas.getContext('2d');
    tmpCtx.drawImage(canvas, 0, 0);

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    pts.forEach((pt) => {
      minX = Math.min(minX, pt.x);
      minY = Math.min(minY, pt.y);
      maxX = Math.max(maxX, pt.x);
      maxY = Math.max(maxY, pt.y);
    });

    minX = Math.max(0, Math.floor(minX));
    minY = Math.max(0, Math.floor(minY));
    maxX = Math.min(canvasSize.width, Math.ceil(maxX));
    maxY = Math.min(canvasSize.height, Math.ceil(maxY));

    const cropW = maxX - minX;
    const cropH = maxY - minY;

    if (cropW >= 1 && cropH >= 1) {
      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = cropW;
      cropCanvas.height = cropH;
      const cropCtx = cropCanvas.getContext('2d');

      cropCtx.beginPath();
      cropCtx.moveTo(pts[0].x - minX, pts[0].y - minY);
      for (let i = 1; i < pts.length; i++) {
        cropCtx.lineTo(pts[i].x - minX, pts[i].y - minY);
      }
      cropCtx.closePath();
      cropCtx.clip();

      cropCtx.drawImage(tmpCanvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);

      return cropCanvas.toDataURL('image/png');
    }
    return null;
  }, [canvasSize]);

  // ─── Polygon Simplification (Decimation) Helper ───
  const simplifyPolygon = useCallback((rawPoly) => {
    if (!rawPoly || rawPoly.length === 0) return [];
    const simplified = [];
    let last = null;
    for (let i = 0; i < rawPoly.length; i++) {
      const pt = rawPoly[i]; // [x, y]
      const x = pt[0];
      const y = pt[1];
      if (i === 0) {
        last = { x, y };
        simplified.push(last);
      } else {
        const dist = Math.hypot(x - last.x, y - last.y);
        if (dist >= 4.5) { // keep if at least ~4-5 canvas-pixels away
          last = { x, y };
          simplified.push(last);
        }
      }
    }
    return simplified;
  }, []);

  // ─── Trigger silent auto-detect from canvas (pure in-browser CCL) ───
  const runAutoDetect = useCallback(async (canvas) => {
    if (!canvas) return;
    try {
      const suggestions = detectElementsFromCanvas(canvas);
      setDetectedSuggestions(suggestions);
    } catch (err) {
      console.warn('[Auto-detect] Failed silently:', err);
    }
  }, [setDetectedSuggestions]);

  // Trigger auto-detect whenever entering crop mode
  useEffect(() => {
    if (editorMode === 'crop' && isEditorReady && canvasRef.current) {
      runAutoDetect(canvasRef.current);
    }
  }, [editorMode, isEditorReady, runAutoDetect]);

  // ─── Direct High-Performance Active Lasso Renderer ───
  const renderActiveLassoToCanvas = useCallback((pts) => {
    const cropCanvas = cropCanvasRef.current;
    if (!cropCanvas) return;
    const ctx = cropCanvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);

    // 1. Draw existing detected suggestions underneath
    const suggestions = useStore.getState().detectedSuggestions;
    if (suggestions && suggestions.length > 0) {
      suggestions.forEach((suggestion) => {
        const poly = suggestion.polygon;
        if (!poly || poly.length < 2) return;

        const isHovered = suggestion.id === hoveredSuggestionId;
        ctx.save();
        ctx.strokeStyle = isHovered ? 'rgba(250, 204, 21, 0.95)' : 'rgba(56, 189, 248, 0.85)';
        ctx.lineWidth = isHovered ? 3.5 : 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.setLineDash(isHovered ? [] : [4, 4]);
        ctx.beginPath();
        ctx.moveTo(poly[0].x, poly[0].y);
        for (let i = 1; i < poly.length; i++) {
          ctx.lineTo(poly[i].x, poly[i].y);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      });
    }

    if (!pts || pts.length < 2) {
      if (pts && pts.length === 1) {
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.arc(pts[0].x, pts[0].y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      return;
    }

    // 2. Semi-transparent mask outside the active lasso
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 3. Lively lasso outline
    ctx.save();
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();

    // 4. Closing guide line back to origin
    ctx.strokeStyle = 'rgba(74, 222, 128, 0.55)';
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    ctx.lineTo(pts[0].x, pts[0].y);
    ctx.stroke();

    // 5. Start anchor dot
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
  }, [canvasSize, hoveredSuggestionId]);

  // ─── Draw Static Suggestions Overlay ───
  const drawCropOverlay = useCallback(() => {
    const cropCanvas = cropCanvasRef.current;
    if (!cropCanvas) return;
    const ctx = cropCanvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);

    if (detectedSuggestions && detectedSuggestions.length > 0) {
      detectedSuggestions.forEach((suggestion) => {
        const poly = suggestion.polygon;
        if (!poly || poly.length < 2) return;

        const isHovered = suggestion.id === hoveredSuggestionId;
        ctx.save();
        ctx.strokeStyle = isHovered ? 'rgba(250, 204, 21, 0.95)' : 'rgba(56, 189, 248, 0.85)';
        ctx.lineWidth = isHovered ? 3.5 : 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.setLineDash(isHovered ? [] : [4, 4]);
        ctx.beginPath();
        ctx.moveTo(poly[0].x, poly[0].y);
        for (let i = 1; i < poly.length; i++) {
          ctx.lineTo(poly[i].x, poly[i].y);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      });
    }

    if (activeLassoPointsRef.current && activeLassoPointsRef.current.length > 0) {
      renderActiveLassoToCanvas(activeLassoPointsRef.current);
    }
  }, [canvasSize, detectedSuggestions, hoveredSuggestionId, renderActiveLassoToCanvas]);

  // Keep cropCanvas dimensions synced with DPR
  useEffect(() => {
    const cropCanvas = cropCanvasRef.current;
    if (!cropCanvas) return;
    const dpr = window.devicePixelRatio || 1;
    cropCanvas.width = canvasSize.width * dpr;
    cropCanvas.height = canvasSize.height * dpr;
    cropCanvas.style.width = `${canvasSize.width}px`;
    cropCanvas.style.height = `${canvasSize.height}px`;
    const ctx = cropCanvas.getContext('2d');
    ctx.scale(dpr, dpr);
    drawCropOverlay();
  }, [canvasSize, editorMode, drawCropOverlay]);

  // Redraw suggestions when suggestions list or hover state updates
  useEffect(() => {
    if (editorMode === 'crop') {
      drawCropOverlay();
    }
  }, [editorMode, detectedSuggestions, hoveredSuggestionId, drawCropOverlay]);

  // ─── Listen to external crop actions from ToolsPanel ───
  useEffect(() => {
    const handleAcceptAll = () => {
      const suggestions = useStore.getState().detectedSuggestions;
      if (!suggestions || suggestions.length === 0) return;

      const currentTray = useStore.getState().cropTray;
      cropUndoStack.current.push({ tray: [...currentTray] });
      if (cropUndoStack.current.length > 30) cropUndoStack.current.shift();
      cropRedoStack.current = [];
      setCanCropUndo(true);
      setCanCropRedo(false);

      const newCrops = [];
      for (const s of suggestions) {
        const dataUrl = finalizeCropFromPoints(s.polygon);
        if (dataUrl) {
          newCrops.push({
            id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
            dataUrl
          });
        }
      }

      if (newCrops.length > 0) {
        setCropTray((prev) => [...prev, ...newCrops]);
        setDetectedSuggestions([]);
        window.dispatchEvent(new CustomEvent('app-toast', { detail: `✓ Accepted ${newCrops.length} illustration cut${newCrops.length > 1 ? 's' : ''}!` }));
      }
    };

    const handleDismissAll = () => {
      setDetectedSuggestions([]);
      window.dispatchEvent(new CustomEvent('app-toast', { detail: '✕ Suggestions cleared for freehand drawing' }));
    };

    const handleRedetect = () => {
      if (canvasRef.current) {
        runAutoDetect(canvasRef.current);
        window.dispatchEvent(new CustomEvent('app-toast', { detail: '🪄 Re-detected illustration cuts' }));
      }
    };

    window.addEventListener('crop-accept-all', handleAcceptAll);
    window.addEventListener('crop-dismiss-all', handleDismissAll);
    window.addEventListener('crop-redetect', handleRedetect);

    return () => {
      window.removeEventListener('crop-accept-all', handleAcceptAll);
      window.removeEventListener('crop-dismiss-all', handleDismissAll);
      window.removeEventListener('crop-redetect', handleRedetect);
    };
  }, [finalizeCropFromPoints, setCropTray, setDetectedSuggestions, runAutoDetect, setCanCropUndo, setCanCropRedo]);

  // ─── Render Ghost Image (original behind cutout) ───
  const renderGhost = useCallback((w, h) => {
    const ghostCanvas = ghostCanvasRef.current;
    if (!ghostCanvas) return;
    const gCtx = ghostCanvas.getContext('2d');
    gCtx.clearRect(0, 0, w, h);
    if (ghostOverlay && originalImgRef.current) {
      gCtx.globalAlpha = 0.2;
      gCtx.drawImage(originalImgRef.current, 0, 0, w, h);
      gCtx.globalAlpha = 1;
    }
  }, [ghostOverlay]);

  // ─── Load original image ───
  useEffect(() => {
    if (!originalImage) return;
    const img = new Image();
    img.onload = () => {
      originalImgRef.current = img;
      renderGhost(canvasSize.width, canvasSize.height);
    };
    img.onerror = (e) => {
      console.error("[BackgroundEditor] Failed to load original image:", originalImage, e);
    };
    img.src = originalImage;
  }, [originalImage, canvasSize, renderGhost]);

  // ─── Load and store original image dimensions in state ───
  useEffect(() => {
    if (!processedImage) {
      setIsEditorReady(false);
      return;
    }
    if (!workingImgRef.current) {
      setIsEditorReady(false);
    }
    const img = new Image();
    img.onload = () => {
      workingImgRef.current = img;
      setCanvasSize({ width: img.width, height: img.height });
      setIsEditorReady(true);
      
      // Reset stacks on brand-new image load
      if (!hasFitted) {
        undoStack.current = [];
        redoStack.current = [];
        setCanUndo(false);
        setCanRedo(false);
      }
    };
    img.src = processedImage;
  }, [processedImage, hasFitted, setCanUndo, setCanRedo]);

  // ─── Fit Image Zoom & Pan to Container ───
  useEffect(() => {
    if (!isEditorReady || hasFitted || !containerRef.current) return;
    const container = containerRef.current;
    const containerW = container.clientWidth;
    const containerH = container.clientHeight;

    if (containerW > 0 && containerH > 0) {
      const imgW = canvasSize.width;
      const imgH = canvasSize.height;
      
      const scale = Math.min((containerW - 30) / imgW, (containerH - 30) / imgH, 1.5);
      setZoom(scale);
      setPan({ x: 0, y: 0 }); 
      setHasFitted(true);
    }
  }, [isEditorReady, canvasSize, hasFitted]);

  // Reset fit-to-screen flag when a new asset is loaded
  useEffect(() => {
    setHasFitted(false);
  }, [originalImage]);

  // ─── Draw the cutout working image onto canvas ───
  useEffect(() => {
    if (!isEditorReady || !processedImage || !workingImgRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);
    ctx.drawImage(workingImgRef.current, 0, 0, canvasSize.width, canvasSize.height);

    renderGhost(canvasSize.width, canvasSize.height);

    if (lastDetectedRef.current !== processedImage) {
      lastDetectedRef.current = processedImage;
      runAutoDetect(canvas);
    }
  }, [isEditorReady, canvasSize, processedImage, renderGhost, runAutoDetect]);

  // ─── Re-render ghost when toggle changes ───
  useEffect(() => {
    if (isEditorReady) {
      renderGhost(canvasSize.width, canvasSize.height);
    }
  }, [ghostOverlay, canvasSize, renderGhost, isEditorReady]);

  // ─── Get canvas coordinates corrected for CSS transform scale ───
  const getCanvasPos = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvasSize.width / rect.width;
    const scaleY = canvasSize.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, [canvasSize]);

  // ─── Save snapshot before drawing starts ───
  const saveSnapshot = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const snap = ctx.getImageData(0, 0, canvas.width, canvas.height);
    undoStack.current.push(snap);
    if (undoStack.current.length > 30) {
      undoStack.current.shift();
    }
    redoStack.current = []; 
    setCanUndo(true);
    setCanRedo(false);
  }, [setCanUndo, setCanRedo]);

  // ─── Drawing Brushes ───
  const applyBrush = useCallback((x, y) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (editorMode === 'erase') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (editorMode === 'restore') {
      if (!originalImgRef.current) return;
      ctx.globalCompositeOperation = 'source-over';
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(originalImgRef.current, 0, 0, canvasSize.width, canvasSize.height);
      ctx.restore();
    }
  }, [editorMode, brushSize, canvasSize]);

  // ─── Smart Brush (Erases thin whitish/grey outlines & stray lines while strictly protecting illustration artwork) ───
  const applySmartBrush = useCallback((canvas, cx, cy) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const r = Math.round(brushSize / 2);
    
    // maxThickness determines the maximum width of a stray line or outline halo to erase
    const maxThickness = Math.max(2, Math.min(16, Math.round(tolerance / 5.5)));
    const pad = maxThickness + 2;
    
    const startX = Math.max(0, Math.floor(cx - r));
    const startY = Math.max(0, Math.floor(cy - r));
    const endX = Math.min(canvasSize.width, Math.ceil(cx + r));
    const endY = Math.min(canvasSize.height, Math.ceil(cy + r));
    
    const w = endX - startX;
    const h = endY - startY;
    if (w <= 0 || h <= 0) return;
    
    const readStartX = Math.max(0, startX - pad);
    const readStartY = Math.max(0, startY - pad);
    const readEndX = Math.min(canvasSize.width, endX + pad);
    const readEndY = Math.min(canvasSize.height, endY + pad);
    const readW = readEndX - readStartX;
    const readH = readEndY - readStartY;
    if (readW <= 0 || readH <= 0) return;

    const imgData = ctx.getImageData(readStartX, readStartY, readW, readH);
    const data = imgData.data;

    // Outline color must be light whitish / grey (protects brown hair, skin, dark lines)
    const minBrightness = Math.max(150, Math.round(185 - (tolerance - 35) * 0.8));
    const maxChroma = Math.min(30, Math.round(22 + (tolerance - 35) * 0.2));

    let modified = false;

    // Scan pixels strictly inside the brush circle
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy > r * r) continue;

        const lx = x - readStartX;
        const ly = y - readStartY;
        const idx = (ly * readW + lx) * 4;
        const a = data[idx + 3];
        if (a < 10) continue;

        const pr = data[idx];
        const pg = data[idx + 1];
        const pb = data[idx + 2];

        if (!isOutlineColorFast(pr, pg, pb, a, minBrightness, maxChroma)) continue;

        // Must touch transparent background within maxThickness
        let touchesBgNearby = false;
        for (let a = 0; a < 4; a++) {
          const ax = AXES_4[a][0];
          const ay = AXES_4[a][1];
          for (let step = 1; step <= maxThickness; step++) {
            const px = x + step * ax;
            const py = y + step * ay;
            if (px < 0 || px >= canvasSize.width || py < 0 || py >= canvasSize.height) {
              touchesBgNearby = true;
              break;
            }
            const lx2 = px - readStartX;
            const ly2 = py - readStartY;
            if (lx2 >= 0 && lx2 < readW && ly2 >= 0 && ly2 < readH) {
              if (data[(ly2 * readW + lx2) * 4 + 3] < 10) {
                touchesBgNearby = true;
                break;
              }
            }
          }
          if (touchesBgNearby) break;
        }

        if (touchesBgNearby) {
          data[idx + 3] = 0; // Erase alpha
          modified = true;
        }
      }
    }

    if (modified) {
      ctx.putImageData(imgData, readStartX, readStartY);
    }
  }, [brushSize, canvasSize, tolerance]);

  // ─── 1-Click Connected Outline Removal (Click Away Outline) ───
  const removeConnectedOutline = useCallback((canvas, clickX, clickY) => {
    if (!canvas) return false;
    const ctx = canvas.getContext('2d');
    const w = canvasSize.width;
    const h = canvasSize.height;
    if (w <= 0 || h <= 0) return false;

    const maxThickness = Math.max(2, Math.min(16, Math.round(tolerance / 5.5)));
    const minBrightness = Math.max(150, Math.round(185 - (tolerance - 35) * 0.8));
    const maxChroma = Math.min(30, Math.round(22 + (tolerance - 35) * 0.2));

    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    const cx = Math.round(clickX);
    const cy = Math.round(clickY);

    // Compute boundary distance map
    const distFromBg = computeBgDistanceMap(data, w, h, maxThickness);

    // Search around click for nearest valid outline pixel
    let seedX = -1;
    let seedY = -1;
    let bestDistSq = Infinity;
    const searchR = Math.max(4, Math.min(12, maxThickness));

    for (let dy = -searchR; dy <= searchR; dy++) {
      for (let dx = -searchR; dx <= searchR; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || x >= w || y < 0 || y >= h) continue;
        const pos = y * w + x;
        if (distFromBg[pos] === -1) continue;

        const idx = pos * 4;
        const a = data[idx + 3];
        if (a < 10) continue;

        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        if (isOutlineColorFast(r, g, b, a, minBrightness, maxChroma)) {
          const distSq = dx * dx + dy * dy;
          if (distSq < bestDistSq) {
            bestDistSq = distSq;
            seedX = x;
            seedY = y;
          }
        }
      }
    }

    if (seedX === -1 || seedY === -1) return false;

    const seedIdx = (seedY * w + seedX) * 4;
    const seedR = data[seedIdx];
    const seedG = data[seedIdx + 1];
    const seedB = data[seedIdx + 2];

    saveSnapshot();

    // BFS along the connected outline
    const visited = new Uint8Array(w * h);
    const queueX = new Int32Array(w * h);
    const queueY = new Int32Array(w * h);
    let head = 0;
    let tail = 0;

    queueX[tail] = seedX;
    queueY[tail] = seedY;
    visited[seedY * w + seedX] = 1;
    tail++;

    const colorTol = 60 + (tolerance - 35) * 0.5;
    let erasedCount = 0;

    while (head < tail) {
      const qx = queueX[head];
      const qy = queueY[head];
      head++;

      const pIdx = (qy * w + qx) * 4;
      data[pIdx + 3] = 0;
      erasedCount++;

      for (let ody = -1; ody <= 1; ody++) {
        for (let odx = -1; odx <= 1; odx++) {
          if (odx === 0 && ody === 0) continue;
          const nx = qx + odx;
          const ny = qy + ody;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;

          const nPos = ny * w + nx;
          if (visited[nPos]) continue;
          if (distFromBg[nPos] === -1) continue; // must be on outer border

          const nIdx = nPos * 4;
          const na = data[nIdx + 3];
          if (na < 10) continue;

          const nr = data[nIdx];
          const ng = data[nIdx + 1];
          const nb = data[nIdx + 2];

          // Must match outline color range
          if (!isOutlineColorFast(nr, ng, nb, na, minBrightness, maxChroma)) {
            continue;
          }

          // Must be close to clicked seed color
          const diff = Math.abs(nr - seedR) + Math.abs(ng - seedG) + Math.abs(nb - seedB);
          if (diff > colorTol) continue;

          visited[nPos] = 1;
          queueX[tail] = nx;
          queueY[tail] = ny;
          tail++;
        }
      }
    }

    if (erasedCount > 0) {
      ctx.putImageData(imgData, 0, 0);
      return true;
    }
    return false;
  }, [canvasSize, tolerance, saveSnapshot]);

  // ─── 1-Click Strip All Outlines (Canvas-Wide) ───
  const stripAllOutlines = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvasSize.width;
    const h = canvasSize.height;
    if (w <= 0 || h <= 0) return;

    // Tolerance controls thickness (default ~6px) and brightness sensitivity
    const maxThickness = Math.max(2, Math.min(16, Math.round(tolerance / 5.5)));
    const minBrightness = Math.max(150, Math.round(185 - (tolerance - 35) * 0.8));
    const maxChroma = Math.min(30, Math.round(22 + (tolerance - 35) * 0.2));

    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    // Fast distance from background map (only expands up to maxThickness)
    const distFromBg = computeBgDistanceMap(data, w, h, maxThickness);

    let modified = false;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const pos = y * w + x;
        // Must be on the outer border (within maxThickness of background)
        if (distFromBg[pos] === -1) continue;

        const idx = pos * 4;
        const a = data[idx + 3];
        if (a < 10) continue;

        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        // Must match outline color (whitish / light-grey)
        if (isOutlineColorFast(r, g, b, a, minBrightness, maxChroma)) {
          data[idx + 3] = 0; // Erase alpha
          modified = true;
        }
      }
    }

    if (modified) {
      saveSnapshot();
      ctx.putImageData(imgData, 0, 0);
    }
  }, [canvasSize, tolerance, saveSnapshot]);

  // Listen to external strip-outlines event from App.jsx
  useEffect(() => {
    const handleStripOutlines = () => {
      stripAllOutlines();
    };
    window.addEventListener('editor-strip-outlines', handleStripOutlines);
    return () => window.removeEventListener('editor-strip-outlines', handleStripOutlines);
  }, [stripAllOutlines]);

  // ─── Color Erase (Magic Wand BFS Flood Fill) ───
  const runFloodFill = useCallback((canvas, startX, startY, startR, startG, startB, startA) => {
    const ctx = canvas.getContext('2d');
    const width = canvasSize.width;
    const height = canvasSize.height;
    
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    
    const visited = new Uint8Array(width * height);
    
    const queueX = new Int32Array(width * height);
    const queueY = new Int32Array(width * height);
    let head = 0;
    let tail = 0;
    
    queueX[tail] = startX;
    queueY[tail] = startY;
    tail++;
    visited[startY * width + startX] = 1;
    
    const tolSq = tolerance * tolerance;
    
    while (head < tail) {
      const cy = queueY[head];
      const cx = queueX[head];
      head++;
      
      const idx = (cy * width + cx) * 4;
      data[idx + 3] = 0; 
      
      const neighbors = [
        [cx + 1, cy],
        [cx - 1, cy],
        [cx, cy + 1],
        [cx, cy - 1]
      ];
      
      for (let i = 0; i < 4; i++) {
        const nx = neighbors[i][0];
        const ny = neighbors[i][1];
        
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const nIdx = ny * width + nx;
          if (!visited[nIdx]) {
            const pIdx = nIdx * 4;
            const r = data[pIdx];
            const g = data[pIdx + 1];
            const b = data[pIdx + 2];
            const a = data[pIdx + 3];
            
            if (a > 0) {
              const dr = r - startR;
              const dg = g - startG;
              const db = b - startB;
              const distSq = dr * dr + dg * dg + db * db;
              
              if (distSq <= tolSq) {
                visited[nIdx] = 1;
                queueX[tail] = nx;
                queueY[tail] = ny;
                tail++;
              }
            }
          }
        }
      }
    }
    
    ctx.putImageData(imgData, 0, 0);
  }, [canvasSize, tolerance]);

  // ─── Pointer Event Handlers ───
  const handlePointerDown = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Apple Pencil palm rejection: if pencil is active, ignore secondary touch inputs
    if (e.pointerType === 'pen') {
      activePenId.current = e.pointerId;
    } else if (e.pointerType === 'touch' && activePenId.current !== null) {
      return;
    }

    activePointers.current.set(e.pointerId, {
      clientX: e.clientX,
      clientY: e.clientY,
      pointerType: e.pointerType
    });

    const shouldPan = editorMode === 'pan' || e.button === 2 || e.button === 1 || e.shiftKey;

    if (shouldPan) {
      setIsPanning(true);
      try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
      dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      return;
    }

    // Multi-touch gestures (pinch-to-zoom / two-finger pan) only if both pointers are touch and not pen drawing
    const pts = Array.from(activePointers.current.values());
    const touchPointers = pts.filter(p => p.pointerType === 'touch');

    if (touchPointers.length === 2 && !activePenId.current && !isDrawingRef.current) {
      setIsPanning(true);
      initialDistance.current = Math.hypot(
        touchPointers[0].clientX - touchPointers[1].clientX,
        touchPointers[0].clientY - touchPointers[1].clientY
      );
      initialMidpoint.current = {
        x: (touchPointers[0].clientX + touchPointers[1].clientX) / 2,
        y: (touchPointers[0].clientY + touchPointers[1].clientY) / 2
      };
      initialZoom.current = zoom;
      initialPan.current = { ...pan };
      if (cursorRef.current) {
        cursorRef.current.style.display = 'none';
      }
      return;
    }

    // Primary action (left click, touch, or Apple Pencil)
    const isPrimaryAction = e.button === 0 || e.button === -1 || e.button === undefined || e.pointerType === 'pen' || e.pointerType === 'touch';

    if (isPrimaryAction && !isDrawingRef.current) {
      const pos = getCanvasPos(e);
      const ctx = canvas.getContext('2d');

      if (editorMode === 'crop') {
        try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
        drawingPointerId.current = e.pointerId;
        isDrawingRef.current = true;
        setIsDrawing(true);

        const currentSnap = {
          points: [],
          tray: [...useStore.getState().cropTray]
        };
        cropUndoStack.current.push(currentSnap);
        if (cropUndoStack.current.length > 30) {
          cropUndoStack.current.shift();
        }
        cropRedoStack.current = [];
        setCanCropUndo(true);
        setCanCropRedo(false);

        const cx = Math.max(0, Math.min(canvasSize.width, pos.x));
        const cy = Math.max(0, Math.min(canvasSize.height, pos.y));
        activeLassoPointsRef.current = [{ x: cx, y: cy }];
        renderActiveLassoToCanvas(activeLassoPointsRef.current);
      } else if (editorMode === 'color') {
        const pixel = ctx.getImageData(pos.x, pos.y, 1, 1).data;
        if (pixel[3] > 0) {
          saveSnapshot();
          runFloodFill(canvas, Math.round(pos.x), Math.round(pos.y), pixel[0], pixel[1], pixel[2], pixel[3]);
        }
      } else if (editorMode === 'smart') {
        try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
        drawingPointerId.current = e.pointerId;
        isDrawingRef.current = true;
        setIsDrawing(true);

        const outlineRemoved = removeConnectedOutline(canvas, pos.x, pos.y);
        if (!outlineRemoved) {
          saveSnapshot();
          applySmartBrush(canvas, pos.x, pos.y);
        }
        lastDrawPos.current = { x: pos.x, y: pos.y };

        const cursor = cursorRef.current;
        if (cursor) {
          cursor.style.display = 'block';
          cursor.style.transform = `translate(${pos.x - brushSize / 2}px, ${pos.y - brushSize / 2}px)`;
        }
      } else {
        try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
        drawingPointerId.current = e.pointerId;
        isDrawingRef.current = true;
        setIsDrawing(true);
        saveSnapshot();
        applyBrush(pos.x, pos.y);

        const cursor = cursorRef.current;
        if (cursor) {
          cursor.style.display = 'block';
          cursor.style.transform = `translate(${pos.x - brushSize / 2}px, ${pos.y - brushSize / 2}px)`;
        }
      }
    }
  };

  const handlePointerMove = (e) => {
    // Palm rejection
    if (e.pointerType === 'touch' && activePenId.current !== null) {
      return;
    }

    const canvas = canvasRef.current;
    const cursor = cursorRef.current;
    const pos = getCanvasPos(e);

    // Position brush cursor preview on hover/move
    if (canvas && cursor && editorMode !== 'pan' && editorMode !== 'color' && editorMode !== 'crop') {
      cursor.style.display = 'block';
      cursor.style.transform = `translate(${pos.x - brushSize / 2}px, ${pos.y - brushSize / 2}px)`;
    } else if (cursor) {
      cursor.style.display = 'none';
    }

    if (!activePointers.current.has(e.pointerId)) return;
    activePointers.current.set(e.pointerId, {
      clientX: e.clientX,
      clientY: e.clientY,
      pointerType: e.pointerType
    });

    const pts = Array.from(activePointers.current.values());
    const touchPointers = pts.filter(p => p.pointerType === 'touch');

    // Handle two-finger pinch-to-zoom
    if (touchPointers.length === 2 && isPanning && initialDistance.current) {
      if (cursor) cursor.style.display = 'none';

      const dist = Math.hypot(
        touchPointers[0].clientX - touchPointers[1].clientX,
        touchPointers[0].clientY - touchPointers[1].clientY
      );
      const factor = dist / (initialDistance.current || 1);
      const newZoom = Math.min(8, Math.max(0.15, initialZoom.current * factor));
      setZoom(newZoom);

      const mid = {
        x: (touchPointers[0].clientX + touchPointers[1].clientX) / 2,
        y: (touchPointers[0].clientY + touchPointers[1].clientY) / 2
      };
      const dx = mid.x - initialMidpoint.current.x;
      const dy = mid.y - initialMidpoint.current.y;

      setPan({
        x: initialPan.current.x + dx,
        y: initialPan.current.y + dy
      });
      return;
    }

    if (isPanning) {
      setPan({
        x: e.clientX - dragStart.current.x,
        y: e.clientY - dragStart.current.y
      });
      return;
    }

    if (isDrawingRef.current && e.pointerId === drawingPointerId.current) {
      if (editorMode === 'crop') {
        const cx = Math.max(0, Math.min(canvasSize.width, pos.x));
        const cy = Math.max(0, Math.min(canvasSize.height, pos.y));
        const ptsList = activeLassoPointsRef.current;
        if (ptsList.length === 0) {
          ptsList.push({ x: cx, y: cy });
          renderActiveLassoToCanvas(ptsList);
        } else {
          const last = ptsList[ptsList.length - 1];
          const dist = Math.hypot(cx - last.x, cy - last.y);
          if (dist >= 2.5) {
            ptsList.push({ x: cx, y: cy });
            renderActiveLassoToCanvas(ptsList);
          }
        }
      } else if (editorMode === 'smart') {
        const prev = lastDrawPos.current || pos;
        const dist = Math.hypot(pos.x - prev.x, pos.y - prev.y);
        const step = Math.max(3, brushSize / 4);
        if (dist > step) {
          const steps = Math.min(25, Math.ceil(dist / step));
          for (let i = 1; i <= steps; i++) {
            const ix = prev.x + (pos.x - prev.x) * (i / steps);
            const iy = prev.y + (pos.y - prev.y) * (i / steps);
            applySmartBrush(canvasRef.current, ix, iy);
          }
        } else {
          applySmartBrush(canvasRef.current, pos.x, pos.y);
        }
        lastDrawPos.current = { x: pos.x, y: pos.y };
      } else {
        applyBrush(pos.x, pos.y);
      }
    }
  };

  const handlePointerUp = (e) => {
    if (e.pointerId === activePenId.current) {
      activePenId.current = null;
    }
    if (e.pointerType === 'touch' && activePenId.current !== null) {
      return;
    }

    activePointers.current.delete(e.pointerId);
    try { e.target.releasePointerCapture(e.pointerId); } catch (_) {}

    if (activePointers.current.size < 2) {
      initialDistance.current = null;
      initialMidpoint.current = null;
    }

    if (isPanning && activePointers.current.size === 0) {
      setIsPanning(false);
    }

    if (cursorRef.current && activePointers.current.size === 0) {
      cursorRef.current.style.display = 'none';
    }

    if (e.pointerId === drawingPointerId.current) {
      drawingPointerId.current = null;
      const wasDrawing = isDrawingRef.current;
      isDrawingRef.current = false;
      setIsDrawing(false);
      lastDrawPos.current = null;
      smartColorSample.current = null;

      if (editorMode === 'crop' && wasDrawing) {
        const pts = activeLassoPointsRef.current;
        if (pts && pts.length >= 3) {
          const dataUrl = finalizeCropFromPoints(pts);
          if (dataUrl) {
            const newCrop = {
              id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
              dataUrl
            };
            setCropTray((prev) => [...prev, newCrop]);
            setCropPoints([]);
            window.dispatchEvent(new CustomEvent('app-toast', { detail: '✓ Freehand crop added to tray!' }));
          } else {
            setCropPoints([]);
            if (cropUndoStack.current.length > 0) {
              cropUndoStack.current.pop();
            }
            setCanCropUndo(cropUndoStack.current.length > 0);
          }
        } else {
          setCropPoints([]);
          if (cropUndoStack.current.length > 0) {
            cropUndoStack.current.pop();
          }
          setCanCropUndo(cropUndoStack.current.length > 0);
        }
        activeLassoPointsRef.current = [];
        drawCropOverlay();
      }
    }
  };

  const handlePointerCancel = (e) => {
    handlePointerUp(e);
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom(z => Math.min(8, Math.max(0.15, z * factor)));
  };

  const handleDismissSuggestion = useCallback((id) => {
    setDetectedSuggestions((prev) => prev.filter((s) => s.id !== id));
  }, [setDetectedSuggestions]);

  const handleAcceptSuggestion = useCallback((suggestion) => {
    const currentTray = useStore.getState().cropTray;

    // Push the state onto undo stack
    const currentSnap = {
      points: [],
      tray: [...currentTray]
    };
    cropUndoStack.current.push(currentSnap);
    if (cropUndoStack.current.length > 30) {
      cropUndoStack.current.shift();
    }
    cropRedoStack.current = [];
    setCanCropUndo(true);
    setCanCropRedo(false);

    const dataUrl = finalizeCropFromPoints(suggestion.polygon);
    if (dataUrl) {
      const newCrop = {
        id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
        dataUrl
      };
      setCropTray((prev) => [...prev, newCrop]);
      window.dispatchEvent(new CustomEvent('app-toast', { detail: '✓ Illustration cut added to tray!' }));
    } else {
      cropUndoStack.current.pop();
      setCanCropUndo(cropUndoStack.current.length > 0);
    }

    handleDismissSuggestion(suggestion.id);
  }, [finalizeCropFromPoints, setCropTray, handleDismissSuggestion, setCanCropUndo]);

  const handlePointerLeave = () => {
    if (cursorRef.current) {
      cursorRef.current.style.display = 'none';
    }
  };

  return (
    <div
      ref={containerRef}
      className="workspace checkerboard"
      style={{
        overflow: 'hidden',
        position: 'relative',
        width: '100%',
        height: '100%',
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none'
      }}
      onWheel={handleWheel}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (editorMode === 'crop' && (e.target === containerRef.current || e.target.classList?.contains('canvas-container'))) {
          handlePointerDown(e);
        }
      }}
      onPointerMove={(e) => {
        if (editorMode === 'crop' && isDrawingRef.current && e.pointerId === drawingPointerId.current) {
          handlePointerMove(e);
        }
      }}
      onPointerUp={(e) => {
        if (editorMode === 'crop' && e.pointerId === drawingPointerId.current) {
          handlePointerUp(e);
        }
      }}
      onPointerCancel={(e) => {
        if (editorMode === 'crop' && e.pointerId === drawingPointerId.current) {
          handlePointerCancel(e);
        }
      }}
    >
      {/* 
        Loading overlay is kept as a static DOM element that fades out using CSS opacity 
        once the editor is ready. This completely prevents any DOM unmounting / layout shifts 
        which would otherwise reset the canvas backing store buffer and turn it black!
      */}
      <div 
        className="overlay" 
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(10, 14, 26, 0.85)',
          backdropFilter: 'blur(8px)',
          zIndex: 20,
          opacity: isEditorReady ? 0 : 1,
          pointerEvents: isEditorReady ? 'none' : 'auto',
          transition: 'opacity 0.25s ease-out'
        }}
      >
        <div className="spinner" />
        <div className="loader-text">Loading cutout editor…</div>
      </div>
      
      <div
        className="canvas-container"
        style={{
          position: 'absolute',
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: 'center center',
          width: `${canvasSize.width}px`,
          height: `${canvasSize.height}px`,
          cursor: isPanning ? 'grabbing' : (editorMode === 'pan' ? 'grab' : (editorMode === 'color' || editorMode === 'crop') ? 'crosshair' : 'none'),
        }}
      >
        {/* Ghost overlay canvas (bottom) */}
        <canvas
          ref={ghostCanvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          style={{
            display: 'block',
            position: 'absolute',
            top: 0,
            left: 0,
            pointerEvents: 'none',
            opacity: ghostOverlay ? 1 : 0,
            width: `${canvasSize.width}px`,
            height: `${canvasSize.height}px`,
            zIndex: 1
          }}
        />
        {/* Working canvas (middle) */}
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          style={{
            display: 'block',
            position: 'absolute',
            top: 0,
            left: 0,
            touchAction: 'none',
            cursor: (editorMode === 'pan' || editorMode === 'color' || editorMode === 'crop') ? 'inherit' : 'none',
            width: `${canvasSize.width}px`,
            height: `${canvasSize.height}px`,
            zIndex: 2,
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onPointerLeave={handlePointerLeave}
        />
        {/* Crop overlay canvas (top) */}
        {editorMode === 'crop' && (
          <canvas
            ref={cropCanvasRef}
            width={canvasSize.width}
            height={canvasSize.height}
            style={{
              display: 'block',
              position: 'absolute',
              top: 0,
              left: 0,
              pointerEvents: 'none',
              width: `${canvasSize.width}px`,
              height: `${canvasSize.height}px`,
              zIndex: 3,
            }}
          />
        )}
        {/* Brush cursor preview element. Controlled directly in DOM for max performance. */}
        <div
          ref={cursorRef}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: `${brushSize}px`,
            height: `${brushSize}px`,
            borderRadius: '50%',
            border: `2px solid ${
              editorMode === 'erase'
                ? 'rgba(255, 80, 80, 0.8)'
                : editorMode === 'restore'
                ? 'rgba(52, 211, 153, 0.8)'
                : 'rgba(6, 182, 212, 0.8)'
            }`,
            pointerEvents: 'none',
            zIndex: 4,
            display: 'none',
            willChange: 'transform'
          }}
        />
        {editorMode === 'crop' && detectedSuggestions.map((suggestion) => {
          const centerX = suggestion.bbox[0] + suggestion.bbox[2] / 2;
          const centerY = suggestion.bbox[1] + suggestion.bbox[3] / 2;
          const invZoom = 1 / zoom;
          return (
            <div
              key={suggestion.id}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                // translate to the shape's CENTER in canvas-space (parent's scale(zoom) positions it correctly),
                // then counter-scale by 1/zoom so this element's own rendered size stays constant on screen
                // regardless of canvas zoom, then shift by -50%/-50% (of its own, now-normalized size) to
                // actually center the button pair on that point rather than anchoring its corner there.
                transform: `translate(${centerX}px, ${centerY}px) scale(${invZoom}) translate(-50%, -50%)`,
                transformOrigin: 'top left',
                pointerEvents: 'auto',
                zIndex: 10,
                display: 'flex',
                gap: '6px',
                opacity: ghostBadges && hoveredSuggestionId !== suggestion.id ? 0.2 : 0.95,
                transition: 'opacity 0.15s ease',
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onMouseEnter={() => setHoveredSuggestionId(suggestion.id)}
              onMouseLeave={() => setHoveredSuggestionId((prev) => (prev === suggestion.id ? null : prev))}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleAcceptSuggestion(suggestion);
                }}
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '50%',
                  backgroundColor: '#22c55e',
                  color: '#ffffff',
                  border: '2px solid rgba(255,255,255,0.9)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                  transition: 'transform 0.1s ease',
                }}
                title="Accept suggestion"
                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.15)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                ✓
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDismissSuggestion(suggestion.id);
                }}
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '50%',
                  backgroundColor: '#ef4444',
                  color: '#ffffff',
                  border: '2px solid rgba(255,255,255,0.9)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                  transition: 'transform 0.1s ease',
                }}
                title="Dismiss suggestion"
                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.15)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>

      {/* Floating Horizontal Pan Slider Bar at Bottom */}
      {isEditorReady && (
        <div style={{
          position: 'absolute',
          bottom: '16px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: 'rgba(15, 23, 42, 0.85)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '24px',
          padding: '6px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          zIndex: 25,
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
          userSelect: 'none'
        }}>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500 }}>◀ Left</span>
          <input
            type="range"
            min={-limitX}
            max={limitX}
            step="2"
            value={pan.x}
            onChange={(e) => setPan((p) => ({ ...p, x: Number(e.target.value) }))}
            style={{
              width: '180px',
              cursor: 'pointer',
              accentColor: 'var(--accent, #6366f1)'
            }}
          />
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500 }}>Right ▶</span>
          <button
            onClick={() => setPan((p) => ({ ...p, x: 0 }))}
            style={{
              fontSize: '10px',
              padding: '2px 8px',
              borderRadius: '10px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#fff',
              cursor: 'pointer'
            }}
            title="Reset horizontal center"
          >
            Center
          </button>
        </div>
      )}

      <div style={{
        position: 'absolute',
        bottom: '12px',
        left: '16px',
        backgroundColor: 'rgba(10, 14, 26, 0.8)',
        border: '1px solid var(--border)',
        padding: '6px 12px',
        borderRadius: '20px',
        fontSize: '11px',
        color: 'var(--text-secondary)',
        backdropFilter: 'blur(8px)',
        pointerEvents: 'none',
        zIndex: 10
      }}>
        Zoom: {Math.round(zoom * 100)}% · {
          editorMode === 'pan' 
            ? 'Drag to Pan' 
            : editorMode === 'color'
            ? 'Click to Flood Erase Similar Color'
            : 'Drag to Draw · Pinch/Right-Click to Pan'
        }
      </div>

      {/* Horizontal scrollbar (scrolling bar) */}
      {isEditorReady && showHScroll && (
        <div 
          onClick={handleHTrackClick}
          style={{
            position: 'absolute',
            bottom: '4px',
            left: '4px',
            width: `${trackW}px`,
            height: '10px',
            backgroundColor: 'rgba(0, 0, 0, 0.25)',
            borderRadius: '5px',
            zIndex: 15,
            cursor: 'pointer',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            boxSizing: 'border-box',
            backdropFilter: 'blur(4px)'
          }}
        >
          <div 
            onPointerDown={handleHScrollStart}
            onPointerMove={handleHScrollMove}
            onPointerUp={handleHScrollEnd}
            onPointerCancel={handleHScrollEnd}
            style={{
              position: 'absolute',
              left: `${thumbLeft}px`,
              top: '1px',
              width: `${thumbW}px`,
              height: '6px',
              backgroundColor: 'rgba(255, 255, 255, 0.35)',
              borderRadius: '3px',
              cursor: 'ew-resize',
              transition: 'background-color 0.15s ease, transform 0.15s ease',
            }}
            onMouseEnter={(e) => { e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.65)'; e.target.style.transform = 'scaleY(1.2)'; }}
            onMouseLeave={(e) => { e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.35)'; e.target.style.transform = 'scaleY(1)'; }}
          />
        </div>
      )}

      {/* Floating Crop Tray */}
      {editorMode === 'crop' && cropTray.length > 0 && (
        <div
          className="crop-tray"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="crop-tray-title">Pending ({cropTray.length})</div>
          <div className="crop-thumb-list">
            {cropTray.map((crop, idx) => (
              <div key={crop.id} className="crop-thumb checkerboard">
                <img src={crop.dataUrl} alt={`Crop ${idx + 1}`} className="crop-thumb-img" />
                <button 
                  className="crop-thumb-remove" 
                  title="Discard crop"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    
                    const currentSnap = {
                      points: [...useStore.getState().cropPoints],
                      tray: [...useStore.getState().cropTray]
                    };
                    cropUndoStack.current.push(currentSnap);
                    if (cropUndoStack.current.length > 30) {
                      cropUndoStack.current.shift();
                    }
                    cropRedoStack.current = [];
                    setCanCropUndo(true);
                    setCanCropRedo(false);

                    setCropTray(prev => prev.filter(c => c.id !== crop.id));
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Vertical scrollbar (scrolling bar) */}
      {isEditorReady && showVScroll && (
        <div 
          onClick={handleVTrackClick}
          style={{
            position: 'absolute',
            top: '4px',
            right: '4px',
            height: `${trackH}px`,
            width: '10px',
            backgroundColor: 'rgba(0, 0, 0, 0.25)',
            borderRadius: '5px',
            zIndex: 15,
            cursor: 'pointer',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            boxSizing: 'border-box',
            backdropFilter: 'blur(4px)'
          }}
        >
          <div 
            onPointerDown={handleVScrollStart}
            onPointerMove={handleVScrollMove}
            onPointerUp={handleVScrollEnd}
            onPointerCancel={handleVScrollEnd}
            style={{
              position: 'absolute',
              top: `${thumbTop}px`,
              left: '1px',
              height: `${thumbH}px`,
              width: '6px',
              backgroundColor: 'rgba(255, 255, 255, 0.35)',
              borderRadius: '3px',
              cursor: 'ns-resize',
              transition: 'background-color 0.15s ease, transform 0.15s ease',
            }}
            onMouseEnter={(e) => { e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.65)'; e.target.style.transform = 'scaleX(1.2)'; }}
            onMouseLeave={(e) => { e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.35)'; e.target.style.transform = 'scaleX(1)'; }}
          />
        </div>
      )}
    </div>
  );
}
