import { HOME_HERO_HEADLINE, SITE_NAME } from "../lib/site";

export default function Home() {
  return (
    <main>
      <h1>{SITE_NAME}</h1>
      <p>{HOME_HERO_HEADLINE}</p>
      <p>Coming soon.</p>
    </main>
  );
}
