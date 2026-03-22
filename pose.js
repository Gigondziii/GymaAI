// ============================================
// GYMA — POSE DETECTION (Client-Side Web ML)
// Replaces the old Python camera_backend.py with in-browser Mediapipe
// ============================================

const PoseDetector = (() => {
  let onFrameCb = null;
  let isRunning = false;
  let lastFrameSrc = null;
  
  let poseLandmarker = null;
  let videoEl = null;
  let canvasEl = null;
  let ctx = null;
  let lastVideoTime = -1;
  let animationRef = null;

  // Calibration locals
  let calib_frames = 0;
  let default_shoulder_y = null;

  async function load() {
    if (poseLandmarker) return;
    console.log('[Pose] Loading MediaPipe models...');
    
    // Dynamically inject MediaPipe
    const vision = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0");
    const { PoseLandmarker, FilesetResolver } = vision;

    const filesetResolver = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
    );
    
    poseLandmarker = await PoseLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      numPoses: 1
    });

    console.log('[Pose] Model loaded successfully');
  }

  function calcAngle(a, b, c) {
    if (!a || !b || !c) return undefined;
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs(radians * 180.0 / Math.PI);
    if (angle > 180.0) angle = 360 - angle;
    return angle;
  }

  async function start(vEl, cEl, callback) {
    if (isRunning) stop();
    isRunning = true;
    onFrameCb = callback;
    videoEl = vEl;
    canvasEl = cEl;
    ctx = canvasEl.getContext('2d');
    
    await load();
    if (videoEl.readyState >= 2) predictReady();
    else videoEl.onloadeddata = predictReady;
  }

  function predictReady() {
    if (!isRunning) return;
    canvasEl.width = videoEl.videoWidth;
    canvasEl.height = videoEl.videoHeight;
    requestAnimationFrame(predictWebcam);
  }

  async function predictWebcam() {
    if (!isRunning) return;
    if (videoEl.currentTime !== lastVideoTime) {
      lastVideoTime = videoEl.currentTime;

      poseLandmarker.detectForVideo(videoEl, performance.now(), (result) => {
        ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
        
        ctx.save();
        ctx.translate(canvasEl.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
        ctx.restore();

        let confidence = 0.0;
        let angles_dict = {};

        if (result.landmarks && result.landmarks.length > 0) {
          const lms = result.landmarks[0];
          confidence = lms.reduce((acc, lm) => acc + (lm.visibility || 0), 0) / lms.length;

          function getPt(idx) {
            const p = lms[idx];
            if (!p || p.visibility < 0.2) return null;
            return { x: p.x * canvasEl.width, y: p.y * canvasEl.height };
          }

          const pts = {
            ls: getPt(11), rs: getPt(12), le: getPt(13), re: getPt(14),
            lw: getPt(15), rw: getPt(16), lh: getPt(23), rh: getPt(24),
            lk: getPt(25), rk: getPt(26), la: getPt(27), ra: getPt(28)
          };

          angles_dict['leftKnee'] = calcAngle(pts.lh, pts.lk, pts.la);
          angles_dict['rightKnee'] = calcAngle(pts.rh, pts.rk, pts.ra);
          angles_dict['leftHip'] = calcAngle(pts.ls, pts.lh, pts.lk);
          angles_dict['rightHip'] = calcAngle(pts.rs, pts.rh, pts.rk);
          angles_dict['leftElbow'] = calcAngle(pts.ls, pts.le, pts.lw);
          angles_dict['rightElbow'] = calcAngle(pts.rs, pts.re, pts.rw);
          angles_dict['leftShoulder'] = calcAngle(pts.lh, pts.ls, pts.le);

          drawOverlay(pts);
        }

        lastFrameSrc = canvasEl.toDataURL('image/jpeg', 0.6);
        if (onFrameCb && Object.keys(angles_dict).length > 0) {
          onFrameCb({ landmarks: angles_dict, confidence });
        }
      });
    }
    if (isRunning) animationRef = requestAnimationFrame(predictWebcam);
  }

  function drawOverlay(pts) {
    const w = canvasEl.width;
    const h = canvasEl.height;

    const CONNECTIONS = [
      ['ls', 'rs'], ['ls', 'le'], ['le', 'lw'], ['rs', 're'], ['re', 'rw'],
      ['ls', 'lh'], ['rs', 'rh'], ['lh', 'rh'],
      ['lh', 'lk'], ['lk', 'la'], ['rh', 'rk'], ['rk', 'ra']
    ];

    function toCanvas(p) { return { x: w - p.x, y: p.y }; }

    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
    CONNECTIONS.forEach(conn => {
      const p1 = pts[conn[0]], p2 = pts[conn[1]];
      if (p1 && p2) {
        const c1 = toCanvas(p1), c2 = toCanvas(p2);
        ctx.beginPath();
        ctx.moveTo(c1.x, c1.y);
        ctx.lineTo(c2.x, c2.y);
        ctx.stroke();
      }
    });

    ctx.fillStyle = "rgb(65, 255, 0)";
    Object.values(pts).forEach(p => {
      if (p) {
        const c = toCanvas(p);
        ctx.beginPath();
        ctx.arc(c.x, c.y, 4, 0, 2 * Math.PI);
        ctx.fill();
      }
    });

    if (pts.ls && pts.rs && pts.lh && pts.rh) {
      const shoulder_mid = { x: (pts.ls.x + pts.rs.x)/2, y: (pts.ls.y + pts.rs.y)/2 };
      const hip_mid = { x: (pts.lh.x + pts.rh.x)/2, y: (pts.lh.y + pts.rh.y)/2 };
      
      const delta_x = shoulder_mid.x - hip_mid.x, delta_y = shoulder_mid.y - hip_mid.y;
      const tilt_rad = delta_y !== 0 ? Math.atan(delta_x / Math.abs(delta_y)) : Math.PI/2;
      const tilt_angle = (tilt_rad * 180.0) / Math.PI;
      const is_balanced = Math.abs(tilt_angle) < 5.0;

      const smC = toCanvas(shoulder_mid), hmC = toCanvas(hip_mid);

      if (!is_balanced) {
        calib_frames = 0; default_shoulder_y = null;
        ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "rgb(255,0,0)"; ctx.font = "24px 'Roboto Mono', monospace";
        ctx.textAlign = "center";
        ctx.fillText(`!!! ALIGN SPINE !!! (${Math.abs(tilt_angle).toFixed(1)})`, w/2, h/2);
      } else {
        if (calib_frames < 40) {
          calib_frames++;
          default_shoulder_y = default_shoulder_y === null ? shoulder_mid.y : (default_shoulder_y + shoulder_mid.y) / 2;
          ctx.fillStyle = "rgb(255,212,0)"; ctx.font = "18px 'Roboto Mono', monospace";
          ctx.textAlign = "center"; ctx.fillText(`CALIBRATING... ${calib_frames}/40`, w/2, 60);
        } else {
          const pct = (default_shoulder_y / shoulder_mid.y) * 100;
          ctx.font = "18px 'Roboto Mono', monospace"; ctx.textAlign = "center";
          ctx.fillStyle = pct > 98 ? "rgb(65,255,0)" : "rgb(255,212,0)";
          ctx.fillText(`LEVEL: ${pct.toFixed(1)}%`, w/2, 60);
        }
      }

      ctx.lineWidth = 4;
      ctx.strokeStyle = is_balanced ? "rgb(65,255,0)" : "rgb(255,0,0)";
      ctx.beginPath(); ctx.moveTo(smC.x, smC.y); ctx.lineTo(hmC.x, hmC.y); ctx.stroke();
    }
  }

  function stop() {
    isRunning = false;
    if (animationRef) cancelAnimationFrame(animationRef);
  }

  function captureFrame() { return lastFrameSrc; }
  return { start, stop, captureFrame };
})();

window.PoseDetector = PoseDetector;
