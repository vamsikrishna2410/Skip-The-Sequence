// Form detection and auto-fill engine
// Uses heuristic matching on labels, placeholders, names, and IDs.

import { UserProfile, ProfileFieldKey, WorkExperience } from '../shared/types';
import { getResumeFile } from '../shared/storage';

interface FieldMapping {
  keywords: string[];
  profileKey: ProfileFieldKey | 'resume';
}

type NativeFillable = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
type FillableElement = NativeFillable | HTMLElement;
interface FallbackFieldValue {
  keywords: string[];
  value: string;
  preferStateMatching?: boolean;
}

const CONTROL_SELECTOR = [
  'input[type="text"]',
  'input:not([type])',
  'input[type=""]',
  'input[type="date"]',
  'input[type="month"]',
  'input[type="checkbox"]',
  'input[type="search"]',
  'input[type="email"]',
  'input[type="tel"]',
  'input[type="url"]',
  'input[type="number"]',
  'textarea',
  'select',
  '[role="textbox"]',
  '[contenteditable="true"]',
  '[role="combobox"]',
  'button[aria-haspopup="listbox"]',
  '[aria-haspopup="listbox"][tabindex]',
  '[role="button"][aria-expanded]',
  '[data-reach-combobox-button]',
  '[data-headlessui-state]',
].join(', ');

const FALLBACK_FIELD_VALUES: FallbackFieldValue[] = [
  { keywords: ['phone device type', 'device type', 'type of phone', 'phone type'], value: 'Mobile' },
];

// Map of form field keywords to profile fields.
const FIELD_MAPPINGS: FieldMapping[] = [
  // Personal
  { keywords: ['first name', 'firstname', 'first_name', 'fname', 'given name'], profileKey: 'firstName' },
  { keywords: ['last name', 'lastname', 'last_name', 'lname', 'surname', 'family name'], profileKey: 'lastName' },
  { keywords: ['email', 'e-mail', 'email address'], profileKey: 'email' },
  { keywords: ['country code', 'phone code', 'dial code', 'calling code', 'phone prefix', 'phone country code', 'dialing code'], profileKey: 'phoneCountryCode' },
  { keywords: ['phone number', 'phone', 'telephone', 'mobile', 'tel'], profileKey: 'phone' },
  { keywords: ['city'], profileKey: 'city' },
  { keywords: ['state', 'province', 'state/province', 'state province'], profileKey: 'state' },
  { keywords: ['zip', 'postal', 'zip code', 'postal code', 'zip/postal code', 'zip postal code'], profileKey: 'zipCode' },
  { keywords: ['country/region of residence', 'country of residence', 'country/region', 'country region', 'country'], profileKey: 'country' },
  { keywords: ['address line 2', 'address 2', 'address2', 'addressline2', 'address_line_2', 'address_line2', 'apt', 'suite', 'apartment'], profileKey: 'address2' },
  { keywords: ['address line 1', 'address line', 'street address', 'address1', 'addressline1', 'address_line', 'address_line_1', 'address'], profileKey: 'address' },
  { keywords: ['linkedin', 'linkedin url', 'linkedin profile'], profileKey: 'linkedinUrl' },

  // Current / most-recent work
  { keywords: ['job title', 'current title', 'position title', 'position', 'current position', 'designation'], profileKey: 'jobTitle' },
  { keywords: ['company', 'current company', 'employer', 'organization', 'company name'], profileKey: 'company' },
  { keywords: ['years of experience', 'years experience', 'total experience', 'work experience'], profileKey: 'yearsOfExperience' },

  // Work preferences
  { keywords: ['authorized to work', 'work authorization', 'legally authorized', 'eligible to work', 'right to work', 'authorization'], profileKey: 'workAuthorization' },
  { keywords: ['sponsorship', 'visa sponsorship', 'require sponsorship', 'need sponsorship', 'immigration sponsorship'], profileKey: 'sponsorshipNeeded' },
  { keywords: ['willing to relocate', 'open to relocation', 'relocate', 'relocation'], profileKey: 'willingToRelocate' },

  // Files
  { keywords: ['resume', 'cv', 'curriculum vitae', 'upload resume', 'resume/cv', 'upload cv', 'attach resume', 'attach cv', 'upload document', 'upload file'], profileKey: 'resume' },
];

const US_STATES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO',
  montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH',
  oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
  'district of columbia': 'DC',
};

const ABBR_TO_STATE: Record<string, string> = {};
for (const [name, abbr] of Object.entries(US_STATES)) {
  ABBR_TO_STATE[abbr.toLowerCase()] = name;
}

// Common country code groups to allow two-way synonym matching
const COUNTRY_SYNONYMS: string[][] = [
  ['us', 'usa', 'united states', 'united states of america'],
  ['uk', 'gb', 'great britain', 'united kingdom', 'united kingdom of great britain'],
  ['uae', 'united arab emirates'],
  ['in', 'india'],
  ['ca', 'canada'],
  ['au', 'australia'],
  ['de', 'germany'],
  ['fr', 'france'],
  ['jp', 'japan'],
  ['cn', 'china'],
  ['kr', 'korea', 'south korea', 'korea south', 'republic of korea', 'korea republic of'],
  ['br', 'brazil'],
  ['mx', 'mexico'],
  ['sg', 'singapore'],
];

// Maps phone country codes to country names/codes for matching dropdowns
// that show "United States (+1)" or "US +1" etc.
const PHONE_CODE_SYNONYMS: Record<string, string[]> = {
  '+1': ['us', 'usa', 'united states', '1'],
  '+44': ['uk', 'gb', 'united kingdom', '44'],
  '+91': ['in', 'india', '91'],
  '+61': ['au', 'australia', '61'],
  '+49': ['de', 'germany', '49'],
  '+33': ['fr', 'france', '33'],
  '+81': ['jp', 'japan', '81'],
  '+86': ['cn', 'china', '86'],
  '+82': ['kr', 'south korea', 'korea', '82'],
  '+55': ['br', 'brazil', '55'],
  '+52': ['mx', 'mexico', '52'],
  '+65': ['sg', 'singapore', '65'],
  '+971': ['ae', 'uae', 'united arab emirates', '971'],
  '+31': ['nl', 'netherlands', '31'],
  '+46': ['se', 'sweden', '46'],
  '+353': ['ie', 'ireland', '353'],
  '+64': ['nz', 'new zealand', '64'],
  '+48': ['pl', 'poland', '48'],
  '+34': ['es', 'spain', '34'],
  '+39': ['it', 'italy', '39'],
  '+41': ['ch', 'switzerland', '41'],
  '+972': ['il', 'israel', '972'],
  '+47': ['no', 'norway', '47'],
  '+45': ['dk', 'denmark', '45'],
  '+358': ['fi', 'finland', '358'],
  '+43': ['at', 'austria', '43'],
  '+32': ['be', 'belgium', '32'],
  '+63': ['ph', 'philippines', '63'],
  '+60': ['my', 'malaysia', '60'],
  '+66': ['th', 'thailand', '66'],
  '+62': ['id', 'indonesia', '62'],
  '+234': ['ng', 'nigeria', '234'],
  '+27': ['za', 'south africa', '27'],
  '+254': ['ke', 'kenya', '254'],
  '+20': ['eg', 'egypt', '20'],
};

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function isElementVisible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function getTextFromAriaLabelledBy(element: HTMLElement): string {
  const ids = (element.getAttribute('aria-labelledby') || '').trim();
  if (!ids) return '';
  const parts: string[] = [];
  for (const id of ids.split(/\s+/)) {
    const target = document.getElementById(id);
    if (target?.textContent && !target.querySelector('input, select, textarea')) {
      const txt = target.textContent.trim();
      if (txt.length < 100) parts.push(txt);
    }
  }
  return parts.join(' ');
}

