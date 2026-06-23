import { useState, useEffect } from "react";
import { fetchAnalytics, AnalyticsData } from "../api/analytics.js";

export function useAnalytics(apiKey: string) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!apiKey) return;
    setLoading(true);
    fetchAnalytics(apiKey)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [apiKey]);

  return { data, loading, error };
}
