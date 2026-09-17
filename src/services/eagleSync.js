/**
 * Eagle Integration for iPad:
 * 1. iCloud Watched Folder File Export (via File System Access API or iOS Share/Download)
 * 2. Direct Wi-Fi Eagle API Sync (when on home network)
 */

export async function saveFileToICloudOrDownload(blob, filename) {
  // Option A: Try Web Share API (native iPad iOS Share sheet -> "Save to Files" -> iCloud "To Eagle" folder)
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
 * Direct Wi-Fi POST to Eagle API on Mac (port 41595)
 */
export async function sendDirectToEagle(blob, filename, tags = ['bg-removed'], eagleHost = '') {
  if (!eagleHost) return null;
  const host = eagleHost.replace(/\/+$/, '');
  const url = `${host}/api/item/addFromURL`;

  // Convert blob to base64 data URL
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
            tags: tags
          })
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
