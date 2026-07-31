/**
 * Modals for Housing Allocation & Mapping Management Module
 */

import { store } from '../../store';
import { HouseAllocationMapping, AllocationDecisionLetter, SuggestionResult, Property } from './types';

// Helper for status badge styling
export function getStatusBadgeHtml(status: string): string {
  switch (status?.toUpperCase()) {
    case 'APPROVED':
      return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
        <span class="w-1.5 h-1.5 mr-1.5 rounded-full bg-emerald-500"></span>Approved
      </span>`;
    case 'REJECTED':
      return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200">
        <span class="w-1.5 h-1.5 mr-1.5 rounded-full bg-rose-500"></span>Rejected
      </span>`;
    case 'PENDING':
      return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
        <span class="w-1.5 h-1.5 mr-1.5 rounded-full bg-amber-500"></span>Pending Review
      </span>`;
    case 'ALLOCATED':
      return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
        <span class="w-1.5 h-1.5 mr-1.5 rounded-full bg-blue-500"></span>Allocated
      </span>`;
    case 'DRAFT':
      return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
        <span class="w-1.5 h-1.5 mr-1.5 rounded-full bg-slate-400"></span>Draft
      </span>`;
    case 'CANCELLED':
      return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-600 border border-zinc-300">
        <span class="w-1.5 h-1.5 mr-1.5 rounded-full bg-zinc-400"></span>Cancelled
      </span>`;
    case 'VACANT':
      return `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">Vacant</span>`;
    case 'OCCUPIED':
      return `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">Occupied</span>`;
    default:
      return `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">${status || 'Unknown'}</span>`;
  }
}

// Modal Container creation helper
function getOrCreateModalContainer(): HTMLElement {
  let modalContainer = document.getElementById('mapping-modals-root');
  if (!modalContainer) {
    modalContainer = document.createElement('div');
    modalContainer.id = 'mapping-modals-root';
    document.body.appendChild(modalContainer);
  }
  return modalContainer;
}

export function closeModal(): void {
  const container = document.getElementById('mapping-modals-root');
  if (container) {
    container.innerHTML = '';
  }
}

/**
 * 1. CREATE MAPPING MODAL
 */
export function openCreateMappingModal(defaultBeneficiaryId?: string, defaultPropertyId?: string): void {
  store.setActiveTab('mapping-workspace');
}

/**
 * 2. MAPPING DETAIL MODAL
 */
