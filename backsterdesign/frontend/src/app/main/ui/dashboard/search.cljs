;; This Source Code Form is subject to the terms of the Mozilla Public
;; License, v. 2.0. If a copy of the MPL was not distributed with this
;; file, You can obtain one at http://mozilla.org/MPL/2.0/.
;;
;; Copyright (c) KALEIDOS INC Sucursal en España SL

(ns app.main.ui.dashboard.search
  (:require-macros [app.main.style :as stl])
  (:require
   [app.common.data :as d]
   [app.main.data.dashboard :as dd]
   [app.main.refs :as refs]
   [app.main.store :as st]
   [app.main.ui.dashboard.grid :refer [grid*]]
   [app.main.ui.dashboard.keyboard-nav :as knav]
   [app.main.ui.dashboard.page-header :refer [page-header*]]
   [app.main.ui.hooks :as hooks]
   [app.main.ui.icons :as deprecated-icon]
   [app.util.dom :as dom]
   [app.util.i18n :as i18n :refer [tr]]
   [okulary.core :as l]
   [rumext.v2 :as mf]))

(def ^:private ref:search-result
  (l/derived :search-result st/state))

(def ^:private ref:selected
  (l/derived (fn [state]
               ;; we need to this because :dashboard-search-result is a list
               ;; of maps and we need a map of maps (using :id as key).
               (let [files (d/index-by :id (:search-result state))]
                 (->> (get state :selected-files)
                      (refs/extract-selected-files files))))
             st/state))

(mf/defc search-page*
  [{:keys [team search-term]}]
  (let [search-term (d/nilv search-term "")

        result      (mf/deref ref:search-result)
        selected    (mf/deref ref:selected)

        [rowref limit]
        (hooks/use-dynamic-grid-item-width)

        highlighted* (mf/use-state nil)
        highlighted  @highlighted*
        highlight-ref (mf/use-ref nil)

        file-ids
        (mf/with-memo [result]
          (mapv (comp str :id) (or result [])))]

    (mf/with-effect [team]
      (when team
        (let [tname (if (:is-default team)
                      (tr "dashboard.personal-projects")
                      (:name team))]
          (dom/set-html-title (tr "title.dashboard.search" tname)))))

    (mf/with-effect [search-term]
      (st/emit! (dd/search {:search-term search-term})
                (dd/clear-selected-files)))

    (knav/remember! highlight-ref highlighted)

    ;; Drop highlight when the result set changes.
    (mf/with-effect [file-ids]
      (knav/remember! highlight-ref nil)
      (reset! highlighted* nil)
      (knav/sync-file-highlight! nil))

    (mf/with-effect [highlighted]
      (knav/sync-file-highlight! highlighted)
      (fn [] (knav/sync-file-highlight! nil)))

    ;; Enter from search → highlight first · j/k move · Enter open
    (mf/with-effect [file-ids]
      (let [on-key
            (fn [event]
              (when (and (not (.-metaKey event))
                         (not (.-ctrlKey event))
                         (not (.-altKey event)))
                (let [target     (.-target event)
                      in-search? (knav/search-input-target? target)
                      key        (.-key event)
                      code       (.-code event)
                      has-results? (seq file-ids)
                      stop!      (fn []
                                   (.preventDefault event)
                                   (.stopPropagation event)
                                   (.stopImmediatePropagation event))]
                  (cond
                    ;; Enter: first press only highlights (never opens).
                    ;; Second press with a highlight opens that file.
                    (and (or (= key "Enter") (= code "Enter") (= code "NumpadEnter"))
                         has-results?)
                    (do
                      (stop!)
                      (if-let [file-id (mf/ref-val highlight-ref)]
                        (knav/open-file! file-id)
                        (do
                          (when in-search?
                            (when-let [el (dom/get-element "dashboard-header-search-input")]
                              (.blur el)))
                          (let [id (first file-ids)]
                            (knav/remember! highlight-ref id)
                            (reset! highlighted* id)))))

                    ;; Still typing in search — leave j/k to the input.
                    in-search?
                    nil

                    (knav/editable-target? target)
                    nil

                    (not has-results?)
                    nil

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

    [:*
     [:> page-header* {:title (tr "dashboard.title-search")
                       :title-id "dashboard-search-title"
                       :search-term search-term
                       :team-id (get team :id)}]

     [:section {:class (stl/css :dashboard-container :search :no-bg)
                :ref rowref}
      (cond
        (empty? search-term)
        [:div {:class (stl/css :grid-empty-placeholder :search)}
         [:div {:class (stl/css :icon)} deprecated-icon/search]
         [:div {:class (stl/css :text)} (tr "dashboard.type-something")]]

        (nil? result)
        [:div {:class (stl/css :grid-empty-placeholder :search)}
         [:div {:class (stl/css :icon)} deprecated-icon/search]
         [:div {:class (stl/css :text)} (tr "dashboard.searching-for" search-term)]]

        (empty? result)
        [:div {:class (stl/css :grid-empty-placeholder :search)}
         [:div {:class (stl/css :icon)} deprecated-icon/search]
         [:div {:class (stl/css :text)} (tr "dashboard.no-matches-for" search-term)]]

        :else
        [:> grid* {:files result
                   :selected-files selected
                   :origin :search
                   :limit limit}])]]))
