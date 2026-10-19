;; BacksterOS → BacksterDESIGN bridge (project list + create-or-open link).
;; Copyright (c) BacksterOS — lives beside upstream Penpot dashboard UI.
;;
;; UI mirrors BacksterOS Projects overview: group by status, type subgroups,
;; and type filter pills. Staff click creates/opens the linked Penpot project
;; (see docs/19-penpot-integration.md).

(ns app.main.ui.dashboard.backsteros-projects
  (:require-macros [app.main.style :as stl])
  (:require
   [app.common.uuid :as uuid]
   [app.main.data.common :as dcm]
   [app.main.data.dashboard :as dd]
   [app.main.refs :as refs]
   [app.main.repo :as rp]
   [app.main.store :as st]
   [app.main.ui.dashboard.backsteros-cache :as bos.cache]
   [app.main.ui.dashboard.keyboard-nav :as knav]
   [app.main.ui.dashboard.page-header :refer [page-header*]]
   [app.util.dom :as dom]
   [app.util.i18n :as i18n :refer [tr]]
   [app.util.object :as obj]
   [beicon.v2.core :as rx]
   [cuerdas.core :as str]
   [rumext.v2 :as mf]))

(def ^:private cache-key :backsteros-projects)

(def ^:private status-order
  ["backlog" "active" "on_hold" "completed" "canceled"])

(def ^:private status-labels
  {"backlog" "Backlog"
   "active" "Active"
   "on_hold" "On Hold"
   "completed" "Completed"
   "canceled" "Canceled"})

(def ^:private type-order
  ["general" "codebase" "it_service" "webhosting" "domeinname" "email"])

(def ^:private type-labels
  {"general" "Default"
   "codebase" "Codebase"
   "it_service" "IT Service"
   "webhosting" "Webhosting"
   "domeinname" "Domains"
   "email" "E-mail"})

;; Primary pills (All + Default + Codebase), then a separator, then catalog kinds.
(def ^:private primary-type-filters
  [["all" "All"]
   ["general" "Default"]
   ["codebase" "Codebase"]])

(def ^:private secondary-type-filters
  [["it_service" "IT Service"]
   ["webhosting" "Webhosting"]
   ["domeinname" "Domains"]
   ["email" "E-mail"]])

;; Digit hotkeys 1–N follow pill order (All, Default, Codebase, …).
(def ^:private type-filter-hotkey-values
  (mapv first (concat primary-type-filters secondary-type-filters)))

(defn- editable-shortcut-target?
  [target]
  (when (instance? js/HTMLElement target)
    (or (#{"INPUT" "TEXTAREA" "SELECT"} (.-tagName target))
        (.-isContentEditable target)
        (some? (.closest ^js target "[contenteditable='true']"))
        (some? (.closest ^js target ".cm-editor"))
        (some? (.closest ^js target "[role='textbox']")))))

(defn- normalize-status
  [status]
  (if (contains? status-labels status) status "backlog"))

(defn- coerce-type
  [type]
  (if (contains? type-labels type) type "general"))

(defn- core-config
  "Read window.backsterosCore from gitignored config.js."
  []
  (let [cfg (obj/get js/window "backsterosCore")]
    (when (some? cfg)
      {:base-url (or (obj/get cfg "baseUrl") "")
       :api-key  (or (obj/get cfg "apiKey") "local")})))

(defn- parse-penpot-id
  [value]
  (cond
    (uuid? value) value
    (and (string? value) (not (str/blank? value)))
    (try (uuid/parse value) (catch :default _ nil))
    :else nil))

(defn- api-get-json
  [base-url api-key path]
  (let [url (str (str/rtrim base-url "/") path)]
    (-> (js/fetch url
                  #js {:method "GET"
                       :headers #js {"Authorization" (str "Bearer " api-key)
                                     "Accept" "application/json"}})
        (.then (fn [res]
                 (if (.-ok res)
                   (.json res)
                   (-> (.text res)
                       (.then (fn [body]
                                (throw (js/Error. (str (.-status res) " " body))))))))))))

(defn- parse-project-row
  [row]
  {:id                (obj/get row "id")
   :key               (obj/get row "key")
   :name              (obj/get row "name")
   :status            (normalize-status (obj/get row "status"))
   :type              (coerce-type (obj/get row "type"))
   :icon              (obj/get row "icon")
   :sort-order        (or (obj/get row "sortOrder") 0)
   :area              (obj/get row "area")
   :priority          (or (obj/get row "priority") 0)
   :start-date        (obj/get row "startDate")
   :due-date          (obj/get row "dueDate")
   :penpot-project-id (obj/get row "penpotProjectId")
   :task-progress     {:total 0 :completed 0}})

