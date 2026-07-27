#!/usr/bin/env node
/**
 * When an app enables terminal mouse reporting (TUIs, etc.), forward
 * direct finger taps/drags as mouse events. Upstream expo-libghostty only
 * maps trackpad/mouse (UITouchTypeIndirectPointer) to mouse — so some
 * terminal UIs are not clickable by touch, and some pointer paths feel dead.
 *
 * Idempotent — safe to run from postinstall. Requires an iOS rebuild.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(
  root,
  "node_modules/expo-libghostty/ios/vendor/GhosttyTerminal/Platform/UIKit/UITerminalView+Interaction.swift",
);

const MARKER = "BACKSTEROS_MOUSE_CAPTURE_TOUCH";

if (!fs.existsSync(target)) {
  console.warn(
    "[patch-expo-libghostty-mouse] UITerminalView+Interaction.swift not found — skip",
  );
  process.exit(0);
}

let source = fs.readFileSync(target, "utf8");
if (source.includes(MARKER)) {
  process.exit(0);
}

const beganNeedle = `        override open func touchesBegan(
            _ touches: Set<UITouch>,
            with event: UIEvent?
        ) {
            if handleIndirectPointerTouches(touches, phase: .began, event: event) {
                return
            }
            super.touchesBegan(touches, with: event)`;

const beganReplacement = `        override open func touchesBegan(
            _ touches: Set<UITouch>,
            with event: UIEvent?
        ) {
            if handleIndirectPointerTouches(touches, phase: .began, event: event) {
                return
            }
            // ${MARKER}
            if handleCapturedMouseTouches(touches, phase: .began, event: event) {
                return
            }
            super.touchesBegan(touches, with: event)`;

const movedNeedle = `        override open func touchesMoved(
            _ touches: Set<UITouch>,
            with event: UIEvent?
        ) {
            if handleIndirectPointerTouches(touches, phase: .moved, event: event) {
                return
            }
            super.touchesMoved(touches, with: event)
        }`;

const movedReplacement = `        override open func touchesMoved(
            _ touches: Set<UITouch>,
            with event: UIEvent?
        ) {
            if handleIndirectPointerTouches(touches, phase: .moved, event: event) {
                return
            }
            // ${MARKER}
            if handleCapturedMouseTouches(touches, phase: .moved, event: event) {
                return
            }
            super.touchesMoved(touches, with: event)
        }`;

const endedNeedle = `        override open func touchesEnded(
            _ touches: Set<UITouch>,
            with event: UIEvent?
        ) {
            if handleIndirectPointerTouches(touches, phase: .ended, event: event) {
                return
            }
            #if !targetEnvironment(macCatalyst)
                if pendingKeyboardDismissOnTouchEnd, !touchDidScrollDuringCurrentTouch {
                    resignFirstResponder()
                }
                pendingKeyboardDismissOnTouchEnd = false
                touchDidScrollDuringCurrentTouch = false
            #endif
            super.touchesEnded(touches, with: event)
        }`;

const endedReplacement = `        override open func touchesEnded(
            _ touches: Set<UITouch>,
            with event: UIEvent?
        ) {
            if handleIndirectPointerTouches(touches, phase: .ended, event: event) {
                return
            }
            // ${MARKER}
            if handleCapturedMouseTouches(touches, phase: .ended, event: event) {
                return
            }
            #if !targetEnvironment(macCatalyst)
                if pendingKeyboardDismissOnTouchEnd, !touchDidScrollDuringCurrentTouch {
                    resignFirstResponder()
                }
                pendingKeyboardDismissOnTouchEnd = false
                touchDidScrollDuringCurrentTouch = false
            #endif
            super.touchesEnded(touches, with: event)
        }`;

const cancelledNeedle = `        override open func touchesCancelled(
            _ touches: Set<UITouch>,
            with event: UIEvent?
        ) {
            if handleIndirectPointerTouches(touches, phase: .cancelled, event: event) {
                return
            }
            #if !targetEnvironment(macCatalyst)
                pendingKeyboardDismissOnTouchEnd = false
                touchDidScrollDuringCurrentTouch = false
            #endif
            super.touchesCancelled(touches, with: event)
        }`;

const cancelledReplacement = `        override open func touchesCancelled(
            _ touches: Set<UITouch>,
            with event: UIEvent?
        ) {
            if handleIndirectPointerTouches(touches, phase: .cancelled, event: event) {
                return
            }
            // ${MARKER}
            if handleCapturedMouseTouches(touches, phase: .cancelled, event: event) {
                return
            }
            #if !targetEnvironment(macCatalyst)
                pendingKeyboardDismissOnTouchEnd = false
                touchDidScrollDuringCurrentTouch = false
            #endif
            super.touchesCancelled(touches, with: event)
        }`;

const shouldBeginNeedle = `        override open func gestureRecognizerShouldBegin(
            _ gestureRecognizer: UIGestureRecognizer
        ) -> Bool {
            if gestureRecognizer is UILongPressGestureRecognizer {
                return (delegate as? any TerminalSurfaceTextSelectionRequestDelegate) != nil
            }
            return true
        }`;

const shouldBeginReplacement = `        override open func gestureRecognizerShouldBegin(
            _ gestureRecognizer: UIGestureRecognizer
        ) -> Bool {
            if gestureRecognizer is UILongPressGestureRecognizer {
                return (delegate as? any TerminalSurfaceTextSelectionRequestDelegate) != nil
            }
            // ${MARKER}: while app mouse mode is on, don't steal drags for local scroll.
            if gestureRecognizer is UIPanGestureRecognizer,
               surface?.isMouseCaptured == true,
               gestureRecognizer.allowedTouchTypes.contains(
                   NSNumber(value: UITouch.TouchType.direct.rawValue)
               )
            {
                return false
            }
            return true
        }`;

const helperInsertBefore = `        func handleIndirectPointerTouches(`;

const helperCode = `        // ${MARKER}
        /// Finger → mouse when the hosted app enabled mouse reporting (terminal tabs/panes).
        func handleCapturedMouseTouches(
            _ touches: Set<UITouch>,
            phase: IndirectPointerPhase,
            event: UIEvent?
        ) -> Bool {
            #if targetEnvironment(macCatalyst)
                return false
            #else
                guard surface?.isMouseCaptured == true else { return false }
                guard
                    let touch = touches.first(where: { $0.type == .direct })
                        ?? touches.first
                else { return false }

                core.setFocus(true)
                stopMomentumScrolling()
                becomeFirstResponder()

                let mods = ghostty_input_mods_e(rawValue: 0)
                let location = touch.location(in: self)
                let button = GHOSTTY_MOUSE_LEFT
                surface?.sendMousePos(x: location.x, y: location.y, mods: mods)

                switch phase {
                case .began:
                    activePointerButton = button
                    surface?.sendMouseButton(
                        state: GHOSTTY_MOUSE_PRESS,
                        button: button,
                        mods: mods
                    )
                case .moved:
                    break
                case .ended:
                    let released = activePointerButton ?? button
                    activePointerButton = nil
                    surface?.sendMouseButton(
                        state: GHOSTTY_MOUSE_RELEASE,
                        button: released,
                        mods: mods
                    )
                case .cancelled:
                    let released = activePointerButton ?? button
                    activePointerButton = nil
                    surface?.sendMouseButton(
                        state: GHOSTTY_MOUSE_RELEASE,
                        button: released,
                        mods: mods
                    )
                }
                return true
            #endif
        }

        func handleIndirectPointerTouches(`;

for (const [label, needle] of [
  ["touchesBegan", beganNeedle],
  ["touchesMoved", movedNeedle],
  ["touchesEnded", endedNeedle],
  ["touchesCancelled", cancelledNeedle],
  ["gestureRecognizerShouldBegin", shouldBeginNeedle],
  ["helperInsert", helperInsertBefore],
]) {
  if (!source.includes(needle)) {
    console.warn(
      `[patch-expo-libghostty-mouse] expected ${label} block missing — skip`,
    );
    process.exit(0);
  }
}

source = source
  .replace(beganNeedle, beganReplacement)
  .replace(movedNeedle, movedReplacement)
  .replace(endedNeedle, endedReplacement)
  .replace(cancelledNeedle, cancelledReplacement)
  .replace(shouldBeginNeedle, shouldBeginReplacement)
  .replace(helperInsertBefore, helperCode);

fs.writeFileSync(target, source);
console.log(
  "[patch-expo-libghostty-mouse] forward finger taps as mouse when captured",
);
