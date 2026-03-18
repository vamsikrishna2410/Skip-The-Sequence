// Form detection and auto-fill engine
// Uses heuristic matching on labels, placeholders, names, and IDs

import { UserProfile, ProfileFieldKey } from '../shared/types';

interface FieldMapping {
  keywords: string[];
  profileKey: ProfileFieldKey;
}

// Map of form field keywords to profile fields
const FIELD_MAPPINGS: FieldMapping[] = [
  // Personal
  { keywords: ['first name', 'firstname', 'first_name', 'fname', 'given name'], profileKey: 'firstName' },
  { keywords: ['last name', 'lastname', 'last_name', 'lname', 'surname', 'family name'], profileKey: 'lastName' },
  { keywords: ['email', 'e-mail', 'email address'], profileKey: 'email' },
  { keywords: ['phone', 'telephone', 'mobile', 'phone number', 'tel'], profileKey: 'phone' },
  { keywords: ['address', 'address line', 'street address', 'address line 1', 'street', 'address1', 'addressline1'], profileKey: 'address' },
  { keywords: ['city', 'location'], profileKey: 'city' },
  { keywords: ['state', 'province'], profileKey: 'state' },
  { keywords: ['zip', 'postal', 'zip code', 'postal code'], profileKey: 'zipCode' },
  { keywords: ['linkedin', 'linkedin url', 'linkedin profile'], profileKey: 'linkedinUrl' },

  // Current / most-recent work
  { keywords: ['job title', 'current title', 'title', 'position', 'role', 'designation'], profileKey: 'jobTitle' },
  { keywords: ['company', 'current company', 'employer', 'organization', 'company name'], profileKey: 'company' },
  { keywords: ['years of experience', 'years experience', 'total experience', 'work experience'], profileKey: 'yearsOfExperience' },

  // Work preferences
  { keywords: ['desired title', 'desired job title', 'preferred title', 'desired role', 'preferred role'], profileKey: 'desiredJobTitle' },
  { keywords: ['desired salary', 'expected salary', 'salary expectation', 'compensation', 'salary range', 'expected compensation', 'desired pay'], profileKey: 'desiredSalary' },
  { keywords: ['authorized to work', 'work authorization', 'legally authorized', 'eligible to work', 'right to work', 'authorization'], profileKey: 'workAuthorization' },
  { keywords: ['sponsorship', 'visa sponsorship', 'require sponsorship', 'need sponsorship', 'immigration sponsorship'], profileKey: 'sponsorshipNeeded' },
  { keywords: ['willing to relocate', 'open to relocation', 'relocate', 'relocation'], profileKey: 'willingToRelocate' },
  { keywords: ['remote', 'work location preference', 'remote preference', 'on-site', 'onsite', 'hybrid', 'workplace type'], profileKey: 'remotePreference' },
  { keywords: ['earliest start date', 'start date', 'available to start', 'earliest available', 'when can you start', 'availability'], profileKey: 'earliestStartDate' },
];

/**
 * Get identifying text for a form field (label, placeholder, name, id)
 */
function getFieldIdentifiers(input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string {
  const parts: string[] = [];

  // Check placeholder
  if ('placeholder' in input && input.placeholder) {
    parts.push(input.placeholder);
  }

  // Check name and id attributes
  if (input.name) parts.push(input.name);
  if (input.id) parts.push(input.id);

  // Check associated label
  if (input.id) {
    const label = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
    if (label?.textContent) {
      parts.push(label.textContent);
    }
  }

  // Check aria-label
  const ariaLabel = input.getAttribute('aria-label');
  if (ariaLabel) parts.push(ariaLabel);

  // Check parent label
  const parentLabel = input.closest('label');
  if (parentLabel?.textContent) {
    parts.push(parentLabel.textContent);
  }

  return parts.join(' ').toLowerCase();
}

/**
 * Find the matching profile key for a form field
 */
function matchField(identifiers: string): ProfileFieldKey | null {
  for (const mapping of FIELD_MAPPINGS) {
    for (const keyword of mapping.keywords) {
      if (identifiers.includes(keyword)) {
        return mapping.profileKey;
      }
    }
  }
  return null;
}

/**
 * Set a value on a form field and trigger change events so frameworks pick it up
 */
function setFieldValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void {
  // Use native setter to bypass React/Angular controlled input guards
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  )?.set;
  const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value'
  )?.set;

  if (element instanceof HTMLInputElement && nativeInputValueSetter) {
    nativeInputValueSetter.call(element, value);
  } else if (element instanceof HTMLTextAreaElement && nativeTextareaValueSetter) {
    nativeTextareaValueSetter.call(element, value);
  } else {
    element.value = value;
  }

  // Dispatch events so React/Angular/Vue detect the change
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new Event('blur', { bubbles: true }));
}

/**
 * Detect all fillable fields on the page and fill them with profile data
 */
export function detectAndFill(profile: UserProfile): number {
  const inputs = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    'input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input[type="number"], textarea, select'
  );

  let filledCount = 0;

  inputs.forEach((input) => {
    // Skip hidden or already-filled fields
    if (input.offsetParent === null) return;
    if (input.value && input.value.trim() !== '') return;

    const identifiers = getFieldIdentifiers(input);
    const profileKey = matchField(identifiers);

    if (profileKey && profile[profileKey]) {
      setFieldValue(input, profile[profileKey] as string);
      filledCount++;
    }
  });

  return filledCount;
}
