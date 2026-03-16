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
  status.style.color = isError ? '#C41E3A' : '#D4AF37';
  setTimeout(() => { status.textContent = ''; }, 3000);
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
        showStatus('No active job page found.', true);
        return;
      }
      if (response?.success) {
        const count = typeof response.filledCount === 'number' ? response.filledCount : 0;
        showStatus(`Filled ${count} field(s)!`);
      } else {
        showStatus('Save your profile first.', true);
      }
    });
  });
});
