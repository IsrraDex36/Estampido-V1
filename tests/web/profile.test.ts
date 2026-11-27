// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { AVATAR_COLORS } from "../../src/adapters/http/contract.js";
import { AVATAR_COLOR_NAME, AVATAR_HEX, parseAvatar } from "../../web/src/features/account/avatarStyle.js";
import { ProfileHeader } from "../../web/src/features/account/ProfileHeader.js";

afterEach(cleanup);

describe("profile header", () => {
  it("name, @handle, since, bio and actions; the avatar is labeled", () => {
    render(
      createElement(ProfileHeader, {
        displayName: "Isrra",
        handle: "isrra",
        bio: "Memes y doblajes",
        avatar: "🦊 violet",
        since: "desde noviembre de 2026",
        actions: createElement("button", { type: "button" }, "Seguir"),
      }),
    );
    expect(screen.getByRole("heading", { name: "Isrra" })).toBeTruthy();
    expect(screen.getByText("@isrra · desde noviembre de 2026")).toBeTruthy();
    expect(screen.getByText("Memes y doblajes")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Avatar de Isrra" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Seguir" }).length).toBeGreaterThan(0);
  });

  it("live preview never shows empty: placeholders for name/handle, a hint for an empty bio", () => {
    render(createElement(ProfileHeader, { displayName: "", handle: "", avatar: "🐸 lime", compact: true }));
    expect(screen.getByRole("heading", { name: "Tu nombre" })).toBeTruthy();
    expect(screen.getByText("@usuario")).toBeTruthy();
    expect(screen.getByText("Sin descripción todavía.")).toBeTruthy();
  });

  it("every avatar color has a banner color and a Spanish name; unknown colors fall back", () => {
    for (const c of AVATAR_COLORS) {
      expect(AVATAR_HEX[c]).toMatch(/^#[0-9a-f]{6}$/);
      expect(AVATAR_COLOR_NAME[c]).toBeTruthy();
    }
    expect(parseAvatar("🦊 nope")).toEqual({ emoji: "🦊", color: "lime" });
  });
});
