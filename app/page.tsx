import { SITE_NAME, SITE_STRAPLINE } from "../lib/site";

export default function Home() {
  return (
    <main>
      <h1>{SITE_NAME}</h1>
      <p>{SITE_STRAPLINE}</p>
      <p>Coming soon.</p>
    </main>
  );
}
