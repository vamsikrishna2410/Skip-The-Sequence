// Background service worker for Skip The Sequence
// Handles extension lifecycle events and coordinates between popup and content scripts

chrome.runtime.onInstalled.addListener(() => {
  console.log('Skip The Sequence extension installed.');
});

// Allowed message actions
const ALLOWED_ACTIONS = new Set(['fillForm', 'autoAdvance', 'abortAutoAdvance']);

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Validate message structure
  if (!message || typeof message !== 'object' || !ALLOWED_ACTIONS.has(message.action)) {
    return false;
  }

  if (message.action === 'fillForm' || message.action === 'autoAdvance' || message.action === 'abortAutoAdvance') {
    // Forward request to the active tab's content script
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tabId = tabs[0]?.id;
      if (!tabId) {
        sendResponse({ success: false, filledCount: 0, error: 'No active tab found' });
        return;
      }

      // Try sending to existing content script first
      chrome.tabs.sendMessage(tabId, { action: message.action }, async (response) => {
        if (!chrome.runtime.lastError && response) {
          sendResponse(response);
          return;
        }

        // Content script not loaded - inject it programmatically and retry
        try {
          await chrome.scripting.executeScript({
            target: { tabId, allFrames: true },
            files: ['content.js'],
          });
          setTimeout(() => {
            chrome.tabs.sendMessage(tabId, { action: message.action }, (retryResponse) => {
              if (chrome.runtime.lastError || !retryResponse) {
                sendResponse({ success: false, filledCount: 0, error: 'Could not reach page. Is it a supported job site?' });
                return;
              }
              sendResponse(retryResponse);
            });
          }, 300);
        } catch {
          sendResponse({ success: false, filledCount: 0, error: 'Could not reach page. Is it a supported job site?' });
        }
      });
    });
    return true;
  }
});
