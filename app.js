// ============================================
// GYMA — APP STATE MACHINE & ROUTER
// ============================================

const App = (() => {
  const appEl = document.getElementById('app');
  const bottomNav = document.getElementById('bottom-nav');
  let currentScreen = null;
  let currentWorkoutData = null;

  // Screens that show the bottom nav
  const TAB_SCREENS = ['home', 'schedule', 'progress', 'account'];
  const NAV_TO_SCREEN = { home: 'home', schedule: 'schedule', progress: 'progress', account: 'account' };

  function navigate(screenName, params = {}) {
    // Clean up existing screen
    if (currentScreen) {
      const oldScreen = currentScreen;
      oldScreen.classList.remove('active');
      oldScreen.classList.add('slide-left');
      setTimeout(() => { if (oldScreen?.parentNode) oldScreen.remove(); }, 400);
    }

    // Show / hide bottom nav
    if (TAB_SCREENS.includes(screenName)) {
      bottomNav.classList.remove('hidden');
      appEl.classList.remove('no-nav');
      // Update active tab
      document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.tab === screenName);
      });
    } else {
      bottomNav.classList.add('hidden');
      appEl.classList.add('no-nav');
    }

    // Create screen element
    const el = document.createElement('div');
    appEl.appendChild(el);

    // Mount correct screen
    switch (screenName) {
      case 'splash':       SplashScreen.mount(el); break;
      case 'onboarding':   OnboardingScreen.mount(el); break;
      case 'home':         HomeScreen.mount(el); break;
      case 'schedule':     ScheduleScreen.mount(el); break;
      case 'progress':     ProgressScreen.mount(el); break;
      case 'account':      AccountScreen.mount(el); break;
      case 'pre-brief':    WorkoutFlow.mountPreBrief(el, params); break;
      case 'camera-setup': WorkoutFlow.mountCameraSetup(el, params); break;
      case 'session':      WorkoutFlow.mountSession(el, params); break;
      case 'rest':         WorkoutFlow.mountRest(el, params); break;
      case 'complete':     WorkoutFlow.mountComplete(el, params); break;
      case 'review':       WorkoutFlow.mountReview(el, params); break;
      default: console.warn('[App] Unknown screen:', screenName); return;
    }

    currentScreen = el;
    // Animate in
    requestAnimationFrame(() => {
      el.classList.add('active');
    });
  }

  function startWorkout({ dayPlan }) {
    currentWorkoutData = { dayPlan };
    navigate('pre-brief', { dayPlan });
  }

  function toast(message, type = '') {
    const container = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = message;
    container.appendChild(t);
    setTimeout(() => {
      t.style.animation = 'toast-out 0.3s ease forwards';
      setTimeout(() => t.remove(), 350);
    }, 3500);
  }

  function init() {
    // Wire up bottom nav
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => navigate(NAV_TO_SCREEN[item.dataset.tab]));
    });
    // Add IDs to nav items for tutorial targeting
    document.querySelectorAll('.nav-item').forEach(item => {
      item.id = `nav-${item.dataset.tab}`;
    });

    // Route on init
    if (!Storage.isOnboardingDone()) {
      navigate('splash');
    } else {
      const user = Storage.getUser();
      if (user) navigate('home');
      else navigate('splash');
    }
  }

  // Boot when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { navigate, startWorkout, toast };
})();

window.App = App;