function getNearbyLabelText(element: HTMLElement): string {
  const parts: string[] = [];

  const parent = element.parentElement;
  if (parent) {
    const directLabel = parent.querySelector(':scope > label');
    if (directLabel?.textContent) {
      parts.push(directLabel.textContent);
    }

    let sibling: Element | null = element.previousElementSibling;
    let hops = 0;
    while (sibling && hops < 3) {
      if (
        sibling instanceof HTMLElement &&
        ['LABEL', 'SPAN', 'DIV', 'P', 'STRONG'].includes(sibling.tagName) &&
        sibling.textContent
      ) {
        if (!sibling.querySelector('input, select, textarea')) {
          const txt = sibling.textContent.trim();
          if (txt.length > 0 && txt.length < 80) {
            parts.push(txt);
          }
        }
      }
      sibling = sibling.previousElementSibling;
      hops += 1;
    }
  }

  const fieldset = element.closest('fieldset');
  const legend = fieldset?.querySelector('legend');
  if (legend?.textContent) {
    parts.push(legend.textContent);
  }

  return parts.join(' ');
}

/**
 * Get identifying text for a form field (label, placeholder, name, id).
 */
function getFieldIdentifiers(element: FillableElement): string {
  const parts: string[] = [];
  const htmlElement = element as HTMLElement;

  // Collect direct attributes (NOT the current value — it can be stale from prior fills)
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    if (element.placeholder) parts.push(element.placeholder);
    if (element.name) parts.push(element.name);
  } else if (element instanceof HTMLSelectElement) {
    if (element.name) parts.push(element.name);
  }

  if (htmlElement.id) parts.push(htmlElement.id);

  // Explicit label[for] association — most reliable signal
  if (htmlElement.id) {
    const label = document.querySelector(`label[for="${CSS.escape(htmlElement.id)}"]`);
    if (label?.textContent) {
      parts.push(label.textContent.trim());
    }
  }

  const ariaLabel = htmlElement.getAttribute('aria-label');
  if (ariaLabel) parts.push(ariaLabel);

  const ariaLabelledByText = getTextFromAriaLabelledBy(htmlElement);
  if (ariaLabelledByText) parts.push(ariaLabelledByText);

  // Wrapped inside a <label> tag
  const parentLabel = htmlElement.closest('label');
  if (parentLabel?.textContent) {
    parts.push(parentLabel.textContent.trim());
  }

  // Only use nearby label scanning as a last resort, and only if
  // we don't already have strong signals from label[for] or aria
  if (parts.length <= 1) {
    const nearbyLabel = getNearbyLabelText(htmlElement);
    if (nearbyLabel) parts.push(nearbyLabel);
  }

  return parts.join(' ').toLowerCase();
}

/**
 * Find matching profile key for the field.
 */
function matchField(identifiers: string): ProfileFieldKey | 'resume' | null {
  // Score each mapping: longer keyword match = more specific = higher priority
  let bestKey: ProfileFieldKey | 'resume' | null = null;
  let bestLen = 0;

  // Detect fields that are clearly phone-related dropdowns (country code selectors)
  const isPhoneCodeField = /country\s*code|phone\s*code|dial\s*code|calling\s*code|phone\s*prefix/i.test(identifiers);

  for (const mapping of FIELD_MAPPINGS) {
    // Don't match 'address' on email fields ("email address")
    if (
      (mapping.profileKey === 'address' || mapping.profileKey === 'address2') &&
      identifiers.includes('email')
    ) {
      continue;
    }

    // Don't match 'country' on phone country code fields — those get phoneCountryCode
    if (mapping.profileKey === 'country' && isPhoneCodeField) {
      continue;
    }

    // Don't match 'phone' on phone country code dropdowns — those get phoneCountryCode
    if (mapping.profileKey === 'phone' && isPhoneCodeField) {
      continue;
    }

    for (const keyword of mapping.keywords) {
      if (identifiers.includes(keyword) && keyword.length > bestLen) {
        bestKey = mapping.profileKey;
        bestLen = keyword.length;
      }
    }
  }

  return bestKey;
}

function matchFallbackValue(identifiers: string): FallbackFieldValue | null {
  for (const mapping of FALLBACK_FIELD_VALUES) {
    for (const keyword of mapping.keywords) {
      if (identifiers.includes(keyword)) {
        return mapping;
      }
    }
  }
  return null;
}

function resolveExperienceStartDate(exp: WorkExperience): string {
  const startDate = (exp.startDate ?? '').trim();
  if (/^\d{1,2}\/\d{4}$/.test(startDate)) {
    const [m, y] = startDate.split('/');
    return `${m.padStart(2, '0')}/${y}`;
  }
  return '';
}

function resolveExperienceEndDate(exp: WorkExperience): string {
  const endDate = (exp.endDate ?? '').trim();
  if (/^\d{1,2}\/\d{4}$/.test(endDate)) {
    const [m, y] = endDate.split('/');
    return `${m.padStart(2, '0')}/${y}`;
  }
  return '';
}

function resolveWorkExperienceValue(
  profile: UserProfile,
  identifiers: string
): { value: string; preferStateMatching: boolean } | null {
  const exp = profile.workExperiences?.[0];
  if (!exp) return null;
  const startDate = resolveExperienceStartDate(exp);
  const endDate = resolveExperienceEndDate(exp);

  const id = normalizeForMatch(identifiers);

  if (
    (id.includes('role description') || id.includes('job description') || id.includes('experience description') || id === 'description')
    && exp.description.trim()
  ) {
    return { value: exp.description.trim(), preferStateMatching: false };
  }

  if (id.includes('employment type') && exp.employmentType.trim()) {
    return { value: exp.employmentType.trim(), preferStateMatching: false };
  }

  if (id.includes('location') && exp.location.trim()) {
    return { value: exp.location.trim(), preferStateMatching: false };
  }

  if (id.includes('currently work') || id.includes('current employer') || (id.includes('present') && id.includes('work'))) {
    return { value: exp.currentlyWorking ? 'true' : 'false', preferStateMatching: false };
  }

  const startDateLike = id.includes('from') || id.includes('start');
  const endDateLike = id.includes('to') || id.includes('end');
  const dateLike = id.includes('date') || id.includes('mm yyyy') || id.includes('month') || id.includes('year');

  const isYearOnly = id.includes('year') && !id.includes('month');
  const isMonthOnly = id.includes('month') && !id.includes('year');

  if (startDateLike || (dateLike && (id.includes('from') || id.includes('start')))) {
    if (startDate) {
      const parts = startDate.split('/');
      if (isYearOnly && parts.length === 2) {
        return { value: parts[1], preferStateMatching: false };
      }
      if (isMonthOnly && parts.length === 2) {
        return { value: parts[0], preferStateMatching: false };
      }
      return { value: startDate, preferStateMatching: false };
    }
  }

  if (endDateLike || (dateLike && (id.includes('to') || id.includes('end')))) {
    if (exp.currentlyWorking) {
      return null;
    }
    if (endDate) {
      const parts = endDate.split('/');
      if (isYearOnly && parts.length === 2) {
        return { value: parts[1], preferStateMatching: false };
      }
      if (isMonthOnly && parts.length === 2) {
        return { value: parts[0], preferStateMatching: false };
      }
      return { value: endDate, preferStateMatching: false };
    }
  }

  return null;
}

