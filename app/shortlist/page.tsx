import ShortlistPage from "../../components/ShortlistPage";

// The shortlist page (plan step M7.5): the header's
// Shortlist item has pointed here since M7.1; this step
// builds the page. The server renders the shell and page
// furniture only — the list itself lives in the visitor's
// browser (D40) and resolves client-side from storage
// (components/ShortlistPage.tsx), so this route makes no
// serve call and works while the play server is down.
export default function ShortlistRoute() {
  return (
    <main className="journey-page main--wide">
      <h1>Your shortlist</h1>
      <p className="type-lead">
        The homes you&rsquo;ve saved, side by side. Nothing about which homes you are considering is
        stored on any server.
      </p>
      <ShortlistPage />
    </main>
  );
}
