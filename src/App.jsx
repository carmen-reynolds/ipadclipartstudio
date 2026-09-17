import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from './store';
import BackgroundEditor from './components/BackgroundEditor';
import { ToolsPanel } from './components/ToolsPanel';
import { WorkflowModal } from './components/WorkflowModal';
import { EagleLibraryModal } from './components/EagleLibraryModal';
import { ImmichSearchModal } from './components/ImmichSearchModal';
import { processBackgroundRemovalInBrowser } from './services/backgroundRemoval';
import { detectElementsFromCanvas } from './services/elementDetector';
import { saveFileToICloudOrDownload, sendDirectToEagle } from './services/eagleSync';
import { 
  Scissors, 
  Upload, 
  Settings, 
  Download, 
  Check, 
  Sparkles, 
  Image as ImageIcon,
  Wifi,
  Sliders,
  X,
  Folder
} from 'lucide-react';

export default function App() {
  const currentItem = useStore((s) => s.currentItem);
  const setCurrentItem = useStore((s) => s.setCurrentItem);
  const originalImage = useStore((s) => s.originalImage);
  const setOriginalImage = useStore((s) => s.setOriginalImage);
  const processedImage = useStore((s) => s.processedImage);
  const setProcessedImage = useStore((s) => s.setProcessedImage);
  const editorMode = useStore((s) => s.editorMode);
  const setEditorMode = useStore((s) => s.setEditorMode);
  const modelMode = useStore((s) => s.modelMode);
  const setModelMode = useStore((s) => s.setModelMode);
  const cropTray = useStore((s) => s.cropTray);
  const setCropTray = useStore((s) => s.setCropTray);
  const clearEditorHistory = useStore((s) => s.clearEditorHistory);
  const clearCropHistory = useStore((s) => s.clearCropHistory);
  const eagleHost = useStore((s) => s.eagleHost);
  const setEagleHost = useStore((s) => s.setEagleHost);

  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [showWorkflowModal, setShowWorkflowModal] = useState(false);
  const [showEagleModal, setShowEagleModal] = useState(false);
  const [showImmichModal, setShowImmichModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [imageMeta, setImageMeta] = useState(null);

  const fileInputRef = useRef(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // ─── Handle File Upload (iPad Photos / Files / Camera) ───
  const handleFileSelect = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    loadImageFromFile(file);
  };

  const loadImageFromFile = (file) => {
    setIsLoading(true);
    setLoadingText('Loading illustration…');

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target.result;
      const img = new Image();
      img.onload = () => {
        // Measure canvas & transparency
        const scratchCanvas = document.createElement('canvas');
        scratchCanvas.width = img.width;
        scratchCanvas.height = img.height;
        const sCtx = scratchCanvas.getContext('2d');
        sCtx.drawImage(img, 0, 0);

        const detections = detectElementsFromCanvas(scratchCanvas);
        const imgData = sCtx.getImageData(0, 0, Math.min(img.width, 200), Math.min(img.height, 200)).data;
        let transPixels = 0;
        for (let i = 3; i < imgData.length; i += 4) {
          if (imgData[i] < 240) transPixels++;
        }
        const isTransparent = transPixels > 50;

        const meta = {
          name: file.name || 'Illustration.png',
          naturalWidth: img.width,
          naturalHeight: img.height,
          isTransparent: isTransparent,
          elementCount: detections.length
        };

        setImageMeta(meta);
        setCurrentItem(meta);
        setOriginalImage(dataUrl);
        setProcessedImage(dataUrl);
        clearEditorHistory();
        clearCropHistory();
        setIsLoading(false);
        setShowWorkflowModal(true);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  // ─── Execute Selected Workflow ───
  const handleStartWorkflow = async ({ features, quality }) => {
    setShowWorkflowModal(false);
    setModelMode(quality);

    if (features.bgRemover) {
      setIsLoading(true);
      setLoadingText(quality === 'fast' ? 'Removing background (Fast mode)…' : 'Removing background on iPad (High Precision)…');

      try {
        const resultBlob = await processBackgroundRemovalInBrowser(originalImage, {
          quality,
          onProgress: (key, current, total) => {
            if (total > 0) {
              const pct = Math.round((current / total) * 100);
              setLoadingText(`Removing background… ${pct}%`);
            }
          }
        });

        const reader = new FileReader();
        reader.onloadend = () => {
          setProcessedImage(reader.result);
          setIsLoading(false);

          if (features.cropper) {
            setEditorMode('crop');
          } else {
            setEditorMode('erase');
          }
          showToast('Background removed successfully!');
        };
        reader.readAsDataURL(resultBlob);
      } catch (err) {
        console.error('AI background removal error:', err);
        setIsLoading(false);
        showToast('Background removal failed. You can use the manual & smart erasers.');
        if (features.cropper) setEditorMode('crop');
      }
    } else {
      if (features.cropper) {
        setEditorMode('crop');
      } else {
        setEditorMode('erase');
      }
    }
  };

  const handleBypassTools = () => {
    setShowWorkflowModal(false);
    setEditorMode('erase');
  };

  // ─── Save Handlers ───
  const handleSaveBackgroundRemoval = async () => {
    const canvas = document.querySelector('canvas.main-editor-canvas') || document.querySelector('canvas');
    if (!canvas) {
      showToast('No active artwork found to save.');
      return;
    }

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const baseName = (imageMeta?.name || 'cutout').replace(/\.[^/.]+$/, '');
      const filename = `${baseName}_bg-removed.png`;

      // Save to iCloud Drive (or download)
      const res = await saveFileToICloudOrDownload(blob, filename);

      // Also send over Wi-Fi to Eagle if configured
      if (eagleHost) {
        await sendDirectToEagle(blob, filename, ['bg-removed', 'ipad'], eagleHost);
      }

      if (res && res.success) {
        showToast(`Saved ${filename} to Eagle iCloud Folder!`);
      }
    }, 'image/png');
  };

  const handleSaveAllCrops = async () => {
    if (cropTray.length === 0) return;

    const baseName = (imageMeta?.name || 'artwork').replace(/\.[^/.]+$/, '');
    let savedCount = 0;

    for (let i = 0; i < cropTray.length; i++) {
      const crop = cropTray[i];
      const filename = `${baseName}_crop-${i + 1}.png`;

      // Convert dataUrl to blob
      const res = await fetch(crop.dataUrl);
      const blob = await res.blob();

      await saveFileToICloudOrDownload(blob, filename);

      if (eagleHost) {
        await sendDirectToEagle(blob, filename, ['cropped', 'ipad'], eagleHost);
      }
      savedCount++;
    }

    showToast(`Saved ${savedCount} crop(s) to Eagle!`);
  };

  return (
    <div className="app-container">
      {/* ─── Top Bar ─── */}
      <div className="titlebar">
        <div className="app-title">
          <Scissors className="logo-icon" />
          <span>Background Remover &amp; Multi-Crop Studio</span>
        </div>

        <div className="window-actions">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept="image/*"
            style={{ display: 'none' }}
          />

          <button
            className="btn btn-secondary"
            onClick={() => setShowEagleModal(true)}
            style={{ fontSize: '11px', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '5px', backgroundColor: 'rgba(99, 102, 241, 0.15)', borderColor: 'rgba(99, 102, 241, 0.35)', color: '#c7d2fe' }}
            title="Browse your 100 most recent Eagle library illustrations"
          >
            <Folder size={13} />
            <span>Eagle Library</span>
          </button>

          <button
            className="btn btn-secondary"
            onClick={() => setShowImmichModal(true)}
            style={{ fontSize: '11px', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '5px', backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: 'rgba(16, 185, 129, 0.35)', color: '#a7f3d0' }}
            title="Search illustrations across your Immich photo server"
          >
            <Sparkles size={13} />
            <span>Search Immich</span>
          </button>

          <button
            className="btn btn-secondary"
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
            style={{ fontSize: '11px', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            <Upload size={13} />
            <span>Files</span>
          </button>

          <button
            className="window-btn"
            onClick={() => setShowSettingsModal(true)}
            title="Eagle Wi-Fi Settings"
          >
            <Settings size={14} />
          </button>
        </div>
      </div>

      {/* ─── Main Workspace ─── */}
      <div className="main-layout">
        {!originalImage ? (
          /* Empty State / Upload Dropzone */
          <div
            className="workspace"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                loadImageFromFile(e.dataTransfer.files[0]);
              }
            }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
          >
            <div
              style={{
                maxWidth: '480px',
                width: '100%',
                backgroundColor: 'rgba(15, 21, 39, 0.9)',
                border: '2px dashed rgba(255, 255, 255, 0.15)',
                borderRadius: '20px',
                padding: '40px 24px',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '16px',
                boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)'
              }}
            >
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(83, 152, 255, 0.12)',
                  color: 'var(--accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <ImageIcon size={32} />
              </div>

              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  Open an Illustration
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                  Select an illustration from your iPad Photo Library, Files, or drag &amp; drop an image here.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', maxWidth: '340px' }}>
                <button
                  className="btn btn-primary"
                  onClick={() => fileInputRef.current && fileInputRef.current.click()}
                  style={{ padding: '12px 20px', fontSize: '13px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  <Upload size={16} />
                  <span>Choose from iPad (Photos / Files)</span>
                </button>

                <button
                  className="btn btn-secondary"
                  onClick={() => setShowEagleModal(true)}
                  style={{ padding: '10px 18px', fontSize: '13px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', backgroundColor: 'rgba(99, 102, 241, 0.15)', borderColor: 'rgba(99, 102, 241, 0.35)', color: '#c7d2fe' }}
                >
                  <Folder size={16} />
                  <span>Eagle Library (Latest 100)</span>
                </button>

                <button
                  className="btn btn-secondary"
                  onClick={() => setShowImmichModal(true)}
                  style={{ padding: '10px 18px', fontSize: '13px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: 'rgba(16, 185, 129, 0.35)', color: '#a7f3d0' }}
                >
                  <Sparkles size={16} />
                  <span>Search Immich Database</span>
                </button>
              </div>

              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Supports PNG, JPEG, WEBP · Works with Apple Pencil
              </div>
            </div>
          </div>
        ) : (
          /* Active Editor Canvas + Floating Tools Panel */
          <div className="workspace">
            <BackgroundEditor />
            <ToolsPanel
              onOpenWorkflow={() => setShowWorkflowModal(true)}
              onReProcessQuality={(q) => handleStartWorkflow({ features: { bgRemover: true, cropper: false }, quality: q })}
            />
          </div>
        )}
      </div>

      {/* ─── Bottom Bar ─── */}
      {originalImage && (
        <div className="bottom-bar" style={{
          height: '48px',
          backgroundColor: 'var(--bg-secondary)',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          zIndex: 40
        }}>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
              {imageMeta?.name || 'Image'}
            </span>
            <span>({imageMeta?.naturalWidth || 0} × {imageMeta?.naturalHeight || 0})</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setOriginalImage(null);
                setProcessedImage(null);
                setCurrentItem(null);
                clearEditorHistory();
                clearCropHistory();
              }}
              style={{ fontSize: '11px', padding: '6px 14px' }}
            >
              Cancel
            </button>

            {editorMode === 'crop' && cropTray.length > 0 ? (
              <button
                className="btn btn-success"
                onClick={handleSaveAllCrops}
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  padding: '7px 18px',
                  backgroundColor: '#10b981',
                  color: '#ffffff',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Check size={14} />
                <span>Save All Crops ({cropTray.length})</span>
              </button>
            ) : (
              <button
                className="btn btn-success"
                onClick={handleSaveBackgroundRemoval}
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  padding: '7px 18px',
                  backgroundColor: '#10b981',
                  color: '#ffffff',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Check size={14} />
                <span>Save Background Removal</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ─── Loading Overlay ─── */}
      {isLoading && (
        <div className="overlay" style={{ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', backgroundColor: 'rgba(8, 12, 22, 0.82)', zIndex: 120 }}>
          <div style={{
            backgroundColor: 'rgba(16, 22, 36, 0.95)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '16px',
            padding: '24px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
            maxWidth: '320px'
          }}>
            <div className="spinner" />
            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
              {loadingText}
            </div>
          </div>
        </div>
      )}

      {/* ─── Workflow Setup Modal ─── */}
      {showWorkflowModal && imageMeta && (
        <WorkflowModal
          entry={imageMeta}
          onStartWorkflow={handleStartWorkflow}
          onBypassTools={handleBypassTools}
          onClose={() => setShowWorkflowModal(false)}
        />
      )}

      {/* ─── Settings Modal (Eagle Wi-Fi & Watched Folder) ─── */}
      {showSettingsModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Eagle Library Integration</h3>
              <button
                onClick={() => setShowSettingsModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              <p><strong>1. iCloud Watched Folder (Default):</strong> When you tap Save, files save to your iPad / iCloud Drive. If Eagle on your Mac watches this iCloud folder, images auto-import immediately.</p>
              <p style={{ marginTop: '8px' }}><strong>2. Direct Wi-Fi Sync (Optional):</strong> If your Mac is on the same Wi-Fi, enter its local address to send images directly into Eagle via port 41595.</p>
            </div>

            <div>
              <label style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                Mac Eagle Host (e.g. http://192.168.1.50:41595)
              </label>
              <input
                type="text"
                value={eagleHost}
                onChange={(e) => setEagleHost(e.target.value)}
                placeholder="http://192.168.1.X:41595"
                style={{
                  width: '100%',
                  marginTop: '4px',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: '#fff',
                  fontSize: '12px'
                }}
              />
            </div>

            <button
              className="btn btn-primary"
              onClick={() => {
                setShowSettingsModal(false);
                showToast('Eagle settings saved!');
              }}
              style={{ marginTop: '8px', padding: '8px' }}
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* ─── Eagle Library Modal ─── */}
      {showEagleModal && (
        <EagleLibraryModal
          onSelectImage={loadImageFromFile}
          onClose={() => setShowEagleModal(false)}
        />
      )}

      {/* ─── Immich Search Modal ─── */}
      {showImmichModal && (
        <ImmichSearchModal
          onSelectImage={loadImageFromFile}
          onClose={() => setShowImmichModal(false)}
        />
      )}

      {/* ─── Toast Notification ─── */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: '64px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: 'rgba(16, 22, 36, 0.95)',
          border: '1px solid var(--accent)',
          borderRadius: '24px',
          padding: '10px 20px',
          color: '#fff',
          fontSize: '13px',
          fontWeight: 500,
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          zIndex: 200,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <Sparkles size={16} style={{ color: 'var(--accent)' }} />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
