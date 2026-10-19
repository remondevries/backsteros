;; This Source Code Form is subject to the terms of the Mozilla Public
;; License, v. 2.0. If a copy of the MPL was not distributed with this
;; file, You can obtain one at http://mozilla.org/MPL/2.0/.
;;
;; Copyright (c) KALEIDOS INC Sucursal en España SL

(ns app.main.data.dashboard.shortcuts
  (:require
   [app.main.data.common :as dcm]
   [app.main.data.event :as ev]
   [app.main.data.modal :as modal]
   [app.main.data.profile :as du]
   [app.main.data.shortcuts :as ds]
   [app.main.router :as rt]
   [app.main.store :as st]
   [app.util.dom :as dom]))

(defn- blank-param?
  [v]
  (or (nil? v) (= "" (str v))))

(defn- go-back!
  "Escape → contextual back (task → project, project → Projects,
  contact → Clients). Root dashboard tabs are no-ops. Skips when a
  modal is open so Escape can close the modal instead."
  []
  (let [state      @st/state
        route-name (rt/lookup-name state)
        params     (rt/get-params state)
        team-id    (rt/get-query-param params :team-id)
        project-id (rt/get-query-param params :project-id)
        task-id    (rt/get-query-param params :task-id)
        contact-id (rt/get-query-param params :contact-id)]
    (cond
      (some? (get state ::modal/modal))
      nil

      (and (= route-name :dashboard-files)
           (not (blank-param? task-id)))
      (st/emit! (dcm/go-to-dashboard-files
                 :team-id team-id
                 :project-id project-id))

      (= route-name :dashboard-files)
      (st/emit! (dcm/go-to-dashboard-backsteros :team-id team-id))

      (and (= route-name :dashboard-client-accounts)
           (not (blank-param? contact-id)))
      (st/emit! (dcm/go-to-dashboard-client-accounts :team-id team-id))

      (#{:dashboard-backsteros
         :dashboard-client-accounts
         :dashboard-recent
         :dashboard-libraries
         :dashboard-fonts
         :dashboard-deleted}
       route-name)
      nil

      :else
      (st/emit! (rt/nav-back)))))

;; Shortcuts definitions
(def shortcuts
  {:toggle-theme    {:tooltip (ds/alt "M")
                     :command (ds/a-mod "m")
                     :section [:dashboard]
                     :subsections [:generic]
                     :fn #(st/emit! (with-meta (du/toggle-theme)
                                      {::ev/origin "dashboard:shortcuts"}))}

   :go-back         {:tooltip (ds/esc)
                     :command "escape"
                     :section [:dashboard]
                     :subsections [:navigation-dashboard]
                     :fn (fn [_] (go-back!))}})

(defn- focus-header-search!
  []
  (when-let [el (dom/get-element "dashboard-header-search-input")]
    (dom/focus! el)
    (dom/select-text! el)))

(def shortcuts-sidebar-navigation
  {:go-to-drafts       {:tooltip "G D"
                        :command "g d"
                        :section [:dashboard]
                        :subsections [:navigation-dashboard]
                        :fn #(st/emit! (dcm/go-to-dashboard-files :project-id :default))}

   :go-to-libs         {:tooltip "G L"
                        :command "g l"
                        :section [:dashboard]
                        :subsections [:navigation-dashboard]
                        :fn #(st/emit! (dcm/go-to-dashboard-libraries))}

   :go-to-projects     {:tooltip "G P"
                        :command "g p"
                        :section [:dashboard]
                        :subsections [:navigation-dashboard]
                        :fn #(st/emit! (dcm/go-to-dashboard-backsteros))}

   :go-to-clients      {:tooltip "G C"
                        :command "g c"
                        :section [:dashboard]
                        :subsections [:navigation-dashboard]
                        :fn #(st/emit! (dcm/go-to-dashboard-client-accounts))}

   :go-to-fonts        {:tooltip "G F"
                        :command "g f"
                        :section [:dashboard]
                        :subsections [:navigation-dashboard]
                        :fn #(st/emit! (dcm/go-to-dashboard-fonts))}

   :go-to-recents      {:tooltip "G R"
                        :command "g r"
                        :section [:dashboard]
                        :subsections [:navigation-dashboard]
                        :fn #(st/emit! (dcm/go-to-dashboard-recent))}

   :focus-search       {:tooltip (ds/shift "F")
                        :command "shift+f"
                        :section [:dashboard]
                        :subsections [:navigation-dashboard]
                        :fn (fn [_] (focus-header-search!))}})

(def shortcut-search
  {:go-to-search       {:tooltip (ds/meta "F")
                        :command (ds/c-mod "f")
                        :section [:dashboard]
                        :subsections [:navigation-dashboard]
                        :fn #(st/emit! (dcm/go-to-dashboard-search))}})

;; Shortcuts combinations for files, drafts, libraries and fonts sections
(def shortcuts-dashboard
  (merge shortcuts
         shortcuts-sidebar-navigation))

;; BacksterDESIGN: no + shortcut to create free-standing Penpot projects;
;; projects are created via BacksterOS link from Projects / Clients.
(def shortcuts-projects
  (merge shortcuts
         shortcuts-sidebar-navigation
         shortcut-search))

(def shortcuts-drafts-libraries
  (merge shortcuts
         shortcuts-sidebar-navigation
         shortcut-search))

(defn get-tooltip [shortcut]
  (assert (contains? shortcuts shortcut) (str shortcut))
  (get-in shortcuts [shortcut :tooltip]))
