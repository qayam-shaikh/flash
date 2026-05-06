const cors = require('cors');
const express = require('express');
const { execFile, spawn } = require('child_process');
const path = require('path');

const app = express();
const port = Number(process.env.PORT || 4000);
const namespace = process.env.KUBE_NAMESPACE || 'default';
const podSelector = process.env.POD_SELECTOR || 'app=myapp';
const defaultTargetUrl = process.env.LOAD_TARGET_URL || 'http://127.0.0.1:30080';
const loadScript = path.resolve(__dirname, '..', 'scripts', 'load.js');

let latestIncident = null;
let loadProcess = null;
let currentMode = 'cool';
let lastLoadError = '';
let stoppingLoad = false;

app.use(cors());
app.use(express.json());

function runKubectl(args) {
  return new Promise((resolve, reject) => {
    execFile('kubectl', args, { timeout: 8000 }, (error, stdout, stderr) => {
      if (error) {
        error.message = stderr || error.message;
        reject(error);
        return;
      }

      resolve(stdout);
    });
  });
}

function runProcess(args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(args[0], args.slice(1), { timeout: 5000, ...options }, (error, stdout, stderr) => {
      if (error) {
        error.message = stderr || error.message;
        reject(error);
        return;
      }

      resolve(stdout);
    });
  });
}

function parseCpuToMillicores(value = '0') {
  if (value.endsWith('m')) return Number(value.slice(0, -1)) || 0;
  if (value.endsWith('n')) return Math.round((Number(value.slice(0, -1)) || 0) / 1000000);
  if (value.endsWith('u')) return Math.round((Number(value.slice(0, -1)) || 0) / 1000);
  return Math.round((Number(value) || 0) * 1000);
}

function parseTopPods(stdout) {
  const metricsByName = new Map();

  stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const [name, cpu = '0m', memory = '0Mi'] = line.split(/\s+/);
      metricsByName.set(name, {
        cpu: parseCpuToMillicores(cpu),
        memory,
        rawCpu: cpu
      });
    });

  return metricsByName;
}

function getReadyStatus(pod) {
  const statuses = pod.status?.containerStatuses || [];
  const readyCount = statuses.filter((status) => status.ready).length;
  return `${readyCount}/${statuses.length || 1}`;
}

function getRestartCount(pod) {
  return (pod.status?.containerStatuses || []).reduce((total, status) => total + (status.restartCount || 0), 0);
}

async function getPods() {
  const podsRaw = await runKubectl([
    'get',
    'pods',
    '-n',
    namespace,
    '-l',
    podSelector,
    '-o',
    'json'
  ]);

  let topRaw = '';
  try {
    topRaw = await runKubectl(['top', 'pods', '-n', namespace, '-l', podSelector, '--no-headers']);
  } catch (error) {
    topRaw = '';
  }

  const podList = JSON.parse(podsRaw);
  const metrics = parseTopPods(topRaw);

  return (podList.items || []).map((pod) => {
    const name = pod.metadata.name;
    const podMetrics = metrics.get(name) || { cpu: 0, memory: 'warming up', rawCpu: '0m' };

    return {
      name,
      cpu: podMetrics.cpu,
      memory: podMetrics.memory,
      status: pod.status?.phase || 'Unknown',
      ready: getReadyStatus(pod),
      restarts: getRestartCount(pod),
      node: pod.spec?.nodeName || 'pending',
      startedAt: pod.status?.startTime || null
    };
  });
}

async function stopLoad() {
  const child = loadProcess;
  loadProcess = null;
  currentMode = 'cool';
  stoppingLoad = true;
  lastLoadError = '';

  if (child?.pid) {
    const pid = child.pid;
    try {
      process.kill(-pid, 'SIGINT');
    } catch (error) {
      if (error.code !== 'ESRCH') {
        lastLoadError = error.message;
      }
    }
    forceKillIfAlive(pid);
  }

  await cleanupProjectK6Processes();
}

