/**
 * 3-Column Housing Allocation Mapping Workspace (/mappings/workspace)
 * Pure TypeScript + Tailwind CSS Implementation - LIGHT THEME
 * 
 * BIDIRECTIONAL: Supports both Beneficiary→Properties and Property→Beneficiaries matching
 */

import { store } from '../../store';
import { BeneficiaryInfo, Property } from './types';

// Local Workspace State
interface WorkspaceState {
  beneficiaries: BeneficiaryInfo[];
  properties: Property[];
  selectedBeneficiary: BeneficiaryInfo | null;
  selectedProperty: Property | null;
  currentMatchScore: number;
  currentMatchReasons: string[];
  
  // Bidirectional Caches
  propertySuggestionsCache: Map<string, any[]>; // Key: beneficiaryId → Property suggestions
  beneficiarySuggestionsCache: Map<string, any[]>; // Key: propertyId → Beneficiary suggestions
  
  // View Mode: which direction is currently active
  // viewMode: 'by-beneficiary' | 'by-property';
  
  isConfirmModalOpen: boolean;
  isForcedMode: boolean;
  forceReason: string;
  notes: string;
  
  // Filters
  benSearch: string;
  benRankFilter: string;
  benInstFilter: string;
  propSearch: string;
  propSubcityFilter: string;
  propBedsFilter: string;
  propTypeFilter: string;
  
  isLoading: boolean;
  isSubmitting: boolean;
  successNotification: string | null;
}

const state: WorkspaceState = {
  beneficiaries: [],
  properties: [],
  selectedBeneficiary: null,
  selectedProperty: null,
  currentMatchScore: 0,
  currentMatchReasons: [],
  propertySuggestionsCache: new Map(),
  beneficiarySuggestionsCache: new Map(),
  // viewMode: 'by-beneficiary',
  isConfirmModalOpen: false,
  isForcedMode: false,
  forceReason: '',
  notes: '',
  
  benSearch: '',
  benRankFilter: 'ALL',
  benInstFilter: 'ALL',
  propSearch: '',
  propSubcityFilter: 'ALL',
  propBedsFilter: 'ALL',
  propTypeFilter: 'ALL',
  
  isLoading: false,
  isSubmitting: false,
  successNotification: null,
};

let activeListeners: { element: Element; type: string; handler: EventListener }[] = [];

function addManagedListener(element: Element | null, type: string, handler: EventListener) {
  if (element) {
    element.addEventListener(type, handler);
    activeListeners.push({ element, type, handler });
  }
}

export function cleanupMappingWorkspace(): void {
  activeListeners.forEach(({ element, type, handler }) => {
    element.removeEventListener(type, handler);
  });
  activeListeners = [];
}

/**
 * Initial Data Loader
 */
export async function loadWorkspaceData(forceRefresh = false): Promise<void> {
  state.isLoading = true;
  
  try {
    // 1. Fetch Waitlist Beneficiaries
    let benList: BeneficiaryInfo[] = [];
    try {
      const queueRes = await store.apiService.get<any>('/house-allocation-queue');
      const items = Array.isArray(queueRes) ? queueRes : (queueRes?.items || []);
      
      if (items.length > 0) {
        benList = items.map((item: any, idx: number) => {
          const ben = item.beneficiary || {};
          const ind = ben.beneficiaryIndividual || {};
          const inst = ben.beneficiaryInstitution || item.request?.requestingInstitution || {};
          
          const instName = typeof inst.name === 'object' 
            ? (inst.name.en || inst.name.am || 'Unknown Institution') 
            : (inst.name || 'Unknown Institution');
            
          const rankName = ind.currentRank?.name?.en || item.priorityBreakdown?.beneficiary?.rankCode || 'Unranked';
          const bedroomEntitlement = ind.currentRank?.bedroomEntitlement || 2;
          
          return {
            id: ben.id || item.id || `ben-${idx + 1}`,
            requestId: item.request?.id || `REQ-${idx + 1}`,
            fullName: ind.fullName || `Beneficiary ${idx + 1}`,
            rank: rankName,
            institution: instName,
            status: ben.status === 'allocated' ? 'ALLOCATED' : 'WAITING_LIST',
            bedroomEntitlement: bedroomEntitlement,
            preferredHouseTypes: ind.currentRank?.preferredHouseTypes || ['APARTMENT', 'VILLA'],
            queuePosition: item.position || ben.waitingListPosition || (idx + 1),
            totalInQueue: queueRes.total || items.length,
            isOverrideQueue: ben.isOverrideQueue || false
          };
        });
      }
    } catch (err) {
      console.warn('Queue fetch failed, using fallback', err);
      benList = [
        { id: 'ben-101', fullName: 'Abebe Gellaw Manyazewal', rank: 'Unranked', institution: 'Oromia Regional Government', bedroomEntitlement: 2, queuePosition: 1, totalInQueue: 8, status: 'WAITING_LIST', preferredHouseTypes: ['APARTMENT'], isOverrideQueue: false, requestId: 'eabcb428-0aba-40bb-ad8b-25013c707d9c' },
        { id: 'ben-102', fullName: 'Shafira Chase Mueller Harvey', rank: 'Prime Minister', institution: 'Prime Minister\'s Office', bedroomEntitlement: 6, queuePosition: 2, totalInQueue: 8, status: 'WAITING_LIST', preferredHouseTypes: ['VILLA'], isOverrideQueue: false, requestId: '4af41b8f-b002-4217-8eb9-9d0fcba694cc' },
      ];
    }
    state.beneficiaries = benList;

    // 2. Fetch Vacant Properties API
    let propList: Property[] = [];
    try {
      const propRes = await store.apiService.get<any>('/properties?status=VACANT');
      const pItems = Array.isArray(propRes) ? propRes : (propRes?.items || []);
      
      if (pItems.length > 0) {
        propList = pItems.map((p: any) => {
          let pType = 'APARTMENT';
          if (p.building?.buildingType) {
            pType = p.building.buildingType;
          } else if (p.area && parseFloat(p.area) >= 150) {
            pType = 'VILLA';
          } else if (p.area && parseFloat(p.area) < 100) {
            pType = 'CONDOMINIUM';
          }
          
          return {
            id: p.id,
            code: p.houseNumber || `PROP-${p.id.slice(0, 4)}`,
            address: `House ${p.houseNumber || 'N/A'}${p.floorNumber ? `, Floor ${p.floorNumber}` : ''}`,
            propertyType: pType,
            bedrooms: p.numberOfBedrooms || 2,
            monthlyRent: 0,
            area: p.area || '0',
            status: p.status || 'VACANT',
            subcity: 'Addis Ababa',
            city: 'Addis Ababa'
          };
        });
      }
    } catch (err) {
      console.warn('Properties fetch failed', err);
      propList = [
        { id: 'prop-201', code: 'B001-001', address: 'House B001-001, Floor 1', propertyType: 'APARTMENT', bedrooms: 3, monthlyRent: 0, area: '85.50', status: 'VACANT', subcity: 'Addis Ababa', city: 'Addis Ababa' },
        { id: 'prop-202', code: 'B001-003', address: 'House B001-003, Floor 3', propertyType: 'APARTMENT', bedrooms: 4, monthlyRent: 0, area: '110.00', status: 'VACANT', subcity: 'Addis Ababa', city: 'Addis Ababa' },
        { id: 'prop-203', code: 'B002-001', address: 'House B002-001', propertyType: 'VILLA', bedrooms: 4, monthlyRent: 0, area: '180.00', status: 'VACANT', subcity: 'Addis Ababa', city: 'Addis Ababa' },
      ];
    }
    state.properties = propList;

    if (!state.selectedBeneficiary || forceRefresh) {
      state.selectedBeneficiary = state.beneficiaries[0] || null;
    }
    if (!state.selectedProperty || forceRefresh) {
      state.selectedProperty = state.properties[0] || null;
    }
    
    // Initial fetch in beneficiary mode
    // if (state.selectedBeneficiary) {
    //   await fetchPropertySuggestions(state.selectedBeneficiary.id);
    // }

  } finally {
    state.isLoading = false;
  }
}

