;; BacksterDESIGN dashboard nav hotkeys (capture-phase).
;; Mousetrap only rebinds when the dashboard remounts after a hot-reload,
;; so chords like g+f / Shift+F can silently no-op. A stable trampoline
;; listener always delegates to the latest handler impl.

(ns app.main.ui.dashboard.nav-hotkeys
  (:require
   [app.main.data.common :as dcm]
   [app.main.router :as rt]
   [app.main.store :as st]
   [app.util.dom :as dom]
   [cuerdas.core :as str]))

(def ^:private go-sequence-ms 1000)

(defonce ^:private *go-leader-at (atom 0))
(defonce ^:private *listening? (atom false))
(defonce ^:private *impl (atom nil))

(defn- dashboard-route?
  [route-name]
  (and (keyword? route-name)
       (str/starts-with? (name route-name) "dashboard")))

(defn- on-dashboard?
  []
  (dashboard-route? (rt/lookup-name @st/state)))

(defn- editable-target?
  [target]
  (when (instance? js/HTMLElement target)
    (or (#{"INPUT" "TEXTAREA" "SELECT"} (.-tagName target))
        (.-isContentEditable target)
        (some? (.closest ^js target "[contenteditable='true']"))
        (some? (.closest ^js target ".cm-editor"))
        (some? (.closest ^js target "[role='textbox']")))))

(defn- go-pending?
  []
  (let [at @*go-leader-at]
    (and (pos? at)
         (< (- (js/Date.now) at) go-sequence-ms))))

(defn- clear-go!
  []
  (reset! *go-leader-at 0))

(defn- focus-header-search!
  []
  (when-let [el (dom/get-element "dashboard-header-search-input")]
    (dom/focus! el)
    (dom/select-text! el)
    true))

(def ^:private open-project-nav-event
  "backster:open-project-nav")

(defn open-project-nav!
  "Ask the mounted project switcher to open and focus its search field.
   Returns true when a page-header listener handled the request."
  []
  (let [ev (js/CustomEvent. open-project-nav-event #js {:cancelable true})]
    (.dispatchEvent js/window ev)
    (boolean (.-defaultPrevented ev))))

(defn- go-to-projects-or-switcher!
  []
  (when-not (open-project-nav!)
    (st/emit! (dcm/go-to-dashboard-backsteros))))

(defn- go-actions
  []
  {"p" go-to-projects-or-switcher!
   "c" #(st/emit! (dcm/go-to-dashboard-client-accounts))
   "f" #(st/emit! (dcm/go-to-dashboard-fonts))
   "r" #(st/emit! (dcm/go-to-dashboard-recent))
   "d" #(st/emit! (dcm/go-to-dashboard-files :project-id :default))
   "l" #(st/emit! (dcm/go-to-dashboard-libraries))})

(defn- on-keydown
  [event]
  (when (and (on-dashboard?)
             (not (.-metaKey event))
             (not (.-ctrlKey event))
             (not (.-altKey event))
             (not (editable-target? (.-target event)))
             (not (editable-target? (.-activeElement js/document))))
    (let [key  (str/lower (str (.-key event)))
          code (.-code event)]
      (cond
        ;; Shift+F → focus header search
        (and (.-shiftKey event)
             (or (= key "f") (= code "KeyF")))
        (when (focus-header-search!)
          (.preventDefault event)
          (.stopPropagation event)
          (.stopImmediatePropagation event))

        (.-shiftKey event)
        nil

        ;; g → start leader sequence
        (or (= key "g") (= code "KeyG"))
        (do
          (.preventDefault event)
          (.stopPropagation event)
          (.stopImmediatePropagation event)
          (reset! *go-leader-at (js/Date.now)))

        ;; g then letter
        (go-pending?)
        (if-let [action (get (go-actions) key)]
          (do
            (.preventDefault event)
            (.stopPropagation event)
            (.stopImmediatePropagation event)
            (clear-go!)
            (action))
          (clear-go!))))))

(defn- dispatch-keydown
  [event]
  (when-let [f @*impl]
    (f event)))

(defn init!
  "Install (or refresh) dashboard nav hotkeys. Safe to call often — the
  window listener is registered once; each call points it at the latest
  handler so shadow hot-reload picks up new chords."
  []
  (reset! *impl on-keydown)
  (when-not @*listening?
    (reset! *listening? true)
    (.addEventListener js/window "keydown" dispatch-keydown true)))
