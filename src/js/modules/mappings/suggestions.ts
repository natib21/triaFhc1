/**
 * Property Suggestions View (/mappings/suggestions)
 */

import { store } from '../../store';
import { NextWithSuggestionsResponse, SuggestionResult } from './types';
import { openPropertyPreviewModal } from './modals';

let currentSuggestionsData: NextWithSuggestionsResponse | null = null;
let isLoading = false;
let activeListeners: { element: Element; type: string; handler: EventListener }[] = [];

function addManagedListener(element: Element | null, type: string, handler: EventListener) {
  if (element) {
    element.addEventListener(type, handler);
    activeListeners.push({ element, type, handler });
  }
}

export function cleanupSuggestions(): void {
  activeListeners.forEach(({ element, type, handler }) => {
    element.removeEventListener(type, handler);
  });
  activeListeners = [];
}

async function fetchNextSuggestions(): Promise<void> {
  try {
    isLoading = true;
    const response = await store.apiService.get<NextWithSuggestionsResponse>('/house-allocation-mappings/next-from-queue');
    currentSuggestionsData = response;
  } catch (err: any) {
    console.error('Failed to fetch next suggestions', err);
  } finally {
    isLoading = false;
  }
}

export async function renderMappingSuggestions(container: HTMLElement): Promise<void> {
  cleanupSuggestions();

  if (!currentSuggestionsData && !isLoading) {
    await fetchNextSuggestions();
  }

  const data = currentSuggestionsData;
  const beneficiary = data?.beneficiary;
  const suggestions = data?.suggestions || [];

  container.innerHTML = `
    <div class="space-y-6 pb-12 animate-in fade-in duration-200">
      
      <!-- Top Navigation & Header -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div class="flex items-center space-x-2">
            <button id="btn-back-mappings" class="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap-link="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
            </button>
            <h1 class="text-2xl font-bold text-slate-900">Property Allocation Suggestions</h1>
          </div>
          <p class="text-xs text-slate-500 mt-1">Automated matching engine suggestions for the next beneficiary on the waitlist</p>
        </div>

        <div class="flex items-center space-x-3">
          <button id="btn-fetch-next" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors flex items-center space-x-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap-link="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
            <span>Next Beneficiary</span>
          </button>
        </div>
      </div>

      ${isLoading ? `
        <div class="bg-white p-12 rounded-xl border border-slate-200 shadow-sm text-center">
          <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-indigo-600 border-t-transparent mb-3"></div>
          <p class="text-sm font-semibold text-slate-700">Calculating optimal housing property matches...</p>
        </div>
      ` : !beneficiary ? `
        <div class="bg-white p-12 rounded-xl border border-slate-200 shadow-sm text-center space-y-3">
          <p class="text-lg font-bold text-slate-800">No active beneficiaries found on waitlist</p>
          <p class="text-xs text-slate-500">All current requests have been processed or mapped.</p>
        </div>
      ` : `
        
        <!-- Beneficiary Card -->
        <div class="bg-gradient-to-r from-slate-900 to-indigo-950 text-white p-6 rounded-xl shadow-lg border border-indigo-900/50 space-y-4">
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-indigo-800/60">
            <div>
              <div class="flex items-center space-x-3">
                <h2 class="text-xl font-black">${beneficiary.fullName}</h2>
                <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                  Waitlist Position: #${beneficiary.queuePosition || 1} of ${beneficiary.totalInQueue || 12}
                </span>
              </div>
              <p class="text-xs text-indigo-200 mt-1">${beneficiary.rank || 'Senior Director'} | ${beneficiary.institution || 'Ministry'}</p>
            </div>

            <div class="flex items-center space-x-4 text-xs bg-indigo-900/50 p-3 rounded-lg border border-indigo-700/40">
              <div>
                <span class="text-indigo-300 block text-[10px] uppercase font-semibold">Bedroom Entitlement</span>
                <span class="font-bold text-white text-sm">${beneficiary.bedroomEntitlement || 3} Bedrooms</span>
              </div>
              <div class="h-8 w-px bg-indigo-700/60"></div>
              <div>
                <span class="text-indigo-300 block text-[10px] uppercase font-semibold">Priority Rank Code</span>
                <span class="font-bold text-white text-sm">${beneficiary.rankCode || 'PRIORITY_1'}</span>
              </div>
            </div>
          </div>

          <!-- Preferences -->
          <div class="flex flex-wrap items-center gap-3 text-xs">
            <span class="text-indigo-300 font-semibold">Preferred Housing Types:</span>
            ${(beneficiary.preferredHouseTypes || ['APARTMENT', 'VILLA']).map(t => `
              <span class="px-2.5 py-1 rounded bg-indigo-800/80 text-white font-medium border border-indigo-700/50">${t}</span>
            `).join('')}
          </div>
        </div>

        <!-- Property Suggestions Header -->
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-bold text-slate-900">Calculated Property Suggestions (${suggestions.length})</h3>
          <span class="text-xs text-slate-500">Sorted by highest match compatibility score</span>
        </div>

        <!-- Suggestions List / Grid -->
        ${suggestions.length === 0 ? `
          <div class="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-500">
            No vacant properties available matching criteria.
          </div>
        ` : `
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            ${suggestions.map((sug, idx) => `
              <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4 hover:border-indigo-300 transition-all flex flex-col justify-between">
                
                <div class="space-y-3">
                  <!-- Top Row: Score & Rank -->
                  <div class="flex items-center justify-between">
                    <span class="text-xs font-bold uppercase tracking-wider text-slate-400">Option #${idx + 1}</span>
                    <div class="flex items-center space-x-2">
                      <div class="px-2.5 py-1 rounded-full text-xs font-black ${sug.score >= 80 ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-amber-100 text-amber-800 border border-amber-300'}">
                        ${sug.score}% Match Score
                      </div>
                    </div>
                  </div>

                  <!-- Property Address & Type -->
                  <div>
                    <h4 class="font-bold text-slate-900 text-base leading-snug">${sug.property.address}</h4>
                    <p class="text-xs text-slate-500 mt-0.5">${sug.property.propertyType} • ${sug.property.bedrooms} Bedrooms • ${sug.property.monthlyRent ? `${sug.property.monthlyRent.toLocaleString()} ETB/mo` : 'Standard Rent'}</p>
                  </div>

                  <!-- Match Reason Badges -->
                  <div class="space-y-1.5">
                    ${sug.matchReasons.map(r => `
                      <div class="text-[11px] px-2.5 py-1 rounded bg-slate-50 text-slate-700 border border-slate-200 font-medium flex items-center space-x-1.5">
                        <span>${r}</span>
                      </div>
                    `).join('')}
                  </div>
                </div>

                <!-- Action Button -->
                <div class="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span class="text-[11px] text-slate-400">Status: <strong class="text-emerald-600 font-semibold">Vacant</strong></span>
                  <button data-action="preview-map" data-index="${idx}" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors flex items-center space-x-1.5">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap-link="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap-link="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                    <span>Preview & Map Property</span>
                  </button>
                </div>

              </div>
            `).join('')}
          </div>
        `}

      `}

    </div>
  `;

  // Attach Event Listeners
  addManagedListener(document.getElementById('btn-back-mappings'), 'click', () => {
    store.setActiveTab('mappings');
  });

  addManagedListener(document.getElementById('btn-fetch-next'), 'click', async () => {
    await fetchNextSuggestions();
    renderMappingSuggestions(container);
  });

  // Action buttons for property preview
  container.querySelectorAll('button[data-action="preview-map"]').forEach(btn => {
    addManagedListener(btn, 'click', (e) => {
      const target = e.currentTarget as HTMLElement;
      const index = parseInt(target.dataset.index || '0', 10);
      const sug = suggestions[index];
      if (sug && beneficiary) {
        openPropertyPreviewModal(sug, beneficiary);
      }
    });
  });
}
