// ============================================
// GYMA — WORKOUT LOGIC (JSON Engine)
// ============================================

const EXERCISES = {
  squat: {
    id: 2, name: 'Air squats', emoji: '🦵', camera_view: 'side_profile', sets: 3, reps: 10, restSec: 60, muscles: 'Quads · Glutes',
    range_knee: { start: 170, peak: 90, unit: 'deg' },
    range_hip_depth: { start: 170, peak: 90, unit: 'deg' },
    rep_trigger: { phase: 'upward', joint: 'leftKnee', threshold: 150, peak_req: 105 },
  },
  dips: {
    id: 3, name: 'Tricep dips (bench)', emoji: '🪑', camera_view: 'side_profile', sets: 3, reps: 10, restSec: 60, muscles: 'Triceps',
    range_elbow: { start: 160, peak: 90, unit: 'deg' },
    rep_trigger: { phase: 'upward', joint: 'leftElbow', threshold: 140, peak_req: 100 },
  },
  lunge: {
    id: 4, name: 'Forward lunges', emoji: '🦶', camera_view: 'side_profile', sets: 3, reps: 10, restSec: 60, muscles: 'Quads · Glutes',
    range_front_knee: { start: 170, peak: 90, unit: 'deg' },
    range_back_knee: { start: 170, peak: 85, unit: 'deg' },
    rep_trigger: { phase: 'upward', joint: 'leftKnee', threshold: 150, peak_req: 105 },
  },
  plank: {
    id: 5, name: 'Standard plank', emoji: '🧘', camera_view: 'side_profile', sets: 3, reps: null, durationSec: 30, restSec: 60, muscles: 'Core',
    range_hip_line: { start: 180, peak: 180, unit: 'deg', warn_min: 165, warn_max: 195 },
    rep_trigger: null,
  },
  jumping_jack: {
    id: 6, name: 'Jumping jacks', emoji: '⚡', camera_view: 'front', sets: 3, reps: 20, restSec: 60, muscles: 'Cardio',
    range_shoulder: { start: 30, peak: 150, unit: 'deg' },
    rep_trigger: { phase: 'downward', joint: 'leftShoulder', threshold: 50, peak_req: 140 },
  },
  high_knees: {
    id: 7, name: 'High knees', emoji: '🏃', camera_view: 'side_profile', sets: 3, reps: 20, restSec: 60, muscles: 'Cardio',
    range_hip_flexion: { start: 170, peak: 90, unit: 'deg' },
    rep_trigger: { phase: 'downward', joint: 'leftHip', threshold: 140, peak_req: 100 },
  },
  shadow_boxing: {
    id: 8, name: 'Shadow boxing', emoji: '🥊', camera_view: 'front', sets: 3, reps: 16, restSec: 60, muscles: 'Shoulders',
    range_elbow_extension: { start: 60, peak: 160, unit: 'deg' },
    rep_trigger: { phase: 'inward', joint: 'leftElbow', threshold: 100, peak_req: 150 },
  },
  bird_dog: {
    id: 9, name: 'Bird-dog', emoji: '🐕', camera_view: 'side_profile', sets: 3, reps: 10, restSec: 60, muscles: 'Core',
    range_hip_extension: { start: 90, peak: 170, unit: 'deg' },
    rep_trigger: { phase: 'downward', joint: 'leftHip', threshold: 120, peak_req: 160 },
  },
};

const WORKOUT_TYPES = {
  upper_body: { name: 'Upper Body Power', exercises: ['dips', 'shadow_boxing', 'plank'], difficulty: 'Moderate', emoji: '💪' },
  lower_body: { name: 'Leg Day', exercises: ['squat', 'lunge', 'bird_dog'], difficulty: 'Moderate', emoji: '🦵' },
  core: { name: 'Core Session', exercises: ['plank', 'bird_dog', 'high_knees'], difficulty: 'Moderate', emoji: '🧘' },
  full_body: { name: 'Full Body Circuit', exercises: ['squat', 'dips', 'lunge', 'jumping_jack'], difficulty: 'High', emoji: '🔥' },
  cardio: { name: 'Cardio Blast', exercises: ['jumping_jack', 'high_knees', 'shadow_boxing'], difficulty: 'High', emoji: '⚡' },
};

// Smooths noisy camera angles (Exponential Moving Average)
class AngleSmoother {
  constructor(alpha = 0.3) { this.alpha = alpha; this.val = null; }
  update(newVal) {
    if (this.val === null) { this.val = newVal; return newVal; }
    this.val = this.alpha * newVal + (1 - this.alpha) * this.val;
    return this.val;
  }
}

// ============================================
// REP COUNTER (JSON Engine)
// ============================================
class RepCounter {
  constructor(exerciseKey) {
    this.ex = EXERCISES[exerciseKey];
    this.count = 0;
    this.phase = 'start'; // start, peak, returning
    this.smoother = new AngleSmoother(0.3);
  }

