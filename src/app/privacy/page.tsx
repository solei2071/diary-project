export const metadata = {
  title: "Privacy Policy — Daily Flow Diary",
  description: "Privacy Policy for Daily Flow Diary app"
};

export default function PrivacyPage() {
  const lastUpdated = "2026-03-06";
  const contactEmail = process.env.NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL?.trim() || "privacy@dailyflowdiary.com";

  return (
    <main className="mx-auto max-w-2xl px-6 py-14 text-sm leading-relaxed text-gray-800 dark:text-gray-200">
      <h1 className="mb-2 text-2xl font-bold">Privacy Policy</h1>
      <p className="mb-8 text-gray-500 dark:text-gray-400">Last updated: {lastUpdated}</p>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">1. Overview</h2>
        <p>
          Daily Flow Diary (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;the app&rdquo;) is a personal diary and
          activity tracking app. We are committed to protecting your privacy. This policy explains what
          data we collect, why we collect it, and how it is used.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">2. Data We Collect</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Account data:</strong> Email address, authentication provider (Google or Apple),
            and a unique user ID — used to link your diary data across devices.
          </li>
          <li>
            <strong>Diary content:</strong> Journal entries, to-do items, and daily activity records you
            create in the app. This data is stored on our servers (Supabase) and synced across your
            devices when you are signed in.
          </li>
          <li>
            <strong>Subscription info:</strong> Your plan status (Free / Pro), purchase date, and
            expiry. We do not store full payment card details — payments are processed by Apple
            (App Store) or our payment provider.
          </li>
          <li>
            <strong>Device preferences:</strong> Theme, language, font style, and notification settings
            are stored locally on your device and are not transmitted to our servers.
          </li>
          <li>
            <strong>Biometric data:</strong> We use your device&apos;s built-in Face ID or Touch ID only
            to unlock the app. Biometric data never leaves your device and is not accessible to us.
          </li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">3. How We Use Your Data</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>To provide and synchronize your diary content across devices.</li>
          <li>To authenticate you securely via magic links or social sign-in.</li>
          <li>To manage your subscription and unlock Pro features.</li>
          <li>To send optional daily reminder notifications (only with your permission).</li>
          <li>We do not sell, rent, or share your personal data with third parties for advertising.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">4. Data Retention</h2>
        <p>
          Your data is retained as long as your account is active. You can delete all cloud data or
          your entire account at any time from <strong>Settings → Account → Delete Account</strong>.
          Upon account deletion, all associated data is permanently removed from our servers within
          30 days.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">5. Third-Party Services</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Supabase</strong> — database and authentication backend.
            See <a href="https://supabase.com/privacy" className="underline" target="_blank" rel="noopener noreferrer">Supabase Privacy Policy</a>.
          </li>
          <li>
            <strong>Apple App Store</strong> — payment processing for Pro subscriptions on iOS.
            See <a href="https://www.apple.com/legal/privacy/" className="underline" target="_blank" rel="noopener noreferrer">Apple Privacy Policy</a>.
          </li>
          <li>
            <strong>RevenueCat</strong> — subscription status and entitlement management for in-app purchases.
            See <a href="https://www.revenuecat.com/privacy" className="underline" target="_blank" rel="noopener noreferrer">RevenueCat Privacy Policy</a>.
          </li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">6. Your Rights</h2>
        <p>
          You have the right to access, correct, export, or delete your personal data at any time.
          Use the in-app options under <strong>Settings → Account</strong> to export or delete your
          data. For additional requests, contact us at the email below.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">7. Children&apos;s Privacy</h2>
        <p>
          Daily Flow Diary is not directed at children under the age of 13. We do not knowingly
          collect personal information from children under 13.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">8. Changes to This Policy</h2>
        <p>
          We may update this policy from time to time. We will notify you of significant changes by
          updating the date at the top of this page. Continued use of the app after changes
          constitutes acceptance of the revised policy.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">9. Contact Us</h2>
        <p>
          If you have questions or requests regarding your privacy, please contact us at:
          <br />
          <a href={`mailto:${contactEmail}`} className="underline">
            {contactEmail}
          </a>
        </p>
      </section>
    </main>
  );
}
