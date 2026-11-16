"use client";

import type { FormEvent } from "react";

import { POSTCODE_BOX_BUTTON, POSTCODE_BOX_HINT, POSTCODE_BOX_LABEL } from "../lib/home";
import { Button, TextField } from "./kit";

// M7.2 — the one postcode box, in its landing-page form. It
// renders with the kit's TextField and Button exactly as it
// will stay, and its submit is INERT (founder ruling, M7.2 gap
// check): the form carries no action, the input carries no
// validation — no pattern, no required, no error states, no
// normalisation — and a submit is simply swallowed. M7.3 wires
// the real journey (tidying, the ladder, the picker, friendly
// errors) into this same box; nothing here is built that step
// would have to unpick. A partial postcode typed here is never
// marked invalid: the ladder treats an outward code as a valid
// search, never an error.
export default function PostcodeBox() {
  const swallowSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
  };

  return (
    <form className="postcode-box" onSubmit={swallowSubmit}>
      <TextField
        id="postcode"
        name="postcode"
        label={POSTCODE_BOX_LABEL}
        hint={POSTCODE_BOX_HINT}
        placeholder="CM3 2JT"
        autoComplete="postal-code"
      />
      <Button type="submit">{POSTCODE_BOX_BUTTON}</Button>
    </form>
  );
}
