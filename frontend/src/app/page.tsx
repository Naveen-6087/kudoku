import Image from "next/image";
import Link from "next/link";

const HERO_CARDS = [
  {
    label: "Live Rooms",
    value: "3 / 4 / 6 / 12"
  },
  {
    label: "Circle",
    value: "Closes fast"
  },
  {
    label: "Settlement",
    value: "Winner takes pool"
  }
] as const;

export default function HomePage() {
  return (
    <main className="home-page">
      <div aria-hidden="true" className="home-page__noise" />

      <section className="home-page__shell">
        <section className="home-page__hero">
          <div className="home-page__copy">
            <Link className="site-logo site-logo--hero" href="/">
              <Image alt="Kudoku" height={52} priority src="/logo-text.png" width={222} />
            </Link>
            <p className="home-page__kicker">Enter the arena</p>
            <h1 className="home-page__title">
              <span>SURVIVE.</span>
              <span>OUTGROW.</span>
              <span className="is-accent">WIN BIG</span>
            </h1>
            <p className="home-page__lede">Practice fast. Then step into real stake rooms and fight for the pool.</p>

            <div className="home-page__actions">
              <Link className="home-page__button home-page__button--primary" href="/practice">
                Practice
              </Link>
              <Link className="home-page__button home-page__button--secondary" href="/play">
                Play for real
              </Link>
            </div>

            <div className="home-page__card-row">
              {HERO_CARDS.map((card, index) => (
                <article
                  className={index === 0 ? "home-page__info-card home-page__info-card--gold" : "home-page__info-card"}
                  key={card.label}
                >
                  <span>{card.label}</span>
                  <strong>{card.value}</strong>
                </article>
              ))}
            </div>
          </div>

          <div className="home-page__visual">
            <div className="home-page__snake-frame">
              <Image
                alt="Kudoku hero snake"
                fill
                priority
                sizes="(max-width: 960px) 100vw, 64vw"
                src="/snake-hero.png"
              />
            </div>

            <div className="home-page__floating-card home-page__floating-card--top">
              <span>Fast queue</span>
              <strong>Jump in immediately</strong>
            </div>

            <div className="home-page__floating-card home-page__floating-card--bottom">
              <span>Provably fair</span>
              <strong>Invisible trust layer</strong>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
