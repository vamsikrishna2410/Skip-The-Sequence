// Options page script - full profile editor

import { saveProfile, getProfileOrDefault } from '../storage/profile';
import { UserProfile, WorkExperience, Education, EMPTY_PROFILE, EMPTY_EXPERIENCE, EMPTY_EDUCATION } from '../shared/types';
import { saveResumeFile, getResumeFile, deleteResumeFile } from '../shared/storage';

// Simple string fields read/written via their element id
const FLAT_FIELD_IDS: (keyof UserProfile)[] = [
  'firstName', 'lastName', 'email', 'phoneCountryCode', 'phone', 'phoneDeviceType',
  'address', 'address2', 'city', 'county', 'state', 'zipCode', 'country',
  'linkedinUrl',
  'yearsOfExperience',
  'workAuthorization', 'citizenshipStatus', 'sponsorshipNeeded',
  'willingToRelocate', 'previouslyEmployed', 'desiredSalary', 'relatedToEmployee', 'desiredStartDate',
  'gender', 'hispanicOrLatino', 'raceEthnicity', 'veteranStatus', 'disabilityStatus',
];

// Section → field IDs for completion tracking
const SECTION_FIELDS: Record<string, string[]> = {
  personal: ['firstName', 'lastName', 'email', 'phone', 'address', 'city', 'state', 'zipCode', 'country'],
  work: ['yearsOfExperience', 'workAuthorization', 'citizenshipStatus', 'sponsorshipNeeded', 'willingToRelocate'],
  disclosures: ['gender', 'hispanicOrLatino', 'raceEthnicity', 'veteranStatus', 'disabilityStatus'],
  resume: [], // tracked separately via hasResume
  education: [], // tracked separately via educations count
  experience: [], // tracked separately via workExperiences count
};

// ── Compute Monday 2 weeks out ───────────────────────
function computeNextMonday2Weeks(): Date {
  const today = new Date();
  const dow = today.getDay(); // 0=Sun, 1=Mon, ...
  // Days since this week's Monday (Mon=0, Tue=1, ... Sun=6)
  const daysSinceMon = dow === 0 ? 6 : dow - 1;
  const thisMonday = new Date(today);
  thisMonday.setDate(today.getDate() - daysSinceMon);
  // Add exactly 14 days to get the Monday 2 weeks from this week
  const target = new Date(thisMonday);
  target.setDate(thisMonday.getDate() + 14);
  return target;
}

// ── Status banner ────────────────────────────────────
function showStatus(message: string, isError = false): void {
  const status = document.getElementById('status')!;
  status.textContent = message;
  status.style.color = isError ? '#C8102E' : '#B8860B';
  const duration = isError ? 5000 : 3000;
  setTimeout(() => { status.textContent = ''; }, duration);
}

// ── Last saved timestamp ─────────────────────────────
let lastSavedTime: number | null = null;

function updateLastSavedText(): void {
  const el = document.getElementById('lastSaved')!;
  if (!lastSavedTime) { el.textContent = ''; return; }
  const seconds = Math.floor((Date.now() - lastSavedTime) / 1000);
  if (seconds < 5) el.textContent = 'Saved just now';
  else if (seconds < 60) el.textContent = `Saved ${seconds}s ago`;
  else if (seconds < 3600) el.textContent = `Saved ${Math.floor(seconds / 60)}m ago`;
  else el.textContent = `Saved ${Math.floor(seconds / 3600)}h ago`;
}

// ── Collapsible sections ─────────────────────────────
function initCollapsibleSections(): void {
  const saved = JSON.parse(localStorage.getItem('sts_collapsed') || '{}');
  document.querySelectorAll<HTMLElement>('.section').forEach(section => {
    const key = section.dataset.section;
    if (!key) return;
    const header = section.querySelector('.section-header') as HTMLElement;
    if (saved[key]) section.classList.add('collapsed');
    header.addEventListener('click', () => {
      section.classList.toggle('collapsed');
      saveCollapsedState();
    });
  });
}

