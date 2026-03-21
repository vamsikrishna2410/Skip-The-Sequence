// Form detection and auto-fill engine
// Uses heuristic matching on labels, placeholders, names, and IDs.

import { UserProfile, ProfileFieldKey, WorkExperience } from '../shared/types';

interface FieldMapping {
  keywords: string[];
  profileKey: ProfileFieldKey;
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
  { keywords: ['phone', 'telephone', 'mobile', 'phone number', 'tel'], profileKey: 'phone' },
  { keywords: ['city'], profileKey: 'city' },
  { keywords: ['state', 'province', 'region', 'state/province', 'state province'], profileKey: 'state' },
  { keywords: ['zip', 'postal', 'zip code', 'postal code'], profileKey: 'zipCode' },
  { keywords: ['address line', 'street address', 'address line 1', 'street', 'address1', 'addressline1', 'address_line'], profileKey: 'address' },
  { keywords: ['linkedin', 'linkedin url', 'linkedin profile'], profileKey: 'linkedinUrl' },

  // Current / most-recent work
  { keywords: ['job title', 'current title', 'position title', 'position', 'current position', 'designation'], profileKey: 'jobTitle' },
  { keywords: ['company', 'current company', 'employer', 'organization', 'company name'], profileKey: 'company' },
  { keywords: ['years of experience', 'years experience', 'total experience', 'work experience'], profileKey: 'yearsOfExperience' },

  // Work preferences
  { keywords: ['desired title', 'desired job title', 'preferred title', 'desired role', 'preferred role'], profileKey: 'desiredJobTitle' },
  { keywords: ['desired salary', 'expected salary', 'salary expectation', 'compensation', 'salary range', 'expected compensation', 'desired pay'], profileKey: 'desiredSalary' },
  { keywords: ['authorized to work', 'work authorization', 'legally authorized', 'eligible to work', 'right to work', 'authorization'], profileKey: 'workAuthorization' },
  { keywords: ['sponsorship', 'visa sponsorship', 'require sponsorship', 'need sponsorship', 'immigration sponsorship'], profileKey: 'sponsorshipNeeded' },
  { keywords: ['willing to relocate', 'open to relocation', 'relocate', 'relocation'], profileKey: 'willingToRelocate' },
  { keywords: ['remote', 'work location preference', 'remote preference', 'on-site', 'onsite', 'hybrid', 'workplace type'], profileKey: 'remotePreference' },
  { keywords: ['earliest start date', 'available to start', 'earliest available', 'when can you start', 'availability'], profileKey: 'earliestStartDate' },
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
    if (target?.textContent) {
      parts.push(target.textContent);
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
        parts.push(sibling.textContent);
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

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    if (element.placeholder) parts.push(element.placeholder);
    if (element.name) parts.push(element.name);
    if (element.value) parts.push(element.value);
  } else if (element instanceof HTMLSelectElement) {
    if (element.name) parts.push(element.name);
    const selected = element.options[element.selectedIndex];
    if (selected?.textContent) parts.push(selected.textContent);
  }

  if (htmlElement.id) parts.push(htmlElement.id);

  if (htmlElement.id) {
    const label = document.querySelector(`label[for="${CSS.escape(htmlElement.id)}"]`);
    if (label?.textContent) {
      parts.push(label.textContent);
    }
  }

  const ariaLabel = htmlElement.getAttribute('aria-label');
  if (ariaLabel) parts.push(ariaLabel);

  const ariaLabelledByText = getTextFromAriaLabelledBy(htmlElement);
  if (ariaLabelledByText) parts.push(ariaLabelledByText);

  const parentLabel = htmlElement.closest('label');
  if (parentLabel?.textContent) {
    parts.push(parentLabel.textContent);
  }

  const nearbyLabel = getNearbyLabelText(htmlElement);
  if (nearbyLabel) parts.push(nearbyLabel);

  return parts.join(' ').toLowerCase();
}

