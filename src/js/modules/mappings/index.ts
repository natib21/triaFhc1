/**
 * Mappings Dashboard View (/mappings)
 */

import { store } from '../../store';
import { Table } from '../../components'; // Ensure Table is imported from your components folder
import {
  getStatusBadgeHtml,
  openCreateMappingModal,
} from './modals';

let currentStatusFilter = 'ALL';
let currentSearchQuery = '';
let activeListeners: { element: Element; type: string; handler: EventListener }[] = [];
let selectedMappingIds = new Set<string>();

// Holds the most recently rendered rows (raw mapped rows, keyed by id) so
// selection / bulk-action logic can look up flags like isAllocated without
// re-fetching.
let lastMappedRowsById: Map<string, any> = new Map();
// Holds the filtered (but not yet row-mapped) dataset currently on screen,
// so "Select All" and re-renders (e.g. after toggling a checkbox) can
// re-run the table render without a full network refetch.
let lastFilteredMappings: any[] = [];

function addManagedListener(element: Element | null, type: string, handler: EventListener) {
  if (element) {
    element.addEventListener(type, handler);
    activeListeners.push({ element, type, handler });
  }
}

export function cleanupMappings(): void {
  activeListeners.forEach(({ element, type, handler }) => {
    element.removeEventListener(type, handler);
  });
  activeListeners = [];
  selectedMappingIds.clear();
}

