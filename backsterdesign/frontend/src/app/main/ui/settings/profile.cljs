;; This Source Code Form is subject to the terms of the Mozilla Public
;; License, v. 2.0. If a copy of the MPL was not distributed with this
;; file, You can obtain one at http://mozilla.org/MPL/2.0/.
;;
;; Copyright (c) KALEIDOS INC Sucursal en España SL

(ns app.main.ui.settings.profile
  (:require-macros [app.main.style :as stl])
  (:require
   [app.common.schema :as sm]
   [app.common.uuid :as uuid]
   [app.config :as cf]
   [app.main.data.modal :as modal]
   [app.main.data.notifications :as ntf]
   [app.main.data.profile :as du]
   [app.main.refs :as refs]
   [app.main.store :as st]
   [app.main.ui.components.file-uploader :refer [file-uploader]]
   [app.main.ui.components.forms :as fm]
   [app.main.ui.ds.foundations.assets.icon :as i :refer [icon*]]
   [app.util.dom :as dom]
   [app.util.i18n :as i18n :refer [tr]]
   [app.util.object :as obj]
   [cuerdas.core :as str]
   [rumext.v2 :as mf]))

(def ^:private schema:profile-form
  [:map {:title "ProfileForm"}
   [:fullname [::sm/text {:max 250}]]
   [:email ::sm/email]])

(defn- on-submit
  [form _event]
  (let [data       (:clean-data @form)
        on-success (fn [_]
                     (swap! form assoc :touched {})
                     (st/emit! (ntf/success (tr "notifications.profile-saved"))))]
    (st/emit! (du/update-profile data)
              (du/persist-profile {:on-success on-success}))))

;; --- Profile Form

