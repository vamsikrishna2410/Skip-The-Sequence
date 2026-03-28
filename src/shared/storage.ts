/**
 * Resume file storage via chrome.storage.local.
 *
 * Content scripts cannot access the extension's IndexedDB (they run in
 * the web-page origin).  chrome.storage.local is accessible from every
 * extension context — options page, popup, background, AND content scripts.
 *
 * Files are stored as base64 strings along with their metadata.
 * We cap uploads at 5 MB, which becomes ~6.7 MB base64 — well within
 * the 10 MB chrome.storage.local quota.
 */

const RESUME_KEY = 'sts_resume_data';

interface StoredResume {
  base64: string;
  name: string;
  type: string;
  lastUpdated: number;
}

/**
 * Convert a File to a base64 string.
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // result is "data:<mime>;base64,<data>".  Strip the prefix.
      const base64 = result.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Convert a base64 string back to a File.
 */
function base64ToFile(base64: string, name: string, type: string): File {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new File([bytes], name, { type });
}

/**
 * Save a resume File to chrome.storage.local.
 */
export async function saveResumeFile(file: File): Promise<void> {
  const base64 = await fileToBase64(file);
  const data: StoredResume = {
    base64,
    name: file.name,
    type: file.type,
    lastUpdated: Date.now(),
  };
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [RESUME_KEY]: data }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Retrieve the stored resume as a File, or undefined if none exists.
 */
export async function getResumeFile(): Promise<File | undefined> {
  return new Promise((resolve) => {
    chrome.storage.local.get(RESUME_KEY, (result) => {
      const data = result[RESUME_KEY] as StoredResume | undefined;
      if (!data || !data.base64) {
        resolve(undefined);
        return;
      }
      try {
        const file = base64ToFile(data.base64, data.name, data.type);
        resolve(file);
      } catch {
        resolve(undefined);
      }
    });
  });
}

/**
 * Delete the stored resume.
 */
export async function deleteResumeFile(): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(RESUME_KEY, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}
