// Chrome storage wrapper for user profile data

import { UserProfile, WorkExperience, EMPTY_PROFILE } from '../shared/types';

const STORAGE_KEY = 'userProfile';

function toTwoDigitMonth(input: unknown): string {
  const value = String(input ?? '').trim().toLowerCase();
  if (!value) return '';
  if (/^\d{1,2}$/.test(value)) return value.padStart(2, '0');
  const monthMap: Record<string, string> = {
    january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
    july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
    jan: '01', feb: '02', mar: '03', apr: '04', jun: '06', jul: '07', aug: '08',
    sep: '09', sept: '09', oct: '10', nov: '11', dec: '12',
  };
  return monthMap[value] || '';
}

/**
 * Migrate old work experience format (startMonth/startYear) to new (startDate/endDate).
 */
function migrateProfile(data: any): UserProfile {
  if (data && Array.isArray(data.workExperiences)) {
    data.workExperiences = data.workExperiences.map((exp: any): WorkExperience => {
      // If old format fields exist but new ones don't, convert
      if (!exp.startDate && (exp.startMonth || exp.startYear)) {
        const mm = toTwoDigitMonth(exp.startMonth) || '01';
        const yyyy = exp.startYear || '';
        exp.startDate = yyyy ? `${mm}/${yyyy}` : '';
      }
      if (!exp.endDate && (exp.endMonth || exp.endYear)) {
        const mm = toTwoDigitMonth(exp.endMonth) || '01';
        const yyyy = exp.endYear || '';
        exp.endDate = yyyy ? `${mm}/${yyyy}` : '';
      }
      // Clean up old fields
      delete exp.startMonth;
      delete exp.startYear;
      delete exp.endMonth;
      delete exp.endYear;
      return {
        jobTitle: exp.jobTitle || '',
        company: exp.company || '',
        location: exp.location || '',
        employmentType: exp.employmentType || '',
        startDate: exp.startDate || '',
        endDate: exp.endDate || '',
        currentlyWorking: Boolean(exp.currentlyWorking),
        description: exp.description || '',
      };
    });
  }
  return data as UserProfile;
}

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
      if (!data) { resolve(null); return; }
      const migrated = migrateProfile(data);
      // Persist migrated data so old fields are permanently removed
      chrome.storage.local.set({ [STORAGE_KEY]: migrated });
      resolve(migrated);
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
      if (!data) { resolve({ ...EMPTY_PROFILE }); return; }
      const migrated = migrateProfile(data);
      chrome.storage.local.set({ [STORAGE_KEY]: migrated });
      resolve(migrated);
    });
  });
}
