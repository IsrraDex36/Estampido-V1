import { QuestionIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useTourStore } from "./tourStore";

/** «¿Cómo funciona?» in the header: reopens the welcome tour. */
export function TourButton() {
  const show = useTourStore((s) => s.show);
  return (
    <Button variant="ghost" size="icon" className="size-9 rounded-full" aria-label="¿Cómo funciona?" title="¿Cómo funciona?" onClick={show}>
      <QuestionIcon className="size-[18px]" />
    </Button>
  );
}
