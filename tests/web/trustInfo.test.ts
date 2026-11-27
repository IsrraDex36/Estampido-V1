// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { TrustLink, TrustPromises } from "../../web/src/features/self/TrustInfo.js";

afterEach(cleanup);
const inRouter = (el: ReturnType<typeof createElement>) => render(el);

describe("trust, said plainly", () => {
  it("the three promises people need before linking", () => {
    inRouter(createElement(TrustPromises));
    for (const t of ["Solo te escribimos a ti", "No vemos tus chats", "Tú tienes la llave"])
      expect(screen.getByText(t)).toBeTruthy();
  });

  it("«¿Por qué es seguro?» opens what we do, what we NEVER do, the steps and the FAQ", () => {
    inRouter(createElement(TrustLink));
    fireEvent.click(screen.getByRole("button", { name: /Por qué es seguro/ }));
    expect(screen.getByText("Lo que sí hacemos")).toBeTruthy();
    expect(screen.getByText("Lo que nunca hacemos")).toBeTruthy();
    expect(screen.getByText("Leer o guardar tus chats, fotos o contactos")).toBeTruthy();
    expect(screen.getByText("Guardar tu número completo")).toBeTruthy();
    expect(screen.getByText("¿Por qué parece que «inicio sesión» en una web?")).toBeTruthy();
    expect(screen.getByText("¿Es oficial de WhatsApp?")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Privacidad y términos" })).toBeTruthy();
  });

  it("no outdated or contradictory claims anywhere people read about linking", () => {
    const files = [
      "web/src/features/onboarding/WelcomeTour.tsx",
      "web/src/app/PrivacyPage.tsx",
      "web/src/features/self/SelfLinkDialog.tsx",
      "web/src/features/self/TrustInfo.tsx",
    ].map((f) => readFileSync(f, "utf8"));
    const all = files.join("\n");
    // Old model (owner's bot number) and an untrue claim (we keep the last 4 digits).
    expect(all).not.toMatch(/el número de Estampido/);
    expect(all).not.toMatch(/mandas un código desde tu WhatsApp/);
    expect(all).not.toMatch(/tu número solo se usa para pedir el código de vinculación y no se guarda\./);
    // The same honest facts everywhere.
    expect(all).toMatch(/últimos 4 dígitos/);
    expect(all).toMatch(/Dispositivos vinculados/);
  });
});
