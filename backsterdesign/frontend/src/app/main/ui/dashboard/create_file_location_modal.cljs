;; BacksterDESIGN — pick Drafts or a BacksterOS project before creating a file.

(ns app.main.ui.dashboard.create-file-location-modal
  (:require-macros [app.main.style :as stl])
  (:require
   [app.common.uuid :as uuid]
   [app.main.data.common :as dcm]
   [app.main.data.dashboard :as dd]
   [app.main.data.event :as ev]
   [app.main.data.modal :as modal]
   [app.main.data.notifications :as notif]
   [app.main.refs :as refs]
   [app.main.store :as st]
   [app.main.ui.dashboard.backsteros-bridge :as bos]
   [app.main.ui.dashboard.page-header :refer [project-switcher*]]
   [app.main.ui.ds.buttons.button :refer [button*]]
   [app.main.ui.ds.buttons.icon-button :refer [icon-button*]]
   [app.main.ui.ds.foundations.assets.icon :as i]
   [app.main.ui.ds.foundations.typography.heading :refer [heading*]]
   [app.util.dom :as dom]
   [rumext.v2 :as mf]))

(defn- team-id-from-state
  [state]
  (or (:current-team-id state)
      (get-in state [:profile :default-team-id])))

(defn- drafts-project-id
  [state]
  (or (get-in state [:profile :default-project-id])
      (->> (vals (:projects state))
           (filter :is-default)
           (map :id)
           first)))

(defn- project-label
  [project]
  (or (:name project)
      (:key project)
      "Untitled"))

(defn- create-file-in-project!
  [project-id]
  (let [on-success
        (fn [file-data]
          (let [file-id (:id file-data)
                page-id (get-in file-data [:pages 0])]
            (st/emit! (dcm/go-to-workspace
                       :file-id file-id
                       :page-id page-id))))]
    (st/emit!
     (-> (dd/create-file
          (with-meta {:project-id project-id}
                     {:on-success on-success
                      :on-error (fn [err]
                                  (st/emit!
                                   (notif/error
                                    (or (ex-message err)
                                        "Could not create file."))))}))
         (with-meta {::ev/origin "desktop:create-file-location"})))))

