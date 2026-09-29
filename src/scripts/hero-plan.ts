// Hero animation: a live query plan for
//
//   CREATE MATERIALIZED VIEW burn_by_agent AS
//   SELECT a.name, SUM(t.tokens) * price AS dollars, COUNT(*) AS calls
//   FROM token_usage t JOIN agents a ON t.agent_id = a.id
//   GROUP BY a.name;
//
// Signed delta tuples (+1 pink, −1 blue) leave the scans, get enriched by the
// join, turn into dollar deltas at the aggregate, and land in exactly one row
// of the view. Everything is drawn in a fixed virtual space and scaled to fit.

const C = {
  ins: '#ff72c6',
  del: '#7ad7ff',
  lav: '#b69cff',
  pink2: '#e58bff',
  text: '#f1ecf8',
  muted: '#a397b8',
  faint: '#6c6082',
  edge: '#2c2140',
  nodeTop: '#1c1430',
  nodeBot: '#120c1c',
  border: '#3a2b55',
};
const MONO = '"JetBrains Mono", ui-monospace, monospace';

const VW = 760; // virtual width
const VH = 600; // virtual height
const NW = 196; // node width
const NH = 78; // node height
const STAGE_MS = 1850; // time for a chip to travel one edge
const PRICE = 1e-5; // dollars per token
const DESKTOP = 1100; // keep in sync with Hero.astro

type Pt = { x: number; y: number };
type NodeKey = 'scanU' | 'scanA' | 'join' | 'agg';
type PlanNode = Pt & { sym: string; title: string; sub: string; foot: string; col: string };
type Agent = { id: number; name: string; fired?: boolean; fresh?: boolean };
type Row = {
  name: string;
  dollars: number;
  shown: number;
  calls: number;
  y: number;
  placed: boolean;
  alpha: number;
  flash: number;
  sign: number;
  ghost: { v: number; t: number } | null;
  removing: boolean;
};
type Chip = {
  t0: number;
  src: 'u' | 'a';
  sign: 1 | -1;
  stages: number;
  name: string;
  tok?: number;
  kind: 'usage' | 'fire' | 'hire';
  labels: string[];
  hit: Record<number, true>;
};

const NODES: Record<NodeKey, PlanNode> = {
  scanU: { x: 130, y: 500, sym: 'Δ', title: 'token_usage', sub: 'Δ since last refresh', foot: 'scan', col: C.ins },
  scanA: { x: 370, y: 500, sym: 'Δ', title: 'agents', sub: 'current ⊎ delta', foot: 'scan', col: C.ins },
  join: { x: 250, y: 350, sym: 'join', title: 'hash join', sub: 't.agent_id = a.id', foot: 'Z-set product of weights', col: C.lav },
  agg: { x: 250, y: 200, sym: 'Γ', title: 'aggregate', sub: 'GROUP BY a.name', foot: 'SUM(w × tokens) · COUNT(w)', col: C.lav },
};
const VIEW = { x: 440, y: 90, w: 300 };

const TASKS: [string, number][] = [
  ['fix typo', 3e3],
  ['rename variable', 12e3],
  ['rewrite in Rust', 2.1e6],
  ['explain regex', 40e3],
  ['summarize standup', 25e3],
  ['generate dbt model', 180e3],
  ['apologize', 1e3],
  ['refactor everything', 9e5],
  ['write unit tests', 60e3],
  ['argue with linter', 150e3],
  ['add emojis to README', 8e3],
];
const REFUNDS = ['duplicate billing', 'refunded', 'cancelled retry'];
const HIRES = ['intern_gpt', 'vibe_coder', 'auto_approver', 'yolo_agent_v2', 'ceo_bot'];

const fmtTok = (n: number) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : Math.round(n / 1e3) + 'k');
const fmt$ = (n: number) => '$' + n.toFixed(2);
const ease = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)]!;

function cubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, u: number): Pt {
  const v = 1 - u;
  return {
    x: v * v * v * p0.x + 3 * v * v * u * p1.x + 3 * v * u * u * p2.x + u * u * u * p3.x,
    y: v * v * v * p0.y + 3 * v * v * u * p1.y + 3 * v * u * u * p2.y + u * u * u * p3.y,
  };
}
const vBez = (a: Pt, b: Pt) => (u: number) => {
  const my = (a.y + b.y) / 2;
  return cubic(a, { x: a.x, y: my }, { x: b.x, y: my }, b, u);
};
const hBez = (a: Pt, b: Pt) => (u: number) => {
  const mx = (a.x + b.x) / 2;
  return cubic(a, { x: mx, y: a.y }, { x: mx, y: b.y }, b, u);
};
const nTop = (n: Pt, dx = 0): Pt => ({ x: n.x + dx, y: n.y - NH / 2 });
const nBot = (n: Pt, dx = 0): Pt => ({ x: n.x + dx, y: n.y + NH / 2 });
const nRight = (n: Pt): Pt => ({ x: n.x + NW / 2, y: n.y });
const rowY = (i: number) => VIEW.y + 58 + i * 32;

function mix(a: string, b: string, k: number) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const A = p(a);
  const B = p(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i]! - v) * k)).join(',')})`;
}

export function mountHeroPlan(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  const x = ctx;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ─── state ──────────────────────────────────────────────────────────
  const agents: Agent[] = [
    { id: 1, name: 'refactor_bot' },
    { id: 2, name: 'yolo_agent' },
    { id: 3, name: 'sql_whisperer' },
    { id: 4, name: 'standup_summarizer' },
  ];
  const hires = [...HIRES];
  let nextAgentId = 5;
  const view: Row[] = (
    [
      ['refactor_bot', 12.4, 31],
      ['yolo_agent', 41.2, 18],
      ['sql_whisperer', 3.1, 44],
      ['standup_summarizer', 0.85, 12],
    ] as const
  ).map(([name, d, c]) => ({
    name,
    dollars: d,
    shown: d,
    calls: c,
    y: 0,
    placed: false,
    alpha: 1,
    flash: -1e9,
    sign: 1,
    ghost: null,
    removing: false,
  }));
  const nodeState: Record<NodeKey, { pulse: number; n: number; col: string }> = {
    scanU: { pulse: -1e9, n: 0, col: C.ins },
    scanA: { pulse: -1e9, n: 0, col: C.ins },
    join: { pulse: -1e9, n: 0, col: C.ins },
    agg: { pulse: -1e9, n: 0, col: C.ins },
  };
  let chips: Chip[] = [];
  let floaters: { p: Pt; t: number; text: string }[] = [];
  let usageSinceFire = 0;
  let fired = false;
  let deltaRows = 0;
  let baseRows = 48213907;
  let nextSpawn = 0;

  // ─── simulation ─────────────────────────────────────────────────────
  function segments(c: Chip): ((u: number) => Pt)[] {
    const s = [vBez(nTop(c.src === 'u' ? NODES.scanU : NODES.scanA), nBot(NODES.join, c.src === 'u' ? -40 : 40))];
    if (c.stages < 2) return s;
    s.push(vBez(nTop(NODES.join), nBot(NODES.agg)));
    const r = view.find((r) => r.name === c.name);
    s.push(hBez(nRight(NODES.agg), { x: VIEW.x - 6, y: (r ? r.y : rowY(view.length)) + 13 }));
    return s;
  }

  function spawn(t: number) {
    const live = agents.filter((a) => !a.fired);
    if (usageSinceFire >= 9 && !fired) {
      // Fire the biggest spender: one −1 on `agents` retracts its whole group.
      const worst = view.filter((r) => !r.removing).sort((a, b) => b.dollars - a.dollars)[0];
      const a = worst && agents.find((a) => a.name === worst.name && !a.fired);
      if (worst && a) {
        a.fired = true;
        fired = true;
        usageSinceFire = 0;
        chips.push({
          t0: t, src: 'a', sign: -1, stages: 3, name: a.name, kind: 'fire', hit: {},
          labels: [`−1 · agent #${a.id} · ${a.name}`, `−${worst.calls} rows · ${a.name}`, `${a.name} · −${fmt$(worst.dollars)} · fired`],
        });
        return;
      }
    }
    if (fired && usageSinceFire >= 2) {
      // Hire a replacement: it has no usage yet, so the join emits nothing.
      fired = false;
      const name = hires.shift() ?? `agent_${nextAgentId}`;
      const a: Agent = { id: nextAgentId++, name, fresh: true };
      agents.push(a);
      chips.push({ t0: t, src: 'a', sign: 1, stages: 1, name, kind: 'hire', hit: {}, labels: [`+1 · agent #${a.id} · ${name}`] });
      return;
    }
    const fresh = live.filter((a) => a.fresh);
    const yolo = live.find((a) => a.name === 'yolo_agent');
    const a = fresh.length && Math.random() < 0.5 ? fresh[0]! : Math.random() < 0.35 && yolo ? yolo : pick(live);
    const del = Math.random() < 0.18 && view.some((r) => r.name === a.name);
    let [task, tok] = a.name.startsWith('yolo') && Math.random() < 0.5 ? pick(TASKS.filter((t) => t[1] > 1e5)) : pick(TASKS);
    tok = Math.round(tok * rnd(0.7, 1.3));
    if (del) task = pick(REFUNDS);
    const sign = del ? -1 : 1;
    const s = sign > 0 ? '+' : '−';
    usageSinceFire++;
    chips.push({
      t0: t, src: 'u', sign, stages: 3, name: a.name, tok, kind: 'usage', hit: {},
      labels: [`${s}1 · agent #${a.id} · ${task}`, `${s}1 · ${a.name} · ${fmtTok(tok)} tok`, `${a.name} · ${s}${fmt$(tok * PRICE)}`],
    });
  }

  function land(c: Chip, t: number) {
    deltaRows++;
    if (c.kind === 'usage') {
      baseRows += c.sign;
      let r = view.find((r) => r.name === c.name);
      if (!r) {
        r = { name: c.name, dollars: 0, shown: 0, calls: 0, y: rowY(view.length), placed: true, alpha: 0, flash: t, sign: 1, ghost: null, removing: false };
        view.push(r);
      }
      r.ghost = { v: r.dollars, t };
      r.dollars = Math.max(0, r.dollars + c.sign * (c.tok ?? 0) * PRICE);
      r.calls += c.sign;
      r.flash = t;
      r.sign = c.sign;
      const a = agents.find((a) => a.name === c.name);
      if (a) a.fresh = false;
    } else if (c.kind === 'fire') {
      const r = view.find((r) => r.name === c.name);
      if (r) {
        r.removing = true;
        r.flash = t;
        r.sign = -1;
        r.ghost = { v: r.dollars, t };
        r.dollars = 0;
      }
    }
  }

  // ─── drawing ────────────────────────────────────────────────────────
  const rr = (X: number, Y: number, w: number, h: number, r: number | number[]) => {
    x.beginPath();
    x.roundRect(X, Y, w, h, r);
  };

  function drawEdge(fn: (u: number) => Pt, t: number) {
    x.save();
    x.strokeStyle = C.edge;
    x.lineWidth = 2;
    x.beginPath();
    for (let i = 0; i <= 40; i++) {
      const p = fn(i / 40);
      if (i) x.lineTo(p.x, p.y);
      else x.moveTo(p.x, p.y);
    }
    x.stroke();
    x.setLineDash([2, 10]);
    x.lineDashOffset = -t / 110;
    x.strokeStyle = 'rgba(182,156,255,.28)';
    x.stroke();
    x.restore();
  }

  function drawTrail(fn: (u: number) => Pt, u: number, col: string) {
    const N = 18;
    const span = 0.35;
    x.save();
    x.lineCap = 'round';
    x.shadowColor = col;
    x.shadowBlur = 10;
    x.strokeStyle = col;
    for (let i = 0; i < N; i++) {
      const p = fn(Math.max(0, u - span * (1 - i / N)));
      const q = fn(Math.max(0, u - span * (1 - (i + 1) / N)));
      x.globalAlpha = (i / N) * 0.9;
      x.lineWidth = 1 + 2.5 * (i / N);
      x.beginPath();
      x.moveTo(p.x, p.y);
      x.lineTo(q.x, q.y);
      x.stroke();
    }
    x.restore();
  }

  function drawJoinIcon(cx: number, cy: number, s: number, col: string) {
    x.save();
    x.strokeStyle = col;
    x.lineWidth = 1.8;
    x.lineJoin = 'round';
    x.beginPath();
    x.moveTo(cx - s, cy - s * 0.7);
    x.lineTo(cx + s, cy + s * 0.7);
    x.lineTo(cx + s, cy - s * 0.7);
    x.lineTo(cx - s, cy + s * 0.7);
    x.closePath();
    x.stroke();
    x.restore();
  }

  function drawNode(n: PlanNode, st: { pulse: number; n: number; col: string }, t: number) {
    const X = n.x - NW / 2;
    const Y = n.y - NH / 2;
    const k = Math.max(0, 1 - (t - st.pulse) / 1200);
    x.save();
    if (k > 0) {
      x.shadowColor = st.col;
      x.shadowBlur = 28 * k;
    }
    const g = x.createLinearGradient(0, Y, 0, Y + NH);
    g.addColorStop(0, C.nodeTop);
    g.addColorStop(1, C.nodeBot);
    rr(X, Y, NW, NH, 12);
    x.fillStyle = g;
    x.fill();
    x.shadowBlur = 0;
    x.lineWidth = 1;
    x.strokeStyle = k > 0 ? mix(C.border, st.col, k) : C.border;
    x.stroke();
    // header strip
    x.save();
    rr(X, Y, NW, 30, [12, 12, 0, 0]);
    x.clip();
    x.fillStyle = 'rgba(182,156,255,.06)';
    x.fillRect(X, Y, NW, 30);
    x.restore();
    x.strokeStyle = 'rgba(58,43,85,.8)';
    x.beginPath();
    x.moveTo(X, Y + 30);
    x.lineTo(X + NW, Y + 30);
    x.stroke();
    // symbol badge
    const bx = X + 18;
    const by = Y + 15;
    x.fillStyle = 'rgba(0,0,0,.35)';
    x.beginPath();
    x.arc(bx, by, 10, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = n.col;
    x.lineWidth = 1.2;
    x.stroke();
    if (n.sym === 'join') drawJoinIcon(bx, by, 5, n.col);
    else {
      x.fillStyle = n.col;
      x.font = `600 12px ${MONO}`;
      x.textAlign = 'center';
      x.fillText(n.sym, bx, by + 4.2);
      x.textAlign = 'left';
    }
    x.fillStyle = C.text;
    x.font = `600 12.5px ${MONO}`;
    x.fillText(n.title, X + 36, Y + 19.5);
    // row counter
    const cnt = `Δ ${st.n}`;
    x.font = `500 10.5px ${MONO}`;
    const cw = x.measureText(cnt).width + 12;
    rr(X + NW - cw - 8, Y + 8, cw, 15, 7.5);
    x.fillStyle = k > 0 ? `rgba(255,114,198,${0.25 * k + 0.08})` : 'rgba(182,156,255,.08)';
    x.fill();
    x.fillStyle = k > 0 ? C.text : C.muted;
    x.fillText(cnt, X + NW - cw - 2, Y + 19);
    // body
    x.fillStyle = C.muted;
    x.font = `400 11px ${MONO}`;
    x.fillText(n.sub, X + 14, Y + 52);
    x.fillStyle = C.faint;
    x.font = `400 10px ${MONO}`;
    x.fillText(n.foot, X + 14, Y + 67);
    x.restore();
  }

  function drawChip(p: Pt, label: string, col: string, alpha: number) {
    x.save();
    x.globalAlpha = alpha;
    x.font = `500 11px ${MONO}`;
    const w = x.measureText(label).width + 20;
    const h = 22;
    x.shadowColor = col;
    x.shadowBlur = 16;
    rr(p.x - w / 2, p.y - h / 2, w, h, 11);
    x.fillStyle = 'rgba(10,7,16,.92)';
    x.fill();
    x.shadowBlur = 0;
    x.strokeStyle = col;
    x.lineWidth = 1.2;
    x.stroke();
    const head = label.slice(0, 2);
    x.fillStyle = col;
    x.fillText(head, p.x - w / 2 + 10, p.y + 4);
    x.fillStyle = C.text;
    x.fillText(label.slice(2), p.x - w / 2 + 10 + x.measureText(head).width, p.y + 4);
    x.restore();
  }

  function drawView(t: number, animate: boolean) {
    const { x: X, y: Y, w } = VIEW;
    const h = 58 + Math.max(view.length, 4) * 32 + 12;
    x.save();
    const g = x.createLinearGradient(0, Y, 0, Y + h);
    g.addColorStop(0, '#1a1229');
    g.addColorStop(1, '#100b19');
    x.shadowColor = 'rgba(182,156,255,.25)';
    x.shadowBlur = 40;
    rr(X, Y, w, h, 14);
    x.fillStyle = g;
    x.fill();
    x.shadowBlur = 0;
    x.strokeStyle = C.border;
    x.stroke();
    x.fillStyle = C.text;
    x.font = `600 13px ${MONO}`;
    x.fillText('burn_by_agent', X + 16, Y + 24);
    x.font = `500 9.5px ${MONO}`;
    const tag = 'MATERIALIZED VIEW';
    const tw = x.measureText(tag).width + 12;
    rr(X + w - tw - 12, Y + 12, tw, 17, 8.5);
    x.strokeStyle = 'rgba(229,139,255,.5)';
    x.stroke();
    x.fillStyle = C.pink2;
    x.fillText(tag, X + w - tw - 6, Y + 24);
    x.fillStyle = C.faint;
    x.font = `500 10px ${MONO}`;
    x.fillText('agent', X + 16, Y + 48);
    x.textAlign = 'right';
    x.fillText('calls', X + w - 92, Y + 48);
    x.fillText('dollars', X + w - 16, Y + 48);
    x.textAlign = 'left';
    x.strokeStyle = 'rgba(58,43,85,.8)';
    x.beginPath();
    x.moveTo(X + 12, Y + 54);
    x.lineTo(X + w - 12, Y + 54);
    x.stroke();

    // Leaderboard: sort by dollars, tween rows into place.
    const order = view.filter((r) => !r.removing).sort((a, b) => b.dollars - a.dollars);
    for (const r of view) {
      const ty = rowY(Math.max(0, r.removing ? view.indexOf(r) : order.indexOf(r)));
      if (!r.placed || !animate) {
        r.y = ty;
        r.placed = true;
      }
      r.y += (ty - r.y) * 0.06;
      r.shown += (r.dollars - r.shown) * 0.05;
      r.alpha = r.removing ? Math.max(0, r.alpha - 0.007) : Math.min(1, r.alpha + 0.05);
      const k = Math.max(0, 1 - (t - r.flash) / 2600);
      x.globalAlpha = r.alpha;
      if (k > 0) {
        rr(X + 8, r.y, w - 16, 27, 7);
        x.fillStyle = r.sign > 0 ? `rgba(255,114,198,${0.16 * k})` : `rgba(122,215,255,${0.16 * k})`;
        x.fill();
      }
      x.font = `500 11.5px ${MONO}`;
      x.fillStyle = r.removing ? C.del : C.text;
      x.fillText(r.name.length > 18 ? r.name.slice(0, 17) + '…' : r.name, X + 16, r.y + 18);
      x.textAlign = 'right';
      x.fillStyle = C.muted;
      x.fillText(String(Math.max(0, r.calls)), X + w - 92, r.y + 18);
      x.fillStyle = k > 0 ? (r.sign > 0 ? C.ins : C.del) : C.text;
      x.fillText(fmt$(r.shown), X + w - 16, r.y + 18);
      if (r.ghost && t - r.ghost.t < 2400) {
        const gk = (t - r.ghost.t) / 2400;
        x.globalAlpha = r.alpha * (1 - gk) * 0.8;
        x.fillStyle = C.lav;
        x.fillText(fmt$(r.ghost.v), X + w - 16, r.y + 18 - 16 * gk);
      }
      x.textAlign = 'left';
      x.globalAlpha = 1;
    }
    for (let i = view.length - 1; i >= 0; i--) if (view[i]!.removing && view[i]!.alpha <= 0) view.splice(i, 1);

    x.font = `400 10.5px ${MONO}`;
    x.fillStyle = C.faint;
    x.fillText(`Δ rows read  ${deltaRows.toLocaleString('en-US')}`, X + 2, Y + h + 24);
    x.fillText(`full recompute  ${baseRows.toLocaleString('en-US')} rows`, X + 2, Y + h + 42);
    x.restore();
  }

  // ─── sizing ─────────────────────────────────────────────────────────
  let W = 0;
  let H = 0;
  let scale = 1;
  let ox = 0;
  let oy = 0;
  function resize() {
    const d = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = Math.round(W * d);
    canvas.height = Math.round(H * d);
    // Desktop: plan lives in the right half, beside the headline.
    // Smaller screens: the canvas sits below the copy and the plan fills it.
    const region = W >= DESKTOP ? { x: W * 0.47 - 32, y: 64, w: W * 0.53 - 16, h: H - 64 } : { x: 0, y: 0, w: W, h: H };
    scale = Math.min(region.w / VW, region.h / VH, 1.2);
    ox = region.x + (region.w - VW * scale) / 2;
    oy = region.y + (region.h - VH * scale) / 2;
    x.setTransform(d * scale, 0, 0, d * scale, d * ox, d * oy);
  }

  // ─── loop ───────────────────────────────────────────────────────────
  function render(t: number, animate: boolean) {
    x.save();
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, canvas.width, canvas.height);
    x.restore();

    if (animate && t > nextSpawn) {
      spawn(t);
      nextSpawn = t + rnd(900, 1400);
    }

    drawEdge(vBez(nTop(NODES.scanU), nBot(NODES.join, -40)), t);
    drawEdge(vBez(nTop(NODES.scanA), nBot(NODES.join, 40)), t);
    drawEdge(vBez(nTop(NODES.join), nBot(NODES.agg)), t);
    drawEdge(hBez(nRight(NODES.agg), { x: VIEW.x - 6, y: NODES.agg.y }), t);

    const live: { p: Pt; label: string; col: string; a: number }[] = [];
    const keep: Chip[] = [];
    for (const c of chips) {
      const segs = segments(c);
      const T = (t - c.t0) / STAGE_MS;
      const si = Math.floor(T);
      if (si >= segs.length) {
        if (c.kind === 'hire') floaters.push({ p: nTop(NODES.join), t, text: '∅ no usage yet: nothing to join' });
        else land(c, t);
        continue;
      }
      keep.push(c);
      const u = ease(T - si);
      const col = c.sign > 0 ? C.ins : C.del;
      const at: NodeKey = si === 0 ? (c.src === 'u' ? 'scanU' : 'scanA') : si === 1 ? 'join' : 'agg';
      if (!c.hit[si]) {
        c.hit[si] = true;
        nodeState[at].pulse = t;
        nodeState[at].col = col;
        nodeState[at].n++;
      }
      drawTrail(segs[si]!, u, col);
      live.push({ p: segs[si]!(u), label: c.labels[Math.min(si, c.labels.length - 1)]!, col, a: Math.min(1, T * 4) });
    }
    chips = keep;

    for (const k of Object.keys(NODES) as NodeKey[]) drawNode(NODES[k], nodeState[k], t);
    drawView(t, animate);
    for (const l of live) drawChip(l.p, l.label, l.col, l.a);
    floaters = floaters.filter((f) => {
      const k = (t - f.t) / 3000;
      if (k > 1) return false;
      x.save();
      x.globalAlpha = 1 - k;
      x.font = `500 11px ${MONO}`;
      x.fillStyle = C.faint;
      x.textAlign = 'center';
      x.fillText(f.text, f.p.x, f.p.y - 12 - k * 18);
      x.restore();
      return true;
    });
  }

  let raf = 0;
  let visible = true;
  let started = false;
  const loop = (t: number) => {
    render(t, true);
    if (visible) raf = requestAnimationFrame(loop);
  };
  const start = () => {
    cancelAnimationFrame(raf);
    if (reduceMotion) render(performance.now(), false);
    else raf = requestAnimationFrame(loop);
  };

  const ro = new ResizeObserver(() => {
    resize();
    if (reduceMotion || !visible) render(performance.now(), false);
  });
  ro.observe(canvas);
  resize();

  let pausedAt = 0;
  const io = new IntersectionObserver(([entry]) => {
    const was = visible;
    visible = entry?.isIntersecting ?? true;
    if (!visible && was) pausedAt = performance.now();
    if (visible && !was && started) {
      // Shift timelines so chips resume where they paused instead of jumping.
      const dt = performance.now() - pausedAt;
      for (const c of chips) c.t0 += dt;
      nextSpawn += dt;
      start();
    }
  });
  io.observe(canvas);

  // Canvas text needs the web font; start once it has loaded (or give up after 1.5s).
  Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]).then(() => {
    started = true;
    start();
  });

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    io.disconnect();
  };
}
