;; This Source Code Form is subject to the terms of the Mozilla Public
;; License, v. 2.0. If a copy of the MPL was not distributed with this
;; file, You can obtain one at http://mozilla.org/MPL/2.0/.
;;
;; Copyright (c) KALEIDOS INC Sucursal en España SL

(ns app.main.ui.dashboard.projects
  (:require-macros [app.main.style :as stl])
  (:require
   [app.common.geom.point :as gpt]
   [app.common.time :as ct]
   [app.main.data.common :as dcm]
   [app.main.data.dashboard :as dd]
   [app.main.data.dashboard.shortcuts :as sc]
   [app.main.data.event :as ev]
   [app.main.data.nitrate :as dnt]
   [app.main.data.project :as dpj]
   [app.main.data.team :as dtm]
   [app.main.refs :as refs]
   [app.main.store :as st]
   [app.main.ui.dashboard.grid :refer [line-grid*]]
   [app.main.ui.dashboard.inline-edition :refer [inline-edition]]
   [app.main.ui.dashboard.keyboard-nav :as knav]
   [app.main.ui.dashboard.layout-toggle :refer [layout-toggle*]]
   [app.main.ui.dashboard.page-header :refer [page-header*]]
   [app.main.ui.dashboard.project-menu :refer [project-menu*]]
   [app.main.ui.ds.buttons.button :refer [button*]]
   [app.main.ui.ds.product.empty-placeholder :refer [empty-placeholder*]]
   [app.main.ui.hooks :as hooks]
   [app.main.ui.icons :as deprecated-icon]
   [app.util.dom :as dom]
   [app.util.i18n :as i18n :refer [tr]]
   [app.util.keyboard :as kbd]
   [app.util.storage :as storage]
   [cuerdas.core :as str]
   [okulary.core :as l]
   [rumext.v2 :as mf]))

(def ^:private show-more-icon
  (deprecated-icon/icon-xref :arrow (stl/css :show-more-icon)))

(def ^:private close-icon
  (deprecated-icon/icon-xref :close (stl/css :close-icon)))

(def ^:private add-icon
  (deprecated-icon/icon-xref :add (stl/css :add-icon)))

(def ^:private menu-icon
  (deprecated-icon/icon-xref :menu (stl/css :menu-icon)))

(mf/defc projects-page-header*
  {::mf/wrap [mf/memo]
   ::mf/private true}
  [{:keys [search-term team-id]}]
  ;; BacksterDESIGN: brand + search live in the content header.
  ;; Layout toggle stays in Recent tab content.
  [:> page-header* {:title "Recents"
                    :title-id "dashboard-recent-title"
                    :nav-section :dashboard-recent
                    :search-term search-term
                    :team-id team-id}])
