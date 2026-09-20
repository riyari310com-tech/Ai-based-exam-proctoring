import cv2
import imutils
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
    import os
    def beep(freq, dur):
        print(f"\a")
    winsound = type('winsound', (), {'Beep': staticmethod(lambda f, d: print(f"\a"))})()

global data_record
data_record = []

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

    while True:
        ret, frame = cam.read()
        if not ret:
            continue
        # frame = imutils.resize(frame, width=450)

        record = []

        #Reading the Current time
        current_time = datetime.now().strftime("%H:%M:%S.%f")
        print("Current Time is:", current_time)
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
            blinkStatus = isBlinking(faces, frame)
            print(blinkStatus[2])

            if blinkStatus[2] == "Blink":
                blinkCount += 1
                record.append(blinkStatus[2] + " count: " + str(blinkCount))
            else:
                record.append(blinkStatus[2])


            # Gaze Detection
            eyeStatus = (gazeDetection(faces, frame))
            print(eyeStatus)
            record.append(eyeStatus)

            #Mouth Position Detection
            mouthStatus = mouthTrack(faces, frame)
            print(mouthStatus)
            record.append(mouthStatus)

            #Object detection using YOLO
            objectName = detectObject(frame)
            print(objectName)
            record.append(objectName)

            if len(objectName) > 1:
                winsound.Beep(frequency, duration)

            # Head Pose estimation
            headPose = head_pose_detection(faces, frame)
            print(headPose)
            record.append(headPose)

        data_record.append(record)
        # eyeStatus = gazeDetection(faces, frame)
        # print(eyeStatus)
        # print(objectName) 

        cv2.imshow('Frame', frame)

        if cv2.waitKey(1) & 0xFF == ord('q'):
            break
    
    cam.release()
    cv2.destroyAllWindows()

if __name__ == '__main__':
    proctoringAlgo()

    # Convert the list to a string with each element on a new line
    activityVal = "\n".join(map(str, data_record))
    # print(activityVal)

    with open('activity.txt', 'w') as file:
        file.write(str(activityVal))
