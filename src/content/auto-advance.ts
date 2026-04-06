// Auto-advance: fill current page, click Next, repeat until review page

import { getProfile } from '../storage/profile';
import { detectAndFill, isElementVisible, delay, FORM_CONTROL_SELECTOR } from './detector';
import type { UserProfile } from '../shared/types';

const MAX_PAGES = 15;
const PAGE_READY_TIMEOUT = 12000;
const STABILITY_DELAY = 800;

// --- Next-button detection ---

const NEXT_PATTERNS = [
  /^next$/i,
  /^continue$/i,
  /^save\s*(?:&|and)\s*continue$/i,
  /^save\s*(?:&|and)\s*next$/i,
  /^next\s*step$/i,
  /^continue\s*to\s*next/i,
  /^proceed$/i,
  /^go\s*to\s*next/i,
  /^save\s*(?:&|and)\s*proceed$/i,
  /^next\s*page$/i,
  /^continue\s*application$/i,
  /^move\s*forward$/i,
];

const SUBMIT_PATTERNS = [
  /submit/i,
  /send\s*application/i,
  /\bapply\b/i,
  /finish/i,
  /complete\s*application/i,
  /confirm\s*(?:&|and)\s*submit/i,
  /i\s*agree/i,
  /place\s*order/i,
];

// Site-specific next-button selectors (highest priority)
const SITE_NEXT_SELECTORS: Record<string, string[]> = {
  'workday': [
    '[data-automation-id="bottom-navigation-next-button"]',
    'button[data-automation-id="nextButton"]',
  ],
  'greenhouse': [
    'button[type="submit"]', // Greenhouse uses submit buttons for "next"
  ],
  'lever': [
    'button.postings-btn-next',
    'button.postings-btn[type="submit"]',
  ],
  'icims': [
    'button.iCIMS_Button_Next',
    'input#next',
  ],
  'taleo': [
    'a#next',
    'input#next',
  ],
  'smartrecruiters': [
    'button[data-test="footer-next"]',
  ],
};

function getSiteKey(): string | null {
  const host = window.location.hostname;
  if (host.includes('myworkdayjobs') || host.includes('workday.com') || host.includes('myworkdaysite')) return 'workday';
  if (host.includes('greenhouse')) return 'greenhouse';
  if (host.includes('lever.co')) return 'lever';
  if (host.includes('icims.com')) return 'icims';
  if (host.includes('taleo.net')) return 'taleo';
  if (host.includes('smartrecruiters')) return 'smartrecruiters';
  return null;
}

function getButtonText(el: HTMLElement): string {
  return (
    el.textContent?.trim() ||
    el.getAttribute('aria-label') ||
    el.getAttribute('value') ||
    el.getAttribute('title') ||
    ''
  ).trim();
}

function isInFormArea(el: HTMLElement): boolean {
  // Exclude buttons in nav/header/footer areas
  const excluded = el.closest('nav, header, [role="navigation"], [role="banner"], .site-header, .site-footer, .navbar');
  return !excluded;
}

function isSubmitButton(el: HTMLElement): boolean {
  const text = getButtonText(el).toLowerCase();
  return SUBMIT_PATTERNS.some((p) => p.test(text));
}

