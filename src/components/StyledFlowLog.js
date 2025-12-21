import React from 'react';

/**
 * A reusable component for rendering the styled "FlowLog" text.
 * The "Flow" part is styled in blue and the "Log" part in brown.
 */
const StyledFlowLog = () => (
  <span className="flowlog">
    <span className="flow">Flow</span>
    <span className="log">Log</span>
  </span>
);

export default StyledFlowLog;