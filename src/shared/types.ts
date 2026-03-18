// User profile type definitions

export interface WorkExperience {
  jobTitle: string;
  company: string;
  location: string;
  employmentType: string;
  startMonth: string;
  startYear: string;
  endMonth: string;
  endYear: string;
  currentlyWorking: boolean;
  description: string;
}

export const EMPTY_EXPERIENCE: WorkExperience = {
  jobTitle: '',
  company: '',
  location: '',
  employmentType: '',
  startMonth: '',
  startYear: '',
  endMonth: '',
  endYear: '',
  currentlyWorking: false,
  description: '',
};

export interface UserProfile {
  // Personal
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  linkedinUrl: string;

  // Current / most-recent work (auto-fill targets)
  jobTitle: string;
  company: string;
  yearsOfExperience: string;

  // Work preferences (auto-fill targets)
  desiredJobTitle: string;
  desiredSalary: string;
  workAuthorization: string;
  sponsorshipNeeded: string;
  willingToRelocate: string;
  remotePreference: string;
  earliestStartDate: string;

  // Work history entries
  workExperiences: WorkExperience[];
}

// Keys that map to simple string fields (used by detector)
export type ProfileFieldKey = Exclude<keyof UserProfile, 'workExperiences'>;

export const EMPTY_PROFILE: UserProfile = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  state: '',
  zipCode: '',
  linkedinUrl: '',
  jobTitle: '',
  company: '',
  yearsOfExperience: '',
  desiredJobTitle: '',
  desiredSalary: '',
  workAuthorization: '',
  sponsorshipNeeded: '',
  willingToRelocate: '',
  remotePreference: '',
  earliestStartDate: '',
  workExperiences: [],
};