function saveCollapsedState(): void {
  const state: Record<string, boolean> = {};
  document.querySelectorAll<HTMLElement>('.section').forEach(section => {
    const key = section.dataset.section;
    if (key) state[key] = section.classList.contains('collapsed');
  });
  localStorage.setItem('sts_collapsed', JSON.stringify(state));
}

// ── Section nav ──────────────────────────────────────
function initSectionNav(): void {
  document.querySelectorAll<HTMLAnchorElement>('.section-nav a').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const href = link.getAttribute('href');
      if (!href) return;
      const target = document.querySelector(href);
      if (!target) return;
      // Expand section if collapsed
      const section = target as HTMLElement;
      if (section.classList.contains('collapsed')) {
        section.classList.remove('collapsed');
        saveCollapsedState();
      }
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Update active state
      document.querySelectorAll('.section-nav a').forEach(a => a.classList.remove('active'));
      link.classList.add('active');
    });
  });
}

// ── Completion tracking ──────────────────────────────
function updateCompletionIndicators(): void {
  let totalFilled = 0;
  let totalFields = 0;

  for (const [sectionKey, fieldIds] of Object.entries(SECTION_FIELDS)) {
    const badge = document.querySelector(`[data-badge="${sectionKey}"]`) as HTMLElement;
    if (!badge) continue;

    if (sectionKey === 'resume') {
      const hasResume = currentProfile?.hasResume || false;
      badge.textContent = hasResume ? '\u2713' : '0/1';
      badge.classList.toggle('complete', hasResume);
      totalFields += 1;
      if (hasResume) totalFilled += 1;
      continue;
    }

    if (sectionKey === 'education') {
      const count = document.querySelectorAll('.education-entry').length;
      badge.textContent = count > 0 ? `${count} added` : '0';
      badge.classList.toggle('complete', count > 0);
      totalFields += 1;
      if (count > 0) totalFilled += 1;
      continue;
    }

    if (sectionKey === 'experience') {
      const count = document.querySelectorAll('.experience-entry').length;
      badge.textContent = count > 0 ? `${count} added` : '0';
      badge.classList.toggle('complete', count > 0);
      totalFields += 1;
      if (count > 0) totalFilled += 1;
      continue;
    }

    let filled = 0;
    for (const id of fieldIds) {
      const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
      if (el && el.value.trim()) filled++;
    }
    totalFilled += filled;
    totalFields += fieldIds.length;
    const allFilled = filled === fieldIds.length;
    badge.textContent = allFilled ? '\u2713' : `${filled}/${fieldIds.length}`;
    badge.classList.toggle('complete', allFilled);
  }

  // Update progress bar
  const pct = totalFields > 0 ? Math.round((totalFilled / totalFields) * 100) : 0;
  const bar = document.getElementById('progressBar');
  if (bar) bar.style.width = `${pct}%`;
}

