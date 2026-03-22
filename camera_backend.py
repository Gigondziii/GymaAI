import cv2
import mediapipe as mp
import base64
import numpy as np
import math
import os
import time
from flask import Flask
from flask_socketio import SocketIO
from flask_cors import CORS

app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

BaseOptions = mp.tasks.BaseOptions
PoseLandmarker = mp.tasks.vision.PoseLandmarker
PoseLandmarkerOptions = mp.tasks.vision.PoseLandmarkerOptions
VisionRunningMode = mp.tasks.vision.RunningMode

model_path = '../logic/pose_landmarker_heavy.task'
if not os.path.exists(model_path):
    # Trying alternative path if run from logic folder
    model_path = 'pose_landmarker_heavy.task'

try:
    options = PoseLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=model_path),
        running_mode=VisionRunningMode.VIDEO
    )
    landmarker = PoseLandmarker.create_from_options(options)
except Exception as e:
    print(f"Error initializing MediaPipe: {e}")
    landmarker = None

camera_active = False
calib_frames = 0
default_shoulder_y = None

def calc_angle(a, b, c):
    if not (a and b and c): return None
    a, b, c = np.array(a), np.array(b), np.array(c)
    radians = np.arctan2(c[1]-b[1], c[0]-b[0]) - np.arctan2(a[1]-b[1], a[0]-b[0])
    angle = np.abs(radians*180.0/np.pi)
    if angle > 180.0: angle = 360 - angle
    return angle

