"use client";

import { useEffect, useRef } from "react";
import Webcam from "react-webcam";
import type { Results } from "@mediapipe/hands";

export type HandStatus = "idle" | "far" | "near" | "active" | "fist";

interface HandDetectorProps {
    webcamRef: React.RefObject<Webcam | null>;
    onResults: (results: Results) => void;
    onStatusChange: (status: HandStatus) => void;
}

export default function HandDetector({
    webcamRef,
    onResults,
    onStatusChange,
}: HandDetectorProps) {
    const onResultsRef = useRef(onResults);
    const onStatusRef = useRef(onStatusChange);
    const prevStatusRef = useRef<HandStatus>("idle");

    useEffect(() => {
        onResultsRef.current = onResults;
        onStatusRef.current = onStatusChange;
    }, [onResults, onStatusChange]);

    const emit = (s: HandStatus) => {
        if (s !== prevStatusRef.current) {
            prevStatusRef.current = s;
            onStatusRef.current(s);
        }
    };

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
                locateFile: (f) =>
                    `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
            });

            hands.setOptions({
                maxNumHands: 2,
                modelComplexity: 1,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5,
            });

            hands.onResults((r: Results) => {
                onResultsRef.current(r);

                /* ---- detection logic ---- */
                const lm = r.multiHandLandmarks;
                if (!lm || lm.length < 2) {
                    emit("idle");
                    return;
                }

                const h1 = lm[0];
                const h2 = lm[1];

                // finger helpers
                const tipUp = (h: any[], tip: number, pip: number) =>
                    h[tip].y < h[pip].y;
                const tipDown = (h: any[], tip: number, pip: number) =>
                    h[tip].y > h[pip].y;

                // fist = all 4 fingers curled
                const fist = (h: any[]) =>
                    tipDown(h, 8, 6) &&
                    tipDown(h, 12, 10) &&
                    tipDown(h, 16, 14) &&
                    tipDown(h, 20, 18);

                if (fist(h1) && fist(h2)) {
                    emit("fist");
                    return;
                }

                // wrist distance
                const dx = h1[0].x - h2[0].x;
                const dy = h1[0].y - h2[0].y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist > 0.3) {
                    emit("far");
                    return;
                }

                // fingers up?
                const ready1 = tipUp(h1, 8, 6) && tipUp(h1, 12, 10);
                const ready2 = tipUp(h2, 8, 6) && tipUp(h2, 12, 10);

                if (dist <= 0.15 && ready1 && ready2) {
                    emit("active");
                } else {
                    emit("near");
                }
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