// ── Inline validation ────────────────────────────────
const VALIDATORS: Record<string, (value: string) => boolean> = {
  email: (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
  phone: (v) => !v || /^[\d\s\-().+]+$/.test(v),
  zip: (v) => !v || /^[\d\s\-A-Za-z]{3,10}$/.test(v),
  url: (v) => !v || /^https?:\/\/.+/.test(v),
};

function initValidation(): void {
  document.querySelectorAll<HTMLInputElement>('[data-validate]').forEach(input => {
    const type = input.dataset.validate!;
    const validator = VALIDATORS[type];
    if (!validator) return;
    input.addEventListener('blur', () => {
      const valid = validator(input.value.trim());
      input.classList.toggle('invalid', !valid);
    });
    input.addEventListener('input', () => {
      if (input.classList.contains('invalid')) {
        const valid = validator(input.value.trim());
        if (valid) input.classList.remove('invalid');
      }
    });
  });
}

// ── Experience entry HTML builder ────────────────────
function buildExperienceHTML(index: number, exp: WorkExperience): string {
  const empTypes = ['', 'Full-time', 'Part-time', 'Contract', 'Internship', 'Freelance', 'Co-op'];
  const empOptions = empTypes.map(t => {
    const sel = t === exp.employmentType ? ' selected' : '';
    return `<option value="${t}"${sel}>${t || 'Select\u2026'}</option>`;
  }).join('');

  const checked = exp.currentlyWorking ? ' checked' : '';

  return `
    <div class="experience-entry" data-index="${index}">
      <div class="entry-header">
        <span class="entry-number">Experience ${index + 1}</span>
        <button type="button" class="btn-remove-entry" data-remove="${index}">Remove</button>
      </div>
      <div class="row">
        <div class="field-group">
          <label>Job Title</label>
          <input type="text" data-exp="jobTitle" value="${escapeAttr(exp.jobTitle)}">
        </div>
        <div class="field-group">
          <label>Company</label>
          <input type="text" data-exp="company" value="${escapeAttr(exp.company)}">
        </div>
      </div>
      <div class="row">
        <div class="field-group">
          <label>Location</label>
          <input type="text" data-exp="location" value="${escapeAttr(exp.location)}">
        </div>
        <div class="field-group">
          <label>Employment Type</label>
          <select data-exp="employmentType">${empOptions}</select>
        </div>
      </div>
      <div class="row">
        <div class="field-group">
          <label>From (MM/YYYY)</label>
          <input type="text" data-exp="startDate" value="${escapeAttr(exp.startDate)}">
        </div>
        <div class="field-group">
          <label>To (MM/YYYY)</label>
          <input type="text" data-exp="endDate" value="${escapeAttr(exp.endDate)}"${exp.currentlyWorking ? ' disabled' : ''}>
        </div>
      </div>
      <div class="checkbox-group">
        <input type="checkbox" data-exp="currentlyWorking"${checked} id="cw_${index}">
        <label for="cw_${index}">I currently work here</label>
      </div>
      <div class="field-group">
        <label>Description</label>
        <textarea data-exp="description" rows="3">${escapeHTML(exp.description)}</textarea>
      </div>
    </div>`;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeHTML(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Render all experience entries ────────────────────
function renderExperiences(experiences: WorkExperience[]): void {
  const list = document.getElementById('experienceList')!;
  list.innerHTML = experiences.map((exp, i) => buildExperienceHTML(i, exp)).join('');
  wireRemoveButtons();
  wireCurrentlyWorkingCheckboxes();
  updateCompletionIndicators();
}

function wireRemoveButtons(): void {
  document.querySelectorAll('.btn-remove-entry').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt((btn as HTMLElement).dataset.remove!, 10);
      const container = document.getElementById('experienceList')!;
      const entries = container.querySelectorAll('.experience-entry');
      if (entries[idx]) {
        entries[idx].remove();
        container.querySelectorAll('.experience-entry').forEach((entry, i) => {
          entry.setAttribute('data-index', String(i));
          const num = entry.querySelector('.entry-number');
          if (num) num.textContent = `Experience ${i + 1}`;
          const removeBtn = entry.querySelector('.btn-remove-entry') as HTMLElement;
          if (removeBtn) removeBtn.dataset.remove = String(i);
          const cb = entry.querySelector('[data-exp="currentlyWorking"]') as HTMLInputElement;
          if (cb) {
            cb.id = `cw_${i}`;
            const lbl = cb.nextElementSibling;
            if (lbl) lbl.setAttribute('for', `cw_${i}`);
          }
        });
        updateCompletionIndicators();
      }
    });
  });
}

function wireCurrentlyWorkingCheckboxes(): void {
  document.querySelectorAll<HTMLInputElement>('[data-exp="currentlyWorking"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const entry = cb.closest('.experience-entry')!;
      const endDate = entry.querySelector('[data-exp="endDate"]') as HTMLInputElement;
      endDate.disabled = cb.checked;
      if (cb.checked) endDate.value = '';
    });
  });
}

