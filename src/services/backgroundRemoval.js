import { removeBackground } from '@imgly/background-removal';

/**
 * In-browser AI background removal
 * Runs entirely on iPad GPU (WebGPU) or Neural Engine / WASM
 */
export async function processBackgroundRemovalInBrowser(imageInput, options = {}) {
  const {
    quality = 'best', // 'fast' | 'best'
    onProgress = () => {}
  } = options;

  const config = {
    progress: (key, current, total) => {
      onProgress(key, current, total);
    },
    debug: false,
    model: quality === 'fast' ? 'small' : 'medium',
    output: {
      format: 'image/png',
      quality: 1.0,
      type: 'blob'
    }
  };

  try {
    const resultBlob = await removeBackground(imageInput, config);
    return resultBlob;
  } catch (err) {
    console.warn('First attempt with default config failed, attempting fallback...', err);
    // Fallback config without strict device bindings
    const fallbackBlob = await removeBackground(imageInput, {
      ...config,
      device: 'cpu'
    });
    return fallbackBlob;
  }
}
