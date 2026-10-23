import { TextField } from "@mft/ui";
import { useId } from "react";
import { categoryColorPresets, colorOwner } from "../../shared/contracts";
import { categoryColor, faintIn } from "../lib/categoryColor";

interface ColorPickerProps {
  /** A preset key or `#rrggbb` (possibly half-typed while the user edits the hex). */
  value: string;
  onChange: (color: string) => void;
  /** Things that already have a color; presets they use are hidden, a matching custom hex is flagged. */
  taken: { id: number; name: string; color: string }[];
  /** The item being edited: its own color stays available. */
  exceptId?: number;
  /** "category" or "card", for the messages. */
  noun: string;
  error?: string;
}

const label = (key: string) => key.charAt(0).toUpperCase() + key.slice(1);
export const isHex = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v);

/** Preset swatches (real radio inputs) plus a custom color, with uniqueness against `taken`. */
export function ColorPicker({ value, onChange, taken, exceptId, noun, error }: ColorPickerProps) {
  const name = useId();
  const free = categoryColorPresets.filter((key) => !colorOwner(taken, key, exceptId));
  const isCustom = value.startsWith("#");
  const valid = isHex(value);
  const clash = isCustom && valid ? colorOwner(taken, value, exceptId) : undefined;
  const faint = isCustom && valid ? faintIn(value.toLowerCase()) : null;

  return (
    <fieldset className="swatches">
      <legend className="mft-field__label">Color</legend>
      {free.length === 0 && <p className="cat-editor__hint">Every preset is already used by another {noun}. Pick a custom color.</p>}
      <div className="swatches__grid">
        {free.map((key) => (
          <label key={key} className="swatch" title={label(key)}>
            <input type="radio" name={name} value={key} checked={value === key} onChange={() => onChange(key)} />
            <span className="swatch__dot" style={{ background: `var(--cat-${key})` }} />
            <span className="visually-hidden">{label(key)}</span>
          </label>
        ))}
        <label className="swatch swatch--custom" title="Custom">
          <input type="radio" name={name} value="custom" checked={isCustom} onChange={() => onChange("#c0392b")} />
          <span className="swatch__dot" style={isCustom && valid ? { background: categoryColor(value) } : undefined} />
          <span className="visually-hidden">Custom color</span>
        </label>
      </div>

      {!isCustom && error && <p className="cat-editor__error">{error}</p>}

      {isCustom && (
        <div className="swatches__custom">
          <input
            type="color"
            className="swatches__native"
            aria-label="Pick a custom color"
            value={valid ? value.toLowerCase() : "#000000"}
            onChange={(e) => onChange(e.target.value)}
          />
          <TextField
            label="Hex"
            value={value}
            maxLength={7}
            onChange={(e) => onChange(e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`)}
            error={
              !valid ? "Use 6 hex digits, like #c0392b." : clash ? `${clash.name} already uses this color. Pick another.` : error
            }
            hint={
              faint
                ? `Very ${faint}: dots and bars will be faint in ${faint} mode. Names and amounts stay readable.`
                : undefined
            }
          />
        </div>
      )}
    </fieldset>
  );
}
