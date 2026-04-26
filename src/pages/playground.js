import React, { useState, useRef, useCallback, useEffect } from 'react';
import Layout from '@theme/Layout';
import styles from './playground.module.css';

// ─── Example programs ───

const EXAMPLES = [
  {
    name: 'Reachability',
    program: `.in
.decl Source(id: number)
.input Source.csv

.decl Arc(x: number, y: number)
.input Arc.csv

.out
.decl Reach(id: number)

.rule
Reach(y) :- Source(y).
Reach(y) :- Reach(x), Arc(x, y).`,
    facts: [
      { name: 'Source.csv', csv: '1' },
      { name: 'Arc.csv', csv: '1,2\n2,3\n3,4\n4,5' },
    ],
  },
  {
    name: 'Transitive Closure',
    program: `.in
.decl Arc(x: number, y: number)
.input Arc.csv

.out
.decl Tc(x: number, y: number)

.rule
Tc(x, y) :- Arc(x, y).
Tc(x, y) :- Arc(z, y), Tc(x, z).`,
    facts: [
      { name: 'Arc.csv', csv: '1,2\n2,3\n3,4' },
    ],
  },
  {
    name: 'Pointer Analysis (Andersen)',
    program: `.in
.decl AddressOf(y: number, x: number)
.input AddressOf.csv

.decl Assign(y: number, z: number)
.input Assign.csv

.decl Load(y: number, x: number)
.input Load.csv

.decl Store(y: number, x: number)
.input Store.csv

.out
.decl PointsTo(y: number, x: number)

.rule
PointsTo(y, x) :- AddressOf(y, x).
PointsTo(y, x) :- Assign(y, z), PointsTo(z, x).
PointsTo(y, w) :- Load(y, x), PointsTo(x, z), PointsTo(z, w).
PointsTo(y, w) :- Store(y, x), PointsTo(y, z), PointsTo(x, w).`,
    facts: [
      { name: 'AddressOf.csv', csv: '1,100\n2,200' },
      { name: 'Assign.csv', csv: '3,1' },
      { name: 'Load.csv', csv: '' },
      { name: 'Store.csv', csv: '' },
    ],
  },
  {
    name: 'Connected Components',
    program: `.in
.decl Arc(x: number, y: number)
.input Arc.csv

.out
.decl CC(node: number, comp: number)

.rule
CC(node, min(node)) :- Arc(node, _).
CC(node, min(cc)) :- Arc(other, node), CC(other, cc).`,
    facts: [
      { name: 'Arc.csv', csv: '1,2\n2,3\n4,5\n5,6\n7,8' },
    ],
  },
];

const DEFAULT_SERVER = 'http://localhost:8080';

// ─── API client ───

async function apiBatchRun(server, { program, facts, workers, optimization }) {
  const factsObj = {};
  for (const f of facts) {
    if (f.name.trim()) {
      factsObj[f.name.trim()] = f.csv;
    }
  }

  const res = await fetch(`${server}/api/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      program,
      facts: factsObj,
      options: { workers, optimization },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Server error: ${res.status}`);
  }
  return res.json();
}

function createSession(server, program, workers, optimization) {
  const params = new URLSearchParams({
    workers: String(workers),
    optimization: String(optimization),
  });

  const wsUrl = server.replace(/^http/, 'ws') + `/api/session?${params}`;
  const ws = new WebSocket(wsUrl);
  return ws;
}

// ─── Component ───