function isComboboxInput(element: HTMLInputElement | HTMLTextAreaElement): boolean {
  if (element.getAttribute('role') === 'combobox') return true;
  if (element.getAttribute('aria-autocomplete')) return true;
  if (element.getAttribute('aria-controls')) return true;
  if (element.closest('[role="combobox"]')) return true;
  if (element.classList.contains('select__input')) return true;
  return false;
}

function isDropdownTriggerElement(element: HTMLElement): boolean {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    return false;
  }
  if (element.getAttribute('role') === 'combobox') return true;
  if (element.getAttribute('aria-haspopup') === 'listbox') return true;
  if (element.matches('button[aria-haspopup="listbox"]')) return true;
  if (element.matches('[role="button"][aria-expanded]')) return true;
  if (element.hasAttribute('data-reach-combobox-button')) return true;
  return false;
}

function isLikelyPlaceholderDropdown(element: HTMLElement): boolean {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    return false;
  }
  if (element.closest('[role="listbox"], [role="menu"], [role="dialog"]')) {
    return false;
  }
  if (element.querySelector('input, textarea, select')) {
    return false;
  }

  const normalizedText = normalizeForMatch(getDisplayedControlText(element));
  if (!isPlaceholderText(normalizedText)) {
    return false;
  }

  const isInteractive =
    element.tagName === 'BUTTON' ||
    element.tabIndex >= 0 ||
    element.getAttribute('role') === 'button' ||
    element.hasAttribute('aria-expanded') ||
    element.getAttribute('aria-haspopup') === 'listbox' ||
    element.onclick !== null;

  if (!isInteractive) {
    return false;
  }

  const cls = (element.className || '').toString().toLowerCase();
  return (
    cls.includes('select') ||
    cls.includes('dropdown') ||
    element.hasAttribute('aria-expanded') ||
    element.getAttribute('aria-haspopup') === 'listbox'
  );
}

function getStateCandidates(value: string): string[] {
  const normalized = normalizeForMatch(value);
  if (!normalized) return [];

  const candidates = new Set<string>();
  candidates.add(normalized);

  const asAbbr = US_STATES[normalized];
  if (asAbbr) candidates.add(normalizeForMatch(asAbbr));

  const asState = ABBR_TO_STATE[normalized];
  if (asState) candidates.add(normalizeForMatch(asState));

  for (const token of normalized.split(' ')) {
    const tokenAbbr = US_STATES[token];
    if (tokenAbbr) candidates.add(normalizeForMatch(tokenAbbr));
    const tokenState = ABBR_TO_STATE[token];
    if (tokenState) candidates.add(normalizeForMatch(tokenState));
  }

  return Array.from(candidates);
}

function matchStateOption(options: HTMLOptionElement[], input: string): HTMLOptionElement | undefined {
  const candidates = getStateCandidates(input);
  if (candidates.length === 0) return undefined;

  for (const option of options) {
    const optionValue = normalizeForMatch(option.value);
    const optionText = normalizeForMatch(option.textContent || '');
    if (candidates.includes(optionValue) || candidates.includes(optionText)) {
      return option;
    }
  }

  for (const option of options) {
    const optionValue = normalizeForMatch(option.value);
    const optionText = normalizeForMatch(option.textContent || '');
    for (const candidate of candidates) {
      if (
        optionValue.includes(candidate) ||
        optionText.includes(candidate) ||
        candidate.includes(optionValue) ||
        candidate.includes(optionText)
      ) {
        return option;
      }
    }
  }

  return undefined;
}

// Yes/No fields (work auth, sponsorship, relocation) use varied phrasing on
// different sites.  These lists let us match affirmative / negative intent.
const YES_PATTERNS: RegExp[] = [
  /\byes\b/i,
  /\bauthorized\b/i,
  /\beligible\b/i,
  /\bi am\b/i,
  /\bi do\b/i,
  /\bi will\b/i,
  /\bi can\b/i,
  /\bwilling\b/i,
  /\bopen to\b/i,
];
const NO_PATTERNS: RegExp[] = [
  /\bno\b/i,
  /\bnot authorized\b/i,
  /\bnot eligible\b/i,
  /\bi am not\b/i,
  /\bi do not\b/i,
  /\bi don'?t\b/i,
  /\bnot willing\b/i,
  /\bunwilling\b/i,
  /\bnot open\b/i,
];

/**
 * For Yes/No profile values, score how well a dropdown option expresses the
 * matching intent.  Returns 0 (no match) or a positive score.
 */
function scoreYesNoOption(optionText: string, isYes: boolean): number {
  const patterns = isYes ? YES_PATTERNS : NO_PATTERNS;
  let score = 0;
  for (const pattern of patterns) {
    if (pattern.test(optionText)) score++;
  }
  return score;
}

/** Is the profile value a simple Yes/No? */
function isYesNoValue(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === 'yes' || v === 'no';
}

function isPlaceholderText(text: string): boolean {
  const normalized = normalizeForMatch(text);
  if (!normalized) return true;
  if (normalized === 'select') return true;
  if (normalized === 'select one') return true;
  if (normalized === 'please select') return true;
  if (normalized.startsWith('select ')) return true;
  if (normalized === 'choose') return true;
  if (normalized === 'choose one') return true;
  if (normalized === 'pick one') return true;
  if (normalized === 'none') return true;
  if (normalized === '-') return true;
  if (normalized === '--') return true;
  if (normalized === 'no selection') return true;
  return false;
}

function getDisplayedControlText(element: FillableElement): string {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return element.value || element.placeholder || '';
  }
  if (element instanceof HTMLSelectElement) {
    return element.options[element.selectedIndex]?.textContent || '';
  }
  const ariaValueText = element.getAttribute('aria-valuetext');
  if (ariaValueText) return ariaValueText;
  return element.textContent || '';
}

function shouldSkipBecauseAlreadyFilled(element: FillableElement): boolean {
  if (element instanceof HTMLSelectElement) {
    const selectedText = getDisplayedControlText(element);
    return !isPlaceholderText(selectedText);
  }

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    if (element instanceof HTMLInputElement && element.type === 'checkbox') {
      return element.checked;
    }
    if (isComboboxInput(element)) {
      const text = getDisplayedControlText(element);
      return text.trim() !== '' && !isPlaceholderText(text);
    }
    return element.value.trim() !== '';
  }

  const text = getDisplayedControlText(element);
  if (text.trim() === '') return false;
  return !isPlaceholderText(text);
}