(defn- fetch-projects-p
  [base-url api-key]
  (-> (api-get-json base-url api-key "/api/v1/projects?paginated=true&limit=200")
      (.then (fn [data]
               (let [items (or (obj/get data "items")
                               (obj/get data "projects")
                               #js [])]
                 (vec (map parse-project-row items)))))))

(defn- aggregate-task-progress
  "Build project-id → {:total :completed} from a tasks list payload."
  [data]
  (let [tasks (or (obj/get data "tasks")
                  (obj/get data "items")
                  #js [])]
    (reduce (fn [acc t]
              (let [pid (obj/get t "projectId")]
                (if (or (nil? pid) (str/blank? (str pid)))
                  acc
                  (let [cur (get acc pid {:total 0 :completed 0})
                        completed? (= (obj/get t "status") "completed")]
                    (assoc acc pid
                           {:total (inc (:total cur))
                            :completed (if completed?
                                         (inc (:completed cur))
                                         (:completed cur))})))))
            {}
            (array-seq tasks))))

(defn- fetch-task-progress-p
  "Optional enrichment — empty map on failure so the list still loads."
  [base-url api-key]
  (-> (api-get-json base-url api-key "/api/v1/tasks?limit=2000")
      (.then aggregate-task-progress)
      (.catch (fn [_] {}))))

(defn- merge-task-progress
  [rows progress-by-id]
  (mapv (fn [row]
          (assoc row :task-progress
                 (get progress-by-id (:id row) {:total 0 :completed 0})))
        rows))

(defn- fetch-projects!
  [base-url api-key on-ok on-err]
  (-> (js/Promise.all
       #js [(fetch-projects-p base-url api-key)
            (fetch-task-progress-p base-url api-key)])
      (.then (fn [results]
               (let [rows (aget results 0)
                     progress (aget results 1)]
                 (on-ok (merge-task-progress rows progress)))))
      (.catch (fn [err]
                (on-err (or (.-message err) (str err)))))))
(defn- patch-penpot-project-id!
  [base-url api-key backsteros-id penpot-id]
  (let [url (str (str/rtrim base-url "/") "/api/v1/projects/" backsteros-id)]
    (-> (js/fetch url
                  #js {:method "PATCH"
                       :headers #js {"Authorization" (str "Bearer " api-key)
                                     "Accept" "application/json"
                                     "Content-Type" "application/json"}
                       :body (.stringify js/JSON #js {:penpotProjectId (str penpot-id)})})
        (.then (fn [res]
                 (if (.-ok res)
                   (.json res)
                   (-> (.text res)
                       (.then (fn [body]
                                (throw (js/Error. (str (.-status res) " " body)))))))))
        (.then (fn [_] (str penpot-id))))))

(defn- open-penpot-project!
  [team-id penpot-project-id]
  (st/emit! (dd/fetch-projects team-id)
            (dcm/go-to-dashboard-files :team-id team-id
                                       :project-id penpot-project-id)))

(defn- create-and-link-penpot-project!
  [{:keys [base-url api-key team-id project on-linked on-error]}]
  (let [name (or (:name project) (:key project) "Untitled")]
    (->> (rp/cmd! :create-project {:name name :team-id team-id})
         (rx/subs!
          (fn [created]
            (let [penpot-id (:id created)]
              (-> (patch-penpot-project-id! base-url api-key (:id project) penpot-id)
                  (.then (fn [_]
                           (on-linked (str penpot-id))
                           (open-penpot-project! team-id penpot-id)))
                  (.catch (fn [err]
                            (on-error (or (.-message err) (str err))))))))
          (fn [err]
            (on-error (or (.-message err) (str err))))))))

(defn- project-linked?
  [project]
  (boolean (parse-penpot-id (:penpot-project-id project))))

(defn- filter-by-type
  "All = linked Penpot projects only. Type pills still include unlinked
  so staff can create/open a Penpot project for that kind."
  [items type-filter]
  (if (= type-filter "all")
    (filterv project-linked? items)
    (filterv #(= (:type %) type-filter) items)))

(defn- match-project-query?
  "Same matching as the breadcrumb project switcher (name + key)."
  [project needle]
  (or (str/blank? needle)
      (str/includes? (str/lower (or (:name project) "")) needle)
      (str/includes? (str/lower (or (:key project) "")) needle)))

(defn- filter-by-query
  [items query]
  (let [needle (str/lower (str/trim (or query "")))]
    (if (str/blank? needle)
      items
      (filterv #(match-project-query? % needle) items))))

(defn- sort-projects
  [items]
  (vec (sort-by (juxt :sort-order :name :key) items)))

(defn- group-by-status
  [items]
  (let [by-status (group-by :status items)]
    (->> status-order
         (keep (fn [status]
                 (when-let [fs (seq (get by-status status))]
                   {:id status
                    :label (get status-labels status status)
                    :items (sort-projects fs)})))
         vec)))

(defn- group-by-type*
  [items {:keys [hide-default-header]}]
  (let [by-type (group-by :type items)]
    (->> type-order
         (keep (fn [type]
                 (when-let [fs (seq (get by-type type))]
                   {:id type
                    :label (get type-labels type type)
                    :show-header (if hide-default-header
                                   (not= type "general")
                                   true)
                    :items (sort-projects fs)})))
         vec)))

(defn- type-subgroups
  "Inside a status group: split by type (Default has no header)."
  [items]
  (group-by-type* items {:hide-default-header true}))

;; BacksterOS project-progress-ring geometry (viewBox 0 0 14 14).
(def ^:private icon-center 7)
(def ^:private hex-radius 6)
(def ^:private hex-stroke 1.5)
(def ^:private hex-pie-radius (- hex-radius (/ hex-stroke 2) 1.75))
(def ^:private backlog-dasharray "3.25 2")

(def ^:private status-icon-meta
  {"backlog"   {:color "#bfc2c7" :kind :backlog}
   "active"    {:color "#e9c141" :kind :ring :fill-ratio 0.48}
   "on_hold"   {:color "#da615d" :kind :ring :fill-ratio 0.34}
   "completed" {:color "#606acc" :kind :completed}
   "canceled"  {:color "#bfc2c7" :kind :ring :fill-ratio 0}})

(defn- polar->xy
  [radius angle-deg]
  (let [radians (* (- angle-deg 90) (/ Math/PI 180))]
    [(+ icon-center (* radius (js/Math.cos radians)))
     (+ icon-center (* radius (js/Math.sin radians)))]))

(def ^:private hex-path
  (let [pts (map (fn [i]
                   (let [[x y] (polar->xy hex-radius (* i 60))]
                     (str x " " y)))
                 (range 6))]
    (str "M " (str/join " L " pts) " Z")))

(defn- pie-wedge-path
  [fill-ratio]
  (cond
    (<= fill-ratio 0) ""
    (>= fill-ratio 1)
    (let [[tx ty] (polar->xy hex-pie-radius 0)]
      (str "M " icon-center " " icon-center
           " L " tx " " ty
           " A " hex-pie-radius " " hex-pie-radius " 0 1 1 " (- tx 0.001) " " ty
           " Z"))
    :else
    (let [sweep (* fill-ratio 360)
          [sx sy] (polar->xy hex-pie-radius 0)
          [ex ey] (polar->xy hex-pie-radius sweep)
          large (if (> sweep 180) 1 0)]
      (str "M " icon-center " " icon-center
           " L " sx " " sy
           " A " hex-pie-radius " " hex-pie-radius " 0 " large " 1 " ex " " ey
           " Z"))))

(def ^:private check-path
  "M11.101 5.101C11.433 4.769 11.433 4.231 11.101 3.899C10.769 3.567 10.231 3.567 9.899 3.899L5.5 8.298L4.101 6.899C3.769 6.567 3.231 6.567 2.899 6.899C2.567 7.231 2.567 7.769 2.899 8.101L4.899 10.101C5.231 10.433 5.769 10.433 6.101 10.101L11.101 5.101Z")

(mf/defc status-icon*
  {::mf/private true}
  [{:keys [status]}]
  (let [{:keys [kind fill-ratio]
         :or {kind :backlog fill-ratio 0}}
        (get status-icon-meta status {:kind :backlog})
        wedge (when (or (= kind :ring) (= kind :completed))
                (pie-wedge-path (if (= kind :completed) 1 (or fill-ratio 0))))]
    [:svg {:class (stl/css :status-icon)
           :width "14"
           :height "14"
           :viewBox "0 0 14 14"
           :aria-hidden "true"}
     [:g {:fill "none"}
      (when-not (str/blank? wedge)
        [:path {:d wedge :fill "currentColor"}])
      (case kind
        :backlog
        [:path {:d hex-path
                :fill "none"
                :stroke "currentColor"
                :stroke-width hex-stroke
                :stroke-linejoin "round"
                :stroke-dasharray backlog-dasharray}]

        :completed
        [:*
         [:path {:d hex-path
                 :fill "none"
                 :stroke "currentColor"
                 :stroke-width hex-stroke
                 :stroke-linejoin "round"}]
         [:path {:d check-path
                 :fill "currentColor"
                 :fill-rule "evenodd"
                 :clip-rule "evenodd"}]]

        ;; :ring (active / on_hold / canceled)
        [:path {:d hex-path
                :fill "none"
                :stroke "currentColor"
                :stroke-width hex-stroke
                :stroke-linejoin "round"}])]]))

;; BacksterOS ProjectProgressRing — completed fill color (dark scheme).
(def ^:private progress-completed-color "#606acc")

(defn- progress-ratio
  [completed total]
  (if (<= total 0)
    0
    (max 0 (min 1 (/ completed total)))))

(defn- format-progress-percent
  [{:keys [total completed]}]
  (if (<= (or total 0) 0)
    "0%"
    (str (js/Math.round (* 100 (progress-ratio completed total))) "%")))

(mf/defc progress-ring*
  "BacksterOS ProjectProgressRing — hex outline + pie fill by task completion."
  {::mf/private true}
  [{:keys [progress]}]
  (let [{:keys [total completed]
         :or {total 0 completed 0}} progress
        has-tasks? (pos? total)
        fill (progress-ratio completed total)
        wedge (when (and has-tasks? (pos? fill))
                (pie-wedge-path fill))
        style (when has-tasks? #js {:color progress-completed-color})]
    [:svg {:class (stl/css-case :progress-ring true
                                :progress-ring-faint (not has-tasks?))
           :style style
           :width "14"
           :height "14"
           :viewBox "0 0 14 14"
           :role "img"
           :aria-label (if has-tasks?
                         (str completed " of " total " completed")
                         "No tasks")}
     [:g {:fill "none"}
      (when-not (str/blank? wedge)
        [:path {:d wedge :fill "currentColor"}])
      [:path {:d hex-path
              :fill "none"
              :stroke "currentColor"
              :stroke-width hex-stroke
              :stroke-linejoin "round"}]]]))

;; BacksterOS TaskPriorityIcon geometry.
(def ^:private priority-bar-heights [5 8 11])

(def ^:private urgent-priority-path
  "M3 1C1.91067 1 1 1.91067 1 3V13C1 14.0893 1.91067 15 3 15H13C14.0893 15 15 14.0893 15 13V3C15 1.91067 14.0893 1 13 1H3ZM7 4H9L8.75391 8.99836H7.25L7 4ZM9 11C9 11.5523 8.55228 12 8 12C7.44772 12 7 11.5523 7 11C7 10.4477 7.44772 10 8 10C8.55228 10 9 10.4477 9 11Z")

(def ^:private no-priority-paths
  ["M4 7.25H2C1.72386 7.25 1.5 7.47386 1.5 7.75V8.25C1.5 8.52614 1.72386 8.75 2 8.75H4C4.27614 8.75 4.5 8.52614 4.5 8.25V7.75C4.5 7.47386 4.27614 7.25 4 7.25Z"
   "M9 7.25H7C6.72386 7.25 6.5 7.47386 6.5 7.75V8.25C6.5 8.52614 6.72386 8.75 7 8.75H9C9.27614 8.75 9.5 8.52614 9.5 8.25V7.75C9.5 7.47386 9.27614 7.25 9 7.25Z"
   "M14 7.25H12C11.7239 7.25 11.5 7.47386 11.5 7.75V8.25C11.5 8.52614 11.7239 8.75 12 8.75H14C14.2761 8.75 14.5 8.52614 14.5 8.25V7.75C14.5 7.47386 14.2761 7.25 14 7.25Z"])

(defn- priority-active-bars
  [priority]
  (cond
    (or (nil? priority) (zero? priority)) 0
    (= priority 4) 1
    (= priority 3) 2
    :else 3))

(mf/defc priority-icon*
  {::mf/private true}
  [{:keys [priority]}]
  (let [p (or priority 0)]
    (cond
      (= p 1)
      [:svg {:class (stl/css :priority-icon :priority-urgent)
             :width "14" :height "14" :viewBox "0 0 16 16"
             :aria-hidden "true"}
       [:path {:d urgent-priority-path :fill "currentColor"}]]

      (zero? p)
      [:svg {:class (stl/css :priority-icon :priority-none)
             :width "14" :height "14" :viewBox "0 0 16 16"
             :aria-hidden "true"}
       (for [d no-priority-paths]
         [:path {:key d :d d :fill "currentColor" :fill-opacity 0.9}])]

      :else
      (let [active (priority-active-bars p)]
        [:svg {:class (stl/css :priority-icon :priority-bars)
               :width "14" :height "14" :viewBox "0 0 14 14"
               :aria-hidden "true"}
         (for [[idx height] (map-indexed vector priority-bar-heights)]
           (let [filled? (< idx active)
                 x (+ 1 (* idx 4))
                 y (- 13 height)]
             [:rect {:key idx
                     :x x :y y
                     :width "2.5" :height height
                     :rx "0.75"
                     :fill "currentColor"
                     :fill-opacity (if filled? 0.65 0.28)}]))]))))

(def ^:private month-names
  ["Jan" "Feb" "Mar" "Apr" "May" "Jun"
   "Jul" "Aug" "Sep" "Oct" "Nov" "Dec"])

(defn- pad2
  [n]
  (.padStart (str n) 2 "0"))

(defn- format-ymd-local
  [date]
  (str (.getFullYear date) "-"
       (pad2 (inc (.getMonth date))) "-"
       (pad2 (.getDate date))))

(defn- parse-date-value
  [value]
  (cond
    (nil? value) nil
    (number? value)
    (let [d (js/Date. value)]
      (when-not (js/isNaN (.getTime d)) d))
    (string? value)
    (let [trimmed (str/trim value)]
      (when-not (str/blank? trimmed)
        (let [d (js/Date. trimmed)]
          (when-not (js/isNaN (.getTime d)) d))))
    :else nil))

(defn- format-due-meta-label
  "Mirrors BacksterOS formatTaskDueMetaLabel (relative / month day)."
  [value]
  (when-let [date (parse-date-value value)]
    (let [now (js/Date.)
          ymd (format-ymd-local date)
          today (format-ymd-local now)
          tomorrow (doto (js/Date. (.getTime now))
                     (.setDate (inc (.getDate now))))
          yesterday (doto (js/Date. (.getTime now))
                      (.setDate (dec (.getDate now))))]
      (cond
        (= ymd today) "Today"
        (= ymd (format-ymd-local tomorrow)) "Tomorrow"
        (= ymd (format-ymd-local yesterday)) "Yesterday"
        :else
        (let [month-day (str (nth month-names (.getMonth date)) " " (.getDate date))]
          (if (not= (.getFullYear date) (.getFullYear now))
            (str month-day ", " (.getFullYear date))
            month-day))))))
;; Primer SyncIcon path (same glyph BacksterOS uses for invoice refresh).
(def ^:private sync-icon-path
  "M8 2.5a5.487 5.487 0 0 0-4.131 1.869l1.204 1.204A.25.25 0 0 1 4.896 6H1.25A.25.25 0 0 1 1 5.75V2.104a.25.25 0 0 1 .427-.177l1.38 1.38A7.001 7.001 0 0 1 14.95 7.05a.75.75 0 0 1-1.49.178A5.501 5.501 0 0 0 8 2.5ZM1.705 8.272a.75.75 0 0 1 .748.726A5.501 5.501 0 0 0 8 13.5a5.487 5.487 0 0 0 4.131-1.869l-1.204-1.204A.25.25 0 0 1 11.104 10h3.646a.25.25 0 0 1 .25.25v3.646a.25.25 0 0 1-.427.177l-1.38-1.38A7.001 7.001 0 0 1 1.05 8.95a.75.75 0 0 1 .655-.678Z")
;; BacksterOS DefaultProjectIcon (cube / project mark).
(def ^:private default-project-icon-path
  "M8.878 0.236192L14.128 3.28119C14.668 3.59519 15 4.17119 15 4.79519V10.8932C15 11.1998 14.9195 11.5011 14.7665 11.7668C14.6134 12.0325 14.3932 12.2533 14.128 12.4072L8.878 15.4522C8.61125 15.6069 8.30836 15.6884 8 15.6884C7.69164 15.6884 7.38875 15.6069 7.122 15.4522L1.872 12.4072C1.60675 12.2533 1.38658 12.0325 1.23354 11.7668C1.0805 11.5011 0.999966 11.1998 1 10.8932V4.79519C1 4.17119 1.332 3.59419 1.872 3.28119L7.122 0.236192C7.38875 0.0814806 7.69164 0 8 0C8.30836 0 8.61125 0.0814806 8.878 0.236192ZM7.875 1.53419L3.245 4.21919L8 6.97719L12.755 4.21919L8.125 1.53419C8.08706 1.51205 8.04393 1.50039 8 1.50039C7.95607 1.50039 7.91294 1.51205 7.875 1.53419ZM2.5 5.52119V10.8932C2.5 10.9832 2.547 11.0642 2.625 11.1092L7.25 13.7922V8.27619L2.5 5.52119ZM8.75 13.7922L13.375 11.1092C13.4129 11.0873 13.4444 11.0558 13.4664 11.0179C13.4883 10.98 13.4999 10.937 13.5 10.8932V5.52119L8.75 8.27619V13.7922Z")

;; Primer MailIcon (16).
(def ^:private mail-icon-path
  "M1.75 2A1.75 1.75 0 0 0 0 3.75v.736a.75.75 0 0 0 .025.14L7.507 9.84a.747.747 0 0 0 .986 0l7.482-5.21a.75.75 0 0 0 .025-.14V3.75A1.75 1.75 0 0 0 14.25 2ZM16 6.697l-6.766 4.71a2.247 2.247 0 0 1-2.468 0L0 6.697v5.553c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0 0 16 12.25Z")

;; TransIP brand mark paths (viewBox 0 0 1024 1024) — same as BacksterOS TransipIcon.
(def ^:private transip-icon-path-a
  "M999 512C999 780.963 780.963 999 512 999C243.037 999 25 780.963 25 512C25 243.037 243.037 25 512 25C780.963 25 999 243.037 999 512ZM239.366 536.797C255.003 536.274 256.078 534.657 256.62 521.169L256.116 521.198V515.805H268.481V523.89C268.481 530.358 267.967 536.816 264.163 541.144C259.854 545.453 252.844 548.154 239.356 548.154H232.888C221.56 548.154 214.017 546.004 209.699 541.686C205.38 537.91 203.763 531.975 203.763 526.581V490.989H188.126V479.66H203.763V463.994H218.326V479.099H266.835V490.427H218.326V522.235C218.326 533.563 222.102 536.255 235.047 536.797H239.366ZM328.88 478.557C340.209 478.557 348.303 480.145 353.154 483.95C358.015 487.726 360.174 494.204 360.726 502.317V511.486H347.238V507.682C346.696 491.502 344.537 490.427 322.964 489.885H315.412C303.009 489.885 297.615 496.353 297.615 504.448V546.518H283.053V479.099H296.541V486.651C301.401 480.174 310.019 478.557 317.571 478.557H328.88ZM402.786 478.547H422.2V478.557C444.857 478.557 461.588 481.258 461.588 501.756V547.079H447.035V542.751C443.801 547.079 437.866 548.145 422.228 548.145H393.104C383.364 548.145 377.438 546.47 373.662 542.704C369.885 538.937 368.811 534.067 368.811 527.599V523.281C368.811 515.186 372.054 510.335 377.98 508.176C383.906 506.017 392 505.475 402.786 505.475H422.2C435.678 505.475 442.688 506.559 447.006 511.41V501.699C447.006 490.951 439.996 489.334 421.116 489.334H403.319C387.682 489.334 386.065 492.035 386.065 496.886V501.204H371.502V496.886C371.502 490.418 373.662 485.567 379.055 482.866C383.906 479.622 392 478.547 402.786 478.547ZM536.54 478.005C547.869 478.005 555.963 480.697 560.814 485.015V485.034C565.665 489.343 567.282 495.278 567.815 501.756V546.49H553.252V503.877C553.252 494.708 551.635 489.857 527.904 489.315H524.67C496.087 489.315 490.694 493.633 490.694 508.195V546.509H476.131V479.089H489.619V487.717C495.012 479.622 504.714 478.005 518.202 478.005H536.54ZM642.244 507.149C651.413 507.149 658.956 507.682 664.901 510.383C670.294 513.075 674.07 518.468 673.538 528.17C673.538 547.593 653.582 548.145 639.019 548.145H616.363C607.735 548.145 598.557 548.145 592.098 545.529C585.088 542.827 580.77 537.434 580.77 527.19V522.339H594.257V526.658C594.79 534.2 598.062 536.902 610.427 536.902H636.851C646.02 536.902 651.955 536.36 655.189 535.294C658.433 533.668 659.508 532.051 659.508 527.2V526.648C658.975 520.722 658.433 518.563 643.87 518.021H606.661C598.024 518.021 592.098 516.937 587.78 513.703C583.462 511.011 581.845 506.15 581.845 499.682V495.878C581.845 490.484 584.004 485.634 589.397 482.932C595.323 480.231 604.492 478.614 619.597 478.614H638.487C651.965 478.614 660.059 480.231 664.91 483.465C669.771 486.119 670.846 490.979 670.846 495.83V500.129H657.358V498.512C657.358 493.661 655.751 492.035 652.507 490.96C649.264 489.885 643.87 489.885 637.403 489.885H616.372C607.745 489.885 602.342 490.418 599.651 491.502C596.959 492.587 596.417 493.633 596.417 497.438V499.597C596.417 504.448 596.959 506.607 609.904 507.149H642.244ZM723.16 454.264H708.588V466.154H723.16V454.264ZM723.16 479.07H708.588V546.49H723.16V479.07ZM800.842 478.519C809.469 478.519 818.106 479.594 824.574 483.912L824.546 483.95C831.023 488.268 835.332 495.278 835.865 507.149V518.477C835.865 529.302 833.173 536.816 827.237 541.667C820.76 546.518 811.553 548.135 799.187 548.135H775.998C765.211 548.135 758.734 545.976 755.5 541.125V569.66H740.947V479.051H754.435V487.146C759.286 481.22 767.913 478.519 777.624 478.519H800.842Z")

(def ^:private transip-icon-path-b
  "M799.197 536.778C813.759 536.778 820.769 534.619 820.769 520.056V507.159C820.769 494.755 816.993 489.904 800.272 489.362H775.998C760.36 489.362 754.967 496.372 754.967 507.159V519.524C755.51 534.619 764.679 536.778 777.624 536.778H799.197ZM447.006 528.17C447.006 531.975 445.389 533.563 440.538 535.18C435.687 536.797 428.173 536.797 417.349 536.797H401.179C384.457 536.255 382.84 534.096 382.84 527.628V525.469C382.84 517.916 386.074 516.841 401.721 516.299H420.602H420.603C429.772 516.299 436.772 516.299 441.1 517.916C445.427 519.533 447.035 521.15 447.035 525.469L447.006 528.17Z")

(defn- parse-project-icon
  "Mirrors BacksterOS ProjectOcticon parse — returns {:glyph :color}."
  [icon type]
  (let [trimmed (when (string? icon) (str/trim icon))
        type-default (case type
                       "codebase" :terminal
                       "email" :mail
                       :default)
        from-payload
        (cond
          (or (nil? trimmed) (str/blank? trimmed) (= trimmed "default"))
          nil

          (str/starts-with? trimmed "{")
          (try
            (let [parsed (js/JSON.parse trimmed)
                  kind   (obj/get parsed "t")
                  key    (obj/get parsed "k")
                  emoji  (obj/get parsed "v")
                  color  (obj/get parsed "c")]
              (cond
                (and (= kind "i") (string? key) (not (str/blank? key)))
                {:glyph (keyword key) :color (when (string? color) color)}

                (and (= kind "e") (string? emoji) (not (str/blank? emoji)))
                {:glyph :emoji :emoji emoji :color nil}

                (= kind "d")
                {:glyph :default :color (when (string? color) color)}

                :else nil))
            (catch :default _ nil))

          ;; Short emoji / plain glyph (non-ASCII ⇒ treat as emoji)
          (or (<= (count trimmed) 2)
              (not (re-matches #"[ -~]+" trimmed)))
          {:glyph :emoji :emoji trimmed :color nil}

          :else
          {:glyph (keyword trimmed) :color nil})]
    (or from-payload {:glyph type-default :color nil})))

(mf/defc link-spinner*
  {::mf/private true}
  []
  [:span {:class (stl/css :link-spinner)
          :aria-hidden "true"}
   [:svg {:class (stl/css :link-spinner-icon)
          :width "14"
          :height "14"
          :viewBox "0 0 16 16"
          :fill "currentColor"
          :aria-hidden "true"}
    [:path {:d sync-icon-path}]]])

(mf/defc project-glyph*
  "BacksterOS list glyph — type/custom icon (terminal, mail, transip, default)."
  {::mf/private true}
  [{:keys [icon type]}]
  (let [mask-id (mf/use-id)
        {:keys [glyph color emoji]} (parse-project-icon icon type)
        style (when color #js {:color color})]
    [:span {:class (stl/css :project-icon)
            :style style
            :aria-hidden "true"
            :title (get type-labels type type)}
     (case glyph
       :emoji
       [:span {:class (stl/css :project-icon-emoji)} emoji]

       :terminal
       [:svg {:width "14" :height "14" :viewBox "0 0 16 16"
              :fill "none" :aria-hidden "true"}
        [:mask {:id mask-id :maskUnits "userSpaceOnUse"}
         [:rect {:width "16" :height "16" :fill "white"}]
         [:path {:d "M4 12L7 9L4 6"
                 :stroke "black"
                 :stroke-width "1.33333"
                 :stroke-linecap "round"
                 :fill "none"}]
         [:path {:d "M9 12.5H12C12.4142 12.5 12.75 12.1642 12.75 11.75C12.75 11.3358 12.4142 11 12 11H9C8.58579 11 8.25 11.3358 8.25 11.75C8.25 12.1642 8.58579 12.5 9 12.5Z"
                 :fill "black"}]]
        [:path {:d "M11 1C13.2091 1 15 2.79086 15 5V11C15 13.2091 13.2091 15 11 15H5C2.79086 15 1 13.2091 1 11V5C1 2.79086 2.79086 1 5 1H11Z"
                :fill "currentColor"
                :mask (str "url(#" mask-id ")")}]]

       :mail
       [:svg {:width "14" :height "14" :viewBox "0 0 16 16"
              :fill "currentColor" :aria-hidden "true"}
        [:path {:d mail-icon-path}]]

       :transip
       [:svg {:width "14" :height "14" :viewBox "0 0 1024 1024"
              :fill "none" :aria-hidden "true"
              ;; Brand blue when no per-project color is set.
              :style (or style #js {:color "#408fce"})}
        [:path {:fill-rule "evenodd" :clip-rule "evenodd"
                :fill "currentColor" :d transip-icon-path-a}]
        [:path {:fill "currentColor" :d transip-icon-path-b}]]

       ;; :default and unknown octicon keys
       [:svg {:width "14" :height "14" :viewBox "0 0 16 16"
              :fill "none" :aria-hidden "true"}
        [:path {:d default-project-icon-path :fill "currentColor"}]])]))

(defn- file-count-for
  "Penpot file count for a linked BacksterOS project; 0 when unlinked/unknown."
  [file-counts penpot-project-id]
  (let [pid (parse-penpot-id penpot-project-id)]
    (if (nil? pid)
      0
      (or (get file-counts pid) 0))))

(mf/defc columns-header*
  {::mf/private true}
  []
  [:div {:class (stl/css :columns-header)
         :role "row"}
   [:span "Name"]
   [:span {:class (stl/css :text-center)} "Health"]
   [:span {:class (stl/css :text-center)} "Priority"]
   [:span "Dates"]
   [:span {:class (stl/css :text-center)} "Files"]
   [:span {:class (stl/css :text-center)} "Issues"]
   [:span {:class (stl/css :text-right)} "Status"]])

(mf/defc project-row*
  {::mf/private true}
  [{:keys [project busy? on-open file-counts highlighted?]}]
  (let [{:keys [id key name type icon penpot-project-id
                priority start-date due-date task-progress]} project
        linked? (boolean (parse-penpot-id penpot-project-id))
        progress (or task-progress {:total 0 :completed 0})
        start-label (format-due-meta-label start-date)
        due-label (format-due-meta-label due-date)
        issues (if (pos? (:total progress)) (:total progress) "—")
        files (file-count-for file-counts penpot-project-id)
        row-ref (mf/use-ref nil)]

    (mf/with-effect [highlighted?]
      (when highlighted?
        (when-let [node (mf/ref-val row-ref)]
          (when (fn? (.-scrollIntoView node))
            (.scrollIntoView node #js {:block "nearest" :inline "nearest"})))))

    [:li {:ref row-ref
          :class (stl/css-case :row true
                               :row-busy busy?
                               :row-linked linked?
                               :row-keyboard-highlight highlighted?)
          :data-testid "backsteros-project-row"
          :data-project-id id
          :data-keyboard-nav-item id
          :data-linked (if linked? "true" "false")}
     [:button {:class (stl/css :row-button)
               :type "button"
               :disabled busy?
               :aria-busy (if busy? "true" "false")
               :title (cond
                        busy? "Creating Penpot project…"
                        linked? "Open linked Penpot project"
                        :else "Create Penpot project and open")
               :on-click (fn [event]
                           (dom/prevent-default event)
                           (on-open project))}
      [:span {:class (stl/css :row-name)}
       (when busy?
         [:> link-spinner*])
       [:> project-glyph* {:icon icon :type type}]
       [:span {:class (stl/css :key)} (or key "—")]
       [:span {:class (stl/css :name) :title name} (or name id)]]
      [:span {:class (stl/css :row-health) :aria-hidden "true"}]
      [:span {:class (stl/css :row-priority)}
       [:> priority-icon* {:priority priority}]]
      [:span {:class (stl/css :row-dates)}
       [:span (or start-label "No start date")]
       [:span {:class (stl/css :dates-sep) :aria-hidden "true"} "›"]
       [:span (or due-label "No due date")]]
      [:span {:class (stl/css :row-files)} files]
      [:span {:class (stl/css :row-issues)} issues]
      [:span {:class (stl/css :row-status)}
       [:span (format-progress-percent progress)]
       [:> progress-ring* {:progress progress}]]]]))
(mf/defc subgroup*
  {::mf/private true}
  [{:keys [label show-header items busy-id on-open file-counts highlighted-id]}]
  [:*
   (when show-header
     [:li {:class (stl/css :subgroup-header)
           :role "presentation"}
      [:span {:class (stl/css :subgroup-label)} label]
      [:span {:class (stl/css :subgroup-rule) :aria-hidden true}]])
   (for [project items]
     [:> project-row* {:key (:id project)
                       :project project
                       :busy? (= busy-id (:id project))
                       :file-counts file-counts
                       :highlighted? (= (str highlighted-id) (str (:id project)))
                       :on-open on-open}])])

(mf/defc status-group*
  {::mf/private true}
  [{:keys [group collapsed on-toggle busy-id on-open file-counts highlighted-id]}]
  (let [{:keys [id label items]} group
        subgroups (type-subgroups items)]
    [:li {:class (stl/css :group)
          :data-testid "backsteros-status-group"
          :data-status id}
     [:div {:class (stl/css-case :group-header-row true
                                 :status-backlog (= id "backlog")
                                 :status-active (= id "active")
                                 :status-on-hold (= id "on_hold")
                                 :status-completed (= id "completed")
                                 :status-canceled (= id "canceled"))}
      [:button {:class (stl/css :group-header)
                :type "button"
                :aria-expanded (not collapsed)
                :on-click (fn []
                            (on-toggle id))}
       [:span {:class (stl/css :toggle-slot) :aria-hidden "true"}
        [:span {:class (stl/css-case :status-icon-wrap true
                                     :hidden-on-hover true)
                :data-status id}
         [:> status-icon* {:status id}]]
        [:span {:class (stl/css-case :chevron true
                                     :collapsed collapsed
                                     :show-on-hover true)}]]
       [:span {:class (stl/css :group-title)} label]
       [:span {:class (stl/css :group-count)} (count items)]]]
     (when-not collapsed
       [:ul {:class (stl/css :group-list) :role "list"}
        (for [{:keys [id label show-header items]} subgroups]
          [:> subgroup* {:key id
                         :label label
                         :show-header show-header
                         :items items
                         :busy-id busy-id
                         :file-counts file-counts
                         :highlighted-id highlighted-id
                         :on-open on-open}])])]))

(mf/defc backsteros-projects-panel*
  {::mf/wrap [mf/memo]}
  [{:keys [team-id query]}]
  (let [cfg     (core-config)
        state*  (mf/use-state {:status :idle :items [] :error nil :busy-id nil :action-error nil})
        ui*     (mf/use-state {:type-filter "all"
                               :collapsed #{}
                               :highlighted-id nil})
        {:keys [status items error busy-id action-error]} @state*
        {:keys [type-filter collapsed highlighted-id]} @ui*
        highlight-ref (mf/use-ref nil)
        query   (or query "")

        penpot-projects (mf/deref refs/projects)
        ;; Inline (no with-memo) — file counts are cheap and stay in sync with refs.
        file-counts
        (into {}
              (keep (fn [[id project]]
                      (when (some? id)
                        [id (or (:count project) 0)]))
                    (or penpot-projects {})))

        filtered
        (mf/with-memo [items type-filter query]
          (-> items
              (filter-by-type type-filter)
              (filter-by-query query)))

        groups
        (mf/with-memo [filtered]
          (group-by-status filtered))

        project-ids
        (mf/with-memo [groups collapsed]
          ;; Skip rows inside collapsed status groups. Stringify so j/k index
          ;; lookup never fails on UUID-vs-string mismatches.
          (into []
                (mapcat (fn [group]
                          (when-not (contains? collapsed (:id group))
                            (mapcat (fn [subgroup]
                                      (map (comp str :id) (:items subgroup)))
                                    (type-subgroups (:items group))))))
                groups))

        project-by-id
        (mf/with-memo [filtered]
          (into {} (map (juxt (comp str :id) identity) filtered)))

        reload!
        (mf/use-fn
         (mf/deps cfg team-id)
         (fn [& args]
           (let [force? (boolean (first args))]
             (when (and force? team-id)
               (st/emit! (dd/fetch-projects team-id)))
             (if-not cfg
               (reset! state* {:status :error :items [] :busy-id nil :action-error nil
                               :error "Set window.backsterosCore in js/config.js (baseUrl + apiKey)."})
               (let [cached (bos.cache/cached-data cache-key)]
                 (when (and (not force?) cached)
                   (swap! state* assoc :status :ok :items cached :error nil :busy-id nil
                          :action-error nil))
                 (when (or force? (nil? cached)
                           (not (bos.cache/fresh? (bos.cache/entry cache-key))))
                   (when (nil? cached)
                     (swap! state* assoc :status :loading :error nil :action-error nil))
                   (-> (bos.cache/load!
                        cache-key
                        {:force? force?
                         :fetch! (fn []
                                   (js/Promise.
                                    (fn [resolve reject]
                                      (fetch-projects!
                                       (:base-url cfg)
                                       (:api-key cfg)
                                       resolve
                                       reject))))})
                       (.then (fn [rows]
                                (swap! state* assoc :status :ok :items rows
                                       :error nil :busy-id nil)))
                       (.catch (fn [msg]
                                 (when (nil? (bos.cache/cached-data cache-key))
                                   (swap! state* assoc :status :error :items []
                                          :error msg :busy-id nil)))))))))))

        set-type-filter!
        (mf/use-fn
         (fn [value]
           (swap! ui* assoc :type-filter value :highlighted-id nil)))

        toggle-group!
        (mf/use-fn
         (fn [id]
           (swap! ui* update :collapsed
                  (fn [set]
                    (if (contains? set id)
                      (disj set id)
                      (conj set id))))))

        move-highlight!
        (mf/use-fn
         (mf/deps project-ids)
         (fn [direction]
           (when-let [next (knav/step-ref! highlight-ref project-ids direction)]
             (swap! ui* assoc :highlighted-id next))))

        open-project!
        (mf/use-fn
         (mf/deps cfg team-id)
         (fn [project]
           (cond
             (nil? cfg)
             (swap! state* assoc :action-error "Configure window.backsterosCore first.")

             (nil? team-id)
             (swap! state* assoc :action-error "No Penpot team selected.")

             :else
             (let [existing (parse-penpot-id (:penpot-project-id project))]
               (swap! state* assoc :busy-id (:id project) :action-error nil)
               (if existing
                 (do
                   (swap! state* assoc :busy-id nil)
                   (open-penpot-project! team-id existing))
                 (create-and-link-penpot-project!
                  {:base-url (:base-url cfg)
                   :api-key (:api-key cfg)
                   :team-id team-id
                   :project project
                   :on-linked (fn [penpot-id-str]
                                (swap! state*
                                       (fn [s]
                                         (-> s
                                             (assoc :busy-id nil)
                                             (update :items
                                                     (fn [rows]
                                                       (mapv (fn [row]
                                                               (if (= (:id row) (:id project))
                                                                 (assoc row :penpot-project-id penpot-id-str)
                                                                 row))
                                                             rows))))))
                                (bos.cache/update-data!
                                 cache-key
                                 (fn [rows]
                                   (mapv (fn [row]
                                           (if (= (:id row) (:id project))
                                             (assoc row :penpot-project-id penpot-id-str)
                                             row))
                                         (or rows []))))
                                (bos.cache/invalidate! :client-accounts))
                   :on-error (fn [msg]
                               (swap! state* assoc :busy-id nil :action-error msg))}))))))]

    (knav/remember! highlight-ref highlighted-id)

    (mf/with-effect [team-id]
      (when team-id
        (st/emit! (dd/fetch-projects team-id)))
      (reload! false)
      js/undefined)

    ;; Drop a stale highlight when the visible list changes.
    (mf/with-effect [project-ids highlighted-id]
      (when (and highlighted-id
                 (nil? (knav/index-of-id project-ids highlighted-id)))
        (swap! ui* assoc :highlighted-id nil)))

    ;; 1–9 type pills · j/k list · Enter open (BacksterOS-style).
    (mf/with-effect [project-ids project-by-id set-type-filter! move-highlight! open-project!]
      (let [on-key
            (fn [event]
              (when (and (not (.-metaKey event))
                         (not (.-ctrlKey event))
                         (not (.-altKey event))
                         (not (editable-shortcut-target? (.-target event)))
                         (not (editable-shortcut-target? (.-activeElement js/document))))
                (let [key  (.-key event)
                      code (.-code event)]
                  (cond
                    (re-matches #"[1-9]" key)
                    (let [idx (dec (js/parseInt key 10))
                          value (get type-filter-hotkey-values idx)]
                      (when value
                        (.preventDefault event)
                        (set-type-filter! value)))

                    (or (= key "j") (= key "J") (= code "KeyJ")
                        (= key "ArrowDown"))
                    (when-not (.-shiftKey event)
                      (.preventDefault event)
                      (move-highlight! :down))

                    (or (= key "k") (= key "K") (= code "KeyK")
                        (= key "ArrowUp"))
                    (when-not (.-shiftKey event)
                      (.preventDefault event)
                      (move-highlight! :up))

                    (or (= key "Enter") (= key " "))
                    (when-let [pid (mf/ref-val highlight-ref)]
                      (when-let [project (get project-by-id pid)]
                        (.preventDefault event)
                        (open-project! project)))))))]
        (.addEventListener js/window "keydown" on-key true)
        (fn []
          (.removeEventListener js/window "keydown" on-key true))))

    [:div {:class (stl/css :backsteros-projects)
           :data-testid "backsteros-projects"}
     [:div {:class (stl/css :toolbar)}
      [:nav {:class (stl/css :pills)
             :aria-label "Filter by type"}
       (for [[idx [value label]] (map-indexed vector primary-type-filters)]
         (let [pill-n (if (= value "all")
                        (count (filter project-linked? items))
                        (count (filter #(= (:type %) value) items)))]
           [:button {:key value
                     :type "button"
                     :class (stl/css-case :pill true
                                          :pill-active (= type-filter value))
                     :title (str label " (" (inc idx) ")")
                     :on-click #(set-type-filter! value)}
            [:span label]
            [:span {:class (stl/css :pill-count)} pill-n]]))
       [:span {:class (stl/css :pill-separator)
               :role "separator"
               :aria-hidden true}]
       (for [[idx [value label]] (map-indexed vector secondary-type-filters)]
         (let [pill-n (count (filter #(= (:type %) value) items))
               hotkey (+ (count primary-type-filters) (inc idx))]
           [:button {:key value
                     :type "button"
                     :class (stl/css-case :pill true
                                          :pill-active (= type-filter value))
                     :title (str label " (" hotkey ")")
                     :on-click #(set-type-filter! value)}
            [:span label]
            [:span {:class (stl/css :pill-count)} pill-n]]))]

      [:div {:class (stl/css :toolbar-actions)}
       [:button {:class (stl/css :reload)
                 :type "button"
                 :on-click #(reload! true)
                 :disabled (= status :loading)}
        (if (= status :loading) "Loading…" "Reload")]]]

     (cond
       (nil? cfg)
       [:p {:class (stl/css :message)}
        "Configure "
        [:code "window.backsterosCore"]
        " in "
        [:code "js/config.js"]
        " (see "
        [:code "config.js.example"]
        ")."]

       (= status :loading)
       [:p {:class (stl/css :message)} "Loading projects…"]

       (= status :error)
       [:p {:class (stl/css :message :error)} (str "Could not load projects: " error)]

       (empty? filtered)
       [:p {:class (stl/css :message)}
        (cond
          (not (str/blank? query))
          "No projects match your search."

          (= type-filter "all")
          "No linked Penpot projects yet. Pick a type to link one."

          :else
          "No projects match this filter.")]

       :else
       [:*
        (when action-error
          [:p {:class (stl/css :message :error)} action-error])
        [:> columns-header*]
        [:ul {:class (stl/css :overview-list) :role "list"}
         (for [group groups]
           [:> status-group* {:key (:id group)
                              :group group
                              :collapsed (contains? collapsed (:id group))
                              :on-toggle toggle-group!
                              :busy-id busy-id
                              :file-counts file-counts
                              :highlighted-id highlighted-id
                              :on-open open-project!}])]])]))
(mf/defc backsteros-section*
  "Projects tab page for BacksterOS (same chrome as Recent / Clients)."
  [{:keys [team]}]
  (let [team-id (get team :id)
        query*  (mf/use-state "")
        query   (deref query*)

        on-search-change
        (mf/use-fn
         (fn [value]
           (reset! query* (or value ""))))]
    (mf/with-effect []
      (dom/set-html-title (tr "title.dashboard.projects" "Projects")))

    [:*
     [:> page-header* {:title (tr "dashboard.projects-title")
                       :title-id "dashboard-backsteros-title"
                       :nav-section :dashboard-backsteros
                       :project-jump true
                       :search-term query
                       :search-placeholder "Search projects…"
                       :on-search-change on-search-change
                       :team-id team-id}]
     [:section {:class (stl/css :dashboard-container)
                :data-testid "backsteros-page-section"}
      [:> backsteros-projects-panel* {:team-id team-id
                                      :query query}]]]))
