// Popup script — handles profile form and auto-fill button

import { saveProfile, getProfileOrDefault } from '../storage/profile';
import { UserProfile, EMPTY_PROFILE } from '../shared/types';

const FIELD_IDS: (keyof UserProfile)[] = [
  'firstName', 'lastName', 'email', 'phone',
  'city', 'state', 'zipCode',
  'linkedinUrl',
];

function showStatus(message: string, isError = false): void {
  const status = document.getElementById('status')!;
  status.textContent = message;
  status.style.color = isError ? '#C8102E' : '#B8860B';
  const duration = isError ? 5000 : 3000;
  setTimeout(() => { status.textContent = ''; }, duration);
}

/**
 * Read form values into a UserProfile object
 */
function readForm(): UserProfile {
  const profile = { ...EMPTY_PROFILE };
  for (const key of FIELD_IDS) {
    const input = document.getElementById(key) as HTMLInputElement;
    if (input) {
      profile[key] = input.value.trim();
    }
  }
  return profile;
}

/**
 * Populate form inputs from a UserProfile object
 */
function populateForm(profile: UserProfile): void {
  for (const key of FIELD_IDS) {
    const input = document.getElementById(key) as HTMLInputElement;
    if (input && profile[key]) {
      input.value = profile[key] as string;
    }
  }
}

// Load saved profile when popup opens
document.addEventListener('DOMContentLoaded', async () => {
  const profile = await getProfileOrDefault();
  populateForm(profile);

  // Save button
  document.getElementById('saveBtn')!.addEventListener('click', async () => {
    const profile = readForm();
    await saveProfile(profile);
    showStatus('Profile saved!');
  });

  // Auto-fill button — sends message to content script via background
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
});
