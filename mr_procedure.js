/**
 * File: mr_procedure.js
 * Description: Interactive logic for MR Procedure map using JPG + HTML hotspots.
 * Author: Aditya
 * Created: 13-Nov-2025
 * Last Modified: 14-Nov-2025
 *
 * Features:
 * - Route selection and panel rendering
 * - Hotspot highlighting and keyboard support
 * - ETA/time table calculation based on a configurable time matrix
 * - Leg times displayed in hours, plus total time and final ETA
 */

/* ===========================
   Data: Fixed Route Content
   =========================== */
const routes = [
  {
    id: "routeA",
    name: "Route Alpha",
    color: "#06b6d4",
    points: [
      { id: "P", title: "Checkpoint P", objective: "Initial departure and perimeter securing.", bullets: [ "Conduct radar and visual sweep.", "Verify course alignment.", "Next point → Q" ] },
      { id: "Q", title: "Checkpoint Q", objective: "Observation and tower verification.", bullets: [ "Take tower bearing and distance.", "Report position fix.", "Next point → R" ] },
      { id: "R", title: "Checkpoint R", objective: "Resupply and comms verification.", bullets: [ "Reconfirm comms window.", "Verify resupply readiness.", "Next point → S" ] },
      { id: "S", title: "Checkpoint S", objective: "Traffic corridor clearance.", bullets: [ "Coordinate safe passage.", "Log traffic movement.", "Next point → T" ] },
      { id: "T", title: "Checkpoint T", objective: "High-point timing and mast observation.", bullets: [ "Take timing references.", "Confirm mast signals.", "Next point → U" ] },
      { id: "U", title: "Checkpoint U", objective: "Outer perimeter scan.", bullets: [ "Record sector sweep.", "Validate safe-distance limits.", "Next point → S/P" ] },
      { id: "S/P", title: "Checkpoint S/P", objective: "Final holding & route termination.", bullets: [ "Confirm return readiness.", "Record sortie completion.", "Next point → END" ] }
    ]
  },

  {
    id: "routeB",
    name: "Route Bravo",
    color: "#7c3aed",
    points: [
      { id: "S/P", title: "Checkpoint S/P", objective: "Start point for Bravo route.", bullets: [ "Verify initial briefing.", "Log starting timestamp.", "Next point → P" ] },
      { id: "P", title: "Checkpoint P", objective: "Rendezvous alignment.", bullets: [ "Confirm joining instructions.", "Match timing with Alpha unit if applicable.", "Next point → R" ] },
      { id: "R", title: "Checkpoint R", objective: "Communications and logistics check.", bullets: [ "Validate resupply corridor.", "Check generator/aux systems.", "Next point → U" ] },
      { id: "U", title: "Checkpoint U", objective: "Outer ring observation.", bullets: [ "Perform perimeter sweep.", "Log environmental conditions.", "Next point → T" ] },
      { id: "T", title: "Checkpoint T", objective: "High tower monitor checkpoint.", bullets: [ "Record timing references.", "Monitor mast signatures.", "Next point → S" ] },
      { id: "S", title: "Checkpoint S", objective: "Traffic corridor coordination.", bullets: [ "Clear corridor for movement.", "Coordinate with control tower.", "Next point → Q" ] },
      { id: "Q", title: "Checkpoint Q", objective: "Final verification before termination.", bullets: [ "Fix final position.", "Log sortie closure.", "Next point → END" ] }
    ]
  }
];

/* ===========================
   Time Matrix (minutes)
   - Edit these values to reflect real leg times
   - Keys are from -> to : minutes
   - If a direct leg is not defined, fallback is 0
   =========================== */
const timeMatrix = {
  "VOCC": { "Q": 14, "P": 12, "S/P": 20 }, // VOCC origin examples
  "P": { "Q": 14, "R": 9 },
  "Q": { "R": 12, "S/P": 10 },
  "R": { "S": 11, "U": 13 },
  "S": { "T": 9 },
  "T": { "U": 15 },
  "U": { "S/P": 8 },
  "S/P": { } // terminal
};

/* ===========================
   Cached DOM refs
   =========================== */
const routeSelect = document.getElementById('routeSelect');
const hotspotsContainer = document.getElementById('hotspots');
const btnTogglePoints = document.getElementById('btnTogglePoints');
const btnReset = document.getElementById('btnReset');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');

const panelTitle = document.getElementById('panelTitle');
const panelSub = document.getElementById('panelSub');
const panelObjective = document.getElementById('panelObjective');
const panelBullets = document.getElementById('panelBullets');

