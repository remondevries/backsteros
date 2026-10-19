;; This Source Code Form is subject to the terms of the Mozilla Public
;; License, v. 2.0. If a copy of the MPL was not distributed with this
;; file, You can obtain one at http://mozilla.org/MPL/2.0/.
;;
;; Copyright (c) KALEIDOS INC Sucursal en España SL

(ns app.main.ui.dashboard.files
  (:require-macros [app.main.style :as stl])
  (:require
   [app.main.data.common :as dcm]
   [app.main.data.dashboard :as dd]
   [app.main.data.dashboard.shortcuts :as sc]
   [app.main.data.event :as ev]
   [app.main.data.project :as dpj]
   [app.main.refs :as refs]
   [app.main.store :as st]
   [app.main.ui.dashboard.grid :refer [grid*]]
   [app.main.ui.dashboard.keyboard-nav :as knav]
   [app.main.ui.dashboard.layout-toggle :refer [layout-toggle*]]
   [app.main.ui.dashboard.page-header :refer [page-header*]]
   [app.main.ui.dashboard.project-menu :refer [project-menu*]]
   [app.main.ui.dashboard.project-tasks :refer [project-tasks-section*]]
   [app.main.ui.ds.product.empty-placeholder :refer [empty-placeholder*]]
   [app.main.ui.hooks :as hooks]
   [app.main.ui.icons :as deprecated-icon]
   [app.util.dom :as dom]
   [app.util.i18n :as i18n :refer [tr]]
   [app.util.keyboard :as kbd]
   [cuerdas.core :as str]
   [rumext.v2 :as mf]))

(defn- match-file-query?
  [file needle]
  (or (str/blank? needle)
      (str/includes? (str/lower (or (:name file) "")) needle)))

