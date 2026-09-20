import cv2
# import imutils
import time
import platform
from facial_detections import detectFace
from blink_detection import isBlinking
from mouth_tracking import mouthTrack
from object_detection import detectObject
from eye_tracker import gazeDetection
from head_pose_estimation import head_pose_detection
from datetime import datetime

if platform.system() == "Windows":
    import winsound
else:
    winsound = type('winsound', (), {'Beep': staticmethod(lambda f, d: print(f"\a"))})()


global data_record
data_record = []

running = True


#For Beeping
frequency = 2500
duration = 1000

#OpenCV videocapture for the webcam
cam = None

def initCamera():
    global cam
    cam = cv2.VideoCapture(0)
    #If camera is already opened
    if (cam.isOpened() == False):
        cam.open(0)
    # Allow camera to warm up
    time.sleep(2)
    if not cam.isOpened():
        print("ERROR: Cannot open camera. Please check if a webcam is connected.")
        return False
    return True

#Face Count If-else conditions
def faceCount_detection(faceCount):
    if faceCount > 1:
        remark = "Multiple faces has been detected."
    elif faceCount == 0:
        remark = "No face has been detected."
    else:
        remark = "Face detecting properly."
    return remark


#Main function 
def proctoringAlgo():

    global cam
    if cam is None or not cam.isOpened():
        if not initCamera():
            print("Camera initialization failed. Exiting proctoring.")
            return

    blinkCount = 0

    try:
        while running:
            ret, frame = cam.read()
            if not ret:
                print("Failed to grab frame, retrying...")
                time.sleep(0.5)
                continue
        # frame = imutils.resize(frame, width=450)

        record = []

        #Reading the current time
        current_time = datetime.now().strftime("%H:%M:%S.%f")
        print("Current time is:", current_time)
        record.append(current_time)

        #Returns the face count and will detect the face.
        faceCount, faces = detectFace(frame)
        faceRemark = faceCount_detection(faceCount)
        print(faceRemark)
        record.append(faceRemark)

        if faceCount > 1:
            winsound.Beep(frequency, duration)

        if faceCount == 1:

            #Blink Detection
            try:
                blinkStatus = isBlinking(faces, frame)
                print(blinkStatus[2])

                if blinkStatus[2] == "Blink":
                    blinkCount += 1
                    record.append(blinkStatus[2] + " count: " + str(blinkCount))
                else:
                    record.append(blinkStatus[2])
            except Exception as e:
                print(f"Blink detection error: {e}")
                record.append("Blink detection error")


            # Gaze Detection
            try:
                eyeStatus = (gazeDetection(faces, frame))
                print(eyeStatus)
                record.append(eyeStatus)
            except Exception as e:
                print(f"Gaze detection error: {e}")
                record.append("Gaze detection error")

            # Mouth Position Detection
            try:
                mouthStatus = mouthTrack(faces, frame)
                print(mouthStatus)
                record.append(mouthStatus)
            except Exception as e:
                print(f"Mouth tracking error: {e}")
                record.append("Mouth tracking error")

            # Object detection using YOLO
            try:
                objectName = detectObject(frame)
                print(objectName)
                record.append(objectName)

                if len(objectName) > 1:
                    winsound.Beep(frequency, duration)
            except Exception as e:
                print(f"Object detection error: {e}")
                record.append("Object detection error")

            # Head Pose estimation
            try:
                headPose = head_pose_detection(faces, frame)
                print(headPose)
                record.append(headPose)
            except Exception as e:
                print(f"Head pose estimation error: {e}")
                record.append("Head pose error")

        data_record.append(record)

        #Convert the frame to JPEG format
        _, buffer = cv2.imencode('.jpg', frame)
        frame = buffer.tobytes()

        yield (b'--frame\r\n'
           b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')

    except Exception as e:
        print(f"Proctoring error: {e}")
    finally:
        if cam is not None and cam.isOpened():
            cam.release()



def main_app():

    # print(data_record)
    # Convert the list to a string with each element on a new line
    activityVal = "\n".join(map(str, data_record))
    # print(activityVal)

    with open('activity.txt', 'w') as file:
        file.write(str(activityVal))
