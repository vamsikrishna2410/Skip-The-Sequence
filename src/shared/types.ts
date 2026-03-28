// User profile type definitions

export interface WorkExperience {
  jobTitle: string;
  company: string;
  location: string;
  employmentType: string;
  startDate: string; // MM/YYYY
  endDate: string;   // MM/YYYY
  currentlyWorking: boolean;
  description: string;
}

export const EMPTY_EXPERIENCE: WorkExperience = {
  jobTitle: '',
  company: '',
  location: '',
  employmentType: '',
  startDate: '',
  endDate: '',
  currentlyWorking: false,
  description: '',
};

export interface UserProfile {
  // Personal
  firstName: string;
  lastName: string;
  email: string;
  phoneCountryCode: string;
  phone: string;
  address: string;
  address2: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  linkedinUrl: string;

  // Current / most-recent work (auto-fill targets)
  jobTitle: string;
  company: string;
  yearsOfExperience: string;

  // Work preferences (auto-fill targets)
  workAuthorization: string;
  sponsorshipNeeded: string;
  willingToRelocate: string;

  // File Attachments
  hasResume?: boolean;
  resumeMetadata?: {
    name: string;
    lastUpdated: number;
  };

  // Work history entries
  workExperiences: WorkExperience[];
}

// Keys that map to simple string fields (used by detector)
export type ProfileFieldKey = Exclude<keyof UserProfile, 'workExperiences' | 'hasResume' | 'resumeMetadata'>;

export const EMPTY_PROFILE: UserProfile = {
  firstName: '',
  lastName: '',
  email: '',
  phoneCountryCode: '',
  phone: '',
  address: '',
  address2: '',
  city: '',
  state: '',
  zipCode: '',
  country: '',
  linkedinUrl: '',
  jobTitle: '',
  company: '',
  yearsOfExperience: '',
  workAuthorization: '',
  sponsorshipNeeded: '',
  willingToRelocate: '',
  hasResume: false,
  workExperiences: [],
};
