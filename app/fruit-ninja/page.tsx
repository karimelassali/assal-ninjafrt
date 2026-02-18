"use client";

import { useState, useRef, useCallback } from "react";
import Webcam from "react-webcam";
import CameraFeed from "../components/CameraFeed";
import HandTracker from "./components/HandTracker";
import GameCanvas from "./components/GameCanvas";

export default function FruitNinjaPage() {
    const webcamRef = useRef<Webcam>(null);
    const [finger, setFinger] = useState<{ x: number; y: number } | null>(null);
    const [loading, setLoading] = useState(true);

    const onFingerMove = useCallback((x: number, y: number, speed: number) => {
        setFinger({ x, y });
    }, []);

    const onCamReady = useCallback(() => {
        setLoading(false);
    }, []);

    return (
        <div className="relative w-screen h-screen overflow-hidden bg-black font-['Outfit']">
            {/* Camera Layer */}
            <CameraFeed ref={webcamRef} onUserMedia={onCamReady} />

            {/* Game Layer */}
            {!loading && (
                <>
                    <HandTracker webcamRef={webcamRef} onFingerMove={onFingerMove} />
                    <GameCanvas webcamRef={webcamRef} finger={finger} />
                </>
            )}

            {/* Loading Overlay */}
            {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black transition-opacity duration-500 z-50">
                    <div className="text-3xl font-bold text-orange-500 animate-pulse">
                        Slicing DOJO Loading... 🍉
                    </div>
                </div>
            )}
        </div>
    );
}