function pickClosestElement(reference: HTMLElement, candidates: HTMLElement[]): HTMLElement | null {
  if (candidates.length === 0) return null;
  const refRect = reference.getBoundingClientRect();
  let best: HTMLElement | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    if (!isElementVisible(candidate)) continue;
    if (candidate === reference) continue;

    const cRect = candidate.getBoundingClientRect();
    const vertical = Math.abs(cRect.top - refRect.bottom);
    const horizontal = Math.abs((cRect.left + cRect.right) / 2 - (refRect.left + refRect.right) / 2);
    const score = vertical + horizontal * 0.5;
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
}

function resolveControlFromLabel(label: HTMLLabelElement): FillableElement | null {
  if (label.htmlFor) {
    const byFor = document.getElementById(label.htmlFor);
    if (byFor instanceof HTMLElement) {
      return byFor;
    }
  }

  const inside = label.querySelector<HTMLElement>(CONTROL_SELECTOR);
  if (inside) return inside;

  const parent = label.parentElement;
  if (!parent) return null;

  const siblingCandidates: HTMLElement[] = [];
  let sibling: Element | null = label.nextElementSibling;
  let hops = 0;
  while (sibling && hops < 4) {
    if (sibling instanceof HTMLElement) {
      if (sibling.matches(CONTROL_SELECTOR)) siblingCandidates.push(sibling);
      sibling.querySelectorAll<HTMLElement>(CONTROL_SELECTOR).forEach((item) => siblingCandidates.push(item));
    }
    sibling = sibling.nextElementSibling;
    hops += 1;
  }
  const siblingMatch = pickClosestElement(label, siblingCandidates);
  if (siblingMatch) return siblingMatch;

  const container = parent.closest('div, section, fieldset, li, td, form') || parent;
  const containerCandidates = Array.from(container.querySelectorAll<HTMLElement>(CONTROL_SELECTOR));
  const closest = pickClosestElement(label, containerCandidates);
  if (closest) return closest;

  return null;
}

function addCandidate(
  list: FillableElement[],
  seen: Set<HTMLElement>,
  element: FillableElement | null
): void {
  if (!element) return;
  const html = element as HTMLElement;
  const isFileInput = element instanceof HTMLInputElement && element.type === 'file';
  // Exempt file inputs from visibility — sites routinely hide them
  if (!isFileInput && !isElementVisible(html)) return;
  if (seen.has(html)) return;
  seen.add(html);
  list.push(element);
}

function collectFillableCandidates(): FillableElement[] {
  const results: FillableElement[] = [];
  const seen = new Set<HTMLElement>();

  document.querySelectorAll<NativeFillable>(
    'input[type="text"], input:not([type]), input[type=""], input[type="search"], input[type="email"], input[type="tel"], input[type="url"], input[type="number"], input[type="date"], input[type="month"], input[type="checkbox"], input[type="file"], textarea, select'
  ).forEach((element) => addCandidate(results, seen, element));

  document.querySelectorAll<HTMLElement>(CONTROL_SELECTOR).forEach((element) => {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
      return;
    }
    if (element.querySelector('input, textarea, select')) {
      // Prefer filling direct form controls when present.
      return;
    }
    if (!isDropdownTriggerElement(element)) return;
    addCandidate(results, seen, element);
  });

  document.querySelectorAll<HTMLElement>(
    'button, [role="button"], div[tabindex], span[tabindex], [aria-expanded], [aria-haspopup="listbox"]'
  ).forEach((element) => {
    if (seen.has(element)) return;
    if (!isElementVisible(element)) return;
    if (!isLikelyPlaceholderDropdown(element)) return;
    addCandidate(results, seen, element);
  });

  document.querySelectorAll<HTMLLabelElement>('label').forEach((label) => {
    if (!isElementVisible(label)) return;
    const labelText = normalizeForMatch(label.textContent || '');
    if (!labelText) return;
    if (!matchField(labelText)) return;
    addCandidate(results, seen, resolveControlFromLabel(label));
  });

  return results;
}

/**
 * Smart native select matching.
 */
function setSelectValue(select: HTMLSelectElement, value: string, preferStateMatching = false): void {
  const normalizedValue = normalizeForMatch(value);
  const options = Array.from(select.options);

  const exactValue = options.find((o) => normalizeForMatch(o.value) === normalizedValue);
  if (exactValue) {
    select.value = exactValue.value;
    return;
  }

  // Try country synonyms
  for (const group of COUNTRY_SYNONYMS) {
    if (group.includes(normalizedValue)) {
      for (const synonym of group) {
        const synMatch = options.find((o) =>
          normalizeForMatch(o.value) === synonym ||
          normalizeForMatch(o.textContent || '') === synonym ||
          normalizeForMatch(o.textContent || '').startsWith(synonym)
        );
        if (synMatch) {
          select.value = synMatch.value;
          return;
        }
      }
    }
  }

  // Try phone code synonyms (e.g. "+1" matches "United States (+1)" or value="US")
  const rawValue = value.trim();
  const phoneSynonyms = PHONE_CODE_SYNONYMS[rawValue];
  if (phoneSynonyms) {
    // First try options whose text/value contains the dial code
    const codeNum = rawValue.replace('+', '');
    const codeMatch = options.find((o) => {
      const text = o.textContent || '';
      const val = o.value;
      return text.includes(rawValue) || text.includes(codeNum) ||
             val === rawValue || val === codeNum;
    });
    if (codeMatch) {
      select.value = codeMatch.value;
      return;
    }
    // Then try matching by country name
    for (const synonym of phoneSynonyms) {
      const synNorm = normalizeForMatch(synonym);
      const synMatch = options.find((o) =>
        normalizeForMatch(o.value) === synNorm ||
        normalizeForMatch(o.textContent || '').includes(synNorm)
      );
      if (synMatch) {
        select.value = synMatch.value;
        return;
      }
    }
  }

  const exactText = options.find((o) => normalizeForMatch(o.textContent || '') === normalizedValue);
  if (exactText) {
    select.value = exactText.value;
    return;
  }

  if (preferStateMatching) {
    const stateMatch = matchStateOption(options, value);
    if (stateMatch) {
      select.value = stateMatch.value;
      return;
    }
  }

  // Try startsWith matching first
  const startsWithMatch = options.find((o) => {
    const optionText = normalizeForMatch(o.textContent || '');
    return optionText.startsWith(normalizedValue) && normalizedValue.length >= 3;
  });
  if (startsWithMatch) {
    select.value = startsWithMatch.value;
    return;
  }

  // Only use partial matching when the candidate covers most of the option text
  const partial = options.find((o) => {
    const optionValue = normalizeForMatch(o.value);
    const optionText = normalizeForMatch(o.textContent || '');
    if (!optionValue && !optionText) return false;
    if (optionText.includes(normalizedValue) && normalizedValue.length >= optionText.length * 0.6) return true;
    if (optionValue.includes(normalizedValue) && normalizedValue.length >= optionValue.length * 0.6) return true;
    return false;
  });
  if (partial) {
    select.value = partial.value;
    return;
  }

  const stateMatch = matchStateOption(options, value);
  if (stateMatch) {
    select.value = stateMatch.value;
    return;
  }

  // Yes/No intent matching — for work auth, sponsorship, relocation dropdowns
  // whose options use varied phrasing ("I am authorized to work...", etc.)
  if (isYesNoValue(value)) {
    const isYes = normalizedValue === 'yes';
    let bestOption: HTMLOptionElement | undefined;
    let bestScore = 0;
    for (const option of options) {
      const text = option.textContent || '';
      if (isPlaceholderText(normalizeForMatch(text))) continue;
      const score = scoreYesNoOption(text, isYes);
      if (score > bestScore) {
        bestScore = score;
        bestOption = option;
      }
    }
    if (bestOption) {
      select.value = bestOption.value;
      return;
    }
  }

  select.value = value;
}

