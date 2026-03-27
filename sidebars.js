/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a sidebar for each doc of that group
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.
 */

// @ts-check

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  tutorialSidebar: [
    'intro',
    {
      type: 'category',
      label: 'Getting Started',
      collapsible: true,
      link: {
        type: 'doc',
        id: 'getting-started/index',
      },
      items: [
        'getting-started/install-flowlog',
        'getting-started/write-a-program',
        'getting-started/run-it',
      ],
    },
    {
      type: 'category',
      label: 'Language',
      link: {
        type: 'doc',
        id: 'language/index',
      },
      items: [
        'language/syntax',
        'language/datatype',
        'language/relations',
        'language/rules',
        'language/expressions',
        'language/aggregation',
        'language/extern-functions',
        'language/extended-semantics',
      ],
    },
    {
      type: 'category',
      label: 'Semantics',
      collapsible: true,
      link: {
        type: 'doc',
        id: 'semantics/index',
      },
      items: [
        'semantics/naive',
        'semantics/semi-naive',
        'semantics/stratification',
      ],
    },
    // {
    //   type: 'category',
    //   label: 'Publications',
    //   items: [
    //     'publications/contributors',
    //     'publications/publications',
    //   ],
    // },
  ],
};

module.exports = sidebars;
