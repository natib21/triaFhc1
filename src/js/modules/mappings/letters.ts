import { Table } from '../../components';
import { store } from '../../store';

type LetterStatus = 'DRAFT' | 'APPROVED';
type LetterFilter = 'ALL' | LetterStatus;

interface AllocationDecisionLetter {
  id: string;
  letterReference: string;
  letterDate: string;
  approvalDate: string | null;
  regulationReference: string;
  regulationArticle: string;
  committeeSessionNumber: string | null;
  committeeSessionDate: string | null;
  decisionNotes: string | null;
  summary: string | null;
  mappings?: any[];
  mappingCount?: number | null;
  createdAt: string;
  updatedAt: string;
}

interface EligibleMappingRow {
  id: string;
  reference: string;
  beneficiaryName: string;
  propertyLabel: string;
  decisionStatus: string;
  decisionLetterReference: string | null;
  reversedAt: string | null;
}

interface LetterTableRow {
  id: string;
  letterReference: string;
  letterDate: string;
  regulationReference: string;
  regulationArticle: string;
  committeeSessionNumber: string | null;
  committeeSessionDate: string | null;
  summary: string | null;
  status: LetterStatus;
  mappingCount: number | null;
}

let activeListeners: { element: Element | Document | Window; type: string; handler: EventListener }[] = [];
let activeContainer: HTMLElement | null = null;
let currentFilter: LetterFilter = 'ALL';
let currentSearchQuery = '';
let selectedLetterIds = new Set<string>();
let lettersCache: AllocationDecisionLetter[] = [];
let eligibleMappingsCount: number | null = null;
let mappingCountCache = new Map<string, number>();

function addManagedListener(element: Element | Document | Window | null, type: string, handler: EventListener) {
  if (element) {
    element.addEventListener(type, handler);
    activeListeners.push({ element, type, handler });
  }
}

export function cleanupLetters(): void {
  activeListeners.forEach(({ element, type, handler }) => {
    element.removeEventListener(type, handler);
  });
  activeListeners = [];
  selectedLetterIds.clear();
}

function getLetterStatus(letter: AllocationDecisionLetter): LetterStatus {
  return letter.approvalDate ? 'APPROVED' : 'DRAFT';
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return escapeHtml(value);
  }
  return date.toLocaleDateString();
}

function getTodayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function getErrorMessage(error: any): string {
  if (!error) return 'Unknown error';
  const raw = typeof error?.message === 'string' ? error.message : String(error);

  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'string') return parsed;
    if (parsed?.message) {
      if (Array.isArray(parsed.message)) return parsed.message.join('\n');
      return String(parsed.message);
    }
    return JSON.stringify(parsed);
  } catch {
    return raw;
  }
}

function getNameParts(person: any): string[] {
  if (!person) return [];
  const first = person.firstName?.en || person.firstName?.am || person.firstName || '';
  const middle = person.middleName?.en || person.middleName?.am || person.middleName || '';
  const last = person.lastName?.en || person.lastName?.am || person.lastName || '';
  return [first, middle, last].map((part) => String(part || '').trim()).filter(Boolean);
}

function getMappingReference(mapping: any): string {
  return (
    mapping?.referenceCode ||
    mapping?.mapReference ||
    mapping?.reference ||
    mapping?.code ||
    (mapping?.id ? `MAP-${String(mapping.id).slice(0, 8)}` : '—')
  );
}

function getBeneficiaryName(mapping: any): string {
  const direct =
    mapping?.beneficiaryFullName ||
    mapping?.beneficiaryName ||
    mapping?.beneficiary?.fullName ||
    mapping?.beneficiary?.name;
  if (direct) return String(direct);

  const nestedIndividual = mapping?.beneficiary?.beneficiaryIndividual || mapping?.beneficiaryIndividual;
  const nameParts = getNameParts(nestedIndividual);
  return nameParts.join(' ') || '—';
}

function getPropertyLabel(mapping: any): string {
  const property = mapping?.property || {};
  const houseNumber = property.houseNumber || mapping?.propertyHouseNumber;
  const buildingName = property?.building?.name?.en || property?.building?.name?.am || property?.building?.name;
  const address = property.address || buildingName || mapping?.propertyLocation?.en || mapping?.propertyLocation?.am;
  if (houseNumber && address) return `${houseNumber} • ${address}`;
  return houseNumber || address || '—';
}

function getDecisionLetterReference(mapping: any): string | null {
  return (
    mapping?.decisionLetter?.letterReference ||
    mapping?.decisionLetterReference ||
    mapping?.decisionLetter?.reference ||
    mapping?.decisionLetter?.id ||
    mapping?.decisionLetterId ||
    null
  );
}

function normalizeEligibleMapping(mapping: any): EligibleMappingRow {
  return {
    id: String(mapping?.id || ''),
    reference: getMappingReference(mapping),
    beneficiaryName: getBeneficiaryName(mapping),
    propertyLabel: getPropertyLabel(mapping),
    decisionStatus: String(mapping?.decisionStatus || mapping?.decision || '').toUpperCase(),
    decisionLetterReference: getDecisionLetterReference(mapping),
    reversedAt: mapping?.reversedAt || null,
  };
}

function getLetterCount(letter: any): number | null {
  if (Array.isArray(letter?.mappings)) return letter.mappings.length;
  if (typeof letter?.mappingCount === 'number') return letter.mappingCount;
  if (typeof letter?.mappingsCount === 'number') return letter.mappingsCount;
  if (typeof letter?.mapping_count === 'number') return letter.mapping_count;
  return null;
}

function normalizeLetter(letter: any): AllocationDecisionLetter {
  const mappingCount = getLetterCount(letter);

  return {
    id: String(letter?.id || ''),
    letterReference: String(letter?.letterReference || letter?.reference || '—'),
    letterDate: String(letter?.letterDate || letter?.date || ''),
    approvalDate: letter?.approvalDate || null,
    regulationReference: String(letter?.regulationReference || ''),
    regulationArticle: String(letter?.regulationArticle || ''),
    committeeSessionNumber: letter?.committeeSessionNumber || null,
    committeeSessionDate: letter?.committeeSessionDate || null,
    decisionNotes: letter?.decisionNotes || letter?.notes || null,
    summary: letter?.summary || null,
    mappings: Array.isArray(letter?.mappings) ? letter.mappings : undefined,
    mappingCount,
    createdAt: String(letter?.createdAt || ''),
    updatedAt: String(letter?.updatedAt || letter?.createdAt || ''),
  };
}

