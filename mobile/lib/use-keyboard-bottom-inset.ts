import { useEffect, useState } from "react";
import { Keyboard, LayoutAnimation, Platform } from "react-native";

function animateKeyboardLayout(duration: number | undefined) {
  if (Platform.OS !== "ios") return;
  LayoutAnimation.configureNext({
    duration: duration && duration > 0 ? duration : 250,
    update: { type: LayoutAnimation.Types.keyboard },
  });
}

/** Live keyboard height (0 when closed) for lifting bottom sheets above the keyboard. */
export function useKeyboardBottomInset(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, (event) => {
      animateKeyboardLayout(event.duration);
      setHeight(event.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, (event) => {
      animateKeyboardLayout(event.duration);
      setHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return height;
}
