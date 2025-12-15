import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import styles from './index.module.css';

const KEY_FEATURES = [
  {
    title: 'Soufflé Language',
    description: (
      <>
        Write Datalog in the established{' '}
        <a
          href="https://souffle-lang.github.io/"
          target="_blank"
          rel="noreferrer">
          Soufflé
        </a>{' '}
        syntax.
      </>
    ),
  },
  {
    title: 'Robustness-first',
    description:
      'Configure worst-case optimal query plans against runtime data skew.',
  },
  {
    title: 'Dual Modes',
    description: 'Optimize under both batch and incremental execution modes.',
  },
  {
    title: 'Efficiency',
    description:
      'Scale (up and out) efficiently compared to state-of-the-art Datalog engines.',
  },
  {
    title: 'Extensibility',
    description:
      'Easy to extend to any relational programs in operational semantics.',
  },
  {
    title: 'Outlook',
    description: 'Many novel optimization opportunities left on the table.',
  },
];

const HERO_STATS = [
  { value: '10x', label: 'Faster incremental refreshes' },
  { value: '15+', label: 'Benchmarks maintained' },
  { value: '5', label: 'Active research collaborations' },
];

const PUBLICATIONS = [
  {
    title: 'FlowLog: Efficient and Extensible Datalog via Incrementality',
    authors: 'H. Zhao, Z. Yu, S. Rao, S. Frisk, Z. Fan, P. Koutris',
    venue: 'VLDB 2026',
    href: 'https://arxiv.org/pdf/2511.00865',
  },
  {
    title: 'Evaluating Datalog over Semirings: A Grounding-based Approach',
    authors: 'H. Zhao, S. Deep, P. Koutris, S. Roy, V. Tannen',
    venue: 'PODS 2024',
    href: 'https://dl.acm.org/doi/10.1145/3651591',
  },
  {
    title: 'Evaluating Datalog via Structure-Aware Rewriting',
    authors: 'H. Zhao, S. Deep, P. Koutris',
    venue: 'Datalog 2.0 2024',
    href: 'https://ceur-ws.org/Vol-3801/short4.pdf',
  },
  {
    title: 'Predicate Transfer: Efficient Pre-Filtering on Multi-Join Queries',
    authors: 'Y. Yang, H. Zhao, X. Yu, P. Koutris',
    venue: 'CIDR 2024',
    href: 'https://www.cidrdb.org/cidr2024/papers/p22-yang.pdf',
  },
];

export default function Home() {
  return (
    <Layout
      title="FlowLog - Efficient and Extensible Datalog"
      description="FlowLog: Efficient and Extensible Datalog via Incrementality">
      <main className={styles.flowlogPage}>
        <section className={styles.hero}>
          <img
            src="/img/flowlog.png"
            alt="FlowLog Logo"
            className={styles.heroImage}
          />
          <div className={styles.heroText}>
            <h1>
              <span className={styles.heroAccentBlue}>Flow</span>
              <span className={styles.heroAccentBrown}>Log</span>
            </h1>
            <p>
              A{' '}
              <a
                href="https://en.wikipedia.org/wiki/Datalog"
                target="_blank"
                rel="noreferrer">
                Datalog
              </a>{' '}
              engine powered by{' '}
              <a
                href="https://crates.io/crates/differential-dataflow"
                target="_blank"
                rel="noreferrer">
                Differential Dataflow
              </a>
              . You write Datalog queries in{' '}
              <a
                href="https://souffle-lang.github.io/"
                target="_blank"
                rel="noreferrer">
                Soufflé
              </a>{' '}
              and FlowLog efficiently maintains the query results incrementally.
            </p>
            <div className={styles.heroActions}>
              <Link
                className={styles.primaryButton}
                to="/tutorial/intro">
                Get Started
              </Link>
              <a
                className={styles.secondaryButton}
                href="https://github.com/flowlog-rs"
                target="_blank"
                rel="noreferrer">
                Explore the code
              </a>
            </div>
          </div>
        </section>

        <section className={styles.heroStats} aria-label="FlowLog highlights">
          {HERO_STATS.map(stat => (
            <div className={styles.statCard} key={stat.label}>
              <span className={styles.statValue}>{stat.value}</span>
              <span className={styles.statLabel}>{stat.label}</span>
            </div>
          ))}
        </section>

        <section className={styles.contentWrapper}>
          <div className={styles.highlightBox}>
            <strong>News:</strong> FlowLog has been accepted to{' '}
            <strong>VLDB 2026</strong>. Read{' '}
            <a
              href="https://arxiv.org/pdf/2511.00865"
              target="_blank"
              rel="noreferrer">
              it
            </a>{' '}
            now.
          </div>

          <h2 id="about">
            Key Features
          </h2>
          <div className={styles.featuresGrid}>
            {KEY_FEATURES.map(feature => (
              <div className={styles.featureBox} key={feature.title}>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </div>
            ))}
          </div>

          <h2>Publications</h2>
          <div className={styles.publicationsGrid}>
            {PUBLICATIONS.map(pub => (
              <article className={styles.publicationCard} key={pub.title}>
                <h3>
                  <a href={pub.href} target="_blank" rel="noreferrer">
                    {pub.title}
                  </a>
                </h3>
                <p className={styles.publicationAuthors}>{pub.authors}</p>
                <p className={styles.publicationVenue}>{pub.venue}</p>
              </article>
            ))}
          </div>

          <div className={styles.ctaPanel}>
            <h3>Ready to experiment?</h3>
            <p>
              Reproduce our VLDB results, plug in your Soufflé programs, or
              chat with us about shaping the roadmap. FlowLog thrives on
              real-world workloads.
            </p>
            <div className={styles.ctaActions}>
              <Link className={styles.primaryButton} to="/tutorial/intro">
                Learn More
              </Link>
              <a
                className={styles.secondaryButton}
                href="mailto:hangdong@cs.wisc.edu">
                Contact the team
              </a>
            </div>
          </div>

          <h2>Getting Involved</h2>
          <div className={styles.gettingInvolved}>
            <p>
              FlowLog is open-source on GitHub{' '}
              <a
                href="https://github.com/flowlog-rs"
                target="_blank"
                rel="noreferrer"
                className={styles.repoHighlight}>
                flowlog-rs
              </a>{' '}
              under active development. If you're interested in discussing
              FlowLog query optimizations, email at{' '}
              <a href="mailto:hangdong@cs.wisc.edu">hangdong@cs.wisc.edu</a>.
            </p>
          </div>
        </section>
      </main>
    </Layout>
  );
}