function normalizeLetterListResponse(response: any): AllocationDecisionLetter[] {
  const items = Array.isArray(response)
    ? response
    : Array.isArray(response?.items)
      ? response.items
      : Array.isArray(response?.data)
        ? response.data
        : [];

  return items.map(normalizeLetter);
}

function getStatusBadgeHtml(status: LetterStatus): string {
  const config =
    status === 'APPROVED'
      ? {
          label: 'Approved',
          classes: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          dot: 'bg-emerald-500',
        }
      : {
          label: 'Draft',
          classes: 'bg-slate-50 text-slate-700 border-slate-200',
          dot: 'bg-slate-400',
        };

  return `
    <span class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${config.classes}">
      <span class="h-1.5 w-1.5 rounded-full ${config.dot}"></span>
      ${config.label}
    </span>
  `;
}

function getMappingStatusBadgeHtml(status: string): string {
  const normalized = String(status || '').toUpperCase();

  if (normalized === 'APPROVED') {
    return '<span class="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Approved</span>';
  }

  if (normalized === 'REJECTED') {
    return '<span class="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">Rejected</span>';
  }

  return '<span class="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Pending</span>';
}

function setSelectionForVisibleRows(rows: LetterTableRow[], checked: boolean) {
  rows.forEach((row) => {
    if (checked) {
      selectedLetterIds.add(row.id);
    } else {
      selectedLetterIds.delete(row.id);
    }
  });
}

function updateSelectionUI(rows: LetterTableRow[]) {
  const ids = rows.map((row) => row.id);
  const selectedVisibleCount = ids.filter((id) => selectedLetterIds.has(id)).length;
  const totalSelected = selectedLetterIds.size;
  const selectedDraftCount = rows.filter((row) => selectedLetterIds.has(row.id) && row.status === 'DRAFT').length;

  const selectAll = document.getElementById('letters-select-all') as HTMLInputElement | null;
  if (selectAll) {
    selectAll.checked = ids.length > 0 && selectedVisibleCount === ids.length;
    selectAll.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < ids.length;
  }

  const selectedCount = document.getElementById('letters-selected-count');
  if (selectedCount) {
    selectedCount.textContent = `${totalSelected} selected`;
  }

  const approveBtn = document.getElementById('btn-bulk-approve-letters') as HTMLButtonElement | null;
  if (approveBtn) {
    approveBtn.disabled = selectedDraftCount === 0;
  }

  const cancelBtn = document.getElementById('btn-bulk-cancel-letters') as HTMLButtonElement | null;
  if (cancelBtn) {
    cancelBtn.disabled = selectedDraftCount === 0;
  }
}

async function fetchEligibleMappings(): Promise<EligibleMappingRow[]> {
  let response: any;

  try {
    response = await store.apiService.get<any>('/house-allocation-mappings/status/approved');
  } catch (error) {
    response = await store.apiService.get<any>('/house-allocation-mappings');
  }

  const items = Array.isArray(response)
    ? response
    : Array.isArray(response?.items)
      ? response.items
      : Array.isArray(response?.data)
        ? response.data
        : [];

  return items
    .map(normalizeEligibleMapping)
    .filter((mapping) => mapping.id)
    .filter((mapping) => mapping.decisionStatus === 'APPROVED')
    .filter((mapping) => !mapping.reversedAt)
    .filter((mapping) => !mapping.decisionLetterReference);
}

async function fetchLetterMappings(letterId: string): Promise<any[]> {
  const response = await store.apiService.get<any>(`/allocation-decision-letters/${letterId}/mappings`);
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.items)) return response.items;
  if (Array.isArray(response?.data)) return response.data;
  return [];
}

async function refreshView() {
  if (activeContainer) {
    await renderLetters(activeContainer);
  }
}

function removeModal(modalId: string) {
  document.getElementById(modalId)?.remove();
}

