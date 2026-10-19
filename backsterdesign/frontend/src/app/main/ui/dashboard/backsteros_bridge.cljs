;; Shared BacksterOS ↔ Penpot helpers for dashboard chrome (project switcher).
;; Kept separate from backsteros-projects UI to avoid circular requires with
;; page-header.

(ns app.main.ui.dashboard.backsteros-bridge
  (:require
   [app.common.uuid :as uuid]
   [app.main.data.common :as dcm]
   [app.main.data.dashboard :as dd]
   [app.main.repo :as rp]
   [app.main.store :as st]
   [app.main.ui.dashboard.backsteros-cache :as bos.cache]
   [app.util.object :as obj]
   [beicon.v2.core :as rx]
   [cuerdas.core :as str]))

(def cache-key :backsteros-projects)

(defn- core-config
  []
  (let [cfg (obj/get js/window "backsterosCore")]
    (when (some? cfg)
      {:base-url (or (obj/get cfg "baseUrl") "")
       :api-key  (or (obj/get cfg "apiKey") "local")})))

(defn parse-penpot-id
  [value]
  (cond
    (uuid? value) value
    (and (string? value) (not (str/blank? value)))
    (try (uuid/parse value) (catch :default _ nil))
    :else nil))

(defn linked?
  [project]
  (boolean (parse-penpot-id (:penpot-project-id project))))

(defn- normalize-status
  [status]
  (let [known #{"backlog" "active" "on_hold" "completed" "canceled"}]
    (if (contains? known status) status "backlog")))

(defn- coerce-type
  [type]
  (let [known #{"general" "codebase" "it_service" "webhosting" "domeinname" "email"}]
    (if (contains? known type) type "general")))

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

(defn- fetch-projects-p
  [base-url api-key]
  (-> (api-get-json base-url api-key "/api/v1/projects?paginated=true&limit=200")
      (.then (fn [data]
               (let [items (or (obj/get data "items")
                               (obj/get data "projects")
                               #js [])]
                 (vec (map parse-project-row items)))))))

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

(defn ensure-cached-projects!
  "Promise of BacksterOS project rows. Prefers the Projects-tab session cache
   so we do not overwrite an enriched payload with a lean switcher fetch."
  []
  (if-let [cached (bos.cache/cached-data cache-key)]
    (js/Promise.resolve cached)
    (let [cfg (core-config)]
      (if-not cfg
        (js/Promise.resolve [])
        (bos.cache/load!
         cache-key
         {:force? true
          :fetch! (fn []
                    (fetch-projects-p (:base-url cfg) (:api-key cfg)))})))))

(defn open-or-create-project!
  "Open a linked Penpot project, or create+link then open.
   opts: `:on-error` `(fn [msg])`."
  [team-id project {:keys [on-error] :or {on-error identity}}]
  (let [cfg (core-config)]
    (cond
      (nil? cfg)
      (on-error "Configure window.backsterosCore first.")

      (nil? team-id)
      (on-error "No Penpot team selected.")

      :else
      (if-let [existing (parse-penpot-id (:penpot-project-id project))]
        (open-penpot-project! team-id existing)
        (create-and-link-penpot-project!
         {:base-url (:base-url cfg)
          :api-key  (:api-key cfg)
          :team-id  team-id
          :project  project
          :on-linked (fn [penpot-id-str]
                       (bos.cache/update-data!
                        cache-key
                        (fn [rows]
                          (mapv (fn [row]
                                  (if (= (:id row) (:id project))
                                    (assoc row :penpot-project-id penpot-id-str)
                                    row))
                                (or rows []))))
                       (bos.cache/invalidate! :client-accounts))
          :on-error on-error})))))
