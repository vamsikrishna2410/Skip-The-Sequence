// Popup script - Auto-Fill, Auto-Fill All Pages, and open options page

let isAdvancing = false;

function showStatus(message: string, isError = false): void {
  const status = document.getElementById('status')!;
  status.textContent = message;
  status.style.color = isError ? '#C8102E' : '#B8860B';
  if (!isAdvancing) {
    const duration = isError ? 5000 : 3000;
    setTimeout(() => { if (!isAdvancing) status.textContent = ''; }, duration);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const fillBtn = document.getElementById('fillBtn')!;
  const advanceBtn = document.getElementById('advanceBtn') as HTMLButtonElement;

  // Auto-fill single page
  fillBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'fillForm' }, (response) => {
      if (chrome.runtime.lastError) {
        showStatus('This page is not a supported job site.', true);
        return;
      }
      if (!response) {
        showStatus('This page is not a supported job site.', true);
        return;
      }
      if (response.error) {
        showStatus(response.error, true);
        return;
      }
      if (response.success && response.filledCount > 0) {
        showStatus(`Filled ${response.filledCount} field(s)!`);
      } else if (response.success && response.filledCount === 0) {
        showStatus('No matching fields found on this page.', true);
      } else {
        showStatus('Save your profile first, then try again.', true);
      }
    });
  });

  // Auto-fill all pages
  advanceBtn.addEventListener('click', () => {
    if (isAdvancing) {
      // Abort
      chrome.runtime.sendMessage({ action: 'abortAutoAdvance' });
      isAdvancing = false;
      advanceBtn.textContent = 'Auto-Fill All Pages';
      showStatus('Stopping...', false);
      setTimeout(() => { showStatus(''); }, 2000);
      return;
    }

    isAdvancing = true;
    advanceBtn.textContent = 'Stop';
    showStatus('Filling page 1...');

    chrome.runtime.sendMessage({ action: 'autoAdvance' }, (response) => {
      isAdvancing = false;
      advanceBtn.textContent = 'Auto-Fill All Pages';

      if (chrome.runtime.lastError) {
        showStatus('This page is not a supported job site.', true);
        return;
      }
      if (!response) {
        showStatus('This page is not a supported job site.', true);
        return;
      }
      if (response.error) {
        showStatus(response.error, true);
        return;
      }
      if (response.result) {
        showStatus(response.result.message, response.result.status === 'error');
      }
    });
  });

  // Listen for progress updates from content script
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'autoAdvanceProgress' && isAdvancing) {
      const action = message.currentAction === 'filling' ? 'Filling' : 'Next';
      showStatus(`${action} page ${message.page}... (${message.filled} fields filled)`);
    }
    if (message.action === 'autoAdvanceStatus') {
      isAdvancing = false;
      advanceBtn.textContent = 'Auto-Fill All Pages';
      if (message.result) {
        showStatus(message.result.message);
      }
    }
  });

  // Open options page
  document.getElementById('profileBtn')!.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
});
