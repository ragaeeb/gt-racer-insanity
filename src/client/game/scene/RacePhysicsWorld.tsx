import { CuboidCollider, Physics, RigidBody } from '@react-three/rapier';

type RacePhysicsWorldProps = {
    trackLength: number;
    trackWidth: number;
};

export const RacePhysicsWorld = ({ trackLength, trackWidth }: RacePhysicsWorldProps) => {
    const halfLength = Math.max(10, trackLength / 2);
    const halfWidth = Math.max(8, trackWidth / 2);

    return (
        <Physics gravity={[0, 0, 0]} interpolate={false}>
            <RigidBody colliders={false} type="fixed">
                <CuboidCollider args={[halfWidth, 0.5, halfLength]} position={[0, -0.5, halfLength]} />
                <CuboidCollider args={[1, 3, halfLength]} position={[-halfWidth - 1, 1.5, halfLength]} />
                <CuboidCollider args={[1, 3, halfLength]} position={[halfWidth + 1, 1.5, halfLength]} />
            </RigidBody>
        </Physics>
    );
};
