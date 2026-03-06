export const APP_LOCK_STORAGE_KEY = "diary-app-lock-v1";

type FingerprintPlugin = {
  isAvailable: () => Promise<{ isAvailable?: boolean; errorMessage?: string }>;
  show: (options: {
    title: string;
    description: string;
    disableBackup: boolean;
  }) => Promise<unknown>;
};

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

/** iOS 네이티브 환경 여부 */
const isIosNative = (): boolean => {
  if (typeof window === "undefined") return false;
  const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.()) && cap?.getPlatform?.() === "ios";
};

const getNativeFingerprintPlugin = (): FingerprintPlugin | null => {
  if (typeof window === "undefined") return null;
  const cap = (window as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor;
  const plugin = cap?.Plugins?.FingerprintAIO ?? cap?.Plugins?.FingerprintAuth;
  if (!plugin || typeof plugin !== "object") return null;
  const maybePlugin = plugin as Partial<FingerprintPlugin>;
  if (typeof maybePlugin.isAvailable !== "function" || typeof maybePlugin.show !== "function") {
    return null;
  }
  return maybePlugin as FingerprintPlugin;
};

/**
 * 생체인증 가용 여부.
 * - iOS 네이티브: @capacitor-community/fingerprint-auth (Face ID / Touch ID)
 * - Web: WebAuthn PublicKeyCredential (fingerprint-auth 미설치 환경 fallback)
 */
export const isBiometricAvailable = (): boolean => {
  if (typeof window === "undefined") return false;

  if (isIosNative()) {
    // 네이티브에서는 항상 true로 반환 — 실제 가용 여부는 registerBiometricCredential 시 판별
    return true;
  }

  // Web fallback: WebAuthn
  return Boolean(
    window.isSecureContext &&
      typeof window.PublicKeyCredential !== "undefined" &&
      typeof navigator !== "undefined" &&
      navigator.credentials &&
      typeof navigator.credentials.create === "function" &&
      typeof navigator.credentials.get === "function"
  );
};

/**
 * 생체인증 등록.
 * iOS 네이티브: @capacitor-community/fingerprint-auth로 Face ID / Touch ID 등록.
 * Web: WebAuthn PublicKeyCredential.
 * 성공 시 credential ID 문자열 반환.
 */
export const registerBiometricCredential = async (displayName: string): Promise<string> => {
  if (isIosNative()) {
    const fingerprintPlugin = getNativeFingerprintPlugin();
    if (!fingerprintPlugin) {
      throw new Error("fingerprint-auth plugin is not installed.");
    }

    // 가용성 확인
    const result = await fingerprintPlugin.isAvailable();
    if (!result.isAvailable) {
      throw new Error(result.errorMessage ?? "Biometric is not available on this device.");
    }

    // 등록은 별도 키 없이 시스템 인증으로 처리 — credential ID는 displayName 기반 식별자로 저장
    await fingerprintPlugin.show({
      title: "Enable App Lock",
      description: `Set up biometric unlock for ${displayName}`,
      disableBackup: false,
    });

    // 성공하면 고정 ID "native-biometric" 반환 (네이티브는 단일 기기 인증)
    return "native-biometric";
  }

  // Web: WebAuthn
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

/**
 * 생체인증으로 잠금 해제.
 * iOS 네이티브: Face ID / Touch ID 시스템 프롬프트.
 * Web: WebAuthn assertion.
 */
export const authenticateWithBiometric = async (credentialId: string): Promise<boolean> => {
  if (isIosNative()) {
    try {
      const fingerprintPlugin = getNativeFingerprintPlugin();
      if (!fingerprintPlugin) {
        throw new Error("fingerprint-auth plugin is not installed.");
      }

      await fingerprintPlugin.show({
        title: "Unlock Daily Flow Diary",
        description: "Authenticate to access your diary",
        disableBackup: false,
      });
      return true;
    } catch {
      return false;
    }
  }

  // Web: WebAuthn
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
