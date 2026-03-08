const ONBOARDING_STORAGE_KEY = "diary-onboarding-done";
const TAB_TOUR_STORAGE_KEY = "diary-tab-tour-done";

export function hasCompletedOnboarding(): boolean {
  try {
    return typeof window !== "undefined" && Boolean(localStorage.getItem(ONBOARDING_STORAGE_KEY));
  } catch {
    return true;
  }
}

export function markOnboardingDone() {
  try {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
  } catch {
    // no-op
  }
}

export function hasCompletedTabTour(): boolean {
  try {
    return typeof window !== "undefined" && Boolean(localStorage.getItem(TAB_TOUR_STORAGE_KEY));
  } catch {
    return true;
  }
}

export function markTabTourDone() {
  try {
    localStorage.setItem(TAB_TOUR_STORAGE_KEY, "1");
  } catch {
    // no-op
  }
}
