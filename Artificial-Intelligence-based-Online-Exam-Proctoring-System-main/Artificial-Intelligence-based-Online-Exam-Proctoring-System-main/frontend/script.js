/* ============================================================
   Exam Proctor – Frontend Script
   Uses @vladmandic/face-api for browser-side face detection.
   Optimized: throttled detection loop, single model load,
   concurrent-run guard, camera-aware pausing.
   ============================================================ */

(() => {
  "use strict";

  // ── Config ────────────────────────────────────────────────
  const DETECTION_INTERVAL_MS = 400; // ~2.5 checks/sec
  const MODEL_URL =
    "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model";
  const MATCH_THRESHOLD = 0.6;

  // ── DOM refs ──────────────────────────────────────────────
  const video = document.getElementById("webcam");
  const canvas = document.getElementById("snapshot");
  const placeholder = document.getElementById("cameraPlaceholder");
  const cameraStatusEl = document.getElementById("cameraStatus");
  const cameraStatusText = document.getElementById("cameraStatusText");

  const studentIdInput = document.getElementById("studentId");
  const btnEnroll = document.getElementById("btnEnroll");
  const btnStart = document.getElementById("btnStart");
  const btnStop = document.getElementById("btnStop");
  const btnExport = document.getElementById("btnExport");

  const sessionStatusEl = document.getElementById("sessionStatus");
  const sessionChecksEl = document.getElementById("sessionChecks");
  const sessionViolationsEl = document.getElementById("sessionViolations");

  const logEmpty = document.getElementById("logEmpty");
  const logTableWrapper = document.getElementById("logTableWrapper");
  const logBody = document.getElementById("logBody");

  // ── State ─────────────────────────────────────────────────
  let stream = null;
  let enrolledDescriptor = null;
  let enrolledName = "";
  let proctoring = false;
  let checksRun = 0;
  let violationsCount = 0;
  let violations = [];
  let modelsLoaded = false;

  // Throttled-detection state
  let detectionTimerId = null; // setTimeout id for next detection
  let detectionInProgress = false; // guard against concurrent runs

  // Reuse a single detector options object
  const detectorOptions = new faceapi.TinyFaceDetectorOptions({
    inputSize: 320, // smaller = faster (default 416)
    scoreThreshold: 0.5,
  });

  // ── Helpers ───────────────────────────────────────────────
  function setStatus(text, type = "") {
    cameraStatusText.textContent = text;
    cameraStatusEl.className = "camera-status" + (type ? " " + type : "");
  }

  function setSessionStatus(text, cls) {
    sessionStatusEl.textContent = text;
    sessionStatusEl.className = "value " + cls;
  }

  function updateStats() {
    sessionChecksEl.textContent = checksRun;
    sessionViolationsEl.textContent = violationsCount;
  }

  function timestamp() {
    return new Date().toISOString().replace("T", " ").slice(0, 19);
  }

  function addViolation(type, details) {
    const ts = timestamp();
    violations.push({ ts, type, details });
    violationsCount++;
    updateStats();

    // Update log table
    logEmpty.style.display = "none";
    logTableWrapper.style.display = "";

    const tr = document.createElement("tr");
    const badgeClass =
      type === "no face"
        ? "no-face"
        : type === "multiple faces"
        ? "multi-face"
        : "mismatch";
    tr.innerHTML = `
      <td>${ts}</td>
      <td><span class="type-badge ${badgeClass}">${type}</span></td>
      <td>${details}</td>`;
    logBody.prepend(tr);

    // Audio alert
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.value = 0.15;
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (_) {
      /* silent fail */
    }
  }

  // ── Model loading (runs once) ─────────────────────────────
  async function loadModels() {
    if (modelsLoaded) return;
    setStatus("Loading face recognition model…");
    try {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
      modelsLoaded = true;
      setStatus("Models loaded — camera ready", "active");
    } catch (err) {
      console.error("Model load error:", err);
      setStatus("Failed to load models — check connection", "error");
    }
  }

  // ── Camera ────────────────────────────────────────────────
  async function startCamera() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
      video.srcObject = stream;
      await video.play();
      placeholder.style.display = "none";
      setStatus("Camera active", "active");
      btnEnroll.disabled = false;
    } catch (err) {
      console.error("Camera error:", err);
      setStatus("Camera access denied", "error");
    }
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    video.srcObject = null;
    placeholder.style.display = "";
    setStatus("Camera stopped");
    // Also stop any running detection loop
    stopDetectionLoop();
  }

  // ── Face Enrollment ───────────────────────────────────────
  async function enrollFace() {
    const name = studentIdInput.value.trim();
    if (!name) {
      alert("Please enter a Student ID first.");
      return;
    }
    if (!modelsLoaded) {
      alert("Models are still loading, please wait.");
      return;
    }

    setStatus("Enrolling face — hold still…");
    btnEnroll.disabled = true;

    // Capture a single frame descriptor
    const detection = await faceapi
      .detectSingleFace(video, detectorOptions)
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) {
      setStatus("No face detected — try again", "error");
      btnEnroll.disabled = false;
      return;
    }

    enrolledDescriptor = detection.descriptor;
    enrolledName = name;
    setStatus("Face enrolled for: " + name, "active");
    btnEnroll.disabled = false;
    btnStart.disabled = false;
  }

  // ── Single Proctoring Check ───────────────────────────────
  async function runCheck() {
    if (!proctoring || !stream || stream.getTracks().length === 0) return;
    if (detectionInProgress) return; // skip this tick – previous still running

    detectionInProgress = true;
    try {
      const detections = await faceapi
        .detectAllFaces(video, detectorOptions)
        .withFaceLandmarks()
        .withFaceDescriptors();

      checksRun++;
      updateStats();

      const count = detections.length;

      if (count === 0) {
        addViolation("no face", "Student face not visible in frame");
        return;
      }

      if (count > 1) {
        addViolation("multiple faces", `${count} faces detected in frame`);
        return;
      }

      if (enrolledDescriptor) {
        const dist = faceapi.euclideanDistance(
          detections[0].descriptor,
          enrolledDescriptor
        );
        if (dist > MATCH_THRESHOLD) {
          addViolation(
            "mismatch",
            `Distance ${dist.toFixed(3)} — enrolled face not matched`
          );
        }
      }
    } catch (err) {
      console.error("Detection error:", err);
    } finally {
      detectionInProgress = false;
    }
  }

  // ── Throttled detection loop ──────────────────────────────
  // Uses setTimeout chaining so the next tick is only scheduled
  // AFTER the previous one finishes, preventing pile-up.
  function scheduleNextDetection() {
    if (!proctoring) return;
    detectionTimerId = setTimeout(async () => {
      if (!proctoring) return;
      await runCheck();
      // Schedule next only after current completed
      scheduleNextDetection();
    }, DETECTION_INTERVAL_MS);
  }

  function startDetectionLoop() {
    stopDetectionLoop(); // clear any existing loop first
    detectionInProgress = false;
    scheduleNextDetection();
  }

  function stopDetectionLoop() {
    if (detectionTimerId !== null) {
      clearTimeout(detectionTimerId);
      detectionTimerId = null;
    }
    detectionInProgress = false;
  }

  // ── Start / Stop Proctoring ───────────────────────────────
  function startProctoring() {
    if (!enrolledDescriptor) {
      alert("Please enroll your face first.");
      return;
    }
    proctoring = true;
    btnStart.disabled = true;
    btnStop.disabled = false;
    btnEnroll.disabled = true;
    setSessionStatus("running", "status-running");
    setStatus("Proctoring active", "active");
    startDetectionLoop();
  }

  function stopProctoring() {
    proctoring = false;
    stopDetectionLoop();
    btnStart.disabled = false;
    btnStop.disabled = true;
    btnEnroll.disabled = false;
    setSessionStatus("stopped", "status-idle");
    setStatus("Proctoring stopped", "active");
  }

  // ── Export CSV ────────────────────────────────────────────
  function exportCSV() {
    if (violations.length === 0) {
      alert("No violations to export.");
      return;
    }
    const header = "Timestamp,Type,Details\n";
    const rows = violations
      .map((v) => `"${v.ts}","${v.type}","${v.details}"`)
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `violations_${enrolledName || "session"}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Event listeners ───────────────────────────────────────
  btnEnroll.addEventListener("click", enrollFace);
  btnStart.addEventListener("click", startProctoring);
  btnStop.addEventListener("click", stopProctoring);
  btnExport.addEventListener("click", exportCSV);

  // ── Init ──────────────────────────────────────────────────
  (async function init() {
    setStatus("Requesting camera access…");
    await loadModels();
    await startCamera();
  })();
})();
