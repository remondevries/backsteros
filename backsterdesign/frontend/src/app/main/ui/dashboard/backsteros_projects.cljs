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
   [app.main.repo :as rp]
   [app.main.store :as st]
   [app.main.ui.dashboard.deleted :as deleted]
   [app.util.dom :as dom]
   [app.util.i18n :as i18n :refer [tr]]
   [app.util.object :as obj]
   [beicon.v2.core :as rx]
   [cuerdas.core :as str]
   [rumext.v2 :as mf]))

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

(defn- fetch-projects!
  [base-url api-key on-ok on-err]
  (let [url (str (str/rtrim base-url "/") "/api/v1/projects?paginated=true&limit=100")]
    (-> (js/fetch url
                  #js {:method "GET"
                       :headers #js {"Authorization" (str "Bearer " api-key)
                                     "Accept" "application/json"}})
        (.then (fn [res]
                 (if (.-ok res)
                   (.json res)
                   (-> (.text res)
                       (.then (fn [body]
                                (throw (js/Error. (str (.-status res) " " body)))))))))
        (.then (fn [data]
                 (let [items (or (obj/get data "items")
                                 (obj/get data "projects")
                                 #js [])]
                   (on-ok (vec (map (fn [row]
                                      {:id                (obj/get row "id")
                                       :key               (obj/get row "key")
                                       :name              (obj/get row "name")
                                       :status            (normalize-status (obj/get row "status"))
                                       :type              (coerce-type (obj/get row "type"))
                                       :sort-order        (or (obj/get row "sortOrder") 0)
                                       :area              (obj/get row "area")
                                       :priority          (or (obj/get row "priority") 0)
                                       :penpot-project-id (obj/get row "penpotProjectId")})
                                    items))))))
        (.catch (fn [err]
                  (on-err (or (.-message err) (str err))))))))

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

