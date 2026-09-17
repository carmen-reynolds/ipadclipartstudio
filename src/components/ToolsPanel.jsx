import React, { useRef, useState } from 'react';
import { useStore } from '../store';
import { ChevronRight, Sliders, Undo2, Redo2, Sparkles, Wand2 } from 'lucide-react';

export function ToolsPanel({ onOpenWorkflow, onReProcessQuality }) {
  const modelMode = useStore((s) => s.modelMode);
  const setModelMode = useStore((s) => s.setModelMode);
  const zoom = useStore((s) => s.zoom);
  const setZoom = useStore((s) => s.setZoom);
  const ghostOverlay = useStore((s) => s.ghostOverlay);
  const setGhostOverlay = useStore((s) => s.setGhostOverlay);
  const ghostBadges = useStore((s) => s.ghostBadges);
  const setGhostBadges = useStore((s) => s.setGhostBadges);
  const brushSize = useStore((s) => s.brushSize);
  const setBrushSize = useStore((s) => s.setBrushSize);
  const tolerance = useStore((s) => s.tolerance);
  const setTolerance = useStore((s) => s.setTolerance);
  const editorMode = useStore((s) => s.editorMode);
  const setEditorMode = useStore((s) => s.setEditorMode);
  const canUndo = useStore((s) => s.canUndo);
  const canRedo = useStore((s) => s.canRedo);
  const canCropUndo = useStore((s) => s.canCropUndo);
  const canCropRedo = useStore((s) => s.canCropRedo);
  const editorUndo = useStore((s) => s.editorUndo);
  const editorRedo = useStore((s) => s.editorRedo);
  const cropUndo = useStore((s) => s.cropUndo);
  const cropRedo = useStore((s) => s.cropRedo);
  const stripOutlines = useStore((s) => s.stripOutlines);

  const isSidebarMinimized = useStore((s) => s.isSidebarMinimized);
  const setIsSidebarMinimized = useStore((s) => s.setIsSidebarMinimized);
  const sidebarPos = useStore((s) => s.sidebarPos);
  const setSidebarPos = useStore((s) => s.setSidebarPos);

  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ startX: 0, startY: 0, initialLeft: 0, initialTop: 0 });

  const handlePointerDown = (e) => {
    if (e.target.closest('button') || e.target.closest('input')) return;
    setIsDragging(true);
    const panel = e.currentTarget.parentElement;
    const rect = panel.getBoundingClientRect();
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialLeft: rect.left,
      initialTop: rect.top
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.startX;
    const dy = e.clientY - dragStartRef.current.startY;
    const newLeft = Math.max(10, Math.min(window.innerWidth - 300, dragStartRef.current.initialLeft + dx));
    const newTop = Math.max(40, Math.min(window.innerHeight - 300, dragStartRef.current.initialTop + dy));
    setSidebarPos({ x: newLeft, y: newTop });
  };

  const handlePointerUp = (e) => {
    if (isDragging) {
      setIsDragging(false);
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
    }
  };

  if (isSidebarMinimized) {
    return (
      <button
        onClick={() => setIsSidebarMinimized(false)}
        style={{
          position: 'absolute',
          right: '16px',
          top: '56px',
          zIndex: 50,
          backgroundColor: 'rgba(15, 21, 39, 0.9)',
          backdropFilter: 'blur(12px)',
          border: '1px solid var(--border)',
          borderRadius: '20px',
          padding: '8px 16px',
          color: 'var(--text-primary)',
          fontSize: '12px',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
        }}
      >
        <span>Tools</span>
        <ChevronRight size={14} style={{ transform: 'rotate(180deg)' }} />
      </button>
    );
  }

  const panelStyle = sidebarPos
    ? { left: `${sidebarPos.x}px`, top: `${sidebarPos.y}px`, right: 'auto' }
    : { right: '16px', top: '56px' };

  return (
    <div
      className="floating-sidebar"
      style={{
        position: 'absolute',
        ...panelStyle,
        width: '260px',
        maxHeight: 'calc(100vh - 110px)',
        zIndex: 50,
        backgroundColor: 'rgba(15, 21, 39, 0.94)',
        backdropFilter: 'blur(16px)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        boxShadow: '0 12px 36px rgba(0, 0, 0, 0.6)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      {/* Header */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
          backgroundColor: 'rgba(255, 255, 255, 0.02)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, color: 'var(--text-muted)' }}>
            Tools Panel
          </span>
          {onOpenWorkflow && (
            <button
              onClick={onOpenWorkflow}
              style={{
                background: 'rgba(99, 102, 241, 0.2)',
                border: '1px solid rgba(99, 102, 241, 0.4)',
                borderRadius: '12px',
                padding: '2px 8px',
                fontSize: '10px',
                color: '#a5b4fc',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                cursor: 'pointer'
              }}
              title="Open Workflow Checklist"
            >
              <Sliders size={10} />
              <span>Workflow</span>
            </button>
          )}
        </div>
        <button
          onClick={() => setIsSidebarMinimized(true)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: '2px'
          }}
          title="Minimize tools panel"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Scrollable Content */}
      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto' }}>
        {/* Cutout Quality */}
        <div className="sidebar-section">
          <h3>Cutout Quality</h3>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              className={`btn btn-secondary ${modelMode === 'fast' ? 'active' : ''}`}
              style={{ flex: 1, padding: '7px 4px', fontSize: '11px' }}
              onClick={() => {
                setModelMode('fast');
                if (onReProcessQuality) onReProcessQuality('fast');
              }}
            >
              Fast (~2s)
            </button>
            <button
              className={`btn btn-secondary ${modelMode === 'best' ? 'active' : ''}`}
              style={{ flex: 1, padding: '7px 4px', fontSize: '11px' }}
              onClick={() => {
                setModelMode('best');
                if (onReProcessQuality) onReProcessQuality('best');
              }}
            >
              Best
            </button>
          </div>
        </div>

        {/* Zoom & View */}
        <div className="sidebar-section">
          <h3>Zoom &amp; View</h3>
          <div className="slider-control">
            <div className="slider-header">
              <span>Zoom Scale</span>
              <span>{Math.round(zoom * 100)}%</span>
            </div>
            <input
              type="range"
              className="slider-input"
              min="0.10"
              max="4.00"
              step="0.05"
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
            />
          </div>
          <button
            className="btn btn-secondary"
            style={{ marginTop: '8px', width: '100%', fontSize: '11px', padding: '6px' }}
            onClick={() => window.dispatchEvent(new CustomEvent('editor-fit-content'))}
          >
            Back to Content
          </button>
        </div>

        {/* Visual Guide */}
        <div className="sidebar-section">
          <h3>Visual Guide</h3>
          <div className="toggle-wrap" onClick={() => setGhostOverlay(!ghostOverlay)}>
            <span className="toggle-label">Ghost Original</span>
            <div className={`toggle-switch ${ghostOverlay ? 'active' : ''}`} />
          </div>

          {editorMode === 'crop' && (
            <div className="toggle-wrap" style={{ marginTop: '8px' }} onClick={() => setGhostBadges(!ghostBadges)}>
              <span className="toggle-label">[✓] Ghost Badges (20% Opacity)</span>
              <div className={`toggle-switch ${ghostBadges ? 'active' : ''}`} />
            </div>
          )}
        </div>

        {/* Refine Tools */}
        <div className="sidebar-section">
          <h3>Refine Tools</h3>
          <div className="slider-control" style={{ opacity: (editorMode === 'pan' || editorMode === 'color' || editorMode === 'crop') ? 0.5 : 1 }}>
            <div className="slider-header">
              <span>Brush Size</span>
              <span>{brushSize}px</span>
            </div>
            <input
              type="range"
              className="slider-input"
              min="2"
              max="100"
              value={brushSize}
              disabled={editorMode === 'pan' || editorMode === 'color' || editorMode === 'crop'}
              onChange={(e) => setBrushSize(Number(e.target.value))}
            />
          </div>

          {(editorMode === 'smart' || editorMode === 'color') && (
            <div className="slider-control" style={{ marginTop: '8px' }}>
              <div className="slider-header">
                <span>{editorMode === 'smart' ? 'Outline Sensitivity' : 'Tolerance'}</span>
                <span>{tolerance}</span>
              </div>
              <input
                type="range"
                className="slider-input"
                min="5"
                max="120"
                value={tolerance}
                onChange={(e) => setTolerance(Number(e.target.value))}
              />
              {editorMode === 'smart' && (
                <>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary, #94a3b8)', marginTop: '4px', lineHeight: '1.3' }}>
                    Targets thin whitish &amp; grey outlines / stray lines while protecting illustration artwork.
                  </div>
                  <button
                    className="btn btn-secondary"
                    style={{
                      width: '100%',
                      marginTop: '8px',
                      padding: '7px 10px',
                      fontSize: '11px',
                      fontWeight: '600',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(168, 85, 247, 0.2))',
                      border: '1px solid rgba(168, 85, 247, 0.35)',
                      color: '#e2e8f0',
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}
                    onClick={() => stripOutlines()}
                    title="Click to automatically detect and remove all thin whitish & grey outlines across the entire image"
                  >
                    <Wand2 size={12} />
                    🪄 Strip All Outlines
                  </button>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary, #94a3b8)', marginTop: '4px', textAlign: 'center', opacity: 0.85 }}>
                    Tip: Tap directly on any outline to erase it!
                  </div>
                </>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
            <button
              className={`btn btn-secondary ${editorMode === 'erase' ? 'active' : ''}`}
              style={{ flex: 1, padding: '8px 4px', fontSize: '11px' }}
              onClick={() => setEditorMode('erase')}
            >
              Erase
            </button>
            <button
              className={`btn btn-secondary ${editorMode === 'restore' ? 'active' : ''}`}
              style={{ flex: 1, padding: '8px 4px', fontSize: '11px' }}
              onClick={() => setEditorMode('restore')}
            >
              Restore
            </button>
            <button
              className={`btn btn-secondary ${editorMode === 'pan' ? 'active' : ''}`}
              style={{ flex: 1, padding: '8px 4px', fontSize: '11px' }}
              onClick={() => setEditorMode('pan')}
            >
              Pan
            </button>
          </div>

          <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
            <button
              className={`btn btn-secondary ${editorMode === 'smart' ? 'active' : ''}`}
              style={{ flex: 1, padding: '8px 4px', fontSize: '11px' }}
              onClick={() => setEditorMode('smart')}
              title="Smart Eraser: Erases thin outlines while protecting illustrations"
            >
              ★ Smart
            </button>
            <button
              className={`btn btn-secondary ${editorMode === 'color' ? 'active' : ''}`}
              style={{ flex: 1, padding: '8px 4px', fontSize: '11px' }}
              onClick={() => setEditorMode('color')}
              title="Color Erase (Magic Wand)"
            >
              Color Erase
            </button>
            <button
              className={`btn btn-secondary ${editorMode === 'crop' ? 'active' : ''}`}
              style={{ flex: 1, padding: '8px 4px', fontSize: '11px' }}
              onClick={() => setEditorMode('crop')}
              title="Crop Mode: Auto-detect suggestions with ✓ / ✕ badges & Freehand Lasso"
            >
              Crop
            </button>
          </div>
        </div>

        {/* History */}
        <div className="sidebar-section">
          <h3>History</h3>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              className="btn btn-secondary"
              style={{ flex: 1, padding: '6px', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
              disabled={editorMode === 'crop' ? !canCropUndo : !canUndo}
              onClick={editorMode === 'crop' ? cropUndo : editorUndo}
            >
              <Undo2 size={12} />
              <span>Undo</span>
            </button>
            <button
              className="btn btn-secondary"
              style={{ flex: 1, padding: '6px', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
              disabled={editorMode === 'crop' ? !canCropRedo : !canRedo}
              onClick={editorMode === 'crop' ? cropRedo : editorRedo}
            >
              <Redo2 size={12} />
              <span>Redo</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
