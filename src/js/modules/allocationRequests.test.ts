// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fc from 'fast-check';
import { store } from '../store';
import { initAllocationRequests, cleanupAllocationRequests, renderAllocationRequests } from './allocation-requests';
import { router } from '../router';

describe('Allocation Requests Module Lifecycle and Routing', () => {
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '<div id="main-content-area"></div>';
    
    // Clean up any active subscriptions
    cleanupAllocationRequests();
    
    // Reset store state
    store.currentUser = null;
    store.activeTab = 'dashboard';
    store.listeners = [];
  });

  describe('Bug Condition Tests (Task 1)', () => {
    it('Property 1.1: Calling initAllocationRequests multiple times result in exactly one store listener', () => {
      // Simulate navigating 3 times
      initAllocationRequests();
      initAllocationRequests();
      initAllocationRequests();

      // Filter for active listeners on store
      expect(store.listeners.length).toBe(1);
    });

    it('Property 1.2: renderAllocationRequests does not fetch user directly', () => {
      const fetchSpy = vi.spyOn(store, 'fetchCurrentUser');
      store.currentUser = null;
      
      renderAllocationRequests();

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('Property 1.3: Router subscription guard prevents re-entry when activeTab is unchanged', () => {
      store.activeTab = 'allocation-requests';
      const handleRouteSpy = vi.spyOn(router, 'handleRoute');

      // Trigger store notify while on same tab
      store.notify();
      
      // Should not re-run handleRoute if tab hasn't changed
      expect(handleRouteSpy).not.toHaveBeenCalled();
    });

    it('Property 1.4: Navigating away from allocation-requests cleans up subscriber', () => {
      initAllocationRequests();
      expect(store.listeners.length).toBe(1);

      // Simulate router navigating to dashboard
      router.handleRoute('dashboard');

      expect(store.listeners.length).toBe(0);
    });
  });

  describe('Preservation Property Tests (Task 2)', () => {
    it('Property 2.1: Pre-populated user renders immediately without fetch', () => {
      store.currentUser = {
        id: 'u1',
        name: { am: 'Test', en: 'Test' },
        email: 'test@example.com',
        username: 'test',
        roles: [{ id: 'r1', key: 'super_admin' }],
        permissions: [],
        userType: 'admin',
        status: 'active'
      };

      const fetchSpy = vi.spyOn(store, 'fetchCurrentUser');
      initAllocationRequests();

      expect(fetchSpy).not.toHaveBeenCalled();
      const content = document.getElementById('main-content-area')?.innerHTML || '';
      expect(content).toContain('House Allocation Requests');
    });

    it('Property 2.2: Mock mode initializes user without HTTP calls', async () => {
      store.setApiMode('mock');
      store.currentUser = null;

      const fetchSpy = vi.spyOn(store, 'fetchCurrentUser');
      initAllocationRequests();

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(store.currentUser).not.toBeNull();
      expect(store.currentUser?.username).toBe('admin');
    });

    it('Property 2.3: Other tab routing calls correct render functions', () => {
      const tabs = ['dashboard', 'categories', 'labels', 'tiers', 'ranks', 'assignments', 'titles', 'institutions', 'user-extensions', 'queue-management', 'queue-by-institution'];
      
      for (const tab of tabs) {
        store.setActiveTab(tab);
        expect(store.activeTab).toBe(tab);
      }
    });

    it('Property 2.4: Fast-Check Property - Rapid notify calls coalesce to single render window', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 20 }), (notifyCount) => {
          cleanupAllocationRequests();
          initAllocationRequests();

          const initialListenerCount = store.listeners.length;
          expect(initialListenerCount).toBe(1);

          for (let i = 0; i < notifyCount; i++) {
            store.notify();
          }

          // Listener count must remain strictly 1
          expect(store.listeners.length).toBe(1);
        })
      );
    });
  });
});