(mf/defc team-hero*
  {::mf/wrap [mf/memo]}
  [{:keys [team on-close]}]
  (let [on-nav-members-click (mf/use-fn #(st/emit! (dcm/go-to-dashboard-members)))

        on-invite
        (mf/use-fn
         (mf/deps team)
         (fn []
           (st/emit! (dtm/check-and-invite-members {:team-id (:id team)
                                                    :origin :hero}))))
        on-close'
        (mf/use-fn
         (mf/deps on-close)
         (fn [event]
           (dom/prevent-default event)
           (on-close event)))]

    [:div {:class (stl/css :team-hero)}
     [:div {:class (stl/css :img-wrapper)}
      [:img {:src "images/deco-team-banner.png"
             :border "0"
             :role "presentation"}]]
     [:div {:class (stl/css :text)}
      [:div {:class (stl/css :title)} (tr "dasboard.team-hero.title")]
      [:div {:class (stl/css :info)}
       [:span (tr "dasboard.team-hero.text")]
       [:a {:on-click on-nav-members-click} (tr "dasboard.team-hero.management")]]
      [:> button* {:variant "primary"
                   :on-click on-invite}
       (tr "onboarding.choice.team-up.invite-members")]]
     [:button {:class (stl/css :close)
               :on-click on-close'
               :aria-label (tr "labels.close")}
      close-icon]]))

(mf/defc project-item*
  {::mf/private true
   ::mf/wrap [mf/memo]}
  [{:keys [project is-first team files can-edit layout]}]
  (let [project-id (get project :id)
        team-id    (get team :id)

        file-count (or (:count project) 0)

        loading?   (and (pos? (:count project))
                        (empty? files))

        is-draft?  (:is-default project)
        empty?     (and (not can-edit)
                        (= 0 file-count))

        dstate     (mf/deref refs/dashboard-local)
        edit-id    (:project-for-edit dstate)

        local      (mf/use-state {:menu-open false
                                  :menu-pos nil
                                  :edition (= (:id project) edit-id)})

        [rowref limit]
        (hooks/use-dynamic-grid-item-width)

        on-nav
        (mf/use-fn
         (mf/deps project-id)
         (fn []
           (st/emit! (dcm/go-to-dashboard-files :project-id project-id))))

        on-menu-click
        (mf/use-fn
         (fn [event]
           (dom/prevent-default event)

           (let [client-position (dom/get-client-position event)
                 position (if (and (nil? (:y client-position)) (nil? (:x client-position)))
                            (let [target-element (dom/get-target event)
                                  points         (dom/get-bounding-rect target-element)
                                  y              (:top points)
                                  x              (:left points)]
                              (gpt/point x y))
                            client-position)]
             (swap! local assoc
                    :menu-open true
                    :menu-pos position))))

        on-menu-close
        (mf/use-fn #(swap! local assoc :menu-open false))

        on-edit
        (mf/use-fn
         (mf/deps project)
         (fn [name]
           (let [name (str/trim name)]
             (when-not (str/empty? name)
               (st/emit! (-> (dd/rename-project (assoc project :name name))
                             (with-meta {::ev/origin "dashboard"}))))
             (swap! local assoc :edition false))))

        on-file-created
        (mf/use-fn
         (fn [{:keys [id data]}]
           (let [page-id (get-in data [:pages 0])]
             (st/emit! (dcm/go-to-workspace :file-id id :page-id page-id)))))

        create-file
        (mf/use-fn
         (mf/deps project-id on-file-created)
         (fn [origin]
           (let [mdata  {:on-success on-file-created}
                 params {:project-id project-id}]
             (st/emit! (-> (dd/create-file (with-meta params mdata))
                           (with-meta {::ev/origin origin :has-files (> file-count 0)}))))))

        on-create-click
        (mf/use-fn
         (mf/deps create-file)
         (fn [_]
           (create-file "dashboard:grid-header-plus-button")))

        on-import
        (mf/use-fn
         (mf/deps project-id team-id)
         (fn []
           (st/emit! (dpj/fetch-files project-id)
                     (dd/fetch-recent-files team-id)
                     (dd/fetch-projects team-id)
                     (dd/clear-selected-files))))

        handle-create-click
        (mf/use-callback
         (mf/deps on-create-click)
         (fn [event]
           (when (kbd/enter? event)
             (on-create-click event))))

        handle-menu-click
        (mf/use-callback
         (mf/deps on-menu-click)
         (fn [event]
           (when (kbd/enter? event)
             (dom/stop-propagation event)
             (on-menu-click event))))]

    [:article {:class (stl/css-case :dashboard-project-row true :first is-first)}
     ;; Group header: name + meta | rule line | hover actions (BacksterOS-style).
     [:header {:class (stl/css :project)}
      [:div {:class (stl/css :project-name-wrapper)}
       (if (:edition @local)
         [:& inline-edition {:content (:name project)
                             :on-end on-edit
                             :max-length 250}]
         [:h2 {:on-click on-nav
               :class (stl/css :project-name)
               :title (if (:is-default project)
                        (tr "labels.drafts")
                        (:name project))
               :on-context-menu (when can-edit on-menu-click)}
          (if (:is-default project)
            (tr "labels.drafts")
            (:name project))])

       ;; Keep count + time adjacent (no extra gap between the two spans).
       [:div {:class (stl/css :info-wrapper)}
        [:span {:class (stl/css :info)} (str (tr "labels.num-of-files" (i18n/c file-count)))]
        (let [time (-> (:modified-at project)
                       (ct/timeago))]
          [:span {:class (stl/css :recent-files-row-title-info)} (str ", " time)])]]

      [:div {:class (stl/css :project-rule) :aria-hidden true}]

      [:div {:class (stl/css :project-actions)}
       (when ^boolean can-edit
         [:button {:class (stl/css :add-file-btn)
                   :on-click on-create-click
                   :title (tr "dashboard.new-file")
                   :aria-label (tr "dashboard.new-file")
                   :data-testid "project-new-file"
                   :on-key-down handle-create-click}
          add-icon])

       (when ^boolean can-edit
         [:button {:class (stl/css :options-btn)
                   :on-click on-menu-click
                   :title (tr "dashboard.options")
                   :aria-label (tr "dashboard.options")
                   :data-testid "project-options"
                   :on-key-down handle-menu-click}
          menu-icon])

       (when ^boolean can-edit
         [:> project-menu*
          {:project project
           :show (:menu-open @local)
           :left (+ 24 (:x (:menu-pos @local)))
           :top (:y (:menu-pos @local))
           :on-close on-menu-close
           :on-import on-import}])]]

     [:div {:class (stl/css :grid-container) :ref rowref}
      (if ^boolean empty?
        [:> empty-placeholder* {:title (if ^boolean is-draft?
                                         (tr "dashboard.empty-placeholder-drafts-title")
                                         (tr "dashboard.empty-placeholder-files-title"))
                                :class (stl/css :placeholder-placement)
                                :type 1
                                :subtitle (if ^boolean is-draft?
                                            (tr "dashboard.empty-placeholder-drafts-subtitle")
                                            (tr "dashboard.empty-placeholder-files-subtitle"))}]

        [:> line-grid* {:project project
                        :team team
                        :files (if loading? nil files)
                        :create-fn create-file
                        :can-edit can-edit
                        :limit limit
                        :layout layout}])]

     (when (and (> limit 0)
                (> file-count limit))
       [:button {:class (stl/css :show-more)
                 :on-click on-nav
                 :tab-index "0"
                 :on-key-down (fn [event]
                                (when (kbd/enter? event)
                                  (on-nav)))}
        [:span {:class (stl/css :placeholder-label)} (tr "dashboard.show-all-files")]
        show-more-icon])]))

(def ^:private ref:recent-files
  (l/derived :recent-files st/state))

(mf/defc projects-section*
  [{:keys [team projects profile layout on-layout-change search-term]}]

  (let [team-id         (get team :id)

        recent-map      (mf/deref ref:recent-files)
        permisions      (:permissions team)

        can-edit        (:can-edit permisions)
        can-invite      (dnt/can-send-invitations?
                         {:organization (:organization team)
                          :profile-id (:id profile)
                          :team-permissions permisions})

        show-team-hero* (mf/use-state #(get storage/global ::show-team-hero true))
        show-team-hero? (deref show-team-hero*)

        my-penpot?      (= (:default-team-id profile) team-id)
        default-team?   (:is-default team)

        projects
        (mf/with-memo [projects]
          ;; Drafts (:is-default) only on the Drafts tab — not on Recents.
          (->> projects
               (remove :deleted-at)
               (remove :is-default)
               (sort-by :modified-at)
               (reverse)))

        ;; Index recent files once (O(files)) instead of filtering per project.
        files-by-project
        (mf/with-memo [recent-map]
          (if (nil? recent-map)
            {}
            (->> (vals recent-map)
                 (group-by :project-id)
                 (into {}
                       (map (fn [[pid fs]]
                              [pid (->> fs
                                        (sort-by :modified-at #(compare %2 %1))
                                        vec)]))))))

        first-project-id
        (some-> projects first :id)

        ;; Flat recent-file order matches on-screen project sections.
        file-ids
        (mf/with-memo [projects files-by-project]
          (into []
                (mapcat (fn [project]
                          (map (comp str :id)
                               (get files-by-project (:id project) []))))
                projects))

        highlighted* (mf/use-state nil)
        highlighted  @highlighted*
        highlight-ref (mf/use-ref nil)

        on-close
        (mf/use-fn
         (fn []
           (reset! show-team-hero* false)
           (st/emit! (ev/event {::ev/name "dont-show-team-up-hero"
                                ::ev/origin "dashboard"}))))]

    (knav/remember! highlight-ref highlighted)

    (mf/with-effect [show-team-hero?]
      (swap! storage/global assoc ::show-team-hero show-team-hero?))

    (mf/with-effect [team]
      (let [tname (if (:is-default team)
                    (tr "dashboard.personal-projects")
                    (:name team))]
        (dom/set-html-title (tr "title.dashboard.projects" tname))))

    (mf/with-effect [team-id]
      (reset! highlighted* nil)
      (st/emit! (dd/fetch-recent-files team-id)
                (dd/clear-selected-files)))

    (mf/with-effect [file-ids highlighted]
      (when (and highlighted
                 (nil? (knav/index-of-id file-ids highlighted)))
        (reset! highlighted* nil)))

    (mf/with-effect [highlighted]
      (knav/sync-file-highlight! highlighted)
      (fn [] (knav/sync-file-highlight! nil)))

    (mf/with-effect [file-ids]
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

                    (= key "Escape")
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
          (.removeEventListener js/window "keydown" on-key true))))

    (hooks/use-shortcuts ::dashboard sc/shortcuts-projects :dashboard)

    [:*
     [:> projects-page-header* {:search-term search-term
                                :team-id team-id}]
     [:div {:class (stl/css :projects-container)}
      [:*
       (when (and show-team-hero?
                  can-invite
                  (not default-team?))
         [:> team-hero* {:team team :on-close on-close}])

       [:div {:class (stl/css-case :dashboard-container true
                                   :no-bg true
                                   :dashboard-projects true
                                   :with-team-hero (and (not my-penpot?)
                                                        (not default-team?)
                                                        show-team-hero?
                                                        can-invite))}

        [:div {:class (stl/css :recent-toolbar)}
         [:> layout-toggle* {:layout layout
                             :on-change on-layout-change}]]

        (for [{:keys [id] :as project} projects]
          [:> project-item* {:project project
                             :team team
                             :files (get files-by-project id [])
                             :can-edit can-edit
                             :layout layout
                             :is-first (= id first-project-id)
                             :key id}])]]]]))