export function openMappingDetailModal(mappingId: string): void {
  const container = getOrCreateModalContainer();
  const mapping = store.mappings.find(m => m.id === mappingId);

  if (!mapping) {
    alert('Mapping not found.');
    return;
  }

  const prop = mapping.property;
  const ben = mapping.beneficiary;

  container.innerHTML = `
    <div class="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-white rounded-xl shadow-2xl max-w-3xl w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-200">
        
        <!-- Header -->
        <div class="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div class="flex items-center space-x-3">
            <div class="w-10 h-10 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-base">
              MAP
            </div>
            <div>
              <div class="flex items-center space-x-3">
                <h3 class="text-lg font-bold">${mapping.referenceCode}</h3>
                ${getStatusBadgeHtml(mapping.decisionStatus)}
                ${mapping.isForced ? '<span class="px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">Forced</span>' : ''}
              </div>
              <p class="text-xs text-slate-300">Created on ${new Date(mapping.createdAt).toLocaleDateString()} by ${mapping.mappedBy}</p>
            </div>
          </div>
          <button id="btn-close-detail-modal" class="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap-link="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <!-- Body -->
        <div class="p-6 space-y-6 max-h-[80vh] overflow-y-auto text-sm text-slate-800">
          
          <!-- Reversal Banner if reversed -->
          ${mapping.reversalStatus === 'REVERSED' ? `
            <div class="p-4 rounded-lg bg-rose-50 border border-rose-200 flex items-start space-x-3">
              <svg class="w-5 h-5 text-rose-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap-link="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
              <div>
                <h4 class="font-bold text-rose-900">Mapping Reversal Executed</h4>
                <p class="text-xs text-rose-700 mt-0.5">Reversed by ${mapping.reversedBy || 'Admin'} on ${mapping.reversedAt ? new Date(mapping.reversedAt).toLocaleDateString() : 'N/A'}</p>
                <p class="text-xs font-medium text-rose-800 mt-1">Reason: ${mapping.reversalReason || 'No reason specified'}</p>
              </div>
            </div>
          ` : ''}

          <!-- Grid 2-Column: Beneficiary & Property -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            <!-- Beneficiary Info -->
            <div class="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
              <div class="flex items-center justify-between pb-2 border-b border-slate-200">
                <span class="text-xs font-bold uppercase tracking-wider text-slate-500">Beneficiary Details</span>
                ${getStatusBadgeHtml(ben?.status || 'WAITING_LIST')}
              </div>
              <div class="space-y-1.5">
                <p class="font-bold text-slate-900 text-base">${ben?.fullName || 'N/A'}</p>
                <p class="text-xs text-slate-600"><strong class="text-slate-700">Rank:</strong> ${ben?.rank || 'Senior Official'}</p>
                <p class="text-xs text-slate-600"><strong class="text-slate-700">Institution:</strong> ${ben?.institution || 'N/A'}</p>
                <p class="text-xs text-slate-600"><strong class="text-slate-700">Priority Level:</strong> Rank ${ben?.priorityLevel || '1'}</p>
                <p class="text-xs text-slate-600"><strong class="text-slate-700">Entitlement:</strong> ${ben?.bedroomEntitlement || 3} Bedrooms</p>
                <p class="text-xs text-slate-600"><strong class="text-slate-700">Request Ref:</strong> ${mapping.requestReference || mapping.requestId || 'HAR-2026-000001'}</p>
              </div>
            </div>

            <!-- Property Info -->
            <div class="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
              <div class="flex items-center justify-between pb-2 border-b border-slate-200">
                <span class="text-xs font-bold uppercase tracking-wider text-slate-500">Property Details</span>
                ${getStatusBadgeHtml(prop?.status || 'VACANT')}
              </div>
              <div class="space-y-1.5">
                <p class="font-bold text-slate-900 text-base">${prop?.address || 'N/A'}</p>
                <p class="text-xs text-slate-600"><strong class="text-slate-700">Type:</strong> ${prop?.propertyType || 'APARTMENT'}</p>
                <p class="text-xs text-slate-600"><strong class="text-slate-700">Bedrooms:</strong> ${prop?.bedrooms || 3} Beds</p>
                <p class="text-xs text-slate-600"><strong class="text-slate-700">Monthly Rent:</strong> ${prop?.monthlyRent ? `${prop.monthlyRent.toLocaleString()} ETB` : 'N/A'}</p>
                <p class="text-xs text-slate-600"><strong class="text-slate-700">Property Code:</strong> ${prop?.code || prop?.id || 'N/A'}</p>
                <div class="pt-1 flex flex-wrap gap-1">
                  ${(prop?.features || ['Generator', 'Security', 'Parking']).map(f => `<span class="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 text-[10px] font-medium">${f}</span>`).join('')}
                </div>
              </div>
            </div>
          </div>

          <!-- Matching Criteria Breakdown -->
          <div class="bg-indigo-50/50 rounded-xl p-4 border border-indigo-100 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
                <svg class="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap-link="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                Decision Logic & Matching Criteria
              </span>
              <span class="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 text-xs font-bold">Match Score: ${mapping.matchScore || 90}%</span>
            </div>

            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div class="bg-white p-2.5 rounded-lg border border-indigo-100">
                <span class="text-slate-500 block">Criteria Version</span>
                <span class="font-bold text-slate-900">v${mapping.matchingCriteria?.criteriaVersion || 1}</span>
              </div>
              <div class="bg-white p-2.5 rounded-lg border border-indigo-100">
                <span class="text-slate-500 block">Bedroom Entitlement</span>
                <span class="font-bold text-slate-900">${mapping.matchingCriteria?.requiredBedrooms || ben?.bedroomEntitlement || 3} Beds</span>
              </div>
              <div class="bg-white p-2.5 rounded-lg border border-indigo-100">
                <span class="text-slate-500 block">Bedroom Match</span>
                <span class="font-bold ${mapping.matchingCriteria?.bedroomMatch !== false ? 'text-emerald-600' : 'text-amber-600'}">
                  ${mapping.matchingCriteria?.bedroomMatch !== false ? '✅ Match' : '⚠️ Override'}
                </span>
              </div>
              <div class="bg-white p-2.5 rounded-lg border border-indigo-100">
                <span class="text-slate-500 block">House Type Match</span>
                <span class="font-bold ${mapping.matchingCriteria?.houseTypeMatch !== false ? 'text-emerald-600' : 'text-slate-600'}">
                  ${mapping.matchingCriteria?.houseTypeMatch !== false ? '✅ Preferred' : 'Alternative'}
                </span>
              </div>
            </div>

            ${mapping.isForced ? `
              <div class="p-3 bg-amber-100/70 border border-amber-200 rounded-lg text-xs text-amber-900">
                <strong>Force Justification:</strong> ${mapping.forceReason || 'Overridden match forced by administrator'}
              </div>
            ` : ''}
          </div>

          <!-- Decision & Allocation Metadata -->
          <div class="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3 text-xs">
            <span class="font-bold uppercase tracking-wider text-slate-500 block">Decision & Workflow Trace</span>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <p><strong class="text-slate-700">Decision Status:</strong> ${mapping.decisionStatus}</p>
                <p><strong class="text-slate-700">Decision Date:</strong> ${mapping.decisionDate ? new Date(mapping.decisionDate).toLocaleDateString() : 'Pending'}</p>
                <p><strong class="text-slate-700">Decision Officer:</strong> ${mapping.decisionBy || 'Pending'}</p>
              </div>
              <div>
                <p><strong class="text-slate-700">Allocated Status:</strong> ${mapping.isAllocated ? 'Allocated' : 'Not Allocated'}</p>
                <p><strong class="text-slate-700">Allocated At:</strong> ${mapping.allocatedAt ? new Date(mapping.allocatedAt).toLocaleDateString() : 'N/A'}</p>
                <p><strong class="text-slate-700">Decision Letter Ref:</strong> ${mapping.decisionLetterReference ? `<span class="font-bold text-indigo-600">${mapping.decisionLetterReference}</span>` : 'Not assigned to letter'}</p>
              </div>
            </div>
          </div>

        </div>

        <!-- Footer Actions -->
        <div class="px-6 py-4 bg-slate-100 border-t border-slate-200 flex items-center justify-between">
          <div>
            ${mapping.reversalStatus !== 'REVERSED' ? `
              <button id="btn-modal-reverse" class="px-3 py-1.5 border border-rose-300 text-rose-700 hover:bg-rose-50 text-xs font-semibold rounded-lg transition-colors flex items-center space-x-1">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap-link="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
                <span>Reverse Mapping</span>
              </button>
            ` : ''}
          </div>

          <div class="flex items-center space-x-2">
            ${mapping.decisionStatus === 'PENDING' && mapping.reversalStatus !== 'REVERSED' ? `
              <button id="btn-modal-decision" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors">
                Record Decision
              </button>
            ` : ''}

            ${mapping.decisionStatus === 'APPROVED' && !mapping.isAllocated && mapping.reversalStatus !== 'REVERSED' ? `
              <button id="btn-modal-allocate" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors flex items-center space-x-1">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap-link="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                <span>Allocate Property</span>
              </button>
            ` : ''}

            <button id="btn-close-detail" class="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold rounded-lg transition-colors">
              Close
            </button>
          </div>
        </div>

      </div>
    </div>
  `;

  document.getElementById('btn-close-detail-modal')?.addEventListener('click', closeModal);
  document.getElementById('btn-close-detail')?.addEventListener('click', closeModal);

  document.getElementById('btn-modal-reverse')?.addEventListener('click', () => {
    closeModal();
    openReverseMappingModal(mappingId);
  });

  document.getElementById('btn-modal-decision')?.addEventListener('click', () => {
    closeModal();
    openRecordDecisionModal(mappingId);
  });

  document.getElementById('btn-modal-allocate')?.addEventListener('click', async () => {
    try {
      await store.apiService.post(`/house-allocation-mappings/${mappingId}/allocate`);
      closeModal();
      store.notify();
    } catch (err: any) {
      alert('Failed to allocate mapping: ' + (err.message || 'Unknown error'));
    }
  });
}

