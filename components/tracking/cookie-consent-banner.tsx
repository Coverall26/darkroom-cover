"use client";

import { useCallback, useEffect, useState } from "react";

import Cookies from "js-cookie";

import {
  acceptAllConsent,
  CONSENT_COOKIE_MAX_AGE,
  CONSENT_COOKIE_NAME,
  type ConsentPreferences,
  createConsentPreferences,
  hasConsentBeenGiven,
  parseConsentCookie,
  rejectNonEssentialConsent,
  serializeConsentPreferences,
} from "@/lib/tracking/cookie-consent";

import { Button } from "@/components/ui/button";

/**
 * Cookie Consent Banner
 *
 * Displays a consent banner at the bottom of the page when the user
 * has not yet given cookie consent. Provides Accept All, Reject, and
 * Customize options.
 */
export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [analyticsChecked, setAnalyticsChecked] = useState(false);
  const [marketingChecked, setMarketingChecked] = useState(false);
  const [preferencesChecked, setPreferencesChecked] = useState(false);

  useEffect(() => {
    const existing = parseConsentCookie(Cookies.get(CONSENT_COOKIE_NAME));
    if (!hasConsentBeenGiven(existing)) {
      // Small delay to avoid layout shift on initial render
      const timer = setTimeout(() => setVisible(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const savePreferences = useCallback((prefs: ConsentPreferences) => {
    const value = serializeConsentPreferences(prefs);
    Cookies.set(CONSENT_COOKIE_NAME, value, {
      expires: CONSENT_COOKIE_MAX_AGE / (60 * 60 * 24), // js-cookie uses days
      path: "/",
      sameSite: "Lax",
      secure: window.location.protocol === "https:",
    });
    setVisible(false);

    // Dispatch custom event so other components can react to consent changes
    window.dispatchEvent(
      new CustomEvent("fr:consent-updated", { detail: prefs }),
    );
  }, []);

  const handleAcceptAll = useCallback(() => {
    savePreferences(acceptAllConsent());
  }, [savePreferences]);

  const handleReject = useCallback(() => {
    savePreferences(rejectNonEssentialConsent());
  }, [savePreferences]);

  const handleSaveCustom = useCallback(() => {
    savePreferences(
      createConsentPreferences({
        analytics: analyticsChecked,
        marketing: marketingChecked,
        preferences: preferencesChecked,
      }),
    );
  }, [savePreferences, analyticsChecked, marketingChecked, preferencesChecked]);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed bottom-0 left-0 right-0 z-[9999] border-t bg-background p-4 shadow-lg md:bottom-4 md:left-4 md:right-auto md:max-w-md md:rounded-lg md:border"
    >
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Cookie Preferences</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            We use cookies to improve your experience, analyze site traffic, and
            understand where our visitors come from. You can choose which cookies
            to allow.
          </p>
        </div>

        {showCustomize && (
          <div className="space-y-2 border-t pt-2">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked
                disabled
                className="h-3.5 w-3.5 rounded"
              />
              <span className="font-medium">Necessary</span>
              <span className="text-muted-foreground">
                (always active)
              </span>
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={analyticsChecked}
                onChange={(e) => setAnalyticsChecked(e.target.checked)}
                className="h-3.5 w-3.5 rounded"
              />
              <span className="font-medium">Analytics</span>
              <span className="text-muted-foreground">
                — help us understand usage
              </span>
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={marketingChecked}
                onChange={(e) => setMarketingChecked(e.target.checked)}
                className="h-3.5 w-3.5 rounded"
              />
              <span className="font-medium">Marketing</span>
              <span className="text-muted-foreground">
                — attribution and referral tracking
              </span>
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={preferencesChecked}
                onChange={(e) => setPreferencesChecked(e.target.checked)}
                className="h-3.5 w-3.5 rounded"
              />
              <span className="font-medium">Preferences</span>
              <span className="text-muted-foreground">
                — remember your settings
              </span>
            </label>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {showCustomize ? (
            <>
              <Button size="sm" onClick={handleSaveCustom}>
                Save Preferences
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowCustomize(false)}
              >
                Back
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" onClick={handleAcceptAll}>
                Accept All
              </Button>
              <Button size="sm" variant="outline" onClick={handleReject}>
                Reject Non-Essential
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowCustomize(true)}
              >
                Customize
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
