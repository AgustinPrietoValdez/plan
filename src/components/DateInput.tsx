import { useEffect, useState, type CSSProperties } from "react";

// Native <input type="date"> renders its displayed text (not just the picker)
// according to the OS/WebView locale, which we don't control — on this
// machine's WebView2 that's always mm/dd/yyyy regardless of the page's `lang`.
// This is a plain masked text input so the display format (dd/mm/yyyy) is
// guaranteed independent of locale. Value/onChange still use ISO "yyyy-mm-dd"
// so callers don't need to change how they store dates.

function isoToDisplay(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
}

function displayToIso(display: string): string | null {
  const match = display.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, d, m, y] = match;
  const day = Number(d);
  const month = Number(m);
  if (month < 1 || month > 12) return null;
  const daysInMonth = new Date(Number(y), month, 0).getDate();
  if (day < 1 || day > daysInMonth) return null;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function maskInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean);
  return parts.join("/");
}

export function DateInput({
  value,
  onChange,
  className,
  style,
  placeholder = "dd/mm/aaaa",
}: {
  value: string;
  onChange: (isoValue: string) => void;
  className?: string;
  style?: CSSProperties;
  placeholder?: string;
}) {
  const [text, setText] = useState(() => isoToDisplay(value));

  useEffect(() => {
    setText(isoToDisplay(value));
  }, [value]);

  return (
    <input
      type="text"
      inputMode="numeric"
      className={className}
      style={style}
      placeholder={placeholder}
      value={text}
      onChange={(e) => {
        const masked = maskInput(e.target.value);
        setText(masked);
        if (masked === "") {
          onChange("");
          return;
        }
        const iso = displayToIso(masked);
        if (iso) onChange(iso);
      }}
      onBlur={() => setText(isoToDisplay(value))}
    />
  );
}