function openConfirmationModal(options: {
  modalId: string;
  title: string;
  message: string;
  confirmText: string;
  confirmButtonClassName: string;
  onConfirm: () => Promise<void>;
}) {
  removeModal(options.modalId);

  const overlay = document.createElement('div');
  overlay.id = options.modalId;
  overlay.className = 'fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm';
  overlay.innerHTML = `
    <div class="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <div class="border-b border-slate-200 px-6 py-4">
        <h3 class="text-lg font-bold text-slate-900">${escapeHtml(options.title)}</h3>
        <p class="mt-1 text-sm text-slate-500">${escapeHtml(options.message)}</p>
      </div>
      <div class="flex items-center justify-end gap-3 px-6 py-4">
        <button type="button" data-action="cancel" class="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50">
          Cancel
        </button>
        <button type="button" data-action="confirm" class="rounded-lg px-4 py-2 text-xs font-bold text-white transition-colors ${options.confirmButtonClassName}">
          ${escapeHtml(options.confirmText)}
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  const confirmBtn = overlay.querySelector('[data-action="confirm"]') as HTMLButtonElement | null;

  overlay.querySelector('[data-action="cancel"]')?.addEventListener('click', close);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });

  confirmBtn?.addEventListener('click', async () => {
    if (!confirmBtn) return;
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Processing...';

    try {
      await options.onConfirm();
      close();
    } catch (error: any) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = options.confirmText;
      alert(getErrorMessage(error));
    }
  });
}

async function approveLetter(letter: AllocationDecisionLetter, mappingCount: number | null) {
  await store.apiService.patch(`/allocation-decision-letters/${letter.id}/approve`);
  await refreshView();
  (store as any).notify?.();
  alert(`Approved ${letter.letterReference}${mappingCount !== null ? ` and allocated ${mappingCount} mapping(s).` : '.'}`);
}

async function cancelLetter(letter: AllocationDecisionLetter) {
  await store.apiService.patch(`/allocation-decision-letters/${letter.id}/cancel`);
  removeModal('letter-detail-overlay');
  selectedLetterIds.delete(letter.id);
  await refreshView();
  (store as any).notify?.();
}

async function handleBulkApprove(rows: LetterTableRow[]) {
  const selectedDraftRows = rows.filter((row) => selectedLetterIds.has(row.id) && row.status === 'DRAFT');
  if (!selectedDraftRows.length) return;

  openConfirmationModal({
    modalId: 'bulk-approve-letters-overlay',
    title: 'Approve Selected Letters',
    message: `Approve ${selectedDraftRows.length} draft letter(s)?`,
    confirmText: 'Approve Selected',
    confirmButtonClassName: 'bg-emerald-600 hover:bg-emerald-700',
    onConfirm: async () => {
      const failures: string[] = [];

      for (const row of selectedDraftRows) {
        try {
          await store.apiService.patch(`/allocation-decision-letters/${row.id}/approve`);
        } catch (error: any) {
          failures.push(`${row.letterReference}: ${getErrorMessage(error)}`);
        }
      }

      selectedLetterIds.clear();
      await refreshView();
      (store as any).notify?.();

      if (failures.length) {
        alert(`Some letters could not be approved:\n${failures.join('\n')}`);
      }
    },
  });
}

async function handleBulkCancel(rows: LetterTableRow[]) {
  const selectedDraftRows = rows.filter((row) => selectedLetterIds.has(row.id) && row.status === 'DRAFT');
  if (!selectedDraftRows.length) return;

  openConfirmationModal({
    modalId: 'bulk-cancel-letters-overlay',
    title: 'Cancel Selected Letters',
    message: `Cancel ${selectedDraftRows.length} draft letter(s)? Attached mappings will be released.`,
    confirmText: 'Cancel Selected',
    confirmButtonClassName: 'bg-rose-600 hover:bg-rose-700',
    onConfirm: async () => {
      const failures: string[] = [];

      for (const row of selectedDraftRows) {
        try {
          await store.apiService.patch(`/allocation-decision-letters/${row.id}/cancel`);
        } catch (error: any) {
          failures.push(`${row.letterReference}: ${getErrorMessage(error)}`);
        }
      }

      selectedLetterIds.clear();
      removeModal('letter-detail-overlay');
      await refreshView();
      (store as any).notify?.();

      if (failures.length) {
        alert(`Some letters could not be cancelled:\n${failures.join('\n')}`);
      }
    },
  });
}

function renderLetterTable(rows: LetterTableRow[]) {
  Table.render<LetterTableRow>({
    containerId: 'letters-table-container',
    data: rows,
    placeholderText: 'Search decision letters...',
    searchValue: currentSearchQuery,
    onSearch: (query) => {
      currentSearchQuery = query;
      if (activeContainer) {
        renderLetters(activeContainer);
      }
    },
    emptyMessage: 'No decision letters match the current filters.',
    rowClassName: (item) => (item.status === 'APPROVED' ? 'bg-emerald-50/20 hover:bg-emerald-50/40' : 'bg-white hover:bg-slate-50'),
    columns: [
      {
        header: '<input id="letters-select-all" type="checkbox" class="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />',
        key: 'id',
        render: (item) => `
          <input
            type="checkbox"
            class="letters-row-checkbox h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            data-id="${escapeHtml(item.id)}"
            ${selectedLetterIds.has(item.id) ? 'checked' : ''}
          />
        `,
      },
      {
        header: 'Letter Reference',
        key: 'letterReference',
        sortable: true,
        render: (item) => `
          <div class="space-y-1">
            <div class="font-mono text-sm font-bold text-slate-900">${escapeHtml(item.letterReference)}</div>
            <div class="text-xs text-slate-500">${formatDate(item.letterDate)}</div>
          </div>
        `,
      },
      {
        header: 'Regulation',
        key: 'regulationReference',
        render: (item) => `
          <div class="space-y-1">
            <div class="text-sm font-semibold text-slate-800">${escapeHtml(item.regulationReference || '—')}</div>
            <div class="text-xs text-slate-500">Art. ${escapeHtml(item.regulationArticle || '—')}</div>
          </div>
        `,
      },
      {
        header: 'Committee Session',
        key: 'committeeSessionNumber',
        render: (item) => `
          <div class="space-y-1">
            <div class="text-sm font-semibold text-slate-800">${escapeHtml(item.committeeSessionNumber || '—')}</div>
            <div class="text-xs text-slate-500">${formatDate(item.committeeSessionDate)}</div>
          </div>
        `,
      },
      {
        header: 'Status',
        key: 'status',
        render: (item) => getStatusBadgeHtml(item.status),
      },
      {
        header: 'Mapping Count',
        key: 'mappingCount',
        render: (item) => {
          if (typeof item.mappingCount === 'number') {
            return `<span class="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">${item.mappingCount}</span>`;
          }

          return `
            <button
              type="button"
              class="letters-action text-xs font-semibold text-indigo-600 underline-offset-2 hover:underline"
              data-action="load-count"
              data-id="${escapeHtml(item.id)}"
            >
              View
            </button>
          `;
        },
      },
      {
        header: 'Summary',
        key: 'summary',
        render: (item) => {
          const summary = item.summary || '—';
          const truncated = summary.length > 72 ? `${summary.slice(0, 72)}...` : summary;
          return `<span class="block max-w-xs truncate text-sm text-slate-600" title="${escapeHtml(summary)}">${escapeHtml(truncated)}</span>`;
        },
      },
      {
        header: 'Actions',
        key: 'id',
        render: (item) => `
          <details class="dropdown-container relative group">
            <summary class="list-none cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700">
              <i class="fa-solid fa-ellipsis-vertical text-sm"></i>
            </summary>

            <div class="dropdown-menu absolute right-0 z-[90] mt-2 w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
              <button type="button" class="letters-action flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50" data-action="view" data-id="${escapeHtml(item.id)}">
                <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                  <i class="fa-regular fa-eye text-[11px]"></i>
                </span>
                View Details
              </button>
              ${item.status === 'DRAFT' ? `
                <button type="button" class="letters-action flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-50" data-action="approve" data-id="${escapeHtml(item.id)}">
                  <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
                    <i class="fa-solid fa-circle-check text-[11px]"></i>
                  </span>
                  Approve
                </button>
                <button type="button" class="letters-action flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-rose-700 transition-colors hover:bg-rose-50" data-action="cancel" data-id="${escapeHtml(item.id)}">
                  <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-100 text-rose-600">
                    <i class="fa-regular fa-circle-xmark text-[11px]"></i>
                  </span>
                  Cancel Letter
                </button>
              ` : ''}
            </div>
          </details>
        `,
      },
    ],
  });
}

function attachTableListeners(rows: LetterTableRow[]) {
  addManagedListener(document, 'click', ((event: Event) => {
    const target = event.target as HTMLElement;
    if (!target.closest('.dropdown-container')) {
      document.querySelectorAll('.dropdown-container[open]').forEach((details) => {
        (details as HTMLDetailsElement).removeAttribute('open');
      });
    }
  }) as EventListener);

  const selectAll = document.getElementById('letters-select-all') as HTMLInputElement | null;
  addManagedListener(selectAll, 'change', ((event: Event) => {
    setSelectionForVisibleRows(rows, (event.currentTarget as HTMLInputElement).checked);
    document.querySelectorAll<HTMLInputElement>('.letters-row-checkbox').forEach((checkbox) => {
      const id = checkbox.dataset.id;
      if (!id) return;
      checkbox.checked = selectedLetterIds.has(id);
    });
    updateSelectionUI(rows);
  }) as EventListener);

  document.querySelectorAll('.letters-row-checkbox').forEach((checkbox) => {
    addManagedListener(checkbox, 'change', ((event: Event) => {
      const input = event.currentTarget as HTMLInputElement;
      const id = input.dataset.id;
      if (!id) return;

      if (input.checked) {
        selectedLetterIds.add(id);
      } else {
        selectedLetterIds.delete(id);
      }

      updateSelectionUI(rows);
    }) as EventListener);
  });

  document.querySelectorAll('.letters-action').forEach((button) => {
    addManagedListener(button, 'click', ((event: Event) => {
      event.preventDefault();
      event.stopPropagation();

      const target = event.currentTarget as HTMLElement;
      const action = target.dataset.action;
      const id = target.dataset.id;
      if (!action || !id) return;

      const row = rows.find((item) => item.id === id);
      const letter = lettersCache.find((item) => item.id === id);
      target.closest('details')?.removeAttribute('open');

      if (!row || !letter) return;

      if (action === 'view') {
        openLetterDetailModal(letter.id);
        return;
      }

      if (action === 'load-count') {
        void (async () => {
          try {
            const mappings = await fetchLetterMappings(letter.id);
            mappingCountCache.set(letter.id, mappings.length);
            await refreshView();
          } catch (error: any) {
            alert(getErrorMessage(error));
          }
        })();
        return;
      }

      if (action === 'approve') {
        openConfirmationModal({
          modalId: 'approve-letter-overlay',
          title: 'Approve Letter',
          message: `This will allocate ${row.mappingCount ?? 'all attached'} mapping(s) and approve letter ${row.letterReference}.`,
          confirmText: 'Approve Letter',
          confirmButtonClassName: 'bg-emerald-600 hover:bg-emerald-700',
          onConfirm: async () => approveLetter(letter, row.mappingCount),
        });
        return;
      }

      if (action === 'cancel') {
        openConfirmationModal({
          modalId: 'cancel-letter-overlay',
          title: 'Cancel Letter',
          message: `Cancel ${row.letterReference}? Attached mappings will be released for a new letter.`,
          confirmText: 'Cancel Letter',
          confirmButtonClassName: 'bg-rose-600 hover:bg-rose-700',
          onConfirm: async () => cancelLetter(letter),
        });
      }
    }) as EventListener);
  });

  updateSelectionUI(rows);
}

function renderStatsCards(totalLetters: number, draftCount: number, approvedCount: number): string {
  const extraCard = eligibleMappingsCount !== null
    ? `
      <div class="flex items-center justify-between rounded-xl border border-indigo-200 bg-white p-5 shadow-sm">
        <div>
          <span class="block text-xs font-semibold uppercase tracking-wider text-indigo-700">Ready For Letter</span>
          <span class="mt-1 block text-2xl font-black text-indigo-900">${eligibleMappingsCount}</span>
        </div>
        <div class="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
          <i class="fa-regular fa-folder-open text-lg"></i>
        </div>
      </div>
    `
    : '';

  return `
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 ${eligibleMappingsCount !== null ? 'xl:grid-cols-4' : 'lg:grid-cols-3'}">
      <div class="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <span class="block text-xs font-semibold uppercase tracking-wider text-slate-500">Total Letters</span>
          <span class="mt-1 block text-2xl font-black text-slate-900">${totalLetters}</span>
        </div>
        <div class="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
          <i class="fa-regular fa-file-lines text-lg"></i>
        </div>
      </div>
      <div class="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <span class="block text-xs font-semibold uppercase tracking-wider text-slate-700">Draft</span>
          <span class="mt-1 block text-2xl font-black text-slate-900">${draftCount}</span>
        </div>
        <div class="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-50 text-slate-600">
          <i class="fa-regular fa-pen-to-square text-lg"></i>
        </div>
      </div>
      <div class="flex items-center justify-between rounded-xl border border-emerald-200 bg-white p-5 shadow-sm">
        <div>
          <span class="block text-xs font-semibold uppercase tracking-wider text-emerald-700">Approved</span>
          <span class="mt-1 block text-2xl font-black text-emerald-900">${approvedCount}</span>
        </div>
        <div class="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
          <i class="fa-solid fa-circle-check text-lg"></i>
        </div>
      </div>
      ${extraCard}
    </div>
  `;
}

function renderLetterLayout(rows: LetterTableRow[]) {
  const totalLetters = lettersCache.length;
  const draftCount = lettersCache.filter((letter) => getLetterStatus(letter) === 'DRAFT').length;
  const approvedCount = lettersCache.filter((letter) => getLetterStatus(letter) === 'APPROVED').length;

  if (!activeContainer) return;

  activeContainer.innerHTML = `
    <div class="space-y-6 pb-12 animate-in fade-in duration-200">
      <div class="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm md:flex-row md:items-center">
        <div>
          <h1 class="text-2xl font-bold text-slate-900">Decision Letters</h1>
          <p class="mt-1 text-sm text-slate-500">Create, approve, and review allocation decision letters for approved housing mappings.</p>
        </div>
        <button id="btn-open-create-letter" class="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-indigo-700">
          <i class="fa-solid fa-plus text-[11px]"></i>
          Create Letter
        </button>
      </div>

      ${renderStatsCards(totalLetters, draftCount, approvedCount)}

      <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div class="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            <button type="button" data-filter="ALL" class="letter-filter-btn rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${currentFilter === 'ALL' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}">
              All (${totalLetters})
            </button>
            <button type="button" data-filter="DRAFT" class="letter-filter-btn rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${currentFilter === 'DRAFT' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}">
              Draft (${draftCount})
            </button>
            <button type="button" data-filter="APPROVED" class="letter-filter-btn rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${currentFilter === 'APPROVED' ? 'bg-white text-emerald-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}">
              Approved (${approvedCount})
            </button>
          </div>

          <div class="relative w-full lg:max-w-sm">
            <i class="fa-solid fa-magnifying-glass pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400"></i>
            <input
              id="letters-search-input"
              type="text"
              value="${escapeHtml(currentSearchQuery)}"
              placeholder="Search by letter, regulation, or session..."
              class="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
        </div>
      </div>

      <div class="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <span id="letters-selected-count" class="text-xs font-semibold text-slate-600">0 selected</span>
        <div class="flex flex-wrap items-center gap-2">
          <button id="btn-bulk-approve-letters" type="button" disabled class="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40">
            Approve Selected
          </button>
          <button id="btn-bulk-cancel-letters" type="button" disabled class="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40">
            Cancel Selected
          </button>
        </div>
      </div>

      <div id="letters-table-container" class="overflow-x-auto"></div>
    </div>
  `;

  renderLetterTable(rows);
  attachTableListeners(rows);

  addManagedListener(document.getElementById('btn-open-create-letter'), 'click', (() => {
    void openCreateLetterModal();
  }) as EventListener);

  document.querySelectorAll('.letter-filter-btn').forEach((button) => {
    addManagedListener(button, 'click', ((event: Event) => {
      currentFilter = ((event.currentTarget as HTMLElement).dataset.filter as LetterFilter) || 'ALL';
      if (activeContainer) {
        renderLetters(activeContainer);
      }
    }) as EventListener);
  });

  const searchInput = document.getElementById('letters-search-input') as HTMLInputElement | null;
  if (searchInput) {
    let searchDebounce: number | undefined;

    addManagedListener(searchInput, 'input', ((event: Event) => {
      window.clearTimeout(searchDebounce);
      searchDebounce = window.setTimeout(() => {
        currentSearchQuery = (event.target as HTMLInputElement).value.trim();
        if (activeContainer) {
          renderLetters(activeContainer);
        }
      }, 200);
    }) as EventListener);
  }

  addManagedListener(document.getElementById('btn-bulk-approve-letters'), 'click', (() => {
    void handleBulkApprove(rows);
  }) as EventListener);

  addManagedListener(document.getElementById('btn-bulk-cancel-letters'), 'click', (() => {
    void handleBulkCancel(rows);
  }) as EventListener);
}

function filterLetters(): LetterTableRow[] {
  const query = currentSearchQuery.toLowerCase();

  const rows = lettersCache
    .map((letter) => {
      const cachedCount = mappingCountCache.get(letter.id);
      const status = getLetterStatus(letter);
      const mappingCount = typeof cachedCount === 'number' ? cachedCount : letter.mappingCount ?? null;

      return {
        id: letter.id,
        letterReference: letter.letterReference,
        letterDate: letter.letterDate,
        regulationReference: letter.regulationReference,
        regulationArticle: letter.regulationArticle,
        committeeSessionNumber: letter.committeeSessionNumber,
        committeeSessionDate: letter.committeeSessionDate,
        summary: letter.summary,
        status,
        mappingCount,
      };
    })
    .filter((row) => currentFilter === 'ALL' || row.status === currentFilter)
    .filter((row) => {
      if (!query) return true;

      return [
        row.letterReference,
        row.regulationReference,
        row.committeeSessionNumber || '',
      ].some((value) => String(value || '').toLowerCase().includes(query));
    });

  const visibleIds = new Set(lettersCache.map((letter) => letter.id));
  selectedLetterIds = new Set(Array.from(selectedLetterIds).filter((id) => visibleIds.has(id)));

  return rows;
}

export async function renderLetters(container: HTMLElement): Promise<void> {
  activeContainer = container;
  cleanupLetters();

  container.innerHTML = `
    <div class="flex h-64 flex-col items-center justify-center space-y-3">
      <div class="h-8 w-8 animate-spin rounded-full border-b-2 border-indigo-600"></div>
      <span class="text-sm font-medium text-slate-600">Loading decision letters...</span>
    </div>
  `;

  try {
    const [lettersResponse, eligibleMappings] = await Promise.all([
      store.apiService.get<any>('/allocation-decision-letters'),
      fetchEligibleMappings().catch(() => null),
    ]);

    lettersCache = normalizeLetterListResponse(lettersResponse);
    eligibleMappingsCount = eligibleMappings ? eligibleMappings.length : null;

    const rows = filterLetters();
    renderLetterLayout(rows);
  } catch (error: any) {
    container.innerHTML = `
      <div class="rounded-xl border border-rose-200 bg-white p-12 text-center shadow-sm">
        <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 text-rose-600">
          <i class="fa-solid fa-triangle-exclamation text-xl"></i>
        </div>
        <h2 class="mt-4 text-lg font-bold text-slate-900">Failed to load decision letters</h2>
        <p class="mt-2 text-sm text-rose-600">${escapeHtml(getErrorMessage(error))}</p>
        <button id="btn-retry-letters" class="mt-5 rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-rose-700">
          Retry
        </button>
      </div>
    `;

    addManagedListener(document.getElementById('btn-retry-letters'), 'click', (() => {
      void renderLetters(container);
    }) as EventListener);
  }
}

export const renderDecisionLetters = renderLetters;

export async function openLetterDetailModal(letterId: string): Promise<void> {
  removeModal('letter-detail-overlay');

  const overlay = document.createElement('div');
  overlay.id = 'letter-detail-overlay';
  overlay.className = 'fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-sm';
  overlay.innerHTML = `
    <div class="w-full max-w-6xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <div class="flex h-72 items-center justify-center">
        <div class="space-y-3 text-center">
          <div class="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-indigo-600"></div>
          <p class="text-sm text-slate-500">Loading letter details...</p>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  try {
    const [detailResponse, mappingsResponse] = await Promise.all([
      store.apiService.get<any>(`/allocation-decision-letters/${letterId}`),
      fetchLetterMappings(letterId),
    ]);

    const letter = normalizeLetter(detailResponse);
    const mappings = mappingsResponse.map(normalizeEligibleMapping);
    mappingCountCache.set(letter.id, mappings.length);

    overlay.innerHTML = `
      <div class="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div class="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <div class="flex flex-wrap items-center gap-3">
              <h3 class="text-xl font-bold text-slate-900">${escapeHtml(letter.letterReference)}</h3>
              ${getStatusBadgeHtml(getLetterStatus(letter))}
            </div>
            <p class="mt-1 text-sm text-slate-500">Letter date ${formatDate(letter.letterDate)} • ${mappings.length} mapping(s)</p>
          </div>
          <button type="button" id="btn-close-letter-detail" class="rounded-lg border border-slate-200 px-3 py-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div class="flex-1 space-y-6 overflow-y-auto px-6 py-6">
          <div class="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
            <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div class="text-xs font-semibold uppercase tracking-wider text-slate-500">Regulation</div>
              <div class="mt-2 text-sm font-semibold text-slate-900">${escapeHtml(letter.regulationReference || '—')}</div>
              <div class="mt-1 text-xs text-slate-500">Art. ${escapeHtml(letter.regulationArticle || '—')}</div>
            </div>
            <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div class="text-xs font-semibold uppercase tracking-wider text-slate-500">Committee Session</div>
              <div class="mt-2 text-sm font-semibold text-slate-900">${escapeHtml(letter.committeeSessionNumber || '—')}</div>
              <div class="mt-1 text-xs text-slate-500">${formatDate(letter.committeeSessionDate)}</div>
            </div>
            <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div class="text-xs font-semibold uppercase tracking-wider text-slate-500">Approval Date</div>
              <div class="mt-2 text-sm font-semibold text-slate-900">${formatDate(letter.approvalDate)}</div>
            </div>
            <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div class="text-xs font-semibold uppercase tracking-wider text-slate-500">Updated</div>
              <div class="mt-2 text-sm font-semibold text-slate-900">${formatDate(letter.updatedAt)}</div>
            </div>
          </div>

          <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div class="rounded-xl border border-slate-200 bg-white p-4">
              <div class="text-xs font-semibold uppercase tracking-wider text-slate-500">Summary</div>
              <p class="mt-2 text-sm text-slate-700">${escapeHtml(letter.summary || '—')}</p>
            </div>
            <div class="rounded-xl border border-slate-200 bg-white p-4">
              <div class="text-xs font-semibold uppercase tracking-wider text-slate-500">Decision Notes</div>
              <p class="mt-2 text-sm text-slate-700">${escapeHtml(letter.decisionNotes || '—')}</p>
            </div>
          </div>

          <div class="rounded-xl border border-slate-200 bg-white">
            <div class="border-b border-slate-200 px-4 py-3">
              <h4 class="text-sm font-bold text-slate-900">Mappings In This Letter</h4>
            </div>
            <div class="overflow-x-auto">
              <table class="min-w-full text-left text-sm">
                <thead class="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th class="px-4 py-3 font-bold">Reference</th>
                    <th class="px-4 py-3 font-bold">Beneficiary</th>
                    <th class="px-4 py-3 font-bold">House</th>
                    <th class="px-4 py-3 font-bold">Decision</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  ${mappings.length === 0 ? `
                    <tr>
                      <td colspan="4" class="px-4 py-8 text-center text-sm text-slate-500">No mappings were returned for this letter.</td>
                    </tr>
                  ` : mappings.map((mapping) => `
                    <tr class="hover:bg-slate-50">
                      <td class="px-4 py-3 font-mono text-sm font-semibold text-slate-900">${escapeHtml(mapping.reference)}</td>
                      <td class="px-4 py-3 text-slate-700">${escapeHtml(mapping.beneficiaryName)}</td>
                      <td class="px-4 py-3 text-slate-600">${escapeHtml(mapping.propertyLabel)}</td>
                      <td class="px-4 py-3">${getMappingStatusBadgeHtml(mapping.decisionStatus)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="flex flex-col justify-between gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 md:flex-row md:items-center">
          <div class="text-xs text-slate-500">Created ${formatDate(letter.createdAt)}</div>
          <div class="flex flex-wrap items-center gap-2">
            ${getLetterStatus(letter) === 'DRAFT' ? `
              <button type="button" id="btn-detail-cancel-letter" class="rounded-lg border border-rose-300 px-4 py-2 text-xs font-bold text-rose-700 transition-colors hover:bg-rose-50">
                Cancel Letter
              </button>
              <button type="button" id="btn-detail-approve-letter" class="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-emerald-700">
                Approve Letter
              </button>
            ` : ''}
            <button type="button" id="btn-detail-close-footer" class="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-white">
              Close
            </button>
          </div>
        </div>
      </div>
    `;

    const close = () => overlay.remove();

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close();
    });

    overlay.querySelector('#btn-close-letter-detail')?.addEventListener('click', close);
    overlay.querySelector('#btn-detail-close-footer')?.addEventListener('click', close);

    overlay.querySelector('#btn-detail-approve-letter')?.addEventListener('click', () => {
      openConfirmationModal({
        modalId: 'approve-letter-detail-overlay',
        title: 'Approve Letter',
        message: `This will allocate ${mappings.length} mapping(s) and approve letter ${letter.letterReference}.`,
        confirmText: 'Approve Letter',
        confirmButtonClassName: 'bg-emerald-600 hover:bg-emerald-700',
        onConfirm: async () => {
          close();
          await approveLetter(letter, mappings.length);
        },
      });
    });

    overlay.querySelector('#btn-detail-cancel-letter')?.addEventListener('click', () => {
      openConfirmationModal({
        modalId: 'cancel-letter-detail-overlay',
        title: 'Cancel Letter',
        message: `Cancel ${letter.letterReference}? Attached mappings will be released for reuse.`,
        confirmText: 'Cancel Letter',
        confirmButtonClassName: 'bg-rose-600 hover:bg-rose-700',
        onConfirm: async () => {
          close();
          await cancelLetter(letter);
        },
      });
    });
  } catch (error: any) {
    overlay.innerHTML = `
      <div class="w-full max-w-lg rounded-2xl border border-rose-200 bg-white p-8 shadow-2xl">
        <div class="text-center">
          <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 text-rose-600">
            <i class="fa-solid fa-triangle-exclamation text-xl"></i>
          </div>
          <h3 class="mt-4 text-lg font-bold text-slate-900">Failed to load letter details</h3>
          <p class="mt-2 text-sm text-rose-600">${escapeHtml(getErrorMessage(error))}</p>
          <button type="button" id="btn-close-letter-detail-error" class="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-slate-800">
            Close
          </button>
        </div>
      </div>
    `;

    overlay.querySelector('#btn-close-letter-detail-error')?.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) overlay.remove();
    });
  }
}

function renderCreateLetterPickerStep(overlay: HTMLElement, mappings: EligibleMappingRow[], selectedIds: Set<string>, onNext: (mappingIds: string[]) => void) {
  let currentPickerQuery = '';
  const close = () => overlay.remove();

  const render = () => {
    const filteredMappings = mappings.filter((mapping) => {
      if (!currentPickerQuery) return true;
      const query = currentPickerQuery.toLowerCase();

      return [
        mapping.reference,
        mapping.beneficiaryName,
        mapping.propertyLabel,
      ].some((value) => value.toLowerCase().includes(query));
    });

    const selectedVisibleCount = filteredMappings.filter((mapping) => selectedIds.has(mapping.id)).length;

    overlay.innerHTML = `
      <div class="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div class="border-b border-slate-200 px-6 py-5">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h3 class="text-lg font-bold text-slate-900">Create Letter</h3>
              <p class="mt-1 text-sm text-slate-500">Select approved mappings that are not already attached to another letter.</p>
            </div>
            <button type="button" id="btn-close-create-letter" class="rounded-lg border border-slate-200 px-3 py-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>

        <div class="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div class="relative w-full md:max-w-sm">
              <i class="fa-solid fa-magnifying-glass pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400"></i>
              <input id="letter-picker-search" type="text" value="${escapeHtml(currentPickerQuery)}" placeholder="Search approved mappings..." class="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" />
            </div>
            <div class="text-xs font-semibold text-slate-600">${selectedIds.size} selected</div>
          </div>

          <div class="overflow-hidden rounded-xl border border-slate-200">
            <div class="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <label class="inline-flex items-center gap-3">
                <input id="letter-picker-select-all" type="checkbox" class="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" ${filteredMappings.length > 0 && selectedVisibleCount === filteredMappings.length ? 'checked' : ''} />
                Select all visible
              </label>
              <span>${filteredMappings.length} mapping(s)</span>
            </div>

            <div class="max-h-[46vh] overflow-y-auto divide-y divide-slate-100">
              ${filteredMappings.length === 0 ? `
                <div class="px-4 py-12 text-center text-sm text-slate-500">No eligible mappings found.</div>
              ` : filteredMappings.map((mapping) => `
                <label class="flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-50">
                  <input type="checkbox" class="letter-picker-checkbox mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" data-id="${escapeHtml(mapping.id)}" ${selectedIds.has(mapping.id) ? 'checked' : ''} />
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="font-mono text-sm font-semibold text-slate-900">${escapeHtml(mapping.reference)}</span>
                      ${getMappingStatusBadgeHtml(mapping.decisionStatus)}
                    </div>
                    <div class="mt-1 text-sm font-medium text-slate-700">${escapeHtml(mapping.beneficiaryName)}</div>
                    <div class="mt-1 text-xs text-slate-500">${escapeHtml(mapping.propertyLabel)}</div>
                  </div>
                </label>
              `).join('')}
            </div>
          </div>
        </div>

        <div class="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <div class="text-xs text-slate-500">Only approved mappings without an existing letter are shown.</div>
          <div class="flex items-center gap-2">
            <button type="button" id="btn-cancel-create-letter" class="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-white">
              Cancel
            </button>
            <button type="button" id="btn-continue-create-letter" ${selectedIds.size === 0 ? 'disabled' : ''} class="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40">
              Continue
            </button>
          </div>
        </div>
      </div>
    `;

    overlay.onclick = (event) => {
      if (event.target === overlay) close();
    };

    overlay.querySelector('#btn-close-create-letter')?.addEventListener('click', close);
    overlay.querySelector('#btn-cancel-create-letter')?.addEventListener('click', close);

    overlay.querySelector('#letter-picker-search')?.addEventListener('input', (event) => {
      currentPickerQuery = (event.target as HTMLInputElement).value.trim();
      render();
    });

    overlay.querySelector('#letter-picker-select-all')?.addEventListener('change', (event) => {
      const checked = (event.currentTarget as HTMLInputElement).checked;
      filteredMappings.forEach((mapping) => {
        if (checked) {
          selectedIds.add(mapping.id);
        } else {
          selectedIds.delete(mapping.id);
        }
      });
      render();
    });

    overlay.querySelectorAll('.letter-picker-checkbox').forEach((checkbox) => {
      checkbox.addEventListener('change', (event) => {
        const input = event.currentTarget as HTMLInputElement;
        const id = input.dataset.id;
        if (!id) return;

        if (input.checked) {
          selectedIds.add(id);
        } else {
          selectedIds.delete(id);
        }

        render();
      });
    });

    overlay.querySelector('#btn-continue-create-letter')?.addEventListener('click', () => {
      if (selectedIds.size === 0) return;
      onNext(Array.from(selectedIds));
    });
  };

  render();
}

function renderCreateLetterFormStep(overlay: HTMLElement, mappingIds: string[]) {
  const state = {
    letterReference: '',
    letterDate: getTodayIsoDate(),
    regulationReference: '',
    regulationArticle: '',
    committeeSessionNumber: '',
    committeeSessionDate: '',
    summary: '',
    decisionNotes: '',
    errorText: '',
    isSaving: false,
  };
  const close = () => overlay.remove();

  const render = () => {
    overlay.innerHTML = `
      <div class="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div class="border-b border-slate-200 px-6 py-5">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h3 class="text-lg font-bold text-slate-900">Create Letter</h3>
              <p class="mt-1 text-sm text-slate-500">Enter the required regulation and committee details for this decision letter.</p>
            </div>
            <button type="button" id="btn-close-create-letter-form" class="rounded-lg border border-slate-200 px-3 py-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>

        <form id="create-letter-form" class="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          ${state.errorText ? `
            <div class="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">${escapeHtml(state.errorText)}</div>
          ` : ''}

          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label class="mb-1 block text-xs font-semibold text-slate-700">Letter Reference <span class="text-rose-500">*</span></label>
              <input id="letter-reference" type="text" required value="${escapeHtml(state.letterReference)}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" placeholder="e.g. HAL-2024-001" />
            </div>
            <div>
              <label class="mb-1 block text-xs font-semibold text-slate-700">Letter Date <span class="text-rose-500">*</span></label>
              <input id="letter-date" type="date" required value="${escapeHtml(state.letterDate)}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" />
            </div>
          </div>

          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label class="mb-1 block text-xs font-semibold text-slate-700">Regulation Reference <span class="text-rose-500">*</span></label>
              <input id="regulation-reference" type="text" required value="${escapeHtml(state.regulationReference)}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" placeholder="e.g. 12/2016" />
            </div>
            <div>
              <label class="mb-1 block text-xs font-semibold text-slate-700">Regulation Article <span class="text-rose-500">*</span></label>
              <input id="regulation-article" type="text" required value="${escapeHtml(state.regulationArticle)}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" placeholder="e.g. 5" />
            </div>
          </div>

          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label class="mb-1 block text-xs font-semibold text-slate-700">Committee Session Number</label>
              <input id="committee-session-number" type="text" value="${escapeHtml(state.committeeSessionNumber)}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" placeholder="e.g. 15ኛ" />
            </div>
            <div>
              <label class="mb-1 block text-xs font-semibold text-slate-700">Committee Session Date</label>
              <input id="committee-session-date" type="date" value="${escapeHtml(state.committeeSessionDate)}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" />
            </div>
          </div>

          <div>
            <label class="mb-1 block text-xs font-semibold text-slate-700">Summary</label>
            <textarea id="letter-summary" rows="3" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" placeholder="Optional summary for the letter">${escapeHtml(state.summary)}</textarea>
          </div>

          <div>
            <label class="mb-1 block text-xs font-semibold text-slate-700">Decision Notes</label>
            <textarea id="decision-notes" rows="4" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" placeholder="Optional internal notes">${escapeHtml(state.decisionNotes)}</textarea>
          </div>

          <div class="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
            This letter will include <span class="font-bold">${mappingIds.length}</span> mapping(s).
          </div>
        </form>

        <div class="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button type="button" id="btn-cancel-create-letter-form" class="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-white">
            Cancel
          </button>
          <button type="submit" form="create-letter-form" id="btn-submit-create-letter" ${state.isSaving ? 'disabled' : ''} class="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40">
            ${state.isSaving ? 'Creating...' : 'Create Letter'}
          </button>
        </div>
      </div>
    `;

    const form = overlay.querySelector('#create-letter-form') as HTMLFormElement | null;
    const submitBtn = overlay.querySelector('#btn-submit-create-letter') as HTMLButtonElement | null;
    const requiredIds = ['letter-reference', 'letter-date', 'regulation-reference', 'regulation-article'];

    overlay.onclick = (event) => {
      if (event.target === overlay) close();
    };

    overlay.querySelector('#btn-close-create-letter-form')?.addEventListener('click', close);
    overlay.querySelector('#btn-cancel-create-letter-form')?.addEventListener('click', close);

    const syncStateFromDom = () => {
      state.letterReference = (overlay.querySelector('#letter-reference') as HTMLInputElement | null)?.value || '';
      state.letterDate = (overlay.querySelector('#letter-date') as HTMLInputElement | null)?.value || '';
      state.regulationReference = (overlay.querySelector('#regulation-reference') as HTMLInputElement | null)?.value || '';
      state.regulationArticle = (overlay.querySelector('#regulation-article') as HTMLInputElement | null)?.value || '';
      state.committeeSessionNumber = (overlay.querySelector('#committee-session-number') as HTMLInputElement | null)?.value || '';
      state.committeeSessionDate = (overlay.querySelector('#committee-session-date') as HTMLInputElement | null)?.value || '';
      state.summary = (overlay.querySelector('#letter-summary') as HTMLTextAreaElement | null)?.value || '';
      state.decisionNotes = (overlay.querySelector('#decision-notes') as HTMLTextAreaElement | null)?.value || '';
    };

    const updateSubmitState = () => {
      syncStateFromDom();
      if (!submitBtn) return;
      const requiredValues = [
        state.letterReference,
        state.letterDate,
        state.regulationReference,
        state.regulationArticle,
      ];
      const allRequiredFilled = requiredValues.every((value) => value.trim().length > 0);
      submitBtn.disabled = !allRequiredFilled || state.isSaving;
    };

    requiredIds.forEach((id) => {
      overlay.querySelector(`#${id}`)?.addEventListener('input', updateSubmitState);
    });
    overlay.querySelector('#committee-session-number')?.addEventListener('input', syncStateFromDom);
    overlay.querySelector('#committee-session-date')?.addEventListener('input', syncStateFromDom);
    overlay.querySelector('#letter-summary')?.addEventListener('input', syncStateFromDom);
    overlay.querySelector('#decision-notes')?.addEventListener('input', syncStateFromDom);

    updateSubmitState();

    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;

      syncStateFromDom();
      state.errorText = '';
      state.isSaving = true;
      render();

      const payload = {
        mappingIds,
        letterReference: state.letterReference.trim(),
        letterDate: state.letterDate,
        regulationReference: state.regulationReference.trim(),
        regulationArticle: state.regulationArticle.trim(),
        committeeSessionNumber: state.committeeSessionNumber.trim() || undefined,
        committeeSessionDate: state.committeeSessionDate || undefined,
        summary: state.summary.trim() || undefined,
        decisionNotes: state.decisionNotes.trim() || undefined,
      };

      try {
        await store.apiService.post('/allocation-decision-letters', payload);
        overlay.remove();
        await refreshView();
        (store as any).notify?.();
      } catch (error: any) {
        state.isSaving = false;
        state.errorText = getErrorMessage(error);
        render();
      }
    });
  };

  render();
}

