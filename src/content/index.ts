// Content script entry point
// Injected into job application pages to detect and fill forms

import { getProfile } from '../storage/profile';
import { detectAndFill } from './detector';

// Listen for fill requests from the popup/background
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && typeof message === 'object' && message.action === 'fillForm') {
    handleFill()
      .then((result) => {
        // If we're inside an iframe and found nothing, don't respond —
        // let the main frame's response reach the popup instead of
        // winning the race with a misleading "0 fields" result.
        if (result.filledCount === 0 && !isTopFrame()) {
          return; // intentionally never call sendResponse
        }
        sendResponse(result);
      })
      .catch(() => {
        if (isTopFrame()) {
          sendResponse({ success: false, filledCount: 0, error: 'Something went wrong. Please refresh and try again.' });
        }
      });
    return true; // async response
  }
});

function isTopFrame(): boolean {
  try {
    return window === window.top;
  } catch {
    return false; // cross-origin iframe
  }
}

async function handleFill(): Promise<{ success: boolean; filledCount: number; error?: string }> {
  const profile = await getProfile();
  if (!profile) {
    return { success: false, filledCount: 0, error: 'No profile saved yet. Open the extension and save your profile first.' };
  }
  const filledCount = await detectAndFill(profile);
  return { success: true, filledCount };
}