(mf/defc create-file-location-modal*
  {::mf/register modal/components
   ::mf/register-as :create-file-location}
  [_]
  (let [team         (mf/deref refs/team)
        profile      (mf/deref refs/profile)
        team-id      (or (:id team)
                         (:current-team-id @st/state)
                         (:default-team-id profile))
        destination* (mf/use-state :drafts)
        destination  (deref destination*)
        selected*    (mf/use-state nil)
        selected     (deref selected*)
        busy*        (mf/use-state false)
        busy?        (deref busy*)
        error*       (mf/use-state nil)
        error        (deref error*)

        close!
        (mf/use-fn
         (fn [event]
           (dom/prevent-default event)
           (st/emit! (modal/hide))))

        select-destination!
        (mf/use-fn
         (fn [dest]
           (reset! error* nil)
           (reset! destination* dest)))

        on-project-select
        (mf/use-fn
         (fn [project]
           (reset! error* nil)
           (reset! selected* project)
           (reset! destination* :project)))

        can-create?
        (and (not busy?)
             (or (= destination :drafts)
                 (and (= destination :project)
                      (some? selected))))

        create!
        (mf/use-fn
         (mf/deps destination selected team-id can-create?)
         (fn [event]
           (dom/prevent-default event)
           (when can-create?
             (reset! error* nil)
             (reset! busy* true)
             (cond
               (= destination :drafts)
               (let [drafts-id (drafts-project-id @st/state)]
                 (if-not drafts-id
                   (do
                     (reset! busy* false)
                     (reset! error* "Drafts project is not available yet."))
                   (do
                     (st/emit! (modal/hide))
                     (create-file-in-project! drafts-id))))

               :else
               (if-not selected
                 (do
                   (reset! busy* false)
                   (reset! error* "Select a project."))
                 (-> (bos/ensure-penpot-project-id! team-id selected)
                     (.then (fn [penpot-id]
                              (st/emit! (modal/hide))
                              (create-file-in-project! penpot-id)))
                     (.catch (fn [err]
                               (reset! busy* false)
                               (reset! error*
                                       (or (.-message err)
                                           (str err)))))))))))]

    [:div {:class (stl/css :modal-overlay)}
     [:div {:class (stl/css :modal-container)
            :role "dialog"
            :aria-modal "true"
            :aria-labelledby "create-file-location-title"}
      [:div {:class (stl/css :modal-header)}
       [:> heading* {:level 2
                     :typography "headline-medium"
                     :class (stl/css :modal-title)
                     :id "create-file-location-title"}
        "Where do you want to create a file?"]
       [:> icon-button* {:variant "ghost"
                         :aria-label "Close"
                         :on-click close!
                         :class (stl/css :modal-close-btn)
                         :icon i/close}]]

      [:div {:class (stl/css :modal-body)
             :role "radiogroup"
             :aria-label "File location"}
       [:div {:class (stl/css-case :choice true
                                   :is-selected (= destination :project))
              :role "radio"
              :aria-checked (= destination :project)
              :tab-index 0
              :on-click #(select-destination! :project)
              :on-key-down (fn [e]
                             (when (or (= (.-key e) "Enter")
                                       (= (.-key e) " "))
                               (dom/prevent-default e)
                               (select-destination! :project)))}
        [:div {:class (stl/css :choice-row)}
         [:input {:type "radio"
                  :class (stl/css :choice-radio)
                  :name "create-file-destination"
                  :checked (= destination :project)
                  :on-change #(select-destination! :project)
                  :tab-index -1}]
         [:span {:class (stl/css :choice-label)} "Project"]]
        [:span {:class (stl/css :choice-hint)}
         "Create in a BacksterOS project (Penpot project is created if needed)."]
        [:div {:class (stl/css :project-select)
               :on-click (fn [e] (dom/stop-propagation e))
               :on-key-down (fn [e] (dom/stop-propagation e))}
         [:> project-switcher*
          {:variant :picker
           :label (if selected
                    (project-label selected)
                    "Select project")
           :active-id (:id selected)
           :on-select on-project-select
           :disabled busy?
           :menu-id "create-file-project-switcher"}]]]

       [:div {:class (stl/css-case :choice true
                                   :is-selected (= destination :drafts))
              :role "radio"
              :aria-checked (= destination :drafts)
              :tab-index 0
              :on-click #(select-destination! :drafts)
              :on-key-down (fn [e]
                             (when (or (= (.-key e) "Enter")
                                       (= (.-key e) " "))
                               (dom/prevent-default e)
                               (select-destination! :drafts)))}
        [:div {:class (stl/css :choice-row)}
         [:input {:type "radio"
                  :class (stl/css :choice-radio)
                  :name "create-file-destination"
                  :checked (= destination :drafts)
                  :on-change #(select-destination! :drafts)
                  :tab-index -1}]
         [:span {:class (stl/css :choice-label)} "Drafts"]]
        [:span {:class (stl/css :choice-hint)}
         "Create in your personal Drafts folder."]]

       (when (some? error)
         [:p {:class (stl/css :error)} error])]

      [:div {:class (stl/css :modal-footer)}
       [:> button* {:variant "secondary"
                    :on-click close!
                    :disabled busy?}
        "Cancel"]
       [:> button* {:variant "primary"
                    :on-click create!
                    :disabled (not can-create?)}
        (if busy? "Creating…" "Create file")]]]]))

(defn show!
  "Open the create-file location picker (desktop + chrome + button)."
  []
  (let [state   @st/state
        team-id (team-id-from-state state)]
    (when (nil? team-id)
      (st/emit! (notif/error "No Penpot team selected.")))
    (when (uuid? team-id)
      (st/emit! (modal/show :create-file-location {})))))