function findNextButton(): HTMLElement | null {
  // Try site-specific selectors first
  const siteKey = getSiteKey();
  if (siteKey && SITE_NEXT_SELECTORS[siteKey]) {
    for (const selector of SITE_NEXT_SELECTORS[siteKey]) {
      const el = document.querySelector<HTMLElement>(selector);
      if (el && isElementVisible(el) && !el.hasAttribute('disabled') && !isSubmitButton(el)) {
        return el;
      }
    }
  }

  // Generic heuristic: score all button-like elements
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(
    'button, input[type="submit"], input[type="button"], a[role="button"], [role="button"]'
  ));

  let bestBtn: HTMLElement | null = null;
  let bestScore = 0;

  for (const el of candidates) {
    if (!isElementVisible(el) || el.hasAttribute('disabled') || !isInFormArea(el)) continue;

    const text = getButtonText(el);
    if (!text) continue;

    // Disqualify submit/apply buttons
    if (isSubmitButton(el)) continue;

    let score = 0;
    for (const pattern of NEXT_PATTERNS) {
      if (pattern.test(text)) {
        score = 10;
        break;
      }
    }

    // Partial matches
    if (score === 0) {
      const lower = text.toLowerCase();
      if (lower.includes('next')) score = 5;
      else if (lower.includes('continue')) score = 5;
      else if (lower.includes('proceed')) score = 3;
      else if (lower.includes('save') && lower.includes('continue')) score = 7;
    }

    // Boost for primary/prominent styling
    const classes = el.className.toLowerCase();
    if (classes.includes('primary') || classes.includes('btn-primary') || classes.includes('cta')) {
      score += 2;
    }

    if (score > bestScore) {
      bestScore = score;
      bestBtn = el;
    }
  }

  return bestBtn;
}

// --- Review page detection ---

function isReviewPage(): boolean {
  const url = window.location.href.toLowerCase();
  if (/\/(review|summary|confirm|preview)/.test(url)) return true;

  // Check headings
  const headings = Array.from(document.querySelectorAll<HTMLElement>('h1, h2, h3, [role="heading"]'));
  for (const h of headings) {
    const text = (h.textContent || '').toLowerCase();
    if (/review\s*(your|the|&|and)?\s*(application|submission|details)/i.test(text)) return true;
    if (/application\s*summary/i.test(text)) return true;
    if (/review\s*(?:&|and)\s*submit/i.test(text)) return true;
  }

  // Workday-specific
  if (document.querySelector('[data-automation-id="reviewPage"]')) return true;

  // If there's a submit button but NO next button, likely the final page
  const allBtns = Array.from(document.querySelectorAll<HTMLElement>('button, input[type="submit"]'));
  const hasSubmit = allBtns.some((b) => isSubmitButton(b) && isElementVisible(b));
  const hasNext = findNextButton() !== null;
  if (hasSubmit && !hasNext) return true;

  // Progress bar at max
  const progressBars = Array.from(document.querySelectorAll<HTMLElement>('[role="progressbar"]'));
  for (const bar of progressBars) {
    const now = parseInt(bar.getAttribute('aria-valuenow') || '0');
    const max = parseInt(bar.getAttribute('aria-valuemax') || '0');
    if (max > 0 && now >= max) return true;
  }

  return false;
}

// --- Page-ready detection ---

function captureFingerprint(): string {
  const fields = document.querySelectorAll(FORM_CONTROL_SELECTOR);
  const ids = Array.from(fields).map((f) => f.id || f.getAttribute('name') || '').join('|');
  return `${fields.length}:${ids.substring(0, 200)}`;
}

function waitForPageReady(previousFingerprint: string): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now();
    let settled = false;

    const check = () => {
      if (settled) return;
      if (Date.now() - start > PAGE_READY_TIMEOUT) {
        settled = true;
        resolve(false);
        return;
      }

      // Wait for document to be interactive/complete
      if (document.readyState === 'loading') {
        setTimeout(check, 200);
        return;
      }

      // Check for loading spinners
      const spinners = document.querySelectorAll('[aria-busy="true"], [class*="spinner"], [class*="loading"], [class*="loader"]');
      const hasSpinner = Array.from(spinners).some((s) => isElementVisible(s as HTMLElement));
      if (hasSpinner) {
        setTimeout(check, 300);
        return;
      }

      // Check if content has changed
      const currentFingerprint = captureFingerprint();
      if (currentFingerprint !== previousFingerprint) {
        // Content changed - wait a bit for stability
        setTimeout(() => {
          if (settled) return;
          const stableFingerprint = captureFingerprint();
          if (stableFingerprint === currentFingerprint) {
            settled = true;
            resolve(true);
          } else {
            // Still changing, keep waiting
            setTimeout(check, 300);
          }
        }, STABILITY_DELAY);
        return;
      }

      setTimeout(check, 300);
    };

    // Start checking after a brief initial delay
    setTimeout(check, 400);
  });
}

