import React from 'react';
import clsx from 'clsx';
import styles from './styles.module.css';

const FeatureList = [
  {
    title: 'Trace every flow',
    Svg: require('@site/static/img/undraw_docusaurus_mountain.svg').default,
    description: (
      <>
        Capture structured events from every Rust service and turn them into a
        navigable flow log, complete with causal links and timing data.
      </>
    ),
  },
  {
    title: 'Obsessed with developer UX',
    Svg: require('@site/static/img/undraw_docusaurus_tree.svg').default,
    description: (
      <>
        FlowLog eliminates ad-hoc dashboards: define views alongside your code
        and iterate with hot-reloadable docs plus runnable snippets.
      </>
    ),
  },
  {
    title: 'Interactive demos built-in',
    Svg: require('@site/static/img/undraw_docusaurus_react.svg').default,
    description: (
      <>
        Pair documentation with live simulations so new contributors can try
        query builders, inspectors, and alert recipes without leaving the page.
      </>
    ),
  },
];

function Feature({Svg, title, description}) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center">
        <Svg className={styles.featureSvg} role="img" />
      </div>
      <div className="text--center padding-horiz--md">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures() {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
