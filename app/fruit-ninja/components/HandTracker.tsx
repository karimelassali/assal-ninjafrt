"use client";

import { useEffect, useRef } from "react";
import Webcam from "react-webcam";
import type { Results } from "@mediapipe/hands";

interface HandTrackerProps {
    webcamRef: React.RefObject<Webcam | null>;
    onFingerMove: (x: number, y: number, speed: number) => void;
}

export default function HandTracker({ webcamRef, onFingerMove }: HandTrackerProps) {
    const onFingerMoveRef = useRef(onFingerMove);
    const prevPosRef = useRef<{ x: number; y: number } | null>(null);

    useEffect(() => {
        onFingerMoveRef.current = onFingerMove;
    }, [onFingerMove]);

    useEffect(() => {
        if (!webcamRef.current?.video) return;

        let camera: any = null;
        let hands: any = null;
        let alive = true;

        (async () => {
            const { Hands } = await import("@mediapipe/hands");
            const { Camera } = await import("@mediapipe/camera_utils");
            if (!alive) return;

            hands = new Hands({
                locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
            });

            hands.setOptions({
                maxNumHands: 1, // Only tracking 1 hand for simpler slashing
                modelComplexity: 1,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5,
            });

            hands.onResults((r: Results) => {
                if (!r.multiHandLandmarks || r.multiHandLandmarks.length === 0) {
                    prevPosRef.current = null;
                    return;
                }

                // Get index finger tip (landmark 8)
                const hand = r.multiHandLandmarks[0];
                const tip = hand[8];
                const x = 1 - tip.x; // Mirror horizontal
                const y = tip.y;

                let speed = 0;
                if (prevPosRef.current) {
                    const dx = x - prevPosRef.current.x;
                    const dy = y - prevPosRef.current.y;
                    speed = Math.sqrt(dx * dx + dy * dy);
                }

                prevPosRef.current = { x, y };
                onFingerMoveRef.current(x, y, speed);
            });

            if (webcamRef.current?.video) {
                camera = new Camera(webcamRef.current.video, {
                    onFrame: async () => {
                        if (webcamRef.current?.video && hands) {
                            await hands.send({ image: webcamRef.current.video });
                        }
                    },
                    width: 1280,
                    height: 720,
                });
                camera.start();
            }
        })();

        return () => {
            alive = false;
            camera?.stop();
            hands?.close();
        };
    }, [webcamRef]);

    return null;
}