(defn- filter-by-type
  [items type-filter]
  (if (= type-filter "all")
    items
    (filterv #(= (:type %) type-filter) items)))

(defn- sort-projects
  [items]
  (vec (sort-by (juxt :sort-order :name :key) items)))

(defn- group-by-status
  [items]
  (->> status-order
       (map (fn [status]
              {:id status
               :label (get status-labels status status)
               :items (sort-projects (filterv #(= (:status %) status) items))}))
       (filterv #(seq (:items %)))))

(defn- group-by-type*
  [items {:keys [hide-default-header]}]
  (->> type-order
       (map (fn [type]
              {:id type
               :label (get type-labels type type)
               :show-header (if hide-default-header
                              (not= type "general")
                              true)
               :items (sort-projects (filterv #(= (:type %) type) items))}))
       (filterv #(seq (:items %)))))

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

(mf/defc project-row*
  {::mf/private true}
  [{:keys [project busy? on-open]}]
  (let [{:keys [id key name status type penpot-project-id]} project
        linked? (boolean (parse-penpot-id penpot-project-id))]
    [:li {:class (stl/css-case :row true
                               :row-busy busy?
                               :row-linked linked?)
          :data-testid "backsteros-project-row"
          :data-project-id id
          :data-linked (if linked? "true" "false")}
     [:button {:class (stl/css :row-button)
               :type "button"
               :disabled busy?
               :title (if linked?
                        "Open linked Penpot project"
                        "Create Penpot project and open")
               :on-click (fn [event]
                           (dom/prevent-default event)
                           (on-open project))}
      [:div {:class (stl/css :row-main)}
       [:span {:class (stl/css :key)} (or key "—")]
       [:span {:class (stl/css :name) :title name} (or name id)]]
      [:div {:class (stl/css :meta)}
       (when linked?
         [:span {:class (stl/css :badge :linked)} "Linked"])
       [:span {:class (stl/css :badge :status)} (get status-labels status status)]
       (when (and type (not= type "general"))
         [:span {:class (stl/css :badge :muted)} (get type-labels type type)])]
      (when busy?
        [:span {:class (stl/css :row-busy-label)} "Linking…"])]]))

(mf/defc subgroup*
  {::mf/private true}
  [{:keys [label show-header items busy-id on-open]}]
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
                       :on-open on-open}])])

(mf/defc status-group*
  {::mf/private true}
  [{:keys [group collapsed on-toggle busy-id on-open]}]
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
                         :on-open on-open}])])]))

(mf/defc backsteros-projects-section*
  {::mf/wrap [mf/memo]}
  [{:keys [team-id]}]
  (let [cfg     (core-config)
        state*  (mf/use-state {:status :idle :items [] :error nil :busy-id nil :action-error nil})
        ui*     (mf/use-state {:type-filter "all"
                               :collapsed #{}})
        {:keys [status items error busy-id action-error]} @state*
        {:keys [type-filter collapsed]} @ui*

        filtered
        (mf/with-memo [items type-filter]
          (filter-by-type items type-filter))

        groups
        (mf/with-memo [filtered]
          (group-by-status filtered))

        reload!
        (mf/use-fn
         (fn []
           (if-not cfg
             (reset! state* {:status :error :items [] :busy-id nil :action-error nil
                             :error "Set window.backsterosCore in js/config.js (baseUrl + apiKey)."})
             (do
               (swap! state* assoc :status :loading :error nil :action-error nil)
               (fetch-projects!
                (:base-url cfg)
                (:api-key cfg)
                (fn [rows]
                  (swap! state* assoc :status :ok :items rows :error nil :busy-id nil))
                (fn [msg]
                  (swap! state* assoc :status :error :items [] :error msg :busy-id nil)))))))

        set-type-filter!
        (mf/use-fn
         (fn [value]
           (swap! ui* assoc :type-filter value)))

        toggle-group!
        (mf/use-fn
         (fn [id]
           (swap! ui* update :collapsed
                  (fn [set]
                    (if (contains? set id)
                      (disj set id)
                      (conj set id))))))

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
                                                             rows)))))))
                   :on-error (fn [msg]
                               (swap! state* assoc :busy-id nil :action-error msg))})))))]

    (mf/with-effect []
      (reload!)
      js/undefined)

    [:div {:class (stl/css :backsteros-projects)
           :data-testid "backsteros-projects"}
     [:div {:class (stl/css :toolbar)}
      [:nav {:class (stl/css :pills)
             :aria-label "Filter by type"}
       (for [[value label] primary-type-filters]
         (let [count (if (= value "all")
                       (count items)
                       (count (filter #(= (:type %) value) items)))]
           [:button {:key value
                     :type "button"
                     :class (stl/css-case :pill true
                                          :pill-active (= type-filter value))
                     :on-click #(set-type-filter! value)}
            [:span label]
            [:span {:class (stl/css :pill-count)} count]]))
       [:span {:class (stl/css :pill-separator)
               :role "separator"
               :aria-hidden true}]
       (for [[value label] secondary-type-filters]
         (let [count (count (filter #(= (:type %) value) items))]
           [:button {:key value
                     :type "button"
                     :class (stl/css-case :pill true
                                          :pill-active (= type-filter value))
                     :on-click #(set-type-filter! value)}
            [:span label]
            [:span {:class (stl/css :pill-count)} count]]))]

      [:div {:class (stl/css :toolbar-actions)}
       [:button {:class (stl/css :reload)
                 :type "button"
                 :on-click reload!
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
       [:p {:class (stl/css :message)} "No projects match this filter."]

       :else
       [:*
        (when action-error
          [:p {:class (stl/css :message :error)} action-error])
        [:ul {:class (stl/css :overview-list) :role "list"}
         (for [group groups]
           [:> status-group* {:key (:id group)
                              :group group
                              :collapsed (contains? collapsed (:id group))
                              :on-toggle toggle-group!
                              :busy-id busy-id
                              :on-open open-project!}])])])])

(mf/defc header*
  {::mf/private true}
  []
  [:header {:class (stl/css :dashboard-header)
            :data-testid "dashboard-header"}
   [:div#dashboard-backsteros-title {:class (stl/css :dashboard-title)}
    [:h1 (tr "dashboard.projects-title")]]])

(mf/defc backsteros-section*
  "Projects tab page for BacksterOS (same chrome as Recent / Deleted)."
  [{:keys [team show-deleted]}]
  (let [team-id (get team :id)]
    (mf/with-effect []
      (dom/set-html-title (tr "title.dashboard.projects" "BacksterOS")))

    [:*
     [:> header*]
     [:section {:class (stl/css :dashboard-container)
                :data-testid "backsteros-page-section"}
      [:> deleted/menu* {:team-id team-id
                         :section :dashboard-backsteros
                         :show-deleted show-deleted}]
      [:> backsteros-projects-section* {:team-id team-id}]]]))
