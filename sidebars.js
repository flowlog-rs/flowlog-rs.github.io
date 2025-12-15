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
      items: [
        'getting-started/install-flowlog',
        'getting-started/simple-example',
        'getting-started/run-flowlog',
        'getting-started/examples',
      ],
    },
    {
      type: 'category',
      label: 'Tutorial',
      items: [
        'tutorial/end-to-end',
        'tutorial/regression-harness',
      ],
    },
    {
      type: 'category',
      label: 'Language',
      items: [
        'language/overview',
        'language/limitations',
        'language/background',
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
