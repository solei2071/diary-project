const ONBOARDING_STORAGE_KEY = "diary-onboarding-done";

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
