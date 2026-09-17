import React, { useState, useEffect } from 'react';
import { Search, Sparkles, Loader2, X, Image as ImageIcon, Sliders } from 'lucide-react';

const DEFAULT_API_KEY = 'dLg7rQIbZZoeBJ5fpo3NIBQ26dZ432NcNuLNkf8aHE';

export function ImmichSearchModal({ onSelectImage, onClose }) {
  const [apiKey, setApiKey] = useState(
    () => (typeof window !== 'undefined' && localStorage.getItem('immich_api_key')) || DEFAULT_API_KEY
  );
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showKeyConfig, setShowKeyConfig] = useState(false);
  const [error, setError] = useState(null);

  const performSearch = async (searchQuery) => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    setError(null);

    try {
      // Smart AI semantic search
      const res = await fetch('/immich-api/search/smart', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey
        },
        body: JSON.stringify({ query: searchQuery.trim() })
      });

      if (!res.ok) {
        throw new Error(`Immich server returned status ${res.status}`);
      }

      const data = await res.json();
      const assets = (data && data.assets && data.assets.items) || (Array.isArray(data) ? data : []);
      setResults(assets);
    } catch (err) {
      console.warn('Smart search failed, trying metadata search:', err);
      // Fallback to metadata search
      try {
        const metaRes = await fetch(`/immich-api/search/metadata?originalFileName=${encodeURIComponent(searchQuery.trim())}`, {
          headers: { 'x-api-key': apiKey }
        });
        if (metaRes.ok) {
          const metaData = await metaRes.json();
          const items = (metaData && metaData.assets && metaData.assets.items) || (Array.isArray(metaData) ? metaData : []);
          setResults(items);
        } else {
          setError('Could not connect to Immich. Make sure Tailscale or Mac Mini is running.');
        }
      } catch (err2) {
        setError('Could not connect to Immich. Make sure Tailscale or Mac Mini is running.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAsset = async (asset) => {
    setLoading(true);
    try {
      const res = await fetch(`/immich-api/assets/${asset.id}/original`, {
        headers: { 'x-api-key': apiKey }
      });
      const blob = await res.blob();
      const filename = asset.originalFileName || `immich_${asset.id}.png`;
      const file = new File([blob], filename, { type: blob.type || 'image/png' });
      onSelectImage(file);
      onClose();
    } catch (err) {
      console.error('Failed to load asset from Immich:', err);
      setError('Failed to download high-resolution image from Immich.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveKey = (newKey) => {
    setApiKey(newKey);
    localStorage.setItem('immich_api_key', newKey);
    setShowKeyConfig(false);
  };

  return (
    <div className="modal-backdrop" style={{ zIndex: 1100 }}>
      <div className="modal-card" style={{ maxWidth: '850px', width: '95%', height: '85vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={20} style={{ color: 'var(--accent)' }} />
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Search Immich Library
              </h2>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                Search your illustrations by natural language, keywords, or scene description
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setShowKeyConfig(!showKeyConfig)}
              style={{ padding: '4px 8px', fontSize: '11px' }}
              title="Immich Connection Settings"
            >
              <Sliders size={12} />
              <span>Config</span>
            </button>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* API Key Config Panel (Collapsible) */}
        {showKeyConfig && (
          <div style={{ padding: '12px', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: '8px', marginTop: '10px', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="password"
              placeholder="Immich API Key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              style={{ flex: 1, padding: '6px 10px', fontSize: '12px', borderRadius: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', color: '#fff' }}
            />
            <button className="btn btn-primary" onClick={() => handleSaveKey(apiKey)} style={{ padding: '6px 14px', fontSize: '12px' }}>
              Save
            </button>
          </div>
        )}

        {/* Search Input Bar */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '12px' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search e.g. 'cozy desk workspace', 'cute slime stickers', 'pastel floral'..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && performSearch(query)}
              style={{
                width: '100%',
                padding: '10px 14px 10px 36px',
                borderRadius: '8px',
                backgroundColor: 'rgba(255,255,255,0.06)',
                border: '1px solid var(--border)',
                color: '#fff',
                fontSize: '13px',
                outline: 'none'
              }}
            />
          </div>
          <button
            className="btn btn-primary"
            onClick={() => performSearch(query)}
            disabled={loading}
            style={{ padding: '10px 18px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            {loading ? <Loader2 size={14} className="spinner" /> : <Search size={14} />}
            <span>Search</span>
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div style={{ padding: '10px', backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', color: '#f87171', fontSize: '12px', marginTop: '10px' }}>
            {error}
          </div>
        )}

        {/* Results Grid */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          marginTop: '12px',
          paddingRight: '4px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: '12px',
          alignContent: 'start'
        }}>
          {results.map((asset) => (
            <div
              key={asset.id}
              onClick={() => handleSelectAsset(asset)}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '10px',
                overflow: 'hidden',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                transition: 'transform 0.15s ease, border-color 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.03)';
                e.currentTarget.style.borderColor = 'var(--accent)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
              }}
            >
              <div style={{
                width: '100%',
                aspectRatio: '1/1',
                backgroundColor: '#070a12',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden'
              }}>
                <img
                  src={`/immich-api/assets/${asset.id}/thumbnail?size=thumbnail`}
                  alt={asset.originalFileName || 'Illustration'}
                  loading="lazy"
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              </div>
              <div style={{ padding: '6px 8px', fontSize: '11px', lineHeight: 1.3 }}>
                <div style={{ color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {asset.originalFileName || 'Artwork'}
                </div>
              </div>
            </div>
          ))}

          {results.length === 0 && !loading && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '50px 20px', color: 'var(--text-muted)' }}>
              <ImageIcon size={36} style={{ marginBottom: '8px', opacity: 0.5 }} />
              <div>Type a query above to search your Immich illustration database.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