// --- Status reporting ---

export interface AutoAdvanceResult {
  status: 'review_reached' | 'no_next_button' | 'timeout' | 'max_pages_reached' | 'aborted' | 'error';
  pagesProcessed: number;
  totalFilled: number;
  message: string;
}

type StatusCallback = (page: number, filled: number, action: string) => void;

let abortRequested = false;

export function abortAutoAdvance(): void {
  abortRequested = true;
}

// --- Main loop ---

export async function runAutoAdvance(profile: UserProfile, onStatus?: StatusCallback): Promise<AutoAdvanceResult> {
  abortRequested = false;
  let pagesProcessed = 0;
  let totalFilled = 0;

  while (pagesProcessed < MAX_PAGES) {
    if (abortRequested) {
      return { status: 'aborted', pagesProcessed, totalFilled, message: `Stopped after ${pagesProcessed} page(s).` };
    }

    // Fill current page
    onStatus?.(pagesProcessed + 1, totalFilled, 'filling');
    const filledCount = await detectAndFill(profile);
    totalFilled += filledCount;
    pagesProcessed++;
    console.log(`[STS] Auto-advance: filled ${filledCount} fields on page ${pagesProcessed}`);

    // Wait briefly for any animations/transitions from filling
    await delay(500);

    // Check if this is the review page
    if (isReviewPage()) {
      console.log(`[STS] Auto-advance: review page detected on page ${pagesProcessed}`);
      return {
        status: 'review_reached',
        pagesProcessed,
        totalFilled,
        message: `Filled ${pagesProcessed} page(s), ${totalFilled} field(s). Review and submit.`,
      };
    }

    // Find next button
    const nextBtn = findNextButton();
    if (!nextBtn) {
      console.log(`[STS] Auto-advance: no next button found on page ${pagesProcessed}`);
      return {
        status: 'no_next_button',
        pagesProcessed,
        totalFilled,
        message: `Filled ${pagesProcessed} page(s), ${totalFilled} field(s). No next button found.`,
      };
    }

    // Safety: double-check this isn't a submit button
    if (isSubmitButton(nextBtn)) {
      console.log('[STS] Auto-advance: next button looks like submit, stopping');
      return {
        status: 'review_reached',
        pagesProcessed,
        totalFilled,
        message: `Filled ${pagesProcessed} page(s), ${totalFilled} field(s). Submit button reached.`,
      };
    }

    // Take fingerprint before clicking
    const fingerprint = captureFingerprint();

    // Click next
    onStatus?.(pagesProcessed, totalFilled, 'advancing');
    console.log(`[STS] Auto-advance: clicking next button: "${getButtonText(nextBtn)}"`);
    nextBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await delay(200);
    nextBtn.click();

    // Wait for next page to load
    const ready = await waitForPageReady(fingerprint);
    if (!ready) {
      // Check if the page actually changed despite timeout
      const newFingerprint = captureFingerprint();
      if (newFingerprint === fingerprint) {
        console.log('[STS] Auto-advance: page did not change after clicking next');
        return {
          status: 'timeout',
          pagesProcessed,
          totalFilled,
          message: `Filled ${pagesProcessed} page(s), ${totalFilled} field(s). Page didn't advance.`,
        };
      }
      // Page did change, continue anyway
    }

    // Extra stabilization
    await delay(STABILITY_DELAY);
  }

  return {
    status: 'max_pages_reached',
    pagesProcessed,
    totalFilled,
    message: `Filled ${MAX_PAGES} page(s), ${totalFilled} field(s). Max page limit reached.`,
  };
}

// Resume auto-advance after full page navigation
export async function resumeAutoAdvance(): Promise<AutoAdvanceResult> {
  const profile = await getProfile();
  if (!profile) {
    return { status: 'error', pagesProcessed: 0, totalFilled: 0, message: 'No profile found.' };
  }
  return runAutoAdvance(profile);
}
