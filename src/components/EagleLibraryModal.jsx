import React, { useState, useEffect } from 'react';
import { Folder, Search, Loader2, X, RefreshCw, ChevronDown, Check, WifiOff, Globe, HardDrive } from 'lucide-react';

export function EagleLibraryModal({ onSelectImage, onClose }) {
  const [items, setItems] = useState([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);

  const DEFAULT_TUNNEL_HOST = 'https://develop-fans-guam-pixel.trycloudflare.com';
  const DEFAULT_LOCAL_HOST = 'http://10.0.0.117:5174';

  const getApiHost = () => {
    if (!window.location.hostname.includes('github.io')) {
      return '';
    }
    const saved = localStorage.getItem('eagle_api_host');
    // If saved is an unencrypted local IP on an HTTPS github.io page, it will be blocked by Safari mixed content
    if (saved && saved.startsWith('https://')) {
      return saved.replace(/\/+$/, '');
    }
    return DEFAULT_TUNNEL_HOST;
  };

  const [apiHost, setApiHost] = useState(getApiHost());
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [customHostInput, setCustomHostInput] = useState(apiHost || DEFAULT_TUNNEL_HOST);

  const fetchBatch = async (newOffset = 0, append = false, host = apiHost) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const url = `${host}/api/eagle-library?offset=${newOffset}&limit=100`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setTotal(data.total || 0);
        setOffset(newOffset);
        const mappedItems = (data.items || []).map(it => ({
          ...it,
          thumbnailUrl: it.thumbnailUrl?.startsWith('http') ? it.thumbnailUrl : `${host}${it.thumbnailUrl}`,
          originalUrl: it.originalUrl?.startsWith('http') ? it.originalUrl : `${host}${it.originalUrl}`
        }));
        if (append) {
          setItems(prev => [...prev, ...mappedItems]);
        } else {
          setItems(mappedItems);
        }
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err) {
      console.warn('Failed to fetch Eagle library from', host, err);
      if (!append) {
        // If on github.io and failed, check if we can fall back to tunnel
        if (host !== DEFAULT_TUNNEL_HOST && window.location.hostname.includes('github.io')) {
          console.log('Falling back to secure Cloudflare tunnel...');
          setApiHost(DEFAULT_TUNNEL_HOST);
          return fetchBatch(newOffset, append, DEFAULT_TUNNEL_HOST);
        }
        setErrorMsg(`Unable to connect to Mac Eagle library at ${host || 'local server'}.`);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBatch(0, false);
  }, []);

  const handleLoadMore = () => {
    fetchBatch(offset + 100, true);
  };

  const filteredItems = filterQuery
    ? items.filter(it => (it.name || '').toLowerCase().includes(filterQuery.toLowerCase()))
    : items;

  const handleItemClick = async (item) => {
    try {
      const res = await fetch(item.originalUrl);
      const blob = await res.blob();
      const file = new File([blob], `${item.name}.${item.ext}`, { type: blob.type });
      onSelectImage(file);
      onClose();
    } catch (err) {
      console.error('Failed to load item:', err);
    }
  };

  return (
    <div className="modal-backdrop" style={{ zIndex: 1100 }}>
      <div className="modal-card" style={{ maxWidth: '880px', width: '95%', height: '85vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Folder size={20} style={{ color: 'var(--accent)' }} />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Eagle Library — Recent Artwork
                </h2>
                {items.length > 0 && (
                  <span style={{
                    fontSize: '10px',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    backgroundColor: 'rgba(34, 197, 94, 0.2)',
                    color: '#4ade80',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#22c55e' }} />
                    Connected
                  </span>
                )}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                Showing {items.length} of {total.toLocaleString()} illustrations in your library
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setShowServerConfig(!showServerConfig)}
              className="btn btn-secondary"
              style={{ fontSize: '11px', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
              title="Change server connection address"
            >
              <Globe size={12} />
              <span>{apiHost?.includes('trycloudflare') ? 'Cloudflare Tunnel' : (apiHost ? 'Wi-Fi' : 'Direct')}</span>
            </button>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Server Config Collapsible Bar */}
        {showServerConfig && (
          <div style={{
            marginTop: '10px',
            padding: '10px 14px',
            borderRadius: '8px',
            backgroundColor: 'rgba(99, 102, 241, 0.1)',
            border: '1px solid rgba(99, 102, 241, 0.25)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            fontSize: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600, color: '#c7d2fe' }}>Eagle Mac Server Connection</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setApiHost(DEFAULT_TUNNEL_HOST);
                    setCustomHostInput(DEFAULT_TUNNEL_HOST);
                    localStorage.setItem('eagle_api_host', DEFAULT_TUNNEL_HOST);
                    fetchBatch(0, false, DEFAULT_TUNNEL_HOST);
                  }}
                  style={{ fontSize: '10px', padding: '3px 8px' }}
                >
                  Use Cloudflare Tunnel (HTTPS)
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setApiHost(DEFAULT_LOCAL_HOST);
                    setCustomHostInput(DEFAULT_LOCAL_HOST);
                    localStorage.setItem('eagle_api_host', DEFAULT_LOCAL_HOST);
                    fetchBatch(0, false, DEFAULT_LOCAL_HOST);
                  }}
                  style={{ fontSize: '10px', padding: '3px 8px' }}
                >
                  Use Local Wi-Fi
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                type="text"
                value={customHostInput}
                onChange={(e) => setCustomHostInput(e.target.value)}
                placeholder="https://... or http://10.0.0.117:5174"
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid var(--border)',
                  color: '#fff',
                  fontSize: '11px'
                }}
              />
              <button
                className="btn btn-primary"
                onClick={() => {
                  const cleaned = customHostInput.trim().replace(/\/+$/, '');
                  setApiHost(cleaned);
                  localStorage.setItem('eagle_api_host', cleaned);
                  fetchBatch(0, false, cleaned);
                }}
                style={{ fontSize: '11px', padding: '6px 12px' }}
              >
                Connect
              </button>
            </div>
          </div>
        )}

        {/* Filter Input & Controls */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '12px' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Filter loaded images by name..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px 8px 32px',
                borderRadius: '8px',
                backgroundColor: 'rgba(255,255,255,0.06)',
                border: '1px solid var(--border)',
                color: '#fff',
                fontSize: '12px',
                outline: 'none'
              }}
            />
          </div>
          <button
            className="btn btn-secondary"
            onClick={() => fetchBatch(0, false)}
            disabled={loading}
            style={{ padding: '8px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
            title="Refresh Library"
          >
            <RefreshCw size={13} className={loading ? 'spinner' : ''} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Error message / connection help banner if offline */}
        {errorMsg && (
          <div style={{
            marginTop: '12px',
            padding: '12px 16px',
            borderRadius: '10px',
            backgroundColor: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            fontSize: '12px',
            color: '#fca5a5'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
              <WifiOff size={16} />
              <span>{errorMsg}</span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              Safari on iPad blocks unencrypted local connections from HTTPS websites. Choose your connection method below:
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setApiHost(DEFAULT_TUNNEL_HOST);
                  setCustomHostInput(DEFAULT_TUNNEL_HOST);
                  localStorage.setItem('eagle_api_host', DEFAULT_TUNNEL_HOST);
                  fetchBatch(0, false, DEFAULT_TUNNEL_HOST);
                }}
                style={{ fontSize: '11px', padding: '6px 12px' }}
              >
                Connect via Cloudflare Tunnel (HTTPS)
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  window.location.href = 'http://10.0.0.117:5174';
                }}
                style={{ fontSize: '11px', padding: '6px 12px' }}
              >
                Switch to Local Wi-Fi (10.0.0.117)
              </button>
            </div>
          </div>
        )}

        {/* Grid of Thumbnails */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          marginTop: '12px',
          paddingRight: '4px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(135px, 1fr))',
          gridAutoRows: 'max-content',
          gap: '14px',
          alignContent: 'start'
        }}>
          {filteredItems.map((it) => (
            <div
              key={it.id}
              onClick={() => handleItemClick(it)}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '10px',
                overflow: 'hidden',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                transition: 'transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease',
                userSelect: 'none'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.borderColor = 'var(--accent)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{
                width: '100%',
                aspectRatio: '1 / 1',
                backgroundColor: '#070a12',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                position: 'relative',
                flexShrink: 0
              }}>
                <img
                  src={it.thumbnailUrl}
                  alt={it.name}
                  loading="lazy"
                  crossOrigin="anonymous"
                  onError={(e) => {
                    if (it.originalUrl && e.currentTarget.src !== it.originalUrl) {
                      e.currentTarget.src = it.originalUrl;
                    }
                  }}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    display: 'block'
                  }}
                />
                {/* File format badge */}
                {it.ext && (
                  <span style={{
                    position: 'absolute',
                    top: '6px',
                    right: '6px',
                    backgroundColor: 'rgba(0, 0, 0, 0.7)',
                    backdropFilter: 'blur(4px)',
                    WebkitBackdropFilter: 'blur(4px)',
                    color: '#e2e8f0',
                    fontSize: '9px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    padding: '2px 5px',
                    borderRadius: '4px',
                    letterSpacing: '0.5px',
                    pointerEvents: 'none'
                  }}>
                    {it.ext}
                  </span>
                )}
              </div>
              <div style={{ padding: '8px 10px', fontSize: '11px', lineHeight: 1.3, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div
                  title={it.name}
                  style={{
                    color: 'var(--text-primary)',
                    fontWeight: 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {it.name}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '10px', marginTop: '3px' }}>
                  {it.width && it.height ? `${it.width} × ${it.height} px` : (it.ext ? it.ext.toUpperCase() : '')}
                </div>
              </div>
            </div>
          ))}

          {filteredItems.length === 0 && !loading && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
              No illustrations matched your search filter.
            </div>
          )}
        </div>

        {/* Footer with Load More */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Showing {items.length} of {total.toLocaleString()} items
          </div>
          {items.length < total && (
            <button
              className="btn btn-primary"
              onClick={handleLoadMore}
              disabled={loading}
              style={{ padding: '8px 20px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              {loading ? (
                <>
                  <Loader2 size={14} className="spinner" />
                  <span>Loading…</span>
                </>
              ) : (
                <>
                  <ChevronDown size={14} />
                  <span>Load More (Next 100)</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