function getOptionText(option: Element): string {
  if (!(option instanceof HTMLElement)) return '';
  const ariaLabel = option.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel;
  return option.textContent || '';
}

function findVisibleOptions(preferredRoot?: HTMLElement): HTMLElement[] {
  const selectors = [
    '[role="option"]',
    'ul[role="listbox"] li',
    '[id*="react-select"][id*="-option-"]',
    '.select__option',
    '[data-radix-collection-item]',
    '[data-headlessui-state]',
  ];

  const roots: Array<ParentNode> = [];
  if (preferredRoot) roots.push(preferredRoot);
  roots.push(document);

  const seen = new Set<HTMLElement>();
  const results: HTMLElement[] = [];

  for (const root of roots) {
    for (const selector of selectors) {
      const options = Array.from(root.querySelectorAll<HTMLElement>(selector));
      for (const option of options) {
        if (seen.has(option)) continue;
        seen.add(option);
        if (!isElementVisible(option)) continue;
        const text = normalizeForMatch(getOptionText(option));
        if (!text) continue;
        results.push(option);
      }
    }
  }

  return results;
}

function buildCandidates(value: string, preferStateMatching: boolean): string[] {
  const candidates = new Set<string>();
  const normalized = normalizeForMatch(value);
  if (normalized) candidates.add(normalized);

  if (preferStateMatching) {
    for (const stateValue of getStateCandidates(value)) {
      const stateNormalized = normalizeForMatch(stateValue);
      if (stateNormalized) candidates.add(stateNormalized);
    }
  }

  // Add country synonyms
  if (normalized) {
    for (const group of COUNTRY_SYNONYMS) {
      if (group.includes(normalized)) {
        for (const synonym of group) {
          candidates.add(synonym);
        }
      }
    }
  }

  // Add phone code synonyms (e.g. "+1" -> "us", "united states", "1")
  const rawValue = value.trim();
  const phoneSynonyms = PHONE_CODE_SYNONYMS[rawValue];
  if (phoneSynonyms) {
    for (const synonym of phoneSynonyms) {
      candidates.add(synonym);
    }
    // Also add the bare number without "+"
    candidates.add(rawValue.replace('+', ''));
  }

  return Array.from(candidates);
}

function findMatchingOption(options: HTMLElement[], candidates: string[]): HTMLElement | null {
  if (options.length === 0 || candidates.length === 0) return null;

  // Pass 1: exact full-text match (highest confidence)
  for (const option of options) {
    const text = normalizeForMatch(getOptionText(option));
    if (!text) continue;
    if (candidates.includes(text)) return option;
  }

  // Pass 2: option text STARTS WITH the candidate (e.g. "united states" matches "united states of america")
  for (const option of options) {
    const text = normalizeForMatch(getOptionText(option));
    if (!text) continue;
    for (const candidate of candidates) {
      if (candidate.length >= 3 && text.startsWith(candidate)) return option;
    }
  }

  // Pass 3: candidate is fully contained in the option text, but only if the
  // candidate is reasonably specific (>= 5 chars) AND the option doesn't have
  // too much extra text (to avoid "United States Minor Outlying Islands" matching "United States")
  for (const option of options) {
    const text = normalizeForMatch(getOptionText(option));
    if (!text) continue;
    for (const candidate of candidates) {
      if (candidate.length >= 5 && text.includes(candidate)) {
        // Prefer options where the candidate covers most of the option text
        if (candidate.length >= text.length * 0.6) {
          return option;
        }
      }
    }
  }

  // Pass 4: Yes/No intent matching — for dropdowns with varied phrasing
  // (e.g. "I am legally authorized to work in the United States")
  const firstCandidate = candidates[0] || '';
  if (isYesNoValue(firstCandidate)) {
    const isYes = normalizeForMatch(firstCandidate) === 'yes';
    let bestOption: HTMLElement | null = null;
    let bestScore = 0;
    for (const option of options) {
      const text = getOptionText(option);
      if (isPlaceholderText(normalizeForMatch(text))) continue;
      const score = scoreYesNoOption(text, isYes);
      if (score > bestScore) {
        bestScore = score;
        bestOption = option;
      }
    }
    if (bestOption) return bestOption;
  }

  return null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function syncReactValueTracker(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, previousValue: string): void {
  const tracker = (element as unknown as { _valueTracker?: { setValue: (value: string) => void } })._valueTracker;
  if (tracker && typeof tracker.setValue === 'function') {
    tracker.setValue(previousValue);
  }
}

function dispatchTextInputEvents(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Unidentified' }));
  try {
    element.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
  } catch {
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }
  element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Unidentified' }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

function isTruthyValue(value: string): boolean {
  const normalized = normalizeForMatch(value);
  return normalized === 'true' || normalized === 'yes' || normalized === '1' || normalized === 'on';
}

function isMonthYearMaskedInput(element: HTMLInputElement): boolean {
  const hint = normalizeForMatch(
    [
      element.placeholder || '',
      element.getAttribute('aria-label') || '',
      element.getAttribute('name') || '',
      element.getAttribute('id') || '',
      getTextFromAriaLabelledBy(element),
      getNearbyLabelText(element),
    ].join(' ')
  );
  return (
    element.type === 'text' &&
    (hint.includes('mm yyyy') || hint.includes('month year') || hint.includes('from') || hint.includes('to'))
  );
}

function isDateLikeInput(element: HTMLInputElement): boolean {
  return element.type === 'month' || element.type === 'date' || isMonthYearMaskedInput(element);
}

function getClosestExperienceContainer(element: HTMLElement): HTMLElement | null {
  const containers = Array.from(element.closest('form, fieldset, section, li, div')?.querySelectorAll<HTMLElement>('fieldset, section, li, div') || []);
  containers.unshift(element.closest('fieldset, section, li, div') as HTMLElement);
  for (const container of containers) {
    if (!container) continue;
    const text = normalizeForMatch(container.textContent || '');
    if (text.includes('job title') || text.includes('company') || text.includes('currently work')) {
      return container;
    }
  }
  return element.closest('form') as HTMLElement | null;
}

function resolveExperienceDateByPosition(
  profile: UserProfile,
  element: HTMLInputElement
): string | null {
  const exp = profile.workExperiences?.[0];
  if (!exp) return null;
  const startDate = resolveExperienceStartDate(exp);
  const endDate = resolveExperienceEndDate(exp);

  const container = getClosestExperienceContainer(element);
  if (!container) return null;

  const dateInputs = Array.from(container.querySelectorAll<HTMLInputElement>('input'))
    .filter((input) => isElementVisible(input) && isDateLikeInput(input));

  const idx = dateInputs.indexOf(element);
  if (idx < 0) return null;

  if (idx === 0) {
    return startDate || null;
  }

  if (idx === 1) {
    if (exp.currentlyWorking) return '';
    return endDate || null;
  }

  return null;
}

function getMaskedDateDigits(element: HTMLInputElement, value: string): string {
  const hint = normalizeForMatch(
    [
      element.placeholder || '',
      element.getAttribute('aria-label') || '',
      element.getAttribute('name') || '',
      element.getAttribute('id') || '',
      getTextFromAriaLabelledBy(element),
      getNearbyLabelText(element),
    ].join(' ')
  );

  const trimmed = value.trim();
  let mm = '';
  let yyyy = '';

  if (/^\d{4}$/.test(trimmed)) {
    mm = '01';
    yyyy = trimmed;
  } else {
    const mmYyyy = trimmed.match(/^(\d{1,2})\/(\d{4})$/);
    if (mmYyyy) {
      mm = mmYyyy[1].padStart(2, '0');
      yyyy = mmYyyy[2];
    } else {
      return trimmed.replace(/\D/g, '');
    }
  }

  const requiresDay = hint.includes('dd') || hint.includes('day') || hint.includes('mm dd') || hint.includes('date');
  if (requiresDay) {
    return `${mm}01${yyyy}`;
  }
  return `${mm}${yyyy}`;
}

async function typeIntoMaskedInput(element: HTMLInputElement, digits: string): Promise<void> {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  const previousValue = element.value;

  element.focus();
  element.click();

  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(element, '');
  } else {
    element.value = '';
  }
  syncReactValueTracker(element, previousValue);
  element.dispatchEvent(new Event('input', { bubbles: true }));

  let current = '';
  for (const ch of digits) {
    element.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
    const before = element.value;
    current += ch;
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(element, current);
    } else {
      element.value = current;
    }
    syncReactValueTracker(element, before);
    try {
      element.dispatchEvent(new InputEvent('input', { bubbles: true, data: ch, inputType: 'insertText' }));
    } catch {
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }
    element.dispatchEvent(new KeyboardEvent('keyup', { key: ch, bubbles: true }));
    await delay(20);
  }

  if (!/^\d{1,2}\/\d{4}$/.test(element.value.trim()) && digits.length >= 6) {
    const mm = digits.slice(0, 2);
    let yyyy = digits.slice(2, 6);
    if (digits.length >= 8) {
      yyyy = digits.slice(4, 8);
    }
    const forced = `${mm}/${yyyy}`;
    const before = element.value;
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(element, forced);
    } else {
      element.value = forced;
    }
    syncReactValueTracker(element, before);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }

  element.dispatchEvent(new Event('change', { bubbles: true }));
}

