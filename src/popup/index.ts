// Popup script - minimal: Auto-Fill button + open options page

function showStatus(message: string, isError = false): void {
  const status = document.getElementById('status')!;
  status.textContent = message;
  status.style.color = isError ? '#C8102E' : '#B8860B';
  const duration = isError ? 5000 : 3000;
  setTimeout(() => { status.textContent = ''; }, duration);
}

document.addEventListener('DOMContentLoaded', () => {
  // Auto-fill button
  document.getElementById('fillBtn')!.addEventListener('click', () => {
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
        const count = typeof response.filledCount === 'number' ? response.filledCount : 0;
        showStatus(`Filled ${count} field(s)!`);
      } else if (response.success && response.filledCount === 0) {
        showStatus('No matching fields found on this page.', true);
      } else {
        showStatus('Save your profile first, then try again.', true);
      }
    });
  });

  // Open options page
  document.getElementById('profileBtn')!.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
});
