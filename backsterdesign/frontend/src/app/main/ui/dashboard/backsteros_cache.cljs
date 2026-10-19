;; Session cache for BacksterOS API lists used by the dashboard Tabs
;; (Projects / Clients). Survives tab remounts so switching does not
;; re-fetch every time. Explicit Reload forces a refresh.

(ns app.main.ui.dashboard.backsteros-cache)

(def ^:private default-ttl-ms
  (* 3 60 1000))

(def ^:private store*
  ;; key → {:at ms :data any}
  (atom {}))

(def ^:private inflight*
  ;; key → Promise — join concurrent loads for the same key
  (atom {}))

(defn- now-ms
  []
  (.now js/Date))

(defn entry
  "Return cache entry map {:at :data} or nil."
  [key]
  (get @store* key))

(defn put!
  [key data]
  (swap! store* assoc key {:at (now-ms) :data data})
  data)

(defn update-data!
  "Apply f to cached :data when the key exists (keeps :at)."
  [key f]
  (swap! store*
         (fn [m]
           (if-let [entry (get m key)]
             (assoc m key (update entry :data f))
             m))))

(defn invalidate!
  ([] (reset! store* {}) (reset! inflight* {}))
  ([key]
   (swap! store* dissoc key)
   (swap! inflight* dissoc key)))

(defn fresh?
  ([ent] (fresh? ent default-ttl-ms))
  ([ent ttl-ms]
   (and (some? ent)
        (some? (:data ent))
        (< (- (now-ms) (:at ent 0)) ttl-ms))))

(defn load!
  "Resolve with cached/fetched data.
   Options:
   - :force?  — ignore cache, always fetch
   - :ttl-ms  — freshness window (default 3 min)
   - :fetch!  — zero-arg fn returning a Promise of data
   Returns a Promise."
  [key {:keys [force? ttl-ms fetch!]
        :or {force? false ttl-ms default-ttl-ms}}]
  (let [ent (entry key)]
    (cond
      (and (not force?) (fresh? ent ttl-ms))
      (js/Promise.resolve (:data ent))

      (get @inflight* key)
      (get @inflight* key)

      :else
      (let [p (-> (fetch!)
                  (.then (fn [data]
                           (put! key data)
                           data))
                  (.finally (fn []
                              (swap! inflight* dissoc key))))]
        (swap! inflight* assoc key p)
        p))))

(defn cached-data
  "Return cached payload or nil (ignores freshness)."
  [key]
  (:data (entry key)))
