;; This Source Code Form is subject to the terms of the Mozilla Public
;; License, v. 2.0. If a copy of the MPL was not distributed with this
;; file, You can obtain one at http://mozilla.org/MPL/2.0/.
;;
;; Copyright (c) KALEIDOS INC Sucursal en España SL

(ns app.main.desktop
  "Bridge between the BacksterDESIGN Tauri shell and the Penpot SPA.

  The shell keeps a single iframe/webview alive and drives file switching
  via postMessage + in-SPA routing (no remount of main.js / WASM)."
  (:require
   [app.common.uuid :as uuid]
   [app.main.data.common :as dcm]
   [app.main.data.modal :as modal]
   [app.main.data.workspace :as dw]
   [app.main.router :as rt]
   [app.main.store :as st]
   [beicon.v2.core :as rx]
   [cuerdas.core :as str]))

(def ^:private channel "backsterdesign-desktop")

(defonce ^:private *enabled (atom false))
(defonce ^:private *last-file-id (atom nil))
(defonce ^:private *last-file-name (atom nil))
(defonce ^:private *last-page-id (atom nil))
(defonce ^:private *last-board-id (atom nil))
(defonce ^:private *last-route (atom nil))
(defonce ^:private *last-authenticated (atom nil))
;; Last dashboard location so chrome "home" / last-tab-close restores
;; project files / libraries / etc. instead of always Recents.
;; Shape: {:name :dashboard-files :params {:team-id … :project-id …}}
(defonce ^:private *last-dashboard (atom nil))
;; Last dashboard snapshot posted to the shell (avoids spam / duplicates).
(defonce ^:private *last-posted-dashboard (atom nil))

(defn- mark-desktop!
  []
  (.setAttribute (.-documentElement js/document) "data-tauri-desktop" "1")
  (reset! *enabled true))

(defn desktop-shell?
  []
  (or @*enabled
      (some? (unchecked-get js/window "__TAURI_INTERNALS__"))
      (= "1" (.getAttribute (.-documentElement js/document) "data-tauri-desktop"))
      (str/includes? (str (.-search js/location)) "tauri-desktop=1")))

