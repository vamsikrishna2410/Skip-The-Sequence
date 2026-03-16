// Background service worker for Stop The Sequence
// Handles extension lifecycle events and coordinates between popup and content scripts

chrome.runtime.onInstalled.addListener(() => {
  console.log('Stop The Sequence extension installed.');
});

// Allowed message actions
const ALLOWED_ACTIONS = new Set(['fillForm']);

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Validate message structure
  if (!message || typeof message !== 'object' || !ALLOWED_ACTIONS.has(message.action)) {
    return false;
  }

  if (message.action === 'fillForm') {
    // Forward fill request to the active tab's content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (!tabId) {
        sendResponse({ success: false, filledCount: 0, error: 'No active tab found' });
        return;
      }
      chrome.tabs.sendMessage(tabId, { action: 'fillForm' }, (response) => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, filledCount: 0, error: 'Could not reach page. Is it a supported job site?' });
          return;
        }
        sendResponse(response);
      });
    });
    return true; // keep message channel open for async response
  }
});
