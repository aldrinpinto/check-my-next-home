import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

// M7.1 — the look & feel kit's blocks, built once and used
// everywhere (website now, the M8 report later). Each block is
// a thin wrapper over the kit's classes in app/globals.css:
// the tokens and styles live there, these components carry the
// markup pattern (labels wired to inputs, table cells carrying
// their stacked-row labels, notices carrying a wording label)
// so no page re-decides it. Blocks with behaviour (tabs) live
// in their own component files.

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "quiet" | "ink";
};

export function Button({ variant = "primary", className, ...props }: ButtonProps) {
  const classes = ["btn", `btn--${variant}`, className].filter(Boolean).join(" ");
  return <button className={classes} {...props} />;
}

type TextFieldProps = {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  success?: string;
} & InputHTMLAttributes<HTMLInputElement>;

// The one text-input block: the postcode box, the calculators'
// labelled numeric inputs and the claim page's email form all
// render through this, so their states can never fork. Error
// and success are wording as well as colour — never colour
// alone — and the message is wired to the input for screen
// readers.
export function TextField({ id, label, hint, error, success, ...inputProps }: TextFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const messageId = error || success ? `${id}-message` : undefined;
  const describedBy = [hintId, messageId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {hint && (
        <p className="field__hint" id={hintId}>
          {hint}
        </p>
      )}
      <input
        className="field__input"
        id={id}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        {...inputProps}
      />
      {error && (
        <p className="field__message field__message--error" id={messageId} role="alert">
          {error}
        </p>
      )}
      {!error && success && (
        <p className="field__message field__message--success" id={messageId}>
          {success}
        </p>
      )}
    </div>
  );
}

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="card">
      {title && <h3 className="card__title">{title}</h3>}
      {children}
    </section>
  );
}

// The pill family (D70 R5 — one family, see
// app/globals.css): a label, and where the fact carries
// one, its figure as the tinted distance chip, coloured by
// the figure's own band. Colour sits on the figure only —
// the pill itself is never coloured. A pill with no figure
// is the family's fact form. The model is lib/results.ts's
// SummaryPill; pillText there recomposes the served string.
export function SummaryPill({
  label,
  figure,
  band,
  mark,
}: {
  label: string;
  figure?: string | null;
  band?: "green" | "orange" | "red" | null;
  mark?: string;
}) {
  return (
    <span className="pill pill--summary">
      <span className="pill__label">{label}</span>
      {figure && <span className={`pill__figure pill__figure--${band ?? "green"}`}>{figure}</span>}
      {mark && <span className="pill__mark">{mark}</span>}
    </span>
  );
}

// The autocomplete dropdown's visual shell (D70; the
// founder's 17 Nov ruling): a grouped suggestion panel —
// AREAS, then PROPERTIES — that sits under the search box.
// Presentation only: no address-data source is wired to it
// yet (priced separately), so the box renders it only when
// a future source hands it groups; the kitchen sink carries
// its specimen.
export interface SuggestionGroup {
  label: string;
  items: string[];
}

export function SuggestionShell({ groups }: { groups: SuggestionGroup[] }) {
  if (groups.length === 0) return null;
  return (
    <div className="postcode-box__suggestions">
      {groups.map((group) => (
        <div className="suggest__group" key={group.label}>
          <p className="suggest__group-label">{group.label}</p>
          <ul className="suggest__list" role="listbox" aria-label={group.label}>
            {group.items.map((item) => (
              <li key={item}>
                <button type="button" className="suggest__item" role="option" aria-selected="false">
                  {item}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

const NOTICE_LABELS = {
  warning: "Warning",
  stale: "Out of date",
  gap: "Not in the data we hold",
} as const;

export type NoticeVariant = keyof typeof NOTICE_LABELS;

// One notice block for the lines that travel with the facts:
// a warning (the flood warning renders first among them,
// M7.4), a stale line, and a named-gap line.
export function Notice({ variant, children }: { variant: NoticeVariant; children: ReactNode }) {
  return (
    <div className={`notice notice--${variant}`} role="note">
      <span className="notice__label">{NOTICE_LABELS[variant]}</span>
      {children}
    </div>
  );
}

// The results table. Every cell carries its column's name as
// data-label, which the stacked-row phone form (app/globals.css)
// prints beside the value.
export function DataTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: string[][];
}) {
  return (
    <table className="table">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column} scope="col">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((cell, cellIndex) => (
              <td key={cellIndex} data-label={columns[cellIndex]}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// The small line that names where facts came from and when —
// the caption/source line every section carries (D13).
export function SourceLine({ children }: { children: ReactNode }) {
  return <p className="source-line">{children}</p>;
}
