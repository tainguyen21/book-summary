"use client";

import { useAuth0 } from "@auth0/auth0-react";
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

  const requestSynchronization = useCallback(async (): Promise<ConnectionState> => {
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
    return <p role="status">Connecting Bookwise...</p>;
  }

  if (state.kind === "connected") {
    return <p role="status">Connected as {state.principal.email}</p>;
  }

  return (
    <div>
      <p role="alert">Bookwise could not connect. Please try again.</p>
      <button
        type="button"
        onClick={() => {
          setState({ kind: "connecting" });
          void requestSynchronization().then(setState);
        }}
      >
        Retry
      </button>
    </div>
  );
}
