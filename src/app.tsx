import { PianoRoll } from "./components/piano-roll";
import { Transport } from "./components/transport";

export function App() {
  return (
    <div className="h-screen flex flex-col bg-neutral-900">
      <Transport />
      <PianoRoll />
    </div>
  );
}