  update(angles) {
    if (!this.ex || !this.ex.rep_trigger) return this.count;
    const t = this.ex.rep_trigger;
    const a = angles[t.joint];
    if (a === undefined) return this.count;
    
    // The "logic" engine processes the smoothed angle against JSON phases
    const smoothed = this.smoother.update(a);

    if (t.phase === 'upward' || t.phase === 'downward') {
      // For Squat/Dips/Lunge: peak_req is heavily bent (e.g. 105), threshold is straight (e.g. 150)
      if (this.phase === 'start') {
         if (t.peak_req < t.threshold ? smoothed < t.peak_req : smoothed > t.peak_req) {
            this.phase = 'peak';
         }
      } else if (this.phase === 'peak') {
         if (t.peak_req < t.threshold ? smoothed > t.threshold : smoothed < t.threshold) {
            this.phase = 'start';
            this.count++;
         }
      }
    } else if (t.phase === 'inward') {
       if (this.phase === 'start' && smoothed > t.peak_req) this.phase = 'peak';
       else if (this.phase === 'peak' && smoothed < t.threshold) { this.phase = 'start'; this.count++; }
    }
    return this.count;
  }
  reset() { this.count = 0; this.phase = 'start'; }
}

// ============================================
// FORM ANALYZER (JSON Range Checker)
// ============================================
class FormAnalyzer {
  constructor(exerciseKey) {
    this.ex = EXERCISES[exerciseKey];
    this.lastIssues = [];
    this.lastWarnTime = 0;
  }

  analyze(angles) {
    if (!this.ex || !angles) return { status: 'good', issues: [] };
    const issues = [];
    
    // Check custom JSON ranges if they exist during movement
    if (this.ex.range_knee && angles.leftKnee !== undefined) {
       const k = angles.leftKnee;
       // JSON Squat range: start 170, peak 90. If user collapses knee < 60
       if (k < 60) issues.push({ joint: 'leftKnee', status: 'error', message: 'Knee dropping too deep/unsafe angle', angle: k });
    }
    if (this.ex.range_hip_line && angles.leftHip !== undefined) { // for Plank
       const h = angles.leftHip;
       if (h < this.ex.range_hip_line.warn_min) issues.push({ joint: 'leftHip', status: 'error', message: 'Hips sagging! Raise core.', angle: h, ideal: [165,195] });
       if (h > this.ex.range_hip_line.warn_max) issues.push({ joint: 'leftHip', status: 'warning', message: 'Hips too high, align spine.', angle: h, ideal: [165,195] });
    }
    if (this.ex.range_elbow && angles.leftElbow !== undefined) {
       const e = angles.leftElbow;
       if (e < 60) issues.push({ joint: 'leftElbow', status: 'warning', message: 'Elbow angle excessive strain', angle: e });
    }
    
    // Rate limit warnings
    const now = Date.now();
    if (issues.length > 0 && now - this.lastWarnTime < 1500) {
      return { status: this.lastIssues.length ? this.lastIssues[0].status : 'good', issues: this.lastIssues, message: this.lastIssues[0]?.message };
    }
    
    if (issues.length > 0) {
      this.lastWarnTime = now;
      this.lastIssues = issues;
      const isErr = issues.some(i => i.status === 'error');
      return { status: isErr ? 'error' : 'warning', issues, message: issues[0].message };
    }
    
    return { status: 'good', issues: [] };
  }
}

// Plan Generator Engine
function generatePlan(userData) {
  const plan = [];
  const seq = ['full_body', 'core', 'lower_body', 'upper_body', 'cardio'];
  const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']; // fallback for 0 or 7 indexing
  const days = userData.freeDays || [];
  let wIdx = 0;
  
  for (let i = 0; i < 7; i++) {
    // If days handles 0-6 (Sun-Sat) or 1-7
    if (days.includes(i) || days.includes(i.toString())) {
      const g = seq[wIdx % seq.length];
      wIdx++;
      plan.push({ day: i, name: dayNames[i] || 'DAY', isRest: false, workoutType: g, workoutName: WORKOUT_TYPES[g].name, emoji: WORKOUT_TYPES[g].emoji, difficulty: WORKOUT_TYPES[g].difficulty, exercises: WORKOUT_TYPES[g].exercises, estimatedMin: 30 });
    } else {
      plan.push({ day: i, name: dayNames[i] || 'DAY', isRest: true, workoutName: 'Rest', emoji: '💤' });
    }
  }
  return plan;
}

function calcStreak(history) {
  if (!history || !history.length) return 0;
  const dates = history.map(h => new Date(h.date).setHours(0,0,0,0)).sort((a,b) => b - a);
  const unique = [...new Set(dates)];
  let streak = 0;
  let current = new Date().setHours(0,0,0,0);
  if (unique[0] !== current && unique[0] !== current - 86400000) return 0;
  for (let i=0; i<unique.length; i++) {
    if (unique[i] === current || unique[i] === current - 86400000) {
      streak++; current = unique[i];
    } else break;
  }
  return streak;
}

function calcFormScore(results) {
  if (!results.length) return 100;
  const errs = results.filter(r => r.status === 'error').length;
  return Math.max(0, Math.round((1 - errs / results.length) * 100));
}

function getFormGrade(score) {
  if (score >= 95) return 'S'; if (score >= 80) return 'A'; if (score >= 65) return 'B'; return 'C';
}

window.WorkoutLib = { EXERCISES, WORKOUT_TYPES, generatePlan, calcStreak, calcFormScore, getFormGrade };
window.RepCounter = RepCounter;
window.FormAnalyzer = FormAnalyzer;
window.AngleSmoother = AngleSmoother;
