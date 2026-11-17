import { HOME_HOW_IT_WORKS_STEPS } from "../lib/home";

// "How it works" (founder follow-on to D70, 17 Nov 2026):
// the decided landing page's four numbered steps, verbatim
// — the number in its Forest circle, then the step's title
// and line. An ordered list: the sequence is the content.
export default function HowItWorks() {
  return (
    <ol className="how-steps">
      {HOME_HOW_IT_WORKS_STEPS.map((step, index) => (
        <li className="how-step" key={step.title}>
          <span className="how-step__n" aria-hidden="true">
            {index + 1}
          </span>
          <h3 className="how-step__title">{step.title}</h3>
          <p className="how-step__line">{step.line}</p>
        </li>
      ))}
    </ol>
  );
}
