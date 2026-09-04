import { Platform } from "react-native";

import {
  formatTemperatureCelsius,
  weatherIconForCode,
  type HomeGlanceWeatherInput,
} from "./home-glance-model";

const PLACEHOLDER: HomeGlanceWeatherInput = {
  weatherIcon: "cloud.sun.fill",
  temperatureLabel: "—",
};

type OpenMeteoCurrentResponse = {
  current?: {
    temperature_2m?: number;
    weather_code?: number;
    is_day?: number;
  };
};

/**
 * Resolve current outdoor temperature for the device location.
 * Uses Open-Meteo (no API key). Returns a placeholder when location
 * is unavailable, the native module is missing, or the request fails.
 */
export async function loadHomeGlanceWeather(): Promise<HomeGlanceWeatherInput> {
  if (Platform.OS !== "ios") return PLACEHOLDER;

  try {
    // Dynamic import so a JS-only reload without a native rebuild does not
    // crash the app at module evaluation time.
    const Location = await import("expo-location");

    const existing = await Location.getForegroundPermissionsAsync();
    let granted = existing.granted;
    if (!granted && existing.canAskAgain) {
      const requested = await Location.requestForegroundPermissionsAsync();
      granted = requested.granted;
    }
    if (!granted) return PLACEHOLDER;

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const { latitude, longitude } = position.coords;

    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${encodeURIComponent(String(latitude))}` +
      `&longitude=${encodeURIComponent(String(longitude))}` +
      `&current=temperature_2m,weather_code,is_day` +
      `&temperature_unit=celsius`;

    const response = await fetch(url);
    if (!response.ok) return PLACEHOLDER;

    const data = (await response.json()) as OpenMeteoCurrentResponse;
    const temperature = data.current?.temperature_2m;
    const weatherCode = data.current?.weather_code;
    if (typeof temperature !== "number" || typeof weatherCode !== "number") {
      return PLACEHOLDER;
    }

    const isDay = data.current?.is_day !== 0;
    return {
      weatherIcon: weatherIconForCode(weatherCode, isDay),
      temperatureLabel: formatTemperatureCelsius(temperature),
    };
  } catch {
    return PLACEHOLDER;
  }
}
