// Shared by the root layout (a server component) and the client settings store.
export const STORAGE_KEY = "bookwise.reading";

/**
 * Runs before first paint (inline in the root layout) so a saved theme or text
 * size never flashes the defaults. Keep in sync with `applyToDocument` in
 * reading-settings.ts.
 */
export const READING_SETTINGS_BOOT_SCRIPT = `try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})||"{}"),d=document.documentElement;if(s.theme==="light"||s.theme==="dark")d.dataset.theme=s.theme;if(s.size&&s.size!=="m")d.dataset.readingSize=s.size;if(s.width&&s.width!=="normal")d.dataset.readingWidth=s.width}catch(e){}`;
