export const metadata = {
  title: "Terms of Use — Daily Flow Diary",
  description: "Terms of Use for Daily Flow Diary app"
};

export default function TermsPage() {
  const lastUpdated = "2026-03-08";
  const contactEmail = process.env.NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL?.trim() || "privacy@dailyflowdiary.com";

  return (
    <main className="mx-auto max-w-2xl px-6 py-14 text-sm leading-relaxed text-gray-800 dark:text-gray-200">
      <h1 className="mb-2 text-2xl font-bold">Terms of Use</h1>
      <p className="mb-8 text-gray-500 dark:text-gray-400">Last updated: {lastUpdated}</p>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">1. Acceptance</h2>
        <p>
          By using Daily Flow Diary, you agree to these Terms of Use. If you do not agree,
          do not use the app.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">2. Service</h2>
        <p>
          Daily Flow Diary provides diary, activity tracking, note taking, and to-do management
          features. We may update, change, or discontinue parts of the service at any time.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">3. Accounts</h2>
        <p>
          You are responsible for maintaining access to your account and for the content you
          create in the app. You must provide accurate information when signing in.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">4. Subscription Terms</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>Pro is offered as an auto-renewing monthly subscription.</li>
          <li>Payment is charged to your Apple ID at confirmation of purchase.</li>
          <li>Your subscription renews automatically unless cancelled at least 24 hours before the end of the current period.</li>
          <li>Your account will be charged for renewal within 24 hours before the end of the current period.</li>
          <li>You can manage or cancel your subscription in your App Store account settings after purchase.</li>
          <li>Any free trial or promotional offer, if provided, is subject to Apple&apos;s billing rules and the price shown in the purchase sheet.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">5. Acceptable Use</h2>
        <p>
          You may not use the app for unlawful, abusive, or harmful activity, or in a way that
          interferes with the service or other users.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">6. Data and Privacy</h2>
        <p>
          Your use of the app is also governed by our Privacy Policy. Please review it at{" "}
          <a href="/privacy" className="underline">
            /privacy
          </a>.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">7. Disclaimer</h2>
        <p>
          The app is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis without warranties of any kind
          to the extent permitted by applicable law.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">8. Limitation of Liability</h2>
        <p>
          To the extent permitted by law, Daily Flow Diary will not be liable for indirect,
          incidental, special, consequential, or punitive damages arising from your use of the app.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">9. Contact</h2>
        <p>
          For questions about these terms, contact:
          <br />
          <a href={`mailto:${contactEmail}`} className="underline">
            {contactEmail}
          </a>
        </p>
      </section>
    </main>
  );
}
