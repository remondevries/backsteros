;; This Source Code Form is subject to the terms of the Mozilla Public
;; License, v. 2.0. If a copy of the MPL was not distributed with this
;; file, You can obtain one at http://mozilla.org/MPL/2.0/.
;;
;; Copyright (c) KALEIDOS INC Sucursal en España SL

(ns app.main.ui.dashboard.project-menu
  (:require
   [app.main.data.common :as dcm]
   [app.main.data.dashboard :as dd]
   [app.main.data.modal :as modal]
   [app.main.data.notifications :as ntf]
   [app.main.refs :as refs]
   [app.main.store :as st]
   [app.main.ui.components.context-menu-a11y :refer [context-menu*]]
   [app.main.ui.context :as ctx]
   [app.main.ui.dashboard.import :as udi]
   [app.util.dom :as dom]
   [app.util.i18n :as i18n :refer [tr]]
   [app.util.object :as obj]
   [beicon.v2.core :as rx]
   [cuerdas.core :as str]
   [potok.v2.core :as ptk]
   [rumext.v2 :as mf]))

(defn- core-config
  []
  (let [cfg (obj/get js/window "backsterosCore")]
    (when (some? cfg)
      {:base-url (or (obj/get cfg "baseUrl") "")
       :api-key  (or (obj/get cfg "apiKey") "local")})))

(defn- api-fetch
  [base-url api-key method path body]
  (let [url (str (str/rtrim base-url "/") path)
        headers (if (some? body)
                  #js {"Authorization" (str "Bearer " api-key)
                       "Accept" "application/json"
                       "Content-Type" "application/json"}
                  #js {"Authorization" (str "Bearer " api-key)
                       "Accept" "application/json"})
        opts (cond-> #js {:method method :headers headers}
               (some? body)
               (doto (obj/set! "body" (.stringify js/JSON body))))]
    (-> (js/fetch url opts)
        (.then (fn [res]
                 (if (.-ok res)
                   (.json res)
                   (-> (.text res)
                       (.then (fn [t]
                                (throw (js/Error. (str (.-status res) " " t))))))))))))

(defn- find-core-project-id-by-penpot-id!
  "Return BacksterOS project id linked to this Penpot project, or nil."
  [base-url api-key penpot-project-id]
  (let [needle (str penpot-project-id)]
    (-> (api-fetch base-url api-key "GET"
                   "/api/v1/projects?paginated=true&limit=200" nil)
        (.then (fn [data]
                 (->> (or (obj/get data "items")
                          (obj/get data "projects")
                          #js [])
                      (array-seq)
                      (some (fn [row]
                              (when (= (str (obj/get row "penpotProjectId")) needle)
                                (obj/get row "id"))))))))))

(defn- clear-core-penpot-project-id!
  "Clear projects.penpot_project_id so the BacksterOS row is unlinked."
  [base-url api-key backsteros-project-id]
  (api-fetch base-url api-key "PATCH"
             (str "/api/v1/projects/" backsteros-project-id)
             #js {:penpotProjectId nil}))

(defn- unlink-penpot-project-from-core!
  "Best-effort: find the core project for this Penpot id and null the link."
  [penpot-project-id]
  (let [cfg (core-config)]
    (if (or (nil? cfg) (nil? penpot-project-id))
      (js/Promise.resolve nil)
      (-> (find-core-project-id-by-penpot-id!
           (:base-url cfg) (:api-key cfg) penpot-project-id)
          (.then (fn [core-id]
                   (if (nil? core-id)
                     nil
                     (clear-core-penpot-project-id!
                      (:base-url cfg) (:api-key cfg) core-id))))
          (.catch (fn [err]
                    (js/console.warn
                     "[backsteros] failed to clear penpotProjectId on delete"
                     err)
                    nil))))))

(mf/defc project-menu*
  [{:keys [project show on-close top left on-import]}]
  (let [top  (or top 0)
        left (or left 0)

        current-team-id (mf/use-ctx ctx/current-team-id)
        teams           (mf/deref refs/teams)
        teams           (-> teams (dissoc current-team-id) vals vec)

        on-move-success
        (fn [team-id]
          (st/emit! (dcm/go-to-dashboard-recent :team-id team-id)))

        on-move
        (fn [team-id]
          (let [data  {:id (:id project) :team-id team-id}
                mdata {:on-success #(on-move-success team-id)}]
            #(st/emit! (ntf/success (tr "dashboard.success-move-project"))
                       (dd/move-project (with-meta data mdata)))))

        finish-delete!
        (fn []
          (let [team-id (:team-id project)]
            (st/emit! (ntf/success (tr "dashboard.success-delete-project"))
                      (dd/delete-project project)
                      (dcm/go-to-dashboard-recent :team-id team-id))))

        delete-fn
        (fn [_]
          ;; Unlink in core first so BacksterOS no longer points at this
          ;; Penpot project; then soft-delete in Penpot.
          (-> (unlink-penpot-project-from-core! (:id project))
              (.then (fn [_] (finish-delete!)))
              (.catch (fn [_] (finish-delete!)))))

        on-delete
        (fn []
          (st/emit!
           (modal/show {:type :confirm
                        :title (tr "modals.delete-project-confirm.title")
                        :message (tr "modals.delete-project-confirm.message")
                        :accept-label (tr "modals.delete-project-confirm.accept")
                        :on-accept delete-fn})))

        file-input
        (mf/use-ref nil)

        on-import-files
        (fn [] (dom/click (mf/ref-val file-input)))

        on-finish-import
        (mf/use-fn
         (fn [] (when (fn? on-import) (on-import))))

        ;; BacksterDESIGN: no Rename / Duplicate / Pin — projects are owned
        ;; by BacksterOS; keep import + delete (+ move when other teams exist).
        options
        [(when (and (seq teams) (not (:is-default project)))
           {:name    (tr "dashboard.move-to")
            :id      "project-move-to"
            :options (for [team teams]
                       {:name    (:name team)
                        :id      (str "move-to-" (:id team))
                        :handler (on-move (:id team))})})

         (when (some? on-import)
           {:name    (tr "dashboard.import")
            :id      "file-import"
            :handler on-import-files})
         (when-not (:is-default project)
           {:name :separator})
         (when-not (:is-default project)
           {:name    (tr "labels.delete")
            :id      "project-delete"
            :handler on-delete})]]

    (mf/with-effect [show on-close]
      (when ^boolean show
        (st/emit! (ptk/data-event :dropdown/open {:id "project-menu"}))
        (let [stream (->> st/stream
                          (rx/filter (ptk/type? :dropdown/open))
                          (rx/map deref)
                          (rx/filter #(not= "project-menu" (:id %)))
                          (rx/take 1))
              subs   (rx/subs! nil nil on-close stream)]
          (fn []
            (rx/dispose! subs)))))

    [:*
     [:> context-menu*
      {:on-close on-close
       :show show
       :fixed (or (not= top 0) (not= left 0))
       :min-width true
       :top top
       :left left
       :options options}]
     [:> udi/import-form* {:ref file-input
                           :project-id (:id project)
                           :on-finish-import on-finish-import}]]))
