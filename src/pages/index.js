import React from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import styles from './index.module.css';

const DOCS_CTA = '/docs/intro';
const GITHUB_CTA = 'https://github.com/flowlog-rs/flowlog';

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <p className={styles.kicker}>Flow-aware observability</p>
        <h1 className="hero__title">{siteConfig.title}</h1>
        <p className="hero__subtitle">
          {siteConfig.tagline}. Ship reliable Rust services with actionable flow
          traces and a clear audit trail.
        </p>
        <div className={styles.buttons}>
          <Link
            className="button button--secondary button--lg"
            to={DOCS_CTA}>
            Read the Docs
          </Link>
          <Link
            className={clsx(
              'button button--primary button--lg',
              styles.secondaryCta,
            )}
            to={GITHUB_CTA}
            target="_blank">
            View on GitHub
          </Link>
        </div>
      </div>
    </header>
  );
}

export default function Home() {
  return (
    <Layout
      title="FlowLog"
      description="FlowLog documentation and interactive demos">
      <HomepageHeader />
      <main>
        <HomepageFeatures />
      </main>
    </Layout>
  );
}
