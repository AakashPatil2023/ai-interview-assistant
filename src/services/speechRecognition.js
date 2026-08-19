function pickMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus"
  ];

  if (!window.MediaRecorder) {
    return "";
  }

  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

async function blobToBase64(blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary);
}

class SpeechRecognitionService {
  constructor() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error("Meeting audio capture is not available in this environment.");
    }

    if (!window.MediaRecorder) {
      throw new Error("MediaRecorder is not supported in this environment.");
    }

    this.mimeType = pickMimeType();
    if (!this.mimeType) {
      throw new Error("No supported audio recording format found.");
    }

    this.isListening = false;
    this.shouldRestart = false;
    this.stream = null;
    this.displayStream = null;
    this.recorder = null;
    this.chunks = [];
    this.audioContext = null;
    this.analyser = null;
    this.rafId = null;
    this.speaking = false;
    this.silenceStartedAt = 0;
    this.speechStartedAt = 0;
    this.transcribing = false;

    this.onTranscript = null;
    this.onFinalTranscript = null;
    this.onStatusChange = null;
    this.onError = null;

    // Tuned for meeting / loopback levels
    this.speechThreshold = 0.008;
    this.silenceMs = 1300;
    this.minSpeechMs = 700;
    this.maxUtteranceMs = 14000;
  }

  emitStatus(status) {
    if (this.onStatusChange) {
      this.onStatusChange(status);
    }
  }

  async acquireMeetingStream() {
    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: 320,
        height: 180,
        frameRate: 1
      },
      audio: true
    });

    const audioTracks = displayStream.getAudioTracks();

    if (!audioTracks.length) {
      displayStream.getTracks().forEach((track) => track.stop());
      const error = new Error("No system audio track was captured.");
      error.code = "no-system-audio";
      throw error;
    }

    // Keep display stream alive so Electron loopback stays open.
    this.displayStream = displayStream;

    for (const track of audioTracks) {
      track.onended = () => {
        if (this.isListening) {
          this.stop();
          if (this.onError) {
            this.onError("meeting-ended");
          }
        }
      };
    }

    return new MediaStream(audioTracks);
  }

  async start() {
    if (this.isListening) {
      return;
    }

    this.shouldRestart = true;

    try {
      this.stream = await this.acquireMeetingStream();
    } catch (error) {
      this.shouldRestart = false;
      this.cleanupStreams();
      this.emitStatus("error");

      if (this.onError) {
        if (error?.code === "no-system-audio") {
          this.onError("no-system-audio");
        } else if (
          error?.name === "NotAllowedError" ||
          error?.name === "AbortError"
        ) {
          this.onError("meeting-denied");
        } else {
          this.onError("meeting-capture");
        }
      }
      throw error;
    }

    this.setupAnalyser(this.stream);
    this.startRecorder();
    this.isListening = true;
    this.emitStatus("listening");
    this.monitorLevels();
  }

  setupAnalyser(stream) {
    this.audioContext = new AudioContext();
    const source = this.audioContext.createMediaStreamSource(stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
    source.connect(this.analyser);
  }

  startRecorder() {
    this.chunks = [];
    this.speaking = false;
    this.silenceStartedAt = 0;
    this.speechStartedAt = 0;

    this.recorder = new MediaRecorder(this.stream, {
      mimeType: this.mimeType
    });

    this.recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.chunks.push(event.data);
      }
    };

    this.recorder.onstop = () => {
      void this.flushChunks();
    };

    this.recorder.start();
  }

  monitorLevels() {
    if (!this.analyser) {
      return;
    }

    const data = new Uint8Array(this.analyser.fftSize);

    const tick = () => {
      if (!this.shouldRestart || !this.analyser) {
        return;
      }

      this.analyser.getByteTimeDomainData(data);

      let sum = 0;
      for (let i = 0; i < data.length; i += 1) {
        const value = (data[i] - 128) / 128;
        sum += value * value;
      }

      const rms = Math.sqrt(sum / data.length);
      const now = Date.now();

      if (rms >= this.speechThreshold) {
        if (!this.speaking) {
          this.speaking = true;
          this.speechStartedAt = now;
        }
        this.silenceStartedAt = 0;
      } else if (this.speaking) {
        if (!this.silenceStartedAt) {
          this.silenceStartedAt = now;
        }

        const silentFor = now - this.silenceStartedAt;
        const spokenFor = now - this.speechStartedAt;

        if (
          silentFor >= this.silenceMs &&
          spokenFor >= this.minSpeechMs &&
          this.recorder?.state === "recording"
        ) {
          this.recorder.stop();
        }
      }

      if (
        this.speaking &&
        this.speechStartedAt &&
        now - this.speechStartedAt >= this.maxUtteranceMs &&
        this.recorder?.state === "recording"
      ) {
        this.recorder.stop();
      }

      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }

  async flushChunks() {
    const localChunks = this.chunks;
    this.chunks = [];

    const shouldContinue = this.shouldRestart;

    if (shouldContinue && this.stream) {
      this.startRecorder();
    }

    if (!localChunks.length) {
      return;
    }

    const blob = new Blob(localChunks, { type: this.mimeType });

    if (blob.size < 1200) {
      return;
    }

    await this.transcribeBlob(blob);
  }

  async transcribeBlob(blob) {
    this.transcribing = true;
    this.emitStatus("thinking");

    try {
      const audioBase64 = await blobToBase64(blob);

      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          audioBase64,
          mimeType: this.mimeType.split(";")[0]
        })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Transcription failed");
      }

      const text = String(data.text || "").trim();

      if (!text) {
        if (this.shouldRestart) {
          this.emitStatus("listening");
        }
        return;
      }

      if (this.onTranscript) {
        this.onTranscript({
          interim: "",
          finalText: text
        });
      }

      if (this.onFinalTranscript) {
        this.onFinalTranscript(text);
      }

      if (this.shouldRestart) {
        this.emitStatus("listening");
      }
    } catch (error) {
      console.error("Transcription error:", error);
      if (this.onError) {
        this.onError("network");
      }
      this.emitStatus("error");
    } finally {
      this.transcribing = false;
    }
  }

  cleanupStreams() {
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }

    if (this.displayStream) {
      for (const track of this.displayStream.getTracks()) {
        track.stop();
      }
      this.displayStream = null;
    }
  }

  stop() {
    this.shouldRestart = false;
    this.isListening = false;

    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    if (this.recorder && this.recorder.state !== "inactive") {
      try {
        this.recorder.stop();
      } catch {
        // ignore
      }
    }

    this.cleanupStreams();

    if (this.audioContext) {
      void this.audioContext.close();
      this.audioContext = null;
    }

    this.analyser = null;
    this.recorder = null;
    this.emitStatus("idle");
  }
}

export default SpeechRecognitionService;
