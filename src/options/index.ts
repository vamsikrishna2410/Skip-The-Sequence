// Options page script — full profile editor

import { saveProfile, getProfileOrDefault } from '../storage/profile';
import { UserProfile, EMPTY_PROFILE } from '../shared/types';

const FIELD_IDS: (keyof UserProfile)[] = [
  'firstName', 'lastName', 'email', 'phone',
  'city', 'state', 'zipCode',
  'linkedinUrl',
  'jobTitle', 'company', 'yearsOfExperience',
];

function showStatus(message: string, isError = false): void {
  const status = document.getElementById('status')!;
  status.textContent = message;
  status.style.color = isError ? '#C8102E' : '#B8860B';
  const duration = isError ? 5000 : 3000;
  setTimeout(() => { status.textContent = ''; }, duration);
}

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

function populateForm(profile: UserProfile): void {
  for (const key of FIELD_IDS) {
    const input = document.getElementById(key) as HTMLInputElement;
    if (input && profile[key]) {
      input.value = profile[key] as string;
    }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const profile = await getProfileOrDefault();
  populateForm(profile);

  document.getElementById('saveBtn')!.addEventListener('click', async () => {
    const profile = readForm();
    await saveProfile(profile);
    showStatus('Profile saved!');
  });
});
