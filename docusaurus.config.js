// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

const lightCodeTheme = require('prism-react-renderer/themes/github');
const darkCodeTheme = require('prism-react-renderer/themes/dracula');

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'FlowLog',
  tagline: 'A Rust-based Flow Log Analyzer',
  url: 'https://flowlog-rs.github.io',
  baseUrl: '/',
  deploymentBranch: 'gh-pages',
  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',
  favicon: 'img/flowlog.png',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'flowlog-rs', // Usually your GitHub org/user name.
  projectName: 'flowlog-rs.github.io', // Usually your repo name.

  // Even if you don't use internalization, you can use this field to set useful
  // metadata like html lang. For example, if your site is Chinese, you may want
  // to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: require.resolve('./sidebars.js'),
          routeBasePath: 'tutorial',
        },
        // blog: {
        //   showReadingTime: true,
        // },
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
      }),
    ],
  ],

  plugins: [
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'developers',
        path: 'developers',
        routeBasePath: 'developers',
        sidebarPath: require.resolve('./sidebarsDevelopers.js'),
      },
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      navbar: {
        title: 'FlowLog',
        logo: {
          alt: 'FlowLog Logo',
          src: 'img/flowlog.png',
        },
        items: [
          {
            type: 'doc',
            docId: 'intro',
            position: 'left',
            label: 'Tutorial',
          },
          // {
          //   type: 'doc',
          //   docsPluginId: 'developers',
          //   docId: 'intro',
          //   position: 'left',
          //   label: 'Developers',
          // },
          // {to: '/blog', label: 'Blog', position: 'left'},
          {
            href: 'https://github.com/flowlog-rs/FlowLog-VLDB',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'FlowLog',
            items: [
              {
                html: `
                  <div class="footer__brand">
                  <p class="footer__description">
                    An efficient, extensible, and scalable Datalog engine.
                  </p>
                  </div>
                `,
              },
            ],
          },
          {
            title: 'Docs',
            items: [
              {
                label: 'Tutorial',
                to: '/tutorial/intro',
              },
              {
                label: 'Developers',
                to: '/developers/intro',
              },
            ],
          },
          {
            title: 'Resources',
            items: [
              // {
              //   label: 'Blog',
              //   to: '/blog',
              // },
              {
                label: 'GitHub',
                href: 'https://github.com/flowlog-rs/FlowLog-VLDB',
              },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} FlowLog.`,
      },
      prism: {
        theme: lightCodeTheme,
        darkTheme: darkCodeTheme,
      },
    }),
};

module.exports = config;
