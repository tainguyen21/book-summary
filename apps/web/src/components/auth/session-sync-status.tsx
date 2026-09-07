"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { CircleAlert, LoaderCircle, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  syncBookwiseIdentity,
  type BookwisePrincipal,
} from "../../lib/bookwise-api";

type ConnectionState =
  | { kind: "connecting" }
  | { kind: "connected"; principal: BookwisePrincipal }
  | { kind: "error" };

export function SessionSyncStatus({ identityKey }: { identityKey: string }) {
  const { getAccessTokenSilently } = useAuth0();
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
      <p className="session-status" role="status">
        <LoaderCircle className="spin" aria-hidden="true" size={16} />
        Connecting your account
      </p>
    );
  }

  if (state.kind === "connected") {
    return (
      <p className="session-status" role="status">
        Connected as {state.principal.email}
      </p>
    );
  }

  return (
    <div className="session-status session-error" role="alert">
      <CircleAlert aria-hidden="true" size={18} />
      <span>Bookwise could not connect.</span>
      <button
        className="icon-button"
        type="button"
        onClick={() => {
          setState({ kind: "connecting" });
          void requestSynchronization().then(setState);
        }}
        title="Retry connection"
        aria-label="Retry connection"
      >
        <RefreshCw aria-hidden="true" size={18} />
      </button>
    </div>
  );
}
