interface CircleNativeBridge {
  getPlatform?: () => string;
  showNotification?: (input: { title: string; body?: string }) => void;
}

interface Window {
  circleNative?: CircleNativeBridge;
}
