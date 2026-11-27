// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MediaDropzone } from "../../web/src/features/converter/components/MediaDropzone.js";
import { useConverterStore } from "../../web/src/features/converter/store/converterStore.js";
import { mediaFromPaste, pastedName, readClipboardMedia, wantsMediaPaste } from "../../web/src/lib/clipboard.js";

const at = new Date(2026, 10, 27, 9, 5);
const png = (name = "image.png") => new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" });
const mp4 = (name = "baile.mp4") => new File([new Uint8Array([1])], name, { type: "video/mp4" });
const transfer = (files: File[], types = ["Files"]) =>
  ({
    files: files as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types,
  }) as unknown as DataTransfer;
const noDialog = { querySelector: () => null } as unknown as Document;

describe("clipboard helpers", () => {
  it("pastedName: recognisable names, right extension", () => {
    expect(pastedName("image/png", at)).toBe("Pegado 09-05.png");
    expect(pastedName("image/jpeg", at)).toBe("Pegado 09-05.jpg");
    expect(pastedName("video/quicktime", at)).toBe("Pegado 09-05.mov");
    expect(pastedName("image/x-icon", at)).toBe("Pegado 09-05.xicon");
  });

  it("mediaFromPaste: keeps images/videos, drops the rest, renames generic «image.png» only", () => {
    const pdf = new File(["x"], "doc.pdf", { type: "application/pdf" });
    const out = mediaFromPaste(transfer([png(), mp4(), pdf, png("gato.png")]), at);
    expect(out.map((f) => f.name)).toEqual(["Pegado 09-05.png", "baile.mp4", "gato.png"]);
    expect(out[0]?.type).toBe("image/png");
    expect(out[0]?.size).toBe(3);
    expect(mediaFromPaste(null)).toEqual([]);
  });

  it("mediaFromPaste: falls back to items when the browser leaves files empty", () => {
    const items = [
      { kind: "string", getAsFile: () => null },
      { kind: "file", getAsFile: () => png() },
    ];
    const data = { files: [] as unknown as FileList, items: items as unknown as DataTransferItemList };
    expect(mediaFromPaste(data, at).map((f) => f.name)).toEqual(["Pegado 09-05.png"]);
  });

  it("wantsMediaPaste: files on the page yes; text into a field no; dialogs never", () => {
    const input = document.createElement("input");
    const area = document.createElement("textarea");
    const div = document.createElement("div");
    expect(wantsMediaPaste(div, transfer([], ["Files"]), noDialog)).toBe(true);
    expect(wantsMediaPaste(div, transfer([], ["text/plain"]), noDialog)).toBe(false); // only text
    expect(wantsMediaPaste(input, transfer([], ["Files", "text/plain"]), noDialog)).toBe(false);
    expect(wantsMediaPaste(area, transfer([], ["Files", "text/plain"]), noDialog)).toBe(false);
    expect(wantsMediaPaste(input, transfer([], ["Files"]), noDialog)).toBe(true); // a screenshot with the title focused
    const withDialog = { querySelector: () => div } as unknown as Document;
    expect(wantsMediaPaste(div, transfer([], ["Files"]), withDialog)).toBe(false);
    expect(wantsMediaPaste(div, null, noDialog)).toBe(false);
  });

  it("readClipboardMedia: first image (GIF preferred), friendly errors", async () => {
    const blob = new Blob([new Uint8Array([7])], { type: "image/gif" });
    const item = (types: string[]) => ({ types, getType: async () => blob });
    const ok = await readClipboardMedia(
      { read: async () => [item(["text/plain"]), item(["image/png", "image/gif"])] as never },
      at,
    );
    expect("files" in ok && ok.files[0]?.name).toBe("Pegado 09-05.gif");
    expect("files" in ok && ok.files[0]?.type).toBe("image/gif");

    const none = await readClipboardMedia({ read: async () => [item(["text/plain"])] as never });
    expect(none).toMatchObject({ error: expect.stringContaining("No hay ninguna imagen copiada") });

    const denied = await readClipboardMedia({
      read: async () => {
        throw new DOMException("no", "NotAllowedError");
      },
    });
    expect(denied).toMatchObject({ error: expect.stringContaining("Permite el acceso al portapapeles") });
    const broken = await readClipboardMedia({
      read: async () => {
        throw new Error("x");
      },
    });
    expect(broken).toMatchObject({ error: expect.stringContaining("No se pudo leer el portapapeles") });
  });
});

describe("pasting a clip into the page", () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:preview");
    URL.revokeObjectURL = vi.fn();
    useConverterStore.getState().selectFile(null);
  });
  afterEach(cleanup);

  const paste = (target: EventTarget, files: File[], types = ["Files"]) => {
    const e = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(e, "clipboardData", { value: transfer(files, types) });
    act(() => {
      target.dispatchEvent(e);
    });
    return e;
  };

  it("Ctrl/⌘+V of an image loads it as the clip; the hint tells people they can paste", () => {
    render(createElement(MediaDropzone));
    expect(screen.getByText(/o pégalo \((⌘V|Ctrl\+V)\)/)).toBeTruthy();
    const e = paste(document.body, [png()]);
    expect(e.defaultPrevented).toBe(true);
    const { file, inputKind } = useConverterStore.getState();
    expect(file?.name).toMatch(/^Pegado \d\d-\d\d\.png$/);
    expect(inputKind).toBe("image");
  });

  it("a pasted video works too, and replaces the current clip", () => {
    render(createElement(MediaDropzone));
    paste(document.body, [png("a.png")]);
    paste(document.body, [mp4()]);
    expect(useConverterStore.getState().file?.name).toBe("baile.mp4");
    expect(useConverterStore.getState().inputKind).toBe("video");
  });

  it("text pasted into a field is left alone", () => {
    render(createElement(MediaDropzone));
    const input = document.createElement("input");
    document.body.append(input);
    const e = paste(input, [png()], ["Files", "text/plain"]);
    expect(e.defaultPrevented).toBe(false);
    expect(useConverterStore.getState().file).toBeNull();
    input.remove();
  });

  it("a non-media paste does nothing; leaving the page removes the listener", () => {
    const { unmount } = render(createElement(MediaDropzone));
    const pdf = new File(["x"], "doc.pdf", { type: "application/pdf" });
    expect(paste(document.body, [pdf]).defaultPrevented).toBe(false);
    unmount();
    paste(document.body, [png()]);
    expect(useConverterStore.getState().file).toBeNull();
  });

  it("«Pegar imagen copiada» button (phones) reads the clipboard on tap", async () => {
    const blob = new Blob([new Uint8Array([1])], { type: "image/png" });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { read: async () => [{ types: ["image/png"], getType: async () => blob }] },
    });
    render(createElement(MediaDropzone));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Pegar imagen copiada/ }));
    });
    expect(useConverterStore.getState().file?.type).toBe("image/png");
  });
});