// ─── REASON MODAL (shared by allocate / reject / reverse) ──────────────
function openReasonModal(options: {
  actionLabel: string;
  count: number;
  onConfirm: (reason: string) => Promise<void> | void;
}) {
  document.getElementById('reason-modal-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'reason-modal-overlay';
  overlay.className = 'fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4';
  overlay.innerHTML = `
    <div class="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
      <div>
        <h3 class="text-lg font-bold text-slate-900">${options.actionLabel}</h3>
        <p class="text-xs text-slate-500 mt-1">
          This will affect <span class="font-semibold text-slate-700">${options.count}</span>
          request${options.count === 1 ? '' : 's'}.
        </p>
      </div>
      <div>
        <label class="block text-xs font-semibold text-slate-600 mb-1">
          Reason <span class="text-rose-500">*</span>
        </label>
        <textarea id="reason-modal-textarea" rows="3"
          class="w-full text-sm rounded-lg border border-slate-300 p-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          placeholder="Enter a reason for this action..."></textarea>
      </div>
      <div class="flex justify-end gap-2 pt-2">
        <button id="reason-modal-cancel" class="px-4 py-2 text-xs font-bold rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50">
          Cancel
        </button>
        <button id="reason-modal-confirm" disabled
          class="px-4 py-2 text-xs font-bold rounded-lg bg-indigo-600 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-indigo-700">
          Confirm
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const textarea = document.getElementById('reason-modal-textarea') as HTMLTextAreaElement;
  const confirmBtn = document.getElementById('reason-modal-confirm') as HTMLButtonElement;
  const cancelBtn = document.getElementById('reason-modal-cancel') as HTMLButtonElement;

  const close = () => overlay.remove();

  textarea.addEventListener('input', () => {
    confirmBtn.disabled = textarea.value.trim().length === 0;
  });

  cancelBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  confirmBtn.addEventListener('click', async () => {
    const reason = textarea.value.trim();
    if (!reason) return;
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Processing...';
    try {
      await options.onConfirm(reason);
    } finally {
      close();
    }
  });

  textarea.focus();
}

// ─── LETTER MODAL (real integration with POST /allocation-decision-letters) ──
// Collects the two required AllocationDecisionLetter fields (letterReference,
// letterDate) plus an optional summary, then creates the letter with the
// eligible mapping IDs attached via mappingIds[].
function openLetterModal(options: {
  count: number;
  onConfirm: (fields: { letterReference: string; letterDate: string; summary: string }) => Promise<void> | void;
}) {
  document.getElementById('letter-modal-overlay')?.remove();

  const todayIso = new Date().toISOString().slice(0, 10);

  const overlay = document.createElement('div');
  overlay.id = 'letter-modal-overlay';
  overlay.className = 'fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4';
  overlay.innerHTML = `
    <div class="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
      <div>
        <h3 class="text-lg font-bold text-slate-900">Add to Letter</h3>
        <p class="text-xs text-slate-500 mt-1">
          This will attach <span class="font-semibold text-slate-700">${options.count}</span>
          allocated request${options.count === 1 ? '' : 's'} to a new decision letter.
        </p>
      </div>
      <div class="space-y-3">
        <div>
          <label class="block text-xs font-semibold text-slate-600 mb-1">
            Letter Reference <span class="text-rose-500">*</span>
          </label>
          <input id="letter-modal-reference" type="text"
            class="w-full text-sm rounded-lg border border-slate-300 p-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            placeholder="e.g. HAL-2024-001" />
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-600 mb-1">
            Letter Date <span class="text-rose-500">*</span>
          </label>
          <input id="letter-modal-date" type="date" value="${todayIso}"
            class="w-full text-sm rounded-lg border border-slate-300 p-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-600 mb-1">Summary (optional)</label>
          <textarea id="letter-modal-summary" rows="2"
            class="w-full text-sm rounded-lg border border-slate-300 p-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            placeholder="Optional summary for this letter..."></textarea>
        </div>
      </div>
      <div class="flex justify-end gap-2 pt-2">
        <button id="letter-modal-cancel" class="px-4 py-2 text-xs font-bold rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50">
          Cancel
        </button>
        <button id="letter-modal-confirm" disabled
          class="px-4 py-2 text-xs font-bold rounded-lg bg-amber-600 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-amber-700">
          Create Letter
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const referenceInput = document.getElementById('letter-modal-reference') as HTMLInputElement;
  const dateInput = document.getElementById('letter-modal-date') as HTMLInputElement;
  const summaryInput = document.getElementById('letter-modal-summary') as HTMLTextAreaElement;
  const confirmBtn = document.getElementById('letter-modal-confirm') as HTMLButtonElement;
  const cancelBtn = document.getElementById('letter-modal-cancel') as HTMLButtonElement;

  const close = () => overlay.remove();

  const validate = () => {
    confirmBtn.disabled = referenceInput.value.trim().length === 0 || !dateInput.value;
  };
  referenceInput.addEventListener('input', validate);
  dateInput.addEventListener('input', validate);

  cancelBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  confirmBtn.addEventListener('click', async () => {
    const letterReference = referenceInput.value.trim();
    const letterDate = dateInput.value;
    if (!letterReference || !letterDate) return;
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Creating...';
    try {
      await options.onConfirm({ letterReference, letterDate, summary: summaryInput.value.trim() });
    } finally {
      close();
    }
  });

  referenceInput.focus();
}

// ─── ACTION EXECUTORS (call the real bulk-capable endpoints) ───────────
async function executeAllocate(ids: string[], reason: string) {
  try {
    const notYetApproved = ids.filter(
      (id) => lastMappedRowsById.get(id)?.decisionStatus !== 'APPROVED' && !lastMappedRowsById.get(id)?.isAllocated
    );
    const approvedNotAllocated = ids.filter(
      (id) => lastMappedRowsById.get(id)?.decisionStatus === 'APPROVED' && !lastMappedRowsById.get(id)?.isAllocated
    );

    const failures: { id: string; error: string }[] = [];

    // Merged path: approving now allocates automatically server-side.
    if (notYetApproved.length) {
      const result = await store.apiService.patch<{ succeeded: any[]; failed: { id: string; error: string }[] }>(
        '/house-allocation-mappings/bulk-decision',
        { ids: notYetApproved, decision: 'approved', decisionNotes: reason }
      );
      if (result.failed?.length) failures.push(...result.failed);
    }

    // Separate fallback path: already approved but not yet allocated.
    if (approvedNotAllocated.length) {
      const result = await store.apiService.post<{ succeeded: any[]; failed: { id: string; error: string }[] }>(
        '/house-allocation-mappings/bulk-allocate',
        { ids: approvedNotAllocated }
      );
      if (result.failed?.length) failures.push(...result.failed);
    }

    if (failures.length) {
      alert(`Some allocations failed:\n${failures.map((f) => `${f.id}: ${f.error}`).join('\n')}`);
    }
  } catch (err: any) {
    alert('Bulk allocation failed: ' + (err.message || 'Unknown error'));
  }
  if ((store as any).notify) (store as any).notify();
  refreshMappingsView();
}

async function executeReject(ids: string[], reason: string) {
  try {
    const result = await store.apiService.patch<{ succeeded: any[]; failed: { id: string; error: string }[] }>(
      '/house-allocation-mappings/bulk-decision',
      { ids, decision: 'rejected', decisionNotes: reason }
    );
    // NOTE: recordDecision on the backend already flips beneficiary.status
    // back to WAITING_LIST when decision === rejected, so rejected
    // beneficiaries automatically re-enter the waiting list. No extra
    // frontend handling needed for that.
    if (result.failed?.length) {
      alert(`Some rejections failed:\n${result.failed.map((f) => `${f.id}: ${f.error}`).join('\n')}`);
    }
  } catch (err: any) {
    alert('Bulk rejection failed: ' + (err.message || 'Unknown error'));
  }
  if ((store as any).notify) (store as any).notify();
  refreshMappingsView();
}

async function executeReverse(ids: string[], reason: string) {
  try {
    const result = await store.apiService.post<{ succeeded: any[]; failed: { id: string; error: string }[] }>(
      '/house-allocation-mappings/bulk-reverse',
      { ids, reversalReason: reason }
    );
    if (result.failed?.length) {
      alert(`Some reversals failed:\n${result.failed.map((f) => `${f.id}: ${f.error}`).join('\n')}`);
    }
  } catch (err: any) {
    alert('Bulk reversal failed: ' + (err.message || 'Unknown error'));
  }
  if ((store as any).notify) (store as any).notify();
  refreshMappingsView();
}

async function executeAddToLetter(ids: string[]) {
  // Only allocated mappings can be added to a letter (matches the
  // AllocationDecisionLetterService eligibility rule: decision === approved,
  // not reversed, not already in another letter — allocatedAt is our closest
  // client-side signal for "already approved & allocated").
  const eligible = ids.filter((id) => lastMappedRowsById.get(id)?.isAllocated);
  const skipped = ids.length - eligible.length;

  if (eligible.length === 0) {
    alert('None of the selected requests are allocated yet, so none can be added to a letter.');
    return;
  }

  openLetterModal({
    count: eligible.length,
    onConfirm: async ({ letterReference, letterDate, summary }) => {
      try {
        await store.apiService.post('/allocation-decision-letters', {
          mappingIds: eligible,
          letterReference,
          letterDate,
          summary: summary || undefined,
        });
        if (skipped > 0) {
          alert(`Letter created. ${skipped} request${skipped === 1 ? '' : 's'} were skipped (not yet allocated).`);
        }
      } catch (err: any) {
        alert('Failed to create letter: ' + (err.message || 'Unknown error'));
      }
      if ((store as any).notify) (store as any).notify();
      refreshMappingsView();
    },
  });
}

// Re-fetches and re-renders the whole view (used after an action completes).
let activeContainer: HTMLElement | null = null;
function refreshMappingsView() {
  if (activeContainer) renderMappings(activeContainer);
}

// ─── SELECTION HELPERS ──────────────────────────────────────────────────
function updateSelectionUI() {
  const countEl = document.getElementById('selected-count-text');
  if (countEl) countEl.textContent = `${selectedMappingIds.size} selected`;

  const bulkButtons = document.querySelectorAll<HTMLButtonElement>('.btn-bulk-action');
  bulkButtons.forEach((btn) => {
    btn.disabled = selectedMappingIds.size === 0;
  });

  const selectAllCheckbox = document.getElementById('select-all-checkbox') as HTMLInputElement | null;
  if (selectAllCheckbox) {
    const allIds = lastFilteredMappings.map((m) => m.id);
    const selectedInView = allIds.filter((id) => selectedMappingIds.has(id));
    selectAllCheckbox.checked = allIds.length > 0 && selectedInView.length === allIds.length;
    selectAllCheckbox.indeterminate = selectedInView.length > 0 && selectedInView.length < allIds.length;
  }
}

// ─── TABLE RENDER FUNCTION (Matches Queue Mgmt Style) ──────────────────
function renderMappingsTableData(data: any[]) {
  lastFilteredMappings = data;

  const mappedData = data.map((item, index) => {
    // Extract beneficiary data
    const beneficiary = item.beneficiary || {};
    const individual = beneficiary.beneficiaryIndividual || {};
    const benInstitution = individual.institution || {};
    const request = beneficiary.request || {};
    const requestingInst = request.requestingInstitution || {};
    const tier = requestingInst.currentTier || {};
    const rank = individual.currentRank || {};

    // Extract property data
    const property = item.property || {};
    const building = property.building || {};
    const location = property.location || {};
    const propertyType = property.propertyType || {};

    // Extract user data
    const mappedBy = item.mappedBy || {};
    const decidedBy = item.decidedBy || {};
    const allocatedBy = item.allocatedBy || {};

    // Helper to get name
    const getUserName = (user: any) => {
      if (!user) return 'N/A';
      const firstName = user.firstName?.en || user.firstName?.am || '';
      const middleName = user.middleName?.en || user.middleName?.am || '';
      const lastName = user.lastName?.en || user.lastName?.am || '';
      return [firstName, middleName, lastName].filter(Boolean).join(' ').trim() || 'N/A';
    };

    // Helper to get institution name
    const getInstName = (inst: any) => {
      if (!inst) return 'N/A';
      return inst.name?.en || inst.name?.am || inst.shortName || inst.code || 'N/A';
    };

    return {
      id: item.id,
      index: index + 1,

      // ─── MAP REFERENCE ──────────────────────────────────────────────
      mapReference: item.mapReference || `MAP-${item.id.slice(0, 8)}`,
      isForced: item.isForcedMatch || item.isForced || false,

      // ─── BENEFICIARY ────────────────────────────────────────────────
      beneficiaryId: beneficiary.id || 'N/A',
      beneficiaryName: item.beneficiaryFullName || getUserName(individual) || 'N/A',
      beneficiaryInstitutionName: getInstName(benInstitution),
      beneficiaryInstitutionCode: benInstitution.code || 'N/A',
      beneficiaryInstitutionType: benInstitution.institutionType || 'N/A',

      // ─── BENEFICIARY STATUS ─────────────────────────────────────────
      beneficiaryStatus: individual.status || beneficiary.status || item.beneficiaryStatus || 'N/A',
      enteredWaitingListAt: individual.enteredWaitingListAt || beneficiary.enteredWaitingListAt || item.enteredWaitingListAt || null,

      // ─── BENEFICIARY RANK ───────────────────────────────────────────
      beneficiaryRank: rank.code || 'N/A',
      beneficiaryRankPriority: rank.priorityLevel ?? 'N/A',
      beneficiaryTitle: individual.currentTitle?.abbreviations?.en || individual.currentTitle?.name?.en || 'N/A',

      // ─── REQUEST INFO ──────────────────────────────────────────────
      requestId: request.id || 'N/A',
      referenceNumber: request.letterReferenceNumber || 'N/A',
      letterDate: request.letterDate || 'N/A',
      registeredAt: request.registeredAt || item.createdAt || null,
      requestStatus: request.status || 'N/A',

      // ─── PROPERTY ──────────────────────────────────────────────────
      propertyId: property.id || 'N/A',
      propertyHouseNumber: property.houseNumber || item.propertyHouseNumber || 'N/A',
      propertyBuildingType: building.buildingType || 'N/A',
      propertyBuildingName: building.name?.en || building.name?.am || 'N/A',
      propertyLocation: location.names?.en || item.propertyLocation?.en || 'N/A',
      propertyStatus: property.status || item.propertyStatus || 'N/A',
      propertyBedrooms: property.numberOfBedrooms || item.propertyBedrooms || 0,
      propertyType: propertyType.type || 'N/A',
      propertyArea: property.area || 'N/A',

      // ─── MAPPING STATUS ────────────────────────────────────────────
      decisionStatus: (item.decision || item.decisionStatus || 'pending').toUpperCase(),
      isAllocated: !!item.allocatedAt,
      isReversed: !!item.reversedAt,

      // ─── ALLOCATION HISTORY ────────────────────────────────────────
      allocationHistoryCount: benInstitution.allocationHistoryCount ?? 0,

      // ─── PRIORITY BREAKDOWN (for factor badges) ────────────────────
      priorityBreakdown: {
        isOverride: item.isForcedMatch || item.isForced || false,
        institution: {
          tierPriority: tier.allocationPriority ?? null,
          allocationHistoryCount: benInstitution.allocationHistoryCount ?? 0,
        },
        beneficiary: {
          rankPriority: rank.priorityLevel ?? null,
        },
      },

      // ─── MATCHING CRITERIA ─────────────────────────────────────────
      matchingCriteria: item.matchingCriteria || {},

      // ─── TIMESTAMPS & USERS ───────────────────────────────────────
      mappedAt: item.mappedAt || item.createdAt || null,
      mappedBy: mappedBy,
      mappedByName: getUserName(mappedBy),

      decidedAt: item.decidedAt || null,
      decidedBy: decidedBy,
      decidedByName: getUserName(decidedBy),
      decisionNotes: item.decisionNotes || '',

      allocatedAt: item.allocatedAt || null,
      allocatedBy: allocatedBy,
      allocatedByName: getUserName(allocatedBy),

      reversedAt: item.reversedAt || null,
      reversedBy: item.reversedBy || null,
      reversedByName: getUserName(item.reversedBy),
      reversalReason: item.reversalReason || '',

      notes: item.notes || '',
    };
  });

  // Keep an id-indexed lookup for selection / bulk-action logic.
  lastMappedRowsById = new Map(mappedData.map((row) => [row.id, row]));

  Table.render<any>({
    containerId: 'mappings-table-container',
    loading: false,
    placeholderText: 'Search mappings...',
    columns: [
      // ─── SELECT (checkbox) ──────────────────────────────────────────
      {
        header: `<input type="checkbox" id="select-all-checkbox" class="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />`,
        key: 'select',
        render: (item) => `
          <input type="checkbox" class="row-select-checkbox w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            data-id="${item.id}" ${selectedMappingIds.has(item.id) ? 'checked' : ''} />
        `,
      },

      // ─── # (POSITION) ───────────────────────────────────────────────
      {
        header: '#',
        key: 'index',
        sortable: true,
        render: (item) => `
          <span class="inline-flex items-center justify-center w-7 h-7 bg-slate-100 text-slate-800 font-black rounded-lg text-xs border border-slate-200">
            ${item.index}
          </span>
        `,
      },

      // ─── MAP REFERENCE ─────────────────────────────────────────────
      {
        header: 'Map Reference',
        key: 'mapReference',
        sortable: true,
        render: (item) => `
          <div class="space-y-0.5">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="font-mono font-bold text-indigo-600 text-xs">${item.mapReference}</span>
              ${item.isForced ? `<span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300">FORCED</span>` : ''}
              ${item.isReversed ? `<span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-slate-200 text-slate-600 border border-slate-300">REVERSED</span>` : ''}
            </div>
            ${item.referenceNumber !== 'N/A' ? `<p class="text-[9px] text-slate-400 font-mono">${item.referenceNumber}</p>` : ''}
          </div>
        `,
      },

      // ─── BENEFICIARY ────────────────────────────────────────────────
      {
        header: 'Beneficiary',
        key: 'beneficiaryName',
        sortable: true,
        render: (item) => `
          <div class="space-y-0.5">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-bold text-slate-800 text-sm">${item.beneficiaryName}</span>
              ${item.beneficiaryRank !== 'N/A' ? `<span class="px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[9px] font-medium rounded border border-blue-200">${item.beneficiaryRank}</span>` : ''}
              ${item.isForced ? `<span title="Priority Override" class="px-1.5 py-0.5 bg-rose-100 text-rose-700 text-[9px] font-bold rounded border border-rose-300 flex items-center gap-1"><i class="fa-solid fa-flag"></i> OVERRIDE</span>` : ''}
            </div>
            <p class="text-[10px] text-slate-500 flex items-center gap-1">
              <i class="fa-solid fa-building text-slate-400 text-[9px]"></i>
              ${item.beneficiaryInstitutionName}
            </p>
            ${item.beneficiaryTitle !== 'N/A' ? `<p class="text-[9px] text-slate-400">📌 ${item.beneficiaryTitle}</p>` : ''}
          </div>
        `,
      },

      // ─── BENEFICIARY INSTITUTION ────────────────────────────────────
      {
        header: 'Beneficiary Institution',
        key: 'beneficiaryInstitutionName',
        sortable: true,
        render: (item) => {
          const hasInstitution = item.beneficiaryInstitutionName && item.beneficiaryInstitutionName !== 'N/A';
          if (!hasInstitution) {
            return `<span class="text-xs text-slate-400">No institution</span>`;
          }
          return `
            <div class="space-y-0.5">
              <p class="font-semibold text-slate-800 text-xs">${item.beneficiaryInstitutionName}</p>
              ${item.beneficiaryInstitutionCode !== 'N/A' ? `<p class="text-[9px] text-slate-400 font-mono">${item.beneficiaryInstitutionCode}</p>` : ''}
              ${item.beneficiaryInstitutionType !== 'N/A' ? `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded text-[8px]">${item.beneficiaryInstitutionType}</span>` : ''}
            </div>
          `;
        },
      },
      {
        header: 'Property',
        key: 'propertyHouseNumber',
        sortable: true,
        render: (item) => `
          <div class="space-y-0.5">
            <p class="font-medium text-slate-800 text-xs">🏠 ${item.propertyHouseNumber}</p>
            <p class="text-[9px] text-red-500 font-extrabold">${item.propertyBuildingType}</p>
            <p class="text-[9px] text-slate-400">${item.propertyLocation}</p>
            ${item.propertyBuildingName !== 'N/A' ? `<p class="text-[9px] text-slate-400">${item.propertyBuildingName}</p>` : ''}
            <span class="inline-flex items-center gap-1 px-1.5 py-0.5 ${item.propertyStatus === 'VACANT' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : item.propertyStatus === 'OCCUPIED' ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-amber-50 text-amber-700 border-amber-200'} border rounded text-[8px]">
              ${item.propertyStatus}
            </span>
          </div>
        `,
      },

      // ─── MATCHING CRITERIA ────────────────────────────────────────────────────
      {
        header: 'Matching Criteria',
        key: 'matchingCriteria',
        sortable: true,
        render: (item) => {
          const criteria = item.matchingCriteria || {};
          const hasCriteria = Object.keys(criteria).length > 0;

          if (!hasCriteria) {
            return `<span class="text-xs text-slate-400">No criteria</span>`;
          }

          const rankCode = criteria.rankCode || 'N/A';
          const priorityLevel = criteria.priorityLevel ?? 'N/A';
          const bedroomRule = criteria.bedroomEntitlementRule || 'N/A';
          const requiredBedrooms = criteria.requiredBedrooms ?? 'N/A';
          const actualBedrooms = criteria.actualBedrooms ?? 'N/A';
          const bedroomMatch = criteria.bedroomMatch ?? false;
          const houseTypeMatch = criteria.houseTypeMatch ?? false;
          const preferredTypes = criteria.preferredHouseTypes || [];
          const fallbackTypes = criteria.fallbackHouseTypes || [];

          const matchIndicators = [];
          if (bedroomMatch) matchIndicators.push('✅ Bedrooms');
          if (houseTypeMatch) matchIndicators.push('✅ House Type');

          return `
            <div class="space-y-1 max-w-[200px]">
              <div class="flex items-center gap-1.5">
                <span class="text-[10px] font-bold text-slate-500">Rank:</span>
                <span class="font-semibold text-slate-700 text-xs">${rankCode}</span>
                <span class="px-1.5 py-0.2 bg-indigo-50 text-indigo-700 text-[9px] font-bold rounded border border-indigo-200">P${priorityLevel}</span>
              </div>
              <div class="flex items-center gap-1.5 text-[10px]">
                <span class="text-slate-500">Rule:</span>
                <span class="font-medium text-slate-700">${bedroomRule}</span>
                <span class="text-slate-400">|</span>
                <span class="font-medium text-slate-700">${requiredBedrooms} → ${actualBedrooms} beds</span>
              </div>
              <div class="flex flex-wrap gap-0.5">
                ${matchIndicators.map((ind) =>
                  `<span class="px-1 py-0.2 bg-emerald-50 text-emerald-700 text-[8px] font-bold rounded border border-emerald-200">${ind}</span>`
                ).join('')}
                ${!bedroomMatch && !houseTypeMatch ?
                  `<span class="px-1 py-0.2 bg-amber-50 text-amber-700 text-[8px] font-bold rounded border border-amber-200">⚠️ Partial Match</span>` : ''}
              </div>
              ${preferredTypes.length > 0 ? `
                <div class="flex flex-wrap gap-0.5 mt-0.5">
                  ${preferredTypes.map((type) =>
                    `<span class="px-1 py-0.2 bg-blue-50 text-blue-600 text-[8px] font-medium rounded border border-blue-200">★ ${type}</span>`
                  ).join('')}
                </div>
              ` : ''}
              ${fallbackTypes.length > 0 ? `
                <div class="flex flex-wrap gap-0.5">
                  ${fallbackTypes.map((type) =>
                    `<span class="px-1 py-0.2 bg-slate-50 text-slate-500 text-[8px] font-medium rounded border border-slate-200">${type}</span>`
                  ).join('')}
                </div>
              ` : ''}
            </div>
          `;
        },
      },

      // ─── BEDROOMS ────────────────────────────────────────────────────
      {
        header: 'Beds',
        key: 'propertyBedrooms',
        sortable: true,
        render: (item) => `
          <span class="inline-flex items-center justify-center w-7 h-7 bg-slate-100 text-slate-800 font-black rounded-lg text-xs border border-slate-200">
            ${item.propertyBedrooms}
          </span>
        `,
      },

      // ─── DECISION STATUS ─────────────────────────────────────────────
      {
        header: 'DecisionStatus',
        key: 'decisionStatus',
        sortable: true,
        render: (item) => `
          <div class="space-y-0.5">
            ${getStatusBadgeHtml(item.decisionStatus)}
            ${item.isAllocated ? `<span class="text-[9px] font-bold text-indigo-600 block"><i class="fa-solid fa-house-circle-check mr-0.5"></i>Allocated</span>` : ''}
            ${item.isReversed ? `<span class="text-[9px] font-bold text-slate-500 block"><i class="fa-solid fa-rotate-left mr-0.5"></i>Reversed</span>` : ''}
            ${item.decisionNotes ? `<p class="text-[9px] text-slate-400">${item.decisionNotes}</p>` : ''}
          </div>
        `,
      },

      // ─── MAPPED AT ────────────────────────────────────────────────────
      {
        header: 'Mapped',
        key: 'mappedAt',
        sortable: true,
        render: (item) => {
          if (!item.mappedAt) return `<span class="text-xs text-slate-400">N/A</span>`;
          const date = new Date(item.mappedAt);
          if (isNaN(date.getTime())) return `<span class="text-xs text-slate-400">N/A</span>`;
          return `
            <div class="space-y-0.5">
              <p class="text-xs font-medium text-slate-700">${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
              <p class="text-[9px] text-slate-400">${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</p>
              ${item.mappedByName !== 'N/A' ? `<p class="text-[9px] text-slate-400">by ${item.mappedByName}</p>` : ''}
            </div>
          `;
        },
      },

      // ─── BENEFICIARY STATUS ─────────────────────────────────────────
      {
        header: 'Beneficiary Status',
        key: 'beneficiaryStatus',
        sortable: true,
        render: (item) => {
          const status = (item.beneficiaryStatus || 'N/A').toLowerCase();

          const statusColorMap: Record<string, string> = {
            pending_review: 'bg-amber-50 text-amber-700 border-amber-200',
            eligible: 'bg-blue-50 text-blue-700 border-blue-200',
            under_legal_revision: 'bg-purple-50 text-purple-700 border-purple-200',
            waiting_list: 'bg-teal-50 text-teal-700 border-teal-200',
            mapped: 'bg-indigo-50 text-indigo-700 border-indigo-200',
            allocated: 'bg-emerald-50 text-emerald-700 border-emerald-200',
            unauthorized_by_directive: 'bg-rose-50 text-rose-700 border-rose-200',
          };

          const statusLabelMap: Record<string, string> = {
            pending_review: '⏳ pending Review',
            eligible: '✅ Eligible',
            under_legal_revision: '⚖️ Legal Revision',
            waiting_list: '📋 Waiting List',
            mapped: '🔗 Mapped',
            allocated: '🏠 Allocated',
            unauthorized_by_directive: '🚫 Unauthorized',
          };

          const statusColor = statusColorMap[status] || 'bg-slate-50 text-slate-600 border-slate-200';
          const statusLabel = statusLabelMap[status] || status.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());

          if (status === 'n/a') {
            return `<span class="text-xs text-slate-400">N/A</span>`;
          }

          return `
            <div class="space-y-0.5">
              <span class="px-2 py-0.5 ${statusColor} border text-[10px] font-bold rounded-md block text-center cursor-help"
                    title="${statusLabel}">
                ${statusLabel}
              </span>
              ${item.enteredWaitingListAt ? `
                <p class="text-[9px] text-slate-400 text-center">
                  ${new Date(item.enteredWaitingListAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>
              ` : ''}
            </div>
          `;
        },
      },

      // ─── ACTIONS (exactly 4 options) ───────────────────────────────
      {
        header: 'Actions',
        key: 'id',
        render: (item) => {
          if (item.isReversed) {
            return `
              <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200/60 shadow-sm mx-auto">
                <span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                Reversed
              </span>
            `;
          }

          const showAllocate = item.decisionStatus === 'approved' && !item.isAllocated;
          const showReject = item.decisionStatus !== 'rejected' && !item.isAllocated;
          const showAddToLetter = item.isAllocated;
          const showReverse = true; // any non-reversed mapping can be reversed

          if (!showAllocate && !showReject && !showAddToLetter && !showReverse) {
            return `<span class="text-xs text-slate-400">No actions</span>`;
          }

          return `
            <details class="dropdown-container relative group">
              <summary class="dropdown-trigger list-none cursor-pointer w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100/80 active:bg-slate-200/60 transition-all duration-200 mx-auto select-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
                <i class="fa-solid fa-ellipsis-vertical text-sm"></i>
              </summary>

              <div class="dropdown-menu absolute right-0 mt-2 w-52 bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-xl shadow-xl shadow-slate-900/5 z-[100] p-1.5 transform opacity-0 scale-95 transition-all duration-150 ease-out origin-top-right group-open:opacity-100 group-open:scale-100">
                <div class="space-y-0.5">
                  ${showAllocate ? `
                    <button class="dropdown-action w-full text-left px-2.5 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-50/80 rounded-lg transition-colors flex items-center gap-2.5 group/btn" data-action="allocate" data-id="${item.id}">
                      <span class="w-6 h-6 rounded-md bg-indigo-100/60 flex items-center justify-center text-indigo-600 group-hover/btn:bg-white transition-colors">
                        <i class="fa-solid fa-house-circle-check text-[11px]"></i>
                      </span>
                      Allocate Request
                    </button>
                  ` : ''}
                  ${showReject ? `
                    <button class="dropdown-action w-full text-left px-2.5 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50/80 rounded-lg transition-colors flex items-center gap-2.5 group/btn" data-action="reject" data-id="${item.id}">
                      <span class="w-6 h-6 rounded-md bg-rose-100/60 flex items-center justify-center text-rose-600 group-hover/btn:bg-white transition-colors">
                        <i class="fa-regular fa-circle-xmark text-[11px]"></i>
                      </span>
                      Reject Request
                    </button>
                  ` : ''}
                  ${showAddToLetter ? `
                    <button class="dropdown-action w-full text-left px-2.5 py-2 text-xs font-medium text-amber-700 hover:bg-amber-50/80 rounded-lg transition-colors flex items-center gap-2.5 group/btn" data-action="letter" data-id="${item.id}">
                      <span class="w-6 h-6 rounded-md bg-amber-100/60 flex items-center justify-center text-amber-600 group-hover/btn:bg-white transition-colors">
                        <i class="fa-regular fa-file-lines text-[11px]"></i>
                      </span>
                      Add to Letter
                    </button>
                  ` : ''}
                  ${showReverse ? `
                    <button class="dropdown-action w-full text-left px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100/80 rounded-lg transition-colors flex items-center gap-2.5 group/btn" data-action="revert" data-id="${item.id}">
                      <span class="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center text-slate-500 group-hover/btn:bg-white transition-colors">
                        <i class="fa-solid fa-rotate-left text-[11px]"></i>
                      </span>
                      Reverse Mapping
                    </button>
                  ` : ''}
                </div>
              </div>
            </details>
          `;
        },
      },
    ],
    data: mappedData || [],
    emptyState: `
      <div class="text-center py-12">
        <i class="fa-regular fa-folder-open text-4xl text-slate-300 mb-3 block"></i>
        <p class="text-sm font-semibold text-slate-500">No house allocation mappings found</p>
        <p class="text-xs text-slate-400 mt-1">Try adjusting your filter settings or create a new mapping above.</p>
      </div>
    `,
    rowClassName: (item) => {
      if (item.isReversed) return 'bg-rose-50/30';
      if (item.isAllocated) return 'bg-emerald-50/30';
      if (item.isForced) return 'bg-amber-50/30';
      if (item.decisionStatus === 'pending') return 'bg-amber-50/30';
      if (item.decisionStatus === 'approved') return 'bg-indigo-50/30';
      if (item.decisionStatus === 'rejected') return 'bg-rose-50/30';
      return 'bg-white hover:bg-slate-50/50';
    },
  });

  updateSelectionUI();
}

function attachMappingTableListeners() {
  // Close dropdowns when clicking outside
  document.addEventListener('click', (e) => {
    if (!(e.target as HTMLElement).closest('.dropdown-container')) {
      document.querySelectorAll('.dropdown-container[open]').forEach((details) => {
        (details as HTMLDetailsElement).removeAttribute('open');
      });
    }
  });

  // ─── Row action buttons ──────────────────────────────────────────
  document.querySelectorAll('.dropdown-action').forEach((btn) => {
    const newBtn = btn.cloneNode(true) as HTMLElement;
    btn.parentNode?.replaceChild(newBtn, btn);

    newBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const target = e.currentTarget as HTMLElement;
      const action = target.dataset.action;
      const id = target.dataset.id;
      if (!id) return;

      const details = target.closest('details');
      if (details) details.removeAttribute('open');

      if (action === 'allocate') {
        openReasonModal({
          actionLabel: 'Allocate Request',
          count: 1,
          onConfirm: (reason) => executeAllocate([id], reason),
        });
      } else if (action === 'reject') {
        openReasonModal({
          actionLabel: 'Reject Request',
          count: 1,
          onConfirm: (reason) => executeReject([id], reason),
        });
      } else if (action === 'letter') {
        executeAddToLetter([id]);
      } else if (action === 'revert') {
        openReasonModal({
          actionLabel: 'Reverse Mapping',
          count: 1,
          onConfirm: (reason) => executeReverse([id], reason),
        });
      }
    });
  });

  // ─── Row selection checkboxes ────────────────────────────────────
  document.querySelectorAll('.row-select-checkbox').forEach((checkbox) => {
    const newCheckbox = checkbox.cloneNode(true) as HTMLInputElement;
    checkbox.parentNode?.replaceChild(newCheckbox, checkbox);

    newCheckbox.addEventListener('change', (e) => {
      const target = e.currentTarget as HTMLInputElement;
      const id = target.dataset.id;
      if (!id) return;
      if (target.checked) selectedMappingIds.add(id);
      else selectedMappingIds.delete(id);
      updateSelectionUI();
    });
  });

  // ─── Select-all checkbox ─────────────────────────────────────────
  const selectAllCheckbox = document.getElementById('select-all-checkbox') as HTMLInputElement | null;
  if (selectAllCheckbox) {
    const newSelectAll = selectAllCheckbox.cloneNode(true) as HTMLInputElement;
    selectAllCheckbox.parentNode?.replaceChild(newSelectAll, selectAllCheckbox);

    newSelectAll.addEventListener('change', (e) => {
      const checked = (e.currentTarget as HTMLInputElement).checked;
      lastFilteredMappings.forEach((m) => {
        if (checked) selectedMappingIds.add(m.id);
        else selectedMappingIds.delete(m.id);
      });
      // Re-render rows so each checkbox reflects the new state.
      renderMappingsTableData(lastFilteredMappings);
      attachMappingTableListeners();
    });
  }
}

// ─── BULK ACTION BAR LISTENERS ───────────────────────────────────────────
function attachBulkActionListeners() {
  addManagedListener(document.getElementById('btn-bulk-allocate'), 'click', () => {
    const ids = Array.from(selectedMappingIds);
    if (!ids.length) return;
    openReasonModal({
      actionLabel: 'Bulk Allocate',
      count: ids.length,
      onConfirm: (reason) => executeAllocate(ids, reason),
    });
  });

  addManagedListener(document.getElementById('btn-bulk-reject'), 'click', () => {
    const ids = Array.from(selectedMappingIds);
    if (!ids.length) return;
    openReasonModal({
      actionLabel: 'Bulk Reject',
      count: ids.length,
      onConfirm: (reason) => executeReject(ids, reason),
    });
  });

  addManagedListener(document.getElementById('btn-bulk-letter'), 'click', () => {
    const ids = Array.from(selectedMappingIds);
    if (!ids.length) return;
    executeAddToLetter(ids);
  });

  addManagedListener(document.getElementById('btn-bulk-reverse'), 'click', () => {
    const ids = Array.from(selectedMappingIds);
    if (!ids.length) return;
    openReasonModal({
      actionLabel: 'Bulk Reverse Mapping',
      count: ids.length,
      onConfirm: (reason) => executeReverse(ids, reason),
    });
  });
}

// ─── MAIN RENDER FUNCTION ──────────────────────────────────────────────
export async function renderMappings(container: HTMLElement): Promise<void> {
  activeContainer = container;
  cleanupMappings();

  // 1. Show Loading State
  container.innerHTML = `
    <div class="flex flex-col items-center justify-center h-64 space-y-3">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      <span class="text-sm text-slate-600 font-medium">Loading allocation mappings...</span>
    </div>
  `;

  let rawMappings: any[] = [];

  // 2. Fetch Data from API
  try {
    const response = await store.apiService.get<any>('/house-allocation-mappings');
    rawMappings = Array.isArray(response) ? response : (response?.items || response?.data || []);
  } catch (err) {
    console.error('Failed to fetch mappings:', err);
    container.innerHTML = `
      <div class="p-12 text-center text-rose-600 space-y-3 bg-white rounded-xl border border-rose-200 shadow-sm">
        <p class="text-base font-semibold">Failed to load mappings</p>
        <p class="text-xs text-rose-500">Please check your connection and try again.</p>
        <button id="btn-retry-mappings" class="px-4 py-2 bg-rose-600 text-white rounded-lg text-xs font-bold hover:bg-rose-700 transition-colors">
          Retry
        </button>
      </div>
    `;
    addManagedListener(document.getElementById('btn-retry-mappings'), 'click', () => renderMappings(container));
    return;
  }

  // 3. Filter Mappings
  let filteredMappings = rawMappings.filter((m) => {
    const decisionStatus = (m.decisionStatus || m.decision || 'pending').toUpperCase();
    if (currentStatusFilter !== 'ALL' && decisionStatus !== currentStatusFilter) return false;

    if (currentSearchQuery.trim()) {
      const q = currentSearchQuery.toLowerCase();
      const benName = (m.beneficiaryFullName || m.beneficiaryName || '').toLowerCase();
      const benInst = (m.beneficiaryInstitution || '').toLowerCase();
      const propNum = (m.propertyHouseNumber || m.property?.houseNumber || '').toLowerCase();
      const mapRef = (m.mapReference || '').toLowerCase();
      return benName.includes(q) || benInst.includes(q) || propNum.includes(q) || mapRef.includes(q);
    }
    return true;
  });

  // Calculate stats for header
  const totalMappings = rawMappings.length;
  const pendingCount = rawMappings.filter((m) => (m.decisionStatus || m.decision || '').toUpperCase() === 'pending').length;
  const approvedCount = rawMappings.filter((m) => (m.decisionStatus || m.decision || '').toUpperCase() === 'approved').length;
  const rejectedCount = rawMappings.filter((m) => (m.decisionStatus || m.decision || '').toUpperCase() === 'rejected').length;

  // 4. Render UI Container
  container.innerHTML = `
    <div class="space-y-6 pb-12 animate-in fade-in duration-200">

      <!-- Top Bar / Header -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div class="flex items-center space-x-2">
            <span class="p-2 bg-indigo-100 text-indigo-700 rounded-lg font-bold text-lg">🏠</span>
            <h1 class="text-2xl font-bold text-slate-900">Housing Mappings & Allocation</h1>
          </div>
          <p class="text-xs text-slate-500 mt-1">Manage beneficiary-to-property assignments, record decisions, and execute allocations</p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button id="btn-nav-workspace" class="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-indigo-300 text-xs font-bold rounded-lg transition-colors flex items-center space-x-1.5 shadow-sm border border-slate-700">
            <svg class="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>
            <span>3-Column Studio</span>
          </button>
          <button id="btn-open-create-mapping" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors flex items-center space-x-1.5">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
            <span>Create Mapping</span>
          </button>
        </div>
      </div>

      <!-- Stats Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div><span class="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Total Mappings</span><span class="text-2xl font-black text-slate-900 mt-1 block">${totalMappings}</span></div>
          <div class="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 font-bold">📊</div>
        </div>
        <div class="bg-white p-5 rounded-xl border border-amber-200 shadow-sm flex items-center justify-between">
          <div><span class="text-xs font-semibold text-amber-700 uppercase tracking-wider block">pending Review</span><span class="text-2xl font-black text-amber-900 mt-1 block">${pendingCount}</span></div>
          <div class="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center text-amber-700 font-bold">⏳</div>
        </div>
        <div class="bg-white p-5 rounded-xl border border-emerald-200 shadow-sm flex items-center justify-between">
          <div><span class="text-xs font-semibold text-emerald-700 uppercase tracking-wider block">approved Decisions</span><span class="text-2xl font-black text-emerald-900 mt-1 block">${approvedCount}</span></div>
          <div class="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-700 font-bold">✅</div>
        </div>
        <div class="bg-white p-5 rounded-xl border border-rose-200 shadow-sm flex items-center justify-between">
          <div><span class="text-xs font-semibold text-rose-700 uppercase tracking-wider block">rejected Mappings</span><span class="text-2xl font-black text-rose-900 mt-1 block">${rejectedCount}</span></div>
          <div class="w-11 h-11 rounded-xl bg-rose-50 flex items-center justify-center text-rose-700 font-bold">🚫</div>
        </div>
      </div>

      <!-- Filters & Controls Bar -->
      <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div class="flex items-center space-x-1 bg-slate-100 p-1 rounded-lg w-full md:w-auto">
          <button data-filter="ALL" class="btn-filter-status px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${currentStatusFilter === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}">All (${totalMappings})</button>
          <button data-filter="pending" class="btn-filter-status px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${currentStatusFilter === 'pending' ? 'bg-white text-amber-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}">pending (${pendingCount})</button>
          <button data-filter="approved" class="btn-filter-status px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${currentStatusFilter === 'approved' ? 'bg-white text-emerald-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}">approved (${approvedCount})</button>
          <button data-filter="rejected" class="btn-filter-status px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${currentStatusFilter === 'rejected' ? 'bg-white text-rose-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}">rejected (${rejectedCount})</button>
        </div>
        <div class="relative w-full md:w-72">
          <svg class="w-4 h-4 absolute left-3 top-2.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          <input type="text" id="txt-mapping-search" value="${currentSearchQuery}" placeholder="Search mappings..." class="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all">
        </div>
      </div>

      <!-- Bulk Action Bar -->
      <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
        <span id="selected-count-text" class="text-xs font-semibold text-slate-600">0 selected</span>
        <div class="flex flex-wrap items-center gap-2">
          <button id="btn-bulk-allocate" disabled class="btn-bulk-action px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            Bulk Allocate
          </button>
          <button id="btn-bulk-reject" disabled class="btn-bulk-action px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            Bulk Reject
          </button>
          <button id="btn-bulk-letter" disabled class="btn-bulk-action px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            Bulk Add to Letter
          </button>
          <button id="btn-bulk-reverse" disabled class="btn-bulk-action px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            Bulk Reverse Mapping
          </button>
        </div>
      </div>

      <!-- Table Container -->
      <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden p-4">
        <div id="mappings-table-container" class="overflow-x-auto w-full"></div>
      </div>
    </div>
  `;

  // 5. Attach Static Event Listeners
  addManagedListener(document.getElementById('btn-open-create-mapping'), 'click', () => openCreateMappingModal());

  const workspaceBtn = document.getElementById('btn-nav-workspace');
  if (workspaceBtn) {
    addManagedListener(workspaceBtn, 'click', () => {
      if ((store as any).setActiveTab) (store as any).setActiveTab('mapping-workspace');
    });
  }

  document.querySelectorAll('.btn-filter-status').forEach((btn) => {
    addManagedListener(btn, 'click', (e) => {
      currentStatusFilter = (e.currentTarget as HTMLElement).dataset.filter || 'ALL';
      renderMappings(container);
    });
  });

  const searchInput = document.getElementById('txt-mapping-search') as HTMLInputElement;
  if (searchInput) {
    let debounceTimer: any;
    addManagedListener(searchInput, 'input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        currentSearchQuery = (e.target as HTMLInputElement).value;
        renderMappings(container);
      }, 300);
    });
  }

  attachBulkActionListeners();

  // 6. Render Table and Attach Dynamic Listeners
  setTimeout(() => {
    renderMappingsTableData(filteredMappings);
    attachMappingTableListeners();
  }, 50);
}