/**
 * Fetch property suggestions for a beneficiary (Beneficiary → Properties)
 * Endpoint: GET /house-allocation-mappings/suggest/:beneficiaryId
 */
async function fetchPropertySuggestions(beneficiaryId: string): Promise<void> {
  if (state.propertySuggestionsCache.has(beneficiaryId)) {
    applyPropertySuggestions(state.propertySuggestionsCache.get(beneficiaryId)!);
    return;
  }

  try {
    const response = await store.apiService.get<any[]>(`/house-allocation-mappings/suggest/${beneficiaryId}`);
    state.propertySuggestionsCache.set(beneficiaryId, response);
    applyPropertySuggestions(response);
  } catch (err) {
    console.warn('Failed to fetch property suggestions from backend', err);
    const fallback = state.properties.map(p => ({
      propertyId: p.id,
      score: p.bedrooms === (state.selectedBeneficiary?.bedroomEntitlement || 2) ? 70 : 40,
      matchReasons: [p.bedrooms === (state.selectedBeneficiary?.bedroomEntitlement || 2) ? `✅ Bedrooms match: ${p.bedrooms}` : `ℹ️ Bedrooms: any (${p.bedrooms})`],
      property: p
    })).sort((a, b) => b.score - a.score);
    
    state.propertySuggestionsCache.set(beneficiaryId, fallback);
    applyPropertySuggestions(fallback);
  }
}

/**
 * Fetch beneficiary suggestions for a property (Property → Beneficiaries)
 * Endpoint: GET /house-allocation-mappings/suggest-beneficiaries/:propertyId
 */
async function fetchBeneficiarySuggestions(propertyId: string): Promise<void> {
  if (state.beneficiarySuggestionsCache.has(propertyId)) {
    applyBeneficiarySuggestions(state.beneficiarySuggestionsCache.get(propertyId)!);
    return;
  }

  try {
    const response = await store.apiService.get<any[]>(`/house-allocation-mappings/suggest-beneficiaries/${propertyId}`);
    state.beneficiarySuggestionsCache.set(propertyId, response);
    applyBeneficiarySuggestions(response);
  } catch (err) {
    console.warn('Failed to fetch beneficiary suggestions from backend', err);
    // Fallback: just sort by queue position
    const fallback = state.beneficiaries.map(b => ({
      beneficiaryId: b.id,
      score: b.queuePosition === 1 ? 70 : 40,
      matchReasons: [`ℹ️ Queue position: #${b.queuePosition}`],
      beneficiary: b
    })).sort((a, b) => b.score - a.score);
    
    state.beneficiarySuggestionsCache.set(propertyId, fallback);
    applyBeneficiarySuggestions(fallback);
  }
}

function applyPropertySuggestions(suggestions: any[]): void {
  if (!suggestions || suggestions.length === 0) {
    return;
  }

  const topSuggestion = suggestions[0];
  
  // Auto-select the top suggested property
  if (!state.selectedProperty || state.selectedProperty.id !== topSuggestion.propertyId) {
    const matchedProp = state.properties.find(p => p.id === topSuggestion.propertyId);
    if (matchedProp) {
      state.selectedProperty = matchedProp;
    }
  }
  
  // Update center column score for the current pair
  updatePairScore();
}

