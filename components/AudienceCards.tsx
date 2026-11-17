import { HOME_AUDIENCE_CARDS } from "../lib/home";
import { Card } from "./kit";

// M7.2 — the three audience cards, directly under the hero.
// D70 R3 gives them the design's form: text only — a title,
// a one-line intro and the family-language check list, in
// the decided landing page's words. A card creates no state
// and implies no different check set — there is no audience
// mode; the results are the same for everyone. (M7.2's
// per-card art and "Start with a postcode" button were
// build inventions the design does not carry; the art moved
// to the hero's imagery strip, and the page's one postcode
// box sits directly above the cards.)
export default function AudienceCards() {
  return (
    <div className="audience-cards">
      {HOME_AUDIENCE_CARDS.map((card) => (
        <Card key={card.title} title={card.title}>
          <p>{card.intro}</p>
          <ul className="card__checks">
            {card.checks.map((check) => (
              <li key={check}>{check}</li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
