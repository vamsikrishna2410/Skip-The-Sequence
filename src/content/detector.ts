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
  { keywords: ['city'], profileKey: 'city' },
  { keywords: ['state', 'province'], profileKey: 'state' },
  { keywords: ['zip', 'postal', 'zip code', 'postal code'], profileKey: 'zipCode' },
  { keywords: ['address line', 'street address', 'address line 1', 'street', 'address1', 'addressline1', 'address_line'], profileKey: 'address' },
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

  if (element instanceof HTMLSelectElement) {
    setSelectValue(element, value);
  } else if (element instanceof HTMLInputElement && nativeInputValueSetter) {
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
 * Smart select matching — tries exact value, then case-insensitive text match,
 * then partial/contains match (e.g. "Texas" matches "TX - Texas")
 */
function setSelectValue(select: HTMLSelectElement, value: string): void {
  const lower = value.toLowerCase().trim();
  const options = Array.from(select.options);

  // 1. Exact value match
  const exactValue = options.find(o => o.value.toLowerCase() === lower);
  if (exactValue) { select.value = exactValue.value; return; }

  // 2. Exact text match
  const exactText = options.find(o => o.textContent?.trim().toLowerCase() === lower);
  if (exactText) { select.value = exactText.value; return; }

  // 3. Text contains the value or value contains the text
  const partial = options.find(o => {
    const text = o.textContent?.trim().toLowerCase() || '';
    return (text.includes(lower) || lower.includes(text)) && text !== '' && o.value !== '';
  });
  if (partial) { select.value = partial.value; return; }

  // 4. Fallback: try US state abbreviation ↔ full name
  const stateMatch = matchStateOption(options, lower);
  if (stateMatch) { select.value = stateMatch.value; return; }

  // Last resort: direct assignment
  select.value = value;
}

const US_STATES: Record<string, string> = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR', 'california': 'CA',
  'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE', 'florida': 'FL', 'georgia': 'GA',
  'hawaii': 'HI', 'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA',
  'kansas': 'KS', 'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS', 'missouri': 'MO',
  'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH',
  'oklahoma': 'OK', 'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT', 'vermont': 'VT',
  'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY',
  'district of columbia': 'DC',
};

// Reverse lookup: abbreviation → full name
const ABBR_TO_STATE: Record<string, string> = {};
for (const [name, abbr] of Object.entries(US_STATES)) {
  ABBR_TO_STATE[abbr.toLowerCase()] = name;
}

function matchStateOption(options: HTMLOptionElement[], input: string): HTMLOptionElement | undefined {
  // Convert input to both forms
  const abbr = US_STATES[input] || input.toUpperCase();
  const full = ABBR_TO_STATE[input] || input;

  return options.find(o => {
    const val = o.value.toLowerCase().trim();
    const text = o.textContent?.trim().toLowerCase() || '';
    return val === abbr.toLowerCase() || val === full.toLowerCase()
      || text === abbr.toLowerCase() || text === full.toLowerCase();
  });
}

/**
 * Brief highlight to show which field was just filled
 */
function flashHighlight(element: HTMLElement): void {
  const prev = element.style.outline;
  const prevTransition = element.style.transition;
  element.style.transition = 'outline 0.2s';
  element.style.outline = '2px solid #B8860B';
  setTimeout(() => {
    element.style.outline = prev;
    element.style.transition = prevTransition;
  }, 600);
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Detect all fillable fields on the page and fill them sequentially
 * with scroll-into-view and a brief highlight per field.
 */
export async function detectAndFill(profile: UserProfile): Promise<number> {
  const inputs = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    'input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input[type="number"], textarea, select'
  );

  // Collect matched fields first
  const matched: { el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement; value: string }[] = [];

  inputs.forEach((input) => {
    if (input.offsetParent === null) return;

    // Skip already-filled fields, but be smart about <select> placeholders
    if (input instanceof HTMLSelectElement) {
      const sel = input;
      const idx = sel.selectedIndex;
      const selectedText = sel.options[idx]?.textContent?.trim().toLowerCase() || '';
      const placeholderTexts = ['select', 'select one', 'choose', 'please select', '--', ''];
      const isPlaceholder = idx <= 0 || placeholderTexts.some(p => selectedText === p || selectedText.startsWith('select'));
      if (!isPlaceholder) return; // already has a real selection
    } else {
      if (input.value && input.value.trim() !== '') return;
    }

    const identifiers = getFieldIdentifiers(input);
    const profileKey = matchField(identifiers);

    if (profileKey && profile[profileKey]) {
      matched.push({ el: input, value: profile[profileKey] as string });
    }
  });

  // Fill sequentially with scroll + highlight
  for (const { el, value } of matched) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await delay(120);
    el.focus();
    setFieldValue(el, value);
    flashHighlight(el);
    await delay(100);
  }

  return matched.length;
}
