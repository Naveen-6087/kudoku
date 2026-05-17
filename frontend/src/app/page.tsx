import Link from "next/link";

export default function HomePage() {
  return (
    <main className="landing-page landing-page--minimal">
      <section className="landing-grid landing-grid--minimal">
        <section className="hero-card landing-hero-card landing-hero-card--minimal">
          <p className="eyebrow">Kudoku</p>
          <h1 className="brand">Jump in fast. Practice first. Bet only when you are ready.</h1>
          <p className="muted">
            No clutter on the home screen. Start a local snake run instantly or open the paid flow,
            connect with Privy, and launch into a stake-backed room.
          </p>
          <div className="button-row landing-actions">
            <Link className="button button-primary" href="/practice">
              Practice game
            </Link>
            <Link className="button" href="/play">
              Connect wallet
            </Link>
          </div>
          <div className="landing-mini-grid">
            <div className="landing-mini-card">
              <span>Practice</span>
              <strong>Instant bots, no wallet</strong>
            </div>
            <div className="landing-mini-card">
              <span>Paid</span>
              <strong>Privy + Base Sepolia</strong>
            </div>
            <div className="landing-mini-card">
              <span>Proofs</span>
              <strong>Hidden drawer during play</strong>
            </div>
          </div>
          <div className="lava-preview" />
        </section>
      </section>
    </main>
  );
}