def camera_loop():
    global camera_active, calib_frames, default_shoulder_y
    cap = cv2.VideoCapture(0)
    
    while camera_active:
        ret, frame = cap.read()
        if not ret:
            time.sleep(0.1)
            continue
            
        frame = cv2.flip(frame, 1)
        h, w, c = frame.shape
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        timestamp = int(cv2.getTickCount() / cv2.getTickFrequency() * 1000)
        
        angles_dict = {}
        confidence = 0.0
        
        if landmarker:
            results = landmarker.detect_for_video(mp_image, timestamp)
            if results.pose_landmarks:
                lms = results.pose_landmarks[0]
                confidence = sum(lm.visibility for lm in lms) / len(lms)
                
                def get_pt(idx): 
                    if lms[idx].visibility < 0.2: return None
                    return [lms[idx].x * w, lms[idx].y * h]
                    
                pts = {
                    'left_shoulder': get_pt(11), 'right_shoulder': get_pt(12),
                    'left_elbow': get_pt(13), 'right_elbow': get_pt(14),
                    'left_wrist': get_pt(15), 'right_wrist': get_pt(16),
                    'left_hip': get_pt(23), 'right_hip': get_pt(24),
                    'left_knee': get_pt(25), 'right_knee': get_pt(26),
                    'left_ankle': get_pt(27), 'right_ankle': get_pt(28),
                }
                
                angles_dict['leftKnee'] = calc_angle(pts['left_hip'], pts['left_knee'], pts['left_ankle'])
                angles_dict['rightKnee'] = calc_angle(pts['right_hip'], pts['right_knee'], pts['right_ankle'])
                angles_dict['leftHip'] = calc_angle(pts['left_shoulder'], pts['left_hip'], pts['left_knee'])
                angles_dict['rightHip'] = calc_angle(pts['right_shoulder'], pts['right_hip'], pts['right_knee'])
                angles_dict['leftElbow'] = calc_angle(pts['left_shoulder'], pts['left_elbow'], pts['left_wrist'])
                angles_dict['rightElbow'] = calc_angle(pts['right_shoulder'], pts['right_elbow'], pts['right_wrist'])
                angles_dict['leftShoulder'] = calc_angle(pts['left_hip'], pts['left_shoulder'], pts['left_elbow'])

                # GIMA Overlay drawing
                if pts['left_shoulder'] and pts['right_shoulder'] and pts['left_hip'] and pts['right_hip']:
                    shoulder_mid = [(pts['left_shoulder'][0] + pts['right_shoulder'][0])/2, (pts['left_shoulder'][1] + pts['right_shoulder'][1])/2]
                    hip_mid = [(pts['left_hip'][0] + pts['right_hip'][0])/2, (pts['left_hip'][1] + pts['right_hip'][1])/2]
                    
                    delta_x = shoulder_mid[0] - hip_mid[0]
                    delta_y = shoulder_mid[1] - hip_mid[1]
                    tilt_rad = math.atan(delta_x / abs(delta_y)) if delta_y != 0 else math.pi/2
                    tilt_angle = (tilt_rad * 180.0) / math.pi
                    is_balanced = abs(tilt_angle) < 5.0
                    
                    # Dim background if unbalanced
                    if not is_balanced:
                        calib_frames = 0
                        default_shoulder_y = None
                        overlay = frame.copy()
                        cv2.rectangle(overlay, (0,0), (w,h), (0,0,0), -1)
                        cv2.addWeighted(overlay, 0.6, frame, 0.4, 0, frame)
                        cv2.putText(frame, f"!!! ALIGN SPINE !!! ({abs(tilt_angle):.1f})", (w//2 - 150, h//2 - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0,0,255), 2)
                    else:
                        if calib_frames < 40:
                            calib_frames += 1
                            if default_shoulder_y is None: default_shoulder_y = shoulder_mid[1]
                            else: default_shoulder_y = (default_shoulder_y + shoulder_mid[1]) / 2
                            cv2.putText(frame, f"CALIBRATING... {calib_frames}/40", (w//2-100, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255,212,0), 2)
                        else:
                            pct = (default_shoulder_y / shoulder_mid[1]) * 100
                            cv2.putText(frame, f"LEVEL: {pct:.1f}%", (w//2-60, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (65,255,0) if pct>98 else (255,212,0), 2)

                    spine_color = (65,255,0) if is_balanced else (0,0,255)
                    cv2.line(frame, (int(shoulder_mid[0]), int(shoulder_mid[1])), (int(hip_mid[0]), int(hip_mid[1])), spine_color, 4)
                
                # Skeleton Connections
                CONNECTIONS = [
                    (11, 12), (11, 13), (13, 15), (12, 14), (14, 16),
                    (11, 23), (12, 24), (23, 24),
                    (23, 25), (25, 27), (24, 26), (26, 28)
                ]
                for start, end in CONNECTIONS:
                    start_lm = lms[start]
                    end_lm = lms[end]
                    if start_lm.visibility > 0.3 and end_lm.visibility > 0.3:
                        cv2.line(frame, (int(start_lm.x*w), int(start_lm.y*h)), (int(end_lm.x*w), int(end_lm.y*h)), (255,255,255), 2)
                        cv2.circle(frame, (int(start_lm.x*w), int(start_lm.y*h)), 4, (65,255,0), -1)
                        cv2.circle(frame, (int(end_lm.x*w), int(end_lm.y*h)), 4, (65,255,0), -1)

        cv2.putText(frame, "GIMA Python Backend Active", (20, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255,255,255), 1)

        _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 50])
        img_b64 = base64.b64encode(buffer).decode('utf-8')
        
        socketio.emit('frame_data', {'image': img_b64, 'angles': angles_dict, 'confidence': confidence})
        socketio.sleep(0.03)

    cap.release()

@socketio.on('connect')
def test_connect():
    print('Web app connected to Python Camera Backend!')

@socketio.on('start_camera')
def handle_start():
    global camera_active
    if not camera_active:
        camera_active = True
        socketio.start_background_task(camera_loop)
        print('Camera started')

@socketio.on('stop_camera')
def handle_stop():
    global camera_active, calib_frames
    camera_active = False
    calib_frames = 0
    print('Camera stopped')

if __name__ == '__main__':
    print("Starting GIMA Python Backend on port 5000...")
    socketio.run(app, port=5000, allow_unsafe_werkzeug=True)