(defn- filter-files-by-query
  [files query]
  (let [needle (str/lower (str/trim (or query "")))]
    (if (str/blank? needle)
      files
      (filterv #(match-file-query? % needle) files))))

(def ^:private menu-icon
  (deprecated-icon/icon-xref :menu (stl/css :menu-icon)))

(mf/defc project-toolbar*
  {::mf/private true}
  [{:keys [project create-fn can-edit layout on-change]}]
  (let [project-id (:id project)
        local      (mf/use-state {:menu-open false})

        on-create-click
        (mf/use-fn
         (mf/deps create-fn)
         (fn [event]
           (dom/prevent-default event)
           (create-fn "dashboard:project-toolbar")))

        on-menu-click
        (mf/use-fn
         (fn [event]
           (let [position (dom/get-client-position event)]
             (dom/prevent-default event)
             (swap! local assoc :menu-open true :menu-pos position))))

        on-menu-close
        (mf/use-fn #(swap! local assoc :menu-open false))

        on-import
        (mf/use-fn
         (mf/deps project-id)
         (fn []
           (st/emit! (dpj/fetch-files project-id)
                     (dd/clear-selected-files))))]

    [:div {:class (stl/css :drafts-toolbar)
           :data-testid "project-toolbar"}
     (when ^boolean can-edit
       [:button {:type "button"
                 :class (stl/css :drafts-new-file)
                 :data-testid "new-file"
                 :on-click on-create-click
                 :on-key-down (fn [event]
                                (when (kbd/enter? event)
                                  (on-create-click event)))}
        (tr "dashboard.new-file")])

     [:> layout-toggle* {:layout layout
                         :on-change on-change}]

     (when ^boolean can-edit
       [:div {:class (stl/css :icon)
              :tab-index "0"
              :role "button"
              :on-click on-menu-click
              :title (tr "dashboard.options")
              :aria-label (tr "dashboard.options")
              :on-key-down (fn [event]
                             (when (kbd/enter? event)
                               (on-menu-click event)))}
        menu-icon])

     (when ^boolean can-edit
       [:> project-menu* {:project project
                          :show (:menu-open @local)
                          :left (- (:x (:menu-pos @local)) 180)
                          :top (:y (:menu-pos @local))
                          :on-close on-menu-close
                          :on-import on-import}])]))

(mf/defc files-section*
  [{:keys [project team layout on-layout-change task-id]}]
  (let [files            (mf/deref refs/files)
        project-id       (get project :id)
        team-id          (get team :id)
        query*           (mf/use-state "")
        query            (deref query*)

        files            (mf/with-memo [project-id files]
                           (->> (vals files)
                                (filter #(= project-id (:project-id %)))
                                (sort-by :modified-at)
                                (reverse)
                                (vec)))

        visible-files    (mf/with-memo [files query]
                           (filter-files-by-query files query))

        can-edit?          (-> team :permissions :can-edit)
        project-id         (:id project)
        is-draft-proyect   (:is-default project)

        [rowref limit]     (hooks/use-dynamic-grid-item-width)

        file-count         (or (count files) 0)

        loading?           (and (some? (:count project))
                                (not= (:count project) file-count))

        empty-state-viewer (and (not can-edit?)
                                (= 0 file-count)
                                (not loading?))

        selected-files     (mf/deref refs/selected-files)

        project-title
        (if is-draft-proyect
          (tr "labels.drafts")
          (:name project))

        on-search-change
        (mf/use-fn
         (fn [value]
           (reset! query* (or value ""))))

        on-file-created
        (mf/use-fn
         (fn [file-data]
           (let [file-id (:id file-data)
                 page-id (get-in file-data [:pages 0])]
             (st/emit! (dcm/go-to-workspace :file-id file-id :page-id page-id)))))

        create-file
        (mf/use-fn
         (mf/deps project-id file-count on-file-created)
         (fn [origin]
           (let [mdata  {:on-success on-file-created}
                 params {:project-id project-id}]
             (st/emit! (-> (dd/create-file (with-meta params mdata))
                           (with-meta {::ev/origin origin :has-files (> file-count 0)}))))))

        ;; Drafts own j/k here. Project overview with the tasks rail leaves
        ;; file j/k to FilesKeyboardZone so Tab zones stay consistent.
        cljs-owns-file-nav? is-draft-proyect

        file-ids
        (mf/with-memo [visible-files]
          (mapv (comp str :id) (or visible-files [])))

        highlighted* (mf/use-state nil)
        highlighted  @highlighted*
        highlight-ref (mf/use-ref nil)]

    (knav/remember! highlight-ref highlighted)

    (mf/with-effect [project-title]
      (when project
        (dom/set-html-title (tr "title.dashboard.files" project-title))))

    (mf/with-effect [project-id]
      (reset! query* "")
      (reset! highlighted* nil)
      (st/emit! (dpj/fetch-files project-id)
                (dd/clear-selected-files)))

    (mf/with-effect [file-ids highlighted]
      (when (and highlighted
                 (nil? (knav/index-of-id file-ids highlighted)))
        (reset! highlighted* nil)))

    (mf/with-effect [highlighted cljs-owns-file-nav?]
      (when cljs-owns-file-nav?
        (knav/sync-file-highlight! highlighted)
        (fn [] (knav/sync-file-highlight! nil))))

    (mf/with-effect [file-ids cljs-owns-file-nav?]
      (when cljs-owns-file-nav?
        (let [on-key
              (fn [event]
                (when (and (not (.-metaKey event))
                           (not (.-ctrlKey event))
                           (not (.-altKey event)))
                  (let [target (.-target event)
                        key    (.-key event)
                        code   (.-code event)
                        stop!  (fn []
                                 (.preventDefault event)
                                 (.stopPropagation event)
                                 (.stopImmediatePropagation event))]
                    (cond
                      (or (knav/search-input-target? target)
                          (knav/editable-target? target)
                          (knav/editable-target? (.-activeElement js/document)))
                      nil

                      (not (seq file-ids))
                      nil

                      (or (= key "Escape"))
                      (when (mf/ref-val highlight-ref)
                        (stop!)
                        (knav/remember! highlight-ref nil)
                        (reset! highlighted* nil))

                      (or (= key "Enter") (= code "Enter") (= code "NumpadEnter"))
                      (when-let [fid (mf/ref-val highlight-ref)]
                        (stop!)
                        (knav/open-file! fid))

                      (or (= key "j") (= key "J") (= code "KeyJ")
                          (= key "ArrowDown"))
                      (when-not (.-shiftKey event)
                        (stop!)
                        (reset! highlighted*
                                (knav/step-ref! highlight-ref file-ids :down)))

                      (or (= key "k") (= key "K") (= code "KeyK")
                          (= key "ArrowUp"))
                      (when-not (.-shiftKey event)
                        (stop!)
                        (reset! highlighted*
                                (knav/step-ref! highlight-ref file-ids :up)))))))]
          (.addEventListener js/window "keydown" on-key true)
          (fn []
            (.removeEventListener js/window "keydown" on-key true)))))

    (hooks/use-shortcuts ::dashboard sc/shortcuts-drafts-libraries :dashboard)

    [:*
     (if is-draft-proyect
       [:> page-header* {:title (tr "labels.drafts")
                         :title-id "dashboard-drafts-title"
                         :nav-section :dashboard-files
                         :search-term query
                         :search-placeholder "Search files…"
                         :on-search-change on-search-change
                         :team-id team-id}]
       [:> page-header* {:title "Projects"
                         :title-id (str project-id)
                         :nav-section :dashboard-backsteros
                         :project-nav {:id project-id
                                       :title project-title}
                         :search-term query
                         :search-placeholder "Search files…"
                         :on-search-change on-search-change
                         :team-id team-id}])
     [:section {:class (stl/css :dashboard-container :no-bg)}
      ;; Project overview: tasks rail on the left (list + detail), files fill the rest.
      ;; rowref lives on files-body so the grid reflows when the rail opens/closes.
      [:div {:class (stl/css-case :files-layout true
                                  :files-layout-with-rail (and (not is-draft-proyect)
                                                               (some? project-id)))}
       (when (and (not is-draft-proyect) (some? project-id))
         [:aside {:class (stl/css :files-tasks-rail)
                  :data-testid "files-tasks-rail"}
          [:> project-tasks-section*
           {:penpot-project-id project-id
            :team-id team-id
            :task-id task-id
            :files files
            :layout "rail"
            :host-class "backsteros-project-tasks-host backsteros-project-tasks-host--rail"}]])
       [:div {:class (stl/css :files-body)
              :ref rowref}
        (if is-draft-proyect
          [:div {:class (stl/css :drafts-toolbar)
                 :data-testid "drafts-toolbar"}
           (when ^boolean can-edit?
             [:button {:type "button"
                       :class (stl/css :drafts-new-file)
                       :data-testid "new-file"
                       :on-click (fn [event]
                                   (dom/prevent-default event)
                                   (create-file "dashboard:drafts-toolbar"))}
              (tr "dashboard.new-file")])
           [:> layout-toggle* {:layout layout
                               :on-change on-layout-change}]]
          [:> project-toolbar* {:project project
                                :create-fn create-file
                                :can-edit can-edit?
                                :layout layout
                                :on-change on-layout-change}])
        (cond
          empty-state-viewer
          [:> empty-placeholder* {:title (if is-draft-proyect
                                           (tr "dashboard.empty-placeholder-drafts-title")
                                           (tr "dashboard.empty-placeholder-files-title"))
                                  :class (stl/css :placeholder-placement)
                                  :type 1
                                  :subtitle (if is-draft-proyect
                                              (tr "dashboard.empty-placeholder-drafts-subtitle")
                                              (tr "dashboard.empty-placeholder-files-subtitle"))}]

          (and (not loading?)
               (seq files)
               (empty? visible-files)
               (not (str/blank? query)))
          [:p {:class (stl/css :search-empty)
               :data-testid "project-files-search-empty"}
           "No files match your search."]

          :else
          [:> grid* {:project project
                     :files (if loading? nil visible-files)
                     :selected-files selected-files
                     :can-edit can-edit?
                     :origin :files
                     :create-fn create-file
                     :limit limit
                     :auto-height false}])]]]]))
