;; BacksterOS → BacksterDESIGN bridge (read-only project list).
;; Copyright (c) BacksterOS — lives beside upstream Penpot dashboard UI.

(ns app.main.ui.dashboard.backsteros-projects
  (:require-macros [app.main.style :as stl])
  (:require
   [app.util.object :as obj]
   [cuerdas.core :as str]
   [rumext.v2 :as mf]))

(defn- core-config
  "Read window.backsterosCore from gitignored config.js."
  []
  (let [cfg (obj/get js/window "backsterosCore")]
    (when (some? cfg)
      {:base-url (or (obj/get cfg "baseUrl") "")
       :api-key  (or (obj/get cfg "apiKey") "local")})))

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
                                      {:id     (obj/get row "id")
                                       :key    (obj/get row "key")
                                       :name   (obj/get row "name")
                                       :status (obj/get row "status")
                                       :type   (obj/get row "type")})
                                    items))))))
        (.catch (fn [err]
                  (on-err (or (.-message err) (str err))))))))

(mf/defc backsteros-projects-section*
  {::mf/wrap [mf/memo]}
  []
  (let [cfg          (core-config)
        state*       (mf/use-state {:status :idle :items [] :error nil})
        {:keys [status items error]} @state*

        reload!
        (mf/use-fn
         (fn []
           (if-not cfg
             (reset! state* {:status :error :items []
                             :error "Set window.backsterosCore in js/config.js (baseUrl + apiKey)."})
             (do
               (reset! state* {:status :loading :items [] :error nil})
               (fetch-projects!
                (:base-url cfg)
                (:api-key cfg)
                (fn [rows]
                  (reset! state* {:status :ok :items rows :error nil}))
                (fn [msg]
                  (reset! state* {:status :error :items [] :error msg})))))))]

    (mf/with-effect []
      (reload!)
      js/undefined)

    [:section {:class (stl/css :backsteros-projects)
               :data-testid "backsteros-projects"}
     [:header {:class (stl/css :header)}
      [:div {:class (stl/css :title-wrap)}
       [:h2 {:class (stl/css :title)} "BacksterOS projects"]
       [:span {:class (stl/css :subtitle)} "Read-only from local-core"]]
      [:button {:class (stl/css :reload)
                :type "button"
                :on-click reload!
                :disabled (= status :loading)}
       (if (= status :loading) "Loading…" "Reload")]]

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

       (empty? items)
       [:p {:class (stl/css :message)} "No projects returned."]

       :else
       [:ul {:class (stl/css :list)}
        (for [{:keys [id key name status type]} items]
          [:li {:key id :class (stl/css :row)}
           [:div {:class (stl/css :row-main)}
            [:span {:class (stl/css :key)} (or key "—")]
            [:span {:class (stl/css :name)} (or name id)]]
           [:div {:class (stl/css :meta)}
            (when status
              [:span {:class (stl/css :badge)} status])
            (when type
              [:span {:class (stl/css :badge :muted)} type])]])])]))
