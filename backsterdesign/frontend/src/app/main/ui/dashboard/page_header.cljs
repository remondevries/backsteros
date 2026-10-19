;; Shared dashboard content header: BacksterDESIGN / <section▼> / <project▼>
;; … search + notifications + avatar. Section and project crumbs use the same
;; hover chrome (outline + chevron); click opens a switcher menu.

(ns app.main.ui.dashboard.page-header
  (:require-macros [app.main.style :as stl])
  (:require
   [app.common.data :as d]
   [app.common.uuid :as uuid]
   [app.config :as cf]
   [app.main.data.common :as dcm]
   [app.main.refs :as refs]
   [app.main.router :as rt]
   [app.main.store :as st]
   [app.main.ui.components.dropdown-menu :refer [dropdown-menu*
                                                 dropdown-menu-item*]]
   [app.main.ui.dashboard.backsteros-cache :as bos.cache]
   [app.main.ui.dashboard.comments :refer [comments-icon* comments-section]]
   [app.main.ui.icons :as deprecated-icon]
   [app.util.dom :as dom]
   [app.util.i18n :as i18n :refer [tr]]
   [app.util.keyboard :as kbd]
   [app.util.object :as obj]
   [cuerdas.core :as str]
   [goog.functions :as f]
   [rumext.v2 :as mf]))

;; Icons must be created per use — a shared React element instance cannot
;; appear in two places in the tree (section crumb + project crumb both need
;; the arrow; header search + project menu both need the search glyph).
(defn- clear-search-icon []
  (deprecated-icon/icon-xref :delete-text (stl/css :clear-search-icon)))

(defn- search-icon []
  (deprecated-icon/icon-xref :search (stl/css :search-icon)))

(defn- arrow-icon []
  (deprecated-icon/icon-xref :arrow (stl/css :section-nav-arrow)))

(defn- tick-icon []
  (deprecated-icon/icon-xref :tick (stl/css :section-nav-tick)))