function applyBeneficiarySuggestions(suggestions: any[]): void {
  if (!suggestions || suggestions.length === 0) {
    return;
  }

  const topSuggestion = suggestions[0];
  
  // Auto-select the top suggested beneficiary
  if (!state.selectedBeneficiary || state.selectedBeneficiary.id !== topSuggestion.beneficiaryId) {
    const matchedBen = state.beneficiaries.find(b => b.id === topSuggestion.beneficiaryId);
    if (matchedBen) {
      state.selectedBeneficiary = matchedBen;
    }
  }
  
  // Update center column score for the current pair
  updatePairScore();
}

/**
 * Compute the match score for the currently selected pair (beneficiary + property)
 * Looks in both caches to find the score for this specific pair
 */
function updatePairScore(): void {
  if (!state.selectedBeneficiary || !state.selectedProperty) {
    state.currentMatchScore = 0;
    state.currentMatchReasons = [];
    return;
  }

  // Try to find from property suggestions cache (beneficiary → properties)
  const propSuggestions = state.propertySuggestionsCache.get(state.selectedBeneficiary.id) || [];
  const propMatch = propSuggestions.find((s: any) => s.propertyId === state.selectedProperty?.id);
  
  if (propMatch) {
    state.currentMatchScore = propMatch.score;
    state.currentMatchReasons = propMatch.matchReasons;
    return;
  }

  // Try to find from beneficiary suggestions cache (property → beneficiaries)
  const benSuggestions = state.beneficiarySuggestionsCache.get(state.selectedProperty.id) || [];
  const benMatch = benSuggestions.find((s: any) => s.beneficiaryId === state.selectedBeneficiary?.id);
  
  if (benMatch) {
    state.currentMatchScore = benMatch.score;
    state.currentMatchReasons = benMatch.matchReasons;
    return;
  }

  // Fallback: no data
  state.currentMatchScore = 0;
  state.currentMatchReasons = ['No match data available for this pair'];
}

/**
 * Render Confirmation Modal
 */