const startTimeInput = document.getElementById("startTimeInput");
const calcTimeBtn = document.getElementById("calcTimeBtn");
const etaTableBody = document.querySelector("#etaTable tbody");
const startPointSelect = document.getElementById("startPointSelect");
const etaSummary = document.getElementById("etaSummary");

/* ===========================
   Helpers and small utilities
   =========================== */
const hotspotEls = () => Array.from(document.querySelectorAll('#hotspots .hotspot'));
function getHotspotById(id){ return document.querySelector(`#hotspots .hotspot[data-id="${id}"]`); }
function setDotColor(h, color){ const dot = h.querySelector('.dot'); if(dot) dot.style.background = color; }

function minutesToHHMM(totalMinutes){
  const H = Math.floor(totalMinutes/60);
  const M = totalMinutes % 60;
  return `${String(H).padStart(2,"0")}:${String(M).padStart(2,"0")}`;
}

function formatHoursFromMinutes(minutes){
  // Convert minutes to hours decimal, 2 decimal places
  const hrs = minutes / 60;
  return hrs.toFixed(2); // e.g., 0.23
}

/* ===========================
   App state
   =========================== */
let currentRoute = routes[0];
let currentPointIndex = 0;
let activePointId = null;
let pointsVisible = true;

/* ===========================
   Initialize route dropdown
   =========================== */
function populateRoutes(){
  routeSelect.innerHTML = "";
  routes.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r.id; opt.textContent = r.name;
    routeSelect.appendChild(opt);
  });
  routeSelect.value = currentRoute.id;
}

/* ===========================
   Start Point selector population
   - includes VOCC and all points for the current route
   =========================== */
function populateStartPointOptions() {
  startPointSelect.innerHTML = "";
  // Add VOCC as a common origin option
  const optV = document.createElement('option');
  optV.value = "VOCC"; optV.textContent = "VOCC (origin)";
  startPointSelect.appendChild(optV);

  // Add route points
  (currentRoute.points || []).forEach(pt => {
    const opt = document.createElement('option');
    opt.value = pt.id; opt.textContent = pt.id + " — " + (pt.title || "");
    startPointSelect.appendChild(opt);
  });
}

/* ===========================
   Apply route tinting & render panel
   =========================== */
function showRoute(routeId){
  currentRoute = routes.find(r => r.id === routeId) || routes[0];

  hotspotEls().forEach(h => {
    const pid = h.dataset.id;
    const belongs = (currentRoute.points || []).some(pt => pt.id === pid);
    if(activePointId === pid) return;
    setDotColor(h, belongs ? currentRoute.color : '#94a3b8');
    h.style.opacity = pointsVisible ? '1' : '0.06';
  });

  if(currentRoute.points && currentRoute.points.length){
    if(currentPointIndex >= currentRoute.points.length) currentPointIndex = 0;
    renderPanel();
  } else {
    panelTitle.textContent = 'No points';
    panelSub.textContent = currentRoute.name;
    panelObjective.textContent = 'No points configured for this route.';
    panelBullets.innerHTML = '';
    unhighlightAll();
  }

  // update start point options for ETA calculations
  populateStartPointOptions();
}

/* ===========================
   Highlight / unhighlight logic
   =========================== */
function unhighlightAll(){
  hotspotEls().forEach(h => {
    h.classList.remove('selected','dim');
    const pid = h.dataset.id;
    const belongs = (currentRoute.points || []).some(pt => pt.id === pid);
    setDotColor(h, belongs ? currentRoute.color : '#94a3b8');
    h.style.opacity = pointsVisible ? '1' : '0.06';
    h.style.zIndex = 60;
  });
  activePointId = null;
}

function highlightPoint(id){
  if(activePointId === id) return;

  if(activePointId){
    const prev = getHotspotById(activePointId);
    if(prev) prev.classList.remove('selected');
  }

  hotspotEls().forEach(h => h.classList.remove('dim'));
  const target = getHotspotById(id);
  if(target){
    target.classList.add('selected');
    setDotColor(target, '#ef4444'); // selected dot becomes red
    hotspotEls().forEach(h => { if(h !== target) h.classList.add('dim'); });
    target.style.zIndex = 100; // bring forward
    target.style.opacity = pointsVisible ? '1' : '0.06';
  }
  activePointId = id;
}

/* ===========================
   Render panel content for currentPointIndex
   =========================== */
function renderPanel(){
  const pts = currentRoute.points || [];
  const p = pts[currentPointIndex];
  if(!p) return;
  panelTitle.textContent = p.title;
  panelSub.textContent = `${currentRoute.name} • Point: ${p.id}`;
  panelObjective.textContent = p.objective || '';
  panelBullets.innerHTML = '';
  (p.bullets || []).forEach(b => {
    const li = document.createElement('li'); li.textContent = b; panelBullets.appendChild(li);
  });

  prevBtn.disabled = currentPointIndex <= 0;
  nextBtn.disabled = currentPointIndex >= pts.length - 1;

  highlightPoint(p.id);
  setPointsVisibility(pointsVisible);
}