// ── Read experience entries from DOM ─────────────────
function readExperiences(): WorkExperience[] {
  const entries = document.querySelectorAll('.experience-entry');
  const result: WorkExperience[] = [];
  entries.forEach(entry => {
    const get = (key: string) => {
      const el = entry.querySelector(`[data-exp="${key}"]`) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
      return el ? el.value.trim() : '';
    };
    const cb = entry.querySelector('[data-exp="currentlyWorking"]') as HTMLInputElement | null;
    result.push({
      jobTitle: get('jobTitle'),
      company: get('company'),
      location: get('location'),
      employmentType: get('employmentType'),
      startDate: get('startDate'),
      endDate: get('endDate'),
      currentlyWorking: cb ? cb.checked : false,
      description: get('description'),
    });
  });
  return result;
}

// ── Education entry HTML builder ─────────────────────
function buildEducationHTML(index: number, edu: Education): string {
  const degrees = ['', "High School Diploma", "Associate's", "Bachelor's", "Master's", "MBA", "Doctorate/PhD", "Other"];
  const degreeOptions = degrees.map(d => {
    const sel = d === edu.degree ? ' selected' : '';
    return `<option value="${d}"${sel}>${d || 'Select\u2026'}</option>`;
  }).join('');

  return `
    <div class="education-entry" data-edu-index="${index}">
      <div class="entry-header">
        <span class="entry-number">Education ${index + 1}</span>
        <button type="button" class="btn-remove-entry" data-remove-edu="${index}">Remove</button>
      </div>
      <div class="row">
        <div class="field-group">
          <label>School / University</label>
          <input type="text" data-edu="school" value="${escapeAttr(edu.school)}">
        </div>
        <div class="field-group">
          <label>Degree</label>
          <select data-edu="degree">${degreeOptions}</select>
        </div>
      </div>
      <div class="row">
        <div class="field-group">
          <label>Field of Study</label>
          <input type="text" data-edu="fieldOfStudy" value="${escapeAttr(edu.fieldOfStudy)}">
        </div>
        <div class="field-group" style="flex: 0 0 100px;">
          <label>GPA</label>
          <input type="text" data-edu="gpa" value="${escapeAttr(edu.gpa)}">
        </div>
      </div>
      <div class="row">
        <div class="field-group">
          <label>From (MM/YYYY)</label>
          <input type="text" data-edu="startDate" value="${escapeAttr(edu.startDate)}">
        </div>
        <div class="field-group">
          <label>To (MM/YYYY)</label>
          <input type="text" data-edu="endDate" value="${escapeAttr(edu.endDate)}">
        </div>
      </div>
    </div>`;
}

function renderEducations(educations: Education[]): void {
  const list = document.getElementById('educationList')!;
  list.innerHTML = educations.map((edu, i) => buildEducationHTML(i, edu)).join('');
  // Wire remove buttons
  document.querySelectorAll('[data-remove-edu]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt((btn as HTMLElement).dataset.removeEdu!, 10);
      const container = document.getElementById('educationList')!;
      const entries = container.querySelectorAll('.education-entry');
      if (entries[idx]) {
        entries[idx].remove();
        container.querySelectorAll('.education-entry').forEach((entry, i) => {
          entry.setAttribute('data-edu-index', String(i));
          const num = entry.querySelector('.entry-number');
          if (num) num.textContent = `Education ${i + 1}`;
          const removeBtn = entry.querySelector('[data-remove-edu]') as HTMLElement;
          if (removeBtn) removeBtn.dataset.removeEdu = String(i);
        });
        updateCompletionIndicators();
      }
    });
  });
  updateCompletionIndicators();
}

