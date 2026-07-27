"use client";

import { createContext, useContext, type ReactNode } from "react";

import { DEFAULT_APP_TIMEZONE } from "@/lib/settings/app-timezone";

const AppTimezoneContext = createContext(DEFAULT_APP_TIMEZONE);

export function AppTimezoneProvider({
  children,
  timeZone = DEFAULT_APP_TIMEZONE,
}: {
  children: ReactNode;
  timeZone?: string;
}) {
  return (
    <AppTimezoneContext.Provider value={timeZone}>
      {children}
    </AppTimezoneContext.Provider>
  );
}

export function useAppTimezone() {
  return useContext(AppTimezoneContext);
}
