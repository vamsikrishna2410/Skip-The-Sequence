// Chrome storage wrapper for user profile data

import { UserProfile, EMPTY_PROFILE } from '../shared/types';

const STORAGE_KEY = 'userProfile';

/**
 * Save the user profile to Chrome local storage
 */
export function saveProfile(profile: UserProfile): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: profile }, resolve);
  });
}

/**
 * Retrieve the user profile from Chrome local storage
 */
export function getProfile(): Promise<UserProfile | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      const data = result[STORAGE_KEY] as UserProfile | undefined;
      resolve(data ?? null);
    });
  });
}

/**
 * Get profile or return empty defaults
 */
export function getProfileOrDefault(): Promise<UserProfile> {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      const data = result[STORAGE_KEY] as UserProfile | undefined;
      resolve(data ?? { ...EMPTY_PROFILE });
    });
  });
}
