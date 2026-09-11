import React from 'react';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

export default function SlackLink({children, className}) {
  const {siteConfig} = useDocusaurusContext();

  return (
    <a
      href={siteConfig.customFields.slackInviteUrl}
      className={className}
      target="_blank"
      rel="noopener noreferrer">
      {children}
    </a>
  );
}