(mf/defc header-search*
  {::mf/private true}
  ;; When `on-search-change` is set, filter in place (Projects / Clients /
  ;; project files). Otherwise navigate to the global file search (Recents).
  [{:keys [search-term team-id on-search-change placeholder]}]
  (let [search-term (d/nilv search-term "")
        local?      (fn? on-search-change)
        label       (or placeholder (tr "dashboard.search-placeholder"))
        focused?*   (mf/use-state false)
        emit!       (mf/use-memo #(f/debounce st/emit! 500))

        on-blur
        (mf/use-fn
         (fn [_]
           (reset! focused?* false)))

        on-focus
        (mf/use-fn
         (fn [_]
           (reset! focused?* true)))

        on-change
        (mf/use-fn
         (mf/deps on-search-change)
         (fn [event]
           (let [value (dom/get-target-val event)]
             (if (fn? on-search-change)
               (on-search-change value)
               (emit! (dcm/go-to-dashboard-search :term value))))))

        on-clear
        (mf/use-fn
         (mf/deps team-id on-search-change)
         (fn [e]
           (dom/prevent-default e)
           (dom/stop-propagation e)
           (if (fn? on-search-change)
             (on-search-change "")
             (st/emit! (dcm/go-to-dashboard-search)))
           (when-let [el (dom/get-element "dashboard-header-search-input")]
             (dom/clean-value! el)
             (dom/focus! el))))

        on-key-press
        (mf/use-fn
         (fn [e]
           (when (kbd/enter? e)
             (dom/prevent-default e)
             (dom/stop-propagation e))))

        on-key-down
        (mf/use-fn
         (fn [e]
           ;; Escape leaves the field so list hotkeys (j/k) work again.
           (when (kbd/esc? e)
             (dom/prevent-default e)
             (dom/stop-propagation e)
             (when-let [el (dom/get-target e)]
               (.blur ^js el)
               (reset! focused?* false)))))]

    [:form {:class (stl/css :header-search)
            :on-submit (fn [e] (dom/prevent-default e))}
     [:input {:class (stl/css :search-input)
              :id "dashboard-header-search-input"
              :type "text"
              :aria-label label
              :placeholder label
              :default-value search-term
              :auto-complete "off"
              :on-blur on-blur
              :on-focus on-focus
              :on-change on-change
              :on-key-press on-key-press
              :on-key-down on-key-down
              :ref #(when % (set! (.-value %) search-term))
              :data-search-mode (if local? "local" "global")}]
     (if (or @focused?* (seq search-term))
       [:button {:type "button"
                 :class (stl/css :search-btn :clear-search-btn)
                 :aria-label "dashboard-clear-search"
                 :on-click on-clear}
        (clear-search-icon)]
       [:button {:type "button"
                 :class (stl/css :search-btn)
                 :aria-label "dashboard-search"
                 :on-click on-clear}
        (search-icon)])]))

(mf/defc header-account*
  {::mf/private true}
  [{:keys [profile team]}]
  (let [photo (cf/resolve-profile-photo-url profile)
        show-comments* (mf/use-state false)
        show-comments? @show-comments*

        on-hide-comments
        (mf/use-fn #(reset! show-comments* false))

        on-show-comments
        (mf/use-fn #(reset! show-comments* true))

        on-avatar-click
        (mf/use-fn
         (fn [event]
           (dom/stop-propagation event)
           (st/emit! (rt/nav :settings-profile))))

        on-avatar-key-down
        (mf/use-fn
         (fn [event]
           (when (kbd/enter? event)
             (st/emit! (rt/nav :settings-profile)))))]

    [:div {:class (stl/css :header-account)}
     (when (and team profile)
       [:div {:class (stl/css :header-comments)}
        [:> comments-icon* {:profile profile
                            :on-show-comments on-show-comments}]
        [:& comments-section
         {:profile profile
          :team team
          :show? show-comments?
          :on-show-comments on-show-comments
          :on-hide-comments on-hide-comments
          :placement :header}]])

     (when profile
       [:button {:type "button"
                 :class (stl/css :avatar-btn)
                 :tab-index "0"
                 :title (tr "labels.your-account")
                 :aria-label (tr "labels.your-account")
                 :data-testid "header-avatar-btn"
                 :on-click on-avatar-click
                 :on-key-down on-avatar-key-down}
        [:img {:src photo
               :class (stl/css :avatar-img)
               :alt (:fullname profile)}]])]))

(mf/defc header-crumb*
  {::mf/private true
   ::mf/wrap [mf/memo]}
  [{:keys [label on-click]}]
  (let [interactive? (fn? on-click)
        handle-click
        (mf/use-fn
         (mf/deps on-click)
         (fn [event]
           (dom/prevent-default event)
           (when on-click
             (on-click event))))]
    [:*
     [:span {:class (stl/css :sep) :aria-hidden true} "/"]
     (if interactive?
       [:button {:type "button"
                 :class (stl/css :crumb)
                 :on-click handle-click}
        label]
       [:span {:class (stl/css :crumb :crumb-leaf)}
        label])]))

(defn- section-nav-entries
  "Top-level dashboard sections (same set as the old tab bar)."
  [team-id default-project-id]
  [{:id    :dashboard-recent
    :label "Recents"
    :go    #(st/emit! (dcm/go-to-dashboard-recent :team-id team-id))}
   {:id    :dashboard-backsteros
    :label "Projects"
    :go    #(st/emit! (dcm/go-to-dashboard-backsteros :team-id team-id))}
   {:id    :dashboard-client-accounts
    :label "Clients"
    :go    #(st/emit! (dcm/go-to-dashboard-client-accounts :team-id team-id))}
   {:id    :dashboard-files
    :label (tr "labels.drafts")
    :go    #(when default-project-id
              (st/emit! (dcm/go-to-dashboard-files
                         :team-id team-id
                         :project-id default-project-id)))}
   {:id    :dashboard-fonts
    :label (tr "labels.fonts")
    :go    #(st/emit! (dcm/go-to-dashboard-fonts :team-id team-id))}
   {:id    :dashboard-libraries
    :label "Libraries"
    :go    #(st/emit! (dcm/go-to-dashboard-libraries :team-id team-id))}])

(mf/defc section-title-nav*
  "Second breadcrumb: current section. Hover → outline + chevron; click → menu."
  {::mf/private true}
  [{:keys [title title-id section team-id]}]
  (let [open*              (mf/use-state false)
        open?              (deref open*)
        profile            (mf/deref refs/profile)
        default-project-id (:default-project-id profile)
        entries            (section-nav-entries team-id default-project-id)

        on-toggle
        (mf/use-fn
         (fn [event]
           (dom/stop-propagation event)
           (swap! open* not)))

        on-close
        (mf/use-fn #(reset! open* false))

        on-key-down
        (mf/use-fn
         (mf/deps on-toggle)
         (fn [event]
           (when (or (kbd/enter? event) (kbd/space? event))
             (dom/prevent-default event)
             (on-toggle event))))]

    [:*
     [:span {:class (stl/css :sep) :aria-hidden true} "/"]
     [:div {:class (stl/css-case :section-nav true
                                 :section-nav-open open?)}
      [:button {:type "button"
                :class (stl/css :section-nav-trigger)
                :id (or title-id "dashboard-page-title")
                :aria-haspopup "menu"
                :aria-expanded open?
                :aria-label (str title " — switch section")
                :data-testid "dashboard-section-nav"
                :on-click on-toggle
                :on-key-down on-key-down}
       [:span {:class (stl/css :section-nav-label)} title]
       (arrow-icon)]
      [:> dropdown-menu*
       {:show open?
        :on-close on-close
        :id "dashboard-section-nav"
        :class (stl/css :section-nav-menu)}
       (for [{:keys [id label go]} entries]
         [:> dropdown-menu-item*
          {:key (name id)
           :class (stl/css-case :section-nav-item true
                                :section-nav-item-active (= id section))
           :data-testid (str "section-nav-" (name id))
           :on-click (fn [event]
                       (dom/stop-propagation event)
                       (on-close)
                       (when (not= id section)
                         (go)))}
          [:span {:class (stl/css :section-nav-item-label)} label]
          (when (= id section)
            (tick-icon))])]]]))

(def ^:private open-project-nav-event
  "backster:open-project-nav")

(def ^:private bos-projects-cache-key
  :backsteros-projects)

(defn- parse-penpot-id
  [value]
  (cond
    (uuid? value) value
    (and (string? value) (not (str/blank? value)))
    (try (uuid/parse value) (catch :default _ nil))
    :else nil))

(defn- project-linked?
  [project]
  (boolean (parse-penpot-id (:penpot-project-id project))))

(defn- sort-by-name
  [projects]
  (vec (sort-by (fn [p] (str/lower (or (:name p) (:key p) ""))) projects)))

(defn- match-project?
  [project needle]
  (or (str/blank? needle)
      (str/includes? (str/lower (or (:name project) "")) needle)
      (str/includes? (str/lower (or (:key project) "")) needle)))

(defn- penpot-as-switcher-rows
  [projects]
  (->> (vals (or projects {}))
       (remove :is-default)
       (remove :deleted-at)
       (map (fn [p]
              {:id (:id p)
               :name (:name p)
               :penpot-project-id (:id p)}))
       (sort-by-name)))

(defn- parse-bos-project-row
  [row]
  {:id                (obj/get row "id")
   :key               (obj/get row "key")
   :name              (obj/get row "name")
   :penpot-project-id (obj/get row "penpotProjectId")})

(defn- fetch-bos-projects-p
  "Lightweight list fetch for the switcher. Resolves to [] on any failure."
  []
  (try
    (let [cfg (obj/get js/window "backsterosCore")]
      (if (nil? cfg)
        (js/Promise.resolve [])
        (let [base (or (obj/get cfg "baseUrl") "")
              key  (or (obj/get cfg "apiKey") "local")
              url  (str (str/rtrim base "/")
                        "/api/v1/projects?paginated=true&limit=200")]
          (-> (js/fetch url
                        #js {:method "GET"
                             :headers #js {"Authorization" (str "Bearer " key)
                                           "Accept" "application/json"}})
              (.then (fn [res]
                       (if-not (.-ok res)
                         (js/Promise.reject (js/Error. "projects fetch failed"))
                         (.json res))))
              (.then (fn [data]
                       (let [items (or (when (some? data)
                                         (obj/get data "items"))
                                       (when (some? data)
                                         (obj/get data "projects"))
                                       #js [])]
                         (vec (map parse-bos-project-row items)))))
              (.catch (fn [_] []))))))
    (catch :default _
      (js/Promise.resolve []))))

(defn- load-switcher-projects!
  "Prefer session cache from the Projects tab; otherwise fetch once."
  []
  (if-let [cached (bos.cache/cached-data bos-projects-cache-key)]
    (js/Promise.resolve cached)
    (-> (fetch-bos-projects-p)
        (.then (fn [rows]
                 (when (seq rows)
                   (bos.cache/put! bos-projects-cache-key rows))
                 rows)))))

(defn- switcher-menu-rows
  "Linked (Penpot) first, then unlinked. Search keeps that split."
  [entries query]
  (let [needle   (str/lower (str/trim (or query "")))
        matched  (filterv #(match-project? % needle) (or entries []))
        linked   (sort-by-name (filterv project-linked? matched))
        unlinked (sort-by-name (filterv (complement project-linked?) matched))]
    (vec
     (concat
      (map (fn [p] {:kind :project :project p :linked true}) linked)
      (when (and (seq linked) (seq unlinked))
        [{:kind :separator}])
      (map (fn [p] {:kind :project :project p :linked false}) unlinked)))))

(mf/defc project-title-nav*
  "Project switcher. Visible crumb on a single project; hotkey-only host on
   the projects list (`:visible false`). Listens for `backster:open-project-nav`
   (g+p) to open and focus search."
  {::mf/private true}
  [{:keys [project-id project-title team-id visible]}]
  (let [visible?   (not (false? visible))
        open*      (mf/use-state false)
        open?      (deref open*)
        query*     (mf/use-state "")
        query      (deref query*)
        rows*      (mf/use-state nil)
        rows       (deref rows*)
        search-ref (mf/use-ref nil)
        penpot     (mf/deref refs/projects)

        entries
        (mf/with-memo [rows penpot]
          (or rows (penpot-as-switcher-rows penpot)))

        menu-rows
        (mf/with-memo [entries query]
          (switcher-menu-rows entries query))

        open-and-focus!
        (mf/use-fn
         (fn []
           (reset! open* true)))

        on-toggle
        (mf/use-fn
         (fn [event]
           (dom/stop-propagation event)
           (swap! open* not)))

        on-close
        (mf/use-fn
         (fn []
           (reset! open* false)
           (reset! query* "")))

        on-key-down
        (mf/use-fn
         (mf/deps on-toggle)
         (fn [event]
           (when (or (kbd/enter? event) (kbd/space? event))
             (dom/prevent-default event)
             (on-toggle event))))

        on-search-change
        (mf/use-fn
         (fn [event]
           (reset! query* (dom/get-target-val event))))

        on-search-key-down
        (mf/use-fn
         (mf/deps on-close)
         (fn [event]
           (when (kbd/esc? event)
             (dom/prevent-default event)
             (on-close))))

        select-project
        (mf/use-fn
         (mf/deps team-id project-id on-close)
         (fn [project]
           (let [penpot-id (parse-penpot-id (:penpot-project-id project))]
             (on-close)
             (cond
               (and (some? penpot-id) (= penpot-id project-id))
               nil

               (some? penpot-id)
               (st/emit! (dcm/go-to-dashboard-files
                          :team-id team-id
                          :project-id penpot-id))

               ;; Unlinked: open Projects list so staff can create/link there.
               :else
               (st/emit! (dcm/go-to-dashboard-backsteros :team-id team-id))))))]

    (mf/with-effect []
      (try
        (-> (load-switcher-projects!)
            (.then (fn [xs]
                     (when (seq xs)
                       (reset! rows* xs))))
            (.catch (fn [_] nil)))
        (catch :default _
          nil))
      js/undefined)

    (mf/with-effect [open?]
      (when open?
        (try
          (-> (load-switcher-projects!)
              (.then (fn [xs]
                       (when (seq xs)
                         (reset! rows* xs))))
              (.catch (fn [_] nil)))
          (catch :default _
            nil))
        ;; Focus after the input mounts with the open menu.
        (js/setTimeout
         (fn []
           (when-let [node (or (mf/ref-val search-ref)
                               (dom/get-element "dashboard-project-nav-search"))]
             (dom/focus! node)))
         0)))

    (mf/with-effect [open-and-focus!]
      (let [on-open
            (fn [event]
              (.preventDefault event)
              (open-and-focus!))]
        (.addEventListener js/window open-project-nav-event on-open)
        (fn []
          (.removeEventListener js/window open-project-nav-event on-open))))

    [:*
     (when visible?
       [:span {:class (stl/css :sep) :aria-hidden true} "/"])
     [:div {:class (stl/css-case :section-nav true
                                 :section-nav-open open?
                                 :project-jump-host (not visible?))}
      (when visible?
        [:button {:type "button"
                  :class (stl/css :section-nav-trigger)
                  :aria-haspopup "menu"
                  :aria-expanded open?
                  :aria-label (str project-title " — switch project")
                  :data-testid "dashboard-project-nav"
                  :on-click on-toggle
                  :on-key-down on-key-down}
         [:span {:class (stl/css :section-nav-label)} project-title]
         (arrow-icon)])
      [:> dropdown-menu*
       {:show open?
        :on-close on-close
        :id "dashboard-project-nav"
        :class (stl/css :section-nav-menu :project-nav-menu)}
       (when open?
         [:*
          [:li {:role "presentation"
                :class (stl/css :project-nav-search)
                :data-no-close true
                :on-click (fn [event]
                            (dom/stop-propagation event))}
           [:input {:ref search-ref
                    :id "dashboard-project-nav-search"
                    :type "text"
                    :class (stl/css :project-nav-search-input)
                    :placeholder "Search projects…"
                    :aria-label "Search projects"
                    :value query
                    :auto-complete "off"
                    :data-no-close true
                    :on-change on-search-change
                    :on-key-down on-search-key-down
                    :on-click (fn [event]
                                (dom/stop-propagation event))}]
           (search-icon)]
          (if (seq menu-rows)
            (for [[idx row] (map-indexed vector menu-rows)]
              (if (= :separator (:kind row))
                [:li {:key (str "sep-" idx)
                      :role "separator"
                      :class (stl/css :project-nav-split)}]
                (let [project (:project row)
                      id      (:id project)
                      label   (or (:name project) (:key project) "Untitled")
                      linked? (:linked row)
                      pid     (parse-penpot-id (:penpot-project-id project))
                      active? (and linked? (= pid project-id))]
                  [:> dropdown-menu-item*
                   {:key (str id)
                    :class (stl/css-case :section-nav-item true
                                         :section-nav-item-active active?
                                         :section-nav-item-unlinked (not linked?))
                    :data-testid (str "project-nav-" id)
                    :title (when-not linked?
                             "Not linked to Penpot — open Projects to create")
                    :on-click (fn [event]
                                (dom/stop-propagation event)
                                (select-project project))}
                   [:span {:class (stl/css :section-nav-item-label)
                           :title label}
                    label]
                   (when active?
                     (tick-icon))])))
            [:li {:role "presentation"
                  :class (stl/css :project-nav-empty)}
             "No projects match"])])]]]))

(mf/defc page-header*
  ;; Optional :nav-section — when set, title becomes the section dropdown.
  ;; Optional :crumbs — [{:label … :on-click f?} …] after the section/title.
  ;; Optional :project-nav — {:id … :title …} project switcher crumb.
  ;; Optional :project-jump — hotkey-only project switcher (projects list page).
  ;; Optional :leaf — non-interactive final crumb (ignored when :project-nav set).
  ;; Optional :on-search-change / :search-placeholder — scoped in-page filter
  ;; instead of the global file search route.
  [{:keys [title title-id search-term team-id nav-section crumbs project-nav
           project-jump leaf on-search-change search-placeholder]}]
  (let [profile (mf/deref refs/profile)
        team    (mf/deref refs/team)

        on-brand-click
        (mf/use-fn
         (mf/deps team-id)
         (fn [event]
           (dom/prevent-default event)
           (st/emit! (dcm/go-to-dashboard-recent :team-id team-id))))

        on-brand-key-down
        (mf/use-fn
         (mf/deps on-brand-click)
         (fn [event]
           (when (kbd/enter? event)
             (on-brand-click event))))]

    [:header {:class (stl/css :page-header)
              :data-testid "dashboard-header"}
     [:div {:class (stl/css :page-header-left)}
      [:button {:type "button"
                :class (stl/css :brand)
                :aria-label "BacksterDESIGN"
                :title "BacksterDESIGN"
                :data-testid "header-brand"
                :on-click on-brand-click
                :on-key-down on-brand-key-down}
       [:img {:class (stl/css :brand-mark)
              :src "/images/assets/logo-small.svg"
              :alt ""
              :width 20
              :height 20}]
       [:span {:class (stl/css :brand-name)}
        [:span {:class (stl/css :brand-thin)} "Backster"]
        [:span {:class (stl/css :brand-bold)} "DESIGN"]]]

      (if (some? nav-section)
        [:> section-title-nav* {:title title
                                :title-id title-id
                                :section nav-section
                                :team-id team-id}]
        [:*
         [:span {:class (stl/css :sep) :aria-hidden true} "/"]
         [:div {:class (stl/css :page-title)
                :id (or title-id "dashboard-page-title")}
          [:h1 title]]])

      (for [[idx crumb] (map-indexed vector (or crumbs []))]
        [:> header-crumb* {:key (str "crumb-" idx)
                           :label (:label crumb)
                           :on-click (:on-click crumb)}])

      (cond
        (some? project-nav)
        [:> project-title-nav* {:project-id (:id project-nav)
                                :project-title (:title project-nav)
                                :team-id team-id}]

        (true? project-jump)
        [:> project-title-nav* {:team-id team-id
                                :visible false}]

        (some? leaf)
        [:> header-crumb* {:label leaf}])]

     [:div {:class (stl/css :page-header-right)}
      (when (some? team-id)
        [:> header-search* {:search-term search-term
                            :team-id team-id
                            :on-search-change on-search-change
                            :placeholder search-placeholder}])
      [:> header-account* {:profile profile
                           :team team}]]]))