function adaptValueForInputType(element: HTMLInputElement, rawValue: string): string {
  const placeholder = normalizeForMatch(element.placeholder || '');

  if (
    (element.type === 'text' || element.type === '' || element.type === 'search') &&
    placeholder.includes('mm yyyy')
  ) {
    const trimmed = rawValue.trim();
    if (/^\d{4}$/.test(trimmed)) {
      return `01/${trimmed}`;
    }
    if (/^\d{1,2}\/\d{4}$/.test(trimmed)) {
      const [month, year] = trimmed.split('/');
      return `${month.padStart(2, '0')}/${year}`;
    }
  }

  if (element.type === 'month') {
    const normalized = rawValue.trim();
    const match = normalized.match(/^(\d{1,2})\/(\d{4})$/);
    if (match) {
      return `${match[2]}-${match[1].padStart(2, '0')}`;
    }
  }
  if (element.type === 'date') {
    const normalized = rawValue.trim();
    const match = normalized.match(/^(\d{1,2})\/(\d{4})$/);
    if (match) {
      return `${match[2]}-${match[1].padStart(2, '0')}-01`;
    }
  }
  return rawValue;
}

function commitFocusOut(element: HTMLElement): void {
  try {
    element.blur();
  } catch {
    // no-op
  }
  element.dispatchEvent(new Event('blur'));
  element.dispatchEvent(new Event('focusout', { bubbles: true }));
}

function getSearchTexts(value: string, preferStateMatching: boolean): string[] {
  const texts: string[] = [value];
  const normalized = normalizeForMatch(value);

  // Add country synonyms as alternative search strings
  for (const group of COUNTRY_SYNONYMS) {
    if (group.includes(normalized)) {
      for (const synonym of group) {
        if (synonym !== normalized && synonym.length > 2) {
          texts.push(synonym);
        }
      }
      break;
    }
  }

  // Add state name/abbreviation alternatives
  if (preferStateMatching) {
    const stateAbbr = US_STATES[normalized];
    if (stateAbbr) texts.push(stateAbbr);
    const stateName = ABBR_TO_STATE[normalized];
    if (stateName) texts.push(stateName);
  }

  // Add phone code synonyms as search text (e.g. "+1" -> type "United States")
  const rawValue = value.trim();
  const phoneSynonyms = PHONE_CODE_SYNONYMS[rawValue];
  if (phoneSynonyms) {
    // Add the longest synonym first (country name) as it's best for search
    const sorted = [...phoneSynonyms].sort((a, b) => b.length - a.length);
    for (const synonym of sorted) {
      if (synonym.length > 2) texts.push(synonym);
    }
  }

  return texts;
}

function clickOption(option: HTMLElement): void {
  // Full pointer → mouse → click sequence that frameworks expect
  option.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
  option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  option.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
  option.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
  option.click();
}

/**
 * After an option is clicked in a dropdown, confirm & close it.
 * Many frameworks need Escape or blur on the *input/trigger* to commit.
 */
async function confirmDropdownSelection(trigger: HTMLElement): Promise<void> {
  await delay(60);

  // Escape key closes most dropdown implementations (React Select, Headless UI, Radix, Workday)
  trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
  trigger.dispatchEvent(new KeyboardEvent('keyup',   { key: 'Escape', code: 'Escape', bubbles: true }));
  await delay(30);

  // Fire change so frameworks register the new value
  trigger.dispatchEvent(new Event('change', { bubbles: true }));

  // Blur to finalize — some frameworks commit on focusout
  commitFocusOut(trigger);
}

async function typeAndMatch(
  element: HTMLInputElement | HTMLTextAreaElement,
  searchText: string,
  candidates: string[],
  preferStateMatching: boolean
): Promise<boolean> {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;

  const previousValue = element.value;
  if (element instanceof HTMLInputElement && nativeInputValueSetter) {
    nativeInputValueSetter.call(element, searchText);
  } else if (element instanceof HTMLTextAreaElement && nativeTextareaValueSetter) {
    nativeTextareaValueSetter.call(element, searchText);
  } else {
    element.value = searchText;
  }
  syncReactValueTracker(element, previousValue);
  dispatchTextInputEvents(element, searchText);

  // Wait for dropdown options to populate — some sites are slow (Workday, iCIMS)
  await delay(250);

  const listId = element.getAttribute('aria-controls');
  const listRoot = listId ? document.getElementById(listId) || undefined : undefined;
  let options = findVisibleOptions(listRoot);
  let match = findMatchingOption(options, candidates);

  // Retry once if no match found (some sites need more time)
  if (!match) {
    await delay(200);
    options = findVisibleOptions(listRoot);
    match = findMatchingOption(options, candidates);
  }

  if (match) {
    clickOption(match);
    await confirmDropdownSelection(element);
    return true;
  }
  return false;
}

