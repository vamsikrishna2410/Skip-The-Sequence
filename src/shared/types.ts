// User profile type definitions

export interface UserProfile {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  zipCode: string;
  linkedinUrl: string;
}

export const EMPTY_PROFILE: UserProfile = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  city: '',
  state: '',
  zipCode: '',
  linkedinUrl: '',
};
