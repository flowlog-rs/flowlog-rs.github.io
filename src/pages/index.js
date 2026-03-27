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
        syntax — <code>.decl</code>, <code>.input</code>, <code>.output</code>, inline facts, and more.
      </>
    ),
  },
  {
    title: 'Compile to Executable',
    description: (
      <>
        Compile <code>.dl</code> programs directly into standalone
        binaries — no intermediate Rust project to manage. Just{' '}
        <code>flowlog program.dl -o binary</code> and run.
      </>
    ),
  },
  {
    title: 'Four Execution Modes',
    description: (
      <>
        Choose <code>datalog-batch</code>, <code>datalog-inc</code>,{' '}
        <code>extend-batch</code>, or <code>extend-inc</code> via{' '}
        <code>--mode</code> to match your workload semantics.
      </>
    ),
  },
  {
    title: 'Robustness First',
    description:
      'Configure worst-case optimal query plans against runtime data skew.',
  },
  {
    title: 'Efficiency',
    description:
      'Scale (up and out) efficiently compared to state-of-the-art Datalog engines.',
  },
  {
    title: 'Extensibility',
    description: (
      <>
        Go beyond standard Datalog with <code>fixpoint</code>,{' '}
        <code>loop while</code>/<code>until</code> blocks,{' '}
        <code>@it</code> iteration counter, <code>.extern fn</code> UDFs, and <code>.include</code> for modular programs.
      </>
    ),
  },
];

const PUBLICATIONS = [
  {
    title: 'FlowLog: Efficient and Extensible Datalog via Incrementality',
    authors: 'H. Zhao, Z. Yu, S. Rao, S. Frisk, Z. Fan, P. Koutris',
    venue: 'VLDB 2026',
    href: 'https://www.vldb.org/pvldb/vol19/p361-zhao.pdf',
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

              . Write Datalog programs in{' '}
              <a
                href="https://souffle-lang.github.io/"
                target="_blank"
                rel="noreferrer">
                Soufflé
              </a>{' '}
              syntax and FlowLog compiles them into efficient, scalable executables that maintain query results incrementally.
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
                <svg className={styles.githubIcon} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                </svg>
                GitHub
              </a>
            </div>
          </div>
        </section>

        <section className={styles.contentWrapper}>
          <div className={styles.highlightBox}>
            <strong>News:</strong> FlowLog has been accepted to{' '}
            <strong>VLDB 2026</strong>. Read{' '}
            <a
              href="https://www.vldb.org/pvldb/vol19/p361-zhao.pdf"
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
