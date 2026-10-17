"use client";

import { createContext, useContext } from "react";

/** Lets any screen inside the app shell open the shared upload dialog. */
export const UploadContext = createContext<{ openUpload(): void }>({
  openUpload: () => undefined,
});

export function useUpload() {
  return useContext(UploadContext);
}