/**
 * Find matching profile key for the field.
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

  if (startDateLike || (dateLike && (id.includes('from') || id.includes('start')))) {
    if (startDate) {
      return { value: startDate, preferStateMatching: false };
    }
  }

  if (endDateLike || (dateLike && (id.includes('to') || id.includes('end')))) {
    if (exp.currentlyWorking) {
      return null;
    }
    if (endDate) {
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
  if (!isElementVisible(html)) return;
  if (seen.has(html)) return;
  seen.add(html);
  list.push(element);
}

function collectFillableCandidates(): FillableElement[] {
  const results: FillableElement[] = [];
  const seen = new Set<HTMLElement>();

  document.querySelectorAll<NativeFillable>(
    'input[type="text"], input:not([type]), input[type=""], input[type="search"], input[type="email"], input[type="tel"], input[type="url"], input[type="number"], input[type="date"], input[type="month"], input[type="checkbox"], textarea, select'
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

  const partial = options.find((o) => {
    const optionValue = normalizeForMatch(o.value);
    const optionText = normalizeForMatch(o.textContent || '');
    if (!optionValue && !optionText) return false;
    return (
      optionValue.includes(normalizedValue) ||
      optionText.includes(normalizedValue) ||
      normalizedValue.includes(optionValue) ||
      normalizedValue.includes(optionText)
    );
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

  return Array.from(candidates);
}

function findMatchingOption(options: HTMLElement[], candidates: string[]): HTMLElement | null {
  if (options.length === 0 || candidates.length === 0) return null;

  for (const option of options) {
    const text = normalizeForMatch(getOptionText(option));
    if (!text) continue;
    if (candidates.includes(text)) return option;
  }

  for (const option of options) {
    const text = normalizeForMatch(getOptionText(option));
    if (!text) continue;
    const tokens = text.split(' ').filter(Boolean);
    if (candidates.some((candidate) => tokens.includes(candidate))) {
      return option;
    }
  }

  for (const option of options) {
    const text = normalizeForMatch(getOptionText(option));
    if (!text) continue;
    if (candidates.some((candidate) => text.includes(candidate) || candidate.includes(text))) {
      return option;
    }
  }

  return null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function syncReactValueTracker(element: HTMLInputElement | HTMLTextAreaElement, previousValue: string): void {
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

function toMonthYearDigits(value: string): string {
  const trimmed = value.trim();
  if (/^\d{4}$/.test(trimmed)) {
    return `01${trimmed}`;
  }
  const mmYyyy = trimmed.match(/^(\d{1,2})\/(\d{4})$/);
  if (mmYyyy) {
    return `${mmYyyy[1].padStart(2, '0')}${mmYyyy[2]}`;
  }
  return trimmed.replace(/\D/g, '');
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
    const yyyy = digits.slice(2, 6);
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

async function fillComboboxInput(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
  preferStateMatching: boolean
): Promise<boolean> {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;

  element.focus();
  element.click();
  const previousValue = element.value;

  if (element instanceof HTMLInputElement && nativeInputValueSetter) {
    nativeInputValueSetter.call(element, value);
  } else if (element instanceof HTMLTextAreaElement && nativeTextareaValueSetter) {
    nativeTextareaValueSetter.call(element, value);
  } else {
    element.value = value;
  }

  syncReactValueTracker(element, previousValue);
  dispatchTextInputEvents(element, value);
  await delay(150);

  const listId = element.getAttribute('aria-controls');
  const listRoot = listId ? document.getElementById(listId) || undefined : undefined;
  const options = findVisibleOptions(listRoot);
  const match = findMatchingOption(options, buildCandidates(value, preferStateMatching));
  if (match) {
    match.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    match.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    match.click();
    return true;
  }

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
  await delay(180);

  const listId = element.getAttribute('aria-controls');
  const listRoot = listId ? document.getElementById(listId) || undefined : undefined;
  let options = findVisibleOptions(listRoot);
  let match = findMatchingOption(options, buildCandidates(value, preferStateMatching));

  if (!match) {
    const nestedInput = element.querySelector<HTMLInputElement>('input[type="text"], input[type="search"]');
    if (nestedInput) {
      const selected = await fillComboboxInput(nestedInput, value, preferStateMatching);
      if (selected) return true;
      options = findVisibleOptions(listRoot);
      match = findMatchingOption(options, buildCandidates(value, preferStateMatching));
    }
  }

  if (match) {
    match.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    match.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    match.click();
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
    setSelectValue(element, value, preferStateMatching);
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
      const digits = toMonthYearDigits(value);
      if (digits.length >= 6) {
        await typeIntoMaskedInput(element, digits.slice(0, 6));
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
    await fillDropdownTrigger(element, value, preferStateMatching);
    element.dispatchEvent(new Event('change', { bubbles: true }));
    commitFocusOut(element);
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
 * Detect all fillable fields on the page and fill them sequentially.
 */
export async function detectAndFill(profile: UserProfile): Promise<number> {
  const inputs = collectFillableCandidates();
  const matched: Array<{ el: FillableElement; value: string; preferStateMatching: boolean }> = [];

  for (const input of inputs) {
    const html = input as HTMLElement;
    if (!isElementVisible(html)) continue;
    if (html.hasAttribute('disabled')) continue;

    if (input instanceof HTMLInputElement && input.readOnly && !isComboboxInput(input)) {
      continue;
    }

    if (shouldSkipBecauseAlreadyFilled(input)) {
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
      if (profileKey) {
        // Do not let generic earliest start date override experience From/To fields.
        if (
          profileKey === 'earliestStartDate' &&
          (normalizedIdentifiers.includes('from') || normalizedIdentifiers.includes('to') || normalizedIdentifiers.includes('currently work'))
        ) {
          value = '';
        } else {
          value = profile[profileKey].trim();
          preferStateMatching = profileKey === 'state';
        }
      }
    }

    if (!value) {
      const fallback = matchFallbackValue(identifiers);
      if (fallback) {
        value = fallback.value;
        preferStateMatching = Boolean(fallback.preferStateMatching);
      }
    }

    if (!value) continue;

    matched.push({ el: input, value, preferStateMatching });
  }

  for (const { el, value, preferStateMatching } of matched) {
    const html = el as HTMLElement;
    html.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await delay(120);
    html.focus();
    await setFieldValue(el, value, preferStateMatching);
    flashHighlight(html);
    await delay(140);
  }

  return matched.length;
}