export default function Playground() {
  // Editor state
  const [program, setProgram] = useState(EXAMPLES[0].program);
  const [facts, setFacts] = useState(EXAMPLES[0].facts.map(f => ({ ...f })));
  const [activeTab, setActiveTab] = useState('program'); // 'program' | 'facts'

  // Mode & config
  const [mode, setMode] = useState('batch'); // 'batch' | 'incremental'
  const [workers, setWorkers] = useState(4);
  const [optimization, setOptimization] = useState(3);
  const [server, setServer] = useState(DEFAULT_SERVER);

  // Execution state
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null); // { relations: { name: rows[][] }, stats }
  const [activeResult, setActiveResult] = useState(null);

  // Incremental mode state
  const [sessionActive, setSessionActive] = useState(false);
  const [terminalLines, setTerminalLines] = useState([]);
  const [terminalInput, setTerminalInput] = useState('');
  const wsRef = useRef(null);
  const terminalOutputRef = useRef(null);
  const terminalInputRef = useRef(null);

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalOutputRef.current) {
      terminalOutputRef.current.scrollTop = terminalOutputRef.current.scrollHeight;
    }
  }, [terminalLines]);

  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // ─── Example loading ───

  const loadExample = useCallback((idx) => {
    const ex = EXAMPLES[idx];
    if (!ex) return;
    setProgram(ex.program);
    setFacts(ex.facts.map(f => ({ ...f })));
    setResults(null);
    setActiveResult(null);
    setError(null);
  }, []);

  // ─── Facts management ───

  const addFact = useCallback(() => {
    setFacts(prev => [...prev, { name: '', csv: '' }]);
  }, []);

  const removeFact = useCallback((idx) => {
    setFacts(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const updateFact = useCallback((idx, field, value) => {
    setFacts(prev => prev.map((f, i) => i === idx ? { ...f, [field]: value } : f));
  }, []);

  // ─── Batch execution ───

  const runBatch = useCallback(async () => {
    setRunning(true);
    setError(null);
    setResults(null);
    setActiveResult(null);

    try {
      const data = await apiBatchRun(server, {
        program,
        facts,
        workers,
        optimization,
      });

      // data: { results: { RelName: "csv content", ... }, stats: { time_ms, tuples } }
      const relations = {};
      if (data.results) {
        for (const [name, csv] of Object.entries(data.results)) {
          const rows = csv
            .split('\n')
            .filter(line => line.trim() !== '')
            .map(line => line.split(','));
          relations[name] = rows;
        }
      }

      setResults({ relations, stats: data.stats || {} });
      const names = Object.keys(relations);
      if (names.length > 0) {
        setActiveResult(names[0]);
      }
    } catch (err) {
      setError(err.message || 'Failed to connect to server');
    } finally {
      setRunning(false);
    }
  }, [server, program, facts, workers, optimization]);

  // ─── Incremental session ───

  const addTerminalLine = useCallback((type, text) => {
    setTerminalLines(prev => [...prev, { type, text }]);
  }, []);

  const startSession = useCallback(() => {
    setError(null);
    setTerminalLines([]);
    setResults(null);
    setActiveResult(null);

    addTerminalLine('info', `Connecting to ${server}...`);

    try {
      const ws = createSession(server, program, workers, optimization);
      wsRef.current = ws;

      ws.onopen = () => {
        setSessionActive(true);
        addTerminalLine('success', 'Session established.');
        addTerminalLine('info', 'Program loaded. Use begin/put/file/commit/abort commands.');
        addTerminalLine('muted', 'Type "help" for available commands.');

        // Send the program to initialize the session
        ws.send(JSON.stringify({ type: 'init', program, facts: (() => {
          const obj = {};
          for (const f of facts) {
            if (f.name.trim()) obj[f.name.trim()] = f.csv;
          }
          return obj;
        })() }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'output') {
            addTerminalLine('default', msg.text);
          } else if (msg.type === 'error') {
            addTerminalLine('error', msg.text);
          } else if (msg.type === 'result') {
            // Update results pane
            const relations = {};
            if (msg.results) {
              for (const [name, csv] of Object.entries(msg.results)) {
                const rows = csv
                  .split('\n')
                  .filter(line => line.trim() !== '')
                  .map(line => line.split(','));
                relations[name] = rows;
              }
            }
            setResults({ relations, stats: msg.stats || {} });
            const names = Object.keys(relations);
            if (names.length > 0) {
              setActiveResult(prev => (prev && names.includes(prev)) ? prev : names[0]);
            }
            addTerminalLine('success', `Committed at T=${msg.stats?.timestamp ?? '?'}. ${msg.stats?.tuples ?? 0} tuple(s).`);
          } else if (msg.type === 'info') {
            addTerminalLine('info', msg.text);
          }
        } catch {
          addTerminalLine('default', event.data);
        }
      };

      ws.onerror = () => {
        addTerminalLine('error', 'WebSocket error.');
      };

      ws.onclose = () => {
        setSessionActive(false);
        addTerminalLine('muted', 'Session closed.');
        wsRef.current = null;
      };
    } catch (err) {
      setError(err.message);
    }
  }, [server, program, facts, workers, optimization, addTerminalLine]);

  const stopSession = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    setSessionActive(false);
  }, []);

  const sendCommand = useCallback((cmd) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    addTerminalLine('prompt', `>> ${cmd}`);
    wsRef.current.send(JSON.stringify({ type: 'command', command: cmd }));
  }, [addTerminalLine]);

  const handleTerminalKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && terminalInput.trim()) {
      sendCommand(terminalInput.trim());
      setTerminalInput('');
    }
  }, [terminalInput, sendCommand]);

  // ─── Render helpers ───

  const renderResultsPane = () => {
    if (!results || Object.keys(results.relations).length === 0) {
      return (
        <div className={styles.resultEmpty}>
          <div className={styles.resultEmptyIcon}>&#9655;</div>
          <div className={styles.resultEmptyText}>
            {mode === 'batch' ? 'Run a program to see results' : 'Commit a transaction to see results'}
          </div>
          <div className={styles.resultEmptyHint}>
            {mode === 'batch'
              ? 'Write your Datalog program, add input facts, and click Run'
              : 'Start a session, then use begin/put/commit commands'}
          </div>
        </div>
      );
    }

    const names = Object.keys(results.relations);
    const currentName = activeResult || names[0];
    const rows = results.relations[currentName] || [];

    return (
      <>
        <div className={styles.resultsTabs}>
          {names.map(name => (
            <button
              key={name}
              className={`${styles.resultTab} ${name === currentName ? styles.resultTabActive : ''}`}
              onClick={() => setActiveResult(name)}
            >
              {name} ({results.relations[name].length})
            </button>
          ))}
        </div>
        <div className={styles.resultsContent}>
          {rows.length === 0 ? (
            <div className={styles.resultEmpty}>
              <div className={styles.resultEmptyText}>No tuples in {currentName}</div>
            </div>
          ) : (
            <table className={styles.resultTable}>
              <thead>
                <tr>
                  {rows[0].map((_, ci) => (
                    <th key={ci}>col_{ci}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((val, ci) => (
                      <td key={ci}>{val}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </>
    );
  };

  const getTerminalLineClass = (type) => {
    switch (type) {
      case 'prompt': return styles.terminalPrompt;
      case 'error': return styles.terminalError;
      case 'success': return styles.terminalSuccess;
      case 'info': return styles.terminalInfo;
      case 'muted': return styles.terminalMuted;
      default: return '';
    }
  };

  return (
    <Layout
      title="Playground"
      description="Run FlowLog Datalog programs interactively"
    >
      <div className={styles.playgroundPage}>
        {/* ─── Header ─── */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <h1 className={styles.title}>
              <span className={styles.titleBlue}>Flow</span>
              <span className={styles.titleBrown}>Log</span> Playground
            </h1>
            <span className={styles.modeBadge}>{mode}</span>
          </div>
          <div className={styles.headerRight}>
            <div className={styles.controlGroup}>
              <span className={styles.label}>Mode</span>
              <select
                className={styles.select}
                value={mode}
                onChange={e => {
                  setMode(e.target.value);
                  setResults(null);
                  setActiveResult(null);
                  setError(null);
                  if (e.target.value === 'batch' && sessionActive) {
                    stopSession();
                  }
                }}
              >
                <option value="batch">Batch</option>
                <option value="incremental">Incremental</option>
              </select>
            </div>
            <div className={styles.controlGroup}>
              <span className={styles.label}>Workers</span>
              <input
                type="number"
                className={styles.numberInput}
                value={workers}
                min={1}
                max={64}
                onChange={e => setWorkers(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>
            <div className={styles.controlGroup}>
              <span className={styles.label}>-O</span>
              <select
                className={styles.select}
                value={optimization}
                onChange={e => setOptimization(parseInt(e.target.value))}
              >
                <option value={0}>0 (none)</option>
                <option value={1}>1 (SIP)</option>
                <option value={2}>2 (planning)</option>
                <option value={3}>3 (SIP + planning)</option>
              </select>
            </div>
            <div className={styles.serverGroup}>
              <span className={styles.label}>Server</span>
              <input
                type="text"
                className={styles.serverInput}
                value={server}
                onChange={e => setServer(e.target.value)}
                placeholder="http://localhost:8080"
              />
              <span
                className={`${styles.statusDot} ${
                  sessionActive ? styles.statusConnected :
                  running ? styles.statusConnecting :
                  styles.statusDisconnected
                }`}
                title={sessionActive ? 'Connected' : running ? 'Connecting...' : 'Disconnected'}
              />
            </div>
          </div>
        </div>

        {/* ─── Error banner ─── */}
        {error && (
          <div className={styles.errorBanner}>
            <span>{error}</span>
            <button onClick={() => setError(null)}>Dismiss</button>
          </div>
        )}

        {/* ─── Workspace ─── */}
        <div className={styles.workspace}>
          {/* ─── Left: Editor + Facts ─── */}
          <div className={styles.leftPanel}>
            <div className={styles.tabBar}>
              <button
                className={`${styles.tab} ${activeTab === 'program' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('program')}
              >
                Program
              </button>
              <button
                className={`${styles.tab} ${activeTab === 'facts' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('facts')}
              >
                Input Facts ({facts.length})
              </button>
            </div>

            {activeTab === 'program' ? (
              <div className={styles.editorPanel}>
                <div className={styles.editorToolbar}>
                  <select
                    className={styles.exampleSelect}
                    onChange={e => {
                      const idx = parseInt(e.target.value);
                      if (!isNaN(idx)) loadExample(idx);
                    }}
                    defaultValue=""
                  >
                    <option value="" disabled>Load example...</option>
                    {EXAMPLES.map((ex, i) => (
                      <option key={i} value={i}>{ex.name}</option>
                    ))}
                  </select>
                </div>
                <div className={styles.editorWrap}>
                  <textarea
                    className={styles.editor}
                    value={program}
                    onChange={e => setProgram(e.target.value)}
                    placeholder="Write your Datalog program here..."
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                  />
                </div>
              </div>
            ) : (
              <div className={styles.factsPanel}>
                <div className={styles.factsToolbar}>
                  <span className={styles.label}>
                    {facts.length} relation{facts.length !== 1 ? 's' : ''}
                  </span>
                  <button className={styles.addFactBtn} onClick={addFact}>
                    + Add Relation
                  </button>
                </div>
                {facts.length === 0 ? (
                  <div className={styles.factsEmpty}>
                    No input facts. Click "+ Add Relation" to begin.
                  </div>
                ) : (
                  <div className={styles.factsList}>
                    {facts.map((fact, idx) => (
                      <div className={styles.factEntry} key={idx}>
                        <div className={styles.factHeader}>
                          <input
                            className={styles.factNameInput}
                            value={fact.name}
                            onChange={e => updateFact(idx, 'name', e.target.value)}
                            placeholder="Relation.csv"
                          />
                          <button
                            className={styles.removeFactBtn}
                            onClick={() => removeFact(idx)}
                            title="Remove"
                          >
                            &times;
                          </button>
                        </div>
                        <textarea
                          className={styles.factCsv}
                          value={fact.csv}
                          onChange={e => updateFact(idx, 'csv', e.target.value)}
                          placeholder="CSV rows (one tuple per line)"
                          rows={3}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ─── Right: Results / Terminal ─── */}
          <div className={styles.rightPanel}>
            <div className={styles.actionBar}>
              {mode === 'batch' ? (
                <button
                  className={styles.runBtn}
                  onClick={runBatch}
                  disabled={running}
                >
                  {running ? (
                    <><span className={styles.spinner} /> Running...</>
                  ) : (
                    <><span className={styles.runBtnIcon}>&#9655;</span> Run</>
                  )}
                </button>
              ) : (
                sessionActive ? (
                  <button className={styles.stopBtn} onClick={stopSession}>
                    Stop Session
                  </button>
                ) : (
                  <button className={styles.runBtn} onClick={startSession}>
                    <span className={styles.runBtnIcon}>&#9655;</span> Start Session
                  </button>
                )
              )}

              {results?.stats && (
                <div className={styles.actionStats}>
                  {results.stats.time_ms != null && (
                    <span className={styles.statItem}>
                      Time: <span className={styles.statValue}>{results.stats.time_ms}ms</span>
                    </span>
                  )}
                  {results.stats.tuples != null && (
                    <span className={styles.statItem}>
                      Tuples: <span className={styles.statValue}>{results.stats.tuples}</span>
                    </span>
                  )}
                </div>
              )}
            </div>

            {mode === 'batch' ? (
              <div className={styles.resultsArea}>
                {renderResultsPane()}
              </div>
            ) : (
              <>
                {/* Terminal + Results split for incremental */}
                <div className={styles.terminal}>
                  <div className={styles.terminalOutput} ref={terminalOutputRef}>
                    {terminalLines.length === 0 ? (
                      <div className={styles.terminalMuted}>
                        Click "Start Session" to connect to the server and begin an incremental session.
                        {'\n\n'}Available commands after connecting:
                        {'\n'}  begin        - Start a new transaction
                        {'\n'}  put R a b    - Insert tuple (a, b) into relation R
                        {'\n'}  put R a b -1 - Delete tuple (a, b) from relation R
                        {'\n'}  file R f.csv - Load tuples from CSV file
                        {'\n'}  commit       - Commit transaction and advance time
                        {'\n'}  abort        - Rollback current transaction
                        {'\n'}  help         - Show all commands
                      </div>
                    ) : (
                      terminalLines.map((line, i) => (
                        <div
                          key={i}
                          className={`${styles.terminalLine} ${getTerminalLineClass(line.type)}`}
                        >
                          {line.text}
                        </div>
                      ))
                    )}
                  </div>
                  {sessionActive && (
                    <div className={styles.terminalInputRow}>
                      <span className={styles.terminalInputPrompt}>&gt;&gt;</span>
                      <input
                        ref={terminalInputRef}
                        className={styles.terminalInput}
                        value={terminalInput}
                        onChange={e => setTerminalInput(e.target.value)}
                        onKeyDown={handleTerminalKeyDown}
                        placeholder="begin | put Relation args | commit | abort | help"
                        autoFocus
                      />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
