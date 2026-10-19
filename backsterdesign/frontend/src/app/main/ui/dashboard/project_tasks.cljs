;; This Source Code Form is subject to the terms of the Mozilla Public
;; License, v. 2.0. If a copy of the MPL was not distributed with this
;; file, You can obtain one at http://mozilla.org/MPL/2.0/.
;;
;; Copyright (c) KALEIDOS INC Sucursal en España SL
;;
;; BacksterDESIGN: mount shared @backsteros/ui ProjectTasksView (rail or stack).

(ns app.main.ui.dashboard.project-tasks
  (:require
   [app.common.uuid :as uuid]
   [app.main.data.common :as dcm]
   [app.main.router :as rt]
   [app.main.store :as st]
   [cuerdas.core :as str]
   [goog.object :as obj]
   [rumext.v2 :as mf]))

(defn- bridge-api
  []
  (obj/get js/window "BacksterDesignProjectTasks"))

(defn- files->js
  [files]
  (to-array
   (map (fn [file]
          #js {:id (str (:id file))
               :name (or (:name file) "Untitled")})
        (or files []))))

(defn- mount-opts
  [project-id layout task-id on-task-id-change files on-open-file]
  (let [opts #js {:penpotProjectId project-id
                  :layout layout
                  :onTaskIdChange on-task-id-change
                  :files (files->js files)}]
    (when task-id
      (obj/set opts "taskId" task-id))
    (when on-open-file
      (obj/set opts "onOpenFile" on-open-file))
    opts))

(defn- mount-when-ready!
  "Retry until the island script exposes window.BacksterDesignProjectTasks."
  [el opts cancelled*]
  (let [api (bridge-api)
        project-id (obj/get opts "penpotProjectId")]
    (cond
      @cancelled*
      nil

      (and api el project-id (not= project-id ""))
      (.mount api el opts)

      :else
      (js/setTimeout
       (fn []
         (when-not @cancelled*
           (mount-when-ready! el opts cancelled*)))
       50))))

(mf/defc project-tasks-section*
  "React island host for BacksterOS project tasks.

  Mounts into a sibling DOM node (not a Rumext/React child). Mounting into the
  ref node itself is wiped whenever the files page re-renders.

  Optional `host-class` overrides the host element class.
  Optional `layout` is `\"rail\"` (list + adjacent detail) or `\"stack\"`.
  Optional `task-id` / `team-id` keep the open task in the dashboard URL.
  Optional `files` enables Tab / j/k into the Penpot files grid."
  [{:keys [penpot-project-id host-class layout task-id team-id files]}]
  (let [anchor-ref   (mf/use-ref nil)
        host-ref     (mf/use-ref nil)
        project-id   (str penpot-project-id)
        host-class   (or host-class "backsteros-project-tasks-host")
        layout       (or layout "stack")
        task-id      (when (and (string? task-id) (not= task-id ""))
                       task-id)

        on-task-id-change
        (mf/use-fn
         (mf/deps team-id penpot-project-id)
         (fn [next-id]
           (when (and team-id penpot-project-id)
             (st/emit! (dcm/go-to-dashboard-files
                        :team-id team-id
                        :project-id penpot-project-id
                        :task-id (when (and (string? next-id)
                                            (not= next-id ""))
                                   next-id)
                        ::rt/replace true)))))

        on-open-file
        (mf/use-fn
         (mf/deps team-id)
         (fn [file-id]
           (when-let [id (cond
                           (uuid? file-id) file-id
                           (string? file-id) (uuid/parse* file-id)
                           :else nil)]
             (st/emit! (dcm/go-to-workspace
                        :file-id id
                        :team-id team-id)))))

        ;; Stable fingerprint so we do not re-push the island on every parent
        ;; render when the file id set is unchanged (keeps j/k highlight).
        files-sig
        (mf/with-memo [files]
          (str/join "," (map #(str (:id %)) (or files []))))]

    ;; Create / destroy the host DOM node when the project rail changes.
    (mf/with-effect [project-id host-class layout]
      (let [anchor     (mf/ref-val anchor-ref)
            cancelled* (atom false)
            mount-el   (when anchor
                         (let [el (.createElement js/document "div")]
                           (set! (.-className el) host-class)
                           (.setAttribute el "data-testid" "backsteros-project-tasks-host")
                           (.setAttribute el "data-layout" layout)
                           (.insertAdjacentElement anchor "afterend" el)
                           el))]
        (mf/set-ref-val! host-ref mount-el)
        (when mount-el
          (mount-when-ready!
           mount-el
           (mount-opts project-id layout task-id on-task-id-change files on-open-file)
           cancelled*))
        (fn []
          (reset! cancelled* true)
          (mf/set-ref-val! host-ref nil)
          (when mount-el
            (when-let [api (bridge-api)]
              (.unmount api mount-el))
            (when (.-parentNode mount-el)
              (.remove mount-el))))))

    ;; Push task-id / files / callbacks into the existing React root (no remount).
    (mf/with-effect [project-id layout task-id on-task-id-change files-sig on-open-file files]
      (when-let [mount-el (mf/ref-val host-ref)]
        (when-let [api (bridge-api)]
          (.mount api mount-el
                  (mount-opts project-id layout task-id on-task-id-change
                              files on-open-file)))))

    ;; Invisible anchor — island is inserted as the next sibling.
    [:div {:ref anchor-ref
           :class "backsteros-project-tasks-anchor"
           :aria-hidden true}]))

(mf/defc workspace-tasks-panel*
  "Full project tasks list for the workspace right sidebar (stack layout)."
  [{:keys [penpot-project-id]}]
  [:div {:class "backsteros-workspace-tasks-panel"
         :data-testid "backsteros-workspace-tasks-panel"}
   (if (or (nil? penpot-project-id) (= (str penpot-project-id) ""))
     [:p {:class "backsteros-workspace-tasks-empty"}
      "No project linked to this file."]
     [:> project-tasks-section*
      {:penpot-project-id penpot-project-id
       :layout "stack"
       :host-class "backsteros-project-tasks-host backsteros-project-tasks-host--workspace"}])])
