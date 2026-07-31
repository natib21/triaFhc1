// Reusable enterprise API Service with Bearer Auth and seamless local/mock bypass for testing.
import { store } from './store';

export class ApiService {
  private baseURL: string;
  private token: string;

  constructor(baseURL: string, token: string) {
    this.baseURL = baseURL;
    this.token = token;
  }

  public updateToken(newToken: string) {
    this.token = newToken;
  }

  public updateBaseURL(newURL: string) {
    this.baseURL = newURL;
  }

  /**
   * General request wrapper with Bearer token authentication
   */
  public async request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
    // If store is in mock mode, bypass real fetch and simulate responses.
    // This allows full standalone testing of all 10 modules in the iframe.
    if (store && store.apiMode === 'mock') {
      return this.handleMockRequest<T>(endpoint, options);
    }

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `API error (Status: ${response.status})`);
      }

      const contentType = response.headers.get('content-type');
      let result: any;
      if (contentType && contentType.includes('application/json')) {
        result = await response.json();
      } else {
        const text = await response.text();
        if (text) {
          try {
            result = JSON.parse(text);
          } catch {
            result = { message: text } as any;
          }
        } else {
          result = {} as any;
        }
      }

      // Automatically sync store lists after mutation so the UI displays the updated live data immediately.
      const method = (options.method || 'GET').toUpperCase();
      if (method !== 'GET' && store && typeof store.syncWithBackend === 'function') {
        await store.syncWithBackend(true);
      }

      return result as T;
    } catch (err: any) {
      // If network fetch fails (e.g. backend server unavailable on port 3010), seamlessly fallback to mock mode
      if (
        err instanceof TypeError ||
        (err.message && (err.message.includes('Failed to fetch') || err.message.includes('NetworkError') || err.message.includes('fetch')))
      ) {
        console.warn(`Backend fetch to ${this.baseURL}${endpoint} failed (${err.message}). Falling back to local mock mode.`);
        if (store) {
          store.apiMode = 'mock';
          store.saveStateToStorage();
        }
        return this.handleMockRequest<T>(endpoint, options);
      }
      throw err;
    }
  }

  // Helper methods
  public async get<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  public async post<T = any>(endpoint: string, body?: any, options: RequestInit = {}): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  public async put<T = any>(endpoint: string, body?: any, options: RequestInit = {}): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  public async delete<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
  
 public async patch<T = any>(endpoint: string, body?: any, options: RequestInit = {}): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }
  /**
   * Emulate the REST backend locally using the Store's data lists.
   * This implements complete CRUD logic so that all 10 endpoints work perfectly.
   */
  private async handleMockRequest<T = any>(endpoint: string, options: RequestInit): Promise<T> {
    // Artificial latency for a premium production feel
    await new Promise((resolve) => setTimeout(resolve, 350));

    const method = options.method || 'GET';
    const cleanEndpoint = endpoint.split('?')[0];
    const pathParts = cleanEndpoint.split('/').filter(Boolean);

    const resource = pathParts[0];
    const id = pathParts[1];

    const body = typeof options.body === 'string' ? JSON.parse(options.body) : null;

    // 1. Categories
    if (resource === 'categories') {
      if (method === 'GET') {
        if (id) {
          const item = store.categories.find(c => c.id === id);
          if (!item) throw new Error('Category not found');
          return item as any;
        }
        return store.categories as any;
      }
      if (method === 'POST') {
        const newItem = {
          id: `cat-${Date.now()}`,
          ...body,
        };
        store.categories.push(newItem);
        store.saveStateToStorage();
        return newItem as any;
      }
      if (method === 'PUT' && id) {
        const index = store.categories.findIndex(c => c.id === id);
        if (index === -1) throw new Error('Category not found');
        store.categories[index] = { ...store.categories[index], ...body };
        store.saveStateToStorage();
        return store.categories[index] as any;
      }
      if (method === 'DELETE' && id) {
        store.categories = store.categories.filter(c => c.id !== id);
        store.saveStateToStorage();
        return { success: true } as any;
      }
    }

    // 2. Labels
    if (resource === 'institution-labels') {
      if (method === 'GET') {
        if (id) {
          const item = store.labels.find(l => l.id === id);
          if (!item) throw new Error('Label not found');
          return item as any;
        }
        return store.labels as any;
      }
      if (method === 'POST') {
        const newItem = {
          id: `lbl-${Date.now()}`,
          ...body,
        };
        store.labels.push(newItem);
        store.saveStateToStorage();
        return newItem as any;
      }
      if (method === 'PUT' && id) {
        const index = store.labels.findIndex(l => l.id === id);
        if (index === -1) throw new Error('Label not found');
        store.labels[index] = { ...store.labels[index], ...body };
        store.saveStateToStorage();
        return store.labels[index] as any;
      }
      if (method === 'DELETE' && id) {
        store.labels = store.labels.filter(l => l.id !== id);
        store.saveStateToStorage();
        return { success: true } as any;
      }
    }

    // 3. Tiers
    if (resource === 'institution-tiers') {
      if (method === 'GET') {
        if (id) {
          const item = store.tiers.find(t => t.id === id);
          if (!item) throw new Error('Tier not found');
          return item as any;
        }
        return store.tiers as any;
      }
      if (method === 'POST') {
        const newItem = {
          id: `tier-${Date.now()}`,
          ...body,
        };
        store.tiers.push(newItem);
        store.saveStateToStorage();
        return newItem as any;
      }
      if (method === 'PUT' && id) {
        const index = store.tiers.findIndex(t => t.id === id);
        if (index === -1) throw new Error('Tier not found');
        store.tiers[index] = { ...store.tiers[index], ...body };
        store.saveStateToStorage();
        return store.tiers[index] as any;
      }
      if (method === 'DELETE' && id) {
        store.tiers = store.tiers.filter(t => t.id !== id);
        store.saveStateToStorage();
        return { success: true } as any;
      }
    }

    // 4. Ranks
    if (resource === 'ranks') {
      if (method === 'GET') {
        if (id) {
          const item = store.ranks.find(r => r.id === id);
          if (!item) throw new Error('Rank not found');
          return item as any;
        }
        return store.ranks as any;
      }
      if (method === 'POST') {
        const newItem = {
          id: `rnk-${Date.now()}`,
          ...body,
        };
        store.ranks.push(newItem);
        store.saveStateToStorage();
        return newItem as any;
      }
      if (method === 'PUT' && id) {
        const index = store.ranks.findIndex(r => r.id === id);
        if (index === -1) throw new Error('Rank not found');
        store.ranks[index] = { ...store.ranks[index], ...body };
        store.saveStateToStorage();
        return store.ranks[index] as any;
      }
      if (method === 'DELETE' && id) {
        store.ranks = store.ranks.filter(r => r.id !== id);
        store.saveStateToStorage();
        return { success: true } as any;
      }
    }

    // 5. Tier Assignments
    if (resource === 'tier-assignments') {
      if (method === 'GET') {
        if (id) {
          const item = store.assignments.find(a => a.id === id);
          if (!item) throw new Error('Assignment not found');
          return item as any;
        }
        return store.assignments as any;
      }
      if (method === 'POST') {
        const newItem = {
          id: `asg-${Date.now()}`,
          ...body,
        };
        store.assignments.push(newItem);
        store.saveStateToStorage();
        return newItem as any;
      }
      if (method === 'PUT' && id) {
        const index = store.assignments.findIndex(a => a.id === id);
        if (index === -1) throw new Error('Assignment not found');
        store.assignments[index] = { ...store.assignments[index], ...body };
        store.saveStateToStorage();
        return store.assignments[index] as any;
      }
      if (method === 'DELETE' && id) {
        store.assignments = store.assignments.filter(a => a.id !== id);
        store.saveStateToStorage();
        return { success: true } as any;
      }
    }

    // 6. Titles
    if (resource === 'titles') {
      if (method === 'GET') {
        if (id) {
          const item = store.titles.find(t => t.id === id);
          if (!item) throw new Error('Title not found');
          return item as any;
        }
        return store.titles as any;
      }
      if (method === 'POST') {
        const newItem = {
          id: `tit-${Date.now()}`,
          ...body,
        };
        store.titles.push(newItem);
        store.saveStateToStorage();
        return newItem as any;
      }
      if (method === 'PUT' && id) {
        const index = store.titles.findIndex(t => t.id === id);
        if (index === -1) throw new Error('Title not found');
        store.titles[index] = { ...store.titles[index], ...body };
        store.saveStateToStorage();
        return store.titles[index] as any;
      }
      if (method === 'DELETE' && id) {
        store.titles = store.titles.filter(t => t.id !== id);
        store.saveStateToStorage();
        return { success: true } as any;
      }
    }

    // 7. Institutions
    if (resource === 'institutions') {
      if (method === 'GET') {
        if (id) {
          const item = store.institutions.find(i => i.id === id);
          if (!item) throw new Error('Institution not found');
          return item as any;
        }
        return store.institutions as any;
      }
      if (method === 'POST') {
        const newItem = {
          id: `inst-${Date.now()}`,
          ...body,
        };
        store.institutions.push(newItem);
        store.saveStateToStorage();
        return newItem as any;
      }
      if (method === 'PUT' && id) {
        const index = store.institutions.findIndex(i => i.id === id);
        if (index === -1) throw new Error('Institution not found');
        store.institutions[index] = { ...store.institutions[index], ...body };
        store.saveStateToStorage();
        return store.institutions[index] as any;
      }
      if (method === 'DELETE' && id) {
        store.institutions = store.institutions.filter(i => i.id !== id);
        store.saveStateToStorage();
        return { success: true } as any;
      }
    }

    // 8. User Extensions
    if (resource === 'user-extensions') {
      if (method === 'GET') {
        if (id) {
          const item = store.userExtensions.find(u => u.id === id);
          if (!item) throw new Error('User extension not found');
          return item as any;
        }
        return store.userExtensions as any;
      }
      if (method === 'POST') {
        const newItem = {
          id: `ext-${Date.now()}`,
          ...body,
        };
        store.userExtensions.push(newItem);
        store.saveStateToStorage();
        return newItem as any;
      }
      if (method === 'PUT' && id) {
        const index = store.userExtensions.findIndex(u => u.id === id);
        if (index === -1) throw new Error('User extension not found');
        store.userExtensions[index] = { ...store.userExtensions[index], ...body };
        store.saveStateToStorage();
        return store.userExtensions[index] as any;
      }
      if (method === 'DELETE' && id) {
        store.userExtensions = store.userExtensions.filter(u => u.id !== id);
        store.saveStateToStorage();
        return { success: true } as any;
      }
    }

    // 9. House Allocation Requests
    if (resource === 'house-allocation-requests') {
      if (method === 'GET') {
        if (id) {
          const item = store.allocationRequests.find(h => h.id === id);
          if (!item) throw new Error('Request not found');
          return item as any;
        }
        return store.allocationRequests as any;
      }
      if (method === 'POST') {
        const newItem = {
          id: `req-${Date.now()}`,
          createdAt: new Date().toISOString(),
          ...body,
        };
        store.allocationRequests.push(newItem);
        
        // Also automatically add to Queue as "QUEUED"
        const queuePos = store.allocationQueue.length > 0 
          ? Math.max(...store.allocationQueue.map(q => q.position)) + 1 
          : 1;

        store.allocationQueue.push({
          id: `q-${Date.now()}`,
          requestId: newItem.id,
          position: queuePos,
          priority: newItem.priority,
          status: 'QUEUED',
          createdAt: newItem.createdAt,
        });

        store.saveStateToStorage();
        return newItem as any;
      }
      if (method === 'PUT' && id) {
        const index = store.allocationRequests.findIndex(h => h.id === id);
        if (index === -1) throw new Error('Request not found');
        store.allocationRequests[index] = { ...store.allocationRequests[index], ...body };
        store.saveStateToStorage();
        return store.allocationRequests[index] as any;
      }
      if (method === 'DELETE' && id) {
        store.allocationRequests = store.allocationRequests.filter(h => h.id !== id);
        store.allocationQueue = store.allocationQueue.filter(q => q.requestId !== id);
        store.saveStateToStorage();
        return { success: true } as any;
      }
    }

    // 10. House Allocation Queue (and custom actions)
    if (resource === 'house-allocation-queue') {
      if (method === 'GET') {
        if (id === 'next') {
          // Return the next item queued
          const nextItem = store.allocationQueue
            .filter(q => q.status === 'QUEUED')
            .sort((a, b) => a.position - b.position)[0];
          if (!nextItem) throw new Error('No items remaining in queue');
          return nextItem as any;
        }
        if (id === 'position' && pathParts[2]) {
          const reqId = pathParts[2];
          const qItem = store.allocationQueue.find(q => q.requestId === reqId && q.status === 'QUEUED');
          if (!qItem) {
            throw new Error('This request is not active or has been resolved');
          }
          const waitingAhead = store.allocationQueue
            .filter(q => q.status === 'QUEUED' && q.position < qItem.position).length;
          
          return {
            requestId: reqId,
            position: waitingAhead + 1,
            estimatedWaitDays: (waitingAhead + 1) * 14, // 14 days per position estimate
          } as any;
        }
        // Return full queue list in structured format expected by queue management
        return this.getMockQueueResponse() as any;
      }

      if (method === 'POST') {
        const action = pathParts[2]; // allocate or reject
        const queueItemId = id;

        const qItemIndex = store.allocationQueue.findIndex(q => q.id === queueItemId);
        if (qItemIndex === -1) throw new Error('Queue item not found');

        const qItem = store.allocationQueue[qItemIndex];

        if (action === 'allocate') {
          store.allocationQueue[qItemIndex].status = 'ALLOCATED';
          
          // Also set the main request status to APPROVED / COMPLETED
          const reqIdx = store.allocationRequests.findIndex(r => r.id === qItem.requestId);
          if (reqIdx !== -1) {
            store.allocationRequests[reqIdx].status = 'COMPLETED';
          }
          
          // Shift positions of remaining queued items
          this.recalculateQueuePositions();
          store.saveStateToStorage();
          return { success: true, message: 'House allocated and request completed successfully' } as any;
        }

        if (action === 'reject') {
          store.allocationQueue[qItemIndex].status = 'REJECTED';
          store.allocationQueue[qItemIndex].rejectionReason = body?.reason || 'Administrative rejection';

          const reqIdx = store.allocationRequests.findIndex(r => r.id === qItem.requestId);
          if (reqIdx !== -1) {
            store.allocationRequests[reqIdx].status = 'REJECTED';
          }

          this.recalculateQueuePositions();
          store.saveStateToStorage();
          return { success: true, message: 'Request rejected and removed from active queue' } as any;
        }
      }
    }

    // 11. House Allocation Mappings
    if (resource === 'house-allocation-mappings') {
      if (method === 'GET') {
        if (id === 'next-with-suggestions') {
          // Find next queued or waiting beneficiary
          const queuedReq = store.allocationRequests.find(r => r.status === 'PENDING') || store.allocationRequests[0];
          const beneficiaryName = queuedReq?.fullName || 'Abebe Bikila Worku';
          
          const beneficiary = {
            id: 'ben-next-' + Date.now(),
            requestId: queuedReq?.id || 'HAR-2026-000001',
            fullName: beneficiaryName,
            email: 'beneficiary@fhc.gov.et',
            phone: '+251 91 123 4567',
            rank: 'Senior Director (Rank 12)',
            rankCode: 'PRIORITY_1',
            institution: queuedReq?.institution || 'Ministry of Innovation & Tech',
            priorityLevel: '1',
            status: 'WAITING_LIST' as const,
            preferredHouseTypes: ['APARTMENT', 'VILLA'],
            bedroomEntitlement: 3,
            queuePosition: 1,
            totalInQueue: store.allocationRequests.filter(r => r.status === 'PENDING').length || 8,
          };

          const vacantProperties = store.properties.filter(p => p.status === 'VACANT');
          const suggestions = vacantProperties.map(prop => {
            const bedroomMatch = prop.bedrooms === beneficiary.bedroomEntitlement;
            const houseTypeMatch = beneficiary.preferredHouseTypes.includes(prop.propertyType);
            
            let score = 50;
            const matchReasons: string[] = [];
            
            if (bedroomMatch) {
              score += 25;
              matchReasons.push('✅ Bedrooms match entitlement (' + prop.bedrooms + ' Beds)');
            } else if (prop.bedrooms > beneficiary.bedroomEntitlement) {
              score += 10;
              matchReasons.push('⚠️ Extra bedrooms (' + prop.bedrooms + ' Beds)');
            } else {
              score += 5;
              matchReasons.push('ℹ️ Smaller property (' + prop.bedrooms + ' Beds)');
            }

            if (houseTypeMatch) {
              score += 25;
              matchReasons.push('✅ Preferred type (' + prop.propertyType + ')');
            } else {
              matchReasons.push('ℹ️ Alternative type (' + prop.propertyType + ')');
            }

            return {
              property: prop,
              score,
              matchReasons,
              bedroomMatch,
              houseTypeMatch,
              matchingCriteria: {
                criteriaVersion: 1,
                rankCode: beneficiary.rankCode,
                priorityLevel: 1,
                bedroomEntitlementRule: 'FIXED',
                requiredBedrooms: beneficiary.bedroomEntitlement,
                actualBedrooms: prop.bedrooms,
                bedroomMatch,
                houseTypeMatch,
                preferredHouseTypes: beneficiary.preferredHouseTypes,
                fallbackHouseTypes: ['TOWNHOUSE']
              }
            };
          }).sort((a, b) => b.score - a.score);

          return { beneficiary, suggestions } as any;
        }

        if (id === 'beneficiary' && pathParts[2]) {
          return store.mappings.filter(m => m.beneficiaryId === pathParts[2]) as any;
        }

        if (id === 'request' && pathParts[2]) {
          return store.mappings.filter(m => m.requestId === pathParts[2] || m.requestReference === pathParts[2]) as any;
        }

        if (id === 'status' && pathParts[2]) {
          return store.mappings.filter(m => m.decisionStatus === pathParts[2].toUpperCase()) as any;
        }

        if (id === 'letter' && pathParts[2]) {
          return store.mappings.filter(m => m.decisionLetterId === pathParts[2] || m.decisionLetterReference === pathParts[2]) as any;
        }

        if (id) {
          const item = store.mappings.find(m => m.id === id);
          if (!item) throw new Error('Mapping not found');
          return item as any;
        }

        return store.mappings as any;
      }

      if (method === 'POST') {
        const subAction = pathParts[1]; // force, allocate, or standard id
        
        if (subAction === 'force') {
          const property = store.properties.find(p => p.id === body.propertyId) || store.properties[0];
          const newMapping = {
            id: 'map-' + Date.now(),
            referenceCode: 'MAP-2026-' + String(store.mappings.length + 1).padStart(3, '0'),
            beneficiaryId: body.beneficiaryId || 'ben-new-' + Date.now(),
            beneficiary: body.beneficiary || {
              id: body.beneficiaryId || 'ben-new',
              fullName: body.beneficiaryName || 'Selected Beneficiary',
              rank: 'Senior Official',
              status: 'MAPPED',
            },
            propertyId: property.id,
            property: property,
            requestId: body.requestId || 'HAR-2026-00000' + (store.mappings.length + 1),
            requestReference: body.requestReference || 'HAR-2026-00000' + (store.mappings.length + 1),
            decisionStatus: 'PENDING' as const,
            isForced: true,
            forceReason: body.forceReason || 'Overridden match forced by administrator',
            notes: body.notes || 'Forced mapping created',
            mappedBy: store.currentUser?.username || 'Admin Administrator',
            createdAt: new Date().toISOString(),
            matchScore: body.matchScore || 70,
          };

          store.mappings.unshift(newMapping);
          store.saveStateToStorage();
          return newMapping as any;
        }

        if (pathParts[2] === 'allocate') {
          const mappingId = pathParts[1];
          const index = store.mappings.findIndex(m => m.id === mappingId);
          if (index === -1) throw new Error('Mapping not found');

          store.mappings[index].decisionStatus = 'APPROVED';
          store.mappings[index].isAllocated = true;
          store.mappings[index].allocatedAt = new Date().toISOString();
          store.mappings[index].allocatedBy = store.currentUser?.username || 'Admin Administrator';
          store.mappings[index].beneficiary.status = 'ALLOCATED';

          // Update property status
          const propIdx = store.properties.findIndex(p => p.id === store.mappings[index].propertyId);
          if (propIdx !== -1) {
            store.properties[propIdx].status = 'OCCUPIED';
          }

          store.saveStateToStorage();
          return store.mappings[index] as any;
        }

        // Standard mapping creation
        const property = store.properties.find(p => p.id === body.propertyId) || store.properties[0];
        const newMapping = {
          id: 'map-' + Date.now(),
          referenceCode: 'MAP-2026-' + String(store.mappings.length + 1).padStart(3, '0'),
          beneficiaryId: body.beneficiaryId || 'ben-' + Date.now(),
          beneficiary: body.beneficiary || {
            id: body.beneficiaryId || 'ben-' + Date.now(),
            fullName: body.beneficiaryName || 'Selected Beneficiary',
            rank: 'Senior Official',
            status: 'MAPPED',
          },
          propertyId: property.id,
          property: property,
          requestId: body.requestId || 'HAR-2026-00000' + (store.mappings.length + 1),
          requestReference: body.requestReference || 'HAR-2026-00000' + (store.mappings.length + 1),
          decisionStatus: 'PENDING' as const,
          isForced: false,
          notes: body.notes || '',
          mappedBy: store.currentUser?.username || 'Admin Administrator',
          createdAt: new Date().toISOString(),
          matchScore: body.matchScore || 90,
        };

        store.mappings.unshift(newMapping);
        store.saveStateToStorage();
        return newMapping as any;
      }

      if (method === 'PATCH') {
        const mappingId = id;
        const action = pathParts[2]; // decision or reverse
        const index = store.mappings.findIndex(m => m.id === mappingId);
        if (index === -1) throw new Error('Mapping not found');

        if (action === 'decision') {
          const decision = body.status || body.decisionStatus || 'APPROVED';
          store.mappings[index].decisionStatus = decision;
          store.mappings[index].decisionDate = new Date().toISOString();
          store.mappings[index].decisionBy = store.currentUser?.username || 'Admin Administrator';
          store.mappings[index].decisionNotes = body.notes || body.decisionNotes;
          if (decision === 'REJECTED') {
            store.mappings[index].rejectionReason = body.rejectionReason || body.notes || 'Administrative decision';
            store.mappings[index].beneficiary.status = 'WAITING_LIST';
          } else {
            store.mappings[index].beneficiary.status = 'MAPPED';
          }

          store.saveStateToStorage();
          return store.mappings[index] as any;
        }

        if (action === 'reverse') {
          store.mappings[index].reversalStatus = 'REVERSED';
          store.mappings[index].reversalReason = body?.reason || 'Decision reversed by administrator';
          store.mappings[index].reversedAt = new Date().toISOString();
          store.mappings[index].reversedBy = store.currentUser?.username || 'Admin Administrator';
          store.mappings[index].beneficiary.status = 'WAITING_LIST';

          // Reset property to VACANT if it was mapped/occupied
          const propIdx = store.properties.findIndex(p => p.id === store.mappings[index].propertyId);
          if (propIdx !== -1) {
            store.properties[propIdx].status = 'VACANT';
          }

          store.saveStateToStorage();
          return store.mappings[index] as any;
        }
      }
    }

    // 12. Decision Letters
    if (resource === 'allocation-decision-letters') {
      if (method === 'GET') {
        if (id && pathParts[2] === 'mappings') {
          return store.mappings.filter(m => m.decisionLetterId === id) as any;
        }

        if (id) {
          const letter = store.decisionLetters.find(l => l.id === id);
          if (!letter) throw new Error('Decision letter not found');
          const letterMappings = store.mappings.filter(m => m.decisionLetterId === id);
          return { ...letter, mappings: letterMappings } as any;
        }

        return store.decisionLetters as any;
      }

      if (method === 'POST') {
        const mappingIds: string[] = body.mappingIds || [];
        const letterRef = body.letterReference || 'HAL-2026-' + String(store.decisionLetters.length + 1).padStart(3, '0');
        const letterId = 'letter-' + Date.now();

        const newLetter = {
          id: letterId,
          letterReference: letterRef,
          letterDate: body.letterDate || new Date().toISOString().split('T')[0],
          status: 'DRAFT' as const,
          mappingsCount: mappingIds.length,
          notes: body.notes || 'Batch housing decision letter',
          createdAt: new Date().toISOString(),
        };

        store.decisionLetters.unshift(newLetter);

        // Update selected mappings
        mappingIds.forEach(mId => {
          const mIdx = store.mappings.findIndex(m => m.id === mId);
          if (mIdx !== -1) {
            store.mappings[mIdx].decisionLetterId = letterId;
            store.mappings[mIdx].decisionLetterReference = letterRef;
          }
        });

        store.saveStateToStorage();
        return newLetter as any;
      }

      if (method === 'PATCH' && pathParts[2] === 'approve') {
        const letterId = id;
        const letterIdx = store.decisionLetters.findIndex(l => l.id === letterId);
        if (letterIdx === -1) throw new Error('Decision letter not found');

        store.decisionLetters[letterIdx].status = 'APPROVED';
        store.decisionLetters[letterIdx].approvalDate = new Date().toISOString();
        store.decisionLetters[letterIdx].approvedBy = store.currentUser?.username || 'Director General';

        // Auto-allocate all mappings in letter
        const letterMappings = store.mappings.filter(m => m.decisionLetterId === letterId);
        letterMappings.forEach(m => {
          const mIdx = store.mappings.findIndex(item => item.id === m.id);
          if (mIdx !== -1) {
            store.mappings[mIdx].decisionStatus = 'APPROVED';
            store.mappings[mIdx].isAllocated = true;
            store.mappings[mIdx].allocatedAt = new Date().toISOString();
            store.mappings[mIdx].allocatedBy = store.currentUser?.username || 'Director General';
            store.mappings[mIdx].beneficiary.status = 'ALLOCATED';

            const propIdx = store.properties.findIndex(p => p.id === store.mappings[mIdx].propertyId);
            if (propIdx !== -1) {
              store.properties[propIdx].status = 'OCCUPIED';
            }
          }
        });

        store.saveStateToStorage();
        return store.decisionLetters[letterIdx] as any;
      }

      if (method === 'DELETE' && pathParts[2] === 'cancel') {
        const letterId = id;
        const letterIdx = store.decisionLetters.findIndex(l => l.id === letterId);
        if (letterIdx === -1) throw new Error('Decision letter not found');

        store.decisionLetters[letterIdx].status = 'CANCELLED';

        // Unlink mappings
        store.mappings.forEach((m, idx) => {
          if (m.decisionLetterId === letterId) {
            delete store.mappings[idx].decisionLetterId;
            delete store.mappings[idx].decisionLetterReference;
          }
        });

        store.saveStateToStorage();
        return { success: true, message: 'Decision letter cancelled and mappings unlinked' } as any;
      }
    }

    throw new Error(`Endpoint not mock-implemented: ${method} /${resource}`);
  }

  private recalculateQueuePositions() {
    const activeItems = store.allocationQueue
      .filter(q => q.status === 'QUEUED')
      .sort((a, b) => a.position - b.position);
    
    activeItems.forEach((item, index) => {
      const idx = store.allocationQueue.findIndex(q => q.id === item.id);
      if (idx !== -1) {
        store.allocationQueue[idx].position = index + 1;
      }
    });
  }

  private getMockQueueResponse() {
    const rawQueue = store.allocationQueue || [];
    const isDetailed = rawQueue.length > 0 && rawQueue[0] && (rawQueue[0] as any).beneficiary && (rawQueue[0] as any).request;
    if (isDetailed) {
      return {
        total: rawQueue.length,
        estimatedClearDays: 45,
        items: rawQueue
      };
    }

    const requests = store.allocationRequests && store.allocationRequests.length > 0 ? store.allocationRequests : [
      {
        id: 'HAR-2026-000001',
        referenceNumber: 'HAL-2026-001',
        letterDate: '2026-01-10',
        registeredDate: '2026-01-15',
        priority: 'HIGH',
        status: 'APPROVED',
        beneficiaries: [{ id: 'ben-1', fullName: 'Abebe Bikila Worku', type: 'Individual' }],
        institutionId: 'inst-1'
      },
      {
        id: 'HAR-2026-000002',
        referenceNumber: 'HAL-2026-002',
        letterDate: '2026-01-12',
        registeredDate: '2026-01-18',
        priority: 'HIGH',
        status: 'PENDING',
        beneficiaries: [{ id: 'ben-2', fullName: 'Tigist Hailemariam', type: 'Individual' }],
        institutionId: 'inst-2'
      },
      {
        id: 'HAR-2026-000003',
        referenceNumber: 'HAL-2026-003',
        letterDate: '2026-01-14',
        registeredDate: '2026-01-20',
        priority: 'MEDIUM',
        status: 'PENDING',
        beneficiaries: [{ id: 'ben-3', fullName: 'Kefyalew Tadesse', type: 'Individual' }],
        institutionId: 'inst-3'
      },
      {
        id: 'HAR-2026-000004',
        referenceNumber: 'HAL-2026-004',
        letterDate: '2026-01-16',
        registeredDate: '2026-01-22',
        priority: 'LOW',
        status: 'PENDING',
        beneficiaries: [{ id: 'ben-4', fullName: 'Mulugeta Assefa', type: 'Individual' }],
        institutionId: 'inst-1'
      }
    ];

    const mappedItems = requests.map((req: any, index: number) => {
      const benObj = req.beneficiaries?.[0] || {};
      const nameParts = (benObj.fullName || 'Beneficiary Name').split(' ');
      const firstName = nameParts[0] || 'Beneficiary';
      const middleName = nameParts[1] || 'FHC';
      const lastName = nameParts.slice(2).join(' ') || 'Worku';

      const inst = store.institutions.find(i => i.id === req.institutionId) || {
        id: req.institutionId || 'inst-1',
        code: 'MINT',
        name: { en: 'Ministry of Innovation & Technology', am: 'የኢኖቬሽንና ቴክኖሎጂ ሚኒስቴር' }
      };

      const instNameEn = typeof inst.name === 'object' ? inst.name.en : inst.name;
      const instNameAm = typeof inst.name === 'object' ? inst.name.am : inst.name;

      return {
        position: index + 1,
        priorityBreakdown: {
          isOverride: false,
          priorityReason: ['Rank Priority Tier 1', 'Executive Request'],
          beneficiary: {
            rankCode: `PRIORITY_${Math.min(index + 1, 3)}`,
            rankPriority: index + 1
          },
          institution: {
            tierCode: 'TIER_1',
            tierPriority: 1,
            allocationHistoryCount: 2
          }
        },
        beneficiary: {
          id: benObj.id || `ben-${index + 1}`,
          status: req.status === 'COMPLETED' ? 'allocated' : 'waiting_list',
          waitingListPosition: index + 1,
          enteredWaitingListAt: req.registeredDate || '2026-01-15T00:00:00.000Z',
          isOverrideQueue: false,
          beneficiaryIndividual: {
            firstName,
            middleName,
            lastName,
            email: `${firstName.toLowerCase()}@fhc.gov.et`,
            phonePrimary: `+251 91 123 456${index}`,
            gender: 'Male',
            nationalIdNumber: `ETH-2026-00${index + 1}`,
            dateOfBirth: '1988-06-15'
          },
          beneficiaryInstitution: {
            id: inst.id,
            code: inst.code || 'MINT',
            shortName: inst.code || 'MInT',
            institutionType: 'GOVERNMENT',
            name: { en: instNameEn || 'Ministry of Innovation', am: instNameAm || 'የኢኖቬሽን ሚኒስቴር' }
          }
        },
        request: {
          id: req.id || `HAR-2026-00000${index + 1}`,
          letterReferenceNumber: req.referenceNumber || `HAL-2026-00${index + 1}`,
          letterDate: req.letterDate || '2026-01-10T00:00:00.000Z',
          registeredAt: req.registeredDate || '2026-01-15T00:00:00.000Z',
          status: req.status || 'PENDING',
          requestingInstitution: {
            id: inst.id,
            code: inst.code || 'MINT',
            shortName: inst.code || 'MInT',
            institutionType: 'GOVERNMENT',
            name: { en: instNameEn || 'Ministry of Innovation', am: instNameAm || 'የኢኖቬሽን ሚኒስቴር' },
            currentTier: {
              code: 'TIER_1',
              allocationPriority: 1,
              name: { en: 'Tier 1 Executive', am: 'ደረጃ 1' }
            }
          }
        }
      };
    });

    return {
      total: mappedItems.length,
      estimatedClearDays: 45,
      items: mappedItems
    };
  }
}
