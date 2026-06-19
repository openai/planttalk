// Captures a single frame from a camera MediaStream as a JPEG File.
//
// A detached <video> element is the most compatible way to read pixels from a
// MediaStream: bind the stream, wait for the first frame, draw it to a canvas,
// and encode. The element never enters the DOM.

export async function captureFrameFromStream(stream: MediaStream): Promise<File> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;

  try {
    await video.play();
    if (video.readyState < 2) {
      // A muted/ended track fires neither loadeddata nor error, so without a
      // timeout this promise could hang forever and wedge the observation loop.
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Timed out waiting for a camera frame.")),
          10_000,
        );
        video.onloadeddata = () => {
          clearTimeout(timeout);
          resolve();
        };
        video.onerror = () => {
          clearTimeout(timeout);
          reject(new Error("Camera stream failed to produce a frame."));
        };
      });
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas 2D context unavailable.");
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error("Failed to encode camera frame."))),
        "image/jpeg",
        0.85,
      );
    });

    return new File([blob], "live-frame.jpg", { type: "image/jpeg" });
  } finally {
    video.pause();
    video.srcObject = null;
  }
}