function renderConfirmModal(): string {
  const ben = state.selectedBeneficiary;
  const prop = state.selectedProperty;
  const showForceSection = state.isForcedMode || state.currentMatchScore < 70;

  return `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
        <div class="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <h3 class="text-lg font-bold text-slate-900 flex items-center gap-2">
            <svg class="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            Confirm Allocation Mapping
          </h3>
          <button id="btn-close-confirm-modal" class="text-slate-400 hover:text-slate-600 transition-colors">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div class="p-6 space-y-4">
          <div class="grid grid-cols-2 gap-3 text-xs">
            <div class="p-3 bg-indigo-50 rounded-lg border border-indigo-100">
              <span class="text-[10px] font-bold text-indigo-600 uppercase tracking-wider block mb-1">Beneficiary</span>
              <p class="font-bold text-slate-900 truncate" title="${ben?.fullName}">${ben?.fullName}</p>
              <p class="text-slate-600">${ben?.rank} • ${ben?.bedroomEntitlement} Beds</p>
            </div>
            <div class="p-3 bg-emerald-50 rounded-lg border border-emerald-100">
              <span class="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block mb-1">Property</span>
              <p class="font-bold text-slate-900 truncate" title="${prop?.code}">${prop?.code}</p>
              <p class="text-slate-600">${prop?.propertyType} • ${prop?.bedrooms} Beds</p>
            </div>
          </div>

          <div class="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
            <span class="text-sm font-semibold text-slate-700">System Match Score:</span>
            <span class="text-xl font-black ${state.currentMatchScore >= 70 ? 'text-emerald-600' : 'text-amber-600'}">${state.currentMatchScore}%</span>
          </div>

          <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
            <div class="flex items-start space-x-3">
              <input type="checkbox" id="chk-force-match-modal" ${state.isForcedMode ? 'checked' : ''} class="mt-1 w-4 h-4 rounded text-rose-600 focus:ring-rose-500 border-slate-300 cursor-pointer">
              <div class="flex-1">
                <label for="chk-force-match-modal" class="text-sm font-bold text-amber-900 cursor-pointer block">
                  ⚡ Force Match (Override Entitlement)
                </label>
                <p class="text-xs text-amber-700 mt-0.5">Bypass automated matching criteria for emergency or special allocations.</p>
              </div>
            </div>
            
            ${showForceSection ? `
              <div class="pt-3 border-t border-amber-200/60 animate-in fade-in slide-in-from-top-2 duration-200">
                <label for="txt-force-reason-modal" class="block text-xs font-bold text-rose-700 mb-1.5 flex items-center space-x-1">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                  <span>Force Reason/Justification <span class="text-rose-500">*</span></span>
                </label>
                <textarea id="txt-force-reason-modal" required rows="3" placeholder="Provide mandatory administrative justification..." class="w-full p-2.5 bg-white border border-rose-300 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500 resize-none shadow-sm">${state.forceReason}</textarea>
              </div>
            ` : ''}
          </div>
        </div>

        <div class="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end space-x-3">
          <button id="btn-cancel-confirm-modal" class="px-4 py-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 font-semibold text-sm rounded-lg transition-colors">
            Cancel
          </button>
          <button id="btn-finalize-mapping" ${state.isSubmitting ? 'disabled' : ''} class="px-4 py-2 ${
            showForceSection ? 'bg-rose-600 hover:bg-rose-700' : 'bg-indigo-600 hover:bg-indigo-700'
          } text-white font-semibold text-sm rounded-lg shadow-sm transition-colors flex items-center space-x-2 disabled:opacity-50">
            ${state.isSubmitting ? `
              <svg class="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              <span>Processing...</span>
            ` : `
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
              <span>${showForceSection ? 'Confirm Forced Mapping' : 'Confirm Mapping'}</span>
            `}
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Main Render Function
 */
export async function renderMappingWorkspace(container: HTMLElement): Promise<void> {
  cleanupMappingWorkspace();

  if (state.beneficiaries.length === 0) {
    await loadWorkspaceData();
  }

  container.innerHTML = `
    <style>
      .no-scrollbar::-webkit-scrollbar { display: none; }
      .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
      .animate-fade-in { animation: fadeIn 0.2s ease-out forwards; }
    </style>

    <div class="bg-white min-h-screen w-full p-4 sm:p-6 lg:p-8 font-sans">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 mb-6 border-b border-slate-200">
        <div class="flex items-center space-x-3">
          <div class="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold text-xl shadow-lg">🏢</div>
          <div>
            <div class="flex items-center space-x-2">
              <h1 class="text-xl font-bold text-slate-900 tracking-wide">Housing Allocation Mapping Workspace</h1>
              <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 tracking-wider">RESTRICTED ACCESS</span>
            </div>
            <p class="text-xs text-slate-500 mt-0.5">Bidirectional Decision Studio • Beneficiary ↔ Property Matching</p>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-3 text-xs">
          <div class="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 font-medium">
            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
            <span>LIVE SESSION</span>
          </div>
          <button id="btn-switch-table-view" class="px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 font-semibold rounded-lg border border-slate-300 transition-colors flex items-center space-x-1.5 shadow-sm">
            <svg class="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg>
            <span>Table View</span>
          </button>
        </div>
      </div>

      ${state.successNotification ? `
        <div class="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm font-medium flex items-center justify-between shadow-sm">
          <div class="flex items-center space-x-2">
            <span class="text-lg">🎉</span>
            <span>${state.successNotification}</span>
          </div>
          <button id="btn-dismiss-toast" class="text-emerald-600 hover:text-emerald-800 text-xs font-bold px-2 py-1 bg-emerald-100 rounded">Dismiss</button>
        </div>
      ` : ''}

      <!-- View Mode Indicator -->
    

      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <!-- LEFT COLUMN (30%) - Beneficiary Waitlist -->
        <div class="lg:col-span-3 space-y-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col h-[calc(100vh-230px)] min-h-[600px]">
          <div class="flex items-center justify-between pb-3 border-b border-slate-200">
            <div class="flex items-center space-x-2">
              <span class="w-2.5 h-2.5 rounded-full ${state.viewMode === 'by-property' ? 'bg-amber-500' : 'bg-indigo-500'}"></span>
              <h2 class="text-xs font-bold text-slate-800 uppercase tracking-wider">Beneficiary Waitlist</h2>
            </div>
            <span class="px-2 py-0.5 rounded text-[10px] font-bold ${
              state.viewMode === 'by-property' 
                ? 'bg-amber-50 text-amber-700 border border-amber-200' 
                : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
            }">
              ${state.viewMode === 'by-property' ? '🎯 SCORING' : `${state.beneficiaries.length} RECORDS`}
            </span>
          </div>

          <div class="space-y-2">
            <div class="relative">
              <svg class="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              <input type="text" id="txt-workspace-ben-search" value="${state.benSearch}" placeholder="Search name or rank..." class="w-full pl-8 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all">
            </div>
            <div class="grid grid-cols-2 gap-2">
              <select id="sel-workspace-ben-rank" class="bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-700 p-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="ALL">All Ranks</option>
                <option value="Prime Minister">Prime Minister</option>
                <option value="Senior Director">Senior Director</option>
                <option value="Unranked">Unranked</option>
              </select>
              <select id="sel-workspace-ben-inst" class="bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-700 p-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="ALL">All Institutions</option>
                <option value="Prime Minister's Office">Prime Minister's Office</option>
                <option value="Ministry of Health">Ministry of Health</option>
                <option value="Oromia Regional Government">Oromia Regional Gov</option>
              </select>
            </div>
          </div>

          <div id="container-ben-list" class="flex-1 overflow-y-auto space-y-2 pr-1 no-scrollbar">
            ${renderBeneficiariesList()}
          </div>
        </div>

        <!-- CENTER COLUMN (40%) - Mapping Decision Zone -->
        <div class="lg:col-span-5 space-y-4 bg-slate-50 p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-[calc(100vh-230px)] min-h-[600px]">
          <div class="space-y-4">
            <div class="flex items-center space-x-3 pb-3 border-b border-slate-200">
              <div class="p-2 rounded-lg bg-indigo-100 text-indigo-600">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              </div>
              <div>
                <h2 class="text-sm font-bold text-slate-900 tracking-wide">Mapping Decision Zone</h2>
                <p class="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">ALLOCATION REVIEW & CONFIRMATION</p>
              </div>
            </div>

            <div id="container-decision-pair" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              ${renderDecisionPair()}
            </div>

            <div class="bg-white rounded-xl p-4 border border-slate-200 shadow-sm space-y-3">
              <div class="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 class="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center space-x-1.5">
                  <span class="text-indigo-600">📊</span>
                  <span>Backend Match Analysis</span>
                </h3>
                <span class="text-[10px] text-slate-400 font-mono">Engine v2.4</span>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                <div class="md:col-span-5 flex flex-col items-center justify-center p-1">
                  <div class="relative w-24 h-24 flex items-center justify-center">
                    <svg class="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                      <path class="text-slate-200" stroke-width="3.5" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
                      <path class="${state.currentMatchScore >= 70 ? 'text-emerald-500' : state.currentMatchScore >= 40 ? 'text-amber-500' : 'text-rose-500'} transition-all duration-700" stroke-dasharray="${state.currentMatchScore}, 100" stroke-width="3.5" stroke-linecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
                    </svg>
                    <div class="absolute inset-0 flex flex-col items-center justify-center text-center">
                      <span class="text-2xl font-bold text-slate-900">${state.currentMatchScore}%</span>
                      <span class="text-[8px] font-bold text-slate-400 uppercase tracking-widest">SCORE</span>
                    </div>
                  </div>
                </div>

                <div class="md:col-span-7 space-y-1.5">
                  <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">MATCH REASONS</span>
                  <div class="space-y-1.5">
                    ${state.currentMatchReasons.length > 0 ? state.currentMatchReasons.map(r => `
                      <div class="text-[11px] text-slate-700 flex items-start space-x-1.5 leading-tight">
                        <span class="${r.includes('❌') ? 'text-rose-500' : r.includes('⚠️') ? 'text-amber-500' : 'text-emerald-500'} font-bold shrink-0 mt-0.5">${r.includes('❌') ? '✕' : '✓'}</span>
                        <span>${r}</span>
                      </div>
                    `).join('') : '<p class="text-xs text-slate-400 italic">Select a pair to see backend match reasons.</p>'}
                  </div>

                  <div class="pt-2">
                    <div class="flex justify-between text-[10px] text-slate-500 font-medium mb-1">
                      <span>Compatibility Fit</span>
                      <span class="${state.currentMatchScore >= 70 ? 'text-emerald-600' : 'text-amber-600'} font-bold">${state.currentMatchScore}% fit</span>
                    </div>
                    <div class="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div class="bg-gradient-to-r from-emerald-500 to-teal-500 h-full rounded-full transition-all duration-500" style="width: ${state.currentMatchScore}%"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Primary Action Area: Opens Modal -->
          <div class="pt-4 border-t border-slate-200">
            <button id="btn-open-confirm-modal" class="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-white font-bold text-sm uppercase tracking-wider rounded-xl shadow-lg transition-all flex items-center justify-center space-x-2">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              <span>Review & Confirm Mapping</span>
            </button>
          </div>
        </div>

        <!-- RIGHT COLUMN (30%) - Vacant Properties -->
        <div class="lg:col-span-4 space-y-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col h-[calc(100vh-230px)] min-h-[600px]">
          <div class="flex items-center justify-between pb-3 border-b border-slate-200">
            <div class="flex items-center space-x-2">
              <span class="w-2.5 h-2.5 rounded-full ${state.viewMode === 'by-beneficiary' ? 'bg-amber-500' : 'bg-emerald-500'}"></span>
              <h2 class="text-xs font-bold text-slate-800 uppercase tracking-wider">Vacant Properties</h2>
            </div>
            <span class="px-2 py-0.5 rounded text-[10px] font-bold ${
              state.viewMode === 'by-beneficiary' 
                ? 'bg-amber-50 text-amber-700 border border-amber-200' 
                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            }">
              ${state.viewMode === 'by-beneficiary' ? '🎯 SCORING' : `${state.properties.length} RECORDS`}
            </span>
          </div>

          <div class="space-y-2">
            <div class="relative">
              <svg class="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              <input type="text" id="txt-workspace-prop-search" value="${state.propSearch}" placeholder="Search code or address..." class="w-full pl-8 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all">
            </div>
            <div class="grid grid-cols-2 gap-2">
              <select id="sel-workspace-prop-beds" class="bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-700 p-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="ALL">Beds</option>
                <option value="1">1 Bed</option>
                <option value="2">2 Beds</option>
                <option value="3">3 Beds</option>
                <option value="4">4 Beds</option>
                <option value="6">6 Beds</option>
              </select>
              <select id="sel-workspace-prop-type" class="bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-700 p-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="ALL">Type</option>
                <option value="APARTMENT">Apartment</option>
                <option value="VILLA">Villa</option>
                <option value="CONDOMINIUM">Condo</option>
              </select>
            </div>
          </div>

          <div id="container-prop-list" class="flex-1 overflow-y-auto space-y-2 pr-1 no-scrollbar">
            ${renderPropertyList()}
          </div>
        </div>
      </div>
    </div>
  `;

  attachWorkspaceListeners(container);

  // Render Modal if open
  if (state.isConfirmModalOpen) {
    const modalRoot = document.createElement('div');
    modalRoot.innerHTML = renderConfirmModal();
    document.body.appendChild(modalRoot.firstElementChild as HTMLElement);
    
    document.getElementById('btn-close-confirm-modal')?.addEventListener('click', () => {
      state.isConfirmModalOpen = false;
      renderMappingWorkspace(container);
    });
    document.getElementById('btn-cancel-confirm-modal')?.addEventListener('click', () => {
      state.isConfirmModalOpen = false;
      renderMappingWorkspace(container);
    });
    document.getElementById('chk-force-match-modal')?.addEventListener('change', (e) => {
      state.isForcedMode = (e.target as HTMLInputElement).checked;
      state.isConfirmModalOpen = false; 
      setTimeout(() => {
        state.isConfirmModalOpen = true;
        renderMappingWorkspace(container);
      }, 10);
    });
    document.getElementById('btn-finalize-mapping')?.addEventListener('click', async () => {
      await executeConfirmMapping(container);
    });
  }
}

/**
 * Render Helper: Beneficiaries List
 * In 'by-property' mode: shows match scores and highlights top match
 * In 'by-beneficiary' mode: shows plain list
 */
function renderBeneficiariesList(): string {
  // Get suggestions for currently selected property (if any)
  const propSuggestions = state.selectedProperty 
    ? (state.beneficiarySuggestionsCache.get(state.selectedProperty.id) || []) 
    : [];
  
  // Map suggestions to a Set of beneficiary IDs for quick lookup
  const suggestedIds = new Set(propSuggestions.map((s: any) => s.beneficiaryId));
  
  // Build list with suggestion scores, but keep all items
  let scoredList = state.beneficiaries.map(b => {
    const suggestion = propSuggestions.find((s: any) => s.beneficiaryId === b.id);
    return {
      ben: b,
      score: suggestion ? suggestion.score : null, // null = not in suggestions
      reasons: suggestion ? suggestion.matchReasons : [],
      isSuggested: !!suggestion
    };
  });

  // Sort: suggestions first (by score), then non-suggested by queue position
  scoredList.sort((a, b) => {
    if (a.isSuggested && !b.isSuggested) return -1;
    if (!a.isSuggested && b.isSuggested) return 1;
    if (a.isSuggested && b.isSuggested) return b.score! - a.score!;
    return a.ben.queuePosition - b.ben.queuePosition;
  });

  // Apply filters
  const filtered = scoredList.filter(({ ben }) => {
    if (state.benRankFilter !== 'ALL' && ben.rank !== state.benRankFilter) return false;
    if (state.benInstFilter !== 'ALL' && !ben.institution.includes(state.benInstFilter)) return false;
    if (state.benSearch.trim()) {
      const q = state.benSearch.toLowerCase();
      return ben.fullName.toLowerCase().includes(q) || ben.rank.toLowerCase().includes(q) || ben.institution.toLowerCase().includes(q);
    }
    return true;
  });

  if (filtered.length === 0) return `<div class="p-6 text-center text-sm text-slate-500">No waitlist beneficiaries match criteria.</div>`;

  return filtered.map((item, idx) => {
    const b = item.ben;
    const isSelected = state.selectedBeneficiary?.id === b.id;
    const isSuggested = item.isSuggested;
    const isBestSuggestion = isSuggested && item.score! >= 70;

    return `
      <div data-ben-id="${b.id}" class="p-3 rounded-xl cursor-pointer transition-all ${
        isSelected ? 'bg-indigo-50 border-2 border-indigo-500 shadow-md' : 
        isBestSuggestion ? 'bg-indigo-50/50 border border-indigo-300 hover:border-indigo-400 shadow-sm' :
        isSuggested ? 'bg-slate-50 border border-slate-200 hover:border-indigo-300 shadow-sm' :
        'bg-white border border-slate-200 hover:border-slate-300 hover:shadow-sm'
      } flex flex-col space-y-2">
        
        <!-- Top Row: Score/Position and Name -->
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-2 flex-1 min-w-0">
            ${isSuggested ? `
              ${isBestSuggestion ? `
                <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-gradient-to-r from-indigo-500 to-purple-500 text-white tracking-wider shadow-sm shrink-0">⭐ MATCH (${item.score}%)</span>
              ` : `
                <span class="px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 bg-amber-100 text-amber-700 border border-amber-200">
                  💡 ${item.score}%
                </span>
              `}
            ` : `
              <span class="px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 bg-slate-100 text-slate-600">
                #${b.queuePosition}
              </span>
            `}
            <span class="font-bold text-sm ${isSelected ? 'text-indigo-900' : 'text-slate-800'} truncate" title="${b.fullName}">
              ${b.fullName}
            </span>
          </div>
        </div>
        
        <!-- Middle Row: Rank and Details -->
        <div class="space-y-1">
          <p class="text-[11px] font-bold text-amber-600 truncate" title="${b.rank}">${b.rank}</p>
          <div class="flex items-center space-x-3 text-[10px] text-slate-500">
            <span class="shrink-0">🏠 ${b.bedroomEntitlement} Beds</span>
            <span class="truncate" title="${b.institution}">🏛️ ${b.institution}</span>
          </div>
        </div>

        <!-- Bottom Row: Status Badge -->
        <div class="pt-2 mt-1 border-t border-slate-100">
          <span class="inline-flex items-center px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${
            b.isOverrideQueue ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
          }">
            ${b.isOverrideQueue ? '⚡ OVERRIDE' : `📋 ${b.status.replace('_', ' ')}`}
          </span>
        </div>

        <!-- Match Progress Bar (only if suggested) -->
        ${isSuggested ? `
          <div class="w-full bg-slate-200 h-1 rounded-full overflow-hidden">
            <div class="h-full ${item.score! >= 70 ? 'bg-emerald-500' : item.score! >= 40 ? 'bg-amber-500' : 'bg-slate-300'} transition-all duration-300" style="width: ${item.score}%"></div>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}
function renderDecisionPair(): string {
  const ben = state.selectedBeneficiary;
  const prop = state.selectedProperty;
  return `
    <div class="bg-white rounded-xl p-3 border-2 border-indigo-100 space-y-2 shadow-sm">
      <div class="flex items-center justify-between pb-2 border-b border-slate-100">
        <span class="text-[10px] font-bold uppercase tracking-widest text-indigo-600 flex items-center space-x-1"><span class="w-1.5 h-1.5 rounded-full bg-indigo-500"></span><span>BENEFICIARY</span></span>
        <span class="text-[10px] font-mono text-indigo-600 font-bold">#${ben?.queuePosition || 1}</span>
      </div>
      <div>
        <h3 class="text-sm font-bold text-slate-900 leading-tight">${ben?.fullName || 'Select Beneficiary'}</h3>
        <p class="text-[11px] font-bold text-amber-600 mt-0.5">${ben?.rank || 'Unranked'}</p>
      </div>
      <div class="space-y-0.5 text-[10px] text-slate-600 pt-2 border-t border-slate-100">
        <div class="flex justify-between"><span class="text-slate-400">Priority:</span><span class="font-bold text-indigo-600">#${ben?.queuePosition || 1}</span></div>
        <div class="flex justify-between"><span class="text-slate-400">Bed Entitlement:</span><span class="font-bold text-slate-800">${ben?.bedroomEntitlement || 2} Bedrooms</span></div>
        <div class="flex justify-between"><span class="text-slate-400">Department:</span><span class="font-bold text-slate-700 truncate max-w-[110px]">${ben?.institution || 'Unknown'}</span></div>
      </div>
    </div>
    <div class="bg-white rounded-xl p-3 border-2 border-emerald-100 space-y-2 shadow-sm">
      <div class="flex items-center justify-between pb-2 border-b border-slate-100">
        <span class="text-[10px] font-bold uppercase tracking-widest text-emerald-600 flex items-center space-x-1"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span><span>PROPERTY</span></span>
        <span class="text-[10px] font-mono text-emerald-600 font-bold">${prop?.code || 'N/A'}</span>
      </div>
      <div>
        <h3 class="text-sm font-bold text-slate-900 leading-tight">${prop?.code || 'N/A'}</h3>
        <p class="text-[11px] text-slate-500 mt-0.5 truncate">${prop?.address || 'Unknown Address'}</p>
      </div>
      <div class="space-y-0.5 text-[10px] text-slate-600 pt-2 border-t border-slate-100">
        <div class="flex justify-between"><span class="text-slate-400">Type:</span><span class="font-bold text-slate-800">${prop?.propertyType || 'Property'}</span></div>
        <div class="flex justify-between"><span class="text-slate-400">Bedrooms:</span><span class="font-bold text-slate-800">${prop?.bedrooms || 2} Beds</span></div>
        <div class="flex justify-between"><span class="text-slate-400">Area:</span><span class="font-bold text-emerald-600 font-mono">${prop?.area || '0'} m²</span></div>
      </div>
    </div>
  `;
}

/**
 * Render Helper: Properties List
 * In 'by-beneficiary' mode: shows match scores and highlights top match
 * In 'by-property' mode: shows plain list
 */
function renderPropertyList(): string {
  // Get suggestions for currently selected beneficiary (if any)
  const benSuggestions = state.selectedBeneficiary 
    ? (state.propertySuggestionsCache.get(state.selectedBeneficiary.id) || []) 
    : [];
  
  // Map suggestions to a Set of property IDs for quick lookup
  const suggestedIds = new Set(benSuggestions.map((s: any) => s.propertyId));
  
  // Build list with suggestion scores, but keep all items
  let scoredProps = state.properties.map(p => {
    const suggestion = benSuggestions.find((s: any) => s.propertyId === p.id);
    return {
      prop: p,
      score: suggestion ? suggestion.score : null, // null = not in suggestions
      reasons: suggestion ? suggestion.matchReasons : [],
      isSuggested: !!suggestion
    };
  });

  // Sort: suggestions first (by score), then non-suggested
  scoredProps.sort((a, b) => {
    if (a.isSuggested && !b.isSuggested) return -1;
    if (!a.isSuggested && b.isSuggested) return 1;
    if (a.isSuggested && b.isSuggested) return b.score! - a.score!;
    return 0;
  });

  const filtered = scoredProps.filter(({ prop }) => {
    if (state.propBedsFilter !== 'ALL' && prop.bedrooms.toString() !== state.propBedsFilter) return false;
    if (state.propTypeFilter !== 'ALL' && prop.propertyType !== state.propTypeFilter) return false;
    if (state.propSearch.trim()) {
      const q = state.propSearch.toLowerCase();
      return prop.code.toLowerCase().includes(q) || prop.address.toLowerCase().includes(q);
    }
    return true;
  });

  if (filtered.length === 0) return `<div class="p-6 text-center text-sm text-slate-500">No vacant properties match criteria.</div>`;

  return filtered.map((item) => {
    const p = item.prop;
    const isSelected = state.selectedProperty?.id === p.id;
    const isSuggested = item.isSuggested;
    const isBestSuggestion = isSuggested && item.score! >= 70;

    return `
      <div data-prop-id="${p.id}" class="p-3 rounded-xl cursor-pointer transition-all ${
        isSelected ? 'bg-emerald-50 border-2 border-emerald-500 shadow-md' : 
        isBestSuggestion ? 'bg-emerald-50/50 border border-emerald-300 hover:border-emerald-400 shadow-sm' : 
        isSuggested ? 'bg-slate-50 border border-slate-200 hover:border-emerald-300 shadow-sm' :
        'bg-white border border-slate-200 hover:border-slate-300 hover:shadow-sm'
      } space-y-2">
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-1.5">
            ${isSuggested ? (
              isBestSuggestion ? `
                <span class="px-2 py-0.5 rounded-md text-[9px] font-bold bg-gradient-to-r from-emerald-500 to-teal-500 text-white border border-emerald-300 tracking-wider shadow-sm">⭐ MATCH (${item.score}%)</span>
              ` : `
                <span class="px-2 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-700 border border-amber-200">💡 ${item.score}%</span>
              `
            ) : `
              <span class="px-2 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-600 border border-slate-200">${p.propertyType}</span>
            `}
          </div>
          <span class="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 uppercase">VACANT</span>
        </div>
        <div>
          <h4 class="font-bold text-sm text-slate-900 leading-snug">${p.code}</h4>
          <p class="text-[11px] text-slate-500 truncate">${p.address}</p>
        </div>
        <div class="flex items-center justify-between text-[10px] text-slate-600 pt-2 border-t border-slate-100">
          <span>🏢 ${p.propertyType} • 🏠 ${p.bedrooms} Beds</span>
          <span class="font-bold text-emerald-600 font-mono">${p.area} m²</span>
        </div>
        ${isSuggested ? `
          <div class="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
            <div class="h-full ${item.score! >= 70 ? 'bg-emerald-500' : item.score! >= 40 ? 'bg-amber-500' : 'bg-slate-300'} transition-all duration-300" style="width: ${item.score}%"></div>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

/**
 * Event Listener Wiring
 */
function attachWorkspaceListeners(container: HTMLElement): void {
  addManagedListener(document.getElementById('btn-switch-table-view'), 'click', () => {
    if ((store as any).setActiveTab) (store as any).setActiveTab('mappings');
  });

  addManagedListener(document.getElementById('btn-dismiss-toast'), 'click', () => {
    state.successNotification = null;
    renderMappingWorkspace(container);
  });

  // View Mode Toggle Buttons
  // addManagedListener(document.getElementById('btn-mode-by-beneficiary'), 'click', () => {
  //   if (state.viewMode !== 'by-beneficiary') {
  //     state.viewMode = 'by-beneficiary';
  //     renderMappingWorkspace(container);
  //   }
  // });

  // addManagedListener(document.getElementById('btn-mode-by-property'), 'click', () => {
  //   if (state.viewMode !== 'by-property') {
  //     state.viewMode = 'by-property';
  //     // Trigger fetch if needed
  //     if (state.selectedProperty && !state.beneficiarySuggestionsCache.has(state.selectedProperty.id)) {
  //       fetchBeneficiarySuggestions(state.selectedProperty.id).then(() => {
  //         renderMappingWorkspace(container);
  //       });
  //     } else {
  //       renderMappingWorkspace(container);
  //     }
  //   }
  // });

  // Beneficiary Click Handler - Switches to by-beneficiary mode
 // Beneficiary Click Handler
container.querySelectorAll('[data-ben-id]').forEach(el => {
  addManagedListener(el, 'click', async (e) => {
    const id = (e.currentTarget as HTMLElement).dataset.benId;
    const found = state.beneficiaries.find(b => b.id === id);
    if (found) {
      state.selectedBeneficiary = found;
      state.isForcedMode = false;
      state.forceReason = '';
      
      // Fetch suggestions if not already cached
      if (!state.propertySuggestionsCache.has(found.id)) {
        await fetchPropertySuggestions(found.id);
      }
      
      updatePairScore();
      renderMappingWorkspace(container);
    }
  });
});

// Property Click Handler
container.querySelectorAll('[data-prop-id]').forEach(el => {
  addManagedListener(el, 'click', async (e) => {
    const id = (e.currentTarget as HTMLElement).dataset.propId;
    const found = state.properties.find(p => p.id === id);
    if (found) {
      state.selectedProperty = found;
      state.isForcedMode = false;
      state.forceReason = '';
      
      // Fetch suggestions if not already cached
      if (!state.beneficiarySuggestionsCache.has(found.id)) {
        await fetchBeneficiarySuggestions(found.id);
      }
      
      updatePairScore();
      renderMappingWorkspace(container);
    }
  });
});

  const bindFilter = (id: string, stateKey: keyof WorkspaceState) => {
    const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement;
    if (el) {
      addManagedListener(el, el.tagName === 'SELECT' ? 'change' : 'input', (e) => {
        (state as any)[stateKey] = (e.target as HTMLInputElement).value;
        const listContainer = id.includes('ben') ? document.getElementById('container-ben-list') : document.getElementById('container-prop-list');
        if (listContainer) {
          listContainer.innerHTML = id.includes('ben') ? renderBeneficiariesList() : renderPropertyList();
          attachWorkspaceListeners(container); 
        }
      });
    }
  };

  bindFilter('txt-workspace-ben-search', 'benSearch');
  bindFilter('sel-workspace-ben-rank', 'benRankFilter');
  bindFilter('sel-workspace-ben-inst', 'benInstFilter');
  bindFilter('txt-workspace-prop-search', 'propSearch');
  bindFilter('sel-workspace-prop-beds', 'propBedsFilter');
  bindFilter('sel-workspace-prop-type', 'propTypeFilter');

  const btnOpenModal = document.getElementById('btn-open-confirm-modal');
  if (btnOpenModal) {
    addManagedListener(btnOpenModal, 'click', () => {
      if (!state.selectedBeneficiary || !state.selectedProperty) {
        alert('Please select both a beneficiary and a vacant property.');
        return;
      }
      state.isConfirmModalOpen = true;
      renderMappingWorkspace(container);
    });
  }
}

/**
 * Execute Mapping Confirmation
 */
async function executeConfirmMapping(container: HTMLElement): Promise<void> {
  if (!state.selectedBeneficiary || !state.selectedProperty) {
    alert('Please select both a beneficiary and a vacant property.');
    return;
  }

  const forceReasonEl = document.getElementById('txt-force-reason-modal') as HTMLTextAreaElement;
  if (forceReasonEl) {
    state.forceReason = forceReasonEl.value;
  }

  const isForced = state.isForcedMode || state.currentMatchScore < 70;
  if (isForced && !state.forceReason.trim()) {
    alert('⚠️ Force Reason/Justification is required before confirming a forced match!');
    if (forceReasonEl) forceReasonEl.focus();
    return;
  }

  state.isSubmitting = true;
  state.isConfirmModalOpen = false; 
  renderMappingWorkspace(container);

  try {
    const endpoint = isForced ? '/house-allocation-mappings/force' : '/house-allocation-mappings';
    const payload = {
      beneficiaryId: state.selectedBeneficiary.id,
      propertyId: state.selectedProperty.id,
      requestId: state.selectedBeneficiary.requestId,
      isForcedMatch: isForced,
      forceReason: isForced ? state.forceReason : null,
      notes: state.notes || `Allocated via 3-Column Mapping Studio workspace`
    };

    await store.apiService.post(endpoint, payload);
    
    if ((store as any).notify) (store as any).notify();
    
    const mappedBenName = state.selectedBeneficiary.fullName;
    const mappedPropCode = state.selectedProperty.code;

    state.beneficiaries = state.beneficiaries.filter(b => b.id !== state.selectedBeneficiary?.id);
    state.properties = state.properties.filter(p => p.id !== state.selectedProperty?.id);

    state.selectedBeneficiary = state.beneficiaries[0] || null;
    state.selectedProperty = state.properties[0] || null;
    state.forceReason = '';
    state.isForcedMode = false;
    state.propertySuggestionsCache.clear();
    state.beneficiarySuggestionsCache.clear();
    state.viewMode = 'by-beneficiary';
    state.successNotification = `Successfully allocated property ${mappedPropCode} to ${mappedBenName}!`;

    await loadWorkspaceData(true);

  } catch (err: any) {
    console.error('Mapping execution failed', err);
    alert('Failed to execute mapping: ' + (err.message || 'Unknown error'));
    state.isConfirmModalOpen = true;
  } finally {
    state.isSubmitting = false;
    renderMappingWorkspace(container);
  }
}