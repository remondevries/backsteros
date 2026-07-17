import { DEFAULT_APP_TIMEZONE } from "@/lib/settings/app-timezone";

let clientAppTimezone = DEFAULT_APP_TIMEZONE;

export function setClientAppTimezone(timezone: string): void {
  clientAppTimezone = timezone;
}

export function getClientAppTimezone(): string {
  return clientAppTimezone;
}
