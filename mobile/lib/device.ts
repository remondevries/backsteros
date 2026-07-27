import { Platform } from "react-native";

/** True on iPad (including iPad apps on Mac). False on iPhone / Android. */
export function isPadDevice(): boolean {
  return Platform.OS === "ios" && Platform.isPad;
}