export async function openCreateLetterModal(preselectedMappingIds?: string[]): Promise<void> {
  removeModal('create-letter-overlay');

  const overlay = document.createElement('div');
  overlay.id = 'create-letter-overlay';
  overlay.className = 'fixed inset-0 z-[140] flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-sm';
  overlay.innerHTML = `
    <div class="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-2xl">
      <div class="space-y-3 text-center">
        <div class="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-indigo-600"></div>
        <p class="text-sm text-slate-500">Preparing create letter form...</p>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  if (preselectedMappingIds && preselectedMappingIds.length > 0) {
    renderCreateLetterFormStep(overlay, Array.from(new Set(preselectedMappingIds)));
    return;
  }

  try {
    const eligibleMappings = await fetchEligibleMappings();
    renderCreateLetterPickerStep(overlay, eligibleMappings, new Set<string>(), (mappingIds) => {
      renderCreateLetterFormStep(overlay, mappingIds);
    });
  } catch (error: any) {
    overlay.innerHTML = `
      <div class="w-full max-w-lg rounded-2xl border border-rose-200 bg-white p-8 shadow-2xl">
        <div class="text-center">
          <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 text-rose-600">
            <i class="fa-solid fa-triangle-exclamation text-xl"></i>
          </div>
          <h3 class="mt-4 text-lg font-bold text-slate-900">Unable to load approved mappings</h3>
          <p class="mt-2 text-sm text-rose-600">${escapeHtml(getErrorMessage(error))}</p>
          <button type="button" id="btn-close-create-letter-error" class="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-slate-800">
            Close
          </button>
        </div>
      </div>
    `;

    overlay.querySelector('#btn-close-create-letter-error')?.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) overlay.remove();
    });
  }
}
