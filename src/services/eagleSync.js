/**
 * Eagle Integration for iPad & Web:
 * 1. iCloud / Photos Multi-File Export (via Web Share API Level 2 or staggered download)
 * 2. Direct Mac Eagle Library Batch API Sync (via Vite proxy / Cloudflare tunnel)
 */

export const DEFAULT_TUNNEL_HOST = 'https://develop-fans-guam-pixel.trycloudflare.com';

/**
 * Returns the effective Eagle API host URL based on current environment.
 */
export function getEagleApiHost() {
  if (typeof window === 'undefined') return '';
  if (!window.location.hostname.includes('github.io')) {
    return '';
  }
  const saved = localStorage.getItem('eagle_api_host');
  if (saved && saved.startsWith('https://')) {
    return saved.replace(/\/+$/, '');
  }
  return DEFAULT_TUNNEL_HOST;
}

/**
 * Save a single file via native Share Sheet or standard download.
 */
export async function saveFileToICloudOrDownload(blob, filename) {
  // Option A: Try Web Share API (native iPad iOS Share sheet -> "Save to Files" or "Save Image")
  if (navigator.canShare && navigator.canShare({ files: [new File([blob], filename, { type: 'image/png' })] })) {
    try {
      const file = new File([blob], filename, { type: 'image/png' });
      await navigator.share({
        files: [file],
        title: filename,
      });
      return { success: true, method: 'share' };
    } catch (err) {
      if (err.name === 'AbortError') {
        return { success: false, cancelled: true };
      }
      console.log('Share dismissed or failed, falling back to download:', err);
    }
  }

  // Option B: Standard browser download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return { success: true, method: 'download' };
}

/**
 * Save multiple crops simultaneously:
 * On iPad / iOS Safari, passes all File objects to navigator.share in ONE call,
 * allowing the user to tap "Save N Images" or "Save to Files" once without dropped crops.
 */
export async function saveMultipleFilesToICloudOrDownload(items) {
  if (!items || items.length === 0) return { success: false, count: 0 };

  const files = items.map(
    (item) => new File([item.blob], item.filename, { type: 'image/png' })
  );

  // Option A: Multi-file Web Share (iOS Safari "Save N Images" in Photos or "Save to Files")
  if (navigator.canShare && navigator.canShare({ files })) {
    try {
      await navigator.share({
        files,
        title: `Export ${files.length} Crops`,
      });
      return { success: true, method: 'share', count: files.length };
    } catch (err) {
      if (err.name === 'AbortError') {
        return { success: false, cancelled: true };
      }
      console.warn('Multi-file share failed or was dismissed, falling back to download:', err);
    }
  }

  // Option B: Multi-file download with staggered intervals to prevent browser pop-up suppression
  for (let i = 0; i < items.length; i++) {
    const { blob, filename } = items[i];
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    if (i < items.length - 1) {
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  return { success: true, method: 'download', count: items.length };
}

/**
 * Batch POST all crops directly to the Mac Eagle server (/api/eagle-save-crops)
 */
export async function saveCropsToEagleServer(items, apiHost = '') {
  const host = (apiHost || '').replace(/\/+$/, '');
  const url = `${host}/api/eagle-save-crops`;

  try {
    const payloadItems = await Promise.all(
      items.map(async (item) => {
        let dataUrl = item.dataUrl;
        if (!dataUrl && item.blob) {
          dataUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(item.blob);
          });
        }
        return {
          name: item.filename.replace(/\.[^/.]+$/, ''),
          dataUrl,
        };
      })
    );

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: payloadItems,
        tags: ['cropped', 'ipad'],
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return { success: true, savedCount: data.savedCount || payloadItems.length };
    } else {
      console.warn('Eagle batch save returned error:', res.status);
      return { success: false, error: `HTTP ${res.status}` };
    }
  } catch (err) {
    console.warn('Eagle server save failed:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Single file POST to the Mac Eagle server
 */
export async function saveSingleToEagleServer(blob, filename, tags = ['bg-removed', 'ipad'], apiHost = '') {
  const host = (apiHost || '').replace(/\/+$/, '');
  const url = `${host}/api/eagle-save-crops`;

  try {
    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [
          {
            name: filename.replace(/\.[^/.]+$/, ''),
            dataUrl,
          },
        ],
        tags,
      }),
    });

    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Failed to send single file to Eagle server:', err);
  }
  return null;
}

/**
 * Direct Wi-Fi POST to Eagle API on Mac (legacy fallback)
 */
export async function sendDirectToEagle(blob, filename, tags = ['bg-removed'], eagleHost = '') {
  if (!eagleHost) return null;
  const host = eagleHost.replace(/\/+$/, '');
  const url = `${host}/api/item/addFromURL`;

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const base64data = reader.result;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: base64data,
            name: filename.replace(/\.[^/.]+$/, ''),
            tags: tags,
          }),
        });
        const json = await res.json();
        resolve(json);
      } catch (err) {
        console.warn('Eagle Wi-Fi sync failed:', err);
        resolve(null);
      }
    };
    reader.readAsDataURL(blob);
  });
}
