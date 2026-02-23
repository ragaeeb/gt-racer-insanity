import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { RaceSession } from '@/client/game/hooks/types';
import type { SceneEnvironmentProfile } from '@/client/game/scene/environment/sceneEnvironmentProfiles';

type CameraVectors = {
    cameraDelta: THREE.Vector3;
    cameraOffset: THREE.Vector3;
    desiredPosition: THREE.Vector3;
    lookAhead: THREE.Vector3;
    lookTarget: THREE.Vector3;
    rotatedLookAhead: THREE.Vector3;
    worldUp: THREE.Vector3;
};

const createCameraVectors = (): CameraVectors => ({
    cameraDelta: new THREE.Vector3(),
    cameraOffset: new THREE.Vector3(),
    desiredPosition: new THREE.Vector3(),
    lookAhead: new THREE.Vector3(0, 0, 10),
    lookTarget: new THREE.Vector3(),
    rotatedLookAhead: new THREE.Vector3(),
    worldUp: new THREE.Vector3(0, 1, 0),
});

export type CameraFrameMetrics = {
    cameraJumpMeters: number;
    cameraMotionMeters: number;
    lastCameraPosition: THREE.Vector3;
};

export const useCameraFollow = (
    sessionRef: React.RefObject<RaceSession>,
    activeSceneEnvironment: SceneEnvironmentProfile,
    dirLightRef: React.RefObject<THREE.DirectionalLight | null>,
) => {
    const { camera } = useThree();
    const vectorsRef = useRef<CameraVectors>(createCameraVectors());
    const metricsRef = useRef<CameraFrameMetrics>({
        cameraJumpMeters: 0,
        cameraMotionMeters: 0,
        lastCameraPosition: camera.position.clone(),
    });

    useFrame(() => {
        const session = sessionRef.current;
        const localCar = session.localCar;
        if (!localCar) {
            return;
        }

        const v = vectorsRef.current;
        const m = metricsRef.current;

        session.trackManager?.update(localCar.position.z);

        const dirLight = dirLightRef.current;
        if (dirLight) {
            dirLight.position.x = localCar.position.x + activeSceneEnvironment.sunLight.followOffset[0];
            dirLight.position.y = localCar.position.y + activeSceneEnvironment.sunLight.followOffset[1];
            dirLight.position.z = localCar.position.z + activeSceneEnvironment.sunLight.followOffset[2];
            dirLight.target = localCar.mesh;
        }

        v.cameraOffset.set(0, 30, -30);
        v.cameraOffset.applyAxisAngle(v.worldUp, localCar.rotationY);
        v.desiredPosition.copy(localCar.position).add(v.cameraOffset);
        v.cameraDelta.subVectors(v.desiredPosition, camera.position);

        m.cameraJumpMeters = v.cameraDelta.length();
        m.cameraMotionMeters = camera.position.distanceTo(m.lastCameraPosition);
        m.lastCameraPosition.copy(camera.position);

        camera.position.lerp(v.desiredPosition, 0.1);

        v.lookTarget.copy(localCar.position);
        v.rotatedLookAhead.copy(v.lookAhead);
        v.rotatedLookAhead.applyAxisAngle(v.worldUp, localCar.rotationY);
        v.lookTarget.add(v.rotatedLookAhead);
        camera.lookAt(v.lookTarget);
    });

    return metricsRef;
};