async function fillComboboxInput(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
  preferStateMatching: boolean
): Promise<boolean> {
  element.focus();
  element.click();

  const candidates = buildCandidates(value, preferStateMatching);
  const searchTexts = getSearchTexts(value, preferStateMatching);

  // Try each search text variant (e.g. "US" then "United States" then "United States of America")
  for (const searchText of searchTexts) {
    const found = await typeAndMatch(element, searchText, candidates, preferStateMatching);
    if (found) return true;
  }

  // No option matched — press Enter as a last resort (some sites accept typed text)
  element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  element.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
  return false;
}

async function fillDropdownTrigger(
  element: HTMLElement,
  value: string,
  preferStateMatching: boolean
): Promise<boolean> {
  element.focus();
  element.click();
  await delay(250);

  const listId = element.getAttribute('aria-controls');
  const listRoot = listId ? document.getElementById(listId) || undefined : undefined;
  const candidates = buildCandidates(value, preferStateMatching);
  let options = findVisibleOptions(listRoot);
  let match = findMatchingOption(options, candidates);

  // If no immediate match, try typing into a nested search input
  if (!match) {
    const nestedInput = element.querySelector<HTMLInputElement>('input[type="text"], input[type="search"]');
    if (nestedInput) {
      const selected = await fillComboboxInput(nestedInput, value, preferStateMatching);
      if (selected) return true;
      options = findVisibleOptions(listRoot);
      match = findMatchingOption(options, candidates);
    }
  }

  // Retry after extra wait — some dropdowns load asynchronously
  if (!match) {
    await delay(200);
    options = findVisibleOptions(listRoot);
    match = findMatchingOption(options, candidates);
  }

  if (match) {
    clickOption(match);
    await confirmDropdownSelection(element);
    return true;
  }

  element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  return false;
}

/**
 * Set a value on a form field and trigger events so frameworks pick it up.
 */
async function setFieldValue(element: FillableElement, value: string, preferStateMatching: boolean): Promise<void> {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;

  if (element instanceof HTMLSelectElement) {
    element.focus();
    const previousValue = element.value;
    setSelectValue(element, value, preferStateMatching);
    syncReactValueTracker(element, previousValue);
    // Full event sequence that React and other frameworks listen to
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    commitFocusOut(element);
    return;
  }

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    if (element instanceof HTMLInputElement && element.type === 'checkbox') {
      const shouldCheck = isTruthyValue(value);
      if (element.checked !== shouldCheck) {
        element.click();
      }
      if (element.checked !== shouldCheck) {
        element.checked = shouldCheck;
      }
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      commitFocusOut(element);
      return;
    }

    if (element instanceof HTMLInputElement && isMonthYearMaskedInput(element)) {
      const digits = getMaskedDateDigits(element, value);
      if (digits.length >= 6) {
        await typeIntoMaskedInput(element, digits);
        commitFocusOut(element);
        return;
      }
    }

    if (isComboboxInput(element)) {
      const selected = await fillComboboxInput(element, value, preferStateMatching);
      if (!selected) {
        const previousValue = element.value;
        const adaptedValue = element instanceof HTMLInputElement ? adaptValueForInputType(element, value) : value;
        if (element instanceof HTMLInputElement && nativeInputValueSetter) {
          nativeInputValueSetter.call(element, adaptedValue);
        } else if (element instanceof HTMLTextAreaElement && nativeTextareaValueSetter) {
          nativeTextareaValueSetter.call(element, adaptedValue);
        } else {
          element.value = adaptedValue;
        }
        syncReactValueTracker(element, previousValue);
        dispatchTextInputEvents(element, adaptedValue);
      }
    } else if (element instanceof HTMLInputElement && nativeInputValueSetter) {
      const previousValue = element.value;
      const adaptedValue = adaptValueForInputType(element, value);
      nativeInputValueSetter.call(element, adaptedValue);
      syncReactValueTracker(element, previousValue);
      dispatchTextInputEvents(element, adaptedValue);
    } else if (element instanceof HTMLTextAreaElement && nativeTextareaValueSetter) {
      const previousValue = element.value;
      nativeTextareaValueSetter.call(element, value);
      syncReactValueTracker(element, previousValue);
      dispatchTextInputEvents(element, value);
    } else {
      const previousValue = element.value;
      element.value = value;
      syncReactValueTracker(element, previousValue);
      dispatchTextInputEvents(element, value);
    }
    commitFocusOut(element);
    return;
  }

  if (isDropdownTriggerElement(element)) {
    const selected = await fillDropdownTrigger(element, value, preferStateMatching);
    if (!selected) {
      // fillDropdownTrigger already confirms on success; only commit manually on failure
      element.dispatchEvent(new Event('change', { bubbles: true }));
      commitFocusOut(element);
    }
  }
}

/**
 * Brief highlight to show which field was just filled.
 */
function flashHighlight(element: HTMLElement): void {
  const prevOutline = element.style.outline;
  const prevTransition = element.style.transition;
  element.style.transition = 'outline 0.2s';
  element.style.outline = '2px solid #B8860B';
  window.setTimeout(() => {
    element.style.outline = prevOutline;
    element.style.transition = prevTransition;
  }, 600);
}

/**
 * Inject a resume file into an <input type="file"> and trigger the site's
 * upload handler.  Uses multiple strategies since sites vary widely.
 */
async function injectResumeFile(input: HTMLInputElement, file: File): Promise<boolean> {
  try {
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;

    // Full event sequence — mimic what a real file-picker does
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await delay(80);

    // If that didn't take, try dropping on the nearest visible upload zone
    if (!didFileRegister(input)) {
      const dropZone = findNearestDropZone(input);
      if (dropZone) {
        await simulateFileDrop(dropZone, file);
      }
    }
    return true;
  } catch (err) {
    console.warn('[STS] Failed to inject resume file via input:', err);
    // Last resort: try drop zone even if the DataTransfer approach threw
    const dropZone = findNearestDropZone(input);
    if (dropZone) {
      try {
        await simulateFileDrop(dropZone, file);
        return true;
      } catch {
        // fall through
      }
    }
    return false;
  }
}

/** Check if the file input actually has a file set after injection */
function didFileRegister(input: HTMLInputElement): boolean {
  return !!(input.files && input.files.length > 0);
}

/**
 * Find the closest visible upload/drop zone near a file input.
 * Sites wrap file inputs in styled containers that listen for drop events.
 */
function findNearestDropZone(fileInput: HTMLElement): HTMLElement | null {
  // Walk up from the file input looking for a visible drop-zone container
  const candidates: HTMLElement[] = [];
  let el: HTMLElement | null = fileInput.parentElement;
  let depth = 0;
  while (el && depth < 6) {
    if (isElementVisible(el)) {
      const cls = (el.className || '').toString().toLowerCase();
      const text = (el.textContent || '').toLowerCase();
      const hasDropHint =
        cls.includes('upload') || cls.includes('drop') || cls.includes('file') ||
        cls.includes('attach') || cls.includes('resume') || cls.includes('dz-') ||
        el.hasAttribute('data-dropzone') ||
        (text.includes('drag') && text.includes('drop')) ||
        (text.includes('upload') && text.length < 200) ||
        (text.includes('attach') && text.includes('resume'));
      if (hasDropHint) {
        candidates.push(el);
      }
    }
    el = el.parentElement;
    depth++;
  }

  // Also search siblings and nearby elements for standalone drop zones
  if (candidates.length === 0) {
    document.querySelectorAll<HTMLElement>(
      '[class*="upload"], [class*="drop-zone"], [class*="dropzone"], [class*="file-upload"], [class*="resume"], [data-dropzone]'
    ).forEach((zone) => {
      if (isElementVisible(zone)) candidates.push(zone);
    });
  }

  return candidates[0] || null;
}

