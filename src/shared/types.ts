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

export interface Education {
  school: string;
  degree: string;
  fieldOfStudy: string;
  gpa: string;
  startDate: string; // MM/YYYY
  endDate: string;   // MM/YYYY
}

export const EMPTY_EDUCATION: Education = {
  school: '',
  degree: '',
  fieldOfStudy: '',
  gpa: '',
  startDate: '',
  endDate: '',
};

export interface UserProfile {
  // Personal
  firstName: string;
  lastName: string;
  email: string;
  phoneCountryCode: string;
  phone: string;
  phoneDeviceType: string;
  address: string;
  address2: string;
  city: string;
  county: string;
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
  citizenshipStatus: string;
  sponsorshipNeeded: string;
  willingToRelocate: string;
  previouslyEmployed: string;
  desiredSalary: string;
  relatedToEmployee: string;
  desiredStartDate: string;

  // Voluntary disclosures
  gender: string;
  hispanicOrLatino: string;
  raceEthnicity: string;
  veteranStatus: string;
  disabilityStatus: string;

  // File Attachments
  hasResume?: boolean;
  resumeMetadata?: {
    name: string;
    lastUpdated: number;
  };

  // Education & Work history entries
  educations: Education[];
  workExperiences: WorkExperience[];
}

// Keys that map to simple string fields (used by detector)
export type ProfileFieldKey = Exclude<keyof UserProfile, 'educations' | 'workExperiences' | 'hasResume' | 'resumeMetadata'>;

export const EMPTY_PROFILE: UserProfile = {
  firstName: '',
  lastName: '',
  email: '',
  phoneCountryCode: '',
  phone: '',
  phoneDeviceType: '',
  address: '',
  address2: '',
  city: '',
  county: '',
  state: '',
  zipCode: '',
  country: '',
  linkedinUrl: '',
  jobTitle: '',
  company: '',
  yearsOfExperience: '',
  workAuthorization: '',
  citizenshipStatus: '',
  sponsorshipNeeded: '',
  willingToRelocate: '',
  previouslyEmployed: '',
  desiredSalary: '',
  relatedToEmployee: '',
  desiredStartDate: '',
  gender: '',
  hispanicOrLatino: '',
  raceEthnicity: '',
  veteranStatus: '',
  disabilityStatus: '',
  hasResume: false,
  educations: [],
  workExperiences: [],
};
