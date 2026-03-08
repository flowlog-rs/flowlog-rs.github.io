import siteConfig from '@generated/docusaurus.config';

export default function prismIncludeLanguages(PrismObject) {
  const prismConfig = siteConfig?.themeConfig?.prism ?? {};
  const additionalLanguages = prismConfig.additionalLanguages ?? [];

  // Prism components work on the Prism instance on the window, while
  // prism-react-renderer uses its own Prism instance. We temporarily mount the
  // instance onto window, import components to enhance it, then remove it.
  globalThis.Prism = PrismObject;

  additionalLanguages.forEach((lang) => {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    require(`prismjs/components/prism-${lang}`);
  });

  // Custom language: FlowLog
  // Keep this intentionally small: directives + comments + literals.
  PrismObject.languages.flowlog = {
    comment: {
      pattern: /(?:\/\/|#)[^\r\n]*/,
    },
    string: {
      pattern: /"(?:\\.|[^"\\])*"/,
      greedy: true,
    },
    keyword: [
      {
        // Datalog/FlowLog directives (.decl, .input, .output, .printsize, .extern)
        pattern: /\.(?:decl|input|output|printsize|extern)\b/,
      },
      {
        // Rule separator
        pattern: /:-/,
      },
      {
        // Built-in types
        pattern: /\b(?:int8|int16|int32|int64|string|bool)\b/,
      },
      {
        // Aggregate operators
        pattern: /\b(?:count|COUNT|sum|SUM|min|MIN|max|MAX|average|AVG)\b/,
      },
      {
        // Extern function keyword
        pattern: /\bfn\b/,
      },
    ],
    boolean: /\b(?:True|False)\b/,
    number: /\b\d+\b/,
    operator: /[+\-*\/%]|[<>]=?|!=|=|!|\b(?:cat)\b/,
    punctuation: /[()\[\]{},.:]/,
  };

  delete globalThis.Prism;
}
