// Options page script — full profile editor

import { saveProfile, getProfileOrDefault } from '../storage/profile';
import { UserProfile, WorkExperience, EMPTY_PROFILE, EMPTY_EXPERIENCE } from '../shared/types';

// Simple string fields read/written via their element id
const FLAT_FIELD_IDS: (keyof UserProfile)[] = [
  'firstName', 'lastName', 'email', 'phone',
  'address', 'city', 'state', 'zipCode',
  'linkedinUrl',
  'yearsOfExperience',
  'desiredJobTitle', 'desiredSalary',
  'workAuthorization', 'sponsorshipNeeded',
  'willingToRelocate', 'remotePreference',
  'earliestStartDate',
];

const MONTHS = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ── Status banner ────────────────────────────────────
function showStatus(message: string, isError = false): void {
  const status = document.getElementById('status')!;
  status.textContent = message;
  status.style.color = isError ? '#C8102E' : '#B8860B';
  const duration = isError ? 5000 : 3000;
  setTimeout(() => { status.textContent = ''; }, duration);
}

// ── Experience entry HTML builder ────────────────────
function buildExperienceHTML(index: number, exp: WorkExperience): string {
  const monthOptions = (selected: string) =>
    MONTHS.map((m, i) => {
      const val = i === 0 ? '' : String(i).padStart(2, '0');
      const sel = val === selected ? ' selected' : '';
      return `<option value="${val}"${sel}>${m || 'Month'}</option>`;
    }).join('');

  const empTypes = ['', 'Full-time', 'Part-time', 'Contract', 'Internship', 'Freelance', 'Co-op'];
  const empOptions = empTypes.map(t => {
    const sel = t === exp.employmentType ? ' selected' : '';
    return `<option value="${t}"${sel}>${t || 'Select…'}</option>`;
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
          <label>Start Month</label>
          <select data-exp="startMonth">${monthOptions(exp.startMonth)}</select>
        </div>
        <div class="field-group">
          <label>Start Year</label>
          <input type="text" data-exp="startYear" value="${escapeAttr(exp.startYear)}">
        </div>
        <div class="field-group">
          <label>End Month</label>
          <select data-exp="endMonth"${exp.currentlyWorking ? ' disabled' : ''}>${monthOptions(exp.endMonth)}</select>
        </div>
        <div class="field-group">
          <label>End Year</label>
          <input type="text" data-exp="endYear" value="${escapeAttr(exp.endYear)}"${exp.currentlyWorking ? ' disabled' : ''}>
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
}

function wireRemoveButtons(): void {
  document.querySelectorAll('.btn-remove-entry').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt((btn as HTMLElement).dataset.remove!, 10);
      const container = document.getElementById('experienceList')!;
      const entries = container.querySelectorAll('.experience-entry');
      if (entries[idx]) {
        entries[idx].remove();
        // Re-number remaining entries
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
      }
    });
  });
}

function wireCurrentlyWorkingCheckboxes(): void {
  document.querySelectorAll<HTMLInputElement>('[data-exp="currentlyWorking"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const entry = cb.closest('.experience-entry')!;
      const endMonth = entry.querySelector('[data-exp="endMonth"]') as HTMLSelectElement;
      const endYear = entry.querySelector('[data-exp="endYear"]') as HTMLInputElement;
      endMonth.disabled = cb.checked;
      endYear.disabled = cb.checked;
      if (cb.checked) {
        endMonth.value = '';
        endYear.value = '';
      }
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
      startMonth: get('startMonth'),
      startYear: get('startYear'),
      endMonth: get('endMonth'),
      endYear: get('endYear'),
      currentlyWorking: cb ? cb.checked : false,
      description: get('description'),
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

  const experiences = readExperiences();
  profile.workExperiences = experiences;

  // Sync most-recent experience to top-level auto-fill fields
  if (experiences.length > 0) {
    profile.jobTitle = experiences[0].jobTitle;
    profile.company = experiences[0].company;
  }

  return profile;
}

// ── Populate DOM from profile ────────────────────────
function populateForm(profile: UserProfile): void {
  for (const key of FLAT_FIELD_IDS) {
    const el = document.getElementById(key) as HTMLInputElement | HTMLSelectElement | null;
    if (el && (profile as any)[key]) {
      el.value = (profile as any)[key] as string;
    }
  }

  const exps = profile.workExperiences && profile.workExperiences.length > 0
    ? profile.workExperiences
    : [];
  renderExperiences(exps);
}

// ── Init ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const profile = await getProfileOrDefault();
  populateForm(profile);

  document.getElementById('addExperienceBtn')!.addEventListener('click', () => {
    const current = readExperiences();
    current.push({ ...EMPTY_EXPERIENCE });
    renderExperiences(current);
  });

  document.getElementById('saveBtn')!.addEventListener('click', async () => {
    const profile = readForm();
    await saveProfile(profile);
    showStatus('Profile saved!');
  });
});
