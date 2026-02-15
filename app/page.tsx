"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Webcam from "react-webcam";
import type { Results } from "@mediapipe/hands";
import CameraFeed from "./components/CameraFeed";
import HandDetector, { HandStatus } from "./components/HandDetector";
import CloneEffect from "./components/CloneEffect";

export default function Home() {
  const webcamRef = useRef<Webcam>(null);
  const [loading, setLoading] = useState(true);
  const [camReady, setCamReady] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  const [results, setResults] = useState<Results | null>(null);
  const [handStatus, setHandStatus] = useState<HandStatus>("idle");
  const [jutsuActive, setJutsuActive] = useState(false);
  const [cloneCount, setCloneCount] = useState(0);

  const jutsuRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRef.current = new Audio("/naruto_shadow_clones.mp3");
    audioRef.current.volume = 1;
  }, []);

  const playAudio = useCallback(() => {
    if (!audioRef.current || !audioUnlocked) return;
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(() => { });
  }, [audioUnlocked]);

  const onCamReady = useCallback(() => {
    setLoading(false);
    setCamReady(true);
  }, []);

  const reset = useCallback(() => {
    jutsuRef.current = false;
    setJutsuActive(false);
    setCloneCount(0);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, []);

  const onStatus = useCallback(
    (s: HandStatus) => {
      setHandStatus(s);
      if (s === "active" && !jutsuRef.current) {
        jutsuRef.current = true;
        setJutsuActive(true);
        playAudio();
        let count = 0;
        const iv = setInterval(() => {
          count += 2;
          setCloneCount(count);
          if (count >= 4) clearInterval(iv); // 4 clones = 5 panels total
        }, 400);
      }
      if (s === "fist" && jutsuRef.current) reset();
    },
    [playAudio, reset]
  );

  const unlockAudio = () => {
    setAudioUnlocked(true);
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (AC) new AC().resume();
    if (audioRef.current) {
      audioRef.current.play().then(() => {
        audioRef.current!.pause();
        audioRef.current!.currentTime = 0;
      }).catch(() => { });
    }
  };

  const statusLabel: Record<HandStatus, string> = {
    idle: "Show both hands ✋✋",
    far: "Closer! 🔴",
    near: "Almost… 🟡",
    active: "JUTSU! 🟢",
    fist: "Releasing…",
  };
  const statusColor: Record<HandStatus, string> = {
    idle: "text-gray-300",
    far: "text-red-400",
    near: "text-yellow-300",
    active: "text-green-400",
    fist: "text-blue-400",
  };

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-black">
      <CameraFeed ref={webcamRef} onUserMedia={onCamReady} />

      <CloneEffect
        webcamRef={webcamRef}
        results={results}
        jutsuActive={jutsuActive}
        cloneCount={cloneCount}
        handStatus={handStatus}
      />

      {camReady && (
        <HandDetector
          webcamRef={webcamRef}
          onResults={setResults}
          onStatusChange={onStatus}
        />
      )}

      {/* Audio unlock */}
      {!audioUnlocked && !loading && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md">
          <button
            onClick={unlockAudio}
            className="group flex flex-col items-center gap-3 bg-gradient-to-br from-orange-500 via-red-500 to-orange-600 hover:from-orange-400 hover:via-red-400 hover:to-orange-500 text-white font-bold py-8 px-16 rounded-3xl text-3xl shadow-[0_0_80px_rgba(255,80,0,0.5)] border-2 border-orange-300/40 transition-all duration-300 active:scale-95 hover:scale-105"
          >
            <span className="text-5xl group-hover:animate-bounce">🍥</span>
            SHADOW CLONE JUTSU
            <span className="text-base font-normal opacity-60">Tap to activate audio & camera</span>
          </button>
        </div>
      )}

      {/* HUD */}
      <div className="absolute inset-0 pointer-events-none z-50 flex flex-col items-center justify-between py-6 px-4">
        <div className="text-center">
          {loading ? (
            <p className="text-2xl text-orange-400 animate-pulse font-bold">Loading Chakra…</p>
          ) : !jutsuActive ? (
            <div className="bg-black/60 backdrop-blur-sm px-6 py-3 rounded-2xl">
              <h1 className={`text-3xl md:text-4xl font-bold ${statusColor[handStatus]}`}>
                {statusLabel[handStatus]}
              </h1>
              <p className="text-white/40 text-sm mt-1">
                Tiger Seal: ✌️+✌️ hands together
              </p>
            </div>
          ) : (
            <div className="bg-black/50 backdrop-blur-sm px-8 py-4 rounded-2xl border border-orange-500/30">
              <h1 className="text-4xl md:text-6xl font-black text-orange-500 drop-shadow-[0_0_20px_rgba(255,100,0,0.6)]">
                影分身の術！
              </h1>
              <p className="text-white/50 text-sm mt-2">
                Make fists 👊👊 to release
              </p>
            </div>
          )}
        </div>

        {jutsuActive && cloneCount > 0 && (
          <div className="mb-4 bg-black/60 backdrop-blur-sm px-6 py-2 rounded-full">
            <span className="text-4xl font-black text-orange-400">
              ×{cloneCount + 1}
            </span>
            <span className="text-white/40 text-lg ml-2">bodies</span>
          </div>
        )}
      </div>
    </main>
  );
}
