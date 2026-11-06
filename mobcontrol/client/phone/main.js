// Composition root for the controller page: the one place that chooses the
// real implementations. Swapping a sensor, a transport or the view for another
// is an edit here, not a change to any of them.

import { ReconnectingSocket, socketUrl } from '../shared/transport.js';
import { DEFAULT_MOUNT } from '../shared/mounts.js';
import { Calibrator } from './calibrator.js';
import { GripTeacher } from './grip-teacher.js';
import { DeviceOrientationSource } from './orientation-source.js';
import { DeviceMotionSource } from './motion-source.js';
import { ShakeDetector } from './shake-detector.js';
import { ScreenWakeLock } from './wake-lock.js';
import { requestMotionAccess } from './permissions.js';
import { ControllerView } from './view.js';
import { ControllerApp } from './app.js';

const room = new URLSearchParams(location.search).get('room');
// The page is served at <basePath>/phone, so its own URL names the mount point.
const basePath = location.pathname.replace(/\/phone(\.html)?$/, '');

new ControllerApp({
  room,
  view: new ControllerView(document),
  calibrator: new Calibrator(DEFAULT_MOUNT),
  gripTeacher: new GripTeacher(),
  orientationSource: new DeviceOrientationSource(),
  motionSource: new DeviceMotionSource(),
  shakeDetector: new ShakeDetector(),
  wakeLock: new ScreenWakeLock(),
  requestAccess: requestMotionAccess,
  transport: new ReconnectingSocket(
    () => socketUrl({ basePath, room, role: 'phone' }),
    { minDelayMs: 500, maxDelayMs: 5000 }
  )
}).start();
