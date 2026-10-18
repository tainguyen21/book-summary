"use client";

import { Type } from "lucide-react";
import { useRef } from "react";

import { useMessages } from "../../lib/i18n/messages";
import { readingMessages } from "../../lib/i18n/messages/reading";
import {
  updateReadingSettings,
  useReadingSettings,
  type ReadingSettings,
} from "../../lib/reading-settings";

/** Theme, text size, and line width for reading, remembered on this device. */
export function ReadingSettingsMenu() {
  const t = useMessages(readingMessages);
  const settings = useReadingSettings();
  const detailsRef = useRef<HTMLDetailsElement>(null);

  function group<K extends keyof ReadingSettings>(
    name: K,
    legend: string,
    options: { value: ReadingSettings[K]; label: string }[],
  ) {
    return (
      <fieldset className="reading-group">
        <legend>{legend}</legend>
        <div className="reading-options">
          {options.map((option) => (
            <label key={option.value} className="reading-option">
              <input
                type="radio"
                name={`reading-${name}`}
                value={option.value}
                checked={settings[name] === option.value}
                onChange={() => updateReadingSettings({ [name]: option.value } as Partial<ReadingSettings>)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  return (
    <details
      ref={detailsRef}
      className="reading-settings"
      onKeyDown={(event) => {
        if (event.key === "Escape" && detailsRef.current?.open) {
          detailsRef.current.open = false;
          detailsRef.current.querySelector("summary")?.focus();
        }
      }}
    >
      <summary>
        <Type aria-hidden="true" size={13} />
        {t.button}
      </summary>
      <div className="reading-panel">
        {group("theme", t.theme, [
          { value: "system", label: t.system },
          { value: "light", label: t.light },
          { value: "dark", label: t.dark },
        ])}
        {group(
          "size",
          t.size,
          (["s", "m", "l", "xl"] as const).map((value) => ({ value, label: t.sizes[value] })),
        )}
        {group(
          "width",
          t.width,
          (["narrow", "normal", "wide"] as const).map((value) => ({ value, label: t.widths[value] })),
        )}
        <p className="reading-note">{t.note}</p>
      </div>
    </details>
  );
}
