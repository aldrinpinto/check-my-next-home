"use client";

import { AUDIENCE_CARD_BUTTON, HOME_AUDIENCE_CARDS } from "../lib/home";
import { Button, Card } from "./kit";

// M7.2 — the three audience cards, directly under the hero.
// Each card names the checks that matter to that move, in
// family language, and its button takes the visitor to the ONE
// postcode box: the page scrolls to it and keyboard focus moves
// into it. A card creates no state and implies no different
// check set — there is no audience mode; the results are the
// same for everyone.
export default function AudienceCards() {
  const goToPostcodeBox = () => {
    const box = document.getElementById("postcode");
    if (!box) return;
    box.scrollIntoView({ block: "center" });
    box.focus({ preventScroll: true });
  };

  return (
    <div className="audience-cards">
      {HOME_AUDIENCE_CARDS.map((card) => (
        <Card key={card.title} title={card.title}>
          {/* eslint-disable-next-line @next/next/no-img-element -- the illustrations are plain static assets; next/image adds nothing on a static export */}
          <img className="card__art" src={card.art} alt={card.artAlt} width="48" height="48" />
          <p>{card.line}</p>
          <p>
            <Button type="button" variant="quiet" onClick={goToPostcodeBox}>
              {AUDIENCE_CARD_BUTTON}
            </Button>
          </p>
        </Card>
      ))}
    </div>
  );
}
