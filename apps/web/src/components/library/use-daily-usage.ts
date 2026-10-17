"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useEffect, useState } from "react";

import { bookwiseApi } from "../../lib/bookwise-api";
import { dailyUsageSchema, type DailyUsage } from "../../lib/library-types";

/**
 * Today's shared AI spend, loaded once per dashboard visit. A failed request
 * simply hides the card; it never blocks the library.
 */
export function useDailyUsage(): DailyUsage | undefined {
  const { getAccessTokenSilently } = useAuth0();
  const [usage, setUsage] = useState<DailyUsage>();

  useEffect(() => {
    let active = true;

    void bookwiseApi(
      getAccessTokenSilently,
      "/v1/usage/today",
      { method: "GET" },
      dailyUsageSchema,
    )
      .then((next) => {
        if (active) {
          setUsage(next);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [getAccessTokenSilently]);

  return usage;
}
