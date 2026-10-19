;; BacksterOS client accounts — portal contacts + project allowlist.
;; Copyright (c) BacksterOS — lives beside upstream Penpot dashboard UI.
;;
;; Staff manage which portal contacts can see which BacksterOS projects
;; (portalSettings.enabledProjectIds). Same allowlist powers client Penpot
;; file access (docs/19-penpot-integration.md).
;;
;; List layout mirrors BacksterOS ContactsOverviewView (alpha groups,
;; name + org, email/phone).

(ns app.main.ui.dashboard.client-accounts
  (:require-macros [app.main.style :as stl])
  (:require
   [app.common.uuid :as uuid]
   [app.main.data.common :as dcm]
   [app.main.data.dashboard :as dd]
   [app.main.repo :as rp]
   [app.main.store :as st]
   [app.main.ui.dashboard.backsteros-cache :as bos.cache]
   [app.main.ui.dashboard.keyboard-nav :as knav]
   [app.main.ui.dashboard.page-header :refer [page-header*]]
   [app.main.ui.ds.foundations.assets.icon :as i :refer [icon*]]
   [app.util.dom :as dom]
   [app.util.object :as obj]
   [beicon.v2.core :as rx]
   [cuerdas.core :as str]
   [rumext.v2 :as mf]))

;; Bump when avatar URL shape changes so session cache does not keep broken srcs.
(def ^:private cache-key :client-accounts-v3)

;; contact-id lives in the dashboard route query so browser back restores
;; the open side panel after opening a Penpot project from a row.

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

(defn- js-id-list->clj
  [value]
  (cond
    (nil? value) nil
    (vector? value) value
    (array? value) (vec (array-seq value))
    (sequential? value) (vec value)
    :else nil))

(defn- parse-portal-settings
  [row]
  (let [raw (obj/get row "portalSettings")]
    (if (nil? raw)
      {:enabled-project-ids nil
       :financials true
       :support true
       :can-add-tickets true
       :can-add-tasks true
       :languages []}
      {:enabled-project-ids (js-id-list->clj (obj/get raw "enabledProjectIds"))
       :financials (if (nil? (obj/get raw "financials")) true (boolean (obj/get raw "financials")))
       :support (if (nil? (obj/get raw "support")) true (boolean (obj/get raw "support")))
       :can-add-tickets (if (nil? (obj/get raw "canAddTickets")) true (boolean (obj/get raw "canAddTickets")))
       :can-add-tasks (if (nil? (obj/get raw "canAddTasks")) true (boolean (obj/get raw "canAddTasks")))
       :languages (js-id-list->clj (obj/get raw "languages"))})))

(defn- parse-phone-entries
  [raw]
  (->> (cond
         (nil? raw) []
         (array? raw) (array-seq raw)
         (sequential? raw) raw
         :else [])
       (keep (fn [entry]
               (let [n (obj/get entry "number")]
                 (when (and (string? n) (not (str/blank? n)))
                   {:label (obj/get entry "label")
                    :number n}))))
       vec))

(defn- parse-contact
  [row]
  (let [username (obj/get row "portalUsername")
        first-name (obj/get row "firstName")
        last-name (obj/get row "lastName")
        title (obj/get row "title")
        phone (obj/get row "phone")
        avatar-key (obj/get row "avatarStorageKey")]
    {:id                (obj/get row "id")
     :name              (or (obj/get row "name") "Untitled")
     :first-name        (when (and (string? first-name) (not (str/blank? first-name)))
                          first-name)
     :last-name         (when (and (string? last-name) (not (str/blank? last-name)))
                          last-name)
     :title             (when (and (string? title) (not (str/blank? title)))
                          title)
     :email             (obj/get row "email")
     :phone             (when (and (string? phone) (not (str/blank? phone))) phone)
     :phones            (parse-phone-entries (obj/get row "phones"))
     :avatar-storage-key (when (and (string? avatar-key) (not (str/blank? avatar-key)))
                           avatar-key)
     :organization-id   (obj/get row "organizationId")
     :portal-username   (when (and (string? username) (not (str/blank? username)))
                          username)
     :portal-settings   (parse-portal-settings row)}))

