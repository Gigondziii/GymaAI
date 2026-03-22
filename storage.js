const Storage = (() => {
  const KEYS = {
    USER: 'gyma_user',
    PLAN: 'gyma_plan',
    HISTORY: 'gyma_history',
    MISTAKES: 'gyma_mistakes',
    TUTORIAL_SEEN: 'gyma_tutorial_seen',
    BRIEFING_COUNT: 'gyma_briefing_count',
    ONBOARDING_DONE: 'gyma_onboarding_done',
  };

  function get(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  }
  function set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }
  function remove(key) { localStorage.removeItem(key); }
  function clear() { Object.values(KEYS).forEach(k => localStorage.removeItem(k)); }

  return {
    KEYS,
    getUser: () => get(KEYS.USER),
    setUser: v => set(KEYS.USER, v),
    getPlan: () => get(KEYS.PLAN),
    setPlan: v => set(KEYS.PLAN, v),
    getHistory: () => get(KEYS.HISTORY) || [],
    addSession: session => {
      const h = get(KEYS.HISTORY) || [];
      h.unshift(session);
      set(KEYS.HISTORY, h.slice(0, 60));
    },
    getMistakes: () => get(KEYS.MISTAKES) || [],
    addMistake: m => {
      const ms = get(KEYS.MISTAKES) || [];
      ms.unshift(m);
      set(KEYS.MISTAKES, ms.slice(0, 200));
    },
    isTutorialSeen: () => !!get(KEYS.TUTORIAL_SEEN),
    markTutorialSeen: () => set(KEYS.TUTORIAL_SEEN, true),
    getBriefingCount: () => get(KEYS.BRIEFING_COUNT) || 0,
    incBriefingCount: () => set(KEYS.BRIEFING_COUNT, (get(KEYS.BRIEFING_COUNT) || 0) + 1),
    isOnboardingDone: () => !!get(KEYS.ONBOARDING_DONE),
    markOnboardingDone: () => set(KEYS.ONBOARDING_DONE, true),
    clearAll: clear,
  };
})();
