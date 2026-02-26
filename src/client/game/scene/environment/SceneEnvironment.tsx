import type { MutableRefObject } from 'react';
import * as THREE from 'three';
import type { SceneEnvironmentProfileId } from './sceneEnvironmentProfiles';
import { getSceneEnvironmentProfile } from './sceneEnvironmentProfiles';

type SceneEnvironmentProps = {
    profileId: SceneEnvironmentProfileId;
    sunLightRef: MutableRefObject<THREE.DirectionalLight | null>;
};

export const SceneEnvironment = ({ profileId, sunLightRef }: SceneEnvironmentProps) => {
    const profile = getSceneEnvironmentProfile(profileId);

    return (
        <>
            <color attach="background" args={[profile.backgroundColor]} />
            <fog attach="fog" args={[profile.fog.color, profile.fog.near, profile.fog.far]} />

            <ambientLight color={profile.ambientLight.color} intensity={profile.ambientLight.intensity} />
            <hemisphereLight
                color={profile.hemisphereLight.skyColor}
                groundColor={profile.hemisphereLight.groundColor}
                intensity={profile.hemisphereLight.intensity}
                position={[0, 200, 0]}
            />

            <directionalLight
                ref={sunLightRef}
                castShadow
                color={profile.sunLight.color}
                intensity={profile.sunLight.intensity}
                position={profile.sunLight.followOffset}
                shadow-mapSize-height={profile.sunLight.shadowMapSize}
                shadow-mapSize-width={profile.sunLight.shadowMapSize}
                shadow-camera-bottom={-profile.sunLight.shadowBounds}
                shadow-camera-left={-profile.sunLight.shadowBounds}
                shadow-camera-right={profile.sunLight.shadowBounds}
                shadow-camera-top={profile.sunLight.shadowBounds}
            />

            {profile.fillLight ? (
                <directionalLight
                    color={profile.fillLight.color}
                    intensity={profile.fillLight.intensity}
                    position={profile.fillLight.position}
                />
            ) : null}

            {profile.cloud.clusters.map((cluster) => (
                <group key={cluster.id} position={cluster.position} scale={cluster.scale}>
                    {profile.cloud.puffs.map((puff, index) => (
                        <mesh key={`${cluster.id}-puff-${index}`} position={puff.offset} scale={puff.scale}>
                            <sphereGeometry args={[1, 14, 14]} />
                            <meshStandardMaterial
                                color={profile.cloud.color}
                                depthWrite={false}
                                opacity={profile.cloud.opacity}
                                transparent
                            />
                        </mesh>
                    ))}
                </group>
            ))}
        </>
    );
};
