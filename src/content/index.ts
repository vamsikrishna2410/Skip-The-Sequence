// Content script entry point
// Injected into job application pages to detect and fill forms

import { getProfile } from '../storage/profile';
import { detectAndFill } from './detector';
import { runAutoAdvance, abortAutoAdvance } from './auto-advance';

// Listen for fill requests from the popup/background
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== 'object') return false;

  if (message.action === 'fillForm') {
    handleFill()
      .then((result) => {
        if (result.filledCount === 0 && !isTopFrame()) return;
        sendResponse(result);
      })
      .catch(() => {
        if (isTopFrame()) {
          sendResponse({ success: false, filledCount: 0, error: 'Something went wrong. Please refresh and try again.' });
        }
      });
    return true;
  }

  if (message.action === 'autoAdvance') {
    if (!isTopFrame()) return false;
    handleAutoAdvance()
      .then((result) => sendResponse(result))
      .catch(() => {
        sendResponse({ success: false, error: 'Auto-advance failed. Please refresh and try again.' });
      });
    return true;
  }

  if (message.action === 'abortAutoAdvance') {
    abortAutoAdvance();
    sendResponse({ success: true });
    return true;
  }
});

// Check if we need to resume auto-advance after a full page navigation
(async () => {
  try {
    const state = await chrome.storage.session.get('autoAdvanceState') as Record<string, { active?: boolean }>;
    if (state.autoAdvanceState?.active && isTopFrame()) {
      // Clear the flag immediately to prevent re-triggering
      await chrome.storage.session.remove('autoAdvanceState');
      // Brief delay for page to stabilize
      await new Promise((r) => setTimeout(r, 1500));
      const result = await handleAutoAdvance();
      // Notify popup if it's open
      chrome.runtime.sendMessage({ action: 'autoAdvanceStatus', result }).catch(() => {});
    }
  } catch {
    // chrome.storage.session may not be available in all contexts
  }
})();

function isTopFrame(): boolean {
  try {
    return window === window.top;
  } catch {
    return false;
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

async function handleAutoAdvance(): Promise<{ success: boolean; result?: ReturnType<typeof runAutoAdvance> extends Promise<infer R> ? R : never; error?: string }> {
  const profile = await getProfile();
  if (!profile) {
    return { success: false, error: 'No profile saved yet. Open the extension and save your profile first.' };
  }

  // Store state in case of full page navigation
  await chrome.storage.session.set({ autoAdvanceState: { active: true } }).catch(() => {});

  const result = await runAutoAdvance(profile, (page, filled, action) => {
    // Report progress to popup
    chrome.runtime.sendMessage({
      action: 'autoAdvanceProgress',
      page,
      filled,
      currentAction: action,
    }).catch(() => {});
  });

  // Clear auto-advance state
  await chrome.storage.session.remove('autoAdvanceState').catch(() => {});

  return { success: true, result };
}
