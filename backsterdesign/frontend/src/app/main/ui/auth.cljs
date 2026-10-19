;; This Source Code Form is subject to the terms of the Mozilla Public
;; License, v. 2.0. If a copy of the MPL was not distributed with this
;; file, You can obtain one at http://mozilla.org/MPL/2.0/.
;;
;; Copyright (c) KALEIDOS INC Sucursal en España SL

(ns app.main.ui.auth
  (:require-macros [app.main.style :as stl])
  (:require
   [app.common.data.macros :as dm]
   [app.main.data.auth :as da]
   [app.main.router :as rt]
   [app.main.store :as st]
   [app.main.ui.auth.login :refer [login-page*]]
   [app.main.ui.auth.recovery :refer [recovery-page*]]
   [app.main.ui.auth.recovery-request :refer [recovery-request-page*]]
   [app.main.ui.ds.foundations.assets.raw-svg :refer [raw-svg*] :as raw-svg]
   [app.main.ui.ds.foundations.typography.heading :refer [heading*]]
   [app.util.dom :as dom]
   [app.util.i18n :as i18n :refer [tr]]
   [rumext.v2 :as mf]))

(def ^:private register-sections
  #{:auth-register
    :auth-register-validate
    :register-validate-page
    :auth-register-success})

(mf/defc auth*
  [{:keys [route]}]
  (let [section (dm/get-in route [:data :name])
        params  (:query-params route)
        error   (:error params)
        ;; BacksterDESIGN: public self-signup is off — accounts come from
        ;; BacksterOS (contact → client). Register URLs redirect to login.
        section (if (contains? register-sections section)
                  :auth-login
                  section)]

    (mf/with-effect []
      (dom/set-html-title (tr "title.default")))

    (mf/with-effect [error]
      (when error
        (st/emit! (da/show-redirect-error error))))

    (mf/with-effect [route]
      (let [raw (dm/get-in route [:data :name])]
        (when (contains? register-sections raw)
          (st/emit! (rt/nav :auth-login params)))))

    [:main {:class (stl/css :auth-section)}
     [:> heading* {:level 1 :typography "title-large" :class (stl/css :logo-container)}
      [:a {:href "#/" :title "BacksterDESIGN" :class (stl/css :logo-btn)}
       [:> raw-svg* {:id raw-svg/penpot-logo
                     :class (stl/css :logo)}]]]

     [:section {:class (stl/css :auth-content)}
      (case section
        :auth-login
        [:> login-page* {:params params}]

        :auth-recovery-request
        [:> recovery-request-page*]

        :auth-recovery
        [:> recovery-page* {:params params}]

        ;; Fallback (including remapped register routes)
        [:> login-page* {:params params}])]]))


(mf/defc auth-page*
  {::mf/lazy-load true}
  [props]
  [:> auth* props])