/**
 * 3. RECORD DECISION MODAL (APPROVE / REJECT)
 */
export function openRecordDecisionModal(mappingId: string): void {
  const container = getOrCreateModalContainer();
  const mapping = store.mappings.find(m => m.id === mappingId);

  if (!mapping) return;

  container.innerHTML = `
    <div class="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-200">
        <div class="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <h3 class="text-base font-bold">Record Allocation Decision</h3>
          <button id="btn-close-decision-modal" class="text-slate-400 hover:text-white">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap-link="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div class="p-6 space-y-4">
          <div class="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
            <p><strong>Mapping Ref:</strong> ${mapping.referenceCode}</p>
            <p><strong>Beneficiary:</strong> ${mapping.beneficiary.fullName}</p>
            <p><strong>Property:</strong> ${mapping.property.address}</p>
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Decision Option <span class="text-rose-500">*</span></label>
            <div class="grid grid-cols-2 gap-3">
              <label class="flex items-center justify-center p-3 rounded-lg border-2 border-emerald-200 bg-emerald-50 text-emerald-800 font-bold text-xs cursor-pointer hover:bg-emerald-100">
                <input type="radio" name="rad-decision" value="APPROVED" checked class="mr-2 text-emerald-600 focus:ring-emerald-500">
                Approve
              </label>
              <label class="flex items-center justify-center p-3 rounded-lg border-2 border-rose-200 bg-rose-50 text-rose-800 font-bold text-xs cursor-pointer hover:bg-rose-100">
                <input type="radio" name="rad-decision" value="REJECTED" class="mr-2 text-rose-600 focus:ring-rose-500">
                Reject
              </label>
            </div>
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Decision Notes / Reason</label>
            <textarea id="txt-decision-notes" rows="3" placeholder="Enter decision notes or rejection reason..." class="w-full rounded-lg border-slate-300 text-xs shadow-sm focus:ring-indigo-500 focus:border-indigo-500"></textarea>
          </div>

          <div class="pt-3 border-t border-slate-200 flex justify-end space-x-2">
            <button type="button" id="btn-cancel-decision" class="px-3 py-1.5 border border-slate-300 text-xs font-medium rounded-lg hover:bg-slate-50">Cancel</button>
            <button type="button" id="btn-save-decision" class="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-sm">Save Decision</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-close-decision-modal')?.addEventListener('click', closeModal);
  document.getElementById('btn-cancel-decision')?.addEventListener('click', closeModal);

  document.getElementById('btn-save-decision')?.addEventListener('click', async () => {
    const decision = (document.querySelector('input[name="rad-decision"]:checked') as HTMLInputElement).value;
    const notes = (document.getElementById('txt-decision-notes') as HTMLTextAreaElement).value;

    try {
      await store.apiService.patch(`/house-allocation-mappings/${mappingId}/decision`, {
        status: decision,
        notes: notes,
        rejectionReason: decision === 'REJECTED' ? notes : undefined,
      });

      closeModal();
      store.notify();
    } catch (err: any) {
      alert('Failed to record decision: ' + (err.message || 'Unknown error'));
    }
  });
}

/**
 * 4. REVERSE MAPPING MODAL
 */
export function openReverseMappingModal(mappingId: string): void {
  const container = getOrCreateModalContainer();
  const mapping = store.mappings.find(m => m.id === mappingId);

  if (!mapping) return;

  container.innerHTML = `
    <div class="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden border border-rose-200 animate-in fade-in zoom-in duration-200">
        <div class="px-6 py-4 bg-rose-700 text-white flex items-center justify-between">
          <h3 class="text-base font-bold flex items-center gap-2">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap-link="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            Reverse Mapping Decision
          </h3>
          <button id="btn-close-reverse-modal" class="text-rose-200 hover:text-white">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap-link="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div class="p-6 space-y-4">
          <p class="text-xs text-slate-700">
            Reversing this mapping will return beneficiary <strong>${mapping.beneficiary.fullName}</strong> to the waiting list and mark property <strong>${mapping.property.address}</strong> back as vacant.
          </p>

          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Reversal Reason <span class="text-rose-500">*</span></label>
            <textarea id="txt-reverse-reason" rows="3" required placeholder="State administrative or legal reason for reversal..." class="w-full rounded-lg border-slate-300 text-xs shadow-sm focus:ring-rose-500 focus:border-rose-500"></textarea>
          </div>

          <div class="pt-3 border-t border-slate-200 flex justify-end space-x-2">
            <button type="button" id="btn-cancel-reverse" class="px-3 py-1.5 border border-slate-300 text-xs font-medium rounded-lg hover:bg-slate-50">Cancel</button>
            <button type="button" id="btn-confirm-reverse" class="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg shadow-sm">Confirm Reversal</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-close-reverse-modal')?.addEventListener('click', closeModal);
  document.getElementById('btn-cancel-reverse')?.addEventListener('click', closeModal);

  document.getElementById('btn-confirm-reverse')?.addEventListener('click', async () => {
    const reason = (document.getElementById('txt-reverse-reason') as HTMLTextAreaElement).value;

    if (!reason.trim()) {
      alert('Please enter a reversal reason.');
      return;
    }

    try {
      await store.apiService.patch(`/house-allocation-mappings/${mappingId}/reverse`, { reason });
      closeModal();
      store.notify();
    } catch (err: any) {
      alert('Failed to reverse mapping: ' + (err.message || 'Unknown error'));
    }
  });
}