/* ===========================
   Points visibility & reset
   =========================== */
function setPointsVisibility(visible){
  pointsVisible = !!visible;
  hotspotEls().forEach(h => { h.style.opacity = visible ? '1' : '0.06'; });
  btnTogglePoints.setAttribute('aria-pressed', String(visible));
}

function resetAll(){
  unhighlightAll();
  pointsVisible = true;
  setPointsVisibility(true);
  showRoute(currentRoute.id);
}

/* ===========================
   Hotspot interactions
   - click -> activate & update panel
   - if point belongs to another route, switch route automatically
   =========================== */
hotspotsContainer.addEventListener('click', (ev) => {
  const hs = ev.target.closest && ev.target.closest('.hotspot');
  if(!hs) return;
  const pid = hs.dataset.id;

  let idx = (currentRoute.points || []).findIndex(pt => pt.id === pid);

  if(idx === -1){
    for(const r of routes){
      const f = (r.points || []).findIndex(pt => pt.id === pid);
      if(f !== -1){ currentRoute = r; showRoute(r.id); idx = f; break; }
    }
  }

  if(idx === -1){
    highlightPoint(pid);
    panelTitle.textContent = `Point ${pid}`;
    panelSub.textContent = 'No route data';
    panelObjective.textContent = 'No objective available for this specific point.';
    panelBullets.innerHTML = '';
    return;
  }

  currentPointIndex = idx;
  renderPanel();
});

/* Keyboard support on hotspots */
function attachHotspotKeyHandlers(){
  hotspotEls().forEach(h => {
    h.addEventListener('keydown', e => {
      if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); h.click(); }
      if(e.key === 'Escape'){ e.preventDefault(); resetAll(); }
    });
    h.addEventListener('focus', () => h.classList.add('focus'));
    h.addEventListener('blur', () => h.classList.remove('focus'));
  });
}

/* ===========================
   ETA Calculation Logic
   - calculateETAs(startTimeStr, startPoint)
   - returns array of rows:
     { legIndex, from, to, legTimeMin, legTimeHrs, etaHHMM }
   =========================== */

/**
 * Find leg time between two points using timeMatrix.
 * Returns integer minutes (0 if undefined).
 */
function getLegTime(from, to) {
  if (!from || !to) return 0;
  if (timeMatrix[from] && typeof timeMatrix[from][to] === "number") return timeMatrix[from][to];
  // fallback: maybe symmetric? try reverse
  if (timeMatrix[to] && typeof timeMatrix[to][from] === "number") return timeMatrix[to][from];
  return 0;
}

/**
 * Build the route traversal sequence from a start point.
 * - startPoint may be VOCC or one of route points.
 * - If startPoint is not in route, attempt to connect to route's first matching point via matrix.
 * Returns ordered array of points to traverse (including the start if it is a route point; otherwise sequence begins with first route point).
 */
function buildTraversalSequence(startPoint) {
  const seq = [];
  const routePts = currentRoute.points.map(p => p.id);

  // If startPoint is a route point, start from there
  const idx = routePts.indexOf(startPoint);
  if (idx !== -1) {
    // include startPoint and then subsequent points
    for (let i = idx; i < routePts.length; i++) seq.push(routePts[i]);
    return seq;
  }

  // startPoint not in route (e.g., VOCC). Try to find earliest reachable route point with defined leg from startPoint
  for (let i = 0; i < routePts.length; i++) {
    if (getLegTime(startPoint, routePts[i]) > 0) {
      // sequence begins at that routePts[i]
      for (let j = i; j < routePts.length; j++) seq.push(routePts[j]);
      return seq;
    }
  }

  // No direct leg found: fallback to entire route sequence
  return routePts.slice();
}

/**
 * Calculate ETAs.
 * - startTimeStr: "HH:MM" (24-hour)
 * - startPoint: "VOCC" or any point id
 * returns rows: { legIndex, from, to, legTimeMin, legTimeHrs, eta }
 */