function forceKillIfAlive(pid) {
  if (!pid) return;

  setTimeout(() => {
    try {
      process.kill(pid, 0);
      process.kill(-pid, 'SIGKILL');
    } catch (error) {
      if (error.code !== 'ESRCH') {
        lastLoadError = error.message;
      }
    }
  }, 1500);
}

async function cleanupProjectK6Processes() {
  try {
    const stdout = await runProcess(['pgrep', '-af', 'k6']);
    const currentPid = String(process.pid);
    const loadScriptNeedle = loadScript.replace(/\\/g, '/');
    const pids = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => line.includes('k6') && line.includes(loadScriptNeedle))
      .map((line) => line.split(/\s+/)[0])
      .filter((pid) => pid && pid !== currentPid);

    for (const pid of pids) {
      try {
        process.kill(Number(pid), 'SIGTERM');
      } catch (error) {
        if (error.code !== 'ESRCH') {
          lastLoadError = error.message;
        }
      }
    }
  } catch (error) {
    if (!/exit code 1|No such process/i.test(error.message)) {
      lastLoadError = error.message;
    }
  }
}

function startLoad() {
  if (loadProcess) return;

  lastLoadError = '';
  stoppingLoad = false;
  loadProcess = spawn('k6', ['run', loadScript], {
    env: {
      ...process.env,
      TARGET_URL: defaultTargetUrl,
      VUS: process.env.K6_VUS || '20',
      WORK_MS: process.env.K6_WORK_MS || '35',
      RAMP_UP: process.env.K6_RAMP_UP || '45s',
      HOLD: process.env.K6_HOLD || '8m',
      RAMP_DOWN: process.env.K6_RAMP_DOWN || '20s'
    },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const child = loadProcess;

  child.stdout.on('data', (chunk) => {
    process.stdout.write(`[k6] ${chunk}`);
  });

  child.stderr.on('data', (chunk) => {
    process.stderr.write(`[k6] ${chunk}`);
  });

  child.on('error', (error) => {
    lastLoadError = error.message;
    if (loadProcess === child) {
      loadProcess = null;
    }
    currentMode = 'cool';
  });

  child.on('exit', (code, signal) => {
    if (loadProcess === child) {
      loadProcess = null;
    }
    currentMode = 'cool';
    if (!stoppingLoad && code && code !== 0) {
      lastLoadError = `k6 exited with code ${code}${signal ? ` (${signal})` : ''}`;
    }
    stoppingLoad = false;
  });

  currentMode = 'chaos';
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', mode: currentMode });
});

app.get('/api/pods', async (req, res) => {
  try {
    const pods = await getPods();
    res.json({
      pods,
      mode: currentMode,
      targetUrl: defaultTargetUrl,
      loadError: lastLoadError || null,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch pod data from kubectl',
      detail: error.message
    });
  }
});

app.post('/api/mode', async (req, res) => {
  const { mode } = req.body || {};

  if (!['chaos', 'cool'].includes(mode)) {
    return res.status(400).json({ error: 'mode must be "chaos" or "cool"' });
  }

  if (mode === 'chaos') startLoad();
  if (mode === 'cool') await stopLoad();

  return res.json({
    mode: currentMode,
    loadRunning: Boolean(loadProcess),
    targetUrl: defaultTargetUrl,
    loadError: lastLoadError || null
  });
});

app.post('/api/incident', (req, res) => {
  latestIncident = {
    id: `${Date.now()}`,
    author: req.body?.author || 'unknown',
    version: req.body?.version || 'unknown',
    reason: req.body?.reason || 'Deployment health check failed',
    action: req.body?.action || 'Auto rollback',
    restored: req.body?.restored || 'System restored to last stable version',
    createdAt: new Date().toISOString()
  };

  res.status(201).json(latestIncident);
});

app.get('/api/incident/latest', (req, res) => {
  res.json(latestIncident);
});

process.on('SIGINT', () => {
  stopLoad();
  process.exit(0);
});

app.listen(port, () => {
  console.log(`flash-sale-control-backend listening on ${port}`);
  console.log(`load target: ${defaultTargetUrl}`);
});