function readEducations(): Education[] {
  const entries = document.querySelectorAll('.education-entry');
  const result: Education[] = [];
  entries.forEach(entry => {
    const get = (key: string) => {
      const el = entry.querySelector(`[data-edu="${key}"]`) as HTMLInputElement | HTMLSelectElement | null;
      return el ? el.value.trim() : '';
    };
    result.push({
      school: get('school'),
      degree: get('degree'),
      fieldOfStudy: get('fieldOfStudy'),
      gpa: get('gpa'),
      startDate: get('startDate'),
      endDate: get('endDate'),
    });
  });
  return result;
}

// ── Read flat fields from DOM ────────────────────────
function readForm(): UserProfile {
  const profile: UserProfile = { ...EMPTY_PROFILE, workExperiences: [] };

  for (const key of FLAT_FIELD_IDS) {
    const el = document.getElementById(key) as HTMLInputElement | HTMLSelectElement | null;
    if (el) {
      (profile as any)[key] = el.value.trim();
    }
  }

  profile.educations = readEducations();

  const experiences = readExperiences();
  profile.workExperiences = experiences;

  if (experiences.length > 0) {
    profile.jobTitle = experiences[0].jobTitle;
    profile.company = experiences[0].company;
  }

  // Store "auto" if auto-calculate is checked, otherwise the manual date
  const autoStartCb = document.getElementById('autoStartDate') as HTMLInputElement;
  if (autoStartCb && autoStartCb.checked) {
    profile.desiredStartDate = 'auto';
  }

  return profile;
}

// ── Resume ───────────────────────────────────────────
let currentProfile: UserProfile | null = null;

function renderResumeUi(profile: UserProfile): void {
  const dropzone = document.getElementById('resumeDropzone')!;
  const infoEl = document.getElementById('resumeInfo')!;
  const nameEl = document.getElementById('resumeName')!;
  const metaEl = document.getElementById('resumeMeta')!;

  if (profile.hasResume && profile.resumeMetadata) {
    dropzone.style.display = 'none';
    infoEl.classList.add('visible');
    nameEl.textContent = profile.resumeMetadata.name;
    const date = new Date(profile.resumeMetadata.lastUpdated);
    metaEl.textContent = `Uploaded ${date.toLocaleDateString()}`;
  } else {
    dropzone.style.display = '';
    infoEl.classList.remove('visible');
    nameEl.textContent = '';
    metaEl.textContent = '';
    const fileInput = document.getElementById('resumeFile') as HTMLInputElement;
    fileInput.value = '';
  }
  updateCompletionIndicators();
}

async function handleResumeUpload(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !currentProfile) return;

  const MAX_SIZE = 5 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    showStatus('File too large. Maximum size is 5MB.', true);
    input.value = '';
    return;
  }

  try {
    await saveResumeFile(file);
    currentProfile.hasResume = true;
    currentProfile.resumeMetadata = { name: file.name, lastUpdated: Date.now() };
    await saveProfile(currentProfile);
    renderResumeUi(currentProfile);
    showStatus('Resume uploaded!');
  } catch (err) {
    showStatus('Failed to upload resume.', true);
    console.error(err);
  }
}

async function handleResumeRemove(): Promise<void> {
  if (!currentProfile) return;
  try {
    await deleteResumeFile();
    currentProfile.hasResume = false;
    currentProfile.resumeMetadata = undefined;
    await saveProfile(currentProfile);
    renderResumeUi(currentProfile);
    showStatus('Resume removed.');
  } catch (err) {
    showStatus('Failed to remove resume.', true);
    console.error(err);
  }
}

function initResumeDragDrop(): void {
  const dropzone = document.getElementById('resumeDropzone')!;
  const fileInput = document.getElementById('resumeFile') as HTMLInputElement;

  dropzone.addEventListener('dragenter', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
  dropzone.addEventListener('dragleave', () => { dropzone.classList.remove('dragover'); });
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    const files = (e as DragEvent).dataTransfer?.files;
    if (files && files.length > 0) {
      // Feed the dropped file through the existing upload handler
      const dt = new DataTransfer();
      dt.items.add(files[0]);
      fileInput.files = dt.files;
      fileInput.dispatchEvent(new Event('change'));
    }
  });
}

