"use client";

import { useEffect, useRef } from "react";

import { initFailureTracking } from "@/lib/tracking/failure-tracker";

export function TrackingInitializer() {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    initFailureTracking();
  }, []);

  return null;
}
