import { describe, expect, it } from "vitest";
import {
  MAX_RECORDING_SEC,
  micErrorMessage,
  pickRecordingType,
  recordingFileName,
  recordingLimitFor,
} from "../../web/src/features/converter/model/recording.js";

describe("voice recording helpers", () => {
  it("picks the first container the browser supports", () => {
    expect(pickRecordingType((t) => t.startsWith("audio/webm"))).toBe("audio/webm;codecs=opus");
    expect(pickRecordingType((t) => t === "audio/mp4")).toBe("audio/mp4"); // Safari
    expect(pickRecordingType(() => false)).toBe("");
  });

  it("names the file by length and container", () => {
    expect(recordingFileName(4.4, "audio/webm;codecs=opus")).toBe("Grabación 0-04.webm");
    expect(recordingFileName(65, "audio/mp4")).toBe("Grabación 1-05.m4a");
    expect(recordingFileName(3, "audio/ogg")).toBe("Grabación 0-03.ogg");
  });

  it("limit follows the input: images use the image sound cap", () => {
    expect(recordingLimitFor("image", 10)).toBe(10);
    expect(recordingLimitFor("video", 10)).toBe(MAX_RECORDING_SEC);
    expect(recordingLimitFor(null, 10)).toBe(MAX_RECORDING_SEC);
  });

  it("maps mic errors to friendly messages", () => {
    expect(micErrorMessage(new DOMException("x", "NotAllowedError"))).toMatch(/Permiso/);
    expect(micErrorMessage(new DOMException("x", "NotFoundError"))).toMatch(/ningún micrófono/);
    expect(micErrorMessage(new Error("boom"))).toMatch(/No se pudo grabar/);
  });
});
