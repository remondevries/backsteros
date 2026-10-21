;; This Source Code Form is subject to the terms of the Mozilla Public
;; License, v. 2.0. If a copy of the MPL was not distributed with this
;; file, You can obtain one at http://mozilla.org/MPL/2.0/.
;;
;; Copyright (c) KALEIDOS INC Sucursal en España SL

(ns app.util.text.ui
  (:require
   [app.main.features :as features]
   [app.main.store :as st]
   [app.util.dom :as dom]))

(defn- get-element
  "Given a DOM node, returns the nearest Element, walking up from text nodes."
  [target]
  (if (and (some? target)
           (not= (.-nodeType target) js/Node.ELEMENT_NODE))
    (.-parentElement target)
    target))

(defn v1-closest-text-editor-content
  [target]
  (when-let [el (get-element target)]
    (.closest ^js el ".public-DraftEditor-content")))

(defn v2-closest-text-editor-content
  [target]
  (when-let [el (get-element target)]
    (.closest ^js el "[data-itype=\"editor\"]")))

(defn wasm-closest-text-editor-content
  "WASM (v3) text editor capture surface — no data-itype=editor root."
  [target]
  (when-let [el (get-element target)]
    (or (.closest ^js el "#text-editor-wasm-input")
        (.closest ^js el "[data-testid=\"text-editor\"]"))))

(defn closest-text-editor-content
  [target]
  (cond
    (features/active-feature? @st/state "text-editor-wasm/v1")
    (wasm-closest-text-editor-content target)

    (features/active-feature? @st/state "text-editor/v2")
    (or (v2-closest-text-editor-content target)
        ;; Fallback: editor root may not be tagged yet on first pointerdown.
        (wasm-closest-text-editor-content target))

    :else
    (v1-closest-text-editor-content target)))

(defn some-text-editor-content?
  [target]
  (some? (closest-text-editor-content target)))

(defn v1-get-text-editor-content
  []
  (dom/get-element-by-class "public-DraftEditor-content"))

(defn v2-get-text-editor-content
  []
  (dom/query "[data-itype=\"editor\"]"))

(defn wasm-get-text-editor-content
  []
  (or (dom/get-element "text-editor-wasm-input")
      (dom/query "[data-testid=\"text-editor\"]")))

(defn get-text-editor-content
  []
  (cond
    (features/active-feature? @st/state "text-editor-wasm/v1")
    (wasm-get-text-editor-content)

    (features/active-feature? @st/state "text-editor/v2")
    (or (v2-get-text-editor-content)
        (wasm-get-text-editor-content))

    :else
    (v1-get-text-editor-content)))
