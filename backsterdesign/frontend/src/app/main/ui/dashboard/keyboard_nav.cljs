;; Shared dashboard j/k helpers.
;; Copyright (c) BacksterOS — lives beside upstream Penpot dashboard UI.
;;
;; Never use PersistentVector `.indexOf` for id lookup: a type mismatch
;; (UUID vs string) yields -1, and the step logic then always lands on
;; first (j) or last (k). Compare via stringified ids instead.

(ns app.main.ui.dashboard.keyboard-nav
  (:require
   [app.common.data :as d]
   [app.common.uuid :as uuid]
   [app.main.data.common :as dcm]
   [app.main.store :as st]
   [rumext.v2 :as mf]))

(def ^:private file-highlight-class "bd-file-keyboard-highlight")
(def ^:private file-attr "data-bd-file-id")

(defn index-of-id
  "Index of `id` in `ids`, comparing `(str %)` so UUID/string forms match."
  [ids id]
  (when (and (some? id) (seq ids))
    (let [want (str id)]
      (d/index-of-pred ids #(= (str %) want)))))

(defn next-id-in-list
  "Step one slot in `ids`. Unknown/missing current → first (down) or last (up)."
  [ids current direction]
  (when (seq ids)
    (let [idx (or (index-of-id ids current) -1)
          last-i (dec (count ids))
          next-idx (cond
                     (< idx 0)
                     (if (= direction :down) 0 last-i)

                     (= direction :down)
                     (min last-i (inc idx))

                     :else
                     (max 0 (dec idx)))]
      (nth ids next-idx))))

(defn remember!
  "Write `value` into a React ref during render so key handlers see it.
   Rumext `use-state` deref is frozen inside a callback created on an
   earlier render, so j/k must read a ref, not `@state`."
  [ref value]
  (mf/set-ref-val! ref value)
  value)

(defn step-ref!
  "Step `ids` from the id stored in `ref`, and store the result immediately."
  [ref ids direction]
  (let [next (next-id-in-list ids (mf/ref-val ref) direction)]
    (when (some? next)
      (mf/set-ref-val! ref next))
    next))

(defn sync-file-highlight!
  "Paint / clear the orange ring on a Penpot file card (`data-bd-file-id`)."
  [file-id]
  (doseq [el (array-seq (.querySelectorAll js/document (str "." file-highlight-class)))]
    (.remove (.-classList el) file-highlight-class))
  (when file-id
    (let [id  (str file-id)
          esc (if (exists? js/CSS) (js/CSS.escape id) id)
          sel (str "[" file-attr "=\"" esc "\"]")]
      (when-let [target (.querySelector js/document sel)]
        (.add (.-classList target) file-highlight-class)
        (when (fn? (.-scrollIntoView target))
          (.scrollIntoView target #js {:block "nearest" :inline "nearest"}))))))

(defn search-input-target?
  [target]
  (when (instance? js/HTMLElement target)
    (or (= (.-id target) "dashboard-header-search-input")
        (some? (.closest ^js target "#dashboard-header-search-input")))))

(defn editable-target?
  [target]
  (when (instance? js/HTMLElement target)
    (or (#{"INPUT" "TEXTAREA" "SELECT"} (.-tagName target))
        (.-isContentEditable target)
        (some? (.closest ^js target "[contenteditable='true']"))
        (some? (.closest ^js target ".cm-editor"))
        (some? (.closest ^js target "[role='textbox']")))))

(defn parse-file-id
  [value]
  (cond
    (uuid? value) value
    (and (string? value) (not= value ""))
    (uuid/parse* value)
    :else nil))

(defn open-file!
  [file-id]
  (when-let [id (parse-file-id file-id)]
    (st/emit! (dcm/go-to-workspace :file-id id))))