(defn- contact-initials
  [contact]
  (let [fn' (some-> (:first-name contact) str/trim not-empty)
        ln' (some-> (:last-name contact) str/trim not-empty)
        name' (or (some-> (:name contact) str/trim not-empty) "?")]
    (cond
      (and fn' ln') (str (.toUpperCase ^js (subs fn' 0 1))
                         (.toUpperCase ^js (subs ln' 0 1)))
      fn' (.toUpperCase ^js (subs fn' 0 1))
      :else (.toUpperCase ^js (subs name' 0 1)))))

(defn- match-contact-query?
  [contact needle]
  (or (str/blank? needle)
      (str/includes? (str/lower (or (:name contact) "")) needle)
      (str/includes? (str/lower (or (:first-name contact) "")) needle)
      (str/includes? (str/lower (or (:last-name contact) "")) needle)
      (str/includes? (str/lower (or (:email contact) "")) needle)
      (str/includes? (str/lower (or (:portal-username contact) "")) needle)
      (str/includes? (str/lower (or (:title contact) "")) needle)))

(defn- filter-contacts-by-query
  [contacts query]
  (let [needle (str/lower (str/trim (or query "")))]
    (if (str/blank? needle)
      contacts
      (filterv #(match-contact-query? % needle) contacts))))

(defn- editable-shortcut-target?
  [target]
  (when (instance? js/HTMLElement target)
    (or (#{"INPUT" "TEXTAREA" "SELECT"} (.-tagName target))
        (.-isContentEditable target)
        (some? (.closest ^js target "[contenteditable='true']"))
        (some? (.closest ^js target ".cm-editor"))
        (some? (.closest ^js target "[role='textbox']")))))

(defn- visible-contact-ids
  "Flat id list for j/k, skipping collapsed letter groups."
  [grouped collapsed]
  (into []
        (mapcat (fn [[letter rows]]
                  (when-not (contains? collapsed letter)
                    (map :id rows))))
        grouped))

(defn- focus-nav-item!
  [zone id]
  (when (and zone id)
    (when-let [node (.querySelector
                     js/document
                     (str "[data-keyboard-nav-zone=\"" (name zone) "\"]"
                          " [data-keyboard-nav-item=\"" id "\"]"
                          " [role='button'],"
                          "[data-keyboard-nav-zone=\"" (name zone) "\"]"
                          " [data-keyboard-nav-item=\"" id "\"][role='button']"))]
      (when (fn? (.-focus node))
        (.focus node #js {:preventScroll true}))
      (when (fn? (.-scrollIntoView node))
        (.scrollIntoView node #js {:block "nearest" :inline "nearest"})))))

(defn- parse-penpot-id
  [value]
  (cond
    (uuid? value) value
    (and (string? value) (not (str/blank? value)))
    (try (uuid/parse value) (catch :default _ nil))
    :else nil))

(defn- parse-project
  [row]
  {:id                (obj/get row "id")
   :key               (obj/get row "key")
   :name              (or (obj/get row "name") (obj/get row "key") "Untitled")
   :organization-id   (obj/get row "organizationId")
   :penpot-project-id (obj/get row "penpotProjectId")})

(defn- patch-penpot-project-id!
  [base-url api-key backsteros-id penpot-id]
  (api-fetch base-url api-key "PATCH"
             (str "/api/v1/projects/" backsteros-id)
             #js {:penpotProjectId (str penpot-id)}))

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
(defn- parse-organization
  [row]
  {:id   (obj/get row "id")
   :name (or (obj/get row "name") "Untitled")})

(defn- fetch-portal-contacts!
  [base-url api-key]
  (-> (api-fetch base-url api-key "GET" "/api/v1/contacts?limit=200" nil)
      (.then (fn [data]
               (->> (or (obj/get data "contacts")
                        (obj/get data "items")
                        #js [])
                    (array-seq)
                    (map parse-contact)
                    (filter :portal-username)
                    vec)))))

(defn- fetch-projects!
  [base-url api-key]
  (-> (api-fetch base-url api-key "GET" "/api/v1/projects?paginated=true&limit=200" nil)
      (.then (fn [data]
               (->> (or (obj/get data "items")
                        (obj/get data "projects")
                        #js [])
                    (array-seq)
                    (map parse-project)
                    (sort-by (juxt :name :key))
                    vec)))))

(defn- fetch-organizations!
  [base-url api-key]
  (-> (api-fetch base-url api-key "GET" "/api/v1/organizations?limit=200" nil)
      (.then (fn [data]
               (->> (or (obj/get data "organizations")
                        (obj/get data "items")
                        #js [])
                    (array-seq)
                    (map parse-organization)
                    (map (juxt :id :name))
                    (into {}))))))

(defn- resolve-core-base
  "Absolute URL for the configured core base (supports relative `/backsteros-core`)."
  [base-url]
  (try
    (js/URL. (or base-url "") (.-href js/location))
    (catch :default _
      nil)))

(defn- rewrite-url-host
  "Point a signed avatar URL at the configured core host / same-origin proxy.
  Absolute http://…:8788 URLs from local-core are mixed-content under HTTPS Penpot;
  rebase onto baseUrl (e.g. https://localhost:3449/backsteros-core/…)."
  [base-url signed-url]
  (try
    (let [base   (resolve-core-base base-url)
          signed (js/URL. signed-url)]
      (if (nil? base)
        signed-url
        (let [base-path (str/rtrim (or (.-pathname base) "") "/")
              signed-path (or (.-pathname signed) "")]
          (set! (.-protocol signed) (.-protocol base))
          (set! (.-host signed) (.-host base))
          (when (and (not (str/blank? base-path))
                     (not (str/starts-with? signed-path (str base-path "/"))))
            (set! (.-pathname signed) (str base-path signed-path)))
          (str signed))))
    (catch :default _
      signed-url)))

(defn- fetch-avatar-urls!
  [base-url api-key contacts]
  (let [targets (filterv :avatar-storage-key contacts)]
    (if (empty? targets)
      (js/Promise.resolve {})
      (-> (js/Promise.all
           (clj->js
            (mapv (fn [contact]
                    (-> (api-fetch base-url api-key "GET"
                                   (str "/api/v1/avatars/contact/" (:id contact) "/signed-url")
                                   nil)
                        (.then (fn [data]
                                 [(:id contact)
                                  (rewrite-url-host base-url (obj/get data "url"))]))
                        (.catch (fn [_] nil))))
                  targets)))
          (.then (fn [pairs]
                   (->> (array-seq pairs)
                        (keep identity)
                        (into {}))))))))

(defn- projects-for-contact
  [projects contact]
  (let [oid (:organization-id contact)]
    (if (or (nil? oid) (str/blank? (str oid)))
      []
      (filterv #(= (:organization-id %) oid) projects))))

(defn- enabled-set
  "nil enabled-project-ids ⇒ all org projects allowed."
  [settings project-ids]
  (let [ids (:enabled-project-ids settings)]
    (if (nil? ids)
      (set project-ids)
      (set ids))))

(defn- primary-email
  [contact]
  (let [email (:email contact)]
    (when (and (string? email) (not (str/blank? email)))
      email)))

(defn- primary-phone
  [contact]
  (or (:phone contact)
      (some-> (:phones contact) first :number)))

(defn- section-label
  [contact]
  (or (:first-name contact)
      (some-> (:name contact) str/trim)
      ""))

(defn- order-label
  [contact]
  (or (:last-name contact)
      (some-> (:name contact) str/trim)
      ""))

(defn- alpha-letter
  [contact]
  (let [label (section-label contact)
        ch    (when (seq label)
                (.toUpperCase ^js (subs label 0 1)))]
    (if (and ch (re-matches #"[A-Z]" ch))
      ch
      "#")))

(defn- group-contacts-by-letter
  "A–Z sections like BacksterOS ContactsOverviewView."
  [contacts]
  (->> contacts
       (group-by alpha-letter)
       (map (fn [[letter rows]]
              [letter
               (vec (sort-by (fn [c]
                               [(str/lower (order-label c))
                                (str/lower (section-label c))])
                             rows))]))
       (sort-by (fn [[letter _]]
                  (if (= letter "#") "ZZZ" letter)))
       vec))

(defn- portal-settings->js
  [settings]
  (let [ids (:enabled-project-ids settings)]
    #js {:enabledProjectIds (if (nil? ids) nil (clj->js ids))
         :financials (boolean (get settings :financials true))
         :support (boolean (get settings :support true))
         :canAddTickets (boolean (get settings :can-add-tickets true))
         :canAddTasks (boolean (get settings :can-add-tasks true))
         :languages (clj->js (or (:languages settings) []))}))

(defn- patch-portal-settings!
  [base-url api-key contact-id settings]
  (api-fetch base-url api-key "PATCH"
             (str "/api/v1/contacts/" contact-id)
             #js {:portalSettings (portal-settings->js settings)}))

(defn- next-enabled-ids
  [current-ids all-ids project-id enabled?]
  (let [base (if (nil? current-ids) all-ids (vec current-ids))
        next (if enabled?
               (vec (distinct (conj base project-id)))
               (filterv #(not= % project-id) base))]
    (cond
      (empty? next) []
      (and (seq all-ids)
           (= (set next) (set all-ids)))
      nil
      :else next)))

(mf/defc email-icon*
  {::mf/private true}
  []
  [:svg {:width 12 :height 12 :viewBox "0 0 16 16" :fill "none"
         :xmlns "http://www.w3.org/2000/svg" :aria-hidden true}
   [:path {:d "M14.9341 1.65742L10.0527 14.5271C9.85398 15.0514 9.36691 15.1558 8.97104 14.7594C8.97104 14.7594 5.89577 11.6842 5.61555 11.4039C5.33533 11.1237 5.43264 10.573 5.83208 10.1796L12.6164 3.50024C13.0159 3.10692 12.9787 3.06412 12.5334 3.40497L4.89564 9.25594C4.45086 9.59678 3.76254 9.55144 3.36615 9.15506L1.24057 7.02947C0.844185 6.63309 0.94863 6.14653 1.47289 5.94732L14.3426 1.0659C14.8668 0.867203 15.1328 1.13316 14.9341 1.65742ZM3.93729 10.4466C3.7391 10.2484 3.57708 10.3157 3.57708 10.5959V12.9324C3.57708 13.2126 3.77375 13.3237 4.01371 13.1795L5.237 12.4453C5.47748 12.3012 5.51161 12.0209 5.31342 11.8227L3.93729 10.4466Z"
           :fill "currentColor"}]])

(mf/defc phone-icon*
  {::mf/private true}
  []
  [:svg {:xmlns "http://www.w3.org/2000/svg" :viewBox "0 0 24 24"
         :fill "currentColor" :width 12 :height 12 :aria-hidden true}
   [:path {:fill-rule "evenodd"
           :clip-rule "evenodd"
           :d "M1.5 4.5a3 3 0 0 1 3-3h1.372c.86 0 1.61.586 1.819 1.42l1.105 4.423a1.875 1.875 0 0 1-.694 1.955l-1.293.97c-.135.101-.164.249-.126.352a11.285 11.285 0 0 0 6.697 6.697c.103.038.25.009.352-.126l.97-1.293a1.875 1.875 0 0 1 1.955-.694l4.423 1.105c.834.209 1.42.959 1.42 1.82V19.5a3 3 0 0 1-3 3h-2.25C8.552 22.5 1.5 15.448 1.5 6.75V4.5Z"}]])

(mf/defc switch-toggle*
  {::mf/private true}
  [{:keys [checked disabled aria-label on-change]}]
  [:button {:type "button"
            :role "switch"
            :aria-checked (boolean checked)
            :aria-label aria-label
            :class (stl/css-case :switch-toggle true :switch-on checked)
            :disabled disabled
            :on-click (fn [event]
                        (dom/stop-propagation event)
                        (when-not disabled
                          (on-change (not checked))))}
   [:span {:class (stl/css :switch-track) :aria-hidden true}
    [:span {:class (stl/css :switch-thumb)}]]])

(mf/defc project-toggle-row*
  {::mf/private true}
  [{:keys [project checked disabled highlighted? on-change on-open]}]
  (let [name (:name project)
        key  (some-> (:key project) str/trim not-empty)
        open! (fn []
                (when (and (some? on-open) (not disabled))
                  (on-open project)))
        row-ref (mf/use-ref nil)]

    (mf/with-effect [highlighted?]
      (when highlighted?
        (when-let [node (mf/ref-val row-ref)]
          (when (fn? (.-scrollIntoView node))
            (.scrollIntoView node #js {:block "nearest" :inline "nearest"})))))

    ;; Click opens Penpot; Enter/Space toggle is handled by the page
    ;; keyboard zone (same split as tasks ↔ files on a project page).
    [:div {:ref row-ref
           :class (stl/css-case :toggle-row true
                                :toggle-row-busy disabled
                                :row-keyboard-highlight highlighted?)
           :role "button"
           :tab-index 0
           :data-keyboard-nav-item (str (:id project))
           :title (if (parse-penpot-id (:penpot-project-id project))
                    "Open Penpot project"
                    "Create Penpot project")
           :on-click open!}
     [:span {:class (stl/css :toggle-copy)}
      [:span {:class (stl/css :project-line)}
       (when key
         [:span {:class (stl/css :project-key) :title "Project ID"} key])
       [:span {:class (stl/css :project-name)} name]]]
     [:> switch-toggle*
      {:checked checked
       :disabled disabled
       :aria-label (str "Allow portal access: " name)
       :on-change on-change}]]))
(mf/defc contact-row*
  {::mf/private true}
  [{:keys [contact org-name avatar-src selected? highlighted? on-select]}]
  (let [email   (primary-email contact)
        phone   (primary-phone contact)
        row-ref (mf/use-ref nil)]

    (mf/with-effect [highlighted?]
      (when highlighted?
        (when-let [node (mf/ref-val row-ref)]
          (when (fn? (.-scrollIntoView node))
            (.scrollIntoView node #js {:block "nearest" :inline "nearest"})))))

    [:li {:ref row-ref
          :class (stl/css-case :row true
                               :row-keyboard-highlight highlighted?)
          :data-keyboard-nav-item (str (:id contact))}
     [:div {:role "button"
            :tab-index 0
            :class (stl/css-case :row-button true
                                 :row-selected selected?)
            :aria-current (when selected? "true")
            :on-click #(on-select contact)}
      (when avatar-src
        [:span {:class (stl/css :avatar) :aria-hidden true}
         [:img {:src avatar-src
                :alt ""
                :width 20
                :height 20
                :class (stl/css :avatar-img)}]])
      [:div {:class (stl/css :row-body)}
       [:div {:class (stl/css :title-row)}
        [:span {:class (stl/css :row-name)} (:name contact)]
        (when (and (string? org-name) (not (str/blank? org-name)))
          [:span {:class (stl/css :row-meta)} org-name])]
       (when (or email phone)
         [:div {:class (stl/css :contact-row)}
          (when email
            [:span {:class (stl/css :contact-item) :title email}
             [:> email-icon* {}]
             [:span email]])
          (when phone
            [:span {:class (stl/css :contact-item) :title phone}
             [:> phone-icon* {}]
             [:span phone]])])]]]))

(mf/defc letter-group*
  {::mf/private true}
  [{:keys [letter contacts org-names avatar-urls selected-id highlighted-id
           collapsed? on-toggle on-select]}]
  [:li {:class (stl/css :letter-group)}
   [:button {:type "button"
             :class (stl/css :letter-header)
             :aria-expanded (not collapsed?)
             :on-click #(on-toggle letter)}
    [:span {:class (stl/css :letter-chevron) :aria-hidden true}
     [:svg {:viewBox "0 0 24 24" :width 14 :height 14}
      [:path {:d "M9 6l6 6-6 6"
              :fill "none"
              :stroke "currentColor"
              :stroke-width 2
              :stroke-linecap "round"
              :stroke-linejoin "round"}]]]
    [:span {:class (stl/css :letter-label)} letter]
    [:span {:class (stl/css :letter-rule) :aria-hidden true}]]
   (when-not collapsed?
     [:ul {:class (stl/css :letter-items) :role "list"}
      (for [contact contacts]
        [:> contact-row* {:key (:id contact)
                          :contact contact
                          :org-name (get org-names (:organization-id contact))
                          :avatar-src (get avatar-urls (:id contact))
                          :selected? (= (str selected-id) (str (:id contact)))
                          :highlighted? (= (str highlighted-id) (str (:id contact)))
                          :on-select on-select}])])])

(mf/defc reload-toolbar*
  {::mf/private true}
  [{:keys [loading? on-reload]}]
  [:div {:class (stl/css :toolbar)}
   [:button {:type "button"
             :class (stl/css :reload)
             :on-click on-reload
             :disabled loading?}
    (if loading? "Loading…" "Reload")]])

(mf/defc side-panel*
  {::mf/private true}
  [{:keys [contact org-name avatar-src projects busy? error highlighted-id
           zone-active? on-close on-toggle on-open]}]
  (let [org-projects (projects-for-contact projects contact)
        all-ids (mapv :id org-projects)
        enabled (enabled-set (:portal-settings contact) all-ids)
        email (primary-email contact)
        phone (primary-phone contact)
        title (some-> (:title contact) str/trim not-empty)
        display-name (or (some-> (:name contact) str/trim not-empty) "Untitled")
        org-label (when (and (string? org-name) (not (str/blank? org-name)))
                    org-name)]
    [:aside {:class (stl/css-case :side-panel true
                                  :side-panel-zone-active zone-active?)
             :aria-label "Client account detail"
             :data-keyboard-nav-zone "panel"}
     [:button {:type "button"
               :class (stl/css :panel-close)
               :aria-label "Close"
               :on-click on-close}
      [:> icon* {:icon-id i/close :size "s"}]]
     [:div {:class (stl/css :panel-body)}
      [:div {:class (stl/css :panel-hero)}
       [:span {:class (stl/css :panel-avatar) :aria-hidden true}
        (if avatar-src
          [:img {:src avatar-src
                 :alt ""
                 :width 72
                 :height 72
                 :class (stl/css :panel-avatar-img)}]
          [:span {:class (stl/css :panel-avatar-fallback)}
           (contact-initials contact)])]
       [:h2 {:class (stl/css :panel-name)} display-name]
       (when title
         [:p {:class (stl/css :panel-title)} title])
       (when org-label
         [:p {:class (stl/css :panel-org)} org-label])
       (when (or email phone)
         [:div {:class (stl/css :panel-contact-row)}
          (when email
            [:a {:class (stl/css :panel-contact-item)
                 :href (str "mailto:" email)
                 :title email}
             [:> email-icon* {}]
             [:span email]])
          (when phone
            [:a {:class (stl/css :panel-contact-item)
                 :href (str "tel:" (str/replace phone #"\s+" ""))
                 :title phone}
             [:> phone-icon* {}]
             [:span phone]])])]
      [:div {:class (stl/css :panel-section)}
       [:div {:class (stl/css :section-header)}
        [:span {:class (stl/css :section-label)} "Projects"]
        [:span {:class (stl/css :section-rule) :aria-hidden true}]]
       [:p {:class (stl/css :panel-hint)}
        "Projects linked to this contact's organization."]
       (when error
         [:p {:class (stl/css :panel-error) :role "alert"} error])
       (if (empty? org-projects)
         [:p {:class (stl/css :panel-hint)} "No organization projects yet."]
         [:ul {:class (stl/css :project-list) :role "list"}
          (for [project org-projects]
            [:li {:key (:id project)
                  :class (stl/css :project-item)}
             [:> project-toggle-row*
              {:project project
               :checked (contains? enabled (:id project))
               :disabled busy?
               :highlighted? (and zone-active?
                                  (= (str highlighted-id) (str (:id project))))
               :on-open on-open
               :on-change (fn [checked]
                            (on-toggle contact project checked))}]])])]]]))

(mf/defc client-accounts-section*
  {::mf/wrap [mf/memo]}
  [{:keys [team-id contact-id query]}]
  (let [cfg (core-config)
        state* (mf/use-state {:status :idle
                              :contacts []
                              :projects []
                              :org-names {}
                              :avatar-urls {}
                              :busy? false
                              :error nil
                              :action-error nil})
        collapsed* (mf/use-state #{})
        highlighted* (mf/use-state nil)
        panel-highlighted* (mf/use-state nil)
        ;; Live copies for key handlers. use-state deref is frozen inside a
        ;; stable callback, so j/k would otherwise always see nil / :list.
        list-id-ref (mf/use-ref nil)
        panel-id-ref (mf/use-ref nil)
        zone-ref (mf/use-ref :list)
        ;; :list = client rows · :panel = org projects in the side panel
        ;; (Tab switches when the panel is open — same idea as tasks ↔ files).
        zone* (mf/use-state :list)
        {:keys [status contacts projects org-names avatar-urls
                busy? error action-error]} @state*
        collapsed @collapsed*
        highlighted-id @highlighted*
        panel-highlighted-id @panel-highlighted*
        zone @zone*
        query (or query "")
        visible-contacts
        (mf/with-memo [contacts query]
          (filter-contacts-by-query contacts query))
        ;; Route query is source of truth (browser back restores the panel).
        selected-id (when (and (string? contact-id) (not (str/blank? contact-id)))
                      contact-id)
        selected (some #(when (= (str (:id %)) (str selected-id)) %) contacts)
        grouped (mf/with-memo [visible-contacts]
                  (group-contacts-by-letter visible-contacts))

        contact-ids
        (mf/with-memo [grouped collapsed]
          (mapv str (visible-contact-ids grouped collapsed)))

        contact-by-id
        (mf/with-memo [visible-contacts]
          (into {} (map (juxt (comp str :id) identity) visible-contacts)))

        panel-projects
        (mf/with-memo [selected projects]
          (if selected
            (projects-for-contact projects selected)
            []))

        panel-project-ids
        (mf/with-memo [panel-projects]
          (mapv (comp str :id) panel-projects))

        panel-project-by-id
        (mf/with-memo [panel-projects]
          (into {} (map (juxt (comp str :id) identity) panel-projects)))

        apply-bundle!
        (mf/use-fn
         (fn [bundle]
           (swap! state* assoc
                  :status :ok
                  :contacts (:contacts bundle)
                  :projects (:projects bundle)
                  :org-names (:org-names bundle)
                  :avatar-urls (or (:avatar-urls bundle) {})
                  :error nil
                  :action-error nil)))

        fetch-bundle!
        (mf/use-fn
         (mf/deps cfg)
         (fn []
           (-> (js/Promise.all
                #js [(fetch-portal-contacts! (:base-url cfg) (:api-key cfg))
                     (fetch-projects! (:base-url cfg) (:api-key cfg))
                     (fetch-organizations! (:base-url cfg) (:api-key cfg))])
               (.then (fn [results]
                        (let [contacts' (aget results 0)
                              projects' (aget results 1)
                              orgs'     (aget results 2)]
                          (-> (fetch-avatar-urls! (:base-url cfg) (:api-key cfg) contacts')
                              (.then (fn [urls]
                                       {:contacts contacts'
                                        :projects projects'
                                        :org-names orgs'
                                        :avatar-urls urls})))))))))

        reload!
        (mf/use-fn
         (mf/deps cfg apply-bundle! fetch-bundle!)
         (fn [& args]
           (let [force? (boolean (first args))]
             (if-not cfg
               (reset! state* {:status :error :contacts [] :projects []
                               :org-names {} :avatar-urls {}
                               :busy? false :action-error nil
                               :error "Set window.backsterosCore in js/config.js (baseUrl + apiKey)."})
               (let [cached (bos.cache/cached-data cache-key)]
                 (when (and (not force?) cached)
                   (apply-bundle! cached))
                 (when (or force? (nil? cached)
                           (not (bos.cache/fresh? (bos.cache/entry cache-key))))
                   (when (nil? cached)
                     (swap! state* assoc :status :loading :error nil :action-error nil))
                   (-> (bos.cache/load! cache-key
                                        {:force? force?
                                         :fetch! fetch-bundle!})
                       (.then (fn [bundle]
                                (apply-bundle! bundle)))
                       (.catch (fn [err]
                                 (when (nil? (bos.cache/cached-data cache-key))
                                   (swap! state* assoc
                                          :status :error
                                          :contacts []
                                          :projects []
                                          :org-names {}
                                          :avatar-urls {}
                                          :error (or (.-message err) (str err)))))))))))))

        select!
        (mf/use-fn
         (mf/deps team-id)
         (fn [contact]
           (let [cid (str (:id contact))]
             (swap! state* assoc :action-error nil)
             (knav/remember! list-id-ref cid)
             (knav/remember! zone-ref :panel)
             (knav/remember! panel-id-ref nil)
             (reset! highlighted* cid)
             (reset! zone* :panel)
             (reset! panel-highlighted* nil)
             (st/emit! (dcm/go-to-dashboard-client-accounts
                        :team-id team-id
                        :contact-id cid)))))

        close-panel!
        (mf/use-fn
         (mf/deps team-id)
         (fn []
           (swap! state* assoc :action-error nil)
           (knav/remember! panel-id-ref nil)
           (knav/remember! zone-ref :list)
           (reset! panel-highlighted* nil)
           (reset! zone* :list)
           (st/emit! (dcm/go-to-dashboard-client-accounts :team-id team-id))))

        toggle-letter!
        (mf/use-fn
         (fn [letter]
           (swap! collapsed*
                  (fn [s]
                    (if (contains? s letter)
                      (disj s letter)
                      (conj s letter))))))

        move-list-highlight!
        (mf/use-fn
         (mf/deps contact-ids)
         (fn [direction]
           (when-let [next (knav/step-ref! list-id-ref contact-ids direction)]
             (reset! highlighted* next)
             (knav/remember! zone-ref :list)
             (reset! zone* :list))))

        move-panel-highlight!
        (mf/use-fn
         (mf/deps panel-project-ids)
         (fn [direction]
           (when-let [next (knav/step-ref! panel-id-ref panel-project-ids direction)]
             (reset! panel-highlighted* next)
             (knav/remember! zone-ref :panel)
             (reset! zone* :panel))))

        switch-zone!
        (mf/use-fn
         (mf/deps selected-id contact-ids panel-project-ids)
         (fn [direction]
           (when (some? selected-id)
             (let [current (mf/ref-val zone-ref)
                   next (if (= direction :forward)
                          (if (= current :list) :panel :list)
                          (if (= current :panel) :list :panel))]
               (knav/remember! zone-ref next)
               (reset! zone* next)
               (cond
                 (and (= next :list) (nil? (mf/ref-val list-id-ref)) (seq contact-ids))
                 (let [id (str (or selected-id (first contact-ids)))]
                   (knav/remember! list-id-ref id)
                   (reset! highlighted* id))

                 (and (= next :panel) (nil? (mf/ref-val panel-id-ref)) (seq panel-project-ids))
                 (let [id (str (first panel-project-ids))]
                   (knav/remember! panel-id-ref id)
                   (reset! panel-highlighted* id)))))))

        toggle-project!
        (mf/use-fn
         (mf/deps cfg projects reload!)
         (fn [contact project enabled?]
           (when cfg
             (let [org-projects (projects-for-contact projects contact)
                   all-ids (mapv :id org-projects)
                   settings (:portal-settings contact)
                   next-ids (next-enabled-ids (:enabled-project-ids settings)
                                              all-ids
                                              (:id project)
                                              enabled?)
                   next-settings (assoc settings :enabled-project-ids next-ids)]
               (swap! state* assoc :busy? true :action-error nil)
               (swap! state* update :contacts
                      (fn [rows]
                        (mapv (fn [row]
                                (if (= (:id row) (:id contact))
                                  (assoc row :portal-settings next-settings)
                                  row))
                              rows)))
               (-> (patch-portal-settings! (:base-url cfg) (:api-key cfg)
                                           (:id contact) next-settings)
                   (.then (fn [_]
                            (swap! state* assoc :busy? false)
                            (bos.cache/update-data!
                             cache-key
                             (fn [bundle]
                               (assoc bundle :contacts (:contacts @state*))))))
                   (.catch (fn [err]
                             (swap! state* assoc
                                    :busy? false
                                    :action-error (or (.-message err) (str err)))
                             (reload! true))))))))

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
               (swap! state* assoc :busy? true :action-error nil)
               (if existing
                 (do
                   (swap! state* assoc :busy? false)
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
                                             (assoc :busy? false)
                                             (update :projects
                                                     (fn [rows]
                                                       (mapv (fn [row]
                                                               (if (= (:id row) (:id project))
                                                                 (assoc row :penpot-project-id penpot-id-str)
                                                                 row))
                                                             rows))))))
                                (bos.cache/update-data!
                                 cache-key
                                 (fn [bundle]
                                   (update bundle :projects
                                           (fn [rows]
                                             (mapv (fn [row]
                                                     (if (= (:id row) (:id project))
                                                       (assoc row :penpot-project-id penpot-id-str)
                                                       row))
                                                   (or rows []))))))
                                ;; Projects tab keeps its own enriched list.
                                (bos.cache/invalidate! :backsteros-projects))
                   :on-error (fn [msg]
                               (swap! state* assoc :busy? false :action-error msg))}))))))]

    ;; Key handlers read these refs. use-state deref stays on the render
    ;; that created a stable callback, so j/k would otherwise stick.
    (knav/remember! list-id-ref highlighted-id)
    (knav/remember! panel-id-ref panel-highlighted-id)
    (knav/remember! zone-ref zone)

    (mf/with-effect []
      (reload! false)
      js/undefined)

    ;; Panel closed → always own the list zone.
    (mf/with-effect [selected-id]
      (when (nil? selected-id)
        (reset! zone* :list)
        (reset! panel-highlighted* nil)))

    ;; Seed a project highlight when Enter opens the panel.
    (mf/with-effect [selected-id panel-project-ids zone]
      (when (and (= zone :panel)
                 (some? selected-id)
                 (seq panel-project-ids)
                 (nil? (mf/ref-val panel-id-ref)))
        (let [id (str (first panel-project-ids))]
          (knav/remember! panel-id-ref id)
          (reset! panel-highlighted* id))))

    ;; Drop stale highlights when filtered / collapsed lists change.
    (mf/with-effect [contact-ids highlighted-id]
      (when (and highlighted-id
                 (not (some #(= % (str highlighted-id)) contact-ids)))
        (knav/remember! list-id-ref nil)
        (reset! highlighted* nil)))

    (mf/with-effect [panel-project-ids panel-highlighted-id]
      (when (and panel-highlighted-id
                 (not (some #(= % (str panel-highlighted-id)) panel-project-ids)))
        (knav/remember! panel-id-ref nil)
        (reset! panel-highlighted* nil)))

    ;; Focus the active zone's highlighted row.
    (mf/with-effect [zone highlighted-id panel-highlighted-id]
      (case zone
        :panel (focus-nav-item! :panel panel-highlighted-id)
        (focus-nav-item! :list highlighted-id)))

    ;; Tab zones · j/k active list · Enter open/toggle · Escape close.
    (mf/with-effect [contact-ids contact-by-id panel-project-ids panel-project-by-id
                     panel-projects move-list-highlight! move-panel-highlight! switch-zone!
                     select! close-panel! toggle-project! selected selected-id busy?]
      (let [on-key
            (fn [event]
              (when (and (not (.-metaKey event))
                         (not (.-ctrlKey event))
                         (not (.-altKey event)))
                (let [key      (.-key event)
                      code     (.-code event)
                      target   (.-target event)
                      active   (.-activeElement js/document)
                      editing? (or (editable-shortcut-target? target)
                                   (editable-shortcut-target? active))
                      stop!    (fn []
                                 (.preventDefault event)
                                 (.stopPropagation event)
                                 (.stopImmediatePropagation event))]
                  (cond
                    (and (= key "Escape") (not editing?))
                    (cond
                      (some? selected-id)
                      (do (stop!) (close-panel!))

                      (some? @highlighted*)
                      (do
                        (stop!)
                        (reset! highlighted* nil)
                        (when (and active (fn? (.-blur active)))
                          (.blur active))))

                    editing?
                    nil

                    ;; Tab / Shift+Tab between client list and side panel.
                    (and (= key "Tab") (some? selected-id))
                    (do
                      (stop!)
                      (switch-zone! (if (.-shiftKey event) :back :forward)))

                    (or (= key "j") (= key "J") (= code "KeyJ")
                        (= key "ArrowDown"))
                    (when-not (.-shiftKey event)
                      (stop!)
                      (if (= (mf/ref-val zone-ref) :panel)
                        (move-panel-highlight! :down)
                        (move-list-highlight! :down)))

                    (or (= key "k") (= key "K") (= code "KeyK")
                        (= key "ArrowUp"))
                    (when-not (.-shiftKey event)
                      (stop!)
                      (if (= (mf/ref-val zone-ref) :panel)
                        (move-panel-highlight! :up)
                        (move-list-highlight! :up)))

                    (or (= key "Enter") (= code "Enter") (= code "NumpadEnter")
                        (= key " "))
                    (if (= (mf/ref-val zone-ref) :panel)
                      (when-let [pid (or (mf/ref-val panel-id-ref)
                                         (some-> active
                                                 (.closest "[data-keyboard-nav-item]")
                                                 (.getAttribute "data-keyboard-nav-item")))]
                        (when-let [project (get panel-project-by-id (str pid))]
                          (when (and selected (not busy?))
                            (let [all-ids (mapv :id panel-projects)
                                  enabled (enabled-set (:portal-settings selected) all-ids)
                                  on?     (contains? enabled (:id project))]
                              (stop!)
                              (toggle-project! selected project (not on?))))))

                      (when-let [cid (or (mf/ref-val list-id-ref)
                                         (some-> active
                                                 (.closest "[data-keyboard-nav-item]")
                                                 (.getAttribute "data-keyboard-nav-item")))]
                        (when-let [contact (get contact-by-id (str cid))]
                          (stop!)
                          (select! contact))))))))]
        (.addEventListener js/window "keydown" on-key true)
        (fn []
          (.removeEventListener js/window "keydown" on-key true))))

    [:div {:class (stl/css-case :client-accounts true
                                 :client-accounts-with-panel (some? selected))
           :data-testid "client-accounts"
           :data-keyboard-nav-active-zone (name zone)}
     (cond
       (nil? cfg)
       [:*
        [:> reload-toolbar* {:loading? (= status :loading) :on-reload #(reload! true)}]
        [:p {:class (stl/css :message)}
         "Configure "
         [:code "window.backsterosCore"]
         " in "
         [:code "js/config.js"]
         "."]]

       (= status :loading)
       [:*
        [:> reload-toolbar* {:loading? true :on-reload #(reload! true)}]
        [:p {:class (stl/css :message)} "Loading client accounts…"]]

       (= status :error)
       [:*
        [:> reload-toolbar* {:loading? false :on-reload #(reload! true)}]
        [:p {:class (stl/css :message :error)} (str "Could not load: " error)]]

       (empty? contacts)
       [:*
        [:> reload-toolbar* {:loading? (= status :loading) :on-reload #(reload! true)}]
        [:p {:class (stl/css :message)}
         "No portal client accounts yet. Create one in BacksterOS (contact → Portal)."]]

       (empty? visible-contacts)
       [:*
        [:> reload-toolbar* {:loading? (= status :loading) :on-reload #(reload! true)}]
        [:p {:class (stl/css :message)} "No clients match your search."]]

       :else
       [:div {:class (stl/css-case :layout true :layout-with-panel (some? selected))}
        [:div {:class (stl/css-case :list-pane true
                                    :list-pane-zone-active (= zone :list))
               :data-keyboard-nav-zone "list"}
         [:> reload-toolbar* {:loading? (= status :loading) :on-reload #(reload! true)}]
         [:ul {:class (stl/css :list) :role "list"}
          (for [[letter rows] grouped]
            [:> letter-group* {:key letter
                               :letter letter
                               :contacts rows
                               :org-names org-names
                               :avatar-urls avatar-urls
                               :selected-id selected-id
                               :highlighted-id (when (= zone :list) highlighted-id)
                               :collapsed? (contains? collapsed letter)
                               :on-toggle toggle-letter!
                               :on-select select!}])]]
        (when selected
          [:> side-panel* {:contact selected
                           :org-name (get org-names (:organization-id selected))
                           :avatar-src (get avatar-urls (:id selected))
                           :projects projects
                           :busy? busy?
                           :error action-error
                           :highlighted-id panel-highlighted-id
                           :zone-active? (= zone :panel)
                           :on-close close-panel!
                           :on-toggle toggle-project!
                           :on-open open-project!}])])]))

(mf/defc client-accounts-section-page*
  "Clients tab — portal contacts + project access side panel."
  [{:keys [team contact-id]}]
  (let [team-id (get team :id)
        query*  (mf/use-state "")
        query   (deref query*)

        on-search-change
        (mf/use-fn
         (fn [value]
           (reset! query* (or value ""))))]
    (mf/with-effect []
      (dom/set-html-title "Clients — BacksterDESIGN"))
    [:*
     [:> page-header* {:title "Clients"
                       :title-id "dashboard-clients-title"
                       :nav-section :dashboard-client-accounts
                       :search-term query
                       :search-placeholder "Search clients…"
                       :on-search-change on-search-change
                       :team-id team-id}]
     [:section {:class (stl/css :dashboard-container)
                :data-testid "client-accounts-page"}
      [:> client-accounts-section* {:team-id team-id
                                    :contact-id contact-id
                                    :query query}]]]))