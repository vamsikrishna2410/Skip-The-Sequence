// Form detection and auto-fill engine
// Uses heuristic matching on labels, placeholders, names, and IDs

import { UserProfile } from '../shared/types';

interface FieldMapping {
  keywords: string[];
  profileKey: keyof UserProfile;
}

// Map of form field keywords to profile fields
const FIELD_MAPPINGS: FieldMapping[] = [
  { keywords: ['first name', 'firstname', 'first_name', 'fname', 'given name'], profileKey: 'firstName' },
  { keywords: ['last name', 'lastname', 'last_name', 'lname', 'surname', 'family name'], profileKey: 'lastName' },
  { keywords: ['email', 'e-mail', 'email address'], profileKey: 'email' },
  { keywords: ['phone', 'telephone', 'mobile', 'phone number', 'tel'], profileKey: 'phone' },
  { keywords: ['city', 'location'], profileKey: 'city' },
  { keywords: ['state', 'province'], profileKey: 'state' },
  { keywords: ['zip', 'postal', 'zip code', 'postal code'], profileKey: 'zipCode' },
  { keywords: ['linkedin', 'linkedin url', 'linkedin profile'], profileKey: 'linkedinUrl' },
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
function matchField(identifiers: string): keyof UserProfile | null {
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
    'input[type="text"], input[type="email"], input[type="tel"], input[type="url"], textarea'
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
