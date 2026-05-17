export default function NotFoundPage() {
  return (
    <main className="page-frame">
      <section className="setup-shell">
        <section className="setup-card">
          <p className="eyebrow">404</p>
          <h1 className="brand">Room not found</h1>
          <p className="muted">
            That page or room link does not exist anymore. Head back home, start a practice run, or open a
            new paid room.
          </p>
          <div className="button-row">
            <a className="button" href="/">
              Back home
            </a>
            <a className="button button-primary" href="/practice">
              Practice game
            </a>
          </div>
        </section>
      </section>
    </main>
  );
}
