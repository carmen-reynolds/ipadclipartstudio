import React, { useState } from 'react';
import { Sliders, Sparkles, Scissors, Crop, ArrowRight, X } from 'lucide-react';

export function WorkflowModal({
  entry,
  onStartWorkflow,
  onBypassTools,
  onClose
}) {
  if (!entry) return null;

  const [features, setFeatures] = useState({
    bgRemover: !entry.isTransparent,
    cropper: entry.isTransparent || (entry.elementCount && entry.elementCount > 1)
  });

  const [quality, setQuality] = useState('best'); // 'fast' | 'best'

  const toggleFeature = (key) => {
    setFeatures(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sliders size={18} style={{ color: 'var(--accent)' }} />
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Select Tools to Run
            </h2>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '4px'
              }}
            >
              <X size={18} />
            </button>
          )}
        </div>
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
          Review detected properties and configure tools before opening the canvas.
        </p>

        {/* Detected Info Strip */}
        <div style={{
          backgroundColor: 'rgba(255, 255, 255, 0.04)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '10px',
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {entry.name || 'Current Image'}
            </span>
            <span>{entry.naturalWidth} × {entry.naturalHeight} px</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            <span style={{
              fontSize: '10px',
              padding: '2px 8px',
              borderRadius: '6px',
              backgroundColor: entry.isTransparent ? 'rgba(16, 185, 129, 0.15)' : 'rgba(99, 102, 241, 0.15)',
              color: entry.isTransparent ? '#34d399' : '#a5b4fc',
              border: `1px solid ${entry.isTransparent ? 'rgba(16, 185, 129, 0.3)' : 'rgba(99, 102, 241, 0.3)'}`,
              fontWeight: 500
            }}>
              {entry.isTransparent ? '✨ Transparent Background' : '🎨 Solid Background'}
            </span>
            <span style={{
              fontSize: '10px',
              padding: '2px 8px',
              borderRadius: '6px',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              color: 'var(--text-secondary)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              fontWeight: 500
            }}>
              {entry.elementCount > 1 ? `🖼️ ${entry.elementCount} Illustrations Detected` : '🖼️ 1 Illustration Detected'}
            </span>
          </div>
        </div>

        {/* Feature 1: Background Remover */}
        <div style={{
          backgroundColor: features.bgRemover ? 'rgba(99, 102, 241, 0.08)' : 'rgba(255, 255, 255, 0.02)',
          border: `1px solid ${features.bgRemover ? 'var(--accent)' : 'rgba(255, 255, 255, 0.08)'}`,
          borderRadius: '10px',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          transition: 'all 0.15s ease'
        }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={features.bgRemover}
              onChange={() => toggleFeature('bgRemover')}
              style={{ marginTop: '2px', accentColor: 'var(--accent)', cursor: 'pointer', width: '16px', height: '16px' }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: features.bgRemover ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                  Background Remover (On-Device AI)
                </span>
                {!entry.isTransparent && (
                  <span style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '4px', backgroundColor: 'rgba(99, 102, 241, 0.25)', color: 'var(--accent)', fontWeight: 600 }}>
                    Auto-Checked (Solid BG)
                  </span>
                )}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Cuts out background directly on your iPad processor.
              </div>
            </div>
          </label>

          {features.bgRemover && (
            <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
              <button
                type="button"
                className={`btn btn-secondary ${quality === 'fast' ? 'active' : ''}`}
                style={{ flex: 1, padding: '6px', fontSize: '11px' }}
                onClick={() => setQuality('fast')}
              >
                Fast (~2s)
              </button>
              <button
                type="button"
                className={`btn btn-secondary ${quality === 'best' ? 'active' : ''}`}
                style={{ flex: 1, padding: '6px', fontSize: '11px' }}
                onClick={() => setQuality('best')}
              >
                Best (High Precision)
              </button>
            </div>
          )}
        </div>

        {/* Feature 2: Freehand Cropper & Multi-Illustration Auto-Detect */}
        <div style={{
          backgroundColor: features.cropper ? 'rgba(99, 102, 241, 0.08)' : 'rgba(255, 255, 255, 0.02)',
          border: `1px solid ${features.cropper ? 'var(--accent)' : 'rgba(255, 255, 255, 0.08)'}`,
          borderRadius: '10px',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          transition: 'all 0.15s ease'
        }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={features.cropper}
              onChange={() => toggleFeature('cropper')}
              style={{ marginTop: '2px', accentColor: 'var(--accent)', cursor: 'pointer', width: '16px', height: '16px' }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: features.cropper ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                  Freehand Cropper &amp; Auto-Detect (✓ and ✕ Badges)
                </span>
                {entry.elementCount > 1 && (
                  <span style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '4px', backgroundColor: 'rgba(16, 185, 129, 0.25)', color: '#34d399', fontWeight: 600 }}>
                    Auto-Checked (Multiple Art)
                  </span>
                )}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Shows dashed contours with ✓ &amp; ✕ buttons to cut out individual illustrations, plus Apple Pencil lasso.
              </div>
            </div>
          </label>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ flex: 1, padding: '10px', fontSize: '12px' }}
            onClick={onBypassTools}
          >
            Open As-Is
          </button>
          <button
            type="button"
            className="btn btn-primary"
            style={{ flex: 2, padding: '10px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            onClick={() => onStartWorkflow({ features, quality })}
          >
            <span>Start Processing</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