// ── Populate DOM from profile ────────────────────────
function populateForm(profile: UserProfile): void {
  for (const key of FLAT_FIELD_IDS) {
    const el = document.getElementById(key) as HTMLInputElement | HTMLSelectElement | null;
    if (!el || !(profile as any)[key]) continue;
    // Don't set "auto" on date inputs - it's not a valid date string
    if (el instanceof HTMLInputElement && el.type === 'date' && (profile as any)[key] === 'auto') continue;
    el.value = (profile as any)[key] as string;
  }

  renderEducations(profile.educations && profile.educations.length > 0 ? profile.educations : []);

  const exps = profile.workExperiences && profile.workExperiences.length > 0
    ? profile.workExperiences
    : [];
  renderExperiences(exps);
}

// ── Init ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  currentProfile = await getProfileOrDefault();
  populateForm(currentProfile);
  renderResumeUi(currentProfile);

  // Load last saved time
  const savedTs = localStorage.getItem('sts_lastSaved');
  if (savedTs) lastSavedTime = parseInt(savedTs, 10);
  updateLastSavedText();
  setInterval(updateLastSavedText, 30000);

  // Init UX features
  initCollapsibleSections();
  initSectionNav();
  initValidation();
  initResumeDragDrop();
  updateCompletionIndicators();

  // Update completion indicators on any field change
  document.querySelector('.container')!.addEventListener('input', updateCompletionIndicators);
  document.querySelector('.container')!.addEventListener('change', updateCompletionIndicators);

  // Add education
  document.getElementById('addEducationBtn')!.addEventListener('click', () => {
    const current = readEducations();
    current.push({ ...EMPTY_EDUCATION });
    renderEducations(current);
  });

  // Add experience
  document.getElementById('addExperienceBtn')!.addEventListener('click', () => {
    const current = readExperiences();
    current.push({ ...EMPTY_EXPERIENCE });
    renderExperiences(current);
  });

  // Save
  document.getElementById('saveBtn')!.addEventListener('click', async () => {
    const newProfile = readForm();
    if (currentProfile) {
      newProfile.hasResume = currentProfile.hasResume;
      newProfile.resumeMetadata = currentProfile.resumeMetadata;
    }
    await saveProfile(newProfile);
    currentProfile = newProfile;
    lastSavedTime = Date.now();
    localStorage.setItem('sts_lastSaved', String(lastSavedTime));
    updateLastSavedText();
    showStatus('Profile saved!');
  });

  // Auto start date toggle
  const autoStartCb = document.getElementById('autoStartDate') as HTMLInputElement;
  const startDateInput = document.getElementById('desiredStartDate') as HTMLInputElement;
  const startDatePreview = document.getElementById('autoStartDatePreview')!;

  function updateStartDateUi(): void {
    if (autoStartCb.checked) {
      startDateInput.disabled = true;
      startDateInput.style.opacity = '0.5';
      startDateInput.value = '';
      const computed = computeNextMonday2Weeks();
      startDatePreview.textContent = `Will fill: ${computed.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`;
    } else {
      startDateInput.disabled = false;
      startDateInput.style.opacity = '1';
      startDatePreview.textContent = '';
    }
    updateCompletionIndicators();
  }

  // Initialize from saved profile
  if (currentProfile.desiredStartDate === 'auto') {
    autoStartCb.checked = true;
  } else if (currentProfile.desiredStartDate) {
    autoStartCb.checked = false;
    startDateInput.value = currentProfile.desiredStartDate;
  }
  updateStartDateUi();

  autoStartCb.addEventListener('change', updateStartDateUi);
  startDateInput.addEventListener('change', updateCompletionIndicators);

  // Resume handlers
  document.getElementById('resumeFile')!.addEventListener('change', handleResumeUpload);
  document.getElementById('removeResumeBtn')!.addEventListener('click', handleResumeRemove);
});
