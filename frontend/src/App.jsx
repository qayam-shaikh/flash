import { AlertTriangle, Flame, Gauge, Server, Snowflake } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

function cpuLevel(cpu) {
  if (cpu >= 120) return 'high';
  if (cpu >= 55) return 'medium';
  return 'low';
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(Math.round(value || 0));
}

function useAnimatedNumber(value) {
  const [shown, setShown] = useState(value || 0);

  useEffect(() => {
    const start = shown;
    const end = value || 0;
    const startTime = performance.now();
    const duration = 500;
    let frame;

    const tick = (now) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setShown(start + (end - start) * eased);

      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return shown;
}

function PodCard({ pod }) {
  const animatedCpu = useAnimatedNumber(pod.cpu);
  const level = cpuLevel(pod.cpu);

  return (
    <article className={`pod-card pod-card--${level}`}>
      <div className="pod-card__top">
        <div className="pod-card__icon">
          <Server size={20} aria-hidden="true" />
        </div>
        <div>
          <h2 title={pod.name}>{pod.name}</h2>
          <p>{pod.node}</p>
        </div>
      </div>

      <div className="pod-card__metrics">
        <div>
          <span>CPU</span>
          <strong>{formatNumber(animatedCpu)}m</strong>
        </div>
        <div>
          <span>Memory</span>
          <strong>{pod.memory}</strong>
        </div>
      </div>

      <div className="pod-card__footer">
        <span className={`status-pill status-pill--${pod.status.toLowerCase()}`}>{pod.status}</span>
        <span>Ready {pod.ready}</span>
        <span>Restarts {pod.restarts}</span>
      </div>
    </article>
  );
}

function IncidentModal({ incident, onClose }) {
  if (!incident) return null;

  return (
    <div className="incident-shell" role="dialog" aria-modal="true">
      <div className="incident-modal">
        <div className="incident-modal__header">
          <AlertTriangle size={36} aria-hidden="true" />
          <div>
            <p>DEPLOYMENT FAILURE</p>
            <h2>Buggy code detected</h2>
          </div>
        </div>

        <dl>
          <div>
            <dt>Author</dt>
            <dd>{incident.author}</dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>{incident.version}</dd>
          </div>
          <div>
            <dt>Reason</dt>
            <dd>{incident.reason}</dd>
          </div>
          <div>
            <dt>Action</dt>
            <dd>{incident.action || 'Auto rollback'}</dd>
          </div>
        </dl>

        <p className="incident-modal__restored">
          {incident.restored || 'System restored to last stable version'}
        </p>

        <button type="button" onClick={onClose}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

function ScalingStrip({ pods, mode }) {
  const totalCpu = pods.reduce((sum, pod) => sum + pod.cpu, 0);
  const averageCpu = pods.length ? Math.round(totalCpu / pods.length) : 0;
  const pressure = averageCpu >= 80 || mode === 'chaos';
  const scaled = pods.length > 1;

  const steps = [
    { label: 'Traffic pressure', active: pressure },
    { label: 'CPU spike', active: averageCpu >= 55 },
    { label: 'HPA evaluates', active: pressure },
    { label: 'Pods scale', active: scaled }
  ];

  return (
    <section className="scaling-strip" aria-label="Scaling visualization">
      <div className="strip-summary">
        <Gauge size={24} aria-hidden="true" />
        <div>
          <h2>{averageCpu}m average CPU</h2>
          <p>{pods.length} active pod{pods.length === 1 ? '' : 's'} observed</p>
        </div>
      </div>

      <div className="timeline">
        {steps.map((step) => (
          <div className={`timeline-step ${step.active ? 'timeline-step--active' : ''}`} key={step.label}>
            <span />
            <p>{step.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function App() {
  const [pods, setPods] = useState([]);
  const [mode, setMode] = useState('cool');
  const [targetUrl, setTargetUrl] = useState('');
  const [error, setError] = useState('');
  const [cooling, setCooling] = useState(false);
  const [visibleIncident, setVisibleIncident] = useState(null);
  const latestIncidentId = useRef(null);

  async function fetchPods() {
    try {
      const response = await fetch(`${API_BASE}/api/pods`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || data.error || 'Unable to fetch pods');
      }

      setPods(data.pods || []);
      setMode(data.mode || 'cool');
      setTargetUrl(data.targetUrl || '');
      setError(data.loadError ? `Load generator error: ${data.loadError}` : '');
      if (data.mode === 'chaos') {
        setCooling(false);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function fetchIncident() {
    try {
      const response = await fetch(`${API_BASE}/api/incident/latest`);
      const incident = await response.json();

      if (incident?.id && incident.id !== latestIncidentId.current) {
        latestIncidentId.current = incident.id;
        setVisibleIncident(incident);
        window.setTimeout(() => setVisibleIncident((current) => (current?.id === incident.id ? null : current)), 7000);
      }
    } catch (err) {
      // Incident polling should never hide pod metrics if the endpoint is temporarily unavailable.
    }
  }

  async function setRemoteMode(nextMode) {
    setMode(nextMode);
    if (nextMode === 'cool') {
      setCooling(true);
      setError('');
    } else {
      setCooling(false);
    }

    const response = await fetch(`${API_BASE}/api/mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: nextMode })
    });
    const data = await response.json();

    if (!response.ok) {
      setError(data.error || 'Unable to change mode');
      return;
    }

    setMode(data.mode);
    setTargetUrl(data.targetUrl || targetUrl);
    setError(data.loadError ? `Load generator error: ${data.loadError}` : '');

    if (data.mode === 'cool') {
      window.setTimeout(() => setCooling(false), 90000);
    }
  }

  useEffect(() => {
    fetchPods();
    fetchIncident();

    const interval = window.setInterval(() => {
      fetchPods();
      fetchIncident();
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  const sortedPods = useMemo(() => [...pods].sort((a, b) => a.name.localeCompare(b.name)), [pods]);

  return (
    <main className={`app-shell app-shell--${mode}`}>
      <header className="topbar">
        <div>
          <p className="eyebrow">Minikube DevOps Lab</p>
          <h1>Flash Sale Resilient DevOps Control Panel</h1>
          <p className="target-line">Load target: {targetUrl || 'waiting for backend'}</p>
        </div>

        <div className="mode-actions" aria-label="Mode toggle">
          <button
            className={mode === 'chaos' ? 'active active--chaos' : ''}
            type="button"
            onClick={() => setRemoteMode('chaos')}
            title="Start k6 load generation"
          >
            <Flame size={18} aria-hidden="true" />
            Chaos Mode
          </button>
          <button
            className={mode === 'cool' ? 'active active--cool' : ''}
            type="button"
            onClick={() => setRemoteMode('cool')}
            title="Stop k6 load generation"
          >
            <Snowflake size={18} aria-hidden="true" />
            Cool Mode
          </button>
        </div>
      </header>

      {error ? <div className="error-banner">{error}</div> : null}
      {cooling && !error ? (
        <div className="cooling-banner">
          Load stopped. Waiting for HPA metrics to cool and scale pods down.
        </div>
      ) : null}

      <ScalingStrip pods={sortedPods} mode={mode} />

      <section className="pod-grid" aria-label="Pod dashboard">
        {sortedPods.length ? (
          sortedPods.map((pod) => <PodCard key={pod.name} pod={pod} />)
        ) : (
          <div className="empty-state">Waiting for Kubernetes pod data...</div>
        )}
      </section>

      <IncidentModal incident={visibleIncident} onClose={() => setVisibleIncident(null)} />
    </main>
  );
}