(mf/defc profile-form*
  {::mf/private true}
  []
  (let [profile (mf/deref refs/profile)
        form    (fm/use-form :schema schema:profile-form
                             :initial profile)

        on-show-change-email
        (mf/use-fn
         #(modal/show! :change-email {}))

        on-show-delete-account
        (mf/use-fn
         #(modal/show! :delete-account {}))]

    [:& fm/form {:on-submit on-submit
                 :form form
                 :class (stl/css :profile-form)}
     [:div {:class (stl/css :fields-row)}
      [:& fm/input
       {:type "text"
        :name :fullname
        :label (tr "dashboard.your-name")}]]

     [:div {:class (stl/css :fields-row)
            :on-click on-show-change-email}
      [:& fm/input
       {:type "email"
        :name :email
        :disabled true
        :label (tr "dashboard.your-email")}]

      [:div {:class (stl/css :options)}
       [:div.change-email
        [:a {:on-click on-show-change-email}
         (tr "dashboard.change-email")]]]]

     [:> fm/submit-button*
      {:label (tr "dashboard.save-settings")
       :disabled (empty? (:touched @form))
       :class (stl/css :btn-primary)}]

     [:div {:class (stl/css :links)}
      [:div {:class (stl/css :link-item)}
       [:a {:on-click on-show-delete-account
            :data-testid "remove-acount-btn"}
        (tr "dashboard.remove-account")]]]]))

;; --- BacksterOS contact link

(defn- core-config
  []
  (let [cfg (obj/get js/window "backsterosCore")]
    (when (some? cfg)
      {:base-url (or (obj/get cfg "baseUrl") "")
       :api-key  (or (obj/get cfg "apiKey") "local")})))

(defn- api-fetch
  [base-url api-key method path]
  (let [url (str (str/rtrim base-url "/") path)
        headers #js {"Authorization" (str "Bearer " api-key)
                     "Accept" "application/json"}
        opts #js {:method method :headers headers}]
    (-> (js/fetch url opts)
        (.then (fn [res]
                 (if (.-ok res)
                   (.json res)
                   (-> (.text res)
                       (.then (fn [t]
                                (throw (js/Error. (str (.-status res) " " t))))))))))))

(defn- parse-contact-option
  [row]
  (let [id (obj/get row "id")
        name (or (obj/get row "name") "Untitled")
        email (obj/get row "email")
        first-name (obj/get row "firstName")
        last-name (obj/get row "lastName")
        label (cond
                (and (string? first-name) (string? last-name)
                     (not (str/blank? first-name)) (not (str/blank? last-name)))
                (str first-name " " last-name)

                (and (string? name) (not (str/blank? name)))
                name

                :else
                (str id))]
    {:id id
     :label (if (and (string? email) (not (str/blank? email)))
              (str label " (" email ")")
              label)}))

(defn- fetch-contacts!
  [base-url api-key]
  (-> (api-fetch base-url api-key "GET" "/api/v1/contacts?limit=200")
      (.then (fn [data]
               (->> (or (obj/get data "contacts")
                        (obj/get data "items")
                        #js [])
                    (array-seq)
                    (map parse-contact-option)
                    (sort-by :label)
                    vec)))))

(mf/defc backsteros-contact-form*
  {::mf/private true}
  []
  (let [profile     (mf/deref refs/profile)
        selected-id (get-in profile [:props :backsteros-contact-id])
        cfg         (core-config)
        state*      (mf/use-state {:status (if cfg :loading :missing-config)
                                   :contacts []
                                   :error nil
                                   :saving? false})
        {:keys [status contacts error saving?]} @state*

        selected-str
        (cond
          (uuid? selected-id) (str selected-id)
          (string? selected-id) selected-id
          :else "")

        on-change
        (mf/use-fn
         (fn [event]
           (let [value (dom/get-target-val event)
                 next  (when (and (string? value) (not (str/blank? value)))
                         (try (uuid/parse value) (catch :default _ nil)))]
             (swap! state* assoc :saving? true :error nil)
             (st/emit!
              (du/update-profile-props {:backsteros-contact-id next}))
             ;; Optimistic UI; clear saving after a short beat so the
             ;; select does not feel stuck if the RPC is slow.
             (js/setTimeout #(swap! state* assoc :saving? false) 600))))]

    (mf/with-effect []
      (when cfg
        (-> (fetch-contacts! (:base-url cfg) (:api-key cfg))
            (.then (fn [rows]
                     (swap! state* assoc :status :ready :contacts rows)))
            (.catch (fn [err]
                      (swap! state* assoc
                             :status :error
                             :error (or (.-message err) (str err))))))))

    [:div {:class (stl/css :contact-link)
           :data-testid "backsteros-contact-link"}
     [:h3 {:class (stl/css :contact-link-title)} "BacksterOS contact"]
     [:p {:class (stl/css :contact-link-help)}
      "Link this account to a BacksterOS contact so it is clear who it belongs to."]

     (cond
       (= status :missing-config)
       [:p {:class (stl/css :contact-link-msg)}
        "Configure " [:code "window.backsterosCore"] " in config.js to load contacts."]

       (= status :loading)
       [:p {:class (stl/css :contact-link-msg)} "Loading contacts…"]

       (= status :error)
       [:p {:class (stl/css :contact-link-msg :contact-link-error)}
        (or error "Could not load contacts.")]

       :else
       [:label {:class (stl/css :contact-link-label)}
        [:span {:class (stl/css :contact-link-label-text)} "Contact"]
        [:select {:class (stl/css :contact-link-select)
                  :value selected-str
                  :disabled saving?
                  :on-change on-change
                  :data-testid "backsteros-contact-select"}
         [:option {:value ""} "— Not linked —"]
         (for [{:keys [id label]} contacts]
           [:option {:key id :value (str id)} label])]])]))

;; --- Profile Photo Form

(mf/defc profile-photo-form*
  {::mf/private true}
  []
  (let [input-ref  (mf/use-ref nil)
        profile    (mf/deref refs/profile)
        has-photo? (some? (:photo-id profile))

        photo
        (mf/with-memo [profile]
          (cf/resolve-profile-photo-url profile))

        on-image-click
        (mf/use-fn
         #(dom/click (mf/ref-val input-ref)))

        on-file-selected
        (fn [file]
          (st/emit! (du/update-photo file)))

        on-delete-click
        (mf/use-fn
         (fn [event]
           (dom/stop-propagation event)
           (st/emit! (modal/show
                      {:type :confirm
                       :title (tr "labels.delete-profile-photo.title")
                       :message (tr "labels.delete-profile-photo.message")
                       :accept-label (tr "labels.delete")
                       :on-accept (fn [_] (st/emit! du/delete-photo))}))))]

    [:form {:class (stl/css :avatar-form)}
     [:div {:class (stl/css :image-change-field)}
      [:span {:class (stl/css :update-overlay)
              :on-click on-image-click} (tr "labels.update")]
      [:img {:src photo}]
      (when has-photo?
        [:button {:type "button"
                  :class (stl/css :delete-overlay)
                  :title (tr "labels.delete")
                  :aria-label (tr "labels.delete")
                  :on-click on-delete-click
                  :data-testid "profile-image-delete"}
         [:> icon* {:icon-id i/delete :size "m"}]])
      [:& file-uploader {:accept "image/jpeg,image/png"
                         :multi false
                         :ref input-ref
                         :on-selected on-file-selected
                         :data-testid "profile-image-input"}]]]))

;; --- Profile Page

(mf/defc profile-page*
  []
  (mf/with-effect []
    (dom/set-html-title (tr "title.settings.profile")))

  [:section {:class (stl/css :dashboard-settings)
             :aria-labelledby "profile-section-title"}
   [:div {:class (stl/css :form-container)}
    [:h2 {:id "profile-section-title"} (tr "labels.profile")]
    [:> profile-photo-form*]
    [:> profile-form*]
    [:> backsteros-contact-form*]]])
