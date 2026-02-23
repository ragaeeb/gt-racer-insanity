import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

export const useAudioListener = () => {
    const { camera } = useThree();
    const listenerRef = useRef<THREE.AudioListener | null>(null);

    useEffect(() => {
        const listener = new THREE.AudioListener();
        camera.add(listener);
        listenerRef.current = listener;

        const resumeAudio = () => {
            if (listener.context.state === 'suspended') {
                void listener.context.resume();
            }
        };

        window.addEventListener('keydown', resumeAudio, { once: true });
        window.addEventListener('click', resumeAudio, { once: true });

        return () => {
            camera.remove(listener);
            listenerRef.current = null;
            window.removeEventListener('keydown', resumeAudio);
            window.removeEventListener('click', resumeAudio);
        };
    }, [camera]);

    return listenerRef;
};
