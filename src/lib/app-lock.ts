export const APP_LOCK_STORAGE_KEY = "diary-app-lock-v1";

export type AppLockConfig = {
  enabled: boolean;
  useBiometric: boolean;
  usePasscode: boolean;
  passcodeSalt: string | null;
  passcodeHash: string | null;
  biometricCredentialId: string | null;
  updatedAt: number;
};

export const DEFAULT_APP_LOCK_CONFIG: AppLockConfig = {
  enabled: false,
  useBiometric: false,
  usePasscode: false,
  passcodeSalt: null,
  passcodeHash: null,
  biometricCredentialId: null,
  updatedAt: 0
};

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const fromBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const randomBytes = (length: number) => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
};

const normalizeConfig = (raw: Partial<AppLockConfig> | null | undefined): AppLockConfig => {
  if (!raw) return DEFAULT_APP_LOCK_CONFIG;
  const usePasscode = Boolean(raw.usePasscode && raw.passcodeSalt && raw.passcodeHash);
  const useBiometric = Boolean(raw.useBiometric && raw.biometricCredentialId);
  const enabled = Boolean(raw.enabled && (usePasscode || useBiometric));

  return {
    enabled,
    useBiometric,
    usePasscode,
    passcodeSalt: usePasscode ? String(raw.passcodeSalt) : null,
    passcodeHash: usePasscode ? String(raw.passcodeHash) : null,
    biometricCredentialId: useBiometric ? String(raw.biometricCredentialId) : null,
    updatedAt: Number(raw.updatedAt ?? Date.now())
  };
};

export const loadAppLockConfig = (): AppLockConfig => {
  if (typeof window === "undefined") return DEFAULT_APP_LOCK_CONFIG;
  try {
    const raw = localStorage.getItem(APP_LOCK_STORAGE_KEY);
    if (!raw) return DEFAULT_APP_LOCK_CONFIG;
    return normalizeConfig(JSON.parse(raw) as Partial<AppLockConfig>);
  } catch {
    return DEFAULT_APP_LOCK_CONFIG;
  }
};

export const saveAppLockConfig = (config: AppLockConfig) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(APP_LOCK_STORAGE_KEY, JSON.stringify(normalizeConfig(config)));
  } catch {
    // no-op
  }
};

export const resetAppLockConfig = () => {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(APP_LOCK_STORAGE_KEY);
  } catch {
    // no-op
  }
};

export const shouldRequireAppUnlock = (config: AppLockConfig) =>
  Boolean(config.enabled && (config.usePasscode || config.useBiometric));

export const isBiometricAvailable = () => {
  if (typeof window === "undefined") return false;
  return Boolean(
    window.isSecureContext &&
      typeof window.PublicKeyCredential !== "undefined" &&
      typeof navigator !== "undefined" &&
      navigator.credentials &&
      typeof navigator.credentials.create === "function" &&
      typeof navigator.credentials.get === "function"
  );
};

export const registerBiometricCredential = async (displayName: string): Promise<string> => {
  if (!isBiometricAvailable()) {
    throw new Error("Biometric auth is not available.");
  }

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32),
      rp: { name: "Daily Flow Diary" },
      user: {
        id: randomBytes(32),
        name: "daily-flow-user",
        displayName
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 }
      ],
      timeout: 60_000,
      attestation: "none",
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "preferred"
      }
    }
  });

  if (!credential || !(credential instanceof PublicKeyCredential)) {
    throw new Error("Biometric setup failed.");
  }
  return toBase64Url(new Uint8Array(credential.rawId));
};

export const authenticateWithBiometric = async (credentialId: string): Promise<boolean> => {
  if (!isBiometricAvailable() || !credentialId) return false;

  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: randomBytes(32),
        timeout: 45_000,
        userVerification: "required",
        allowCredentials: [
          {
            type: "public-key",
            id: fromBase64Url(credentialId),
            transports: ["internal"]
          }
        ]
      }
    });
    return Boolean(assertion && assertion instanceof PublicKeyCredential);
  } catch {
    return false;
  }
};

const hashWithSalt = async (value: string, salt: string) => {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error("Web Crypto API is unavailable.");
  }
  const encoded = new TextEncoder().encode(`${salt}:${value}`);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return toBase64Url(new Uint8Array(digest));
};

export const createPasscodeRecord = async (passcode: string) => {
  const salt = toBase64Url(randomBytes(16));
  const hash = await hashWithSalt(passcode, salt);
  return { salt, hash };
};

export const verifyPasscode = async (passcode: string, salt: string, expectedHash: string) => {
  if (!salt || !expectedHash) return false;
  const actual = await hashWithSalt(passcode, salt);
  return actual === expectedHash;
};
