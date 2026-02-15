"use client";

import React, { forwardRef } from "react";
import Webcam from "react-webcam";

interface CameraFeedProps {
    onUserMedia?: () => void;
}

const CameraFeed = forwardRef<Webcam, CameraFeedProps>(({ onUserMedia }, ref) => {
    return (
        <Webcam
            ref={ref}
            audio={false}
            screenshotFormat="image/jpeg"
            videoConstraints={{
                width: 1280,
                height: 720,
                facingMode: "user",
            }}
            onUserMedia={onUserMedia}
            className="absolute top-0 left-0 w-full h-full object-cover -z-10 opacity-0" // Hidden, we draw on canvas
            style={{ visibility: "hidden" }} // Hide the video element, we only need the stream for canvas
        />
    );
});

CameraFeed.displayName = "CameraFeed";

export default CameraFeed;
