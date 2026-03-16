// Content script entry point
// Injected into job application pages to detect and fill forms

import { getProfile } from '../storage/profile';
import { detectAndFill } from './detector';

// Listen for fill requests from the popup/background
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && typeof message === 'object' && message.action === 'fillForm') {
    handleFill()
      .then((result) => sendResponse(result))
      .catch(() => sendResponse({ success: false, filledCount: 0 }));
    return true; // async response
  }
});

async function handleFill(): Promise<{ success: boolean; filledCount: number }> {
  const profile = await getProfile();
  if (!profile) {
    return { success: false, filledCount: 0 };
  }
  const filledCount = detectAndFill(profile);
  return { success: true, filledCount };
}
