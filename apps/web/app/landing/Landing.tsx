import type { ReactNode } from 'react';
import styles from './landing.module.css';
import { buildWhatsAppLink } from './whatsapp';
import {
  CONTROL,
  FAQ,
  FINAL_CTA,
  HERO,
  HOW_IT_WORKS,
  PILLARS,
  PREFILLED_MESSAGE,
  PRICING,
  PROACTIVE,
} from './content';

/**
 * Sem número configurado o CTA cai na seção de preço, em vez de gerar um link quebrado.
 * NEXT_PUBLIC_* precisa ser lido literalmente aqui pra o Next inlinar no build.
 */
const whatsappLink = buildWhatsAppLink(process.env.NEXT_PUBLIC_TOM_WHATSAPP_NUMBER, PREFILLED_MESSAGE);
const ctaHref = whatsappLink ?? '#precos';

function CtaButton({ label }: { label: string }) {
  return (
    <a className={styles.cta} href={ctaHref}>
      {label}
    </a>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className={styles.section} aria-labelledby={id}>
      <h2 id={id} className={styles.h2}>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function Landing() {
  const year = new Date().getFullYear();

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <span className={styles.brand}>Tom</span>
        <a className={styles.login} href="/login">
          Entrar
        </a>
      </header>

      <main className={styles.main}>
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroText}>
            <p className={styles.eyebrow}>{HERO.eyebrow}</p>
            <h1 id="hero-title" className={styles.h1}>
              {HERO.title}
            </h1>
            <p className={styles.lead}>{HERO.subtitle}</p>
            <div className={styles.ctaGroup}>
              <CtaButton label={HERO.ctaLabel} />
              <p className={styles.micro}>{HERO.microcopy}</p>
            </div>
          </div>

          <div className={styles.chat}>
            {HERO.chat.map((message, index) => (
              <p
                key={index}
                className={message.from === 'user' ? styles.bubbleUser : styles.bubbleTom}
              >
                {message.text}
              </p>
            ))}
          </div>
        </section>

        <Section id="pilares" title={PILLARS.title}>
          <p className={styles.intro}>{PILLARS.intro}</p>
          <div className={styles.grid}>
            {PILLARS.groups.map((group) => (
              <article key={group.tag} className={styles.card}>
                <p className={styles.tag}>{group.tag}</p>
                <h3 className={styles.h3}>{group.title}</h3>
                <ul className={styles.list}>
                  {group.items.map((item) => (
                    <li key={item.title}>
                      <strong>{item.title}.</strong> {item.text}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </Section>

        <Section id="proativo" title={PROACTIVE.title}>
          <p className={styles.intro}>{PROACTIVE.intro}</p>
          <div className={styles.grid}>
            {PROACTIVE.items.map((item) => (
              <article key={item.title} className={styles.card}>
                <h3 className={styles.h3}>{item.title}</h3>
                <p className={styles.body}>{item.text}</p>
              </article>
            ))}
          </div>
        </Section>

        <Section id="como-funciona" title={HOW_IT_WORKS.title}>
          <ol className={styles.steps}>
            {HOW_IT_WORKS.steps.map((step) => (
              <li key={step.title} className={styles.step}>
                <h3 className={styles.h3}>{step.title}</h3>
                <p className={styles.body}>{step.text}</p>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="controle" title={CONTROL.title}>
          <ul className={styles.checks}>
            {CONTROL.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Section>

        <Section id="precos" title={PRICING.title}>
          <article className={styles.priceCard}>
            <p className={styles.price}>
              {PRICING.price}
              <span className={styles.period}>{PRICING.period}</span>
            </p>
            <p className={styles.body}>{PRICING.trialLine}</p>
            <ul className={styles.checks}>
              {PRICING.includes.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <CtaButton label={HERO.ctaLabel} />
            <p className={styles.micro}>{PRICING.payment}</p>
          </article>
        </Section>

        <Section id="faq" title={FAQ.title}>
          <div className={styles.faq}>
            {FAQ.items.map((item) => (
              <details key={item.question} className={styles.faqItem}>
                <summary className={styles.faqQuestion}>{item.question}</summary>
                <p className={styles.body}>{item.answer}</p>
              </details>
            ))}
          </div>
        </Section>

        <section className={styles.finalCta} aria-labelledby="final-cta">
          <h2 id="final-cta" className={styles.h2}>
            {FINAL_CTA.title}
          </h2>
          <CtaButton label={FINAL_CTA.ctaLabel} />
        </section>
      </main>

      <footer className={styles.footer}>
        <span>© {year} ZapBuddy · Tom</span>
        <a className={styles.login} href="/login">
          Entrar
        </a>
      </footer>
    </div>
  );
}