/**
 * Simulate a file drop on an element — triggers the full drag-and-drop sequence.
 */
async function simulateFileDrop(target: HTMLElement, file: File): Promise<void> {
  const dt = new DataTransfer();
  dt.items.add(file);

  const common = { bubbles: true, cancelable: true, dataTransfer: dt };

  target.dispatchEvent(new DragEvent('dragenter', common));
  target.dispatchEvent(new DragEvent('dragover', common));
  await delay(50);
  target.dispatchEvent(new DragEvent('drop', common));
  target.dispatchEvent(new DragEvent('dragleave', common));
  await delay(100);

  // Some frameworks also check for an input change event after drop
  const innerInput = target.querySelector<HTMLInputElement>('input[type="file"]');
  if (innerInput) {
    try {
      const innerDt = new DataTransfer();
      innerDt.items.add(file);
      innerInput.files = innerDt.files;
      innerInput.dispatchEvent(new Event('change', { bubbles: true }));
    } catch {
      // inner input might be locked
    }
  }
}

/**
 * Detect all fillable fields on the page and fill them sequentially.
 */
export async function detectAndFill(profile: UserProfile): Promise<number> {
  const inputs = collectFillableCandidates();
  const matched: Array<{ el: FillableElement; value: string; preferStateMatching: boolean; isResume?: boolean }> = [];
  let hasFilledPhone = false;
  let hasFilledResume = false;
  let resumeFile: File | null | undefined = undefined; // Lazy load if needed

  for (const input of inputs) {
    const html = input as HTMLElement;
    const isFileInput = input instanceof HTMLInputElement && input.type === 'file';

    // Exempt file inputs from visibility checks — most sites hide them with
    // display:none and trigger them via a styled button / drag-drop area.
    if (!isFileInput && !isElementVisible(html)) continue;
    if (html.hasAttribute('disabled')) continue;

    if (input instanceof HTMLInputElement && input.readOnly && !isComboboxInput(input)) {
      continue;
    }

    // Don't skip file inputs that already have files — we only fill empty ones
    if (isFileInput) {
      if ((input as HTMLInputElement).files && (input as HTMLInputElement).files!.length > 0) continue;
    } else if (shouldSkipBecauseAlreadyFilled(input)) {
      continue;
    }

    const identifiers = getFieldIdentifiers(input);
    const normalizedIdentifiers = normalizeForMatch(identifiers);
    let value = '';
    let preferStateMatching = false;

    if (input instanceof HTMLInputElement && isDateLikeInput(input)) {
      const positionalDate = resolveExperienceDateByPosition(profile, input);
      if (positionalDate) {
        value = positionalDate;
      }
    }

    if (!value) {
      const expValue = resolveWorkExperienceValue(profile, identifiers);
      if (expValue) {
        value = expValue.value;
        preferStateMatching = expValue.preferStateMatching;
      }
    }

    if (!value) {
      const profileKey = matchField(identifiers);

      if (profileKey === 'resume') {
        if (input instanceof HTMLInputElement && input.type === 'file' && !hasFilledResume && profile.hasResume) {
          hasFilledResume = true;
          matched.push({ el: input, value: 'resume', preferStateMatching: false, isResume: true });
        }
        continue; // Skip further value matching since this is a file upload
      }
      
      if (profileKey === 'phone') {
        // For select/combobox/dropdown elements near phone fields, fill with country code
        const isSelectOrCombobox = input instanceof HTMLSelectElement ||
           isDropdownTriggerElement(input);

        if (isSelectOrCombobox) {
          // This is a country code selector — fill with phoneCountryCode instead
          const code = (profile.phoneCountryCode || '').trim();
          if (code) {
            value = code;
          }
          // Don't count this as having filled the phone number
          matched.push({ el: input, value, preferStateMatching: false });
          continue;
        }
        if (hasFilledPhone) {
          continue; // Skip duplicate phone fields
        }
      }
      if (profileKey) {
        if (profileKey === 'phone') hasFilledPhone = true;
        value = String(profile[profileKey as ProfileFieldKey] || '').trim();
        preferStateMatching = profileKey === 'state';
      }
    }

    if (!value) {
      const fallback = matchFallbackValue(identifiers);
      if (fallback) {
        value = fallback.value;
        preferStateMatching = Boolean(fallback.preferStateMatching);
      }
    }

    // Fallback for file inputs: if this is a file input and we have a resume,
    // fill it even if keywords didn't match (most file inputs on job sites are for resumes)
    if (!value && !hasFilledResume && profile.hasResume &&
        input instanceof HTMLInputElement && input.type === 'file') {
      hasFilledResume = true;
      matched.push({ el: input, value: 'resume', preferStateMatching: false, isResume: true });
      continue;
    }

    if (!value) continue;

    matched.push({ el: input, value, preferStateMatching });
  }

  // If no file input was found but we have a resume, scan for standalone drop zones
  if (!hasFilledResume && profile.hasResume) {
    const dropZone = findStandaloneDropZone();
    if (dropZone) {
      hasFilledResume = true;
      matched.push({ el: dropZone as unknown as FillableElement, value: 'resume', preferStateMatching: false, isResume: true });
    }
  }

  for (const { el, value, preferStateMatching, isResume } of matched) {
    const html = el as HTMLElement;
    html.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await delay(120);
    html.focus();

    if (isResume) {
      if (resumeFile === undefined) {
        resumeFile = await getResumeFile() || null;
      }
      if (resumeFile) {
        if (el instanceof HTMLInputElement && el.type === 'file') {
          const uploaded = await injectResumeFile(el, resumeFile);
          if (uploaded) flashHighlight(html);
        } else {
          // Drop zone element (not a file input)
          await simulateFileDrop(html, resumeFile);
          flashHighlight(html);
        }
      }
    } else {
      await setFieldValue(el, value, preferStateMatching);
      flashHighlight(html);
    }

    await delay(140);
  }

  return matched.length;
}

/**
 * Find a visible upload/drop zone on the page that isn't associated with any file input.
 * These are standalone drag-drop areas some sites use instead of file inputs.
 */
function findStandaloneDropZone(): HTMLElement | null {
  const selectors = [
    '[class*="dropzone"]',
    '[class*="drop-zone"]',
    '[class*="file-upload"]',
    '[class*="resume-upload"]',
    '[class*="upload-area"]',
    '[class*="attach-resume"]',
    '[data-dropzone]',
    '[class*="dz-default"]',
  ];

  for (const selector of selectors) {
    const zones = Array.from(document.querySelectorAll<HTMLElement>(selector));
    for (const zone of zones) {
      if (!isElementVisible(zone)) continue;
      const text = (zone.textContent || '').toLowerCase();
      if (text.includes('resume') || text.includes('cv') || text.includes('upload') ||
          text.includes('attach') || text.includes('drag') || text.includes('drop')) {
        return zone;
      }
    }
  }
  return null;
}
