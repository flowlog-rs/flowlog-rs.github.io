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
      pattern: /\/\/[^\r\n]*/,
    },
    string: {
      pattern: /"(?:\\.|[^"\\])*"/,
      greedy: true,
    },
    keyword: [
      {
        // Datalog/FlowLog directives (.decl, .input, ...)
        pattern: /\.(?:decl|input|output|printsize)\b/,
      },
      {
        // Rule separator
        pattern: /:-/,
      },
      {
        // Common built-in types
        pattern: /\b(?:number|string|symbol|bool)\b/,
      },
    ],
    boolean: /\b(?:true|false)\b/,
    number: /\b\d+(?:\.\d+)?\b/,
    operator: /[+\-*\/]|[<>]=?|!=|=|\b(?:and|or|not)\b/,
    punctuation: /[()\[\]{},.:]/,
  };

  delete globalThis.Prism;
}
