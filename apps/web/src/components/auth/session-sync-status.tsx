"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  syncBookwiseIdentity,
  type BookwisePrincipal,
} from "../../lib/bookwise-api";
import { useMessages } from "../../lib/i18n/messages";
import { authMessages } from "../../lib/i18n/messages/auth";
import { commonMessages } from "../../lib/i18n/messages/common";
import { Spinner } from "../ui/loading";

type ConnectionState =
  | { kind: "connecting" }
  | { kind: "connected"; principal: BookwisePrincipal }
  | { kind: "error" };

/**
 * Registers the signed-in identity with the API and shows the result as one
 * quiet line under the account name.
 */
export function SessionSyncStatus({ identityKey }: { identityKey: string }) {
  const { getAccessTokenSilently } = useAuth0();
  const t = useMessages(authMessages);
  const common = useMessages(commonMessages);
  const [state, setState] = useState<ConnectionState>({
    kind: "connecting",
  });

  const requestSynchronization =
    useCallback(async (): Promise<ConnectionState> => {
      try {
        const principal = await syncBookwiseIdentity(getAccessTokenSilently);
        return { kind: "connected", principal };
      } catch {
        return { kind: "error" };
      }
    }, [getAccessTokenSilently]);

  useEffect(() => {
    let active = true;

    void requestSynchronization().then((nextState) => {
      if (active) {
        setState(nextState);
      }
    });

    return () => {
      active = false;
    };
  }, [identityKey, requestSynchronization]);

  if (state.kind === "connecting") {
    return (
      <small className="sync-status">
        <Spinner size="sm" />
        {t.connecting}
      </small>
    );
  }

  if (state.kind === "connected") {
    return (
      <small className="sync-status" title={state.principal.email}>
        {state.principal.email}
      </small>
    );
  }

  return (
    <small className="sync-status sync-status-error" role="alert">
      {t.notConnected}
      <button
        type="button"
        onClick={() => {
          setState({ kind: "connecting" });
          void requestSynchronization().then(setState);
        }}
      >
        <RefreshCw aria-hidden="true" size={12} />
        {common.retry}
      </button>
    </small>
  );
}
