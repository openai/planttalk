import { useEffect, useState } from "react";
import { useConversationStore } from "@/stores/plant/conversation-store";
import { AuroraOrb } from "@/components/public/webgl/aurora-orb";
import { WaveGradientBackground } from "@/components/public/webgl/wave-gradient-background";
import { LandingView } from "@/components/public/landing-view";
import { IntroView } from "@/components/public/intro-view";
import "./public-experience.css";

type AmbientView = "landing" | "intro";

interface AmbientExperienceProps {
  onExit: () => void;
}

export function AmbientExperience({ onExit }: AmbientExperienceProps) {
  const [view, setView] = useState<AmbientView>("landing");
  const [ctaHovered, setCtaHovered] = useState(false);
  const [showHint, setShowHint] = useState(true);
  const isPlantSpeaking = useConversationStore((state) => state.isPlantSpeaking);

  // Esc returns to the dashboard without adding a visible kiosk control.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onExit();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onExit]);

  // Lock the page scroll while the overlay is up so the dashboard's scrollbar
  // doesn't peek through behind it.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  // The Esc hint is a developer aid only; show it briefly, then fade it out.
  useEffect(() => {
    const timer = window.setTimeout(() => setShowHint(false), 3500);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="public-experience" data-view={view}>
      <WaveGradientBackground className="public-experience__bg" />

      <div className="public-experience__orb" aria-hidden="true">
        <AuroraOrb
          colorMode="custom"
          color1="rgb(8, 129, 255)"
          color2="rgb(0, 0, 0)"
          color3="rgb(150, 154, 255)"
          opacity={0.23}
          active={isPlantSpeaking || ctaHovered}
        />
      </div>

      <div className="public-experience__content">
        {view === "landing" ? (
          <LandingView
            onStart={() => {
              setCtaHovered(false); // the button unmounts mid-hover; clear the flag
              setView("intro");
            }}
            onHoverChange={setCtaHovered}
          />
        ) : (
          <IntroView onBack={() => setView("landing")} />
        )}
      </div>

      <div className={`public-experience__hint${showHint ? "" : " public-experience__hint--hidden"}`} role="status">
        Press <kbd>Esc</kbd> to return to the dashboard
      </div>
    </div>
  );
}
