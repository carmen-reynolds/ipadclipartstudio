import React, { useState, useEffect } from 'react';
import { Folder, Search, Loader2, X, RefreshCw, ChevronDown, Check } from 'lucide-react';

export function EagleLibraryModal({ onSelectImage, onClose }) {
  const [items, setItems] = useState([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');

  const fetchBatch = async (newOffset = 0, append = false) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/eagle-library?offset=${newOffset}&limit=100`);
      if (res.ok) {
        const data = await res.json();
        setTotal(data.total || 0);
        setOffset(newOffset);
        if (append) {
          setItems(prev => [...prev, ...(data.items || [])]);
        } else {
          setItems(data.items || []);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch Eagle library:', err);
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
      <div className="modal-card" style={{ maxWidth: '850px', width: '95%', height: '85vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Folder size={20} style={{ color: 'var(--accent)' }} />
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Eagle Library — Recent Artwork
              </h2>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                Showing {items.length} of {total.toLocaleString()} illustrations in your library
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}
          >
            <X size={20} />
          </button>
        </div>

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

        {/* Grid of Thumbnails */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          marginTop: '12px',
          paddingRight: '4px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
          gap: '12px',
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
                overflow: 'hidden',
                position: 'relative'
              }}>
                <img
                  src={it.thumbnailUrl}
                  alt={it.name}
                  loading="lazy"
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              </div>
              <div style={{ padding: '6px 8px', fontSize: '11px', lineHeight: 1.3 }}>
                <div style={{ color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {it.name}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '9px', marginTop: '2px' }}>
                  {it.width} × {it.height} px
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
            Showing {items.length} of {total} items
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