/**
 * 5. CREATE DECISION LETTER MODAL
 */
export function openCreateLetterModal(): void {
  const container = getOrCreateModalContainer();
  const approvedMappings = store.mappings.filter(m => m.decisionStatus === 'APPROVED' && !m.decisionLetterId);

  container.innerHTML = `
    <div class="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-white rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-200">
        <div class="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div class="flex items-center space-x-2">
            <div class="w-8 h-8 rounded bg-indigo-600 flex items-center justify-center font-bold">📄</div>
            <div>
              <h3 class="text-base font-bold">Generate Allocation Decision Letter</h3>
              <p class="text-xs text-slate-300">Group approved mappings into an official decision letter</p>
            </div>
          </div>
          <button id="btn-close-letter-modal" class="text-slate-400 hover:text-white">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap-link="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <form id="form-create-letter" class="p-6 space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Letter Reference Number <span class="text-rose-500">*</span></label>
              <input type="text" id="txt-letter-ref" required value="HAL-2026-${String(store.decisionLetters.length + 1).padStart(3, '0')}" class="w-full rounded-lg border-slate-300 text-xs shadow-sm focus:ring-indigo-500 focus:border-indigo-500 py-2 px-3">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Letter Date <span class="text-rose-500">*</span></label>
              <input type="date" id="txt-letter-date" required value="${new Date().toISOString().split('T')[0]}" class="w-full rounded-lg border-slate-300 text-xs shadow-sm focus:ring-indigo-500 focus:border-indigo-500 py-2 px-3">
            </div>
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Select Approved Mappings to Include <span class="text-rose-500">*</span></label>
            ${approvedMappings.length === 0 ? `
              <p class="text-xs text-amber-700 p-3 bg-amber-50 rounded-lg border border-amber-200">
                No unassigned approved mappings found. Please approve mappings first before generating a letter.
              </p>
            ` : `
              <div class="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-48 overflow-y-auto">
                ${approvedMappings.map(m => `
                  <label class="flex items-center p-3 hover:bg-slate-50 cursor-pointer space-x-3 text-xs">
                    <input type="checkbox" name="chk-mapping-item" value="${m.id}" checked class="rounded text-indigo-600 focus:ring-indigo-500">
                    <div class="flex-1">
                      <p class="font-bold text-slate-900">${m.referenceCode} - ${m.beneficiary.fullName}</p>
                      <p class="text-slate-500">${m.property.address} (${m.property.propertyType})</p>
                    </div>
                  </label>
                `).join('')}
              </div>
            `}
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Notes / Summary</label>
            <textarea id="txt-letter-notes" rows="2" placeholder="Official batch summary or memorandum notes..." class="w-full rounded-lg border-slate-300 text-xs shadow-sm focus:ring-indigo-500 focus:border-indigo-500"></textarea>
          </div>

          <div class="pt-3 border-t border-slate-200 flex justify-end space-x-2">
            <button type="button" id="btn-cancel-letter" class="px-3 py-1.5 border border-slate-300 text-xs font-medium rounded-lg hover:bg-slate-50">Cancel</button>
            <button type="submit" id="btn-submit-letter" ${approvedMappings.length === 0 ? 'disabled' : ''} class="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-sm">
              Generate Letter
            </button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.getElementById('btn-close-letter-modal')?.addEventListener('click', closeModal);
  document.getElementById('btn-cancel-letter')?.addEventListener('click', closeModal);

  document.getElementById('form-create-letter')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ref = (document.getElementById('txt-letter-ref') as HTMLInputElement).value;
    const date = (document.getElementById('txt-letter-date') as HTMLInputElement).value;
    const notes = (document.getElementById('txt-letter-notes') as HTMLTextAreaElement).value;

    const checkedBoxes = Array.from(document.querySelectorAll('input[name="chk-mapping-item"]:checked')) as HTMLInputElement[];
    const mappingIds = checkedBoxes.map(cb => cb.value);

    if (mappingIds.length === 0) {
      alert('Please select at least one approved mapping to include in the decision letter.');
      return;
    }

    try {
      await store.apiService.post('/allocation-decision-letters', {
        letterReference: ref,
        letterDate: date,
        mappingIds,
        notes,
      });

      closeModal();
      store.notify();
    } catch (err: any) {
      alert('Failed to create decision letter: ' + (err.message || 'Unknown error'));
    }
  });
}

/**
 * 6. DECISION LETTER DETAIL MODAL
 */
export function openLetterDetailModal(letterId: string): void {
  const container = getOrCreateModalContainer();
  const letter = store.decisionLetters.find(l => l.id === letterId);

  if (!letter) return;

  const letterMappings = store.mappings.filter(m => m.decisionLetterId === letterId);

  container.innerHTML = `
    <div class="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-white rounded-xl shadow-2xl max-w-3xl w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-200">
        
        <!-- Header -->
        <div class="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div>
            <div class="flex items-center space-x-3">
              <h3 class="text-lg font-bold">Decision Letter: ${letter.letterReference}</h3>
              ${getStatusBadgeHtml(letter.status)}
            </div>
            <p class="text-xs text-slate-300">Dated ${letter.letterDate} | Contains ${letterMappings.length} Mappings</p>
          </div>
          <button id="btn-close-letter-detail-modal" class="text-slate-400 hover:text-white">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap-link="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <!-- Body -->
        <div class="p-6 space-y-5 max-h-[75vh] overflow-y-auto text-xs text-slate-800">
          
          <div class="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
            <p><strong>Letter Reference:</strong> ${letter.letterReference}</p>
            <p><strong>Approval Status:</strong> ${letter.status}</p>
            <p><strong>Approval Date:</strong> ${letter.approvalDate ? new Date(letter.approvalDate).toLocaleDateString() : 'Pending Approval'}</p>
            <p><strong>Approved By:</strong> ${letter.approvedBy || 'Director General'}</p>
            <p><strong>Notes:</strong> ${letter.notes || 'None'}</p>
          </div>

          <div>
            <h4 class="font-bold text-slate-900 uppercase tracking-wider text-xs mb-2">Mappings Included in this Letter</h4>
            <div class="border border-slate-200 rounded-lg overflow-hidden">
              <table class="w-full text-left text-xs">
                <thead class="bg-slate-100 text-slate-700 font-bold uppercase border-b border-slate-200">
                  <tr>
                    <th class="px-3 py-2">Ref Code</th>
                    <th class="px-3 py-2">Beneficiary</th>
                    <th class="px-3 py-2">Property</th>
                    <th class="px-3 py-2">Decision</th>
                    <th class="px-3 py-2">Allocated</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  ${letterMappings.map(m => `
                    <tr class="hover:bg-slate-50">
                      <td class="px-3 py-2 font-bold text-indigo-600">${m.referenceCode}</td>
                      <td class="px-3 py-2 font-medium">${m.beneficiary.fullName}</td>
                      <td class="px-3 py-2 text-slate-600">${m.property.address}</td>
                      <td class="px-3 py-2">${getStatusBadgeHtml(m.decisionStatus)}</td>
                      <td class="px-3 py-2">${m.isAllocated ? '✅ Allocated' : '⏳ Pending'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        <!-- Footer -->
        <div class="px-6 py-4 bg-slate-100 border-t border-slate-200 flex items-center justify-between">
          <button id="btn-print-letter" class="px-3 py-1.5 border border-slate-300 text-slate-700 hover:bg-white text-xs font-semibold rounded-lg flex items-center space-x-1">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap-link="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
            <span>Export / Print Letter</span>
          </button>

          <div class="flex items-center space-x-2">
            ${letter.status === 'DRAFT' ? `
              <button id="btn-cancel-letter-action" class="px-3 py-1.5 border border-rose-300 text-rose-700 hover:bg-rose-50 text-xs font-semibold rounded-lg">
                Cancel Letter
              </button>
              <button id="btn-approve-letter-action" class="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-sm flex items-center space-x-1">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap-link="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                <span>Approve Letter & Execute Allocations</span>
              </button>
            ` : ''}

            <button id="btn-close-letter-detail" class="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold rounded-lg">
              Close
            </button>
          </div>
        </div>

      </div>
    </div>
  `;

  document.getElementById('btn-close-letter-detail-modal')?.addEventListener('click', closeModal);
  document.getElementById('btn-close-letter-detail')?.addEventListener('click', closeModal);

  document.getElementById('btn-print-letter')?.addEventListener('click', () => {
    window.print();
  });

  document.getElementById('btn-approve-letter-action')?.addEventListener('click', async () => {
    if (confirm('Approving this letter will automatically allocate ALL mappings included in this letter and mark properties as OCCUPIED. Continue?')) {
      try {
        await store.apiService.patch(`/allocation-decision-letters/${letterId}/approve`);
        closeModal();
        store.notify();
      } catch (err: any) {
        alert('Failed to approve decision letter: ' + (err.message || 'Unknown error'));
      }
    }
  });

  document.getElementById('btn-cancel-letter-action')?.addEventListener('click', async () => {
    if (confirm('Are you sure you want to cancel this decision letter? The contained mappings will be unlinked.')) {
      try {
        await store.apiService.delete(`/allocation-decision-letters/${letterId}/cancel`);
        closeModal();
        store.notify();
      } catch (err: any) {
        alert('Failed to cancel decision letter: ' + (err.message || 'Unknown error'));
      }
    }
  });
}

/**
 * 7. PROPERTY PREVIEW & MAP MODAL
 */
export function openPropertyPreviewModal(suggestion: SuggestionResult, beneficiary: any): void {
  const container = getOrCreateModalContainer();
  const prop = suggestion.property;

  container.innerHTML = `
    <div class="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-white rounded-xl shadow-2xl max-w-xl w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-200">
        
        <div class="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div>
            <h3 class="text-base font-bold">Property Suggestion Preview</h3>
            <p class="text-xs text-slate-300">Matching preview for ${beneficiary.fullName}</p>
          </div>
          <button id="btn-close-preview-modal" class="text-slate-400 hover:text-white">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap-link="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div class="p-6 space-y-4 text-xs text-slate-800">
          
          <div class="flex items-center justify-between p-3 bg-indigo-50 border border-indigo-100 rounded-xl">
            <div>
              <span class="text-indigo-900 font-bold text-sm block">Match Quality Score</span>
              <span class="text-indigo-700">Calculated by FHC Allocation Engine</span>
            </div>
            <div class="text-2xl font-black text-indigo-600">${suggestion.score}%</div>
          </div>

          <div class="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
            <p class="text-sm font-bold text-slate-900">${prop.address}</p>
            <div class="grid grid-cols-2 gap-2 text-slate-600">
              <p><strong>Property Type:</strong> ${prop.propertyType}</p>
              <p><strong>Bedrooms:</strong> ${prop.bedrooms} Beds</p>
              <p><strong>Monthly Rent:</strong> ${prop.monthlyRent ? `${prop.monthlyRent.toLocaleString()} ETB` : 'N/A'}</p>
              <p><strong>Subcity:</strong> ${prop.subcity || 'Addis Ababa'}</p>
            </div>
          </div>

          <div>
            <span class="font-bold text-slate-900 block mb-1.5">Match Analysis Reasons</span>
            <div class="space-y-1">
              ${suggestion.matchReasons.map(r => `
                <div class="p-2 rounded bg-slate-100 text-slate-700 font-medium">${r}</div>
              `).join('')}
            </div>
          </div>

          <div class="pt-3 border-t border-slate-200 flex justify-end space-x-2">
            <button type="button" id="btn-cancel-preview" class="px-3 py-1.5 border border-slate-300 text-xs font-medium rounded-lg hover:bg-slate-50">Cancel</button>
            <button type="button" id="btn-confirm-map-preview" class="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-sm flex items-center space-x-1">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap-link="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
              <span>Confirm & Create Mapping</span>
            </button>
          </div>

        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-close-preview-modal')?.addEventListener('click', closeModal);
  document.getElementById('btn-cancel-preview')?.addEventListener('click', closeModal);

  document.getElementById('btn-confirm-map-preview')?.addEventListener('click', async () => {
    try {
      await store.apiService.post('/house-allocation-mappings', {
        beneficiaryId: beneficiary.id,
        beneficiary: beneficiary,
        propertyId: prop.id,
        requestId: beneficiary.requestId,
        requestReference: beneficiary.requestId,
        matchScore: suggestion.score,
        notes: `Mapped via property suggestions preview (${suggestion.score}% match)`,
      });

      closeModal();
      store.notify();
    } catch (err: any) {
      alert('Failed to create mapping: ' + (err.message || 'Unknown error'));
    }
  });
}
