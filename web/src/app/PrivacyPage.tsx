import type { ReactNode } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ROUTES } from "./routes";

const UPDATED = "25 de noviembre de 2026";

/** Short, plain-language privacy notice + terms (public test phase). */
export function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl py-12 sm:py-16">
      <p className="font-pixel text-[10px] text-muted-foreground">ACTUALIZADO EL {UPDATED.toUpperCase()}</p>
      <h1 className="display mt-3 text-4xl sm:text-5xl">Privacidad y términos</h1>
      <p className="mt-4 text-[16px] text-muted-foreground">
        Estampido está en fase de prueba. Esto es lo que guardamos, para qué y cómo borrarlo, sin letra pequeña.
      </p>

      <Block title="Lo que guardamos">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <b>Tus archivos al crear un sticker</b>: el clip y el audio que subes se procesan y el resultado se borra
            automáticamente a los <b>30 minutos</b>.
          </li>
          <li>
            <b>Si vinculas tu WhatsApp</b>: guardamos el chat de WhatsApp asociado a un identificador aleatorio de este
            navegador (cifrado con hash). Solo sirve para enviarte <b>a ti</b> los stickers que pidas. Nunca mostramos tu
            número completo.
          </li>
          <li>
            <b>Tu cuenta</b> (al entrar con WhatsApp): un identificador cifrado de tu número (no el número), los últimos 4
            dígitos para mostrártelos solo a ti, tu nombre, usuario, avatar y descripción (públicos en tu perfil), tus
            favoritos y tus sesiones. La sesión vive en una cookie segura que caduca a los 90 días sin uso.
          </li>
          <li>
            <b>Si publicas en la comunidad</b>: el sticker, su sonido, el título, la categoría, las etiquetas y tu perfil de
            creador quedan públicos para que otros los escuchen y reutilicen.
          </li>
          <li>
            <b>Favoritos y colección</b>: sin cuenta se guardan solo en tu navegador; con cuenta, en tu cuenta para verlos
            en todos tus dispositivos.
          </li>
        </ul>
      </Block>

      <Block title="Lo que no hacemos">
        <ul className="list-disc space-y-2 pl-5">
          <li>No leemos tus chats: el bot solo reacciona a tu código de vinculación y a los comandos que le escribes.</li>
          <li>No vendemos ni compartimos datos, y no hay publicidad ni rastreadores.</li>
          <li>Nunca enviamos mensajes a números que no se vincularon por sí mismos.</li>
        </ul>
      </Block>

      <Block title="Borrar tus datos">
        En <b>Mi cuenta</b> puedes borrar cada sticker que publicaste o <b>borrar tu cuenta</b>: se eliminan al instante
        tu perfil, todo lo que publicaste, tus favoritos y tus sesiones. «Cerrar sesión» también desvincula tu WhatsApp de
        ese navegador.
      </Block>

      <Block title="Reglas de uso">
        <ul className="list-disc space-y-2 pl-5">
          <li>Publica solo contenido propio o con permiso. Nada ilegal, violento, sexual, de odio ni de acoso.</li>
          <li>Podemos retirar contenido o bloquear el acceso a quien abuse del servicio.</li>
          <li>
            El envío a WhatsApp usa una integración <b>no oficial</b>: puede fallar o cambiar sin aviso. Estampido no está
            afiliado a WhatsApp ni a Meta.
          </li>
          <li>El servicio se ofrece tal cual, sin garantías, mientras dure la fase de prueba.</li>
        </ul>
      </Block>

      <Block title="Contacto">
        <a href="https://github.com/IsrraDex36" target="_blank" rel="noreferrer" className="underline underline-offset-4">
          github.com/IsrraDex36
        </a>
      </Block>

      <Button asChild className="mt-10 rounded-full">
        <Link href={ROUTES.create}>Volver a crear</Link>
      </Button>
    </article>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 text-[15px] leading-relaxed text-muted-foreground [&_b]:text-foreground">{children}</div>
    </section>
  );
}
