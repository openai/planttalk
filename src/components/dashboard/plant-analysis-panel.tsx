import { useEffect, useState } from "react";
import { placeholderPlantAnalysisJson } from "@/lib/plant/plants";
import { usePlantExperienceStore } from "@/stores/plant/experience-store";

export function PlantAnalysisPanel() {
  const analysis = usePlantExperienceStore((s) => s.analysis);
  const modelLabel = usePlantExperienceStore((s) => s.modelLabel);
  const jsonOutput = analysis ? JSON.stringify(analysis, null, 2) : placeholderPlantAnalysisJson;

  // Flash the results whenever a new analysis lands — the intake panel and this
  // one are separate cells in the grid, so the flash makes the connection
  // ("I clicked Analyze over there, the answer appeared here") obvious.
  // analyzePlantImage always sets a freshly-parsed object, so the identity
  // changes on every run, re-firing this effect; bumping the key remounts the
  // results and replays the CSS animation.
  const [flashKey, setFlashKey] = useState(0);
  useEffect(() => {
    if (analysis) setFlashKey((key) => key + 1);
  }, [analysis]);

  return (
    <article>
      <header>
        <strong>Structured plant analysis</strong>
      </header>

      <p>
        <small>
          The model is forced to reply with this exact JSON shape via a zod schema (<code>zodTextFormat</code>), so the
          output can be used directly — no text parsing.
        </small>
      </p>

      <div key={flashKey} className={flashKey > 0 ? "flash-on-update" : undefined}>
        <pre>
          <code>{jsonOutput}</code>
        </pre>

        <table>
          <thead>
            <tr>
              <th>Attribute</th>
              <th>Value</th>
              <th>Scale</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Dryness</td>
              <td>{analysis ? analysis.dryness : "--"}</td>
              <td>1 hydrated – 10 dry</td>
            </tr>
            <tr>
              <td>Size</td>
              <td>{analysis ? `${analysis.size} mm` : "--"}</td>
              <td>estimated visible span</td>
            </tr>
            <tr>
              <td>Branching</td>
              <td>{analysis ? analysis.branching : "--"}</td>
              <td>0 sparse – 10 dense</td>
            </tr>
            <tr>
              <td>Physical texture</td>
              <td>{analysis ? analysis.physicalTexture : "--"}</td>
              <td>surface read from image</td>
            </tr>
          </tbody>
        </table>
      </div>

      <footer>
        <small>{modelLabel}</small>
      </footer>
    </article>
  );
}
