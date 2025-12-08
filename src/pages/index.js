import React from 'react';
import Layout from '@theme/Layout';
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
      'Configure worst-case optimal query plans against data skew at runtime.',
  },
  {
    title: 'Dual Modes',
    description: 'Optimize under both batch and incremental execution modes.',
  },
];

const PERFORMANCE_HIGHLIGHTS = [
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
              and FlowLog efficiently maintains the results incrementally.
            </p>
          </div>
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

          <h2 className={styles.sectionHeader} id="about">
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

          <h2 className={styles.sectionHeader}>Performance</h2>
          <div className={styles.featuresGrid}>
            {PERFORMANCE_HIGHLIGHTS.map(feature => (
              <div className={styles.featureBox} key={feature.title}>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </div>
            ))}
          </div>

          <h2 className={styles.sectionHeader}>Getting Involved</h2>
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