(defn- post!
  [payload]
  (when (desktop-shell?)
    (let [msg (clj->js (merge {:channel channel} payload))]
      ;; iframe parent (browser / legacy)
      (when (not= (.-parent js/window) js/window)
        (.postMessage (.-parent js/window) msg "*"))
      ;; Same-window custom event
      (.dispatchEvent js/window
                      (js/CustomEvent. "backsterdesign-desktop"
                                       #js {:detail msg}))
      ;; Tauri child webview (withGlobalTauri + remote capability).
      ;; Emit is async; never leave an unhandled rejection if IPC is mid-fallback.
      (when-let [tauri (unchecked-get js/window "__TAURI__")]
        (when-let [event (unchecked-get tauri "event")]
          (when-let [emit (unchecked-get event "emit")]
            (-> (emit "bd-from-spa" msg)
                (.catch (fn [_] nil)))))))))

(defn- parse-id
  [value]
  (cond
    (uuid? value) value
    (string? value) (uuid/parse* value)
    :else nil))

(defn- dashboard-route?
  [route-name]
  (and (keyword? route-name)
       (str/starts-with? (name route-name) "dashboard")))

(defn- scrub-dashboard-params
  "Drop nil/blank query values so we never remember `team-id=`."
  [params]
  (into {}
        (keep (fn [[k v]]
                (when-not (or (nil? v) (= "" v))
                  [k v])))
        (or params {})))

(defn- js-params->clj
  "Coerce a JS object of dashboard params into a scrubbed CLJ map
   with keyword keys (Penpot route params use kebab keywords)."
  [js-params]
  (scrub-dashboard-params
   (when (object? js-params)
     (into {}
           (keep (fn [k]
                   (let [v (unchecked-get js-params k)]
                     (when (string? v)
                       [(keyword k) v]))))
           (js/Object.keys js-params)))))

(defn- seed-dashboard!
  "Adopt a dashboard location from the shell (cold-start restore)."
  [route-name-str params]
  (let [name   (when (string? route-name-str)
                 (keyword route-name-str))
        params (scrub-dashboard-params params)]
    (when (and (dashboard-route? name) (some? (:team-id params)))
      (reset! *last-dashboard {:name name :params params}))))

(defn- remember-dashboard!
  [state route-name]
  (when (dashboard-route? route-name)
    (let [params (scrub-dashboard-params (rt/get-params state))]
      (when (some? (:team-id params))
        (reset! *last-dashboard {:name route-name
                                 :params params})))))

(defn- go-to-remembered-dashboard!
  "Restore the last dashboard section (project files, libraries, …).
   Falls back to Recents when nothing was remembered yet."
  ([]
   (go-to-remembered-dashboard! nil))
  ([team-id-override]
   (let [{:keys [name params]} @*last-dashboard
         params (scrub-dashboard-params
                 (cond-> (or params {})
                   team-id-override (assoc :team-id team-id-override)))]
     (if (and (dashboard-route? name) (some? (:team-id params)))
       (st/emit! (modal/hide)
                 (rt/nav name params))
       (st/emit! (if team-id-override
                   (dcm/go-to-dashboard-recent :team-id team-id-override)
                   (dcm/go-to-dashboard-recent)))))))

(defn- handle-shell-command!
  [data]
  (when (and (object? data)
             (= channel (unchecked-get data "channel")))
    (let [type (unchecked-get data "type")]
      (case type
        "shell-ready"
        (do
          (mark-desktop!)
          (post! {:type "spa-ready"}))

        "open-file"
        (let [file-id  (parse-id (unchecked-get data "fileId"))
              team-id  (parse-id (unchecked-get data "teamId"))
              page-id  (parse-id (unchecked-get data "pageId"))
              board-id (parse-id (unchecked-get data "boardId"))
              state    @st/state
              current  (:current-file-id state)
              cur-page (:current-page-id state)
              same-file? (and file-id (= file-id current))
              same-page? (or (nil? page-id) (= page-id cur-page))]
          (when file-id
            (cond
              ;; Already on this file+page: route nav is often a no-op, so
              ;; select+zoom immediately (and retry) instead of waiting on nav.
              (and same-file? same-page? board-id)
              (do
                (st/emit! (dw/reveal-workspace-target board-id))
                (js/setTimeout
                 #(st/emit! (dw/reveal-workspace-target board-id))
                 50)
                (js/setTimeout
                 #(st/emit! (dw/schedule-reveal-workspace-target board-id))
                 100))

              :else
              (do
                (st/emit! (dcm/go-to-workspace
                           :file-id file-id
                           :team-id team-id
                           :page-id page-id
                           :board-id board-id))
                (when board-id
                  (st/emit! (dw/schedule-reveal-workspace-target board-id)))))))

        "focus-tab"
        (let [file-id  (parse-id (unchecked-get data "fileId"))
              team-id  (parse-id (unchecked-get data "teamId"))
              page-id  (parse-id (unchecked-get data "pageId"))
              board-id (parse-id (unchecked-get data "boardId"))]
          (when file-id
            (st/emit! (dcm/go-to-workspace
                       :file-id file-id
                       :team-id team-id
                       :page-id page-id
                       :board-id board-id))
            (when board-id
              (st/emit! (dw/schedule-reveal-workspace-target board-id)))))

        "close-tab"
        (let [file-id (parse-id (unchecked-get data "fileId"))
              current (:current-file-id @st/state)]
          (when (and file-id (= file-id current))
            (go-to-remembered-dashboard!)))

        "reveal-board"
        (let [board-id (parse-id (unchecked-get data "boardId"))
              page-id  (parse-id (unchecked-get data "pageId"))
              state    @st/state
              cur-page (:current-page-id state)]
          (when board-id
            (when (and page-id (not= page-id cur-page))
              (st/emit! (dcm/go-to-workspace :page-id page-id :board-id board-id)))
            ;; Immediate + deferred: same-page re-clicks must recenter even when
            ;; the route token is unchanged.
            (st/emit! (dw/reveal-workspace-target board-id))
            (js/setTimeout
             #(st/emit! (dw/reveal-workspace-target board-id))
             50)
            (js/setTimeout
             #(st/emit! (dw/schedule-reveal-workspace-target board-id))
             100)))

        "go-dashboard"
        (let [team-id   (parse-id (unchecked-get data "teamId"))
              route-str (unchecked-get data "routeName")
              params    (js-params->clj (unchecked-get data "params"))]
          (seed-dashboard! route-str params)
          (go-to-remembered-dashboard! team-id))

        nil))))

(defn- on-window-message
  [event]
  (handle-shell-command! (.-data event)))

(defn- editable-shortcut-target?
  [target]
  (when (instance? js/HTMLElement target)
    (or (#{"INPUT" "TEXTAREA" "SELECT"} (.-tagName target))
        (.-isContentEditable target)
        (some? (.closest target "[contenteditable='true']"))
        (some? (.closest target ".cm-editor"))
        (some? (.closest target "[role='textbox']")))))

(defn- parse-digit-tab-index
  "⌘1 → 0 (dashboard), ⌘2 → 1 (first file tab), …"
  [event]
  (let [code (.-code event)
        key  (.-key event)
        digit (or (second (re-matches #"Digit([1-9])" (str code)))
                  (when (re-matches #"[1-9]" (str key)) (str key)))]
    (when digit
      (dec (js/parseInt digit 10)))))

(defn- on-tab-chrome-keydown
  "Forward tab chrome shortcuts to the Tauri shell (webview owns focus).
   ⌘⇧[ / ⌘⇧] cycle · ⌘1–⌘9 jump · ⌘W close active file tab."
  [event]
  (when (and (or (.-metaKey event) (.-ctrlKey event))
             (not (.-altKey event))
             (not (editable-shortcut-target? (.-target event)))
             (not (editable-shortcut-target? (.-activeElement js/document))))
    (cond
      (.-shiftKey event)
      (let [code (.-code event)
            key  (.-key event)
            dir  (cond
                   (or (= code "BracketLeft") (= key "[")) "previous"
                   (or (= code "BracketRight") (= key "]")) "next"
                   :else nil)]
        (when dir
          (.preventDefault event)
          (.stopPropagation event)
          (post! {:type "cycle-tabs" :direction dir})))

      (not (.-shiftKey event))
      (let [code (.-code event)
            key  (.-key event)]
        (cond
          (or (= code "KeyW") (= key "w") (= key "W"))
          (do
            (.preventDefault event)
            (.stopPropagation event)
            (post! {:type "close-active-tab"}))

          :else
          (when-let [index (parse-digit-tab-index event)]
            (.preventDefault event)
            (.stopPropagation event)
            (post! {:type "focus-tab-index" :index index})))))))

(defn- report-route!
  [state]
  (let [route-name (get-in state [:route :data :name])
        file-id    (:current-file-id state)
        team-id    (:current-team-id state)
        page-id    (:current-page-id state)
        board-id   (get (rt/get-params state) :board-id)
        board-id   (cond
                     (vector? board-id) (first board-id)
                     :else board-id)
        file       (get-in state [:files file-id])
        file-name  (or (:name file) "Untitled")
        route-key  (cond
                     (= route-name :workspace) "workspace"
                     (dashboard-route? route-name) "dashboard"
                     (and (keyword? route-name)
                          (str/starts-with? (name route-name) "auth"))
                     "auth"
                     :else "other")
        dash-params (when (= route-key "dashboard")
                      (scrub-dashboard-params (rt/get-params state)))
        ;; Stringify param keys for the shell JSON payload.
        dash-params-js (when dash-params
                         (into {}
                               (map (fn [[k v]] [(name k) (str v)]))
                               dash-params))
        dash-snapshot (when (and (= route-key "dashboard")
                                 (dashboard-route? route-name)
                                 (some? (:team-id dash-params)))
                        {:name route-name
                         :params dash-params})
        authenticated? (some? (:profile state))
        route-changed? (not= route-key @*last-route)
        auth-changed? (not= authenticated? @*last-authenticated)
        dash-changed? (and (some? dash-snapshot)
                           (not= dash-snapshot @*last-posted-dashboard))]

    (remember-dashboard! state route-name)

    (when (or route-changed? auth-changed? dash-changed?)
      (when route-changed?
        (reset! *last-route route-key))
      (when auth-changed?
        (reset! *last-authenticated authenticated?))
      (when dash-changed?
        (reset! *last-posted-dashboard dash-snapshot))
      (post! (cond-> {:type "route-changed"
                      :route route-key
                      :authenticated authenticated?}
               file-id (assoc :fileId (str file-id))
               team-id (assoc :teamId (str team-id))
               page-id (assoc :pageId (str page-id))
               board-id (assoc :boardId (str board-id))
               dash-snapshot
               (assoc :dashboardName (name (:name dash-snapshot))
                      :dashboardParams dash-params-js))))

    (when (and (= route-key "workspace") file-id)
      (when (or (not= file-id @*last-file-id)
                (not= file-name @*last-file-name)
                (not= page-id @*last-page-id)
                (not= board-id @*last-board-id))
        (reset! *last-file-id file-id)
        (reset! *last-file-name file-name)
        (reset! *last-page-id page-id)
        (reset! *last-board-id board-id)
        (post! (cond-> {:type "tab-upsert"
                        :fileId (str file-id)
                        :name file-name}
                 team-id (assoc :teamId (str team-id))
                 page-id (assoc :pageId (str page-id))
                 board-id (assoc :boardId (str board-id))))))))

(defn- watch-state!
  []
  (->> (rx/from-atom st/state {:emit-current-value? true})
       (rx/subs! (fn [state]
                   (when (desktop-shell?)
                     (report-route! state))))))

(defn init!
  "Start the desktop bridge when running under the Tauri shell (or
  `?tauri-desktop=1`). Safe to call multiple times."
  []
  (when (desktop-shell?)
    (mark-desktop!))

  (.addEventListener js/window "message" on-window-message)
  (.addEventListener js/window "keydown" on-tab-chrome-keydown true)

  (watch-state!)

  (when (desktop-shell?)
    (post! {:type "spa-ready"})))