function calculateETAs(startTimeStr, startPoint) {
  const rows = [];
  if (!startTimeStr) return rows;

  // Convert startTimeStr to minutes since midnight
  const [hStr, mStr] = startTimeStr.split(":");
  const startMinutes = (Number(hStr) || 0) * 60 + (Number(mStr) || 0);
  let currentMinutes = startMinutes;

  // Build the travel sequence
  const traversal = buildTraversalSequence(startPoint);

  // If startPoint is a route point -> first from = startPoint
  // If startPoint is not a route point (VOCC) -> first leg is VOCC -> traversal[0]
  let fromPoint = startPoint;
  let legCounter = 0;
  let totalMinutesAccum = 0;

  if (traversal.length === 0) return rows;

  // If startPoint isn't a route point, handle first leg specially
  if (startPoint !== traversal[0]) {
    const toPoint = traversal[0];
    const legTime = getLegTime(startPoint, toPoint);
    legCounter++;
    currentMinutes += legTime;
    totalMinutesAccum += legTime;
    rows.push({
      legIndex: legCounter,
      from: startPoint,
      to: toPoint,
      legTimeMin: legTime,
      legTimeHrs: formatHoursFromMinutes(legTime),
      eta: minutesToHHMM(currentMinutes)
    });
    fromPoint = toPoint;
  }

  // Now iterate through traversal sequence from fromPoint to end
  const routeSeq = traversal;
  for (let i = 0; i < routeSeq.length - 1; i++) {
    const from = routeSeq[i];
    const to = routeSeq[i + 1];
    const legTime = getLegTime(from, to);
    legCounter++;
    currentMinutes += legTime;
    totalMinutesAccum += legTime;
    rows.push({
      legIndex: legCounter,
      from,
      to,
      legTimeMin: legTime,
      legTimeHrs: formatHoursFromMinutes(legTime),
      eta: minutesToHHMM(currentMinutes)
    });
  }

  // attach total minutes & final ETA (if any rows exist)
  rows.totalMinutes = totalMinutesAccum;
  rows.finalEta = rows.length ? rows[rows.length - 1].eta : minutesToHHMM(startMinutes);

  return rows;
}

/* ===========================
   Rendering ETA Table in UI
   - displays leg times in hours
   - shows total time (hours and minutes) and final ETA
   =========================== */
function renderETATable() {
  const startTime = startTimeInput.value;
  if (!startTime) {
    alert("Enter a starting time first (HH:MM).");
    return;
  }

  const startPoint = startPointSelect.value || "VOCC";
  const rows = calculateETAs(startTime, startPoint);

  etaTableBody.innerHTML = "";
  etaSummary.innerHTML = "";

  if (rows.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="5" class="py-2 text-center">No legs available or missing time-matrix entries.</td>`;
    etaTableBody.appendChild(tr);
    return;
  }

  rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="py-1">${r.legIndex}</td>
      <td class="py-1">${r.from}</td>
      <td class="py-1">${r.to}</td>
      <td class="py-1">${r.legTimeHrs} h</td>
      <td class="py-1">${r.eta}</td>
    `;
    etaTableBody.appendChild(tr);
  });

  // Totals
  const totalMinutes = rows.totalMinutes || 0;
  const totalHoursDecimal = (totalMinutes / 60);
  const totalHoursFormatted = totalHoursDecimal.toFixed(2);
  const finalEta = rows.finalEta || minutesToHHMM( (startTimeInput.value ? (Number(startTimeInput.value.split(':')[0])*60 + Number(startTimeInput.value.split(':')[1])) : 0) + totalMinutes );

  // Summary HTML
  etaSummary.innerHTML = `
    <div class="flex justify-between items-center gap-4">
      <div>
        <div>Total time: <strong>${totalHoursFormatted} h</strong> (${totalMinutes} min)</div>
      </div>
      <div>
        <div>Final ETA: <strong>${finalEta}</strong></div>
      </div>
    </div>
  `;
}

/* ===========================
   Wire UI buttons
   =========================== */
btnTogglePoints.addEventListener('click', () => setPointsVisibility(!pointsVisible));
btnReset.addEventListener('click', resetAll);

prevBtn.addEventListener('click', () => { if(currentPointIndex > 0){ currentPointIndex--; renderPanel(); } });
nextBtn.addEventListener('click', () => { if(currentPointIndex < (currentRoute.points||[]).length - 1){ currentPointIndex++; renderPanel(); } });

routeSelect.addEventListener('change', (e) => { showRoute(e.target.value); attachHotspotKeyHandlers(); });
calcTimeBtn.addEventListener('click', renderETATable);

/* ===========================
   Initialization
   =========================== */
(function init(){
  populateRoutes();
  populateStartPointOptions();
  showRoute(currentRoute.id);
  setPointsVisibility(true);
  attachHotspotKeyHandlers();

  prevBtn.setAttribute('aria-label','Previous checkpoint');
  nextBtn.setAttribute('aria-label','Next checkpoint');

  // prevent document scroll (panel handles scrolling)
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';
})();
